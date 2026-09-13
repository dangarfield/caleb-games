/* enemies.js — the cast, pooled, plus the stage-1 boss.
 *
 * Every enemy that will ever appear is built once at boot. Spawning takes a
 * dead instance out of its type's pool, resets it and parents it to the scene;
 * dying unparents it. Nothing allocates in the frame loop and nothing is ever
 * built mid-stage — a contourStack is a few hundred multiplies and doing one
 * while the screen is moving is a visible hitch on an iPad.
 *
 * COLLISION SHAPE. An enemy is a list of circles, not one circle: `pn` parts
 * with world positions in `px`/`py`, radii in `pr`, and a per-part damage
 * multiplier in `pd`. Most enemies have one part. The chain worm has one per
 * bead, so shooting the tail of a worm works. The boss has two — a hull that
 * shrugs shots off and a weak point that does not — which is the whole fight.
 *
 * The arrays are pre-allocated per instance and written in place.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import * as DESIGNS from './designs.js';
import { bossHulk, mergeActorShadows } from './designs.js';
import { mergeShadows, disposeObject, paperPiece, contourStack, blobShape, ringShape } from './paper.js';
import { ramp, GOLD } from './palette.js';

/* The biggest multi-part actor is the baitball's flock and the eel's chain,
   both of which want every piece shootable. */
const MAX_PARTS = 14;

export function createEnemies(scene, { rampName: startRamp = 'STAGE1', bullets, patterns = null, hooks = {} } = {}) {
  /* Mutable: a stage change recuts the whole cast in the new stage's ramp.
     The builders below read it at call time, so nothing else has to know. */
  let rampName = startRamp;
  const group = new THREE.Group();
  group.position.z = 0.9;
  if (scene) scene.add(group);

  const builders = {
    drone: () => DESIGNS.popcornDrone({ rampName, radius: CFG.enemies.drone.radius }),
    mine: () => DESIGNS.spikeMine({ rampName, radius: CFG.enemies.mine.radius }),
    gunship: () => DESIGNS.gunship({ rampName, len: 9 }),
    jelly: () => DESIGNS.jellyDrifter({ rampName, size: 7.5 }),
    turret: () => DESIGNS.wallTurret({ rampName, size: 8 }),
    worm: () => DESIGNS.chainWorm({
      rampName, beads: CFG.enemies.worm.beads,
      radius: CFG.enemies.worm.radius, spread: CFG.enemies.worm.beadGap,
    }),
    urchin: () => DESIGNS.urchin({ rampName, radius: CFG.enemies.urchin.radius }),
    angler: () => DESIGNS.angler({ rampName, size: 6.5 }),
    puffer: () => DESIGNS.puffer({ rampName, radius: CFG.enemies.puffer.radius }),
    ray: () => DESIGNS.ray({ rampName, size: 5.2 }),
    baitball: () => DESIGNS.baitball({ rampName, size: 6.2 }),
    crab: () => DESIGNS.crab({ rampName, size: 6 }),
    eel: () => DESIGNS.eel({
      rampName, beads: CFG.enemies.eel.beads,
      radius: CFG.enemies.eel.radius, spread: CFG.enemies.eel.beadGap,
    }),
  };

  /* The multi-part actors name their pieces differently — a worm has `links`,
     a baitball has `fish` — and the part list does not care which. */
  function partsOf(art) {
    return (art.userData && (art.userData.fish || art.userData.links)) || null;
  }

  const pools = {};
  const all = [];

  /* Shadow merging, per type.
   *
   * mergeShadows collapses every shadow under an object into one mesh and is
   * only safe on a RIGID assembly: the merged mesh is parented to that object,
   * so anything that moves inside it afterwards slides out from under its own
   * shadow. The articulated ones are therefore merged one rigid sub-assembly
   * at a time — each worm bead, the jellyfish's bell but not its tentacles,
   * the turret's dome but not its barrel, the boss's body but not its
   * breathing weak point or its turning crown. */
  function collapseShadows(type, art) {
    // designs.js declares `userData.rigid` and names its moving parts, so the
    // rigid/articulated decision lives with the art rather than here.
    mergeActorShadows(art);
  }

  function makeInstance(type) {
    const cfg = CFG.enemies[type];
    const art = builders[type]();
    collapseShadows(type, art);
    art.visible = true;
    const e = {
      type, cfg, art, alive: false,
      x: 0, y: 0, baseY: 0, vx: 0, vy: 0,
      hp: 1, maxHp: 1, score: cfg.score,
      move: 'straight', t: 0, amp: 0, period: 1, phase: 0, speed: cfg.speed,
      fireTimer: 0, fireRate: cfg.fireRate,
      carries: null, anchor: null, flash: 0, beamStamp: -1,
      /* Scratch for the movement patterns, pre-allocated like everything else:
         `st` is which leg of the pattern it is on, tx/ty a captured heading or
         anchor, vy a live vertical speed. */
      st: 0, tx: 0, ty: 0, vy2: 0, hang: 0, rushAt: 0, loopX: 0, dir: 1, mark: 0,
      scatterX: null, scatterY: null, drop: 0, scale: 1,
      pn: 1,
      px: new Float32Array(MAX_PARTS),
      py: new Float32Array(MAX_PARTS),
      pr: new Float32Array(MAX_PARTS),
      pd: new Float32Array(MAX_PARTS),
      links: partsOf(art),
      linkTrail: null,
      isBoss: false, phase2: false, dying: 0, deathStage: 0,
    };
    if (type === 'worm' || type === 'eel') {
      e.linkTrail = new Float32Array((cfg.beads || 5) * 2);
    }
    if (type === 'baitball') {
      // one scatter offset per fish, pushed out when hit and pulled back after
      const fish = partsOf(art) || [];
      e.scatterX = new Float32Array(fish.length);
      e.scatterY = new Float32Array(fish.length);
      // where each fish sits when the flock is calm
      for (const f of fish) { f.userData.homeX = f.position.x; f.userData.homeY = f.position.y; }
    }
    return e;
  }

  for (const type in CFG.enemies) {
    const n = CFG.enemies[type].pool;
    const list = [];
    for (let i = 0; i < n; i++) {
      const e = makeInstance(type);
      list.push(e);
      all.push(e);
    }
    pools[type] = list;
  }

  /* ---------------------------------------------------------------- boss */

  /* The second weak point, for the 'shutter' variant.
   *
   * designs.bossHulk has one eye and this build may not edit it, so the second
   * one is cut here from the same kit: a gold core inside a gold ring, sitting
   * off to one side of the hull. It is SHUT except for a window after each
   * volley — hidden, and not in the part list at all, so a shot cannot even
   * find it — which is what makes the fight about reading the gaps between
   * patterns rather than about holding a line. */
  function makeShutter() {
    const r = CFG.boss.shutterRadius;
    const g = new THREE.Group();
    g.add(contourStack(blobShape({ radius: r, points: 12, wobble: 0.1, seed: 55 }), {
      layers: 3, insetStep: r * 0.2, rampName, t0: 0.9, t1: 1.0, dz: 0.07,
    }));
    g.add(paperPiece(blobShape({ radius: r * 0.5, points: 10, wobble: 0.07, seed: 57 }), GOLD, { z: 0.5, shadow: false }));
    g.add(paperPiece(ringShape(blobShape({ radius: r * 0.82, points: 14, wobble: 0.05, seed: 59 }), r * 0.14), GOLD, { z: 0.4, shadow: false, opacity: 0.8 }));
    g.position.set(CFG.boss.shutterOffset, 0, 1.4);
    g.visible = false;
    return g;
  }

  let bossArt = bossHulk({ rampName, radius: CFG.boss.radius });
  // Body only: the crown turns and the weak point breathes.
  mergeActorShadows(bossArt);
  let shutter = makeShutter();
  bossArt.add(shutter);
  const boss = {
    type: 'boss', cfg: CFG.boss, art: bossArt, alive: false, isBoss: true,
    x: 0, y: 0, baseY: 0, hp: CFG.boss.hp, maxHp: CFG.boss.hp,
    score: CFG.boss.score, state: 'enter', t: 0, fireTimer: 0,
    phase2: false, flash: 0, beamStamp: -1, dying: 0, deathStage: 0,
    pn: 2,
    px: new Float32Array(MAX_PARTS), py: new Float32Array(MAX_PARTS),
    pr: new Float32Array(MAX_PARTS), pd: new Float32Array(MAX_PARTS),
    carries: null, move: 'boss', speed: 0,
    variant: 'aimed', sweep: 0, shutterFor: 0, label: 'PAPER HULK',
    /* Script state: which phase's list we are on, which step of it, and how
       long that step has left. A boss is a rotation of three to five patterns
       rather than one, which is what gives a fight a rhythm to learn. */
    phases: null, phaseIx: -1, stepIx: 0, stepLeft: 0,
  };
  all.push(boss);

  /* -------------------------------------------------------------- spawning */

  function spawn(type, o = {}) {
    if (type === 'boss') return spawnBoss(o);
    const list = pools[type];
    if (!list) return null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive) continue;
      reset(e, o);
      return e;
    }
    return null;                        // pool exhausted: the spawn is dropped
  }

  function reset(e, o) {
    const cfg = e.cfg;
    e.alive = true;
    e.x = o.x === undefined ? 0 : o.x;
    e.y = o.y === undefined ? 0 : o.y;
    e.baseY = e.y;
    e.move = o.move || 'straight';
    e.speed = o.speed === undefined ? cfg.speed : o.speed;
    e.amp = o.amp === undefined ? 0 : o.amp;
    e.period = o.period === undefined ? 1.4 : o.period;
    e.phase = o.phase === undefined ? 0 : o.phase;
    e.hp = Math.max(1, Math.round((o.hp === undefined ? cfg.hp : o.hp) * (o.hpScale || 1)));
    e.maxHp = e.hp;
    e.score = o.score === undefined ? cfg.score : o.score;
    e.carries = o.carries || null;
    e.anchor = o.anchor || null;
    e.fireRate = o.fireRate === undefined ? cfg.fireRate : o.fireRate;
    e.fireTimer = (o.fireDelay === undefined ? 0.6 : o.fireDelay) + Math.random() * 0.5;
    e.t = 0;
    e.st = 0;
    e.tx = 0; e.ty = 0; e.mark = 0;
    e.dir = o.dir === undefined ? 1 : o.dir;
    e.hang = o.hang === undefined ? CFG.moves.dive.hang : o.hang;
    e.rushAt = o.rushAt === undefined ? CFG.moves.strafe.rushAt : o.rushAt;
    e.loopX = o.loopX;
    e.vy2 = o.vy === undefined ? CFG.moves.bounce.vy * e.dir : o.vy;
    e.drop = 0;
    e.scale = 1;
    if (e.scatterX) for (let i = 0; i < e.scatterX.length; i++) { e.scatterX[i] = 0; e.scatterY[i] = 0; }
    if (e.art.userData.body) e.art.userData.body.scale.setScalar(1);
    e.flash = 0;
    e.beamStamp = -1;
    e.vy = 0;
    e.art.scale.setScalar(1);
    e.art.rotation.z = 0;
    e.art.position.set(e.x, e.y, 0);
    e.art.visible = true;
    if (e.type === 'turret' && e.art.userData.gun) {
      e.art.userData.gun.rotation.z = Math.PI * 0.72;   // already looking left
      e.aim = e.art.userData.gun.rotation.z;
    }
    if (e.linkTrail) {
      for (let i = 0; i < e.linkTrail.length; i += 2) { e.linkTrail[i] = e.x; e.linkTrail[i + 1] = e.y; }
    }
    group.add(e.art);
    writeParts(e);
    return e;
  }

  function spawnBoss(o = {}) {
    boss.alive = true;
    boss.variant = o.variant || 'aimed';
    boss.label = o.label || 'PAPER HULK';
    boss.phases = o.phases || null;
    boss.phaseIx = -1;
    boss.stepIx = 0;
    boss.stepLeft = 0;
    boss.sweep = 0;
    boss.shutterFor = 0;
    shutter.visible = false;
    boss.state = 'enter';
    boss.x = o.x === undefined ? 0 : o.x;
    boss.y = 0;
    boss.baseY = 0;
    boss.maxHp = Math.max(1, Math.round((o.hp || CFG.boss.hp) * (o.hpScale || 1)));
    boss.hp = boss.maxHp;
    boss.t = 0;
    boss.fireTimer = 2.2;
    boss.phase2 = false;
    boss.flash = 0;
    boss.dying = 0;
    boss.deathStage = 0;
    boss.beamStamp = -1;
    bossArt.scale.setScalar(1);
    bossArt.visible = true;
    bossArt.position.set(boss.x, boss.y, 0);
    group.add(bossArt);
    writeParts(boss);
    return boss;
  }

  /* ------------------------------------------------------------ hit shapes */

  function writeParts(e) {
    if (e.isBoss) {
      e.px[0] = e.x; e.py[0] = e.y; e.pr[0] = CFG.boss.hitRadius; e.pd[0] = CFG.boss.hullDamageScale;
      // the weak point sits slightly left of centre, as designs.bossHulk cuts it
      e.px[1] = e.x - CFG.boss.radius * 0.06; e.py[1] = e.y;
      e.pr[1] = CFG.boss.eyeRadius; e.pd[1] = 1;
      e.pn = 2;
      if (e.variant === 'shutter' && e.shutterFor > 0) {
        e.px[2] = e.x + CFG.boss.shutterOffset; e.py[2] = e.y;
        e.pr[2] = CFG.boss.shutterRadius; e.pd[2] = CFG.boss.shutterDamage;
        e.pn = 3;
      }
      return;
    }
    if (e.type === 'baitball' && e.links) {
      const n = Math.min(MAX_PARTS, e.links.length);
      e.pn = n;
      for (let i = 0; i < n; i++) {
        e.px[i] = e.x + e.links[i].position.x;
        e.py[i] = e.y + e.links[i].position.y;
        e.pr[i] = e.cfg.radius;
        e.pd[i] = 1;
      }
      return;
    }
    if ((e.type === 'worm' || e.type === 'eel') && e.links) {
      const n = e.links.length;
      e.pn = Math.min(MAX_PARTS, n);
      for (let i = 0; i < e.pn; i++) {
        const L = e.links[i];
        e.px[i] = e.x + L.position.x;
        e.py[i] = e.y + L.position.y;
        e.pr[i] = e.cfg.radius * 1.15;
        e.pd[i] = 1;
      }
      return;
    }
    e.pn = 1;
    e.px[0] = e.x; e.py[0] = e.y; e.pr[0] = e.cfg.radius; e.pd[0] = 1;
  }

  /* ------------------------------------------------------------ behaviour */

  function update(dt, ctx) {
    const { layout, ship, terrain, diff, scrollSpeed } = ctx;
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (!e.alive) continue;
      if (e.dying > 0) { stepDeath(e, dt, ctx); continue; }
      e.t += dt;
      if (e.isBoss) stepBoss(e, dt, ctx);
      else stepEnemy(e, dt, ctx);

      if (e.flash > 0) {
        e.flash -= dt;
        const k = Math.max(0, e.flash / CFG.fx.hitFlash);
        e.art.scale.setScalar(1 + k * 0.16);
        if (e.flash <= 0) e.art.scale.setScalar(1);
      }
      writeParts(e);
    }
  }

  function stepEnemy(e, dt, ctx) {
    const { ship, terrain, scrollSpeed, layout } = ctx;
    const M = CFG.moves;

    /* Character, applied to forward speed before the pattern runs.
     *
     * A drone that glides at a constant 60 reads as scenery moving; a drone
     * that darts, coasts and darts again reads as a thing with an opinion. A
     * gunship that only ever advances is a target; one that shoves forward and
     * backs off while it fires is a fight. Neither needed a new pattern — they
     * needed their forward speed to stop being a constant. */
    let xf = 1;
    if (e.type === 'drone') {
      const sdart = Math.sin(e.t * M.drone.burstRate + e.phase);
      const k = sdart > 0 ? sdart * sdart : 0;
      xf = M.drone.coast + (M.drone.dart - M.drone.coast) * k;
    } else if (e.type === 'gunship') {
      xf = 1 - M.gunship.retreat * Math.sin(e.t * M.gunship.rate);
    }

    switch (e.move) {
      case 'sine':
        e.x -= e.speed * xf * dt;
        e.y = e.baseY + Math.sin(e.t * e.period + e.phase) * e.amp;
        break;

      /* Sharp reversals rather than a smooth curve — a triangle wave. Reads
         completely differently from a sine at the same amplitude: you cannot
         lead it, you have to wait for the corner. */
      case 'zigzag': {
        e.x -= e.speed * xf * dt;
        const per = e.period || M.zigzag.period;
        const ph = ((e.t / per) + e.phase) % 2;
        const tri = ph < 1 ? ph : 2 - ph;
        e.y = e.baseY + (tri * 2 - 1) * (e.amp || M.zigzag.amp);
        break;
      }

      /* Hangs at the edge of the screen long enough to be noticed, then picks
         a heading at the player and commits to it. Committing is what makes it
         dodgeable: it aims once, not every frame. */
      case 'dive':
        if (e.st === 0) {
          // come in far enough to be SEEN before hanging; hanging off the edge
          // of the screen is just a late spawn
          e.x -= e.speed * dt;
          if (e.x <= layout.halfW * 0.74) { e.st = 1; e.mark = e.t; e.baseY = e.y; }
        } else if (e.st === 1) {
          e.x -= e.speed * 0.14 * dt;
          e.y = e.baseY + Math.sin(e.t * 4.5) * 1.4;
          if (e.t - e.mark >= e.hang) {
            e.st = 2;
            const a = Math.atan2(ship.y - e.y, ship.x - e.x);
            e.tx = Math.cos(a); e.ty = Math.sin(a);   // aimed ONCE, then committed
          }
        } else {
          const sp = e.speed * M.dive.rush;
          e.x += e.tx * sp * dt;
          e.y += e.ty * sp * dt;
        }
        break;

      /* Slides onto the player's line, then rushes down it. */
      case 'strafe':
        if (e.st === 0) {
          e.x -= e.speed * M.strafe.creep * dt;
          const want = ship.y - e.y;
          const cap = M.strafe.track * dt;
          e.y += Math.max(-cap, Math.min(cap, want));
          if (e.t >= e.rushAt) e.st = 1;
        } else {
          e.x -= e.speed * M.strafe.rush * dt;
        }
        break;

      /* A full circle mid-screen and then on its way. The anchor drifts left
         while it loops, so it does not hang in the air. */
      case 'loop': {
        const R = e.amp || M.loop.radius;
        const at = e.loopX === undefined ? layout.halfW * M.loop.at : e.loopX;
        if (e.st === 0) {
          e.x -= e.speed * dt;
          if (e.x <= at) { e.st = 1; e.tx = e.x; e.ty = e.y; e.phase = 0; }
        } else if (e.st === 1) {
          e.tx -= e.speed * 0.35 * dt;
          e.phase += dt * M.loop.rate;
          e.x = e.tx + Math.sin(e.phase) * R;
          e.y = e.ty + (1 - Math.cos(e.phase)) * R * e.dir;
          if (e.phase >= Math.PI * 2) { e.st = 2; e.baseY = e.y; }
        } else {
          e.x -= e.speed * dt;
        }
        break;
      }

      /* Ricochets between the walls. The bounce itself is handled by the
         canyon clamp below, which is where the walls actually are. */
      case 'bounce':
        e.x -= e.speed * dt;
        e.y += e.vy2 * dt;
        break;

      /* URCHIN — clamped to the rock, fires in every direction at once. The
         answer to it is not to be hugging the wall when it goes off, which is
         exactly the habit it exists to punish. */
      case 'clamp':
        e.x -= scrollSpeed * dt;
        if (terrain && e.anchor) {
          const surf = e.anchor === 'ceil' ? terrain.ceilAt(e.x) : terrain.floorAt(e.x);
          e.y = surf + (e.anchor === 'ceil' ? -1 : 1) * e.cfg.radius * 0.7;
        }
        e.art.rotation.z += dt * 0.5;
        break;

      /* ANGLER — drifts in the dark with its lure going, and commits the
         moment you are close enough. It aims once, like a dive. */
      case 'lurk': {
        const lure = e.art.userData.lure;
        if (e.st === 0) {
          e.x -= e.speed * 0.45 * dt;
          e.y = e.baseY + Math.sin(e.t * 1.3) * 3;
          if (lure) lure.rotation.z = Math.sin(e.t * 2.2) * 0.5;
          const dx = ship.x - e.x, dy = ship.y - e.y;
          if (dx * dx + dy * dy < e.cfg.range * e.cfg.range) {
            e.st = 1;
            const a = Math.atan2(dy, dx);
            e.tx = Math.cos(a); e.ty = Math.sin(a);
            e.mark = e.t;
          }
        } else {
          const k = Math.min(1, (e.t - e.mark) / 0.35);       // it winds up, then goes
          const sp = e.speed * e.cfg.charge * k;
          e.x += e.tx * sp * dt;
          e.y += e.ty * sp * dt;
          if (lure) lure.rotation.z = Math.sin(e.t * 9) * 0.3;
        }
        break;
      }

      /* PUFFER — harmless until you crowd it, then it inflates (the telegraph)
         and bursts into a radial spray. A trap you can always see coming. */
      case 'puff': {
        const body = e.art.userData.body;
        if (e.st === 0) {
          e.x -= e.speed * dt;
          e.y = e.baseY + Math.sin(e.t * 1.1 + e.phase) * 4;
          const dx = ship.x - e.x, dy = ship.y - e.y;
          if (dx * dx + dy * dy < e.cfg.range * e.cfg.range) { e.st = 1; e.mark = e.t; }
        } else {
          e.x -= e.speed * 0.4 * dt;
          const k = Math.min(1, (e.t - e.mark) / e.cfg.inflate);
          e.scale = 1 + k * 0.9;
          if (body) body.scale.setScalar(e.scale);
          if (k >= 1) { burstSpines(e, ctx, e.cfg.spines, e.cfg.burstSpeed); kill(e); }
        }
        break;
      }

      /* RAY — a wide slow arc, laying mines behind it. What it leaves is the
         threat; the ray itself barely is. */
      case 'glide': {
        e.x -= e.speed * dt;
        e.y = e.baseY + Math.sin(e.t * (e.period || 0.55) + e.phase) * (e.amp || 20);
        const wingL = e.art.userData.wingL, wingR = e.art.userData.wingR;
        const flap = Math.sin(e.t * 2.4) * 0.28;
        if (wingL) wingL.rotation.z = flap;
        if (wingR) wingR.rotation.z = -flap;
        e.drop -= dt;
        if (e.drop <= 0) {
          e.drop = e.cfg.dropEvery;
          spawn('mine', { x: e.x + 4, y: e.y, move: 'straight', speed: 6, hpScale: 0.6 });
        }
        break;
      }

      /* BAITBALL — one cloud, many fish. Every fish is shootable, a hit blows
         the flock apart, and it pulls itself back together if you let it. */
      case 'flock': {
        e.x -= e.speed * dt;
        e.y = e.baseY + Math.sin(e.t * 0.9 + e.phase) * 9;
        const fish = e.links;
        if (fish && e.scatterX) {
          const pull = 1 - Math.exp(-dt / e.cfg.regroup);
          for (let i = 0; i < fish.length; i++) {
            e.scatterX[i] -= e.scatterX[i] * pull;
            e.scatterY[i] -= e.scatterY[i] * pull;
            const sw = Math.sin(e.t * 3 + i * 1.7) * 0.6;
            fish[i].position.x = fish[i].userData.homeX + e.scatterX[i] + sw;
            fish[i].position.y = fish[i].userData.homeY + e.scatterY[i] + Math.cos(e.t * 2.4 + i) * 0.5;
          }
        }
        break;
      }

      /* CRAB — walks the rock and fires straight out of it. Works either way
         up: on the ceiling it is the same crab upside down, and its shots go
         the other way. */
      case 'walk': {
        e.x -= (scrollSpeed + e.speed) * dt;
        if (terrain && e.anchor) {
          const surf = e.anchor === 'ceil' ? terrain.ceilAt(e.x) : terrain.floorAt(e.x);
          e.y = surf + (e.anchor === 'ceil' ? -1 : 1) * e.cfg.radius * 0.75;
        }
        const claw = e.art.userData.claw;
        if (claw) claw.rotation.z = Math.sin(e.t * 5) * 0.22;
        break;
      }

      /* EEL — a longer, faster chain that runs the rock and lunges when you
         come level with it. */
      case 'snake': {
        const lunging = e.st === 1;
        e.x -= e.speed * (lunging ? e.cfg.lunge : 1) * dt;
        if (!lunging) {
          if (terrain && e.anchor) {
            const surf = e.anchor === 'ceil' ? terrain.ceilAt(e.x) : terrain.floorAt(e.x);
            e.baseY = surf + (e.anchor === 'ceil' ? -1 : 1) * 7;
          }
          e.y = e.baseY + Math.sin(e.t * (e.period || 2.2) + e.phase) * (e.amp || 5);
          if (Math.abs(ship.y - e.y) < 14 && e.x > ship.x + 8) { e.st = 1; e.mark = e.t; }
        } else {
          e.y += (ship.y - e.y) * Math.min(1, dt * 1.6);
        }
        if (e.links) {
          for (let i = 0; i < e.links.length; i++) {
            const lag = i * 0.3;
            e.links[i].position.x = -i * e.cfg.beadGap;
            e.links[i].position.y = Math.sin((e.t - lag) * (e.period || 2.2) + e.phase) * (e.amp || 5)
              - (e.y - e.baseY);
          }
        }
        break;
      }
      case 'swoop': {
        // comes in level, then leans toward wherever the player is
        e.x -= e.speed * dt;
        const want = ship.y;
        e.vy += ((want - e.y) * 1.1 - e.vy) * Math.min(1, dt * 2.2);
        e.y += e.vy * dt * 0.5;
        break;
      }
      case 'drift':
        e.x -= e.speed * dt;
        // jellyfish rise and sink through a much taller column than they used to
        e.y = e.baseY + Math.sin(e.t * e.period + e.phase) * e.amp * M.jelly.rise;
        if (e.art.userData.tentacles) {
          e.art.userData.tentacles.rotation.z = Math.sin(e.t * 1.6 + e.phase) * 0.16;
        }
        break;
      case 'static':
        // bolted to the wall: it travels with the terrain, not through it
        e.x -= scrollSpeed * dt;
        if (terrain && e.anchor) {
          const surf = e.anchor === 'ceil' ? terrain.ceilAt(e.x) : terrain.floorAt(e.x);
          e.y = surf + (e.anchor === 'ceil' ? -1 : 1) * e.cfg.radius * 0.55;
        }
        break;
      case 'worm': {
        e.x -= e.speed * dt;
        e.y = e.baseY + Math.sin(e.t * e.period + e.phase) * e.amp;
        // Each bead lags one step further back along the head's own sine, which
        // is a whole chain animation for two multiplies per bead.
        if (e.links) {
          for (let i = 0; i < e.links.length; i++) {
            const lag = i * 0.42;
            const lx = -i * CFG.enemies.worm.beadGap;
            const ly = Math.sin((e.t - lag) * e.period + e.phase) * e.amp - (e.y - e.baseY);
            e.links[i].position.x = lx;
            e.links[i].position.y = ly;
          }
        }
        break;
      }
      default:
        e.x -= e.speed * xf * dt;
        /* A mine going straight now leans toward the player as it comes — slow
           enough to fly around, fast enough that ignoring it is a decision. */
        if (e.type === 'mine') {
          const cap = M.mine.home * dt;
          e.y += Math.max(-cap, Math.min(cap, ship.y - e.y));
        }
    }

    // The drone's eye used to bob here. It cannot any more: the drone is a
    // rigid actor whose shadows are merged into one mesh, and a part that
    // moves after that moves away from its own shadow.
    if (e.type === 'mine') e.art.rotation.z += dt * 0.9;

    /* Turrets track the player with the barrel. designs.wallTurret cuts its
       gun pointing +x, so the barrel's rotation IS the world aim angle; a
       floor turret can only sweep the upper half, which is what the clamp
       below is, and it is also why the gun never points into its own slab. */
    if (e.type === 'turret' && e.art.userData.gun) {
      const want = clampAim(Math.atan2(ctx.ship.y - e.y, ctx.ship.x - e.x));
      const gun = e.art.userData.gun;
      gun.rotation.z += Math.max(-dt * 2.2, Math.min(dt * 2.2, angleDelta(gun.rotation.z, want)));
      e.aim = gun.rotation.z;
    }

    /* Stage 2's canyon closes to a slot, and an enemy on a fixed line would
       fly through solid rock on the way to it. Flyers are held inside the gap;
       wall pieces set their own y and are left alone. */
    if (terrain && e.move !== 'static') {
      const lo = terrain.floorAt(e.x) + e.cfg.radius * 0.8;
      const hi = terrain.ceilAt(e.x) - e.cfg.radius * 0.8;
      if (hi > lo) {
        if (e.y < lo) { e.y = lo; if (e.move === 'bounce') e.vy2 = Math.abs(e.vy2); }
        else if (e.y > hi) { e.y = hi; if (e.move === 'bounce') e.vy2 = -Math.abs(e.vy2); }
      }
    }

    e.art.position.set(e.x, e.y, 0);

    if (e.fireRate > 0) {
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        // bigger interval = slower, so the curve DIVIDES it
        e.fireTimer = e.fireRate * (ctx.diff ? ctx.diff.enemyFireRate : 1)
          / (ctx.fireScale || 1);
        fireAtPlayer(e, ctx);
      }
    }

    if (e.x < ctx.layout.despawnX) retire(e);
  }

  /* A floor turret's world is the half-plane above its bracket: 0 is straight
     ahead to the right, PI is straight back to the left. It never aims below
     either of those, because that is into the wall it is bolted to. */
  function clampAim(a) {
    const x = a < 0 ? -a : a;            // fold the lower half up
    return Math.max(0.18, Math.min(Math.PI - 0.18, x));
  }
  function angleDelta(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* A ring of shots. The urchin does this on a timer and the puffer does it
     once, as it pops. */
  function burstSpines(e, ctx, n, mul) {
    if (!bullets) return;
    const sp = CFG.enemyFire.speed * (ctx.diff ? ctx.diff.enemyBulletSpeed : 1) * (mul || 1);
    const count = Math.max(3, Math.round(n * (ctx.diff ? ctx.diff.shotsPerBurst : 1)));
    const off = Math.random() * Math.PI;
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      bullets.fireEnemy(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 1);
    }
    if (hooks.onEnemyFire) hooks.onEnemyFire(e);
  }

  function fireAtPlayer(e, ctx) {
    if (!bullets || !ctx.ship.alive) return;
    if (e.type === 'urchin') { burstSpines(e, ctx, e.cfg.spines, 0.85); return; }
    if (e.type === 'crab') {
      // straight out of the rock it is standing on, whichever way up that is
      const a = e.anchor === 'ceil' ? -Math.PI / 2 : Math.PI / 2;
      const sp2 = CFG.enemyFire.speed * (ctx.diff ? ctx.diff.enemyBulletSpeed : 1);
      const off = e.cfg.radius * 0.8;
      bullets.fireEnemy(e.x, e.y + Math.sin(a) * off, Math.cos(a) * sp2 * 0.15, Math.sin(a) * sp2, 1);
      if (hooks.onEnemyFire) hooks.onEnemyFire(e);
      return;
    }
    const sp = CFG.enemyFire.speed * (ctx.diff ? ctx.diff.enemyBulletSpeed : 1);
    // A turret fires along the barrel it is actually pointing, so the player
    // can read the shot before it happens. Everything else fires at the ship.
    const a = e.type === 'turret' && e.aim !== undefined
      ? e.aim
      : Math.atan2(ctx.ship.y - e.y, ctx.ship.x - (e.x - CFG.enemyFire.spawnOffset));
    const off = e.type === 'turret' ? e.cfg.radius * 0.9 : CFG.enemyFire.spawnOffset;
    const ox = e.type === 'turret' ? e.x + Math.cos(a) * off : e.x - off;
    const oy = e.type === 'turret' ? e.y + Math.sin(a) * off : e.y;
    bullets.fireEnemy(ox, oy, Math.cos(a) * sp, Math.sin(a) * sp, 1);
    if (hooks.onEnemyFire) hooks.onEnemyFire(e);
  }

  /* ---------------------------------------------------------------- boss */

  function stepBoss(e, dt, ctx) {
    const { layout, ship, diff } = ctx;
    if (e.state === 'enter') {
      e.x -= CFG.boss.enterSpeed * dt;
      if (e.x <= layout.bossHomeX) { e.x = layout.bossHomeX; e.state = 'fight'; runPhase(e, ctx, true); }
    } else {
      e.y = e.baseY + Math.sin(e.t * CFG.boss.bobRate * Math.PI * 2) * CFG.boss.bobAmp;
      // it leans toward the player, slowly, so camping one corner does not work
      e.baseY += Math.max(-8 * dt, Math.min(8 * dt, (ship.y - e.baseY) * 0.25 * dt));
      e.baseY = Math.max(-16, Math.min(16, e.baseY));
      runScript(e, dt, ctx);
    }

    // the weak point breathes, faster once it is angry
    const eye = e.art.userData.eye;
    if (eye) {
      const k = 1 + Math.sin(e.t * (e.phase2 ? 9 : 4.5)) * (e.phase2 ? 0.16 : 0.09);
      eye.scale.setScalar(k);
    }
    if (e.art.userData.crown) e.art.userData.crown.rotation.z += dt * (e.phase2 ? 0.5 : 0.22);
    if (shutter.visible) {
      shutter.scale.setScalar(0.6 + 0.4 * Math.min(1, e.shutterFor * 3));
      shutter.rotation.z += dt * 1.6;
    }
    if (e.shutterFor > 0) {
      e.shutterFor -= dt;
      if (e.shutterFor <= 0) { e.shutterFor = 0; shutter.visible = false; }
    }

    e.art.position.set(e.x, e.y, 0);
  }

  /* Which list of patterns applies at this much health. Phases are written
     from full downward, so the LAST one whose threshold we are still under is
     the one in force. */
  function runPhase(e, ctx, force) {
    if (!e.phases || !e.phases.length) return;
    const frac = e.hp / e.maxHp;
    let ix = 0;
    for (let i = 0; i < e.phases.length; i++) if (frac <= e.phases[i].at) ix = i;
    if (ix === e.phaseIx && !force) return;
    e.phaseIx = ix;
    e.stepIx = 0;
    e.stepLeft = 0;
    e.phase2 = ix > 0;
    if (ix > 0 && hooks.onBossPhase) hooks.onBossPhase(e);
  }

  /* Run the current step; when its time is up, start the next one, looping
     round the phase's list. The pattern library does the firing and owns the
     wind-up that warns the player it is coming. */
  function runScript(e, dt, ctx) {
    if (!patterns || !e.phases || !e.phases.length) return;
    ctx.boss = e;                     // the library fires from whoever is boss
    runPhase(e, ctx, false);
    const steps = e.phases[e.phaseIx].steps;
    if (!steps || !steps.length) return;

    e.stepLeft -= dt;
    if (e.stepLeft <= 0) {
      const step = steps[e.stepIx % steps.length];
      e.stepIx = (e.stepIx + 1) % steps.length;
      e.stepLeft = step[2] || 3;
      patterns.begin(step[0], step[1], ctx);
      /* The shutter boss opens its second weak point between patterns — which
         is exactly when the player has a gap to fly into and something to do
         with it. */
      if (e.variant === 'shutter') {
        e.shutterFor = CFG.boss.shutterOpen * (e.phase2 ? 0.72 : 1);
        shutter.visible = true;
      }
      if (hooks.onBossFire) hooks.onBossFire(e);
    }
    patterns.update(dt, ctx);
  }

  function countFor(n, diff) {
    return Math.max(1, Math.round(n * (diff ? diff.shotsPerBurst : 1)));
  }


  /* -------------------------------------------------------------- damage */

  /* Returns true if this damage killed it. `partIndex` decides how much of the
     shot actually lands — the boss's hull eats most of it, the weak point does
     not. Beam hits pass a stamp so a piercing beam hits each enemy once. */
  function damage(e, amount, partIndex, stamp) {
    if (!e.alive || e.dying > 0) return false;
    if (stamp !== undefined) {
      if (e.beamStamp === stamp) return false;
      e.beamStamp = stamp;
    }
    const scale = partIndex === undefined ? 1 : e.pd[partIndex];
    e.hp -= amount * scale;
    e.flash = CFG.fx.hitFlash;
    /* Shooting a baitball scatters it: the fish nearest the hit are shoved
       outward and swim back in over the next second and a half. */
    if (e.type === 'baitball' && e.scatterX && e.links) {
      const hx = partIndex === undefined ? e.x : e.px[partIndex];
      const hy = partIndex === undefined ? e.y : e.py[partIndex];
      for (let i = 0; i < e.links.length; i++) {
        const dx = (e.x + e.links[i].position.x) - hx;
        const dy = (e.y + e.links[i].position.y) - hy;
        const d = Math.hypot(dx, dy) || 1;
        const push = e.cfg.scatter * Math.max(0, 1 - d / 9);
        e.scatterX[i] += (dx / d) * push;
        e.scatterY[i] += (dy / d) * push;
      }
    }
    if (e.isBoss && !e.phase2 && e.hp <= e.maxHp * CFG.boss.phase2At) {
      e.phase2 = true;
      if (hooks.onBossPhase) hooks.onBossPhase(e);
    }
    if (e.hp <= 0) { kill(e); return true; }
    if (hooks.onHurt) hooks.onHurt(e, partIndex);
    return false;
  }

  function kill(e) {
    if (e.isBoss) {
      e.dying = CFG.boss.deathStageTime;
      e.deathStage = 0;
      if (hooks.onBossDying) hooks.onBossDying(e);
      return;
    }
    e.alive = false;
    if (hooks.onKill) hooks.onKill(e);
    detach(e);
  }

  /* The boss comes apart in stages: a burst, a shrink, a pause, again. Five of
     them, which is long enough to feel earned and short enough that a seven
     year old does not wander off. */
  function stepDeath(e, dt, ctx) {
    e.dying -= dt;
    e.x -= 4 * dt;
    e.art.rotation.z += dt * 0.6;
    e.art.scale.setScalar(Math.max(0.15, e.art.scale.x - dt * 0.38));
    if (e.dying <= 0) {
      e.deathStage++;
      if (hooks.onBossShred) hooks.onBossShred(e, e.deathStage);
      if (e.deathStage >= CFG.boss.deathStages) {
        e.alive = false;
        e.dying = 0;
        detach(e);
        if (hooks.onBossDead) hooks.onBossDead(e);
        return;
      }
      e.dying = CFG.boss.deathStageTime;
    }
  }

  function retire(e) {
    e.alive = false;
    detach(e);
  }

  function detach(e) {
    if (e.art.parent) e.art.parent.remove(e.art);
  }

  function clear() {
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      e.alive = false;
      e.dying = 0;
      detach(e);
    }
  }

  function anyAlive() {
    for (let i = 0; i < all.length; i++) if (all[i].alive) return true;
    return false;
  }

  function dispose() {
    clear();
    if (group.parent) group.parent.remove(group);
  }

  /* A new stage means a new ramp, and every actor has its colours baked into
     its materials — so the cast is cut again. It is the same work the boot
     does and it happens once per stage, behind the stage-clear card. Pools,
     part arrays and every gameplay field survive: only the art is replaced. */
  function setRamp(name) {
    if (name === rampName) return;
    rampName = name;
    clear();
    for (const type in pools) {
      for (const e of pools[type]) {
        disposeObject(e.art);
        e.art = builders[type]();
        collapseShadows(type, e.art);
        e.links = partsOf(e.art);
      }
    }
    disposeObject(bossArt);
    bossArt = bossHulk({ rampName, radius: CFG.boss.radius });
    mergeActorShadows(bossArt);
    shutter = makeShutter();
    bossArt.add(shutter);
    boss.art = bossArt;
  }

  return {
    group, all, boss, spawn, update, damage, kill, clear, anyAlive, dispose, setRamp,
  };
}
