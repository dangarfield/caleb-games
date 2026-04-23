// arena3d.js - 3D arena geometry for the Archero-style game (Three.js)
// Builds floor, walls, obstacles, door, water tiles, spike tiles, and boundary.

import * as THREE from 'three';
import { gameToWorld, worldScale, getScene } from './renderer3d.js';
import { game } from './state.js';
import { arena, T } from './arena.js';
import { CHAPTER_THEMES } from './chapters.js';

// ─── Module state ───

let arenaGroup = null;     // THREE.Group holding all arena meshes
let waterMeshes = [];      // animated water planes
let doorLeftPivot = null;  // left door pivot group (rotates to swing open)
let doorRightPivot = null; // right door pivot group
let doorWallMeshes = [];   // wall segments that form the door frame
let waterTime = 0;         // accumulated time for water animation
let doorSwingAngle = 0;    // current swing angle (0 = closed, target = PI/2)
let doorOpening = false;   // whether door is currently swinging open

// ─── Helpers ───

function getTheme() {
  const ch = game.chapter ?? 1;
  return CHAPTER_THEMES[ch] || CHAPTER_THEMES[1];
}

/** Create a canvas-based grid texture for the floor */
function createFloorTexture(theme, cols, rows) {
  const cellPx = 128; // pixels per cell in texture (high-res for visible grid)
  const w = cols * cellPx;
  const h = rows * cellPx;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Base fill
  ctx.fillStyle = theme.floor || '#1a3d1a';
  ctx.fillRect(0, 0, w, h);

  // Checkerboard accent
  if (theme.floorAccent) {
    ctx.fillStyle = theme.floorAccent;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2 === 0) continue;
        ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
      }
    }
  }

  // Grid lines
  ctx.strokeStyle = theme.floorGrid || 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 4;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellPx, 0);
    ctx.lineTo(c * cellPx, h);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellPx);
    ctx.lineTo(w, r * cellPx);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

/** Convert an obstacle rect {x, y, w, h} (top-left game coords) to 3D center + size */
function obstacleTransform(ob) {
  const center = gameToWorld(ob.x + ob.w / 2, ob.y + ob.h / 2);
  const sx = worldScale(ob.w);
  const sz = worldScale(ob.h);
  return { center, sx, sz };
}

// ─── Build functions ───

function buildFloor(theme) {
  const a = arena();
  const grid = game.mapGrid || { w: 11, h: 15 };
  const cols = grid.w;
  const rows = grid.h;
  const doorWallThickness = 1.0; // must match buildDoor

  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);

  const tex = createFloorTexture(theme, cols, rows);
  const center = gameToWorld(a.x + a.w / 2, a.y + a.h / 2);

  // Arena top edge in world Z (where steps begin)
  const arenaTopZ = center.z - floorH / 2;

  // Arena floor — individual cell tiles, skipping water cells
  const cellW = worldScale(a.cellSize || (a.w / cols));
  const cellH = worldScale(a.cellSize || (a.h / rows));
  const waterSet = new Set();
  for (const wt of (game.waterTiles || [])) {
    // Key by grid col,row
    const col = Math.round((wt.x - a.x) / (a.w / cols));
    const row = Math.round((wt.y - a.y) / (a.h / rows));
    waterSet.add(`${col},${row}`);
  }

  // Build a single merged geometry from all non-water cells
  const positions = [];
  const uvs = [];
  const indices = [];
  let vertIdx = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (waterSet.has(`${c},${r}`)) continue;
      const gx = a.x + (c + 0.5) * (a.w / cols);
      const gy = a.y + (r + 0.5) * (a.h / rows);
      const pos = gameToWorld(gx, gy);
      const hw = cellW / 2;
      const hh = cellH / 2;
      // 4 verts for this cell (in XZ plane, Y=0)
      positions.push(
        pos.x - hw, 0, pos.z - hh,
        pos.x + hw, 0, pos.z - hh,
        pos.x + hw, 0, pos.z + hh,
        pos.x - hw, 0, pos.z + hh
      );
      // UVs mapped to cell position in the full grid texture
      const u0 = c / cols, u1 = (c + 1) / cols;
      const v0 = 1 - (r + 1) / rows, v1 = 1 - r / rows;
      uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
      // Two triangles
      indices.push(vertIdx, vertIdx + 1, vertIdx + 2, vertIdx, vertIdx + 2, vertIdx + 3);
      vertIdx += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff, // white so texture colors show through unmodified
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  arenaGroup.add(mesh);

  // Corridor floor — a solid box so there's no coplanar face with the ground plane
  // Top face at Y=0.99 (just below ground plane at Y=1.01), sits inside the cutout
  const platformY = 1.0; // must match buildDoor
  const doorCells = 3;
  const doorFullW = worldScale(a.cellSize * doorCells);
  const doorSouthFaceZ = arenaTopZ - 2.0; // south face of wall, must match buildDoor
  const exitDepth = 2.5;
  const corridorBoxH = 0.2; // thin box
  const corridorStartZ = doorSouthFaceZ - doorWallThickness; // north face of door wall
  const corridorGeo = new THREE.BoxGeometry(doorFullW, corridorBoxH, exitDepth);
  const corridorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.floor || '#1a3d1a').multiplyScalar(0.8),
    roughness: 0.85,
    metalness: 0.05,
  });
  const corridorMesh = new THREE.Mesh(corridorGeo, corridorMat);
  corridorMesh.position.set(center.x, platformY - corridorBoxH / 2, corridorStartZ - exitDepth / 2);
  corridorMesh.receiveShadow = true;
  arenaGroup.add(corridorMesh);
}

function buildBoundary(theme) {
  const a = arena();
  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);
  const wallHeight = 1.0; // 1T high
  const wallThickness = 1.0; // 1T thick
  const doorCells = 3;
  const doorFullW = worldScale(a.cellSize * doorCells);
  const doorHalfW = doorFullW / 2;
  const exitExtend = 2.5; // corridor beyond door wall (must match buildFloor exitDepth)
  const center = gameToWorld(a.x + a.w / 2, a.y + a.h / 2);
  const topEdgeZ = center.z - floorH / 2; // arena top edge

  const color = new THREE.Color(theme.boundary || '#0d1f0d');
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.1,
  });

  // Four boundary walls: left, right, bottom, and top (with gap for door)
  const walls = [
    // Left wall
    { w: wallThickness, h: wallHeight, d: floorH,
      x: center.x - floorW / 2 - wallThickness / 2, z: center.z },
    // Right wall
    { w: wallThickness, h: wallHeight, d: floorH,
      x: center.x + floorW / 2 + wallThickness / 2, z: center.z },
    // Bottom wall
    { w: floorW + wallThickness * 2, h: wallHeight, d: wallThickness,
      x: center.x, z: center.z + floorH / 2 + wallThickness / 2 },
  ];

  // Top wall segments (with door gap)
  const leftSegW = (floorW / 2 - doorHalfW) + wallThickness;
  const rightSegW = leftSegW;
  const topWallZ = topEdgeZ - wallThickness / 2;
  walls.push({
    w: leftSegW, h: wallHeight, d: wallThickness,
    x: center.x - doorHalfW - leftSegW / 2, z: topWallZ
  });
  walls.push({
    w: rightSegW, h: wallHeight, d: wallThickness,
    x: center.x + doorHalfW + rightSegW / 2, z: topWallZ
  });

  for (const w of walls) {
    const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w.x, w.h / 2, w.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    arenaGroup.add(mesh);
  }

  // Ground plane at 1T high with cutout for playable area + step zone + corridor
  const gs = 50;
  const hw = floorW / 2;
  const hh = floorH / 2;
  const doorWallThickness = 1.0; // must match buildDoor
  const stairGap = 2.0; // 2T between arena edge and door wall
  const shape = new THREE.Shape();
  shape.moveTo(-gs, -gs);
  shape.lineTo(gs, -gs);
  shape.lineTo(gs, gs);
  shape.lineTo(-gs, gs);
  shape.lineTo(-gs, -gs);
  // Hole: arena rectangle + step zone (door-width) + wall + corridor beyond
  // Shape XY → world XZ after -PI/2 rotation. Y+ in shape → Z- in world (toward door/north)
  // hh = arena top edge, hh + stairGap = door wall south face, + doorWallThickness = north face, + exitExtend = corridor end
  const hole = new THREE.Path();
  hole.moveTo(-hw, -hh);                                              // bottom-left
  hole.lineTo(hw, -hh);                                               // bottom-right
  hole.lineTo(hw, hh);                                                // top-right (arena edge)
  hole.lineTo(doorHalfW, hh);                                         // narrow to step zone right
  hole.lineTo(doorHalfW, hh + stairGap + doorWallThickness + exitExtend);  // corridor top-right
  hole.lineTo(-doorHalfW, hh + stairGap + doorWallThickness + exitExtend); // corridor top-left
  hole.lineTo(-doorHalfW, hh);                                        // narrow to step zone left
  hole.lineTo(-hw, hh);                                               // top-left (arena edge)
  hole.lineTo(-hw, -hh);                                              // back to start
  shape.holes.push(hole);

  const groundGeo = new THREE.ShapeGeometry(shape);
  const groundMesh = new THREE.Mesh(groundGeo, mat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(center.x, wallHeight + 0.01, center.z);
  groundMesh.receiveShadow = true;
  arenaGroup.add(groundMesh);
}

function buildObstacles(theme) {
  const wallColor = new THREE.Color(theme.wall || '#5a5a5a');
  const mat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.6,
    metalness: 0.15,
  });

  const wallHeight = 1.0; // 1T high

  for (const ob of game.obstacles) {
    if (ob._isDoor || ob._isDoorWall) continue; // handle door separately

    const { center, sx, sz } = obstacleTransform(ob);
    const geo = new THREE.BoxGeometry(sx, wallHeight, sz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center.x, wallHeight / 2, center.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    arenaGroup.add(mesh);
  }
}

function buildDoor(theme) {
  const doorColor = new THREE.Color(theme.door || '#5a3a1e');
  const doorPanelColor = new THREE.Color(theme.door || '#5a3a1e').multiplyScalar(0.75);
  const wallHeight = 5.0; // 5T high wall above its base
  const doorHeight = 4.0; // 4T high doors
  const platformY = 1.0; // door sits at boundary height
  const a = arena();
  const grid = game.mapGrid || { w: 11, h: 15 };
  const floorW = worldScale(a.w);
  const doorCells = 3;
  const doorFullW = worldScale(a.cellSize * doorCells);
  const doorHalfW = doorFullW / 2;
  const wallThickness = 1.0;
  const doorThickness = 0.15;

  // Position: south face of wall is 2T north of arena top edge
  const arenaTopZ = gameToWorld(a.x + a.w / 2, a.y).z;
  const doorSouthFaceZ = arenaTopZ - 2.0; // south face = end of step/flat zones
  const wallCenterX = gameToWorld(a.x + a.w / 2, a.y).x;

  doorWallMeshes = [];
  doorSwingAngle = 0;
  doorOpening = false;

  // ─── 5 zones over 2T: ground, step1, step2, boundary, boundary ───
  const totalGap = 2.0;
  const zoneCount = 5;
  const zoneDepth = totalGap / zoneCount; // 0.4T per zone
  // Zone 0: ground level (Y=0) — no geometry needed, arena floor covers it
  // Zone 1: step 1 (Y=0.5)
  // Zone 2: step 2 (Y=1.0)
  // Zone 3: boundary height (Y=1.0)
  // Zone 4: boundary height (Y=1.0)
  const stepCount = 2;
  const stepRise = platformY / stepCount; // 0.5 per step
  const stepMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(theme.boundary || '#0d1f0d').multiplyScalar(1.2),
    roughness: 0.7,
    metalness: 0.15,
  });

  // Steps (zones 1 and 2)
  for (let i = 0; i < stepCount; i++) {
    const zoneIdx = i + 1; // zone 1 and 2
    const stepTopY = stepRise * (i + 1);
    const stepZ = arenaTopZ - zoneDepth * zoneIdx - zoneDepth / 2;
    // Riser
    const riserH = stepRise;
    const riserY = stepTopY - riserH / 2;
    const riserGeo = new THREE.BoxGeometry(doorFullW, riserH, 0.02);
    const riserMesh = new THREE.Mesh(riserGeo, stepMat);
    riserMesh.position.set(wallCenterX, riserY, arenaTopZ - zoneDepth * zoneIdx);
    arenaGroup.add(riserMesh);
    // Tread
    const treadH = 0.05;
    const treadGeo = new THREE.BoxGeometry(doorFullW, treadH, zoneDepth);
    const treadMesh = new THREE.Mesh(treadGeo, stepMat);
    treadMesh.position.set(wallCenterX, stepTopY - treadH / 2 - 0.02, stepZ);
    treadMesh.receiveShadow = true;
    arenaGroup.add(treadMesh);
  }

  // Flat boundary zones (zones 3 and 4, both at platformY)
  for (let i = 3; i < zoneCount; i++) {
    const flatZ = arenaTopZ - zoneDepth * i - zoneDepth / 2;
    const flatGeo = new THREE.BoxGeometry(doorFullW, 0.05, zoneDepth);
    const flatMesh = new THREE.Mesh(flatGeo, stepMat);
    flatMesh.position.set(wallCenterX, platformY - 0.05 / 2 - 0.02, flatZ);
    flatMesh.receiveShadow = true;
    arenaGroup.add(flatMesh);
  }

  // ─── Wall with doorway cutout (raised to platformY) ───
  const wallShape = new THREE.Shape();
  const hw = floorW / 2; // full arena width
  wallShape.moveTo(-hw, 0);
  wallShape.lineTo(hw, 0);
  wallShape.lineTo(hw, wallHeight);
  wallShape.lineTo(-hw, wallHeight);
  wallShape.lineTo(-hw, 0);

  const doorHole = new THREE.Path();
  doorHole.moveTo(-doorHalfW, 0);
  doorHole.lineTo(-doorHalfW, doorHeight);
  doorHole.lineTo(doorHalfW, doorHeight);
  doorHole.lineTo(doorHalfW, 0);
  doorHole.lineTo(-doorHalfW, 0);
  wallShape.holes.push(doorHole);

  const wallMat = new THREE.MeshStandardMaterial({
    color: doorColor,
    roughness: 0.5,
    metalness: 0.2,
  });

  const extrudeSettings = { depth: wallThickness, bevelEnabled: false };
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(wallCenterX, platformY, doorSouthFaceZ - wallThickness);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  arenaGroup.add(wallMesh);
  doorWallMeshes.push(wallMesh);

  // ─── Two swinging doors (raised to platformY) ───
  const singleDoorW = doorHalfW;

  function createDoorPanel(width, height, thickness) {
    const g = new THREE.Group();
    const panelGeo = new THREE.BoxGeometry(width, height, thickness);
    const panelMat = new THREE.MeshStandardMaterial({
      color: doorPanelColor,
      roughness: 0.45,
      metalness: 0.25,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(width / 2, height / 2, 0);
    panel.castShadow = true;
    panel.receiveShadow = true;
    g.add(panel);

    // Decorative raised inner panels
    const insetW = width * 0.65;
    const insetH = height * 0.4;
    const insetGeo = new THREE.BoxGeometry(insetW, insetH, thickness + 0.03);
    const insetMat = new THREE.MeshStandardMaterial({
      color: doorColor.clone().multiplyScalar(0.6),
      roughness: 0.5,
      metalness: 0.3,
    });
    const insetUpper = new THREE.Mesh(insetGeo, insetMat);
    insetUpper.position.set(width / 2, height * 0.7, 0);
    g.add(insetUpper);
    const insetLower = new THREE.Mesh(insetGeo, insetMat);
    insetLower.position.set(width / 2, height * 0.3, 0);
    g.add(insetLower);

    const handleGeo = new THREE.SphereGeometry(0.06, 8, 8);
    const handleMat = new THREE.MeshStandardMaterial({
      color: '#c9a84c',
      roughness: 0.3,
      metalness: 0.7,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(width * 0.85, height * 0.45, thickness / 2 + 0.04);
    g.add(handle);

    return g;
  }

  // Left door
  doorLeftPivot = new THREE.Group();
  const leftDoor = createDoorPanel(singleDoorW, doorHeight, doorThickness);
  doorLeftPivot.add(leftDoor);
  doorLeftPivot.position.set(wallCenterX - doorHalfW, platformY, doorSouthFaceZ);
  arenaGroup.add(doorLeftPivot);

  // Right door
  doorRightPivot = new THREE.Group();
  const rightDoor = createDoorPanel(singleDoorW, doorHeight, doorThickness);
  rightDoor.scale.x = -1;
  doorRightPivot.add(rightDoor);
  doorRightPivot.position.set(wallCenterX + doorHalfW, platformY, doorSouthFaceZ);
  arenaGroup.add(doorRightPivot);

  // Apply initial door state
  if (game.doorOpen) {
    setDoorOpen(true);
  }
}

function buildWaterTiles(theme) {
  waterMeshes = [];

  const waterColor = new THREE.Color('#2288cc');
  const mat = new THREE.MeshStandardMaterial({
    color: waterColor,
    transparent: true,
    opacity: 0.45,
    roughness: 0.2,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  for (const tile of (game.waterTiles || [])) {
    const { center, sx, sz } = obstacleTransform(tile);
    const geo = new THREE.PlaneGeometry(sx, sz);
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, 0.01, center.z);
    mesh.receiveShadow = true;
    arenaGroup.add(mesh);
    waterMeshes.push(mesh);
  }
}

function buildSpikeTiles(theme) {
  const spikeColor = new THREE.Color('#8b1a1a');
  const mat = new THREE.MeshStandardMaterial({
    color: spikeColor,
    roughness: 0.4,
    metalness: 0.6,
  });

  for (const tile of (game.spikeTiles || [])) {
    const { center, sx, sz } = obstacleTransform(tile);
    // Place a grid of small cone spikes within the tile area
    const spikeRadius = 0.06;
    const spikeHeight = 0.25;
    const spacing = 0.18;
    const coneGeo = new THREE.ConeGeometry(spikeRadius, spikeHeight, 4);

    const countX = Math.max(1, Math.floor(sx / spacing));
    const countZ = Math.max(1, Math.floor(sz / spacing));
    const startX = center.x - (countX - 1) * spacing / 2;
    const startZ = center.z - (countZ - 1) * spacing / 2;

    for (let ix = 0; ix < countX; ix++) {
      for (let iz = 0; iz < countZ; iz++) {
        const spike = new THREE.Mesh(coneGeo, mat);
        spike.position.set(
          startX + ix * spacing,
          spikeHeight / 2,
          startZ + iz * spacing
        );
        spike.castShadow = true;
        arenaGroup.add(spike);
      }
    }
  }
}

// ─── Exported API ───

/**
 * Create/rebuild all arena geometry. Called on each new stage.
 */
export function buildArena() {
  clearArena();

  const theme = getTheme();
  arenaGroup = new THREE.Group();
  arenaGroup.name = 'arenaGroup';

  buildFloor(theme);
  buildBoundary(theme);
  buildObstacles(theme);
  buildDoor(theme);
  buildWaterTiles(theme);
  buildSpikeTiles(theme);

  waterTime = 0;

  getScene().add(arenaGroup);
}

/**
 * Animate water, door glow, etc. Called each frame.
 * @param {number} dt - delta time in seconds
 */
export function updateArena(dt) {
  if (!arenaGroup) return;

  // ─── Water animation (opacity + color pulse) ───
  waterTime += dt;
  for (const mesh of waterMeshes) {
    const mat = mesh.material;
    mat.opacity = 0.4 + 0.1 * Math.sin(waterTime * 2.0);
    // Gentle Y bob
    mesh.position.y = 0.01 + 0.015 * Math.sin(waterTime * 1.5);
  }

  // ─── Door swing animation ───
  if (doorOpening && doorSwingAngle < Math.PI / 2) {
    doorSwingAngle += dt * 2.5; // swing speed
    if (doorSwingAngle >= Math.PI / 2) doorSwingAngle = Math.PI / 2;
    // Left door swings inward (negative Z) = positive Y rotation
    if (doorLeftPivot) doorLeftPivot.rotation.y = doorSwingAngle;
    // Right door swings inward = negative Y rotation
    if (doorRightPivot) doorRightPivot.rotation.y = -doorSwingAngle;
  }
}

/**
 * Remove all arena meshes from scene (before rebuilding).
 */
export function clearArena() {
  if (arenaGroup) {
    // Dispose geometries and materials
    arenaGroup.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
    getScene().remove(arenaGroup);
    arenaGroup = null;
  }

  waterMeshes = [];
  doorLeftPivot = null;
  doorRightPivot = null;
  doorWallMeshes = [];
  waterTime = 0;
  doorSwingAngle = 0;
  doorOpening = false;
}

/**
 * Show/hide door, show portal glow.
 * @param {boolean} open - true to open the door (hide barrier, show portal)
 */
export function setDoorOpen(open) {
  if (open) {
    doorOpening = true;
  }
}
