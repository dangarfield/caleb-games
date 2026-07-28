// Hold Button component - press and hold for 3 seconds
import * as THREE from 'three';
import { playButtonClick } from '../audio.js';

export class HoldButtonComponent {
  static type = 'holdButton';
  static variants = ['red', 'blue', 'yellow', 'green'];

  createMesh(slotSize, variant) {
    const group = new THREE.Group();

    const colors = {
      red: 0xe74c3c,
      blue: 0x3498db,
      yellow: 0xf1c40f,
      green: 0x2ecc71,
    };
    const color = colors[variant] || 0xe74c3c;
    const scale = Math.min(slotSize.w, slotSize.h) * 0.8;

    // SQUARE housing (distinct from round normal buttons)
    const housingGeo = new THREE.BoxGeometry(scale * 0.75, scale * 0.75, scale * 0.2);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.4,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.z = 0.01;
    group.add(housing);

    // Hazard stripe border (canvas texture)
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 64;
    stripeCanvas.height = 64;
    const sCtx = stripeCanvas.getContext('2d');
    sCtx.fillStyle = '#222222';
    sCtx.fillRect(0, 0, 64, 64);
    sCtx.strokeStyle = '#ffcc00';
    sCtx.lineWidth = 4;
    for (let i = -64; i < 128; i += 16) {
      sCtx.beginPath(); sCtx.moveTo(i, 0); sCtx.lineTo(i + 64, 64); sCtx.stroke();
    }
    const stripeTexture = new THREE.CanvasTexture(stripeCanvas);
    housingMat.map = stripeTexture;
    housingMat.needsUpdate = true;

    // Button surface (square cap)
    const capGeo = new THREE.BoxGeometry(scale * 0.55, scale * 0.55, scale * 0.08);
    const capMat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4,
      metalness: 0.2,
      emissive: color,
      emissiveIntensity: 0.05,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.z = scale * 0.16;
    group.add(cap);

    // Progress ring (shows hold progress)
    const ringGeo = new THREE.RingGeometry(scale * 0.35, scale * 0.4, 32, 1, 0, 0);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x2ecc71,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = scale * 0.22;
    group.add(ring);

    // "HOLD" label
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 64;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD', 32, 38);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    capMat.map = labelTexture;
    capMat.needsUpdate = true;

    group.userData.componentType = 'holdButton';
    group.userData.variant = variant;
    group.userData.holding = false;
    group.userData.held = false;
    group.userData.holdProgress = 0;
    group.userData.ring = ring;
    group.userData.ringGeo = ringGeo;
    group.userData.cap = cap;
    group.userData.capMat = capMat;
    group.userData.scale = scale;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    const HOLD_TIME = 2000; // 2 seconds to hold

    mesh.userData.onPointerDown = () => {
      if (mesh.userData.held) return;
      mesh.userData.holding = true;
      mesh.userData.holdStart = performance.now();
      playButtonClick();

      // Animate press down
      const s = mesh.userData.scale;
      mesh.userData.cap.position.z = s * 0.16;
      mesh.userData.capMat.emissiveIntensity = 0.2;

      const updateHold = () => {
        if (!mesh.userData.holding) return;
        const elapsed = performance.now() - mesh.userData.holdStart;
        const progress = Math.min(1, elapsed / HOLD_TIME);
        mesh.userData.holdProgress = progress;

        // Update progress ring
        const s2 = mesh.userData.scale;
        const oldRing = mesh.userData.ring;
        oldRing.geometry.dispose();
        oldRing.geometry = new THREE.RingGeometry(s2 * 0.35, s2 * 0.4, 32, 1, 0, progress * Math.PI * 2);

        if (progress >= 1) {
          mesh.userData.held = true;
          mesh.userData.holding = false;
          mesh.userData.capMat.emissiveIntensity = 0.5;
          return;
        }
        requestAnimationFrame(updateHold);
      };
      updateHold();
    };

    mesh.userData.onPointerUp = () => {
      if (mesh.userData.held) return true; // successfully held
      mesh.userData.holding = false;
      mesh.userData.holdProgress = 0;
      const s = mesh.userData.scale;
      mesh.userData.cap.position.z = s * 0.2;
      mesh.userData.capMat.emissiveIntensity = 0.05;

      // Reset ring
      const ring = mesh.userData.ring;
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(s * 0.35, s * 0.4, 32, 1, 0, 0);
      return null; // not complete
    };

    mesh.userData.onInteract = () => {
      // Simple tap on hold button starts the hold
      if (!mesh.userData.holding && !mesh.userData.held) {
        mesh.userData.onPointerDown();
        // Auto-complete after hold time for simple tap interaction
        setTimeout(() => {
          if (mesh.userData.holding) {
            mesh.userData.held = true;
            mesh.userData.holding = false;
          }
        }, HOLD_TIME);
      }
      return mesh.userData.held ? true : null;
    };
  }
}
