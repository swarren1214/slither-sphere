import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import { randomUnitVector } from "./utils";

export function createWorld(scene: THREE.Scene, sphereRadius: number) {
  // Globe with ocean gradient
  const globeGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
  const globeColors = new Float32Array(globeGeometry.attributes.position.count * 3);
  const deepOcean = new THREE.Color(0x0a1a3a);
  const shallowOcean = new THREE.Color(0x1e4d8b);
  
  for (let i = 0; i < globeGeometry.attributes.position.count; i++) {
    const y = globeGeometry.attributes.position.getY(i);
    const t = (y / sphereRadius + 1) / 2; // Normalize to 0-1
    const color = deepOcean.clone().lerp(shallowOcean, t);
    globeColors[i * 3] = color.r;
    globeColors[i * 3 + 1] = color.g;
    globeColors[i * 3 + 2] = color.b;
  }
  
  globeGeometry.setAttribute('color', new THREE.BufferAttribute(globeColors, 3));
  
  const globe = new THREE.Mesh(
    globeGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.05,
      roughness: 0.9,
      emissive: 0x02050e,
      emissiveIntensity: 0.5,
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

  // Globe grid with terrain and earth-tone colors
  const noise2D = createNoise2D();
  const gridGeometry = new THREE.SphereGeometry(sphereRadius * 1.001, 512, 512);
  const positionAttribute = gridGeometry.attributes.position;
  const gridColors = new Float32Array(positionAttribute.count * 3);
  
  // Terrain color palette
  const deepGreen = new THREE.Color(0x1a4d2e);
  const forestGreen = new THREE.Color(0x2d5a3d);
  const grassGreen = new THREE.Color(0x4a7c59);
  const lightGreen = new THREE.Color(0x6b9d7a);
  const sandyBrown = new THREE.Color(0x8b7355);
  const darkBrown = new THREE.Color(0x4a3728);
  
  // Track min/max displacement for normalization
  const displacements: number[] = [];
  
  // Apply noise-based displacement for terrain
  for (let i = 0; i < positionAttribute.count; i++) {
    const vertex = new THREE.Vector3(
      positionAttribute.getX(i),
      positionAttribute.getY(i),
      positionAttribute.getZ(i)
    );
    
    // Convert to spherical coordinates for noise sampling
    const lat = Math.asin(vertex.y / vertex.length());
    const lon = Math.atan2(vertex.z, vertex.x);
    
    // Multi-octave noise for more natural terrain
    const scale1 = 2.0;
    const scale2 = 5.0;
    const scale3 = 10.0;
    
    const noise1 = noise2D(lon * scale1, lat * scale1) * 0.5;
    const noise2 = noise2D(lon * scale2, lat * scale2) * 0.25;
    const noise3 = noise2D(lon * scale3, lat * scale3) * 0.125;
    
    const displacement = (noise1 + noise2 + noise3) * sphereRadius * 0.005;
    displacements.push(displacement);
    
    vertex.normalize().multiplyScalar(sphereRadius * 1.001 + displacement);
    positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  
  // Apply colors based on elevation
  const minDisp = Math.min(...displacements);
  const maxDisp = Math.max(...displacements);
  const range = maxDisp - minDisp;
  
  for (let i = 0; i < positionAttribute.count; i++) {
    const normalizedHeight = (displacements[i] - minDisp) / range;
    
    let color: THREE.Color;
    if (normalizedHeight < 0.3) {
      // Low areas: dark brown to sandy brown
      color = darkBrown.clone().lerp(sandyBrown, normalizedHeight / 0.3);
    } else if (normalizedHeight < 0.5) {
      // Mid-low: sandy brown to deep green
      color = sandyBrown.clone().lerp(deepGreen, (normalizedHeight - 0.3) / 0.2);
    } else if (normalizedHeight < 0.7) {
      // Mid: deep green to forest green
      color = deepGreen.clone().lerp(forestGreen, (normalizedHeight - 0.5) / 0.2);
    } else if (normalizedHeight < 0.85) {
      // Mid-high: forest green to grass green
      color = forestGreen.clone().lerp(grassGreen, (normalizedHeight - 0.7) / 0.15);
    } else {
      // High areas: grass green to light green
      color = grassGreen.clone().lerp(lightGreen, (normalizedHeight - 0.85) / 0.15);
    }
    
    gridColors[i * 3] = color.r;
    gridColors[i * 3 + 1] = color.g;
    gridColors[i * 3 + 2] = color.b;
  }
  
  gridGeometry.setAttribute('color', new THREE.BufferAttribute(gridColors, 3));
  gridGeometry.computeVertexNormals();
  
  const globeGrid = new THREE.Mesh(
    gridGeometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.1,
      roughness: 0.8,
    }),
  );
  scene.add(globeGrid);

  return { globe, stars, globeGrid };
}
