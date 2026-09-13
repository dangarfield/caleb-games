/* hud.js — the readout, drawn on a 2D canvas over the scene.
 *
 * The arcade's house style is a canvas-drawn pill top-centre and canvas-drawn
 * end screens, never an HTML panel dropped over the game, and that is what
 * this is. The 2D canvas sits above the WebGL one with pointer-events off, so
 * every touch still reaches the ship: the only tappable chrome is the POD pad
 * and the back link, which are real elements in index.html.
 *
 * The charge ring is drawn at the SHIP's screen position rather than in the
 * corner. A ring in the corner is a number; a ring round the ship is the ship
 * winding up, and a seven-year-old reads the second one without being told.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { contourStack, paperPiece, roundRectShape, outsetShape, mergeShadows } from './paper.js';
import { RIM, RIM_WIDTH, BASE } from './palette.js';

const ACCENT = '#6c5ce7';
const GLOW = '#a29bfe';
const GOLD = '#ffd32a';
const DANGER = '#e74c3c';
const INK = 'rgba(0,0,0,0.42)';

export function createHud(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 1, h = 1, dpr = 1;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundRect(x, y, rw, rh, r) {
    const k = Math.min(r, rw * 0.5, rh * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + k, y);
    ctx.lineTo(x + rw - k, y); ctx.quadraticCurveTo(x + rw, y, x + rw, y + k);
    ctx.lineTo(x + rw, y + rh - k); ctx.quadraticCurveTo(x + rw, y + rh, x + rw - k, y + rh);
    ctx.lineTo(x + k, y + rh); ctx.quadraticCurveTo(x, y + rh, x, y + rh - k);
    ctx.lineTo(x, y + k); ctx.quadraticCurveTo(x, y, x + k, y);
    ctx.closePath();
  }

  /* ------------------------------------------------------------- the pill */

  function drawPill(s) {
    const H = CFG.hud;
    const pw = Math.min(H.pillW, w - 24);
    const ph = H.pillH;
    const x = (w - pw) / 2;
    const y = H.pillTop;

    ctx.fillStyle = INK;
    roundRect(x, y, pw, ph, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('SCORE', x + 14, y + 18);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(String(s.score), x + 14, y + 40);

    // lives. Ten darts is a smear, so past five it counts instead — and with
    // the assist on there is nothing to count.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText((s.stageLabel ? s.stageLabel + '  \u00b7  ' : '') + (s.player || ''), x + pw - 14, y + 18);
    const dart = (lx, color) => {
      ctx.beginPath();
      ctx.moveTo(lx, y + 28);
      ctx.lineTo(lx - 11, y + 34);
      ctx.lineTo(lx - 8, y + 28);
      ctx.lineTo(lx - 11, y + 22);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    if (s.infinite) {
      dart(x + pw - 16, GOLD);
      ctx.textAlign = 'right';
      ctx.fillStyle = GOLD;
      ctx.font = 'bold 17px system-ui, sans-serif';
      ctx.fillText('\u221e', x + pw - 32, y + 34);
    } else if (s.lives > 5) {
      dart(x + pw - 16, GLOW);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText('\u00d7' + s.lives, x + pw - 32, y + 34);
    } else {
      for (let i = 0; i < Math.max(0, s.lives); i++) {
        dart(x + pw - 16 - i * 15, s.lives <= 1 ? DANGER : GLOW);
      }
    }

    // stage progress
    const bx = x + 14, bw = pw - 28, by = y + ph - 9;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(bx, by, bw, 4, 2); ctx.fill();
    ctx.fillStyle = s.bossActive ? GOLD : GLOW;
    roundRect(bx, by, Math.max(2, bw * Math.min(1, s.progress)), 4, 2); ctx.fill();
  }

  /* -------------------------------------------------------- the charge ring */

  function drawCharge(s) {
    if (!s.charge || s.charge <= 0.02 || !s.shipScreen) return;
    const r = CFG.hud.chargeRing;
    const cx = s.shipScreen.x, cy = s.shipScreen.y;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = s.charge >= 1 ? GOLD : GLOW;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.charge));
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /* ------------------------------------------------------- the boss's health */

  function drawBoss(s) {
    if (!s.bossActive) return;
    const bw = Math.min(420, w - 48);
    const x = (w - bw) / 2, y = CFG.hud.pillTop + CFG.hud.pillH + 10;
    ctx.fillStyle = INK;
    roundRect(x, y, bw, 16, 8); ctx.fill();
    ctx.fillStyle = s.bossPhase2 ? DANGER : GOLD;
    roundRect(x + 2, y + 2, Math.max(2, (bw - 4) * Math.max(0, s.bossHp)), 12, 6); ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillText(s.bossLabel || 'PAPER HULK', w / 2, y + 28);
  }

  /* ----------------------------------------------------------- big messages */

  function banner(title, sub, color) {
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = color || GLOW;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(Math.min(74, w * 0.115)) + 'px system-ui, sans-serif';
    ctx.fillText(title, w / 2, h * 0.42);
    ctx.restore();
    if (sub) {
      ctx.fillStyle = GLOW;
      ctx.font = 'bold ' + Math.round(Math.min(20, w * 0.038)) + 'px system-ui, sans-serif';
      ctx.fillText(sub, w / 2, h * 0.42 + 38);
    }
  }

  function drawOverlay(s) {
    if (s.phase === 'play' || s.phase === 'ready') return;
    if (s.phase === 'paused') {
      ctx.fillStyle = 'rgba(6,6,24,0.55)';
      ctx.fillRect(0, 0, w, h);
      banner('Paused', 'Tap or press P to carry on', GLOW);
      return;
    }
    /* Game over, stage clear and the win are NOT drawn here at all — not even
       their fade. They are cut paper in the world (createEndCard below), and
       the fade behind them is a sheet in the world too, BEHIND the card.
       Painting that fade on this layer instead put it over the card: every
       colour on the last thing the player sees came out muddy, which is the
       exact opposite of what an end screen is for. */
  }

  /* ------------------------------------------------------------ the toast */

  function drawToast(s) {
    if (!s.toast || s.toastLife <= 0) return;
    const a = Math.min(1, s.toastLife * 2);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(s.toast, w / 2, h * 0.30);
    ctx.globalAlpha = 1;
  }

  function draw(s) {
    ctx.clearRect(0, 0, w, h);
    if (s.phase === 'menu') return;
    drawPill(s);
    drawBoss(s);
    drawCharge(s);
    drawToast(s);
    if (s.phase === 'ready') {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(Math.min(56, w * 0.09)) + 'px system-ui, sans-serif';
      ctx.fillText(s.readyText || 'Ready', w / 2, h * 0.44);
    }
    if (s.muted) {
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('MUTED', 14, h - 14);
    }
    drawOverlay(s);
  }

  resize();
  return { draw, resize, canvas };
}

/* ====================================================================== */
/* The end screens, cut out of paper and standing in the world.           */
/* ====================================================================== */

/* A word on a sheet of card.
 *
 * There is no text in the paper kit and there is no font loader in this game,
 * so lettering is a canvas drawn once and mapped onto a plane. It is drawn the
 * way every other piece in the picture is lit — the word, and one hard copy of
 * it offset down-right behind it — so type belongs to the collage instead of
 * floating over it.
 *
 * The canvas is redrawn only when the words change (twice a run), never per
 * frame, and one texture is reused for the life of the page.
 */
function textPlane(worldW, worldH, { px = 1024 } = {}) {
  const canvas = document.createElement('canvas');
  const h = Math.round(px * (worldH / worldW));
  canvas.width = px;
  canvas.height = h;
  const c2 = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 1;
  // The renderer outputs sRGB (camera.js), so a colour texture has to say it
  // is one or the gold comes out muddy.
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(worldW, worldH),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  function set(text, { color = '#ffffff', shadow = 'rgba(16,42,92,0.55)', weight = 800, fit = 0.82 } = {}) {
    c2.clearRect(0, 0, canvas.width, canvas.height);
    let size = Math.round(canvas.height * fit);
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    do {
      c2.font = weight + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      if (c2.measureText(text).width <= canvas.width * 0.94) break;
      size -= 6;
    } while (size > 12);
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const off = Math.max(3, size * 0.06);
    c2.fillStyle = shadow;
    c2.fillText(text, cx + off, cy + off);          // the one light, again
    c2.fillStyle = color;
    c2.fillText(text, cx, cy);
    tex.needsUpdate = true;
  }
  return { mesh, set, texture: tex, canvas };
}

/* One card, built once, shown twice a run.
 *
 * Layout is in world units against the 100-unit-tall view: a banner across the
 * middle, a score card under it, and a chip that says what to do next. It sits
 * at z 9, in front of the confetti, so a boss dying behind it still shows.
 */
export function createEndCard(scene, { rampName = 'STAGE1' } = {}) {
  /* Two groups on purpose. The outer one never scales and carries the fade;
     the inner one is what animates. If the fade rode on the animated group it
     would grow and shrink with the card, and if it rode on the 2D layer above
     the scene it would wash the card out. */
  const group = new THREE.Group();
  group.position.z = 9;
  group.visible = false;
  if (scene) scene.add(group);

  /* The dim, as a sheet of the arcade's base dark lying between the game and
     the card. Big enough to cover any aspect at any shake. */
  const scrim = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 400),
    new THREE.MeshBasicMaterial({ color: BASE, transparent: true, opacity: 0, depthWrite: false }),
  );
  scrim.position.z = -1.5;
  scrim.renderOrder = -1;
  group.add(scrim);

  const inner = new THREE.Group();
  group.add(inner);

  function card(w, h, t0, t1, layers) {
    const g = new THREE.Group();
    const shape = roundRectShape(w, h, Math.min(w, h) * 0.22);
    g.add(paperPiece(outsetShape(shape, RIM_WIDTH * 2), RIM, { z: -0.2 }));
    g.add(contourStack(shape, {
      layers, insetStep: Math.min(w, h) * 0.075, rampName, t0, t1, dz: 0.1,
    }));
    mergeShadows(g);
    return g;
  }

  // banner
  const banner = new THREE.Group();
  banner.position.y = 15;
  banner.rotation.z = 0.025;                    // laid down by hand, not a machine
  banner.add(card(78, 21, 0.62, 0.20, 4));
  const titleText = textPlane(70, 15);
  titleText.mesh.position.z = 1.2;
  banner.add(titleText.mesh);
  inner.add(banner);

  /* A line of stage under the banner: which one just ended, or which one is
     next. Small, so the banner keeps the shout. */
  const subText = textPlane(64, 4.6, { px: 768 });
  subText.mesh.position.set(0, 2.2, 1.2);
  inner.add(subText.mesh);

  // score card
  const scoreCard = new THREE.Group();
  scoreCard.position.y = -3;
  scoreCard.rotation.z = -0.018;
  scoreCard.add(card(52, 15, 0.10, 0.40, 3));
  const scoreText = textPlane(44, 8.5, { px: 768 });
  scoreText.mesh.position.set(0, 1.6, 1.2);
  scoreCard.add(scoreText.mesh);
  const bestText = textPlane(44, 4.2, { px: 768 });
  bestText.mesh.position.set(0, -4.0, 1.2);
  scoreCard.add(bestText.mesh);
  inner.add(scoreCard);

  // the chip you tap
  const chip = new THREE.Group();
  chip.position.y = -21;
  chip.add(card(50, 11, 0.86, 0.98, 3));
  const chipText = textPlane(44, 5.4, { px: 768 });
  chipText.mesh.position.z = 1.2;
  chip.add(chipText.mesh);
  inner.add(chip);

  const state = { on: false, t: 0, kind: 'over' };

  const TITLES = {
    over: { text: 'GAME OVER', color: '#ffffff' },
    clear: { text: 'STAGE CLEAR!', color: '#ffd32a' },
    win: { text: 'YOU WIN!', color: '#ffd32a' },
  };

  function show(kind, info = {}) {
    const t = TITLES[kind] || TITLES.over;
    state.kind = kind;
    titleText.set(t.text, { color: t.color });
    subText.set(info.sub || '', { color: 'rgba(255,255,255,0.8)', weight: 600 });
    scoreText.set(String(info.score === undefined ? 0 : info.score), { color: '#ffd32a' });
    bestText.set(info.best || '', { color: 'rgba(255,255,255,0.85)', weight: 600 });
    chipText.set(info.chip || 'TAP TO FLY AGAIN', { color: '#ffffff', weight: 700 });
    state.on = true;
    state.t = 0;
    group.visible = true;
    scrim.material.opacity = 0;
  }

  function hide() {
    state.on = false;
    group.visible = false;
  }

  function update(dt) {
    if (!state.on) return;
    state.t += dt;
    const dim = state.kind === 'over' ? 0.62 : 0.46;
    scrim.material.opacity = Math.min(dim, scrim.material.opacity + dt * dim * 2.2);
    // in: a quick overshoot, like a card being put down
    const k = Math.min(1, state.t / 0.36);
    const e = 1 + Math.sin(k * Math.PI) * 0.08;
    inner.scale.setScalar(0.86 * (1 - k) + 1 * k * e);
    banner.rotation.z = 0.025 + (1 - k) * 0.12;
    // the chip breathes so it reads as the thing to press
    const pulse = 1 + Math.sin(state.t * 3.4) * 0.03;
    chip.scale.setScalar(pulse);
  }

  return { group, show, hide, update, isOn: () => state.on };
}

/* ====================================================================== */
/* First-run callouts: two paper labels that name the Force pod.          */
/* ====================================================================== */

/* The pod is a disc that flies in front of the ship and explains nothing about
 * itself. The person who commissioned the game could not identify it cold, so
 * the first run a player ever flies gets told: a label on the pod, a label on
 * the button that throws it, each on a slip of card with a tail pointing at
 * the thing it names.
 *
 * Once per player, ever (store.firstTime), on a timer, no dismiss button —
 * a seven-year-old should not have to close anything to start playing.
 */
export function createCallouts(scene, { rampName = 'STAGE1' } = {}) {
  const group = new THREE.Group();
  group.position.z = 8.5;
  group.visible = false;
  if (scene) scene.add(group);

  const H = CFG.hints;
  const fades = [];              // { mesh, base }

  function collect(obj) {
    obj.traverse((o) => {
      if (!o.material || o.material.map) return;
      o.material.transparent = true;
      fades.push({ mat: o.material, base: o.material.opacity });
    });
  }

  /* One slip of card with a tail. `dir` is which way the tail leans, so the
     same builder makes a label that points down-right at the pod and one that
     points down-right at the POD button. */
  function slip(text, dir) {
    const g = new THREE.Group();
    const shape = roundRectShape(H.cardW, H.cardH, H.cardH * 0.35);
    g.add(paperPiece(outsetShape(shape, RIM_WIDTH * 2), RIM, { z: -0.2, opacity: 0.999 }));
    g.add(contourStack(shape, {
      layers: 2, insetStep: H.cardH * 0.16, rampName, t0: 0.10, t1: 0.34, dz: 0.1, opacity: 0.999,
    }));
    // the tail: a tapering strip from the card's corner toward the subject
    const tail = paperPiece(roundRectShape(11, 1.5, 0.7), RIM, { z: -0.1, opacity: 0.999 });
    tail.position.set(dir * (H.cardW * 0.42), -H.cardH * 0.5, 0);
    tail.rotation.z = dir * -0.9;
    g.add(tail);
    collect(g);
    const t = textPlane(H.cardW - 5, H.cardH - 3, { px: 640 });
    t.mesh.position.z = 1.2;
    t.set(text, { color: '#ffffff', weight: 800 });
    g.add(t.mesh);
    fades.push({ mat: t.mesh.material, base: 1 });
    return g;
  }

  const podSlip = slip(H.podLabel, 1);
  const btnSlip = slip(H.btnLabel, 1);
  group.add(podSlip);
  group.add(btnSlip);

  const state = { on: false, t: 0 };

  function show() { state.on = true; state.t = 0; group.visible = true; }
  function hide() { state.on = false; group.visible = false; }

  /* ctx: { podX, podY, view } — the pod label rides with the pod, and the
     button label is pinned to where the POD pad actually is on screen, which
     is a pixel position turned into world units through the view's own size. */
  function update(dt, ctx) {
    if (!state.on) return;
    state.t += dt;
    if (state.t > H.life) { hide(); return; }

    const k = state.t < H.fadeIn
      ? state.t / H.fadeIn
      : Math.min(1, (H.life - state.t) / H.fadeOut);
    for (let i = 0; i < fades.length; i++) fades[i].mat.opacity = fades[i].base * Math.max(0, k);

    podSlip.position.set(ctx.podX - H.cardW * 0.45, ctx.podY + 13, 0);
    podSlip.rotation.z = 0.03 + Math.sin(state.t * 1.6) * 0.012;

    // the POD pad: 18px margin + 39px to its centre, from the bottom right
    const el = ctx.view.renderer.domElement;
    const perPx = ctx.view.height / Math.max(1, el.clientHeight || window.innerHeight);
    const bx = ctx.view.width * 0.5 - 57 * perPx;
    const by = -ctx.view.height * 0.5 + 57 * perPx;
    btnSlip.position.set(bx - H.cardW * 0.55, by + 16, 0);
    btnSlip.rotation.z = -0.04 + Math.sin(state.t * 1.9 + 1) * 0.012;
  }

  return { group, show, hide, update, isOn: () => state.on };
}
