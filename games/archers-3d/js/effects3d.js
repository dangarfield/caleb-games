// effects3d.js - 3D visual effects for bullets, particles, orbitals, summons, pickups
// Manages Three.js meshes synced to the 2D game state arrays each frame.

import * as THREE from 'three';
import { game } from './state.js';
import { T } from './arena.js';
import { BULLET_R, ENEMY_BULLET_R, CRYSTAL_R } from './constants.js';
import { gameToWorld, worldScale, getScene, getTime } from './renderer3d.js';

// ─── Constants ───

const PI = Math.PI;
const TAU = PI * 2;
const ORBIT_RADIUS_TILES = 0.99;       // orbital distance from player in tile units
const BULLET_HEIGHT = 0.35;            // default Y for bullets above the floor
const PARTICLE_HEIGHT = 0.3;
const CRYSTAL_HEIGHT = 0.45;
const HEART_HEIGHT = 0.35;
const ORBITAL_HEIGHT = 0.4;
const STUCK_ARROW_HEIGHT = 0.15;
const LOB_ARC_HEIGHT = 1.5;            // peak height for lobbed projectiles
const METEOR_START_HEIGHT = 5.0;       // meteors start this high

// Pool limits
const MAX_PLAYER_BULLETS = 128;
const MAX_ENEMY_BULLETS = 256;
const MAX_PARTICLES = 512;
const MAX_CRYSTALS = 64;
const MAX_HEARTS = 16;
const MAX_ORBITALS = 24;
const MAX_STRIKE_EFFECTS = 16;
const MAX_STRIKE_PROJECTILES = 24;
const MAX_STAR_PROJECTILES = 32;
const MAX_METEOR_PROJECTILES = 16;
const MAX_BOLT_ARCS = 24;
const MAX_STUCK_ARROWS = 64;

// ─── Material cache ───

const materialCache = new Map();

function getCachedMaterial(colorStr, opts = {}) {
  const key = colorStr + JSON.stringify(opts);
  if (materialCache.has(key)) return materialCache.get(key);

  const color = new THREE.Color(colorStr);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : color,
    emissiveIntensity: opts.emissiveIntensity ?? 0.4,
    roughness: opts.roughness ?? 0.3,
    metalness: opts.metalness ?? 0.1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
  });
  materialCache.set(key, mat);
  return mat;
}

function getLineMaterial(colorStr, opacity = 1.0) {
  const key = 'line_' + colorStr + '_' + opacity;
  if (materialCache.has(key)) return materialCache.get(key);
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(colorStr),
    transparent: opacity < 1,
    opacity,
  });
  materialCache.set(key, mat);
  return mat;
}

// ─── Shared geometries (created once) ───

let geoArrow;       // player bullet (elongated cone)
let geoHolyRing;    // torus for holy bullets
let geoSphere;      // unit sphere, scaled per use
let geoCone;        // small cone for arrow-type enemy bullets
let geoBox;         // unit box
let geoIcosa;       // icosahedron
let geoOcta;        // octahedron (crystals, star projectiles)
let geoTorus;       // torus for strike rings
let geoSword;       // elongated thin box for orbital swords

function ensureGeometries() {
  if (geoArrow) return;
  geoArrow = new THREE.ConeGeometry(0.03, 0.18, 6);
  geoArrow.rotateX(PI / 2); // point along +Z by default
  geoHolyRing = new THREE.TorusGeometry(0.06, 0.015, 8, 16);
  geoSphere = new THREE.SphereGeometry(1, 10, 8);
  geoCone = new THREE.ConeGeometry(0.025, 0.12, 5);
  geoCone.rotateX(PI / 2);
  geoBox = new THREE.BoxGeometry(1, 1, 1);
  geoIcosa = new THREE.IcosahedronGeometry(1, 0);
  geoOcta = new THREE.OctahedronGeometry(1, 0);
  geoTorus = new THREE.TorusGeometry(1, 0.12, 8, 24);
  geoTorus.rotateX(PI / 2); // lay flat
  geoSword = new THREE.BoxGeometry(0.025, 0.025, 0.2);
}

// ─── Groups & pools ───

let effectsGroup = null; // root THREE.Group in the scene

// Pool structure: { meshes: [THREE.Object3D], active: number }
// meshes[0..active-1] are visible; the rest are hidden and reusable.

const pools = {
  playerBullets: null,
  holyRings: null,
  enemyBullets: null,
  particles: null,
  crystals: null,
  hearts: null,
  orbitals: null,
  strikeEffects: null,
  strikeProjectiles: null,
  starProjectiles: null,
  meteorProjectiles: null,
  boltArcs: null,
  stuckArrows: null,
};

// ─── Pool helpers ───

function createPool(name, maxSize, createFn) {
  const group = new THREE.Group();
  group.name = 'pool_' + name;
  const meshes = [];
  for (let i = 0; i < maxSize; i++) {
    const obj = createFn(i);
    obj.visible = false;
    obj.frustumCulled = false;
    group.add(obj);
    meshes.push(obj);
  }
  effectsGroup.add(group);
  return { meshes, active: 0, group };
}

function hideAll(pool) {
  for (let i = 0; i < pool.active; i++) {
    pool.meshes[i].visible = false;
  }
  pool.active = 0;
}

function acquire(pool) {
  if (pool.active >= pool.meshes.length) return null;
  const obj = pool.meshes[pool.active];
  obj.visible = true;
  pool.active++;
  return obj;
}

// ─── Enemy bullet style helpers ───

const ENEMY_STYLE_CONFIG = {
  rock:    { geo: () => geoBox,   color: '#8B7355', scale: 0.3, emissiveIntensity: 0.1, tumble: true },
  acid:    { geo: () => geoSphere, color: '#2ecc71', scale: 0.25, emissiveIntensity: 0.5, transparent: true, opacity: 0.75 },
  arrow:   { geo: () => geoCone,  color: '#c8a96e', scale: 1, emissiveIntensity: 0.15, useConeGeo: true },
  fire:    { geo: () => geoSphere, color: '#ff6b2b', scale: 0.25, emissiveIntensity: 0.9 },
  ice:     { geo: () => geoIcosa, color: '#74b9ff', scale: 0.25, emissiveIntensity: 0.4 },
  bolt:    { geo: () => geoSphere, color: '#ffd32a', scale: 0.2, emissiveIntensity: 1.2, pointLight: true },
  skull:   { geo: () => geoSphere, color: '#2d2d2d', scale: 0.25, emissive: '#8e44ad', emissiveIntensity: 0.8 },
  default: { geo: () => geoSphere, color: '#e74c3c', scale: 0.25, emissiveIntensity: 0.5 },
};

// ─── Element colors for orbitals ───

const ELEM_COLORS = {
  fire: '#ff6b2b',
  ice: '#74b9ff',
  poison: '#2ecc71',
  bolt: '#ffd32a',
  obsidian: '#636e72',
};

// ─── Initialization ───

function initPools() {
  ensureGeometries();

  // Player bullets (arrows) — proper arrow shape: shaft + head + fletching
  pools.playerBullets = createPool('playerBullets', MAX_PLAYER_BULLETS, () => {
    const g = new THREE.Group();

    // Shaft — thin cylinder along Z
    const shaftLen = 0.22;
    const shaftGeo = new THREE.CylinderGeometry(0.008, 0.008, shaftLen, 4);
    shaftGeo.rotateX(PI / 2); // align along Z
    const shaftMat = getCachedMaterial('#8B6914', { emissiveIntensity: 0.15, roughness: 0.7 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.z = 0; // centered
    g.add(shaft);

    // Arrowhead — cone at front
    const headLen = 0.06;
    const headGeo = new THREE.ConeGeometry(0.02, headLen, 4);
    headGeo.rotateX(PI / 2); // point along +Z
    const headMat = getCachedMaterial('#cccccc', { emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.3 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.z = shaftLen / 2 + headLen / 2;
    g.add(head);

    // Fletching — two small angled planes at the tail
    const fletchGeo = new THREE.PlaneGeometry(0.04, 0.03);
    const fletchMat = getCachedMaterial('#00e5ff', { emissiveIntensity: 0.6, side: THREE.DoubleSide });
    for (const rot of [0, PI / 2]) {
      const fletch = new THREE.Mesh(fletchGeo, fletchMat);
      fletch.position.z = -shaftLen / 2 + 0.01;
      fletch.rotation.z = rot;
      g.add(fletch);
    }

    return g;
  });

  // Holy halos — blue-yellow glowing disc rings
  pools.holyRings = createPool('holyRings', MAX_PLAYER_BULLETS, () => {
    const g = new THREE.Group();
    // Outer ring — golden
    const outer = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.015, 8, 20),
      getCachedMaterial('#ffd700', { emissive: '#ffd700', emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
    );
    g.add(outer);
    // Inner glow disc — blue
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.065, 16),
      getCachedMaterial('#4fc3f7', { emissive: '#4fc3f7', emissiveIntensity: 1.0, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    g.add(inner);
    return g;
  });

  // Enemy bullets: each pool entry is a group with potential point light
  pools.enemyBullets = createPool('enemyBullets', MAX_ENEMY_BULLETS, () => {
    // We'll set geometry/material dynamically per style, but start with a sphere
    const mesh = new THREE.Mesh(geoSphere.clone(), getCachedMaterial('#e74c3c'));
    mesh.scale.setScalar(0.25);
    return mesh;
  });

  // Particles: use Points with BufferGeometry for efficiency
  initParticleSystem();

  // Crystals (gems)
  pools.crystals = createPool('crystals', MAX_CRYSTALS, () => {
    const mesh = new THREE.Mesh(geoOcta, getCachedMaterial('#a29bfe', {
      emissive: '#a29bfe', emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.15,
    }));
    mesh.scale.setScalar(0.25);
    return mesh;
  });

  // Hearts
  pools.hearts = createPool('hearts', MAX_HEARTS, () => {
    const mesh = new THREE.Mesh(geoSphere, getCachedMaterial('#ff6b81', {
      emissive: '#ff6b81', emissiveIntensity: 0.7, roughness: 0.2,
    }));
    mesh.scale.setScalar(0.2);
    return mesh;
  });

  // Orbitals — each pool entry is a Group with sub-meshes for all types (toggled by visibility)
  pools.orbitals = createPool('orbitals', MAX_ORBITALS, () => {
    const g = new THREE.Group();

    // ─── Circle: elemental orb — glowing core + outer ring ───
    const circleG = new THREE.Group();
    circleG.name = 'circle';
    const core = new THREE.Mesh(geoSphere, getCachedMaterial('#ff6b2b'));
    core.name = 'orbCore';
    core.scale.setScalar(0.14);
    circleG.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.02, 8, 16),
      getCachedMaterial('#ff6b2b', { transparent: true, opacity: 0.6 })
    );
    ring.name = 'orbRing';
    ring.rotation.x = PI / 2;
    circleG.add(ring);
    circleG.visible = false;
    g.add(circleG);

    // ─── Sword: blade + crossguard + handle ───
    const swordG = new THREE.Group();
    swordG.name = 'sword';
    // Blade
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.02, 0.28),
      getCachedMaterial('#c0c0c0', { metalness: 0.7, roughness: 0.2, emissiveIntensity: 0.3 })
    );
    blade.name = 'blade';
    blade.position.z = 0.08;
    swordG.add(blade);
    // Blade tip (tapered)
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.018, 0.06, 4),
      getCachedMaterial('#c0c0c0', { metalness: 0.7, roughness: 0.2, emissiveIntensity: 0.3 })
    );
    tip.rotation.x = PI / 2;
    tip.position.z = 0.25;
    swordG.add(tip);
    // Crossguard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.02, 0.02),
      getCachedMaterial('#DAA520', { metalness: 0.6, roughness: 0.3 })
    );
    guard.position.z = -0.06;
    swordG.add(guard);
    // Handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6),
      getCachedMaterial('#5a3a1e', { roughness: 0.8 })
    );
    handle.rotation.x = PI / 2;
    handle.position.z = -0.1;
    swordG.add(handle);
    // Pommel
    const pommel = new THREE.Mesh(geoSphere, getCachedMaterial('#DAA520', { metalness: 0.6 }));
    pommel.scale.setScalar(0.018);
    pommel.position.z = -0.14;
    swordG.add(pommel);
    swordG.visible = false;
    g.add(swordG);

    // ─── Shield: rounded front face + rim + boss ───
    const shieldG = new THREE.Group();
    shieldG.name = 'shield';
    // Shield face (flattened sphere)
    const face = new THREE.Mesh(
      geoSphere,
      getCachedMaterial('#4a7ab5', { transparent: true, opacity: 0.7, roughness: 0.3, metalness: 0.4 })
    );
    face.name = 'shieldFace';
    face.scale.set(0.18, 0.22, 0.04);
    shieldG.add(face);
    // Rim (flat ring around edge)
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(0.17, 0.2, 20),
      getCachedMaterial('#8B7355', { metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide })
    );
    shieldG.add(rim);
    // Center boss
    const boss = new THREE.Mesh(
      geoSphere,
      getCachedMaterial('#DAA520', { metalness: 0.7, roughness: 0.2 })
    );
    boss.scale.setScalar(0.04);
    boss.position.z = 0.04;
    shieldG.add(boss);
    shieldG.visible = false;
    g.add(shieldG);

    return g;
  });

  // Strike effects (expanding impact rings)
  pools.strikeEffects = createPool('strikeEffects', MAX_STRIKE_EFFECTS, () => {
    const mesh = new THREE.Mesh(geoTorus, getCachedMaterial('#ff6b2b', {
      emissiveIntensity: 1.0, transparent: true, opacity: 0.8,
    }));
    mesh.scale.setScalar(0.8);
    return mesh;
  });

  // Strike projectiles (glowing elemental swords)
  pools.strikeProjectiles = createPool('strikeProjectiles', MAX_STRIKE_PROJECTILES, () => {
    const g = new THREE.Group();
    // Blade
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.06, 0.35),
      getCachedMaterial('#ff6b2b', { emissiveIntensity: 1.2 })
    );
    blade.name = 'blade';
    blade.position.z = 0.08;
    g.add(blade);
    // Tip
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.1, 4),
      getCachedMaterial('#ff6b2b', { emissiveIntensity: 1.2 })
    );
    tip.name = 'tip';
    tip.rotation.x = -PI / 2;
    tip.position.z = 0.33;
    g.add(tip);
    // Crossguard
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.02),
      getCachedMaterial('#DAA520', { metalness: 0.6, roughness: 0.3 })
    );
    guard.position.z = -0.1;
    g.add(guard);
    // Handle
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6),
      getCachedMaterial('#8B4513', { emissiveIntensity: 0.1 })
    );
    handle.rotation.x = PI / 2;
    handle.position.z = -0.16;
    g.add(handle);
    // Glow sphere (transparent, large)
    const glow = new THREE.Mesh(
      geoSphere,
      getCachedMaterial('#ff6b2b', { emissiveIntensity: 0.8, transparent: true, opacity: 0.15 })
    );
    glow.name = 'glow';
    glow.scale.setScalar(0.25);
    g.add(glow);
    return g;
  });

  // Star projectiles (small bright sparks that drop from above)
  pools.starProjectiles = createPool('starProjectiles', MAX_STAR_PROJECTILES, () => {
    const g = new THREE.Group();
    // Core bright point
    const core = new THREE.Mesh(geoSphere, getCachedMaterial('#ffffff', { emissiveIntensity: 1.5 }));
    core.name = 'core';
    core.scale.setScalar(0.08);
    g.add(core);
    // Glow
    const glow = new THREE.Mesh(geoSphere, getCachedMaterial('#ffd32a', {
      emissiveIntensity: 1.0, transparent: true, opacity: 0.4,
    }));
    glow.name = 'glow';
    glow.scale.setScalar(0.2);
    g.add(glow);
    // Trail (elongated, stretched upward)
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.4, 6),
      getCachedMaterial('#ffd32a', { emissiveIntensity: 0.8, transparent: true, opacity: 0.3 })
    );
    trail.name = 'trail';
    trail.position.y = 0.25;
    g.add(trail);
    return g;
  });

  // Meteor projectiles (large fireballs with smoky trail)
  pools.meteorProjectiles = createPool('meteorProjectiles', MAX_METEOR_PROJECTILES, () => {
    const g = new THREE.Group();
    // Core fireball
    const core = new THREE.Mesh(geoSphere, getCachedMaterial('#ff6b2b', {
      emissive: '#ff4500', emissiveIntensity: 1.5,
    }));
    core.name = 'core';
    core.scale.setScalar(0.4);
    g.add(core);
    // Inner glow
    const glow = new THREE.Mesh(geoSphere, getCachedMaterial('#ffaa00', {
      emissiveIntensity: 1.0, transparent: true, opacity: 0.5,
    }));
    glow.name = 'glow';
    glow.scale.setScalar(0.55);
    g.add(glow);
    // Trail puffs (stacked above)
    for (let t = 0; t < 3; t++) {
      const puff = new THREE.Mesh(geoSphere, getCachedMaterial('#ff6b2b', {
        emissiveIntensity: 0.4, transparent: true, opacity: 0.2,
      }));
      puff.name = 'trail' + t;
      puff.scale.setScalar(0.3 - t * 0.07);
      puff.position.y = 0.5 + t * 0.35;
      g.add(puff);
    }
    return g;
  });

  // Bolt arcs
  pools.boltArcs = createPool('boltArcs', MAX_BOLT_ARCS, () => {
    const geo = new THREE.BufferGeometry();
    // Pre-allocate positions for up to 16 points per arc
    const positions = new Float32Array(16 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);
    const line = new THREE.Line(geo, getLineMaterial('#ffd32a'));
    return line;
  });

  // Stuck arrows
  pools.stuckArrows = createPool('stuckArrows', MAX_STUCK_ARROWS, () => {
    const mesh = new THREE.Mesh(geoCone, getCachedMaterial('#c8a96e', {
      emissiveIntensity: 0.1,
    }));
    return mesh;
  });
}

// ─── Particle system (Points-based) ───

let particleSystem = null;
let particlePositions = null;
let particleColors = null;
let particleSizes = null;
let particleAlphas = null;

function initParticleSystem() {
  const geo = new THREE.BufferGeometry();
  particlePositions = new Float32Array(MAX_PARTICLES * 3);
  particleColors = new Float32Array(MAX_PARTICLES * 3);
  particleSizes = new Float32Array(MAX_PARTICLES);
  particleAlphas = new Float32Array(MAX_PARTICLES);

  geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

  // Custom shader material for per-particle alpha and color
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAlphas: { value: particleAlphas },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vIndex;
      void main() {
        vColor = color;
        vIndex = float(gl_VertexID);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPos.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 32.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        // Soft circle shape
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.15, d);
        gl_FragColor = vec4(vColor, alpha * 0.85);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  particleSystem = new THREE.Points(geo, mat);
  particleSystem.frustumCulled = false;
  particleSystem.name = 'particleSystem';
  effectsGroup.add(particleSystem);
}

// ─── Color parsing helper ───

const colorParseCache = new Map();
const tmpColor = new THREE.Color();

function parseColor(str) {
  if (colorParseCache.has(str)) return colorParseCache.get(str);
  tmpColor.set(str);
  const result = { r: tmpColor.r, g: tmpColor.g, b: tmpColor.b };
  colorParseCache.set(str, result);
  return result;
}

// ─── Sync functions ───

function syncPlayerBullets() {
  hideAll(pools.playerBullets);
  hideAll(pools.holyRings);

  const arrowColor = game.player?.arrowColor || '#00e5ff';
  const arrowMat = getCachedMaterial(arrowColor, { emissiveIntensity: 0.6 });

  for (let i = 0; i < game.bullets.length; i++) {
    const b = game.bullets[i];
    const mesh = acquire(pools.playerBullets);
    if (!mesh) break;

    const pos = gameToWorld(b.x, b.y);
    mesh.position.set(pos.x, BULLET_HEIGHT, pos.z);

    // Rotate arrow to face travel direction
    // b.ang is in 2D game space (0 = right, PI/2 = down)
    // In 3D: game X -> world X, game Y -> world -Z
    mesh.rotation.set(0, 0, 0);
    mesh.rotation.y = -(b.ang || 0) + PI / 2;

    // Update shaft color to match weapon rarity, head and fletching stay fixed
    mesh.traverse((child) => {
      if (child.isMesh && child.geometry.type === 'CylinderGeometry') {
        child.material = arrowMat;
      }
    });

    // Scale based on damage (slightly larger for stronger arrows)
    const dmgScale = Math.min(1 + (b.dmg || 10) / 80, 1.5) * 3;
    mesh.scale.set(dmgScale, dmgScale, dmgScale);

    // Holy bullets: show halo instead of arrow
    if (b.isHoly) {
      mesh.visible = false; // hide the arrow
      const ring = acquire(pools.holyRings);
      if (ring) {
        const pos = gameToWorld(b.x, b.y);
        ring.position.set(pos.x, BULLET_HEIGHT, pos.z);
        // Lay flat (horizontal) and spin based on travel direction
        ring.rotation.set(-PI / 2, 0, -(b.ang || 0));
        const haloScale = 2.5;
        ring.scale.setScalar(haloScale);
      }
    }
  }
}

function syncEnemyBullets() {
  hideAll(pools.enemyBullets);

  const time = getTime();

  for (let i = 0; i < game.enemyBullets.length; i++) {
    const eb = game.enemyBullets[i];
    const mesh = acquire(pools.enemyBullets);
    if (!mesh) break;

    const style = ENEMY_STYLE_CONFIG[eb.style] || ENEMY_STYLE_CONFIG.default;
    const pos = gameToWorld(eb.x, eb.y);
    let worldY = BULLET_HEIGHT;

    // Lobbed projectiles arc through the air
    if (eb.lobbed && eb.lobProgress !== undefined) {
      worldY += Math.sin(eb.lobProgress * PI) * LOB_ARC_HEIGHT;
    }

    mesh.position.set(pos.x, worldY, pos.z);

    // Set geometry and material based on style
    const targetGeo = style.geo();
    if (mesh.geometry !== targetGeo && !style.useConeGeo) {
      mesh.geometry = targetGeo;
    } else if (style.useConeGeo) {
      mesh.geometry = geoCone;
    }

    const matOpts = {
      emissive: style.emissive || style.color,
      emissiveIntensity: style.emissiveIntensity,
      transparent: style.transparent || false,
      opacity: style.opacity ?? 1.0,
    };
    mesh.material = getCachedMaterial(style.color, matOpts);

    // Scale
    if (style.useConeGeo) {
      mesh.scale.set(1, 1, 1);
    } else {
      mesh.scale.setScalar(style.scale);
    }

    // Rotation based on style
    if (style.tumble) {
      // Rock: tumble rotation over time
      mesh.rotation.set(time * 4.5, time * 3.2, time * 2.1);
    } else if (style.useConeGeo || eb.style === 'arrow') {
      // Arrow-type: face travel direction
      const ang = eb.ang ?? Math.atan2(eb.vy || 0, eb.vx || 0);
      mesh.rotation.set(0, -ang + PI / 2, 0);
    } else {
      // Reset rotation for spheres
      mesh.rotation.set(0, 0, 0);
    }
  }
}

function syncParticles() {
  const count = Math.min(game.particles.length, MAX_PARTICLES);

  for (let i = 0; i < count; i++) {
    const p = game.particles[i];
    const pos = gameToWorld(p.x, p.y);

    const idx3 = i * 3;
    particlePositions[idx3] = pos.x;
    particlePositions[idx3 + 1] = PARTICLE_HEIGHT + Math.random() * 0.05;
    particlePositions[idx3 + 2] = pos.z;

    const lifeRatio = p.life / (p.maxLife || 1);
    const col = parseColor(p.color || '#ffffff');
    particleColors[idx3] = col.r;
    particleColors[idx3 + 1] = col.g;
    particleColors[idx3 + 2] = col.b;

    // Size: map the 2D radius (in pixels) to a 3D point size
    const baseSize = worldScale(p.r || 3) * 50;
    particleSizes[i] = baseSize * lifeRatio;
    particleAlphas[i] = lifeRatio;
  }

  // Zero out remaining slots
  for (let i = count; i < MAX_PARTICLES; i++) {
    particleSizes[i] = 0;
  }

  // Update buffer attributes
  const geo = particleSystem.geometry;
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.attributes.size.needsUpdate = true;
  geo.setDrawRange(0, count);
}

function syncCrystals() {
  hideAll(pools.crystals);

  const time = getTime();

  for (let i = 0; i < game.crystals.length; i++) {
    const c = game.crystals[i];
    const mesh = acquire(pools.crystals);
    if (!mesh) break;

    const pos = gameToWorld(c.x, c.y);
    const bob = Math.sin((c.bobPhase || 0) + time * 3) * 0.08;
    mesh.position.set(pos.x, CRYSTAL_HEIGHT + bob, pos.z);

    // Gentle spin
    mesh.rotation.y = time * 1.5 + (c.bobPhase || 0);
    mesh.rotation.z = 0.3;
  }
}

function syncHearts() {
  hideAll(pools.hearts);

  const time = getTime();

  for (let i = 0; i < game.hearts.length; i++) {
    const h = game.hearts[i];
    const mesh = acquire(pools.hearts);
    if (!mesh) break;

    const pos = gameToWorld(h.x, h.y);
    const bob = Math.sin((h.bobPhase || 0) + time * 2.5) * 0.06;
    mesh.position.set(pos.x, HEART_HEIGHT + bob, pos.z);

    // Gentle pulse
    const pulse = 1 + Math.sin(time * 4 + (h.bobPhase || 0)) * 0.12;
    mesh.scale.setScalar(0.2 * pulse);
  }
}

function syncOrbitals() {
  hideAll(pools.orbitals);

  const p = game.player;
  if (!p) return;

  const playerPos = gameToWorld(p.x, p.y);
  const orbitR = worldScale(ORBIT_RADIUS_TILES * T());

  for (let i = 0; i < game.orbitals.length; i++) {
    const o = game.orbitals[i];
    const mesh = acquire(pools.orbitals);
    if (!mesh) break;

    const ox = playerPos.x + Math.cos(o.angle) * orbitR;
    const oz = playerPos.z - Math.sin(o.angle) * orbitR;
    mesh.position.set(ox, ORBITAL_HEIGHT, oz);

    const elemColor = ELEM_COLORS[o.element] || '#ffffff';
    const time = getTime();

    // Hide all sub-groups, then show the right one
    const circleG = mesh.getObjectByName('circle');
    const swordG = mesh.getObjectByName('sword');
    const shieldG = mesh.getObjectByName('shield');
    if (circleG) circleG.visible = false;
    if (swordG) swordG.visible = false;
    if (shieldG) shieldG.visible = false;

    if (o.type === 'circle' && circleG) {
      circleG.visible = true;
      // Color the core and ring
      const core = circleG.getObjectByName('orbCore');
      const ring = circleG.getObjectByName('orbRing');
      if (core) core.material = getCachedMaterial(elemColor, { emissiveIntensity: 0.9 });
      if (ring) ring.material = getCachedMaterial(elemColor, { emissiveIntensity: 0.6, transparent: true, opacity: 0.5 });
      // Gentle spin and bob
      mesh.rotation.set(0, 0, 0);
      if (ring) ring.rotation.set(PI / 2 + Math.sin(time * 3 + i) * 0.3, time * 2, 0);
      mesh.scale.setScalar(2);
    } else if (o.type === 'sword' && swordG) {
      swordG.visible = true;
      // Tint blade with element color
      const blade = swordG.getObjectByName('blade');
      if (blade) blade.material = getCachedMaterial(elemColor, { metalness: 0.6, roughness: 0.2, emissiveIntensity: 0.5 });
      // Sword points tangent to orbit, angled outward
      mesh.rotation.set(0, o.angle + PI / 2, PI / 6);
      mesh.scale.setScalar(2);
    } else if (o.type === 'shield' && shieldG) {
      shieldG.visible = true;
      // Shield faces outward from player
      const face = shieldG.getObjectByName('shieldFace');
      if (face) face.material = getCachedMaterial(elemColor, { transparent: true, opacity: 0.6, roughness: 0.3, metalness: 0.4 });
      mesh.rotation.set(0, o.angle + PI / 2, 0);
      mesh.scale.setScalar(2);
    }
  }
}

function syncStrikeEffects() {
  hideAll(pools.strikeEffects);

  for (let i = 0; i < game.strikeEffects.length; i++) {
    const se = game.strikeEffects[i];
    const mesh = acquire(pools.strikeEffects);
    if (!mesh) break;

    const pos = gameToWorld(se.x, se.y);
    const lifeRatio = se.life / (se.maxLife || 1);
    const progress = 1 - lifeRatio;

    mesh.position.set(pos.x, 0.3, pos.z);

    const maxRadius = worldScale(se.r || 40);
    const currentRadius = maxRadius * (0.5 + progress * 0.5);
    mesh.scale.setScalar(currentRadius * 1.8);

    const seColor = se.color || '#ff6b2b';
    const quantizedOpacity = Math.round(lifeRatio * 4) / 4;
    mesh.material = getCachedMaterial(seColor, {
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: Math.max(0.2, quantizedOpacity),
    });
  }
}

function syncStrikeProjectiles() {
  hideAll(pools.strikeProjectiles);

  const time = getTime();

  for (let i = 0; i < game.strikeProjectiles.length; i++) {
    const s = game.strikeProjectiles[i];
    const group = acquire(pools.strikeProjectiles);
    if (!group) break;

    const pos = gameToWorld(s.x, s.y);
    const hovering = s.hoverTimer > 0;

    // Height: hover at player level, then fly at 0.5
    const h = hovering ? 0.6 + Math.sin(time * 8) * 0.05 : 0.45;
    group.position.set(pos.x, h, pos.z);

    // Face direction of travel
    const ang = s.ang || 0;
    group.rotation.set(0, -ang + PI / 2, 0);

    // Slight bob while hovering
    if (hovering) {
      group.scale.setScalar(0.9 + Math.sin(time * 12) * 0.1);
    } else {
      group.scale.setScalar(1.0);
    }

    // Color the blade and tip to match element
    const sColor = s.color || '#ff6b2b';
    const bladeMat = getCachedMaterial(sColor, { emissiveIntensity: 1.2 });
    const glowMat = getCachedMaterial(sColor, { emissiveIntensity: 0.8, transparent: true, opacity: 0.15 });
    group.traverse(child => {
      if (child.isMesh) {
        if (child.name === 'blade' || child.name === 'tip') child.material = bladeMat;
        if (child.name === 'glow') child.material = glowMat;
      }
    });
  }
}

function syncStarProjectiles() {
  hideAll(pools.starProjectiles);

  for (let i = 0; i < game.starProjectiles.length; i++) {
    const sp = game.starProjectiles[i];
    const group = acquire(pools.starProjectiles);
    if (!group) break;

    const pos = gameToWorld(sp.x, sp.y);

    // Height: drops from above (map game Y distance to 3D Y)
    let starHeight;
    if (sp.targetY !== undefined && sp.startY !== undefined) {
      const totalDist = Math.abs(sp.targetY - sp.startY) || 1;
      const remaining = Math.abs(sp.targetY - sp.y);
      const progress = 1 - remaining / totalDist;
      starHeight = 4.0 * (1 - Math.max(0, Math.min(1, progress)));
    } else {
      starHeight = 0.3;
    }

    group.position.set(pos.x, Math.max(0.1, starHeight), pos.z);

    // Color core + glow to match element
    const sColor = sp.color || '#ffd32a';
    group.traverse(child => {
      if (child.isMesh) {
        if (child.name === 'core') child.material = getCachedMaterial('#ffffff', { emissiveIntensity: 1.5 });
        if (child.name === 'glow') child.material = getCachedMaterial(sColor, { emissiveIntensity: 1.0, transparent: true, opacity: 0.4 });
        if (child.name === 'trail') child.material = getCachedMaterial(sColor, { emissiveIntensity: 0.8, transparent: true, opacity: 0.3 });
      }
    });

    // Scale: 2x base, brighter as it gets close
    const brightScale = (0.8 + (1 - starHeight / 4.0) * 0.4) * 2.0;
    group.scale.setScalar(brightScale);
  }
}

function syncMeteorProjectiles() {
  hideAll(pools.meteorProjectiles);

  for (let i = 0; i < game.meteorProjectiles.length; i++) {
    const m = game.meteorProjectiles[i];
    const group = acquire(pools.meteorProjectiles);
    if (!group) break;

    // Map current 2D position to 3D XZ
    const pos = gameToWorld(m.x, m.y);

    // Arc height: parabolic arc peaking at midpoint of travel
    let meteorY = 0.5;
    if (m.startX !== undefined && m.targetX !== undefined) {
      const totalDist = Math.sqrt((m.targetX - m.startX) ** 2 + (m.targetY - m.startY) ** 2) || 1;
      const traveled = Math.sqrt((m.x - m.startX) ** 2 + (m.y - m.startY) ** 2);
      const t = Math.min(1, traveled / totalDist); // 0 at start, 1 at target
      // Parabolic arc: peaks near start, max height = 2x METEOR_START_HEIGHT
      const peakHeight = METEOR_START_HEIGHT * 2;
      meteorY = peakHeight * 4 * t * (1 - t) * 0.8;
      // Add base height that decreases as it approaches ground
      meteorY += peakHeight * (1 - t) * 0.3;
    }

    group.position.set(pos.x, Math.max(0.15, meteorY), pos.z);

    // Face direction of travel
    group.rotation.set(0, -m.ang + PI / 2, 0);

    // Color core + glow to match element
    const mColor = m.color || '#ff6b2b';
    group.traverse(child => {
      if (child.isMesh) {
        if (child.name === 'core') child.material = getCachedMaterial(mColor, { emissive: '#ff4500', emissiveIntensity: 1.5 });
        if (child.name === 'glow') child.material = getCachedMaterial(mColor, { emissiveIntensity: 1.0, transparent: true, opacity: 0.5 });
      }
    });

    // Scale by AoE radius
    const mScale = worldScale((m.r || 20) * 2) * 1.0;
    group.scale.setScalar(Math.max(0.3, mScale));
  }
}

function syncBoltArcs() {
  hideAll(pools.boltArcs);

  for (let i = 0; i < game.boltArcs.length; i++) {
    const arc = game.boltArcs[i];
    const line = acquire(pools.boltArcs);
    if (!line) break;

    const pts = arc.pts;
    if (!pts || pts.length < 2) { line.visible = false; continue; }

    const geo = line.geometry;
    const posAttr = geo.attributes.position;
    const count = Math.min(pts.length, 16);

    for (let j = 0; j < count; j++) {
      const wp = gameToWorld(pts[j].x, pts[j].y);
      posAttr.setXYZ(j, wp.x, 0.4, wp.z);
    }
    posAttr.needsUpdate = true;
    geo.setDrawRange(0, count);

    // Fade with life
    const alpha = Math.max(0, arc.life / 0.15);
    line.material = getLineMaterial('#ffd32a', Math.min(1, alpha));
  }
}

function syncStuckArrows() {
  hideAll(pools.stuckArrows);

  for (let i = 0; i < game.stuckArrows.length; i++) {
    const sa = game.stuckArrows[i];
    const mesh = acquire(pools.stuckArrows);
    if (!mesh) break;

    const pos = gameToWorld(sa.x, sa.y);
    mesh.position.set(pos.x, STUCK_ARROW_HEIGHT, pos.z);

    // Face the angle the arrow was traveling
    const ang = sa.ang || 0;
    mesh.rotation.set(0, -ang + PI / 2, 0);

    // Fade with remaining life
    const lifeRatio = (sa.life || 0) / 2.0; // assume maxLife ~2s
    const alpha = Math.max(0.05, Math.min(1, lifeRatio));
    mesh.material = getCachedMaterial('#c8a96e', {
      emissiveIntensity: 0.1 * alpha,
      transparent: alpha < 0.95,
      opacity: alpha,
    });
  }
}

// ─── Exported API ───

/**
 * Called each frame to synchronize all 3D effect meshes with the game state.
 */
export function syncEffects() {
  if (!effectsGroup) {
    effectsGroup = new THREE.Group();
    effectsGroup.name = 'effectsGroup';
    getScene().add(effectsGroup);
    initPools();
  }

  syncPlayerBullets();
  syncEnemyBullets();
  syncParticles();
  syncCrystals();
  syncHearts();
  syncOrbitals();
  syncStrikeEffects();
  syncStrikeProjectiles();
  syncStarProjectiles();
  syncMeteorProjectiles();
  syncBoltArcs();
  syncStuckArrows();
}

/**
 * Remove all effect meshes from the scene. Called on stage transitions.
 */
export function clearEffects() {
  if (!effectsGroup) return;

  // Hide all pool objects
  for (const key of Object.keys(pools)) {
    if (pools[key]) hideAll(pools[key]);
  }

  // Dispose and remove from scene
  effectsGroup.traverse((child) => {
    if (child.isMesh || child.isLine || child.isPoints) {
      if (child.geometry && !isSharedGeometry(child.geometry)) {
        child.geometry.dispose();
      }
    }
  });

  getScene().remove(effectsGroup);
  effectsGroup = null;

  // Reset pools
  for (const key of Object.keys(pools)) {
    pools[key] = null;
  }

  // Reset particle system references
  particleSystem = null;
  particlePositions = null;
  particleColors = null;
  particleSizes = null;
  particleAlphas = null;

  // Note: shared geometries (geoArrow, etc.) are NOT disposed — they persist
  // across stages for reuse. Materials in the cache also persist.
}

/**
 * Check whether a geometry is one of the shared/reused ones that should not be disposed.
 */
function isSharedGeometry(geo) {
  return geo === geoArrow || geo === geoHolyRing || geo === geoSphere ||
         geo === geoCone || geo === geoBox || geo === geoIcosa ||
         geo === geoOcta || geo === geoTorus || geo === geoSword;
}
