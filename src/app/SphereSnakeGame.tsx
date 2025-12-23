"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Dot = {
  normal: THREE.Vector3; // unit vector from origin
  mesh: THREE.Mesh;
};

function randomUnitVector(): THREE.Vector3 {
  // Uniform on sphere.
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    sinPhi * Math.cos(theta),
    Math.cos(phi),
    sinPhi * Math.sin(theta),
  );
}

function rotateAroundAxis(v: THREE.Vector3, axisUnit: THREE.Vector3, angleRad: number) {
  // Rodrigues' rotation formula
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const cross = new THREE.Vector3().crossVectors(axisUnit, v);
  const dot = axisUnit.dot(v);
  return v
    .clone()
    .multiplyScalar(cos)
    .add(cross.multiplyScalar(sin))
    .add(axisUnit.clone().multiplyScalar(dot * (1 - cos)));
}

export default function SphereSnakeGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dotsEaten, setDotsEaten] = useState(0);

  useEffect(() => {
    if (!mountRef.current) return;

    // --- Config ---
    const R = 20; // sphere radius
    const moveSpeed = 10; // units/sec along surface arc-length
    const steerSpeed = 1.9; // rad/sec (left/right)
    const segmentSpacing = 0.7;
    const initialSegments = 6;
    const dotCount = 35;
    const dotRadius = 0.22;
    const eatDistance = 0.65; // world units
    const snakeLift = 0.35; // lift snake slightly off surface to avoid z-fighting with the globe
    const dotLift = 0.18; // lift dots slightly off surface as well
    const snakeRadius = R + snakeLift;
    const dotSurfaceRadius = R + dotLift;

    // --- Scene ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    camera.position.set(0, R * 1.1, R * 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(30, 40, 10);
    scene.add(key);

    // Globe
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 64),
      new THREE.MeshStandardMaterial({
        color: 0x122045,
        metalness: 0.05,
        roughness: 0.9,
        emissive: 0x02050e,
        emissiveIntensity: 0.7,
      }),
    );
    scene.add(globe);

    // Stars (background)
    const starCount = 2200;
    const starInner = R * 8;
    const starOuter = R * 22;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const cA = new THREE.Color(0xffffff);
    const cB = new THREE.Color(0xa7c7ff);
    for (let i = 0; i < starCount; i++) {
      // Random point in spherical shell
      const dir = randomUnitVector();
      const r = starInner + (starOuter - starInner) * Math.cbrt(Math.random());
      starPositions[i * 3 + 0] = dir.x * r;
      starPositions[i * 3 + 1] = dir.y * r;
      starPositions[i * 3 + 2] = dir.z * r;

      // Slight color variation (white -> pale blue)
      const mix = Math.random() * 0.65;
      const col = cA.clone().lerp(cB, mix);
      starColors[i * 3 + 0] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starsGeo.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    const starsMat = new THREE.PointsMaterial({
      size: 0.18,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    const globeGrid = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.001, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x2a4eff, wireframe: true, transparent: true, opacity: 0.08 }),
    );
    scene.add(globeGrid);

    // Snake
    const snakeGroup = new THREE.Group();
    scene.add(snakeGroup);

    const headMat = new THREE.MeshStandardMaterial({ color: 0x6bff8a, roughness: 0.35, metalness: 0.1 });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x19c15b, roughness: 0.55, metalness: 0.05 });
    const segGeo = new THREE.SphereGeometry(0.35, 16, 16);

    const headMesh = new THREE.Mesh(segGeo, headMat);
    snakeGroup.add(headMesh);

    const bodyMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 220; i++) {
      const m = new THREE.Mesh(segGeo, bodyMat);
      m.visible = false;
      snakeGroup.add(m);
      bodyMeshes.push(m);
    }

    // Snake state on the sphere
    let headNormal = new THREE.Vector3(0, 0, 1); // unit vector
    let headingTangent = new THREE.Vector3(1, 0, 0); // unit tangent at headNormal
    headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();

    const segmentNormals: THREE.Vector3[] = [];
    for (let i = 0; i < initialSegments; i++) {
      segmentNormals.push(headNormal.clone());
    }
    let segmentCount = initialSegments;
    let distanceAccumulator = 0;

    // Dots
    const dots: Dot[] = [];
    const dotGeo = new THREE.SphereGeometry(dotRadius, 14, 14);
    const dotMat = new THREE.MeshStandardMaterial({
      color: 0xffd34d,
      emissive: 0xffcc3a,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.05,
    });

    function respawnDot(dot: Dot) {
      // Avoid spawning right under the head.
      for (let tries = 0; tries < 40; tries++) {
        const n = randomUnitVector();
        if (n.dot(headNormal) < 0.985) {
          dot.normal.copy(n);
          dot.mesh.position.copy(n).multiplyScalar(dotSurfaceRadius);
          dot.mesh.visible = true;
          return;
        }
      }
      dot.normal.copy(randomUnitVector());
      dot.mesh.position.copy(dot.normal).multiplyScalar(dotSurfaceRadius);
      dot.mesh.visible = true;
    }

    for (let i = 0; i < dotCount; i++) {
      const mesh = new THREE.Mesh(dotGeo, dotMat);
      scene.add(mesh);
      const dot: Dot = { normal: randomUnitVector(), mesh };
      dots.push(dot);
      respawnDot(dot);
    }

    // Input
    let steer = 0; // -1 left, +1 right
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        // Left should turn counter-clockwise (screen space expectation)
        steer = 1;
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        // Right should turn clockwise
        steer = -1;
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && steer === 1) {
        steer = 0;
        e.preventDefault();
      } else if (e.key === "ArrowRight" && steer === -1) {
        steer = 0;
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp, { passive: false });

    // Resize
    const resize = () => {
      if (!mountRef.current) return;
      const { clientWidth, clientHeight } = mountRef.current;
      // Important: keep canvas CSS size in sync with drawing buffer size so the
      // camera center maps to the actual visible center of the canvas.
      renderer.setSize(clientWidth, clientHeight, true);
      camera.aspect = clientWidth / Math.max(1, clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mountRef.current);
    resize();

    // Render loop
    let raf = 0;
    let lastT = performance.now();
    let dotsEatenLocal = 0;

    const tmpAxis = new THREE.Vector3();
    const tmpVec = new THREE.Vector3();

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.033, (t - lastT) / 1000);
      lastT = t;

      // Steering: rotate heading tangent around the local normal
      if (steer !== 0) {
        headingTangent = rotateAroundAxis(headingTangent, headNormal, steer * steerSpeed * dt).normalize();
        // Re-project tangent (numerical drift)
        headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();
      }

      // Move: rotate headNormal along the great-circle defined by tangent direction.
      // Axis is perpendicular to both normal and heading (defines plane of travel).
      tmpAxis.crossVectors(headNormal, headingTangent).normalize();
      const angle = (moveSpeed / R) * dt;

      headNormal = rotateAroundAxis(headNormal, tmpAxis, angle).normalize();
      headingTangent = rotateAroundAxis(headingTangent, tmpAxis, angle).normalize();
      headingTangent.sub(headNormal.clone().multiplyScalar(headingTangent.dot(headNormal))).normalize();

      distanceAccumulator += moveSpeed * dt;
      while (distanceAccumulator >= segmentSpacing) {
        distanceAccumulator -= segmentSpacing;
        segmentNormals.unshift(headNormal.clone());
        if (segmentNormals.length > segmentCount) segmentNormals.pop();
      }

      // Update snake meshes
      headMesh.position.copy(headNormal).multiplyScalar(snakeRadius);
      headMesh.lookAt(tmpVec.copy(headNormal).multiplyScalar(snakeRadius + 1));

      for (let i = 0; i < bodyMeshes.length; i++) {
        const m = bodyMeshes[i];
        if (i < segmentNormals.length - 1) {
          const n = segmentNormals[i + 1];
          m.visible = true;
          m.position.copy(n).multiplyScalar(snakeRadius);
        } else {
          m.visible = false;
        }
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
          segmentCount = Math.min(segmentCount + 1, bodyMeshes.length + 1);
          // Respawn quickly somewhere else.
          setTimeout(() => respawnDot(dot), 180);
        }
      }

      // Camera follow
      // Behind the snake along movement direction, and slightly above surface normal.
      const back = headingTangent.clone().multiplyScalar(-R * 1.6);
      const up = headNormal.clone().multiplyScalar(R * 0.9);
      camera.position.copy(headPos).add(back).add(up);
      // Keep the camera's "up" aligned to the local surface normal to avoid drift/tilt.
      camera.up.copy(headNormal);
      camera.lookAt(headPos);

      // Subtle star drift for a bit of life
      stars.rotation.y += dt * 0.01;
      stars.rotation.x += dt * 0.004;

      renderer.render(scene, camera);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      // Dispose
      renderer.dispose();
      segGeo.dispose();
      dotGeo.dispose();
      starsGeo.dispose();
      starsMat.dispose();
      (globe.geometry as THREE.BufferGeometry).dispose();
      (globe.material as THREE.Material).dispose();
      (globeGrid.geometry as THREE.BufferGeometry).dispose();
      (globeGrid.material as THREE.Material).dispose();
      headMat.dispose();
      bodyMat.dispose();
      dotMat.dispose();

      for (const dot of dots) {
        scene.remove(dot.mesh);
      }
      scene.remove(stars);
      scene.remove(globe);
      scene.remove(globeGrid);
      scene.remove(snakeGroup);
      scene.clear();

      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black">
      <div
        ref={mountRef}
        className="absolute inset-0"
        aria-label="3D snake game canvas"
        role="application"
      />
      <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/50 px-3 py-2 text-sm font-semibold text-white backdrop-blur">
        Dots eaten: <span className="tabular-nums">{dotsEaten}</span>
      </div>
      <div className="pointer-events-none absolute left-4 top-4 rounded-lg bg-black/40 px-3 py-2 text-xs text-white/90 backdrop-blur">
        Controls: <span className="font-semibold">←</span> / <span className="font-semibold">→</span>
      </div>
    </div>
  );
}


