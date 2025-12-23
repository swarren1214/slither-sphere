import * as THREE from "three";
import { randomUnitVector } from "./utils";

export function createWorld(scene: THREE.Scene, sphereRadius: number) {
  // Globe
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(sphereRadius, 64, 64),
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
  const starInner = sphereRadius * 8;
  const starOuter = sphereRadius * 22;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const cA = new THREE.Color(0xffffff);
  const cB = new THREE.Color(0xa7c7ff);
  
  for (let i = 0; i < starCount; i++) {
    const dir = randomUnitVector();
    const r = starInner + (starOuter - starInner) * Math.cbrt(Math.random());
    starPositions[i * 3 + 0] = dir.x * r;
    starPositions[i * 3 + 1] = dir.y * r;
    starPositions[i * 3 + 2] = dir.z * r;

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
    size: 3.6,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const stars = new THREE.Points(starsGeo, starsMat);
  scene.add(stars);

  // Globe grid
  const globeGrid = new THREE.Mesh(
    new THREE.SphereGeometry(sphereRadius * 1.001, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0x2a4eff,
      wireframe: true,
      transparent: true,
      opacity: 0.08,
    }),
  );
  scene.add(globeGrid);

  return { globe, stars, globeGrid };
}
