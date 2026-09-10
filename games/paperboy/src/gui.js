// The lil-gui panel. Reads and writes config.js's `state`; nothing else.
import * as THREE from 'three';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { ENTITY_TYPES, RANGE, state } from './config.js';
import { PRESETS, quality } from './quality.js';
import {
    scene, renderer, orbitCamera, controls, ground, gridHelper, axesHelper,
    ambientLight, dirLight, hemiLight, updateOrthoCamera, setOrthoActive,
} from './scene.js';

export const gui = new GUI({ width: 310, title: 'Paperboy Research' });
// The panel is a dev tool, not part of the game: hidden until G.
gui.hide();
let guiOpen = false;
export function toggleGui(show = !guiOpen) {
    guiOpen = show;
    if (show) gui.show(); else gui.hide();
    return guiOpen;
}
const live = {};   // controllers refreshed each frame while riding/following
let animFolder = null;

export function buildGui(ctx) {
    // ---------------- Paperboy ----------------
    const boy = gui.addFolder('Paperboy');
    boy.open();
    const model = () => ctx.getPlayer()?.model;
    boy.add(state, 'boyVisible').name('Visible').onChange(v => { const m = model(); if (m) m.visible = v; });
    boy.add(state, 'boyWireframe').name('Wireframe').onChange(v => {
        model()?.traverse(c => { if (c.isMesh) c.material.wireframe = v; });
    });
    live.boyX = boy.add(state.boyPosition, 'x', RANGE.worldX[0], RANGE.worldX[1], 0.1).name('Position X').onChange(applyBoy);
    live.boyY = boy.add(state.boyPosition, 'y', -10, 20, 0.01).name('Position Y').onChange(applyBoy);
    live.boyZ = boy.add(state.boyPosition, 'z', RANGE.lateral[0], RANGE.lateral[1], 0.1).name('Position Z').onChange(applyBoy);
    live.boyRot = boy.add(state, 'boyRotationY', -180, 180, 1).name('Rotation Y').onChange(applyBoy);
    boy.add(state, 'boyScale', 0.05, 5, 0.01).name('Scale').onChange(applyBoy);

    const ride = boy.addFolder('Ride');
    ride.open();
    ride.add(state, 'forwardSpeed', 0, 40, 0.1).name('Forward Speed');
    ride.add(state, 'fastSpeed', 0, 80, 0.1).name('Fast Speed');
    ride.add(state, 'slowSpeed', 0, 40, 0.1).name('Slow Speed');
    ride.add(state, 'slowClipRate', 0.1, 2, 0.05).name('Slow Anim Rate');
    ride.add(state, 'turnAngle', 0, 90, 1).name('Turn Angle');
    ride.add(state, 'slowTurnAngle', 0, 90, 1).name('Turn Angle (slow)');
    ride.add(state, 'turnLerp', 0, 1, 0.01).name('Turn Ease (s)');
    ride.add(state, 'fastEase', 0, 1, 0.01).name('Fast Ease (s)');
    ride.add(state, 'smoothMotion').name('Smooth Motion');
    ride.add(state, 'throwSpeed', 0, 40, 0.1).name('Throw Speed');
    ride.add(state, 'throwAngle', -90, 90, 1).name('Throw Angle');
    ride.add(state, 'jumpVelocity', 0, 12, 0.1).name('Jump (Shift)');
    ride.add(state, 'rampLaunch', 0, 20, 0.1).name('Ramp Launch');
    ride.add(state, 'rampMinRise', 0, 1, 0.01).name('Ramp Min Rise');
    ride.add(state, 'throwCooldown', 0, 2, 0.05).name('Throw Cooldown');
    live.paused = ride.add(state, 'paused').name('Paused (Esc)');
    ride.add({ reset: () => ctx.resetRun() }, 'reset').name('Reset Run');

    const gnd = boy.addFolder('Ground');
    gnd.add(state, 'groundSnap').name('Snap to Terrain');
    gnd.add(state, 'groundOffset', -2, 2, 0.01).name('Offset');
    gnd.add(state, 'groundEase', 0, 1, 0.01).name('Ease (s)');
    gnd.add(state, 'kerbMaxSlope', 0.05, 4, 0.05).name('Kerb Max Slope');
    gnd.add(state, 'kerbMinRise', 0, 0.3, 0.01).name('Kerb Min Rise');
    gnd.add(state, 'groundMaxStep', 0, 5, 0.05).name('Max Step');

    // ---------------- Enemy planner ----------------
    const plan = gui.addFolder('Enemy Planner');
    plan.open();
    plan.add(state, 'planner').name('Planner Mode').onChange(v => ctx.setPlanner(v));
    live.planX = plan.add(state, 'plannerX', RANGE.worldX[0], RANGE.worldX[1], 0.5)
        .name('View X').onChange(() => ctx.updatePlanCamera());
    plan.add(state, 'plannerHeight', 8, 160, 1).name('View Height').onChange(() => ctx.updatePlanCamera());
    plan.add(state, 'showPlan').name('Show Plan In Game').onChange(() => ctx.setPlanner(state.planner));

    // Speeds are global per type, not per placed entity.
    const speeds = plan.addFolder('Speeds');
    for (const [key, spec] of Object.entries(ENTITY_TYPES)) {
        speeds.add(spec, 'speed', 0, 30, 0.1).name(spec.label);
    }

    const col = boy.addFolder('Collision');
    col.add(state, 'collisions').name('Enabled');
    col.add(state, 'crashEnabled').name('Crash On Hit');
    col.add(state, 'showColliders').name('Show Boxes').onChange(v => ctx.colliders.setDebug(ctx.scene, v));
    live.score = col.add(state, 'score').name('Score').disable();

    function applyBoy() { ctx.getPlayer()?.applyTransform(); }

    // ---------------- Level ----------------
    const lvl = gui.addFolder('Level');
    lvl.open();
    lvl.add(state, 'levelVisible').name('Visible').onChange(v => { const m = ctx.getLevel()?.model; if (m) m.visible = v; });
    lvl.add(state, 'showWarpedPanorama').name('WarpedPanorama').onChange(v => {
        const p = ctx.getLevel()?.panorama; if (p) p.visible = v;
    });
    lvl.add(state, 'showCrowd').name('Finish Crowd').onChange(v => ctx.crowd?.setVisible(v));
    lvl.add(state, 'levelWireframe').name('Wireframe').onChange(v => {
        ctx.getLevel()?.model.traverse(c => { if (c.isMesh) c.material.wireframe = v; });
    });
    lvl.add(state.levelPosition, 'x', RANGE.worldX[0], RANGE.worldX[1], 0.1).name('Position X').onChange(applyLevel);
    lvl.add(state.levelPosition, 'y', -10, 20, 0.1).name('Position Y').onChange(applyLevel);
    lvl.add(state.levelPosition, 'z', -500, 500, 0.1).name('Position Z').onChange(applyLevel);
    lvl.add(state, 'levelRotationY', -180, 180, 1).name('Rotation Y').onChange(applyLevel);
    lvl.add(state, 'levelScale', 0.01, 5, 0.01).name('Scale').onChange(applyLevel);

    function applyLevel() {
        const m = ctx.getLevel()?.model;
        if (!m) return;
        m.position.set(state.levelPosition.x, state.levelPosition.y, state.levelPosition.z);
        m.rotation.y = THREE.MathUtils.degToRad(state.levelRotationY);
        m.scale.setScalar(state.levelScale);
    }

    // ---------------- Camera ----------------
    const cam = gui.addFolder('Camera');
    cam.open();
    cam.add(state, 'useOrthoCamera').name('Use OrthoCamera').onChange(setOrthoActive);
    cam.add(state, 'cameraZoom', 0.2, 10, 0.05).name('Zoom').onChange(updateOrthoCamera);
    cam.add(state, 'followPlayer').name('Follow Player');
    // Screen anchor the follow camera parks the boy at, normalised -1..1.
    cam.add(state.frameAnchor, 'x', -1, 1, 0.01).name('Anchor X');
    cam.add(state.frameAnchor, 'y', -1, 1, 0.01).name('Anchor Y');
    // Position is Three.js space; rotation is Blender euler degrees, so the
    // numbers here paste straight back into Blender.
    live.camX = cam.add(state.cameraPosition, 'x', RANGE.cameraX[0], RANGE.cameraX[1], 0.1).name('Ortho Pos X').onChange(updateOrthoCamera);
    live.camY = cam.add(state.cameraPosition, 'y', -500, 500, 0.1).name('Ortho Pos Y').onChange(updateOrthoCamera);
    live.camZ = cam.add(state.cameraPosition, 'z', -500, 500, 0.1).name('Ortho Pos Z').onChange(updateOrthoCamera);
    cam.add(state.cameraRotation, 'x', -180, 180, 0.01).name('Ortho Rot X°').onChange(updateOrthoCamera);
    cam.add(state.cameraRotation, 'y', -180, 180, 0.01).name('Ortho Rot Y°').onChange(updateOrthoCamera);
    cam.add(state.cameraRotation, 'z', -180, 180, 0.01).name('Ortho Rot Z°').onChange(updateOrthoCamera);
    cam.add({ f: () => { state.useOrthoCamera = false; setOrthoActive(false); orbitCamera.position.set(8, 6, 12); controls.target.set(0, 2, 0); controls.update(); refreshAll(); } }, 'f').name('Free Orbit');

    // ---------------- Lighting / Scene ----------------
    const light = gui.addFolder('Lighting');
    light.add(state, 'ambientIntensity', 0, 3, 0.05).name('Ambient').onChange(v => ambientLight.intensity = v);
    light.add(state, 'dirLightIntensity', 0, 5, 0.1).name('Directional').onChange(v => dirLight.intensity = v);
    light.add(state, 'hemiIntensity', 0, 3, 0.05).name('Hemisphere').onChange(v => hemiLight.intensity = v);
    light.add(state, 'toneExposure', 0.1, 3, 0.05).name('Exposure').onChange(v => renderer.toneMappingExposure = v);
    light.add(state, 'shadowsEnabled').name('Shadows').onChange(v => {
        renderer.shadowMap.enabled = v;
        scene.traverse(c => { if (c.isMesh) { c.castShadow = v; c.receiveShadow = v; } });
    });

    const sc = gui.addFolder('Scene');
    sc.addColor(state, 'bgColor').name('Background').onChange(v => { scene.background.set(v); scene.fog.color.set(v); });
    live.ground = sc.add(state, 'showGround').name('Ground').onChange(v => ground.visible = v);
    live.grid = sc.add(state, 'showGrid').name('Grid').onChange(v => gridHelper.visible = v);
    sc.add(state, 'showAxes').name('Axes').onChange(v => axesHelper.visible = v);
    // Detail level. Antialiasing is fixed when the WebGL context is made, so
    // that part of the change only shows after a reload.
    const detail = { level: quality.name };
    sc.add(detail, 'level', Object.keys(PRESETS)).name('Detail').onChange(v => quality.set(v));
    sc.add(state, 'fogNear', 0, 200, 1).name('Fog Near').onChange(v => scene.fog.near = v);
    sc.add(state, 'fogFar', 10, 500, 1).name('Fog Far').onChange(v => scene.fog.far = v);
}

// Clip dropdown, built once the boy's animations are known.
export function buildAnimationGui(player) {
    animFolder?.destroy();
    animFolder = gui.addFolder('Animation');
    animFolder.open();
    const names = Object.keys(player.actions);
    if (names.length) {
        live.clip = animFolder.add(state, 'currentAnimation', names).name('Clip')
            .onChange(n => player.play(n));
    }
    animFolder.add(state, 'animationSpeed', 0, 3, 0.05).name('Speed').onChange(v => player.mixer.timeScale = v);
    animFolder.add(state, 'animationPaused').name('Paused').onChange(v => { if (player.current) player.current.paused = v; });
}

// Anything the sim drives behind the GUI's back. Throttled: each updateDisplay
// writes to the DOM, and doing ~10 of them every frame forces a style recalc
// inside the frame budget for no visible benefit.
let guiClock = 1;
export function refreshLive(dt = 0) {
    guiClock += dt;
    if (guiClock < 0.1) return;
    guiClock = 0;
    live.paused?.updateDisplay();
    if (state.riding) {
        live.boyX?.updateDisplay(); live.boyY?.updateDisplay(); live.boyZ?.updateDisplay();
        live.boyRot?.updateDisplay(); live.clip?.updateDisplay();
    }
    if (state.planner) live.planX?.updateDisplay();
    // While following, all three camera axes are solved from the anchor.
    if (state.followPlayer) { live.camX?.updateDisplay(); live.camY?.updateDisplay(); live.camZ?.updateDisplay(); }
}

export function refreshAll() { gui.controllersRecursive().forEach(c => c.updateDisplay()); }
