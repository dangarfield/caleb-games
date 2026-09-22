// Waypoints — the map in your hands, and the one gesture that puts it away.
//
// No game logic. This is the world and the sheet of paper in it, so the zoom can
// be got right before anything is hung off it.
//
// The map is not a panel over the top of the world. It is a piece of paper the
// walker is holding: the mapper's renderer draws the sheet to an off-screen
// canvas, that canvas is a texture, and the texture is on a quad parented to the
// camera. So it hangs in front of his eyes, tilts with his head, and the ground
// is visible past its edge — which is the whole reason for doing it this way
// rather than as an overlay.
//
// Nothing here draws the map or the terrain. Both come from the mapper.

import { Doc, migrate } from '../mapper/state.js';
import { createSheet } from '../mapper/sheet.js';
import { Preview3D } from '../mapper/preview3d.js';
import { HIKES, WEATHER as SYMBOL } from '../mapper/board.js';
import * as THREE from 'three';
import { STOPS, nextStop } from './views.js';
import { Play2D, pulsing } from './play2d.js';
import { reachable } from './rules.js';
import { previewMove } from './state.js';
import { Phone } from './phone.js';
import { makeControls } from './sticks.js';
import { Walk } from './walk.js';
import { makePin, sizePins, forgetFaces } from './pins.js';
import { makeProp } from './props.js';
import { lessonFor } from './tutor.js';
import { music } from './music.js';
import { TIERS, guessTier, lower, governor } from './quality.js';
import { loadIcons } from '../mapper/icons.js';
import { GOALS, WEATHER, INTRO, prompt, note } from './copy.js';
import { loadState, addPlayer, rememberPlayer, record, table } from './store.js';

const $ = (id) => document.getElementById(id);
const MAP = 'assets/maps/map-01.json';

/**
 * One number, 0 to 1000, for where your attention is.
 *
 *   0 ------ 250 ------ 420 ------ 580 ------ 760 ------ 1000
 *   map up close │ whole map │ head up │ over the shoulder │ drone │ macro
 *
 * The bands are names for stretches of one axis, not modes. Between 250 and 420
 * the zoom does not change at all: the head comes up and the map goes down to
 * his side, which is the only part of the journey that is a movement rather
 * than a distance.
 */
// The head coming up and the map going away runs the WHOLE way from 250 to 650.
// It used to finish at 420, which left 230 units of slider where the picture did
// not change at all — a dead stretch you can feel.
// The named stops the buttons step between are 0, 100, 651, 800, 950 — map
// close, map in hand, over the shoulder, drone, whole park — so the bands are
// named for where those stops LAND. `max` is a little headroom past macro so the
// last stop is not also the end of the axis.
const B = { read: 250, hand: 450, eyes: 650, drone: 800, macro: 950, max: 1000 };


const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, v) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const ease = (t) => t * t * (3 - 2 * t);
/** Zoom is felt as a ratio, not a difference. */
const glide = (a, b, t) => a * Math.pow(b / a, t);

const state = {
  menu: null,                           // a bag or a glide, open over the turn
  tutor: false,                         // the lessons are on
  intro: null,                          // which page of the opening is showing
  zoom: 100, aim: 100, tween: 0, tweenId: 0, ed: null, v3: null, doc: null, map3d: null, yaw: 0.6,
  play: null, phase: null, marks: null, reach: [], reachKey: null,
  // The screen you are on. The park is behind all of them — the title is a view
  // of the park with words over it, not a different page.
  screen: 'title', who: null, phone: null, controls: null,
  spin: 0, spinning: false,          // the park turning under the campsite pick
  rolling: false,                    // a roll is settling; a second press is ignored
  props: null, spot: null, spotAnim: 0,   // the creature you have stopped for
  woodPicks: [],                     // what he said he saw, wood by wood
  walk: null, walkAnim: 0,           // the leg being walked, and its loop
  pinOrder: [], pinBeat: 0,          // which campsite pin is lit, and when
  markKey: null,                     // what the planted markers are showing
  sky: null,                         // the weather cross-fade in progress
  // While the map is being read, a drag moves the PAPER rather than the head —
  // you slide the sheet about to look at a different corner of it. Held in the
  // paper's own plane, in world units.
  pan: { x: 0, y: 0 },
};

/**
 * How much of a pan survives at this zoom.
 *
 * One at the paper, nothing by the time the whole map is in view — so pinching
 * out walks the sheet back to the middle of its own accord, and 250 is always
 * centred however far it was pushed about at 40.
 */
const panDamp = (z) => 1 - ease(inv(0, B.read, z));

async function boot() {
  const map = migrate(await (await fetch(MAP)).json());
  state.doc = new Doc(map, false);              // never writes to the mapper's autosave

  // The sheet, drawn by the mapper's own renderer with the editing switched off.
  state.ed = createSheet($('map2d'), state.doc, {
    underlay: false, pips: false, locked: true,
  });
  state.ed.onChange = () => {};

  // What this machine is allowed, decided before anything is built: the sheet's
  // backing store and the renderer both take their size from it. Corrected
  // later by the governor if the guess was optimistic.
  state.tier = guessTier();
  const q = TIERS[state.tier];
  state.ed.maxDpr = q.pixels;

  // The rules, hung off the same sheet. `Play2D` draws its overlay inside the
  // map's own transform — the routes, the rings on what you have visited, the
  // campsites waiting to be chosen — so all of it arrives on the paper the
  // walker is holding without this file drawing a single line of it.
  state.play = new Play2D(state.ed, state.doc, onTurn);
  // The page draws the sheet once per frame in `repaint`; the board must not
  // draw it again on every pointer event.
  state.play.deferDraw = true;
  state.play.reset({ difficulty: 'easy', players: ['Walker'] });

  state.v3 = new Preview3D($('view3d'), q);
  // The game brings its own gesture, on the whole stage. The mapper's own
  // click-drag-wheel handling would fight it — and clicking the ground to send
  // the walker somewhere is not a thing this game has at all.
  state.v3.interactive = false;
  // No mapper poles. The game's own gold markers say where everything is, and
  // a pole with a cone on it standing beside one is just scaffolding.
  state.v3.posts = false;
  state.v3.rebuild(state.doc.map, q.res);
  state.v3.cameraOverride = place;
  state.marks = new THREE.Group();
  state.v3.scene.add(state.marks);
  state.props = new THREE.Group();
  state.v3.scene.add(state.props);

  state.phone = new Phone($('phone'));
  music($('theme'));
  keepUp();
  zoomHint();
  state.controls = makeControls(document);
  state.controls.show(false);
  state.controls.onChange = () => { if (state.screen === 'walk') showWalk(); };

  const paint = () => { state.ed.fit(); if (state.map3d) state.map3d.tex.needsUpdate = true; };
  state.v3.onKit = () => state.v3.render();
  // The printed icons arrive asynchronously. A pin built before they land has a
  // dot where its picture should be, and nothing would ever redraw it.
  loadIcons(() => { forgetFaces(); markers(true); state.v3.render(); });

  requestAnimationFrame(() => requestAnimationFrame(() => {
    paint();
    makeHeldMap();
    state.v3.resize();
    state.zoom = state.aim = B.macro;         // the title sits over the whole park
    apply();
    startSpin();
    pulse();
  }));
  bind();
  showTitle();
}

/**
 * The pulse.
 *
 * Where you are standing has to be findable at a glance on a sheet this busy, so
 * the sheet is redrawn on a slow tick — but only while the paper is actually in
 * front of his face, and only in the phases that have something pulsing. It runs
 * off the same clock the sheet draws it from, so the redraw happens ON the flip
 * and nowhere else. Marking the texture is not enough either: the scene draws
 * only when asked, so a pulse nobody renders is a still picture.
 */
function pulse() {
  let lit = null;
  setInterval(() => {
    const phase = state.play && state.play.g.phase;
    if (!state.map3d) return;
    // the campsite pins flash in the park, whatever the zoom
    if (state.screen === 'game' && phase === 'start') {
      state.pinBeat = (state.pinBeat + 1) % Math.max(1, state.pinOrder.length);
      markers(); state.v3.render();
      return;
    }
    if (state.zoom >= B.eyes) return;
    if (phase !== 'move') return;
    const now = pulsing();
    if (now === lit) return;
    lit = now;
    state.ed.draw();
    state.map3d.tex.needsUpdate = true;
    state.v3.render();
  }, 380);
}

/**
 * The park, turning slowly.
 *
 * Behind the title, and again while you are being shown the six campsites —
 * both are moments where nothing is being decided in a hurry and a still
 * picture of a model looks like a broken game. It stops the moment you zoom in,
 * because then you are doing something and the park moving under you is just in
 * the way.
 */
function startSpin() { state.spinning = true; live(); }
function stopSpin() { state.spinning = false; }

/** Are there markers on screen that want to keep moving? */
const pinsLive = () => state.screen !== 'walk' && state.zoom >= B.eyes
  && state.marks && state.marks.children.length > 0;

/**
 * The park, alive.
 *
 * Runs while the park is turning under the title and the campsite pick, and
 * while there are pins on the hillside — they bob, and a bob drawn at the
 * pulse's two and a half frames a second is not a bob, it is a twitch.
 *
 * Twenty frames a second, not sixty. The park is ten million triangles and it is
 * turning at a ninetieth of a revolution a second; three times the frames buys
 * nothing you can see and costs a tablet its battery. It stops itself the moment
 * neither reason holds, so reading the map costs nothing at all.
 */
function live() {
  if (state.spin) return;
  let last = performance.now();
  const FRAME = 1000 / 20;
  const step = (now) => {
    if (!state.spinning && !pinsLive()) { state.spin = 0; return; }
    state.spin = requestAnimationFrame(step);
    if (now - last < FRAME) return;
    const dt = Math.min(0.2, (now - last) / 1000); last = now;
    if (state.spinning) state.yaw += dt * 0.09;
    apply();
  };
  state.spin = requestAnimationFrame(step);
}

/**
 * The sheet of paper, as an object in the world.
 *
 * Parented to the CAMERA, so it travels with the head rather than being placed
 * in the park: a held map does not stay behind when you look away from it.
 */
function makeHeldMap() {
  const c = $('map2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Anisotropy is per-sample work on a texture that covers most of the screen.
  // Eight is worth it on a laptop and is not on a tablet.
  tex.anisotropy = state.tier === 'high' ? 8 : 2;
  const aspect = c.width / c.height || 1.2;
  // A folded walking map is about 45 cm across. In cell units on a 5 km square
  // that is nothing, so the paper is sized in metres like everything else.
  const m = state.doc.map.world.metresPerCell || 5000;
  const w = 0.46 / m, h = w / aspect;
  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  state.v3.camera.add(mesh);
  // `lastD` is filled in by `place` on every frame; seeded here so a drag before
  // the first frame cannot work from undefined.
  state.map3d = { mesh, tex, w, h, lastD: w * 0.3 };
}

/**
 * Where the camera is, where it is pointing, and where the paper is.
 *
 * One spherical rig for the whole axis: a focus point, a yaw, a pitch and a
 * distance, all functions of the zoom. At distance zero the camera sits ON the
 * focus and looks along its own direction, which is what makes "behind his
 * eyes" and "over his shoulder" the same rig rather than two.
 *
 * Called by the preview through `cameraOverride`, every frame.
 */
function rig() {
  const z = state.zoom;
  const { cols, rows } = state.doc.map.grid;
  const m = state.doc.map.world.metresPerCell || 5000;
  const v3 = state.v3, p = v3.hiker;
  const eyeH = ((state.doc.map.world.figureHeight ?? 1.8) * 0.94) / m;
  const head = new THREE.Vector3(p.x, v3.h(p.x, p.y) + eyeH, p.y);

  // Pitch: chin down on the paper, up to the horizon as the map is put away,
  // then tipping down again as the camera climbs away from him.
  let pitch;
  if (z <= B.read) pitch = 0.62;
  else if (z <= B.hand) pitch = lerp(0.62, 0, ease(inv(B.read, B.hand, z)));
  else if (z <= B.eyes) pitch = 0;
  // Walking, the camera rides a little above him and looks down the path rather
  // than straight out at the horizon.
  else if (z <= B.drone) pitch = lerp(0.20, 0.42, ease(inv(B.eyes, B.drone, z)));
  else if (z <= B.macro) pitch = lerp(0.38, 0.85, ease(inv(B.drone, B.macro, z)));
  else pitch = lerp(0.85, 0.92, ease(inv(B.macro, B.max, z)));

  // Distance: nothing at all until the map is away and the head is up, then a
  // ramp per band, sized so the band's NAME is true all the way across it — a
  // stretch labelled drone that starts fourteen metres up is a lie.
  let dist = 0;
  // `>=`, not `>`: the label flips at exactly B.eyes, so the distance has to
  // start there too or the first frame of third person is still first person.
  const park = Math.max(cols, rows);
  // Nine metres back, not two and a half. 651 is where the whole walk is done
  // now, and a camera on the back of his neck shows you his rucksack and none
  // of the path he is supposed to be following.
  if (z >= B.eyes && z <= B.drone) dist = glide(9 / m, 400 / m, ease(inv(B.eyes, B.drone, z)));
  // Macro is the whole park FILLING the frame, not floating in the middle of it:
  // close enough that the model is the picture.
  else if (z > B.drone && z <= B.macro) dist = glide(400 / m, park * 1.05, ease(inv(B.drone, B.macro, z)));
  else if (z > B.macro) dist = glide(park * 1.05, park * 1.4, ease(inv(B.macro, B.max, z)));

  // From the macro end the park is the subject, not the walker.
  const focus = head.clone();
  // ...and when you have stopped for something, THAT is the subject. The camera
  // leans off him and onto it, and comes in closer, which is the difference
  // between a bear being present and a bear being noticed.
  if (state.spot && state.spot.k > 0) {
    const sp = state.spot;
    // Aim at the middle of the thing, not at the ground under it: a rabbit
    // framed on its feet is a photograph of a path.
    const up = ((sp.size || 1) * 0.55 + 0.25) / m;
    focus.lerp(new THREE.Vector3(sp.x, v3.h(sp.x, sp.y) + up, sp.y), sp.k * 0.92);
  }
  if (z > B.drone) {
    const t = ease(inv(B.drone, B.macro, z));
    focus.lerp(new THREE.Vector3(cols / 2, v3.h(cols / 2, rows / 2), rows / 2), t);
  }
  // Close enough that it fills the frame, and sized by the animal: a bear and a
  // rabbit shot from the same three metres are one good photograph and one
  // empty field. Never nearer than a metre and a half, or the camera is inside
  // the rabbit.
  if (state.spot && state.spot.k > 0) {
    const sp = state.spot;
    const want = Math.max(1.3, (sp.size || 1) * 1.9) / m;
    dist = lerp(dist, Math.min(dist, want), sp.k);
    // ...and looking DOWN at it. The park's ground cover stands about a metre
    // tall, so a rabbit photographed from a rabbit's own height is a photograph
    // of grass. The smaller the animal, the further over it the camera leans.
    pitch = lerp(pitch, 0.62 - Math.min(0.30, (sp.size || 1) * 0.16), sp.k);
  }
  // A stop can swing the camera round the pair of them, so he is in his own
  // shot rather than a rucksack filling the front of it.
  const sp = state.spot;
  const yaw = state.yaw + (sp && sp.k > 0 ? (sp.turn || 0) * sp.k : 0);
  return { z, m, pitch, dist, focus, yaw };
}

function place(cam, v3) {
  const r = rig();
  // forward, with a positive pitch meaning "looking down"
  const dir = new THREE.Vector3(
    Math.sin(r.yaw) * Math.cos(r.pitch), -Math.sin(r.pitch), Math.cos(r.yaw) * Math.cos(r.pitch));
  cam.position.copy(r.focus).addScaledVector(dir, -r.dist);
  cam.lookAt(cam.position.clone().add(dir));

  // The camera must never end up inside the hillside. Anything behind him is
  // behind him in THREE dimensions, and a walker climbing a slope has a camera
  // several metres into it — which is a black screen and no way to tell why. It
  // is lifted to stand clear of whatever ground it is over, and then re-aimed at
  // what it was looking at. Not in first person: there is no camera arm to lift.
  if (r.dist > 0) {
    const floor = v3.h(cam.position.x, cam.position.z) + 1.4 / r.m;
    if (cam.position.y < floor) { cam.position.y = floor; cam.lookAt(r.focus); }
  }

  cam.fov = 68;
  cam.near = Math.max(1e-6, Math.max(r.dist, 0.3 / r.m) * 0.02);
  cam.far = Math.max(60, Math.max(r.dist, 1) * 40);
  v3.scene.fog.near = Math.max(600 / r.m, r.dist * 1.2);
  v3.scene.fog.far = Math.max(30000 / r.m, r.dist * 9);

  // --- the paper.
  //
  // It hangs in camera space, so it is always in front of the face whichever way
  // the head is turned. While it is being read it only moves AWAY — that is what
  // the pinch is doing — and the camera is already pitched down at it, so the
  // ground shows past its edges without the paper having to be tilted flat.
  const hold = state.map3d;
  if (!hold) return;
  const read = ease(inv(0, B.read, r.z));        // nose-close -> whole map in view
  // Two movements, back to back, rather than one that is over before the stretch
  // is: the head comes up from 250 to 450 with the map held square in front of
  // it, and THEN the map goes down to his side from 450 to 650. Running them
  // together left a hundred units at the end where nothing moved at all.
  const away = ease(inv(B.hand, B.eyes, r.z));   // handed down to his side
  const d = lerp(0.30, 1.15, read) * hold.w;     // how far off the face

  // Dead centre of the screen while it is being read — the head is already
  // pitched down at it, so the paper does not also need to sit low in the frame.
  hold.mesh.position.set(
    lerp(state.pan.x, hold.w * 0.62, away),
    lerp(state.pan.y, -d * 0.72, away),
    -d);
  // SQUARE ON while it is being read. The angle in the shot is the walker's
  // head, pitched down at it — the paper itself is held facing him, the way you
  // hold a map. Tilting the paper as well just makes it hard to read.
  hold.mesh.rotation.set(lerp(0, 0.85, away), lerp(0, -0.55, away), lerp(0, 0.3, away));
  hold.mesh.scale.setScalar(lerp(1, 0.6, away));
  hold.lastD = d;
  hold.mesh.material.opacity = 1 - ease(inv(B.eyes - 90, B.eyes, r.z));
  hold.mesh.visible = hold.mesh.material.opacity > 0.02;

  // you do not see yourself from behind your own eyes
  if (v3.character) v3.character.root.visible = r.z > B.eyes;

  sizeMarks();
}

/**
 * Markers standing on the ground, for the moments that are about the whole park.
 *
 * The paper has its own marks — `Play2D` draws those — but choosing where to set
 * off from is a decision about the PLACE, so at macro each campsite gets a post
 * in the world: something you can see against the terrain and tap.
 *
 * Rebuilt whenever the game moves rather than tracked. There are six of them.
 */
/**
 * What the markers are showing, as one string.
 *
 * `markers()` used to be called from every repaint — which is every pointer
 * move while a route is being dragged — and it tore down and rebuilt sixty pin
 * groups each time. Nothing about them changes while a finger is moving, so
 * they are rebuilt only when this line does.
 */
function markKey() {
  const p = state.play;
  if (!p) return '';
  const me = p.me, seen = me.seen || {};
  return [state.screen, p.g.phase, me.at, p.g.budget, p.startPick ? p.startPick.n : '',
    state.pinBeat, (p.glideAim || []).join('.'), me.visited.length, me.photographed.length,
    (seen.lakes || []).length, (seen.woodland || []).length, (seen.bridges || []).length,
  ].join('|');
}

function markers(force = false) {
  const g = state.marks;
  // The first turn is drawn before the world is built — the sheet and the rules
  // are up long before the terrain is. Nothing to plant yet, and nothing to
  // clear either.
  if (!g) return;
  const key = markKey();
  if (!force && key === state.markKey) return;
  state.markKey = key;
  while (g.children.length) {
    const pin = g.children.pop();
    pin.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
  }
  const p = state.play, v3 = state.v3;
  if (!p || !v3 || !v3.hf) return;

  // Not while he is out walking. These pins are for reading a turn off the park
  // from above — where you are, what is in reach — and out on the ground they
  // are a marker post planted on top of the walker, drawn over the hills
  // because they are meant to be seen through them.
  if (state.screen === 'walk') return;

  const plant = (wp, kind) => g.add(makePin(wp, kind, v3.h(wp.x, wp.y)));

  // Choosing where to set off from is a decision about the PLACE, so each
  // campsite gets a marker and the one the die offered is gold.
  if (p.g.phase === 'start') {
    const pick = p.startPick;
    // Before the die is stopped they light one at a time, in an order that is
    // different every game — six pins all pulsing together is a fairground, and
    // one after another is an invitation to look at each of them.
    const lit = pick ? null : state.pinOrder[state.pinBeat % Math.max(1, state.pinOrder.length)];
    for (const c of p.campsites()) {
      plant(c, pick ? (pick.wp.id === c.id ? 'pick' : 'camp') : (c.id === lit ? 'pick' : 'camp'));
    }
    // The lakes and woods show here too — you are choosing where to WAKE UP, and
    // what is near the camp is most of what makes that choice interesting.
    features();
    sizeMarks();
    return;
  }

  // Mid-hike the park shows the same thing the paper does: where you are
  // standing, and what is close enough to reach on what the weather gave you.
  const at = p.at;
  if (!at) return;
  plant(at, 'here');
  // A glider in the air: the park lights the same landing grounds the paper
  // does, so looking up from the map does not lose the question.
  if (p.glideAim && p.glideAim.length) {
    for (const id of p.glideAim) {
      const w = p.ix.byId.get(id);
      if (w) plant(w, 'pick');
    }
    features();
    sizeMarks();
    return;
  }
  const budget = p.g.budget;
  if (budget) {
    // What is in reach is a walk of the whole lattice, and `markers` is called
    // on every pointer move while a route is being dragged. It only changes when
    // you move or the weather does, so it is worked out once per turn.
    const key = at.id + '/' + budget;
    if (state.reachKey !== key) {
      state.reachKey = key;
      state.reach = reachable(p.ix, at.id, budget).map((r) => r.id);
    }
    const been = new Set(p.me.visited);
    for (const id of state.reach) {
      const w = p.ix.byId.get(id);
      if (w) plant(w, been.has(w.id) ? 'been' : 'reach');
    }
  }
  features();
  sizeMarks();
}

/** Area-weighted middle of a ring, so a marker sits IN its lake. */
function middle(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) return pts[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/**
 * The lakes, the woods and the bridges, each with its printed icon.
 *
 * The waypoints are where you are GOING; these are what you pick up on the way,
 * and they are worth points too. Showing the park's contents the same way the
 * paper shows them means a child can plan a route by looking at the hillside
 * rather than only at the sheet.
 */
function features() {
  const p = state.play, v3 = state.v3, g = state.marks;
  if (!p || !v3 || !v3.hf) return;
  const seen = p.me.seen || { lakes: [], woodland: [], bridges: [] };
  const put = (id, type, x, y, had) =>
    g.add(makePin({ id, type, x, y }, had ? 'got' : 'feat', v3.h(x, y)));
  for (const l of p.ix.lakes) {
    const [x, y] = middle(l.pts);
    put(l.id, 'lake', x, y, seen.lakes.includes(l.id));
  }
  for (const w of p.ix.woods) {
    const [x, y] = middle(w.pts);
    put(w.id, 'woodland', x, y, seen.woodland.includes(w.id));
  }
  for (const b of p.ix.bridges) put(b.id, 'bridge', b.x, b.y, seen.bridges.includes(b.id));
}

/** How big the pins are, and the bob that keeps them alive. */
function sizeMarks() {
  sizePins(state.marks, rig().dist);
}

/** A tap on one of those posts, or null. */
function pickMarker(ev) {
  if (!state.marks || !state.marks.children.length) return null;
  const r = $('view3d').getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, state.v3.camera);
  const hit = ray.intersectObjects(state.marks.children, true)
    .find((x) => x.object.userData.waypoint);
  return hit ? hit.object.userData.waypoint : null;
}

/**
 * Where on the MAP a screen point lands.
 *
 * The sheet is a texture on a quad now, so a tap cannot be handed to the map's
 * own canvas: the ray is cast at the quad, its `uv` says where on the paper it
 * hit, and that is turned back into a pixel of the off-screen canvas and then
 * into cell units by the map's own transform. One conversion, in one place.
 *
 * Returns null when the tap missed the paper, which is how looking past it at
 * the ground stays a different gesture from touching it.
 */
function pickMap(ev) {
  const hold = state.map3d;
  if (!hold || !hold.mesh.visible) return null;
  const r = $('view3d').getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((ev.clientX - r.left) / r.width) * 2 - 1,
    -((ev.clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, state.v3.camera);
  const hit = ray.intersectObject(hold.mesh, false)[0];
  if (!hit || !hit.uv) return null;
  const c = $('map2d');
  const w = c.getBoundingClientRect().width || 1200;
  const h = c.getBoundingClientRect().height || 1000;
  return state.ed.toMap(hit.uv.x * w, (1 - hit.uv.y) * h);
}

/** Repaint the paper's texture — the overlay has changed, so the pixels have. */
/**
 * Draw everything that follows the game, at most once a frame.
 *
 * A finger dragging a route fires a pointer event per frame or more, and each
 * one used to repaint the whole printed sheet TWICE (once from `Play2D`, once
 * from here), re-upload it as a texture, rebuild every marker in the park and
 * render. Coalescing into one animation frame does the same work once, and
 * `markers` now decides for itself whether anything it shows has changed.
 */
let repaintRaf = 0;
function repaint() {
  if (repaintRaf) return;
  repaintRaf = requestAnimationFrame(() => {
    repaintRaf = 0;
    state.ed.draw();
    if (state.map3d) state.map3d.tex.needsUpdate = true;
    markers();
    apply();
  });
}

/**
 * "Pinch to zoom", once, until he has.
 *
 * The whole game is one zoom axis — the map in his hands at one end, the park
 * as a model at the other — and there is nothing on screen that says so. The
 * plus and minus buttons are discoverable but they are not the gesture the game
 * is actually built around, and a child who never pinches never finds out the
 * park is there.
 *
 * So it pulses beside the buttons at the start and it goes the moment he zooms
 * by any means — pinch, wheel, the buttons, the keyboard. A hint that is still
 * there after you have done the thing is nagging; and it gives up on its own
 * after a while rather than pulsing at an empty room.
 */
const HINT_GIVES_UP = 20000;
function zoomHint() {
  const el = $('zoomHint');
  if (!el) return;
  // A tablet gets the pinch; a laptop gets the wheel, and the same words on a
  // machine with no touchscreen would be a lie.
  const touch = (navigator.maxTouchPoints || 0) > 1 || 'ontouchstart' in window;
  const icon = touch ? 'pinch-zoom-in' : 'mouse';
  el.querySelector('i').style.setProperty('--icon',
    `url("assets/icons/ui/${icon}.svg")`);
  el.querySelector('span').textContent = touch ? 'Pinch to zoom' : 'Scroll to zoom';
  el.classList.add('on');

  let gone = false;
  const done = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    el.classList.add('off');
    setTimeout(() => el.classList.remove('on', 'off'), 500);
  };
  state.onZoomed = done;                    // whatever moves the zoom, ends it
  const timer = setTimeout(done, HINT_GIVES_UP);
}

/**
 * Keep the frame rate honest, and stop drawing when nobody is looking.
 *
 * The tier is a guess made before a frame was drawn. This is the correction: a
 * second of real frames at under thirty, twice running, and the park quietly
 * gets smaller — the pixels first, because that is the dial nobody notices, and
 * then the scenery, which costs one rebuild. Two steps and it stops; a game
 * that keeps degrading forever ends up looking like a bug.
 *
 * And a hidden tab draws nothing. A tablet left on the arcade page with the
 * screen off was rendering a national park to nobody.
 */
function keepUp() {
  let dropped = 0;
  governor((med) => {
    if (dropped >= 2) return;
    const v3 = state.v3;
    if (!v3) return;
    dropped++;
    const next = lower(state.tier) || 'low';
    state.tier = next;
    const q = TIERS[next];
    if (dropped === 1) {
      // Pixels first: instant, free, and the one a child will not see.
      v3.setPixels(q.pixels);
      console.info(`[waypoints] ${Math.round(med)}ms frames — pixel ratio to ${q.pixels}`);
      return;
    }
    // Then the scenery, which means one rebuild and a moment's pause.
    v3.q.scenery = q.scenery; v3.q.cover = q.cover;
    v3.rebuild(v3.map, q.res);
    markers(true);
    console.info(`[waypoints] ${Math.round(med)}ms frames — scenery to ${next}`);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(state.walkAnim);
      cancelAnimationFrame(state.spin || 0);
      state.spin = 0;
    } else if (state.screen === 'walk' && state.walk) walkLoop();
    else live();
  });
}

// ------------------------------------------------------------------ screens
//
// Four of them — title, the turn, the walk, the end — and every one is the same
// park with a different thing said about it on the phone. Nothing here decides
// a rule; it reads `play.view()` and puts it into words.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** A colour for a walker's initial, so the same name is always the same colour. */
const hue = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 68%)`;
};

// ------------------------------------------------------------------- title
function showTitle() {
  state.screen = 'title';
  const home = $('homeback');
  if (home) home.classList.add('on');
  startSpin();
  state.controls.show(false);
  const p = prompt('title');
  const saved = loadState();
  const body = el('div', 'who');

  for (const name of saved.players) {
    const b = el('button');
    const pip = el('span', 'pip', name[0].toUpperCase());
    pip.style.background = hue(name);
    b.appendChild(pip);
    b.appendChild(el('span', null, name));
    const best = (table('easy').find((r) => r.name === name) || {}).best;
    if (best != null) b.appendChild(el('span', 'best', `best ${best}`));
    b.onclick = () => begin(name);
    body.appendChild(b);
  }

  const row = el('div', 'who');
  const input = el('input');
  input.placeholder = 'New walker';
  input.maxLength = 16;
  input.onkeydown = (e) => { if (e.key === 'Enter' && input.value.trim()) {
    addPlayer(input.value.trim()); begin(input.value.trim()); } };
  const wrap = el('div');
  wrap.style.display = 'flex'; wrap.style.gap = '8px';
  wrap.appendChild(input);
  row.appendChild(wrap);
  body.appendChild(row);

  const go = (tutor) => {
    const name = input.value.trim() || saved.last || saved.players[0] || 'Walker';
    if (!saved.players.includes(name)) addPlayer(name); else rememberPlayer(name);
    begin(name, tutor);
  };

  state.phone.set({
    title: p.title, line: p.line, info: p.info, body,
    buttons: [
      { label: 'Start walking', sub: saved.last ? `as ${saved.last}` : 'as a new walker',
        go: true, onClick: () => go(false) },
      // Second, and quiet: a boy who has played it before should not have to
      // step past the lessons every time he opens the game.
      { label: 'Show me how', sub: 'a lesson at each step of your first day',
        quiet: true, onClick: () => go(true) },
    ],
  });
}

function begin(name, tutor = false) {
  const home = $('homeback');
  if (home) home.classList.remove('on');
  state.who = name;
  state.tutor = !!tutor;
  state.intro = tutor ? 0 : null;
  rememberPlayer(name);
  state.screen = 'game';
  state.phase = null;
  state.play.reset({ difficulty: 'easy', players: [name] });
}

// -------------------------------------------------------------------- turn
/**
 * The game moved on.
 *
 * Map-side moments are shown ON the map, so the view goes where the moment is:
 * choosing where to set off from is a whole-park decision and belongs at macro,
 * and everything else in a turn is done on the paper.
 */
function onTurn() {
  // `Play2D` fires this from inside its own constructor, before `state.play`
  // has been assigned — so the first call arrives with nothing to read.
  if (!state.play || !state.phone) return;
  if (state.screen === 'title') return;
  // The opening pages hold the phone until he has read them.
  if (state.intro != null) { startSpin(); introPage(); return; }
  if (state.screen === 'walk') { showWalk(); return; }
  const v = state.play.view();

  if (v.phase !== state.phase) {
    state.phase = v.phase;
    state.menu = null;                  // a bag left open is not a phase
    if (v.phase === 'start') {
      // Six campsites, and the park turning so you can see all of them.
      state.pinOrder = shuffled(state.play.campsites().map((c) => c.id));
      state.pinBeat = 0;
      glideTo(B.macro, 700);
      startSpin();
    } else if (v.phase === 'goal') {
      startSpin();                      // still nothing to hurry about
    } else {
      stopSpin();
      if (v.phase === 'roll' || v.phase === 'move') glideTo(100, 700);
    }
  }
  turn(v);
  repaint();
}

/** The campsites, in a different order every game. */
function shuffled(a) {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The numbers that are true right now, along the top of the phone.
 *
 * The cost of the line he is drawing lives here rather than only in the
 * sentence underneath, because it is a number that changes while his finger is
 * moving: "this walk 7 of 9" is the whole game in four words, and it goes red
 * the moment the line costs more than the day can pay for.
 */
const statLine = (v) => {
  if (v.phase === 'goal' || v.phase === 'over') return '';
  const cost = v.cost || (v.draft ? v.draft.cost : 0);
  const over = v.draft ? !v.draft.ok : cost > v.budget;
  return `<span>day <b>${v.hike}</b>/4</span>`
    + (v.budget ? `<span>${(WEATHER[v.weather] || {}).name || ''} <b>${v.budget}</b></span>` : '')
    + (cost ? `<span class="${over ? 'over' : 'cost'}">this walk <b>${cost}</b>`
      + `${v.budget ? ` of ${v.budget}` : ''}</span>` : '')
    + `<span>water <b>${v.water}</b></span><span>score <b>${v.score.total}</b></span>`;
};

function turn(v) {
  const p = prompt(v.phase, v);
  const out = { title: p.title, line: p.line, info: p.info, stat: statLine(v),
    body: null, buttons: [] };

  if (v.phase === 'goal') {
    const body = el('div', 'goals');
    for (const g of state.doc.map.card.goals) {
      const c = GOALS[g.id] || { aim: g.label, how: '' };
      const b = el('button', 'goal');
      b.appendChild(el('b', null, c.aim));
      b.appendChild(el('span', null, c.how));
      b.onclick = () => state.play.setGoal(g.id);
      body.appendChild(b);
    }
    out.body = body;

  } else if (v.phase === 'start') {
    if (v.startPick == null) {
      out.body = reel(['1', '2', '3', '4', '5', '6'], null);
      out.buttons = [{ label: 'Surprise Me!', sub: 'stop the spinner and see where you wake up',
        go: true, onClick: () => { if (!state.rolling) state.play.roll(); } }];
    }

  } else if (v.pending) {
    out.title = 'Something in the trees';
    out.line = 'What did you see?';
    out.info = 'Walking through a wood, you saw one of three things. Pick one and it goes '
      + 'on that animal’s line on your card. Later ones on the same line are worth more, '
      + 'so it pays to keep going back to the same animal.';
    out.buttons = ['bear', 'bird', 'rabbit'].map((t) => ({
      label: t[0].toUpperCase() + t.slice(1), onClick: () => state.play.chooseWood(t) }));

  } else if (v.phase === 'roll') {
    out.body = reel(weatherAhead(), null);
    out.buttons = [{ label: "What's the weather?", sub: 'stop the spinner',
      go: true, onClick: (ev) => rollWeather(!!(ev && ev.shiftKey)) }];

  } else if (v.phase === 'move') {
    if (v.draft && v.draft.ok) {
      const d = v.draft;
      const gains = [d.lakes && `${d.lakes} lake`, d.woodland && `${d.woodland} wood`,
        d.bridges && `${d.bridges} bridge`].filter(Boolean).join(', ');
      out.line = `To the <b>${PLACE[d.to] || d.to}</b> for <b>${d.cost}</b>${gains ? ' — picking up ' + gains : ''}`;
      out.buttons.push({ label: 'Walk it', sub: 'go out there and walk this route', go: true,
        onClick: () => planned() });
    }
    // Two ways of saying "not like that", so they share a row.
    if (v.drawing) out.buttons.push({ pair: [
      v.canUndo ? { label: 'Undo', sub: 'the last bit', quiet: true,
        onClick: () => state.play.undo() } : null,
      { label: 'Start again', sub: 'rub it out', quiet: true,
        onClick: () => state.play.restart() },
    ] });
    kitButtons(out, v);
    out.buttons.push({ label: 'Rest here', sub: 'fill a water bottle instead',
      go: !!v.stuck, onClick: () => state.play.takeRest() });

  } else if (v.phase === 'journal') {
    const label = { j1: '1 for each different place', j2: '2 for each of one kind',
      j3: '3 for each kind you saw twice', j4: '1 for every 2 squares' };
    out.buttons = v.journal.filter((o) => !o.used).map((o) => ({
      label: `${o.score}${o.doubled ? ' (doubled!)' : ''} points`, sub: label[o.id],
      go: o.score > 0, onClick: () => state.play.pickJournal(o.id) }));

  } else if (v.phase === 'over') {
    const s = v.score;
    record(state.who || 'Walker', 'easy', s.total, s.lost);
    out.line = `Places <b>${s.animals}</b> + kit <b>${s.gear}</b> + journal <b>${s.journal}</b>`
      + ` + mission <b>${s.goal}</b> = <b>${s.total}</b>`;
    out.stat = '';
    out.buttons = [
      { label: 'Walk it again', go: true, onClick: () => { state.phase = null;
        state.play.reset({ difficulty: 'easy', players: [state.who || 'Walker'] }); } },
      { label: 'Someone else’s turn', quiet: true, onClick: () => showTitle() },
    ];
  }

  // A menu takes the phone over: it is a decision inside the turn, not beside it.
  // A flight that has landed takes its own menu away with it.
  if (state.menu === 'glide' && !v.gliding) state.menu = null;
  if (state.menu === 'pack') packMenu(out);
  else if (state.menu === 'glide') glideMenu(out);
  else if (state.tutor) teach(out, v);
  state.phone.set(out);
}

/**
 * The opening pages.
 *
 * Shown over the turning park before the first question is asked, because the
 * first question used to be "pick your mission" and a mission means nothing to
 * someone who does not yet know there is a park, four days, or a reason to
 * walk anywhere. Four pages, one idea each, and a dot for every page so he can
 * see how much is left — nothing is worse at that age than an explanation with
 * no visible end.
 */
function introPage() {
  const i = Math.max(0, Math.min(INTRO.length - 1, state.intro || 0));
  const page = INTRO[i];
  const body = el('div', 'intro');
  for (const line of page.lines) body.appendChild(el('p', null, line));
  const dots = el('div', 'dots');
  for (let n = 0; n < INTRO.length; n++) dots.appendChild(el('span', n === i ? 'on' : null));
  body.appendChild(dots);

  const last = i === INTRO.length - 1;
  state.phone.set({
    title: page.title,
    line: '',
    info: '',
    stat: '',
    body,
    buttons: [{ pair: [
      i > 0 ? { label: 'Back', quiet: true, onClick: () => { state.intro = i - 1; introPage(); } }
        : null,
      { label: last ? "Let's go" : 'Next', go: true,
        onClick: () => {
          if (!last) { state.intro = i + 1; introPage(); return; }
          state.intro = null;
          onTurn();
        } },
    ] }],
  });
}

/**
 * Say the one thing he needs to do next.
 *
 * The tutorial does not take the phone over and it does not disable anything —
 * every button still works, and a child who ignores the lesson and does
 * something else is simply told the right thing about wherever he ends up. All
 * it does is replace the words, because the words are the only part of this
 * game a beginner and a veteran need differently.
 */
function teach(out, v) {
  const l = lessonFor({ ...v, screen: state.screen });
  if (!l) return;
  out.title = l.title;
  out.line = l.line;
  if (l.info) out.info = l.info;
  out.buttons = (out.buttons || []).concat([{ label: 'I can do it myself', quiet: true,
    sub: 'turn the lessons off', onClick: () => { state.tutor = false; onTurn(); } }]);
}

/** What a place is called, for a child rather than for the map file. */
const PLACE = { bear: 'bear track', rabbit: 'rabbit warren', bird: 'bird hide',
  trig: 'trig point', mountain: 'mountain top', lookout: 'lookout', gear: 'kit drop',
  campsite: 'campsite' };

/**
 * What is in the pack, in the order a child looks for it.
 *
 * The camera is not here: it is used when you meet an animal, not chosen from a
 * bag, and offering it beside the kayak would teach him to look in the wrong
 * place at the wrong moment.
 */
const IN_PACK = [
  { key: 'camera', label: 'Take a photo', sub: 'of a place you have not been to' },
  { key: 'kayak', label: 'Get the kayak out', sub: 'paddle the river instead of walking round' },
  { key: 'glider', label: 'Fly the glider', sub: 'launch off the mountain and land far away' },
  { key: 'coat', label: 'Put the coat on', sub: '3 more squares, today only' },
];

const openMenu = (name) => { state.menu = name; onTurn(); };
const closeMenu = () => { state.menu = null; onTurn(); };

/**
 * The things you carry, on the turn's own screen.
 *
 * Water is out here because it is spent every other turn and burying a thing
 * that common inside a bag is just a longer way of doing it. Everything else is
 * behind one door, so the turn screen stays three buttons tall.
 */
function kitButtons(out, v) {
  const k = state.play.kit();
  // Offered while he is drawing as well. A line that costs one more than the
  // weather gave him is the whole reason a bottle exists, and hiding the bottle
  // until he had rubbed the line out was hiding the answer to the question he
  // was looking at.
  if (v.water > 0) {
    const short = v.draft && !v.draft.ok && v.draft.cost > v.budget;
    out.buttons.push({ label: 'Drink water', note: `${v.water} left`,
      sub: short ? '+1 square — enough for this line' : '+1 square today',
      go: !!short, quiet: !short, onClick: () => state.play.spendWater() });
  }
  // Something already out is something he has to be able to put away, and that
  // belongs where he can see it rather than back inside the bag.
  if (k.out.kayak) {
    out.buttons.push({ label: 'Put the kayak away', sub: 'walk round the water after all',
      quiet: true, onClick: () => state.play.stowKayak() });
  }
  if (k.count > 0) {
    out.buttons.push({ label: 'Open backpack', note: `you have ${k.count}`,
      quiet: true, onClick: () => openMenu('pack') });
  }
}

/**
 * The bag, open.
 *
 * Everything he owns is listed whether or not it works here — a greyed kayak
 * saying "you have to be beside the river" teaches the rule, and a kayak that
 * simply is not there teaches him the game lost his boat.
 */
function packMenu(out) {
  const k = state.play.kit();
  out.title = 'Your backpack';
  out.line = 'What do you want to get out?';
  out.info = 'Kit is used once and then it is gone. A kayak carries you along the river, '
    + 'a glider flies you off a mountain to somewhere you have not been, and the coat gets '
    + 'you three more squares on a day the weather was mean. A spare backpack can stand in '
    + 'for any of them.';
  out.body = null;
  out.buttons = [];

  for (const it of IN_PACK) {
    const g = k[it.key] || {};
    if (!g.have) continue;
    if (it.key === 'kayak' && k.out.kayak) {
      out.buttons.push({ label: 'Put the kayak away', sub: 'walk round the water after all',
        quiet: true, onClick: () => { state.play.stowKayak(); closeMenu(); } });
      continue;
    }
    if (it.key === 'coat' && k.out.coat) {
      out.buttons.push({ label: 'The coat is on', sub: 'already worth 3 extra squares',
        quiet: true, disabled: true });
      continue;
    }
    out.buttons.push({
      label: it.label, note: g.have > 1 ? `you have ${g.have}` : null,
      sub: g.can ? it.sub : g.why, disabled: !g.can,
      onClick: () => fromPack(it.key),
    });
  }
  out.buttons.push({ label: 'Close the bag', quiet: true, onClick: () => closeMenu() });
}

/** Take something out of the bag, and say why if it will not come out. */
function fromPack(key) {
  if (key === 'glider' || key === 'camera') {
    const photo = key === 'camera';
    const n = photo ? state.play.startPhoto() : state.play.startGlide();
    if (!n) {
      state.phone.toast({ icon: photo ? '\ud83d\udcf7' : '\ud83e\ude82',
        text: photo ? 'nothing near enough to photograph' : 'nowhere close enough to land' });
      return;
    }
    openMenu('glide');
    markers();                          // light them in the park as well as on the paper
    return;
  }
  const r = key === 'kayak' ? state.play.useKayak() : state.play.useCoat();
  if (!r || !r.ok) { state.phone.toast({ icon: '🎒', text: (r && r.why) || 'not right now' }); return; }
  state.phone.toast({ icon: key === 'kayak' ? '🛶' : '🧥',
    text: key === 'kayak' ? 'Kayak out' : 'Coat on' });
  closeMenu();
}

/**
 * The glider, in the air.
 *
 * The phone used to list the landing grounds by name — "lookout, 1.3 km away" —
 * which asked a child to match words to a map he was already holding. The map
 * lights them instead and he draws the flight on it; all the phone has to do is
 * say so, and give him a way out.
 */
function glideMenu(out) {
  const v = state.play.view();
  const photo = v.aiming === 'photo';
  out.title = photo ? 'Camera out' : 'Glider out';
  out.line = v.gliding
    ? `Drag from where you are to one of the <b>gold rings</b>.`
    : (photo ? 'Nothing near enough to photograph.' : 'Nowhere close enough to land.');
  out.info = photo
    ? 'A photograph counts as if you had been there: it goes on your card and you get the '
      + 'points. The catch is that you can never actually walk there afterwards — and it has '
      + 'to be somewhere in your square or in one directly beside it.'
    : 'A glider takes you from a mountain top to any place in the same square or one touching '
      + 'it, for free — as long as you have not been there yet. Draw the flight on the map: it '
      + 'goes in a straight line, over everything in between. Then it is gone.';
  out.body = null;
  out.buttons = [{ label: photo ? 'Put the camera away' : 'Put the glider away', quiet: true,
    onClick: () => { state.play.stopGlide(); closeMenu(); } }];
}

/**
 * The next six spaces on the weather track.
 *
 * Read without moving anything: the spinner has to show what COULD happen before
 * anything has happened, and `roll` on the board moves you as a side effect.
 */
function weatherAhead() {
  const g = state.play.g, board = state.play.board;
  const track = board.tracks[HIKES[g.ring.hike].side] || [];
  const last = track.length - 1;
  const out = [];
  for (let d = 1; d <= 6; d++) {
    const sp = track[Math.min(last, g.ring.pos + d)];
    out.push({ d, n: sp ? sp.n : 0, w: sp ? sp.w : null });
  }
  return out;
}

/** A weather face for the reel: the number you would get, over its weather. */
const FACE = { sun: '☀️', cloud: '⛅', fog: 'ᴴ', rain: '☔', snow: '❄️', dusk: 'ᴰ' };
const GLYPH = { sun: '☀', cloud: '☁', fog: '≈', rain: '☂', snow: '❅', dusk: '◖' };

/**
 * Stop the spinner.
 *
 * The number is decided here and the board is moved a beat later, so the face
 * he stopped it on is the face that then appears on the track. Without the beat
 * the reel and the board change on the same frame and it reads as a cut rather
 * than as a result.
 */
/** Movement handed out by a shift-click, for testing a long day on demand. */
const CHEAT_BUDGET = 6;

/**
 * Stop the spinner.
 *
 * Hold shift and the roll happens exactly as it always does — the die, the ring,
 * the weather — but the movement it pays out is six rather than whatever the
 * space says. The track is full of ones and twos, and testing what a long turn
 * does should not mean sitting through six short ones first.
 */
function rollWeather(cheat) {
  // One roll per press. The button sits there for the 850ms the reel takes to
  // settle, and a second press in that window rolls again — the ring walks on
  // twice and you land somewhere you never saw on the spinner.
  if (state.rolling) return;
  state.rolling = true;
  const ahead = weatherAhead();
  const d = 1 + Math.floor(Math.random() * 6);
  const got = cheat ? { ...ahead[d - 1], n: CHEAT_BUDGET } : ahead[d - 1];

  // lock the reel on the face he landed on, and say what it means
  const v = state.play.view();
  const w = WEATHER[got.w] || { name: 'Weather', line: '' };
  state.phone.set({
    title: w.name,
    line: `${w.line} You can walk <b>${got.n}</b> today.`,
    info: prompt('roll').info,
    stat: statLine(v),
    body: reel(cheat ? ahead.map((f, i) => (i === d - 1 ? got : f)) : ahead, d - 1),
    buttons: [],
  });
  weatherTo(got.w);
  setTimeout(() => {
    state.rolling = false;
    state.play.roll(d);
    if (cheat) state.play.setBudget(CHEAT_BUDGET);
  }, 850);
}

/**
 * The spinner on the phone.
 *
 * A child does not roll a die here — he stops a spinner, which is the same
 * thing and much better to watch. The faces are the six things that could
 * actually happen next, not the numbers one to six, so what he is choosing
 * between is visible before he chooses it.
 */
function reel(faces, lit) {
  const box = el('div', 'reel');
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    const d = el('div', i === lit ? 'now' : null);
    const n = el('span', 'num', typeof f === 'string' ? f : String(f.n));
    d.appendChild(n);
    if (typeof f !== 'string') {
      const g = el('span', null, GLYPH[f.w] || '');
      g.style.fontSize = '13px'; g.style.color = '#8ea6bd'; g.style.display = 'block';
      d.appendChild(g);
      d.style.flexDirection = 'column';
      d.title = (SYMBOL[f.w] || {}).label || '';
    }
    box.appendChild(d);
  }
  if (lit == null) spinReel(box);
  return box;
}

/** Flicker through the faces until something stops it. */
function spinReel(box) {
  const cells = [...box.children];
  let i = Math.floor(Math.random() * cells.length);
  const t = setInterval(() => {
    if (!box.isConnected) { clearInterval(t); return; }
    cells.forEach((c, k) => c.classList.toggle('now', k === i));
    i = (i + 1) % cells.length;
  }, 85);
}

// ------------------------------------------------------------- the weather
/**
 * Bring the sky round to what the weather just said.
 *
 * Five seconds, because the weather changing is the day turning rather than a
 * light switch, and because the cut straight from snow to sunshine made the
 * park look like it had been swapped for a different park.
 *
 * It tints the fog and the background the mapper already computes, rather than
 * replacing them: the mapper still decides what the light looks like at this
 * distance, and this leans on it.
 */
const SKY_TINT = {
  sun:   { bg: 0x9fc6ee, haze: 0xd4e6f6, k: 0.55 },
  cloud: { bg: 0x9db3c6, haze: 0xc6d3de, k: 0.45 },
  fog:   { bg: 0xa8b4bc, haze: 0xd8e0e4, k: 0.85 },
  rain:  { bg: 0x74869a, haze: 0xa9b8c6, k: 0.7 },
  snow:  { bg: 0xc3cfda, haze: 0xe4ecf3, k: 0.7 },
  dusk:  { bg: 0x4b4f75, haze: 0x6e6f96, k: 0.75 },
};

function weatherTo(kind) {
  const t = SKY_TINT[kind];
  if (!t || !state.v3) return;
  const v3 = state.v3;
  if (!v3._weatherPatch) {
    // The mapper recomputes background and fog every frame from how far out the
    // camera is. Rather than fight it, the tint is applied AFTER it — one hook,
    // set once.
    const light = v3._light.bind(v3);
    v3._light = () => {
      light();
      const w = v3._weather;
      if (!w || !w.k) return;
      v3.scene.background.lerp(w.bg, w.k);
      v3.scene.fog.color.lerp(w.haze, w.k);
    };
    v3._weatherPatch = true;
  }
  const from = v3._weather || { bg: v3.scene.background.clone(), haze: v3.scene.fog.color.clone(), k: 0 };
  const to = { bg: new THREE.Color(t.bg), haze: new THREE.Color(t.haze), k: t.k };
  const t0 = performance.now(), ms = 5000;
  cancelAnimationFrame(state.sky);
  const step = (now) => {
    const u = Math.min(1, (now - t0) / ms);
    v3._weather = {
      bg: from.bg.clone().lerp(to.bg, u),
      haze: from.haze.clone().lerp(to.haze, u),
      k: lerp(from.k, to.k, u),
    };
    apply();
    if (u < 1) state.sky = requestAnimationFrame(step);
  };
  state.sky = requestAnimationFrame(step);
}

// --------------------------------------------------------------- the walking
/** The route is settled. Now he has to go and walk it. */
function planned() {
  const pl = state.play;
  if (!pl.draft || !pl.draft.to) return;
  const line = pl.draft.line || pl.draft.pts;
  const plan = previewMove(pl.g, pl.ix, pl.me, line, pl.draft.to);
  if (!plan.ok) return;

  state.screen = 'walk';
  stopSpin();
  state.phone.clearToasts();
  // The phone goes away for the walk. He is out in the park now, and the thing
  // he is supposed to be looking at is the park. The chip in the corner brings
  // it back if he wants to check what he is doing.
  state.phone.open(false);
  $('hudArrow').classList.add('on');
  markers();                            // clear the map-side pins off the park
  glideTo(651, 700);
  state.controls.show(true);
  state.controls.reset();

  state.woodPicks = [];
  state.walk = new Walk({
    v3: state.v3, ix: pl.ix, line, to: pl.ix.byId.get(pl.draft.to), plan,
    onNote: (b) => state.phone.toast(note(b.kind, b.what)),
    onStop: (b, go) => stopFor(b, go),
    onArrive: () => arrived(),
  });
  // Stand the camera behind him, facing the way he is about to walk. Whatever
  // yaw the park was last looked at from is not it — that is how you end up
  // watching a walker from the side while the path he is meant to follow
  // disappears off the edge of the screen.
  state.yaw = state.v3.hiker.yaw;
  state.v3.character && state.v3.character.play('idle');
  showWalk();
  walkLoop();
}

/**
 * The compass at the top of the screen.
 *
 * Relative to where the CAMERA is looking, not to north: the question it answers
 * is "which way do I push", and that only has an answer in the frame the player
 * is actually looking through.
 */
function compass() {
  const w = state.walk;
  if (!w) return;
  const b = w.bearing();
  const rel = b.to - state.yaw;
  const n = $('hudArrow').querySelector('.needle');
  n.setAttribute('transform', `rotate(${(rel * 180) / Math.PI})`);
  $('hudArrow').querySelector('.far').textContent =
    b.metres > 950 ? `${(b.metres / 1000).toFixed(1)} km` : `${Math.round(b.metres / 10) * 10} m`;
}

function showWalk() {
  const v = state.play.view();
  const p = prompt('walk', { autopilot: state.controls.auto });
  const pct = state.walk ? Math.round(state.walk.progress * 100) : 0;
  // What the route is costing him is still a live number out here: he is walking
  // it now, and it is taken off the day when he arrives.
  const cost = state.walk && state.walk.plan ? state.walk.plan.cost : 0;
  const buttons = [];
  if (v.water > 0) {
    buttons.push({ label: 'Drink water', note: `${v.water} left`,
      sub: '+1 square today', quiet: true,
      onClick: () => { state.play.spendWater(); state.phone.toast(note('drink')); showWalk(); } });
  }
  const out = {
    title: p.title,
    line: `${p.line} <b>${pct}%</b>`,
    info: p.info,
    stat: statLine({ ...v, cost }),
    buttons,
  };
  if (state.tutor) teach(out, v);
  state.phone.set(out);
}

function walkLoop() {
  cancelAnimationFrame(state.walkAnim);
  let last = performance.now();
  let tick = 0;
  const step = (now) => {
    if (!state.walk) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const c = state.controls;
    // Walking again: the park is the thing, so the phone goes away. Stopped for
    // something, it stays — it is the panel that says what he has stopped for.
    const held = state.walk.paused || !!state.spot;
    if (!held && state.phone.isOpen && state.screen === 'walk') state.phone.open(false);
    state.walk.update(dt, { x: c.moveX, y: c.moveY, auto: c.auto, fast: c.fast }, state.yaw);
    // The right stick — or the arrow keys — look around, and let go: the camera
    // drifts back behind him rather than staying where it was left, so a child
    // who spun it to look at a hill gets his bearings back without doing
    // anything.
    const look = c.lookX;
    if (Math.abs(look) > 0.08) state.yaw -= look * dt * 1.6;
    else if (c.auto) {
      // Only under autopilot. He is following the line on his own there, so the
      // camera drifting back behind him is help. On foot he faces wherever the
      // camera faces, so the same drift would spring the view back the instant
      // you let go of the look stick — free look would be impossible.
      let d = state.v3.hiker.yaw - state.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      state.yaw += d * Math.min(1, dt * 2.2);
    }
    state.v3.character && state.v3.character.update(dt);
    state.v3._placeHiker();
    apply();
    compass();
    // Not every frame — and never over a stop: the progress line used to paint
    // itself back over the panel that had just asked him to photograph a bear.
    if (++tick % 12 === 0 && state.phone.isOpen && !held) showWalk();
    if (state.walk) state.walkAnim = requestAnimationFrame(step);
  };
  state.walkAnim = requestAnimationFrame(step);
}

/** The three that are animals, and what to call them. */
const CREATURE = { bear: 'bear', bird: 'bird', rabbit: 'rabbit' };
const CALL = { bear: 'A bear!', bird: 'A bird!', rabbit: 'A rabbit!' };
const SEEN = {
  bear: 'It has not seen you. Keep still.',
  bird: 'It is watching you from the branch.',
  rabbit: 'It froze the moment you did.',
};

/**
 * Lean the camera onto a spot, hold, and lean back out.
 *
 * Every stop is the same shape — something is there, the camera notices it, the
 * phone says what it is, and then the walk carries on — so the leaning is
 * written once and the three stops just fill in what happens in the middle.
 */
function leanOn(x, y, body, done) {
  // Sized like a person rather than like an animal: kneeling at a lake is a
  // shot of HIM doing something, so the camera stands back far enough to see
  // him do it.
  state.spot = { x, y, k: 0, size: 2.2 };
  const ease2 = (t) => t * t * (3 - 2 * t);
  const run = (ms, from, to, then) => {
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      state.spot.k = from + (to - from) * ease2(u);
      apply();
      if (u < 1) state.spotAnim = requestAnimationFrame(step);
      else if (then) then();
    };
    cancelAnimationFrame(state.spotAnim);
    state.spotAnim = requestAnimationFrame(step);
  };

  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    run(420, state.spot.k, 0, () => { state.spot = null; done(); });
  };
  run(600, 0, 1);
  body(finish);
}

/**
 * The lake. He kneels and fills a bottle.
 *
 * The water was already being counted — it was arriving as a line of text while
 * he marched past the thing he was supposedly drinking from.
 */
function fillBottle(beat, go) {
  const v3 = state.v3;
  const [x, y] = beat.at || [v3.hiker.x, v3.hiker.y];
  // face the water before kneeling at it
  v3.hiker.yaw = Math.atan2(x - v3.hiker.x, y - v3.hiker.y);
  v3._placeHiker();
  leanOn(x, y, (finish) => {
    v3.character && v3.character.play('interact', 0.9);
    state.phone.open(true);
    state.phone.set({
      title: 'Water',
      line: 'Kneel down and fill a bottle.',
      info: 'Every lake you reach fills one bottle, once. A bottle is worth one '
        + 'more step on a day the weather was mean — and you can drink it on the '
        + 'very walk you found it on.',
      stat: statLine(state.play.view()),
      // No timer. A moment that finishes itself is a moment he was not part of:
      // it waits for him, however long he wants to look at the water.
      buttons: [{ label: 'Fill it', go: true,
        onClick: () => { state.phone.toast(note('lake')); finish(); } }],
    });
  }, () => {
    state.v3.character && state.v3.character.play('idle');
    go();
  });
}

/** How tall each thing stands, in metres — what the camera frames on. */
// The crate is 0.6 m high, but the SHOT is him kneeling at it — so it is framed
// like a person, which stands the camera back far enough to see him do it.
const TALL = { bear: 1.45, rabbit: 0.55, bird: 0.50, crate: 2.0 };

/**
 * Put a creature on the ground in front of him, and make the camera notice it.
 *
 * It grows in over half a second rather than being there suddenly, because a
 * thing that appears between two frames reads as a glitch and a thing that
 * grows reads as a thing that stepped out of the trees. `state.spot` carries
 * its height as well as its place: the camera frames on the ANIMAL, and a
 * rabbit and a bear shot from the same three metres are one good photograph
 * and one empty field.
 */
function creature(kind, x, y, face = true, turn = 0) {
  const v3 = state.v3;
  const m = v3.map.world.metresPerCell || 2500;
  const prop = makeProp(kind, m);
  if (!prop) return null;
  const base = 1 / m;
  prop.position.set(x, v3.h(x, y), y);
  // An animal faces him. A box left on the ground faces whichever way it was
  // dropped, and a box turned squarely to the camera looks placed.
  prop.rotation.y = face ? Math.atan2(v3.hiker.x - x, v3.hiker.y - y)
    : Math.atan2(v3.hiker.x - x, v3.hiker.y - y) + 0.5;
  prop.scale.setScalar(base * 0.01);
  state.props.add(prop);
  state.spot = { x, y, k: 0, size: TALL[kind] || 1, turn, prop };

  const t0 = performance.now();
  const step = (now) => {
    const u = Math.min(1, (now - t0) / 620);
    state.spot.k = ease(u);
    // a little overshoot on the way in, so it lands rather than inflates
    const pop = u < 1 ? 1 + Math.sin(u * Math.PI) * 0.18 : 1;
    prop.scale.setScalar(base * ease(Math.min(1, u * 1.4)) * pop);
    prop.position.y = v3.h(x, y) + Math.sin(u * Math.PI) * (0.35 / m);
    apply();
    if (u < 1) state.spotAnim = requestAnimationFrame(step);
  };
  cancelAnimationFrame(state.spotAnim);
  state.spotAnim = requestAnimationFrame(step);
  return prop;
}

/** Let it go again: the camera comes back off it and the model is thrown away. */
function unspot(prop, then) {
  const t0 = performance.now();
  const out = (now) => {
    const u = Math.min(1, (now - t0) / 450);
    if (state.spot) state.spot.k = 1 - ease(u);
    apply();
    if (u < 1) { state.spotAnim = requestAnimationFrame(out); return; }
    if (prop) {
      state.props.remove(prop);
      prop.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    }
    state.spot = null;
    then();
  };
  cancelAnimationFrame(state.spotAnim);
  state.spotAnim = requestAnimationFrame(out);
}

/**
 * The moment itself: it is there, and he photographs it.
 *
 * Shared by the wood and by walking up on an animal waypoint, because they are
 * the same moment arrived at two ways, and the photograph is the part he came
 * for. It waits — eight seconds is long enough to look at it, and the button is
 * there the whole time for a child who would rather get on.
 */
function photoMoment(kind, x, y, then) {
  const v3 = state.v3;
  const prop = creature(kind, x, y);
  v3.character && v3.character.play('idle');
  // The gold path is a metre wide and, this close in, the loudest thing in a
  // picture that is meant to be of an animal. It waits its turn.
  const path = state.walk && state.walk.path;
  if (path) path.visible = false;

  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    if (path) path.visible = true;
    unspot(prop, then);
  };

  state.phone.open(true);
  state.phone.set({
    title: CALL[kind] || 'Something there',
    line: SEEN[kind] || '',
    info: 'Keep still and have a look. It goes on that animal\u2019s line on your card '
      + 'either way — this is just the bit where you get to see it.',
    stat: statLine(state.play.view()),
    buttons: [{ label: 'Watch it', sub: 'and carry on', go: true, onClick: () => {
      v3.character && v3.character.play('interact', 1);
      state.phone.toast({ icon: '\ud83d\udc41', text: `Saw the ${kind}` });
      setTimeout(finish, 800);
    } }],
  });
  // It waits. He is looking at a bear.
}

/**
 * The wood. Something is in the trees, and he chooses what to photograph.
 *
 * The rules say a wood marks one of Bear, Bird or Rabbit and the player picks
 * which — so the pick comes FIRST and then the thing he picked walks out in
 * front of him. Asking afterwards what he had seen was a guessing game about a
 * decision he had already made.
 */
function inTrees(beat, go) {
  const v3 = state.v3;
  const m = v3.map.world.metresPerCell || 2500;
  const kinds = ['bear', 'bird', 'rabbit'];
  // A few paces up the path: the route was drawn between the trees, so standing
  // it on the line is what keeps the wood out of the shot.
  const yaw = v3.hiker.yaw;
  const x = v3.hiker.x + Math.sin(yaw) * (4 / m);
  const y = v3.hiker.y + Math.cos(yaw) * (4 / m);

  v3.character && v3.character.play('idle');
  const pick = (k) => {
    state.woodPicks.push(k);
    photoMoment(k, x, y, go);
  };

  state.phone.open(true);
  state.phone.set({
    title: 'Something in the trees',
    line: 'Something moved. What do you want to look for?',
    info: 'Walking through a wood you spot one of three things — you choose which. It goes '
      + 'on that animal\u2019s line on your card. Later ones on the same line are worth more, '
      + 'so it pays to keep going back to the same animal.',
    stat: statLine(state.play.view()),
    buttons: kinds.map((k) => ({
      label: k[0].toUpperCase() + k.slice(1),
      onClick: () => pick(k),
    })),
  });
}

/**
 * What the next gear space on the card is worth.
 *
 * Read rather than assumed: the sheet is what hands out kit, and a track that
 * has been filled hands out nothing. Asking it here means the box can say what
 * is in it before the move is committed, without either of them inventing an
 * answer the other will disagree with.
 */
function nextGear(track) {
  const t = state.play.ix.map.card.tracks.find((x) => x.id === track);
  if (!t) return null;
  const marks = state.play.me.card.marks;
  const sp = t.spaces.find((_, i) => !marks[`${track}:${i}`]);
  return sp ? sp.act || null : null;
}

/** What each piece of kit is, in one line a child can act on. */
const KIT_IS = {
  backpack: 'A spare backpack. It can be whatever you need later — a kayak, a glider or a coat.',
  camera: 'A camera. Point it at something one square away and it goes on your card without walking there.',
  kayak: 'A kayak. Carry it to the river and paddle instead of walking round.',
  glider: 'A glider. Launch it off a mountain top and land somewhere new.',
  coat: 'A coat. Put it on when the weather is mean and walk three more squares.',
};

/**
 * The box of kit.
 *
 * Arriving at a gear point used to hand him a backpack in a line of text while
 * the turn moved on underneath him — the one waypoint on the sheet that is
 * literally a thing lying on the ground, and it was the one you never saw. Now
 * the box is there, he kneels at it, and he is told what he has found before
 * the card writes it down.
 */
function findBox(wp, then) {
  const v3 = state.v3;
  const m = v3.map.world.metresPerCell || 2500;
  const kind = nextGear('gear');
  const yaw = v3.hiker.yaw;
  const x = wp.x + Math.sin(yaw) * (2.6 / m), y = wp.y + Math.cos(yaw) * (2.6 / m);
  // Swung round a little: from directly behind him all you see is a rucksack,
  // and the point of the shot is a boy kneeling at a box.
  const prop = creature('crate', x, y, false, 0.95);
  if (!prop) { then(); return; }

  const path = state.walk && state.walk.path;
  if (path) path.visible = false;
  // He kneels at it rather than standing over it: the box is on the ground and
  // the thing he is doing is rummaging in it.
  v3.character && v3.character.play('interact', 0.85);

  let over = false;
  const finish = () => {
    if (over) return;
    over = true;
    if (path) path.visible = true;
    v3.character && v3.character.play('idle');
    unspot(prop, then);
  };

  state.phone.open(true);
  state.phone.set({
    title: 'A box of kit!',
    line: kind ? KIT_IS[kind] || 'Something useful.' : 'Empty — someone got here first.',
    info: 'Gear points are boxes left out in the park. Reaching one marks your gear line '
      + 'and puts what is in it in your backpack. Open the backpack on any turn to use it.',
    stat: statLine(state.play.view()),
    // The note comes when he takes it, not when he finds it: a thing is in your
    // pack because you put it there.
    buttons: [{ label: kind ? 'Put it in your pack' : 'Close the lid', go: true,
      sub: 'and carry on', onClick: () => {
        if (kind) state.phone.toast({ icon: '\ud83c\udf92', text: `${kind} in your pack` });
        finish();
      } }],
  });
}

/** A stop on the way: the walk waits until it is done. */
function stopFor(beat, go) {
  if (beat.kind === 'lake') fillBottle(beat, go);
  else if (beat.kind === 'wood') inTrees(beat, go);
  else go();
}

/**
 * You have walked up on something.
 *
 * The animals are printed ON the map — a bear waypoint IS a bear — so arriving
 * at one and being moved silently to the next turn was the game skipping its own
 * best moment. He stops, it is there, the camera leans in on it, and he takes a
 * photograph.
 *
 * `then` runs once, whichever way it ends.
 */
function meet(type, wp, then) {
  const v3 = state.v3;
  const kind = CREATURE[type];
  const m = v3.map.world.metresPerCell || 2500;
  if (!kind) { then(); return; }
  const yaw = v3.hiker.yaw;
  photoMoment(kind, wp.x + Math.sin(yaw) * (4 / m), wp.y + Math.cos(yaw) * (4 / m), then);
}

/** What a new piece of kit is called when it lands in the pack. */
const GOT = {
  camera: { icon: '\ud83d\udcf7', text: 'A camera! Open your backpack to use it' },
  kayak: { icon: '\ud83d\udef6', text: 'A kayak for your pack' },
  glider: { icon: '\ud83e\ude82', text: 'A glider for your pack' },
  coat: { icon: '\ud83e\udde5', text: 'A coat for your pack' },
  backpack: { icon: '\ud83c\udf92', text: 'A spare backpack' },
};

/** He got there. Now the turn can be taken. */
function arrived() {
  const pl = state.play;
  cancelAnimationFrame(state.walkAnim);
  if (state.walk) { state.walk.stop(); state.walk = null; }
  state.controls.show(false);
  $('hudArrow').classList.remove('on');
  state.phone.open(true);

  const to = pl.draft && pl.ix.byId.get(pl.draft.to);
  const take = () => {
    state.screen = 'game';
    state.phase = null;
    const got = pl.go();
    // Say what the place gave him. The camera especially: the rules let you use
    // it the moment it is circled, and a child who is not told he has one will
    // never go looking in the bag for it.
    for (const kind of (got && got.earned) || []) {
      if (GOT[kind]) state.phone.toast(GOT[kind]);
    }
    // He was asked what he saw while he was standing in the wood. Apply those
    // answers now, which is where the rules have always taken them.
    while (pl.pending && state.woodPicks.length) pl.chooseWood(state.woodPicks.shift());
    onTurn();
  };
  // An animal is worth stopping for, and so is a box on the ground. Everything
  // else carries straight on.
  if (to && CREATURE[to.type]) meet(to.type, to, take);
  else if (to && to.type === 'gear') findBox(to, take);
  else take();
}

/**
 * Re-plant the ground cover, once the camera has stopped moving.
 *
 * Re-planting means rebuilding the whole park — a third of a second's work —
 * and the patch it is planted around moves on EVERY FRAME of a zoom glide. So
 * the old code rebuilt the park, from scratch, all the way out to macro: five
 * or six full rebuilds for one press of the minus button, which is exactly
 * where the view felt like treacle. Now the camera moves freely and the cover
 * is re-planted once, a beat after it settles.
 */
let coverTimer = 0;
function coverSoon() {
  clearTimeout(coverTimer);
  coverTimer = setTimeout(() => {
    const v3 = state.v3;
    if (!v3 || !v3.kit || !v3.hf) return;
    if (!v3._followCover(v3.orbitBoost() !== v3._builtBoost)) v3.render();
  }, 180);
}

function apply() {
  const v3 = state.v3;
  if (!v3 || !v3.hf) return;
  // The preview decides how much to exaggerate its scenery, and where to plant
  // the dense patch of it, from `orbit` — so the rig keeps those in step even
  // though it is not using the orbit camera itself.
  const r = rig();
  v3.orbit.dist = Math.max(1e-5, r.dist || 0.6 / r.m);
  v3.orbit.pitch = r.pitch; v3.orbit.yaw = r.yaw;
  v3.orbit.target.copy(r.focus);
  // The park is drawn behind the paper — hills, woods, the river, the grass.
  // The one exception is the half-second his finger is actually moving: a
  // route being dragged repaints the sheet, re-costs the line and re-renders
  // the park on every frame, and five million triangles of grass tufts is the
  // difference between that being smooth and being a slideshow. It is back the
  // instant he lets go, and at the zoom a route is drawn at the paper fills the
  // screen anyway.
  v3.showCover(!(state.play && state.play.dragging));
  coverSoon();
  v3.render();
}

function setZoom(v) {
  const was = state.zoom;
  const next = Math.max(0, Math.min(B.max, v));
  // Scale the stored offset by how much less of it this zoom allows, rather than
  // damping it only for display: a pan that springs back the moment you zoom in
  // again is a pan you cannot trust.
  const before = panDamp(was), after = panDamp(next);
  if (after < before) {
    const k = before > 1e-6 ? after / before : 0;
    state.pan.x *= k; state.pan.y *= k;
  }
  state.zoom = next;
  state.aim = next;              // a hand on the wheel or the pinch IS the target
  // He has zoomed. Whatever did it — pinch, wheel, buttons, keys — the hint has
  // done its job and can stop pulsing at him.
  if (state.onZoomed && Math.abs(next - was) > 0.5) { const f = state.onZoomed;
    state.onZoomed = null; f(); }
  apply();
  if (pinsLive()) live();        // zoomed out far enough to see them move
}

/**
 * Glide to a zoom rather than jumping to it.
 *
 * The buttons step between the standard views, and a step that teleports reads
 * as the world flickering rather than as a move. Short enough not to be waited
 * on, long enough to see which way you went.
 */
function glideTo(target, ms = 380) {
  // A token, not just `cancelAnimationFrame`: cancelling does not stop a
  // callback that has ALREADY been handed to the browser, so the tail of the
  // old glide would land on top of the new one and leave the zoom a few units
  // shy of the stop it was aimed at.
  const id = ++state.tweenId;
  cancelAnimationFrame(state.tween);
  const from = state.zoom, t0 = performance.now();
  // Claimed NOW, not on the first frame: two taps in the same tick have to step
  // two stops, and the first frame has not run yet when the second tap lands.
  const aim = (state.aim = target);
  const step = () => {
    if (id !== state.tweenId) return;
    const k = Math.min(1, (performance.now() - t0) / ms);
    setZoom(k >= 1 ? target : from + (target - from) * ease(k));
    // `setZoom` treats every move as its own target; while a glide is running the
    // target is where it is GOING, so a second tap on the button steps on from
    // there rather than recomputing the same step from where the glide has got to.
    state.aim = aim;
    if (k < 1) state.tween = requestAnimationFrame(step);
  };
  state.tween = requestAnimationFrame(step);
}

function stepTo(dir) {
  const next = nextStop(state.aim, dir);
  if (next != null) glideTo(next);
}

function bind() {
  // Zooming is you taking charge of the view, so the park stops turning under
  // you. It is only ever turning at moments where nothing is being decided.
  $('in').onclick = () => { stopSpin(); stepTo(-1); };
  $('out').onclick = () => { stopSpin(); stepTo(1); };

  // I and K step the view in and out, wherever you are. Not with the walking
  // keys: the zoom is not part of walking, it is how far away you are standing
  // from the whole game, and it works on the title screen too.
  addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    const c = e.code.toLowerCase();
    if (c !== 'keyi' && c !== 'keyk') return;
    stopSpin();
    stepTo(c === 'keyi' ? -1 : 1);
    e.preventDefault();
  });

  const stage = $('stage');
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopSpin();
    state.tweenId++; cancelAnimationFrame(state.tween);   // a hand on the wheel beats a glide
    setZoom(state.zoom + e.deltaY * 0.5);
  }, { passive: false });

  // one finger turns the head, two pinch the zoom
  const live = new Map();
  let base = null, last = null, down = null, drawing = false;
  const spread = () => {
    const [a, b] = [...live.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  stage.addEventListener('pointerdown', (e) => {
    live.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = { x: e.clientX, y: e.clientY };
    down = { x: e.clientX, y: e.clientY, moved: false };
    if (live.size === 2) { stopSpin(); state.tweenId++; base = { d: spread(), z: state.zoom }; }
    // A drag that starts ON the paper is the game's: a route being drawn.
    if (live.size === 1 && state.play && state.zoom < B.read) {
      const at = pickMap(e);
      if (at && state.play.down(at, e) !== false) { drawing = true; repaint(); }
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!live.has(e.pointerId)) return;
    live.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down && (Math.abs(e.clientX - down.x) > 3 || Math.abs(e.clientY - down.y) > 3)) down.moved = true;
    if (drawing) {
      const at = pickMap(e);
      if (at) { state.play.move(at, e); repaint(); }
      return;
    }
    if (live.size === 2 && base && base.d > 4) {
      setZoom(base.z - Math.log2(spread() / base.d) * 300);
    } else if (live.size === 1 && last) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      if (state.zoom < B.read && state.map3d) {
        // Screen pixels to world units ON THE PAPER: the plane is `d` away and
        // the frustum is that many units tall there, so a drag moves the sheet
        // by exactly as much as the finger moved across it.
        const hold = state.map3d;
        const vh = stage.clientHeight || 1;
        const perPx = (2 * hold.lastD * Math.tan((state.v3.camera.fov * Math.PI) / 360)) / vh;
        state.pan.x += dx * perPx;
        state.pan.y -= dy * perPx;
        const lim = panDamp(state.zoom);
        state.pan.x = Math.max(-hold.w * lim, Math.min(hold.w * lim, state.pan.x));
        state.pan.y = Math.max(-hold.h * lim, Math.min(hold.h * lim, state.pan.y));
      } else {
        state.yaw -= dx * 0.005;
      }
      apply();
    }
  });
  const drop = (e) => {
    if (drawing) { state.play.up(e); drawing = false; repaint(); }
    else if (down && !down.moved && state.play) {
      // A tap, not a drag. At macro that is a campsite being chosen off the
      // park; on the paper it is the game's to interpret.
      const camp = pickMarker(e);
      if (camp && state.play.startPick && state.play.startPick.wp.id === camp.id) {
        state.play.confirmStart();
      } else if (state.zoom < B.read) {
        const at = pickMap(e);
        if (at) { state.play.down(at, e); state.play.up(e); repaint(); }
      }
    }
    down = null;
    live.delete(e.pointerId); if (live.size < 2) base = null; if (!live.size) last = null;
  };
  stage.addEventListener('pointerup', drop);
  stage.addEventListener('pointercancel', drop);

  addEventListener('resize', () => {
    state.ed.fit();
    if (state.map3d) state.map3d.tex.needsUpdate = true;
    state.v3.resize(); apply();
  });
}

boot();

// A handle for the test harness, and nowhere else. `#sandbox` is already the
// mode that promises to leave his saved games alone, so it is the one place the
// page may hand its insides out to be poked at.
if (typeof location !== 'undefined' && location.hash.includes('sandbox')) {
  window.wp = { state, get play() { return state.play; },
    // the moments, so a harness can stand in front of one without walking to it
    stops: { inTrees, fillBottle, meet, photoMoment, findBox } };
}

export { state, STOPS, nextStop };
