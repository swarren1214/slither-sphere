import * as THREE from "three";
import { Dot } from "./types";
import { randomUnitVector } from "./utils";

export function createDots(
  scene: THREE.Scene,
  count: number,
  radius: number,
  surfaceRadius: number,
  headNormal: THREE.Vector3
) {
  const dots: Dot[] = [];
  const dotGeo = new THREE.SphereGeometry(radius, 14, 14);
  const dotMat = new THREE.MeshStandardMaterial({
    color: 0xffd34d,
    emissive: 0xffcc3a,
    emissiveIntensity: 0.85,
    roughness: 0.35,
    metalness: 0.05,
  });

  function respawnDot(dot: Dot) {
    for (let tries = 0; tries < 40; tries++) {
      const n = randomUnitVector();
      if (n.dot(headNormal) < 0.985) {
        dot.normal.copy(n);
        dot.mesh.position.copy(n).multiplyScalar(surfaceRadius);
        dot.mesh.visible = true;
        return;
      }
    }
    dot.normal.copy(randomUnitVector());
    dot.mesh.position.copy(dot.normal).multiplyScalar(surfaceRadius);
    dot.mesh.visible = true;
  }

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(dotGeo, dotMat);
    scene.add(mesh);
    const dot: Dot = { normal: randomUnitVector(), mesh };
    dots.push(dot);
    respawnDot(dot);
  }

  return { dots, respawnDot, dotGeo, dotMat };
}
