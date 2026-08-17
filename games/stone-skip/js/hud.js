// 2D overlay HUD drawn on its own canvas above the WebGL view: the arcade pill,
// the throw gauges (power bar and angle needle share one screen slot so the
// rhythm is learnable), skip popups, toasts and the result card.

import * as THREE from 'three';
import { clamp, lerp, sat } from './util.js';
import { SWEET_T } from './throw-control.js';
import { RELEASE, POWER, POWER_BAND } from './skip-physics.js';
import { AIM_WARN_DEG } from './camera-rig.js';
import { ACH_TOTAL } from './progression.js';

const ACCENT = '#6c5ce7';
const GLOW = '#a29bfe';
const SUB = '#a0c4ff';
const GOLD = '#ffd32a';
const DANGER = '#e74c3c';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

// Height of the DOM control strip at the bottom (WIND UP button: bottom 26px +
// 54px tall + breathing room). Canvas chips sit above it. On big tablets the
// gauges are drawn taller, so the band grows with the UI scale too.
const BOTTOM_BAND = 94;
function bottomBand(scale) { return Math.max(BOTTOM_BAND, 96 * scale); }

export function createHud(canvas, camera, throwCtl) {
  const ctx = canvas.getContext('2d');
  const V = new THREE.Vector3();
  let W = 0, H = 0, dpr = 1, scale = 1;

  const state = {
    player: { name: 'Caleb', avatar: '🧢' },
    stats: { bestSkips: 0, bestDistance: 0, done: 0, total: ACH_TOTAL, points: 0 },
    prompt: '',
    promptSub: '',
    rock: null,
    result: null,
    resultT: 0,
    flash: 0,
    flashColor: GOLD,
    popups: [],
    toasts: [],
    counter: null,          // live skip counter during flight
    counterDist: 0,         // metres travelled, shown under the skip counter
    hintPulse: 0,
    grade: null,            // big release-grade word right after the flick
    gradeT: 0,
    gradeColor: GOLD,
    fade: null,             // long-walk fade (see fadeTravel)
    pointsPop: 0,           // pulse the points chip when it goes up
    aimOffDeg: 0,           // how far the aim is off the spot's lane
    flickGhost: null,       // the flick the player just drew, fading out
    breakdown: null,        // the little bottom-right throw-quality readout
    sparkle: null,          // a special stone washed up on the beach
    map: null,              // the map view is up: { name } of the spot you are at
  };

  // The ← Games link and the icon rail are DOM elements; the centred pill must
  // never slide under either of them. Measured from the live rects (they change
  // with the UI scale, the safe-area inset and how many rail buttons there are)
  // rather than hardcoded, with the old constants as the fallback.
  let BACK_GUARD = 126;
  let RIGHT_GUARD = 74;
  // how far DOWN the screen the rail's icons actually reach: below this line the
  // right-hand edge is free again (used by the world-space sparkle label)
  let RAIL_BOTTOM = 0;
  let guardT = 0;

  function measureGuards() {
    const back = document.getElementById('backBtn');
    const side = document.getElementById('sideBtns');
    if (back) {
      const r = back.getBoundingClientRect();
      if (r.width > 4) BACK_GUARD = Math.round(r.right + 12);
    }
    if (side) {
      const r = side.getBoundingClientRect();
      // hidden rail (display:none) measures 0 wide: then the pill may use the
      // whole width, which is what the player-select backdrop wants
      RIGHT_GUARD = r.width > 4 ? Math.round(W - r.left + 8) : 12;
      // the BUTTONS, not the column box: the box is taller than the icons in it
      const bs = [...side.querySelectorAll('button, a')]
        .map(b => b.getBoundingClientRect()).filter(b => b.width > 4 && b.height > 4);
      RAIL_BOTTOM = r.width > 4 && bs.length ? Math.round(Math.max(...bs.map(b => b.bottom)) + 8) : 0;
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // one shared UI scale so phones and tablets both get chunky targets
    scale = clamp(Math.min(W, H) / 620, 0.72, 1.5);
    measureGuards();
  }
  resize();

  // --- public feed ----------------------------------------------------------
  function setPlayer(p) { state.player = p; }
  function setStats(s) {
    if (s.points !== undefined && s.points > state.stats.points) state.pointsPop = 1;
    Object.assign(state.stats, s);
  }
  /** Big word for how well the release was timed (see skip-physics.releaseGrade). */
  function setGrade(text, color = GOLD) { state.grade = text; state.gradeT = 0; state.gradeColor = color; }
  function setPrompt(main, sub = '') { state.prompt = main; state.promptSub = sub; }
  function setRock(rock) { state.rock = rock; }
  /** Degrees the aim is off the spot's forward lane (see camera-rig.aimOffsetDeg). */
  function setAimOffset(deg) { state.aimOffDeg = deg || 0; }
  /** A special stone lying on the beach: { x, y, z, name } or null. */
  function setSparkle(m) { state.sparkle = m || null; }
  /**
   * The 🗺️ map view. While it is up the throw furniture (gauges, aim guide, rock
   * chip, prompt) is not drawn at all — there is nothing to throw from 400 m up —
   * and a caption says where you are and what a tap does.
   */
  function setMapMode(on, spotName = '') { state.map = on ? { name: spotName } : null; }
  /**
   * The five-factor throw readout. Pass null to clear it.
   * rows: [{ k: 'Stone', v: 0..1 }]  — see main.doLaunch for how each is measured.
   */
  function setBreakdown(rows) { state.breakdown = rows ? { rows, life: 0 } : null; }
  /** Keep the flick the player just drew on screen for a moment after launch. */
  function showFlickTrail(path) {
    state.flickGhost = path && path.length > 1
      ? { path: path.slice(), life: 0, dur: 0.55 } : null;
  }
  function setResult(r) { state.result = r; state.resultT = 0; }
  /**
   * The big top-of-screen throw readout. `n` = skips so far (null/0 hides it),
   * `dist` = metres travelled, which main.js refreshes EVERY FRAME so the
   * distance ticks up as the stone runs down the lake instead of only jumping at
   * each skip. Clearing the counter clears the distance with it.
   */
  function setCounter(n, dist = 0) {
    state.counter = n;
    state.counterDist = (n === null || n === undefined) ? 0 : Math.max(0, dist || 0);
  }
  function flash(color = GOLD, amt = 1) { state.flash = amt; state.flashColor = color; }

  function popup(x, y, z, text, color = '#fff', size = 1) {
    state.popups.push({ x, y, z, text, color, size, life: 0, dur: 1.25 });
  }
  function toast(text, sub = '', color = GOLD) {
    state.toasts.push({ text, sub, color, life: 0, dur: 2.6 });
    if (state.toasts.length > 3) state.toasts.shift();
  }

  // --- drawing helpers ------------------------------------------------------
  function panel(x, y, w, h, r, alpha = 0.72) {
    ctx.fillStyle = `rgba(10,10,46,${alpha})`;
    rr(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = 'rgba(162,155,254,0.45)';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
  }

  function label(text, x, y, size, color, align = 'center', weight = 700) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawPill() {
    const s = state.stats;
    const parts = [
      { icon: '🌊', text: `${s.bestSkips}` },
      { icon: '📏', text: `${Math.round(s.bestDistance)}m` },
      { icon: '🏅', text: `${s.done}/${s.total}` },
      { icon: '✨', text: `${s.points}` },
    ];
    const badge = state.player.avatar + ' ' + state.player.name;

    function measure(sc) {
      ctx.font = `700 ${17 * sc}px ${FONT}`;
      let w = 16 * sc;
      for (const p of parts) w += ctx.measureText(p.icon + ' ' + p.text).width + 18 * sc;
      const bw = ctx.measureText(badge).width + 24 * sc;
      return { w, bw, total: w + bw };
    }

    // shrink (never below 0.55 of the UI scale) until the pill fits between the
    // back button and the icon column, then clamp so it can never cross them
    const avail = Math.max(140, W - BACK_GUARD - RIGHT_GUARD);
    let sc = scale;
    let m = measure(sc);
    if (m.total > avail) {
      sc = Math.max(scale * 0.55, sc * (avail / m.total));
      m = measure(sc);
    }
    const h = 42 * sc;
    const x = clamp((W - m.total) / 2, BACK_GUARD, Math.max(BACK_GUARD, W - RIGHT_GUARD - m.total));
    const y = 10 * scale;
    panel(x, y, m.total, h, h / 2, 0.66);
    let cx = x + 15 * sc;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const p of parts) {
      const t = p.icon + ' ' + p.text;
      const pts = p.icon === '✨';
      const pop = pts ? 1 + 0.22 * state.pointsPop : 1;
      ctx.font = `700 ${17 * sc * pop}px ${FONT}`;
      ctx.fillStyle = p.icon === '🏅' ? GOLD : (pts ? '#ffe680' : '#ffffff');
      ctx.fillText(t, cx, y + h / 2);
      ctx.font = `700 ${17 * sc}px ${FONT}`;
      cx += ctx.measureText(t).width + 18 * sc;
    }
    // player badge
    ctx.fillStyle = 'rgba(108,92,231,0.85)';
    rr(ctx, cx - 8 * sc, y + 5 * sc, m.bw, h - 10 * sc, (h - 10 * sc) / 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(badge, cx + 4 * sc, y + h / 2);
  }

  function drawRockChip() {
    const r = state.rock;
    if (!r) return;
    // During the release beat the FLICK NOW pill needs this corner: by then the
    // player has read the stone's name through idle and the whole wind-up.
    if (throwCtl.S.state === 'swing') return;
    const w = 204 * scale, h = 62 * scale;
    // BOTTOM_BAND clears the DOM WIND UP button (bottom:26px + 54px tall)
    const x = 12 * scale, y = H - h - bottomBand(scale);
    panel(x, y, w, h, 14 * scale, 0.68);
    // row 1: the stone's name.  row 2: its shape tag + skippiness pips
    label(r.kind.name, x + 12 * scale, y + 21 * scale, 17 * scale, '#fff', 'left');
    label(r.kind.tag, x + 12 * scale, y + 43 * scale, 12 * scale, SUB, 'left', 700);
    const pips = (r.props && r.props.stars) || 1;
    for (let i = 0; i < 5; i++) {
      const px = x + w - 14 * scale - (4 - i) * 17 * scale;
      ctx.beginPath();
      ctx.arc(px, y + 43 * scale, 5.4 * scale, 0, Math.PI * 2);
      ctx.fillStyle = i < pips ? GOLD : 'rgba(255,255,255,0.22)';
      ctx.fill();
    }
  }

  /**
   * A bought special stone has washed up among the pebbles (see rocks.spawnSpecial).
   * It glows in 3D, and this is the quiet on-screen half of the cue: a pulsing ring
   * where it lies, with its name, so it is never missed on a busy beach.
   */
  function drawSparkle() {
    const m = state.sparkle;
    if (!m || throwCtl.S.state !== 'idle') return;
    V.set(m.x, m.y, m.z).project(camera);
    if (V.z > 1) return;
    const sx = (V.x * 0.5 + 0.5) * W, sy = (-V.y * 0.5 + 0.5) * H;
    if (sx < 0 || sx > W || sy < 0 || sy > H) return;
    // Quiet on purpose: a thin breathing ring and a small name, no shouting.
    // The stone itself glows — this is only there so it is never missed.
    const pulse = 0.5 + 0.5 * Math.sin(state.hintPulse * 3.2);
    const r = (13 + 3.5 * pulse) * scale;
    ctx.strokeStyle = `rgba(255,211,42,${0.26 + 0.24 * pulse})`;
    ctx.lineWidth = 1.6 * scale;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
    const txt = `✨ ${m.name}`;
    const fs = 10 * scale;
    ctx.font = `700 ${fs}px ${FONT}`;
    const tw = ctx.measureText(txt).width;
    const ty = clamp(sy - r - 9 * scale, 60 * scale, H - 10 * scale);
    // Beside the icon rail the name has to stop short of it; below the last icon
    // the right-hand edge is free again, so it may use the whole width.
    const right = W - tw / 2 - (ty < RAIL_BOTTOM ? RIGHT_GUARD : 6 * scale);
    const left = 6 * scale + tw / 2;
    const tx = clamp(sx, left, Math.max(left, right));
    label(txt, tx, ty, fs, `rgba(255,211,42,${0.55 + 0.2 * pulse})`, 'center', 700);
  }

  /**
   * The passive step instruction ("Pick up a stone", "WIND UP to throw"). It used
   * to be a centred panel, which read as headline UI; it is a gentle reminder, so
   * it now sits small and dim in the BOTTOM-LEFT corner with no panel behind it.
   * The loud, timed cues (FLICK NOW!, PERFECT!) keep the middle of the screen.
   */
  function drawPrompt() {
    if (!state.prompt) return;
    const fs = 13 * scale, sfs = 11 * scale;
    // stacks above the stone chip (same corner) so the two never overlap
    const chip = state.rock && throwCtl.S.state !== 'swing' ? 70 * scale : 0;
    const x = 14 * scale;
    const y = H - bottomBand(scale) - chip - (state.promptSub ? 30 * scale : 14 * scale);
    // barely-there breathing, nothing that pulls the eye off the lake
    const a = 0.46 + 0.08 * Math.sin(state.hintPulse * 2.2);
    label(state.prompt, x, y, fs, `rgba(255,255,255,${(a + 0.16).toFixed(3)})`, 'left', 700);
    if (state.promptSub) {
      label(state.promptSub, x, y + 17 * scale, sfs, `rgba(160,196,255,${(a * 0.8).toFixed(3)})`, 'left', 600);
    }
  }

  // Power bar and angle needle occupy the same slot.
  function gaugeRect() {
    const w = Math.min(360 * scale, W * 0.78);
    const h = 30 * scale;
    return { x: (W - w) / 2, y: H - h - 34 * scale, w, h };
  }

  function drawGauges() {
    const S = throwCtl.S;
    if (S.state !== 'windup' && S.state !== 'swing') return;
    const g = gaugeRect();

    // frame
    ctx.fillStyle = 'rgba(10,10,46,0.7)';
    rr(ctx, g.x - 6 * scale, g.y - 6 * scale, g.w + 12 * scale, g.h + 12 * scale, 12 * scale);
    ctx.fill();
    ctx.strokeStyle = 'rgba(162,155,254,0.5)';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    if (S.state === 'windup') {
      // Both timed taps now read the same way: aim for the WHITE MIDDLE.
      // outer gold = a strong wind-up, inner gold = nearly centred,
      // white core + tick = the power sweet spot (see skip-physics.POWER).
      const lo = g.x + g.w * POWER_BAND.lo, hi = g.x + g.w * POWER_BAND.hi;
      const midX = g.x + g.w * POWER.center;
      const halfW = g.w * POWER.half;
      ctx.fillStyle = 'rgba(255,211,42,0.24)';
      rr(ctx, lo, g.y, hi - lo, g.h, 6 * scale); ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,42,0.8)';
      ctx.lineWidth = 2 * scale;
      rr(ctx, lo, g.y, hi - lo, g.h, 6 * scale); ctx.stroke();
      const gw = halfW * POWER.GREAT;
      ctx.fillStyle = 'rgba(255,211,42,0.45)';
      rr(ctx, midX - gw, g.y, gw * 2, g.h, 5 * scale); ctx.fill();

      // fill
      const p = S.power;
      const grd = ctx.createLinearGradient(g.x, 0, g.x + g.w, 0);
      grd.addColorStop(0, '#3aa7ff');
      grd.addColorStop(0.6, GLOW);
      grd.addColorStop(1, GOLD);
      ctx.fillStyle = grd;
      rr(ctx, g.x + 2 * scale, g.y + 4 * scale, Math.max(4, (g.w - 4 * scale) * p), g.h - 8 * scale, 6 * scale);
      ctx.fill();

      // white core, drawn OVER the fill so the target never disappears under it
      const perfW = Math.max(3 * scale, halfW * POWER.PERFECT);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      rr(ctx, midX - perfW, g.y + 2 * scale, perfW * 2, g.h - 4 * scale, 4 * scale); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(midX, g.y - 8 * scale);
      ctx.lineTo(midX, g.y + g.h + 8 * scale);
      ctx.stroke();
      label('TAP HERE', midX, g.y + g.h + 16 * scale, 10 * scale, '#fff');

      // head marker
      const hx = g.x + 2 * scale + (g.w - 4 * scale) * p;
      ctx.fillStyle = '#fff';
      rr(ctx, hx - 3 * scale, g.y - 3 * scale, 6 * scale, g.h + 6 * scale, 3 * scale);
      ctx.fill();
      label('POWER — TAP!', W / 2, g.y - 22 * scale, 16 * scale, GOLD);
    } else {
      // locked power, slim, above — with the white core still marked so the
      // player can see how close beat 2 landed to the target
      const pw = (g.w - 4 * scale) * S.powerLocked;
      const by = g.y - 29 * scale;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rr(ctx, g.x + 2 * scale, by, g.w - 4 * scale, 7 * scale, 4 * scale); ctx.fill();
      ctx.fillStyle = GLOW;
      rr(ctx, g.x + 2 * scale, by, Math.max(4, pw), 7 * scale, 4 * scale); ctx.fill();
      const pMid = g.x + 2 * scale + (g.w - 4 * scale) * POWER.center;
      ctx.fillStyle = S.powerGrade === 'perfect' ? '#fff' : 'rgba(255,255,255,0.55)';
      rr(ctx, pMid - 2 * scale, by - 3 * scale, 4 * scale, 13 * scale, 2 * scale); ctx.fill();
      if (S.powerGrade === 'perfect') {
        label('POWER SPOT ON', g.x + g.w, by - 9 * scale, 10 * scale, '#fff', 'right');
      }

      // --- the release band -------------------------------------------------
      // Releasing DEAD CENTRE is perfect and it falls away fast from there, so
      // the gauge has to show three nested zones, not one flat gold block:
      //   outer gold  = okay      (inside the low-angle band at all)
      //   inner gold  = great     (RELEASE.GREAT of the way out)
      //   white core  = perfect   (RELEASE.PERFECT) + a centre tick
      const lo = g.x + g.w * SWEET_T.lo, hi = g.x + g.w * SWEET_T.hi;
      const midX = g.x + g.w * SWEET_T.mid;
      const halfW = (hi - lo) / 2;
      ctx.fillStyle = 'rgba(255,211,42,0.22)';
      rr(ctx, lo, g.y, hi - lo, g.h, 6 * scale); ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,42,0.85)';
      ctx.lineWidth = 2 * scale;
      rr(ctx, lo, g.y, hi - lo, g.h, 6 * scale); ctx.stroke();

      const gw = halfW * RELEASE.GREAT;
      ctx.fillStyle = 'rgba(255,211,42,0.45)';
      rr(ctx, midX - gw, g.y, gw * 2, g.h, 5 * scale); ctx.fill();

      const perfW = Math.max(3 * scale, halfW * RELEASE.PERFECT);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      rr(ctx, midX - perfW, g.y + 2 * scale, perfW * 2, g.h - 4 * scale, 4 * scale); ctx.fill();

      // centre tick, so the target point is unmistakable
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(midX, g.y - 8 * scale);
      ctx.lineTo(midX, g.y + g.h + 8 * scale);
      ctx.stroke();
      label('AIM HERE', midX, g.y + g.h + 16 * scale, 10 * scale, '#fff');

      // ends
      label('HIGH', g.x + 20 * scale, g.y + g.h / 2, 10 * scale, 'rgba(255,255,255,0.5)');
      label('LOW', g.x + g.w - 20 * scale, g.y + g.h / 2, 10 * scale, 'rgba(255,255,255,0.5)');

      // needle
      const nx = g.x + g.w * sat(S.angleT);
      const inGold = S.angleT > SWEET_T.lo && S.angleT < SWEET_T.hi;
      ctx.fillStyle = S.grade === 'perfect' ? '#ffffff' : (inGold ? GOLD : '#fff');
      ctx.beginPath();
      ctx.moveTo(nx, g.y - 9 * scale);
      ctx.lineTo(nx + 7 * scale, g.y - 19 * scale);
      ctx.lineTo(nx - 7 * scale, g.y - 19 * scale);
      ctx.closePath(); ctx.fill();
      rr(ctx, nx - 2.5 * scale, g.y - 4 * scale, 5 * scale, g.h + 8 * scale, 3 * scale);
      ctx.fill();

      drawFlickCue(g, S);
    }
  }

  /**
   * The third beat is the one players miss, so it gets a countdown and then a
   * shouted cue keyed off S.toSweet (seconds until the needle is dead centre).
   */
  function drawFlickCue(g, S) {
    if (S.releasing) {
      label('FLICK!', W / 2, g.y - 52 * scale, 20 * scale, GOLD);
      return;
    }
    const ts = S.toSweet;
    const y = g.y - 54 * scale;
    if (ts > 0.34) {
      // counting in: a filling ring plus "get ready"
      const u = clamp(ts / Math.max(0.35, S.swingDur * SWEET_T.mid), 0, 1);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 4 * scale;
      ctx.beginPath();
      ctx.arc(W / 2, y, 20 * scale, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - u));
      ctx.stroke();
      label(ts.toFixed(1), W / 2, y, 14 * scale, '#fff');
      // ABOVE the ring: under it the words sat on top of the locked-power bar
      label('GET READY…', W / 2, y - 32 * scale, 13 * scale, SUB);
      return;
    }
    if (ts > -0.34) {
      // The money moment. The halo is a pill sized to the words, not a circle:
      // a circle small enough to look like a target cuts straight through them.
      const pop = 1 + 0.16 * Math.sin(state.hintPulse * 26);
      const size = 24 * scale;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.scale(pop, pop);
      ctx.font = `700 ${size}px ${FONT}`;
      const bw = ctx.measureText('FLICK NOW!').width + 34 * scale;
      const bh = size + 22 * scale;
      ctx.fillStyle = 'rgba(10,10,46,0.55)';
      rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,42,0.95)';
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      label('FLICK NOW!', 0, 0, size, GOLD);
      ctx.restore();
      return;
    }
    label('FLICK — QUICK!', W / 2, y, 19 * scale, DANGER);
  }

  /**
   * Aim / flick guide: which way to move the finger. Shown from the moment the
   * wind-up starts so the flick is never a surprise. Up = straight, and the
   * faint diagonals are the sideways bend a slanted flick gives you.
   */
  function drawFlickGuide() {
    const S = throwCtl.S;
    if (S.state !== 'windup' && S.state !== 'swing') return;
    if (S.releasing) return;
    const g = gaugeRect();
    // high enough that the GET READY… line and the FLICK NOW pill fit under it
    const baseY = g.y - 110 * scale;
    // The arrow shows how FAR to swipe, so it is a fraction of the real flick
    // range (throw-control scales that to the screen) rather than a fixed stub.
    const len = clamp((throwCtl.S.flickRange || 58) * 0.42, 52 * scale, baseY - 96 * scale);
    const bob = Math.sin(state.hintPulse * 3.4) * 4 * scale;

    function arrow(angle, alpha, width, l) {
      const dx = Math.sin(angle), dy = -Math.cos(angle);
      const x0 = W / 2, y0 = baseY + bob;
      const x1 = x0 + dx * l, y1 = y0 + dy * l;
      ctx.strokeStyle = `rgba(255,211,42,${alpha})`;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // head
      const hs = 11 * scale;
      const a2 = angle + Math.PI;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 + Math.sin(a2 - 0.45) * hs, y1 - Math.cos(a2 - 0.45) * hs);
      ctx.lineTo(x1 + Math.sin(a2 + 0.45) * hs, y1 - Math.cos(a2 + 0.45) * hs);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,211,42,${alpha})`;
      ctx.fill();
    }

    arrow(-0.62, 0.2, 3 * scale, len * 0.7);
    arrow(0.62, 0.2, 3 * scale, len * 0.7);
    arrow(0, 0.85, 6 * scale, len);
    label('FLICK THIS WAY', W / 2, baseY - len - 16 * scale, 12 * scale, 'rgba(255,255,255,0.75)');
  }

  function drawGrade(dt) {
    if (!state.grade) return;
    state.gradeT += dt;
    const u = state.gradeT / 0.95;
    if (u >= 1) { state.grade = null; return; }
    const pop = u < 0.2 ? lerp(0.5, 1.12, u / 0.2) : lerp(1.12, 1, sat((u - 0.2) / 0.25));
    ctx.save();
    ctx.globalAlpha = 1 - sat((u - 0.6) / 0.4);
    ctx.translate(W / 2, H * 0.4);
    ctx.scale(pop, pop);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(10,10,46,0.85)';
    ctx.font = `800 ${30 * scale}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeText(state.grade, 0, 0);
    ctx.fillStyle = state.gradeColor || GOLD;
    ctx.fillText(state.grade, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * The flick, drawn. Not an idealised arrow: the actual route the finger took
   * (throw-control records S.flick.path), inked segment by segment so the oldest
   * part of the stroke is faint and thin and the head is bright and fat. It stays
   * on screen for a moment after the launch so the player can SEE what they drew.
   */
  function inkTrail(path, fade) {
    if (!path || path.length < 2) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = path.length;
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);                     // 0 = oldest, 1 = the fingertip
      ctx.strokeStyle = `rgba(255,211,42,${(0.16 + 0.84 * u) * fade})`;
      ctx.lineWidth = (1.5 + 5 * u) * scale;
      ctx.beginPath();
      ctx.moveTo(path[i - 1].x, path[i - 1].y);
      ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    }
    // where the flick began, and where the finger is now
    const a = path[0], b = path[n - 1];
    ctx.strokeStyle = `rgba(255,211,42,${0.55 * fade})`;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 12 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 5 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlickTrail(dt) {
    const S = throwCtl.S;
    if (S.releasing && S.flick) { inkTrail(S.flick.path, 1); return; }
    const g = state.flickGhost;
    if (!g) return;
    g.life += dt;
    if (g.life >= g.dur) { state.flickGhost = null; return; }
    inkTrail(g.path, 1 - g.life / g.dur);
  }

  // --- the little throw breakdown (bottom right) -----------------------------
  // Deliberately self-contained and dull: one flag off and it is gone, and it
  // draws inside the rail guard so it can never sit under the icon column.
  const SHOW_BREAKDOWN = true;
  // It has said its piece after five seconds, then it gets out of the way. (The
  // next pick-up also clears it — main.js calls setBreakdown(null).)
  const BREAKDOWN_LIFE = 5, BREAKDOWN_FADE = 0.6;

  function drawBreakdown(dt) {
    if (!SHOW_BREAKDOWN || !state.breakdown) return;
    const b = state.breakdown;
    b.life += dt;
    if (b.life >= BREAKDOWN_LIFE + BREAKDOWN_FADE) { state.breakdown = null; return; }
    const fade = 1 - sat((b.life - BREAKDOWN_LIFE) / BREAKDOWN_FADE);
    const rows = b.rows;
    const sc = Math.min(scale, 1.1);
    const rowH = 15 * sc;
    const w = 140 * sc;
    const h = 20 * sc + rows.length * rowH + 6 * sc;
    const x = Math.max(6, W - RIGHT_GUARD - w);
    const y = H - bottomBand(scale) - h - 4 * sc;
    ctx.globalAlpha = 0.82 * sat(b.life / 0.2) * fade;
    panel(x, y, w, h, 10 * sc, 0.6);
    label('THIS THROW', x + 8 * sc, y + 11 * sc, 9 * sc, GLOW, 'left', 800);
    let ry = y + 26 * sc;
    for (const r of rows) {
      const v = clamp(r.v, 0, 1);
      const col = v >= 0.85 ? GOLD : (v >= 0.55 ? '#fff' : SUB);
      label(r.k, x + 8 * sc, ry, 9.5 * sc, 'rgba(255,255,255,0.72)', 'left', 700);
      // the bar stops well short of the number: a full row reads "100%", which is
      // the widest value there is, and it must never touch the bar's end
      const bx = x + 58 * sc, bw = 40 * sc;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rr(ctx, bx, ry - 3 * sc, bw, 6 * sc, 3 * sc); ctx.fill();
      ctx.fillStyle = col;
      rr(ctx, bx, ry - 3 * sc, Math.max(2, bw * v), 6 * sc, 3 * sc); ctx.fill();
      label(`${Math.round(v * 100)}%`, x + w - 8 * sc, ry, 9.5 * sc, col, 'right', 800);
      ry += rowH;
    }
    ctx.globalAlpha = 1;
  }

  function drawAimGuide() {
    if (throwCtl.S.state !== 'idle') return;
    // gentle chevron at the centre so the player knows where they are facing
    const y = H * 0.52;
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 11 * scale, y + 6 * scale);
    ctx.lineTo(W / 2, y - 5 * scale);
    ctx.lineTo(W / 2 + 11 * scale, y + 6 * scale);
    ctx.stroke();
    drawOffAxis(y);
  }

  /**
   * Every spot's clear lane of deep water runs straight ahead, so an aim dragged
   * well off that heading throws into the shallows. That used to happen silently.
   * Now the amount is on screen, with an arrow pointing back to the lane (and the
   * DOM ⟲ CENTRE AIM button appears at the same moment — see main.js).
   */
  function drawOffAxis(y) {
    const off = state.aimOffDeg;
    if (Math.abs(off) < AIM_WARN_DEG) return;
    const bad = Math.abs(off) > 16;
    const col = bad ? DANGER : GOLD;
    const txt = `AIM ${Math.round(Math.abs(off))}° OFF`;
    const dir = off > 0 ? -1 : 1;             // arrow points back to the lane
    const size = 14 * scale;
    ctx.font = `800 ${size}px ${FONT}`;
    const bw = ctx.measureText(txt).width + 74 * scale;
    const bh = 34 * scale;
    const bx = (W - bw) / 2, by = y + 26 * scale;
    panel(bx, by, bw, bh, bh / 2, 0.68);
    label(txt, W / 2 + 10 * scale, by + bh / 2, size, col);
    // the arrow, on the side you need to swing towards
    const ax = W / 2 - bw / 2 + 26 * scale;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(state.hintPulse * 3.6));
    ctx.fillStyle = col;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.moveTo(ax + dir * 11 * scale, by + bh / 2);
    ctx.lineTo(ax - dir * 7 * scale, by + bh / 2 - 10 * scale);
    ctx.lineTo(ax - dir * 7 * scale, by + bh / 2 + 10 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Caption for the map view: where you are, what a tap does, and how to get
   * back down. That last line matters — there is no close-map button (it
   * overlapped the rest of the HUD), so the way out has to be written somewhere.
   */
  function drawMapHint() {
    const sc = scale;
    const t1 = '🗺️ LAKE MAP';
    const t2 = state.map.name
      ? `You are at ${state.map.name} — tap a spot to walk there`
      : 'Tap a spot to walk there';
    const t3 = 'Tap 🗺️ again to come back down';
    ctx.font = `800 ${15 * sc}px ${FONT}`;
    const w1 = ctx.measureText(t1).width;
    ctx.font = `700 ${12.5 * sc}px ${FONT}`;
    const w2 = Math.max(ctx.measureText(t2).width, ctx.measureText(t3).width);
    const bw = Math.min(W - 24 * sc, Math.max(w1, w2) + 36 * sc);
    const bh = 76 * sc;
    const bx = (W - bw) / 2, by = H - bh - 20 * sc;
    panel(bx, by, bw, bh, 16 * sc, 0.76);
    label(t1, W / 2, by + 16 * sc, 15 * sc, GOLD);
    label(t2, W / 2, by + 37 * sc, 12.5 * sc, '#a0c4ff', 'center', 700);
    label(t3, W / 2, by + 57 * sc, 12.5 * sc, 'rgba(255,211,42,0.85)', 'center', 700);
  }

  /**
   * The live throw readout: the big gold skip number, and under it "SKIPS · 128 m".
   * The metres are on the same line rather than a third row so the block stays as
   * short as it was and never reaches down into the popups' airspace. The two
   * halves are measured and centred as one group, so an 8 and a 128 both sit
   * squarely under the number.
   */
  function drawCounter() {
    if (state.counter === null || state.counter === undefined) return;
    const n = state.counter;
    if (n <= 0) return;
    const s = 1 + 0.12 * Math.sin(state.hintPulse * 12);
    ctx.save();
    ctx.translate(W / 2, 84 * scale);
    ctx.scale(s, s);
    label(String(n), 0, 0, 62 * scale, GOLD);
    ctx.restore();
    const y = 84 * scale + 40 * scale;
    const size = 15 * scale;
    const unit = n === 1 ? 'SKIP' : 'SKIPS';
    const dm = `${Math.round(state.counterDist)} m`;
    ctx.font = `700 ${size}px ${FONT}`;
    const wU = ctx.measureText(unit).width;
    const wSep = ctx.measureText(' · ').width;
    const wD = ctx.measureText(dm).width;
    const x0 = W / 2 - (wU + wSep + wD) / 2;
    label(unit, x0, y, size, '#fff', 'left');
    label('·', x0 + wU + wSep / 2, y, size, 'rgba(255,255,255,0.45)');
    label(dm, x0 + wU + wSep, y, size, GOLD, 'left');
  }

  function drawPopups(dt) {
    for (let i = state.popups.length - 1; i >= 0; i--) {
      const p = state.popups[i];
      p.life += dt;
      if (p.life > p.dur) { state.popups.splice(i, 1); continue; }
      const u = p.life / p.dur;
      V.set(p.x, p.y + u * 2.4, p.z).project(camera);
      if (V.z > 1) continue;
      // A skip near the edge of the frame used to draw its "+1" half off screen.
      // Keep the number inside the picture (and clear of the icon rail) so every
      // bounce still counts visibly, wherever the chase cam happens to be.
      const marginL = 58 * scale, marginR = 78 * scale;
      const sx = clamp((V.x * 0.5 + 0.5) * W, marginL, Math.max(marginL, W - marginR));
      const sy = clamp((-V.y * 0.5 + 0.5) * H, 64 * scale, H - bottomBand(scale));
      const pop = u < 0.18 ? lerp(0.4, 1.15, u / 0.18) : lerp(1.15, 1, sat((u - 0.18) / 0.2));
      ctx.globalAlpha = 1 - sat((u - 0.55) / 0.45);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(pop * p.size, pop * p.size);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,10,46,0.8)';
      ctx.font = `800 ${30 * scale}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function drawToasts(dt) {
    let y = 74 * scale;
    for (let i = state.toasts.length - 1; i >= 0; i--) {
      const t = state.toasts[i];
      t.life += dt;
      if (t.life > t.dur) { state.toasts.splice(i, 1); continue; }
      const inA = sat(t.life / 0.22), outA = 1 - sat((t.life - (t.dur - 0.5)) / 0.5);
      ctx.globalAlpha = Math.min(inA, outA);
      ctx.font = `800 ${20 * scale}px ${FONT}`;
      const w1 = ctx.measureText(t.text).width;
      ctx.font = `600 ${14 * scale}px ${FONT}`;
      const w2 = t.sub ? ctx.measureText(t.sub).width : 0;
      const bw = Math.max(w1, w2) + 44 * scale;
      const bh = t.sub ? 64 * scale : 44 * scale;
      const x = (W - bw) / 2;
      const slide = (1 - inA) * -20 * scale;
      panel(x, y + slide, bw, bh, 14 * scale, 0.82);
      label(t.text, W / 2, y + slide + (t.sub ? 23 : 22) * scale, 20 * scale, t.color);
      if (t.sub) label(t.sub, W / 2, y + slide + 46 * scale, 14 * scale, '#fff', 'center', 600);
      ctx.globalAlpha = 1;
      y += bh + 8 * scale;
    }
  }

  function drawResult(dt) {
    const r = state.result;
    if (!r) return;
    state.resultT += dt;
    const u = sat(state.resultT / 0.3);
    const e = 1 - Math.pow(1 - u, 3);
    const w = Math.min(330 * scale, W * 0.84);
    const h = (r.newBest ? 232 : 206) * scale + (r.points ? 26 * scale : 0);
    const x = (W - w) / 2, y = H * 0.5 - h / 2 - 20 * scale;
    ctx.save();
    ctx.translate(W / 2, y + h / 2);
    ctx.scale(lerp(0.86, 1, e), lerp(0.86, 1, e));
    ctx.globalAlpha = e;
    ctx.translate(-W / 2, -(y + h / 2));
    panel(x, y, w, h, 20 * scale, 0.86);
    label(r.title, W / 2, y + 28 * scale, 21 * scale, r.titleColor || GLOW);
    if (r.sub) label(r.sub, W / 2, y + 51 * scale, 13.5 * scale, SUB, 'center', 600);
    label(String(r.skips), W / 2, y + 104 * scale, 66 * scale, GOLD);
    label(r.skips === 1 ? 'SKIP' : 'SKIPS', W / 2, y + 140 * scale, 15 * scale, '#fff');
    label(`${r.distance.toFixed(1)} m`, W / 2, y + 166 * scale, 22 * scale, SUB);
    let ry = 194 * scale;
    if (r.points) {
      label(`+${r.points} ✨ Skip Points`, W / 2, y + ry, 17 * scale, '#ffe680');
      ry += 26 * scale;
    }
    if (r.newBest) label(r.newBest, W / 2, y + ry, 15 * scale, GOLD);
    label('tap to throw again', W / 2, y + h - 14 * scale, 13 * scale, 'rgba(255,255,255,0.6)', 'center', 600);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /**
   * Long walk between spots. The lake is 250 m across and the spots ring the
   * whole shore, so a straight-line stroll to the far side would march you over
   * open water. Anything far enough away gets a fade instead, with the teleport
   * happening at the darkest point.
   */
  function fadeTravel(text, onMid) {
    state.fade = { t: 0, text, onMid, fired: false };
  }
  const FADE_IN = 0.36, FADE_HOLD = 0.14, FADE_OUT = 0.5;
  function drawFade(dt) {
    const f = state.fade;
    if (!f) return;
    f.t += dt;
    let a;
    if (f.t < FADE_IN) a = f.t / FADE_IN;
    else if (f.t < FADE_IN + FADE_HOLD) a = 1;
    else a = 1 - (f.t - FADE_IN - FADE_HOLD) / FADE_OUT;
    if (!f.fired && f.t >= FADE_IN) { f.fired = true; if (f.onMid) f.onMid(); }
    a = clamp(a, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#0a0a2e';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    if (a > 0.4) {
      ctx.globalAlpha = (a - 0.4) / 0.6;
      label('🚶 ' + f.text, W / 2, H / 2, 22 * scale, '#fff');
      ctx.globalAlpha = 1;
    }
    if (f.t > FADE_IN + FADE_HOLD + FADE_OUT) state.fade = null;
  }

  function drawFlash(dt) {
    if (state.flash <= 0.001) return;
    state.flash = Math.max(0, state.flash - dt * 2.6);
    ctx.globalAlpha = state.flash * 0.32;
    ctx.fillStyle = state.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  function draw(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    state.hintPulse += dt;
    state.pointsPop = Math.max(0, state.pointsPop - dt * 2.2);
    // the rail shows/hides with the overlays, so re-measure now and then
    guardT += dt;
    if (guardT > 0.4) { guardT = 0; measureGuards(); }
    drawFlash(dt);
    drawPill();
    // The map view keeps the stats pill and the toasts (a locked spot answers with
    // one) and drops every throw control: there is nothing to aim from up there.
    if (state.map) {
      drawMapHint();
      drawToasts(dt);
      drawFade(dt);
      return;
    }
    drawAimGuide();
    drawSparkle();
    drawRockChip();
    drawBreakdown(dt);
    drawCounter();
    drawGauges();
    drawFlickGuide();
    drawFlickTrail(dt);
    drawGrade(dt);
    drawPopups(dt);
    drawPrompt();
    drawToasts(dt);
    drawResult(dt);
    drawFade(dt);
  }

  return {
    state, resize, draw,
    setPlayer, setStats, setPrompt, setRock, setResult, setCounter, setGrade,
    setAimOffset, setSparkle, setBreakdown, showFlickTrail, setMapMode,
    popup, toast, flash, fadeTravel,
    get fading() { return !!state.fade; },
    get mapMode() { return !!state.map; },
    clearResult() { state.result = null; },
  };
}
