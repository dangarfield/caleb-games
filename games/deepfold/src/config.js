/* config.js — every number the game can be tuned by, in one place.
 *
 * The rule for this file: if a value would ever be argued about ("the beam is
 * too weak", "Ezra keeps dying on the third wave"), it lives here and nowhere
 * else. Gameplay modules import CFG and read through it; none of them carry a
 * literal that matters.
 *
 * Units are world units and seconds throughout. The visible play area is 100
 * world units tall (camera.js VIEW_HEIGHT) and 100 * aspect wide, centred on
 * the origin — so y runs -50..50 always, and x runs -halfW..halfW where halfW
 * is 50 * aspect. Anything expressed as a fraction of the width is written as
 * a fraction here and resolved at runtime, so the game plays the same on a
 * 4:3 iPad and a 19.5:9 phone.
 */

export const CFG = {

  /* ------------------------------------------------------------- the stages */

  /* Defaults and the things that are true of every stage. `rampName` here is
     the HOUSE ramp: the ship, the pod, the pickups and the end card are cut
     from it and stay that colour all game, so the player's own colour language
     never changes under them. A stage's own ramp dresses the world — backdrop,
     terrain, enemies — and is in the table below. */
  stage: {
    rampName: 'STAGE1',
    scrollSpeed: 26,
    seconds: 100,
    bossSeconds: 9999,        // a boss fight itself is untimed
    /* Failsafe: this long past `seconds`, the boss arrives whether or not the
       wave script has finished draining. See waves.js. */
    bossDeadline: 12,
  },

  /* THE THREE STAGES.
   *
   * Everything that makes a stage feel like itself is here: its ramp, how fast
   * the world comes at you, the shape of its canyon and which fight ends it.
   * The formations themselves are tables in waves.js.
   *
   *   1 Paper Reef    open water, drone swarms, an aiming boss
   *   2 Coral Cut     the squeeze — the walls pinch to a gap and there are
   *                   turrets clamped either side of it; a sweeping boss
   *   3 Violet Deep   open again but crowded: worms, jellyfish, mine fields,
   *                   crossfire, and a boss whose second weak point is only
   *                   open between its volleys
   */
  stages: [
    {
      name: 'Paper Reef', rampName: 'STAGE1', seed: 4,
      seconds: 100, scrollSpeed: 26,
      terrain: {
        amplitude: 6, floorBase: -41, ceilBase: 41,
        pinch: 0, pinchK: 1, bossOpen: 0, t0: 0.06, t1: 0.52,
      },
      boss: {
        label: 'PAPER HULK', hp: 150, weak: 'eye',
        /* The teaching boss. Two patterns, both slow and both readable: an
           aimed three-round burst that shows you what "aimed" means, then a
           wide fan with gaps you can walk through. */
        phases: [
          { at: 1.00, steps: [['burst', {}, 3.2], ['fan', {}, 3.6]] },
          { at: 0.45, steps: [['burst', { every: 0.9 }, 2.8], ['fan', { n: 7 }, 3.4]] },
        ],
      },
    },
    {
      name: 'Coral Cut', rampName: 'STAGE2', seed: 11,
      seconds: 105, scrollSpeed: 28,
      terrain: {
        amplitude: 3.5, floorBase: -41, ceilBase: 41,
        pinch: 26, pinchK: 2, bossOpen: 18, t0: 0.08, t1: 0.54,
      },
      boss: {
        label: 'REEF BREAKER', hp: 190, weak: 'eye',
        /* A sweep you ride behind, then a fan while you are still moving. */
        phases: [
          { at: 1.00, steps: [['gatling', {}, 4.5], ['fan', { n: 7 }, 3.0]] },
          { at: 0.50, steps: [['gatling', { rate: 1.1, every: 0.07 }, 4.5], ['fan', { n: 9 }, 3.0], ['burst', {}, 2.0]] },
        ],
      },
    },
    {
      name: 'Kelp Forest', rampName: 'KELP', seed: 31,
      seconds: 105, scrollSpeed: 29,
      terrain: {
        amplitude: 5, floorBase: -42, ceilBase: 42,
        pinch: 0, pinchK: 1, bossOpen: 10, t0: 0.05, t1: 0.48,
        /* Vertical columns to thread: the stage's whole identity. A column
           spans the canyon except for one gap, and the gap wanders. */
        obstacle: 'column', every: 3.6, width: 7, gap: 36, gapVary: 15, gapRate: 0.9,
      },
      boss: {
        label: 'KELP WARDEN', hp: 240, weak: 'eye',
        /* A curtain with one sliding gap — you track the gap — and it calls in
           help while you are busy tracking it. */
        phases: [
          { at: 1.00, steps: [['curtain', {}, 5.0], ['summon', { type: 'drone', count: 3 }, 1.6], ['burst', {}, 2.4]] },
          { at: 0.50, steps: [['curtain', { every: 1.3, slide: 16 }, 5.0], ['summon', { type: 'puffer', count: 2 }, 1.6], ['fan', { n: 9 }, 2.6]] },
        ],
      },
    },
    {
      name: 'The Wreck', rampName: 'WRECK', seed: 47,
      seconds: 110, scrollSpeed: 30,
      terrain: {
        amplitude: 4.5, floorBase: -40, ceilBase: 40,
        pinch: 10, pinchK: 3, bossOpen: 12, t0: 0.06, t1: 0.50,
        /* Angular blocking geometry — man-made slabs adrift in the water. */
        obstacle: 'block', every: 2.4, width: 16, height: 11, sizeVary: 0.55, span: 30,
      },
      boss: {
        label: 'THE DREDGE', hp: 280, weak: 'eye',
        /* Two emitters converging on you, mines in the water, and a gatling
           sweep for when you think you have found a safe line. */
        phases: [
          { at: 1.00, steps: [['crossfire', {}, 4.2], ['summon', { type: 'mine', count: 3 }, 1.4], ['gatling', {}, 3.6]] },
          { at: 0.55, steps: [['crossfire', { every: 0.5 }, 4.2], ['summon', { type: 'mine', count: 4 }, 1.4], ['gatling', { rate: 1.2 }, 3.6], ['fan', { n: 9 }, 2.4]] },
        ],
      },
    },
    {
      name: 'Midnight Drift', rampName: 'MIDNIGHT', seed: 59,
      seconds: 110, scrollSpeed: 31,
      terrain: {
        amplitude: 7, floorBase: -45, ceilBase: 45,
        pinch: 0, pinchK: 1, bossOpen: 6, t0: 0.10, t1: 0.56,
      },
      boss: {
        label: 'LANTERN', hp: 300, weak: 'eye',
        /* A telegraphed laser filling half the screen, alternating halves, so
           the fight is about committing early — and slow homing seeds that
           make committing cost something. */
        phases: [
          { at: 1.00, steps: [['beam', {}, 4.6], ['seeds', {}, 3.4]] },
          { at: 0.55, steps: [['beam', { warn: 0.9, on: 1.3 }, 4.4], ['seeds', { n: 3 }, 3.0], ['burst', {}, 2.0]] },
        ],
      },
    },
    {
      name: 'Violet Deep', rampName: 'STAGE3', seed: 23,
      seconds: 110, scrollSpeed: 32,
      terrain: {
        amplitude: 6.5, floorBase: -43, ceilBase: 43,
        pinch: 0, pinchK: 1, bossOpen: 6, t0: 0.95, t1: 0.58,
      },
      boss: {
        label: 'NIGHT BLOOM', hp: 330, weak: 'shutter',
        /* Keeps its second weak point, shut except between volleys — now with
           expanding rings and a turning spiral to read around. */
        phases: [
          { at: 1.00, steps: [['bloom', {}, 4.4], ['burst', {}, 2.2]] },
          { at: 0.60, steps: [['bloom', { n: 16, gaps: 3 }, 4.4], ['spiral', {}, 4.0]] },
          { at: 0.30, steps: [['spiral', { arms: 4, rate: 2.2 }, 4.0], ['bloom', { n: 18, gaps: 3 }, 3.6], ['fan', { n: 11 }, 2.4]] },
        ],
      },
    },
    {
      name: 'The Trench', rampName: 'TRENCH', seed: 71,
      seconds: 120, scrollSpeed: 34,
      terrain: {
        /* The walls are close overhead for the whole stage — that is the
           trench. The canyon never opens above about seventy units and closes
           to under forty, and the boss has to shove it open to fit. */
        amplitude: 4, floorBase: -30, ceilBase: 24,
        pinch: 6, pinchK: 2, bossOpen: 24, t0: 0.04, t1: 0.46,
      },
      boss: {
        label: 'TRENCH MOTHER', hp: 420, weak: 'shutter',
        /* The last fight. Three patterns learned one at a time, then all three
           at once for the final quarter. */
        phases: [
          { at: 1.00, steps: [['spiral', {}, 4.5], ['burst', {}, 2.0]] },
          { at: 0.75, steps: [['halfWall', {}, 4.5], ['spiral', { arms: 3 }, 3.5]] },
          { at: 0.50, steps: [['rain', {}, 4.0], ['halfWall', { every: 1.3 }, 4.0], ['seeds', {}, 2.5]] },
          { at: 0.25, steps: [['spiral', { arms: 4, rate: 1.9 }, 3.2], ['rain', { every: 0.18 }, 3.2], ['halfWall', { every: 1.2 }, 3.6], ['bloom', { n: 18, gaps: 3 }, 3.0]] },
        ],
      },
    },
  ],


  /* -------------------------------------------------------------- the ship */
  ship: {
    len: 9,                   // nose-to-tail, matches designs.playerShip
    /* Ten, on both difficulties. Seven folds is a long way for a seven year
       old and running out of lives on fold two means never seeing fold six;
       the difficulty is in the stages, not in how many goes you get. */
    lives: 10,

    /* The hitbox is deliberately tiny next to the 9-unit sprite. Classic shmup
       fairness: what kills you has to visibly hit the middle of the ship. */
    hitRadius: 1.2,

    /* Touch follow. The ship lerps toward the finger at `follow` per second
       (an exponential approach, so it is frame-rate independent) and is held
       `fingerOffsetY` above it so a thumb never covers the thing it is flying.
       maxSpeed caps the approach so a finger teleporting across the screen
       does not teleport the ship with it. */
    follow: 14,
    fingerOffsetY: 9,
    maxSpeed: 190,

    /* Keyboard flies at a flat rate; accel smooths the start and stop. */
    keySpeed: 62,
    keyAccel: 9,

    /* Station keeping: fractions of the half-width. The ship lives in the
       left third — far enough right to dodge, never so far right that it
       meets enemies at the spawn line. */
    xMinFrac: -0.92,
    xMaxFrac: 0.30,
    yMargin: 4,               // clearance kept from the top/bottom of the view

    /* Guns. rate is seconds between shots; auto-fire is always on. */
    fireRate: 0.155,
    bulletSpeed: 165,
    bulletDamage: 1,
    muzzleX: 4.6,             // where a shot leaves the nose

    spreadAngle: 0.26,        // radians off-axis for the 3-way SPREAD shot
    spreadRate: 0.19,

    speedBoost: 1.42,         // SPEED multiplies follow + keySpeed by this
    invulnTime: 2.1,          // after a hit
    startInvuln: 1.4,         // at the start of a life / the stage
    flashHz: 11,              // blink rate while invulnerable
    respawnDelay: 0.85,       // pause between the burst and flying again
  },

  /* ------------------------------------------------------- the Wave Cannon */
  charge: {
    /* Held on its own button now — hold-still-to-charge is gone, because not
       moving is something a player does constantly and the cannon kept
       winding up when nobody asked it to. */
    full: 1.15,               // seconds from press to a full beam
    minFire: 0.22,            // below this a release does nothing
    life: 0.34,               // how long the beam stays on screen
    height: 8,                // beam thickness at minimum charge
    heightFull: 15,           // ... and at full charge
    damage: 5,                // at minimum charge
    damageFull: 16,           // at full charge
    pierce: true,
    knock: 0,
  },

  /* ---------------------------------------------------------- the Force pod */
  force: {
    radius: 3.4,
    hitRadius: 3.6,
    /* Docked offsets. The ship is nine units nose to tail and the pod is a
       nearly seven-unit disc, so anything under about nine here parks the pod
       ON the nose and the two stop reading as two objects — the nose flash in
       particular disappears under it. These leave a clear gap at both ends. */
    dockNose: 10.2,           // x offset when docked at the nose
    dockTail: -10.0,          // ... and at the tail
    dockLerp: 18,             // how hard it snaps back into the dock
    launchSpeed: 96,
    stopFrac: 0.40,           // it halts this far across the half-width
    recallSpeed: 118,
    contactDamage: 20,        // per touch, per enemy, per contactCooldown
    contactCooldown: 0.18,
    fireRate: 0.42,           // it shoots on its own while detached
    bulletSpeed: 128,
    bulletDamage: 1,
    spin: 2.2,                // radians/sec while detached — it looks alive
  },

  /* ------------------------------------------------------------- projectiles */
  bullets: {
    playerMax: 90,
    podMax: 30,
    /* The late bosses lay down curtains and full rings; 150 was a pool that
       ran dry mid-pattern, which reads as the boss stuttering. */
    enemyMax: 300,
    playerSize: 2.2,
    podSize: 2.0,
    enemySize: 2.1,
    enemyRadius: 1.5,         // collision radius of an enemy shot
    cullMargin: 14,           // units past the view edge before recycling
  },

  /* ----------------------------------------------------------- the pacing */

  /* THE INTENSITY CURVE.
   *
   * Before this, second 5 and second 95 of a stage were the same game: the
   * only thing that changed was whatever the wave table happened to say next.
   * The curve makes the ramp explicit and tunable in one place — it multiplies
   * how fast things come at you, how often they arrive, and how often they
   * shoot, as a function of how far into the stage you are.
   *
   * Shape: flat through `warmUp` (a seven-year-old needs a few seconds to get
   * into the air), then smoothstep up to `peak` by `full`, then held at peak
   * for the run in to the boss. With a 100-second stage that is: 15 seconds
   * gentle, 65 seconds climbing, the last 20 at full tilt.
   *
   * The three axes are weighted separately because they are not felt equally:
   * speed and density are what make a stage feel alive, and enemy fire rate
   * climbing at the same rate as everything else makes it feel unfair instead.
   */
  curve: {
    peak: 1.35,               // intensity at the top of the ramp
    warmUp: 0.15,             // fraction of the stage held at 1.0
    full: 0.80,               // fraction by which the peak is reached
    speed: 1.0,               // how much of the curve enemy speed takes
    /* ... with a ceiling on it. Stage 3's multiplier on top of the curve on
       top of the base rise put a late drone at 150 units a second, which is
       under a second and a half across the screen — past the point where a
       player can react rather than guess. Density carries the late stage
       instead; speed stops climbing here. */
    speedMax: 1.6,
    /* Density needs MORE than the curve, not less, and this is why: everything
       also got faster, so each enemy is on screen for less time. At the same
       spawn rate a faster stage is an EMPTIER one — measured, the late stage
       had fewer enemies on screen on average than the early stage. `density`
       closes the gaps inside a formation and `count` makes the formation
       bigger; between them the last thirty seconds are actually crowded. */
    density: 1.4,             // ... the gap between the members of a formation
    count: 0.8,               // ... how many members it has
    fire: 0.75,               // ... enemy fire rate
    /* On top of the curve, per stage — a real climb across seven of them, not
       a nudge. Stage 7 opens harder than stage 1 ever gets and finishes at
       nearly twice stage 1's peak. */
    stage: [1.0, 1.12, 1.22, 1.32, 1.42, 1.52, 1.65],
  },

  /* Base speed, before the curve. The old numbers put a typical enemy at four
     to six seconds to cross the screen, which is the tameness in one figure;
     this brings that under three. Wave rows carry RELATIVE speeds and this
     scales all of them at once, so the whole game speeds up or slows down
     from here. */
  pace: {
    speedScale: 1.42,
  },

  /* Defaults for the movement patterns. A wave row can override any of them,
     but it rarely needs to — the row says which pattern, these say how it
     feels. */
  moves: {
    dive:    { hang: 1.1, rush: 2.0 },        // hang at the edge, then an attack run
    zigzag:  { amp: 12, period: 0.8 },        // sharp reversals, not a smooth sine
    strafe:  { creep: 0.35, track: 26, rushAt: 1.9, rush: 1.7 },
    loop:    { radius: 11, rate: 3.2, at: 0.22 },  // `at` is a fraction of half-width
    bounce:  { vy: 34 },                      // ricochets off the canyon
    drone:   { burstRate: 5.2, dart: 1.85, coast: 0.42 },  // darts rather than glides
    gunship: { rate: 1.5, retreat: 0.75 },    // advance and retreat while firing
    jelly:   { rise: 1.9 },                   // rises and sinks much further
    mine:    { home: 9 },                     // leans toward the player, dodgeably
  },

  /* ----------------------------------------------------------- the enemies */
  /* hp / score / radius are the gameplay side of designs.js. `pool` is how
     many of that type may be on screen at once — the pool is built at boot
     and never allocated from again. */
  enemies: {
    drone:   { pool: 24, hp: 1,  score: 100, radius: 3.6, speed: 42, fireRate: 0,    art: 'popcornDrone' },
    mine:    { pool: 16, hp: 3,  score: 150, radius: 4.2, speed: 20, fireRate: 0,    art: 'spikeMine' },
    gunship: { pool: 10, hp: 6,  score: 350, radius: 4.6, speed: 26, fireRate: 2.0,  art: 'gunship' },
    jelly:   { pool: 10, hp: 4,  score: 250, radius: 4.0, speed: 18, fireRate: 2.6,  art: 'jellyDrifter' },
    turret:  { pool: 8,  hp: 5,  score: 200, radius: 4.0, speed: 0,  fireRate: 1.9,  art: 'wallTurret' },
    /* The worm's hp is the WHOLE CHAIN's, not one bead's: five beads share one
       pool entry and one hit counter. At 2 it died to two shots, which is not
       a thing you learn to shoot the head of — it is 2 a bead, five beads. */
    /* --- the deeper water ------------------------------------------------
       Seven more, arriving with the stages that suit them. Each one is a
       different QUESTION: urchin asks where you are hugging, angler asks what
       you fly toward in the dark, puffer asks whether you had to go through
       there, ray asks what it left behind, baitball asks how you clear a
       crowd, crab asks about the floor, eel asks how fast you are. */
    urchin:  { pool: 10, hp: 4,  score: 220, radius: 3.6, speed: 0,  fireRate: 2.6, art: 'urchin',
               spines: 8 },                    // radial, in every direction at once
    angler:  { pool: 8,  hp: 5,  score: 400, radius: 4.2, speed: 22, fireRate: 0,   art: 'angler',
               range: 52, charge: 2.4 },       // sits dark, then commits
    puffer:  { pool: 10, hp: 2,  score: 180, radius: 3.6, speed: 18, fireRate: 0,   art: 'puffer',
               range: 17, inflate: 0.85, spines: 11, burstSpeed: 0.8 },
    ray:     { pool: 6,  hp: 5,  score: 320, radius: 4.4, speed: 28, fireRate: 0,   art: 'ray',
               dropEvery: 1.5 },               // lays mines behind it
    baitball:{ pool: 4,  hp: 9,  score: 260, radius: 1.9, speed: 24, fireRate: 0,   art: 'baitball',
               scatter: 7, regroup: 1.6 },     // shooting it scatters the fish
    crab:    { pool: 8,  hp: 5,  score: 240, radius: 3.2, speed: 15, fireRate: 2.2, art: 'crab' },
    eel:     { pool: 4,  hp: 12, score: 420, radius: 1.9, speed: 44, fireRate: 0,   art: 'eel',
               beads: 10, beadGap: 3.1, lunge: 2.6 },
    worm:    { pool: 4,  hp: 10, score: 300, radius: 2.6, speed: 34, fireRate: 0,    art: 'chainWorm', beads: 5, beadGap: 5.4 },
  },

  /* Enemy bullets. Aimed shots lead the player by `lead` seconds of travel. */
  enemyFire: {
    speed: 46,
    lead: 0.0,
    spawnOffset: 4.2,
  },

  /* ---------------------------------------------------------- the power-ups */
  powerups: {
    radius: 4.2,
    driftSpeed: 14,           // they drift left a little slower than the stage
    bob: 6,                   // sine amplitude
    bobRate: 2.2,
    life: 13,
    pool: 6,
    score: 50,
    /* A carrier is any enemy flagged `carries` in the wave script. This is the
       chance it actually drops, so a wave of three carriers is not three
       power-ups. Easy raises it (see difficulty). */
    dropChance: 0.75,
    duration: 15,             // how long SPEED and SPREAD last
    order: ['SPREAD', 'SPEED', 'SHIELD'],
  },

  /* --------------------------------------------------------------- terrain */
  terrain: {
    slabWidth: 92,            // one chunk of wall
    overlap: 2,               // chunks are pitched this much closer than their
                              // width, so a join never opens into a gap
    slabs: 7,                 // chunks in the conveyor, per side. slabs*(width
                              // - overlap) is also the profile's PERIOD, which
                              // is what lets a chunk be recycled without a seam
    layers: 7,                // bands under the surface — must reach off-screen
    bandWidth: 3.4,
    samples: 36,              // profile samples across one chunk
    /* Fallbacks. The live values are per stage, in `stages[i].terrain`: a
       stage picks its own wander, bases, pinch and band ramp. Keep
       base + amplitude*1.84 (the sum of the profile's three terms) + pinch
       inside the screen, or the wall stops being visible at its lowest. */
    t0: 0.06, t1: 0.52,
    /* The near-white sheet laid over band 0 — the face you crash into. null
       means the kit's rim white, which is the brightest thing available and is
       what every stage uses; a stage may override it with a hex. */
    topColor: null,
    amplitude: 6,
    floorBase: -41,
    ceilBase: 41,
    pinch: 0,
    pinchK: 1,
    bossOpen: 0,
    openLerp: 1.6,            // how fast the walls draw back for a boss
    lethal: true,
    graceRadius: 0.4,         // forgiveness on top of the ship's own hitbox
    /* The ship's kill-me hitbox is 1.2 units against a 9-unit sprite, which is
       right for bullets and wrong for a wall: clipping a cliff with a wingtip
       and living looks like a bug. Terrain is checked against a bigger circle
       than bullets are. */
    shipRadiusScale: 2.4,
  },

  /* ------------------------------------------------------------- the boss */
  boss: {
    radius: 20,
    hp: 150,
    hitRadius: 17,            // the hull — shots land but do little
    /* The weak point is deliberately generous. A shot takes about half a
       second to cross the screen, so a boss that bobs faster than the player
       can predict has a weak point that can only be hit by accident. Between
       this radius, the bob below and the player's bullet speed, a player who
       parks on the boss's line lands most of their shots. */
    eyeRadius: 9,             // the weak point
    hullDamageScale: 0.18,    // a hull hit is worth this fraction of a shot
    enterSpeed: 26,
    homeFrac: 0.50,           // settles this far across the half-width
    bobAmp: 10,
    bobRate: 0.30,
    /* Firing is no longer a rate and a spread: it is a SCRIPT, per boss, in
       that boss's entry in `stages` above, built out of the pattern library in
       patterns.js. Phase changes are hp thresholds in the same place. */

    /* A boss whose `weak` is 'shutter' carries a SECOND weak point that is
       shut except for a window between patterns, worth double when it is
       open. The others have the one eye. */
    shutterOpen: 1.35,        // seconds the second weak point stays open
    shutterDamage: 2.2,       // ... and what a hit on it is worth
    shutterRadius: 5.4,
    shutterOffset: -11,       // where it sits on the hull, x
    eyeRadiusClosed: 9,
    score: 5000,
    deathStages: 5,           // multi-stage paper shred
    deathStageTime: 0.42,
  },

  /* ----------------------------------------------------------- difficulty */
  /* Multipliers applied on top of everything above. Easy is the default: the
     enemies fire less, their shots are slower, they die quicker, and the
     player's hitbox is a touch smaller still. */
  difficulty: {
    easy: {
      label: 'Easy',
      enemyFireRate: 2.45,    // multiplies the interval, so BIGGER = slower
      enemyBulletSpeed: 0.66,
      enemyHp: 0.75,
      bossHp: 0.6,
      bossFireRate: 1.8,
      shotsPerBurst: 0.6,     // scales fan counts, rounded up, min 1
      playerHitScale: 0.82,
      dropChance: 1.35,
      lives: 0,               // ADDS this many lives (both difficulties get 10)
      /* Easy gets a SHALLOWER RAMP, not a flatter game: it sees about half the
         curve's climb and a little under the base speed rise, so stage 1 stays
         finishable by a seven-year-old while Normal gets the full thing. */
      /* Easy sees under half the curve's climb. It was 0.5 when the game was
         three stages; seven stages with a steeper stage multiplier on top
         needed it pulled back again, or the early stages inherit the late
         game's pace. */
      curveScale: 0.42,
      speedScale: 0.82,
      /* Stage 2's narrows are cut shallower on Easy. It is the one piece of
         difficulty that is geometry rather than numbers, so it is applied when
         the walls are built — see applyStage. */
      pinchScale: 0.68,
    },
    normal: {
      label: 'Normal',
      enemyFireRate: 1,
      enemyBulletSpeed: 1,
      enemyHp: 1,
      bossHp: 1,
      bossFireRate: 1,
      shotsPerBurst: 1,
      playerHitScale: 1,
      dropChance: 1,
      lives: 0,
      pinchScale: 1,
      curveScale: 1,
      speedScale: 1,
    },
  },

  /* ------------------------------------------------------------ particles */
  fx: {
    confettiMax: 460,
    killBurst: 16,
    bigBurst: 34,
    playerBurst: 46,
    bossBurst: 70,
    hitFlash: 0.09,           // how long an enemy shows its damage colour
    shakeOnHit: 1.4,
    shakeDecay: 5.5,
  },

  /* ------------------------------------------------------- teaching the pod */

  /* The Force pod is the best thing in the game and it is a circle that sits
     in front of the ship saying nothing about itself. Dan could not identify
     it cold, so it gets told: once per player, ever, two paper labels — one on
     the pod, one on the button that throws it. */
  hints: {
    life: 5.5,                // seconds on screen before it goes by itself
    fadeIn: 0.35,
    fadeOut: 1.2,
    podLabel: 'FORCE POD',
    btnLabel: 'TAP TO THROW IT',
    cardW: 34,
    cardH: 8.5,
  },

  /* ------------------------------------------------- the fold's opening */

  /* The controls introduce themselves when a fold loads: the buttons arrive
     one after another, and a short slip beside each says what it does.
     Seconds here, milliseconds in the CSS — controls.js converts.
   *
     It must never be in the way. Any touch or key skips the whole thing, the
     buttons are live from the first frame of the animation, and by the later
     folds the labels stop appearing at all — the entrance stays, because that
     is the part that makes a new fold feel like it is starting. */
  intro: {
    on: true,
    enterDur: 0.46,         // one button's arrival
    stagger: 0.09,          // between one button and the next
    hintIn: 0.32,
    hintOut: 0.42,
    hintHold: 2.2,          // fold 1: long enough to read at seven years old
    hintHoldLater: 1.1,     // folds 2..hintUntilFold
    hintUntilFold: 4,       // fold 5 and on: buttons only, no labels
    hintLead: 0.22,         // a slip follows its own button by this much
    labels: {
      beam: 'Hold to charge',
      pod: 'Throw the pod',
      pause: 'Pause',
      infinite: 'Never run out',
    },
  },

  /* ------------------------------------------------------------------ HUD */
  hud: {
    pillW: 300,
    pillH: 54,
    pillTop: 12,
    podBtn: 78,               // px — comfortably over the 64px tap minimum
    podBtnMargin: 18,
    chargeRing: 26,
  },

  /* ---------------------------------------------------------------- audio */

  /* The tune is a FILE (audio/deepfold-theme.webm), encoded six decibels
     down so it is already background level wherever it ends up — there is no
     volume control in the game and there is not going to be one. Everything
     below is the generated SFX, which play constantly UNDER that tune.
     `themeLevel` is the only number the element gets.
   *
     The mix rule: the sounds that happen many times a second sit far enough
     down that a stream of them is texture, and the rare ones — a power-up, a
     hit on a weak point, dying — are the only things allowed to cut through.
     A shot mixed at a level that sounds right on its own is unbearable at six
     a second. */
  audio: {
    master: 0.5,
    sfx: 0.55,              // everything generated, under the tune
    themeLevel: 0.5,        // on top of the 6dB already off the file
    /* Every shot detunes a little, so a burst is a texture rather than the
       same click repeated. A fraction of the base frequency. */
    pitchVary: 0.10,
    levels: {
      shot: 0.020,          // six a second, forever: the quietest thing here
      podShot: 0.022,
      charge: 0.030,        // a held whine; it is present, not loud
      beam: 0.105,          // earned, and over in a third of a second
      pop: 0.042,           // a small enemy coming apart
      popBig: 0.075,        // ... and a heavy one
      bossHit: 0.055,       // the weak point: this one has to read
      hurt: 0.030,          // an enemy taking a hit without dying
      hit: 0.200,           // the player dying. Rare, and it should land
      power: 0.130,         // rare and good
      roar: 0.150,          // a boss changing its mind
      ui: 0.070,
    },
  },

  /* --------------------------------------------------------------- saving */
  store: {
    key: 'calebArcadeData:deepfold',
    version: 1,
    players: ['Caleb', 'Ezra'],
  },
};

/* Resolve the width-fraction values once the view size is known. Called from
   main.js on every resize, so rotating the iPad re-fits the play box rather
   than leaving the ship clamped to the old one. */
export function layoutFor(viewWidth) {
  const halfW = viewWidth * 0.5;
  return {
    halfW,
    shipXMin: halfW * CFG.ship.xMinFrac,
    shipXMax: halfW * CFG.ship.xMaxFrac,
    spawnX: halfW + 14,
    despawnX: -halfW - 20,
    podStopX: halfW * CFG.force.stopFrac,
    bossHomeX: halfW * CFG.boss.homeFrac,
    cullX: halfW + CFG.bullets.cullMargin,
  };
}

export default CFG;
