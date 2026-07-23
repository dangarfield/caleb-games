import * as THREE from 'three';
import { CATEGORIES } from './books.js';

const FLOOR_WIDTH = 10;
const FLOOR_DEPTH = 14;
const GROUND_FLOOR_HEIGHT = 3.8;
const UPPER_FLOOR_HEIGHT = 3.4;
const TOTAL_HEIGHT = GROUND_FLOOR_HEIGHT + UPPER_FLOOR_HEIGHT;
const BALCONY_WIDTH = 2.2;
const SHELF_UNIT_WIDTH = 2.2;
const SHELF_UNIT_HEIGHT = 2.8;
const SHELF_UNIT_DEPTH = 0.45;
const SHELVES_PER_UNIT = 4;

// Imperial staircase geometry:
// Lower flight: center, walking toward back wall (-z), ground to half-height
// Landing: wide platform at back wall at half-height
// Upper flights: curved arcs from landing edges up to left/right balconies
const HALF_HEIGHT = GROUND_FLOOR_HEIGHT / 2; // 1.9

// Lower flight
const LOWER_WIDTH = 2.5;
const LOWER_STEPS = 8;
const LOWER_FRONT_Z = -2.0;
const LOWER_DEPTH = 3.0;
const LOWER_BACK_Z = LOWER_FRONT_Z - LOWER_DEPTH;
const LOWER_STEP_H = HALF_HEIGHT / LOWER_STEPS;
const LOWER_STEP_D = LOWER_DEPTH / LOWER_STEPS;

// Landing
const LANDING_Z_FRONT = LOWER_BACK_Z;
const LANDING_Z_BACK = -FLOOR_DEPTH / 2 + 0.2;
const LANDING_DEPTH = LANDING_Z_FRONT - LANDING_Z_BACK;
const LANDING_WIDTH = FLOOR_WIDTH - 1.0;

// Upper curved flights
const UPPER_STEPS = 8;
const UPPER_STEP_H = HALF_HEIGHT / UPPER_STEPS;

const SLOT_WIDTH = 0.10;
const SLOT_GAP = 0.005;
const SLOT_STEP = SLOT_WIDTH + SLOT_GAP;

export const LAYOUT = {
  floorWidth: FLOOR_WIDTH,
  floorDepth: FLOOR_DEPTH,
  groundHeight: GROUND_FLOOR_HEIGHT,
  upperHeight: UPPER_FLOOR_HEIGHT,
  totalHeight: TOTAL_HEIGHT,
  balconyWidth: BALCONY_WIDTH,
};

// Pre-compute upper flight step positions for both physics and rendering
function computeUpperSteps(side) {
  const steps = [];
  const balconyEdgeX = side * (FLOOR_WIDTH / 2 - BALCONY_WIDTH / 2);

  const startX = side * (LANDING_WIDTH / 2 - 1.0);
  const startZ = (LANDING_Z_FRONT + LANDING_Z_BACK) / 2;
  const endX = balconyEdgeX;
  const endZ = -3.0;

  for (let i = 0; i < UPPER_STEPS; i++) {
    const t = (i + 0.5) / UPPER_STEPS;
    const x = startX + (endX - startX) * t;
    // Gentle curve (sin scaled down so steps stay close together)
    const z = startZ + (endZ - startZ) * t + Math.sin(t * Math.PI) * 0.8 * side;
    const y = HALF_HEIGHT + UPPER_STEP_H * (i + 1);
    steps.push({ x, y, z, t });
  }
  return steps;
}

const leftUpperSteps = computeUpperSteps(-1);
const rightUpperSteps = computeUpperSteps(1);

export function createLibrary(scene) {
  createFloors(scene);
  createWalls(scene);
  createBalcony(scene);
  createStairs(scene);
  createTables(scene);
  const shelfData = createShelves(scene);
  createLighting(scene);
  createRailing(scene);

  return shelfData;
}

function createFloors(scene) {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.8 });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_DEPTH), floorMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.9 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_DEPTH), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = TOTAL_HEIGHT;
  scene.add(ceiling);

  const balcFloorMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.7 });
  const undersideMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });

  // Left/right balconies only extend from z=-3.0 to z=+7 (not the full depth)
  // so they don't cover the stair arrival zone at the back
  const BALC_Z_START = -3.0;
  const BALC_Z_LENGTH = FLOOR_DEPTH / 2 - BALC_Z_START; // 7 - (-3.0) = 10.0
  const BALC_Z_CENTER = (BALC_Z_START + FLOOR_DEPTH / 2) / 2; // 2.0

  const leftBalc = new THREE.Mesh(
    new THREE.BoxGeometry(BALCONY_WIDTH, 0.15, BALC_Z_LENGTH),
    balcFloorMat
  );
  leftBalc.position.set(-FLOOR_WIDTH / 2 + BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT, BALC_Z_CENTER);
  leftBalc.receiveShadow = true;
  scene.add(leftBalc);

  const rightBalc = new THREE.Mesh(
    new THREE.BoxGeometry(BALCONY_WIDTH, 0.15, BALC_Z_LENGTH),
    balcFloorMat
  );
  rightBalc.position.set(FLOOR_WIDTH / 2 - BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT, BALC_Z_CENTER);
  rightBalc.receiveShadow = true;
  scene.add(rightBalc);

  const frontBalcWidth = FLOOR_WIDTH - BALCONY_WIDTH * 2;
  const frontBalc = new THREE.Mesh(
    new THREE.BoxGeometry(frontBalcWidth, 0.15, BALCONY_WIDTH),
    balcFloorMat
  );
  frontBalc.position.set(0, GROUND_FLOOR_HEIGHT, FLOOR_DEPTH / 2 - BALCONY_WIDTH / 2);
  frontBalc.receiveShadow = true;
  scene.add(frontBalc);

  const leftUnder = new THREE.Mesh(new THREE.PlaneGeometry(BALCONY_WIDTH, BALC_Z_LENGTH), undersideMat);
  leftUnder.rotation.x = -Math.PI / 2;
  leftUnder.position.set(-FLOOR_WIDTH / 2 + BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT - 0.08, BALC_Z_CENTER);
  scene.add(leftUnder);

  const rightUnder = new THREE.Mesh(new THREE.PlaneGeometry(BALCONY_WIDTH, BALC_Z_LENGTH), undersideMat);
  rightUnder.rotation.x = -Math.PI / 2;
  rightUnder.position.set(FLOOR_WIDTH / 2 - BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT - 0.08, BALC_Z_CENTER);
  scene.add(rightUnder);

  const frontUnder = new THREE.Mesh(new THREE.PlaneGeometry(frontBalcWidth, BALCONY_WIDTH), undersideMat);
  frontUnder.rotation.x = -Math.PI / 2;
  frontUnder.position.set(0, GROUND_FLOOR_HEIGHT - 0.08, FLOOR_DEPTH / 2 - BALCONY_WIDTH / 2);
  scene.add(frontUnder);
}

function createWalls(scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.7 });

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_WIDTH, TOTAL_HEIGHT, 0.2), wallMat);
  backWall.position.set(0, TOTAL_HEIGHT / 2, -FLOOR_DEPTH / 2);
  scene.add(backWall);

  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(FLOOR_WIDTH, TOTAL_HEIGHT, 0.2), wallMat);
  frontWall.position.set(0, TOTAL_HEIGHT / 2, FLOOR_DEPTH / 2);
  scene.add(frontWall);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, TOTAL_HEIGHT, FLOOR_DEPTH), wallMat);
  leftWall.position.set(-FLOOR_WIDTH / 2, TOTAL_HEIGHT / 2, 0);
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, TOTAL_HEIGHT, FLOOR_DEPTH), wallMat);
  rightWall.position.set(FLOOR_WIDTH / 2, TOTAL_HEIGHT / 2, 0);
  scene.add(rightWall);
}

function createBalcony(scene) {
  const colMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.6 });
  const colPositions = [
    [-FLOOR_WIDTH / 2 + BALCONY_WIDTH, -2.5],
    [-FLOOR_WIDTH / 2 + BALCONY_WIDTH, 1],
    [-FLOOR_WIDTH / 2 + BALCONY_WIDTH, FLOOR_DEPTH / 2 - 1.5],
    [FLOOR_WIDTH / 2 - BALCONY_WIDTH, -2.5],
    [FLOOR_WIDTH / 2 - BALCONY_WIDTH, 1],
    [FLOOR_WIDTH / 2 - BALCONY_WIDTH, FLOOR_DEPTH / 2 - 1.5],
  ];
  colPositions.forEach(([x, z]) => {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, GROUND_FLOOR_HEIGHT, 8),
      colMat
    );
    col.position.set(x, GROUND_FLOOR_HEIGHT / 2, z);
    col.castShadow = true;
    scene.add(col);
  });
}

function createRailing(scene) {
  const railMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.5 });
  const railHeight = 0.9;
  const railY = GROUND_FLOOR_HEIGHT + railHeight / 2;

  // Left/right rails match shortened balcony: z from -3.0 to front balcony edge (4.8)
  const RAIL_Z_START = -3.0;
  const RAIL_Z_END = FLOOR_DEPTH / 2 - BALCONY_WIDTH; // 4.8
  const sideRailLength = RAIL_Z_END - RAIL_Z_START; // 7.8
  const sideRailCenter = (RAIL_Z_START + RAIL_Z_END) / 2; // 0.9

  const leftRailX = -FLOOR_WIDTH / 2 + BALCONY_WIDTH;
  const leftRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, railHeight, sideRailLength),
    railMat
  );
  leftRail.position.set(leftRailX, railY, sideRailCenter);
  scene.add(leftRail);

  const rightRailX = FLOOR_WIDTH / 2 - BALCONY_WIDTH;
  const rightRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, railHeight, sideRailLength),
    railMat
  );
  rightRail.position.set(rightRailX, railY, sideRailCenter);
  scene.add(rightRail);

  const frontRailZ = FLOOR_DEPTH / 2 - BALCONY_WIDTH;
  const frontRailWidth = FLOOR_WIDTH - BALCONY_WIDTH * 2;
  const frontRail = new THREE.Mesh(
    new THREE.BoxGeometry(frontRailWidth, railHeight, 0.06),
    railMat
  );
  frontRail.position.set(0, railY, frontRailZ);
  scene.add(frontRail);

  const topBarMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.4 });
  const topY = GROUND_FLOOR_HEIGHT + railHeight;

  const leftTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, sideRailLength), topBarMat);
  leftTop.position.set(leftRailX, topY, sideRailCenter);
  scene.add(leftTop);

  const rightTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, sideRailLength), topBarMat);
  rightTop.position.set(rightRailX, topY, sideRailCenter);
  scene.add(rightTop);

  const frontTop = new THREE.Mesh(new THREE.BoxGeometry(frontRailWidth, 0.05, 0.1), topBarMat);
  frontTop.position.set(0, topY, frontRailZ);
  scene.add(frontTop);
}

function createStairs(scene) {
  const stairMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, roughness: 0.5 });
  const landingMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.6 });
  const underMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });

  // === LOWER FLIGHT (center, going toward back wall) ===
  for (let i = 0; i < LOWER_STEPS; i++) {
    const stepTop = LOWER_STEP_H * (i + 1);
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(LOWER_WIDTH, stepTop, LOWER_STEP_D),
      stairMat
    );
    step.position.set(0, stepTop / 2, LOWER_FRONT_Z - LOWER_STEP_D * (i + 0.5));
    step.receiveShadow = true;
    step.castShadow = true;
    scene.add(step);
  }

  // Solid walls on either side of the lower flight to block going under
  for (const side of [-1, 1]) {
    const sideBlockWidth = (LANDING_WIDTH - LOWER_WIDTH) / 2;
    const sideBlock = new THREE.Mesh(
      new THREE.BoxGeometry(sideBlockWidth, HALF_HEIGHT, LOWER_DEPTH),
      underMat
    );
    sideBlock.position.set(
      side * (LOWER_WIDTH / 2 + sideBlockWidth / 2),
      HALF_HEIGHT / 2,
      LOWER_FRONT_Z - LOWER_DEPTH / 2
    );
    scene.add(sideBlock);
  }

  // === LANDING (wide platform at half-height against back wall) ===
  const landing = new THREE.Mesh(
    new THREE.BoxGeometry(LANDING_WIDTH, HALF_HEIGHT, LANDING_DEPTH),
    landingMat
  );
  landing.position.set(0, HALF_HEIGHT / 2, (LANDING_Z_FRONT + LANDING_Z_BACK) / 2);
  landing.receiveShadow = true;
  landing.castShadow = true;
  scene.add(landing);

  // === UPPER CURVED FLIGHTS (left and right) — steps only, no banisters ===
  const stepWidth = 1.8;
  const stepDepth = 0.5;

  for (const { steps: upperSteps, side } of [
    { steps: leftUpperSteps, side: -1 },
    { steps: rightUpperSteps, side: 1 },
  ]) {
    for (let i = 0; i < upperSteps.length; i++) {
      const s = upperSteps[i];
      const prevS = i > 0 ? upperSteps[i - 1] : { x: side * (LANDING_WIDTH / 2 - 1.0), z: (LANDING_Z_FRONT + LANDING_Z_BACK) / 2 };
      const angle = Math.atan2(s.z - prevS.z, s.x - prevS.x);

      const step = new THREE.Mesh(
        new THREE.BoxGeometry(stepDepth, s.y, stepWidth),
        stairMat
      );
      step.position.set(s.x, s.y / 2, s.z);
      step.rotation.y = -angle;
      step.receiveShadow = true;
      step.castShadow = true;
      scene.add(step);
    }
  }

  // Stair lighting
  const stairLight = new THREE.PointLight(0xfff0d0, 0.8, 8);
  stairLight.position.set(0, HALF_HEIGHT + 1.5, (LANDING_Z_FRONT + LANDING_Z_BACK) / 2);
  scene.add(stairLight);
}

function createTables(scene) {
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x8b6b42, roughness: 0.5 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.6 });

  const tablePositions = [
    { x: 0, z: 1 },
    { x: 0, z: 4 },
  ];

  tablePositions.forEach(pos => {
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.08, 1.0),
      tableMat
    );
    tableTop.position.set(pos.x, 0.75, pos.z);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    const legOffsets = [
      [-0.7, -0.35], [0.7, -0.35],
      [-0.7, 0.35], [0.7, 0.35],
    ];
    legOffsets.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.75, 0.06),
        legMat
      );
      leg.position.set(pos.x + lx, 0.375, pos.z + lz);
      leg.castShadow = true;
      scene.add(leg);
    });
  });
}

function createShelves(scene) {
  const shelfData = [];

  const groundCats = CATEGORIES.slice(0, 6);

  for (let i = 0; i < 2; i++) {
    const cat = groundCats[i];
    const z = -1 + i * 4;
    const x = -FLOOR_WIDTH / 2 + 0.5;
    const unit = createShelfUnit(scene, cat, x, z, -1, 0);
    shelfData.push(makeShelfEntry(cat, unit, x, z, -1));
  }

  for (let i = 0; i < 2; i++) {
    const cat = groundCats[2 + i];
    const z = -1 + i * 4;
    const x = FLOOR_WIDTH / 2 - 0.5;
    const unit = createShelfUnit(scene, cat, x, z, 1, 0);
    shelfData.push(makeShelfEntry(cat, unit, x, z, 1));
  }

  for (let i = 0; i < 2; i++) {
    const cat = groundCats[4 + i];
    const x = -2 + i * 4;
    const z = FLOOR_DEPTH / 2 - 0.5;
    const unit = createShelfUnit(scene, cat, x, z, 2, 0);
    shelfData.push(makeShelfEntry(cat, unit, x, z, 2));
  }

  const upperCats = CATEGORIES.slice(6, 12);
  const upperY = GROUND_FLOOR_HEIGHT;

  for (let i = 0; i < 2; i++) {
    const cat = upperCats[i];
    const z = -1 + i * 4;
    const x = -FLOOR_WIDTH / 2 + 0.5;
    const unit = createShelfUnit(scene, cat, x, z, -1, upperY);
    shelfData.push(makeShelfEntry(cat, unit, x, z, -1));
  }

  for (let i = 0; i < 2; i++) {
    const cat = upperCats[2 + i];
    const z = -1 + i * 4;
    const x = FLOOR_WIDTH / 2 - 0.5;
    const unit = createShelfUnit(scene, cat, x, z, 1, upperY);
    shelfData.push(makeShelfEntry(cat, unit, x, z, 1));
  }

  for (let i = 0; i < 2; i++) {
    const cat = upperCats[4 + i];
    const x = -2 + i * 4;
    const z = FLOOR_DEPTH / 2 - 0.5;
    const unit = createShelfUnit(scene, cat, x, z, 2, upperY);
    shelfData.push(makeShelfEntry(cat, unit, x, z, 2));
  }

  return shelfData;
}

function makeShelfEntry(cat, unit, x, z, side) {
  return {
    category: cat.id,
    categoryName: cat.name,
    section: cat.section,
    position: new THREE.Vector3(x, unit.baseY || 0, z),
    side,
    shelves: unit.shelves,
    mesh: unit.group,
    label: unit.label,
  };
}

function createShelfUnit(scene, category, x, z, side, baseY) {
  const group = new THREE.Group();
  group.position.set(x, baseY, z);

  if (side === -1) group.rotation.y = Math.PI / 2;
  else if (side === 1) group.rotation.y = -Math.PI / 2;
  else if (side === 2) group.rotation.y = Math.PI;
  else group.rotation.y = 0;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.6 });
  const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.8 });
  const panelThickness = 0.05;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(SHELF_UNIT_WIDTH, SHELF_UNIT_HEIGHT, panelThickness),
    darkWoodMat
  );
  back.position.set(0, SHELF_UNIT_HEIGHT / 2, -SHELF_UNIT_DEPTH / 2);
  back.receiveShadow = true;
  group.add(back);

  const leftSide = new THREE.Mesh(
    new THREE.BoxGeometry(panelThickness, SHELF_UNIT_HEIGHT, SHELF_UNIT_DEPTH),
    woodMat
  );
  leftSide.position.set(-SHELF_UNIT_WIDTH / 2, SHELF_UNIT_HEIGHT / 2, 0);
  leftSide.castShadow = true;
  group.add(leftSide);

  const rightSide = new THREE.Mesh(
    new THREE.BoxGeometry(panelThickness, SHELF_UNIT_HEIGHT, SHELF_UNIT_DEPTH),
    woodMat
  );
  rightSide.position.set(SHELF_UNIT_WIDTH / 2, SHELF_UNIT_HEIGHT / 2, 0);
  rightSide.castShadow = true;
  group.add(rightSide);

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(SHELF_UNIT_WIDTH, panelThickness, SHELF_UNIT_DEPTH),
    woodMat
  );
  top.position.set(0, SHELF_UNIT_HEIGHT, 0);
  group.add(top);

  const shelves = [];
  for (let i = 0; i < SHELVES_PER_UNIT; i++) {
    const series = category.series[i];
    const shelfY = 0.15 + i * (SHELF_UNIT_HEIGHT - 0.3) / SHELVES_PER_UNIT;
    const shelfMesh = new THREE.Mesh(
      new THREE.BoxGeometry(SHELF_UNIT_WIDTH - 0.08, 0.05, SHELF_UNIT_DEPTH - 0.04),
      woodMat
    );
    shelfMesh.position.set(0, shelfY, 0);
    group.add(shelfMesh);

    shelves.push({
      y: shelfY,
      series: series.name,
      seriesLabel: series.spineLabel,
      categoryId: category.id,
      slots: [],
      maxVolumes: 0,
      worldPos: new THREE.Vector3(x, baseY + shelfY, z),
    });
  }

  const label = createShelfCodeLabel(category.section);
  label.position.set(0, SHELF_UNIT_HEIGHT + 0.12, SHELF_UNIT_DEPTH / 2 + 0.02);
  group.add(label);

  scene.add(group);

  return { group, shelves, label, baseY };
}

export function buildSlotMarkers(shelfData, books) {
  const seriesVolumeCounts = {};
  for (const book of books) {
    const key = `${book.category}-${book.seriesLabel}`;
    seriesVolumeCounts[key] = Math.max(seriesVolumeCounts[key] || 0, book.volume);
  }

  for (const unit of shelfData) {
    for (const shelf of unit.shelves) {
      clearSlots(shelf, unit.mesh);

      const key = `${unit.category}-${shelf.seriesLabel}`;
      const volumeCount = seriesVolumeCounts[key] || 0;
      shelf.maxVolumes = volumeCount;
      shelf.slots = [];

      const usableWidth = SHELF_UNIT_WIDTH - 0.2;
      const step = Math.min(SLOT_STEP, usableWidth / Math.max(volumeCount, 1));
      const startX = -usableWidth / 2 + step / 2;

      for (let v = 0; v < volumeCount; v++) {
        const slotX = startX + v * step;
        const slotY = shelf.y + 0.18;
        const slotZ = 0;

        const markerGeo = new THREE.BoxGeometry(step * 0.85, 0.3, 0.12);
        const markerMat = new THREE.MeshStandardMaterial({
          color: 0x88aaff,
          transparent: true,
          opacity: 0.06,
          roughness: 0.5,
          emissive: 0x88aaff,
          emissiveIntensity: 0,
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.position.set(slotX, slotY, slotZ);
        marker.userData = {
          type: 'slot',
          volume: v + 1,
          shelf,
          unit,
          slotIndex: v,
        };
        unit.mesh.add(marker);

        shelf.slots.push({
          marker,
          bookMesh: null,
          volume: v + 1,
          occupied: false,
          bookData: null,
          localX: slotX,
          localY: slotY,
        });
      }

      addSeriesLabel(unit.mesh, shelf);
    }
  }
}

function clearSlots(shelf, unitGroup) {
  if (shelf.slots) {
    for (const slot of shelf.slots) {
      if (slot.marker) unitGroup.remove(slot.marker);
      if (slot.bookMesh) unitGroup.remove(slot.bookMesh);
    }
  }
  shelf.slots = [];
}

function addSeriesLabel(group, shelf) {
  if (shelf._label) {
    group.remove(shelf._label);
    shelf._label.geometry.dispose();
    shelf._label.material.map.dispose();
    shelf._label.material.dispose();
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '18px Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${shelf.seriesLabel} — ${shelf.series}`, 4, 16);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.18), mat);
  labelMesh.position.set(0, shelf.y + 0.48, SHELF_UNIT_DEPTH / 2 - 0.05);
  group.add(labelMesh);
  shelf._label = labelMesh;
}

function createShelfCodeLabel(code) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#c8a050';
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, 122, 58);

  ctx.fillStyle = '#f0e0c0';
  ctx.font = 'bold 38px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, 64, 34);

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), mat);
  return mesh;
}

function createLighting(scene) {
  const ambient = new THREE.AmbientLight(0x6a5070, 0.6);
  scene.add(ambient);

  const mainLight = new THREE.DirectionalLight(0xfff4e0, 0.6);
  mainLight.position.set(2, 6, 2);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  scene.add(mainLight);

  const gnd1 = new THREE.PointLight(0xfff0d0, 0.6, 10);
  gnd1.position.set(0, 3.2, 0);
  scene.add(gnd1);

  const gnd2 = new THREE.PointLight(0xfff0d0, 0.4, 8);
  gnd2.position.set(0, 3.2, 4);
  scene.add(gnd2);

  const gnd3 = new THREE.PointLight(0xfff0d0, 0.4, 8);
  gnd3.position.set(0, 3.2, -4);
  scene.add(gnd3);

  const up1 = new THREE.PointLight(0xfff0d0, 0.5, 8);
  up1.position.set(-FLOOR_WIDTH / 2 + BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT + 2.5, 0);
  scene.add(up1);

  const up2 = new THREE.PointLight(0xfff0d0, 0.5, 8);
  up2.position.set(FLOOR_WIDTH / 2 - BALCONY_WIDTH / 2, GROUND_FLOOR_HEIGHT + 2.5, 0);
  scene.add(up2);

  const up3 = new THREE.PointLight(0xfff0d0, 0.4, 8);
  up3.position.set(0, GROUND_FLOOR_HEIGHT + 2.5, -FLOOR_DEPTH / 2 + BALCONY_WIDTH / 2);
  scene.add(up3);
}

export function getFloorBounds() {
  return {
    minX: -FLOOR_WIDTH / 2 + 0.4,
    maxX: FLOOR_WIDTH / 2 - 0.4,
    minZ: -FLOOR_DEPTH / 2 + 0.4,
    maxZ: FLOOR_DEPTH / 2 - 0.4,
  };
}

export function getStairGeometry() {
  const colliders = [];

  // Lower flight steps
  for (let i = 0; i < LOWER_STEPS; i++) {
    const stepTop = LOWER_STEP_H * (i + 1);
    colliders.push({
      x: 0,
      y: stepTop / 2,
      z: LOWER_FRONT_Z - LOWER_STEP_D * (i + 0.5),
      w: LOWER_WIDTH,
      h: stepTop,
      d: LOWER_STEP_D,
    });
  }

  // Solid blocks on either side of lower flight (blocks going under)
  const sideBlockWidth = (LANDING_WIDTH - LOWER_WIDTH) / 2;
  for (const side of [-1, 1]) {
    colliders.push({
      x: side * (LOWER_WIDTH / 2 + sideBlockWidth / 2),
      y: HALF_HEIGHT / 2,
      z: LOWER_FRONT_Z - LOWER_DEPTH / 2,
      w: sideBlockWidth,
      h: HALF_HEIGHT,
      d: LOWER_DEPTH,
    });
  }

  // Landing
  colliders.push({
    x: 0,
    y: HALF_HEIGHT / 2,
    z: (LANDING_Z_FRONT + LANDING_Z_BACK) / 2,
    w: LANDING_WIDTH,
    h: HALF_HEIGHT,
    d: LANDING_DEPTH,
  });

  // Upper flight steps (simplified as box colliders at each position)
  for (const steps of [leftUpperSteps, rightUpperSteps]) {
    for (const s of steps) {
      colliders.push({
        x: s.x,
        y: s.y / 2,
        z: s.z,
        w: 1.8,
        h: s.y,
        d: 0.5,
      });
    }
  }

  return colliders;
}

export function clampToWalkable(x, z, feetY) {
  const hw = FLOOR_WIDTH / 2;
  const hd = FLOOR_DEPTH / 2;
  const balcTop = GROUND_FLOOR_HEIGHT;
  const R = 0.25;

  // Balcony railings (only where balcony exists: z > -3.0)
  const railLeftX = -hw + BALCONY_WIDTH;
  const railRightX = hw - BALCONY_WIDTH;
  const railFrontZ = hd - BALCONY_WIDTH;
  const RAIL_Z_MIN = -3.0;

  if (feetY >= balcTop - 0.3 && feetY < balcTop + 0.9) {
    if (z > RAIL_Z_MIN && Math.abs(x - railLeftX) < R) {
      x = (x < railLeftX) ? railLeftX - R : railLeftX + R;
    }
    if (z > RAIL_Z_MIN && Math.abs(x - railRightX) < R) {
      x = (x < railRightX) ? railRightX - R : railRightX + R;
    }
    if (x > railLeftX && x < railRightX && Math.abs(z - railFrontZ) < R) {
      z = (z < railFrontZ) ? railFrontZ - R : railFrontZ + R;
    }
  }

  // Lower flight side walls
  const wallThick = 0.25;
  if (z <= LOWER_FRONT_Z && z >= LOWER_BACK_Z && feetY < HALF_HEIGHT + 0.5) {
    const outerLeft = -LOWER_WIDTH / 2 - wallThick;
    const outerRight = LOWER_WIDTH / 2 + wallThick;
    if (Math.abs(x - outerLeft) < R) {
      x = (x < outerLeft) ? outerLeft - R : outerLeft + R;
    }
    if (Math.abs(x - outerRight) < R) {
      x = (x < outerRight) ? outerRight - R : outerRight + R;
    }
  }

  // Upper curved flight barriers — keep player on the steps
  if (feetY >= HALF_HEIGHT - 0.3 && feetY <= balcTop + 0.3) {
    for (const steps of [leftUpperSteps, rightUpperSteps]) {
      for (const s of steps) {
        const dz = Math.abs(z - s.z);
        if (dz < 0.6 && Math.abs(feetY - s.y) < 0.5) {
          const halfW = 1.0;
          const leftEdge = s.x - halfW;
          const rightEdge = s.x + halfW;
          if (Math.abs(x - leftEdge) < R) {
            x = (x < leftEdge) ? leftEdge - R : leftEdge + R;
          }
          if (Math.abs(x - rightEdge) < R) {
            x = (x < rightEdge) ? rightEdge - R : rightEdge + R;
          }
        }
      }
    }
  }

  return { x, z };
}

export function getFloorHeightAt(x, z, feetY) {
  const hw = FLOOR_WIDTH / 2;
  const hd = FLOOR_DEPTH / 2;
  const MAX_STEP_UP = 0.45;

  let bestY = 0;

  // === Lower flight (smooth ramp ascending in -z toward back wall) ===
  if (x > -LOWER_WIDTH / 2 && x < LOWER_WIDTH / 2 &&
      z <= LOWER_FRONT_Z && z >= LOWER_BACK_Z) {
    const t = (LOWER_FRONT_Z - z) / LOWER_DEPTH;
    const rampY = t * HALF_HEIGHT;

    if (rampY <= feetY + MAX_STEP_UP || feetY >= rampY) {
      bestY = Math.max(bestY, rampY);
    }
  }

  // === Landing ===
  if (x > -LANDING_WIDTH / 2 && x < LANDING_WIDTH / 2 &&
      z <= LANDING_Z_FRONT && z >= LANDING_Z_BACK) {
    if (HALF_HEIGHT <= feetY + MAX_STEP_UP || feetY >= HALF_HEIGHT) {
      bestY = Math.max(bestY, HALF_HEIGHT);
    }
  }

  // === Upper curved flights (single ramp corridor per flight) ===
  const flightDefs = [
    { startX: leftUpperSteps[0].x, startZ: leftUpperSteps[0].z,
      endX: leftUpperSteps[leftUpperSteps.length - 1].x, endZ: leftUpperSteps[leftUpperSteps.length - 1].z },
    { startX: rightUpperSteps[0].x, startZ: rightUpperSteps[0].z,
      endX: rightUpperSteps[rightUpperSteps.length - 1].x, endZ: rightUpperSteps[rightUpperSteps.length - 1].z },
  ];

  for (const f of flightDefs) {
    const dx = f.endX - f.startX;
    const dz = f.endZ - f.startZ;
    const lenSq = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - f.startX) * dx + (z - f.startZ) * dz) / lenSq));
    const projX = f.startX + dx * t;
    const projZ = f.startZ + dz * t;
    const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);

    if (dist < 1.5) {
      const rampY = HALF_HEIGHT + (GROUND_FLOOR_HEIGHT - HALF_HEIGHT) * t;
      if (rampY <= feetY + MAX_STEP_UP || feetY >= rampY) {
        bestY = Math.max(bestY, rampY);
      }
    }
  }

  // === Balcony surfaces (left, right, front) ===
  const balcTop = GROUND_FLOOR_HEIGHT;
  const BALC_Z_GUARD = -3.0;

  if (x < -hw + BALCONY_WIDTH && z > BALC_Z_GUARD) {
    if (balcTop <= feetY + MAX_STEP_UP || feetY >= balcTop) {
      bestY = Math.max(bestY, balcTop);
    }
  }
  if (x > hw - BALCONY_WIDTH && z > BALC_Z_GUARD) {
    if (balcTop <= feetY + MAX_STEP_UP || feetY >= balcTop) {
      bestY = Math.max(bestY, balcTop);
    }
  }
  if (z > hd - BALCONY_WIDTH) {
    if (balcTop <= feetY + MAX_STEP_UP || feetY >= balcTop) {
      bestY = Math.max(bestY, balcTop);
    }
  }

  return bestY;
}
