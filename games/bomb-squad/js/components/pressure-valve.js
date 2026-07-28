// Pressure Valve component - industrial hand-wheel with pressure gauge
import * as THREE from 'three';
import { playValveTap } from '../audio.js';

export class PressureValveComponent {
  static type = 'pressureValve';
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
    const scale = Math.min(slotSize.w, slotSize.h) * 1.0; // valve is big

    // Valve body (pipe mount)
    const bodyGeo = new THREE.CylinderGeometry(scale * 0.15, scale * 0.18, scale * 0.3, 12);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x556677,
      metalness: 0.7,
      roughness: 0.4,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    // Hand wheel
    const wheelGeo = new THREE.TorusGeometry(scale * 0.3, scale * 0.04, 8, 20);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.6,
      roughness: 0.4,
    });
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.z = scale * 0.18;
    group.add(wheel);

    // Wheel spokes
    for (let i = 0; i < 4; i++) {
      const spokeGeo = new THREE.CylinderGeometry(scale * 0.02, scale * 0.02, scale * 0.55, 6);
      const spoke = new THREE.Mesh(spokeGeo, wheelMat);
      spoke.rotation.z = (i * Math.PI) / 4;
      spoke.position.z = scale * 0.18;
      spoke.rotation.x = Math.PI / 2;
      spoke.rotation.order = 'ZXY';
      group.add(spoke);
    }

    // Center hub
    const hubGeo = new THREE.CylinderGeometry(scale * 0.06, scale * 0.06, scale * 0.08, 12);
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      metalness: 0.9,
      roughness: 0.2,
    });
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = scale * 0.2;
    group.add(hub);

    // Pressure gauge (large dial)
    const gaugeGeo = new THREE.CircleGeometry(scale * 0.3, 20);
    const gaugeCanvas = document.createElement('canvas');
    gaugeCanvas.width = 64;
    gaugeCanvas.height = 64;
    const gCtx = gaugeCanvas.getContext('2d');
    this._drawGauge(gCtx, 0);
    const gaugeTexture = new THREE.CanvasTexture(gaugeCanvas);
    const gaugeMat = new THREE.MeshStandardMaterial({
      map: gaugeTexture,
      emissive: 0x111111,
      emissiveIntensity: 0.2,
    });
    const gauge = new THREE.Mesh(gaugeGeo, gaugeMat);
    gauge.position.set(0, -scale * 0.5, scale * 0.15);
    gauge.rotation.z = -Math.PI / 2;
    group.add(gauge);

    // Status light (red = not done, green when solved)
    const lightGeo = new THREE.SphereGeometry(scale * 0.06, 10, 10);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.6,
    });
    const statusLight = new THREE.Mesh(lightGeo, lightMat);
    statusLight.position.set(scale * 0.35, scale * 0.2, scale * 0.1);
    group.add(statusLight);

    group.userData.componentType = 'pressureValve';
    group.userData.variant = variant;
    group.userData.taps = 0;
    group.userData.requiredTaps = 5;
    group.userData.solved = false;
    group.userData.wheel = wheel;
    group.userData.gaugeCanvas = gaugeCanvas;
    group.userData.gaugeCtx = gCtx;
    group.userData.gaugeTexture = gaugeTexture;
    group.userData.drawGauge = this._drawGauge.bind(this);
    group.userData.statusLightMat = lightMat;

    return group;
  }

  _drawGauge(ctx, progress) {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();

    // Scale markings
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 1.3) + (i / 9) * (Math.PI * 1.4);
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(angle) * 22, 32 + Math.sin(angle) * 22);
      ctx.lineTo(32 + Math.cos(angle) * 26, 32 + Math.sin(angle) * 26);
      ctx.stroke();
    }

    // Needle
    const needleAngle = (Math.PI * 1.3) + progress * (Math.PI * 1.4);
    ctx.strokeStyle = progress > 0.8 ? '#e74c3c' : '#2ecc71';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + Math.cos(needleAngle) * 20, 32 + Math.sin(needleAngle) * 20);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    mesh.userData.onInteract = () => {
      if (mesh.userData.solved) return;
      mesh.userData.taps++;
      playValveTap();

      // Spin wheel
      mesh.userData.wheel.rotation.z += Math.PI / 4;

      // Update gauge
      const progress = mesh.userData.taps / mesh.userData.requiredTaps;
      mesh.userData.drawGauge(mesh.userData.gaugeCtx, Math.min(1, progress));
      mesh.userData.gaugeTexture.needsUpdate = true;

      if (mesh.userData.taps >= mesh.userData.requiredTaps) {
        mesh.userData.solved = true;
        // Turn light green
        if (mesh.userData.statusLightMat) {
          mesh.userData.statusLightMat.color.setHex(0x00ff00);
          mesh.userData.statusLightMat.emissive.setHex(0x00ff00);
        }
        return true;
      }
      return null; // still tapping
    };
  }
}
