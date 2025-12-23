"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MenuScreen, ControlType, Difficulty } from "@/game/types";
import { getGameConfig } from "@/game/config";
import { rotateAroundAxis } from "@/game/utils";
import { createWorld } from "@/game/world";
import { createSnake } from "@/game/snake";
import { createDots } from "@/game/dots";
import { createBarriers } from "@/game/barriers";
import { setupControls } from "@/game/controls";
import { createPortal, createVoidEnvironment, animatePortal } from "@/game/portal";
import { WorldState } from "@/game/types";

export default function SphereSnakeGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dotsEaten, setDotsEaten] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const isGameOverRef = useRef(false);
  const [collisionType, setCollisionType] = useState<'barrier' | 'self'>('barrier');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const restartGameRef = useRef<(() => void) | null>(null);
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('main');
  const startGameRef = useRef<(() => void) | null>(null);
  const [controlType, setControlType] = useState<ControlType>('keyboard');
  const controlTypeRef = useRef<ControlType>('keyboard');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [cameraZoom, setCameraZoom] = useState(1.0);
  
  // Get portal unlock threshold from config
  const portalUnlockThreshold = getGameConfig(difficulty).portalUnlockThreshold;

  // Sync control type ref
  useEffect(() => {
    controlTypeRef.current = controlType;
  }, [controlType]);

  useEffect(() => {
    if (!mountRef.current || menuScreen !== 'playing') return;

    // Store cleanup refs at the top level
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let controls: ReturnType<typeof setupControls> | null = null;

    const initGame = () => {
    // --- Config ---
    const config = getGameConfig(difficulty);
    const {
      sphereRadius: R,
      moveSpeed,
      steerSpeed,
      segmentSpacing,
      initialSegments,
      dotCount,
      dotRadius,
      eatDistance,
      snakeRadius,
      dotSurfaceRadius,
      barrierCount,
      barrierRadius,
      barrierHeight,
      barrierLift,
      acceleration,
      deceleration,
      portalUnlockThreshold,
    } = config;

    // --- Scene ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 20000);
    camera.position.set(0, R * 0.15, R * 0.35);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mountRef.current!.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(30, 40, 10);
    scene.add(key);

    // Create world
    const { stars } = createWorld(scene, R);

    // Create snake with tube body
    const { headMesh, tubeMesh, tailCapMesh, tubeRadius, tubularSegments, radialSegments, bodyMat } = createSnake(scene, R);

    // Snake state on the sphere
    let headNormal = new THREE.Vector3(0, 0, 1);
    let headingTangent = new THREE.Vector3(1, 0, 0);
    headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();

    // Pre-space segments behind the head so snake appears complete from start
    const segmentNormals: THREE.Vector3[] = [];
    // Only create initial segments, not all possible segments
    for (let i = 0; i < initialSegments * 3; i++) {
      // Create segments trailing behind in the opposite direction
      const trailNormal = headNormal.clone();
      const backwardTangent = headingTangent.clone().negate();
      const angleOffset = (i * segmentSpacing) / R;
      const axis = new THREE.Vector3().crossVectors(headNormal, backwardTangent).normalize();
      const rotatedNormal = rotateAroundAxis(trailNormal, axis, angleOffset).normalize();
      segmentNormals.push(rotatedNormal);
    }
    let segmentCount = initialSegments;

    // Create dots
    const { dots, respawnDot } = createDots(scene, dotCount, dotRadius, dotSurfaceRadius, headNormal);

    // Create barriers
    const { barriers } = createBarriers(scene, barrierCount, barrierRadius, barrierHeight, R, barrierLift);

    // World state tracking
    let worldState: WorldState = 'sphere';
    const worldStateRef: React.MutableRefObject<WorldState> = { current: worldState };

    // Portal and void environment (created when unlocked)
    let spherePortal: ReturnType<typeof createPortal> | null = null;
    let voidPortal: ReturnType<typeof createPortal> | null = null;
    let voidEnvironment: ReturnType<typeof createVoidEnvironment> | null = null;
    let portalCooldown = 0; // Prevent rapid portal transitions
    
    // Void state
    let voidPosition = new THREE.Vector3(0, 0, 0); // Snake position in void
    let voidVelocity = new THREE.Vector3(1, 0, 0); // Snake direction in void
    let voidUpVector = new THREE.Vector3(0, 1, 0); // Snake's up direction in void

    // Setup controls
    controls = setupControls(
      controlTypeRef,
      worldStateRef,
      mountRef,
      isPausedRef,
      isGameOverRef,
      setIsPaused,
      () => restartGameRef.current?.()
    );

    // Resize
    const resize = () => {
      if (!mountRef.current) return;
      const { clientWidth, clientHeight } = mountRef.current;
      // Important: keep canvas CSS size in sync with drawing buffer size so the
      // camera center maps to the actual visible center of the canvas.
      renderer!.setSize(clientWidth, clientHeight, true);
      camera.aspect = clientWidth / Math.max(1, clientHeight);
      camera.updateProjectionMatrix();
    };
    ro = new ResizeObserver(resize);
    ro.observe(mountRef.current!);
    resize();

    // Render loop
    let lastT = performance.now();
    let dotsEatenLocal = 0;
    let currentSpeed = 0; // Current actual speed (starts at 0)
    let distanceSinceLastSegment = 0; // Track distance for adding body segments
    const segmentAddThreshold = 6; // Add a segment every N units of travel (increased for smoother body)

    const tmpAxis = new THREE.Vector3();
    const tmpVec = new THREE.Vector3();

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.033, (t - lastT) / 1000);
      lastT = t;

      // Animate barrier glow (pulsing red)
      const pulseIntensity = 0.3 + Math.sin(t * 0.003) * 0.3; // Oscillate between 0 and 0.6
      barriers.forEach(barrier => {
        barrier.wallSegments?.forEach(segment => {
          const material = segment.material as THREE.MeshStandardMaterial;
          material.emissiveIntensity = pulseIntensity;
        });
      });

      // Skip game logic if paused or game over, but still render
      if (isPausedRef.current || isGameOverRef.current) {
        renderer!.render(scene!, camera);
        return;
      }

      // Create portal when threshold reached (only on sphere)
      if (dotsEatenLocal >= portalUnlockThreshold && !spherePortal && worldState === 'sphere' && scene) {
        // Create portal on sphere surface ahead of the player
        // Calculate a point ahead on the sphere surface
        const forwardAngle = 0.3; // Radians ahead (about 60 degrees)
        tmpAxis.crossVectors(headNormal, headingTangent).normalize();
        const portalNormal = rotateAroundAxis(headNormal.clone(), tmpAxis, forwardAngle).normalize();
        
        // Position portal on the sphere surface
        const portalPos = portalNormal.clone().multiplyScalar(snakeRadius);
        spherePortal = createPortal(scene!, portalPos, false);
        
        // Orient portal to stand upright on sphere surface
        // Portal should face tangentially (player can fly through it)
        const tangent = headingTangent.clone().normalize();
        const right = new THREE.Vector3().crossVectors(portalNormal, tangent).normalize();
        const actualTangent = new THREE.Vector3().crossVectors(right, portalNormal).normalize();
        
        // Create rotation matrix: X=right, Y=up(normal), Z=tangent
        const matrix = new THREE.Matrix4();
        matrix.makeBasis(right, portalNormal, actualTangent);
        spherePortal.portalGroup.setRotationFromMatrix(matrix);
        
        // Clear any barriers near the portal to ensure it's accessible
        const clearRadius = 150; // Clear barriers within this radius
        barriers.forEach(barrier => {
          if (barrier.wallSegments) {
            // Check if any part of this barrier is too close to the portal
            let tooClose = false;
            barrier.wallSegments.forEach(segment => {
              if (segment.position.distanceTo(portalPos) < clearRadius) {
                tooClose = true;
              }
            });
            
            // Hide barriers that are too close
            if (tooClose) {
              barrier.wallSegments.forEach(segment => {
                segment.visible = false;
              });
            }
          }
        });
      }

      // Animate portals
      if (spherePortal) {
        animatePortal(spherePortal, t);
      }
      if (voidPortal) {
        animatePortal(voidPortal, t);
      }

      // Decrease portal cooldown
      if (portalCooldown > 0) {
        portalCooldown -= dt;
      }

      // Handle different movement based on world state
      if (worldState === 'sphere') {
        // === SPHERE WORLD LOGIC ===
        handleSphereMovement();
      } else if (worldState === 'void') {
        // === VOID WORLD LOGIC ===
        handleVoidMovement();
      }

      function handleSphereMovement() {
        // Get forward input
        const forwardInput = controls!.getForward();
        
        // Calculate target speed based on input
        const targetSpeed = forwardInput === 1 ? moveSpeed : 0;

        // Apply acceleration/deceleration with inertia
        if (currentSpeed < targetSpeed) {
          // Accelerating
          currentSpeed = Math.min(currentSpeed + acceleration * dt, targetSpeed);
        } else if (currentSpeed > targetSpeed) {
          // Decelerating
          currentSpeed = Math.max(currentSpeed - deceleration * dt, targetSpeed);
        }

        // Steering: rotate heading tangent around the local normal
        const steer = controls!.getSteer();
        if (steer !== 0) {
          headingTangent = rotateAroundAxis(headingTangent, headNormal, steer * steerSpeed * dt).normalize();
          // Re-project tangent (numerical drift)
          headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();
        }

        // Move: rotate headNormal along the great-circle defined by tangent direction.
        // Only move if speed is non-zero
        if (Math.abs(currentSpeed) > 0.1) {
          // Axis is perpendicular to both normal and heading (defines plane of travel).
          tmpAxis.crossVectors(headNormal, headingTangent).normalize();
          const angle = (currentSpeed / R) * dt;

          headNormal = rotateAroundAxis(headNormal, tmpAxis, angle).normalize();
          headingTangent = rotateAroundAxis(headingTangent, tmpAxis, angle).normalize();
          headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();

          const distanceMoved = Math.abs(currentSpeed) * dt;
          distanceSinceLastSegment += distanceMoved;
          
          // Only add new segment positions when we've traveled enough distance
          while (distanceSinceLastSegment >= segmentAddThreshold) {
            segmentNormals.unshift(headNormal.clone());
            distanceSinceLastSegment -= segmentAddThreshold;
            
            // Keep only enough positions for the snake length plus small buffer
            const maxPositions = Math.min(segmentCount * 2 + 5, 440);
            while (segmentNormals.length > maxPositions) {
              segmentNormals.pop();
            }
          }
        }

        // Update snake meshes for sphere
        const headPos = headNormal.clone().multiplyScalar(snakeRadius);
        headMesh.position.copy(headPos);
        headMesh.lookAt(tmpVec.copy(headNormal).multiplyScalar(snakeRadius + 1));

        updateSnakeBody();

        // Check for portal collision
        if (spherePortal && portalCooldown <= 0) {
          const distanceToPortal = headPos.distanceTo(spherePortal.portalGroup.position);
          if (distanceToPortal < 60) { // Increased from 25 to match larger portal
            transitionToVoid();
          }
        }

        // Sphere-specific collision detection
        checkSphereCollisions(headPos);
      }

      function handleVoidMovement() {
        // In void, only move forward when Shift is held
        const shiftHeld = controls!.getShift();
        if (shiftHeld) {
          currentSpeed = moveSpeed;
        } else {
          currentSpeed = 0;
        }

        // Steering affects direction
        const steer = controls!.getSteer();
        const vertical = controls!.getVertical();
        
        if (steer !== 0) {
          // Rotate velocity around up vector
          const rotationAngle = steer * steerSpeed * dt;
          voidVelocity.applyAxisAngle(voidUpVector, rotationAngle);
        }

        if (vertical !== 0) {
          // Rotate velocity up or down
          const rightVector = new THREE.Vector3().crossVectors(voidVelocity, voidUpVector).normalize();
          const verticalAngle = vertical * steerSpeed * dt;
          voidVelocity.applyAxisAngle(rightVector, verticalAngle);
          voidUpVector.applyAxisAngle(rightVector, verticalAngle);
        }

        // Normalize vectors
        voidVelocity.normalize();
        voidUpVector.normalize();

        // Move forward in void only if shift is held
        if (currentSpeed > 0) {
          const movement = voidVelocity.clone().multiplyScalar(currentSpeed * dt);
          voidPosition.add(movement);

          // Add segments based on distance traveled
          distanceSinceLastSegment += currentSpeed * dt;
          while (distanceSinceLastSegment >= segmentAddThreshold) {
            segmentNormals.unshift(voidPosition.clone());
            distanceSinceLastSegment -= segmentAddThreshold;
            
            const maxPositions = Math.min(segmentCount * 2 + 5, 440);
            while (segmentNormals.length > maxPositions) {
              segmentNormals.pop();
            }
          }
        }

        // Update snake position in void
        headMesh.position.copy(voidPosition);
        const lookTarget = voidPosition.clone().add(voidVelocity);
        headMesh.lookAt(lookTarget);

        updateSnakeBody();

        // Check for void portal collision
        if (voidPortal && portalCooldown <= 0) {
          const distanceToPortal = voidPosition.distanceTo(voidPortal.portalGroup.position);
          if (distanceToPortal < 60) { // Increased from 25 to match larger portal
            transitionToSphere();
          }
        }

        // No collision detection in void!
      }

      function updateSnakeBody() {
        // Build smooth tube path using recent positions
        const tubePathPoints: THREE.Vector3[] = [];
        const pointsToUse = Math.min(segmentCount * 2, segmentNormals.length);
        
        // Sample evenly across the available positions
        for (let i = 0; i < pointsToUse; i++) {
          if (worldState === 'sphere') {
            tubePathPoints.push(segmentNormals[i].clone().multiplyScalar(snakeRadius));
          } else {
            // In void mode, add wave effect like a Chinese dragon
            const basePos = segmentNormals[i].clone();
            
            // Create wave motion
            const waveFrequency = 0.3; // How many waves along the body
            const waveAmplitude = 8; // How far the wave moves (increased for more dramatic effect)
            const waveSpeed = 0.002; // How fast the wave travels
            
            // Calculate wave offset based on segment index and time
            const phase = i * waveFrequency + t * waveSpeed;
            const waveOffset = Math.sin(phase) * waveAmplitude;
            
            // Apply wave perpendicular to velocity direction
            const rightVector = new THREE.Vector3().crossVectors(voidVelocity, voidUpVector).normalize();
            const waveVector = rightVector.multiplyScalar(waveOffset);
            
            // Also add a secondary vertical wave for more dragon-like motion
            const verticalPhase = i * waveFrequency * 0.7 + t * waveSpeed * 0.8;
            const verticalOffset = Math.sin(verticalPhase) * waveAmplitude * 0.6;
            const verticalVector = voidUpVector.clone().multiplyScalar(verticalOffset);
            
            tubePathPoints.push(basePos.add(waveVector).add(verticalVector));
          }
        }
        
        // Only update tube if we have enough points
        if (tubePathPoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(tubePathPoints);
          const newTubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false);
          
          tubeMesh.geometry.dispose();
          tubeMesh.geometry = newTubeGeometry;
          
          // Position and orient tail cone at the end
          const tailPosition = tubePathPoints[tubePathPoints.length - 1];
          const beforeTail = tubePathPoints[Math.max(0, tubePathPoints.length - 2)];
          
          // Calculate direction and position hemisphere cap at tube end
          const tailDirection = tailPosition.clone().sub(beforeTail).normalize();
          
          // Position hemisphere cap flush with tube end
          const capOffset = tailDirection.clone().multiplyScalar(tubeRadius * 0.01);
          tailCapMesh.position.copy(tailPosition).add(capOffset);
          
          // Orient the cap so the flat side aligns with tube end
          tailCapMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tailDirection);
        }
      }

      function transitionToVoid() {
        setIsTransitioning(true);
        worldState = 'void';
        worldStateRef.current = 'void';
        portalCooldown = 2.0; // 2 second cooldown
        
        // Create void environment
        if (!voidEnvironment && scene) {
          voidEnvironment = createVoidEnvironment(scene!);
        }

        // Hide sphere world elements
        stars.visible = false;
        dots.forEach(dot => dot.mesh.visible = false);
        barriers.forEach(barrier => {
          barrier.wallSegments?.forEach(segment => segment.visible = false);
        });
        if (spherePortal) {
          spherePortal.portalGroup.visible = false;
        }

        // Initialize void position and direction - move forward from portal
        voidPosition = headNormal.clone().multiplyScalar(snakeRadius).add(headingTangent.clone().multiplyScalar(100));
        voidVelocity = headingTangent.clone();
        voidUpVector = headNormal.clone();

        // Create return portal in void
        const returnPortalPos = voidPosition.clone().add(voidVelocity.clone().multiplyScalar(200));
        if (scene) {
          voidPortal = createPortal(scene!, returnPortalPos, true);
        }
        
        // Clear old segment data and start fresh in void
        segmentNormals.length = 0;
        for (let i = 0; i < segmentCount * 2; i++) {
          const backPos = voidPosition.clone().sub(voidVelocity.clone().multiplyScalar(i * 3));
          segmentNormals.push(backPos);
        }

        setTimeout(() => setIsTransitioning(false), 500);
      }

      function transitionToSphere() {
        setIsTransitioning(true);
        worldState = 'sphere';
        portalCooldown = 2.0; // 2 second cooldown
        worldStateRef.current = 'sphere';

        // Show sphere world elements
        stars.visible = true;
        dots.forEach(dot => {
          if (Math.random() > 0.5) dot.mesh.visible = true;
        });
        barriers.forEach(barrier => {
          barrier.wallSegments?.forEach(segment => segment.visible = true);
        });
        if (spherePortal) {
          spherePortal.portalGroup.visible = true;
        }

        // Hide void elements
        if (voidEnvironment) {
          voidEnvironment.voidStars.visible = false;
          voidEnvironment.nebula.visible = false;
        }
        if (voidPortal) {
          voidPortal.portalGroup.visible = false;
        }

        // Reset to sphere coordinates
        headNormal = new THREE.Vector3(0, 0, 1);
        headingTangent = new THREE.Vector3(1, 0, 0);
        
        // Rebuild segment trail
        segmentNormals.length = 0;
        for (let i = 0; i < segmentCount * 2; i++) {
          const trailNormal = headNormal.clone();
          const backwardTangent = headingTangent.clone().negate();
          const angleOffset = (i * segmentSpacing) / R;
          const axis = new THREE.Vector3().crossVectors(headNormal, backwardTangent).normalize();
          const rotatedNormal = rotateAroundAxis(trailNormal, axis, angleOffset).normalize();
          segmentNormals.push(rotatedNormal);
        }

        setTimeout(() => setIsTransitioning(false), 500);
      }

      function checkSphereCollisions(headPos: THREE.Vector3) {
        // Eat dots (only on sphere)
        for (const dot of dots) {
          if (!dot.mesh.visible) continue;
          if (headPos.distanceTo(dot.mesh.position) < eatDistance) {
            dot.mesh.visible = false;
            dotsEatenLocal += 1;
            setDotsEaten(dotsEatenLocal);
            // Grow slowly: +1 segment per dot
            segmentCount = Math.min(segmentCount + 1, 220);
            // Respawn quickly somewhere else.
            setTimeout(() => respawnDot(dot), 180);
          }
        }

        // Check barrier collisions
        for (const barrier of barriers) {
          if (barrier.curve && barrier.tubeRadius) {
            // Sample points along the curve and find closest point
            let minDistance = Infinity;
            const samples = 30;
            
            for (let i = 0; i <= samples; i++) {
              const t = i / samples;
              const curvePoint = barrier.curve.getPoint(t);
              const distance = headPos.distanceTo(curvePoint);
              if (distance < minDistance) {
                minDistance = distance;
              }
            }
            
            if (minDistance < barrier.tubeRadius + 4) {
              console.log('Barrier collision! Distance:', minDistance, 'Barrier radius:', barrier.tubeRadius);
              setCollisionType('barrier');
              isGameOverRef.current = true;
              setIsGameOver(true);
              break;
            }
          }
        }

        // Check self-collision (only on sphere)
        if (segmentCount > initialSegments + 5) {
          const startCheck = 16;
          const endCheck = Math.min(segmentCount * 2, segmentNormals.length);
          
          for (let i = startCheck; i < endCheck; i++) {
            const segmentPos = segmentNormals[i].clone().multiplyScalar(snakeRadius);
            const collisionDistance = 13;
            if (headPos.distanceTo(segmentPos) < collisionDistance) {
              console.log('Self-collision! Distance:', headPos.distanceTo(segmentPos), 'at segment index:', i, 'segmentCount:', segmentCount);
              setCollisionType('self');
              isGameOverRef.current = true;
              setIsGameOver(true);
              break;
            }
          }
        }
      }

      // Camera follow
      if (worldState === 'sphere') {
        // Behind the snake along movement direction, and slightly above surface normal.
        const headPos = headMesh.position;
        const back = headingTangent.clone().multiplyScalar(-R * 0.25 * cameraZoom);
        const up = headNormal.clone().multiplyScalar(R * 0.15 * cameraZoom);
        camera.position.copy(headPos).add(back).add(up);
        // Keep the camera's "up" aligned to the local surface normal to avoid drift/tilt.
        camera.up.copy(headNormal);
        camera.lookAt(headPos);
      } else if (worldState === 'void') {
        // In void, camera follows behind snake in free space - much farther back
        const headPos = headMesh.position;
        const back = voidVelocity.clone().multiplyScalar(-300 * cameraZoom); // Increased from 150
        const up = voidUpVector.clone().multiplyScalar(100 * cameraZoom); // Increased from 50
        camera.position.copy(headPos).add(back).add(up);
        camera.up.copy(voidUpVector);
        camera.lookAt(headPos);
      }

      // Subtle star drift for a bit of life
      stars.rotation.y += dt * 0.01;
      stars.rotation.x += dt * 0.004;

      renderer!.render(scene!, camera);
    };

    raf = requestAnimationFrame(tick);
    }; // end initGame

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (controls) controls.cleanup();

      // Dispose renderer and clear scene
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      }
      
      if (scene) {
        scene.clear();
      }
    };

    const restart = () => {
      cleanup();
      isGameOverRef.current = false;
      setIsGameOver(false);
      setCollisionType('barrier');
      isPausedRef.current = false;
      setIsPaused(false);
      setDotsEaten(0);
      // Clear the mount element
      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }
      initGame();
    };

    const startGame = () => {
      setMenuScreen('playing');
    };

    restartGameRef.current = restart;
    startGameRef.current = startGame;
    initGame();

    return cleanup;
  }, [menuScreen, difficulty]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black">
      <div
        ref={mountRef}
        className="absolute inset-0"
        aria-label="3D snake game canvas"
        role="application"
      />
      
      {/* Main Menu */}
      {menuScreen === 'main' && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-slate-900 to-black">
          <div className="text-center">
            <div className="mx-auto mb-10 w-[280px] max-w-[70vw]">
              <Image
                src="/slither-sphere-logo.png"
                alt="Slither Sphere logo"
                width={512}
                height={512}
                priority
                className="h-auto w-full select-none"
              />
            </div>
            <p className="text-white/60 text-lg mb-12">Navigate the sphere, avoid the barriers</p>
            <div className="flex flex-col gap-4 items-center">
              <button
                onClick={() => setMenuScreen('playing')}
                className="w-64 px-8 py-4 bg-linear-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-green-500/50"
              >
                PLAY
              </button>
              <button
                onClick={() => setMenuScreen('settings')}
                className="w-64 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white text-xl font-bold rounded-xl transition-all transform hover:scale-105"
              >
                SETTINGS
              </button>
              <button
                onClick={() => setMenuScreen('store')}
                className="w-64 px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white text-xl font-bold rounded-xl transition-all transform hover:scale-105"
              >
                STORE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Screen */}
      {menuScreen === 'settings' && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-slate-900 to-black">
          <div className="text-center max-w-2xl">
            <h2 className="text-5xl font-bold text-white mb-8">SETTINGS</h2>
            <div className="bg-slate-800/50 rounded-xl p-8 backdrop-blur-sm mb-8">
              <div className="mb-8 pb-8 border-b border-white/10">
                <h3 className="text-white text-xl font-semibold mb-4">Difficulty</h3>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setDifficulty('easy')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                      difficulty === 'easy'
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                    }`}
                  >
                    😊 Easy
                  </button>
                  <button
                    onClick={() => setDifficulty('medium')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                      difficulty === 'medium'
                        ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-500/50'
                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                    }`}
                  >
                    😐 Medium
                  </button>
                  <button
                    onClick={() => setDifficulty('hard')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                      difficulty === 'hard'
                        ? 'bg-red-600 text-white shadow-lg shadow-red-500/50'
                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                    }`}
                  >
                    😈 Hard
                  </button>
                </div>
                <p className="text-white/50 text-sm mt-4">
                  {difficulty === 'easy' && 'Slower speed (75%), fewer barriers'}
                  {difficulty === 'medium' && 'Normal speed, standard barriers'}
                  {difficulty === 'hard' && 'Faster speed (125%), more barriers'}
                </p>
              </div>
              <div className="mb-6">
                <h3 className="text-white text-xl font-semibold mb-4">Control Type</h3>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => setControlType('keyboard')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                      controlType === 'keyboard'
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/50'
                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                    }`}
                  >
                    ⌨️ Keyboard
                  </button>
                  <button
                    onClick={() => setControlType('mouse')}
                    className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                      controlType === 'mouse'
                        ? 'bg-green-600 text-white shadow-lg shadow-green-500/50'
                        : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                    }`}
                  >
                    🖱️ Mouse
                  </button>
                </div>
                <p className="text-white/50 text-sm mt-4">
                  {controlType === 'keyboard' 
                    ? 'Use ↑ to go forward, ← → to steer'
                    : 'Hold left-click to go forward, move mouse to steer'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setMenuScreen('main')}
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white text-lg font-bold rounded-xl transition-all"
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      )}

      {/* Store Screen */}
      {menuScreen === 'store' && (
        <div className="absolute inset-0 flex items-center justify-center bg-linear-to-b from-slate-900 to-black">
          <div className="text-center max-w-2xl">
            <h2 className="text-5xl font-bold text-white mb-8">STORE</h2>
            <div className="bg-slate-800/50 rounded-xl p-8 backdrop-blur-sm mb-8">
              <p className="text-white/60 text-lg">Store items coming soon...</p>
              <p className="text-white/40 text-sm mt-4">Unlock new skins, power-ups, and more!</p>
            </div>
            <button
              onClick={() => setMenuScreen('main')}
              className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white text-lg font-bold rounded-xl transition-all"
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      )}

      {/* Game HUD - only show when playing */}
      {menuScreen === 'playing' && (
        <>
          <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/50 px-3 py-2 text-sm font-semibold text-white backdrop-blur">
            Fruits eaten: <span className="tabular-nums">{dotsEaten}</span>
            {dotsEaten >= portalUnlockThreshold && <div className="text-xs text-cyan-400 mt-1">✨ Portal unlocked!</div>}
          </div>
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/40 px-3 py-2 text-xs text-white/90 backdrop-blur">
            Controls: <span className="font-semibold">{controlType === 'keyboard' ? '↑ forward | ← / → steer' : 'L-Click forward | Move Mouse to steer'}</span> | <span className="font-semibold">P</span> to pause
          </div>
          <div className="pointer-events-auto absolute bottom-4 right-4 rounded-lg bg-black/50 px-3 py-2 text-xs text-white/90 backdrop-blur">
            <label className="flex items-center gap-2">
              <span className="font-semibold">Camera Zoom:</span>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={cameraZoom}
                onChange={(e) => setCameraZoom(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="tabular-nums w-8">{cameraZoom.toFixed(1)}x</span>
            </label>
          </div>
        </>
      )}

      {/* Transition overlay */}
      {isTransitioning && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-lg">
          <div className="text-center">
            <div className="text-5xl font-bold text-cyan-400 animate-pulse mb-4">
              Traveling through the portal...
            </div>
            <div className="w-16 h-16 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      )}
      
      {/* Game State Overlays - only show when playing */}
      {menuScreen === 'playing' && isPaused && !isGameOver && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-black/70 px-8 py-6 text-center backdrop-blur-sm">
            <div className="text-4xl font-bold text-white">PAUSED</div>
            <div className="mt-2 text-sm text-white/80">Press P to continue</div>
            <div className="mt-2 text-xs text-white/60">Press R to restart</div>
            <div className="flex gap-4 justify-center mt-6">
              <button
                onClick={() => {
                  setIsPaused(false);
                  isPausedRef.current = false;
                }}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all"
              >
                RESUME
              </button>
              <button
                onClick={() => {
                  setMenuScreen('main');
                  setIsPaused(false);
                  isPausedRef.current = false;
                  setIsGameOver(false);
                  isGameOverRef.current = false;
                }}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-all"
              >
                QUIT TO MENU
              </button>
            </div>
          </div>
        </div>
      )}
      {menuScreen === 'playing' && isGameOver && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-red-900/80 px-12 py-8 text-center backdrop-blur-sm border-2 border-red-500">
            <div className="text-5xl font-bold text-white mb-4">GAME OVER</div>
            <div className="text-2xl text-white/90 mb-2">
              {collisionType === 'barrier' ? 'You hit a barrier!' : 'You ran into yourself!'}
            </div>
            <div className="text-xl text-white/80 mb-6">Final Score: <span className="font-bold tabular-nums">{dotsEaten}</span></div>
            <div className="flex gap-4 justify-center mt-6">
              <button
                onClick={() => restartGameRef.current?.()}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all"
              >
                RESTART (R)
              </button>
              <button
                onClick={() => setMenuScreen('main')}
                className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-bold rounded-lg transition-all"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


