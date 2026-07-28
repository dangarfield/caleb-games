// Suitcase bomb shape - flat rectangular case, lid + bottom tray
import * as THREE from 'three';

const WIDTH = 2.0;
const HEIGHT = 0.5;
const DEPTH = 1.4;

function makeLidSlots() {
  const sw = 0.6;
  const sh = 0.5;
  return [
    { id: 'tl', localPosition: { x: -sw, y: sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
    { id: 'tc', localPosition: { x: 0, y: sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
    { id: 'tr', localPosition: { x: sw, y: sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
    { id: 'bl', localPosition: { x: -sw, y: -sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
    { id: 'bc', localPosition: { x: 0, y: -sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
    { id: 'br', localPosition: { x: sw, y: -sh * 0.6 }, size: { w: sw * 0.9, h: sh * 0.9 } },
  ];
}

function makeSideSlots() {
  const sw = 0.48;
  return [
    { id: 'left', localPosition: { x: -sw * 0.6, y: 0 }, size: { w: sw, h: sw } },
    { id: 'right', localPosition: { x: sw * 0.6, y: 0 }, size: { w: sw, h: sw } },
  ];
}

export const SuitcaseShape = {
  name: 'suitcase',

  createBody() {
    const group = new THREE.Group();

    // Main case body - semi-transparent to see explosive contents
    const bodyGeo = new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3a4a3e,
      roughness: 0.4,
      metalness: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Internal C4 blocks
    const c4Mat = new THREE.MeshStandardMaterial({
      color: 0xddcc88,
      emissive: 0x443300,
      emissiveIntensity: 0.2,
      roughness: 0.8,
    });
    const c4Positions = [[-0.5, 0, -0.2], [0, 0, 0.2], [0.5, 0, -0.1]];
    c4Positions.forEach(([x, y, z]) => {
      const c4Geo = new THREE.BoxGeometry(0.3, HEIGHT * 0.5, 0.2);
      const c4 = new THREE.Mesh(c4Geo, c4Mat);
      c4.position.set(x, y, z);
      group.add(c4);
    });

    // Detonator cord (red, running between C4 blocks)
    const cordMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0x660000, emissiveIntensity: 0.4 });
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.5, 0, -0.2),
      new THREE.Vector3(-0.2, 0.05, 0),
      new THREE.Vector3(0, 0, 0.2),
      new THREE.Vector3(0.25, -0.03, 0),
      new THREE.Vector3(0.5, 0, -0.1),
    ]);
    const cordGeo = new THREE.TubeGeometry(cordCurve, 16, 0.015, 6, false);
    const cord = new THREE.Mesh(cordGeo, cordMat);
    group.add(cord);

    // Edges/trim
    const edgeGeo = new THREE.EdgesGeometry(bodyGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x6a8a6a });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    group.add(edges);

    // Latches on front
    const latchGeo = new THREE.BoxGeometry(0.14, 0.07, 0.05);
    const latchMat = new THREE.MeshStandardMaterial({ color: 0xbbaa44, metalness: 0.8, roughness: 0.25 });
    [-0.4, 0.4].forEach(x => {
      const latch = new THREE.Mesh(latchGeo, latchMat);
      latch.position.set(x, 0, DEPTH / 2 + 0.025);
      group.add(latch);
    });

    // Handle on top
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, HEIGHT / 2, 0),
      new THREE.Vector3(-0.12, HEIGHT / 2 + 0.14, 0),
      new THREE.Vector3(0.12, HEIGHT / 2 + 0.14, 0),
      new THREE.Vector3(0.15, HEIGHT / 2, 0),
    ]);
    const handleGeo = new THREE.TubeGeometry(handleCurve, 12, 0.025, 8, false);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6, metalness: 0.5 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    group.add(handle);

    // Corner protectors
    const cornerGeo = new THREE.BoxGeometry(0.09, HEIGHT * 1.05, 0.09);
    const cornerMat = new THREE.MeshStandardMaterial({ color: 0x556655, metalness: 0.6, roughness: 0.4 });
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([x, z]) => {
      const corner = new THREE.Mesh(cornerGeo, cornerMat);
      corner.position.set(x * (WIDTH / 2 - 0.03), 0, z * (DEPTH / 2 - 0.03));
      group.add(corner);
    });

    // Warning sticker
    const stickerGeo = new THREE.PlaneGeometry(0.35, 0.12);
    const stickerCanvas = document.createElement('canvas');
    stickerCanvas.width = 128; stickerCanvas.height = 48;
    const sCtx = stickerCanvas.getContext('2d');
    sCtx.fillStyle = '#ff3300';
    sCtx.fillRect(0, 0, 128, 48);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 16px sans-serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('⚠ C-4', 64, 20);
    sCtx.font = '12px sans-serif';
    sCtx.fillText('HANDLE WITH CARE', 64, 40);
    const stickerTex = new THREE.CanvasTexture(stickerCanvas);
    const stickerMat = new THREE.MeshStandardMaterial({ map: stickerTex });
    const sticker = new THREE.Mesh(stickerGeo, stickerMat);
    sticker.position.set(-0.5, HEIGHT / 2 + 0.005, 0.3);
    sticker.rotation.x = -Math.PI / 2;
    group.add(sticker);

    return group;
  },

  faces: [
    // Top (lid) - main panel area
    {
      id: 'lid',
      normal: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(0, HEIGHT / 2 + 0.01, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      bounds: { width: WIDTH * 0.85, height: DEPTH * 0.8 },
      slots: makeLidSlots(),
    },
    // Front
    {
      id: 'front',
      normal: new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, 0, DEPTH / 2 + 0.01),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: { width: WIDTH * 0.8, height: HEIGHT * 0.7 },
      slots: makeSideSlots(),
    },
    // Back
    {
      id: 'back',
      normal: new THREE.Vector3(0, 0, -1),
      position: new THREE.Vector3(0, 0, -(DEPTH / 2 + 0.01)),
      rotation: new THREE.Euler(0, Math.PI, 0),
      bounds: { width: WIDTH * 0.8, height: HEIGHT * 0.7 },
      slots: makeSideSlots(),
    },
    // Left side
    {
      id: 'left',
      normal: new THREE.Vector3(-1, 0, 0),
      position: new THREE.Vector3(-(WIDTH / 2 + 0.01), 0, 0),
      rotation: new THREE.Euler(0, -Math.PI / 2, 0),
      bounds: { width: DEPTH * 0.7, height: HEIGHT * 0.7 },
      slots: [{ id: 'center', localPosition: { x: 0, y: 0 }, size: { w: 0.3, h: 0.25 } }],
    },
    // Right side
    {
      id: 'right',
      normal: new THREE.Vector3(1, 0, 0),
      position: new THREE.Vector3(WIDTH / 2 + 0.01, 0, 0),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      bounds: { width: DEPTH * 0.7, height: HEIGHT * 0.7 },
      slots: [{ id: 'center', localPosition: { x: 0, y: 0 }, size: { w: 0.3, h: 0.25 } }],
    },
  ],
};
