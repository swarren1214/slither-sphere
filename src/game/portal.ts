import * as THREE from "three";

export function createPortal(scene: THREE.Scene, position: THREE.Vector3, isVoidPortal: boolean = false) {
  const portalGroup = new THREE.Group();
  
  const portalColor = isVoidPortal ? 0x00ffff : 0x00aaff; // Cyan for void, bright blue for sphere
  
  // Create LARGE glowing outer ring
  const outerRingGeometry = new THREE.TorusGeometry(50, 8, 16, 50);
  const outerRingMaterial = new THREE.MeshStandardMaterial({
    color: portalColor,
    emissive: portalColor,
    emissiveIntensity: 2.0,
    roughness: 0.1,
    metalness: 0.9,
  });
  const outerRing = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
  portalGroup.add(outerRing);
  
  // Create inner glowing ring
  const innerRingGeometry = new THREE.TorusGeometry(42, 4, 16, 50);
  const innerRingMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 3.0,
    roughness: 0.0,
    metalness: 1.0,
  });
  const innerRing = new THREE.Mesh(innerRingGeometry, innerRingMaterial);
  portalGroup.add(innerRing);
  
  // Create swirling portal disc with bright glow
  const portalDiscGeometry = new THREE.CircleGeometry(45, 64);
  const portalDiscMaterial = new THREE.MeshStandardMaterial({
    color: portalColor,
    emissive: portalColor,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const portalDisc = new THREE.Mesh(portalDiscGeometry, portalDiscMaterial);
  portalGroup.add(portalDisc);
  
  // Add bright center glow
  const glowGeometry = new THREE.CircleGeometry(35, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  portalGroup.add(glow);
  
  // Add particle effect around portal - more visible
  const particleCount = 100;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 52 + Math.random() * 15;
    particlePositions[i * 3] = Math.cos(angle) * radius;
    particlePositions[i * 3 + 1] = Math.sin(angle) * radius;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: portalColor,
    size: 6,
    transparent: true,
    opacity: 1.0,
  });
  
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  portalGroup.add(particles);
  
  // Add point light to make it glow
  const portalLight = new THREE.PointLight(portalColor, 3, 300);
  portalLight.position.set(0, 0, 0);
  portalGroup.add(portalLight);
  
  // Create text label using sprites
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 512;
  canvas.height = 128;
  
  // Draw text with glow
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = 'bold 60px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add glow effect
  ctx.shadowColor = isVoidPortal ? '#00ffff' : '#00aaff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = isVoidPortal ? '#00ffff' : '#00aaff';
  ctx.fillText(isVoidPortal ? 'RETURN TO SPHERE' : 'ENTER THE VOID', canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ 
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(80, 20, 1);
  sprite.position.set(0, 70, 0); // Above the portal
  portalGroup.add(sprite);
  
  portalGroup.position.copy(position);
  scene.add(portalGroup);
  
  return { portalGroup, ring: outerRing, innerRing, portalDisc, glow, particles, portalLight, sprite };
}

export function createVoidEnvironment(scene: THREE.Scene) {
  // Create a vast empty void with distant stars
  const voidStars = new THREE.Group();
  
  const starGeometry = new THREE.SphereGeometry(2, 8, 8);
  const starCount = 500;
  
  for (let i = 0; i < starCount; i++) {
    const color = Math.random() > 0.5 ? 0xffffff : (Math.random() > 0.5 ? 0x8888ff : 0xffff88);
    const starMaterial = new THREE.MeshBasicMaterial({ color });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    
    // Randomly position stars in a huge sphere
    const radius = 5000 + Math.random() * 10000;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    star.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
    
    star.scale.setScalar(0.5 + Math.random() * 1.5);
    voidStars.add(star);
  }
  
  scene.add(voidStars);
  
  // Create distant nebula effects
  const nebulaGeometry = new THREE.SphereGeometry(8000, 32, 32);
  const nebulaMaterial = new THREE.MeshBasicMaterial({
    color: 0x220044,
    transparent: true,
    opacity: 0.1,
    side: THREE.BackSide,
  });
  const nebula = new THREE.Mesh(nebulaGeometry, nebulaMaterial);
  scene.add(nebula);
  
  return { voidStars, nebula };
}

export function animatePortal(portal: ReturnType<typeof createPortal>, time: number) {
  // Rotate the portal rings
  portal.ring.rotation.z += 0.01;
  if (portal.innerRing) {
    portal.innerRing.rotation.z -= 0.015; // Counter-rotate for effect
  }
  
  // Pulse the portal disc
  const pulse = Math.sin(time * 0.003) * 0.1 + 0.95;
  portal.portalDisc.scale.set(pulse, pulse, 1);
  
  // Pulse the glow
  if (portal.glow) {
    const glowPulse = Math.sin(time * 0.004) * 0.3 + 0.7;
    portal.glow.material.opacity = glowPulse;
  }
  
  // Pulse the light intensity
  if (portal.portalLight) {
    portal.portalLight.intensity = 3 + Math.sin(time * 0.005) * 1.5;
  }
  
  // Rotate particles faster
  portal.particles.rotation.z += 0.03;
  
  // Update particle positions for swirling effect
  const positions = portal.particles.geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    const angle = (i / positions.length) * Math.PI * 2 + time * 0.002;
    const radius = 52 + Math.sin(time * 0.003 + i) * 8;
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius;
  }
  portal.particles.geometry.attributes.position.needsUpdate = true;
  
  // Gently bob the text label
  if (portal.sprite) {
    portal.sprite.position.y = 70 + Math.sin(time * 0.002) * 5;
  }
}
