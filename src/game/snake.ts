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
  
  const headGeo = new THREE.SphereGeometry(7, 16, 16);
  const headMesh = new THREE.Mesh(headGeo, headMat);
  snakeGroup.add(headMesh);

  // Create tube body material
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x19c15b,
    roughness: 0.55,
    metalness: 0.05,
  });

  // Create initial tube geometry (will be updated each frame)
  const tubeRadius = 6;
  const tubularSegments = 100;
  const radialSegments = 8;
  
  // Create initial path with just a few points
  const initialPoints = [
    new THREE.Vector3(0, 0, sphereRadius),
    new THREE.Vector3(0, 0, sphereRadius),
  ];
  
  const curve = new THREE.CatmullRomCurve3(initialPoints);
  const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false);
  const tubeMesh = new THREE.Mesh(tubeGeometry, bodyMat);
  snakeGroup.add(tubeMesh);

  // Create tail cone - smaller and more tapered
  const tailConeGeometry = new THREE.ConeGeometry(tubeRadius, tubeRadius * 3, radialSegments);
  
  // Add vertex colors to tail cone to match body
  const coneColors = new Float32Array(tailConeGeometry.attributes.position.count * 3);
  const patternColor = new THREE.Color(0x0d8f3f); // Darker stripe color
  for (let i = 0; i < coneColors.length; i += 3) {
    coneColors[i] = patternColor.r;
    coneColors[i + 1] = patternColor.g;
    coneColors[i + 2] = patternColor.b;
  }
  tailConeGeometry.setAttribute('color', new THREE.BufferAttribute(coneColors, 3));
  
  const tailMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.05,
  });
  
  const tailConeMesh = new THREE.Mesh(tailConeGeometry, tailMat);
  snakeGroup.add(tailConeMesh);

  return { snakeGroup, headMesh, tubeMesh, tailConeMesh, tubeRadius, tubularSegments, radialSegments, bodyMat };
}
