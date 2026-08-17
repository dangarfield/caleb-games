// Everything that decorates the lake: piers, the arched bridge, reeds, trees,
// lily pads, buoys, the floating ring, distance flags, spot markers, a rowboat.
// Vegetation is instanced (one draw call per kind) with a sway in the shader.

import * as THREE from 'three';
import { TAU, DEG, mulberry32, clamp, sat, lerp, smoothRange } from '../util.js';
import {
  LAKE, lakeRadius, shorePoint, outward, PIERS, BRIDGE, COVE, covePoint, coveWidthAt,
  BUOYS, RING, REED_GATE, REED_GATE2, DIST_FLAGS, SPOTS, ISLANDS, spotById,
  LILY_RAFTS, BEACON, POSTS, WATERFALL,
} from './layout.js';
import { heightAt, depthAt } from './heightfield.js';

const WOOD = 0xb07d43;
const WOOD_DARK = 0x7c5527;
const STONE = 0x9d9c92;

// Throw-spot marker colours. Arcade purple normally; the map view adds gold for
// "you are standing here" and a washed-out grey for a spot you have not bought.
const MARK = {
  disc: 0x6c5ce7, ring: 0xa29bfe,
  hereDisc: 0xffd32a, hereRing: 0xffd32a, hereArrow: 0x2a1a00,
  lockDisc: 0x8b90a8, lockRing: 0xb9bed2,
};
// How much bigger a marker is drawn in the map view. 1.85 m x 8 = a 15 m disc,
// which is a ~70 px tap target from the parked height on a phone.
const MAP_MARKER_SCALE = 8;

const swayTime = { value: 0 };

/** Adds a wind sway to an instanced vegetation material. */
function makeSwayMaterial(color, amp, side = THREE.DoubleSide) {
  const mat = new THREE.MeshLambertMaterial({ color, side, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = swayTime;
    shader.uniforms.uAmp = { value: amp };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAmp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = instanceMatrix[3].xyz;
        #else
          vec3 iPos = vec3(0.0);
        #endif
        float hFac = max(transformed.y, 0.0);
        hFac = hFac * hFac;
        float ph = iPos.x * 0.31 + iPos.z * 0.23;
        transformed.x += sin(uTime * 1.55 + ph) * hFac * uAmp;
        transformed.z += cos(uTime * 1.17 + ph * 1.3) * hFac * uAmp * 0.7;
      `);
  };
  return mat;
}

// --- geometry helpers --------------------------------------------------------
function reedBlade() {
  // tapered blade, 1 unit tall, pivot at the base
  const g = new THREE.BufferGeometry();
  const w0 = 0.09, w1 = 0.055, w2 = 0.018;
  const v = [
    -w0, 0, 0, w0, 0, 0, w1, 0.55, 0.06,
    -w0, 0, 0, w1, 0.55, 0.06, -w1, 0.55, 0.06,
    -w1, 0.55, 0.06, w1, 0.55, 0.06, w2, 1.0, 0.2,
    -w1, 0.55, 0.06, w2, 1.0, 0.2, -w2, 1.0, 0.2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function instanced(geo, mat, count) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  m.frustumCulled = false;
  return m;
}

function labelSprite(text, color = '#ffffff', bg = 'rgba(10,10,46,0.72)', scale = 1) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = bg;
  const r = 20;
  c.beginPath();
  if (c.roundRect) c.roundRect(6, 14, 244, 68, r);
  else {
    // older iPad Safari has no roundRect
    c.moveTo(6 + r, 14);
    c.arcTo(250, 14, 250, 82, r);
    c.arcTo(250, 82, 6, 82, r);
    c.arcTo(6, 82, 6, 14, r);
    c.arcTo(6, 14, 250, 14, r);
  }
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.stroke();
  c.fillStyle = color;
  c.font = 'bold 40px "Segoe UI", system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 128, 49, 226);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 2;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(9 * scale, 3.4 * scale, 1);
  return spr;
}

/**
 * A small square tag for a single glyph — the map view's 🔒. A name-shaped pill
 * would be six more word-sized labels fighting for the same crowded shore, so a
 * locked spot gets this chip instead and its name comes from tapping it.
 */
function chipSprite(text, bg = 'rgba(231,76,60,0.9)') {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = bg;
  const r = 26;
  c.beginPath();
  if (c.roundRect) c.roundRect(6, 6, 84, 84, r);
  else {
    c.moveTo(6 + r, 6);
    c.arcTo(90, 6, 90, 90, r);
    c.arcTo(90, 90, 6, 90, r);
    c.arcTo(6, 90, 6, 6, r);
    c.arcTo(6, 6, 90, 6, r);
  }
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 3; c.stroke();
  c.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 48, 52, 74);
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 2;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  spr.scale.set(3.4, 3.4, 1);
  return spr;
}

// ---------------------------------------------------------------------------
export function buildProps(scene, camera) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);
  const rnd = mulberry32(4471);
  const pickables = [];        // meshes tapped to travel between throw spots
  const animated = [];         // { obj, fn }
  // Billboard labels are world-sized, so a flag 15 m from the chase camera would
  // otherwise fill a third of the screen. These are re-scaled every frame to keep
  // a roughly constant screen size.
  const labels = [];           // { spr, base }

  const plankGeo = new THREE.BoxGeometry(1, 1, 1);
  const postGeo = new THREE.CylinderGeometry(0.16, 0.19, 1, 6);
  const plankMat = new THREE.MeshLambertMaterial({ color: WOOD, flatShading: true });
  const plankMat2 = new THREE.MeshLambertMaterial({ color: WOOD_DARK, flatShading: true });

  // ---- piers / jetties -----------------------------------------------------
  const planks = [];
  const posts = [];
  const rails = [];
  for (const p of PIERS) {
    const dir = outward(p.theta * DEG);
    const nx = -dir.z, nz = dir.x;
    const len = p.from - p.to;
    const nPlanks = Math.round(len / 0.62);
    for (let i = 0; i < nPlanks; i++) {
      const s = p.from - (i + 0.5) * (len / nPlanks);
      const q = shorePoint(p.theta, s);
      planks.push({
        x: q.x, y: p.deckY, z: q.z,
        sx: p.width, sy: 0.16, sz: 0.5,
        rot: Math.atan2(dir.x, dir.z),
        jitter: (rnd() - 0.5) * 0.03,
      });
    }
    for (let s = p.from - 1.5; s > p.to; s -= 5.5) {
      for (const side of [-1, 1]) {
        const q = shorePoint(p.theta, s);
        const px = q.x + nx * (p.width / 2 - 0.3) * side;
        const pz = q.z + nz * (p.width / 2 - 0.3) * side;
        const gy = heightAt(px, pz);
        posts.push({ x: px, y: (gy + p.deckY) / 2 - 0.2, z: pz, h: Math.max(0.6, p.deckY - gy + 0.4) });
        // hand rail every other post
        rails.push({
          x: px, y: p.deckY + 0.55, z: pz, h: 1.1, thin: true,
        });
      }
    }
    // rail beams
    for (const side of [-1, 1]) {
      const a = shorePoint(p.theta, p.from - 1.5), b = shorePoint(p.theta, p.to + 0.5);
      const ax = a.x + nx * (p.width / 2 - 0.3) * side, az = a.z + nz * (p.width / 2 - 0.3) * side;
      const bx = b.x + nx * (p.width / 2 - 0.3) * side, bz = b.z + nz * (p.width / 2 - 0.3) * side;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      planks.push({
        x: mx, y: p.deckY + 1.05, z: mz,
        sx: 0.12, sy: 0.12, sz: Math.hypot(bx - ax, bz - az),
        rot: Math.atan2(bx - ax, bz - az), jitter: 0,
      });
    }
  }

  // ---- arched bridge over the creek ---------------------------------------
  const bEndA = { x: BRIDGE.x + BRIDGE.nx * BRIDGE.halfLength, z: BRIDGE.z + BRIDGE.nz * BRIDGE.halfLength };
  const bEndB = { x: BRIDGE.x - BRIDGE.nx * BRIDGE.halfLength, z: BRIDGE.z - BRIDGE.nz * BRIDGE.halfLength };
  const endY = Math.max(heightAt(bEndA.x, bEndA.z), heightAt(bEndB.x, bEndB.z)) + 0.45;
  const midY = endY + 1.15;
  BRIDGE.deckY = midY;
  BRIDGE.clearance = midY - 0.55;
  const bridgeY = (u) => lerp(endY, midY, Math.cos(u * Math.PI) * -0.5 + 0.5); // u -1..1 -> arc
  const NB = 74;
  for (let i = 0; i < NB; i++) {
    const u = -1 + (i + 0.5) / NB * 2;
    const y = bridgeY(u);
    const x = BRIDGE.x + BRIDGE.nx * u * BRIDGE.halfLength;
    const z = BRIDGE.z + BRIDGE.nz * u * BRIDGE.halfLength;
    planks.push({
      x, y, z, sx: 0.6, sy: 0.22, sz: 4.2,
      rot: Math.atan2(BRIDGE.nx, BRIDGE.nz) + Math.PI / 2,
      jitter: (rnd() - 0.5) * 0.05,
    });
  }
  // railings + uprights
  for (let i = 0; i <= 18; i++) {
    const u = -1 + i / 18 * 2;
    const y = bridgeY(u);
    const x = BRIDGE.x + BRIDGE.nx * u * BRIDGE.halfLength;
    const z = BRIDGE.z + BRIDGE.nz * u * BRIDGE.halfLength;
    for (const side of [-1, 1]) {
      const px = x + BRIDGE.dirX * 1.9 * side, pz = z + BRIDGE.dirZ * 1.9 * side;
      rails.push({ x: px, y: y + 0.6, z: pz, h: 1.2, thin: true });
      if (i < 18) {
        const u2 = -1 + (i + 1) / 18 * 2;
        const y2 = bridgeY(u2);
        const x2 = BRIDGE.x + BRIDGE.nx * u2 * BRIDGE.halfLength + BRIDGE.dirX * 1.9 * side;
        const z2 = BRIDGE.z + BRIDGE.nz * u2 * BRIDGE.halfLength + BRIDGE.dirZ * 1.9 * side;
        const mx = (px + x2) / 2, mz = (pz + z2) / 2;
        planks.push({
          x: mx, y: (y + y2) / 2 + 1.2, z: mz,
          sx: 0.11, sy: 0.13, sz: Math.hypot(x2 - px, z2 - pz) + 0.1,
          rot: Math.atan2(x2 - px, z2 - pz), jitter: 0,
        });
      }
    }
  }
  // stone abutments where the deck meets the banks
  const abut = new THREE.MeshLambertMaterial({ color: STONE, flatShading: true });
  for (const side of [-1, 1]) {
    const u = 0.44 * side;
    const x = BRIDGE.x + BRIDGE.nx * u * BRIDGE.halfLength;
    const z = BRIDGE.z + BRIDGE.nz * u * BRIDGE.halfLength;
    const gy = heightAt(x, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(4.0, Math.max(1.4, bridgeY(u) - gy + 0.6), 5.0), abut);
    m.position.set(x, (gy + bridgeY(u)) / 2 - 0.2, z);
    m.rotation.y = Math.atan2(BRIDGE.nx, BRIDGE.nz);
    group.add(m);
  }
  BRIDGE.gateHalfWidth = 0.42 * BRIDGE.halfLength;

  // ---- bake plank / post instances ----------------------------------------
  const plankMesh = instanced(plankGeo, plankMat, planks.length);
  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
  planks.forEach((p, i) => {
    ee.set(0, p.rot, p.jitter); qq.setFromEuler(ee);
    vv.set(p.x, p.y, p.z); ss.set(p.sx, p.sy, p.sz);
    mtx.compose(vv, qq, ss);
    plankMesh.setMatrixAt(i, mtx);
  });
  group.add(plankMesh);

  const postMesh = instanced(postGeo, plankMat2, posts.length);
  posts.forEach((p, i) => {
    vv.set(p.x, p.y, p.z); ss.set(1, p.h, 1);
    mtx.compose(vv, qq.identity(), ss);
    postMesh.setMatrixAt(i, mtx);
  });
  group.add(postMesh);

  const railMesh = instanced(postGeo, plankMat2, rails.length);
  rails.forEach((p, i) => {
    vv.set(p.x, p.y, p.z); ss.set(0.55, p.h, 0.55);
    mtx.compose(vv, qq.identity(), ss);
    railMesh.setMatrixAt(i, mtx);
  });
  group.add(railMesh);

  // ---- reeds ---------------------------------------------------------------
  const reedPositions = [];

  // Every throwing spot keeps a clear widening lane in front of it, otherwise the
  // rim of reeds becomes a fence you have to look over. The lane is deliberately
  // wide close in (the first 12 m fill most of the screen, and near-field reeds
  // made West Beach read as a swamp instead of open water) and keeps widening with
  // distance. The reed-gate rows below are placed directly and so survive this.
  function inThrowLane(x, z) {
    for (const s of SPOTS) {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz > 40 * 40) continue;
      const along = dx * s.fx + dz * s.fz;
      if (along < -3) continue;
      const lat = Math.abs(dx * -s.fz + dz * s.fx);
      const a = Math.max(along, 0);
      // near field: a broad fan; far field: a lane that keeps opening up
      const half = a < 14 ? 6.5 + a * 0.5 : 13.5 + (a - 14) * 0.28;
      if (lat < half) return true;
    }
    return false;
  }

  function tryReed(x, z, scaleMin = 1.0, scaleMax = 2.4) {
    const d = depthAt(x, z);
    if (d < 0.02 || d > 1.45) return false;
    if (inThrowLane(x, z)) return false;
    reedPositions.push({ x, z, s: lerp(scaleMin, scaleMax, rnd()), rot: rnd() * TAU });
    return true;
  }
  // ring of reeds around the whole shallow rim, denser in the marshy bay
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * TAU;
    const R = lakeRadius(a);
    const off = -(0.5 + rnd() * rnd() * 26);
    const x = LAKE.cx + Math.cos(a) * (R + off);
    const z = LAKE.cz + Math.sin(a) * (R + off);
    tryReed(x, z);
  }
  // creek banks
  for (let i = 0; i < 900; i++) {
    const t = rnd();
    const c = covePoint(t * COVE.length);
    const side = rnd() < 0.5 ? -1 : 1;
    const off = (COVE.halfWidth * coveWidthAt(t)) * (0.55 + rnd() * 0.55) * side;
    tryReed(c.x + COVE.nx * off, c.z + COVE.nz * off, 1.2, 2.8);
  }
  // island fringes
  for (const isl of ISLANDS) {
    for (let i = 0; i < 260; i++) {
      const a = rnd() * TAU;
      const r = isl.r * (1 + rnd() * 0.45);
      tryReed(isl.x + Math.cos(a) * r, isl.z + Math.sin(a) * r, 1.0, 2.2);
    }
  }
  // the reed gates: dense rows with a clear gap in the middle. Gate 2 sits 24 m
  // behind gate 1 on the same line, so a straight throw can thread both.
  for (const gate of [REED_GATE, REED_GATE2]) {
    for (let row = 0; row < 3; row++) {
      const along = (row - 1) * 2.2;
      for (let i = -gate.rowHalf; i <= gate.rowHalf; i += 0.55) {
        if (Math.abs(i) < gate.gapHalf) continue;
        const jx = (rnd() - 0.5) * 0.5, jz = (rnd() - 0.5) * 0.5;
        const x = gate.x + gate.nx * i + gate.dirX * along + jx;
        const z = gate.z + gate.nz * i + gate.dirZ * along + jz;
        const d = depthAt(x, z);
        if (d < 0.02 || d > 3.0) continue;
        reedPositions.push({ x, z, s: lerp(1.8, 3.1, rnd()), rot: rnd() * TAU });
      }
    }
  }

  const reedMat = makeSwayMaterial(0x6f9b46, 0.16);
  const reedMesh = instanced(reedBlade(), reedMat, reedPositions.length);
  reedPositions.forEach((p, i) => {
    ee.set(0, p.rot, (rnd() - 0.5) * 0.22); qq.setFromEuler(ee);
    vv.set(p.x, -0.15, p.z);
    ss.set(0.9 + rnd() * 0.4, p.s, 0.9 + rnd() * 0.4);
    mtx.compose(vv, qq, ss);
    reedMesh.setMatrixAt(i, mtx);
  });
  group.add(reedMesh);

  // ---- lily pads -----------------------------------------------------------
  const padGeo = new THREE.CircleGeometry(1, 7);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshLambertMaterial({ color: 0x4f8f4a, flatShading: true, side: THREE.DoubleSide });
  const pads = [];
  for (let i = 0; i < 1400 && pads.length < 320; i++) {
    const a = rnd() * TAU;
    const R = lakeRadius(a);
    const off = -(3 + rnd() * 24);
    const x = LAKE.cx + Math.cos(a) * (R + off);
    const z = LAKE.cz + Math.sin(a) * (R + off);
    const d = depthAt(x, z);
    if (d > 0.5 && d < 2.4 && !inThrowLane(x, z)) pads.push({ x, z, s: 0.5 + rnd() * 0.85, rot: rnd() * TAU });
  }
  const padMesh = instanced(padGeo, padMat, pads.length);
  pads.forEach((p, i) => {
    ee.set(0, p.rot, 0); qq.setFromEuler(ee);
    vv.set(p.x, 0.03, p.z); ss.set(p.s, 1, p.s * 0.92);
    mtx.compose(vv, qq, ss);
    padMesh.setMatrixAt(i, mtx);
  });
  padMesh.renderOrder = 2;
  group.add(padMesh);

  // ---- trees ---------------------------------------------------------------
  const pineFoliage = [];
  const roundFoliage = [];
  const trunks = [];
  function placeTree(x, z, kind, scale) {
    const gy = heightAt(x, z);
    if (gy < 0.9) return;
    trunks.push({ x, y: gy, z, h: 2.6 * scale, r: 0.42 * scale });
    if (kind === 'pine') {
      pineFoliage.push({ x, y: gy + 2.1 * scale, z, s: scale * (0.9 + rnd() * 0.4), rot: rnd() * TAU });
    } else {
      roundFoliage.push({ x, y: gy + 3.0 * scale, z, s: scale * (1.5 + rnd() * 0.7), rot: rnd() * TAU });
    }
  }
  for (let i = 0; i < 5200; i++) {
    const a = rnd() * TAU;
    const R = lakeRadius(a);
    const off = 6 + rnd() * rnd() * 170;
    const x = LAKE.cx + Math.cos(a) * (R + off);
    const z = LAKE.cz + Math.sin(a) * (R + off);
    // keep the throwing sightlines and the beaches clear
    let blocked = false;
    for (const s of SPOTS) if (Math.hypot(x - s.x, z - s.z) < 16) { blocked = true; break; }
    if (blocked) continue;
    const gy = heightAt(x, z);
    if (gy < 1.4) continue;
    const dens = smoothRange(1.2, 8, gy);
    if (rnd() > dens * 0.85) continue;
    placeTree(x, z, rnd() < 0.62 ? 'pine' : 'round', 1.1 + rnd() * 1.9);
  }
  for (const isl of ISLANDS) {
    for (let i = 0; i < isl.trees * 6 && i < 300; i++) {
      const a = rnd() * TAU, r = rnd() * isl.r * 0.85;
      const x = isl.x + Math.cos(a) * r, z = isl.z + Math.sin(a) * r;
      if (heightAt(x, z) < 1.0) continue;
      placeTree(x, z, rnd() < 0.7 ? 'pine' : 'round', 1.0 + rnd() * 1.6);
    }
  }
  // willows on Willow Bank
  {
    const s = spotById('willow');
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, r = 14 + rnd() * 26;
      placeTree(s.x + Math.cos(a) * r, s.z + Math.sin(a) * r, 'round', 2.0 + rnd() * 1.3);
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.6, 1.0, 1, 5);
  const trunkMesh = instanced(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6d4c31, flatShading: true }), trunks.length);
  trunks.forEach((p, i) => {
    vv.set(p.x, p.y + p.h / 2 - 0.2, p.z); ss.set(p.r, p.h, p.r);
    mtx.compose(vv, qq.identity(), ss);
    trunkMesh.setMatrixAt(i, mtx);
  });
  group.add(trunkMesh);

  const pineGeo = new THREE.ConeGeometry(1, 2.4, 7);
  const pineMesh = instanced(pineGeo, makeSwayMaterial(0x3f7f42, 0.035, THREE.FrontSide), pineFoliage.length);
  pineFoliage.forEach((p, i) => {
    ee.set(0, p.rot, 0); qq.setFromEuler(ee);
    vv.set(p.x, p.y, p.z); ss.set(p.s * 1.4, p.s * 1.8, p.s * 1.4);
    mtx.compose(vv, qq, ss);
    pineMesh.setMatrixAt(i, mtx);
  });
  group.add(pineMesh);

  const blobGeo = new THREE.IcosahedronGeometry(1, 0);
  const blobMesh = instanced(blobGeo, makeSwayMaterial(0x59a84f, 0.05, THREE.FrontSide), roundFoliage.length);
  roundFoliage.forEach((p, i) => {
    ee.set(rnd() * 0.4, p.rot, rnd() * 0.4); qq.setFromEuler(ee);
    vv.set(p.x, p.y, p.z); ss.set(p.s * 1.25, p.s, p.s * 1.25);
    mtx.compose(vv, qq, ss);
    blobMesh.setMatrixAt(i, mtx);
  });
  group.add(blobMesh);

  // ---- buoys ---------------------------------------------------------------
  const buoyMeshes = [];
  for (const b of BUOYS) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(b.r, 12, 8),
      new THREE.MeshLambertMaterial({ color: b.color, flatShading: true })
    );
    body.position.y = 0.1;
    body.scale.y = 0.8;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })
    );
    pole.position.y = 1.5;
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 6),
      new THREE.MeshLambertMaterial({ color: b.color, flatShading: true })
    );
    top.position.y = 2.9;
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(b.r * 1.05, b.r * 0.5, 0.5, 12),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })
    );
    skirt.position.y = -0.35;
    g.add(body, pole, top, skirt);
    g.position.set(b.x, 0, b.z);
    group.add(g);
    b.mesh = g;
    buoyMeshes.push(g);
    const ph = rnd() * TAU;
    animated.push({ fn: (t) => { g.position.y = Math.sin(t * 1.5 + ph) * 0.22; g.rotation.z = Math.sin(t * 1.2 + ph) * 0.07; } });
  }

  // ---- floating ring -------------------------------------------------------
  {
    const g = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry((RING.rOuter + RING.rInner) / 2, (RING.rOuter - RING.rInner) / 2, 8, 22),
      new THREE.MeshLambertMaterial({ color: 0xff7043, flatShading: true })
    );
    torus.rotation.x = -Math.PI / 2;
    g.add(torus);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.65, 1.3),
        new THREE.MeshLambertMaterial({ color: 0xfdfdfd, flatShading: true })
      );
      const rr = (RING.rOuter + RING.rInner) / 2;
      seg.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
      seg.rotation.y = -a;
      g.add(seg);
    }
    g.position.set(RING.x, 0.12, RING.z);
    group.add(g);
    RING.mesh = g;
    animated.push({ fn: (t) => { g.position.y = 0.1 + Math.sin(t * 1.35) * 0.16; g.rotation.z = Math.sin(t * 0.9) * 0.05; } });
  }

  // ---- distance flags ------------------------------------------------------
  for (const f of DIST_FLAGS) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 4.2, 5),
      new THREE.MeshLambertMaterial({ color: 0xf0f0f0 })
    );
    pole.position.y = 2.1;
    const float = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.5, 0.55, 10),
      new THREE.MeshLambertMaterial({ color: 0x6c5ce7, flatShading: true })
    );
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.05),
      new THREE.MeshLambertMaterial({ color: 0xffd32a, side: THREE.DoubleSide })
    );
    flag.position.set(0.95, 3.5, 0);
    g.add(pole, float, flag);
    const lab = labelSprite(f.d + ' m', '#ffd32a', 'rgba(10,10,46,0.7)', 0.8);
    lab.position.y = 5.4;
    g.add(lab);
    // The flags measure distance FROM MAIN BEACH, so their labels only tell the
    // truth while you are standing there; from anywhere else they fade away.
    labels.push({ spr: lab, base: 0.8, showNear: spotById('main'), nearRange: [9, 26] });
    g.position.set(f.x, 0, f.z);
    group.add(g);
    const ph = rnd() * TAU;
    animated.push({ fn: (t) => { g.position.y = Math.sin(t * 1.4 + ph) * 0.18; flag.rotation.y = Math.sin(t * 2.6 + ph) * 0.35; } });
  }

  // ---- throw-spot markers --------------------------------------------------
  const spotMarkers = [];
  const markers = [];           // one record per spot, for the map view below
  const markerRingGeo = new THREE.TorusGeometry(1.9, 0.16, 6, 22);
  markerRingGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1.85, 20);
  discGeo.rotateX(-Math.PI / 2);
  // "you are here" arrow, only ever shown in the map view
  const hereGeo = new THREE.ConeGeometry(0.62, 1.6, 6);
  hereGeo.rotateX(Math.PI);
  let markerNo = 0;
  for (const s of SPOTS) {
    const g = new THREE.Group();
    const baseY = (s.standY || heightAt(s.x, s.z));
    // disc + ring live in their own group so the map view can blow them up to a
    // tappable size (a 1.85 m disc seen from 400 m up is four pixels across)
    const pins = new THREE.Group();
    const discMat = new THREE.MeshBasicMaterial({
      color: MARK.disc, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    const ringMat = new THREE.MeshBasicMaterial({ color: MARK.ring });
    const ring = new THREE.Mesh(markerRingGeo, ringMat);
    // dark, not gold: from straight above it sits inside the gold "here" disc
    const here = new THREE.Mesh(hereGeo, new THREE.MeshBasicMaterial({ color: MARK.hereArrow }));
    here.position.y = 1.5;
    here.visible = false;
    pins.add(disc, ring, here);
    g.add(pins);
    const lab = labelSprite(s.name, '#ffffff', 'rgba(108,92,231,0.82)', 0.95);
    lab.position.y = 3.0;
    g.add(lab);
    // Spot names only matter when you can walk there. Fading them out past ~70 m
    // stops five purple name tags from crowding the gold distance-flag labels when
    // you look down the lake from Main Beach. In the map view every name stays up
    // (see setMapMode) and grows with the distance so it stays readable.
    labels.push({ spr: lab, base: 0.95, fadeFar: [70, 110], mapK: 0.62 });
    // The map view swaps in a gold version of the same name for the spot you are
    // standing on, so "you are here" is one glance, not a colour hunt.
    const hereLab = labelSprite(s.name, '#2a1a00', 'rgba(255,211,42,0.92)', 0.95);
    hereLab.visible = false;
    g.add(hereLab);
    labels.push({ spr: hereLab, base: 0.95, mapK: 0.62, mapOnly: true });
    // Only a shop spot can ever be locked, so only those get a padlock tag. In the
    // map view it REPLACES the name pill: twelve word-sized tags round one small
    // lake hide each other, and a red 🔒 chip on a grey pin says all a child needs
    // (tapping it names it and quotes the price).
    let lockLab = null;
    if (s.unlock) {
      lockLab = chipSprite('🔒');
      lockLab.visible = false;
      g.add(lockLab);
      labels.push({ spr: lockLab, base: 1, mapK: 0.62, mapOnly: true, wh: [3.4, 3.4] });
    }
    // Where the name tag sits in the map view. Overhead the ground plane IS the
    // screen, so the tag is pushed toward the middle of the lake (never off the
    // shore edge, never under the bottom hint panel) and neighbours along the
    // same shore alternate near/far so their tags do not overlap.
    const inward = Math.sign(LAKE.cz - s.z) || 1;
    const mapLabZ = inward * (markerNo++ % 2 ? 9 : 18.5);
    g.position.set(s.x, baseY + 0.08, s.z);
    group.add(g);
    disc.userData.spotId = s.id;
    ring.userData.spotId = s.id;
    pickables.push(disc, ring);
    s.marker = g;
    s.markerLabel = lab;
    // A spot you have not bought yet has no marker in the world at all — it shows
    // up only in the spots list, with its price (the map view is the exception:
    // there a locked spot is drawn greyed out with its padlock, so the lake you
    // could unlock is visible from the start).
    g.userData.spot = s;
    spotMarkers.push(g);
    markers.push({ s, g, pins, disc, ring, here, discMat, ringMat, lab, hereLab, lockLab, mapLabZ });
    animated.push({
      fn: (t) => {
        const k = 1 + Math.sin(t * 2.2 + s.theta) * 0.07;
        ring.scale.set(k, 1, k);
        here.position.y = 1.5 + Math.sin(t * 2.6 + s.theta) * 0.22;
      },
    });
  }

  // ---- the map view ---------------------------------------------------------
  // main.js calls setMapMode when the 🗺️ button tweens the camera overhead
  // (camera-rig 'overview'). Nothing is rebuilt: the same markers are scaled up
  // and recoloured, so the map is the lake, not a second drawing of it.
  let mapMode = false;
  function setMapMode(on, currentId = '') {
    mapMode = !!on;
    for (const m of markers) {
      const here = mapMode && m.s.id === currentId;
      const locked = !m.s.unlocked;
      m.pins.scale.setScalar(mapMode ? MAP_MARKER_SCALE : 1);
      m.lab.position.set(0, mapMode ? 26 : 3.0, mapMode ? m.mapLabZ : 0);
      m.here.visible = here;
      // the plain purple name pill steps aside for the red 🔒 chip (locked) or the
      // gold "you are here" name (the spot you are standing on)
      const swap = mapMode && locked;
      m.lab.userData.mapSuppress = swap || here;
      m.hereLab.visible = here;
      m.hereLab.position.set(0, mapMode ? 26 : 3.0, mapMode ? m.mapLabZ : 0);
      if (m.lockLab) {
        m.lockLab.visible = swap;
        // the chip rides on the pin itself, not out over the water
        m.lockLab.position.set(0, mapMode ? 26 : 3.0, 0);
      }
      const style = !mapMode ? MARK
        : (here ? { disc: MARK.hereDisc, ring: MARK.hereRing, op: 0.75, lab: 1 }
          : (locked ? { disc: MARK.lockDisc, ring: MARK.lockRing, op: 0.3, lab: 0.78 }
            : { disc: MARK.disc, ring: MARK.ring, op: 0.52, lab: 1 }));
      m.discMat.color.setHex(style.disc);
      m.discMat.opacity = mapMode ? style.op : 0.42;
      m.ringMat.color.setHex(style.ring);
      const labOp = mapMode ? style.lab : 1;
      m.lab.material.opacity = labOp;
      m.lab.userData.mapOpacity = labOp;
      m.lab.material.color.setHex(0xffffff);
      // From overhead the water surface sits at almost exactly the same distance
      // from the camera as these markers, so Three sorts it after them and its
      // transparent shader washes them out (a name pill over open water came out
      // as a ghost). In the map view the markers are UI: they draw last, on top of
      // the lake and through the trees.
      const front = mapMode;
      for (const [obj, order] of [[m.disc, 24], [m.ring, 25], [m.here, 26],
        [m.lab, 30], [m.lockLab, 31], [m.hereLab, 32]]) {
        if (!obj) continue;
        obj.material.depthTest = !front;
        obj.renderOrder = front ? order : 0;
      }
    }
  }

  /** Verification hook: how one marker is drawn right now. */
  function markerState(id) {
    const m = markers.find(x => x.s.id === id);
    if (!m) return null;
    return {
      unlocked: !!m.s.unlocked, visible: m.g.visible, scale: m.pins.scale.x,
      disc: '#' + m.discMat.color.getHexString(), ring: '#' + m.ringMat.color.getHexString(),
      opacity: +m.discMat.opacity.toFixed(2),
      here: m.here.visible, lock: !!(m.lockLab && m.lockLab.visible),
      // which of the three name tags is up: gold "here", red padlock chip, purple name
      tag: m.hereLab.visible ? 'here' : (m.lockLab && m.lockLab.visible ? 'lock' : 'name'),
      y: +(m.g.position.y).toFixed(2),
    };
  }

  // ---- rowboats ------------------------------------------------------------
  function makeRowboat(x, z, rotY, color) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 5.4, 10, 1, false, 0, Math.PI),
      new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide })
    );
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI;
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.14, 1.6),
      new THREE.MeshLambertMaterial({ color: WOOD, flatShading: true })
    );
    inner.position.y = 0.35;
    boat.add(hull, inner);
    boat.position.set(x, Math.max(heightAt(x, z) + 0.85, 0.55), z);
    boat.rotation.y = rotY;
    boat.rotation.z = 0.13;
    group.add(boat);
    return boat;
  }
  {
    const s = spotById('main');
    makeRowboat(s.x + s.rx * 13 + s.fx * 1.5, s.z + s.rz * 13 + s.fz * 1.5,
      Math.atan2(s.fx, s.fz) + 0.6, 0xe0e6ec);
  }
  // two boats moored either side of the Boat Dock jetty
  {
    const s = spotById('dock');
    const b1 = makeRowboat(s.x + s.rx * 4.2 - s.fx * 2, s.z + s.rz * 4.2 - s.fz * 2,
      Math.atan2(s.fx, s.fz) + 0.12, 0xe6746a);
    const b2 = makeRowboat(s.x - s.rx * 4.6 + s.fx * 1.5, s.z - s.rz * 4.6 + s.fz * 1.5,
      Math.atan2(s.fx, s.fz) - 0.1, 0x74b9d8);
    for (const [i, b] of [b1, b2].entries()) {
      const y0 = b.position.y, ph = i * 2.1;
      animated.push({ fn: (t) => { b.position.y = y0 + Math.sin(t * 1.1 + ph) * 0.09; b.rotation.z = 0.13 + Math.sin(t * 0.8 + ph) * 0.05; } });
    }
  }

  // ---- lily rafts (a stone can come to rest on one) ------------------------
  const bigPadMat = new THREE.MeshLambertMaterial({ color: 0x62a84c, flatShading: true, side: THREE.DoubleSide });
  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xffc0e0, flatShading: true });
  for (const raft of LILY_RAFTS) {
    const g = new THREE.Group();
    for (let i = 0; i < raft.pads; i++) {
      const a = rnd() * TAU;
      const r = Math.sqrt(rnd()) * raft.r * 0.82;
      const pad = new THREE.Mesh(padGeo, bigPadMat);
      const s = 1.05 + rnd() * 0.95;
      pad.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      pad.scale.set(s, 1, s * 0.94);
      pad.rotation.y = rnd() * TAU;
      g.add(pad);
      if (rnd() < 0.35) {
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 6), flowerMat);
        fl.position.set(pad.position.x + 0.2, 0.24, pad.position.z);
        g.add(fl);
      }
    }
    g.position.set(raft.x, 0, raft.z);
    g.renderOrder = 2;
    group.add(g);
    animated.push({ fn: (t) => { g.position.y = Math.sin(t * 1.1 + raft.x * 0.1) * 0.05; } });
  }

  // ---- beacon on Sand Isle -------------------------------------------------
  {
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xf6f6f6, flatShading: true });
    const red = new THREE.MeshLambertMaterial({ color: 0xe74c3c, flatShading: true });
    const bandGeo = new THREE.CylinderGeometry(BEACON.r, BEACON.r * 1.06, BEACON.h / 5, 7);
    for (let i = 0; i < 5; i++) {
      const band = new THREE.Mesh(bandGeo, i % 2 ? red : white);
      band.position.y = BEACON.h / 5 * (i + 0.5);
      g.add(band);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd32a }));
    lamp.position.y = BEACON.h + 0.35;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 7), red);
    cap.position.y = BEACON.h + 1.05;
    g.add(lamp, cap);
    g.position.set(BEACON.x, heightAt(BEACON.x, BEACON.z) - 0.2, BEACON.z);
    group.add(g);
    const lab = labelSprite('Beacon', '#ffd32a', 'rgba(10,10,46,0.7)', 0.75);
    lab.position.y = BEACON.h + 2.4;
    g.add(lab);
    labels.push({ spr: lab, base: 0.75, fadeFar: [150, 210] });
    animated.push({ fn: (t) => { lamp.scale.setScalar(1 + Math.sin(t * 3.1) * 0.16); } });
    BEACON.baseY = g.position.y;
  }

  // ---- mooring posts off the Boat Dock (bounce targets) --------------------
  {
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0xd9c9a3, flatShading: true });
    for (const p of POSTS) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.15, p.h + 2.2, 8), plankMat2);
      body.position.y = (p.h - 2.2) / 2;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(p.r * 1.1, 8, 6), plankMat);
      cap.position.y = p.h;
      const rope = new THREE.Mesh(new THREE.TorusGeometry(p.r * 1.25, 0.09, 5, 12), ropeMat);
      rope.rotation.x = -Math.PI / 2;
      rope.position.y = p.h - 0.4;
      g.add(body, cap, rope);
      g.position.set(p.x, 0, p.z);
      group.add(g);
      p.mesh = g;
    }
  }

  // ---- waterfall at the inlet ---------------------------------------------
  {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillRect(0, 0, 32, 128);
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      c.fillRect(Math.random() * 30, Math.random() * 128, 2.5, 12 + Math.random() * 40);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 2);
    const fallMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    const th = Math.atan2(WATERFALL.z - LAKE.cz, WATERFALL.x - LAKE.cx);
    const inward = { x: -Math.cos(th), z: -Math.sin(th) };
    const rotY = Math.atan2(inward.x, inward.z);
    // the rock notch it pours out of
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x8e8b80, flatShading: true });
    for (const side of [-1, 1]) {
      const bx = WATERFALL.x - inward.z * side * (WATERFALL.w * 0.95);
      const bz = WATERFALL.z + inward.x * side * (WATERFALL.w * 0.95);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 0), rockMat);
      rock.position.set(bx, WATERFALL.topY * 0.5, bz);
      rock.scale.set(1, 1.9, 1.1);
      rock.rotation.y = rnd() * TAU;
      group.add(rock);
    }
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(WATERFALL.w * 1.5, WATERFALL.topY), fallMat);
    curtain.position.set(WATERFALL.x + inward.x * 1.2, WATERFALL.topY / 2, WATERFALL.z + inward.z * 1.2);
    curtain.rotation.y = rotY;
    group.add(curtain);
    const foam = new THREE.Mesh(new THREE.CircleGeometry(WATERFALL.w * 1.25, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(curtain.position.x + inward.x * 1.0, 0.06, curtain.position.z + inward.z * 1.0);
    foam.renderOrder = 3;
    group.add(foam);
    animated.push({
      fn: (t) => {
        tex.offset.y = -t * 1.25;
        foam.scale.setScalar(1 + Math.sin(t * 4.4) * 0.06);
      },
    });
  }

  // ---- natural stone shelves (spot.shelf) ---------------------------------
  // Rocky Point, Waterfall Inlet and the Cliff Ledge stand on steep banks, so
  // each gets a flat rock shelf out over the water: level footing for the loose
  // skimming stones (rocks.js scatters them across it, out to spot.deck.max) and
  // a reason the spot exists at all. One builder, three spots, no special cases.
  for (const s of SPOTS) {
    if (!s.shelf) continue;
    const sh = s.shelf;
    const mat = new THREE.MeshLambertMaterial({ color: sh.color || STONE, flatShading: true });
    const g = new THREE.Group();
    const depth = sh.len + sh.back;
    // 3 m thick, so the bank under it never shows through
    const slab = new THREE.Mesh(new THREE.BoxGeometry(sh.w, 3, depth), mat);
    slab.position.set(0, s.standY - 1.5, (sh.len - sh.back) / 2);
    g.add(slab);
    // a lower step at the back, so the shelf reads as something you climbed onto
    const step = new THREE.Mesh(new THREE.BoxGeometry(sh.w * 0.72, 2.4, 1.8), mat);
    step.position.set(0, s.standY - 1.55, -sh.back - 0.6);
    g.add(step);
    // rounded boulders along both edges, and a few along the front lip, so the
    // shelf never reads as a grey box floating in the lake
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 + rnd() * 0.85, 0), mat);
      b.position.set(side * (sh.w * 0.5 + rnd() * 0.5),
        s.standY - 0.35 - rnd() * 0.5,
        -sh.back + rnd() * (depth + 0.6));
      b.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      b.scale.y = 0.7 + rnd() * 0.5;
      g.add(b);
    }
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + rnd() * 0.5, 0), mat);
      b.position.set((rnd() - 0.5) * sh.w * 1.05, s.standY - 0.3 - rnd() * 0.35,
        sh.len - 0.1 + rnd() * 0.5);
      b.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      b.scale.y = 0.55 + rnd() * 0.4;
      g.add(b);
    }
    // thin slabs lying on top: the flat rock the stones rest on gets some tone
    // variation, which is what stops the deck looking like painted cardboard
    for (let i = 0; i < 5; i++) {
      const pm = new THREE.MeshLambertMaterial({ color: sh.color || STONE, flatShading: true });
      pm.color.offsetHSL(0, 0, (rnd() - 0.4) * 0.09);
      const pw = 0.9 + rnd() * 1.5, pl = 0.9 + rnd() * 1.8;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.07, pl), pm);
      plate.position.set((rnd() - 0.5) * (sh.w - pw * 0.8), s.standY + 0.035,
        -sh.back * 0.6 + rnd() * (depth * 0.8));
      plate.rotation.y = rnd() * TAU;
      g.add(plate);
    }
    g.position.set(s.x, 0, s.z);
    g.rotation.y = Math.atan2(s.fx, s.fz);
    group.add(g);
  }
  {
    const s = spotById('rocky');
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8d8a82, flatShading: true });
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const lat = side * (7 + rnd() * 12);
      const fwd = -4 + rnd() * 14;
      const x = s.x + s.fx * fwd + s.rx * lat;
      const z = s.z + s.fz * fwd + s.rz * lat;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rnd() * 2.1, 0), stoneMat);
      b.position.set(x, heightAt(x, z) + 0.3, z);
      b.rotation.set(rnd(), rnd(), rnd());
      b.scale.y = 0.7 + rnd() * 0.5;
      group.add(b);
    }
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const R = lakeRadius(a);
    const x = LAKE.cx + Math.cos(a) * (R + 2 + rnd() * 8);
    const z = LAKE.cz + Math.sin(a) * (R + 2 + rnd() * 8);
    const gy = heightAt(x, z);
    if (gy < 0.1) continue;
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.42, 3 + rnd() * 3, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6a48, flatShading: true })
    );
    log.position.set(x, gy + 0.3, z);
    log.rotation.set(Math.PI / 2, rnd() * TAU, 0.1);
    group.add(log);
  }

  const camPos = new THREE.Vector3();
  const labPos = new THREE.Vector3();

  function update(dt, t) {
    swayTime.value = t;
    for (const a of animated) a.fn(t, dt);
    if (camera) {
      camera.getWorldPosition(camPos);
      // The marker you are standing on would otherwise wash the ground right in
      // front of you purple (the resting camera looks down 10 deg), so hide it.
      // The map view shows the lot, locked ones included.
      for (const g of spotMarkers) {
        const dx = g.position.x - camPos.x, dz = g.position.z - camPos.z;
        g.visible = mapMode
          || (g.userData.spot.unlocked && dx * dx + dz * dz > 2.6 * 2.6);
      }
      for (const l of labels) {
        l.spr.getWorldPosition(labPos);
        const d = camPos.distanceTo(labPos);
        // 55 m is the reference distance the label sizes were tuned at
        const map = mapMode && l.mapK;
        // In the map view the clamp comes off: scale rising with the distance is
        // exactly what keeps a name the same size on screen from 400 m up.
        const k = map ? clamp(d / 55, 0.22, 26) * l.mapK : clamp(d / 55, 0.22, 1.5);
        const bw = l.wh ? l.wh[0] : 9, bh = l.wh ? l.wh[1] : 3.4;
        l.spr.scale.set(bw * l.base * k, bh * l.base * k, 1);
        if (map) {
          l.spr.material.opacity = l.spr.userData.mapOpacity || 1;
          // a padlock tag owns its own visibility (setMapMode); a name is up unless
          // the padlock version of it has taken over
          if (!l.mapOnly) l.spr.visible = !l.spr.userData.mapSuppress;
          continue;
        }
        if (l.mapOnly) { l.spr.visible = false; continue; }
        let o = 1;
        if (l.fadeFar) o = 1 - smoothRange(l.fadeFar[0], l.fadeFar[1], d);
        if (l.showNear) {
          const sx = camPos.x - l.showNear.x, sz = camPos.z - l.showNear.z;
          o = Math.min(o, 1 - smoothRange(l.nearRange[0], l.nearRange[1], Math.hypot(sx, sz)));
        }
        if (l.fadeFar || l.showNear) {
          l.spr.material.opacity = o;
          l.spr.visible = o > 0.03;
        }
      }
    }
  }

  return {
    group, update, pickables, setMapMode, markerState,
    get mapMode() { return mapMode; },
    stats: {
      reeds: reedPositions.length, trees: trunks.length,
      pads: pads.length, planks: planks.length,
    },
  };
}
