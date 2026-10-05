/* Wren animation system: shared by the game (inlined) and animation-studio.html. */
(function () {
  const n = (base, k) => [base].concat(Array.from({ length: k }, (_, i) => base + ' (' + (i + 1) + ')'));
  const DANCES = {
    'Hip hop': ['Arms Hip Hop Dance', ...n('Hip Hop Dancing', 16), 'Locking Hip Hop Dance', 'Robot Hip Hop Dance', 'Slide Hip Hop Dance', 'Snake Hip Hop Dance', ...n('Tut Hip Hop Dance', 1), ...n('Wave Hip Hop Dance', 2), 'Dancing Running Man', 'Shuffling', ...n('House Dancing', 2), 'Booty Hip Hop Dance'],
    'Breakdance': [...n('Bboy Hip Hop Move', 1), 'Bboy Pose To Idle', 'Bboy Uprock Start', ...n('Breakdance 1990', 2), 'Breakdance Ending 1', 'Breakdance Ending 2', 'Breakdance Ending 3', 'Breakdance Footwork 1', 'Breakdance Footwork 2', 'Breakdance Footwork 3', 'Breakdance Footwork To Freeze', ...n('Breakdance Footwork To Idle', 1), 'Breakdance Freeze Var 1', 'Breakdance Freeze Var 2', 'Breakdance Freeze Var 3', 'Breakdance Freeze Var 4', 'Breakdance Freezes', ...n('Breakdance Ready', 2), 'Breakdance Swipes', ...n('Breakdance Uprock', 1), ...n('Breakdance Uprock To Ground', 1), 'Breakdance Uprock Var 1', 'Breakdance Uprock Var 1 Start', 'Breakdance Uprock Var 1 End', 'Breakdance Uprock Var 2', 'Brooklyn Uprock', 'Crossleg Freeze', ...n('Flair', 2)],
    'Latin & swing': [...n('Salsa Dancing', 9), ...n('Samba Dancing', 7), 'Rumba Dancing', ...n('Swing Dancing', 4), ...n('Jazz Dancing', 2), 'Belly Dance', 'Bellydancing'],
    'Party & silly': ['Gangnam Style', 'Macarena Dance', 'Ymca Dance', 'Hokey Pokey', 'Can Can', 'Twist Dance', 'Shopping Cart Dance', ...n('Silly Dancing', 1), 'Thriller Idle', 'Thriller Part 1', 'Thriller Part 2', 'Thriller Part 3', 'Thriller Part 4', 'Dancing Twerk'],
    'Soul & freestyle': ['Northern Soul Dance', 'Northern Soul Floor Combo', 'Northern Soul Floor Spin', 'Northern Soul Spin', 'Northern Soul Spin Combo', 'Butterfly Twirl', ...n('Dancing', 5), 'Dancing Maraschino Step'],
    'Held poses': [...n('Female Dance Pose', 5), ...n('Male Dance Pose', 3)]
  };
  const NOT_DEFAULT = new Set(['Dancing Twerk', 'Booty Hip Hop Dance', 'Bboy Pose To Idle', 'Bboy Uprock Start', 'Breakdance Uprock Var 1 Start', 'Breakdance Uprock Var 1 End', 'Thriller Idle', ...n('Breakdance Ready', 2), ...n('Breakdance Footwork To Idle', 1), ...DANCES['Held poses']]);
  const LOCOMOTION = { run: ['Running', 'Medium Run'], jump: ['Jump', 'Running Jump'] };
  const ACTIONS = ['Standing 1H Magic Attack 01', 'Standing 1H Magic Attack 02', 'Standing 1H Magic Attack 03', 'Standing 2H Cast Spell 01', 'Standing 2H Magic Area Attack 02', 'Standing 2H Magic Attack 01', 'Standing 2H Magic Attack 04', 'Magic Heal', 'Run And Throw Grenade', 'Run And Swing', 'Rope Swinging', 'Start Swinging', ...n('Swinging', 1)];
  const KEY = 'wind-wall-anims-v2';
  const STANDING = ACTIONS.filter(a => a.startsWith('Standing ')).concat(['Magic Heal']);
  const DEFAULT_DANCES = ['Arms Hip Hop Dance', 'Hip Hop Dancing'].concat(Array.from({ length: 16 }, (_, i) => i + 1).filter(i => i !== 12 && i !== 16).map(i => 'Hip Hop Dancing (' + i + ')'), ['Macarena Dance', 'Ymca Dance']);
  const defaults = () => ({ run: 'Running', jump: 'Jump', actionSpeed: 1.75, dances: DEFAULT_DANCES.slice(), magic: STANDING.slice(), item: STANDING.concat(['Run And Throw Grenade']) });
  const loadSettings = () => { try { return Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return defaults(); } };
  const saveSettings = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const pick = a => a.length ? a[Math.floor(Math.random() * a.length)] : null;
  const keyframes = () => { try { return JSON.parse(localStorage.getItem('wind-wall-poses-v1') || '[]'); } catch (e) { return []; } };
  globalThis.WrenAnimData = { LOCOMOTION, DANCES, NOT_DEFAULT, ACTIONS, loadSettings, saveSettings, defaults, pick, keyframes };

  globalThis.WrenAnim = function (THREE, FBXLoader, model, opts = {}) {
    const base = opts.base || 'research/animations/';
    const loader = new FBXLoader();
    const bones = []; model.traverse(o => { if (o.isBone) bones.push(o); });
    const bare = s => s.replace(/^mixamorig\d*[:_]?/i, '');
    const byBare = {}; bones.forEach(b => { byBare[bare(b.name)] = b; });
    const hips = byBare.Hips || bones[0];
    const restHips = hips.position.clone(), restQ = bones.map(b => b.quaternion.clone());
    const isLower = s => /^(Hips|LeftUpLeg|LeftLeg|LeftFoot|LeftToe|RightUpLeg|RightLeg|RightFoot|RightToe)/.test(s);
    const mixer = new THREE.AnimationMixer(model);
    const DANCE_SET = new Set(Object.values(DANCES).flat());
    const cache = {};
    let hipRatio = restHips.y / 94;

    function retarget(clip, name) {
      const tracks = [], travel = DANCE_SET.has(name);
      for (const t of clip.tracks) {
        const dot = t.name.lastIndexOf('.'), node = bare(t.name.slice(0, dot)), prop = t.name.slice(dot + 1);
        const bone = byBare[node]; if (!bone) continue;
        if (prop === 'position' && node !== 'Hips') continue;
        if (prop === 'scale') continue;
        const nt = t.clone(); nt.name = bone.name + '.' + prop;
        if (node === 'Hips' && prop === 'position') { const v = nt.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = travel ? restHips.x + (v[i] - x0) * hipRatio : restHips.x; v[i + 1] *= hipRatio; v[i + 2] = travel ? restHips.z + (v[i + 2] - z0) * hipRatio : restHips.z; } }
        tracks.push(nt);
      }
      const full = new THREE.AnimationClip(name, clip.duration, tracks);
      const part = up => new THREE.AnimationClip(name + (up ? ':up' : ':low'), clip.duration, tracks.filter(t => isLower(bare(t.name.slice(0, t.name.lastIndexOf('.')))) !== up));
      return { name, dur: clip.duration, full, upper: part(true), lower: part(false) };
    }
    function load(name) {
      if (!cache[name] && opts.clips && opts.clips[name]) cache[name] = Promise.resolve(retarget(opts.clips[name], name));   // pre-packed in wren.glb
      if (!cache[name]) cache[name] = new Promise((res, rej) => loader.load(base + encodeURIComponent(name) + '.fbx', o => {
        const c = o.animations && o.animations[0]; if (!c) { rej(new Error('no animation in ' + name)); return; } res(retarget(c, name));
      }, undefined, rej));
      return cache[name];
    }
    const act = (clip, manual, once) => { const a = mixer.clipAction(clip); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true; a.enabled = true; a.setEffectiveWeight(0); a.play(); if (manual) a.paused = true; return a; };
    const S = { run: null, jump: null, over: null, dance: null, wJ: 0, wO: 0, wD: 0, jT: 0, oT: 0, jTarget: 0, oTarget: 0, dTarget: 0, phase: null, acts: {}, ready: {}, loading: {}, lockY: false };
    const api = {
      ready: false, hasJump: false, bones, hips, restHips, load, mixer,
      get jumpPhase() { return S.phase; }, get jT() { return S.jT; }, get jumpHalf() { return S.jump ? S.jump.dur / 2 : 0.5; }, get dancing() { return !!S.dance; }, get danceW() { return S.wD; },
      async setRun(name) { const r = await load(name); if (S.run) { S.run.low.stop(); S.run.up.stop(); } S.run = { low: act(r.lower), up: act(r.upper), name }; S.run.low.setEffectiveWeight(1); S.run.up.setEffectiveWeight(1); },
      async setJump(name) { try { const j = await load(name); if (S.jump) { S.jump.low.stop(); S.jump.up.stop(); } S.phase = null; S.jT = 0; S.jump = { low: act(j.lower, true, true), up: act(j.upper, true, true), dur: j.dur, name }; api.hasJump = true; } catch (e) { console.info('Jump animation not loaded', e.message || e); } },
      async init(runName, jumpName) {
        const st = loadSettings();
        await api.setRun(runName || st.run || 'Running').catch(() => api.setRun('Running'));
        await api.setJump(jumpName || st.jump || 'Jump');
        api.ready = true; return api;
      },
      jumpStart() { if (!S.jump || S.phase) return false; S.jT = 0; S.phase = 'up'; S.jTarget = 1; return true; },
      jumpRelease() { if (S.phase === 'hold' || S.phase === 'up') S.phase = 'down'; },
      jumpCancel() { if (S.phase) { S.phase = 'out'; S.jTarget = 0; } },
      async playUpper(name, speed) { if (!name) return; try { const c = await load(name); if (S.over) S.over.a.stop(); S.over = { a: act(c.upper, true, true), dur: c.dur, sp: speed || loadSettings().actionSpeed || 1 }; S.oT = 0; S.oTarget = 1; } catch (e) { console.info('Action not loaded', name); } },
      async playDance(name) { const c = await load(name); if (S.dance) S.dance.a.stop(); S.dance = { a: act(c.full), dur: c.dur, name }; S.dTarget = 1; return c.dur; },
      stopDance() { S.dTarget = 0; },
      // Scrubbed full-body clips: the game sets the clip time from its own progress (e.g. how far over a wall),
      // so the animation lands exactly when the body does. lockY keeps the hips at rest height (the game lifts the body).
      scrub(name, f, lockY = true) {
        const r = S.ready[name];
        if (!r) { if (!S.loading[name]) { S.loading[name] = true; load(name).then(c => { S.ready[name] = c; }, () => {}); } return false; }
        const x = S.acts[name] || (S.acts[name] = { a: act(r.full, true, true), dur: r.dur, w: 0, target: 0 });
        x.a.time = Math.max(0, Math.min(1, f)) * (x.dur - 0.001); x.target = 1;
        for (const k in S.acts) if (k !== name) S.acts[k].target = 0;
        S.lockY = lockY; return true;
      },
      scrubOff() { for (const k in S.acts) S.acts[k].target = 0; },
      preload(name) { if (!S.ready[name] && !S.loading[name]) { S.loading[name] = true; load(name).then(c => { S.ready[name] = c; }, () => {}); } },
      update(dt) {
        if (!api.ready) return;
        S.wJ += (S.jTarget - S.wJ) * Math.min(1, dt * 14);
        S.wO += (S.oTarget - S.wO) * Math.min(1, dt * 10);
        S.wD += (S.dTarget - S.wD) * Math.min(1, dt * 6);
        if (S.jump && S.phase) {
          const half = S.jump.dur / 2;
          if (S.phase === 'up') { S.jT += dt; if (S.jT >= half) { S.jT = half; S.phase = 'hold'; } }
          else if (S.phase === 'down') { S.jT += dt * 1.15; if (S.jT >= S.jump.dur - 0.14) { S.phase = 'out'; S.jTarget = 0; } }
          else if (S.phase === 'out') { S.jT = Math.min(S.jump.dur - 0.001, S.jT + dt); if (S.wJ < 0.02) { S.phase = null; S.wJ = 0; } }
          S.jump.low.time = S.jump.up.time = Math.min(S.jT, S.jump.dur - 0.001);
        }
        if (S.over) { S.oT += dt * S.over.sp; if (S.oT > S.over.dur - 0.3 * S.over.sp) S.oTarget = 0; if (S.oT >= S.over.dur) { S.over.a.stop(); S.over = null; S.wO = 0; } else S.over.a.time = S.oT; }
        let A = 0; for (const k in S.acts) { const x = S.acts[k]; x.w += (x.target - x.w) * Math.min(1, dt * 12); if (!x.target && x.w < 0.01) x.w = 0; A += x.w; }
        const An = A > 1 ? 1 / A : 1; A = Math.min(1, A);
        for (const k in S.acts) S.acts[k].a.setEffectiveWeight((1 - S.wD) * S.acts[k].w * An);
        const D = S.wD, J = S.jump ? S.wJ : 0, O = S.over ? S.wO : 0, R = 1 - A;
        S.run.low.setEffectiveWeight((1 - D) * (1 - J) * R); S.run.up.setEffectiveWeight((1 - D) * (1 - O) * (1 - J) * R);
        if (S.jump) { S.jump.low.setEffectiveWeight((1 - D) * J * R); S.jump.up.setEffectiveWeight((1 - D) * (1 - O) * J * R); }
        if (S.over) S.over.a.setEffectiveWeight((1 - D) * O);
        if (S.dance) { S.dance.a.setEffectiveWeight(D); if (S.dTarget === 0 && D < 0.01) { S.dance.a.stop(); S.dance = null; S.wD = 0; } }
        mixer.update(dt);
        if (A > 0.001 && S.lockY) hips.position.y += (restHips.y - hips.position.y) * A;
      },
      capture(fn) { const saved = bones.map(b => b.quaternion.clone()), sh = hips.position.clone(); bones.forEach((b, i) => b.quaternion.copy(restQ[i])); hips.position.copy(restHips); model.updateMatrixWorld(true); fn(); const q = bones.map(b => b.quaternion.clone()); bones.forEach((b, i) => b.quaternion.copy(saved[i])); hips.position.copy(sh); return { q, hips: restHips.clone() }; },
      fromKeyframe(kf) { const map = {}; bones.forEach(b => { map[b.name] = b; }); const q = bones.map((b, i) => kf.bones[b.name] ? new THREE.Quaternion().fromArray(kf.bones[b.name]) : restQ[i].clone()); return { q, hips: kf.hips ? new THREE.Vector3().fromArray(kf.hips) : restHips.clone() }; },
      blendPose(t, w) { if (!t || w <= 0.001) return; bones.forEach((b, i) => b.quaternion.slerp(t.q[i], w)); hips.position.lerp(t.hips, w); }
    };
    return api;
  };
})();
