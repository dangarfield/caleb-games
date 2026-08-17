// The payoff for finding all ten shards on a beach: they whirl in and become
// the whole object again. Rendered as a small overlay scene on top of whatever
// is already on the canvas.

import * as THREE from 'three';
import * as audio from './audio.js';
import {
  ceramicShardGeometry, ceramicItemGeometry, ceramicMaterial, glowTexture, makeEnvironment,
} from './env.js';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
camera.position.set(0, 1.35, 4.4);
camera.lookAt(0, 1.05, 0);

scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x6a5a80, 0.8));
const key = new THREE.DirectionalLight(0xfff4e0, 1.9);
key.position.set(-2, 4, 3.5);
scene.add(key);
const rim = new THREE.DirectionalLight(0xa29bfe, 0.9);
rim.position.set(3, 1, -3);
scene.add(rim);
{
  const envSet = makeEnvironment('assemble', 0x7fc4ee, 0xe8eef2, 0xd8c9a6);
  scene.environment = envSet.environment;
}

const holder = new THREE.Group();
holder.position.y = 1.0;
scene.add(holder);

const shardGeos = [];
for (let i = 0; i < 10; i++) shardGeos.push(ceramicShardGeometry(i + 21));

const sparkTex = glowTexture();
const sparks = [];
for (let i = 0; i < 22; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color: 0xffe9a8, transparent: true, opacity: 0,
    depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  s.visible = false;
  scene.add(s);
  sparks.push({ sprite: s, life: 0, vel: new THREE.Vector3() });
}

let shards = [];
let item = null;
let t = 0;
let running = false;
const DUR_FLY = 1.9;
const DUR_TOTAL = 3.6;

function clear() {
  for (const s of shards) { holder.remove(s.mesh); s.mesh.material.dispose(); }
  shards = [];
  if (item) { holder.remove(item); item.material.dispose(); item.geometry.dispose(); item = null; }
  for (const s of sparks) { s.sprite.visible = false; s.life = 0; }
}

export function start(beach) {
  clear();
  t = 0;
  running = true;

  const mat = () => ceramicMaterial(beach.ceramic.base, beach.ceramic.accent);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(shardGeos[i], mat());
    m.material.side = THREE.DoubleSide;
    m.scale.set(0.2, 0.05, 0.2);
    const a = (i / 10) * Math.PI * 2;
    const start = new THREE.Vector3(
      Math.cos(a) * 2.6,
      Math.sin(a * 1.7) * 1.5,
      Math.sin(a) * 2.6 - 0.4
    );
    m.position.copy(start);
    holder.add(m);
    shards.push({
      mesh: m, start,
      end: new THREE.Vector3(Math.cos(a) * 0.24, 0.45 + Math.sin(a * 2) * 0.12, Math.sin(a) * 0.24),
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      delay: i * 0.05,
    });
  }

  const geo = ceramicItemGeometry(beach.ceramic.kind);
  const im = ceramicMaterial(beach.ceramic.base, beach.ceramic.accent);
  im.side = THREE.DoubleSide;
  im.transparent = true;
  im.opacity = 0;
  item = new THREE.Mesh(geo, im);
  item.scale.setScalar(0.01);
  holder.add(item);

  audio.assembleChime();
}

function spawnSparks() {
  for (const s of sparks) {
    s.sprite.position.set((Math.random() - 0.5) * 0.5, 0.4 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    s.vel.set((Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4);
    s.sprite.scale.setScalar(0.16 + Math.random() * 0.16);
    s.sprite.material.opacity = 1;
    s.sprite.visible = true;
    s.life = 0.8 + Math.random() * 0.6;
  }
}

let sparked = false;

export function update(dt) {
  if (!running) return false;
  t += dt;
  holder.rotation.y += dt * 0.5;

  for (const s of shards) {
    const p = THREE.MathUtils.clamp((t - s.delay) / DUR_FLY, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    s.mesh.position.lerpVectors(s.start, s.end, e);
    s.mesh.rotation.x += s.spin.x * dt * (1 - e * 0.8);
    s.mesh.rotation.y += s.spin.y * dt * (1 - e * 0.8);
    s.mesh.rotation.z += s.spin.z * dt * (1 - e * 0.8);
    if (p >= 1) s.mesh.visible = false;
  }

  if (t >= DUR_FLY && !sparked) { sparked = true; spawnSparks(); audio.unlockFanfare(); }
  if (t < DUR_FLY) sparked = false;

  if (item) {
    const p = THREE.MathUtils.clamp((t - DUR_FLY + 0.25) / 0.85, 0, 1);
    const e = p < 1 ? 1 - Math.pow(1 - p, 3) : 1;
    const overshoot = 1 + Math.sin(Math.min(1, p) * Math.PI) * 0.14;
    item.scale.setScalar(Math.max(0.01, e * 0.95 * overshoot));
    item.material.opacity = e;
    item.position.y = 0.06;
  }

  for (const s of sparks) {
    if (s.life <= 0) continue;
    s.life -= dt;
    if (s.life <= 0) { s.sprite.visible = false; continue; }
    s.vel.y -= 2.2 * dt;
    s.sprite.position.addScaledVector(s.vel, dt);
    s.sprite.material.opacity = Math.min(1, s.life * 1.5);
  }

  if (t > DUR_TOTAL) running = false;
  return true;
}

export function isRunning() { return running; }

export function stop() {
  running = false;
  clear();
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
