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
let godRayGroup = null;    // group for god-ray light shafts behind door
let godRayTime = 0;        // animation time for god rays
let confettiPieces = [];   // active confetti particles
let fireworkBursts = [];   // active firework bursts

// ─── Stylized rock/terrain colors (inspired by thaslle/stylized-water) ───
const ROCK_COLORS = {
  rockBase: '#b2baa0',   // gray-green stone
  mossColor: '#8aa72d',  // bright moss green (lower parts)
  grassColor: '#85a02b', // grass for ground plane
  groundDark: '#5a7a30', // darker grass variation
};

// Per-chapter floor & ground colors: [groundPlane, floorBase (10% darker), floorAccent (20% darker)]
const CHAPTER_FLOOR_COLORS = [
  // Ch0 - Tutorial (same as Ch1)
  { ground: '#85a02b', floor: '#748f25', accent: '#667d20' },
  // Ch1 - Verdant Prairie
  { ground: '#85a02b', floor: '#748f25', accent: '#667d20' },
  // Ch2 - Storm Desert (sand)
  { ground: '#a8925a', floor: '#96834f', accent: '#847445' },
  // Ch3 - Abandoned Dungeon (grey-blue)
  { ground: '#7a8899', floor: '#6b7a8a', accent: '#5d6c7b' },
  // Ch4 - Crystal Mines (dark grey)
  { ground: '#5a5e66', floor: '#4e525a', accent: '#43474e' },
  // Ch5 - Lost Castle (rock/stone)
  { ground: '#a09a88', floor: '#8d877a', accent: '#7b766b' },
  // Ch6 - Cave of Bones (light red)
  { ground: '#c49a8a', floor: '#ad887a', accent: '#99776b' },
  // Ch7 - Barrens of Shadow (light purple)
  { ground: '#9988aa', floor: '#877899', accent: '#766888' },
  // Ch8 - Silent Expanse (corn field)
  { ground: '#c4b060', floor: '#ad9c55', accent: '#99894a' },
  // Ch9 - Frozen Pinnacle (icy blue)
  { ground: '#5a8aa0', floor: '#4f7a8d', accent: '#456b7b' },
  // Ch10 - Land of Doom (red)
  { ground: '#c07070', floor: '#aa6363', accent: '#955757' },
];


// ─── Rock-style geometry & materials ───

/** Simple seeded hash for deterministic displacement */
function hashVec3(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 1274126177;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h & 0x7fffffff) / 0x7fffffff; // 0..1
}

/**
 * Displace vertices slightly to look rock-like.
 * Displacement is purely position-based (not normal-based) so that vertices at
 * the same position on different faces get identical offsets — no seam gaps.
 */
function rockifyGeometry(geo, strength = 0.06, displaceMask = null) {
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    // Skip vertices marked as non-displaceable
    if (displaceMask && !displaceMask[i]) continue;

    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    // Three independent hashes for X/Y/Z displacement
    const key = Math.round(px * 100) * 73856093 ^ Math.round(py * 100) * 19349663 ^ Math.round(pz * 100) * 83492791;
    const dx = (hashVec3(key, 1, 0) - 0.5) * 2 * strength;
    const dy = (hashVec3(0, key, 2) - 0.5) * 2 * strength * 0.5;
    const dz = (hashVec3(3, 0, key) - 0.5) * 2 * strength;

    pos.setXYZ(i, px + dx, py + dy, pz + dz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * Apply height-based vertex colors to a geometry:
 * - Rock gray-green at top
 * - Moss green at bottom
 * Vertices may already be in world space (Y from 0 to wallHeight).
 */
function applyRockVertexColors(geo, meshPos, wallHeight) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const colors = new Float32Array(count * 3);

  const rockBase = new THREE.Color(ROCK_COLORS.rockBase);
  const mossColor = new THREE.Color(ROCK_COLORS.mossColor);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const worldY = pos.getY(i) + meshPos.y;
    // Normalize to 0..1 (bottom=0 to top=wallHeight)
    const t = Math.min(1, Math.max(0, worldY / wallHeight));

    // Blend: moss at bottom (t=0) → rock at top (t=1)
    const mossFactor = 1.0 - Math.min(1, Math.max(0, (t - 0.1) / 0.5));
    tmpColor.copy(rockBase).lerp(mossColor, mossFactor * 0.7);

    // Add slight per-vertex variation
    const wx = pos.getX(i) + meshPos.x;
    const wz = pos.getZ(i) + meshPos.z;
    const noise = (hashVec3(
      Math.round(wx * 50),
      Math.round(worldY * 50),
      Math.round(wz * 50)
    ) - 0.5) * 0.08;
    tmpColor.r = Math.max(0, Math.min(1, tmpColor.r + noise));
    tmpColor.g = Math.max(0, Math.min(1, tmpColor.g + noise));
    tmpColor.b = Math.max(0, Math.min(1, tmpColor.b + noise));

    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/** Create a rock-styled material with vertex colors */
function createRockMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
  });
}

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

  // Base fill — per-chapter colors (10% and 20% darker than ground plane)
  const ch = game.chapter ?? 1;
  const chColors = CHAPTER_FLOOR_COLORS[ch] || CHAPTER_FLOOR_COLORS[1];
  const floorColor = chColors.floor;
  const accentColor = chColors.accent;
  ctx.fillStyle = floorColor;
  ctx.fillRect(0, 0, w, h);

  // Checkerboard accent
  ctx.fillStyle = accentColor;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) continue;
      ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
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
  tex.colorSpace = THREE.SRGBColorSpace; // ensure colors aren't darkened by linear conversion
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

  // Door gap columns for the extra row
  const doorCellStart = Math.floor((cols - 3) / 2);
  const doorCellEnd = doorCellStart + 3;

  for (let r = -1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Row -1: only emit cells within the door gap width
      if (r < 0 && (c < doorCellStart || c >= doorCellEnd)) continue;
      if (r >= 0 && waterSet.has(`${c},${r}`)) continue;
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
      // For the extra row (r=-1), use row 1 UV so checkerboard alternates correctly with row 0
      const u0 = c / cols, u1 = (c + 1) / cols;
      const rv = r < 0 ? 1 : r;
      const v0 = 1 - (rv + 1) / rows, v1 = 1 - rv / rows;
      uvs.push(u0, v1, u1, v1, u1, v0, u0, v0);
      // Two triangles (CW from above → normals point UP toward camera)
      indices.push(vertIdx, vertIdx + 2, vertIdx + 1, vertIdx, vertIdx + 3, vertIdx + 2);
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
  const ch = game.chapter ?? 1;
  const chFloorColors = CHAPTER_FLOOR_COLORS[ch] || CHAPTER_FLOOR_COLORS[1];
  const corridorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(chFloorColors.ground),
    roughness: 0.85,
    metalness: 0.05,
  });
  const corridorMesh = new THREE.Mesh(corridorGeo, corridorMat);
  corridorMesh.position.set(center.x, platformY - corridorBoxH / 2, corridorStartZ - exitDepth / 2);
  corridorMesh.receiveShadow = true;
  arenaGroup.add(corridorMesh);
}

function buildWalls(theme) {
  const a = arena();
  const grid = game.mapGrid || { w: 11, h: 15 };
  const cols = grid.w;
  const rows = grid.h;
  const cellW = worldScale(a.cellSize || (a.w / cols));
  const cellH = worldScale(a.cellSize || (a.h / rows));
  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);
  const wallHeight = 1.0;
  const doorCells = 3;
  const doorFullW = worldScale(a.cellSize * doorCells);
  const doorHalfW = doorFullW / 2;
  const exitExtend = 2.5;
  const center = gameToWorld(a.x + a.w / 2, a.y + a.h / 2);
  const topEdgeZ = center.z - floorH / 2;

  // ─── Build a grid marking wall cells ───
  // Grid includes a 1-cell boundary ring: col -1..cols, row -1..rows
  // We use offset so boundary cells are at the edges
  const PAD = 1; // boundary thickness in cells
  const gw = cols + PAD * 2;
  const gh = rows + PAD * 2;
  const wallGrid = new Uint8Array(gw * gh); // 0=empty, 1=boundary wall, 2=obstacle wall

  function gridIdx(c, r) { return (r + PAD) * gw + (c + PAD); }
  function isWall(c, r) {
    const i = (r + PAD) * gw + (c + PAD);
    if (i < 0 || i >= wallGrid.length) return true; // out-of-bounds = solid (no outer faces)
    return wallGrid[i] > 0;
  }

  // Mark boundary cells (ring around the arena)
  for (let c = -PAD; c < cols + PAD; c++) {
    for (let r = -PAD; r < rows + PAD; r++) {
      if (c < 0 || c >= cols || r < 0 || r >= rows) {
        wallGrid[gridIdx(c, r)] = 1; // boundary
      }
    }
  }

  // Remove boundary at door gap (top edge, centered)
  const doorStart = Math.floor((cols - doorCells) / 2);
  for (let c = doorStart; c < doorStart + doorCells; c++) {
    for (let r = -PAD; r < 0; r++) {
      wallGrid[gridIdx(c, r)] = 0;
    }
  }

  // Mark obstacle cells
  for (const ob of game.obstacles) {
    if (ob._isDoor || ob._isDoorWall) continue;
    const col = Math.round((ob.x - a.x) / (a.w / cols));
    const row = Math.round((ob.y - a.y) / (a.h / rows));
    const cw = Math.round(ob.w / (a.w / cols));
    const ch = Math.round(ob.h / (a.h / rows));
    for (let dc = 0; dc < cw; dc++) {
      for (let dr = 0; dr < ch; dr++) {
        const c = col + dc;
        const r = row + dr;
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          wallGrid[gridIdx(c, r)] = 2; // obstacle
        }
      }
    }
  }

  // ─── Generate faces from grid ───
  // For each wall cell, emit: top face always, side faces only where neighbor is empty
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const displaceable = []; // 1 = can be displaced (obstacle), 0 = fixed (boundary)
  let vi = 0; // vertex index counter

  function cellWorldPos(c, r) {
    // Center of cell (c,r) in world XZ
    const gx = a.x + (c + 0.5) * (a.w / cols);
    const gy = a.y + (r + 0.5) * (a.h / rows);
    return gameToWorld(gx, gy);
  }

  const SIDE_SUBDIVS = 3; // vertical subdivisions for side faces

  function addQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, canDisplace) {
    positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    displaceable.push(canDisplace, canDisplace, canDisplace, canDisplace);
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }

  // Subdivided vertical quad: v0=top-left, v1=bottom-left, v2=bottom-right, v3=top-right
  function addSideQuad(x0, y0, z0, x1, y1, z1, x2, y2, z2, x3, y3, z3, nx, ny, nz, canDisplace) {
    const segs = SIDE_SUBDIVS;
    for (let row = 0; row <= segs; row++) {
      const t = row / segs;
      const lx = x0 + (x1 - x0) * t;
      const ly = y0 + (y1 - y0) * t;
      const lz = z0 + (z1 - z0) * t;
      const rx = x3 + (x2 - x3) * t;
      const ry = y3 + (y2 - y3) * t;
      const rz = z3 + (z2 - z3) * t;
      positions.push(lx, ly, lz, rx, ry, rz);
      normals.push(nx, ny, nz, nx, ny, nz);
      uvs.push(0, t, 1, t);
      // Lock top/bottom rows (flush with floor/ground plane), only displace mid rows
      const atEdge = (row === 0 || row === segs) ? 1 : 0;
      const d = canDisplace && !atEdge ? 1 : 0;
      displaceable.push(d, d);
    }
    for (let row = 0; row < segs; row++) {
      const tl = vi + row * 2;
      const tr = tl + 1;
      const bl = tl + 2;
      const br = tl + 3;
      indices.push(tl, bl, br, tl, br, tr);
    }
    vi += (segs + 1) * 2;
  }

  const hw = cellW / 2;
  const hh = cellH / 2;

  for (let c = -PAD; c < cols + PAD; c++) {
    for (let r = -PAD; r < rows + PAD; r++) {
      if (!isWall(c, r)) continue;

      const p = cellWorldPos(c, r);
      const cx = p.x, cz = p.z;
      const cellType = wallGrid[gridIdx(c, r)];

      const isObstacle = cellType === 2;

      // Top face (Y = wallHeight) — only for obstacle walls (boundary is covered by ground plane)
      // Locked (no displacement) so it stays flush with ground plane
      if (isObstacle) {
        addQuad(
          cx - hw, wallHeight, cz + hh,
          cx + hw, wallHeight, cz + hh,
          cx + hw, wallHeight, cz - hh,
          cx - hw, wallHeight, cz - hh,
          0, 1, 0, 0
        );
      }

      // Side faces — only where neighbor is empty (subdivided for rock displacement)
      // North side (normal -Z)
      if (!isWall(c, r - 1)) {
        addSideQuad(
          cx + hw, wallHeight, cz - hh,
          cx + hw, 0, cz - hh,
          cx - hw, 0, cz - hh,
          cx - hw, wallHeight, cz - hh,
          0, 0, -1, isObstacle ? 1 : 0
        );
      }
      // South side (normal +Z)
      if (!isWall(c, r + 1)) {
        addSideQuad(
          cx - hw, wallHeight, cz + hh,
          cx - hw, 0, cz + hh,
          cx + hw, 0, cz + hh,
          cx + hw, wallHeight, cz + hh,
          0, 0, 1, isObstacle ? 1 : 0
        );
      }
      // West side (normal -X)
      if (!isWall(c - 1, r)) {
        addSideQuad(
          cx - hw, wallHeight, cz - hh,
          cx - hw, 0, cz - hh,
          cx - hw, 0, cz + hh,
          cx - hw, wallHeight, cz + hh,
          -1, 0, 0, isObstacle ? 1 : 0
        );
      }
      // East side (normal +X)
      if (!isWall(c + 1, r)) {
        addSideQuad(
          cx + hw, wallHeight, cz + hh,
          cx + hw, 0, cz + hh,
          cx + hw, 0, cz - hh,
          cx + hw, wallHeight, cz - hh,
          1, 0, 0, isObstacle ? 1 : 0
        );
      }
    }
  }

  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wallGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  wallGeo.setIndex(indices);

  rockifyGeometry(wallGeo, 0.1, displaceable);
  applyRockVertexColors(wallGeo, { x: 0, y: 0, z: 0 }, wallHeight);

  const mat = createRockMaterial();
  const wallMesh = new THREE.Mesh(wallGeo, mat);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  arenaGroup.add(wallMesh);

  // ─── Ground plane slightly below wall height so rocky edges poke above naturally ───
  const gs = 50;
  const halfW = floorW / 2;
  const halfH = floorH / 2;
  const doorWallThickness = 1.0;
  const stairGap = 2.0;
  const shape = new THREE.Shape();
  shape.moveTo(-gs, -gs);
  shape.lineTo(gs, -gs);
  shape.lineTo(gs, gs);
  shape.lineTo(-gs, gs);
  shape.lineTo(-gs, -gs);
  const hole = new THREE.Path();
  hole.moveTo(-halfW, -halfH);
  hole.lineTo(halfW, -halfH);
  hole.lineTo(halfW, halfH);
  hole.lineTo(doorHalfW, halfH);
  hole.lineTo(doorHalfW, halfH + stairGap + doorWallThickness + exitExtend);
  hole.lineTo(-doorHalfW, halfH + stairGap + doorWallThickness + exitExtend);
  hole.lineTo(-doorHalfW, halfH);
  hole.lineTo(-halfW, halfH);
  hole.lineTo(-halfW, -halfH);
  shape.holes.push(hole);

  const groundGeo = new THREE.ShapeGeometry(shape);

  const ch = game.chapter ?? 1;
  const chColors = CHAPTER_FLOOR_COLORS[ch] || CHAPTER_FLOOR_COLORS[1];
  const groundMat = new THREE.MeshStandardMaterial({ color: chColors.ground, roughness: 0.85, metalness: 0.05 });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.set(center.x, wallHeight, center.z);
  groundMesh.receiveShadow = true;
  arenaGroup.add(groundMesh);
}

// ─── Per-chapter door wall theming ───
// Each chapter defines wall shape, door shape, colors, and style
const DOOR_WALL_THEMES = [
  // Ch0 - Tutorial (same as Ch1)
  { wallColor: '#4a6a3a', wallAccent: '#3a5a2a', doorColor: '#5a3a1e', doorAccent: '#3a2510',
    trimColor: '#6a8a4a', style: 'wood',
    topProfile: 'flat', doorShape: 'rect' },
  // Ch1 - Verdant Prairie
  { wallColor: '#4a6a3a', wallAccent: '#3a5a2a', doorColor: '#5a3a1e', doorAccent: '#3a2510',
    trimColor: '#6a8a4a', style: 'wood',
    topProfile: 'peaked', doorShape: 'arch' },
  // Ch2 - Storm Desert
  { wallColor: '#b09060', wallAccent: '#8a7040', doorColor: '#6a5030', doorAccent: '#4a3520',
    trimColor: '#c4a060', style: 'sandstone',
    topProfile: 'stepped', doorShape: 'arch' },
  // Ch3 - Abandoned Dungeon
  { wallColor: '#4a4a6a', wallAccent: '#3a3a5a', doorColor: '#3a3a5a', doorAccent: '#2a2a4a',
    trimColor: '#5a5a8a', style: 'iron',
    topProfile: 'flat', doorShape: 'rect' },
  // Ch4 - Crystal Mines
  { wallColor: '#3a4a4a', wallAccent: '#2a3a3a', doorColor: '#2a4a4a', doorAccent: '#1a3a3a',
    trimColor: '#4a8a8a', style: 'crystal',
    topProfile: 'jagged', doorShape: 'pointed' },
  // Ch5 - Lost Castle
  { wallColor: '#6a6060', wallAccent: '#5a5050', doorColor: '#4a2a6a', doorAccent: '#3a1a5a',
    trimColor: '#8a7a7a', style: 'stone',
    topProfile: 'crenellated', doorShape: 'arch' },
  // Ch6 - Cave of Bones
  { wallColor: '#5a5040', wallAccent: '#4a4030', doorColor: '#4a3a20', doorAccent: '#3a2a14',
    trimColor: '#e8dcc8', style: 'bone',
    topProfile: 'wavy', doorShape: 'rect' },
  // Ch7 - Barrens of Shadow
  { wallColor: '#2a2a3a', wallAccent: '#1a1a2a', doorColor: '#222230', doorAccent: '#181820',
    trimColor: '#4a4a6a', style: 'shadow',
    topProfile: 'spired', doorShape: 'pointed' },
  // Ch8 - Silent Expanse
  { wallColor: '#6a6a30', wallAccent: '#5a5a20', doorColor: '#4a4a20', doorAccent: '#3a3a14',
    trimColor: '#8a8a50', style: 'wood',
    topProfile: 'peaked', doorShape: 'arch' },
  // Ch9 - Frozen Pinnacle
  { wallColor: '#5a7a9a', wallAccent: '#4a6a8a', doorColor: '#3a5a7a', doorAccent: '#2a4a6a',
    trimColor: '#8ab8dd', style: 'ice',
    topProfile: 'jagged', doorShape: 'pointed' },
  // Ch10 - Land of Doom
  { wallColor: '#5a2020', wallAccent: '#4a1515', doorColor: '#5a1a1a', doorAccent: '#3a0a0a',
    trimColor: '#8a3030', style: 'demon',
    topProfile: 'horned', doorShape: 'pointed' },
];

/**
 * Generate the wall outline shape (top profile) based on chapter style.
 * ALL profiles have stepped sides (shorter at edges, taller toward center).
 * The center portion above the steps varies per chapter.
 * Shape coords: X = -hw to hw, Y = 0 to wallHeight (+ extras for peaks).
 */
function generateWallShape(dwTheme, hw, wallHeight, doorHalfW, doorHeight) {
  const shape = new THREE.Shape();
  const profile = dwTheme.topProfile;

  // Stepped side heights: outer edge is shorter, steps up toward center
  const stepH = 0.8; // height per step
  const sideH1 = wallHeight - stepH * 2; // outermost
  const sideH2 = wallHeight - stepH;     // middle step
  // Center section is at full wallHeight (or higher for peaks)

  // Left side: stepped up from outer edge
  shape.moveTo(-hw, 0);
  shape.lineTo(-hw, sideH1);
  shape.lineTo(-hw * 0.7, sideH1);
  shape.lineTo(-hw * 0.7, sideH2);
  shape.lineTo(-hw * 0.4, sideH2);
  shape.lineTo(-hw * 0.4, wallHeight);

  // ─── Center top portion (varies per chapter) ───
  if (profile === 'peaked') {
    shape.lineTo(-hw * 0.15, wallHeight);
    shape.lineTo(0, wallHeight + 1.5);
    shape.lineTo(hw * 0.15, wallHeight);
  } else if (profile === 'stepped') {
    // Extra step in the center (pyramid top)
    shape.lineTo(-hw * 0.15, wallHeight);
    shape.lineTo(-hw * 0.15, wallHeight + stepH);
    shape.lineTo(hw * 0.15, wallHeight + stepH);
    shape.lineTo(hw * 0.15, wallHeight);
  } else if (profile === 'crenellated') {
    // Battlements across center section
    const centerW = hw * 0.8; // from -0.4 to +0.4
    const crenW = centerW / 4;
    let cx = -hw * 0.4;
    for (let i = 0; i < 4; i++) {
      shape.lineTo(cx, wallHeight + 0.5);
      shape.lineTo(cx + crenW * 0.5, wallHeight + 0.5);
      shape.lineTo(cx + crenW * 0.5, wallHeight);
      shape.lineTo(cx + crenW, wallHeight);
      cx += crenW;
    }
  } else if (profile === 'jagged') {
    // Icy/crystal spikes in center
    const centerW = hw * 0.8;
    const peakCount = 5;
    const segW = centerW / peakCount;
    let jx = -hw * 0.4;
    for (let i = 0; i < peakCount; i++) {
      const peakH = wallHeight + 0.6 + (hashVec3(i * 17, 3, 7) * 1.2);
      shape.lineTo(jx + segW * 0.2, wallHeight);
      shape.lineTo(jx + segW * 0.5, peakH);
      shape.lineTo(jx + segW * 0.8, wallHeight);
      jx += segW;
    }
  } else if (profile === 'wavy') {
    // Undulating organic top in center
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = -hw * 0.4 + t * hw * 0.8;
      const y = wallHeight + Math.sin(t * Math.PI * 2.5) * 0.5;
      shape.lineTo(x, y);
    }
  } else if (profile === 'spired') {
    // Two spires rising from center section
    shape.lineTo(-hw * 0.3, wallHeight);
    shape.lineTo(-hw * 0.25, wallHeight + 2.0);
    shape.lineTo(-hw * 0.15, wallHeight);
    shape.lineTo(0, wallHeight + 0.4);
    shape.lineTo(hw * 0.15, wallHeight);
    shape.lineTo(hw * 0.25, wallHeight + 2.0);
    shape.lineTo(hw * 0.3, wallHeight);
  } else if (profile === 'horned') {
    // Demon horns + center spike
    shape.lineTo(-hw * 0.3, wallHeight);
    shape.lineTo(-hw * 0.2, wallHeight + 1.8);
    shape.lineTo(-hw * 0.1, wallHeight + 0.4);
    shape.lineTo(0, wallHeight + 1.2);
    shape.lineTo(hw * 0.1, wallHeight + 0.4);
    shape.lineTo(hw * 0.2, wallHeight + 1.8);
    shape.lineTo(hw * 0.3, wallHeight);
  } else {
    // Flat center (default/tutorial)
    // just stays at wallHeight across
  }

  // Right side: stepped down from center to outer edge (mirror of left)
  shape.lineTo(hw * 0.4, wallHeight);
  shape.lineTo(hw * 0.4, sideH2);
  shape.lineTo(hw * 0.7, sideH2);
  shape.lineTo(hw * 0.7, sideH1);
  shape.lineTo(hw, sideH1);
  shape.lineTo(hw, 0);
  shape.lineTo(-hw, 0);

  // Cut door hole based on doorShape
  const doorHole = new THREE.Path();
  const dShape = dwTheme.doorShape;

  if (dShape === 'arch') {
    // Rounded arch: rect with semicircle top
    doorHole.moveTo(-doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, doorHeight - doorHalfW);
    doorHole.absarc(0, doorHeight - doorHalfW, doorHalfW, Math.PI, 0, true);
    doorHole.lineTo(doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, 0);
  } else if (dShape === 'pointed') {
    // Gothic pointed arch
    doorHole.moveTo(-doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, doorHeight * 0.7);
    doorHole.lineTo(0, doorHeight);
    doorHole.lineTo(doorHalfW, doorHeight * 0.7);
    doorHole.lineTo(doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, 0);
  } else {
    // Rectangular
    doorHole.moveTo(-doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, doorHeight);
    doorHole.lineTo(doorHalfW, doorHeight);
    doorHole.lineTo(doorHalfW, 0);
    doorHole.lineTo(-doorHalfW, 0);
  }

  shape.holes.push(doorHole);
  return shape;
}

function buildDoor(theme) {
  const ch = game.chapter ?? 1;
  const dwTheme = DOOR_WALL_THEMES[ch] || DOOR_WALL_THEMES[1];
  const doorColor = new THREE.Color(dwTheme.doorColor);
  const doorPanelColor = new THREE.Color(dwTheme.doorAccent);
  const wallColor = new THREE.Color(dwTheme.wallColor);
  const trimColor = new THREE.Color(dwTheme.trimColor);

  const wallHeight = 5.0;
  const doorHeight = 4.0;
  const platformY = 1.0;
  const a = arena();
  const floorW = worldScale(a.w);
  const doorCells = 3;
  const doorFullW = worldScale(a.cellSize * doorCells);
  const doorHalfW = doorFullW / 2;
  const wallThickness = 1.0;
  const doorThickness = 0.15;

  const arenaTopZ = gameToWorld(a.x + a.w / 2, a.y).z;
  const doorSouthFaceZ = arenaTopZ - 2.0;
  const wallCenterX = gameToWorld(a.x + a.w / 2, a.y).x;

  doorWallMeshes = [];
  doorSwingAngle = 0;
  doorOpening = false;

  const stepMat = createRockMaterial();

  // ─── Steps (5 zones over 2T) ───
  const totalGap = 2.0;
  const zoneCount = 5;
  const zoneDepth = totalGap / zoneCount;
  const stepHeights = [platformY / 3, platformY * 2 / 3];

  for (let i = 0; i < 2; i++) {
    const zoneIdx = i + 1;
    const stepTopY = stepHeights[i];
    const prevTopY = i === 0 ? 0 : stepHeights[i - 1];
    const stepZ = arenaTopZ - zoneDepth * zoneIdx - zoneDepth / 2;
    const riserH = stepTopY - prevTopY;
    const riserY = prevTopY + riserH / 2;
    const riserGeo = new THREE.BoxGeometry(doorFullW, riserH, 0.02);
    const riserPos = { x: wallCenterX, y: riserY, z: arenaTopZ - zoneDepth * zoneIdx };
    applyRockVertexColors(riserGeo, riserPos, riserH);
    const riserMesh = new THREE.Mesh(riserGeo, stepMat);
    riserMesh.position.set(riserPos.x, riserPos.y, riserPos.z);
    arenaGroup.add(riserMesh);
    const treadH = 0.05;
    const treadGeo = new THREE.BoxGeometry(doorFullW, treadH, zoneDepth);
    const treadPos = { x: wallCenterX, y: stepTopY - treadH / 2, z: stepZ };
    applyRockVertexColors(treadGeo, treadPos, treadH);
    const treadMesh = new THREE.Mesh(treadGeo, stepMat);
    treadMesh.position.set(treadPos.x, treadPos.y, treadPos.z);
    treadMesh.receiveShadow = true;
    arenaGroup.add(treadMesh);
  }
  // Final riser to platformY
  {
    const riserH = platformY - stepHeights[1];
    const riserY = stepHeights[1] + riserH / 2;
    const riserGeo = new THREE.BoxGeometry(doorFullW, riserH, 0.02);
    const riserPos = { x: wallCenterX, y: riserY, z: arenaTopZ - zoneDepth * 3 };
    applyRockVertexColors(riserGeo, riserPos, riserH);
    const riserMesh = new THREE.Mesh(riserGeo, stepMat);
    riserMesh.position.set(riserPos.x, riserPos.y, riserPos.z);
    arenaGroup.add(riserMesh);
  }
  // Flat zones 3 and 4
  for (let i = 3; i < zoneCount; i++) {
    const flatZ = arenaTopZ - zoneDepth * i - zoneDepth / 2;
    const flatGeo = new THREE.BoxGeometry(doorFullW, 0.05, zoneDepth);
    const flatPos = { x: wallCenterX, y: platformY - 0.05 / 2, z: flatZ };
    applyRockVertexColors(flatGeo, flatPos, 0.05);
    const flatMesh = new THREE.Mesh(flatGeo, stepMat);
    flatMesh.position.set(flatPos.x, flatPos.y, flatPos.z);
    flatMesh.receiveShadow = true;
    arenaGroup.add(flatMesh);
  }

  // ─── Wall with shaped profile and shaped doorway ───
  const hw = floorW / 2;
  const wallShape = generateWallShape(dwTheme, hw, wallHeight, doorHalfW, doorHeight);

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.6,
    metalness: 0.15,
  });

  const extrudeSettings = { depth: wallThickness, bevelEnabled: false };
  const wallGeo = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(wallCenterX, platformY, doorSouthFaceZ - wallThickness);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  arenaGroup.add(wallMesh);
  doorWallMeshes.push(wallMesh);

  // ─── Door frame pillars (flanking the doorway, same height as door) ───
  const frameMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.4,
    metalness: 0.3,
  });
  const frameW = 0.2;
  const frameH = doorHeight;
  const frameGeo = new THREE.BoxGeometry(frameW, frameH, wallThickness + 0.1);
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(wallCenterX + side * (doorHalfW + frameW / 2), platformY + frameH / 2, doorSouthFaceZ - wallThickness / 2);
    arenaGroup.add(frame);
  }

  // ─── God rays (hidden until door opens) ───
  // Positioned at stair base so rays spill down from the door opening onto the steps
  godRayGroup = new THREE.Group();
  godRayGroup.visible = false;
  godRayGroup.position.set(wallCenterX, 0, doorSouthFaceZ);

  const glowColor = theme.doorGlow || '#90ee90';

  // Background glow plane inside the doorway
  const glowPlaneMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(doorFullW * 0.6, doorHeight * 0.55),
    glowPlaneMat
  );
  glowPlane.position.set(0, platformY + doorHeight * 0.35, -wallThickness * 0.5);
  godRayGroup.add(glowPlane);

  // God ray shader — dramatic light shafts that stream outward and downward
  const rayShader = {
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(glowColor) },
      uFadeIn: { value: 0 },
      uSeed: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uFadeIn;
      uniform float uSeed;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        // Horizontal fade — bright center, fades at edges
        float hFade = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 1.5);
        // Vertical fade — brightest at top (source), fades toward bottom (floor)
        float vFade = pow(1.0 - vUv.y, 0.6);
        // Animated shimmer — waves travelling down the ray
        float wave1 = sin(vUv.y * 12.0 - uTime * 3.0 + uSeed * 6.28) * 0.5 + 0.5;
        float wave2 = sin(vUv.y * 7.0 - uTime * 2.0 + uSeed * 3.14) * 0.5 + 0.5;
        float shimmer = 0.5 + 0.3 * wave1 + 0.2 * wave2;
        // Pulsing intensity
        float pulse = 0.8 + 0.2 * sin(uTime * 1.5 + uSeed * 4.0);
        float alpha = hFade * vFade * shimmer * pulse * uFadeIn * 0.45;
        // Brighten the color slightly at the source
        vec3 col = uColor + vec3(0.15) * (1.0 - vUv.y);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  };

  // Main light shafts — angled forward/down from door, spilling onto stairs
  const rayCount = 7;
  for (let i = 0; i < rayCount; i++) {
    const t = (i + 0.5) / rayCount;
    const rayW = 0.18 + Math.random() * 0.25;
    // Rays reach from door down toward floor — shorter for less overwhelming effect
    const rayH = doorHeight * 0.6 + platformY * 0.5 + Math.random() * 0.8;
    const rayGeo = new THREE.PlaneGeometry(rayW, rayH);
    const mat = new THREE.ShaderMaterial({
      ...rayShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(glowColor) },
        uFadeIn: { value: 0 },
        uSeed: { value: Math.random() },
      },
    });
    const ray = new THREE.Mesh(rayGeo, mat);
    const xPos = (t - 0.5) * doorFullW * 0.85;
    // Position: top near the door lintel, bottom extends down past stairs
    // Tilted forward (toward player) so they cascade onto the stair area
    ray.position.set(xPos, platformY + doorHeight * 0.75, 0.2);
    ray.rotation.x = 0.2 + Math.random() * 0.15; // tilt forward/down
    ray.rotation.y = (t - 0.5) * 0.4; // fan outward from center
    ray.rotation.z = (Math.random() - 0.5) * 0.1;
    ray.userData.baseRotX = ray.rotation.x;
    ray.userData.baseRotZ = ray.rotation.z;
    ray.userData.swaySeed = Math.random() * Math.PI * 2;
    godRayGroup.add(ray);
  }

  // Floor glow — a flat plane on the stair area that catches the light
  const floorGlowMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(doorFullW * 0.9, totalGap * 0.7 + 0.5),
    floorGlowMat
  );
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, 0.05, totalGap * 0.3);
  godRayGroup.add(floorGlow);

  // Floating dust particles (small spheres that drift upward)
  const particleMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const particleGeo = new THREE.SphereGeometry(0.03, 4, 3);
  const particles = [];
  for (let i = 0; i < 20; i++) {
    const p = new THREE.Mesh(particleGeo, particleMat.clone());
    p.position.set(
      (Math.random() - 0.5) * doorFullW * 0.9,
      Math.random() * (doorHeight + platformY),
      Math.random() * 1.5
    );
    p.userData.baseY = p.position.y;
    p.userData.speed = 0.3 + Math.random() * 0.4;
    p.userData.drift = Math.random() * Math.PI * 2;
    godRayGroup.add(p);
    particles.push(p);
  }
  godRayGroup.userData.particles = particles;

  // Point lights — one inside doorway, one spilling onto stairs
  const doorLight = new THREE.PointLight(glowColor, 0, 10, 1.5);
  doorLight.position.set(0, platformY + doorHeight * 0.5, -0.5);
  godRayGroup.add(doorLight);

  const stairLight = new THREE.PointLight(glowColor, 0, 6, 2);
  stairLight.position.set(0, platformY * 0.5, 1.0);
  godRayGroup.add(stairLight);

  godRayGroup.userData.doorLight = doorLight;
  godRayGroup.userData.stairLight = stairLight;
  godRayGroup.userData.floorGlow = floorGlow;
  godRayGroup.userData.glowPlane = glowPlane;

  arenaGroup.add(godRayGroup);

  // ─── Two swinging doors ───
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
    panel.castShadow = false;
    panel.receiveShadow = true;
    g.add(panel);

    // Decorative insets
    const insetW = width * 0.6;
    const insetH = height * 0.3;
    const insetMat = new THREE.MeshStandardMaterial({
      color: doorColor.clone().multiplyScalar(0.65),
      roughness: 0.5,
      metalness: 0.3,
    });
    const insetGeo = new THREE.BoxGeometry(insetW, insetH, thickness + 0.03);
    const upper = new THREE.Mesh(insetGeo, insetMat);
    upper.position.set(width / 2, height * 0.7, 0);
    g.add(upper);
    const lower = new THREE.Mesh(insetGeo, insetMat);
    lower.position.set(width / 2, height * 0.3, 0);
    g.add(lower);

    // Handle
    const handleGeo = new THREE.TorusGeometry(0.06, 0.015, 6, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: '#c9a84c', roughness: 0.3, metalness: 0.7 });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(width * 0.82, height * 0.45, thickness / 2 + 0.03);
    g.add(handle);

    return g;
  }

  doorLeftPivot = new THREE.Group();
  const leftDoor = createDoorPanel(singleDoorW, doorHeight, doorThickness);
  doorLeftPivot.add(leftDoor);
  doorLeftPivot.position.set(wallCenterX - doorHalfW, platformY, doorSouthFaceZ);
  arenaGroup.add(doorLeftPivot);

  doorRightPivot = new THREE.Group();
  const rightDoor = createDoorPanel(singleDoorW, doorHeight, doorThickness);
  rightDoor.scale.x = -1;
  doorRightPivot.add(rightDoor);
  doorRightPivot.position.set(wallCenterX + doorHalfW, platformY, doorSouthFaceZ);
  arenaGroup.add(doorRightPivot);

  // ─── Level sign ───
  {
    const signSize = 1.0;
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#2a1a0a';
    sctx.fillRect(0, 0, 128, 128);
    sctx.fillStyle = '#3d2a14';
    sctx.fillRect(8, 8, 112, 112);
    sctx.strokeStyle = '#8a6a3e';
    sctx.lineWidth = 6;
    sctx.strokeRect(4, 4, 120, 120);
    sctx.fillStyle = '#ffd700';
    sctx.font = 'bold 72px "Segoe UI",system-ui,sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText(String(game.stage), 64, 68);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.1 });
    const signGeo = new THREE.PlaneGeometry(signSize, signSize);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    const rightWallCenter = wallCenterX + (doorHalfW + hw) / 2;
    signMesh.position.set(rightWallCenter, platformY + wallHeight * 0.55, doorSouthFaceZ + 0.01);
    arenaGroup.add(signMesh);
  }

  if (game.doorOpen) {
    setDoorOpen(true);
  }
}

// ─── Water system: recessed water with animated shader + bank edges ───

const WATER_DEPTH = 0.3;  // how far below floor the water sits
const BANK_WIDTH = 0.25;  // width of the sloped bank edge

/** Generate a caustic/noise canvas texture for water */
function createWaterTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Base water color — lighter, more transparent feel
  ctx.fillStyle = '#66ccee';
  ctx.fillRect(0, 0, size, size);

  // Layered noise blobs for organic caustic look
  for (let pass = 0; pass < 3; pass++) {
    const colors = ['rgba(160,235,255,0.2)', 'rgba(130,220,250,0.18)', 'rgba(200,245,255,0.14)'];
    ctx.fillStyle = colors[pass];
    const count = 60 + pass * 40;
    const blobSize = 18 - pass * 4;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const rx = blobSize * (0.5 + Math.random());
      const ry = blobSize * (0.3 + Math.random() * 0.7);
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // Wrap around edges for seamless tiling
      if (x + rx > size) {
        ctx.beginPath();
        ctx.ellipse(x - size, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      if (y + ry > size) {
        ctx.beginPath();
        ctx.ellipse(x, y - size, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Bright caustic highlights
  ctx.fillStyle = 'rgba(220,250,255,0.1)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Generate a bank edge gradient texture using the actual floor colors */
function createBankTexture() {
  const w = 64, h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Use same colors as the actual rendered floor tiles
  const ch = game.chapter ?? 1;
  const chColors = CHAPTER_FLOOR_COLORS[ch] || CHAPTER_FLOOR_COLORS[1];
  const topHex = chColors.accent; // darker tile color = top of bank

  // Parse hex to RGB
  const parseHex = (hex) => {
    const c = hex.replace('#', '');
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
  };
  const [tr, tg, tb] = parseHex(topHex);

  // Subtle darken: top = accent (100%), bottom = 60% of accent
  const botR = Math.round(tr * 0.6);
  const botG = Math.round(tg * 0.6);
  const botB = Math.round(tb * 0.6);

  // Gradient from floor accent → slightly darker at waterline
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, topHex);
  grad.addColorStop(1.0, `rgb(${botR},${botG},${botB})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Add noise for organic look
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const brightness = Math.random() * 0.12 - 0.06;
    ctx.fillStyle = brightness > 0
      ? `rgba(255,255,255,${brightness})`
      : `rgba(0,0,0,${-brightness})`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Water shader: dual-layer scrolling caustics with depth variation */
function createWaterShaderMaterial(waterTex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCausticTex: { value: waterTex },
      uDeepColor: { value: new THREE.Color('#3399bb') },
      uShallowColor: { value: new THREE.Color('#77ddee') },
      uOpacity: { value: 0.75 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uCausticTex;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      void main() {
        // Two scrolling layers at different speeds and angles
        vec2 uv1 = vWorldPos.xz * 0.3 + vec2(uTime * 0.02, uTime * 0.015);
        vec2 uv2 = vWorldPos.xz * 0.2 + vec2(-uTime * 0.015, uTime * 0.025);

        // Slight UV distortion for ripple effect
        float ripple = sin(vWorldPos.x * 4.0 + uTime * 1.5) * cos(vWorldPos.z * 3.5 + uTime * 1.2) * 0.008;
        uv1 += ripple;
        uv2 -= ripple;

        vec4 c1 = texture2D(uCausticTex, uv1);
        vec4 c2 = texture2D(uCausticTex, uv2);

        // Blend the two layers
        vec3 caustic = (c1.rgb + c2.rgb) * 0.5;

        // Mix deep/shallow based on caustic brightness for depth variation
        float brightness = dot(caustic, vec3(0.299, 0.587, 0.114));
        vec3 baseColor = mix(uDeepColor, uShallowColor, brightness * 1.5);

        // Add caustic highlight on top
        vec3 finalColor = baseColor + caustic * 0.2;

        // Subtle shimmer
        float shimmer = sin(vWorldPos.x * 8.0 + uTime * 3.0) * sin(vWorldPos.z * 7.0 + uTime * 2.5);
        finalColor += vec3(0.03) * max(shimmer, 0.0);

        gl_FragColor = vec4(finalColor, uOpacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function buildWaterTiles(theme) {
  waterMeshes = [];

  const tiles = game.waterTiles || [];
  if (tiles.length === 0) return;

  const a = arena();
  const cols = (game.mapGrid || { w: 11 }).w;
  const rows = (game.mapGrid || { h: 15 }).h;
  const cellGameW = a.w / cols;
  const cellGameH = a.h / rows;

  // Build grid lookup: which cells are water
  const waterGrid = new Set();
  for (const wt of tiles) {
    const col = Math.round((wt.x - a.x) / cellGameW);
    const row = Math.round((wt.y - a.y) / cellGameH);
    waterGrid.add(`${col},${row}`);
  }

  const cellW = worldScale(cellGameW);
  const cellH = worldScale(cellGameH);
  const waterY = -WATER_DEPTH;

  // ─── Water surface (single merged mesh with shader) ───
  const waterTex = createWaterTexture();
  const waterMat = createWaterShaderMaterial(waterTex);

  const wPositions = [];
  const wUvs = [];
  const wIndices = [];
  let wVert = 0;

  for (const wt of tiles) {
    const col = Math.round((wt.x - a.x) / cellGameW);
    const row = Math.round((wt.y - a.y) / cellGameH);
    const gx = a.x + (col + 0.5) * cellGameW;
    const gy = a.y + (row + 0.5) * cellGameH;
    const pos = gameToWorld(gx, gy);
    const hw = cellW / 2;
    const hh = cellH / 2;

    // Quad at water level
    wPositions.push(
      pos.x - hw, waterY, pos.z - hh,
      pos.x + hw, waterY, pos.z - hh,
      pos.x + hw, waterY, pos.z + hh,
      pos.x - hw, waterY, pos.z + hh
    );
    wUvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    // CW from above for upward normals
    wIndices.push(wVert, wVert + 2, wVert + 1, wVert, wVert + 3, wVert + 2);
    wVert += 4;
  }

  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPositions, 3));
  wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUvs, 2));
  wGeo.setIndex(wIndices);
  wGeo.computeVertexNormals();
  const waterMesh = new THREE.Mesh(wGeo, waterMat);
  arenaGroup.add(waterMesh);
  waterMeshes.push(waterMesh);

  // ─── Bank edges: sloped quads from floor (Y=0) to water (Y=waterY) ───
  const bankTex = createBankTexture();
  const bankMat = new THREE.MeshStandardMaterial({
    map: bankTex,
    roughness: 0.9,
    metalness: 0.0,
  });

  const bPositions = [];
  const bUvs = [];
  const bIndices = [];
  let bVert = 0;

  // Directions: [dcol, drow, axis]. For each water cell edge facing non-water,
  // we create a sloped quad.
  const dirs = [
    { dc: 0, dr: -1, name: 'north' }, // north edge (negative Z in world)
    { dc: 0, dr: 1, name: 'south' },  // south edge (positive Z)
    { dc: -1, dr: 0, name: 'west' },  // left edge (negative X)
    { dc: 1, dr: 0, name: 'east' },   // right edge (positive X)
  ];

  for (const wt of tiles) {
    const col = Math.round((wt.x - a.x) / cellGameW);
    const row = Math.round((wt.y - a.y) / cellGameH);
    const gx = a.x + (col + 0.5) * cellGameW;
    const gy = a.y + (row + 0.5) * cellGameH;
    const pos = gameToWorld(gx, gy);
    const hw = cellW / 2;
    const hh = cellH / 2;

    for (const dir of dirs) {
      const nc = col + dir.dc;
      const nr = row + dir.dr;
      // Only add bank if neighbour is NOT water (and is within arena bounds or at edge)
      if (waterGrid.has(`${nc},${nr}`)) continue;

      // Bank: 4 vertices — 2 at floor level (Y=0), 2 at water level (Y=waterY)
      // The floor-level edge sits at the cell boundary, the water-level edge is inset by BANK_WIDTH
      let v0, v1, v2, v3; // v0,v1 at floor (Y=0), v2,v3 at water (Y=waterY)

      if (dir.name === 'north') {
        // Edge along north side of cell (Z = pos.z - hh)
        const ez = pos.z - hh;
        v0 = [pos.x - hw, 0, ez];              // floor, left
        v1 = [pos.x + hw, 0, ez];              // floor, right
        v2 = [pos.x + hw, waterY, ez + BANK_WIDTH]; // water, right (inset south)
        v3 = [pos.x - hw, waterY, ez + BANK_WIDTH]; // water, left (inset south)
      } else if (dir.name === 'south') {
        const ez = pos.z + hh;
        v0 = [pos.x + hw, 0, ez];
        v1 = [pos.x - hw, 0, ez];
        v2 = [pos.x - hw, waterY, ez - BANK_WIDTH];
        v3 = [pos.x + hw, waterY, ez - BANK_WIDTH];
      } else if (dir.name === 'west') {
        const ex = pos.x - hw;
        v0 = [ex, 0, pos.z + hh];
        v1 = [ex, 0, pos.z - hh];
        v2 = [ex + BANK_WIDTH, waterY, pos.z - hh];
        v3 = [ex + BANK_WIDTH, waterY, pos.z + hh];
      } else { // east
        const ex = pos.x + hw;
        v0 = [ex, 0, pos.z - hh];
        v1 = [ex, 0, pos.z + hh];
        v2 = [ex - BANK_WIDTH, waterY, pos.z + hh];
        v3 = [ex - BANK_WIDTH, waterY, pos.z - hh];
      }

      bPositions.push(...v0, ...v1, ...v2, ...v3);
      // UV: v0,v1 at top of texture (floor), v2,v3 at bottom (water edge)
      bUvs.push(0, 1, 1, 1, 1, 0, 0, 0);
      bIndices.push(bVert, bVert + 2, bVert + 1, bVert, bVert + 3, bVert + 2);
      bVert += 4;
    }

    // ─── Corner bank triangles ───
    // For each diagonal, if the diagonal neighbour is non-water AND at least one
    // of the two adjacent cardinal neighbours IS water, there's a corner gap to fill.
    const corners = [
      { dc: -1, dr: -1, cardA: { dc: -1, dr: 0 }, cardB: { dc: 0, dr: -1 }, name: 'nw' },
      { dc:  1, dr: -1, cardA: { dc:  1, dr: 0 }, cardB: { dc: 0, dr: -1 }, name: 'ne' },
      { dc: -1, dr:  1, cardA: { dc: -1, dr: 0 }, cardB: { dc: 0, dr:  1 }, name: 'sw' },
      { dc:  1, dr:  1, cardA: { dc:  1, dr: 0 }, cardB: { dc: 0, dr:  1 }, name: 'se' },
    ];

    for (const corner of corners) {
      const diagC = col + corner.dc;
      const diagR = row + corner.dr;
      if (waterGrid.has(`${diagC},${diagR}`)) continue; // diagonal is water, no gap

      const cardAWater = waterGrid.has(`${col + corner.cardA.dc},${row + corner.cardA.dr}`);
      const cardBWater = waterGrid.has(`${col + corner.cardB.dc},${row + corner.cardB.dr}`);

      // Only need corner if at least one cardinal neighbour is water (meaning that
      // side has no straight bank edge to cover the corner)
      if (!cardAWater && !cardBWater) continue;

      // Corner point at floor level (Y=0)
      const cx = pos.x + corner.dc * hw;
      const cz = pos.z + corner.dr * hh;
      const cv = [cx, 0, cz];

      // Two water-level points inset along each edge
      const wv1 = [cx - corner.dc * BANK_WIDTH, waterY, cz];
      const wv2 = [cx, waterY, cz - corner.dr * BANK_WIDTH];

      bPositions.push(...cv, ...wv1, ...wv2);
      bUvs.push(0.5, 1, 0, 0, 1, 0); // floor at top, water edge at bottom
      // Winding depends on corner: when dc*dr > 0 (NW, SE) reverse, otherwise original
      if (corner.dc * corner.dr > 0) {
        bIndices.push(bVert, bVert + 2, bVert + 1);
      } else {
        bIndices.push(bVert, bVert + 1, bVert + 2);
      }
      bVert += 3;
    }
  }

  if (bPositions.length > 0) {
    const bGeo = new THREE.BufferGeometry();
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPositions, 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bUvs, 2));
    bGeo.setIndex(bIndices);
    bGeo.computeVertexNormals();
    const bankMesh = new THREE.Mesh(bGeo, bankMat);
    bankMesh.receiveShadow = true;
    arenaGroup.add(bankMesh);
  }

  // ─── Recessed floor under water (lighter bottom visible through transparency) ───
  const bedMat = new THREE.MeshStandardMaterial({
    color: '#3a7a8a',
    roughness: 1.0,
    metalness: 0.0,
  });
  const bedY = waterY - 0.05;
  const bedPositions = [];
  const bedIndices = [];
  let bedVert = 0;

  for (const wt of tiles) {
    const col = Math.round((wt.x - a.x) / cellGameW);
    const row = Math.round((wt.y - a.y) / cellGameH);
    const gx = a.x + (col + 0.5) * cellGameW;
    const gy = a.y + (row + 0.5) * cellGameH;
    const pos = gameToWorld(gx, gy);
    const hw = cellW / 2;
    const hh = cellH / 2;

    bedPositions.push(
      pos.x - hw, bedY, pos.z - hh,
      pos.x + hw, bedY, pos.z - hh,
      pos.x + hw, bedY, pos.z + hh,
      pos.x - hw, bedY, pos.z + hh
    );
    bedIndices.push(bedVert, bedVert + 2, bedVert + 1, bedVert, bedVert + 3, bedVert + 2);
    bedVert += 4;
  }

  const bedGeo = new THREE.BufferGeometry();
  bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(bedPositions, 3));
  bedGeo.setIndex(bedIndices);
  bedGeo.computeVertexNormals();
  const bedMesh = new THREE.Mesh(bedGeo, bedMat);
  arenaGroup.add(bedMesh);
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

// ─── Artifacts: procedural decoration props per chapter ───

// Per-chapter artifact definitions: each has a create() function returning a THREE.Group
const CHAPTER_ARTIFACTS = [
  // Ch0/Ch1 - Verdant Prairie: tree, bush
  [
    { create: createTree, scale: 1.0 },
    { create: createBush, scale: 0.8 },
  ],
  // Ch1 - same
  [
    { create: createTree, scale: 1.0 },
    { create: createBush, scale: 0.8 },
  ],
  // Ch2 - Storm Desert: cactus, sandstone pillar
  [
    { create: createCactus, scale: 1.0 },
    { create: createPillar, scale: 0.9 },
  ],
  // Ch3 - Abandoned Dungeon: torch stand, barrel
  [
    { create: createTorchStand, scale: 1.0 },
    { create: createBarrel, scale: 0.7 },
  ],
  // Ch4 - Crystal Mines: crystal cluster, mine cart
  [
    { create: createCrystalCluster, scale: 1.0 },
    { create: createMineCart, scale: 0.8 },
  ],
  // Ch5 - Lost Castle: stone column, banner
  [
    { create: createColumn, scale: 0.5 },
    { create: createBanner, scale: 0.9 },
  ],
  // Ch6 - Cave of Bones: bone pile, skull on spike
  [
    { create: createBonePile, scale: 0.8 },
    { create: createSkullSpike, scale: 1.0 },
  ],
  // Ch7 - Barrens of Shadow: dead tree, obelisk
  [
    { create: createDeadTree, scale: 1.0 },
    { create: createObelisk, scale: 0.9 },
  ],
  // Ch8 - Silent Expanse: wheat sheaf, wooden cart
  [
    { create: createWheatSheaf, scale: 0.9 },
    { create: createWoodenCart, scale: 0.8 },
  ],
  // Ch9 - Frozen Pinnacle: ice stalagmite, frozen lantern
  [
    { create: createIceStalagmite, scale: 1.0 },
    { create: createFrozenLantern, scale: 0.8 },
  ],
  // Ch10 - Land of Doom: lava rock, demon totem
  [
    { create: createLavaRock, scale: 0.9 },
    { create: createDemonTotem, scale: 1.0 },
  ],
];

// ─── Artifact geometry creators ───

function createTree() {
  const g = new THREE.Group();
  // Trunk
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6),
    new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.9 })
  );
  trunk.position.y = 0.4;
  g.add(trunk);
  // Canopy (3 stacked cones)
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3a7a2a', roughness: 0.8 });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.6, 7), leafMat);
  c1.position.y = 1.1;
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 7), leafMat);
  c2.position.y = 1.5;
  g.add(c2);
  const c3 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 7), leafMat);
  c3.position.y = 1.85;
  g.add(c3);
  return g;
}

function createBush() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#4a8a3a', roughness: 0.85 });
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), mat);
  s1.position.set(0, 0.2, 0);
  s1.scale.y = 0.7;
  g.add(s1);
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), mat);
  s2.position.set(0.15, 0.25, 0.1);
  s2.scale.y = 0.7;
  g.add(s2);
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), mat);
  s3.position.set(-0.12, 0.22, -0.08);
  s3.scale.y = 0.7;
  g.add(s3);
  return g;
}

function createCactus() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#4a8a4a', roughness: 0.8 });
  // Main body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.0, 8), mat);
  body.position.y = 0.5;
  g.add(body);
  // Arm left
  const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 6), mat);
  arm1.position.set(-0.15, 0.55, 0);
  arm1.rotation.z = Math.PI / 4;
  g.add(arm1);
  // Arm right
  const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.35, 6), mat);
  arm2.position.set(0.15, 0.7, 0);
  arm2.rotation.z = -Math.PI / 4;
  g.add(arm2);
  return g;
}

function createPillar() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c4a060', roughness: 0.7 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.2, 6), mat);
  pillar.position.y = 0.6;
  g.add(pillar);
  // Cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.35), mat);
  cap.position.y = 1.2;
  g.add(cap);
  return g;
}

function createTorchStand() {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.5, metalness: 0.6 });
  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 6), metalMat);
  pole.position.y = 0.5;
  g.add(pole);
  // Bracket
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.04), metalMat);
  bracket.position.set(0.05, 0.95, 0);
  g.add(bracket);
  // Flame (orange cone)
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.15, 5),
    new THREE.MeshStandardMaterial({ color: '#ff8800', emissive: '#ff4400', emissiveIntensity: 0.5 })
  );
  flame.position.set(0.12, 1.05, 0);
  g.add(flame);
  return g;
}

function createBarrel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 0.85 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.4, 8), mat);
  barrel.position.y = 0.2;
  g.add(barrel);
  // Rings
  const ringMat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.5, metalness: 0.5 });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 4, 8), ringMat);
  ring1.position.y = 0.1;
  ring1.rotation.x = Math.PI / 2;
  g.add(ring1);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 4, 8), ringMat);
  ring2.position.y = 0.3;
  ring2.rotation.x = Math.PI / 2;
  g.add(ring2);
  return g;
}

function createCrystalCluster() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#88ccdd', roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 });
  // Several angled crystals
  for (let i = 0; i < 4; i++) {
    const h = 0.3 + Math.random() * 0.5;
    const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.06 + i * 0.02, h, 5), mat);
    const angle = (i / 4) * Math.PI * 2;
    crystal.position.set(Math.cos(angle) * 0.08, h / 2, Math.sin(angle) * 0.08);
    crystal.rotation.x = (Math.random() - 0.5) * 0.3;
    crystal.rotation.z = (Math.random() - 0.5) * 0.3;
    g.add(crystal);
  }
  return g;
}

function createMineCart() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6a5030', roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({ color: '#5a5a5a', roughness: 0.4, metalness: 0.6 });
  // Box
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.25), woodMat);
  box.position.y = 0.2;
  g.add(box);
  // Wheels
  for (const xOff of [-0.15, 0.15]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), metalMat);
    wheel.position.set(xOff, 0.07, 0.14);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
  }
  return g;
}

function createColumn() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#8a8880', roughness: 0.7 });
  // Base
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.4), mat);
  base.position.y = 0.05;
  g.add(base);
  // Shaft
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8), mat);
  shaft.position.y = 0.7;
  g.add(shaft);
  // Capital
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.35), mat);
  cap.position.y = 1.3;
  g.add(cap);
  return g;
}

function createBanner() {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.8 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 5), poleMat);
  pole.position.y = 0.7;
  g.add(pole);
  // Banner cloth
  const clothMat = new THREE.MeshStandardMaterial({ color: '#8a2020', roughness: 0.9, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), clothMat);
  cloth.position.set(0.17, 1.1, 0);
  cloth.rotation.y = Math.PI / 6;
  g.add(cloth);
  return g;
}

function createBonePile() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.8 });
  // Random bones (capsules/cylinders)
  for (let i = 0; i < 5; i++) {
    const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.2, 3, 5), mat);
    bone.position.set((Math.random() - 0.5) * 0.2, 0.04, (Math.random() - 0.5) * 0.2);
    bone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * 0.5);
    g.add(bone);
  }
  return g;
}

function createSkullSpike() {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#4a3a2a', roughness: 0.85 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.9, 5), poleMat);
  pole.position.y = 0.45;
  g.add(pole);
  // Skull
  const skullMat = new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.7 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), skullMat);
  skull.position.y = 0.95;
  skull.scale.set(1, 0.9, 0.85);
  g.add(skull);
  return g;
}

function createDeadTree() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 0.9 });
  // Trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.0, 5), mat);
  trunk.position.y = 0.5;
  g.add(trunk);
  // Branch stubs
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.3, 4), mat);
  b1.position.set(0.08, 0.8, 0);
  b1.rotation.z = -Math.PI / 4;
  g.add(b1);
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.25, 4), mat);
  b2.position.set(-0.06, 0.7, 0.04);
  b2.rotation.z = Math.PI / 3;
  g.add(b2);
  return g;
}

function createObelisk() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#2a2030', roughness: 0.6, metalness: 0.2 });
  const obelisk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.15), mat);
  obelisk.position.y = 0.6;
  g.add(obelisk);
  // Pointed top
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 4), mat);
  top.position.y = 1.3;
  top.rotation.y = Math.PI / 4;
  g.add(top);
  return g;
}

function createWheatSheaf() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#c4a040', roughness: 0.9 });
  // Bundle of thin cylinders
  for (let i = 0; i < 6; i++) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.7, 4), mat);
    const angle = (i / 6) * Math.PI * 2;
    stalk.position.set(Math.cos(angle) * 0.04, 0.35, Math.sin(angle) * 0.04);
    stalk.rotation.x = (Math.random() - 0.5) * 0.15;
    stalk.rotation.z = (Math.random() - 0.5) * 0.15;
    g.add(stalk);
  }
  // Tie
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 6), mat);
  tie.position.y = 0.25;
  tie.rotation.x = Math.PI / 2;
  g.add(tie);
  return g;
}

function createWoodenCart() {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: '#7a5a30', roughness: 0.85 });
  // Bed
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.3), woodMat);
  bed.position.y = 0.15;
  g.add(bed);
  // Sides
  const side1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.03), woodMat);
  side1.position.set(0, 0.24, 0.14);
  g.add(side1);
  const side2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.03), woodMat);
  side2.position.set(0, 0.24, -0.14);
  g.add(side2);
  // Wheels
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#4a3a20', roughness: 0.8 });
  for (const x of [-0.2, 0.2]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), wheelMat);
    wheel.position.set(x, 0.08, 0.17);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
  }
  return g;
}

function createIceStalagmite() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#a0d8ee', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8 });
  const spike1 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 5), mat);
  spike1.position.y = 0.4;
  g.add(spike1);
  const spike2 = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 5), mat);
  spike2.position.set(0.1, 0.25, 0.05);
  spike2.rotation.z = -0.2;
  g.add(spike2);
  return g;
}

function createFrozenLantern() {
  const g = new THREE.Group();
  const metalMat = new THREE.MeshStandardMaterial({ color: '#5a6a7a', roughness: 0.4, metalness: 0.5 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.8, 5), metalMat);
  pole.position.y = 0.4;
  g.add(pole);
  // Lantern body (ice-encased)
  const iceMat = new THREE.MeshStandardMaterial({ color: '#88ccee', roughness: 0.1, transparent: true, opacity: 0.7 });
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), iceMat);
  lantern.position.y = 0.85;
  g.add(lantern);
  return g;
}

function createLavaRock() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#3a2020', roughness: 0.9 });
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), mat);
  rock.position.y = 0.15;
  rock.scale.y = 0.7;
  g.add(rock);
  // Glow cracks
  const glowMat = new THREE.MeshStandardMaterial({ color: '#ff4400', emissive: '#ff2200', emissiveIntensity: 0.8 });
  const crack = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.15), glowMat);
  crack.position.set(0.05, 0.12, 0);
  g.add(crack);
  return g;
}

function createDemonTotem() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#2a1515', roughness: 0.7, metalness: 0.2 });
  // Base pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.0, 5), mat);
  pillar.position.y = 0.5;
  g.add(pillar);
  // Horns
  const hornMat = new THREE.MeshStandardMaterial({ color: '#4a1a1a', roughness: 0.6 });
  const h1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), hornMat);
  h1.position.set(-0.1, 1.1, 0);
  h1.rotation.z = 0.3;
  g.add(h1);
  const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), hornMat);
  h2.position.set(0.1, 1.1, 0);
  h2.rotation.z = -0.3;
  g.add(h2);
  return g;
}

// ─── Artifact placement ───

function buildArtifacts() {
  const ch = game.chapter ?? 1;
  const artifacts = CHAPTER_ARTIFACTS[ch] || CHAPTER_ARTIFACTS[1];
  const a = arena();
  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);
  const center = gameToWorld(a.x + a.w / 2, a.y + a.h / 2);
  const cellW = worldScale(a.cellSize || (a.w / (game.mapGrid || { w: 11 }).w));
  const wallHeight = 1.0;

  // Arena edges in world space
  const leftX = center.x - floorW / 2;
  const rightX = center.x + floorW / 2;
  const topZ = center.z - floorH / 2; // north (toward door)
  const bottomZ = center.z + floorH / 2; // south

  // Random placement — fresh each level load
  function rng() { return Math.random(); }

  // Ch3-10 get 2x size on top of the base 2.0 multiplier
  const chSizeMult = ch >= 3 ? 4.0 : 2.0;

  function placeArtifact(x, z, y, scaleMultiplier) {
    const def = artifacts[Math.floor(rng() * artifacts.length)];
    const obj = def.create();
    obj.scale.setScalar(def.scale * (scaleMultiplier || 1) * chSizeMult);
    obj.position.set(x, y, z);
    obj.rotation.y = rng() * Math.PI * 2;
    obj.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    arenaGroup.add(obj);
  }

  // ─── Behind the door wall (on ground plane, Y=wallHeight) ───
  // 10-16 artifacts spread behind the door wall area
  const behindZ = topZ - 2.5;
  const behindCount = 10 + Math.floor(rng() * 7);
  for (let i = 0; i < behindCount; i++) {
    const x = center.x + (rng() - 0.5) * floorW * 1.2;
    const z = behindZ - 0.5 - rng() * 5.0;
    placeArtifact(x, z, wallHeight, 0.8 + rng() * 0.7);
  }

  // ─── Flanking the door wall (beside decorative columns) ───
  // 2-4 artifacts on each side right next to the wall
  for (const side of [-1, 1]) {
    const flankCount = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < flankCount; i++) {
      const halfW = floorW / 2;
      const x = center.x + side * (halfW + 0.5 + rng() * 1.0);
      const z = topZ - 1.5 - rng() * 1.5;
      placeArtifact(x, z, wallHeight, 0.6 + rng() * 0.5);
    }
  }

  // ─── Side boundaries (on ground plane, spread along the full height) ───
  // 6-10 per side, placed 0.5-2T out from the boundary edge
  const leftCount = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < leftCount; i++) {
    const x = leftX - 0.5 - rng() * 1.5;
    const z = center.z + (rng() - 0.5) * floorH * 1.0;
    placeArtifact(x, z, wallHeight, 0.7 + rng() * 0.6);
  }
  const rightCount = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < rightCount; i++) {
    const x = rightX + 0.5 + rng() * 1.5;
    const z = center.z + (rng() - 0.5) * floorH * 1.0;
    placeArtifact(x, z, wallHeight, 0.7 + rng() * 0.6);
  }

  // ─── Before the bottom boundary (south, on ground plane) ───
  // 6-10 artifacts. Tall ones (>2T) placed 2-5 units out, short ones can be at 1+.
  const southCount = 6 + Math.floor(rng() * 5);
  for (let i = 0; i < southCount; i++) {
    const x = center.x + (rng() - 0.5) * floorW * 1.0;
    const scaleMult = 0.7 + rng() * 0.6;
    const def = artifacts[Math.floor(rng() * artifacts.length)];
    const obj = def.create();
    const finalScale = def.scale * scaleMult * chSizeMult;
    obj.scale.setScalar(finalScale);
    // Measure height to decide placement distance
    const box = new THREE.Box3().setFromObject(obj);
    const height = box.max.y - box.min.y;
    const minDist = height > 2.0 ? 2.0 : 1.0;
    const z = bottomZ + minDist + rng() * 3.0;
    obj.position.set(x, wallHeight, z);
    obj.rotation.y = rng() * Math.PI * 2;
    obj.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    arenaGroup.add(obj);
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
  buildWalls(theme);
  buildDoor(theme);
  buildWaterTiles(theme);
  buildSpikeTiles(theme);
  buildArtifacts();

  waterTime = 0;

  getScene().add(arenaGroup);
}

/**
 * Animate water, door glow, etc. Called each frame.
 * @param {number} dt - delta time in seconds
 */
export function updateArena(dt) {
  if (!arenaGroup) return;

  // ─── Water shader animation ───
  waterTime += dt;
  for (const mesh of waterMeshes) {
    if (mesh.material.uniforms && mesh.material.uniforms.uTime) {
      mesh.material.uniforms.uTime.value = waterTime;
    }
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

  // ─── God ray animation ───
  if (godRayGroup && doorOpening) {
    godRayGroup.visible = true;
    godRayTime += dt;

    // Quick fade in over 0.6 seconds
    const fadeIn = Math.min(1, godRayTime / 0.6);
    const fadeEased = fadeIn * fadeIn * (3 - 2 * fadeIn); // smoothstep

    // Animate ray shaders + sway
    godRayGroup.traverse(child => {
      if (child.isMesh && child.material.uniforms && child.material.uniforms.uTime) {
        child.material.uniforms.uTime.value = godRayTime;
        child.material.uniforms.uFadeIn.value = fadeEased;
        // Sway rays gently
        if (child.userData.baseRotX !== undefined) {
          const sway = Math.sin(godRayTime * 0.8 + child.userData.swaySeed) * 0.05;
          const drift = Math.cos(godRayTime * 0.5 + child.userData.swaySeed * 2) * 0.03;
          child.rotation.x = child.userData.baseRotX + sway;
          child.rotation.z = child.userData.baseRotZ + drift;
        }
      }
    });

    // Glow plane pulse
    const glowPlane = godRayGroup.userData.glowPlane;
    if (glowPlane) {
      const pulse = 0.3 + 0.15 * Math.sin(godRayTime * 1.2);
      glowPlane.material.opacity = fadeEased * pulse;
    }

    // Floor glow
    const floorGlow = godRayGroup.userData.floorGlow;
    if (floorGlow) {
      const floorPulse = 0.15 + 0.08 * Math.sin(godRayTime * 1.5 + 1.0);
      floorGlow.material.opacity = fadeEased * floorPulse;
    }

    // Floating particles
    const particles = godRayGroup.userData.particles;
    if (particles) {
      for (const p of particles) {
        p.position.y += p.userData.speed * dt;
        p.position.x += Math.sin(godRayTime + p.userData.drift) * 0.002;
        // Reset when they float too high
        if (p.position.y > 6) {
          p.position.y = 0;
          p.position.x = (Math.random() - 0.5) * 3;
        }
        p.material.opacity = fadeEased * (0.3 + 0.2 * Math.sin(godRayTime * 2 + p.userData.drift));
      }
    }

    // Lights
    const doorLight = godRayGroup.userData.doorLight;
    if (doorLight) {
      doorLight.intensity = fadeEased * (4.0 + Math.sin(godRayTime * 1.8) * 1.0);
    }
    const stairLight = godRayGroup.userData.stairLight;
    if (stairLight) {
      stairLight.intensity = fadeEased * (2.0 + Math.sin(godRayTime * 1.3 + 0.5) * 0.8);
    }

    // Spawn confetti immediately
    if (confettiPieces.length === 0 && godRayTime > 0.05) {
      spawnConfetti();
    }

    // Spawn firework bursts periodically (start quickly)
    if (godRayTime > 0.1 && fireworkBursts.length < 15) {
      if (Math.random() < dt * 3.0) {
        spawnFirework();
      }
    }
  }

  // ─── Confetti animation ───
  for (let i = confettiPieces.length - 1; i >= 0; i--) {
    const c = confettiPieces[i];
    c.life -= dt;
    c.age += dt;
    if (c.life <= 0) {
      arenaGroup.remove(c.mesh);
      c.mesh.material.dispose();
      confettiPieces.splice(i, 1);
      continue;
    }
    // Physics
    c.vy -= 6.0 * dt; // gravity (pulls down fast)
    c.mesh.position.x += c.vx * dt;
    c.mesh.position.y += c.vy * dt;
    c.mesh.position.z += c.vz * dt;
    // Tumble
    c.mesh.rotation.x += c.spinX * dt;
    c.mesh.rotation.y += (c.spinY || 0) * dt;
    c.mesh.rotation.z += c.spinZ * dt;
    // Flutter (air resistance — confetti catches air on the way down)
    c.vx *= 0.99;
    c.vz *= 0.99;
    if (c.vy < 0) c.vy *= 0.97; // more drag when falling — flutter effect
    // Opacity: quick tween in (first 0.2s), fade out in last 25% of life
    const fadeIn = Math.min(1, c.age / 0.2);
    const fadeOut = Math.min(1, c.life / (c.maxLife * 0.25));
    c.mesh.material.opacity = fadeIn * fadeOut * 0.9;
  }

  // ─── Firework animation ───
  for (let i = fireworkBursts.length - 1; i >= 0; i--) {
    const burst = fireworkBursts[i];
    burst.life -= dt;

    if (burst.life <= 0) {
      // Clean up trail
      for (const t of burst.trail) {
        arenaGroup.remove(t);
        t.material.dispose();
      }
      // Clean up sparks
      for (const spark of burst.sparks) {
        arenaGroup.remove(spark.mesh);
        spark.mesh.material.dispose();
      }
      fireworkBursts.splice(i, 1);
      continue;
    }

    if (burst.phase === 'rising') {
      // Rocket rising
      burst.y += burst.vy * dt;
      burst.vy *= 0.97; // decelerate

      // Leave a glowing trail
      if (Math.random() < dt * 35) {
        const trailGeo = getSparkGeo();
        const trailMat = new THREE.MeshStandardMaterial({
          color: burst.color,
          emissive: burst.color,
          emissiveIntensity: 1.2,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        });
        const trail = new THREE.Mesh(trailGeo, trailMat);
        trail.position.set(burst.x + (Math.random() - 0.5) * 0.12, burst.y, burst.z);
        trail.scale.setScalar(0.5 + Math.random() * 0.2);
        arenaGroup.add(trail);
        burst.trail.push(trail);
      }

      // Fade trail
      for (let t = burst.trail.length - 1; t >= 0; t--) {
        burst.trail[t].material.opacity -= dt * 2;
        burst.trail[t].scale.multiplyScalar(0.96);
        if (burst.trail[t].material.opacity <= 0) {
          arenaGroup.remove(burst.trail[t]);
          burst.trail[t].material.dispose();
          burst.trail.splice(t, 1);
        }
      }

      // Explode when reaching target or slowing down
      if (burst.y >= burst.targetY || burst.vy < 2) {
        explodeFirework(burst);
      }
    } else {
      // Exploded — animate sparks
      const burstFade = Math.min(1, burst.life / (burst.maxLife * 0.4));
      for (const spark of burst.sparks) {
        spark.vy -= 5.0 * dt;
        spark.mesh.position.x += spark.vx * dt;
        spark.mesh.position.y += spark.vy * dt;
        spark.mesh.position.z += spark.vz * dt;
        spark.vx *= 0.96;
        spark.vy *= 0.97;
        spark.vz *= 0.96;
        spark.mesh.material.opacity = burstFade * 0.9;
        spark.mesh.material.emissiveIntensity = burstFade * 1.5;
        spark.mesh.scale.setScalar((0.5 + burstFade * 0.5) * (spark.mesh.userData.sparkScale || 1));
      }
      // Fade remaining trail
      for (let t = burst.trail.length - 1; t >= 0; t--) {
        burst.trail[t].material.opacity -= dt * 3;
        if (burst.trail[t].material.opacity <= 0) {
          arenaGroup.remove(burst.trail[t]);
          burst.trail[t].material.dispose();
          burst.trail.splice(t, 1);
        }
      }
    }
  }
}

// ─── Confetti & Fireworks ───

const CONFETTI_COLORS = ['#ff4444', '#44ff44', '#4488ff', '#ffdd00', '#ff88dd', '#44ffee', '#ffaa00', '#aa44ff'];

// Shared geometry to avoid frame spike from creating 60+ geometries at once
let _confettiGeos = null;
let _sparkGeo = null;
function getConfettiGeo() {
  // Multiple confetti shapes for variety: ribbons, squares, circles
  if (!_confettiGeos) {
    _confettiGeos = [
      new THREE.BoxGeometry(0.18, 0.26, 0.02),    // flat ribbon
      new THREE.BoxGeometry(0.22, 0.14, 0.02),    // wide strip
      new THREE.CircleGeometry(0.12, 6),           // hexagonal dot
      new THREE.BoxGeometry(0.15, 0.15, 0.02),    // square
      new THREE.PlaneGeometry(0.24, 0.08),         // thin streamer
    ];
  }
  return _confettiGeos[Math.floor(Math.random() * _confettiGeos.length)];
}
function getSparkGeo() {
  if (!_sparkGeo) _sparkGeo = new THREE.SphereGeometry(0.07, 6, 4);
  return _sparkGeo;
}

function spawnConfetti() {
  if (!arenaGroup) return;
  const a = arena();
  const center = gameToWorld(a.x + a.w / 2, a.y);
  const floorW = worldScale(a.w);
  const arenaTopZ = center.z;

  // 60 pieces — shoot UP from the ground/stair level
  for (let i = 0; i < 60; i++) {
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    const isMetallic = Math.random() > 0.5;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      metalness: isMetallic ? 0.8 : 0.1,
      roughness: isMetallic ? 0.3 : 0.7,
      transparent: true,
      opacity: 0,  // starts invisible, tweens in
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const geo = getConfettiGeo();
    const mesh = new THREE.Mesh(geo, mat);

    // Start at ground level near the stair base, spread across the door width
    mesh.position.set(
      center.x + (Math.random() - 0.5) * floorW * 0.5,
      0.1 + Math.random() * 0.3, // ground level
      arenaTopZ + (Math.random() - 0.5) * 1.5
    );

    // Launch upward fast with some spread
    const angle = Math.random() * Math.PI * 2;
    const hSpeed = 2.0 + Math.random() * 3.0;
    const piece = {
      mesh,
      vx: Math.cos(angle) * hSpeed * 0.5,
      vy: 7.0 + Math.random() * 4.0, // fast upward launch, capped height
      vz: Math.sin(angle) * hSpeed * 0.4,
      spinX: (Math.random() - 0.5) * 12,
      spinY: (Math.random() - 0.5) * 8,
      spinZ: (Math.random() - 0.5) * 12,
      life: 3.5 + Math.random() * 2.0,
      maxLife: 0,
      age: 0,
      scale: 0.7 + Math.random() * 0.5,
    };
    piece.maxLife = piece.life;
    mesh.scale.setScalar(piece.scale);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    arenaGroup.add(mesh);
    confettiPieces.push(piece);
  }
}

function spawnFirework() {
  if (!arenaGroup) return;
  const a = arena();
  const center = gameToWorld(a.x + a.w / 2, a.y);
  const floorW = worldScale(a.w);

  // Firework rocket — launches from ground, explodes at peak
  const launchX = center.x + (Math.random() - 0.5) * floorW * 0.6;
  const launchZ = center.z + (Math.random() - 0.5) * 3.0;
  const targetY = 5.0 + Math.random() * 4.0;

  const burstColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

  // The burst is created as a "pending" firework that rises then explodes
  fireworkBursts.push({
    phase: 'rising',
    x: launchX,
    y: 0.5,
    z: launchZ,
    targetY,
    vy: 12 + Math.random() * 5,
    color: burstColor,
    trail: [],
    sparks: [],
    life: 3.0,
    maxLife: 3.0,
  });
}

function explodeFirework(burst) {
  if (!arenaGroup) return;
  const geo = getSparkGeo();
  const sparkCount = 22 + Math.floor(Math.random() * 12);

  for (let i = 0; i < sparkCount; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: burst.color,
      emissive: burst.color,
      emissiveIntensity: 1.5,
      metalness: 0.6,
      roughness: 0.2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(burst.x, burst.y, burst.z);
    // Random scale variation
    const sparkScale = 0.6 + Math.random() * 0.4;
    mesh.scale.setScalar(sparkScale);
    mesh.userData.sparkScale = sparkScale;

    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const speed = 3.5 + Math.random() * 3.5;
    burst.sparks.push({
      mesh,
      vx: Math.sin(phi) * Math.cos(theta) * speed,
      vy: Math.sin(phi) * Math.sin(theta) * speed * 0.7 + 1.5,
      vz: Math.cos(phi) * speed * 0.5,
    });
    arenaGroup.add(mesh);
  }
  burst.phase = 'exploded';
  burst.life = 1.5 + Math.random() * 0.5;
  burst.maxLife = burst.life;
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
          // Dispose shader uniform textures
          if (child.material.uniforms) {
            for (const u of Object.values(child.material.uniforms)) {
              if (u.value && u.value.isTexture) u.value.dispose();
            }
          }
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
  godRayGroup = null;
  godRayTime = 0;
  confettiPieces = [];
  fireworkBursts = [];
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
