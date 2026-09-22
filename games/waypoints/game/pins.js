// Waypoints — the markers standing in the park.
//
// The first version was a post with a ball on top, in three colours. It read as
// a placeholder because it was one: nothing about a coloured ball says "there is
// a bear here" or "this is the camp you are starting from", so the player had to
// be told in words what the park should have been telling him.
//
// This is a disc facing you with the waypoint's OWN printed icon on it — the
// same artwork as the sheet in his hands, so the thing on the paper and the
// thing on the hillside are recognisably one thing — on a thin stem, with a
// shadow under it and a slow bob. A sprite rather than geometry, because a flat
// disc that always faces the camera is legible from anywhere and costs two
// triangles.

import * as THREE from 'three';
import { drawIcon, iconReady } from '../mapper/icons.js';

/**
 * Gold means TAP ME, and nothing else.
 *
 * It is the game's one loud colour: the campsite the die chose, and the grounds
 * a glider could land on. When everything was gold the one pin the player was
 * being asked to press looked exactly like the forty he was not.
 */
const GOLD = { face: '#fff4d2', ink: '#8a6410', ring: '#f2c230' };

/**
 * Everything else is coloured by WHAT IT IS.
 *
 * The same idea as the printed sheet: you learn a shape and a colour once and
 * then read the hillside the way you read the paper. Animals warm, high places
 * cool, water blue, trees green, kit orange — and none of them gold.
 */
const TYPE = {
  campsite: { ring: '#e2624a', ink: '#a8341f' },
  bear:     { ring: '#8a5a33', ink: '#54351a' },
  rabbit:   { ring: '#b08a5a', ink: '#6f5228' },
  bird:     { ring: '#4f8fc7', ink: '#26547f' },
  mountain: { ring: '#8d7fa2', ink: '#4e4263' },
  trig:     { ring: '#6d7f92', ink: '#374855' },
  lookout:  { ring: '#57a08a', ink: '#256250' },
  gear:     { ring: '#c07a3a', ink: '#8a4d12' },
  lake:     { ring: '#3f9ac9', ink: '#1c5e84' },
  woodland: { ring: '#5aa04f', ink: '#2c6a2c' },
  bridge:   { ring: '#98a3ae', ink: '#54606c' },
};
const PLAIN = { ring: '#8fa0b0', ink: '#43525f' };

/** Where you are standing: white, and the only marker with a dark rim. */
const HERE = { face: '#ffffff', ring: '#22303d', ink: '#22303d' };

/**
 * How a marker is dressed. The KIND says how loud, the TYPE says what colour.
 *
 * `own` means the palette is fixed whatever is under it — gold for the ones you
 * are being asked to press, white for the ground beneath your feet. `fade` is
 * something already collected: the same colour, gone quiet, so a full map still
 * reads at a glance as what is left.
 */
export const PIN = {
  camp:  { face: '#ffffff', size: 1, lift: 1 },
  pick:  { own: GOLD, size: 1, lift: 1 },
  here:  { own: HERE, size: 1, lift: 1 },
  reach: { face: '#ffffff', size: 1, lift: 1 },
  been:  { face: '#f1f4f7', size: 1, lift: 1, fade: true },
  // Lakes, woods and bridges: not waypoints, still worth points, and the same
  // marker. Sizing them down made a class of thing look like a lesser thing.
  feat:  { face: '#ffffff', size: 1, lift: 1 },
  got:   { face: '#f1f4f7', size: 1, lift: 1, fade: true },
};

/** Mix a colour towards the paper, for the things already in the bag. */
function quiet(hex, k = 0.55) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (236 - c) * k);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix)
    .map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** The three colours a marker is drawn in, from its kind and what it marks. */
function paint(type, kind) {
  const s = PIN[kind] || PIN.camp;
  if (s.own) return { ...s.own, size: s.size, lift: s.lift };
  const t = TYPE[type] || PLAIN;
  const ring = s.fade ? quiet(t.ring) : t.ring;
  const ink = s.fade ? quiet(t.ink, 0.42) : t.ink;
  return { face: s.face, ring, ink, size: s.size, lift: s.lift };
}

/** The printed icon for a waypoint type, where there is one. */
const ICON = {
  bear: 'wp-bear', bird: 'wp-bird', rabbit: 'wp-rabbit', trig: 'wp-trig',
  mountain: 'wp-mountain', lookout: 'wp-lookout', gear: 'wp-gear', campsite: 'wp-campsite',
  // the features, drawn with the same artwork the sheet prints them with
  lake: 'lake', woodland: 'woodland', bridge: 'bridge',
};

const cache = new Map();

/**
 * The face of a pin, drawn once per (type, kind) and kept.
 *
 * Two hundred and fifty-six pixels because it is on screen at maybe sixty and a
 * pin you walk up to should not go soft.
 */
function face(type, kind) {
  const key = `${type}/${kind}`;
  if (cache.has(key)) return cache.get(key);
  const s = paint(type, kind);
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const r = N * 0.40;

  // a soft halo, so it lifts off a hillside of the same colour
  const glow = ctx.createRadialGradient(N / 2, N / 2, r * 0.8, N / 2, N / 2, N / 2);
  glow.addColorStop(0, s.ring + 'cc');
  glow.addColorStop(1, s.ring + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, N, N);

  ctx.beginPath(); ctx.arc(N / 2, N / 2, r, 0, 7);
  ctx.fillStyle = s.face; ctx.fill();
  ctx.lineWidth = N * 0.055; ctx.strokeStyle = s.ring; ctx.stroke();

  const name = ICON[type];
  if (!name || !iconReady(name) || !drawIcon(ctx, name, N / 2, N / 2, r * 1.15, { color: s.ink })) {
    // No printed icon for this one — a dot rather than a gap.
    ctx.beginPath(); ctx.arc(N / 2, N / 2, r * 0.3, 0, 7);
    ctx.fillStyle = s.ink; ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

/** Throw away the cached faces — the icons landed after the first pin was built. */
export function forgetFaces() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/**
 * One marker, built a unit tall and scaled later.
 *
 * Nothing here is in cell units on purpose. A marker that is a fixed size on the
 * ground is either a speck from the drone or a tower from the path; what wants
 * to stay the same is how big it LOOKS, so it is built at height one and the
 * caller decides what one means at this distance.
 */
export function makePin(wp, kind, groundY) {
  const s = paint(wp.type, kind);
  const grp = new THREE.Group();
  grp.position.set(wp.x, groundY, wp.y);

  // the shadow it casts, which is what plants it on the ground
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 20),
    new THREE.MeshBasicMaterial({ color: 0x1a2430, transparent: true, opacity: 0.28,
      depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, s.lift, 5),
    new THREE.MeshBasicMaterial({ color: s.ring, transparent: true, opacity: 0.75,
      depthTest: false }));
  stem.position.y = s.lift / 2;

  const head = new THREE.Sprite(new THREE.SpriteMaterial({
    map: face(wp.type, kind), transparent: true, depthTest: false }));
  head.scale.setScalar(0.62);
  head.position.y = s.lift + 0.26;

  for (const o of [shadow, stem, head]) {
    o.frustumCulled = false;
    o.renderOrder = 4;
    o.userData.waypoint = wp;              // every part of it is tappable
    grp.add(o);
  }
  grp.userData = { size: s.size, kind, head, stem, base: s.lift + 0.26, waypoint: wp };
  return grp;
}

/**
 * Size them for this distance, and give them a little life.
 *
 * The bob is small and slow — enough that the park does not look like a
 * photograph, not so much that eight of them turn the hillside into a fairground.
 * The one you have rolled, or are standing on, breathes a bit harder.
 */
export function sizePins(group, dist, now = Date.now()) {
  if (!group || !group.children.length) return;
  // One size, for everything. A marker is a marker: shrinking the ones the game
  // thought were less important made half of them look like a different and
  // lesser kind of thing.
  const h = Math.max(0.02, dist) * 0.055;          // about 4% of the frame
  for (let i = 0; i < group.children.length; i++) {
    const pin = group.children[i];
    const d = pin.userData;
    if (!d || !d.head) continue;
    pin.scale.setScalar(h * (d.size || 1));
    const live = d.kind === 'pick' || d.kind === 'here';
    const t = now / 1000 + i * 0.7;                // each one on its own beat
    d.head.position.y = d.base + Math.sin(t * 1.6) * (live ? 0.10 : 0.05);
    if (live) d.head.scale.setScalar(0.62 * (1 + Math.sin(t * 3.2) * 0.07));
  }
}
