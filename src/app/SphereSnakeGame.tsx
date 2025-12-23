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

export default function SphereSnakeGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dotsEaten, setDotsEaten] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const isGameOverRef = useRef(false);
  const [collisionType, setCollisionType] = useState<'barrier' | 'self'>('barrier');
  const restartGameRef = useRef<(() => void) | null>(null);
  const [menuScreen, setMenuScreen] = useState<MenuScreen>('main');
  const startGameRef = useRef<(() => void) | null>(null);
  const [controlType, setControlType] = useState<ControlType>('keyboard');
  const controlTypeRef = useRef<ControlType>('keyboard');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

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
      reverseSpeedMultiplier,
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

    // Setup controls
    controls = setupControls(
      controlTypeRef,
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

      // Get forward input
      const forwardInput = controls!.getForward();
      
      // Calculate target speed based on input
      let targetSpeed = 0;
      if (forwardInput === 1) {
        targetSpeed = moveSpeed; // Forward at full speed
      } else if (forwardInput === -1) {
        targetSpeed = -moveSpeed * reverseSpeedMultiplier; // Reverse at 25% speed
      }
      // else targetSpeed stays 0 (coasting to a stop)

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

      // Update snake meshes
      headMesh.position.copy(headNormal).multiplyScalar(snakeRadius);
      headMesh.lookAt(tmpVec.copy(headNormal).multiplyScalar(snakeRadius + 1));

      // Build smooth tube path using recent positions
      const tubePathPoints: THREE.Vector3[] = [];
      const pointsToUse = Math.min(segmentCount * 2, segmentNormals.length);
      
      // Sample evenly across the available positions
      for (let i = 0; i < pointsToUse; i++) {
        tubePathPoints.push(segmentNormals[i].clone().multiplyScalar(snakeRadius));
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

      // Eat dots
      const headPos = headMesh.position;
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

      // Check barrier collisions using precise distance to curve
      for (const barrier of barriers) {
        if (barrier.curve && barrier.tubeRadius) {
          // Sample points along the curve and find closest point
          let minDistance = Infinity;
          const samples = 30; // Increased samples for more accurate detection
          
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const curvePoint = barrier.curve.getPoint(t);
            const distance = headPos.distanceTo(curvePoint);
            if (distance < minDistance) {
              minDistance = distance;
            }
          }
          
          // Collision if head is within combined radius (with buffer for forgiveness)
          // 7 is snake head radius, using +4 instead of +6 for more forgiveness
          if (minDistance < barrier.tubeRadius + 4) {
            // GAME OVER!
            console.log('Barrier collision! Distance:', minDistance, 'Barrier radius:', barrier.tubeRadius);
            setCollisionType('barrier');
            isGameOverRef.current = true;
            setIsGameOver(true);
            break;
          }
        }
      }

      // Check self-collision (snake running into itself)
      // Only check if snake has grown beyond initial segments
      // Start checking from a safe distance to avoid neck collision
      if (segmentCount > initialSegments + 5) {
        // Skip first 16 positions (neck area) to avoid false collisions
        const startCheck = 16;
        const endCheck = Math.min(segmentCount * 2, segmentNormals.length);
        
        for (let i = startCheck; i < endCheck; i++) {
          const segmentPos = segmentNormals[i].clone().multiplyScalar(snakeRadius);
          const collisionDistance = 13; // Slightly smaller for more forgiveness
          if (headPos.distanceTo(segmentPos) < collisionDistance) {
            // GAME OVER!
            console.log('Self-collision! Distance:', headPos.distanceTo(segmentPos), 'at segment index:', i, 'segmentCount:', segmentCount);
            setCollisionType('self');
            isGameOverRef.current = true;
            setIsGameOver(true);
            break;
          }
        }
      }

      // Camera follow
      // Behind the snake along movement direction, and slightly above surface normal.
      const back = headingTangent.clone().multiplyScalar(-R * 0.25);
      const up = headNormal.clone().multiplyScalar(R * 0.15);
      camera.position.copy(headPos).add(back).add(up);
      // Keep the camera's "up" aligned to the local surface normal to avoid drift/tilt.
      camera.up.copy(headNormal);
      camera.lookAt(headPos);

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
            <h1 className="text-7xl font-bold text-white mb-3 tracking-tight">
              <span className="bg-linear-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent">SLITHER</span>
              <span className="text-blue-400"> SPHERE</span>
            </h1>
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
                    ? 'Use ↑ to go forward, ↓ to reverse, ← → to steer'
                    : 'Hold left-click to go forward, right-click to reverse, move mouse to steer'}
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
            Dots eaten: <span className="tabular-nums">{dotsEaten}</span>
          </div>
          <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/40 px-3 py-2 text-xs text-white/90 backdrop-blur">
            Controls: <span className="font-semibold">{controlType === 'keyboard' ? '↑ forward | ↓ reverse | ← / → steer' : 'L-Click forward | R-Click reverse | Move Mouse to steer'}</span> | <span className="font-semibold">P</span> to pause
          </div>
        </>
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


