// Cube bomb shape - 6 faces, each with slot positions
import * as THREE from 'three';

const SIZE = 1.6;
const HALF = SIZE / 2;

// Each face has 4 slots in a 2x2 grid
function makeSlots(faceSize) {
  const s = faceSize * 0.6;
  return [
    { id: 'tl', localPosition: { x: -s / 2, y: s / 2 }, size: { w: s * 0.92, h: s * 0.92 } },
    { id: 'tr', localPosition: { x: s / 2, y: s / 2 }, size: { w: s * 0.92, h: s * 0.92 } },
    { id: 'bl', localPosition: { x: -s / 2, y: -s / 2 }, size: { w: s * 0.92, h: s * 0.92 } },
    { id: 'br', localPosition: { x: s / 2, y: -s / 2 }, size: { w: s * 0.92, h: s * 0.92 } },
  ];
}

export const CubeShape = {
  name: 'cube',

  createBody() {
    const group = new THREE.Group();

    // Outer shell - semi-transparent to see inside
    const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3a3a5e,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Inner explosive core - glowing red/orange sphere
    const coreGeo = new THREE.SphereGeometry(SIZE * 0.28, 16, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xff3300,
      emissive: 0xff2200,
      emissiveIntensity: 0.6,
      roughness: 0.8,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Internal wires connecting core to faces
    const wireMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0x660000, emissiveIntensity: 0.3 });
    const wireDirections = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    wireDirections.forEach(([dx, dy, dz]) => {
      const wireGeo = new THREE.CylinderGeometry(0.015, 0.015, SIZE * 0.35, 6);
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(dx * SIZE * 0.25, dy * SIZE * 0.25, dz * SIZE * 0.25);
      if (dx !== 0) wire.rotation.z = Math.PI / 2;
      if (dz !== 0) wire.rotation.x = Math.PI / 2;
      group.add(wire);
    });

    // Edge highlights
    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x6a6a9e });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    group.add(edges);

    // Corner bolts (larger, shinier)
    const boltGeo = new THREE.SphereGeometry(0.055, 10, 10);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x8888aa, metalness: 0.9, roughness: 0.15 });
    const corners = [
      [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
      [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
    ];
    corners.forEach(([x, y, z]) => {
      const bolt = new THREE.Mesh(boltGeo, boltMat);
      bolt.position.set(x * HALF * 0.95, y * HALF * 0.95, z * HALF * 0.95);
      group.add(bolt);
    });

    // Warning labels on two faces
    const labelGeo = new THREE.PlaneGeometry(SIZE * 0.4, SIZE * 0.15);
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128; labelCanvas.height = 48;
    const lCtx = labelCanvas.getContext('2d');
    lCtx.fillStyle = '#ffcc00';
    lCtx.fillRect(0, 0, 128, 48);
    lCtx.fillStyle = '#000000';
    lCtx.font = 'bold 18px sans-serif';
    lCtx.textAlign = 'center';
    lCtx.fillText('⚠ DANGER', 64, 20);
    lCtx.font = 'bold 12px sans-serif';
    lCtx.fillText('EXPLOSIVE', 64, 40);
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, emissive: 0x332200, emissiveIntensity: 0.2, transparent: true, opacity: 0.85 });
    const label1 = new THREE.Mesh(labelGeo, labelMat);
    label1.position.set(0, -HALF * 0.6, HALF + 0.005);
    group.add(label1);
    const label2 = label1.clone();
    label2.position.set(0, -HALF * 0.6, -(HALF + 0.005));
    label2.rotation.y = Math.PI;
    group.add(label2);

    return group;
  },

  faces: [
    {
      id: 'front',
      normal: new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, 0, HALF + 0.01),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85),
    },
    {
      id: 'back',
      normal: new THREE.Vector3(0, 0, -1),
      position: new THREE.Vector3(0, 0, -(HALF + 0.01)),
      rotation: new THREE.Euler(0, Math.PI, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85),
    },
    {
      id: 'right',
      normal: new THREE.Vector3(1, 0, 0),
      position: new THREE.Vector3(HALF + 0.01, 0, 0),
      rotation: new THREE.Euler(0, Math.PI / 2, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85),
    },
    {
      id: 'left',
      normal: new THREE.Vector3(-1, 0, 0),
      position: new THREE.Vector3(-(HALF + 0.01), 0, 0),
      rotation: new THREE.Euler(0, -Math.PI / 2, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85),
    },
    {
      id: 'top',
      normal: new THREE.Vector3(0, 1, 0),
      position: new THREE.Vector3(0, HALF + 0.01, 0),
      rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85).slice(0, 2), // only 2 slots on top
    },
    {
      id: 'bottom',
      normal: new THREE.Vector3(0, -1, 0),
      position: new THREE.Vector3(0, -(HALF + 0.01), 0),
      rotation: new THREE.Euler(Math.PI / 2, 0, 0),
      bounds: { width: SIZE * 0.85, height: SIZE * 0.85 },
      slots: makeSlots(SIZE * 0.85).slice(0, 2), // only 2 slots on bottom
    },
  ],
};
