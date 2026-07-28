// Briefcase bomb shape - slimmer, more technical looking
import * as THREE from 'three';

const WIDTH = 1.8;
const HEIGHT = 0.35;
const DEPTH = 1.2;

function makeInternalSlots() {
  const sw = 0.5;
  const sh = 0.44;
  return [
    { id: 'a', localPosition: { x: -sw * 1.2, y: sh * 0.5 }, size: { w: sw, h: sh } },
    { id: 'b', localPosition: { x: 0, y: sh * 0.5 }, size: { w: sw, h: sh } },
    { id: 'c', localPosition: { x: sw * 1.2, y: sh * 0.5 }, size: { w: sw, h: sh } },
    { id: 'd', localPosition: { x: -sw * 0.6, y: -sh * 0.5 }, size: { w: sw, h: sh } },
    { id: 'e', localPosition: { x: sw * 0.6, y: -sh * 0.5 }, size: { w: sw, h: sh } },
  ];
}

export const BriefcaseShape = {
  name: 'briefcase',

  createBody() {
    const group = new THREE.Group();

    // Main case - semi-transparent dark shell
    const bodyGeo = new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a4e,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Internal circuit board (green PCB)
    const pcbGeo = new THREE.BoxGeometry(WIDTH * 0.7, 0.02, DEPTH * 0.6);
    const pcbCanvas = document.createElement('canvas');
    pcbCanvas.width = 128; pcbCanvas.height = 96;
    const pCtx = pcbCanvas.getContext('2d');
    pCtx.fillStyle = '#1a5c1a';
    pCtx.fillRect(0, 0, 128, 96);
    pCtx.strokeStyle = '#33aa33';
    pCtx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 96;
      pCtx.beginPath(); pCtx.moveTo(x, y);
      pCtx.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 30);
      pCtx.stroke();
    }
    // Chip markers
    pCtx.fillStyle = '#111111';
    [[30, 30], [80, 50], [50, 70]].forEach(([x, y]) => {
      pCtx.fillRect(x, y, 16, 10);
    });
    const pcbTex = new THREE.CanvasTexture(pcbCanvas);
    const pcbMat = new THREE.MeshStandardMaterial({ map: pcbTex, emissive: 0x002200, emissiveIntensity: 0.2 });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.y = -HEIGHT * 0.1;
    group.add(pcb);

    // Blinking LED on PCB
    const ledGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.0 });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0.3, -HEIGHT * 0.08, 0.1);
    group.add(led);

    // Internal wiring (yellow/red)
    const wireMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x553300, emissiveIntensity: 0.2 });
    const wireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.4, 0, -0.2),
      new THREE.Vector3(-0.1, 0.05, 0.1),
      new THREE.Vector3(0.2, -0.03, -0.1),
      new THREE.Vector3(0.5, 0.02, 0.2),
    ]);
    const wireGeo = new THREE.TubeGeometry(wireCurve, 12, 0.01, 6, false);
    group.add(new THREE.Mesh(wireGeo, wireMat));

    // Metal frame edges
    const frameGeo = new THREE.EdgesGeometry(bodyGeo);
    const frameMat = new THREE.LineBasicMaterial({ color: 0x8899bb });
    const frame = new THREE.LineSegments(frameGeo, frameMat);
    group.add(frame);

    // Combination lock (center front)
    const lockGeo = new THREE.BoxGeometry(0.22, 0.05, 0.04);
    const lockMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.15 });
    const lock = new THREE.Mesh(lockGeo, lockMat);
    lock.position.set(0, 0, DEPTH / 2 + 0.02);
    group.add(lock);

    // Lock dials
    for (let i = -1; i <= 1; i++) {
      const dialGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.04, 12);
      const dial = new THREE.Mesh(dialGeo, lockMat);
      dial.rotation.x = Math.PI / 2;
      dial.position.set(i * 0.055, 0, DEPTH / 2 + 0.035);
      group.add(dial);
    }

    // Handle
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.12, HEIGHT / 2, 0),
      new THREE.Vector3(-0.1, HEIGHT / 2 + 0.1, 0),
      new THREE.Vector3(0.1, HEIGHT / 2 + 0.1, 0),
      new THREE.Vector3(0.12, HEIGHT / 2, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 10, 0.018, 8, false);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.5 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    group.add(handle);

    // Warning sticker (top)
    const stickerGeo = new THREE.PlaneGeometry(0.35, 0.15);
    const stickerCanvas = document.createElement('canvas');
    stickerCanvas.width = 128; stickerCanvas.height = 48;
    const sCtx = stickerCanvas.getContext('2d');
    sCtx.fillStyle = '#ffcc00';
    sCtx.fillRect(0, 0, 128, 48);
    sCtx.fillStyle = '#000000';
    sCtx.font = 'bold 14px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('⚠ IED', 64, 18);
    sCtx.font = '11px sans-serif';
    sCtx.fillText('DO NOT DISTURB', 64, 38);
    const stickerTexture = new THREE.CanvasTexture(stickerCanvas);
    const stickerMat = new THREE.MeshStandardMaterial({ map: stickerTexture });
    const sticker = new THREE.Mesh(stickerGeo, stickerMat);
    sticker.position.set(0.5, HEIGHT / 2 + 0.005, 0);
    sticker.rotation.x = -Math.PI / 2;
    group.add(sticker);

    return group;
  },

  faces: [
    // Top (open lid view)
    {
      id: 'interior',
      normal: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(0, HEIGHT / 2 + 0.01, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      bounds: { width: WIDTH * 0.85, height: DEPTH * 0.8 },
      slots: makeInternalSlots(),
    },
    // Front edge
    {
      id: 'front',
      normal: new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, 0, DEPTH / 2 + 0.01),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: { width: WIDTH * 0.7, height: HEIGHT * 0.7 },
      slots: [
        { id: 'left', localPosition: { x: -0.25, y: 0 }, size: { w: 0.25, h: 0.2 } },
        { id: 'right', localPosition: { x: 0.25, y: 0 }, size: { w: 0.25, h: 0.2 } },
      ],
    },
    // Back
    {
      id: 'back',
      normal: new THREE.Vector3(0, 0, -1),
      position: new THREE.Vector3(0, 0, -(DEPTH / 2 + 0.01)),
      rotation: new THREE.Euler(0, Math.PI, 0),
      bounds: { width: WIDTH * 0.7, height: HEIGHT * 0.7 },
      slots: [
        { id: 'center', localPosition: { x: 0, y: 0 }, size: { w: 0.25, h: 0.2 } },
      ],
    },
    // Bottom (underneath)
    {
      id: 'bottom',
      normal: new THREE.Vector3(0, -1, 0),
      position: new THREE.Vector3(0, -(HEIGHT / 2 + 0.01), 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      bounds: { width: WIDTH * 0.7, height: DEPTH * 0.6 },
      slots: [
        { id: 'a', localPosition: { x: -0.3, y: 0 }, size: { w: 0.3, h: 0.25 } },
        { id: 'b', localPosition: { x: 0.3, y: 0 }, size: { w: 0.3, h: 0.25 } },
      ],
    },
  ],
};
