// Stone Skip — bootstrap, input routing and the game loop.

import * as THREE from 'three';
import { clamp, lerp, sat } from './util.js';
import { SPOTS, spotById, LAKE, BASE_SPOT_IDS } from './world/layout.js';
import { heightAt } from './world/heightfield.js';
import { buildTerrain, buildDepthTexture } from './world/terrain.js';
import { buildWater, HAZE_NEAR, HAZE_FAR } from './world/water.js';
import { buildSky } from './world/sky.js';
import { buildProps } from './world/props.js';
import { createFish } from './world/fish.js';
import { createRockField } from './rocks.js';
import { specialById } from './stones.js';
import { launchStone, stepStone, SWEET } from './skip-physics.js';
import { createThrowController, flickRangeFor } from './throw-control.js';
import { createCameraRig, AIM_WARN_DEG } from './camera-rig.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createHand } from './hand.js';
import { createTargetTracker, TARGETS, targetMarker } from './targets.js';
import { THEMES, applyTheme } from './themes.js';
import {
  ACHIEVEMENTS, ACH_GROUPS, ACH_TOTAL, UNLOCKS, SHOP_GROUPS, ARM,
  throwPoints, canBuy, buy, applyThrow, settleAchievements, settleBadges, achCount, achProgress, unlockById,
  ownedSpecials, readySpecials, claimSpecial,
} from './progression.js';
import { PLAYERS, loadPlayer, savePlayer, lastPlayer, playerSummary } from './storage.js';
import { ensureAudio, startAmbience, updateAudio, sfx } from './audio.js';

const GOLD = '#ffd32a';
const GLOW = '#a29bfe';
const DANGER = '#e74c3c';

// The scene is built in Bright Day; buying a theme re-tints it live (themes.js).
const T0 = THEMES.day;
const PALETTE = {
  skyHorizon: T0.skyHorizon,
  skyZenith: T0.skyZenith,
  sunTint: T0.sunTint,
  glow: T0.glow,
  shallow: T0.shallow,
  deep: T0.deep,
  skyReflect: T0.skyReflect,
  haze: T0.haze,
  sunDir: new THREE.Vector3(T0.sun[0], T0.sun[1], T0.sun[2]),
};

/**
 * How often a hungry fish goes for the stone, once you own "See The Fish".
 * Rare on purpose — it is a surprise, not a tax. Overridable through the debug
 * hook so the leap can be exercised by the verification sweep.
 */
let fishChance = 0.12;
/** Walk this far or more and we fade instead of marching over open water. */
const TELEPORT_DIST = 55;

// --- DOM --------------------------------------------------------------------
const view = document.getElementById('view');
const hudCanvas = document.getElementById('hudCanvas');
const ov = document.getElementById('ov');
const panels = {
  loading: document.getElementById('loading'),
  player: document.getElementById('playerPanel'),
  tutorial: document.getElementById('tutorialPanel'),
  spots: document.getElementById('spotsPanel'),
  shop: document.getElementById('shopPanel'),
  ach: document.getElementById('achPanel'),
  bag: document.getElementById('bagPanel'),
};

function showPanel(key) {
  // Every panel can end up moving the camera (the spots list walks you somewhere,
  // the shop unlocks a spot), so the map view is never left running underneath one.
  if (key !== 'loading' && key !== 'player') closeMap(true);
  ov.classList.remove('hidden');
  for (const k in panels) {
    if (k === key) panels[k].classList.remove('hidden');
    else panels[k].classList.add('hidden');
  }
  // the side rail means nothing before a player is chosen
  const side = document.getElementById('sideBtns');
  if (side) side.classList.toggle('hidden', key === 'player' || key === 'loading');
}
function hideOverlay() {
  ov.classList.add('hidden');
  for (const k in panels) panels[k].classList.add('hidden');
  // Closing an overlay always means we are in the lake, so the rail comes back.
  // (A returning player goes player-select -> straight to play without ever
  // calling showPanel again, and used to lose all seven buttons for the session.)
  const side = document.getElementById('sideBtns');
  if (side) side.classList.remove('hidden');
}
function overlayOpen() { return !ov.classList.contains('hidden'); }

// --- renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(PALETTE.skyHorizon);
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PALETTE.haze, T0.fogNear, T0.fogFar);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1900);
camera.position.set(0, 3, -40);
scene.add(camera);

// Both lights are kept in named variables: a theme re-tunes them in place.
const hemi = new THREE.HemisphereLight(T0.hemiSky, T0.hemiGround, T0.hemi);
scene.add(hemi);
const sun = new THREE.DirectionalLight(T0.dirColor, T0.dir);
sun.position.copy(PALETTE.sunDir).multiplyScalar(160);
scene.add(sun);

// --- world (filled in by buildWorld) ---------------------------------------
let water = null, sky = null, props = null, rocks = null, fx = null, fish = null;
let rig = null, hud = null, hand = null, throwCtl = null;
const tracker = createTargetTracker();

let worldTime = 0;
let stone = null, stoneMesh = null;
// Where the last skip splashed. Only the debug hook reads it, but it has to be
// recorded at the event because the spray outlives the frame it was born in.
let lastSplash = null;
const events = [];
let flightT = 0;
let resultHold = 0;
let stepTimer = 0;
let specialTimer = 0;
let liveSkips = 0;
let menuOrbit = 1.9;
const trailPrev = new THREE.Vector3();

// --- player state -----------------------------------------------------------
let playerId = null;
let save = null;

function buildWorld() {
  const terrain = buildTerrain(232);
  scene.add(terrain);

  const depthTex = buildDepthTexture(256);
  water = buildWater(depthTex, PALETTE, 128);
  scene.add(water.mesh);

  sky = buildSky(PALETTE);
  scene.add(sky.group);

  props = buildProps(scene, camera);
  rocks = createRockField(scene);
  fx = createFx(scene);
  fish = createFish(scene);

  rig = createCameraRig(camera);
  throwCtl = createThrowController({
    onWindUp() {
      sfx.windUpStart();
      hud.setPrompt('');                 // the gauge is the prompt now
      hud.setBreakdown(null);            // last throw's readout steps aside
    },
    onPower(p) { sfx.powerLock(p); },
    onRelease() { /* the flick trail is the feedback */ },
    onLaunch: doLaunch,
    getEdge() { return rocks.selected ? rocks.selected.props.edge : 0.6; },
  });
  hud = createHud(hudCanvas, camera, throwCtl);
  hand = createHand(camera);
  // first sizing of the flick, before any resize event arrives
  throwCtl.setFlickRange(flickRangeFor(window.innerHeight));

  // tiny read-only hook so the throw rhythm and the economy can be checked
  // automatically (see the verification sweep in docs/.plans)
  window.__stoneSkip = {
    get state() { return throwCtl.state; },
    get power() { return throwCtl.S.power; },
    get powerLocked() { return throwCtl.S.powerLocked; },
    get angleT() { return throwCtl.S.angleT; },
    get pitch() { return throwCtl.S.pitch; },
    get toSweet() { return throwCtl.S.toSweet; },
    get grade() { return throwCtl.S.grade; },
    get rock() { return rocks.selected ? rocks.selected.kind.id : null; },
    get spot() { return currentSpot ? currentSpot.id : null; },
    get stone() {
      return stone ? {
        skips: stone.skips, dist: stone.maxDistance, alive: stone.alive,
        // where it is right now, so a test can look at the pixels around it
        x: stone.x, y: stone.y, z: stone.z,
      } : null;
    },
    /** Where the last skip threw spray, and when (verification only). */
    get lastSplash() { return lastSplash ? Object.assign({}, lastSplash) : null; },
    get done() { return tracker.countDone(); },
    // phase 2
    get points() { return save ? save.points : 0; },
    get owned() { return save ? Object.keys(save.owned).filter(k => save.owned[k]) : []; },
    get ach() { return save ? { done: achCount(save), total: ACH_TOTAL } : null; },
    get theme() { return save ? save.theme : ''; },
    get arm() { return save ? (save.armLevel || 0) : 0; },
    get fish() { return !!(fish && fish.visible); },
    // phase 3: which special stone (if any) is lying on this beach right now,
    // and how long until the next one washes up
    get special() { return rocks.special ? rocks.special.special.id : null; },
    get specialCds() {
      return save ? ownedSpecials(save).map(o => `${o.id}:${Math.ceil(o.left / 1000)}`) : [];
    },
    get spots() { return SPOTS.filter(s => s.unlocked).map(s => s.id); },
    get allSpots() { return SPOTS.map(s => ({ id: s.id, name: s.name, unlock: s.unlock || '' })); },
    /** Teleport straight to a spot (verification only — no fade, no walk). */
    go(id) { const s = spotById(id); if (!s) return false; s.unlocked = true; currentSpot = null; goToSpot(id, true); return true; },
    /** The bottom-right throw readout: its rows and how long it has been up. */
    get breakdown() {
      const b = hud.state.breakdown;
      return b ? { life: +b.life.toFixed(2), rows: b.rows.map(r => ({ k: r.k, v: +r.v.toFixed(3) })) } : null;
    },
    /** Flick distance that counts as a full flick (scales with the screen). */
    get flickRange() { return throwCtl.S.flickRange; },
    /** How many points the drawn flick trail is following right now. */
    get flickPath() { return throwCtl.S.flick && throwCtl.S.flick.path ? throwCtl.S.flick.path.length : 0; },
    get releasing() { return throwCtl.S.releasing; },
    /** Wash a special stone up right now, skipping its timer (verification only). */
    spawnSpecial(id) { const r = rocks.spawnSpecial(id); if (r) updateSparkle(); return !!r; },
    /**
     * Where every pickable stone at this spot lands on screen right now, in CSS
     * pixels, with the flags the placement rules promise: in front of the player,
     * inside the frame, and far enough from the HUD bands to be tappable.
     */
    get rockScreen() {
      const v = new THREE.Vector3();
      const W = innerWidth, H = innerHeight;
      return rocks.pickables.map((p) => {
        const r = p.userData.rock;
        v.copy(p.position).project(camera);
        const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
        const fwd = currentSpot
          ? (r.mesh.position.x - currentSpot.x) * currentSpot.fx + (r.mesh.position.z - currentSpot.z) * currentSpot.fz
          : 0;
        // sideways metres (+ = to the player's right) and the bearing off the aim
        // line in degrees, which is what the placement cone is written in
        const side = currentSpot
          ? (r.mesh.position.x - currentSpot.x) * currentSpot.rx + (r.mesh.position.z - currentSpot.z) * currentSpot.rz
          : 0;
        return {
          id: r.kind.id, special: !!r.special, x: Math.round(sx), y: Math.round(sy),
          depth: +v.z.toFixed(3), ahead: +fwd.toFixed(2), side: +side.toFixed(2),
          azDeg: +(Math.atan2(side, Math.max(0.2, fwd)) * 180 / Math.PI).toFixed(1),
          onScreen: v.z > -1 && v.z < 1 && sx > 0 && sx < W && sy > 0 && sy < H,
        };
      });
    },
    get stats() { return save ? save.stats : null; },
    /** The flying stone's rendered spin, so a test can see which way it turns. */
    get stoneRoll() { return stoneMesh && stone && stone.alive ? stoneMesh.rotation.y : null; },
    /** What the splash cosmetic is doing right now (equipped value + live tint). */
    get splashFx() {
      const t = fx.splashTint();
      return { save: save ? (save.splash || '') : '', hex: '#' + t.hex.toString(16).padStart(6, '0'), rainbow: t.rainbow };
    },
    /**
     * The 🗺️ map view: whether it is up, how far the camera has climbed, and how
     * every spot is drawn / where it lands on screen (so a tap can be aimed).
     */
    get mapView() {
      const v = new THREE.Vector3();
      const W = innerWidth, H = innerHeight;
      return {
        on: mapActive,
        mode: rig.mode,
        blend: +rig.overviewBlend.toFixed(3),
        camY: Math.round(camera.position.y),
        hudMap: hud.mapMode,
        handHidden: hand.hidden,
        spots: SPOTS.map((s) => {
          v.set(s.x, (s.standY || heightAt(s.x, s.z)) + 0.08, s.z).project(camera);
          // marker style first: the screen position must win the name clash
          return Object.assign({}, props.markerState(s.id) || {}, {
            id: s.id, current: currentSpot === s,
            x: Math.round((v.x * 0.5 + 0.5) * W), y: Math.round((-v.y * 0.5 + 0.5) * H),
            onScreen: v.z > -1 && v.z < 1
              && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
          });
        }),
      };
    },
    /**
     * What the player is really looking at (verification only). A WebGL canvas
     * cannot be read back after the browser has composited it, so this renders
     * one more frame and pulls a coarse pixel grid straight out of the buffer.
     */
    sampleFrame(step = 10) {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const px = [];
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const i = ((h - 1 - y) * w + x) * 4;      // GL rows run bottom-up
          px.push(buf[i], buf[i + 1], buf[i + 2]);
        }
      }
      return { w, h, step, cols: Math.ceil(w / step), px };
    },
    /** Press the map button (verification only — same path as the rail button). */
    map(on) { if (!!on === mapActive) return mapActive; toggleMap(); return mapActive; },
    grant(n) { if (save) { save.points += n; refreshStats(); savePlayer(playerId, save); } },
    get fishChance() { return fishChance; },
    set fishChance(v) { fishChance = clamp(+v || 0, 0, 1); },
    get scene() { return scene; },
    get camera() { return camera; },
    get hand() { return hand.group; },
    get perf() {
      const i = renderer.info;
      return {
        calls: i.render.calls, tris: i.render.triangles,
        geometries: i.memory.geometries, textures: i.memory.textures,
        pixelRatio, props: props.stats,
      };
    },
  };
}

// --- unlocks: turning the save file into the actual game --------------------
// Special stones are NOT in here: they are not held or worn, they wash up on the
// beach on a timer and are picked up like any other stone (see maybeSpawnSpecial).
const EQUIPPABLE = ['theme', 'trail', 'splash', 'hat'];
function canEquip(u) { return EQUIPPABLE.includes(u.kind); }

/** The unlock row that grants a given cosmetic value, if there is one. */
function unlockFor(kind, value) {
  return UNLOCKS.find(u => u.kind === kind && u[kind] === value) || null;
}
function ownsCosmetic(kind, value) {
  if (!value) return false;
  const u = unlockFor(kind, value);
  return !!(u && save.owned[u.id]);
}
function isEquipped(u) {
  switch (u.kind) {
    case 'theme': return save.theme === u.theme;
    case 'trail': return save.trail === u.trail;
    case 'splash': return save.splash === u.splash;
    case 'hat': return save.hat === u.hat;
    default: return false;
  }
}

/**
 * Pushes everything the player owns into the live game: unlocked spots, arm
 * strength, cosmetics, the fish and the time of day. Safe to call any time;
 * anything equipped but no longer owned is quietly dropped.
 */
function applyOwned() {
  if (!save) return;
  const lvl = clamp(save.armLevel || 0, 0, 2);
  throwCtl.setRates(ARM.windRate[lvl], ARM.swingRate[lvl]);

  for (const s of SPOTS) s.unlocked = !s.unlock || !!save.owned[s.unlock];

  if (!ownsCosmetic('trail', save.trail)) save.trail = '';
  if (!ownsCosmetic('splash', save.splash)) save.splash = '';
  if (!ownsCosmetic('hat', save.hat)) save.hat = '';
  if (save.theme !== 'day' && !ownsCosmetic('theme', save.theme)) save.theme = 'day';

  fx.setTrail(save.trail);
  // a theme swap rewrites the fog, so the map view re-reads its base next frame
  fogBase = null;
  // the arcade gold, not a pale cream: unlit droplets show exactly this colour
  fx.setSplash(save.splash === 'gold' ? 0xffd32a : 0, save.splash === 'rainbow');
  hand.setHat(save.hat);
  fish.setVisible(!!save.owned.fish);
  applyTheme(save.theme, { scene, renderer, sky, water, hemi, dir: sun });
}

// --- special stones: they wash up, you catch them ---------------------------
// A bought special stone is never held. Once its minute is up it APPEARS on the
// beach among the loose pebbles and is picked up with the same tap; picking it
// restarts the minute. That turns each one into a small recurring event instead
// of a permanent "best stone" the player would simply always select.
function maybeSpawnSpecial() {
  if (!save || !rocks || !currentSpot) return;
  if (throwCtl.state !== 'idle' || rig.mode !== 'spot' || hud.fading || overlayOpen()) return;
  if (rocks.special) return;
  const ready = readySpecials(save);
  if (!ready.length) return;
  const pick = ready[Math.floor(Math.random() * ready.length)];
  const rock = rocks.spawnSpecial(pick.id);
  if (!rock) return;
  sfx.sparkle();
  fx.celebrate(rock.mesh.position.x, rock.mesh.position.y + 0.5, rock.mesh.position.z, 16);
  hud.toast(`✨ ${rock.kind.name} washed up!`, 'tap it to pick it up', GOLD);
}

/** Keeps the on-screen ring over the washed-up stone (or clears it). */
function updateSparkle() {
  const sp = rocks.special;
  // from the map view a stone on one beach is a couple of pixels: no ring
  if (!sp || rocks.selected === sp || rig.mode === 'overview') { hud.setSparkle(null); return; }
  const p = sp.mesh.position;
  // barely above the stone: the little ring should HUG it, not float over it
  hud.setSparkle({ x: p.x, y: p.y + 0.07, z: p.z, name: sp.kind.name });
}

function refreshStats() {
  hud.setStats({
    bestSkips: save.bestSkips, bestDistance: save.bestDistance,
    done: achCount(save), total: ACH_TOTAL, points: save.points,
  });
}

// --- rock / hand ------------------------------------------------------------
function refreshHand() {
  if (!rocks.selected) { hand.setRock(null); hud.setRock(null); return; }
  hand.setRock(rocks.makeHandVisual(rocks.selected));
  hand.reset();
  hud.setRock(rocks.selected);
}

function afterSelect(rock) {
  refreshHand();
  sfx.select();
  // picking up the next stone ends the last throw's readout (it also self-fades
  // after five seconds — see hud.drawBreakdown)
  hud.setBreakdown(null);
  const stars = rock.props.stars;
  hud.toast(rock.kind.name,
    rock.special ? rock.special.desc
      : (stars >= 4 ? 'Great skimmer!' : (stars <= 2 ? 'This one will plunk…' : 'Not bad')),
    rock.special ? GOLD : GLOW);
  updatePrompt();
  syncButtons();
}

function selectRock(rock) {
  if (!rock || rocks.selected === rock) return;
  rocks.select(rock);
  // catching the special stone starts its next minute straight away
  if (rock.special) {
    claimSpecial(save, rock.special.id);
    savePlayer(playerId, save);
    hud.setSparkle(null);
  }
  afterSelect(rock);
}

// --- spots ------------------------------------------------------------------
let currentSpot = null;

function goToSpot(id, instant = false) {
  const spot = spotById(id);
  if (!spot) return;
  // Picking a spot while the result card is up should just work.
  if (throwCtl.state === 'result') resumeAfterThrow();
  if (throwCtl.state !== 'idle') return;
  if (!spot.unlocked) {
    const u = spot.unlock ? unlockById(spot.unlock) : null;
    sfx.deny();
    hud.toast(`🔒 ${spot.name}`, u ? `${u.price} ✨ in the 🛒 shop` : 'Locked for now');
    return;
  }
  if (instant || !currentSpot) {
    currentSpot = spot;
    rig.setSpot(spot, true);
    arriveAt(spot);
    return;
  }
  if (spot === currentSpot) return;
  // The spots ring a 250 m lake: strolling to the far side in a straight line
  // would walk you across open water, so anything far gets a fade + a hop.
  const far = Math.hypot(spot.x - currentSpot.x, spot.z - currentSpot.z) > TELEPORT_DIST;
  if (far) {
    if (hud.fading) return;
    hud.setPrompt('');
    hud.fadeTravel(spot.name, () => {
      currentSpot = spot;
      rig.setSpot(spot, true);
      arriveAt(spot);
    });
    return;
  }
  hud.setPrompt('Walking over…', spot.name);
  rig.travelTo(spot, () => { currentSpot = spot; arriveAt(spot); });
}

function arriveAt(spot) {
  rocks.setActiveSpot(spot.id);
  refreshHand();
  maybeSpawnSpecial();
  save.lastSpot = spot.id;
  savePlayer(playerId, save);
  hud.toast(`📍 ${spot.name}`, spot.hint, GLOW);
  updatePrompt();
  syncButtons();
}

// --- throwing ---------------------------------------------------------------
function doLaunch(p) {
  const rock = rocks.selected;
  if (!rock) { throwCtl.setIdle(); return; }
  const lvl = clamp(save.armLevel || 0, 0, 2);
  const f = rig.forwardXZ();
  const h = rig.handPoint();
  stone = launchStone({
    x: h.x, y: h.y, z: h.z,
    fwdX: f.x, fwdZ: f.z,
    power: p.power, powerQ: p.powerQ, pitchDeg: p.pitchDeg, aimRad: p.aimRad,
    spin: p.spin, curve: p.curve, speedBonus: p.speedBonus,
    props: rock.props,
    special: rock.special || null,
    speedScale: ARM.speed[lvl],
    quality: p.quality,
  });
  stone.judgement = p.judgement;
  stone.grade = p.grade;
  stone.kindId = rock.special ? '' : rock.kind.id;
  stone.specialId = rock.special ? rock.special.id : '';
  stone.spotId = currentSpot.id;

  // A special stone's own trail beats the bought cosmetic while it is in the air.
  fx.setTrail((rock.special && rock.special.trail) || save.trail);
  trailPrev.set(stone.x, stone.y, stone.z);

  // the flying stone is drawn a little large so it stays readable from the chase cam
  stoneMesh = rocks.makeVisual(rock, 1.6);
  stoneMesh.position.set(stone.x, stone.y, stone.z);
  scene.add(stoneMesh);

  hud.setBreakdown(throwBreakdown(rock, p));
  hud.showFlickTrail(p.flick.path);
  rocks.consumeSelected();
  hand.release();
  hud.setRock(null);
  hud.setResult(null);
  hud.setPrompt('');
  liveSkips = 0;
  hud.setCounter(0);
  tracker.reset();
  fish.armThrow(fish.visible ? fishChance : 0);
  rig.follow(stone);
  sfx.release(p.power);

  // how the release was timed, said out loud straight away
  if (p.grade === 'perfect') { sfx.perfect(); hud.setGrade('PERFECT!', '#ffffff'); }
  else if (p.grade === 'great') hud.setGrade('GREAT!', GOLD);
  else if (p.grade === 'poor') hud.setGrade(p.pitchDeg > SWEET.center ? 'TOO EARLY' : 'TOO LATE', DANGER);
  flightT = 0;
}

/**
 * The five numbers behind a throw, for the little bottom-right readout.
 * Everything here is a real input to skip-physics.launchStone:
 *   stone    flatness/edge/weight of the rock, plus a bought stone's own bonus
 *   power    how close beat 2 landed to the white core (powerQuality)
 *   timing   how close beat 3 landed to dead centre (releaseQuality)
 *   flick up how far the flick travelled, against the distance that launches it
 *   straight how far off vertical the flick was (this and the one above are
 *            exactly what sets the spin, so spin needs no row of its own)
 */
function throwBreakdown(rock, p) {
  const pr = rock.props;
  let stone = clamp(pr.flatness * 0.74 + pr.edge * 0.16 + (1 - pr.weight) * 0.10, 0, 1);
  if (rock.special) {
    const sp = rock.special;
    stone = clamp(stone * clamp(sp.budgetMul || 1, 0.9, 1.25)
      * clamp(sp.speedMul || 1, 0.95, 1.15), 0, 1);
  }
  return [
    { k: 'Stone', v: stone },
    { k: 'Power', v: p.powerQ },
    { k: 'Timing', v: p.quality },
    { k: 'Flick up', v: p.flick.vert },
    { k: 'Straight', v: p.flick.straight },
  ];
}

function handleEvent(e) {
  switch (e.type) {
    case 'skip': {
      liveSkips = e.n;
      lastSplash = { x: e.x, z: e.z, n: e.n, at: performance.now() };
      fx.splash(e.x, e.z, clamp(e.strength, 0.15, 1), stone.vx / Math.max(e.vh, 0.01), stone.vz / Math.max(e.vh, 0.01), worldTime);
      sfx.skip(e.n, e.strength);
      hud.setCounter(e.n, e.distance);
      hud.popup(e.x, 0.7, e.z, String(e.n), e.n >= 6 ? GOLD : '#ffffff', e.n >= 6 ? 1.15 : 1);
      rig.addShake(0.05 + 0.09 * e.strength);
      break;
    }
    case 'plunk':
      fx.plunk(e.x, e.z, 0.8, worldTime);
      sfx.plunk();
      break;
    case 'land':
      fx.puff(e.x, e.y, e.z, 0.8);
      sfx.land();
      break;
    case 'buoyHit':
      sfx.buoy();
      fx.ripple(e.x, e.z, 6, 1, 1.3);
      hud.popup(e.x, e.y + 1.2, e.z, 'BONK!', GOLD, 1.1);
      hud.flash(GOLD, 0.5);
      break;
    case 'ringPass':
      sfx.gate();
      hud.popup(e.x, e.y + 1.6, e.z, 'THROUGH!', GOLD, 1.1);
      break;
    case 'bridgePass':
      sfx.gate();
      hud.popup(e.x, e.y + 2.2, e.z, 'UNDER THE BRIDGE!', GOLD, 0.95);
      break;
    case 'reedPass':
      sfx.gate();
      hud.popup(e.x, e.y + 1.6, e.z, e.n >= 2 ? 'BOTH GATES!' : 'THREADED!', GOLD, e.n >= 2 ? 1.15 : 1);
      break;
    case 'reedHit':
      sfx.step();
      break;
    // --- phase 2 -----------------------------------------------------------
    case 'fishLeap':
      sfx.splashBig();
      fx.splash(e.x, e.z, 1, 0, 0, worldTime);
      hud.popup(e.x, 3.2, e.z, '🐟 GULP!', GOLD, 1.2);
      hud.flash(GOLD, 0.6);
      rig.addShake(0.18);
      break;
    case 'gulp':
      sfx.gulp();
      break;
    case 'lilyLand':
      sfx.leaf();
      fx.puff(e.x, 0.4, e.z, 0.6);
      hud.popup(e.x, 1.4, e.z, 'ON THE PADS!', GOLD, 1.05);
      break;
    case 'beaconHit':
      sfx.buoy();
      fx.puff(e.x, e.y, e.z, 0.7);
      hud.popup(e.x, e.y + 1.6, e.z, 'BEACON!', GOLD, 1.1);
      hud.flash(GOLD, 0.5);
      break;
    case 'postHit':
      sfx.wood();
      fx.puff(e.x, e.y, e.z, 0.5);
      hud.popup(e.x, e.y + 1.5, e.z, 'BOING!', GOLD, 1.05);
      rig.addShake(0.1);
      break;
    case 'end':
      finishThrow(e);
      break;
  }
}

function titleFor(skips, reason) {
  if (reason === 'fish') return { t: 'A FISH ATE IT!', c: GOLD };
  if (reason === 'lily') return { t: 'Landed on the pads!', c: GOLD };
  if (skips >= 12) return { t: 'UNREAL!', c: GOLD };
  if (skips >= 9) return { t: 'AMAZING!', c: GOLD };
  if (skips >= 6) return { t: 'GREAT SKIP!', c: GOLD };
  if (skips >= 3) return { t: 'NICE ONE!', c: GLOW };
  if (skips >= 1) return { t: 'A couple of skips', c: '#a0c4ff' };
  if (reason === 'land') return { t: 'Dry land!', c: '#a0c4ff' };
  return { t: 'Plunk!', c: DANGER };
}

function finishThrow(e) {
  const skips = e.skips;
  const distance = e.distance;
  save.throws++;

  let newBestSkips = false, newBestDistance = false;
  if (skips > save.bestSkips) { save.bestSkips = skips; newBestSkips = true; }
  // a plunk that flew 2 m is not a distance record worth celebrating
  if (skips >= 1 && distance > save.bestDistance) { save.bestDistance = distance; newBestDistance = true; }
  const bestTag = newBestSkips && newBestDistance ? '⭐ NEW BESTS!'
    : (newBestSkips ? '⭐ NEW BEST SKIPS!' : (newBestDistance ? '⭐ NEW BEST DISTANCE!' : ''));

  // lake targets first: their achievement rows read save.targets
  tracker.settle({
    skips, distance, landed: stone.landed, x: stone.x, z: stone.z,
  }, save);

  const t = Object.assign({
    skips, distance,
    grade: stone.grade || 'poor',
    kindId: stone.kindId, specialId: stone.specialId,
    spotId: stone.spotId || (currentSpot && currentSpot.id),
    newBestSkips, newBestDistance,
    fish: e.reason === 'fish',
  }, tracker.tricks({ skips, distance }));

  applyThrow(save, t);
  const pts = throwPoints(t);
  save.points += pts;
  const achs = settleAchievements(save, t);      // adds its own bonuses

  const ti = titleFor(skips, e.reason);
  hud.setResult({
    title: ti.t,
    sub: stone.judgement || '',
    titleColor: ti.c,
    skips, distance,
    points: pts,
    newBest: bestTag,
  });
  hud.setCounter(null);
  rig.showResult(stone.x, Math.max(stone.y, 0.3), stone.z);

  if (pts > 0) sfx.points(pts);
  if (bestTag) { sfx.record(); fx.celebrate(stone.x, 1.4, stone.z, 50); }
  else if (skips >= 6) { fx.celebrate(stone.x, 1.2, stone.z, 26); }

  // one toast per achievement — the 12 lake targets live in the same list, so a
  // finished target is announced exactly once, like everything else
  let delay = 0;
  for (const a of achs) {
    const ch = TARGETS.find(c => c.id === a.id);
    const tgt = (ch && targetMarker(ch)) || { x: stone.x, y: 1, z: stone.z };
    setTimeout(() => {
      hud.toast(`${a.icon} ${a.name}!`, a.badge ? `${a.desc}  ·  🏅 badge` : `${a.desc}  ·  +${a.pts} ✨`);
      sfx.achievement();
      fx.celebrate(tgt.x, (tgt.y || 1) + 1, tgt.z, ch ? 60 : 40);
      hud.flash(GOLD, 0.7);
    }, 450 + delay);
    delay += 1000;
  }
  savePlayer(playerId, save);
  refreshStats();
  throwCtl.setState('result');
  resultHold = 0;
}

function resumeAfterThrow() {
  if (stoneMesh) { scene.remove(stoneMesh); stoneMesh = null; }
  stone = null;
  hud.clearResult();
  hud.setCounter(null);
  throwCtl.setIdle();
  rig.toSpot();
  // no auto-pick anywhere: choosing a stone is half the game
  fx.setTrail(save.trail);
  refreshHand();
  maybeSpawnSpecial();
  updatePrompt();
  syncButtons();
}

function updatePrompt() {
  if (!throwCtl) return;
  if (throwCtl.state !== 'idle') return;
  if (!rocks.selected) hud.setPrompt('Pick up a stone', 'tap one on the ground');
  else hud.setPrompt('WIND UP to throw', 'then tap for power → flick forward');
}

// --- input ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let audioReady = false;

function firstGesture() {
  if (audioReady) return;
  audioReady = true;
  ensureAudio();
  startAmbience();
}

const pickTmp = new THREE.Vector3();

/** A hidden PARENT must hide its children too (locked spot markers live in one). */
function chainVisible(o) {
  let n = o;
  while (n) { if (!n.visible) return false; n = n.parent; }
  return true;
}

function pick(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = rocks.pickables.concat(props.pickables);
  // .visible is not checked by the raycaster, and hidden things must not eat taps:
  // the marker under your feet is hidden, so are locked spots and the other
  // spots' stones.
  const hits = raycaster.intersectObjects(targets, false).filter(h => chainVisible(h.object));
  if (!hits.length) return null;
  // Rock pick proxies are deliberately fat (tiny pebbles, small fingers), so a
  // tap can land inside two of them. Depth order would then hand you whichever
  // pebble is nearest the camera; instead pick the one whose centre is closest to
  // the tap ray in ANGLE, i.e. the stone the player was actually pointing at.
  let best = null, bestOff = Infinity;
  for (const h of hits) {
    if (!h.object.userData.rock) continue;
    h.object.getWorldPosition(pickTmp);
    const off = raycaster.ray.distanceToPoint(pickTmp) / Math.max(h.distance, 0.001);
    if (off < bestOff) { bestOff = off; best = h; }
  }
  return best || hits[0];
}

function onTap(x, y) {
  const hit = pick(x, y);
  if (hit) {
    const rock = rocks.fromMesh(hit.object);
    if (rock) { selectRock(rock); return; }
    const spotId = hit.object.userData.spotId;
    if (spotId) {
      if (spotId === currentSpot.id) { sfx.ui(); updatePrompt(); }
      else goToSpot(spotId);
      return;
    }
  }
  // empty tap: start the throw — but never silently hand out a stone
  if (rocks.selected) throwCtl.start();
  else {
    sfx.deny();
    hud.toast('Pick a stone first', 'tap one of the stones on the ground');
  }
}

let dragActive = false;
// a tap started in the map view: { x, y, id } (there is no look-drag up there)
let mapTap = null;

function onPointerDown(e) {
  if (overlayOpen() || !rig || hud.fading) return;
  firstGesture();
  const x = e.clientX, y = e.clientY;

  // the map view has its own, much more forgiving, hit test (see onMapTap)
  if (mapActive) { mapTap = { x, y, id: e.pointerId }; return; }

  if (throwCtl.state === 'result') {
    if (resultHold > 0.45) resumeAfterThrow();
    return;
  }
  if (throwCtl.state === 'flight') return;
  if (throwCtl.pointerDown(x, y, e.pointerId)) return;
  if (throwCtl.state === 'idle') {
    dragActive = rig.dragStart(x, y, e.pointerId);
  }
}

function onPointerMove(e) {
  if (!rig) return;
  const x = e.clientX, y = e.clientY;
  if (throwCtl.pointerMove(x, y, e.pointerId)) return;
  if (dragActive) rig.dragMove(x, y, e.pointerId);
}

function onPointerUp(e) {
  if (!rig) return;
  const x = e.clientX, y = e.clientY;
  if (mapTap && e.pointerId === mapTap.id) {
    const moved = Math.abs(x - mapTap.x) + Math.abs(y - mapTap.y);
    mapTap = null;
    // a scrubbed finger is not a choice of spot; an empty tap leaves the map up
    if (moved < 22 && mapActive) onMapTap(x, y);
    return;
  }
  if (throwCtl.pointerUp(x, y, e.pointerId)) return;
  if (dragActive) {
    dragActive = false;
    const looked = rig.dragEnd(e.pointerId);
    if (!looked && !overlayOpen() && !hud.fading) onTap(x, y);
  }
}

view.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('contextmenu', (e) => e.preventDefault());

// keyboard shortcut for desktop testing: space = tap. There is deliberately no
// "give me a stone" key, because there is no auto-pick in the game at all.
window.addEventListener('keydown', (e) => {
  if (overlayOpen() || !rig) return;
  if (e.code === 'Space') {
    e.preventDefault();
    const cx = window.innerWidth / 2, cy = window.innerHeight * 0.7;
    if (throwCtl.state === 'result') { if (resultHold > 0.45) resumeAfterThrow(); return; }
    // no throwing while walking between spots or while the camera chases a stone
    // (matches syncButtons, which hides the WIND UP button outside spot mode)
    if (rig.mode !== 'spot') return;
    if (throwCtl.state === 'swing') {
      throwCtl.pointerDown(cx, cy, 1);
      setTimeout(() => throwCtl.pointerUp(cx, cy - 90, 1), 60);
      return;
    }
    if (throwCtl.pointerDown(cx, cy, 1)) return;
    if (throwCtl.state === 'idle' && rocks.selected) throwCtl.start();
  }
});

// --- buttons ----------------------------------------------------------------
const throwBtn = document.getElementById('throwBtn');
let btnState = null;
let centreShown = false;

throwBtn.addEventListener('click', () => {
  firstGesture();
  if (throwCtl.state === 'idle' && rocks.selected) throwCtl.start();
});

// The aim safeguard. Dragging the view is how you find stones and read the lake,
// so a stray yaw used to follow you into the throw with nothing on screen to say
// so. Now the HUD shows how far off you are and this button puts it back.
const centreBtn = document.getElementById('centreBtn');
centreBtn.addEventListener('click', () => {
  firstGesture();
  sfx.ui();
  rig.recentre();
  hud.toast('🎯 Aim centred', 'Straight down the lane', GLOW);
});

/**
 * One button at the bottom of the screen: WIND UP, and only while you are holding
 * a stone. Empty hands means "go and tap a stone" — there is no button for that,
 * on purpose (picking your own stone is the first half of the game).
 */
function syncButtons() {
  if (!rocks || !hud || !rig) return;
  const usable = throwCtl.state === 'idle' && rig.mode === 'spot'
    && !overlayOpen() && !hud.fading;
  const want = usable && rocks.selected ? 'throw' : '';
  // the re-centre button rides along: only while standing, and only when the aim
  // is far enough off the lane to matter (the HUD warns at the same threshold)
  const off = rig.aimOffsetDeg();
  hud.setAimOffset(off);
  const wantCentre = usable && Math.abs(off) >= AIM_WARN_DEG;
  if (wantCentre !== centreShown) {
    centreShown = wantCentre;
    centreBtn.classList.toggle('hidden', !wantCentre);
  }
  if (want === btnState) return;
  btnState = want;
  throwBtn.classList.toggle('hidden', want !== 'throw');
}

// --- the map view -----------------------------------------------------------
// The 🗺️ button lifts the camera to a bird's-eye view of the whole lake, with
// every throw spot highlighted (gold = where you are, purple = walk there,
// greyed + 🔒 = still in the shop). Tapping a spot travels to it; tapping 🗺️
// again tweens back down to where you were standing. It is the only way out on
// purpose: a second "close map" control just overlapped the rest of the HUD, and
// the rail button is already lit (.on) while you are up there.
const mapBtn = document.getElementById('mapBtn');
let mapActive = false;

function openMap() {
  mapActive = true;
  props.setMapMode(true, currentSpot.id);
  hud.setMapMode(true, currentSpot.name);
  hud.setPrompt('');
  hud.setBreakdown(null);
  hud.setSparkle(null);
  hand.setHidden(true);
  rig.toOverview();
  mapBtn.classList.add('on');
  syncButtons();
}

/**
 * Back down to the spot. `instant` is for the case where something else takes
 * over the camera (a panel that walks you somewhere): the map state must never
 * be left behind, markers eight times life size, while the rig does something
 * else with the camera.
 */
function closeMap(instant = false) {
  if (!mapActive) return;
  mapActive = false;
  props.setMapMode(false);
  hud.setMapMode(false);
  hand.setHidden(false);
  if (instant) rig.toSpot(true);
  else rig.fromOverview();
  mapBtn.classList.remove('on');
  updatePrompt();
  syncButtons();
}

function toggleMap() {
  if (!rig || !currentSpot) return;
  if (mapActive) { sfx.ui(); closeMap(); return; }
  if (throwCtl.state === 'result') resumeAfterThrow();
  if (throwCtl.state !== 'idle' || rig.mode !== 'spot' || hud.fading || overlayOpen()) {
    sfx.deny();
    hud.toast('🗺️ Not just now', 'Finish this throw first');
    return;
  }
  sfx.ui();
  openMap();
}

mapBtn.addEventListener('click', () => { firstGesture(); toggleMap(); });

/**
 * A tap on the map. The markers are scaled up for exactly this, but a finger is
 * still fatter than a ring seen from 400 m, so the nearest marker within a
 * generous radius wins rather than a strict hit test.
 */
function onMapTap(x, y) {
  if (hud.fading) return;
  const v = new THREE.Vector3();
  const reach = Math.max(56, Math.min(window.innerWidth, window.innerHeight) * 0.11);
  let best = null, bestD = Infinity;
  for (const s of SPOTS) {
    v.set(s.x, (s.standY || heightAt(s.x, s.z)) + 0.08, s.z).project(camera);
    if (v.z < -1 || v.z > 1) continue;
    const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const d = Math.hypot(sx - x, sy - y);
    if (d < bestD) { bestD = d; best = s; }
  }
  if (!best || bestD > reach) return;
  if (best === currentSpot) { sfx.ui(); closeMap(); return; }
  if (!best.unlocked) {
    const u = best.unlock ? unlockById(best.unlock) : null;
    sfx.deny();
    hud.toast(`🔒 ${best.name}`, u ? `${u.price} ✨ in the 🛒 shop` : 'Locked for now');
    return;
  }
  // Travelling FROM the map always fades. The camera is hundreds of metres up, so
  // walking (or worse, diving down and then walking) would be a mess; the fade
  // covers the change of scene and you simply arrive standing at the new spot.
  sfx.select();
  hud.setPrompt('');
  hud.fadeTravel(best.name, () => {
    closeMap(true);
    currentSpot = best;
    rig.setSpot(best, true);
    arriveAt(best);
  });
}

document.getElementById('helpBtn').addEventListener('click', () => { sfx.ui(); showPanel('tutorial'); });
document.getElementById('spotsBtn').addEventListener('click', () => { sfx.ui(); openSpots(); });
document.getElementById('shopBtn').addEventListener('click', () => { sfx.ui(); openShop(); });
document.getElementById('achBtn').addEventListener('click', () => { sfx.ui(); openAch(); });
document.getElementById('bagBtn').addEventListener('click', () => { sfx.ui(); openBag(); });
document.getElementById('tutStart').addEventListener('click', () => {
  sfx.ui();
  save.seenTutorial = true;
  savePlayer(playerId, save);
  hideOverlay();
  updatePrompt();
});
for (const id of ['spotClose', 'shopClose', 'achClose', 'bagClose']) {
  document.getElementById(id).addEventListener('click', () => { sfx.ui(); hideOverlay(); });
}

function row(html, cls, onClick) {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  if (onClick) el.addEventListener('click', onClick);
  else el.style.cursor = 'default';
  return el;
}
function groupHeader(text) {
  const el = document.createElement('div');
  el.className = 'grp';
  el.textContent = text;
  return el;
}
function body(name, desc) {
  return `<div><div class="nm">${name}</div><div class="ds">${desc}</div></div>`;
}

function openSpots() {
  const list = document.getElementById('spotList');
  list.innerHTML = '';
  const base = SPOTS.filter(s => BASE_SPOT_IDS.includes(s.id));
  const extra = SPOTS.filter(s => !BASE_SPOT_IDS.includes(s.id));
  const add = (s) => {
    const here = currentSpot && s.id === currentSpot.id;
    const locked = !s.unlocked;
    const u = s.unlock ? unlockById(s.unlock) : null;
    const right = here ? '<div class="tk">●</div>'
      : (locked ? `<div class="pr">${u ? u.price : '?'} ✨<small>IN THE SHOP</small></div>`
        : '<div class="go">GO →</div>');
    list.appendChild(row(
      `<div class="ic">${locked ? '🔒' : (s.onPier ? '🪵' : '🏖️')}</div>` + body(s.name, s.hint) + right,
      'row' + (here ? ' done' : '') + (locked ? ' locked cant' : ''),
      () => {
        if (locked) { sfx.ui(); openShop(); return; }
        sfx.select();
        hideOverlay();
        goToSpot(s.id);
      }
    ));
  };
  list.appendChild(groupHeader('Around the lake'));
  base.forEach(add);
  if (extra.length) {
    list.appendChild(groupHeader(extra.some(s => !s.unlocked) ? 'Unlock in the shop' : 'Bought spots'));
    extra.forEach(add);
  }
  showPanel('spots');
}

// --- shop -------------------------------------------------------------------
let shopMsgTimer = 0;
function shopMsg(text) {
  const el = document.getElementById('shopMsg');
  if (!el) return;
  el.textContent = text || '';
  clearTimeout(shopMsgTimer);
  if (text) shopMsgTimer = setTimeout(() => { el.textContent = ''; }, 2600);
}

function openShop(msg) {
  const list = document.getElementById('shopList');
  list.innerHTML = '';
  document.getElementById('shopPoints').textContent = `✨ ${save.points}`;
  for (const grp of SHOP_GROUPS) {
    const items = UNLOCKS.filter(u => u.group === grp);
    if (!items.length) continue;
    list.appendChild(groupHeader(grp));
    for (const u of items) {
      const owned = !!save.owned[u.id];
      const c = canBuy(save, u);
      const equipped = owned && isEquipped(u);
      let cls = 'row';
      if (equipped) cls += ' equipped';
      else if (owned) cls += ' done';
      else if (!c.ok) cls += ' cant';
      if (!owned && c.why === 'needs') cls += ' locked';
      let right;
      if (owned) {
        right = canEquip(u)
          ? `<div class="pr">${equipped ? '✓ ON' : 'USE'}</div>`
          : '<div class="tk">✓</div>';
      } else {
        const need = c.why === 'needs' ? `<small>NEEDS ${(unlockById(u.needs) || {}).name || ''}</small>` : '';
        right = `<div class="pr">${u.price} ✨${need}</div>`;
      }
      list.appendChild(row(
        `<div class="ic">${u.icon}</div>` + body(u.name, u.desc) + right,
        cls, () => onShopRow(u)
      ));
    }
  }
  showPanel('shop');
  shopMsg(msg || '');
}

function onShopRow(u) {
  if (save.owned[u.id]) {
    if (canEquip(u)) { toggleEquip(u); openShop(); }
    else { sfx.ui(); shopMsg(`${u.name} is already yours.`); }
    return;
  }
  const c = canBuy(save, u);
  if (!c.ok) {
    sfx.deny();
    if (c.why === 'needs') shopMsg(`Buy ${(unlockById(u.needs) || {}).name} first.`);
    else shopMsg(`${u.price - save.points} more ✨ needed — go and skip some stones!`);
    return;
  }
  buy(save, u);
  sfx.buy();
  // buying something wearable puts it on straight away, which is what a kid expects
  if (canEquip(u)) equipUnlock(u);
  applyOwned();
  // a collection badge lands with the purchase that earned it (0 ✨, so the
  // balance shown in the shop message is unaffected)
  const badges = settleBadges(save);
  savePlayer(playerId, save);
  refreshStats();
  let bd = 0;
  for (const a of badges) {
    setTimeout(() => { hud.toast(`${a.icon} ${a.name}!`, `${a.desc}  ·  🏅 badge`); sfx.achievement(); }, 700 + bd);
    bd += 1000;
  }
  const extra = u.kind === 'spot' ? ' Open 📍 to walk there.'
    : (u.kind === 'arm' ? ' Your throws are stronger now.'
      : (u.kind === 'fish' ? ' Look under the water…'
        : (u.kind === 'stone' ? ' Look for it on the beach!' : '')));
  openShop(`Got it — ${u.name}!${extra}`);
}

function equipUnlock(u) {
  switch (u.kind) {
    case 'theme': save.theme = u.theme; break;
    case 'trail': save.trail = u.trail; break;
    case 'splash': save.splash = u.splash; break;
    case 'hat': save.hat = u.hat; break;
  }
}

function toggleEquip(u) {
  sfx.select();
  const on = isEquipped(u);
  switch (u.kind) {
    case 'theme': save.theme = on ? 'day' : u.theme; break;
    case 'trail': save.trail = on ? '' : u.trail; break;
    case 'splash': save.splash = on ? '' : u.splash; break;
    case 'hat': save.hat = on ? '' : u.hat; break;
  }
  applyOwned();
  savePlayer(playerId, save);
  syncButtons();
}

// --- achievements -----------------------------------------------------------
function openAch() {
  const list = document.getElementById('achList');
  list.innerHTML = '';
  // "most" rather than "every": the Collection badges are deliberately worth 0 ✨
  document.getElementById('achCount').textContent =
    `${achCount(save)} of ${ACH_TOTAL} earned — most pay ✨ Skip Points`;
  for (const grp of ACH_GROUPS) {
    const items = ACHIEVEMENTS.filter(a => a.group === grp);
    if (!items.length) continue;
    list.appendChild(groupHeader(grp));
    for (const a of items) {
      const done = !!save.achievements[a.id];
      // A lake-target row knows where it lives, so an unfinished one doubles as a
      // "walk me there" button. That is the whole of the old challenges screen,
      // folded into the one list.
      const spot = !done && a.spot ? spotById(a.spot) : null;
      // A collection badge pays nothing on purpose (you already spent the points
      // to unlock the thing), so it says BADGE instead of a misleading "+0 ✨".
      const right = a.badge
        ? (done ? '<div class="tk">✓<small>BADGE</small></div>'
          : '<div class="pr bdg">🏅<small>BADGE</small></div>')
        : (done ? `<div class="tk">✓<small>+${a.pts} ✨</small></div>`
          : `<div class="pr">+${a.pts} ✨${spot ? `<small>GO → ${spot.name.toUpperCase()}</small>` : ''}</div>`);
      // A counting achievement shows how far along it is ("247 / 500"), read live
      // from the save so it moves with every throw. An earned one drops the count:
      // the ✓ already says it, and "500 / 500 ✓" is just noise.
      const p = done ? null : achProgress(a, save);
      const desc = p ? `${a.desc} <b class="cnt">${p.have} / ${p.need}${p.unit}</b>` : a.desc;
      // Earned rows keep their reward on show (it is a trophy, not a price tag)
      // and locked rows keep their own emoji, with the padlock as a small
      // overlay — a wall of 🔒 told you nothing about what was still out there.
      list.appendChild(row(
        `<div class="ic">${a.icon}</div>` + body(a.name, desc) + right,
        'row' + (done ? ' done' : ' locked'),
        spot ? () => { sfx.select(); hideOverlay(); goToSpot(spot.id); } : null
      ));
    }
  }
  showPanel('ach');
}

// --- bag (everything you own, and what is switched on) ----------------------
function openBag() {
  const list = document.getElementById('bagList');
  list.innerHTML = '';
  const ownedOf = (kind) => UNLOCKS.filter(u => u.kind === kind && save.owned[u.id]);
  let any = false;

  function slot(title, opts) {
    if (opts.length <= 1) return;        // nothing bought in this slot yet
    any = true;
    list.appendChild(groupHeader(title));
    for (const o of opts) {
      list.appendChild(row(
        `<div class="ic">${o.icon}</div>` + body(o.name, o.desc) +
        (o.on ? '<div class="tk">✓</div>' : '<div class="pr">USE</div>'),
        'row' + (o.on ? ' equipped' : ''),
        () => {
          sfx.select();
          o.pick();
          applyOwned();
          savePlayer(playerId, save);
          syncButtons();
          openBag();
        }
      ));
    }
  }

  // Special stones are not equipped: they wash up on the beach on a one-minute
  // timer, so the bag shows WHEN rather than a switch.
  const specials = ownedSpecials(save);
  if (specials.length) {
    any = true;
    list.appendChild(groupHeader('Special stones'));
    const here = rocks.special ? rocks.special.special.id : null;
    for (const o of specials) {
      const secs = Math.ceil(o.left / 1000);
      const rightNow = here === o.id;
      const st = rightNow ? '<div class="tk">✨<small>ON THE BEACH</small></div>'
        : (o.left <= 0 ? '<div class="pr">READY<small>WASHING UP</small></div>'
          : `<div class="pr">${secs}s<small>UNTIL IT RETURNS</small></div>`);
      // the line under the name says what the stone DOES (stones.js `effect`);
      // when it can be found is the live badge on the right, not prose
      const def = specialById(o.id);
      list.appendChild(row(
        `<div class="ic">${o.unlock.icon}</div>` +
        body(o.unlock.name, (def && def.effect) || o.unlock.desc) + st,
        'row' + (rightNow || o.left <= 0 ? ' equipped' : ' done')
      ));
    }
  }

  slot('Day & night', [
    {
      icon: '☀️', name: 'Bright Day', desc: 'The usual sunny afternoon',
      on: save.theme === 'day', pick: () => { save.theme = 'day'; },
    },
    ...ownedOf('theme').map(u => ({
      icon: u.icon, name: u.name, desc: u.desc,
      on: save.theme === u.theme, pick: () => { save.theme = u.theme; },
    })),
  ]);

  slot('Trails', [
    { icon: '🚫', name: 'No trail', desc: 'Just the stone', on: !save.trail, pick: () => { save.trail = ''; } },
    ...ownedOf('trail').map(u => ({
      icon: u.icon, name: u.name, desc: u.desc,
      on: save.trail === u.trail, pick: () => { save.trail = u.trail; },
    })),
  ]);

  slot('Splashes', [
    { icon: '💧', name: 'Water splashes', desc: 'Normal lake water', on: !save.splash, pick: () => { save.splash = ''; } },
    ...ownedOf('splash').map(u => ({
      icon: u.icon, name: u.name, desc: u.desc,
      on: save.splash === u.splash, pick: () => { save.splash = u.splash; },
    })),
  ]);

  slot('Hats', [
    { icon: '🙂', name: 'No hat', desc: 'Bare head', on: !save.hat, pick: () => { save.hat = ''; } },
    ...ownedOf('hat').map(u => ({
      icon: u.icon, name: u.name, desc: u.desc,
      on: save.hat === u.hat, pick: () => { save.hat = u.hat; },
    })),
  ]);

  // things that are simply on once bought
  const info = [];
  if (save.armLevel > 0) {
    info.push({ icon: '💪', name: `Arm Strength ${save.armLevel >= 2 ? 'II' : 'I'}`, desc: 'Stronger throws, and a faster power bar' });
  }
  if (save.owned.fish) info.push({ icon: '🐟', name: 'See The Fish', desc: 'Fish swim in the lake — mind your stone' });
  const spots = ownedOf('spot');
  if (spots.length) {
    info.push({ icon: '📍', name: `${spots.length} extra spot${spots.length > 1 ? 's' : ''}`, desc: 'Open 📍 to walk there' });
  }
  if (info.length) {
    any = true;
    list.appendChild(groupHeader('Always on'));
    for (const i of info) {
      list.appendChild(row(`<div class="ic">${i.icon}</div>` + body(i.name, i.desc) + '<div class="tk">✓</div>', 'row done'));
    }
  }

  if (!any) {
    list.appendChild(row(
      '<div class="ic">🛒</div>' + body('Nothing yet', 'Skip stones to earn ✨ Skip Points, then buy things in the shop.'),
      'row'
    ));
  }
  showPanel('bag');
}

// --- atmosphere for the map view --------------------------------------------
// Both the scene fog and the water shader are tuned for eye level, where the far
// shore should melt into the haze at a few hundred metres. From the map view the
// WHOLE lake is that far away, so every one of those pixels would come out flat
// haze. The bands are pushed out in step with the climb (rig.overviewBlend) and
// snap back on the way down.
let fogBase = null;

function syncMapAtmosphere() {
  if (!scene.fog || !water.setHazeRange) return;
  const u = rig.overviewBlend;
  if (u <= 0.001) {
    if (fogBase) {
      scene.fog.near = fogBase.near;
      scene.fog.far = fogBase.far;
      water.setHazeRange(HAZE_NEAR, HAZE_FAR);
      fogBase = null;
    }
    return;
  }
  // a theme change re-writes the fog from its palette, so the base is re-read
  // rather than captured once and trusted
  if (!fogBase) fogBase = { near: scene.fog.near, far: scene.fog.far };
  const d = Math.max(camera.position.y, 60);
  scene.fog.near = lerp(fogBase.near, d * 1.5, u);
  scene.fog.far = lerp(fogBase.far, d * 3.6, u);
  water.setHazeRange(lerp(HAZE_NEAR, d * 1.5, u), lerp(HAZE_FAR, d * 3.6, u));
}

// --- resize -----------------------------------------------------------------
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (hud) hud.resize();
  // The flick is a swipe up the SCREEN, so its full length scales with the
  // screen. A resize can arrive (a rotated phone, a soft keyboard) before the
  // world is built, so this is guarded like the HUD above.
  if (throwCtl) throwCtl.setFlickRange(flickRangeFor(h));
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 150));

// --- loop -------------------------------------------------------------------
let last = performance.now();
let frameAcc = 0, frameCount = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  if (!rig) return;

  // adaptive resolution for tablets
  frameAcc += dt; frameCount++;
  if (frameCount >= 90) {
    const avg = frameAcc / frameCount;
    if (avg > 0.026 && pixelRatio > 0.85) {
      pixelRatio = Math.max(0.85, pixelRatio - 0.25);
      renderer.setPixelRatio(pixelRatio);
    }
    frameAcc = 0; frameCount = 0;
  }

  // before the player has chosen: slow scenic orbit as the menu backdrop
  if (!currentSpot) {
    worldTime += dt;
    menuOrbit += dt * 0.035;
    const r = 168;
    camera.position.set(
      LAKE.cx + Math.cos(menuOrbit) * r,
      46 + Math.sin(menuOrbit * 0.7) * 6,
      LAKE.cz + Math.sin(menuOrbit) * r
    );
    camera.lookAt(LAKE.cx, 0, LAKE.cz);
    water.update(worldTime);
    sky.update(dt);
    props.update(dt, worldTime);
    fish.update(dt, worldTime);
    fx.update(dt, worldTime);
    renderer.render(scene, camera);
    return;
  }

  // gauges tick in real time; the world slows down for the wind-up
  throwCtl.update(dt);
  let ts = throwCtl.timeScale();
  if (throwCtl.state === 'flight') {
    flightT += dt;
    ts = lerp(0.35, 1, sat(flightT / 0.42));   // launch punch
  }
  const wdt = dt * ts;
  worldTime += wdt;

  // stone
  if (stone && stone.alive) {
    events.length = 0;
    stepStone(stone, wdt, {
      heightAt,
      probe: (s, ev) => {
        tracker.probe(s, ev);
        // a target that already ended the throw wins; the fish only eats a
        // stone that is still flying
        if (s.alive && !s.stopRequest) fish.probe(s, ev);
      },
    }, events);
    for (const e of events) handleEvent(e);
    // the top readout carries the distance as well as the skip count, and it is
    // refreshed here (not only at skip events) so the metres run up smoothly
    // while the stone is between bounces
    hud.setCounter(liveSkips, stone.maxDistance);
    if (stoneMesh) {
      stoneMesh.position.set(stone.x, Math.max(stone.y, -0.4), stone.z);
      stoneMesh.rotation.y = stone.spinRoll;
      stoneMesh.rotation.x = clamp(-stone.vy * 0.03, -0.5, 0.5);
    }
    // cosmetic trail: spaced by distance travelled this frame
    const moved = Math.hypot(stone.x - trailPrev.x, stone.y - trailPrev.y, stone.z - trailPrev.z);
    fx.emitTrail(stone.x, Math.max(stone.y, 0.12), stone.z, moved);
    trailPrev.set(stone.x, stone.y, stone.z);
  } else if (stoneMesh && throwCtl.state === 'result') {
    stoneMesh.visible = stone && stone.landed && stone.endReason !== 'fish';
  }

  if (throwCtl.state === 'result') {
    resultHold += dt;
    if (resultHold > 4.2) resumeAfterThrow();
  }

  // footsteps while walking
  if (rig.mode === 'travel') {
    stepTimer -= dt;
    if (stepTimer <= 0) { stepTimer = 0.42; sfx.step(); }
  }

  syncButtons();
  // a bought stone washes up on its own timer; check a couple of times a second
  specialTimer -= dt;
  if (specialTimer <= 0) { specialTimer = 0.5; maybeSpawnSpecial(); }
  updateSparkle();
  water.update(worldTime);
  sky.update(wdt);
  props.update(wdt, worldTime);
  rocks.update(wdt, worldTime);
  fish.update(wdt, worldTime);
  fx.update(wdt, worldTime);
  rig.update(wdt);
  syncMapAtmosphere();
  hand.update(dt, throwCtl.drawBack(), throwCtl.state, worldTime);
  updateAudio(dt);

  renderer.render(scene, camera);
  hud.draw(dt);
}

// --- boot -------------------------------------------------------------------
function startPlayer(id) {
  playerId = id;
  save = loadPlayer(id);
  // an older save may already own half the shop: mark those badges quietly (no
  // toasts, no points) so the achievements screen tells the truth on arrival
  if (settleBadges(save).length) savePlayer(id, save);
  tracker.load(save);
  const p = PLAYERS.find(pp => pp.id === id);
  hud.setPlayer(p);
  applyOwned();
  refreshStats();
  const lastOk = spotById(save.lastSpot) && spotById(save.lastSpot).unlocked;
  goToSpot(lastOk ? save.lastSpot : 'main', true);
  firstGesture();
  if (!save.seenTutorial) showPanel('tutorial');
  else hideOverlay();
  updatePrompt();
  syncButtons();
}

function buildPlayerButtons() {
  const wrap = document.getElementById('playerBtns');
  wrap.innerHTML = '';
  const lastId = lastPlayer();
  for (const p of PLAYERS) {
    const s = playerSummary(p.id);
    const b = document.createElement('button');
    b.className = 'btn-player';
    b.innerHTML =
      `<span class="av">${p.avatar}</span>${p.name}` +
      `<span class="st">best ${s.bestSkips} skips<br>${Math.round(s.bestDistance)} m · ${s.points} ✨` +
      (p.id === lastId ? '<br>last played' : '') + '</span>';
    b.addEventListener('click', () => { sfx.ui(); startPlayer(p.id); });
    wrap.appendChild(b);
  }
}

showPanel('loading');
requestAnimationFrame(() => requestAnimationFrame(() => {
  try {
    buildWorld();
  } catch (err) {
    panels.loading.textContent = 'Could not build the lake: ' + err.message;
    throw err;
  }
  onResize();
  buildPlayerButtons();
  showPanel('player');
  requestAnimationFrame(frame);
}));
