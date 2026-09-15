/* main.js — Scripts/Game/main_game.gd and player_character.tscn, assembled.
 *
 * Boot order matches the original's game state machine: Bootup loads, Menu
 * shows the skater on a turntable, Level hands control over.
 *
 * Beyond the port: three parks instead of one (two of them the upstream debug
 * levels, one built from the upstream modules), a chase camera as the default
 * with the original's fixed rig kept as a setting, and a THPS-style objective
 * list per park.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STATS, P, LOOK, SKATERS, BUILD, GLASS } from './config.js';
import { Level, triplanarMaterial } from './level.js';
import { LEVELS, LevelProps } from './levels.js';
import { loadThpsManifest, offerLevel, thpsLevelDef, prepareThpsLevel, THPS_DIR } from './thps.js';
import { Carousel } from './carousel.js';
import { Music } from './music.js';
import { DressUp } from './dressup.js';
import { Goals } from './goals.js';
import { CharacterInput, ACTION_CHIP } from './input.js';
import { CharacterAnimation } from './anim.js';
import { CharacterTricks, TRICK_BOOK } from './tricks.js';
import { CharacterController, Fall } from './player.js';
import { buildStateMachine } from './states.js';
import { Inspector } from './inspect.js';
import { GameCamera } from './camera.js';
import { iconSvg } from './icons.js';
import { PIXEL_CAP, Settings } from './settings.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { Glass } from './glass.js';
window.__three = THREE;

const BASE = new URL('../', import.meta.url);
const asset = (p) => new URL('assets/' + p, BASE).href;
const GLBS = ['SK_char.glb'];

/**
 * Paint the skateboard from the skater's own colours.
 *
 * The board arrives as ONE mesh with ONE material — deck, trucks, bolts and
 * wheels all together — so the parts have to be found in the geometry rather
 * than looked up by name. They are separate closed shells, though, so a
 * union-find over shared vertices pulls them apart exactly: the deck is the
 * shell with the most vertices, and the wheels are the four small ones that
 * sit outboard of the trucks AND touch the ground. Both tests are needed —
 * the truck hangers reach just as low but straddle the centre line, and the
 * bolts sit outboard but nowhere near the floor.
 *
 * Thresholds are shares of the board's own bounding box, not absolute
 * numbers, so a re-export at another scale still works.
 *
 * Colours go on per TRIANGLE via a non-indexed copy. Per vertex would bleed
 * across the edge where the underside meets the side of the deck, because
 * that edge shares its vertices.
 */
function paintBoard(mesh, L) {
  let geo = mesh.geometry;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const vAt = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);

  /* weld by position: two shells that merely touch are still two shells */
  const seen = new Map();
  const rep = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * 1e4) + ',' +
              Math.round(pos.getY(i) * 1e4) + ',' +
              Math.round(pos.getZ(i) * 1e4);
    let v = seen.get(k);
    if (v === undefined) { v = seen.size; seen.set(k, v); }
    rep[i] = v;
  }
  const parent = new Int32Array(seen.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < triCount; t++) {
    const a = rep[vAt(t, 0)], b = rep[vAt(t, 1)], c = rep[vAt(t, 2)];
    const ra = find(a), rb = find(b), rc = find(c);
    if (ra !== rb) parent[rb] = ra;
    if (find(a) !== rc) parent[rc] = find(a);
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const halfW = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) || 1;
  const height = (bb.max.y - bb.min.y) || 1;

  /* measure every shell */
  const shell = new Map();
  for (let i = 0; i < pos.count; i++) {
    const r = find(rep[i]);
    let s = shell.get(r);
    if (!s) { s = { n: 0, ax: Infinity, lo: Infinity }; shell.set(r, s); }
    s.n++;
    s.ax = Math.min(s.ax, Math.abs(pos.getX(i)));
    s.lo = Math.min(s.lo, pos.getY(i));
  }
  let deck = -1, best = -1;
  for (const [r, s] of shell) if (s.n > best) { best = s.n; deck = r; }
  const isWheel = new Set();
  for (const [r, s] of shell) {
    if (r === deck) continue;
    if (s.ax > halfW * 0.45 && s.lo - bb.min.y < height * 0.12) isWheel.add(r);
  }

  if (geo.index) { geo = geo.toNonIndexed(); mesh.geometry = geo; }
  const np = geo.attributes.position;
  const col = new Float32Array(np.count * 3);
  const deckC = new THREE.Color(L.boardDeck);
  const wheelC = new THREE.Color(L.helmet);
  const underC = new THREE.Color(L.top);
  const ax = new THREE.Vector3(), bx = new THREE.Vector3(), cx = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const r = find(rep[vAt(t, 0)]);
    let c = deckC;
    if (isWheel.has(r)) c = wheelC;
    else if (r === deck) {
      ax.fromBufferAttribute(np, t * 3);
      bx.fromBufferAttribute(np, t * 3 + 1);
      cx.fromBufferAttribute(np, t * 3 + 2);
      e1.subVectors(bx, ax); e2.subVectors(cx, ax);
      nrm.crossVectors(e1, e2).normalize();
      /* the face you see when the board flips over */
      if (nrm.y < -0.3) c = underC;
    }
    for (let k = 0; k < 3; k++) {
      col[(t * 3 + k) * 3] = c.r;
      col[(t * 3 + k) * 3 + 1] = c.g;
      col[(t * 3 + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { wheels: isWheel.size, shells: shell.size };
}

/* Character part -> colour: character_data.gd's exported defaults with the
   chosen skater's own colours laid over the top. See SKATERS in config.js. */
function dressCharacter(root, skater) {
  const L = Object.assign({}, LOOK, (skater && skater.look) || {});
  const pick = (n) => {
    if (n.includes('body')) return { color: L.skin, roughness: 0.75 };
    if (n.includes('bottom')) return { color: L.bottom, roughness: 0.95 };
    if (n.includes('top')) return { color: L.top, roughness: 0.9 };
    if (n.includes('shoe')) return { color: L.shoes, roughness: 0.9 };
    if (n.includes('hair')) return { color: L.hair, roughness: 1.0 };
    if (n.includes('helmet')) return { color: L.helmet, roughness: 0.4, metalness: 0.05 };
    if (n.includes('headwear')) return { color: L.glass, roughness: 0.15, metalness: 0.4 };
    return { color: 0xbfc4cc, roughness: 0.8 };
  };
  root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    const name = ((o.name || '') + ' ' + ((o.material && o.material.name) || '')).toLowerCase();
    /* Tagged on the first pass, because painting the board replaces the
       material this test reads — without the tag, swapping skater re-dresses
       the model, fails to recognise the board a second time and hands it the
       plain grey default. */
    if (o.userData.isBoard || name.includes('skateboard')) {
      o.userData.isBoard = true;
      /* L, not LOOK: the board was being painted from the defaults, so both
         skaters rode the same one however their own boardDeck was set */
      o.material = new THREE.MeshStandardMaterial({
        vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.1
      });
      paintBoard(o, L);
      return;
    }
    const spec = pick(name);
    o.material = new THREE.MeshStandardMaterial({
      color: spec.color, roughness: spec.roughness, metalness: spec.metalness ?? 0.0
    });
  });
}

class Game {
  constructor() {
    this.el = {
      canvas: document.getElementById('c'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),

      loading: document.getElementById('loading'),
      loadingBar: document.getElementById('loadBar'),
      best: document.getElementById('bestVal')
    };
    this.hud = new Hud(document.body);
    this.sfx = new Sfx();
    /* the soundtrack is its own thing: streamed, not decoded — see music.js */
    this.music = new Music(asset, {
      onTrack: (t) => this._nowPlaying(t),
      onCanBack: (ok) => {
        const b = document.getElementById('prevBtn');
        if (b) b.disabled = !ok;
      },
      /* if not one track will play, say so where the title goes rather than
         sitting there silently */
      onTrouble: (why) => {
        console.warn('music:', why);
        this._nowPlaying('Music unavailable');
      }
    });
    this.input = new CharacterInput();
    this.settings = new Settings();
    this.mode = 'boot';       // boot | menu | play | pause | settings
    this.accum = 0;
    this.clock = new THREE.Clock();
    this.best = 0;
    this.levelId = null;
    this.saved = { levels: {} };
    /* chosen colours per skater, laid over the defaults in SKATERS */
    this.looks = {};
    /* filled from assets/thps/levels.json — every level in the game is a
       converted one now; see src/thps.js and _discoverThps */
    this.levels = LEVELS.slice();
    this.thpsGlb = {};
  }

  _level(id) { return this.levels.find((l) => l.id === id) || this.levels[0] || null; }

  async start() {
    this._renderer();
    this._scene();
    await this._load();
    await this._discoverThps();
    await this._store();
    this._buildPlayer();
    await this._loadLevel(this.levelId);
    this.input.attach(document.body);
    /* a developer tool, off until I is pressed — see inspect.js */
    this.inspect = new Inspector(this);
    this.inspect.attach();
    this.input.onBufferChange = (b) => this.hud.setBuffer(b);
    this._ui();
    this._applySettings();
    this.el.loading.classList.add('off');
    this.el.menu.classList.remove('off');
    this.mode = 'menu';
    this.renderer.setAnimationLoop(() => this._frame());
  }

  /* ------------------------------------------------------------ renderer */

  _renderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.el.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this._pixelRatio());
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    /* Godot renders this project with no tone mapping and the park's own flat
       materials; ACES crushed the charcoal grid to black, so leave it linear. */
    r.toneMapping = THREE.NoToneMapping;
    this.renderer = r;
    addEventListener('resize', () => this._resize());
  }

  /* devicePixelRatio, capped by the Resolution setting — see settings.js */
  _pixelRatio() {
    const cap = PIXEL_CAP[this.settings.get('resolution')] ?? 2;
    return Math.min(devicePixelRatio, cap);
  }

  _resize() {
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(innerWidth, innerHeight);
    const a = innerWidth / innerHeight;
    this.camera.aspect = a;
    /* the fixed rig is a 38 degree diorama; the chase camera wants a wider
       lens. Either way a portrait screen gets more of it, or the park will not
       fit on a phone. */
    const base = this.cam && this.cam.mode === 'follow' ? 55 : P.CAM_FOV;
    this.camera.fov = a < 1 ? Math.min(78, base / a) : base;
    this.camera.updateProjectionMatrix();
    if (this.rings) for (const r of Object.values(this.rings)) r.relayout();
  }

  _scene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fb6cc);
    /* the range is set per level from its own size — see _fitDistance */
    this.scene.fog = new THREE.Fog(0x9fb6cc, 46, 130);

    this.camera = new THREE.PerspectiveCamera(P.CAM_FOV, innerWidth / innerHeight, 0.3, 260);
    this.cam = new GameCamera(this.camera);

    /* the shard pool lives with the scene, not with a park: it outlives every
       level change and every break */
    this.glass = new Glass(this.scene, this.sfx);

    /* DirectionalLight3D out of bowlpark.tscn: its -Z is the light direction */
    const sun = new THREE.DirectionalLight(0xfff4e2, 2.1);
    this.sunDir = new THREE.Vector3(0.8386686, 0.4911942, 0.23529437).normalize();
    sun.castShadow = true;
    /**
     * ONE thing casts a shadow: the skater.
     *
     * A converted park carries its own lighting, baked into vertex colour by
     * Neversoft in 1999 — every shadow in it is already painted on. Casting
     * real ones over the top adds nothing you can see and puts the whole park
     * through a second render pass every frame. The rails were the worst of it:
     * 125 tube meshes in School II, each one drawn again into the shadow map
     * for the shadow of a 2.5 cm pipe.
     *
     * With only a 1.8 m character in the pass the box can be tiny, and a tiny
     * box is a sharper shadow: 34 m of it across 2048 pixels was 30 px/m, 6 m
     * across 1024 is 85 px/m. Nearly three times the detail for a quarter of
     * the map. The box follows the skater — see _frame. */
    sun.shadow.mapSize.set(1024, 1024);
    const s = 6;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
    sun.shadow.camera.updateProjectionMatrix();   // three only rebuilds it on demand
    sun.shadow.bias = -0.0009;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.scene.add(new THREE.HemisphereLight(0xcfe1f5, 0x4a4a48, 1.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  }

  async _load() {
    const loader = new GLTFLoader();
    const tex = new THREE.TextureLoader();
    let done = 0;
    const total = GLBS.length + 1;
    const bump = () => {
      done++;
      this.el.loadingBar.style.transform = `scaleX(${(done / total).toFixed(3)})`;
    };
    const loaded = await Promise.all([
      ...GLBS.map((f) => loader.loadAsync(asset(f)).then((g) => { bump(); return g; })),
      tex.loadAsync(asset('T_default_grey.png')).then((t) => { bump(); return t; })
    ]);
    this.glb = {};
    GLBS.forEach((f, i) => { this.glb[f] = loaded[i]; });
    /* the grid the apron is drawn with — the one material a converted level
       still needs, since it carries its own baked colour for everything else */
    this.mats = { grey: triplanarMaterial(loaded[GLBS.length]) };
  }

  /** Converted THPS levels, if any are present. Never throws. */
  async _discoverThps() {
    const entries = await loadThpsManifest();
    for (const e of entries) {
      if (!offerLevel(e)) continue;
      this.levels.push(thpsLevelDef(e));
    }
    /* THPS first, then THPS2, each in the order its own career put them in —
       see CAREER in src/thps.js */
    const rank = (l) => (l.game === 'THPS1' ? 0 : l.game === 'THPS2' ? 1 : 2);
    this.levels.sort((a, b) => rank(a) - rank(b) ||
                               (a.order ?? 99) - (b.order ?? 99) ||
                               a.name.localeCompare(b.name));
    if (!this.levelId && this.levels.length) this.levelId = this.levels[0].id;
  }

  /* --------------------------------------------------------------- level */

  async _loadLevel(id) {
    const def = this._level(id);
    /* A converted park is tens of megabytes and is not wanted at boot, so it is
       fetched the first time it is picked, behind the loading bar. */
    if (def.thps && !this.thpsGlb[def.thps.file]) {
      this.el.loading.classList.remove('off');
      this.el.loadingBar.style.transform = 'scaleX(0.1)';
      try {
        this.thpsGlb[def.thps.file] =
          await new GLTFLoader().loadAsync(asset(THPS_DIR + def.thps.file));
      } catch (err) {
        console.warn('could not load THPS level', def.thps.file, err);
        this.el.loading.classList.add('off');
        this.hud.toast('Level missing', def.name);
        if (this.def) return;                 // stay where we are
        const other = this.levels.find((l) => l.id !== id);
        return other ? this._loadLevel(other.id) : undefined;
      }
      this.el.loading.classList.add('off');
    }
    this.levelId = def.id;
    this.def = def;

    if (this.level) this.level.dispose(this.scene);
    if (this.props) this.props.dispose();
    if (this.apron) { this.scene.remove(this.apron); this.apron.geometry.dispose(); }

    const level = new Level();
    if (def.thps) {
      const src = this.thpsGlb[def.thps.file];
      level.add(src.scene.clone(true), this.mats, null,
                { hideColliders: true, vertexColours: true });
      level.finish();
      /* the spawn, the barrels and the S-K-A-T-E letters are worked out from
         the park's own colliders — see src/thps.js */
      prepareThpsLevel(def, level, (src.scene.userData || {}).thps);
    }
    for (const part of def.parts || []) {
      level.add(this.glb[part.glb].scene.clone(true), this.mats, part.m);
    }

    level.finish();
    this.scene.add(level.root);
    this.level = level;

    /* The park is an island: past its edges you would see straight to the sky.
       This carries the ground on outwards — but it CANNOT be a plain disc under
       the park, because a bowl only 1.2 m deep would be cut through at about
       waist height. So it is a plate with a hole exactly where the park is,
       sitting a shade lower with the hole inset, which tucks the seam under the
       park's own edge and leaves the bowl alone... */
    const box = new THREE.Box3().setFromObject(level.root);
    this._fitDistance(box);
    const groundY = def.apronY ?? box.min.y;
    const inset = 0.3;
    /* A ShapeGeometry is authored in XY and laid flat with rotateX(-90), which
       sends the shape's +Y to world -Z — so the shape is written in (x, -z). */
    const plate = new THREE.Shape();
    plate.moveTo(-300, -300); plate.lineTo(300, -300); plate.lineTo(300, 300); plate.lineTo(-300, 300);
    const hole = new THREE.Path();
    const x0 = box.min.x + inset, x1 = box.max.x - inset;
    const y0 = -(box.max.z - inset), y1 = -(box.min.z + inset);
    hole.moveTo(x0, y0); hole.lineTo(x0, y1); hole.lineTo(x1, y1); hole.lineTo(x1, y0);
    plate.holes.push(hole);
    this.apron = new THREE.Mesh(new THREE.ShapeGeometry(plate).rotateX(-Math.PI / 2), this.mats.grey);
    this.apron.position.y = groundY - 0.02;
    this.apron.receiveShadow = true;
    this.scene.add(this.apron);

    /* ...and the apron is real ground, not just something to look at. Without a
       collider under it you ride off the visible edge of the world and drop,
       which reads as a bug rather than as a rule. */
    level.world.setApron(groundY, box);

    /* Out-of-bounds measured from the park itself rather than a magic -100.
       The Warehouse has genuine holes in its floor — that is how the level is
       built — so this is what turns falling into one into a quick bail and
       respawn instead of a long silent drop. */
    Fall.floorY = Math.min(box.min.y, groundY) - 3;

    /* the windows, if this park has any */
    this.glass.setLevel(level.world, level.glass);
    this.glass.onBreak = () => {
      this.goals.onGlass();
      this.tricks.score += GLASS.SCORE;
      this.hud.setScore(this.tricks.score);
      this.hud.toast('Smashed', '+' + GLASS.SCORE);
      if (this.tricks.score > this.levelBest) { this.levelBest = this.tricks.score; this._saveLevel(); }
      if (this.tricks.score > this.best) { this.best = this.tricks.score; this._saveBest(); }
    };

    /* props and objectives */
    this.props = new LevelProps(def, this.scene, level.world);
    const saved = this.saved.levels[def.id] || {};
    this.goals = new Goals(def, this.props, saved.goals);
    this.goals.onComplete = (g) => {
      this.hud.toast('Objective complete', g.label);
      /* the collect sound is dropped: the fifth golden deck is not a pickup
         that happens to finish the goal, it is the goal finishing */
      this.pendingPickup = null;
      this.sfx.objective();
      this._saveLevel();
    };
    this.goals.onPickup = (kind, what) => {
      /* held until the end of the frame — Goals fires every pickup first and
         only then checks the objectives, so we cannot know yet whether this
         one finished something */
      this.pendingPickup = kind;
      if (kind === 'letter') this.hud.toast(what, 'S-K-A-T-E');
      if (kind === 'deck') this.hud.toast(what + ' of 5', 'GOLDEN DECKS');
    };
    this.levelBest = saved.best || 0;

    /* the controller keeps direct references, so hand it the new park */
    if (this.ctrl) {
      this.ctrl.world = level.world;
      this.ctrl.paths = level.paths;
      this._respawn();
    }
    this.hud.setLevelName(def.name);
    this.hud.renderGoals(this.goals.rows());
    this.hud.setLetters(this.props.letters);
    this._renderLevelCards();
  }

  _respawn() {
    const sp = this.def.spawn;
    this.ctrl.setStartTransform(new THREE.Vector3(sp.pos[0], sp.pos[1], sp.pos[2]), sp.heading);
    this.anim.snapTo(this.ctrl.body);
    this.cam.snap(this.ctrl);
  }

  /* -------------------------------------------------------------- player */

  _buildPlayer() {
    const char = this.glb['SK_char.glb'];
    const model = char.scene;
    this.charModel = model;
    dressCharacter(model, this.skater());
    model.rotation.y = P.MODEL_YAW;

    this.anim = new CharacterAnimation(model, char.animations, this.input);
    this.scene.add(this.anim.root);

    this.tricks = new CharacterTricks(this.input, this.anim, this.hud);
    this.tricks.onScore = (total, count) => {
      this.sfx.trick();
      this.goals.onCombo(total, count, this.tricks.score, this.ctrl.position);
      if (this.tricks.score > this.levelBest) { this.levelBest = this.tricks.score; this._saveLevel(); }
      if (this.tricks.score > this.best) { this.best = this.tricks.score; this._saveBest(); }
    };

    /* the world and its rails are swapped in by _loadLevel */
    this.ctrl = new CharacterController(null, [], this.input, this.anim, this.tricks);
    this.ctrl.hud = this.hud;
    this.ctrl.onBail = () => this.sfx.bail();
    /* one place where a switch becomes something you can see and hear */
    this.ctrl.onSwitch = (side, body) => {
      this.anim.spinFlip(side, body);
      this.cam.kick();
      this.sfx.pop();
    };

    this.sm = buildStateMachine({
      ctrl: this.ctrl, input: this.input, anim: this.anim,
      tricks: this.tricks, hud: this.hud, cam: this.cam, glass: this.glass
    });
    this.sm.onChange = (name) => {
      this.hud.setState(name);
      if (name === 'ground' && this._wasAir) this.sfx.land();
      if (name === 'air') this.sfx.pop();
      this._wasAir = (name === 'air' || name === 'pipesnap');
    };
    this.sm.start('setup');
  }

  /* --------------------------------------------------------------- store */

  /**
   * The save file, one slot per skater.
   *
   * Ezra and Caleb each keep their own best score, their own per-park bests and
   * their own goal ticks; the settings are the tablet's, so those stay shared.
   * Anything saved before there were skaters is left exactly where it was, at
   * the top level — not deleted, not handed to one of them.
   */
  _store() {
    return new Promise((resolve) => {
      try {
        this.Store = ArcadeStore('skate');
        this.Store.ready(() => {
          const s = this.Store.get() || {};
          this.who = SKATERS.some((k) => k.id === s.who) ? s.who : SKATERS[0].id;
          for (const k of SKATERS) {
            const saved = ((s.players || {})[k.id] || {}).look;
            if (saved) this.looks[k.id] = saved;
          }
          this.settings.load(s.settings);
          this._readPlayer();
          resolve();
        });
      } catch (e) { this.Store = null; this.who = SKATERS[0].id; resolve(); }
    });
  }

  /**
   * A skater, with whatever colours have been chosen for them.
   *
   * The defaults live in config.js; a child's own picks live in their save
   * slot. Both skaters' colours are read at boot, not just the one playing,
   * because the row shows a dot for each and it should be their dot.
   */
  lookFor(id) {
    const base = (SKATERS.find((k) => k.id === id) || SKATERS[0]).look;
    return Object.assign({}, base, this.looks[id] || {});
  }

  skater() {
    const k = SKATERS.find((x) => x.id === this.who) || SKATERS[0];
    return { id: k.id, name: k.name, look: this.lookFor(k.id) };
  }

  /** Load whichever skater is chosen into the live fields. */
  _readPlayer() {
    const s = (this.Store && this.Store.get()) || {};
    const p = (s.players && s.players[this.who]) || {};
    this.saved = { levels: p.levels || {} };
    this.best = p.best || 0;
    if (p.lastLevel && this.levels.some((l) => l.id === p.lastLevel)) this.levelId = p.lastLevel;
    this.el.best.textContent = this.best.toLocaleString('en-GB');
  }

  /** Swap skater: repaint the model, swap the save slot, reload their park. */
  async setSkater(id) {
    if (id === this.who || !SKATERS.some((k) => k.id === id)) return;
    this.who = id;
    this._write((s) => { s.who = id; });
    if (this.charModel) dressCharacter(this.charModel, this.skater());
    const before = this.levelId;
    this._readPlayer();
    this._renderSkaters();
    if (this.levelId !== before) await this._loadLevel(this.levelId);
    else this._renderLevelCards();
  }

  /** Change one of the playing skater's colours and remember it. */
  setColour(part, hex) {
    const id = this.who;
    const look = Object.assign({}, this.looks[id] || {});
    look[part] = hex;
    this.looks[id] = look;
    this._writeMine((p) => { p.look = look; });
    if (this.charModel) dressCharacter(this.charModel, this.skater());
    this._renderSkaters();
  }

  _write(mutate) {
    if (!this.Store) return;
    const s = this.Store.get() || {};
    mutate(s);
    this.Store.set(null, s);
  }

  /** Mutate this skater's own slot. */
  _writeMine(mutate) {
    this._write((s) => {
      s.players = s.players || {};
      const p = s.players[this.who] || (s.players[this.who] = {});
      p.levels = p.levels || {};
      mutate(p);
    });
  }

  _saveBest() {
    this.el.best.textContent = this.best.toLocaleString('en-GB');
    this._writeMine((p) => { p.best = this.best; });
  }
  _saveLevel() {
    const rec = this.saved.levels[this.levelId] || (this.saved.levels[this.levelId] = {});
    rec.best = this.levelBest;
    rec.goals = this.goals.save();
    this._writeMine((p) => { p.levels[this.levelId] = rec; p.lastLevel = this.levelId; });
    this._renderLevelCards();
  }
  _saveSettings() { this._write((s) => { s.settings = this.settings.toJSON(); }); }

  /* ------------------------------------------------------------------ ui */

  /** Show which way a scrolling list can still go. CSS cannot see overflow. */
  _fadeEdges(host) {
    const mark = () => {
      const room = host.scrollHeight - host.clientHeight;
      host.classList.toggle('moreBelow', room > 2 && host.scrollTop < room - 2);
      host.classList.toggle('moreAbove', room > 2 && host.scrollTop > 2);
    };
    if (!host.__faded) { host.__faded = true; host.addEventListener('scroll', mark); }
    requestAnimationFrame(mark);
  }

  /* The two games, in the order they came out. Anything that somehow arrives
     without a game tag goes in its own group at the end rather than vanishing. */
  _groups() {
    const titles = { THPS1: 'Tony Hawk\u2019s Pro Skater', THPS2: 'Tony Hawk\u2019s Pro Skater 2' };
    const out = [];
    for (const key of ['THPS1', 'THPS2', null]) {
      const list = this.levels.filter((l) => (l.game || null) === key);
      if (list.length) out.push({ key, title: titles[key] || 'Other parks', list });
    }
    return out;
  }

  _renderLevelCards() {
    /* The menu and the pause screen show the same ring, built from the same
       list. Two instances rather than one moved about: they are on screen at
       different times and each remembers where it was left. */
    const hosts = [['menu', document.getElementById('menuLevels')],
                   ['pause', document.getElementById('settingsLevels')]];
    const items = [];
    for (const g of this._groups()) {
      for (const def of g.list) {
        const rec = this.saved.levels[def.id] || {};
        const total = (def.goals || []).length;
        const n = Object.values(rec.goals || {}).filter(Boolean).length;
        items.push({
          id: def.id,
          name: def.name,
          group: g.key === 'THPS1' ? 'Tony Hawk\u2019s Pro Skater'
               : g.key === 'THPS2' ? 'Tony Hawk\u2019s Pro Skater 2' : 'Other parks',
          done: n,
          total,
          icon: def.icon,
          img: asset('previews/' + def.id + '.jpg')
        });
      }
    }
    this.rings = this.rings || {};
    for (const [key, host] of hosts) {
      if (!host) continue;
      if (!items.length) {
        host.innerHTML = '<p class="hint">No parks converted yet &mdash; see assets/thps/README.md.</p>';
        continue;
      }
      const at = Math.max(0, items.findIndex((x) => x.id === this.levelId));
      if (!this.rings[key]) {
        this.rings[key] = new Carousel(host, {
          /* the front card is the park; picking it is what loads it */
          onPick: (it) => this._pickLevel(it.id),
          onChange: (it) => { this.pendingLevel = it.id; }
        });
      }
      this.rings[key].setItems(items, at);
    }
  }

  /**
   * Choose the park the ring is showing.
   *
   * From the menu this only arms it — DROP IN is what starts a run, and the
   * park is loaded behind the menu while you are still looking at it. From
   * pause it swaps park there and then, which is what the old list did.
   */
  _pickLevel(id) {
    if (id === this.levelId) {
      if (this.mode === 'menu') this._startRun();
      return;
    }
    const wasPlaying = this.mode === 'play' || this.mode === 'pause';
    this._loadLevel(id).then(() => {
      this._writeMine((p) => { p.lastLevel = id; });
      if (wasPlaying) this._startRun();
    });
  }

  /** The two buttons that say who is skating. */
  _renderSkaters() {
    for (const host of [document.getElementById('menuSkaters'), document.getElementById('pauseSkaters')]) {
      if (!host) continue;
      host.innerHTML = '';
      for (const k of SKATERS) {
        const b = document.createElement('button');
        b.className = 'who' + (k.id === this.who ? ' on' : '');
        b.dataset.who = k.id;
        const swatch = (c) => '#' + Number(c).toString(16).padStart(6, '0');
        const look = this.lookFor(k.id);
        b.innerHTML = `<span class="dot" style="background:${swatch(look.top)};` +
                      `border-color:${swatch(look.helmet)}"></span>` +
                      `<span class="nm">${k.name}</span>` +
                      `<svg class="pen" viewBox="0 0 24 24" aria-hidden="true">` +
                      `<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M15.5 4.5l4 4"/></svg>`;
        b.title = k.name + ' — tap for colours';
        /* Tapping a name both picks that skater and opens their colours: one
           action, always the same one, rather than a second button sitting in
           the row for something you do once in a while. */
        b.addEventListener('click', async () => {
          await this.setSkater(k.id);
          if (this.openColours) this.openColours();
        });
        host.appendChild(b);
      }
    }
  }

  /**
   * The jukebox: shuffle, skip, volume, and the name of what is playing.
   *
   * The controls only appear if there is music installed — assets/music/ is a
   * couple of dozen megabytes and not everyone will have built it, and three
   * dead buttons in the corner are worse than none.
   */
  async _music() {
    const name = document.getElementById('nowPlaying');
    const prev = document.getElementById('prevBtn');
    const skip = document.getElementById('skipBtn');
    const wrap = document.getElementById('volWrap');
    const btn = document.getElementById('volBtn');
    const slider = document.getElementById('volSlider');
    if (!name || !prev || !skip || !wrap || !btn || !slider) return;

    this.music.setVolume(this.settings.get('musicVolume'));

    /* Listen for the first gesture BEFORE fetching the manifest, not after.
       Waiting meant an early click landed on nothing and you had to press a
       second time to get any music. */
    const wake = () => this.music.start();
    const stop = () => {
      removeEventListener('pointerdown', wake);
      removeEventListener('keydown', wake);
    };
    this.music.onPlaying = stop;
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);

    if (!await this.music.load()) { stop(); return; }   // no songs; stay hidden
    for (const el of [name, prev, skip, wrap]) el.hidden = false;
    prev.disabled = !this.music.canGoBack;      // nothing behind us yet

    const paint = (v) => {
      slider.value = String(v);
      slider.style.setProperty('--fill', Math.round(v * 100) + '%');
      wrap.classList.toggle('muted', v <= 0.001);
    };
    paint(this.settings.get('musicVolume'));

    /* Browsers will not make a sound until the person has touched the page,
       so the soundtrack waits for the first thing they do — whatever it is,
       a click on the ring or a key — rather than for Drop In. */
    /* Keep offering every gesture until sound actually comes out: the flag on
       Music goes up the instant we ASK to play, and the browser's refusal
       arrives a moment later, so only the 'playing' event means it started.
       The listeners went on above, before the fetch. */

    skip.addEventListener('click', () => this.music.skip());
    prev.addEventListener('click', () => this.music.back());

    /* the slider folds away again on its own, so it is not left sitting over
       the corner of the park for the rest of the session */
    let shut = 0;
    const idle = () => { clearTimeout(shut); shut = setTimeout(close, 3200); };
    const close = () => {
      clearTimeout(shut);
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !wrap.classList.contains('open');
      wrap.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { slider.focus(); idle(); } else clearTimeout(shut);
    });
    slider.addEventListener('click', (e) => e.stopPropagation());
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      paint(v);
      this.music.setVolume(v);
      this.settings.set('musicVolume', v);
      this._saveSettings();
      idle();
    });
    addEventListener('pointerdown', (e) => {
      if (wrap.classList.contains('open') && !wrap.contains(e.target)) close();
    });
  }

  /**
   * The colours panel: two pickers and a little skater standing in front of
   * them, wearing the change as you drag.
   *
   * Everything applies immediately and is saved immediately — there is no OK
   * and no Cancel. For a seven year old picking a helmet colour, "Done" that
   * only closes the box is the honest button, and an undo they never asked for
   * is one more thing to explain.
   */
  _colours() {
    const panel = document.getElementById('colours');
    const canvas = document.getElementById('colourPreview');
    const helmet = document.getElementById('pickHelmet');
    const top = document.getElementById('pickTop');
    const who = document.getElementById('colourWho');
    const done = document.getElementById('colourDone');
    if (!panel || !canvas || !helmet || !top) return;

    const hex = (c) => '#' + Number(c).toString(16).padStart(6, '0');
    this.dressUp = new DressUp(canvas, asset, dressCharacter);

    const open = () => {
      const look = this.lookFor(this.who);
      helmet.value = hex(look.helmet);
      top.value = hex(look.top);
      if (who) who.textContent = this.skater().name;
      panel.classList.remove('off');
      this.dressUp.show(this.skater());
    };
    this.openColours = open;
    const close = () => {
      panel.classList.add('off');
      this.dressUp.hide();
    };
    this.closeColours = close;

    if (done) done.addEventListener('click', close);
    /* clicking the backdrop is the other way everyone tries to close a box */
    panel.addEventListener('click', (e) => { if (e.target === panel) close(); });

    const live = (input, part) => {
      const apply = () => {
        this.setColour(part, parseInt(input.value.slice(1), 16));
        this.dressUp.recolour(this.skater());
      };
      /* 'input' fires while the picker is still open, which is what makes the
         preview move with the slider rather than after it */
      input.addEventListener('input', apply);
      input.addEventListener('change', apply);
    };
    live(helmet, 'helmet');
    live(top, 'top');
  }

  _nowPlaying(t) {
    const el = document.getElementById('nowPlaying');
    if (el) el.textContent = t || '';
  }

  _ui() {
    this._music();
    this._colours();
    /* Drop In, from either screen: whatever park the ring in front of you is
       showing. From pause that means starting a fresh run there, which is a
       different thing from Resume sitting above the list. */
    const dropIn = (which) => () => {
      const ring = this.rings && this.rings[which];
      const want = ring ? ring.items[ring.index()] : null;
      if (want && want.id !== this.levelId) this._pickLevel(want.id);
      else this._startRun();
    };
    document.getElementById('playBtn').addEventListener('click', dropIn('menu'));
    const pauseDrop = document.getElementById('pauseDropBtn');
    if (pauseDrop) pauseDrop.addEventListener('click', dropIn('pause'));
    document.getElementById('restartBtn').addEventListener('click', () => this._startRun());
    const resume = () => { this.el.pause.classList.add('off'); this.mode = 'play'; };
    for (const id of ['resumeBtn', 'resumeBtn2']) {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', resume);
    }
    document.getElementById('pauseBtn').addEventListener('click', () => this._togglePause());
    document.getElementById('pauseTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn) this._pauseTab(btn.dataset.tab);
    });
    const ver = document.getElementById('buildVer');
    if (ver) ver.textContent = 'build ' + BUILD;
    /* the pads wear the same glyphs as the readout that echoes them, from the
       one place those glyphs are drawn — see src/icons.js */
    for (const btn of document.querySelectorAll('.act[data-act]')) {
      btn.innerHTML = iconSvg(btn.dataset.act.toUpperCase(), 30);
    }
    this._renderSkaters();
    this._renderTricks();

    const seg = (id, attr, apply) => {
      const host = document.getElementById(id);
      host.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        apply(btn.dataset[attr]);
        this._saveSettings();
      });
    };
    seg('camSeg', 'cam', (v) => { this.settings.set('camera', v); this._applySettings(); });
    seg('shadowSeg', 'shadow', (v) => { this.settings.set('shadows', v === '1'); this._applySettings(); });
    seg('stateSeg', 'state', (v) => { this.settings.set('showState', v === '1'); this._applySettings(); });
    seg('resSeg', 'res', (v) => { this.settings.set('resolution', v); this._applySettings(); });

    this._resize();
  }

  /**
   * How far you can see, measured from the park rather than guessed.
   *
   * The fog was 46 m to 130 m, which was right when a converted level was about
   * 135 m across. They are twice that now, and nobody moved it: School II is
   * 272 m wide, so everything past its middle faded to the background colour
   * and READ AS SKY. Dan pinned two spots and asked where the wall above them
   * had gone; the wall was there, a hundred and ten metres away, painted the
   * same colour as the air. Of 171 samples across the top of that view, 129 hit
   * geometry and 26 of those were beyond 50 m.
   *
   * Same class of mistake as --pipe-reach: a distance in metres that stopped
   * meaning what it meant when the scale changed. So it is no longer a
   * constant. The park says how big it is and the fog and the far plane follow,
   * with a floor under them so the little debug parks do not end up with the
   * fog in their faces.
   */
  _fitDistance(box) {
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 40);
    const near = Math.max(46, span * 0.55);
    const far = Math.max(130, span * 1.35);
    if (this.scene.fog) { this.scene.fog.near = near; this.scene.fog.far = far; }
    /* just past where the fog has finished — everything beyond is already the
       background colour, and a far plane further out only costs depth
       precision, which is what stops coplanar faces flickering */
    this.camera.far = Math.max(260, far * 1.08);
    this.camera.updateProjectionMatrix();
  }

  _applySettings() {
    const s = this.settings.values;
    const mark = (id, attr, val) => {
      const host = document.getElementById(id);
      if (!host) return;
      host.querySelectorAll('button').forEach((n) => n.classList.toggle('on', n.dataset[attr] === String(val)));
    };
    mark('camSeg', 'cam', s.camera);
    mark('shadowSeg', 'shadow', s.shadows ? '1' : '0');
    mark('stateSeg', 'state', s.showState ? '1' : '0');
    mark('resSeg', 'res', s.resolution);

    this.cam.setMode(s.camera);
    if (this.ctrl) this.cam.snap(this.ctrl);
    this.renderer.shadowMap.enabled = s.shadows;
    this.scene.traverse((o) => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
    this.hud.showState(s.showState);
    this._resize();
  }

  _startRun() {
    this.sfx.resume();
    /* the recorded sounds, once, on the first gesture that is allowed to make
       an audio context. A missing assets/audio/ is the normal case and leaves
       the synthesised set doing the work. */
    if (!this._packAsked) {
      this._packAsked = true;
      this.sfx.loadPack(asset);
    }
    this.el.menu.classList.add('off');
    this.el.pause.classList.add('off');

    document.body.classList.add('playing');
    this.mode = 'play';
    this.tricks.score = 0;
    this.tricks.clearTricks();
    this.hud.setScore(0);
    this.goals.startRun();
    this.glass.reset();
    this.hud.renderGoals(this.goals.rows());
    this.hud.setLetters(this.props.letters);
    this._respawn();
    this.sm.go('reset');
    this.sm.go('ground');
  }

  /** Which tab of the pause screen is showing. */
  _pauseTab(name) {
    for (const b of document.querySelectorAll('#pauseTabs button')) {
      b.classList.toggle('on', b.dataset.tab === name);
    }
    for (const v of document.querySelectorAll('.pauseView')) {
      v.classList.toggle('off', v.dataset.view !== name);
    }
    const body = document.getElementById('pauseBody');
    if (body) { body.scrollTop = 0; this._fadeEdges(body); }
    /* a ring built while its tab was hidden measured zero and guessed its
       radius; now that it is on screen it can measure itself properly */
    if (this.rings && this.rings.pause) this.rings.pause.relayout();
    /* Resume sits in the row at the top of the Game view; on the other tabs
       that row is off screen, so the one at the foot of the card takes over. */
    const foot = document.getElementById('resumeFoot');
    if (foot) foot.style.display = name === 'main' ? 'none' : '';
  }

  _renderTricks() {
    const host = document.getElementById('trickBook');
    if (!host) return;
    const chip = (action) => {
      const c = ACTION_CHIP[action] || { t: '?', c: 'd' };
      return `<span class="chip c-${c.c}${c.wide ? ' wide' : ''}">${c.t}</span>`;
    };
    host.innerHTML = TRICK_BOOK.map((g) => `
      <div class="trickGroup">
        <h3>${g.group} ${chip(g.action)}</h3>
        <p class="when">${g.when}</p>
        ${g.tricks.map((t) => `
          <div class="trickRow">
            <span class="tn">${t.name}</span>
            <span class="ts"><span class="pts">${t.score}</span></span>
          </div>`).join('')}
      </div>`).join('');
  }

  _togglePause() {
    if (this.mode === 'play') {
      this.mode = 'pause';
      this.el.pause.classList.remove('off');
      this._pauseTab('main');
      this.sfx.setPaused(true);
    } else if (this.mode === 'pause') {
      this.mode = 'play';
      this.el.pause.classList.add('off');
      this.sfx.setPaused(false);
    }
  }



  /* ---------------------------------------------------------------- loop */

  _frame() {
    const dt = Math.min(0.1, this.clock.getDelta());

    if (this.input.pauseRequested) { this.input.pauseRequested = false; this._togglePause(); }
    if (this.input.resetRequested) {
      this.input.resetRequested = false;
      if (this.mode === 'play') this.sm.go('reset');
    }

    const live = this.mode === 'play' || this.mode === 'menu';
    if (this.mode === 'menu') {
      /* character_turntable.gd: the skater turns slowly on the menu */
      this.ctrl.body.rotateY(dt * 0.5);
      this.ctrl.sync();
    }

    if (live) {
      this.input.update(dt);
      this.tricks.update(dt);

      /* fixed 60 Hz physics — every ported constant assumes it */
      this.accum += dt;
      let steps = 0;
      while (this.accum >= P.STEP && steps < P.MAX_STEPS) {
        this.ctrl.beginStep();
        this.sm.physics(P.STEP);
        if (this.mode === 'play') {
          this.goals.update(P.STEP, this.ctrl, this.sm.current.name);
          /* whatever survived the objective check gets its own sound now */
          if (this.pendingPickup) { this.sfx.pickup(); this.pendingPickup = null; }
        }
        this.accum -= P.STEP;
        steps++;
      }
      if (steps === P.MAX_STEPS) this.accum = 0;
      /* and the frame draws BETWEEN steps. Without this the skater is drawn at
         whatever position the last step left him at, so on a 120 Hz screen half
         the frames repeat the one before and the whole picture stutters — the
         camera included, since it follows him. */
      this.ctrl.setRenderAlpha(this.accum / P.STEP);

      this.anim.update(dt);
      this.anim.follow(this.ctrl.body, dt, this.ctrl.renderPos);
      this.props.update(dt);
      this.glass.update(dt);
      this.hud.update(dt);

      if (this.mode === 'play') {
        this.goals.setScore(this.tricks.score);
        this.hud.renderGoals(this.goals.rows());
        this.hud.setLetters(this.props.letters);
      }

      const speed = this.ctrl.velocity.length();
      this.hud.setSpeed(speed / STATS.max_vel);
      const st = this.sm.current?.name;
      /* Nobody is skating on the menu — the skater turns on the spot there and
         his velocity is whatever the last run left behind, which used to keep
         the wheels rolling under the level select. */
      this.sfx.rolling(this.mode === 'play' ? Math.min(1, speed / STATS.max_vel) : 0,
        this.mode === 'play' && st === 'grind',
        this.mode !== 'play' || st === 'air' || st === 'pipesnap' || st === 'lip');
    }

    this.cam.update(dt, this.ctrl, this.sm.current?.name);

    /* keep the shadow box travelling with the skater */
    this.sun.position.copy(this.ctrl.position).addScaledVector(this.sunDir, 40);
    this.sun.target.position.copy(this.ctrl.position);
    this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
game.start().catch((err) => {
  console.error(err);
  document.getElementById('loading').innerHTML =
    '<p style="padding:24px;text-align:center">Could not load the park.<br><small>' +
    String(err && err.message || err) + '</small></p>';
});
window.__skate = game;
