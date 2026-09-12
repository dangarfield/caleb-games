// Shared tunables + the single mutable state object the GUI binds to.
// Everything the viewer can be poked at runtime lives here.

// --- Clip names, exactly as they come out of the .blend ---
export const CLIPS = {
    idle: 'Idle_BoyArmature',
    pedal: 'Pedaling_BoyArmature',
    fast: 'FastPedaling_BoyArmature',
    throwLeft: 'ThrowLeft_BoyArmature',
    fall: 'FallRight_BoyArmature',
    celebrate: 'Celebrate_BoyArmature',
};

// --- Orientation convention ---
// Forward down the street is +X. The boy model faces +X at rotation.y = 90deg,
// so his heading vector is (sin(yaw), 0, cos(yaw)):
//   yaw 90  -> (1, 0, 0)      straight down the street
//   yaw 120 -> (0.87, 0, -.5) 30deg to the RIDER'S LEFT, i.e. -Z (house side)
// Left is therefore -Z, which is where the mailboxes are (z ~ -4 to -8).
export const YAW_FORWARD = 90;

// Where a run begins.
export const START = { x: -280, y: 0.1, z: -1 };

// Blender OrthoCamera: loc=(-74.08, -17.2, 25.585) rot=(1.257, 0, -1.292) rad,
// ortho_scale=14.5. Blender (x,y,z) -> Three (x, z, -y).
export const ORTHO_SCALE = 14.5;
// Where the camera sits along its own view axis when framing. Orthographic, so
// this only has to keep things inside near/far — it does not affect scale.
export const FOLLOW_DISTANCE = 100;
// Aim point on the boy, in model-local units before boyScale (he is ~7.6 tall).
export const FOCUS_HEIGHT_LOCAL = 3.8;
// Rider+bike height in model-local units, for his collision box.
export const RIDER_HEIGHT_LOCAL = 7.6;
// Kerb probing. Movement is walked in KERB_SAMPLE-long steps so a tapered kerb
// is followed rather than stepped over; KERB_SIDE_PROBE is how far to the side
// we look to decide that steering that way is pointless.
export const KERB_SAMPLE = 0.04;
export const KERB_SIDE_PROBE = 0.12;
// The camera tracks his height far more slowly than he snaps to the ground, so
// kerbs and road markings don't bob the whole view.
export const CAMERA_Y_EASE = 0.6;
// Low-pass on dt. rAF delivery jitters by a millisecond or two; with the camera
// pinned to the boy, every wobble in dt reads as the whole world juddering.
export const DT_SMOOTHING = 0.15;

// --- Placeable entities (the enemy planner) ------------------------------
// One entry per type: box colour and size for the planner, how fast that kind
// of thing moves, plus how it behaves when the run is live. solid = crashing
// into it ends the run; paperPoints = score for hitting it with a paper;
// playerPoints = score for riding into it.
//
// speed is per TYPE, not per placed entity — every car moves at car speed. The
// sliders under Enemy Planner > Speeds edit these live.
//
// The KEYS below are what saved plans store, so they are frozen even when a
// label changes: 'dog'/'dog2' are Dog White/Dog Black and 'car'/'car2' are Car
// Straight/Car Side. Renaming a key would make adopt() drop every entity of
// that type from an existing plan.
//
// `size` is the nominal footprint, kept for reference and as the fallback box
// for a type with no model yet — the live collider is measured from the model
// itself. `modelScale` separates variants that share a builder.
export const ENTITY_TYPES = {
    dog:        { label: 'Dog White',     colour: 0xf5f0e6, size: [0.70, 0.60, 0.35], speed: 4,   solid: true },
    dog2:       { label: 'Dog Black',     colour: 0x14161a, size: [0.85, 0.75, 0.40], speed: 5,   solid: true, modelScale: 1.2 },
    car:        { label: 'Car Straight',  colour: 0xe74c3c, size: [4.20, 1.50, 1.80], speed: 8,   solid: true },
    car2:       { label: 'Car Side',      colour: 0x1f6feb, size: [4.60, 1.55, 1.85], speed: 11,  solid: true, modelScale: 1.08 },
    runningMan: { label: 'Running Man',   colour: 0xff7ad9, size: [0.50, 1.75, 0.40], speed: 3,   solid: true, paperPoints: 25 },
    pedestrian: { label: 'Pedestrian',    colour: 0x4aa3ff, size: [0.50, 1.70, 0.40], speed: 1.4, solid: true },
    jackhammer: { label: 'Jackhammer',    colour: 0xffa500, size: [0.60, 1.80, 0.50], speed: 1,   solid: true, paperPoints: 25 },
    rcCar:      { label: 'RC Car',        colour: 0x00d2a0, size: [0.45, 0.20, 0.30], speed: 6,   solid: true },
    rcBoy:      { label: 'Sitting RC Boy',colour: 0x9b59b6, size: [0.55, 0.90, 0.60], speed: 0,   solid: true },
    tire:       { label: 'Runaway Tire',  colour: 0x2f3640, size: [0.65, 0.65, 0.22], speed: 5,   solid: true },
    lawnmower:  { label: 'Lawnmower',     colour: 0x2ecc71, size: [0.75, 0.95, 0.55], speed: 1.5, solid: true },
    wheelbarrow:{ label: 'Wheelbarrow',   colour: 0x95a5a6, size: [1.40, 0.70, 0.60], speed: 1.5, solid: true },
    barrowDown: { label: 'Wheelbarrow Fallen', colour: 0x6b7b7d, size: [1.40, 0.45, 0.90], speed: 0, solid: true },
    stereo:     { label: 'Stereo',        colour: 0x8b5a2b, size: [0.70, 0.40, 0.30], speed: 0,   solid: true },
    trike:      { label: 'Kid on Trike',  colour: 0xffd32a, size: [0.80, 1.00, 0.50], speed: 2,   solid: true },
    unicyclist: { label: 'Unicyclist',    colour: 0xff6f3c, size: [0.45, 1.95, 0.45], speed: 3.5, solid: true },
    papers:     { label: 'Papers',        colour: 0xa29bfe, size: [0.45, 0.20, 0.35], speed: 0,   playerPoints: 50 },
};

export const SPAWN_Y = 0.1;
// Bumped whenever this bundle changes. Check __pb.version in the console: if it
// does not match what you expect, the browser is serving cached modules.
export const VERSION = '2026-09-12 unlimited';
// localStorage item for this game's saved data (arcade convention).
export const STORE_KEY = 'calebArcadeData:paperboy';

// --- Collision roles -------------------------------------------------------
// The level is systematically named, so roles come from names: first rule that
// matches wins. Re-exporting from Blender keeps working as long as the naming
// holds, and new objects classify themselves.
export const ROLE_RULES = [
    [/^WarpedPanorama|^ScaleHuman/, 'ignore'],
    // Both halves of a hidden sign — the board and the number on it — before
    // the generic _Text rule below, which used to catch the number and leave it
    // floating in mid-air over targets nobody had hit yet.
    [/^Sign250_/, 'sign'],                          // revealed when its target is hit
    [/_Text$|^HouseNum_|_Arrow$/, 'ignore'],
    [/Window|_Win[LRFGS]|_Win\d|_WinFront|_WinGable/, 'window'],
    [/^Mailbox_(Body|Base|Flap|SUN)/, 'mailbox'],
    [/^Mailbox_Post/, 'obstacle'],
    [/^Target(_target)?/, 'target'],
    [/^HayBale/, 'haybale'],
    [/^Jump_\d+$/, 'ramp'],                         // ramps he rides up and launches off
    [/Water$|_Channel|ChannelFloor|MudWall/, 'hazard'],
    [/^Bridge_\d+_Deck$/, 'terrain'],
    [/^Bridge_\d+_(Rail|Post)/, 'obstacle'],
    [/^road-line/, 'ignore'],                  // painted markings, not surfaces
    [/^(drain|Drain_|Manhole)/, 'obstacle'],   // grates and covers are hazards
    [/^(Road|Cube|GrassPatch|PavePatch|DarkDirt|LightDirt|GrassEnd|FinishLine|FinishText|curb|c-taper|c-gap|c-pave)/, 'terrain'],
    [/^House\d*_(Path|Drive|GarageFloor|CorrFloor|Step|Stairs|FlowerBed)/, 'terrain'],
    [/^(FlowerBed|Steps_)/, 'terrain'],
    [/^(TrafficCone|Gravestone|TrashCan|Hydrant|Gate|StreetSign|Pillar|DirtWall|CrowdStand|Door_)/, 'obstacle'],
    [/^House/, 'obstacle'],                         // walls, roofs, chimneys
    [/.*/, 'ignore'],
];

// What each role does. solid = crash into it; paperPoints = score when a thrown
// paper reaches it; ground = counts as ridable surface for the height raycast.
// casts: worth a second draw in the shadow pass. Roads, pavements, painted
// lines and text are not — they are flat on the ground or tiny, and leaving
// them out takes ~1100 meshes out of every shadow frame.
export const ROLES = {
    terrain:  { ground: true },
    // Ridable like terrain, but the boy's own box decides when he is on one —
    // see Player.update. Still ground, so the height raycast uses it too.
    ramp:     { ground: true, ramp: true, casts: true },
    obstacle: { solid: true, casts: true },
    haybale:  { solid: true, paperPoints: 25, topple: true, casts: true },
    // hitScaleY: the paper only has to be over the target, not level with it —
    // its box is doubled upwards so a lofted throw still counts.
    target:   { solid: true, paperPoints: 200, revealSign: true, hitScaleY: 2, casts: true },
    window:   { paperPoints: 10 },
    mailbox:  { paperPoints: 250, paperRadius: 1.0, flap: true, casts: true },
    hazard:   { fatal: true },
    pickup:   { playerPoints: 50 },   // ready for the paper pickups
    npc:      { solid: true, paperPoints: 25 },  // running man / jackhammer guy
    sign:     { hidden: true },
    ignore:   {},
};

export const ROLE_COLOURS = {
    terrain: 0x2f6b2f, obstacle: 0xe74c3c, haybale: 0xd9a13b, target: 0xffd32a,
    window: 0x6c9bd1, mailbox: 0x00d2a0, hazard: 0x1f6feb, pickup: 0xa29bfe,
    npc: 0xff7ad9, sign: 0x888888,
};

// Colliders are bucketed along X in slices this wide; the street is ~760 long
// so a frame only ever tests the handful of boxes near the boy.
export const BUCKET_SIZE = 4;

// How close the boy has to be to a collider box, in XZ, to count as a hit.
// His collision footprint. A bike is long and narrow — about 1.5 by 0.6 at
// scale 0.2 — so one fat circle was both too wide at the sides and too short
// front-to-back. Tested instead as two circles along his heading.
export const PLAYER_RADIUS = 0.3;
export const PLAYER_PROBE_OFFSET = 0.45;
// How far below his origin his collision box starts — low enough to catch
// grates and manhole covers, which sit flush with the road.
export const PLAYER_FOOT_DROP = 0.15;

// Gravity for jumps, world units/sec^2. Deliberately heavier than real
// gravity: it keeps him from floating up over kerbs and makes the arc off a
// ramp feel snappy rather than moon-like. rampLaunch and jumpVelocity are sized
// against this, so changing one means revisiting the others.
export const GRAVITY = 22;

// Bones the clips animate badly and we drive from ground speed instead.
// Their tracks overshoot a full turn by ~8deg per cycle, so the loop snaps back
// once every ~1s; they also spin at a fixed rate whatever the speed. Stripped
// in assets.js, driven in player.js.
export const DRIVEN_BONES = ['CrankBone', 'WheelBone_Front', 'WheelBone_Rear'];
// Wheel radius in model-local units (mesh is 3.35 across), before boyScale.
export const WHEEL_RADIUS_LOCAL = 1.675;
// Pedal revolutions per wheel revolution. The rig animated them 1:1; 2.8 is
// roughly a real bike's gearing. Set to 1 to match the original clips.
export const CRANK_RATIO = 2.8;

// Which keys do what. Rebind here.
// --- The run -------------------------------------------------------------
// The UI palette is the boy himself: these are his GLB materials converted to
// sRGB, so the HUD blocks and his cap/shirt/bike are literally the same colours.
export const SKIN_COLOURS = {
    hatYellow: '#ffed00',      // CapYellow
    shirtBlue: '#6c9ee6',      // ShirtBlue
    bikeRed: '#d94242',        // BikeRed
    basketOrange: '#ffba00',   // BasketOrange
    paper: '#f2efe4',          // the thrown papers
    ink: '#14161a',
};

export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
export const PLAYERS = ['Caleb', 'Ezra'];
export const LIVES_PER_RUN = 5;      // for the whole week, not per day
export const PAPERS_MAX = 8;         // two rows of four in the HUD
export const INVULN_TIME = 2;        // seconds of grace after a continue
export const INVULN_FLASHES = 2;     // gold pulses in that time (one a second)
export const FINISH_FALLBACK_X = 449;

export const KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    pause: ['Escape'],
    right: ['ArrowRight', 'KeyD'],
    fast: ['ArrowUp', 'KeyW'],   // Shift is the jump now
    slow: ['ArrowDown', 'KeyS'],
    jump: ['ShiftLeft', 'ShiftRight', 'KeyJ'],
    editor: ['KeyE'],          // toggle the enemy planner
    gui: ['KeyG'],             // show/hide the tuning panel
    throw: ['Space'],
};

export const state = {
    // --- Paperboy ---
    boyVisible: true,
    boyWireframe: false,
    boyPosition: { ...START },
    boyRotationY: YAW_FORWARD,
    boyScale: 0.2,
    currentAnimation: CLIPS.idle,
    animationSpeed: 1,
    animationPaused: false,
    // --- Ride ---
    riding: false,
    paused: false,          // Esc
    forwardSpeed: 8,        // units/sec cruising
    fastSpeed: 14,          // units/sec while the fast key is held
    slowSpeed: 4,           // units/sec while the slow key is held
    slowClipRate: 0.5,      // Pedaling clip playback rate while going slow
    turnAngle: 30,          // degrees off forward when steering
    slowTurnAngle: 45,      // ...and in the slow gear, where he can turn harder
    turnLerp: 0.18,         // seconds to reach full steer / recentre
    fastEase: 0.18,         // seconds to ease between cruising and fast speed
    smoothMotion: true,     // low-pass dt (see DT_SMOOTHING)
    lateralClamp: 20,       // |z| limit on player movement
    throwSpeed: 10,         // paper speed
    throwAngle: 30,         // degrees FORWARD of straight-left; 0 throws square
                            // to his heading, negative throws behind him
    throwCooldown: 0.35,    // seconds between throws
    // --- Jumping ---
    jumpVelocity: 6,        // upward launch from the jump key
    rampLaunch: 7.5,        // upward speed off a ramp, whatever gear he is in
    rampMinRise: 0.2,       // a launch needs this much total climb. Jump ramps
                            // rise 0.30 and kerbs 0.10, so the height climbed
                            // separates them where slope alone cannot
    // --- Enemy planner ---
    planner: false,         // top-down placement mode
    plannerX: START.x,      // where along the street the plan view is centred
    plannerHeight: 24,      // world units visible top to bottom
    plannerCentreZ: -6,     // fixed: the slider is X only
    showPlan: true,         // draw the planned entities during play too
    // --- Collision ---
    collisions: true,
    crashEnabled: true,     // off = hits are reported but the ride continues
    showColliders: false,   // debug boxes, coloured by role
    score: 0,
    crashed: false,
    // --- Run state (the session owns these; the HUD only reads them) ---
    mode: 'boot',           // boot | home | ready | playing | paused | crashed | over
    player: '',             // whose run this is
    day: 0,                 // index into DAYS
    lives: LIVES_PER_RUN,
    unlimited: false,       // the ∞ toggle: crashes cost nothing
    papers: PAPERS_MAX,
    invuln: 0,              // seconds of post-continue grace left
    // --- Ground follow ---
    groundSnap: true,       // ride the level surface instead of y = 0
    groundOffset: 0,        // lift above the surface
    groundEase: 0.08,       // seconds to settle onto a new height (kerbs)
    kerbMaxSlope: 0.5,      // max rise per unit travelled. A kerb face is ~2.5,
                            // a dropped kerb / taper ~0.2, a jump ramp ~0.3 —
                            // so slope separates them where an absolute step
                            // height cannot
    kerbMinRise: 0.05,      // ...but a kerb also has to be this tall. Painted
                            // lines are only 0.026 proud of the road, and as a
                            // vertical edge their slope is ~0.8, so on slope
                            // alone they behaved like kerb faces
    groundMaxStep: 0.6,     // ignore surfaces this much higher than he stands
                            // now — the ray also hits mailboxes, steps and
                            // house floors, and he should collide with those,
                            // not climb them
    // --- Level ---
    levelVisible: true,
    levelWireframe: false,
    levelPosition: { x: 0, y: 0, z: 0 },
    levelRotationY: 0,
    levelScale: 1,
    showWarpedPanorama: false,
    showCrowd: true,
    // --- Camera ---
    useOrthoCamera: true,
    cameraZoom: 2,          // OrthographicCamera.zoom; >1 zooms in
    followPlayer: true,
    // Where the boy sits on screen while following, in normalised coords
    // (-1..1). x 0.3 keeps him right of centre so the houses he throws at stay
    // in shot on the left; y -1/3 is the lower rule-of-thirds line.
    frameAnchor: { x: 0.3, y: -1 / 3 },
    cameraPosition: { x: -354.08, y: 25.585, z: 17.2 }, // Three space; solved for while following
    cameraRotation: { x: 72.0208, y: 0, z: -74.0261 },                   // Blender euler, degrees
    // --- Scene ---
    showGround: true,
    showGrid: true,
    showAxes: false,
    bgColor: '#87ceeb',
    ambientIntensity: 0.5,
    dirLightIntensity: 1.5,
    hemiIntensity: 0.4,
    fogNear: 80,
    fogFar: 200,
    toneExposure: 1.0,
    shadowsEnabled: true,
};

// Slider ranges, so the GUI and any clamping agree on one set of numbers.
export const RANGE = {
    worldX: [-300, 450],     // level extent: street -286..203, panorama to 470
    cameraX: [-450, 450],    // worldX plus the framing offset
    lateral: [-20, 20],      // player Z
};
