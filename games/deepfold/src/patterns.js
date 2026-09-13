/* patterns.js — the boss fire-pattern library.
 *
 * A boss used to be one fire rate and two phases, which is why bosses were
 * dull: there was nothing to learn. A fight is interesting when it has a
 * VOCABULARY — a handful of attacks, each with its own answer, sequenced so
 * the rhythm is something you come to know.
 *
 * Each pattern here is a small parameterised generator. A boss script in
 * config.js names them in order with a duration each, and the boss cycles the
 * list; hp thresholds swap the list for a busier one. Nothing in this file
 * knows which boss is firing it.
 *
 * THE TELEGRAPH IS PART OF THE PATTERN, not a decoration on top of it. Every
 * generator opens with `warn` seconds in which it fires nothing and shows the
 * player what is about to happen — a bar where the beam will be, a tint over
 * the half that is about to fill, a pulse on the boss for an aimed shot. An
 * attack that arrives without warning is noise: the player dies without
 * learning anything, which is the difference between hard and unfair.
 *
 * Everything is pooled or reused: the two telegraph meshes and the hazard rect
 * are built once, and bullets come from the shared pool. Nothing here
 * allocates in the frame loop.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { roundRectShape } from './paper.js';
import { ramp, RIM, GOLD, DANGER } from './palette.js';

const TAU = Math.PI * 2;

/* Per-pattern defaults. A script overrides what it cares about and inherits
   the rest, so a step in config.js is usually just a name and a duration. */
export const DEFAULTS = {
  // rapid narrow stream that sweeps slowly across an arc
  gatling:   { warn: 0.55, every: 0.075, speed: 1.25, arc: 0.85, rate: 0.8, spread: 0.05 },
  // wide burst with threadable gaps
  fan:       { warn: 0.5,  every: 1.0,  speed: 1.0,  n: 7, arc: 1.5, gaps: 1, aimed: true },
  // fills the top OR bottom half; alternates. Commit to the other half early.
  halfWall:  { warn: 0.95, every: 1.7,  speed: 0.95, step: 6.5, top: true },
  // full height, one gap, and the gap slides between volleys
  curtain:   { warn: 0.9,  every: 1.6,  speed: 0.9,  step: 6.0, gap: 17, slide: 13 },
  // rotating arms
  spiral:    { warn: 0.6,  every: 0.09, speed: 0.85, arms: 3, rate: 1.5 },
  // expanding rings with gaps, each ring turned from the last
  bloom:     { warn: 0.7,  every: 1.35, speed: 0.85, n: 14, gaps: 2, rotStep: 0.42 },
  // a tight three-round volley at where you are
  burst:     { warn: 0.45, every: 1.1,  speed: 1.1,  n: 3, spacing: 0.07, gap: 0.11 },
  // slow homing shots you outrun rather than dodge
  seeds:     { warn: 0.6,  every: 1.2,  speed: 0.45, n: 2, home: 1.5, life: 6 },
  // in from the top edge, falling: the threat stops being only horizontal
  rain:      { warn: 0.8,  every: 0.22, speed: 0.8,  drift: -0.25 },
  // a charging laser with a warning line, then the line becomes the laser
  beam:      { warn: 1.2,  on: 1.15, every: 2.9, height: 17, half: true },
  // two emitters, converging lines
  crossfire: { warn: 0.6,  every: 0.6,  speed: 1.05, spread: 15, converge: 0.55 },
  // help, mid-fight
  summon:    { warn: 0.7,  type: 'drone', count: 3, spacing: 0.28 },
};

export function createPatterns(scene, { rampName = 'STAGE1', bullets } = {}) {
  const group = new THREE.Group();
  group.position.z = 3.6;                 // in front of the play plane
  if (scene) scene.add(group);

  /* ------------------------------------------------------ telegraph props */

  function flat(color, opacity, z) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    );
    m.position.z = z;
    m.visible = false;
    m.frustumCulled = false;
    group.add(m);
    return m;
  }

  /* One bar (where a beam will land), one block (which half is about to fill),
     one hazard (the beam itself, once it is real). Three meshes for the whole
     library. */
  const warnBar = flat(RIM, 0.0, 0.2);
  const warnBlock = flat(GOLD, 0.0, 0.1);
  const hazardGlow = flat(ramp(rampName, 0.9).getHex(), 0.8, 0.3);
  const hazardCore = flat(RIM, 0.95, 0.4);

  const hazard = { active: false, x: 0, y: 0, w: 0, h: 0 };

  function hideAll() {
    warnBar.visible = false;
    warnBlock.visible = false;
    hazardGlow.visible = false;
    hazardCore.visible = false;
    hazard.active = false;
  }

  function setRamp(name) {
    hazardGlow.material.color.copy(ramp(name, 0.9));
  }

  /* ------------------------------------------------------------- the state */

  const cur = {
    name: '', cfg: null, t: 0, next: 0, shots: 0, flip: false,
    angle: 0, gapY: 0, running: false,
  };

  function begin(name, cfgIn, ctx) {
    const d = DEFAULTS[name];
    if (!d) { cur.running = false; return; }
    // one merged config object per STEP, not per frame
    const cfg = Object.assign({}, d, cfgIn || {});
    cur.name = name;
    cur.cfg = cfg;
    cur.t = 0;
    cur.next = 0;
    cur.shots = 0;
    cur.angle = 0;
    cur.running = true;
    cur.flip = !cur.flip;                    // alternate halves between steps
    cur.gapY = (Math.random() - 0.5) * 30;
    hideAll();
  }

  function cancel() { cur.running = false; hideAll(); }

  /* ------------------------------------------------------------- emitting */

  function shotSpeed(ctx, mul) {
    return CFG.enemyFire.speed * (ctx.diff ? ctx.diff.enemyBulletSpeed : 1) * (mul || 1);
  }

  function fire(ctx, x, y, a, sp, home) {
    const b = bullets.fireEnemy(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 1);
    if (b && home) { b.home = home; b.life = cur.cfg.life || 6; }
    return b;
  }

  /* How many shots a fan-like pattern actually fires. Easy thins every volley
     in the game through this one multiplier. */
  function count(ctx, n) {
    return Math.max(1, Math.round(n * (ctx.diff ? ctx.diff.shotsPerBurst : 1)));
  }

  /* ------------------------------------------------------------ the frame */

  function update(dt, ctx) {
    if (!cur.running) { if (hazard.active) hideAll(); return; }
    const c = cur.cfg;
    cur.t += dt;
    const armed = cur.t >= c.warn;

    // the wind-up, and then the attack
    if (!armed) { telegraph(ctx, cur.t / Math.max(0.001, c.warn)); return; }
    if (warnBlock.visible || warnBar.visible) { warnBar.visible = false; warnBlock.visible = false; }

    if (cur.name === 'beam') { beamStep(dt, ctx); return; }

    cur.next -= dt;
    if (cur.next > 0) return;
    cur.next = c.every;
    emit(ctx);
  }

  /* Show what is coming. Each shape of attack gets the warning that actually
     tells you what to do about it. */
  function telegraph(ctx, k) {
    const c = cur.cfg;
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(k * Math.PI * 4));
    const half = ctx.layout.halfW;

    if (cur.name === 'beam') {
      const y = c.half ? (cur.flip ? 25 : -25) : ctx.boss.y;
      warnBar.visible = true;
      warnBar.scale.set(half * 2 + 40, 1.1 + pulse * 1.6, 1);
      warnBar.position.set(-8, y, 0);
      warnBar.material.opacity = 0.35 + pulse * 0.45;
      warnBar.material.color.set(DANGER);
      return;
    }
    if (cur.name === 'halfWall') {
      const top = cur.flip;
      warnBlock.visible = true;
      warnBlock.scale.set(half * 2 + 40, 50, 1);
      warnBlock.position.set(-8, top ? 25 : -25, 0);
      warnBlock.material.opacity = 0.06 + pulse * 0.13;
      warnBlock.material.color.set(DANGER);
      return;
    }
    if (cur.name === 'curtain' || cur.name === 'rain' || cur.name === 'bloom' || cur.name === 'spiral') {
      // a bar across the boss: something wide is coming, get moving
      warnBar.visible = true;
      warnBar.scale.set(10 + pulse * 26, 2.2, 1);
      warnBar.position.set(ctx.boss.x - 22, ctx.boss.y, 0);
      warnBar.material.opacity = 0.25 + pulse * 0.5;
      warnBar.material.color.set(GOLD);
      return;
    }
    // aimed patterns: the boss itself flinches
    warnBar.visible = true;
    warnBar.scale.set(6 + pulse * 10, 6 + pulse * 10, 1);
    warnBar.position.set(ctx.boss.x, ctx.boss.y, 0);
    warnBar.material.opacity = 0.12 + pulse * 0.3;
    warnBar.material.color.set(GOLD);
  }

  function emit(ctx) {
    const c = cur.cfg;
    const boss = ctx.boss, ship = ctx.ship;
    const half = ctx.layout.halfW;
    const sp = shotSpeed(ctx, c.speed);
    const ox = boss.x - CFG.boss.radius * 0.7;
    const aimed = Math.atan2(ship.y - boss.y, ship.x - boss.x);

    switch (cur.name) {
      /* A narrow stream that walks. You are never hit standing still, and
         never safe standing still either. */
      case 'gatling': {
        const a = Math.PI + Math.sin(cur.t * c.rate * TAU) * c.arc;
        fire(ctx, ox, boss.y, a + (Math.random() - 0.5) * c.spread, sp);
        break;
      }

      /* Wide, with deliberate holes in it. */
      case 'fan': {
        const n = count(ctx, c.n);
        const base = c.aimed ? aimed : Math.PI;
        for (let i = 0; i < n; i++) {
          if (c.gaps && i % (c.gaps + 2) === c.gaps) continue;   // the threadable holes
          const t = n === 1 ? 0 : i / (n - 1) - 0.5;
          fire(ctx, ox, boss.y, base + t * c.arc, sp);
        }
        break;
      }

      /* Half the screen, all at once. The answer is to be in the other half
         BEFORE it arrives, which is what the tint during the wind-up is for. */
      case 'halfWall': {
        const top = cur.flip;
        const y0 = top ? 2 : -50 + 2;
        const y1 = top ? 50 : -2;
        for (let y = y0; y <= y1; y += c.step) fire(ctx, ox, y, Math.PI, sp);
        cur.flip = !cur.flip;
        break;
      }

      /* Full height with one gap, and the gap moves. */
      case 'curtain': {
        for (let y = -48; y <= 48; y += c.step) {
          if (Math.abs(y - cur.gapY) < c.gap * 0.5) continue;
          fire(ctx, ox, y, Math.PI, sp);
        }
        cur.gapY += (Math.random() < 0.5 ? -1 : 1) * c.slide;
        cur.gapY = Math.max(-30, Math.min(30, cur.gapY));
        break;
      }

      /* Arms on a turning line. Standing still is death; moving with the turn
         is easy once you see it. */
      case 'spiral': {
        cur.angle += c.rate * c.every * TAU * 0.16;
        const arms = count(ctx, c.arms);
        for (let i = 0; i < arms; i++) fire(ctx, boss.x, boss.y, cur.angle + (i / arms) * TAU, sp);
        break;
      }

      /* Rings with holes, each ring turned from the last, so the holes line up
         into a path if you read two of them. */
      case 'bloom': {
        const n = count(ctx, c.n);
        cur.shots++;
        const rot = cur.shots * c.rotStep;
        for (let i = 0; i < n; i++) {
          if (c.gaps && i % Math.max(2, Math.round(n / c.gaps)) === 0) continue;
          fire(ctx, boss.x, boss.y, rot + (i / n) * TAU, sp);
        }
        break;
      }

      /* Three rounds, tight, at where you are now. */
      case 'burst': {
        const n = count(ctx, c.n);
        for (let i = 0; i < n; i++) fire(ctx, ox, boss.y, aimed + (i - (n - 1) * 0.5) * c.gap, sp);
        break;
      }

      /* Slow, and they follow. Outrun them, or put the pod between. */
      case 'seeds': {
        const n = count(ctx, c.n);
        for (let i = 0; i < n; i++) {
          fire(ctx, ox, boss.y + (i - (n - 1) * 0.5) * 7, Math.PI + (Math.random() - 0.5) * 0.5, sp, c.home);
        }
        break;
      }

      /* From above, falling. */
      case 'rain': {
        const x = -half + Math.random() * (half * 2);
        fire(ctx, x, 52, -Math.PI / 2 + c.drift * 0.4, sp);
        break;
      }

      /* Two emitters, lines that cross where you were. */
      case 'crossfire': {
        for (const sy of [1, -1]) {
          const ey = boss.y + sy * c.spread;
          const target = ship.y * c.converge;
          const a = Math.atan2(target - ey, ship.x - ox);
          fire(ctx, ox, ey, a, sp);
        }
        break;
      }

      /* Help. The adds enter from the boss, not from the spawn line, so they
         read as having come OUT of it. */
      case 'summon': {
        if (cur.shots >= c.count) break;
        cur.shots++;
        cur.next = c.spacing;
        if (ctx.spawn) {
          ctx.spawn(c.type, {
            x: boss.x - CFG.boss.radius * 0.5,
            y: boss.y + (Math.random() - 0.5) * 26,
            move: 'sine', amp: 8, period: 2, phase: Math.random() * 6,
          });
        }
        break;
      }
      default: break;
    }
  }

  /* The beam is not bullets: it is a rectangle that is briefly lethal. It has
     been on screen as a warning line for `warn` seconds before this. */
  function beamStep(dt, ctx) {
    const c = cur.cfg;
    const half = ctx.layout.halfW;
    const y = c.half ? (cur.flip ? 25 : -25) : ctx.boss.y;
    const on = cur.t - c.warn;
    if (on <= c.on) {
      const k = Math.min(1, on / 0.12) * Math.min(1, (c.on - on) / 0.18);
      const h = c.height * Math.max(0.15, k);
      hazard.active = true;
      hazard.x = -8; hazard.y = y; hazard.w = half * 2 + 40; hazard.h = h;
      hazardGlow.visible = hazardCore.visible = true;
      hazardGlow.scale.set(hazard.w, h, 1);
      hazardGlow.position.set(hazard.x, y, 0);
      hazardCore.scale.set(hazard.w, h * 0.38, 1);
      hazardCore.position.set(hazard.x, y, 0);
    } else {
      hazard.active = false;
      hazardGlow.visible = hazardCore.visible = false;
      // and again, on the other side
      if (cur.t - c.warn > c.every) { cur.t = 0; cur.flip = !cur.flip; }
    }
  }

  /* Is this circle inside the live beam? */
  function hazardHits(x, y, r) {
    if (!hazard.active) return false;
    return Math.abs(y - hazard.y) <= hazard.h * 0.5 + r
      && x >= hazard.x - hazard.w * 0.5 - r
      && x <= hazard.x + hazard.w * 0.5 + r;
  }

  function reset() { cur.running = false; cur.flip = false; hideAll(); }

  function dispose() {
    for (const m of [warnBar, warnBlock, hazardGlow, hazardCore]) {
      m.geometry.dispose();
      m.material.dispose();
    }
    if (group.parent) group.parent.remove(group);
  }

  return { group, begin, update, cancel, reset, hazardHits, setRamp, dispose, current: cur };
}
