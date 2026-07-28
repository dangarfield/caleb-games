// Screw Panel - obfuscation cover that hides components underneath
import * as THREE from 'three';
import { playScrewTurn } from './audio.js';

export class ScrewPanel {
  constructor(slotSize) {
    this.group = new THREE.Group();
    this.screws = [];
    this.removed = false;
    this.screwsRemoved = 0;
    this.totalScrews = 4;

    const w = slotSize.w * 0.95;
    const h = slotSize.h * 0.95;

    // Metal plate - lighter color, thick enough to cover components
    const plateGeo = new THREE.BoxGeometry(w, h, 0.12);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x8899aa,
      metalness: 0.6,
      roughness: 0.4,
    });
    this.plate = new THREE.Mesh(plateGeo, plateMat);
    this.plate.position.z = 0.04; // push out to cover components underneath
    this.plate.userData.isScrewPanel = true;
    this.plate.userData.panel = this;
    this.group.add(this.plate);

    // Warning stripes texture (procedural) - yellow/black hazard
    const stripeCanvas = document.createElement('canvas');
    stripeCanvas.width = 128;
    stripeCanvas.height = 128;
    const sCtx = stripeCanvas.getContext('2d');
    sCtx.fillStyle = '#7788aa';
    sCtx.fillRect(0, 0, 128, 128);
    // Hazard border
    sCtx.strokeStyle = '#ffcc00';
    sCtx.lineWidth = 8;
    sCtx.strokeRect(4, 4, 120, 120);
    // Diagonal stripes
    sCtx.strokeStyle = 'rgba(0,0,0,0.15)';
    sCtx.lineWidth = 3;
    for (let i = -128; i < 256; i += 20) {
      sCtx.beginPath();
      sCtx.moveTo(i, 0);
      sCtx.lineTo(i + 128, 128);
      sCtx.stroke();
    }

    const stripeTexture = new THREE.CanvasTexture(stripeCanvas);
    plateMat.map = stripeTexture;
    plateMat.needsUpdate = true;

    // Add screws at corners - MUCH BIGGER for easy tapping
    const screwRadius = Math.max(0.06, Math.min(w, h) * 0.1);
    const screwPositions = [
      { x: -w * 0.36, y: -h * 0.36 },
      { x: w * 0.36, y: -h * 0.36 },
      { x: -w * 0.36, y: h * 0.36 },
      { x: w * 0.36, y: h * 0.36 },
    ];

    screwPositions.forEach(pos => {
      const screwGroup = new THREE.Group();

      // Screw head - big bright cylinder
      const screwGeo = new THREE.CylinderGeometry(screwRadius, screwRadius * 1.1, 0.04, 16);
      const screwMat = new THREE.MeshStandardMaterial({
        color: 0xccccdd,
        metalness: 0.8,
        roughness: 0.2,
      });
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.rotation.x = Math.PI / 2;
      screw.userData.isScrew = true;
      screw.userData.panel = this;
      screw.userData.screwGroup = screwGroup;

      // Cross slot on screw (visible)
      const slotW = screwRadius * 1.5;
      const slotGeo = new THREE.BoxGeometry(slotW, 0.008, 0.008);
      const slotMat = new THREE.MeshStandardMaterial({ color: 0x444455 });
      const slot1 = new THREE.Mesh(slotGeo, slotMat);
      slot1.position.z = 0.022;
      const slot2 = slot1.clone();
      slot2.rotation.z = Math.PI / 2;
      slot2.position.z = 0.022;

      screwGroup.add(screw);
      screwGroup.add(slot1);
      screwGroup.add(slot2);
      screwGroup.position.set(pos.x, pos.y, 0.11);

      screwGroup.userData.isScrew = true;
      screwGroup.userData.panel = this;
      screwGroup.userData.removed = false;

      this.group.add(screwGroup);
      this.screws.push(screwGroup);
    });
  }

  handleScrewTap(screwGroup) {
    if (this.removed || screwGroup.userData.removed) return false;

    screwGroup.userData.removed = true;
    playScrewTurn();

    // Animate screw out
    const startZ = screwGroup.position.z;
    const startRot = screwGroup.rotation.z;
    const duration = 300;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - t, 3);

      screwGroup.position.z = startZ + ease * 0.15;
      screwGroup.rotation.z = startRot + ease * Math.PI * 2;
      screwGroup.scale.setScalar(1 - ease * 0.8);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        screwGroup.visible = false;
        this.screwsRemoved++;
        if (this.screwsRemoved >= this.totalScrews) {
          this.removePanel();
        }
      }
    };
    animate();
    return true;
  }

  removePanel() {
    this.removed = true;
    // Animate panel falling away
    const duration = 500;
    const startTime = performance.now();
    const startPos = this.plate.position.clone();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const ease = t * t;

      this.plate.position.z = startPos.z - ease * 0.5;
      this.plate.position.y = startPos.y - ease * 0.3;
      this.plate.rotation.x = ease * 0.5;
      this.plate.material.opacity = 1 - ease;
      this.plate.material.transparent = true;

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.group.visible = false;
      }
    };
    animate();
  }
}
