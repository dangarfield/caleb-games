// Summer Champs: track & field events (sprint, long jump, triple jump, javelin, discus).
import * as THREE from 'three';
import { W, setCam, prop, removeObj, cheer, dbgLine, hasClip } from './sc-world.js';
import { propOffset as propOffsetP, activePatch } from './sc-anim.js';
const PATCH0 = activePatch(), propOffset = k => propOffsetP(k, PATCH0);
export const TUNE_DEFAULT = {
  waggle:{ gain:0.11, same:0.015, decay:0.18, decayPower:0.32 },
  sprint:{ top:11.39, cpuPace:1, finishOffset:0.5 },
  long:{ top:10.2, takeoffOffset:0.5, window:3.2, launch:0.924, angleRate:60 },
  triple:{ top:10.2, takeoffOffset:0.5, window:3.2, lift:2.3, goldDeg:20, distGain:1.278, inputOffsetMs:20, phaseTime:0.9, slowmo:1, edgeQ:0.85, missQ:0.55, offQ:0.65 },
  javelin:{ top:9.5, releaseOffset:0.5, angleRate:60, power:1.45 },
  discus:{ spinRate:1.3, power:17, angleRate:60, sector:90, gold:30, aimGain:1 },
  dive:{ gravity:0.72, spinAccel:6, twistAccel:5, maxSpin:9, maxTwist:9, tuckInertia:0.35, twistTuck:0.25, maxSpins:5, maxTwists:5, slowmo:0.3, counterBoost:2 },
  archery:{ wobble:0.6, drawPx:220, windMax:6, windEffect:0.07 },
  swim:{ top:3, turnWindow:1.5, wallOffset:0.5, depthOffset:-0.33, treadDepth:-1.37, cpuPace:1 },
  lift:{ effort:0.35, rate:0.35, liftTime:8, wobble:1, steadyPresses:10, outTime:0.5 },
  fence:{ reactMax:0.95, reactMin:0.45, lunge:1 },
};
export const TUNE = JSON.parse(JSON.stringify(TUNE_DEFAULT));
export const DBG = { delta:'—' };
const V3 = THREE.Vector3, PI = Math.PI, clamp = (x,a,b) => Math.max(a, Math.min(b, x)), lerp = (a,b,t) => a+(b-a)*t;

export class Waggle {
  constructor(){ this.p = 0; this.last = null; }
  tap(side){ const w = TUNE.waggle; this.p = clamp(this.p + (side !== this.last ? w.gain : w.same), 0, 1); this.last = side; }
  update(dt){ const w = TUNE.waggle; this.p = clamp(this.p - dt*(w.decay + w.decayPower*this.p), 0, 1); }
}
export const cpuValue = (ev, skill) => { const [weak, strong] = ev.cpu; return +(lerp(weak, strong, clamp(skill*0.85 + Math.random()*0.25, 0, 1))).toFixed(2); };
export const m = v => v.toFixed(2)+'m', s = v => v.toFixed(2)+'s';
export function place(a, x, y, z, yaw=0){ a.pivot.position.set(x, y, z); a.pivot.rotation.set(0, yaw, 0); a.body.rotation.set(0,0,0); }

// Attempts wrapper: best of N, with a short result cue between attempts.
function attempts(ctx, ev, runOne){
  const st = { n:0, best:null, vals:[] };
  const next = () => {
    if (st.n >= ev.attempts){ return ctx.done({ value: st.best, fouls: st.best===null }); }
    st.n++; ctx.hud.attempt(st.n, ev.attempts, st.vals);
    runOne(v => {
      st.vals.push(v); if (v !== null && (st.best===null || v > st.best)) st.best = v;
      ctx.hud.stat('BEST', st.best===null? '—' : ev.fmt(st.best));
      ctx.hud.cue(v===null? 'FOUL' : ev.fmt(v), v===null? 'bad' : (v===st.best? 'good' : ''));
      if (v !== null && v===st.best) cheer(1);
      setTimeout(next, 2200);
    });
  };
  next();
}

// ---------- 100m sprint ----------
const sprint = { id:'sprint', name:'100M SPRINT', bug:'100M', short:'SPRINT', venue:'track', lower:true, fmt:s, attempts:1, cpu:[13.5, 10.5],
  howto:[['TAP L R L R FAST TO RUN','LR'],['DON\'T STOP UNTIL THE LINE','LR'],['FASTEST TIME WINS','']],
  make(ctx){
    const { hud, info } = ctx, lanes = info.lanes, me = 1;
    const racers = [ctx.player, ...ctx.rivals].map((p, i) => { const lane = i===0? me : (i<=me? i-1 : i); const a = ctx.spawn(p.kit, p.name), x0 = -TUNE.sprint.finishOffset; place(a, x0, 0, lanes[lane]); a.play('Blocks_Marks');
      const rank = [...ctx.rivals].sort((m, n) => n.skill - m.skill).indexOf(p), want = 10.5 + rank + Math.random(), tgt = want - (0.046 + 0.048*(want - 10.5)); return { p, a, x:x0, v:0, top: i===0? 0 : 100/(tgt-1.1), t:null, me:i===0 }; });
    dbgLine(racers[0].a, () => TUNE.sprint.finishOffset);
    const wag = new Waggle(); let t = -2.4, phase = 'marks', over = 0;
    hud.setup({ code:'100M', name:'SPRINT', sub:'FINAL', clock:true, ticker:true, meter:'SPEED', pads:'TAP', rail:true });
    hud.cue('ON YOUR MARKS');
    return {
      input(k){ if ((k==='L'||k==='R') && phase==='run'){ wag.tap(k); hud.pad(k); } },
      update(dt){
        t += dt;
        if (phase==='marks' && t > -1.2){ phase='set'; racers.forEach(r => r.a.play('Blocks_Set')); hud.cue('SET'); }
        if (phase==='set' && t >= 0){ phase='run'; hud.cue('GO!','good'); racers.forEach(r => r.a.play('Sprint_Enter', { once:true })); cheer(0.6); }
        if (phase==='run' || phase==='end'){
          wag.update(dt);
          racers.forEach(r => {
            const target = r.me ? wag.p*TUNE.sprint.top : TUNE.sprint.cpuPace*(t < 1.2 ? r.top*t/1.2 : r.top*(1 - Math.max(0, t-7)*0.01));
            if (r.t!==null) r.v = Math.max(0, r.v - dt*9); else r.v = lerp(r.v, target, dt*(r.me? 3 : 2)); r.x += r.v*dt;
            if (r.t!==null && r.v < 0.7 && r.a.curName !== (r.celeb ? 'Celebration' : 'Idle_Loop')) r.a.play(r.celeb ? 'Celebration' : 'Idle_Loop');
            if (t > 0.7 && r.t===null && r.a.curName!=='Sprint_Loop') r.a.play('Sprint_Loop');
            if (r.a.curName==='Sprint_Loop') r.a.cur.timeScale = clamp(r.v/8, 0.4, 1.4); if (r.a.curName==='Jog_Fwd_Loop') r.a.cur.timeScale = clamp(r.v/3.2, 0.4, 2.4);
            if (r.me) DBG.delta = (info.finish - r.x - TUNE.sprint.finishOffset).toFixed(2)+'m to line';
            if (r.t===null && r.x + TUNE.sprint.finishOffset >= info.finish){ r.t = +t.toFixed(2); r.a.play('Jog_Fwd_Loop'); if (r.me) cheer(1); }
            r.a.pivot.position.x = r.x;
          });
          const pl = racers[0]; hud.clock(pl.t ?? Math.max(0,t)); hud.meter(r => r, wag.p); hud.rail(pl.x/100);
          const ord = [...racers].sort((a,b) => (a.t??99+(-a.x/1000)) - (b.t??99+(-b.x/1000)));
          const lead = ord[0]; hud.ticker(ord.map(r => ({ name:r.p.name, color:r.p.kit.color, me:r.me, gap: r===lead? '—' : r.t!==null && lead.t!==null ? '+'+(r.t-lead.t).toFixed(2) : '+'+((lead.x-r.x)/Math.max(6,r.v)).toFixed(2) })));
          setCam(new V3(pl.x+1.5, 2.4, 13.5), new V3(pl.x+3, 1, lanes[1]));
          if (racers.every(r => r.t!==null) || (pl.t!==null && (over+=dt) > 3.5)){
            if (phase!=='end'){ phase='end'; racers.forEach(r => { if (r.t===null) r.t = +(t + (info.finish-r.x)/Math.max(6,r.v)).toFixed(2); });
              const win = [...racers].sort((a,b)=>a.t-b.t)[0]; win.celeb = true;
              setTimeout(() => ctx.done({ value: pl.t, rivals: racers.slice(1).map(r => r.t) }), 1800); }
          }
        } else setCam(new V3(-3, 1.6, 8), new V3(1, 0.8, lanes[1]), t < -2.3);
      }
    };
  }
};

// ---------- jumps (shared run-up) ----------
function jumpEvent(cfg){
  return { ...cfg, venue:'field', lower:false, fmt:m, attempts:3,
    make(ctx){
      const { hud, info } = ctx, a = ctx.spawn(ctx.player.kit, ctx.player.name), T = () => TUNE[cfg.id], tx = () => S.x + T().takeoffOffset;
      dbgLine(a, () => T().takeoffOffset);
      const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3), new THREE.MeshBasicMaterial({ color:'#F2B705', transparent:true, opacity:.4, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2 })); band.rotation.x = -PI/2; band.renderOrder = 5;
      hud.setup({ code:cfg.bug, name:cfg.short, sub:'', stat:['BEST','—'], meter:'SPEED', pads:'TAP', action:{ label:cfg.act[0], sub:cfg.act[1] }, hops: !!cfg.triple, angle: !cfg.triple, approach:'BOARD' });
      let S = null, marker = null, K = null;
      const measureK = () => { if (K != null || !cfg.triple || !hasClip('Land_Sand')) return; a.play('Land_Sand', { once:true, fade:0 }); a.scrub(0.999); a.update(0); K = a.rearX() - a.pivot.position.x; a.play('Idle_Loop', { fade:0 }); };
      const run = cb => { S = { phase:'wait', x:-T().takeoffOffset, y:0, v:0, t:0, wag:new Waggle(), cb, hold:false, holdT:0, seg:0, dist:0 };
        place(a, S.x, 0, 0); a.play('Idle_Loop'); hud.action('off'); hud.chips && cfg.triple && hud.chips([0,0,0]); removeObj(marker); if (!cfg.triple){ hud.gaugeShow(false); hud.goldTag(false); } measureK();
        setTimeout(() => { if (S){ S.phase='run'; hud.cue('GO!','good'); } }, 900); };
      attempts(ctx, this, run);
      const takeoff = () => { const d = info.board - tx(); DBG.delta = (d >= 0 ? d.toFixed(2)+'m behind board' : (-d).toFixed(2)+'m over'); if (d < -0.11){ DBG.delta = (-d-0.11).toFixed(2)+'m over the line: FOUL'; if (a.cur) a.cur.paused = false; return foul(); } S.loss = Math.max(0, d); if (cfg.triple){ hud.hopVal(0, d < 0.005 ? '0.00m' : '−'+d.toFixed(2)+'m', d <= 0.3); S.vx = S.v*0.82*T().distGain; S.vy = T().lift; } else { const L = S.v*T().launch, deg = Math.round(S.ang*57.3); S.vx = L*Math.cos(S.ang); S.vy = L*Math.sin(S.ang); hud.cue(deg+'°', deg >= 35 && deg <= 50 ? 'good' : ''); } S.phase='air'; S.t=0; S.seg=0; S.y0 = 0; S.q = 1; S.prog = 0; S.D = cfg.triple && K != null ? T().takeoffOffset - K : 0;
        if (!cfg.triple){ hud.goldTag(false); hud.gaugeShow(true); hud.gaugeDock(true); } a.play(cfg.triple? 'TJ_Hop' : 'NinjaJump_Start', { once:true, timeScale: cfg.triple ? 0.55/T().phaseTime : 1 }); cfg.triple ? hud.action('ready', 'STEP', 'TAP AS YOU LAND') : hud.action('off'); cfg.triple && hud.chips([2,1,0]); };
      const land = () => { W.slow = 1; S.phase='land'; a.play('Land_Sand', { once:true }); const lx = S.x + T().takeoffOffset, v = +(Math.max(0, lx - (info.board+0.11))).toFixed(2); marker = info.pitMark(lx - info.board); S.landX = lx; hud.action('off'); const cb = S.cb; setTimeout(() => { a.play('Idle_Loop'); }, 1500); S.phase='done'; cb(v); };
      const foul = () => { W.slow = 1; S.phase='done'; a.play('Idle_No_Loop'); hud.action('off'); S.cb(null); };
      return {
        input(k, down){
          if (!S) return;
          if ((k==='L'||k==='R') && S.phase==='run'){ S.wag.tap(k); hud.pad(k); }
          if (k==='action'){
            if (down && S.phase==='run' && tx() > info.board-6){ if (cfg.triple) takeoff(); else { S.phase='aim'; S.ang = 0; if (a.cur) a.cur.paused = true; hud.angle(0); hud.gaugeShow(true); hud.goldTag(false); hud.action('hot', 'JUMP', 'LET GO IN THE GOLD'); } }
            else if (cfg.triple && down && S.phase==='air' && (S.seg < 2 || S.lateOK)){ const tNow = S.t + (Math.max(0, performance.now() - (S.tWall || performance.now())) - T().inputOffsetMs)/1000*(W.timeScale ?? 1)*(W.slow ?? 1), p = Math.min(1, tNow/S.T), g = T().goldDeg/180;
              const grade = (err, late) => { const G = T().goldDeg, d = Math.round(err), tag = d === 0 ? '0°' : (late ? '+' : '−')+d+'° '+(late ? 'LATE' : 'EARLY'); hud.hopMark(S.seg, p); hud.hopVal(late ? S.seg : S.seg + 1, d === 0 ? '0°' : (late ? '+' : '−')+d+'°', err <= G); S.q = err <= G ? 1 - (1 - T().edgeQ)*(err/G) : T().offQ; hud.cue(err <= 3 ? 'PERFECT!' : err <= G ? 'GOOD' : late ? 'LATE' : 'EARLY', err <= G ? 'good' : 'bad'); };
              if (S.lateOK && p < 0.5){ grade(p*180, true); S.lateOK = false; }
              else if (S.seg < 2 && !S.nextTap && p >= 0.5){ grade((1 - p)*180, false); S.nextTap = true; } }
            else if (!cfg.triple && !down && S.phase==='aim'){ if (a.cur) a.cur.paused = false; takeoff(); }
          }
        },
        dispose(){ W.slow = 1; removeObj(marker); W.scene.remove(band); },
        update(dt){
          if (!S) return; S.t += dt; S.tWall = performance.now();
          if (S.landX != null) a.pivot.position.x += S.landX - a.rearX();
          if (S.phase==='run'){
            S.wag.update(dt); S.v = lerp(S.v, S.wag.p*T().top, dt*3); S.x += S.v*dt; a.pivot.position.x = S.x; DBG.delta = (info.board - tx()).toFixed(2)+'m to board';
            if (a.curName!=='Sprint_Loop' && S.v > 0.6) a.play('Sprint_Loop'); if (a.curName==='Sprint_Loop') a.cur.timeScale = clamp(S.v/8, 0.4, 1.4);
            const near = tx() > info.board-T().window, toGo = Math.max(0, Math.ceil(info.board - T().window - tx())); hud.action(near? 'hot' : 'ready', cfg.act[0], near? (cfg.triple ? 'TAP NOW!' : 'PRESS AND HOLD NOW') : 'GOLD ZONE IN '+toGo+'m'); hud.board && hud.board(near);
            if (tx() > info.board+0.11) foul();
          }
          if (S.phase==='aim'){ S.ang = Math.min(PI/2, S.ang + dt*T().angleRate*PI/180); hud.angle(S.ang); }
          if (S.phase==='air'){
            if (cfg.triple){
              S.T = S.seg<2? T().phaseTime : 2*S.vy/9.8; const p = S.t/S.T, g = T().goldDeg/180; hud.hops(S.seg, p, [1 - g, 1 + g]); if (S.lateOK && p >= 0.5){ S.lateOK = false; hud.cue('MISSED', 'bad'); hud.hopVal(S.seg, 'MISS', false); } W.slow = (S.seg < 2 && p > 1 - g - 0.03) || (S.lateOK && p <= g) ? T().slowmo : 1;
              S.x += S.vx*dt*(S.seg<2? S.q*0.55/T().phaseTime : 1); S.y = Math.max(0, Math.sin(PI*Math.min(1,p))*(S.seg<2? 0.45 : 1)); S.prog = Math.min(1, (S.seg + Math.min(1, p))/3);
              if (p >= 1){ if (S.seg<2){ if (!S.nextTap){ S.q = T().missQ; S.lateOK = true; } else S.lateOK = false; S.nextTap=false; S.seg++; S.t=0; a.play(S.seg===1? 'TJ_Step' : 'NinjaJump_Idle_Loop', { once:S.seg===1, timeScale: S.seg===1 ? 0.55/T().phaseTime : 1 }); hud.chips(S.seg===1? [2,2,1]:[2,2,2]); if (S.seg===2){ S.vy = 3.1*(0.55 + 0.45*S.q); hud.action('off'); } } else land(); }
            } else {
              if (S.t > 0.3 && a.curName!=='NinjaJump_Idle_Loop') a.play('NinjaJump_Idle_Loop');
              const gmul = 1;
              S.vy -= 9.8*gmul*dt; S.y += S.vy*dt; S.x += S.vx*dt; if (S.y <= 0 && S.t > 0.1){ S.y = 0; land(); }
            }
            a.pivot.position.set(S.x + (S.D||0)*(S.prog||0), S.y, 0);
          }
          hud.meter(null, S.phase==='run' || S.phase==='aim' ? S.wag.p : 0);
          { const x0 = 0, x1 = info.board + 2, f = x => (x - x0)/(x1 - x0); const hot = S.phase==='run' && tx() > info.board - T().window; hud.approach(f(tx()), f(info.board - T().window), f(info.board + 0.11), hot); if (!cfg.triple) hud.goldTag(hot); }
          { const w = T().window, hot = S.phase==='run' && tx() > info.board - w; band.scale.x = w + 0.11; band.position.set(info.board - w/2 + 0.055, 0.035, 0); band.visible = S.phase==='run' || S.phase==='wait' || S.phase==='aim'; band.material.opacity = hot ? 0.55 + 0.2*Math.sin(S.t*14) : 0.35; }
          const cx = S.phase==='run'? Math.min(S.x+3, info.board) : Math.max(S.x, info.board);
          setCam(new V3(cx+1, 2.2, 10.5), new V3(cx+2.5, 0.9, 0));
        }
      };
    }
  };
}
const long = jumpEvent({ id:'long', name:'LONG JUMP', bug:'LJ', short:'LONG JUMP', cpu:[5.6, 7.4], act:['JUMP','HOLD NEAR THE BOARD'],
  howto:[['TAP L R L R FAST TO RUN','LR'],['IN THE GOLD ZONE BEFORE THE BOARD, PRESS AND HOLD JUMP','HOLD'],['LET GO WHEN THE ANGLE IS IN THE GOLD','JUMP']] });
const triple = jumpEvent({ id:'triple', name:'TRIPLE JUMP', bug:'TJ', short:'TRIPLE JUMP', triple:true, cpu:[12.0, 16.1], act:['HOP','AT THE BOARD'],
  howto:[['TAP L R L R FAST TO RUN','LR'],['TAP HOP IN THE GOLD ZONE BEFORE THE BOARD','HOP'],['TAP AGAIN AS EACH FOOT LANDS','STEP']] });

// ---------- throws ----------
function throwEvent(cfg){
  return { ...cfg, venue:'throw', lower:false, fmt:m, attempts:3,
    make(ctx){
      const { hud, info } = ctx, a = ctx.spawn(ctx.player.kit, ctx.player.name), disc = cfg.id==='discus', T = () => TUNE[cfg.id];
      if (!disc) dbgLine(a, () => T().releaseOffset);
      info.ring.visible = info.pad.visible = disc; if (disc){ info.ring.position.x = info.pad.position.x = 28.2; } info.setThrowField(disc ? 'discus' : 'javelin', T());
      hud.setup({ code:cfg.bug, name:cfg.short, stat:['BEST','—'], meter: disc? 'POWER':'SPEED', pads: disc? 'SPIN' : 'TAP', action:{ label:'THROW', sub: disc? 'ARROW IN GOLD' : 'HOLD, LET GO' }, dial: disc, angle: true, approach: disc ? null : 'FOUL LINE' });
      let S = null, imp = null, fly = null;
      const run = cb => { removeObj(imp); removeObj(fly); fly = null; imp = prop(cfg.id);
        S = { phase:'wait', x: disc? 28.2 : 4 - T().releaseOffset, v:0, t:0, wag:new Waggle(), cb, ang:0, spin:0, yaw:PI };
        place(a, S.x, 0, 0, disc? PI : 0); a.play(disc? 'Discus_Ready' : 'Idle_Loop'); hud.action('off'); hud.goldTag(false); hud.gaugeShow(disc);
        setTimeout(() => { if (S){ S.phase='run'; hud.cue('GO!','good'); if (disc) a.play('Discus_Spin'); } }, 900); };
      attempts(ctx, this, run);
      const release = () => {
        if (a.cur) a.cur.paused = false; S.phase='fly'; hud.action('off'); hud.goldTag(false); hud.gaugeShow(true); hud.gaugeDock(true); a.play(disc? 'Discus_Release' : 'OverhandThrow', { once:true });
        let angle, speed, side = 0;
        if (disc){ const off = ((S.spin % 1)+1)%1 - 0.5, D2R = PI/180, half = T().sector/2*D2R, gold = T().gold/2*D2R; angle = S.ang; side = Math.max(-80*D2R, Math.min(80*D2R, off*2*PI*T().aimGain)); const k = Math.min(1, Math.abs(side)/half); speed = 8 + S.wag.p*T().power*(1 - 0.35*k*k); a.pivot.rotation.y = 0; const deg = Math.round(Math.abs(side)/D2R); hud.cue(Math.abs(side) <= gold ? 'GREAT RELEASE!' : Math.abs(side) > half ? 'WIDE '+deg+'° '+(side > 0 ? 'LEFT' : 'RIGHT') : 'OFF LINE '+deg+'° '+(side > 0 ? 'LEFT' : 'RIGHT'), Math.abs(side) <= gold ? 'good' : Math.abs(side) > half ? 'bad' : ''); }
        else { angle = S.ang; speed = 9 + S.v*T().power; DBG.delta = (info.foul - S.x - T().releaseOffset).toFixed(2)+'m before line'; const inZone = S.ang > 0.61 && S.ang < 0.87; hud.cue(inZone? 'GOLD ANGLE!' : Math.round(S.ang*57.3)+'°', inZone? 'good':''); }
        setTimeout(() => { if (!S) return; fly = imp; imp = null; const hs = Math.cos(angle)*speed; fly.userData.v = new V3(hs*Math.cos(side), Math.sin(angle)*speed, -hs*Math.sin(side)); fly.userData.side = side; }, disc? 350 : 420);
      };
      return {
        dispose(){ removeObj(imp); removeObj(fly); imp = fly = null; },
        input(k, down){
          if (!S) return;
          if ((k==='L'||k==='R') && S.phase==='run'){ S.wag.tap(k); hud.pad(k); }
          if (k==='action' && S.phase==='run'){
            if (disc && down){ S.phase='aim'; S.ang = 0; if (a.cur) a.cur.paused = true; }
            if (!disc && down && S.v > 1){ S.phase='aim'; S.ang = 0; if (a.cur) a.cur.paused = true; hud.angle(0); hud.gaugeShow(true); hud.goldTag(false); }
          }
          if (k==='action' && !down && S.phase==='aim') release();
        },
        update(dt){
          if (!S) return; S.t += dt;
          if (imp && !fly){ const h = disc ? a.hand('R') : a.grip('R'); imp.position.copy(h).add(new V3(...propOffset(cfg.id)).applyAxisAngle(new V3(0,1,0), a.pivot.rotation.y)); if (!disc){ S.hold = S.phase==='aim' || S.phase==='fly' ? S.ang : 0.25; imp.rotation.set(0, 0, S.hold); } }
          if (S.phase==='run' || S.phase==='aim'){
            if (S.phase==='run') S.wag.update(dt);
            if (disc){
              if (S.phase==='aim'){ S.ang = Math.min(PI/2, S.ang + dt*T().angleRate*PI/180); hud.angle(S.ang); }
              else S.spin += dt*(0.3 + S.wag.p*T().spinRate);
              a.pivot.rotation.y = PI + S.spin*2*PI; if (a.curName==='Discus_Spin' && a.cur) a.cur.timeScale = S.phase==='aim' ? 0 : clamp((0.3 + S.wag.p*T().spinRate)*2*a.cur.getClip().duration, 0.25, 3); hud.dial((((0.75 - S.spin)%1)+1)%1, [0.25 - T().gold/(720*T().aimGain), 0.25 + T().gold/(720*T().aimGain)], S.phase==='aim' ? 'LOCKED' : 'SPIN', [0.25 - T().sector/(720*T().aimGain), 0.25 + T().sector/(720*T().aimGain)]);
              hud.action(S.phase==='aim' ? 'hot' : 'ready', 'THROW', S.phase==='aim' ? 'LET GO IN THE GOLD' : 'HOLD WHEN ARROW IS GOLD'); hud.gaugeFocus(S.phase==='aim' ? 'angle' : 'dial');
              if (S.phase==='run' && S.t > 9){ S.phase='done'; hud.action('off'); S.cb(null); } }
            else {
              if (S.phase==='run'){ S.v = lerp(S.v, S.wag.p*T().top, dt*3); S.x += S.v*dt; a.pivot.position.x = S.x; }
              if (S.phase==='run' && S.v > 0.6){ const js = hasClip('Javelin_Start'); if (a.curName!=='Javelin_Run' && a.curName!=='Javelin_Start') a.play(js ? 'Javelin_Start' : 'Javelin_Run', { fade:0.15 }); else if (a.curName==='Javelin_Start' && a.cur && a.cur.time >= a.cur.getClip().duration - 0.08) a.play('Javelin_Run', { fade:0.2 }); }
              if (a.curName==='Javelin_Run' && a.cur) a.cur.timeScale = clamp(S.v/8, 0.5, 1.4);
              if (S.phase==='aim'){ S.ang = Math.min(PI/2, S.ang + dt*T().angleRate*PI/180); hud.angle(S.ang); }
              hud.action(S.phase==='aim'? 'hot' : S.v > 1 ? 'ready' : 'off', 'THROW', S.phase==='aim'? 'LET GO IN THE GOLD' : 'HOLD, LET GO');
              if (S.phase==='run') DBG.delta = (info.foul - S.x - T().releaseOffset).toFixed(2)+'m to line';
              { const x0 = 4, x1 = info.foul + 2, f = x => (x - x0)/(x1 - x0), hot = S.phase==='run' && S.x + T().releaseOffset > info.foul - 6; hud.approach(f(S.x + T().releaseOffset), f(info.foul - 6), f(info.foul), hot); hud.goldTag(hot); }
              if (S.x + T().releaseOffset > info.foul){ S.phase='done'; a.play('Idle_No_Loop'); hud.action('off'); hud.goldTag(false); hud.gaugeShow(false); S.cb(null); }
            }
            hud.meter(null, S.wag.p);
            setCam(new V3(S.x+1, 2.4, 10), new V3(S.x+3, 1.1, 0));
          }
          if (S.phase==='fly' && fly){
            const u = fly.userData; u.v.y -= 9.8*dt; fly.position.addScaledVector(u.v, dt);
            if (!disc) fly.rotation.z = Math.atan2(u.v.y, u.v.x); else fly.rotation.y += dt*14;
            setCam(new V3(fly.position.x-6, 5, 24), new V3(fly.position.x, 2, 0));
            if (fly.position.y <= 0.05){ fly.position.y = 0.05; if (!disc) fly.rotation.z = -0.5;
              const dx = fly.position.x - (disc ? info.ring.position.x : info.foul), dz = fly.position.z;
              const valid = disc ? dx > 0 && Math.abs(Math.atan2(dz, dx)) < T().sector/2*PI/180 : Math.abs(dz) < dx*0.4 + 2;
              const v = valid ? +(disc ? Math.hypot(dx, dz) - 1.25 : dx).toFixed(2) : null; if (!valid) hud.cue('OUT OF SECTOR','bad'); S.phase='done'; if (v) a.play('Celebration'); const cb = S.cb; cb(v); }
          }
        }
      };
    }
  };
}
const javelin = throwEvent({ id:'javelin', name:'JAVELIN', bug:'JAV', short:'JAVELIN', cpu:[28, 52],
  howto:[['TAP L R L R FAST TO RUN','LR'],['BEFORE THE LINE, PRESS AND HOLD THROW','HOLD'],['LET GO WHEN THE ANGLE IS IN THE GOLD','THROW']] });
const discus = throwEvent({ id:'discus', name:'DISCUS', bug:'DIS', short:'DISCUS', cpu:[24, 46],
  howto:[['TAP L R L R TO SPIN FASTER','LR'],['ARROW IN THE GOLD? PRESS AND HOLD THROW','HOLD'],['LET GO WHEN THE ANGLE IS IN THE GOLD','THROW']] });

export const EVENTS_A = [sprint, long, triple, javelin, discus];
