// Keypad component - 4-digit code entry with tactile keys and LCD
import * as THREE from 'three';
import { playKeypadPress } from '../audio.js';

export class KeypadComponent {
  static type = 'keypad';
  static variants = ['1234', '2413', '3142', '4321'];

  createMesh(slotSize, variant) {
    const group = new THREE.Group();
    const w = slotSize.w * 0.85;
    const h = slotSize.h * 0.9;

    // Keypad housing - light colored for visibility
    const housingGeo = new THREE.BoxGeometry(w, h, 0.04);
    const housingMat = new THREE.MeshStandardMaterial({
      color: 0xddddee,
      roughness: 0.5,
      metalness: 0.1,
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    group.add(housing);

    // LCD display area (top)
    const lcdGeo = new THREE.BoxGeometry(w * 0.8, h * 0.2, 0.005);
    const lcdCanvas = document.createElement('canvas');
    lcdCanvas.width = 128;
    lcdCanvas.height = 32;
    const lcdCtx = lcdCanvas.getContext('2d');
    lcdCtx.fillStyle = '#1a3a1a';
    lcdCtx.fillRect(0, 0, 128, 32);
    lcdCtx.fillStyle = '#33ff33';
    lcdCtx.font = 'bold 20px monospace';
    lcdCtx.textAlign = 'center';
    lcdCtx.fillText('_ _ _ _', 64, 24);

    const lcdTexture = new THREE.CanvasTexture(lcdCanvas);
    const lcdMat = new THREE.MeshStandardMaterial({
      map: lcdTexture,
      emissive: 0x113311,
      emissiveIntensity: 0.3,
    });
    const lcd = new THREE.Mesh(lcdGeo, lcdMat);
    lcd.position.set(0, h * 0.32, 0.025);
    group.add(lcd);

    // Keys (2x2 grid for digits 1-4)
    const keySize = w * 0.3;
    const keyPositions = [
      { x: -keySize * 0.7, y: h * 0.05, digit: '1' },
      { x: keySize * 0.7, y: h * 0.05, digit: '2' },
      { x: -keySize * 0.7, y: -h * 0.22, digit: '3' },
      { x: keySize * 0.7, y: -h * 0.22, digit: '4' },
    ];

    const keys = [];
    keyPositions.forEach(kp => {
      const keyGeo = new THREE.BoxGeometry(keySize, keySize, 0.025);
      const keyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.3,
        metalness: 0.05,
      });
      const key = new THREE.Mesh(keyGeo, keyMat);
      key.position.set(kp.x, kp.y, 0.035);

      // Digit label on key - white bg, black text, high contrast
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 64;
      labelCanvas.height = 64;
      const labelCtx = labelCanvas.getContext('2d');
      labelCtx.fillStyle = '#ffffff';
      labelCtx.fillRect(0, 0, 64, 64);
      labelCtx.strokeStyle = '#999999';
      labelCtx.lineWidth = 3;
      labelCtx.strokeRect(2, 2, 60, 60);
      labelCtx.fillStyle = '#000000';
      labelCtx.font = 'bold 44px monospace';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      labelCtx.fillText(kp.digit, 32, 34);
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      keyMat.map = labelTexture;
      keyMat.needsUpdate = true;

      key.userData.digit = kp.digit;
      key.userData.isKey = true;
      keys.push(key);
      group.add(key);
    });

    // Invisible tap plate covering the whole 2x2 key area. On a tablet a small
    // finger often lands between/beside the keys; this plate catches those
    // near-misses and main.js routes them to the NEAREST key centre, so every
    // tap on the keypad registers a digit. Sits just in front of the keys so
    // it wins the raycast, but its digit is resolved from the local hit point.
    const plateGeo = new THREE.BoxGeometry(w * 0.95, h * 0.72, 0.02);
    const plateMat = new THREE.MeshBasicMaterial({ visible: false });
    const tapPlate = new THREE.Mesh(plateGeo, plateMat);
    tapPlate.position.set(0, -h * 0.08, 0.055);
    tapPlate.userData.isKeyPlate = true;
    tapPlate.userData.isKey = true; // treated as a key hit by main.js
    // Local (x,y) centre of each key so nearest-key can be resolved from a hit.
    tapPlate.userData.keyCenters = keyPositions.map(kp => ({ x: kp.x, y: kp.y, digit: kp.digit }));
    group.add(tapPlate);

    group.userData.componentType = 'keypad';
    group.userData.variant = variant;
    group.userData.entered = '';
    group.userData.keys = keys;
    group.userData.lcd = lcd;
    group.userData.lcdCanvas = lcdCanvas;
    group.userData.lcdCtx = lcdCtx;
    group.userData.lcdTexture = lcdTexture;
    group.userData.solved = false;

    return group;
  }

  bindInteraction(mesh, onCorrect, onWrong) {
    // Keypad interaction is per-key; handled in main via raycasting to key children
    mesh.userData.onKeyPress = (digit) => {
      if (mesh.userData.solved) return;
      playKeypadPress();

      mesh.userData.entered += digit;
      const lcdCtx = mesh.userData.lcdCtx;
      const lcdCanvas = mesh.userData.lcdCanvas;

      // Update LCD
      lcdCtx.fillStyle = '#1a3a1a';
      lcdCtx.fillRect(0, 0, 128, 32);
      lcdCtx.fillStyle = '#33ff33';
      lcdCtx.font = 'bold 20px monospace';
      lcdCtx.textAlign = 'center';
      const display = mesh.userData.entered.split('').join(' ').padEnd(7, ' _');
      lcdCtx.fillText(display, 64, 24);
      mesh.userData.lcdTexture.needsUpdate = true;

      if (mesh.userData.entered.length >= 4) {
        if (mesh.userData.entered === mesh.userData.variant) {
          mesh.userData.solved = true;
          lcdCtx.fillStyle = '#1a3a1a';
          lcdCtx.fillRect(0, 0, 128, 32);
          lcdCtx.fillStyle = '#33ff33';
          lcdCtx.font = 'bold 16px monospace';
          lcdCtx.textAlign = 'center';
          lcdCtx.fillText('CORRECT', 64, 24);
          mesh.userData.lcdTexture.needsUpdate = true;
          return true; // solved
        } else {
          // Wrong code — reset
          mesh.userData.entered = '';
          lcdCtx.fillStyle = '#3a1a1a';
          lcdCtx.fillRect(0, 0, 128, 32);
          lcdCtx.fillStyle = '#ff3333';
          lcdCtx.font = 'bold 16px monospace';
          lcdCtx.textAlign = 'center';
          lcdCtx.fillText('ERROR', 64, 24);
          mesh.userData.lcdTexture.needsUpdate = true;
          setTimeout(() => {
            lcdCtx.fillStyle = '#1a3a1a';
            lcdCtx.fillRect(0, 0, 128, 32);
            lcdCtx.fillStyle = '#33ff33';
            lcdCtx.font = 'bold 20px monospace';
            lcdCtx.textAlign = 'center';
            lcdCtx.fillText('_ _ _ _', 64, 24);
            mesh.userData.lcdTexture.needsUpdate = true;
          }, 500);
          return false;
        }
      }
      return null; // still entering
    };

    mesh.userData.onInteract = () => {
      // Main tap on keypad body does nothing — keys handle individually
      return null;
    };
  }
}
