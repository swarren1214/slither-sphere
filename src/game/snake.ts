import * as THREE from "three";

export function createSnake(scene: THREE.Scene) {
  const snakeGroup = new THREE.Group();
  scene.add(snakeGroup);

  const headMat = new THREE.MeshStandardMaterial({
    color: 0x6bff8a,
    roughness: 0.35,
    metalness: 0.1,
  });
  
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x19c15b,
    roughness: 0.55,
    metalness: 0.05,
  });
  
  const segGeo = new THREE.SphereGeometry(7, 16, 16);

  const headMesh = new THREE.Mesh(segGeo, headMat);
  snakeGroup.add(headMesh);

  const bodyMeshes: THREE.Mesh[] = [];
  for (let i = 0; i < 220; i++) {
    const m = new THREE.Mesh(segGeo, bodyMat);
    m.visible = false;
    snakeGroup.add(m);
    bodyMeshes.push(m);
  }

  return { snakeGroup, headMesh, bodyMeshes, segGeo, headMat, bodyMat };
}
