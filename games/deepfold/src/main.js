/* main.js — the wiring and the one frame loop.
 *
 * Everything that owns state lives in its own module; this file owns the ORDER
 * things happen in, which in a shooter is most of the feel:
 *
 *   input -> ship -> pod -> enemies -> bullets -> collisions -> terrain -> HUD
 *
 * Collisions run after every mover has finished moving, so nothing is ever
 * tested against a position half a frame old. They are all circle-vs-circle
 * against the part lists enemies.js maintains, and none of them allocate.
 *
 * The one number to know: the view is 100 world units tall, always, and
 * `layout` turns that plus the device's aspect into the left and right edges
 * everything else is written against. It is recomputed whenever the view
 * changes size, so rotating an iPad mid-run re-fits the play box instead of
 * stranding the ship against a boundary that has moved.
 */
import { CFG, layoutFor } from './config.js';
import { createView, worldToScreen } from './camera.js';
import { createBackdrop } from './background.js';
import { confettiPool } from './paper.js';
import { ramp } from './palette.js';
import { createInput } from './input.js';
import { createShip } from './ship.js';
import { createForce } from './force.js';
import { createBullets } from './bullets.js';
import { createEnemies } from './enemies.js';
import { createTerrain } from './terrain.js';
import { createWaves } from './waves.js';
import { createHud, createEndCard, createCallouts } from './hud.js';
import { createPatterns } from './patterns.js';
import { createControls } from './controls.js';
import { createGuide } from './guide.js';
import { createAudio } from './audio.js';
import { createStore } from './store.js';
import { createStates } from './states.js';

/* The HOUSE ramp. The ship, the pod, the pickups, the bullets and the end card
   are cut from this and never change: the player's own colour language has to
   survive a change of world. A STAGE's ramp dresses the backdrop, the terrain
   and the cast, and is swapped in applyStage(). */
const RAMP = CFG.stage.rampName;

/* ------------------------------------------------------------------ boot */

const gameCanvas = document.getElementById('c');
const hudCanvas = document.getElementById('hud');

/* A WebGL context is the one thing here that can fail outright — an old
   browser, a blocklisted driver, too many live contexts on the tab. Unguarded
   it throws at module scope, which leaves the start card sitting there with a
   Launch button that silently does nothing. Guarded, the player gets a
   sentence and a way back to the arcade. */
let view = null;
try {
  view = createView(gameCanvas, { background: ramp(RAMP, 0.22).getHex() });
} catch (e) {
  const dead = document.getElementById('deadCard');
  const card = document.querySelector('#overlay .card:not(#deadCard)');
  // hidden BOTH ways, so it takes both being cleared to show this
  if (dead) { dead.classList.remove('off'); dead.hidden = false; }
  if (card) card.classList.add('off');
  gameCanvas.style.display = 'none';
  hudCanvas.style.display = 'none';
  throw e;                       // nothing below this line can work without it
}
const hud = createHud(hudCanvas);
const store = createStore();
const audio = createAudio({ muted: false });

let layout = layoutFor(view.width);
let lastViewW = view.width;

/* The backdrop schedules its set pieces against the stage's own length and
   speed — a quarter, a half and three quarters of the way through — so it has
   to be told which stage it is dressing, here and on every stage change. */
let backdrop = createBackdrop(view.scene, {
  rampName: CFG.stages[0].rampName, seed: CFG.stages[0].seed,
  width: view.width, height: 100,
  stageSeconds: CFG.stages[0].seconds, scrollSpeed: CFG.stages[0].scrollSpeed,
});
const terrain = createTerrain(view.scene, {
  rampName: CFG.stages[0].rampName, stage: CFG.stages[0],
});
const bullets = createBullets(view.scene, { rampName: RAMP });
const confetti = confettiPool(view.scene, { max: CFG.fx.confettiMax });
confetti.group.position.z = 4;

let KILL_COLORS = [0.12, 0.34, 0.58, 0.82, 0.96].map((t) => ramp(CFG.stages[0].rampName, t).getHex());
const PLAYER_COLORS = [0.02, 0.2, 0.5, 1.0].map((t) => ramp(RAMP, t).getHex());

const patterns = createPatterns(view.scene, { rampName: CFG.stages[0].rampName, bullets });
const enemies = createEnemies(view.scene, {
  rampName: CFG.stages[0].rampName, bullets, patterns,
  hooks: {
    onKill: onEnemyKilled,
    onBossPhase: () => { audio.bossRoar(); toast('IT IS ANGRY'); },
    onBossDying: () => { audio.bossRoar(); },
    onBossShred: onBossShred,
    onBossDead: onBossDead,
  },
});
const waves = createWaves(view.scene, { rampName: RAMP, enemies });
const endCard = createEndCard(view.scene, { rampName: RAMP });
const callouts = createCallouts(view.scene, { rampName: RAMP });
const ship = createShip(view.scene, { rampName: RAMP, bullets });
const force = createForce(view.scene, { rampName: RAMP, bullets });

const input = createInput(gameCanvas, view, {
  onPod: podButton,
  onPause: togglePause,
  onMute: toggleMute,
  onConfirm: () => { if (states.is('over') || states.is('clear') || states.is('win')) tapEndCard(); },
});

/* ----------------------------------------------------------------- state */

let beamWanted = false;

const run = {
  stage: 0,                 // index into CFG.stages
  scrollSpeed: CFG.stages[0].scrollSpeed,
  score: 0,
  lives: CFG.ship.lives,
  infinite: false,          // the assist, as it stands right now
  usedInfinite: false,      // ... and whether it was EVER on during this run
  difficulty: store.data.difficulty,
  player: store.data.player,
  stageReached: 0,
  shake: 0,
  toast: '',
  toastLife: 0,
};

function diff() { return CFG.difficulty[run.difficulty] || CFG.difficulty.easy; }

const states = createStates({
  onEnter(phase) {
    input.setEnabled(phase === 'play' || phase === 'ready' || phase === 'dying');
    if (phase === 'menu') overlay.classList.remove('off');
    else overlay.classList.add('off');

    if (phase === 'over' || phase === 'clear' || phase === 'win') {
      audio.charge(false);
      patterns.reset();
      const p = store.playerData(run.player);
      const st = CFG.stages[run.stage];
      const next = CFG.stages[run.stage + 1];
      endCard.show(phase, {
        score: run.score,
        best: (run.usedInfinite
          ? 'INFINITE LIVES \u00b7 NOT A RECORD'
          : (run.score >= store.bestFor(run.player, run.difficulty).best ? 'NEW BEST' : 'BEST ' + store.bestFor(run.player, run.difficulty).best))
          + '  \u00b7  ' + run.player,
        sub: phase === 'win' ? 'ALL SEVEN FOLDS FLOWN'
          : phase === 'clear' ? 'NEXT: FOLD ' + (run.stage + 2) + ' \u00b7 ' + (next ? next.name.toUpperCase() : '')
            : 'FOLD ' + (run.stage + 1) + ' \u00b7 ' + st.name.toUpperCase(),
        chip: phase === 'clear' ? 'TAP FOR FOLD ' + (run.stage + 2) : 'TAP TO START AGAIN',
      });
    } else {
      endCard.hide();
    }
    /* The POD pad and the corner chips belong to a run in progress. On an end
       screen the whole screen is "tap to play again", and a live button in the
       corner of it is just something to mis-tap. */
    const inRun = phase !== 'menu' && phase !== 'over' && phase !== 'clear' && phase !== 'win';
    document.body.classList.toggle('playing', inRun);
    controls.setVisible(inRun);
  },
});

/* ------------------------------------------------------------------ chrome */

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const bestLine = document.getElementById('bestLine');
const guideEl = document.getElementById('guide');
const guide = createGuide(document.getElementById('guideBody'), { rampName: RAMP });
/* Built on the first open and never again: a dozen thumbnails' worth of work
   that most sessions never ask for. */
if (guideEl) guideEl.addEventListener('toggle', () => { if (guideEl.open) guide.build(); });

function markSelected(group, value) {
  for (const el of group) el.classList.toggle('on', el.dataset.value === value);
}
const playerBtns = Array.from(document.querySelectorAll('[data-role="player"]'));
const diffBtns = Array.from(document.querySelectorAll('[data-role="diff"]'));

playerBtns.forEach((b) => b.addEventListener('click', () => {
  run.player = b.dataset.value;
  store.setPlayer(run.player);
  markSelected(playerBtns, run.player);
  // the assist is per player, so switching pilot switches it too
  run.infinite = !!store.playerData(run.player).infinite;
  controls.setInfinite(run.infinite);
  refreshBest();
  audio.uiClick();
}));
diffBtns.forEach((b) => b.addEventListener('click', () => {
  run.difficulty = b.dataset.value;
  store.setDifficulty(run.difficulty);
  markSelected(diffBtns, run.difficulty);
  // Easy and Normal keep separate high scores, so the line has to follow the
  // selection — otherwise it quietly reports the wrong game's record.
  refreshBest();
  audio.uiClick();
}));

/* `stage` is the furthest stage REACHED — pressing Launch sets it — so it can
   never be the thing that says "cleared". That is `cleared`, and neither
   number is written down here. */
/* Easy and Normal are different games, so they keep different high scores,
   and the line follows whichever pair is selected. A score set with the assist
   on is shown beside it and is never the high score. */
function refreshBest() {
  const p = store.playerData(run.player);
  const b = store.bestFor(run.player, run.difficulty);
  const n = CFG.stages.length;
  let got = '';
  if (p.cleared >= n) got = ' \u00b7 all ' + n + ' folds flown';
  else if (p.cleared > 0) got = ' \u00b7 fold ' + p.cleared + ' cleared';
  else if (p.stage > 0) got = ' \u00b7 reached fold ' + p.stage;
  const assist = b.assisted > b.best ? ' \u00b7 ' + b.assisted + ' with infinite lives' : '';
  bestLine.textContent = 'Best ' + b.best + ' on ' + (b.key === 'normal' ? 'Normal' : 'Easy')
    + got + assist + (store.working || !store.loaded ? '' : ' \u00b7 ' + store.reason);
}

markSelected(playerBtns, run.player);
markSelected(diffBtns, run.difficulty);
refreshBest();

/* IndexedDB is asynchronous, so the game boots on defaults and the saved
   choices arrive a moment later. Launch stays disabled until they have: a
   child who beats the database to the button would otherwise play the first
   run of the session as the wrong player, on the wrong difficulty, and write
   that back. */
startBtn.disabled = true;
store.onTrouble = refreshBest;          // a refusal discovered after the write
store.ready(() => {
  run.player = store.data.player;
  run.difficulty = store.data.difficulty;
  audio.setMuted(store.data.mute);
  markSelected(playerBtns, run.player);
  markSelected(diffBtns, run.difficulty);
  refreshBest();
  startBtn.disabled = false;
});

startBtn.addEventListener('click', () => { audio.ensure(); audio.uiClick(); startRun(); });

/* Four buttons, all of them firing on pointerdown and all of them capturing
   their own pointer — see controls.js for why the pod button used to be a coin
   toss. Nothing that starts on this pad can ever become a ship drag. */
const controls = createControls(document.body, {
  onPod: podButton,
  /* The beam is a HELD button, so it is not queued — it is simply remembered
     as wanted, and the charge starts or stops as the ship becomes able. A
     press held through a respawn therefore begins charging the instant the
     ship is back, and a release during one still lets go. */
  onBeamDown: () => { beamWanted = true; },
  onBeamUp: () => { beamWanted = false; },
  onPause: togglePause,
  onInfinite: toggleInfinite,
});

// A tap anywhere restarts from an end screen, and un-pauses from a pause.
gameCanvas.addEventListener('pointerdown', () => {
  if (states.is('over') || states.is('clear') || states.is('win')) tapEndCard();
  else if (states.is('paused')) togglePause();
}, true);

/* When a control can actually do something.
 *
 * THE RULE, so it is written down rather than guessed at:
 *   ready, play   it acts
 *   dying         it is QUEUED and fires the moment the ship is back. A press
 *                 a child has made must never simply evaporate.
 *   paused        refused, and the button says so by being disabled
 *   menu, over, clear, win   the pad is not on screen at all
 */
function canAct() { return states.is('play') || states.is('ready'); }

let queuedPod = false;

function flushQueued() {
  if (!queuedPod) return;
  queuedPod = false;
  controls.setPodPending(false);
  podButton();
}

function podButton() {
  if (!canAct()) {
    // a press during the respawn flash is remembered, not dropped
    if (states.is('dying')) { queuedPod = true; controls.setPodPending(true); }
    return;
  }
  const what = force.toggle(ship);
  audio.podShot();
  controls.setPodOut(force.isDetached());
  if (what === 'launch') {
    toast('POD OUT');
    // the labels have done their job the moment it is thrown
    callouts.hide();
  }
}

/* The pod can also come back on its own, so what the button says is checked
   every frame and written only when it actually changes. */
function syncPodBtn() { controls.setPodOut(force.isDetached()); }

/* The assist. Obvious, instantly reversible, and remembered per player — one
   brother wants it and the other does not. A run with it on still records its
   score, but in `assisted`, never as the high score. */
function toggleInfinite() {
  run.infinite = !run.infinite;
  if (run.infinite) run.usedInfinite = true;     // sticky: the whole run is flagged
  controls.setInfinite(run.infinite);
  store.setInfinite(run.player, run.infinite);
  toast(run.infinite ? 'INFINITE LIVES ON' : 'INFINITE LIVES OFF');
}

function togglePause() {
  controls.setPaused(states.is('play'));
  /* The tune keeps playing through a pause. It is background level and it is
     the only thing telling a child who has walked off that the game is still
     there; stopping it makes a pause feel like a crash. */
  if (states.is('play')) { states.set('paused'); audio.charge(false); }
  else if (states.is('paused')) states.set('play');
}

/* There is no mute button and there is not going to be one: one tune, quiet,
   looping, and the tab being in front of you is the only control. The M key
   survives as an undocumented escape hatch — it is not in the key list on the
   start card — and it takes the theme with it as well as the effects. */
function toggleMute() {
  audio.ensure();
  audio.setMuted(!audio.muted);
  store.setMute(audio.muted);
}

/* -------------------------------------------------------------- run control */

/* Dress the world for a stage: its ramp on the backdrop, the terrain and the
 * cast, its canyon shape, its scroll speed.
 *
 * Every actor has its colours baked into its materials, so a change of ramp
 * means cutting the art again — the backdrop, the terrain chunks and all
 * fifty-odd pooled enemies. That is the same work as booting and it costs the
 * same few hundred milliseconds, which is why it happens with the stage-clear
 * card on screen and never during play. The ship, the pod and the pickups are
 * NOT recut: they are the player's own colours and they stay put.
 */
function applyStage(i) {
  const st = CFG.stages[i];
  run.stage = i;
  run.scrollSpeed = st.scrollSpeed;
  view.setBackground(ramp(st.rampName, 0.22).getHex());
  backdrop.dispose();
  backdrop = createBackdrop(view.scene, {
    rampName: st.rampName, seed: st.seed, width: view.width, height: 100,
    stageSeconds: st.seconds, scrollSpeed: st.scrollSpeed,
  });
  terrain.rebuild(st, st.rampName, diff().pinchScale);
  patterns.reset();
  patterns.setRamp(st.rampName);
  terrain.reset(layout);
  enemies.setRamp(st.rampName);
  KILL_COLORS = [0.12, 0.34, 0.58, 0.82, 0.96].map((t) => ramp(st.rampName, t).getHex());
  bullets.clear();
  confetti.clear();
  waves.start(i);
}

function beginStage(i, keepScore) {
  applyStage(i);
  run.stageReached = Math.max(run.stageReached, i + 1);
  if (!keepScore) {
    run.score = 0;
    run.lives = CFG.ship.lives + diff().lives;
  }
  run.shake = 0;
  run.toastLife = 0;
  ship.reset(layout.shipXMin * 0.55, 0);
  ship.setVisible(true);
  force.reset(ship);
  syncPodBtn();
  controls.setInfinite(run.infinite);
  controls.setPaused(false);
  /* The fold opens: the buttons arrive, and on the early folds they say what
     they do. It runs alongside the READY banner rather than against it — the
     banner is centre screen and the slips are at the edges — and the labels
     outlast it by a beat so they are still there when the stage starts
     moving. Nothing on screen cancels it: pressing one of the two buttons
     collapses them, and that is the only thing that does. */
  const foldNo = i + 1;
  const withHints = foldNo <= CFG.intro.hintUntilFold;
  controls.intro({
    withHints,
    hold: foldNo === 1 ? CFG.intro.hintHold : CFG.intro.hintHoldLater,
  });
  input.setEnabled(true);
  states.set('ready', { force: true });
  states.after(1.5, () => states.set('play'));
}

function startRun() {
  audio.ensure();
  queuedPod = false;
  beamWanted = false;
  enemies.clear();
  run.stageReached = 0;
  run.infinite = !!store.playerData(run.player).infinite;
  run.usedInfinite = run.infinite;
  beginStage(0, false);
  /* Once per player, ever. The pod is the best thing in the game and it is a
     circle that says nothing about itself, so the first run a player flies
     gets two paper labels naming it and the button that throws it. */
  if (store.firstTime(run.player, 'sawPodHint')) callouts.show();
  else callouts.hide();
}

/* What a tap on an end card does. A stage clear rolls straight into the next
   fold with the score and the lives intact. Anything that ENDS a run goes back
   to the start card instead of straight into another go: that is the only
   place to change who is flying or which difficulty they are on, and after
   dying is exactly when a child wants to. */
function tapEndCard() {
  if (states.is('clear')) {
    enemies.clear();
    beginStage(run.stage + 1, true);
    return;
  }
  toMenu();
}

function toMenu() {
  queuedPod = false;
  beamWanted = false;
  controls.skipIntro();
  enemies.clear();
  bullets.clear();
  confetti.clear();
  patterns.reset();
  waves.clear();
  callouts.hide();
  input.setEnabled(false);
  refreshBest();
  states.set('menu', { force: true });
}

function endRun(kind) {
  audio.charge(false);
  const cleared = kind === 'win' ? CFG.stages.length : (kind === 'clear' ? run.stage + 1 : 0);
  const saved = store.record(run.player, run.score, run.stageReached, cleared,
    run.difficulty, run.usedInfinite);
  if (!saved) store.reason = store.reason || 'the score could not be saved';
  refreshBest();
  states.set(kind);
}

function toast(text) { run.toast = text; run.toastLife = 1.6; }

/* -------------------------------------------------------------- the events */

function onEnemyKilled(e) {
  run.score += e.score;
  confetti.burst(e.x, e.y, {
    count: e.type === 'gunship' || e.type === 'jelly' ? CFG.fx.bigBurst : CFG.fx.killBurst,
    colors: KILL_COLORS, speed: 34, z: 4, size: 1.7,
  });
  audio.pop(e.type === 'gunship' || e.type === 'jelly');
  if (e.carries && Math.random() < CFG.powerups.dropChance * diff().dropChance) {
    waves.dropPowerup(e.x, e.y, e.carries);
  }
}

function onBossShred(e, stage) {
  confetti.burst(e.x + (Math.random() - 0.5) * 18, e.y + (Math.random() - 0.5) * 18, {
    count: CFG.fx.bossBurst, colors: KILL_COLORS, speed: 52, z: 4, size: 2.4, life: 1.3,
  });
  audio.pop(true);
  run.shake = CFG.fx.shakeOnHit * 2;
}

function onBossDead(e) {
  run.score += e.score;
  const last = run.stage >= CFG.stages.length - 1;
  confetti.burst(e.x, e.y, {
    count: CFG.fx.bossBurst, colors: KILL_COLORS, speed: 70, z: 4, size: 3, life: 1.8,
  });
  if (last) {
    // one more, bigger, for finishing the whole thing
    confetti.burst(0, 0, { count: CFG.fx.bossBurst, colors: KILL_COLORS, speed: 90, z: 4, size: 3.4, life: 2.4 });
  }
  endRun(last ? 'win' : 'clear');
}

function killPlayer() {
  const what = ship.hit();
  if (what === 'safe') return;
  if (what === 'shield') {
    confetti.burst(ship.x, ship.y, { count: 14, colors: PLAYER_COLORS, speed: 30, z: 4, size: 1.4 });
    audio.pop(false);
    toast('SHIELD GONE');
    return;
  }
  confetti.burst(ship.x, ship.y, {
    count: CFG.fx.playerBurst, colors: PLAYER_COLORS, speed: 46, z: 4, size: 2.2, life: 1.2,
  });
  audio.hit();
  audio.charge(false);
  run.shake = CFG.fx.shakeOnHit * 3;
  ship.setVisible(false);
  ship.clearPowers();
  if (!run.infinite) run.lives--;
  states.set('dying');
  states.after(CFG.ship.respawnDelay, () => {
    if (!run.infinite && run.lives <= 0) { endRun('over'); return; }
    // Respawn where it died. No checkpoint rewind: losing thirty seconds of
    // progress is the kind of punishment that ends the session for a seven
    // year old, and the invulnerable flash is enough to get clear on.
    ship.reset(ship.x, Math.max(-30, Math.min(30, ship.y)), false);
    ship.setVisible(true);
    force.reset(ship);
    syncPodBtn();
    /* BACK TO PLAY. Nothing else did this, and the run stayed in `dying` for
       good after the first death: the pod and beam buttons were refused for
       the rest of the run (which is the "works sometimes" Dan reported), and
       the terrain collision — which only runs while `playing` — stopped, so
       the ship could fly through the canyon walls. */
    states.set('play');
    flushQueued();
  });
}

/* ---------------------------------------------------------------- collisions */

function hit2(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

/* Parts are tested LAST FIRST: specific parts are authored after general ones,
   so walking backwards means "the smallest thing you actually hit wins".
 *
 * The boss needs more than that. Its weak point sits in the MIDDLE of a
 * seventeen-unit hull, so a shot that dies on the first thing it touches can
 * never reach the eye and the fight is unwinnable. So a player shot SINKS INTO
 * the hull — one fifth damage, once, marked `spent` so it cannot grind the
 * same hull twice — and keeps going. Only the glowing core stops a shot, and
 * only the core really hurts. That is also exactly what it looks like.
 */
function playerShotsVsEnemies(shots, radius) {
  for (let i = 0; i < shots.length; i++) {
    const b = shots[i];
    if (!b.alive) continue;
    for (let j = 0; j < enemies.all.length; j++) {
      const e = enemies.all[j];
      if (!e.alive || e.dying > 0) continue;

      if (e.isBoss) {
        if (hit2(b.x, b.y, radius, e.px[1], e.py[1], e.pr[1])) {
          enemies.damage(e, b.dmg, 1);
          audio.bossHit();
          b.alive = false;
          break;
        }
        if (!b.spent && hit2(b.x, b.y, radius, e.px[0], e.py[0], e.pr[0])) {
          enemies.damage(e, b.dmg, 0);
          b.spent = true;
        }
        continue;
      }

      let landed = false;
      for (let k = e.pn - 1; k >= 0; k--) {
        if (!hit2(b.x, b.y, radius, e.px[k], e.py[k], e.pr[k])) continue;
        enemies.damage(e, b.dmg, k);
        landed = true;
        break;
      }
      if (landed) { b.alive = false; break; }
    }
  }
}

function beamVsEnemies() {
  const beam = bullets.beam;
  if (!beam.active) return;
  const half = beam.height * 0.5;
  for (let j = 0; j < enemies.all.length; j++) {
    const e = enemies.all[j];
    if (!e.alive || e.dying > 0) continue;
    for (let k = e.pn - 1; k >= 0; k--) {          // weak point first, as above
      const r = e.pr[k];
      if (e.px[k] + r < beam.x0 || e.px[k] - r > beam.x0 + beam.len) continue;
      if (Math.abs(e.py[k] - beam.y) > half + r) continue;
      enemies.damage(e, beam.damage, k, beam.stamp);
      break;
    }
  }
}

function podVsEnemies() {
  // Only a pod that is out there fights. Docked, it is a shield and nothing
  // else — a permanent melee bubble round the ship would make it the answer
  // to every wave in the game.
  if (!force.isDetached() || force.contactTimer > 0) return;
  for (let j = 0; j < enemies.all.length; j++) {
    const e = enemies.all[j];
    if (!e.alive || e.dying > 0) continue;
    for (let k = e.pn - 1; k >= 0; k--) {          // weak point first, as above
      if (!hit2(force.x, force.y, force.hitRadius, e.px[k], e.py[k], e.pr[k])) continue;
      enemies.damage(e, CFG.force.contactDamage, k);
      force.contactTimer = CFG.force.contactCooldown;
      confetti.burst(force.x, force.y, { count: 6, colors: KILL_COLORS, speed: 22, z: 4, size: 1.2 });
      return;
    }
  }
}

function enemyShotsVsPlayer() {
  const shots = bullets.enemy;
  const br = bullets.radius.enemy;
  for (let i = 0; i < shots.length; i++) {
    const b = shots[i];
    if (!b.alive) continue;
    // the pod eats anything it touches, docked or parked — that is the point
    if (hit2(b.x, b.y, br, force.x, force.y, force.hitRadius)) {
      b.alive = false;
      confetti.burst(b.x, b.y, { count: 4, colors: PLAYER_COLORS, speed: 18, z: 4, size: 1 });
      continue;
    }
    if (!ship.alive || ship.invuln > 0) continue;
    if (hit2(b.x, b.y, br, ship.x, ship.y, ship.radius)) {
      b.alive = false;
      killPlayer();
      return;
    }
  }
}

function enemiesVsPlayer() {
  if (!ship.alive || ship.invuln > 0) return;
  for (let j = 0; j < enemies.all.length; j++) {
    const e = enemies.all[j];
    if (!e.alive || e.dying > 0) continue;
    for (let k = 0; k < e.pn; k++) {
      if (!hit2(ship.x, ship.y, ship.radius, e.px[k], e.py[k], e.pr[k] * 0.85)) continue;
      if (!e.isBoss) enemies.damage(e, 4, k);
      killPlayer();
      return;
    }
  }
}

function pickupsVsPlayer() {
  if (!ship.alive) return;
  for (let i = 0; i < waves.pickups.length; i++) {
    const p = waves.pickups[i];
    if (!p.alive) continue;
    if (!hit2(ship.x, ship.y, CFG.ship.len * 0.5, p.x, p.y, CFG.powerups.radius)) continue;
    waves.takePowerup(p);
    ship.addPower(p.kind);
    run.score += CFG.powerups.score;
    audio.power();
    toast(p.kind);
    confetti.burst(p.x, p.y, { count: 12, colors: KILL_COLORS, speed: 26, z: 4, size: 1.4 });
  }
}

/* ------------------------------------------------------------- the frame */

const bounds = { left: 0, right: 0, top: 52, bottom: -52 };
/* Two context objects, written in place every frame. Building these fresh is
   two allocations per frame, which is two more than a shooter can afford on an
   iPad once the collector notices. */
const enemyCtx = {
  layout: null, ship, terrain, diff: null,
  scrollSpeed: CFG.stage.scrollSpeed, fireScale: 1,
  /* The boss's pattern library fires and summons through this same object:
     `boss` is filled in by enemies.js before it runs a script step. */
  boss: null, spawn: (type, o) => enemies.spawn(type, o),
};
const calloutCtx = { podX: 0, podY: 0, view };
const waveCtx = { layout: null, diff: null };
const hudState = {
  phase: 'menu', score: 0, lives: 0, progress: 0, charge: 0, shipScreen: { x: 0, y: 0 },
  bossActive: false, bossHp: 1, bossPhase2: false, muted: false, player: '',
  bestLine: '', fade: 1, time: 0, toast: '', toastLife: 0, readyText: '',
};

let last = performance.now();
let shotSoundTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  // A tab that was in the background comes back with a huge dt; stepping the
  // whole world by it teleports every enemy through the ship.
  if (dt > 0.05) dt = 0.05;
  if (dt <= 0) dt = 1 / 60;

  if (view.width !== lastViewW) {
    lastViewW = view.width;
    layout = layoutFor(view.width);
    backdrop.setExtent(view.width);
    hud.resize();
  }

  const phase = states.update(dt);
  const playing = phase === 'play';
  const living = playing || phase === 'ready';

  input.update(living ? dt : 0);

  // charge whine follows the input, and is silenced by every exit from play
  if (living && input.charging) audio.charge(true, input.charge);
  else if (!living || !input.charging) audio.charge(false);

  if (phase !== 'paused' && phase !== 'menu') {
    backdrop.update(dt, run.scrollSpeed);
    terrain.update(dt, run.scrollSpeed, layout);
  } else if (phase === 'menu') {
    backdrop.update(dt, run.scrollSpeed * 0.35);
  }

  if (living || phase === 'dying') {
    const d = diff();

    if (ship.alive) {
      const before = ship.fireTimer;
      ship.update(dt, input, layout, d);
      if (ship.fireTimer > before) {
        shotSoundTimer -= dt;
        if (shotSoundTimer <= 0) { audio.shot(); shotSoundTimer = 0.05; }
      }
      const power = input.consumeBeam();
      if (power > 0) {
        bullets.fireBeam(ship.x + CFG.ship.muzzleX, ship.y, power, layout.halfW + 10);
        audio.beam(power);
        run.shake = CFG.fx.shakeOnHit * 0.7;
      }
    }

    force.update(dt, ship, layout, d, run.scrollSpeed);
    waveCtx.layout = layout; waveCtx.diff = d;
    waves.update(dt, waveCtx);
    enemyCtx.layout = layout; enemyCtx.diff = d;
    enemyCtx.scrollSpeed = run.scrollSpeed;
    enemyCtx.fireScale = waves.fireScale;
    enemies.update(dt, enemyCtx);

    /* A boss is forty units across and stage two's canyon closes to half that,
       so the walls draw back while it is on the field and come in again after. */
    terrain.setOpen(waves.phase === 'boss' ? CFG.stages[run.stage].terrain.bossOpen : 0);

    bounds.left = -layout.halfW - CFG.bullets.cullMargin;
    bounds.right = layout.halfW + CFG.bullets.cullMargin;
    bullets.update(dt, bounds, ship);

    playerShotsVsEnemies(bullets.player, bullets.radius.player);
    playerShotsVsEnemies(bullets.pod, bullets.radius.pod);
    beamVsEnemies();
    podVsEnemies();
    enemyShotsVsPlayer();
    enemiesVsPlayer();
    pickupsVsPlayer();

    if (ship.alive && playing) {
      const wallR = ship.radius * CFG.terrain.shipRadiusScale;
      if (terrain.hits(ship.x, ship.y, wallR)
        || terrain.hitsObstacle(ship.x, ship.y, wallR)
        || patterns.hazardHits(ship.x, ship.y, ship.radius * 1.6)) {
        killPlayer();
      }
    }
  }

  confetti.update(dt);
  endCard.update(dt);
  if (callouts.isOn()) {
    // `living`, not `playing`: the labels are up through the READY count too,
    // so they fade in from the first frame they are visible on rather than
    // sitting at full opacity until the stage starts moving.
    if (living) {
      calloutCtx.podX = force.x; calloutCtx.podY = force.y;
      callouts.update(dt, calloutCtx);
    }
    if (phase === 'over' || phase === 'clear' || phase === 'win' || phase === 'menu') callouts.hide();
  }
  syncPodBtn();

  // camera shake — the ortho camera is the only thing in the scene that moves
  if (run.shake > 0) {
    run.shake = Math.max(0, run.shake - CFG.fx.shakeDecay * dt);
    view.camera.position.x = (Math.random() - 0.5) * run.shake;
    view.camera.position.y = (Math.random() - 0.5) * run.shake;
  } else if (view.camera.position.x !== 0) {
    view.camera.position.x = 0;
    view.camera.position.y = 0;
  }

  if (run.toastLife > 0) run.toastLife -= dt;

  // ---- the readout
  hudState.phase = phase;
  hudState.score = run.score;
  hudState.lives = Math.max(0, run.lives);
  hudState.progress = waves.progress;
  /* The beam follows what the thumb is asking for AND whether the ship can
     answer, every frame — so neither a press nor a release can be swallowed by
     a respawn. */
  input.holdBeam(beamWanted && canAct());
  /* Disabled is for a control that genuinely cannot act and is not queuing
     either: that is `paused`. During `dying` the buttons stay live, because a
     press then is taken and honoured. */
  controls.setEnabled(!states.is('paused'));
  hudState.charge = input.charging ? input.charge : 0;
  hudState.infinite = run.infinite;
  controls.setCharge(hudState.charge, input.charging && input.charge >= 1);
  hudState.muted = audio.muted;
  hudState.player = run.player;
  hudState.fade = states.fade(0.6);
  hudState.time = states.time;
  hudState.toast = run.toast;
  hudState.toastLife = run.toastLife;
  hudState.readyText = states.time < 1.0
    ? 'Fold ' + (run.stage + 1) + ' \u00b7 ' + CFG.stages[run.stage].name
    : 'Go!';
  hudState.stageLabel = 'FOLD ' + (run.stage + 1);
  hudState.bossLabel = enemies.boss.label;
  hudState.bossActive = enemies.boss.alive;
  hudState.bossHp = enemies.boss.alive ? Math.max(0, enemies.boss.hp / enemies.boss.maxHp) : 0;
  hudState.bossPhase2 = enemies.boss.phase2;
  const p = store.playerData(run.player);
  hudState.bestLine = 'Best ' + p.best + (store.working ? '' : ' · not saved');
  if (hudState.charge > 0) worldToScreen(view, ship.x, ship.y, 0, hudState.shipScreen);
  hud.draw(hudState);

  view.render();
}

/* A WebGL context is a scarce, process-wide resource — a browser will hand out
 * something like sixteen across all tabs and then start refusing. Dropping the
 * page's reference is not enough on its own: three's dispose() frees what the
 * renderer allocated, and forceContextLoss() is what actually hands the
 * context back. Reloading a page that skips this eats one each time, which is
 * exactly what happened to the coordinator testing the start screen.
 */
function releaseGL() {
  try {
    if (!view || !view.renderer) return;
    view.renderer.dispose();
    if (view.renderer.forceContextLoss) view.renderer.forceContextLoss();
  } catch (e) { /* going away anyway */ }
}
window.addEventListener('pagehide', releaseGL);

/* The theme.
 *
 * Nothing is fetched and nothing plays until the first pointer, touch or key
 * anywhere on the document — which is also the earliest moment a browser would
 * allow it, so no sound is lost by waiting. There is no fade: the file is
 * already at background level, six decibels down, so a ramp would be a ramp
 * for its own sake. `loop` is on the element rather than an `ended` handler,
 * because the browser wraps cleanly and an `ended` handler does not.
 */
function music() {
  const el = document.getElementById('theme');
  if (!el) return;
  audio.attachTheme(el);                 // so the M key can reach it too
  const EVENTS = ['pointerdown', 'touchstart', 'keydown'];
  let playing = false;

  const arm = () => EVENTS.forEach((e) => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach((e) => document.removeEventListener(e, start, true));

  function start() {
    disarm();
    el.volume = CFG.audio.themeLevel;
    el.muted = audio.muted;
    let p;
    try { el.load(); p = el.play(); } catch (e) { arm(); return; }
    // Refused means the browser wanted a different gesture: wait for the next
    // one rather than sitting there silent for the rest of the session.
    if (p && p.then) p.then(() => { playing = true; }, arm);
    else playing = true;
  }

  /* Tracked with our OWN flag, not el.paused: once we have paused it for a
     hidden tab those two say the same thing, and reading el.paused here leaves
     the music off for good after the first time you tab away. */
  document.addEventListener('visibilitychange', () => {
    if (!playing) return;
    if (document.hidden) el.pause();
    else { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
  });

  arm();
}
music();

/* One debug handle. Everything the game owns, reachable from the browser
   console as `Deepfold.enemies`, `Deepfold.run.score` and so on — which is
   how you tune a wave without a rebuild, and how a headless harness checks
   that a stage actually got where it says it got. */
window.Deepfold = {
  CFG, run, states, view, ship, force, bullets, enemies, waves, terrain, store, audio, input, endCard,
  callouts, guide, patterns, controls,
  /* `Deepfold.goStage(2)` drops straight into a stage with the current score
     and lives — which is how you look at stage three's crossfire without
     flying stages one and two first. */
  goStage: (n) => { enemies.clear(); beginStage(Math.max(0, Math.min(CFG.stages.length - 1, (n | 0) - 1)), true); },
  /* `Deepfold.goBoss()` clears the field and starts this stage's boss now —
     the way to look at a fire pattern without flying the two minutes in front
     of it. Shortening the stage clock does NOT do this: the tidy route to the
     boss also waits for every wave row to have been dispatched and drained, so
     a shortened stage still takes seconds + bossDeadline to get there. */
  goBoss: () => {
    enemies.clear();
    bullets.clear();
    patterns.reset();
    waves.callBoss(layout, diff());
  },
};

/* The Launch button is enabled by store.ready() above, not here: the pools are
   already built by the time this line runs, but the save is not yet read. */
states.set('menu', { force: true });
requestAnimationFrame(frame);
