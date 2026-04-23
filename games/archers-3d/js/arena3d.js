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
let doorMesh = null;       // the door barrier mesh
let doorWallMeshes = [];   // wall segments that form the door frame
let portalGroup = null;    // glow effect when door is open
let portalLight = null;    // point light in the doorway
let waterTime = 0;         // accumulated time for water animation
let portalTime = 0;        // accumulated time for portal glow pulse

// ─── Helpers ───

function getTheme() {
  const ch = game.chapter ?? 1;
  return CHAPTER_THEMES[ch] || CHAPTER_THEMES[1];
}

/** Create a canvas-based grid texture for the floor */
function createFloorTexture(theme, cols, rows) {
  const cellPx = 64; // pixels per cell in texture
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
  ctx.strokeStyle = theme.floorGrid || 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
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

  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);

  const tex = createFloorTexture(theme, cols, rows);

  const geo = new THREE.PlaneGeometry(floorW, floorH);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: new THREE.Color(theme.floor || '#1a3d1a'),
    roughness: 0.85,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2; // lay flat
  // Center of the arena in world coords
  const center = gameToWorld(a.w / 2, a.h / 2);
  mesh.position.set(center.x, 0, center.z);
  mesh.receiveShadow = true;
  arenaGroup.add(mesh);
}

function buildBoundary(theme) {
  const a = arena();
  const floorW = worldScale(a.w);
  const floorH = worldScale(a.h);
  const wallHeight = 3.0;
  const wallThickness = 0.3;
  const center = gameToWorld(a.w / 2, a.h / 2);

  const color = new THREE.Color(theme.boundary || '#0d1f0d');
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.1,
  });

  // Four boundary walls: left, right, bottom, top
  const walls = [
    // Left wall
    { w: wallThickness, h: wallHeight, d: floorH + wallThickness * 2,
      x: center.x - floorW / 2 - wallThickness / 2, z: center.z },
    // Right wall
    { w: wallThickness, h: wallHeight, d: floorH + wallThickness * 2,
      x: center.x + floorW / 2 + wallThickness / 2, z: center.z },
    // Bottom wall (positive Z = bottom of arena in game coords)
    { w: floorW + wallThickness * 2, h: wallHeight, d: wallThickness,
      x: center.x, z: center.z + floorH / 2 + wallThickness / 2 },
    // Top wall (negative Z = top of arena) — leave a gap for the door
    { w: floorW + wallThickness * 2, h: wallHeight, d: wallThickness,
      x: center.x, z: center.z - floorH / 2 - wallThickness / 2 },
  ];

  for (const w of walls) {
    const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w.x, w.h / 2, w.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    arenaGroup.add(mesh);
  }
}

function buildObstacles(theme) {
  const wallColor = new THREE.Color(theme.wall || '#5a5a5a');
  const mat = new THREE.MeshStandardMaterial({
    color: wallColor,
    roughness: 0.6,
    metalness: 0.15,
  });

  const wallHeight = 0.8;

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
  const glowColor = new THREE.Color(theme.doorGlow || '#90ee90');
  const wallHeight = 0.8;

  doorWallMeshes = [];

  // Build door wall segments
  for (const dw of (game.doorWalls || [])) {
    const { center, sx, sz } = obstacleTransform(dw);
    const geo = new THREE.BoxGeometry(sx, wallHeight, sz);
    const mat = new THREE.MeshStandardMaterial({
      color: doorColor,
      roughness: 0.5,
      metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center.x, wallHeight / 2, center.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    arenaGroup.add(mesh);
    doorWallMeshes.push(mesh);
  }

  // Build the actual door barrier (the part that disappears)
  // The door sits between the door walls at the top of the arena.
  // Estimate door position from doorWalls or from arena top.
  const a = arena();
  const doorCenterWorld = gameToWorld(a.w / 2, 0);

  // Door mesh — a thin plank across the opening
  const doorWidth = worldScale(a.cellSize * 2); // roughly 2 tiles wide
  const doorGeo = new THREE.BoxGeometry(doorWidth, wallHeight, 0.08);
  const doorMat = new THREE.MeshStandardMaterial({
    color: doorColor,
    roughness: 0.5,
    metalness: 0.2,
  });
  doorMesh = new THREE.Mesh(doorGeo, doorMat);
  doorMesh.position.set(doorCenterWorld.x, wallHeight / 2, doorCenterWorld.z);
  doorMesh.castShadow = true;
  arenaGroup.add(doorMesh);

  // Portal glow group (initially hidden)
  portalGroup = new THREE.Group();
  portalGroup.visible = false;

  // Emissive portal plane
  const portalGeo = new THREE.PlaneGeometry(doorWidth * 0.9, wallHeight * 0.9);
  const portalMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const portalPlane = new THREE.Mesh(portalGeo, portalMat);
  portalPlane.position.set(doorCenterWorld.x, wallHeight / 2, doorCenterWorld.z);
  portalGroup.add(portalPlane);

  // Point light at the doorway
  portalLight = new THREE.PointLight(glowColor, 2, 4);
  portalLight.position.set(doorCenterWorld.x, wallHeight / 2, doorCenterWorld.z);
  portalGroup.add(portalLight);

  arenaGroup.add(portalGroup);

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
    // Use enough segments for vertex displacement animation
    const geo = new THREE.PlaneGeometry(sx, sz, 8, 8);
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
  portalTime = 0;

  getScene().add(arenaGroup);
}

/**
 * Animate water, door glow, etc. Called each frame.
 * @param {number} dt - delta time in seconds
 */
export function updateArena(dt) {
  if (!arenaGroup) return;

  // ─── Water wave animation (vertex displacement) ───
  waterTime += dt;
  for (const mesh of waterMeshes) {
    const pos = mesh.geometry.attributes.position;
    const count = pos.count;
    // PlaneGeometry lies in XY before rotation; after -PI/2 rotation X->X, Y->Z
    // We modify the Z attribute (which becomes Y after rotation = vertical displacement)
    for (let i = 0; i < count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      // Small sine-based wave
      const wave = Math.sin(px * 8 + waterTime * 2.5) * 0.008 +
                   Math.cos(py * 6 + waterTime * 1.8) * 0.006;
      pos.setZ(i, wave);
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  // ─── Portal glow pulse ───
  if (portalGroup && portalGroup.visible) {
    portalTime += dt;
    const pulse = 0.6 + 0.4 * Math.sin(portalTime * 3);
    // Pulse the portal plane opacity and light intensity
    const portalPlane = portalGroup.children[0];
    if (portalPlane && portalPlane.material) {
      portalPlane.material.opacity = 0.5 + 0.3 * pulse;
      portalPlane.material.emissiveIntensity = 1.0 + 1.0 * pulse;
    }
    if (portalLight) {
      portalLight.intensity = 1.5 + 1.5 * pulse;
    }
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
  doorMesh = null;
  doorWallMeshes = [];
  portalGroup = null;
  portalLight = null;
  waterTime = 0;
  portalTime = 0;
}

/**
 * Show/hide door, show portal glow.
 * @param {boolean} open - true to open the door (hide barrier, show portal)
 */
export function setDoorOpen(open) {
  if (doorMesh) {
    doorMesh.visible = !open;
  }
  if (portalGroup) {
    portalGroup.visible = open;
    portalTime = 0;
  }
}
