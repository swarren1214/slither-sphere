import * as THREE from "three";

export function createSnake(scene: THREE.Scene, sphereRadius: number) {
  const snakeGroup = new THREE.Group();
  scene.add(snakeGroup);

  // Head remains a sphere
  const headMat = new THREE.MeshStandardMaterial({
    color: 0x6bff8a,
    roughness: 0.35,
    metalness: 0.1,
  });
  
  const headGeo = new THREE.SphereGeometry(7, 64, 64);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  snakeGroup.add(headMesh);

  // Create tube body material with scale texture
  // Create a procedural scale texture
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  
  // Draw scale pattern
  ctx.fillStyle = '#19c15b';
  ctx.fillRect(0, 0, 256, 256);
  
  // Draw darker scales
  ctx.fillStyle = '#0d8f3f';
  const scaleSize = 16;
  for (let y = 0; y < 256; y += scaleSize) {
    for (let x = 0; x < 256; x += scaleSize) {
      const offsetX = (y / scaleSize) % 2 === 0 ? 0 : scaleSize / 2;
      ctx.beginPath();
      ctx.arc(x + offsetX + scaleSize / 2, y + scaleSize / 2, scaleSize / 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 8);
  
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x19c15b,
    map: texture,
    roughness: 0.55,
    metalness: 0.05,
  });

  // Create initial tube geometry (will be updated each frame)
  const tubeRadius = 6;
  const tubularSegments = 400;
  const radialSegments = 32;
  
  // Create initial path with just a few points
  const initialPoints = [
    new THREE.Vector3(0, 0, sphereRadius),
    new THREE.Vector3(0, 0, sphereRadius),
  ];
  
  const curve = new THREE.CatmullRomCurve3(initialPoints);
  const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false);
  const tubeMesh = new THREE.Mesh(tubeGeometry, bodyMat);
  snakeGroup.add(tubeMesh);

  // Create tail hemisphere cap - matches the tube end seamlessly
  const tailCapGeometry = new THREE.SphereGeometry(tubeRadius, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const tailCapMesh = new THREE.Mesh(tailCapGeometry, bodyMat);
  snakeGroup.add(tailCapMesh);

  return { snakeGroup, headMesh, tubeMesh, tailCapMesh, tubeRadius, tubularSegments, radialSegments, bodyMat };
}
