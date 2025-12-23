import * as THREE from "three";
import { Barrier } from "./types";
import { randomUnitVector } from "./utils";

// Create a winding tube wall barrier along the sphere surface
function createWallBarrier(
  sphereRadius: number,
  height: number,
  lift: number,
  wallLength: number
): { meshes: THREE.Mesh[], normal: THREE.Vector3, curve: THREE.CatmullRomCurve3, tubeRadius: number } {
  const meshes: THREE.Mesh[] = [];
  
  // Start at a random position on the sphere
  let currentNormal = randomUnitVector();
  const startNormal = currentNormal.clone();
  
  // Create a random tangent direction to move along the sphere
  const up = new THREE.Vector3(0, 1, 0);
  let tangent = currentNormal.clone().cross(up).normalize();
  if (tangent.length() < 0.1) {
    tangent = currentNormal.clone().cross(new THREE.Vector3(1, 0, 0)).normalize();
  }
  
  // Random length for each wall
  const segmentCount = 15 + Math.floor(Math.random() * 25); // 15-39 segments
  const stepSize = 8; // Small steps for smooth curve
  
  // Build path points along the sphere surface
  const pathPoints: THREE.Vector3[] = [];
  
  for (let i = 0; i < segmentCount; i++) {
    // Add current position to path
    pathPoints.push(currentNormal.clone().multiplyScalar(sphereRadius));
    
    // Add curve/winding to the path
    const curveFactor = Math.sin(i * 0.3) * 0.3 + Math.cos(i * 0.2) * 0.2;
    const moveDirection = tangent.clone()
      .add(currentNormal.clone().cross(tangent).multiplyScalar(curveFactor))
      .normalize();
    
    // Move along the surface
    currentNormal.add(moveDirection.multiplyScalar(stepSize / sphereRadius)).normalize();
    
    // Update tangent to stay perpendicular to normal
    tangent = tangent.sub(currentNormal.clone().multiplyScalar(tangent.dot(currentNormal))).normalize();
  }
  
  // Create tube geometry from the path
  const curve = new THREE.CatmullRomCurve3(pathPoints);
  const tubeRadius = height / 2;
  const tubeGeometry = new THREE.TubeGeometry(
    curve,
    pathPoints.length * 8, // Increased tubular segments for smoothness
    tubeRadius,
    32, // Increased radial segments from 16 to 32
    false
  );
  
  // Uniform red color with emissive for glowing effect
  const material = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.5, // Will be animated
    roughness: 0.2,
    metalness: 0.8,
  });
  
  const tubeMesh = new THREE.Mesh(tubeGeometry, material);
  meshes.push(tubeMesh);
  
  // Add hemisphere caps at both ends for clean closure
  // Position them flush with the tube to avoid seams
  const startPoint = pathPoints[0];
  const startDir = pathPoints[1].clone().sub(startPoint).normalize();
  const startCap = new THREE.Mesh(
    new THREE.SphereGeometry(tubeRadius, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    material
  );
  startCap.position.copy(startPoint.clone().add(startDir.clone().multiplyScalar(-tubeRadius * 0.01)));
  startCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), startDir.clone().negate());
  meshes.push(startCap);
  
  const endPoint = pathPoints[pathPoints.length - 1];
  const endDir = endPoint.clone().sub(pathPoints[pathPoints.length - 2]).normalize();
  const endCap = new THREE.Mesh(
    new THREE.SphereGeometry(tubeRadius, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    material
  );
  endCap.position.copy(endPoint.clone().add(endDir.clone().multiplyScalar(tubeRadius * 0.01)));
  endCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endDir);
  meshes.push(endCap);
  
  return { meshes, normal: startNormal, curve, tubeRadius };
}

export function createBarriers(
  scene: THREE.Scene,
  count: number,
  radius: number,
  height: number,
  sphereRadius: number,
  lift: number
) {
  const barriers: Barrier[] = [];
  const startPosition = new THREE.Vector3(0, 0, 1); // Snake starts here
  const minDistanceFromStart = Math.PI / 3; // About 60 degrees away minimum
  
  // Create many winding wall barriers (increased count significantly)
  const wallCount = count * 3; // Triple the barriers for more walls
  const wallLength = sphereRadius * 0.4; // Length of each winding wall
  
  for (let i = 0; i < wallCount; i++) {
    let wall;
    let attempts = 0;
    
    // Keep trying until we get a barrier far enough from start
    do {
      wall = createWallBarrier(sphereRadius, height, lift, wallLength);
      attempts++;
      // If we've tried 20 times, accept it anyway to avoid infinite loop
      if (attempts > 20) break;
    } while (wall.normal.angleTo(startPosition) < minDistanceFromStart);
    
    // Add all segments of the wall to scene
    wall.meshes.forEach(mesh => scene.add(mesh));
    
    // Store the first mesh as the barrier reference for collision
    const barrier: Barrier = { 
      normal: wall.normal, 
      mesh: wall.meshes[0],
      wallSegments: wall.meshes, // Store all segments
      curve: wall.curve, // Store curve for precise collision
      tubeRadius: wall.tubeRadius // Store radius for collision
    };
    barriers.push(barrier);
  }

  return { barriers };
}
