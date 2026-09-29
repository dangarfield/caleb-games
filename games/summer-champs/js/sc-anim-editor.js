// Summer Champs: animation editor. Scrub custom clips, nudge key poses per limb, leave notes, export a patch.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { W, initRenderer, loadAssets, makeAthlete, clearAthletes, buildVenue, prop, removeObj, KITS, LIB, replaceClip, poseBow } from './sc-world.js';
import { CLIP_LIST, createClipBuilder, activePatch } from './sc-anim.js';
const V3 = THREE.Vector3, PI = Math.PI, $ = s => document.querySelector(s);

// where each clip family is shown, and with what
const CTX = [
  [/^Blocks_/, { group:'Sprint', venue:'track', pos:[0,0,0.5], cam:[[1.5,2.4,13.5],[3,1,0.5]] }],
  [/^(Land_Sand|TJ_)/, { group:'Jumps', venue:'field', pos:[41.5,0,0], cam:[[42.5,2.2,10.5],[44,0.9,0]] }],
  [/^Javelin_/, { group:'Javelin', venue:'throw', pos:[24,0,0], prop:'javelin', cam:[[25,2.4,10],[27,1.1,0]] }],
  [/^Discus_/, { group:'Discus', venue:'throw', pos:[28.2,0,0], yaw:PI, prop:'discus', ring:true, cam:[[29.2,2.4,10],[31.2,1.1,0]] }],
  [/^HD_/, { group:'High diving', venue:'dive', platform:true, cam:null }],
  [/^(Block_Crouch|Dive_Start)/, { group:'Swimming', venue:'pool', pos:[-0.3,0.85,-0.5] }],
  [/^(Tread_|Water_)/, { group:'Swimming', venue:'pool', pos:[6,-1.25,-0.5] }],
  [/^(Swim_|Tumble_)/, { group:'Swimming', venue:'pool', pos:[6,-0.86,-0.5] }],
  [/^Bow_(Draw|Aim|Release)$/, { group:'Archery', venue:'range', pos:[0,0,0], prop:'bow', cam:[[-3.5,2,4],[4,1.1,0]] }],
  [/^Bow_/, { group:'Archery', venue:'range', pos:[0,0,0], prop:'bow', cam:[[-3.5,2,4],[4,1.1,0]] }],
  [/^Lift_/, { group:'Weightlifting', venue:'lift', pos:[0,0.12,0], prop:'bar' }],
  [/^(Fence_|Strike_|Parry_|Counter_|Hit_)/, { group:'Fencing', venue:'piste', pos:[-1.3,0.06,0], prop:'foil', opp:true, cam:[[1.6,1.95,6.5],[0.15,1.05,0]] }],
  [/./, { group:'Other', venue:'track', pos:[53,0,2] }],
];
let pickCtx = null;
const GROUP_CTX = { '100m sprint':'Blocks_', 'Long jump':'Land_Sand', 'Triple jump':'TJ_', 'Javelin':'Javelin_', 'Discus':'Discus_', 'High diving':'HD_', 'Archery':'Bow_Aim_Neutral', '50m swimming':'Swim_', 'Weightlifting':'Lift_', 'Fencing':'Fence_', 'Menus + results':'Wave' };
const ctxOf = name => { const g = pickCtx && GROUP_CTX[pickCtx]; const key = g && !CTX.find(([re]) => re.test(name))?.[1].prop ? g : name; const c = { ...CTX.find(([re]) => re.test(key))[1] }; if (key !== name){ c.prop = null; c.cam = null; } return c; };
const PARTS = { Body:[['pitch','lean fwd/back'],['roll','spin on spot'],['twS','spine twist'],['twH','head twist']], Spine:[['spine','spine']], Neck:[['neck','neck']],
  'Right arm':[['uaR','upper'],['laR','lower'],['rlR','wrist roll']], 'Left arm':[['uaL','upper'],['laL','lower'],['rlL','wrist roll']], 'Right leg':[['thR','thigh'],['caR','calf'],['ftR','foot']], 'Left leg':[['thL','thigh'],['caL','calf'],['ftL','foot']] };
const AX = ['up','fwd','out'];

const store = (() => { try { const v2 = localStorage.getItem('sc.animEditor.v2'); if (v2) return JSON.parse(v2); const old = JSON.parse(localStorage.getItem('sc.animEditor') || '{}'); return { notes: old.notes, clip: old.clip, patch: old.patch?._props ? { _props: old.patch._props } : {} }; } catch { return {}; } })();
const ST = { patch: { ...activePatch(), ...(store.patch || {}) }, notes: store.notes || [], clip: store.clip || 'Javelin_Run', mode:'key', key:0, t:0, playing:false, speed:1 };
$('#optLive').checked = !!localStorage.getItem('sc.animPatch.live');
const save = () => { localStorage.setItem('sc.animEditor.v2', JSON.stringify({ patch:ST.patch, notes:ST.notes, clip:ST.clip })); if ($('#optLive').checked) localStorage.setItem('sc.animPatch.live', JSON.stringify(ST.patch)); };

let builder, ath, opp, P = [], ctl, gui, skel, venueKind = null, curCtx = null;
const meta = () => CLIP_LIST.find(c => c.name === ST.clip);
const clipDur = () => LIB.clips[ST.clip]?.duration || 1;
const round = v => Math.round(v*1000)/1000;

initRenderer($('#gl'));
ctl = new OrbitControls(W.camera, $('#gl')); ctl.enableDamping = true; window.__ED = { ctl, ST };

loadAssets(mb => $('#load').textContent = 'LOADING ATHLETES… '+mb.toFixed(1)+' MB').then(() => {
  $('#load').remove(); builder = createClipBuilder(LIB.models[LIB.customIdx], LIB.unified ? { ...LIB.clips } : {});
  const have = n => LIB.clips[n] ? n : LIB.clips[n.replace(/_Loop$/, '')] ? n.replace(/_Loop$/, '') : null;
  const H = ['High','Mid','Low'];
  const USED = [
    ['100m sprint', ['Blocks_Marks','Blocks_Set','Sprint_Enter','Sprint_Loop','Jog_Fwd_Loop','Idle_Loop','Celebration']],
    ['Long jump', ['Idle_Loop','Sprint_Loop','NinjaJump_Start','NinjaJump_Idle_Loop','Land_Sand','Idle_No_Loop']],
    ['Triple jump', ['Idle_Loop','Sprint_Loop','TJ_Hop','TJ_Step','NinjaJump_Idle_Loop','Land_Sand','Idle_No_Loop']],
    ['Javelin', ['Idle_Loop','Javelin_Start','Javelin_Run','OverhandThrow','Celebration','Idle_No_Loop']],
    ['Discus', ['Discus_Ready','Discus_Spin','Discus_Release','Celebration','Idle_No_Loop']],
    ['High diving', ['HD_Stand','HD_Takeoff','HD_Tuck','HD_Entry_Head','HD_Entry_Feet','HD_Splat','Swim_Crawl','Water_Celebrate','Water_HeadShake']],
    ['Archery', ['Bow_Aim_Neutral','Bow_Shoot','Celebration']],
    ['50m swimming', ['Block_Crouch','Dive_Start','Swim_Crawl','Tumble_Turn','Tread_Water','Water_Celebrate']],
    ['Weightlifting', ['Idle_FoldArms_Loop','Lift_Setup','Lift_Clean','Lift_Jerk','Lift_Hold','Lift_Drop','Celebration','BackFlip','Crying']],
    ['Fencing', ['Fence_Idle', ...H.flatMap(h => ['Strike_'+h,'Parry_'+h,'Counter_'+h,'Hit_'+h]), 'Fence_Victory','Fence_Defeat']],
    ['Menus + results', ['Idle_Loop','HD_Stand','Celebration','Yes','Idle_Tired','Crying','BackFlip','Dance','Wave','Idle_No_Loop']],
  ].map(([g, l]) => [g, [...new Set(l.map(have).filter(Boolean))]]);
  const inGame = new Set(USED.flatMap(([, l]) => l)), mark = n => CLIP_LIST.some(c => c.name === n) ? n+' ✎' : n;
  const unusedCustom = CLIP_LIST.map(c => c.name).filter(n => !inGame.has(n));
  const lib = Object.keys(LIB.clips).filter(n => !inGame.has(n) && !CLIP_LIST.some(c => c.name === n)).sort();
  const og = (label, l) => l.length ? `<optgroup label="${label}">${l.map(n => `<option value="${n}">${mark(n)}</option>`).join('')}</optgroup>` : '';
  $('#clip').innerHTML = USED.map(([g, l]) => og(g, l)).join('') + og('Custom · not used in game', unusedCustom) + og('Library · not used', lib);
  for (const n in ST.patch) rebuild(n);
  selectClip(LIB.clips[ST.clip] ? ST.clip : 'Javelin_Run');
  requestAnimationFrame(loop);
});

function rebuild(name){ if (!builder || !CLIP_LIST.some(c => c.name === name)) return; replaceClip(name, builder.build(name, ST.patch[name])); }
function showClip(){ [ath, opp].forEach(a => { if (!a) return; a.rigs.forEach(r => { r.mixer.stopAllAction(); Object.values(r.actions).forEach(x => x.stop()); }); a.cur = null; }); ath.play(ST.clip, { scrub:0 }); if (opp) opp.play(curCtx.opp ? 'Fence_Idle' : 'Idle_Loop', { scrub:0 }); setTime(ST.t); }
function setTime(t){ const d = clipDur(); ST.t = ((t % d) + d) % d; if (ath?.cur){ ath.cur.paused = true; ath.cur.time = ST.t; } if (opp?.cur){ opp.cur.paused = true; opp.cur.time = ST.t % opp.cur.getClip().duration; }
  $('#scrub').value = Math.round(ST.t/d*1000); $('#tlabel').textContent = ST.t.toFixed(2)+'s · '+Math.round(ST.t/d*100)+'%'; }

function selectClip(name){
  ST.clip = name; { const s = $('#clip'), i = [...s.options].findIndex(o => o.value === name && (!pickCtx || o.parentElement.label === pickCtx)); if (i >= 0){ s.selectedIndex = i; requestAnimationFrame(() => { s.selectedIndex = i; s.options[i].selected = true; }); } } ST.t = 0; ST.key = 0; save();
  const c = ctxOf(name); curCtx = c;
  if (venueKind !== c.venue){ clearAthletes(); buildVenue(c.venue); venueKind = c.venue; ath = null; opp = null; }
  const info = W.venue.info; W.venue.g.children.forEach(o => { if (!o.isLight && o.type !== 'Object3D') o.visible = $('#optFloor').checked; });
  if (info.ring){ info.ring.visible = info.pad.visible = !!c.ring; if (c.ring) info.ring.position.x = info.pad.position.x = 28.2; }
  if (info.setThrowField) info.setThrowField(c.ring ? 'discus' : 'javelin', { sector:90, gold:30 });
  const pos = c.platform ? [info.platform.x, info.platform.y, 0] : c.pos;
  if (!ath) ath = makeAthlete(KITS[0], 'EDIT');
  ath.pivot.position.set(...pos); ath.pivot.rotation.set(0, c.yaw || 0, 0);
  if (opp){ W.scene.remove(opp.pivot); W.athletes = W.athletes.filter(a => a !== opp); opp = null; }
  if (c.opp && $('#optOpp').checked){ opp = makeAthlete(KITS[1], 'OPP'); opp.pivot.position.set(1.3, 0.06, 0); opp.pivot.rotation.set(0, PI, 0); }
  P.forEach(removeObj); P = [];
  if (c.prop && $('#optProp').checked){ P.push(prop(c.prop)); if (c.prop === 'foil' && opp) P.push(prop('foil')); }
  if (skel){ W.scene.remove(skel); skel = null; }
  if ($('#optBones').checked){ skel = new THREE.SkeletonHelper(ath.rigs[LIB.customIdx].model); W.scene.add(skel); }
  showClip(); camPreset(c.cam ? 'event' : 'side'); buildKeys(); buildGUI();
}

function camPreset(k){
  const p = ath.pivot.position, tgt = new V3(p.x, p.y + 1, p.z);
  const off = { side:[0.6, 0.5, 4.6], front:[4.6, 0.4, 0.3], back:[-4.6, 0.4, 0.3], top:[0.01, 5, 0.01] }[k];
  if (k === 'event' && curCtx.cam){ W.camera.position.set(...curCtx.cam[0]); ctl.target.set(...curCtx.cam[1]); }
  else if (off){ W.camera.position.set(tgt.x + off[0], tgt.y + off[1], tgt.z + off[2]); ctl.target.copy(tgt); }
  ctl.update();
}

// ---------- timeline ----------
function buildKeys(){
  const m = meta(), d = clipDur(), el = $('#keys'); el.innerHTML = '';
  if (m?.keyed) m.keys.forEach((k, i) => { const b = document.createElement('span'); b.className = 'key' + (i === ST.key && ST.mode === 'key' ? ' sel' : '') + (ST.patch[ST.clip]?.keys?.[i] ? ' edited' : ''); b.style.left = (k.t*100)+'%'; b.title = 'Key '+(i+1)+' · '+(k.t*d).toFixed(2)+'s';
    b.onclick = () => { ST.key = i; ST.mode = 'key'; ST.playing = false; setTime(Math.min(k.t, 0.9999)*d); buildKeys(); buildGUI(); }; el.appendChild(b); });
  ST.notes.filter(n => n.clip === ST.clip).forEach(n => { const s = document.createElement('span'); s.className = 'nmark'; s.style.left = (n.t/d*100)+'%'; s.title = n.text; s.onclick = () => { ST.playing = false; setTime(n.t); }; el.appendChild(s); });
  renderNotes(); $('#play').textContent = ST.playing ? '❚❚ Pause' : '▶ Play';
}
$('#scrub').oninput = e => { ST.playing = false; $('#play').textContent = '▶ Play'; setTime(e.target.value/1000*clipDur()); };
$('#play').onclick = () => { ST.playing = !ST.playing; $('#play').textContent = ST.playing ? '❚❚ Pause' : '▶ Play'; };
$('#prev').onclick = () => { ST.playing = false; setTime(ST.t - 1/30); };
$('#next').onclick = () => { ST.playing = false; setTime(ST.t + 1/30); };
$('#speed').onchange = e => ST.speed = +e.target.value;
$('#clip').onchange = e => { const o = e.target.selectedOptions[0]; pickCtx = o?.parentElement.label; selectClip(e.target.value); };
['optProp','optFloor','optOpp','optBones'].forEach(id => $('#'+id).onchange = () => { const t = ST.t, k = ST.key; selectClip(ST.clip); ST.key = k; setTime(t); buildKeys(); buildGUI(); });
$('#optLive').onchange = e => { if (e.target.checked) localStorage.setItem('sc.animPatch.live', JSON.stringify(ST.patch)); else localStorage.removeItem('sc.animPatch.live'); };
document.querySelectorAll('[data-cam]').forEach(b => b.onclick = () => camPreset(b.dataset.cam));
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { if (b.dataset.mode === 'key' && !meta()?.keyed) return; ST.mode = b.dataset.mode; buildKeys(); buildGUI(); });
addEventListener('keydown', e => { if (e.target.closest('textarea,input,select,.lil-gui')) return; if (e.code === 'Space'){ e.preventDefault(); $('#play').click(); } if (e.code === 'ArrowLeft') $('#prev').click(); if (e.code === 'ArrowRight') $('#next').click(); });

// ---------- pose sliders ----------
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function buildGUI(){
  if (gui) gui.destroy(); const m = meta(), cp = ST.patch[ST.clip] || {};
  document.querySelectorAll('[data-mode]').forEach(b => { b.classList.toggle('on', b.dataset.mode === ST.mode); b.disabled = b.dataset.mode === 'key' && !m?.keyed; b.style.opacity = b.disabled ? .35 : 1; });
  if (!m){ $('#hint').textContent = 'Library clip: view it and leave notes. Sliders (including whole-body height) are only for the custom clips. Swim_Fwd_Loop height is the "Swim depth offset" in the game debug panel.'; gui = null; return; }
  if (!m.keyed && ST.mode === 'key') ST.mode = 'offset';
  const kd = m.keyed ? m.keys.length : 0;
  $('#hint').innerHTML = ST.mode === 'key'
    ? `Key <b style="color:#F2B705">${ST.key+1} of ${kd}</b> at ${(m.keys[ST.key].t*clipDur()).toFixed(2)}s. Values are directions: up, fwd (the way they face), out (away from the body). Changes also apply to keys that share the same pose.`
    : `Adds to <b style="color:#F2B705">every frame</b> of the clip. ${m.keyed ? '' : 'This clip is a loop, so offsets are the only way to adjust it.'}`;
  gui = new GUI({ container:$('#gui'), title: ST.clip + (ST.mode === 'key' ? ' · key '+(ST.key+1) : ' · offset') });
  const gen = { length: round(cp.dur ?? m.dur), height: cp.rootY || 0 };
  gui.add(gen, 'length', 0.1, 4, 0.01).name('clip length (s)').onChange(v => { edit(p => p.dur = v); });
  gui.add(gen, 'height', -1.5, 1.5, 0.01).name('whole body up/down (m)').onChange(v => { edit(p => p.rootY = round(v)); });
  if (curCtx.prop){ const pf = gui.addFolder('Prop position · '+curCtx.prop), cur = ST.patch._props?.[curCtx.prop] || [0,0,0]; ['fwd','up','side'].forEach((ax, i) => { const o = { v: cur[i] }; pf.add(o, 'v', -0.6, 0.6, 0.005).name(ax).onChange(v => { const pp = ST.patch._props ||= {}; const a = [...(pp[curCtx.prop] || [0,0,0])]; a[i] = round(v); pp[curCtx.prop] = a; save(); }); }); }
  const base = ST.mode === 'key' ? m.keys[ST.key].pose : null;
  const cur = ST.mode === 'key' ? { ...base, ...(cp.keys?.[ST.key] || {}) } : null;
  for (const [fname, parts] of Object.entries(PARTS)){
    const f = gui.addFolder(fname); if (!['Body','Right arm'].includes(fname)) f.close();
    for (const [k, label] of parts){
      const isNum = ['pitch','roll','twS','twH','rlR','rlL'].includes(k);
      const val = ST.mode === 'key' ? cur[k] : (cp.offset?.[k] ?? (isNum ? 0 : [0,0,0]));
      const range = ST.mode === 'key' ? (isNum ? [-3.2, 3.2] : [-1.5, 1.5]) : (isNum ? [-1.6, 1.6] : [-1, 1]);
      if (isNum){ const o = { v: round(val) }; f.add(o, 'v', ...range, 0.01).name(label).onChange(v => setPart(k, v)); }
      else AX.forEach((ax, i) => { const o = { v: round(val[i]) }; f.add(o, 'v', ...range, 0.01).name(label+' · '+ax).onChange(v => { const src = ST.mode === 'key' ? ({ ...base, ...(ST.patch[ST.clip]?.keys?.[ST.key] || {}) })[k] : (ST.patch[ST.clip]?.offset?.[k] || [0,0,0]); const nv = [...src]; nv[i] = v; setPart(k, nv); }); });
    }
  }
}
function edit(fn){ const p = ST.patch[ST.clip] || (ST.patch[ST.clip] = {}); fn(p); rebuild(ST.clip); showClip(); save(); buildKeys(); }
function setPart(k, v){
  edit(p => {
    if (ST.mode === 'offset'){ (p.offset ||= {})[k] = Array.isArray(v) ? v.map(round) : round(v); return; }
    const m = meta(), ref = m.keys[ST.key].pose; p.keys ||= {};
    m.keys.forEach((kk, i) => { if (i === ST.key || same(kk.pose, ref)) (p.keys[i] ||= {})[k] = Array.isArray(v) ? v.map(round) : round(v); });
  });
}
$('#resetClip').onclick = () => { if (!confirm('Remove all edits on '+ST.clip+'?')) return; delete ST.patch[ST.clip]; rebuild(ST.clip); showClip(); save(); buildKeys(); buildGUI(); };

// ---------- notes + export ----------
function renderNotes(){
  const l = ST.notes.map((n, i) => ({ ...n, i })).filter(n => n.clip === ST.clip);
  $('#noteList').innerHTML = l.length ? l.map(n => `<div class="note"><span><b data-t="${n.t}">${n.t.toFixed(2)}s</b> ${n.text.replace(/</g,'&lt;')}</span><button data-del="${n.i}" title="Delete">×</button></div>`).join('') : '<span style="color:rgba(255,255,255,.5);font-size:13px">No notes on this clip yet.</span>';
  $('#noteList').querySelectorAll('[data-t]').forEach(b => b.onclick = () => { ST.playing = false; setTime(+b.dataset.t); });
  $('#noteList').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { ST.notes.splice(+b.dataset.del, 1); save(); buildKeys(); });
}
$('#addNote').onclick = () => { const text = $('#noteTxt').value.trim(); if (!text) return; const m = meta(); let key = null;
  if (m?.keyed){ const f = ST.t/clipDur(); key = m.keys.reduce((b, k, i) => Math.abs(k.t - f) < Math.abs(m.keys[b].t - f) ? i : b, 0) + 1; }
  ST.notes.push({ clip:ST.clip, t: round(ST.t), pct: Math.round(ST.t/clipDur()*100), key, view: viewName(), text }); $('#noteTxt').value = ''; save(); buildKeys(); };
function viewName(){ const d = W.camera.position.clone().sub(ctl.target); const a = Math.atan2(d.z, d.x)*180/PI; return d.y > Math.hypot(d.x, d.z)*1.5 ? 'top' : Math.abs(a - 90) < 45 ? 'side' : Math.abs(a) < 45 ? 'front' : Math.abs(Math.abs(a) - 180) < 45 ? 'back' : 'side/back'; }
$('#export').onclick = () => {
  const edited = Object.fromEntries(Object.entries(ST.patch).filter(([, v]) => v && Object.keys(v).length));
  const lines = ['SUMMER CHAMPS · ANIM EDITS', '', 'NOTES:', ...(ST.notes.length ? ST.notes.map(n => `- ${n.clip} @ ${n.t.toFixed(2)}s (${n.pct}%${n.key ? ', nearest key '+n.key : ''}, ${n.view} view): ${n.text}`) : ['- none']), '', 'PATCH (paste into sc-anim-patch.js):', JSON.stringify(edited, null, 1)];
  const txt = lines.join('\n'); $('#out').value = txt; $('#modal').style.display = 'flex'; navigator.clipboard?.writeText(txt).catch(() => {}); $('#out').select();
};
$('#closeModal').onclick = () => $('#modal').style.display = 'none';

// bar: rests on the floor, is gripped at the end of Lift_Setup, falls after the release in Lift_Drop
const BAR_REST = () => ath.pivot.position.clone().add(new V3(0.4, 0.23, 0).applyAxisAngle(new V3(0,1,0), ath.pivot.rotation.y));
function gripAt(f){ const c = ath.cur, d = c.getClip().duration, t0 = c.time; c.time = f*d; ath.update(0); ath.rigs[LIB.customIdx].model.updateMatrixWorld(true); const gr = ath.grip('R'), gl = ath.grip('L'); c.time = t0; ath.update(0); return [gr, gl]; }
function barPose(po){
  const bar = P[0], f = ST.t/clipDur(); let [gr, gl] = [ath.grip('R'), ath.grip('L')], pinned = true, pos, dir;
  if (ST.clip === 'Lift_Setup' && f < 0.9){ pinned = false; pos = BAR_REST(); dir = new V3(0,0,1).applyAxisAngle(new V3(0,1,0), ath.pivot.rotation.y); }
  if (ST.clip === 'Lift_Drop' && f > 0.3){ pinned = false; [gr, gl] = gripAt(0.3); const p0 = gr.clone().add(gl).multiplyScalar(0.5).add(po), dt = (f - 0.3)*clipDur(), rest = BAR_REST(); pos = new V3(p0.x, Math.max(rest.y, p0.y - 4.9*dt*dt), p0.z); dir = gl.sub(gr).normalize(); dir.y = pos.y <= rest.y ? 0 : dir.y; dir.normalize(); }
  if (pinned){ pos = gr.clone().add(gl).multiplyScalar(0.5).add(po); dir = gl.sub(gr).normalize(); }
  bar.position.copy(pos); bar.quaternion.setFromUnitVectors(new V3(0,0,1), dir);
}

// ---------- render ----------
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop); const dt = Math.min(0.05, (now - last)/1000); last = now;
  if (ST.playing) setTime(ST.t + dt*ST.speed);
  W.athletes.forEach(a => a.update(0)); W.tickers.forEach(f => f(dt, W.clock.elapsedTime));
  if (ath && P.length){ const k = curCtx.prop, hr = ath.hand('R'), hl = ath.hand('L');
    const po = new V3(...(ST.patch._props?.[k] || [0,0,0])).applyAxisAngle(new V3(0,1,0), ath.pivot.rotation.y);
    if (k === 'javelin'){ P[0].position.copy(ath.grip('R')).add(po); P[0].rotation.set(0, 0, 0.25); }
    if (k === 'discus') P[0].position.copy(hr).add(po);
    if (k === 'bar') barPose(po);
    if (k === 'bow') poseBow(P[0], hl, hr, /Draw|Aim|Notch/.test(ST.clip) || (ST.clip === 'Bow_Shoot' && ST.t/clipDur() < 0.12), po);
    if (k === 'foil') [ath, opp].forEach((a, i) => { if (!a || !P[i]) return; const h = a.hand('R'), fr = a.hand('F'); P[i].position.copy(h); P[i].quaternion.setFromUnitVectors(new V3(0,1,0), h.sub(fr).normalize()); });
  }
  const p = ath?.pivot.position; $('#info').innerHTML = ath ? `<span class="k">${ST.clip}</span> · ${curCtx.group} · ${clipDur().toFixed(2)}s${ST.patch[ST.clip] ? ' · <span class="k">edited</span>' : ''}` : '';
  if (W.sun && p){ W.sun.position.set(p.x+30, 60, p.z+40); W.sun.target.position.copy(p); }
  ctl.update(); W.renderer.render(W.scene, W.camera);
}
