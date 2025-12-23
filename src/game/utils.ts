import * as THREE from "three";

export function randomUnitVector(): THREE.Vector3 {
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

export function rotateAroundAxis(
  v: THREE.Vector3,
  axisUnit: THREE.Vector3,
  angleRad: number
): THREE.Vector3 {
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
