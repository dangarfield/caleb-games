// Bootstrap: load assets, wire the start button, run the loop.
import * as THREE from 'three';
import { CAMERA_Y_EASE, DT_SMOOTHING, FOCUS_HEIGHT_LOCAL, PLAYER_FOOT_DROP, PLAYER_PROBE_OFFSET, PLAYER_RADIUS, RANGE, RIDER_HEIGHT_LOCAL, START, VERSION, state } from './config.js';
import { scene, renderer, view, orthoCamera, planCamera, controls, orbitCamera, dirLight, ground, gridHelper, updateOrthoCamera, updatePlanCamera, syncViewportSize, frameOrthoOn, chooseCamera } from './scene.js';
import { quality } from './quality.js';
import { loadBoy, loadLevel } from './assets.js';
import { patchLevel } from './patches.js';
import { Player } from './player.js';
import { Papers } from './papers.js';
import { Terrain } from './terrain.js';
import { Colliders } from './collision.js';
import { Scoring } from './scoring.js';
import { Plan, loadView, saveViewNow, saveViewSoon } from './plan.js';
import { Planner } from './planner.js';
import { PlannerUI } from './planner-ui.js';
import { Enemies } from './enemies.js';
import { Confetti } from './confetti.js';
import { Crowd } from './crowd.js';
import { input } from './input.js';
import { buildGui, buildAnimationGui, refreshAll, refreshLive, toggleGui } from './gui.js';
import { Ui } from './ui.js';
import { Session } from './session.js';
import { Mailboxes } from './mailboxes.js';
import { loadDays } from './days.js';

let player = null;
let level = null;
const papers = new Papers(scene);
const terrain = new Terrain();
const colliders = new Colliders();
const confetti = new Confetti(scene);
const crowd = new Crowd(scene);
const ui = new Ui();
const mailboxes = new Mailboxes();
const scoring = new Scoring(colliders, papers, confetti);
const plan = new Plan().load();

// Come back to wherever the planner was last looking.
const savedView = loadView();
if (savedView && Number.isFinite(savedView.plannerX)) {
    state.plannerX = Math.min(RANGE.worldX[1], Math.max(RANGE.worldX[0], savedView.plannerX));
}
let lastSavedPlannerX = state.plannerX;
addEventListener('pagehide', () => saveViewNow({ plannerX: state.plannerX }));
const planner = new Planner(scene, plan, renderer);
const plannerUI = new PlannerUI(plan);
const enemies = new Enemies(scene, colliders);
planner.camera = planCamera;
plan.onChange = () => { planner.refresh(); plannerUI.render(); };
planner.refresh();

// The run itself: modes, lives, papers, days, and the menu.
const session = new Session({
    getPlayer: () => player,
    papers, scoring, enemies, planner, plan, ui,
    finishX: () => crowd.finishX,
});

// Planner mode is a design view: top-down, nobody riding, plan boxes shown.
// Leaving it drops back to the menu, which rides itself in the background.
export function setPlanner(on) {
    state.planner = on;
    chooseCamera();
    updatePlanCamera();
    plannerUI.setVisible(on);
    ui.setHudVisible(false);
    ui.closePanel();
    if (on) {
        state.mode = 'boot';
        state.riding = false;
        state.paused = false;
        session.stopAttract();
        enemies.clear();
    } else if (player) {
        session.toHome();
    }
    planner.setVisible(on || state.showPlan);
    planner.refresh();
}

buildGui({
    getPlayer: () => player,
    getLevel: () => level,
    papers,
    resetRun: () => { if (player) session.toHome(); refreshAll(); },
    colliders,
    scene,
    crowd,
    setPlanner,
    updatePlanCamera,
});

// A crash stops the run and offers a restart. Collision-detected crashes route
// through the player so the UI only has to listen in one place.
scoring.onCrash = why => player.crash(why);
scoring.onPickup = () => session.refillPapers();

// Hits while crashing is switched off. The menu's demo ride has it off by
// design, and it clips things constantly, so it says nothing.
function onNearMiss(why) {
    if (session.attract) return;
    scoring.last = `no-death: ${why}`;
    console.log('no-death:', why);
}

function onCrashed(why) {
    scoring.last = why;
    console.log('crash:', why);
    session.crashed(why);
}

// Both halves have to be in before the menu can ride behind itself, and the
// week's plans have to be in before anything spawns from one.
let daysReady = false;
loadDays().then(days => {
    session.days = days;
    daysReady = true;
    console.log('Day plans:', days.map((d, i) => `${d ? d.label : 'day' + (i + 1)} ${d ? d.entities.length : 'MISSING'}`).join(', '));
    ready();
});

// Reveal the canvas: black until here, then a fade to whatever is on screen.
// A beat first, so the menu's panel and the demo ride are already up rather
// than fading in from a blank street — on a timer rather than a frame callback,
// because requestAnimationFrame does not run in a background tab and the game
// would sit there invisible until someone looked at it.
function reveal() {
    setTimeout(() => renderer.domElement.classList.add('ready'), 60);
}

function ready() {
    if (!player || !level || !daysReady || state.mode !== 'boot' || state.planner) return;
    session.toHome();
    reveal();
}

// --- Assets ---
loadBoy().then(boy => {
    scene.add(boy.model);
    player = new Player(boy);
    player.terrain = terrain;
    player.colliders = colliders;
    player.onCrashed = onCrashed;
    player.onNearMiss = onNearMiss;
    player.mixer.timeScale = state.animationSpeed;
    buildAnimationGui(player);
    refreshAll();
    console.log('Paperboy loaded');
    ready();
}).catch(e => { console.error('Error loading paperboy:', e); reveal(); });

loadLevel().then(l => {
    level = l;
    scene.add(l.model);
    // Mend the modelling gaps (see patches.js) before anything indexes the level.
    patchLevel(l.model);
    colliders.build(l.model);
    terrain.set(l.model, colliders.terrainMeshes);
    console.log('colliders by role:', colliders.counts,
        `| terrain meshes ${colliders.terrainMeshes.length}`,
        `| signs paired to targets ${colliders.signsPaired}`);
    if (l.panorama) l.panorama.visible = state.showWarpedPanorama;
    console.log(`Finish crowd: ${crowd.build(l.model)} fans`);
    crowd.setVisible(state.showCrowd);
    console.log(`Mailbox day labels: ${mailboxes.build(l.model)}`);
    // The fallback ground is co-planar with the road; drop it now there's a level.
    ground.visible = gridHelper.visible = false;
    state.showGround = state.showGrid = false;
    ready();
    refreshAll();
    console.log('Level loaded', l.panorama ? `(panorama: ${l.panorama.name})` : '');
}).catch(e => { console.error('Error loading level:', e); reveal(); });

// Console handle for poking at things: __pb.state, __pb.player, __pb.papers
// Per-block frame cost, for finding jank. __pb.perf.report() averages and resets.
const perf = { n: 0, sim: 0, ray: 0, gui: 0, render: 0, worstFrame: 0, calls: 0, tris: 0,
    report() {
        const n = Math.max(1, this.n);
        const r = { frames: this.n, simMs: +(this.sim / n).toFixed(2), rayMs: +(this.ray / n).toFixed(2),
            guiMs: +(this.gui / n).toFixed(2), renderMs: +(this.render / n).toFixed(2),
            worstFrameMs: +this.worstFrame.toFixed(2), drawCalls: this.calls, triangles: this.tris };
        this.n = this.sim = this.ray = this.gui = this.render = this.worstFrame = 0;
        return r;
    } };

console.log(`Paperboy viewer ${VERSION}`);
window.__pb = { version: VERSION, state, papers, scene, crowd, ui, session, mailboxes, orthoCamera, renderer, terrain, colliders, scoring, confetti, plan, planner, plannerUI, enemies, perf, frame, setPlanner,
    get player() { return player; }, get level() { return level; } };

// --- Loop ---
const clock = new THREE.Clock();
let frames = 0;
// The first couple of seconds of actual riding decide whether this machine can
// keep up; if it cannot, the detail level drops itself once and remembers.
let autoFrames = 0;
let autoMs = 0;
const _focus = new THREE.Vector3();
let camY = START.y;
let dtSmooth = 1 / 60;

function frame(dt) {
    const t0 = performance.now();
    syncViewportSize();

    if (input.consumeGui()) toggleGui();
    if (input.consumeEditor()) { setPlanner(!state.planner); refreshAll(); }
    // Esc is the same as the pause button, and gets you out of a panel too.
    if (input.consumePause()) {
        if (state.mode === 'paused') session.resume();
        else if (state.mode === 'playing') session.pause();
        else state.paused = !state.paused;
    }

    if (player && !state.paused) {
        player.mixer.update(dt);
        if (input.consumeJump()) player.jump();
        player.update(dt, session.rideInput(dt, input));
        if (input.consumeThrow() && state.riding) {
            if (!session.canThrow()) ui.noPapers();
            else {
                const t = player.throwPaper();
                if (t) { papers.spawn(t.position, t.direction); session.spendPaper(); }
            }
        }
    }
    if (!state.paused) {
        session.update(dt);
        papers.update(dt);
        confetti.update(dt);
        crowd.update(dt, state.planner ? state.plannerX : state.boyPosition.x, confetti);
        if (state.riding || enemies.live.length) enemies.update(dt, state.boyPosition.x);
        if (state.collisions && player && colliders.all.length) scoring.update(dt, player);
    }

    if (state.planner) {
        updatePlanCamera();
        if (state.plannerX !== lastSavedPlannerX) {
            lastSavedPlannerX = state.plannerX;
            saveViewSoon({ plannerX: state.plannerX });
        }
    }
    else if (state.followPlayer && player) {
        // Follow forward progress only: the focus keeps the boy's X but the
        // start Z, so steering still moves him across the frame. Height is
        // tracked on a slow filter so kerbs don't bob the view.
        camY += (state.boyPosition.y - camY) * Math.min(1, dt / CAMERA_Y_EASE);
        _focus.set(state.boyPosition.x, camY + FOCUS_HEIGHT_LOCAL * state.boyScale, START.z);
        frameOrthoOn(_focus, state.frameAnchor);
    }

    if (state.showColliders) {
        // Both probes, so the drawing matches what is actually tested.
        const p = state.boyPosition;
        const yaw = THREE.MathUtils.degToRad(state.boyRotationY);
        const fx = Math.sin(yaw) * PLAYER_PROBE_OFFSET;
        const fz = Math.cos(yaw) * PLAYER_PROBE_OFFSET;
        const bottom = p.y - PLAYER_FOOT_DROP;
        const top = p.y + RIDER_HEIGHT_LOCAL * state.boyScale;
        colliders.setPlayerBounds(0, p.x + fx, p.z + fz, PLAYER_RADIUS, bottom, top);
        colliders.setPlayerBounds(1, p.x - fx, p.z - fz, PLAYER_RADIUS, bottom, top);
    }

    // Keep the shadow frustum where we are looking (see scene.js) — the boy
    // normally, but the plan view when planning, or it would be unlit.
    const litX = state.planner ? state.plannerX : state.boyPosition.x;
    const litZ = state.planner ? state.plannerCentreZ : state.boyPosition.z;
    dirLight.position.set(litX + 10, 20, litZ + 10);
    dirLight.target.position.set(litX, 0, litZ);

    // scene.js turns shadowMap.autoUpdate off, so the map only refreshes when
    // it is asked to. Every frame while anyone is riding: the light travels
    // with the boy, so a map one frame old puts his shadow a visible step
    // behind the bike, which looks like the animation is broken. The planner's
    // view sits still, so there it can be throttled.
    frames++;
    const shadowEveryN = state.planner ? Math.max(1, quality.preset.shadowEveryN) : 1;
    if (frames % shadowEveryN === 0) renderer.shadowMap.needsUpdate = true;

    if (view.activeCamera === orbitCamera) controls.update();

    ui.setScore(state.score);
    mailboxes.setDay(state.day);

    const t1 = performance.now();
    refreshLive(dt);
    const t2 = performance.now();
    renderer.render(scene, view.activeCamera);
    const t3 = performance.now();

    perf.n++;
    perf.sim += t1 - t0;
    perf.ray += player?.lastRayMs || 0;
    perf.gui += t2 - t1;
    perf.render += t3 - t2;
    perf.worstFrame = Math.max(perf.worstFrame, t3 - t0);
    perf.calls = renderer.info.render.calls;
    perf.tris = renderer.info.render.triangles;

    if (state.mode === 'playing' && !state.paused) {
        autoFrames++;
        autoMs += t3 - t0;
        if (autoFrames >= 120) {
            quality.autoCheck(autoMs / autoFrames);
            autoFrames = -1e9;   // once only
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const raw = Math.min(clock.getDelta(), 0.1);
    dtSmooth += (raw - dtSmooth) * DT_SMOOTHING;
    frame(state.smoothMotion ? dtSmooth : raw);
}
animate();
