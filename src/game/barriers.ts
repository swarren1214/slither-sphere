import * as THREE from "three";
import { Barrier } from "./types";
import { randomUnitVector } from "./utils";

export function createBarriers(
  scene: THREE.Scene,
  count: number,
  radius: number,
  height: number,
  sphereRadius: number,
  lift: number
) {
  const barriers: Barrier[] = [];
  const barrierGeo = new THREE.CylinderGeometry(radius, radius, height, 16);
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0xff4444,
    emissive: 0xff0000,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.4,
  });

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(barrierGeo, barrierMat);
    scene.add(mesh);
    const normal = randomUnitVector();
    const barrier: Barrier = { normal, mesh };
    barriers.push(barrier);

    const position = normal.clone().multiplyScalar(sphereRadius + lift);
    mesh.position.copy(position);
    mesh.lookAt(normal.clone().multiplyScalar(sphereRadius + lift + height));
  }

  return { barriers, barrierGeo, barrierMat };
}
