// Switch component - metal toggle levers with labeled positions
import * as THREE from 'three';
import { playSwitchToggle } from '../audio.js';

const SWITCH_LABELS = ['A', 'B', 'C', 'D'];

export class SwitchComponent {
  static type = 'switch';
  static variants = SWITCH_LABELS;

  createMesh(slotSize, variant) {
    const group = new THREE.Group();
    const scale = Math.min(slotSize.w, slotSize.h) * 0.9;

    // Switch plate (mounting)
    const plateGeo = new THREE.BoxGeometry(scale * 0.5, scale * 0.8, 0.02);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.7,
      metalness: 0.5,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    group.add(plate);

    // Toggle lever
    const leverGeo = new THREE.CylinderGeometry(scale * 0.04, scale * 0.05, scale * 0.35, 8);
    const leverMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.2,
    });
    const lever = new THREE.Mesh(leverGeo, leverMat);
    lever.position.set(0, scale * 0.05, 0.02);
    lever.rotation.x = -Math.PI / 6; // OFF position (down)
    group.add(lever);

    // Lever knob
    const knobGeo = new THREE.SphereGeometry(scale * 0.08, 8, 8);
    const knobMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.9,
      roughness: 0.1,
    });
    const knob = new THREE.Mesh(knobGeo, knobMat);
    knob.position.set(0, scale * 0.17, 0);
    lever.add(knob);

    // Label below switch showing variant letter
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 64;
    const ctx = labelCanvas.getContext('2d');
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#555577';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 124, 60);
    // Big variant letter
    ctx.fillStyle = '#ffd32a';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(variant, 64, 34);

    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelGeo = new THREE.PlaneGeometry(scale * 0.45, scale * 0.3);
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTexture,
      emissive: 0x111111,
      emissiveIntensity: 0.3,
    });
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.position.set(0, -scale * 0.35, 0.012);
    group.add(label);

    // Mounting screws
    const screwGeo = new THREE.CylinderGeometry(scale * 0.03, scale * 0.03, 0.01, 8);
    const screwMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
    const sx = scale * 0.2, sy = scale * 0.35;
    [[-sx, sy], [sx, sy], [-sx, -sy], [sx, -sy]].forEach(([x, y]) => {
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(x, y, 0.012);
      group.add(screw);
    });

    group.userData.componentType = 'switch';
    group.userData.variant = variant;
    group.userData.toggled = false;
    group.userData.lever = lever;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    mesh.userData.onInteract = () => {
      if (mesh.userData.toggled) return;
      mesh.userData.toggled = true;
      playSwitchToggle();

      // Animate toggle
      const lever = mesh.userData.lever;
      const startRot = lever.rotation.x;
      const endRot = Math.PI / 6; // ON position (up)
      const duration = 150;
      const start = performance.now();

      const animate = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        lever.rotation.x = startRot + (endRot - startRot) * t;
        if (t < 1) requestAnimationFrame(animate);
      };
      animate();

      return true;
    };
  }
}
