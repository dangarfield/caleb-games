// Summer Champs: renderer, venues, athletes, props.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { buildCustomClips } from './sc-anim.js';
import { SAVE } from './sc-save.js';
const V3 = THREE.Vector3, PI = Math.PI;

export const KITS = [
  { id:'blue', name:'BLUE', color:'#3F72B5' },
  { id:'orange', name:'ORANGE', color:'#E8744F' },
  { id:'green', name:'GREEN', color:'#4CAF6A' },
  { id:'teal', name:'TEAL', color:'#2BB3A8' },
  { id:'purple', name:'PURPLE', color:'#8B6CD9' },
  { id:'pink', name:'PINK', color:'#F27BA8' },
];

// ---------- renderer ----------
export const W = { clock:new THREE.Clock(), athletes:[], tickers:[], venue:null };
export const PERF = !!SAVE.get('perf', false);
export function initRenderer(canvas){
  const r = new THREE.WebGLRenderer({ canvas, antialias:!PERF, powerPreference: PERF ? 'low-power' : 'high-performance' });
  r.setPixelRatio(PERF ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = !PERF; r.shadowMap.type = THREE.PCFShadowMap;
  W.renderer = r; W.scene = new THREE.Scene();
  W.camera = new THREE.PerspectiveCamera(34, 1333/690, 0.1, 900);
  W.camLook = new V3(); W.camPos = new V3(0,2,10); W.camTgtPos = new V3(0,2,10); W.camTgtLook = new V3();
  const fit = () => { const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return; r.setSize(w, h, false); W.camera.aspect = w/h; W.camera.updateProjectionMatrix(); };
  new ResizeObserver(fit).observe(canvas); fit();
}
export function setCam(pos, look, snap){ W.camTgtPos.copy(pos); W.camTgtLook.copy(look); if (snap){ W.camPos.copy(pos); W.camLook.copy(look); } }
export function renderFrame(dt){
  W.athletes.forEach(a => a.update(dt));
  W.tickers.forEach(f => f(dt, W.clock.elapsedTime)); if (W.tickers.some(f => f.dead)) W.tickers = W.tickers.filter(f => !f.dead);
  const k = Math.min(1, dt*4);
  W.camPos.lerp(W.camTgtPos, k); W.camLook.lerp(W.camTgtLook, k);
  W.camera.position.copy(W.camPos); W.camera.lookAt(W.camLook);
  const wtr = W.venue?.info?.water; if (wtr){ const u = W.camera.position.y < wtr.y; if (u !== !!W.isUnder){ W.isUnder = u; if (u){ W.fogAbove = W.scene.fog; W.scene.fog = new THREE.FogExp2('#0E5A86', 0.075); } else W.scene.fog = W.fogAbove; } }
  if (W.sun){ W.sun.position.set(W.camLook.x+30, 60, W.camLook.z+40); W.sun.target.position.copy(W.camLook); }
  W.renderer.render(W.scene, W.camera);
}

// ---------- textures ----------
function canvasTex(w, h, draw, rx=1, ry=1){
  const c = document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
}
const noise = (g, w, h, a) => { for (let i=0;i<w*h/40;i++){ g.fillStyle = `rgba(${Math.random()<.5?0:255},${Math.random()<.5?0:255},${Math.random()<.5?0:255},${a*Math.random()})`; g.fillRect(Math.random()*w, Math.random()*h, 2, 2); } };
const trackTex = (lanes, len) => canvasTex(512, 64*lanes, (g,w,h) => { g.fillStyle='#C4553B'; g.fillRect(0,0,w,h); noise(g,w,h,.08); g.fillStyle='#F4EDE4'; for (let i=0;i<=lanes;i++) g.fillRect(0, i*64-(i===lanes?4:0), w, 4); }, len/8, 1);
const grassTex = len => canvasTex(512, 64, (g,w,h) => { g.fillStyle='#3F8C4F'; g.fillRect(0,0,w,h); g.fillStyle='#47975A'; g.fillRect(0,0,w/2,h); noise(g,w,h,.05); }, len/16, 1);
const adTex = () => canvasTex(1024, 64, (g,w,h) => { g.fillStyle='#0B1B3A'; g.fillRect(0,0,w,h); g.fillStyle='#F2B705'; g.fillRect(0,0,6,h); g.fillRect(w/2,0,6,h); g.font='italic 800 40px "Barlow Condensed", sans-serif'; g.textBaseline='middle'; g.fillStyle='#fff'; g.fillText('SUMMER CHAMPS', 28, h/2+2); g.fillStyle='#F2B705'; g.fillText('10 EVENTS · 1 CHAMPION', w/2+28, h/2+2); }, 8, 1);

// ---------- materials ----------
const mats = {};
export const M = (c, o={}) => { const k = c+JSON.stringify(o); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color:c, roughness:.85, ...o })); };
function mesh(geo, mat, x=0, y=0, z=0, parent){ const m = new THREE.Mesh(geo, mat); m.position.set(x,y,z); m.castShadow = m.receiveShadow = true; parent && parent.add(m); return m; }
const box = (g, w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w,h,d), typeof mat==='string'? M(mat) : mat, x, y, z, g);

// ---------- sky + light ----------
function outdoorSky(g){
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false,
    uniforms:{ top:{value:new THREE.Color('#3C7DC4')}, mid:{value:new THREE.Color('#8FC0EA')}, bot:{value:new THREE.Color('#E6EEF3')} },
    vertexShader:'varying vec3 p; void main(){ p=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader:'uniform vec3 top,mid,bot; varying vec3 p; void main(){ float h=p.y; vec3 c = h>0.15? mix(mid,top,smoothstep(.15,.7,h)) : mix(bot,mid,smoothstep(-.02,.15,h)); gl_FragColor=vec4(c,1.); }' }));
  g.add(sky);
  for (let i=0;i<14;i++){ const cl = new THREE.Group(); for (let j=0;j<4;j++) mesh(new THREE.IcosahedronGeometry(6+Math.random()*5, 0), M('#ffffff',{roughness:1, flatShading:true}), j*7-10, Math.random()*3, Math.random()*4, cl); cl.position.set(-300+i*50+Math.random()*20, 70+Math.random()*40, -260-Math.random()*80); cl.traverse(o=>o.castShadow=false); g.add(cl); }
  g.add(new THREE.HemisphereLight('#dcecff', '#5d7f4f', 1.1));
  const sun = new THREE.DirectionalLight('#fff3dd', 2.6); sun.castShadow = !PERF; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left:-40, right:40, top:40, bottom:-40, near:1, far:200 }); sun.shadow.bias = -0.0004;
  g.add(sun, sun.target); W.sun = sun;
  W.scene.fog = new THREE.Fog('#CFE2F0', 160, 560);
}
function indoorLight(g){
  W.scene.background = new THREE.Color('#070B16'); W.scene.fog = new THREE.Fog('#070B16', 40, 120);
  g.add(new THREE.HemisphereLight('#8aa0c8', '#1a1e29', 0.7));
  const key = new THREE.DirectionalLight('#fff4e6', 1.6); key.castShadow = !PERF; key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera, { left:-15, right:15, top:15, bottom:-15, near:1, far:120 }); g.add(key, key.target); W.sun = key;
  [-6, 0, 6].forEach(x => { const s = new THREE.SpotLight('#fff1dc', 180, 40, 0.5, 0.6, 1.6); s.position.set(x, 16, 6); s.target.position.set(x*0.4, 0, 0); g.add(s, s.target); });
}

// ---------- stadium dressing ----------
const CROWD = ['#F2B705','#ffffff','#E8744F','#3F72B5','#2BB3A8','#8B6CD9','#F27BA8','#1E2A4A','#D9434F','#9BD8FD'];
function grandstand(g, cx, len, z0, opts={}){
  const rows = opts.rows ?? 14, step = 0.75, depth = 0.95, dark = !!opts.indoor;
  for (let r=0;r<rows;r++) box(g, len, step, depth+0.02, dark? '#1B2236' : (r%2? '#2E3B57':'#34425F'), cx, r*step+step/2+1.2, z0 - r*depth);
  box(g, len, 1.2, 0.3, M('#0B1B3A',{map:adTex()}), cx, 0.6, z0+depth/2+0.2);
  const per = Math.floor(len/0.62), n = rows*per, geo = new THREE.BoxGeometry(0.42, 0.62, 0.34), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness:.9 }), n);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), base = [];
  let i = 0; for (let r=0;r<rows;r++) for (let k=0;k<per;k++){ if (Math.random()<0.12){ m4.makeScale(0,0,0); inst.setMatrixAt(i, m4); base.push(null); i++; continue; }
    const x = cx-len/2+0.31+k*0.62+(Math.random()-.5)*0.1, y = (r+1)*step+1.2+0.31, z = z0-r*depth; m4.makeTranslation(x,y,z); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.set(CROWD[(Math.random()*CROWD.length)|0])); base.push([x,y,z,Math.random()*6.28]); i++; }
  inst.castShadow = false; inst.receiveShadow = true; g.add(inst);
  W.crowd = { inst, base, cheer:0 };
  if (!dark){
    const roofY = rows*step+6; box(g, len, 0.4, rows*depth*0.7, '#E9EEF4', cx, roofY, z0-rows*depth*0.55);
    for (let x=cx-len/2+10; x<cx+len/2; x+=30){ box(g, 0.4, roofY, 0.4, '#C9D0DA', x, roofY/2, z0-rows*depth+1); }
    for (const x of [cx-len/2-6, cx+len/2+6]){ box(g, 0.8, 42, 0.8, '#C9D0DA', x, 21, z0-rows*depth); const p = box(g, 7, 4, 0.6, M('#ffffff',{emissive:'#fff6dd', emissiveIntensity:1.4}), x, 43, z0-rows*depth+0.5); p.castShadow=false; }
  }
  box(g, len+40, 30, 1, dark? '#0E1322' : '#2A3550', cx, 15, z0-rows*depth-4);
}
export function cheer(v){ if (W.crowd) W.crowd.cheer = v; }
function crowdTick(dt, t){ const c = W.crowd; if (!c) return; if (c.cheer > 0.01 || c.moving){ const m4 = new THREE.Matrix4(); c.base.forEach((b,i) => { if (!b) return; m4.makeTranslation(b[0], b[1]+Math.max(0,Math.sin(t*9+b[3]))*0.22*c.cheer, b[2]); c.inst.setMatrixAt(i, m4); }); c.inst.instanceMatrix.needsUpdate = true; c.moving = c.cheer > 0.01; } c.cheer = Math.max(0, c.cheer - dt*0.25); }

// ---------- venues ----------
export function buildVenue(kind){
  if (W.venue) W.scene.remove(W.venue.g);
  (W.props || []).forEach(removeObj); W.props = [];
  W.scene.background = null; W.scene.fog = null; W.crowd = null; W.tickers = [crowdTick]; W.isUnder = false; W.slow = 1;
  const g = new THREE.Group(), info = { kind };
  const indoor = kind==='lift' || kind==='piste';
  if (indoor) indoorLight(g); else outdoorSky(g);
  const ground = (x0, x1, z0, z1, mat) => { const m = mesh(new THREE.PlaneGeometry(x1-x0, z1-z0), mat, (x0+x1)/2, 0, (z0+z1)/2, g); m.rotation.x = -PI/2; m.castShadow = false; return m; };
  if (!indoor){ const gm = M('#3F8C4F',{map:grassTex(400)}); ground(-150, 250, kind==='throw' ? -150 : -12, 60, gm); }
  if (kind==='track' || kind==='podium'){
    const t = ground(-20, 130, -2.5, 6.5, M('#C4553B',{map:trackTex(8,150), roughness:.95})); t.position.y = 0.01;
    box(g, 0.1, 0.02, 9, '#ffffff', 100, 0.015, 2); box(g, 0.1, 0.02, 9, '#ffffff', 0, 0.015, 2);
    for (const x of [-0.6, 100.4]) for (const z of [-2.6, 6.6]) box(g, 0.12, 1.4, 0.12, x>50? '#F2B705':'#ffffff', x, 0.7, z);
    grandstand(g, 50, 190, -7);
    info.lanes = [-1.4, 0.5, 2.4, 4.4]; info.finish = 100;
    if (kind==='podium'){ box(g, 1.8, 1.1, 1.8, '#F4F6F8', 50, 0.55, 2); box(g, 1.8, 0.75, 1.8, '#E3E7EC', 48.2, 0.375, 2); box(g, 1.8, 0.5, 1.8, '#E3E7EC', 51.8, 0.25, 2); info.steps = [[50,1.1],[48.2,0.75],[51.8,0.5],[54.2,0]]; }
  }
  if (kind==='field'){
    const r = ground(-5, 44, -0.7, 0.7, M('#C4553B',{map:trackTex(1,50)})); r.position.y = 0.01;
    box(g, 0.22, 0.03, 1.4, '#ffffff', 40, 0.02, 0);
    const PL = 18.1, pc = 41.4 + PL/2; const pit = box(g, PL, 0.1, 3.2, M('#E4CF9C',{map:canvasTex(256,64,(c,w,h)=>{c.fillStyle='#E4CF9C';c.fillRect(0,0,w,h);noise(c,w,h,.12);},6,1), roughness:1}), pc, 0.03, 0);
    box(g, PL+0.4, 0.16, 0.2, '#ffffff', pc, 0.05, 1.7); box(g, PL+0.4, 0.16, 0.2, '#ffffff', pc, 0.05, -1.7); box(g, 0.2, 0.16, 3.6, '#ffffff', 41.4+PL+0.1, 0.05, 0);
    for (let d=2; d<=19; d++){ box(g, 0.05, 0.4, 0.05, '#ffffff', 40+d, 0.2, -2.1); }
    grandstand(g, 35, 150, -9); info.board = 40; info.pit = 41.4; info.pitMark = m => mark(g, 40+m, 0.09, 0);
  }
  if (kind==='throw'){
    const r = ground(-12, 30, -0.9, 0.9, M('#C4553B',{map:trackTex(1,42)})); r.position.y = 0.01; info.runway = r;
    const arc = mesh(new THREE.TorusGeometry(4, 0.06, 4, 40, PI*0.4), M('#ffffff'), 26, 0.02, 0, g); arc.rotation.x = -PI/2; arc.rotation.z = -PI*0.2;
    const jav = new THREE.Group(); g.add(jav);
    for (let d=20; d<=90; d+=10){ box(jav, 0.08, 0.02, 30, '#ffffff', 30+d, 0.02, 0); const s = sign(String(d), 1.2); s.position.set(30+d, 0.6, -15.5); jav.add(s); }
    const dsc = new THREE.Group(); g.add(dsc);
    info.setThrowField = (kind, T) => {
      const S = info.stands; r.visible = kind !== 'discus'; jav.visible = kind !== 'discus'; dsc.visible = kind === 'discus'; arc.visible = kind !== 'discus'; S.jStand.visible = kind !== 'discus'; S.dStand.visible = kind === 'discus'; if (info.runway) info.runway.visible = kind !== 'discus'; W.crowd = kind === 'discus' ? S.dCrowd : S.jCrowd; if (kind !== 'discus') return;
      { const h = (T.sector ?? 45)/2*PI/180, d = new V3(Math.cos(h), 0, -Math.sin(h)), o = new V3(-Math.sin(h), 0, -Math.cos(h)); S.dStand.rotation.y = h; S.dStand.position.set(28.2, 0, 0).addScaledVector(d, 62).addScaledVector(o, 15); }
      dsc.clear(); const cx = 28.2, half = (T.sector ?? 45)/2*PI/180, gold = (T.gold ?? 15)/2*PI/180, R = 85, wm = new THREE.MeshBasicMaterial({ color:'#ffffff' });
      const wedge = (a, col, op, y) => { const m = new THREE.Mesh(new THREE.CircleGeometry(R, 48, -a, 2*a), new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:op, depthWrite:false })); m.rotation.x = -PI/2; m.position.set(cx, y, 0); dsc.add(m); };
      wedge(half, '#ffffff', 0.08, 0.015); wedge(gold, '#F2B705', 0.22, 0.02);
      for (const s of [-1, 1]){ const l = new THREE.Mesh(new THREE.BoxGeometry(R, 0.02, 0.1), wm); l.position.set(cx + Math.cos(half)*R/2, 0.025, -s*Math.sin(half)*R/2); l.rotation.y = s*half; dsc.add(l); }
      for (let d=20; d<=80; d+=10){ const rr = d + 1.25, m = new THREE.Mesh(new THREE.RingGeometry(rr-0.05, rr+0.05, 64, 1, -half, 2*half), wm); m.rotation.x = -PI/2; m.position.set(cx, 0.03, 0); dsc.add(m); const sg = sign(String(d), 1.2); sg.position.set(cx + Math.cos(half)*rr, 0.6, -Math.sin(half)*rr - 1.2); dsc.add(sg); }
    };
    const ring = mesh(new THREE.TorusGeometry(1.25, 0.05, 6, 40), M('#ffffff'), 0, 0.02, 0, g); ring.rotation.x = PI/2; ring.visible = false; info.ring = ring;
    const pad = box(g, 2.8, 0.03, 2.8, '#9AA3AD', 0, 0.01, 0); pad.visible = false; info.pad = pad;
    const jStand = new THREE.Group(), dStand = new THREE.Group(); g.add(jStand, dStand);
    grandstand(jStand, 50, 200, -38); const jCrowd = W.crowd; grandstand(dStand, 0, 150, 0); const dCrowd = W.crowd; W.crowd = jCrowd; info.foul = 30;
    info.stands = { jStand, dStand, jCrowd, dCrowd };
    info.setThrowField('javelin', {});
  }
  if (kind==='pool' || kind==='dive'){
    const L = kind==='pool'? 25 : 18, Wd = kind==='pool'? 12 : 14, x0 = kind==='pool'? 0 : -4;
    const deck = M('#E6E1D6', { map: canvasTex(128,128,(c,w,h)=>{ c.fillStyle='#E6E1D6'; c.fillRect(0,0,w,h); c.strokeStyle='#D2CBBE'; c.lineWidth=2; for(let i=0;i<=w;i+=32){ c.beginPath(); c.moveTo(i,0); c.lineTo(i,h); c.moveTo(0,i); c.lineTo(w,i); c.stroke(); } }, 40, 20) });
    ground(-60, x0-0.01, -12, 30, deck).position.y = 0.3; ground(x0+L+0.01, 120, -12, 30, deck).position.y = 0.3;
    ground(x0, x0+L, -12, -Wd/2+2, deck).position.y = 0.3; ground(x0, x0+L, Wd/2+2, 30, deck).position.y = 0.3;
    const D = kind==='dive'? 8 : 2.6;
    box(g, L, 0.1, Wd, M('#1D86C4'), x0+L/2, -D, 2);
    for (let i=0;i<=Math.floor(Wd/2.5);i++) box(g, L, 0.02, 0.25, '#0F4F7A', x0+L/2, -D+0.06, 2-Wd/2+1.25+i*2.5);
    box(g, 0.2, D+0.3, Wd, '#DCE4EA', x0-0.1, -D/2+0.15, 2); box(g, 0.2, D+0.3, Wd, '#DCE4EA', x0+L+0.1, -D/2+0.15, 2);
    box(g, L+0.4, D+0.3, 0.2, '#CFE0EA', x0+L/2, -D/2+0.15, 2-Wd/2-0.1); box(g, L+0.4, D+0.3, 0.2, '#CFE0EA', x0+L/2, -D/2+0.15, 2+Wd/2+0.1);
    const wg = new THREE.PlaneGeometry(L, Wd, 50, 24); const water = mesh(wg, new THREE.MeshPhysicalMaterial({ color:'#3BB0E6', roughness:.12, metalness:0, transparent:true, opacity:.78, clearcoat:1, side:THREE.DoubleSide }), x0+L/2, 0.12, 2, g); water.rotation.x = -PI/2; water.castShadow = false;
    const pos = wg.attributes.position, base = pos.array.slice();
    W.tickers.push((dt,t) => { for (let i=0;i<pos.count;i++){ const x = base[i*3], y = base[i*3+1]; pos.array[i*3+2] = Math.sin(x*1.3+t*1.6)*0.04 + Math.cos(y*1.7+t*1.2)*0.04 + (W.splash? W.splash.amp*Math.exp(-((x-W.splash.x)**2+(y-W.splash.y)**2)*0.3)*Math.sin(t*14) : 0); } pos.needsUpdate = true; wg.computeVertexNormals(); if (W.splash){ W.splash.amp *= 0.96; if (W.splash.amp<0.01) W.splash = null; } });
    info.water = { x0, L, y:0.12, z0:2-Wd/2, depth:D };
    if (kind==='pool'){
      info.lanes = [-0.5, 2, 4.5, 7]; info.wall = x0+L;
      [-1.75, 0.75, 3.25, 5.75, 8.25].forEach((z,j) => { const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), M('#ffffff'), 120); const m4 = new THREE.Matrix4(), c = new THREE.Color();
        for (let i=0;i<120;i++){ m4.makeTranslation(x0+i*(L/120), 0.14, z); beads.setMatrixAt(i, m4); beads.setColorAt(i, c.set(i<10||i>109? '#D9434F' : (Math.floor(i/5)%2? '#F2B705':'#3F72B5'))); } g.add(beads); });
      info.lanes.forEach(z => box(g, 0.7, 0.55, 0.7, '#F4F6F8', x0-0.5, 0.57, z));
      grandstand(g, 12, 120, -8);
    } else {
      const H = 100; box(g, 3, H, 3, '#C9CED6', -5.5, H/2, 0); box(g, 4.2, 0.3, 2.4, '#EEF1F5', -4.2, H+0.15, 0);
      for (const z of [-1.15, 1.15]){ box(g, 3.4, 0.06, 0.06, '#9AA3AD', -4.6, H+1.3, z); box(g, 3.4, 0.04, 0.04, '#9AA3AD', -4.6, H+0.8, z); for (const x of [-6.25, -4.6, -2.95]) box(g, 0.06, 1.0, 0.06, '#9AA3AD', x, H+0.8, z); }
      // ladder on the front face of the tower (rails + instanced rungs), clear of the height signs
      const LZ = 1.56, LX = -6.3; for (const x of [LX-0.35, LX+0.35]) box(g, 0.06, H+1.2, 0.06, '#9AA3AD', x, (H+1.2)/2, LZ);
      { const n = Math.floor(H/0.4), rung = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), M('#9AA3AD'), n), m4 = new THREE.Matrix4(); for (let i=0;i<n;i++){ m4.makeTranslation(LX, 0.4+i*0.4, LZ); rung.setMatrixAt(i, m4); } rung.castShadow = true; g.add(rung); }
      for (let y=10;y<H;y+=10){ box(g, 3.1, 0.25, 3.1, '#0B1B3A', -5.5, y, 0); const s = sign(y+'M', 0.9); s.position.set(-4.9, y+0.8, 1.56); g.add(s); }
      info.platform = { x:-2.1-0.14, y:H+0.3, edge:-2.1 };
      grandstand(g, 5, 110, -8);
    }
  }
  if (kind==='range'){
    for (let i=0;i<40;i++){ const tr = new THREE.Group(); mesh(new THREE.CylinderGeometry(0.2,0.3,2.2,6), M('#6B4A2E'), 0, 1.1, 0, tr); mesh(new THREE.IcosahedronGeometry(2+Math.random(), 0), M(Math.random()<.5? '#2E6B3C':'#3A7C45',{flatShading:true}), 0, 3.6, 0, tr); tr.position.set(40+Math.random()*30, 0, -30+i*1.6+Math.random()); g.add(tr); }
    const tg = new THREE.Group(); ['#ffffff','#1E1E1E','#2F7FD1','#D9434F','#F2B705'].forEach((c,i) => { const r = mesh(new THREE.CylinderGeometry(0.61-i*0.122, 0.61-i*0.122, 0.08+i*0.012, 40), M(c,{roughness:.6}), 0, 0, 0, tg); r.rotation.z = PI/2; });
    const legs = new THREE.Group(); [-0.5, 0.5].forEach(z => { const l = box(legs, 0.08, 1.8, 0.08, '#8a6a45', 0.3, -0.5, z); l.rotation.x = z*0.3; });
    tg.add(legs); tg.position.set(30, 1.3, 0); tg.rotation.z = -0.12; g.add(tg); info.target = tg; info.targetX = 30;
    box(g, 0.1, 0.02, 3, '#ffffff', 0.6, 0.02, 0);
    for (const z of [-4, 4]) { const f = box(g, 30, 1, 0.08, M('#0B1B3A',{map:adTex()}), 15, 0.5, z); f.material.map.repeat.set(3,1); }
  }
  if (indoor){
    const fl = mesh(new THREE.PlaneGeometry(80, 60), M('#2A3040',{roughness:.6}), 0, 0, 0, g); fl.rotation.x = -PI/2; fl.castShadow = false;
    grandstand(g, 0, 60, -9, { indoor:true, rows:10 });
    for (let x=-24;x<=24;x+=4){ const l = box(g, 1.6, 0.2, 0.8, M('#ffffff',{emissive:'#fff6e0', emissiveIntensity:2}), x, 18, 2); l.castShadow = false; }
    if (kind==='lift'){ box(g, 4, 0.1, 4, '#15171D', 0, 0.05, 0); box(g, 3.2, 0.12, 3.2, '#A36C40', 0, 0.06, 0); }
    if (kind==='piste'){ box(g, 16, 0.06, 1.8, '#6F819B', 0, 0.03, 0); [-7,-2,0,2,7].forEach(x => { const l = box(g, 0.06, 0.006, 1.76, '#ffffff', x, 0.063, 0); l.castShadow = false; }); info.lamps = [-1, 1].map(s => mesh(new THREE.SphereGeometry(0.28, 16, 12), M('#333333'), s*1.2, 4.5, -5, g)); box(g, 4, 1.5, 0.3, '#0B1B3A', 0, 4.5, -5.2); }
  }
  W.scene.add(g); W.venue = { g, info };
  return info;
}
function mark(g, x, y, z){ const m = mesh(new THREE.CylinderGeometry(0.04,0.04,0.6,6), M('#F2B705'), x, y+0.3, z+1.8, g); return m; }
export function sign(text, h=1){ const tex = canvasTex(256, 128, (c,w,hh) => { c.fillStyle='#0B1B3A'; c.fillRect(0,0,w,hh); c.fillStyle='#fff'; c.font='800 90px "Barlow Condensed", sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(text, w/2, hh/2+6); }); tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.repeat.set(1,1); const m = new THREE.Mesh(new THREE.PlaneGeometry(h*2, h), new THREE.MeshBasicMaterial({ map:tex })); return m; }

// ---------- athletes ----------
// One trimmed library: the UAL1 mannequin + only the UAL1/UAL2 clips the game uses (tools/build-anims.mjs).
const ANIMS_URL = new URL('../assets/summer-champs-anims.glb', import.meta.url).href;
const HANDSETS = [{R:'DEF-handR',L:'DEF-handL',F:'DEF-forearmR',G:['DEF-f_middle.02.R','DEF-f_middle.02.L']},{R:'hand_r',L:'hand_l',F:'lowerarm_r',G:['middle_02_r','middle_02_l']},{R:'RightHand',L:'LeftHand',F:'RightLowerArm',G:['RightMiddleIntermediate','LeftMiddleIntermediate']}];
const handsOf = m => HANDSETS.find(h => m.getObjectByName(h.R)) || HANDSETS[1];
export const LIB = { models:[], clips:{}, owner:{}, unified:false, customIdx:1 };
const ALIAS = n => LIB.clips[n] ? n : LIB.clips[n.replace(/_Loop$/, '')] ? n.replace(/_Loop$/, '') : ({ A_TPose:'A_Tpose' })[n];
export function replaceClip(name, clip){ const old = LIB.clips[name]; LIB.clips[name] = clip; if (LIB.yfix) delete LIB.yfix[name]; W.athletes.forEach(a => { a.rigs.forEach(r => { const act = r.actions[name]; if (act){ act.stop(); r.mixer.uncacheAction(old); r.mixer.uncacheClip(old); delete r.actions[name]; } }); if (a.curName === name) a.cur = null; }); }
export async function loadAssets(onProgress){
  const list = await loadSet([ANIMS_URL], onProgress); LIB.unified = true; LIB.customIdx = 0; LIB.source = 'bundled';
  return finishLoad(list);
}
async function loadSet(urls, onProgress){
  const prog = urls.map(()=>0);
  return Promise.all(urls.map((u,i) => new Promise((res, rej) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(u, res, e => { prog[i] = e.loaded; onProgress && onProgress(prog.reduce((a,b)=>a+b,0)/1048576); }, rej))));
}
function finishLoad(list){
  list.forEach((gl, i) => {
    const model = gl.scene; const bx = new THREE.Box3().setFromObject(model), s = 1.8/(bx.max.y-bx.min.y);
    model.scale.setScalar(s); model.position.y = -bx.min.y*s; model.rotation.y = PI/2;
    const holder = new THREE.Group(); holder.add(model); holder.updateMatrixWorld(true);
    LIB.models[i] = model;
    if (LIB.unified) gl.animations.forEach(c => { c.tracks = c.tracks.filter(t => !/^Root\.(quaternion|position|scale)$/.test(t.name)); });
    gl.animations.forEach(c => { if (!LIB.clips[c.name]){ LIB.clips[c.name] = c; LIB.owner[c.name] = LIB.unified ? 0 : i; } });
  });
  if (LIB.unified) LIB.models = [LIB.models[0]];
  const custom = buildCustomClips(LIB.models[LIB.customIdx], undefined, LIB.unified ? { ...LIB.clips } : {});
  for (const n in custom){ LIB.clips[n] = custom[n]; LIB.owner[n] = LIB.customIdx; }
  return LIB;
}
const NO_FLOOR = /^(Swim|Tread|Water_|HD_(Tuck|Entry|Splat|Fall|Pike)|Dive_Start|Tumble|NinjaJump_Idle)/;
let PROBE = null; const V3F = new THREE.Vector3();
export function clipFloor(name){
  LIB.yfix = LIB.yfix || {}; if (name in LIB.yfix) return LIB.yfix[name];
  const clip = LIB.clips[name]; if (!clip || NO_FLOOR.test(name)) return (LIB.yfix[name] = 0);
  if (!PROBE){ PROBE = makeAthlete({ color:'#888888' }, 'probe', true); }
  const idx = LIB.owner[name] ?? 0, r = PROBE.rigs[idx]; r.mixer.stopAllAction(); const act = r.mixer.clipAction(clip); act.reset(); act.play(); act.paused = true;
  const meshes = []; r.model.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); }); let mn = Infinity;
  for (let k = 0; k <= 16; k++){ act.time = k/16*clip.duration; r.mixer.update(0); PROBE.pivot.updateMatrixWorld(true);
    for (const sm of meshes){ sm.skeleton.update(); const pos = sm.geometry.attributes.position; for (let i = 0; i < pos.count; i += 2){ sm.getVertexPosition(i, V3F); V3F.applyMatrix4(sm.matrixWorld); if (V3F.y < mn) mn = V3F.y; } } }
  act.stop(); return (LIB.yfix[name] = Math.abs(mn) < 0.2 ? -mn : 0);
}
export function makeAthlete(kit, name, probe){
  const pivot = new THREE.Group(), body = new THREE.Group(); pivot.add(body); body.position.y = 0.95;
  const kc = new THREE.Color(kit.color);
  const rigs = LIB.models.map((src, i) => {
    const m = SkeletonUtils.clone(src); m.visible = i === 0; m.position.y -= 0.95;
    const seen = new Map();
    m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false;
      o.material = (Array.isArray(o.material)? o.material : [o.material]).map(mt => { if (seen.has(mt)) return seen.get(mt); const c = mt.clone(); const hsl = {}; mt.color.getHSL(hsl); c.color.copy(hsl.l > 0.35 && hsl.s > 0.3 ? kc : new THREE.Color('#1E2A4A')); c.roughness = .55; c.metalness = 0; seen.set(mt, c); return c; });
      if (o.material.length === 1) o.material = o.material[0]; });
    body.add(m);
    const hs = handsOf(m), hb = k => m.getObjectByName(hs[k]);
    return { model:m, baseY:m.position.y, mixer:new THREE.AnimationMixer(m), actions:{}, R:hb('R'), L:hb('L'), F:hb('F'), GR:m.getObjectByName(hs.G[0]), GL:m.getObjectByName(hs.G[1]) };
  });
  const a = { kit, name, pivot, body, rigs, active:0, cur:null, curName:'', speed:1, yOff:0, yTgt:0,
    play(clipName, o={}){
      const real = ALIAS(clipName), clip = LIB.clips[real] || LIB.clips[ALIAS('Idle_Loop')]; if (!clip) return 0;
      const idx = LIB.owner[clip.name] ?? 0;
      if (idx !== this.active){ const old = this.rigs[this.active]; old.mixer.stopAllAction(); old.model.visible = false; this.active = idx; this.rigs[idx].model.visible = true; this.cur = null; }
      const r = this.rigs[idx]; const act = r.actions[clip.name] || (r.actions[clip.name] = r.mixer.clipAction(clip));
      if (this.cur === act && !o.restart && o.scrub === undefined){ act.timeScale = o.timeScale ?? 1; return clip.duration; }
      const once = o.once ?? clip.userData?.once;
      act.reset(); act.setEffectiveWeight(1); act.setLoop(once? THREE.LoopOnce : THREE.LoopRepeat); act.clampWhenFinished = !!once; act.timeScale = o.timeScale ?? 1; act.enabled = true;
      act.play(); if (this.cur && this.cur !== act){ if (o.scrub !== undefined || o.fade === 0) this.cur.stop(); else this.cur.crossFadeTo(act, o.fade ?? 0.18, false); }
      if (o.scrub !== undefined){ act.paused = true; act.time = o.scrub*clip.duration; } else act.paused = false;
      this.cur = act; this.curName = real ? clipName : clip.name; if (!probe){ this.yTgt = clipFloor(clip.name); if (o.fade === 0 || o.scrub !== undefined) this.yOff = this.yTgt; } return clip.duration;
    },
    scrub(v){ if (this.cur){ this.cur.paused = true; this.cur.time = v*this.cur.getClip().duration; } },
    grip(side){ const r = this.rigs[this.active], m = side==='L' ? r.GL : r.GR; return m ? m.getWorldPosition(new V3()) : this.hand(side); },
    rearX(){ const r = this.rigs[this.active]; if (!r.bones){ r.bones = []; r.model.traverse(o => { if (o.isBone) r.bones.push(o); }); } r.model.updateMatrixWorld(true); let m = Infinity; const v = new V3(); for (const b of r.bones){ v.setFromMatrixPosition(b.matrixWorld); if (v.x < m) m = v.x; } return m; },
    hand(side){ const r = this.rigs[this.active]; return (side==='L'? r.L : side==='F'? r.F : r.R).getWorldPosition(new V3()); },
    update(dt){ const r = this.rigs[this.active]; r.mixer.update(dt); this.yOff += (this.yTgt - this.yOff)*Math.min(1, dt*8); r.model.position.y = r.baseY + this.yOff; },
  };
  if (probe) return a;
  W.scene.add(pivot); W.athletes.push(a); return a;
}
export function clearAthletes(){ W.athletes.forEach(a => W.scene.remove(a.pivot)); W.athletes = []; }
export const hasClip = n => !!ALIAS(n);

// ---------- props ----------
export function prop(kind){
  const g = new THREE.Group(); (W.props || (W.props = [])).push(g);
  if (kind==='javelin'){ const s = mesh(new THREE.CylinderGeometry(0.02,0.02,2.6,6), M('#EDE7D6'), 0,0,0, g); s.rotation.z = -PI/2; const t = mesh(new THREE.ConeGeometry(0.04,0.25,6), M('#555')); t.rotation.z = -PI/2; t.position.x = 1.4; g.add(t); mesh(new THREE.CylinderGeometry(0.03,0.03,0.25,6), M('#D9434F'), 0,0,0, g).rotation.z = -PI/2; }
  if (kind==='discus'){ mesh(new THREE.CylinderGeometry(0.11,0.11,0.045,24), M('#F2B705',{metalness:.2, roughness:.35, emissive:'#F2B705', emissiveIntensity:.35}), 0,0,0, g); mesh(new THREE.CylinderGeometry(0.05,0.05,0.05,16), M('#C9CFD8',{metalness:.8, roughness:.3}), 0,0,0, g); }
  if (kind==='arrow'){ const s = mesh(new THREE.CylinderGeometry(0.012,0.012,0.8,5), M('#8a6a45'), 0,0,0, g); s.rotation.z = -PI/2; const f = box(g, 0.14, 0.06, 0.005, '#F2B705', -0.36, 0, 0); }
  if (kind==='bow'){ const arc = mesh(new THREE.TorusGeometry(0.72,0.02,6,28,PI*0.7), M('#1E2A4A'), 0,0,0, g); arc.rotation.set(0, -PI/2, -PI*0.35); arc.position.x = -0.0; g.userData.string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(),new V3(),new V3()]), new THREE.LineBasicMaterial({ color:'#f2efe8' })); W.scene.add(g.userData.string); }
  if (kind==='foil'){ const b = mesh(new THREE.CylinderGeometry(0.006,0.01,0.9,5), M('#E3E8EE',{metalness:.9, roughness:.2}), 0,0.5,0, g); mesh(new THREE.CylinderGeometry(0.07,0.07,0.02,14), M('#9AA0A8',{metalness:.8}), 0,0.05,0, g); }
  if (kind==='bar'){ const rod = mesh(new THREE.CylinderGeometry(0.025,0.025,2.2,8), M('#B7BEC7',{metalness:.9, roughness:.25}), 0,0,0, g); rod.rotation.x = PI/2;
    for (const z of [-0.85, 0.85]) for (const [r,c,dz] of [[0.23,'#D9434F',0],[0.19,'#2F7FD1',z>0?0.07:-0.07],[0.15,'#F2B705',z>0?0.13:-0.13]]){ const p = mesh(new THREE.CylinderGeometry(r,r,0.06,24), M(c,{roughness:.5}), 0,0,z+dz, g); p.rotation.x = PI/2; } }
  W.scene.add(g); return g;
}
export function dbgLine(){ return new THREE.Group(); }
// bow held in the left hand: arc in the plane of aim + up, grip at the hand, limbs curving back toward the archer
export function poseBow(bow, hl, hr, drawn, off){
  const R0 = 0.72, AR = PI*0.7, arc = bow.children[0];
  arc.rotation.set(0, 0, -AR/2); arc.position.set(-R0, 0, 0);
  const d = hl.clone().sub(hr); if (d.lengthSq() < 1e-4) d.set(1, 0, 0); d.normalize();
  const u = new V3(0, 1, 0).addScaledVector(d, -d.y).normalize(), z = new V3().crossVectors(d, u);
  bow.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, u, z)); bow.position.copy(hl); if (off) bow.position.add(off);
  bow.updateMatrixWorld(true);
  const tx = R0*Math.cos(AR/2) - R0, ty = R0*Math.sin(AR/2), top = new V3(tx, ty, 0).applyMatrix4(bow.matrixWorld), bot = new V3(tx, -ty, 0).applyMatrix4(bow.matrixWorld);
  bow.userData.string?.geometry.setFromPoints([top, drawn ? hr : top.clone().lerp(bot, .5), bot]);
}
export function removeObj(o){ if (!o) return; W.scene.remove(o); if (o.userData?.string) W.scene.remove(o.userData.string); }
let DOT = null;
const dotTex = () => DOT || (DOT = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32,32,0,32,32,32); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(0.45,'rgba(255,255,255,.85)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0,0,64,64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })());
function burst(x, y, z, n, o){
  const pos = new Float32Array(n*3), vel = new Float32Array(n*3);
  for (let i=0;i<n;i++){ const a = Math.random()*PI*2, r = Math.random(), rs = o.spread*Math.random();
    pos.set([x + Math.cos(a)*r*o.r0, y, z + Math.sin(a)*r*o.r0], i*3); vel.set([Math.cos(a)*rs, o.up[0] + o.up[1]*Math.random()*(1 - r*0.5), Math.sin(a)*rs], i*3); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color:o.color || '#ffffff', size:o.size, map:dotTex(), transparent:true, opacity:o.op, depthWrite:false }), pts = new THREE.Points(geo, mat); W.scene.add(pts);
  let t = 0; const f = dt => { t += dt;
    for (let i=0;i<n;i++){ const k = i*3; if (pos[k+1] <= y && vel[k+1] < 0) continue; vel[k+1] -= 9.8*o.g*dt; vel[k] *= 1 - o.drag*dt; vel[k+2] *= 1 - o.drag*dt; pos[k] += vel[k]*dt; pos[k+1] += vel[k+1]*dt; pos[k+2] += vel[k+2]*dt; if (pos[k+1] < y) pos[k+1] = y; }
    geo.attributes.position.needsUpdate = true; mat.opacity = Math.max(0, o.op*(1 - t/o.life)); if (o.grow) mat.size = o.size*(1 + t*o.grow);
    if (t > o.life){ W.scene.remove(pts); geo.dispose(); mat.dispose(); f.dead = true; } };
  W.tickers.push(f);
}
export function splashFX(x, z, size){
  const w = W.venue?.info?.water; if (!w) return; const y = w.y + 0.05; size = Math.max(0.05, Math.min(1, size));
  splash(x, z, 0.2 + 2.4*size);
  burst(x, y, z, Math.round(60 + 1560*size), { r0:0.15 + 1.35*size, spread:0.4 + 6.4*size, up:[1 + 4*size, 2.5 + 24.5*size], size:0.12 + 0.2*size, op:1, g:1, drag:0.4, life:3.2 });
  burst(x, y, z, Math.round(15 + 275*size), { r0:0.2 + 1.8*size, spread:0.2 + 2.7*size, up:[0.5 + 0.5*size, 1.5 + 13.5*size], size:0.4 + 2*size, op:0.45, g:0.25, drag:1.2, life:3.6, grow:0.8 });
  burst(x, y, z, Math.round(10 + 130*size), { r0:0.1, spread:0.15 + 1.35*size, up:[3 + 17*size, 3 + 19*size], size:0.15 + 0.45*size, op:0.95, g:1, drag:0.2, life:2.8 });
  for (let k=0;k<(size > 0.4 ? 2 : 1);k++){
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.75, 56), new THREE.MeshBasicMaterial({ color:'#ffffff', transparent:true, opacity:.9, side:THREE.DoubleSide, depthWrite:false }));
    ring.rotation.x = -PI/2; ring.position.set(x, w.y+0.03, z); W.scene.add(ring); let t = -k*0.35;
    const f = dt => { t += dt; if (t < 0) { ring.visible = false; return; } ring.visible = true; ring.scale.setScalar(1 + t*(1.5 + 13.5*size)); ring.material.opacity = Math.max(0, 0.9 - t/2.2); if (t > 2.3){ W.scene.remove(ring); ring.geometry.dispose(); f.dead = true; } };
    W.tickers.push(f);
  }
}
export function bubbles(p){
  const n = 5, pos = new Float32Array(n*3); for (let i=0;i<n;i++) pos.set([p.x+(Math.random()-.5)*0.3, p.y+(Math.random()-.5)*0.3, p.z+(Math.random()-.5)*0.3], i*3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color:'#dff4ff', size:0.07, transparent:true, opacity:.8, depthWrite:false }), pts = new THREE.Points(geo, mat); W.scene.add(pts);
  const top = W.venue?.info?.water?.y ?? 0; let t = 0; const f = dt => { t += dt; for (let i=0;i<n;i++){ pos[i*3+1] = Math.min(top, pos[i*3+1] + (1 + i*0.15)*dt); pos[i*3] += Math.sin(t*6+i)*0.004; } geo.attributes.position.needsUpdate = true; mat.opacity = Math.max(0, 0.8 - t/2); if (t > 2){ W.scene.remove(pts); geo.dispose(); f.dead = true; } };
  W.tickers.push(f);
}
export function splash(x, z, amp=0.5){ const w = W.venue?.info?.water; if (!w) return; W.splash = { x: x-(w.x0+w.L/2), y: -(z-2), amp }; }
