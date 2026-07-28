// Turn Key component - brass key in lock cylinder, rotates with tap
import * as THREE from 'three';
import { playKeyTurn } from '../audio.js';

export class TurnKeyComponent {
  static type = 'turnKey';
  static variants = ['brass', 'silver', 'copper'];

  createMesh(slotSize, variant) {
    const group = new THREE.Group();

    const keyColors = {
      brass: 0xd4a017,
      silver: 0xc0c0c0,
      copper: 0xb87333,
    };
    const color = keyColors[variant] || 0xd4a017;
    const scale = Math.min(slotSize.w, slotSize.h) * 1.6;

    // Inner group — we build everything here, then rotate the outer group
    const inner = new THREE.Group();

    // Base plate behind the key
    const baseGeo = new THREE.BoxGeometry(scale * 0.5, scale * 0.06, scale * 0.5);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x556677, roughness: 0.5, metalness: 0.6,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, -0.02, 0);
    inner.add(base);

    // Key bow group — shaft along +Y (up), rotates around Y for the turn animation
    const bowGroup = new THREE.Group();
    bowGroup.position.set(0, 0, 0);

    // Shaft (tall in Y = up)
    const shaftGeo = new THREE.BoxGeometry(scale * 0.06, scale * 0.4, scale * 0.03);
    const keyMat = new THREE.MeshStandardMaterial({
      color: color, metalness: 0.8, roughness: 0.3,
    });
    const shaft = new THREE.Mesh(shaftGeo, keyMat);
    shaft.position.y = scale * 0.22;
    bowGroup.add(shaft);

    // Bow ring at top
    const bowGeo = new THREE.TorusGeometry(scale * 0.1, scale * 0.025, 8, 16);
    const bow = new THREE.Mesh(bowGeo, keyMat);
    bow.position.y = scale * 0.45;
    bowGroup.add(bow);

    // Teeth at bottom
    const teethGeo = new THREE.BoxGeometry(scale * 0.1, scale * 0.04, scale * 0.02);
    const teeth = new THREE.Mesh(teethGeo, keyMat);
    teeth.position.set(scale * 0.03, 0.02, 0);
    bowGroup.add(teeth);

    inner.add(bowGroup);

    // Status light
    const lightGeo = new THREE.SphereGeometry(scale * 0.07, 10, 10);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6,
    });
    const statusLight = new THREE.Mesh(lightGeo, lightMat);
    statusLight.position.set(scale * 0.35, 0, 0);
    inner.add(statusLight);

    group.add(inner);

    // This rotation corrects the face coordinate system
    group.rotation.x = Math.PI / 2;

    group.userData.componentType = 'turnKey';
    group.userData.variant = variant;
    group.userData.turned = false;
    group.userData.bowGroup = bowGroup;
    group.userData.statusLight = statusLight;
    group.userData.statusLightMat = lightMat;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    mesh.userData.onInteract = () => {
      if (mesh.userData.turned) return;
      mesh.userData.turned = true;
      playKeyTurn();

      // Animate 90-degree turn — rotate around Y (which is the visual "outward from face" axis after group rotation)
      const bowGroup = mesh.userData.bowGroup;
      const startRot = bowGroup.rotation.y;
      const endRot = startRot + Math.PI / 2;
      const duration = 400;
      const start = performance.now();

      const animate = () => {
        const t = Math.min(1, (performance.now() - start) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        bowGroup.rotation.y = startRot + (endRot - startRot) * ease;
        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          mesh.userData.statusLightMat.color.setHex(0x00ff00);
          mesh.userData.statusLightMat.emissive.setHex(0x00ff00);
        }
      };
      animate();

      return true;
    };
  }
}
