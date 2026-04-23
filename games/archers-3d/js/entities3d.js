// entities3d.js - 3D mesh management for all game entities
// Manages player, enemies, shadow clone, and angel meshes in Three.js

import * as THREE from 'three';
import { game } from './state.js';
import { T } from './arena.js';
import { gameToWorld, worldScale, getScene, getTime } from './renderer3d.js';
import { PLAYER_R } from './constants.js';

// Shorthand to avoid repetition
const MeshStdMat = THREE.MeshStandardMaterial;

// ─── Geometry & Material Caches ─────────────────────────────────────────────

const geoCache = {};
function cachedGeo(key, factory) {
  if (!geoCache[key]) geoCache[key] = factory();
  return geoCache[key];
}

const matCache = new Map();
function cachedStdMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const c = new THREE.Color(color);
    matCache.set(key, new MeshStdMat({
      color: c,
      emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : c.clone().multiplyScalar(0.15),
      emissiveIntensity: opts.emissiveIntensity || 0.4,
      metalness: opts.metalness !== undefined ? opts.metalness : 0.2,
      roughness: opts.roughness !== undefined ? opts.roughness : 0.6,
      transparent: opts.transparent || false,
      opacity: opts.opacity !== undefined ? opts.opacity : 1.0,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    }));
  }
  return matCache.get(key);
}

// ─── Shared Geometries (created lazily) ─────────────────────────────────────

function sphereGeo()   { return cachedGeo('sphere',   () => new THREE.SphereGeometry(1, 16, 12)); }
function boxGeo()      { return cachedGeo('box',      () => new THREE.BoxGeometry(1, 1, 1)); }
function cylGeo()      { return cachedGeo('cyl',      () => new THREE.CylinderGeometry(1, 1, 1, 12)); }
function coneGeo()     { return cachedGeo('cone',     () => new THREE.ConeGeometry(1, 1, 12)); }
function planeGeo()    { return cachedGeo('plane',    () => new THREE.PlaneGeometry(1, 1)); }
function capsuleGeo()  { return cachedGeo('capsule',  () => new THREE.CapsuleGeometry(1, 1, 8, 12)); }
function discGeo()     { return cachedGeo('disc',     () => new THREE.CircleGeometry(1, 16)); }

// ─── Mesh Helpers ───────────────────────────────────────────────────────────

function mkMesh(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function mkGroup() {
  return new THREE.Group();
}

// ─── Player Mesh ────────────────────────────────────────────────────────────

let playerGroup = null;
let playerLight = null;
let playerBodyMat = null;

function createPlayerMesh(color) {
  const g = mkGroup();
  g.name = 'player';

  const r = 0.44; // PLAYER_R in world units

  // Body sphere
  playerBodyMat = new MeshStdMat({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.35,
    metalness: 0.3,
    roughness: 0.6,
    transparent: true,
    opacity: 1.0,
  });
  const body = mkMesh(sphereGeo(), playerBodyMat);
  body.scale.setScalar(r);
  body.position.y = r;
  g.add(body);

  // Direction indicator cone
  const dirMat = new MeshStdMat({
    color: 0xffffff,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.5,
    metalness: 0.1,
    roughness: 0.7,
  });
  const dir = mkMesh(coneGeo(), dirMat);
  dir.name = 'dirCone';
  dir.scale.set(r * 0.3, r * 0.5, r * 0.3);
  dir.position.set(0, r, r * 0.7);
  dir.rotation.x = Math.PI / 2;
  g.add(dir);

  // Subtle glow light
  playerLight = new THREE.PointLight(new THREE.Color(color), 0.6, 4);
  playerLight.position.y = r;
  g.add(playerLight);

  g.castShadow = true;
  return g;
}

function syncPlayer() {
  const scene = getScene();
  if (!scene) return;
  const p = game.player;
  if (!p) {
    if (playerGroup) { scene.remove(playerGroup); playerGroup = null; }
    return;
  }

  const color = p.armorColor || '#00e5ff';

  if (!playerGroup) {
    playerGroup = createPlayerMesh(color);
    scene.add(playerGroup);
  }

  // Update color if changed
  if (playerBodyMat && playerBodyMat.color.getHexString() !== new THREE.Color(color).getHexString()) {
    const c = new THREE.Color(color);
    playerBodyMat.color.copy(c);
    playerBodyMat.emissive.copy(c);
    if (playerLight) playerLight.color.copy(c);
  }

  // Position
  const pos = gameToWorld(p.x, p.y);
  playerGroup.position.set(pos.x, 0, pos.z);

  // Facing direction: rotate the dir cone around Y
  const fa = p._facingAngle !== undefined ? p._facingAngle : -Math.PI / 2;
  const dirCone = playerGroup.getObjectByName('dirCone');
  if (dirCone) {
    const r = 0.44;
    dirCone.position.set(Math.cos(fa) * r * 0.7, r, -Math.sin(fa) * r * 0.7);
    dirCone.rotation.set(0, 0, 0);
    dirCone.lookAt(
      playerGroup.position.x + Math.cos(fa) * 2,
      r,
      playerGroup.position.z - Math.sin(fa) * 2
    );
    // Cone geometry points up by default; after lookAt, tilt so tip points forward
    dirCone.rotateX(Math.PI / 2);
  }

  // iFrame flash
  if (game.iFrames > 0) {
    const flash = Math.sin(getTime() * 20) > 0 ? 0.3 : 1.0;
    playerBodyMat.opacity = flash;
  } else {
    playerBodyMat.opacity = 1.0;
  }
}

// ─── Enemy Mesh Factories ───────────────────────────────────────────────────
// Each factory returns a THREE.Group sized for unit radius (scale applied later)

function makeBat(color, colorAlt) {
  const g = mkGroup();
  const mat = cachedStdMat(color);
  const wingMat = cachedStdMat(colorAlt || color, { doubleSide: true });

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.6, 0.8, 0.6);
  g.add(body);

  // Eyes
  const eyeMat = cachedStdMat('#ffffff');
  const pupilMat = cachedStdMat('#000000');
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.12);
    eye.position.set(side * 0.2, 0.15, 0.45);
    g.add(eye);
    const pupil = mkMesh(sphereGeo(), pupilMat);
    pupil.scale.setScalar(0.06);
    pupil.position.set(side * 0.18, 0.15, 0.5);
    g.add(pupil);
  }

  // Wings (flat triangles using PlaneGeometry)
  for (const side of [-1, 1]) {
    const wing = mkMesh(planeGeo(), wingMat);
    wing.name = side === -1 ? 'wingL' : 'wingR';
    wing.scale.set(0.9, 0.7, 1);
    wing.position.set(side * 0.7, 0.1, 0);
    g.add(wing);
  }

  return g;
}

function makeWolf(color, colorAlt) {
  const g = mkGroup();
  const mat = cachedStdMat(color);
  const earMat = cachedStdMat(colorAlt || color);

  // Body (elongated capsule)
  const body = mkMesh(capsuleGeo(), mat);
  body.scale.set(0.5, 0.55, 0.8);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  // Head
  const head = mkMesh(sphereGeo(), mat);
  head.scale.setScalar(0.4);
  head.position.set(0, 0.2, 0.6);
  g.add(head);

  // Ears
  for (const side of [-1, 1]) {
    const ear = mkMesh(coneGeo(), earMat);
    ear.scale.set(0.12, 0.3, 0.1);
    ear.position.set(side * 0.2, 0.55, 0.5);
    g.add(ear);
  }

  return g;
}

function makeBomb(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  const body = mkMesh(sphereGeo(), mat);
  body.scale.setScalar(0.8);
  g.add(body);

  // Fuse
  const fuseMat = cachedStdMat('#8B4513');
  const fuse = mkMesh(cylGeo(), fuseMat);
  fuse.scale.set(0.08, 0.35, 0.08);
  fuse.position.y = 0.9;
  g.add(fuse);

  // Spark at fuse tip
  const sparkMat = cachedStdMat('#ff6600', { emissive: '#ff6600', emissiveIntensity: 1.5 });
  const spark = mkMesh(sphereGeo(), sparkMat);
  spark.name = 'spark';
  spark.scale.setScalar(0.08);
  spark.position.y = 1.1;
  g.add(spark);

  return g;
}

function makePlant(color, colorAlt) {
  const g = mkGroup();

  // Stem
  const stemMat = cachedStdMat('#228B22');
  const stem = mkMesh(cylGeo(), stemMat);
  stem.scale.set(0.15, 0.7, 0.15);
  stem.position.y = -0.15;
  g.add(stem);

  // Flower head
  const headMat = cachedStdMat(color);
  const head = mkMesh(sphereGeo(), headMat);
  head.scale.setScalar(0.5);
  head.position.y = 0.5;
  g.add(head);

  // Petals (optional alt color)
  if (colorAlt) {
    const petalMat = cachedStdMat(colorAlt, { doubleSide: true });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const petal = mkMesh(discGeo(), petalMat);
      petal.scale.setScalar(0.2);
      petal.position.set(Math.cos(a) * 0.45, 0.5, Math.sin(a) * 0.45);
      petal.lookAt(0, 0.5, 0);
      g.add(petal);
    }
  }

  return g;
}

function makeStump(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  const trunk = mkMesh(cylGeo(), mat);
  trunk.scale.set(0.7, 0.6, 0.7);
  g.add(trunk);

  // Top ring (darker)
  const topMat = cachedStdMat('#3e2723');
  const ring = mkMesh(cylGeo(), topMat);
  ring.scale.set(0.72, 0.08, 0.72);
  ring.position.y = 0.3;
  g.add(ring);

  return g;
}

function makeGolem(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color, { metalness: 0.4, roughness: 0.8 });

  // Body (large box)
  const body = mkMesh(boxGeo(), mat);
  body.scale.set(0.9, 1.0, 0.7);
  g.add(body);

  // Head (smaller box)
  const head = mkMesh(boxGeo(), mat);
  head.scale.set(0.5, 0.4, 0.5);
  head.position.y = 0.7;
  g.add(head);

  // Eyes
  const eyeMat = cachedStdMat('#ff4400', { emissive: '#ff4400', emissiveIntensity: 1.0 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.08);
    eye.position.set(side * 0.15, 0.75, 0.26);
    g.add(eye);
  }

  return g;
}

function makeSlime(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color, { transparent: true, opacity: 0.8 });

  const body = mkMesh(sphereGeo(), mat);
  body.name = 'slimeBody';
  body.scale.set(0.8, 0.6, 0.8);
  g.add(body);

  // Eyes
  const eyeMat = cachedStdMat('#ffffff');
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.name = side === -1 ? 'eyeL' : 'eyeR';
    eye.scale.setScalar(0.1);
    eye.position.set(side * 0.2, 0.2, 0.4);
    g.add(eye);
  }

  return g;
}

function makeSkeleton(color) {
  const g = mkGroup();
  const boneMat = cachedStdMat(color || '#e0d8c8');

  // Body (thin cylinder)
  const body = mkMesh(cylGeo(), boneMat);
  body.scale.set(0.2, 0.8, 0.2);
  g.add(body);

  // Skull head
  const skull = mkMesh(sphereGeo(), boneMat);
  skull.scale.setScalar(0.35);
  skull.position.y = 0.65;
  g.add(skull);

  // Eye sockets
  const darkMat = cachedStdMat('#1a1a1a');
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), darkMat);
    eye.scale.setScalar(0.08);
    eye.position.set(side * 0.12, 0.7, 0.28);
    g.add(eye);
  }

  // Ribs
  for (let i = 0; i < 3; i++) {
    const rib = mkMesh(boxGeo(), boneMat);
    rib.scale.set(0.5, 0.04, 0.15);
    rib.position.y = -0.05 + i * 0.18;
    g.add(rib);
  }

  return g;
}

function makeSkull(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#d4c9a8');

  const skull = mkMesh(sphereGeo(), mat);
  skull.scale.setScalar(0.85);
  g.add(skull);

  // Eye sockets
  const darkMat = cachedStdMat('#1a1a1a');
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), darkMat);
    eye.scale.setScalar(0.18);
    eye.position.set(side * 0.28, 0.12, 0.65);
    g.add(eye);
  }

  // Jaw
  const jaw = mkMesh(boxGeo(), mat);
  jaw.scale.set(0.45, 0.12, 0.25);
  jaw.position.set(0, -0.35, 0.45);
  g.add(jaw);

  return g;
}

function makeDragon(color, colorAlt) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.8, 0.7, 0.9);
  g.add(body);

  // Head (cone snout)
  const head = mkMesh(coneGeo(), mat);
  head.scale.set(0.3, 0.5, 0.3);
  head.position.set(0, 0.3, 0.7);
  head.rotation.x = Math.PI / 2;
  g.add(head);

  // Wings
  const wingMat = cachedStdMat(colorAlt || color, { doubleSide: true });
  for (const side of [-1, 1]) {
    const wing = mkMesh(planeGeo(), wingMat);
    wing.scale.set(0.8, 0.6, 1);
    wing.position.set(side * 0.7, 0.3, -0.1);
    wing.rotation.y = side * 0.3;
    g.add(wing);
  }

  // Eyes
  const eyeMat = cachedStdMat('#ff3300', { emissive: '#ff3300', emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.08);
    eye.position.set(side * 0.18, 0.4, 0.6);
    g.add(eye);
  }

  return g;
}

function makeCrocodile(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Elongated body
  const body = mkMesh(boxGeo(), mat);
  body.scale.set(0.5, 0.35, 1.3);
  g.add(body);

  // Snout (triangular box)
  const snout = mkMesh(coneGeo(), mat);
  snout.scale.set(0.25, 0.6, 0.2);
  snout.position.set(0, 0.05, 0.85);
  snout.rotation.x = Math.PI / 2;
  g.add(snout);

  // Eyes
  const eyeMat = cachedStdMat('#ffff00', { emissive: '#aaaa00', emissiveIntensity: 0.6 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.07);
    eye.position.set(side * 0.2, 0.22, 0.5);
    g.add(eye);
  }

  return g;
}

function makeSnake(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Series of spheres in S-curve
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const seg = mkMesh(sphereGeo(), mat);
    const sz = 0.18 - t * 0.06; // taper toward tail
    seg.scale.setScalar(sz);
    seg.position.set(
      Math.sin(t * Math.PI * 2) * 0.25,
      sz,
      (t - 0.5) * 1.2
    );
    seg.name = `seg${i}`;
    g.add(seg);
  }

  // Head eyes
  const eyeMat = cachedStdMat('#ff0000', { emissive: '#ff0000', emissiveIntensity: 0.8 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.04);
    eye.position.set(side * 0.08, 0.22, -0.6);
    g.add(eye);
  }

  return g;
}

function makeSpider(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.5, 0.35, 0.5);
  g.add(body);

  // Abdomen
  const abdomen = mkMesh(sphereGeo(), mat);
  abdomen.scale.set(0.4, 0.3, 0.45);
  abdomen.position.set(0, 0, -0.4);
  g.add(abdomen);

  // 8 legs
  const legMat = cachedStdMat(color, { roughness: 0.8 });
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const idx = i % 4;
    const leg = mkMesh(cylGeo(), legMat);
    leg.scale.set(0.03, 0.6, 0.03);
    const angle = ((idx - 1.5) / 3) * 0.8;
    leg.position.set(
      side * 0.45,
      -0.1,
      angle * 0.5
    );
    leg.rotation.z = side * 0.7;
    leg.rotation.y = angle;
    g.add(leg);
  }

  // Eyes
  const eyeMat = cachedStdMat('#ff0000', { emissive: '#ff0000', emissiveIntensity: 0.8 });
  for (let i = 0; i < 4; i++) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.04);
    eye.position.set((i - 1.5) * 0.08, 0.15, 0.4);
    g.add(eye);
  }

  return g;
}

function makeWorm(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  const body = mkMesh(capsuleGeo(), mat);
  body.name = 'wormBody';
  body.scale.set(0.35, 0.5, 0.35);
  g.add(body);

  // Small eyes
  const eyeMat = cachedStdMat('#ffffff');
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.06);
    eye.position.set(side * 0.1, 0.45, 0.2);
    g.add(eye);
  }

  return g;
}

function makeTurret(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color, { metalness: 0.5, roughness: 0.4 });

  // Base
  const base = mkMesh(cylGeo(), mat);
  base.scale.set(0.6, 0.4, 0.6);
  g.add(base);

  // Barrel
  const barrel = mkMesh(cylGeo(), mat);
  barrel.name = 'barrel';
  barrel.scale.set(0.15, 0.7, 0.15);
  barrel.position.set(0, 0.3, 0.3);
  barrel.rotation.x = Math.PI / 3;
  g.add(barrel);

  return g;
}

function makeCactus(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Main body
  const body = mkMesh(cylGeo(), mat);
  body.scale.set(0.25, 1.0, 0.25);
  g.add(body);

  // Left arm
  const armL = mkMesh(cylGeo(), mat);
  armL.scale.set(0.15, 0.4, 0.15);
  armL.position.set(-0.3, 0.15, 0);
  armL.rotation.z = 0.7;
  g.add(armL);

  // Right arm
  const armR = mkMesh(cylGeo(), mat);
  armR.scale.set(0.15, 0.35, 0.15);
  armR.position.set(0.3, 0.05, 0);
  armR.rotation.z = -0.7;
  g.add(armR);

  return g;
}

function makeMage(color) {
  const g = mkGroup();
  const robeMat = cachedStdMat(color);

  // Robe body (cone)
  const robe = mkMesh(coneGeo(), robeMat);
  robe.scale.set(0.5, 0.9, 0.5);
  g.add(robe);

  // Head
  const headMat = cachedStdMat('#f5deb3');
  const head = mkMesh(sphereGeo(), headMat);
  head.scale.setScalar(0.25);
  head.position.y = 0.65;
  g.add(head);

  // Staff orb (floating)
  const orbMat = cachedStdMat(color, { emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.85 });
  const orb = mkMesh(sphereGeo(), orbMat);
  orb.name = 'staffOrb';
  orb.scale.setScalar(0.12);
  orb.position.set(0.5, 0.5, 0);
  g.add(orb);

  // Staff stick
  const stickMat = cachedStdMat('#4a3728');
  const stick = mkMesh(cylGeo(), stickMat);
  stick.scale.set(0.03, 0.8, 0.03);
  stick.position.set(0.5, 0.1, 0);
  g.add(stick);

  return g;
}

function makeSpirit(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color, {
    emissive: color,
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.6,
  });

  const body = mkMesh(sphereGeo(), mat);
  body.name = 'spiritBody';
  body.scale.set(0.7, 0.8, 0.7);
  g.add(body);

  // Ghostly trail below
  const tailMat = cachedStdMat(color, {
    emissive: color,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.35,
  });
  const tail = mkMesh(coneGeo(), tailMat);
  tail.scale.set(0.5, 0.6, 0.5);
  tail.position.y = -0.5;
  tail.rotation.x = Math.PI; // inverted cone
  g.add(tail);

  return g;
}

function makeMummy(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#c2b280');

  // Wrapped body
  const body = mkMesh(cylGeo(), mat);
  body.scale.set(0.35, 0.9, 0.35);
  g.add(body);

  // Head
  const head = mkMesh(sphereGeo(), mat);
  head.scale.setScalar(0.3);
  head.position.y = 0.6;
  g.add(head);

  // Glowing eyes
  const eyeMat = cachedStdMat('#00ff88', { emissive: '#00ff88', emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.06);
    eye.position.set(side * 0.1, 0.65, 0.22);
    g.add(eye);
  }

  return g;
}

function makeScarecrow(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#8B7355');

  // Vertical post
  const post = mkMesh(boxGeo(), mat);
  post.scale.set(0.12, 1.2, 0.12);
  g.add(post);

  // Horizontal beam
  const beam = mkMesh(boxGeo(), mat);
  beam.scale.set(0.9, 0.1, 0.1);
  beam.position.y = 0.35;
  g.add(beam);

  // Head
  const headMat = cachedStdMat('#d4a56a');
  const head = mkMesh(sphereGeo(), headMat);
  head.scale.setScalar(0.25);
  head.position.y = 0.75;
  g.add(head);

  // Hat (cone)
  const hatMat = cachedStdMat('#2d1a0e');
  const hat = mkMesh(coneGeo(), hatMat);
  hat.scale.set(0.3, 0.3, 0.3);
  hat.position.y = 1.0;
  g.add(hat);

  return g;
}

function makeOneEyedBat(color, colorAlt) {
  const g = makeBat(color, colorAlt);

  // Remove existing eyes and add one big eye
  const toRemove = [];
  g.traverse(c => { if (c.isMesh && c.scale.x <= 0.13 && c.position.z > 0.3) toRemove.push(c); });
  toRemove.forEach(c => g.remove(c));

  const bigEyeMat = cachedStdMat('#ff0000', { emissive: '#ff0000', emissiveIntensity: 1.0 });
  const bigEye = mkMesh(sphereGeo(), bigEyeMat);
  bigEye.scale.setScalar(0.22);
  bigEye.position.set(0, 0.1, 0.5);
  g.add(bigEye);

  return g;
}

function makeDarkAngel(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#2c003e');

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.5, 0.6, 0.5);
  g.add(body);

  // Dark wings
  const wingMat = cachedStdMat('#1a0033', { doubleSide: true, emissive: '#330066', emissiveIntensity: 0.5 });
  for (const side of [-1, 1]) {
    const wing = mkMesh(planeGeo(), wingMat);
    wing.scale.set(0.8, 0.7, 1);
    wing.position.set(side * 0.6, 0.2, -0.1);
    wing.rotation.y = side * 0.3;
    g.add(wing);
  }

  // Glowing eyes
  const eyeMat = cachedStdMat('#ff00ff', { emissive: '#ff00ff', emissiveIntensity: 1.5 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.06);
    eye.position.set(side * 0.14, 0.15, 0.38);
    g.add(eye);
  }

  return g;
}

function makeDemon(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#8B0000');

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.75, 0.8, 0.7);
  g.add(body);

  // Horns
  const hornMat = cachedStdMat('#2a0000');
  for (const side of [-1, 1]) {
    const horn = mkMesh(coneGeo(), hornMat);
    horn.scale.set(0.1, 0.45, 0.1);
    horn.position.set(side * 0.35, 0.7, 0.1);
    horn.rotation.z = side * -0.3;
    g.add(horn);
  }

  // Eyes
  const eyeMat = cachedStdMat('#ffcc00', { emissive: '#ffcc00', emissiveIntensity: 1.2 });
  for (const side of [-1, 1]) {
    const eye = mkMesh(sphereGeo(), eyeMat);
    eye.scale.setScalar(0.08);
    eye.position.set(side * 0.22, 0.2, 0.55);
    g.add(eye);
  }

  return g;
}

function makeChest(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#DAA520', { metalness: 0.6, roughness: 0.3 });

  // Box body
  const box = mkMesh(boxGeo(), mat);
  box.scale.set(0.9, 0.6, 0.7);
  g.add(box);

  // Lock
  const lockMat = cachedStdMat('#8B8000', { metalness: 0.8, roughness: 0.2 });
  const lock = mkMesh(boxGeo(), lockMat);
  lock.scale.set(0.15, 0.15, 0.08);
  lock.position.set(0, 0.05, 0.36);
  g.add(lock);

  // Lid seam
  const seamMat = cachedStdMat('#6B5A00');
  const seam = mkMesh(boxGeo(), seamMat);
  seam.scale.set(0.92, 0.03, 0.72);
  seam.position.y = 0.15;
  g.add(seam);

  return g;
}

function makeBee(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#FFD700');

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.4, 0.35, 0.5);
  g.add(body);

  // Stripes
  const stripeMat = cachedStdMat('#1a1a1a');
  for (let i = 0; i < 3; i++) {
    const stripe = mkMesh(cylGeo(), stripeMat);
    stripe.scale.set(0.42, 0.03, 0.42);
    stripe.position.set(0, 0, (i - 1) * 0.18);
    stripe.rotation.x = Math.PI / 2;
    g.add(stripe);
  }

  // Wings (flat discs)
  const wingMat = cachedStdMat('#ffffff', { transparent: true, opacity: 0.5, doubleSide: true });
  for (const side of [-1, 1]) {
    const wing = mkMesh(discGeo(), wingMat);
    wing.name = side === -1 ? 'wingL' : 'wingR';
    wing.scale.setScalar(0.25);
    wing.position.set(side * 0.25, 0.3, 0);
    wing.rotation.x = -0.3;
    g.add(wing);
  }

  return g;
}

function makeBlob(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color, { transparent: true, opacity: 0.75 });

  const body = mkMesh(sphereGeo(), mat);
  body.name = 'blobBody';
  body.scale.setScalar(0.75);
  g.add(body);

  return g;
}

function makeDragonfly(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);

  // Thin body
  const body = mkMesh(cylGeo(), mat);
  body.scale.set(0.08, 0.8, 0.08);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  // Head
  const head = mkMesh(sphereGeo(), mat);
  head.scale.setScalar(0.15);
  head.position.set(0, 0, 0.45);
  g.add(head);

  // Four wings (flat discs)
  const wingMat = cachedStdMat('#aaddff', { transparent: true, opacity: 0.45, doubleSide: true });
  const wingPositions = [
    [-0.3, 0.1, 0.1], [0.3, 0.1, 0.1],
    [-0.3, 0.1, -0.15], [0.3, 0.1, -0.15],
  ];
  wingPositions.forEach((pos, i) => {
    const wing = mkMesh(discGeo(), wingMat);
    wing.name = `wing${i}`;
    wing.scale.set(0.3, 0.15, 1);
    wing.position.set(...pos);
    wing.rotation.x = -Math.PI / 2;
    g.add(wing);
  });

  return g;
}

function makeIceAngel(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#88ddff', {
    emissive: '#88ddff',
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.85,
  });

  // Body
  const body = mkMesh(sphereGeo(), mat);
  body.scale.set(0.5, 0.6, 0.5);
  g.add(body);

  // Ice wings
  const wingMat = cachedStdMat('#aaeeff', {
    doubleSide: true,
    emissive: '#aaeeff',
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.7,
  });
  for (const side of [-1, 1]) {
    const wing = mkMesh(planeGeo(), wingMat);
    wing.scale.set(0.8, 0.7, 1);
    wing.position.set(side * 0.6, 0.2, -0.1);
    wing.rotation.y = side * 0.3;
    g.add(wing);
  }

  // Glow light
  const light = new THREE.PointLight(0x88ddff, 0.5, 3);
  light.position.y = 0.3;
  g.add(light);

  return g;
}

function makeIceGrassHand(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color || '#44ccaa');

  // Cluster of thin cones pointing up
  const count = 5;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const dist = 0.2 + Math.random() * 0.15;
    const cone = mkMesh(coneGeo(), mat);
    const h = 0.5 + Math.random() * 0.4;
    cone.scale.set(0.08, h, 0.08);
    cone.position.set(Math.cos(a) * dist, h * 0.5, Math.sin(a) * dist);
    g.add(cone);
  }

  return g;
}

function makeMaceSkeleton(color) {
  const g = makeSkeleton(color);

  // Add mace: stick + sphere
  const stickMat = cachedStdMat('#4a3728');
  const stick = mkMesh(cylGeo(), stickMat);
  stick.scale.set(0.04, 0.5, 0.04);
  stick.position.set(0.35, 0.3, 0.15);
  stick.rotation.z = -0.4;
  g.add(stick);

  const maceMat = cachedStdMat('#666666', { metalness: 0.7, roughness: 0.3 });
  const maceHead = mkMesh(sphereGeo(), maceMat);
  maceHead.scale.setScalar(0.15);
  maceHead.position.set(0.55, 0.6, 0.15);
  g.add(maceHead);

  return g;
}

function makeDefault(color) {
  const g = mkGroup();
  const mat = cachedStdMat(color);
  const body = mkMesh(sphereGeo(), mat);
  body.scale.setScalar(0.8);
  g.add(body);
  return g;
}

// ─── Enemy Mesh Registry ────────────────────────────────────────────────────

const MESH_FACTORIES = {
  bat:            (c, ca) => makeBat(c, ca),
  wolf:           (c, ca) => makeWolf(c, ca),
  bomb:           (c)     => makeBomb(c),
  plant:          (c, ca) => makePlant(c, ca),
  stump:          (c)     => makeStump(c),
  golem:          (c)     => makeGolem(c),
  slime:          (c)     => makeSlime(c),
  skeleton:       (c)     => makeSkeleton(c),
  skull:          (c)     => makeSkull(c),
  dragon:         (c, ca) => makeDragon(c, ca),
  crocodile:      (c)     => makeCrocodile(c),
  snake:          (c)     => makeSnake(c),
  spider:         (c)     => makeSpider(c),
  worm:           (c)     => makeWorm(c),
  turret:         (c)     => makeTurret(c),
  cactus:         (c)     => makeCactus(c),
  mage:           (c)     => makeMage(c),
  spirit:         (c)     => makeSpirit(c),
  mummy:          (c)     => makeMummy(c),
  scarecrow:      (c)     => makeScarecrow(c),
  oneEyedBat:     (c, ca) => makeOneEyedBat(c, ca),
  darkAngel:      (c)     => makeDarkAngel(c),
  demon:          (c)     => makeDemon(c),
  chest:          (c)     => makeChest(c),
  bee:            (c)     => makeBee(c),
  blob:           (c)     => makeBlob(c),
  dragonfly:      (c)     => makeDragonfly(c),
  iceAngel:       (c)     => makeIceAngel(c),
  iceGrassHand:   (c)     => makeIceGrassHand(c),
  maceSkeleton:   (c)     => makeMaceSkeleton(c),
};

// ─── Enemy Mesh Pool ────────────────────────────────────────────────────────

const enemyMeshes = new Map(); // enemy._id → { group, drawType }
let enemyIdCounter = 0;

function ensureEnemyId(e) {
  if (e._meshId === undefined) {
    e._meshId = ++enemyIdCounter;
  }
  return e._meshId;
}

function getOrCreateEnemyMesh(e) {
  const id = ensureEnemyId(e);
  let entry = enemyMeshes.get(id);

  if (!entry) {
    const factory = MESH_FACTORIES[e.draw] || ((c) => makeDefault(c));
    const group = factory(e.color, e.colorAlt);
    group.name = `enemy_${id}_${e.draw || 'default'}`;

    entry = { group, drawType: e.draw || 'default' };
    enemyMeshes.set(id, entry);

    const scene = getScene();
    if (scene) scene.add(group);
  }

  return entry;
}

// ─── Enemy Animation Updates ────────────────────────────────────────────────

function animateEnemy(entry, e, time) {
  const g = entry.group;
  const drawType = entry.drawType;

  // Type-specific animations
  switch (drawType) {
    case 'bat':
    case 'oneEyedBat':
    case 'bee':
    case 'dragonfly': {
      // Wing flapping
      const wingL = g.getObjectByName('wingL');
      const wingR = g.getObjectByName('wingR');
      const flapSpeed = drawType === 'bee' || drawType === 'dragonfly' ? 18 : 10;
      const flapAmt = drawType === 'bee' ? 0.6 : 0.4;
      if (wingL) wingL.rotation.z = Math.sin(time * flapSpeed) * flapAmt;
      if (wingR) wingR.rotation.z = -Math.sin(time * flapSpeed) * flapAmt;
      // Additional dragonfly wings
      if (drawType === 'dragonfly') {
        for (let i = 0; i < 4; i++) {
          const w = g.getObjectByName(`wing${i}`);
          if (w) w.position.y = 0.1 + Math.sin(time * 18 + i * 0.5) * 0.05;
        }
      }
      break;
    }
    case 'slime': {
      // Squish animation
      const body = g.getObjectByName('slimeBody');
      if (body) {
        const squish = 1 + Math.sin(time * 5) * 0.15;
        body.scale.set(0.8 * (2 - squish), 0.6 * squish, 0.8 * (2 - squish));
      }
      break;
    }
    case 'blob': {
      // Pulse size
      const body = g.getObjectByName('blobBody');
      if (body) {
        const pulse = 0.75 + Math.sin(time * 4) * 0.1;
        body.scale.setScalar(pulse);
      }
      break;
    }
    case 'spirit': {
      // Gentle bob
      const body = g.getObjectByName('spiritBody');
      if (body) {
        body.position.y = Math.sin(time * 3) * 0.1;
      }
      break;
    }
    case 'mage': {
      // Staff orb float
      const orb = g.getObjectByName('staffOrb');
      if (orb) {
        orb.position.y = 0.5 + Math.sin(time * 4) * 0.1;
      }
      break;
    }
    case 'bomb': {
      // Spark flicker
      const spark = g.getObjectByName('spark');
      if (spark) {
        spark.scale.setScalar(0.06 + Math.sin(time * 15) * 0.03);
      }
      break;
    }
    case 'worm': {
      // Underground hide: scale Y to 0
      const body = g.getObjectByName('wormBody');
      if (body && e._underground) {
        body.scale.y = Math.max(0, body.scale.y - 0.05);
      } else if (body) {
        body.scale.y = 0.5;
      }
      break;
    }
  }
}

// ─── Shadow Clone Mesh ──────────────────────────────────────────────────────

let cloneGroup = null;

function syncClone() {
  const scene = getScene();
  if (!scene) return;
  const p = game.player;

  if (!p || p.shadowClones <= 0 || game._cloneX === undefined) {
    if (cloneGroup) { scene.remove(cloneGroup); cloneGroup = null; }
    return;
  }

  if (!cloneGroup) {
    cloneGroup = mkGroup();
    cloneGroup.name = 'shadowClone';
    const mat = new MeshStdMat({
      color: new THREE.Color('#6c5ce7'),
      emissive: new THREE.Color('#6c5ce7'),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.35,
      metalness: 0.1,
      roughness: 0.7,
    });
    const body = mkMesh(sphereGeo(), mat);
    const r = PLAYER_R * 0.85;
    body.scale.setScalar(r);
    body.position.y = r;
    cloneGroup.add(body);
    scene.add(cloneGroup);
  }

  const pos = gameToWorld(game._cloneX, game._cloneY);
  cloneGroup.position.set(pos.x, 0, pos.z);
}

// ─── Angel Mesh ─────────────────────────────────────────────────────────────

let angelGroup = null;
let angelTargetY = 0;

function syncAngel() {
  const scene = getScene();
  if (!scene) return;

  const specials = game.specialEntities;
  const angel = specials ? specials.find(se => se.type === 'angel') : null;

  if (!angel) {
    if (angelGroup) { scene.remove(angelGroup); angelGroup = null; }
    return;
  }

  if (!angelGroup) {
    angelGroup = mkGroup();
    angelGroup.name = 'angel';

    // Body - white/gold sphere
    const bodyMat = new MeshStdMat({
      color: new THREE.Color('#fffde0'),
      emissive: new THREE.Color('#fff5a0'),
      emissiveIntensity: 0.7,
      metalness: 0.1,
      roughness: 0.5,
    });
    const body = mkMesh(sphereGeo(), bodyMat);
    body.scale.set(0.4, 0.5, 0.4);
    body.position.y = 0.5;
    angelGroup.add(body);

    // Halo
    const haloGeo = cachedGeo('haloRing', () => new THREE.TorusGeometry(0.3, 0.03, 8, 24));
    const haloMat = new MeshStdMat({
      color: new THREE.Color('#FFD700'),
      emissive: new THREE.Color('#FFD700'),
      emissiveIntensity: 1.5,
      metalness: 0.3,
      roughness: 0.4,
    });
    const halo = mkMesh(haloGeo, haloMat);
    halo.position.y = 1.0;
    halo.rotation.x = Math.PI / 2;
    angelGroup.add(halo);

    // Wings (white planes)
    const wingMat = new MeshStdMat({
      color: new THREE.Color('#ffffff'),
      emissive: new THREE.Color('#ffffdd'),
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
      metalness: 0.0,
      roughness: 0.6,
    });
    for (const side of [-1, 1]) {
      const wing = mkMesh(planeGeo(), wingMat);
      wing.scale.set(0.7, 0.8, 1);
      wing.position.set(side * 0.5, 0.55, -0.1);
      wing.rotation.y = side * 0.4;
      angelGroup.add(wing);
    }

    // Glow light
    const glow = new THREE.PointLight(0xfff5a0, 0.8, 4);
    glow.position.y = 0.5;
    angelGroup.add(glow);

    scene.add(angelGroup);
  }

  // Position
  const pos = gameToWorld(angel.x, angel.y);
  const wsR = worldScale(angel.r);
  angelGroup.scale.setScalar(wsR / 0.5); // normalize to the body radius

  // Entrance animation: fly in from above over 0.8s
  const ANIM_DUR = 0.8;
  const now = getTime();
  const elapsed = angel._spawnTime ? now - angel._spawnTime : ANIM_DUR;
  const t = Math.min(elapsed / ANIM_DUR, 1.0);
  const easeT = t * t * (3 - 2 * t); // smoothstep

  const flyHeight = 5.0; // start this high above target
  angelTargetY = wsR;
  const yOffset = (1 - easeT) * flyHeight;
  angelGroup.position.set(pos.x, angelTargetY + yOffset, pos.z);
}

// ─── Main Sync Function ────────────────────────────────────────────────────

const activeEnemyIds = new Set();

export function syncEntities() {
  const scene = getScene();
  if (!scene) return;

  const time = getTime();

  // --- Sync player ---
  syncPlayer();

  // --- Sync enemies ---
  activeEnemyIds.clear();

  for (const e of game.enemies) {
    const id = ensureEnemyId(e);
    activeEnemyIds.add(id);

    const entry = getOrCreateEnemyMesh(e);
    const g = entry.group;

    // Position
    const pos = gameToWorld(e.x, e.y);
    const ws = worldScale(e.r);
    g.position.set(pos.x, ws, pos.z);

    // Scale based on e.r
    g.scale.setScalar(ws);

    // Spawn animation
    if (e._spawnTimer > 0) {
      const spawnProgress = 1 - (e._spawnTimer / 0.6); // 0.6s = SPAWN_FADE_TIME
      const s = 0.5 + spawnProgress * 0.5; // scale from 0.5 to 1.0
      g.scale.multiplyScalar(s);
      // Fade in opacity on all child materials
      g.traverse(child => {
        if (child.isMesh && child.material && child.material.transparent) {
          child.material.opacity = Math.min(child.material.opacity, spawnProgress);
        }
      });
    }

    // Type-specific animations
    animateEnemy(entry, e, time);
  }

  // Remove meshes for dead enemies
  for (const [id, entry] of enemyMeshes) {
    if (!activeEnemyIds.has(id)) {
      scene.remove(entry.group);
      // Dispose geometry instances? No — we use shared cached geometry.
      // Just remove from map.
      enemyMeshes.delete(id);
    }
  }

  // --- Sync shadow clone ---
  syncClone();

  // --- Sync angel ---
  syncAngel();
}

// ─── Clear All Entities (stage transition) ──────────────────────────────────

export function clearEntities() {
  const scene = getScene();

  // Remove all enemy meshes
  for (const [, entry] of enemyMeshes) {
    if (scene) scene.remove(entry.group);
  }
  enemyMeshes.clear();
  enemyIdCounter = 0;

  // Remove player
  if (playerGroup) {
    if (scene) scene.remove(playerGroup);
    playerGroup = null;
    playerBodyMat = null;
    playerLight = null;
  }

  // Remove clone
  if (cloneGroup) {
    if (scene) scene.remove(cloneGroup);
    cloneGroup = null;
  }

  // Remove angel
  if (angelGroup) {
    if (scene) scene.remove(angelGroup);
    angelGroup = null;
  }
}
