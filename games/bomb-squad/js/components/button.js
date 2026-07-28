// Button component - colored buttons with press animation
import * as THREE from 'three';
import { playButtonClick } from '../audio.js';

const BUTTON_COLORS = {
  red: 0xe74c3c,
  blue: 0x3498db,
  yellow: 0xf1c40f,
  green: 0x2ecc71,
};

export class ButtonComponent {
  static type = 'button';
  static variants = Object.keys(BUTTON_COLORS);

  createMesh(slotSize, variant) {
    const group = new THREE.Group();
    const color = BUTTON_COLORS[variant] || 0xffffff;
    const scale = Math.min(slotSize.w, slotSize.h) * 0.8;

    // Button housing (recessed mount)
    const housingGeo = new THREE.CylinderGeometry(scale * 0.45, scale * 0.48, scale * 0.2, 20);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.3,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.rotation.x = Math.PI / 2;
    housing.position.z = 0.01;
    group.add(housing);

    // Button cap (the pressable part)
    const capGeo = new THREE.CylinderGeometry(scale * 0.35, scale * 0.38, scale * 0.15, 20);
    const capMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4,
      metalness: 0.2,
      emissive: color,
      emissiveIntensity: 0.1,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = scale * 0.18;
    group.add(cap);

    // Highlight ring
    const ringGeo = new THREE.TorusGeometry(scale * 0.4, scale * 0.03, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.9,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = scale * 0.14;
    group.add(ring);

    // Embossed label indicator dot on cap
    const dotGeo = new THREE.CircleGeometry(scale * 0.1, 12);
    const dotMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.z = scale * 0.26;
    group.add(dot);

    group.userData.componentType = 'button';
    group.userData.variant = variant;
    group.userData.pressed = false;
    group.userData.cap = cap;
    group.userData.capMat = capMat;
    group.userData.capRestZ = scale * 0.18;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    mesh.userData.onInteract = () => {
      if (mesh.userData.pressed) return;
      mesh.userData.pressed = true;
      playButtonClick();

      // Animate press
      const cap = mesh.userData.cap;
      const mat = mesh.userData.capMat;
      const startZ = cap.position.z;
      const duration = 150;
      const start = performance.now();

      const animate = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        cap.position.z = startZ - t * 0.015;
        mat.emissiveIntensity = 0.1 + t * 0.4;
        if (t < 1) requestAnimationFrame(animate);
      };
      animate();

      return true;
    };
  }
}
