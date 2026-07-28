// Triangular Prism bomb shape - 3 flat sides + 2 end caps
import * as THREE from 'three';

const RADIUS = 0.9;
const HEIGHT = 1.8;

function makeSideSlots() {
  const slotH = 0.5;
  const slotW = 0.5;
  return [
    { id: 'top', localPosition: { x: 0, y: slotH * 0.55 }, size: { w: slotW, h: slotH } },
    { id: 'bot', localPosition: { x: 0, y: -slotH * 0.55 }, size: { w: slotW, h: slotH } },
  ];
}

function makeEndCapSlots() {
  const s = 0.4;
  return [
    { id: 'a', localPosition: { x: -s * 0.5, y: 0 }, size: { w: s, h: s } },
    { id: 'b', localPosition: { x: s * 0.5, y: 0 }, size: { w: s, h: s } },
  ];
}

// Helper: compute euler rotation so that local +Z points along `normal`
function faceRotation(normal) {
  const up = Math.abs(normal.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), up);
  quat.setFromRotationMatrix(mat);
  return new THREE.Euler().setFromQuaternion(quat);
}

export const CylinderShape = {
  name: 'cylinder',

  createBody() {
    const group = new THREE.Group();

    // Triangular prism — length along Z axis
    // We build it manually so we have full control over orientation.
    // 3 vertices of the triangle in the XY plane:
    const apothem = RADIUS * 0.5; // distance from center to face midpoint for equilateral triangle
    const triRadius = RADIUS; // circumradius

    // Build prism using ExtrudeGeometry for a clean triangular cross-section along Z
    const shape = new THREE.Shape();
    const verts = [];
    for (let i = 0; i < 3; i++) {
      // Point one vertex straight up, so the bottom face is flat/horizontal
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * triRadius;
      const y = Math.sin(angle) * triRadius;
      verts.push(new THREE.Vector2(x, y));
    }
    shape.moveTo(verts[0].x, verts[0].y);
    shape.lineTo(verts[1].x, verts[1].y);
    shape.lineTo(verts[2].x, verts[2].y);
    shape.closePath();

    const extrudeSettings = { depth: HEIGHT, bevelEnabled: false };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center the extrusion along Z (it extrudes from 0 to HEIGHT, shift back by half)
    geo.translate(0, 0, -HEIGHT / 2);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a3a3e,
      roughness: 0.3,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Inner explosive sticks
    const stickMat = new THREE.MeshStandardMaterial({
      color: 0xcc3300,
      emissive: 0x881100,
      emissiveIntensity: 0.4,
      roughness: 0.7,
    });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const r = 0.15;
      const stickGeo = new THREE.CylinderGeometry(0.05, 0.05, HEIGHT * 0.6, 8);
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
      stick.rotation.x = Math.PI / 2;
      group.add(stick);
    }

    // Detonator wire
    const detWireMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0x554400, emissiveIntensity: 0.3 });
    const wireCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.05, -HEIGHT * 0.25),
      new THREE.Vector3(0.1, -0.05, 0),
      new THREE.Vector3(-0.05, 0.05, HEIGHT * 0.25),
    ]);
    const wireGeo = new THREE.TubeGeometry(wireCurve, 10, 0.012, 6, false);
    group.add(new THREE.Mesh(wireGeo, detWireMat));

    // Bolts at triangle vertices on each end
    const boltGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x99aabb, metalness: 0.9, roughness: 0.15 });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * triRadius * 0.9;
      const y = Math.sin(angle) * triRadius * 0.9;
      [HEIGHT / 2, -HEIGHT / 2].forEach(z => {
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.position.set(x, y, z);
        group.add(bolt);
      });
    }

    return group;
  },

  // 3 side faces + 2 end caps
  // Triangle vertices at angles: -90°, 30°, 150° (top vertex, bottom-right, bottom-left)
  // Face normals are perpendicular to edges, pointing outward.
  // Face 0 (bottom): between vertices at 30° and 150° → normal points down (-Y)
  // Face 1 (right): between vertices at -90° and 30° → normal points to lower-right
  // Face 2 (left): between vertices at 150° and -90° → normal points to lower-left
  // Actually for an equilateral triangle with one vertex at top (-90°):
  //   Face between v0(-90°) and v1(30°): midpoint normal at -30° from +X = (cos(-30°), sin(-30°))
  //   Face between v1(30°) and v2(150°): midpoint normal at 90° below = (0, -1)
  //   Face between v2(150°) and v0(-90°): midpoint normal at (cos(210°-180°)...) let me just compute:
  faces: (() => {
    const triRadius = RADIUS;
    const faces = [];

    // Vertices of the triangle (in XY plane)
    const vertAngles = [-Math.PI / 2, -Math.PI / 2 + (2 * Math.PI / 3), -Math.PI / 2 + (4 * Math.PI / 3)];
    const vertices = vertAngles.map(a => new THREE.Vector2(Math.cos(a) * triRadius, Math.sin(a) * triRadius));

    // Each face is between two consecutive vertices
    for (let i = 0; i < 3; i++) {
      const v0 = vertices[i];
      const v1 = vertices[(i + 1) % 3];

      // Face midpoint (in XY)
      const midX = (v0.x + v1.x) / 2;
      const midY = (v0.y + v1.y) / 2;

      // Normal: perpendicular to edge, pointing outward (away from center)
      const edgeDx = v1.x - v0.x;
      const edgeDy = v1.y - v0.y;
      // Perpendicular: (edgeDy, -edgeDx) or (-edgeDy, edgeDx)
      let nx = edgeDy;
      let ny = -edgeDx;
      // Ensure it points outward (same direction as midpoint from center)
      if (nx * midX + ny * midY < 0) { nx = -nx; ny = -ny; }
      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny);
      nx /= len;
      ny /= len;

      const normal = new THREE.Vector3(nx, ny, 0);
      // Apothem = distance from center to face midpoint
      const apothem = Math.sqrt(midX * midX + midY * midY);
      const position = new THREE.Vector3(nx * (apothem + 0.01), ny * (apothem + 0.01), 0);

      // Use lookAt to compute rotation (same approach as sphere — proven to work)
      const up = new THREE.Vector3(0, 0, 1); // Z is along the prism length, use as "up" for side faces
      const quat = new THREE.Quaternion();
      const lookMat = new THREE.Matrix4().lookAt(normal, new THREE.Vector3(0, 0, 0), up);
      quat.setFromRotationMatrix(lookMat);
      const euler = new THREE.Euler().setFromQuaternion(quat);

      faces.push({
        id: `side-${i + 1}`,
        normal,
        position,
        rotation: euler,
        bounds: { width: triRadius * 0.9, height: HEIGHT * 0.8 },
        slots: makeSideSlots(),
      });
    }

    // End caps (face along Z axis)
    faces.push({
      id: 'end-front',
      normal: new THREE.Vector3(0, 0, 1),
      position: new THREE.Vector3(0, 0, HEIGHT / 2 + 0.02),
      rotation: new THREE.Euler(0, 0, 0),
      bounds: { width: triRadius * 0.8, height: triRadius * 0.8 },
      slots: makeEndCapSlots(),
    });
    faces.push({
      id: 'end-back',
      normal: new THREE.Vector3(0, 0, -1),
      position: new THREE.Vector3(0, 0, -(HEIGHT / 2 + 0.02)),
      rotation: new THREE.Euler(0, Math.PI, 0),
      bounds: { width: triRadius * 0.8, height: triRadius * 0.8 },
      slots: makeEndCapSlots(),
    });

    return faces;
  })(),
};
