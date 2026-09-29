// Summer Champs: pool, platform, range and arena events (high diving, archery, swimming, weightlifting, fencing).
import * as THREE from 'three';
import { propOffset } from './sc-anim.js';
import { W, setCam, prop, removeObj, cheer, splash, splashFX, bubbles, dbgLine , hasClip, poseBow } from './sc-world.js';
import { Waggle, cpuValue, place, s, TUNE } from './sc-events-a.js';
const V3 = THREE.Vector3, PI = Math.PI, clamp = (x,a,b) => Math.max(a, Math.min(b, x)), lerp = (a,b,t) => a+(b-a)*t;

// ---------- high diving (50m, spin / twist / tuck sliders) ----------
const dive = { id:'dive', name:'HIGH DIVING', bug:'100M', short:'HIGH DIVING', venue:'dive', lower:false, fmt:v => v.toFixed(1)+' pts', attempts:3, cpu:[35, 82],
  howto:[['TAP DIVE TO JUMP OFF THE 100M PLATFORM','DIVE'],['DRAG SPIN AND TWIST TO SPEED UP OR SLOW DOWN · TUCK IN TO SPIN FASTER','SPIN'],['STRETCH OUT STRAIGHT AND LINE UP VERTICAL FOR THE WATER','TUCK']],
  make(ctx){
    const { hud, info } = ctx, a = ctx.spawn(ctx.player.kit, ctx.player.name), P = info.platform, wy = info.water.y, T = TUNE.dive;
    hud.setup({ code:'100M', name:'HIGH DIVING', stat:['BEST','—'], pads:false, action:{ label:'DIVE', sub:'TAP TO JUMP' }, sliders:true, gauge:'100M', chips:[], cueBottom:290, cueSize:44 });
    const qs = new THREE.Quaternion(), qt = new THREE.Quaternion(), QI = new THREE.Quaternion(), AX = new V3(0,0,1), AY = new V3(0,1,0);
    const inp = { spin:0, twist:0, tuck:0 }, st = { n:0, best:null }; let S = null;
    const next = () => { if (st.n >= 3) return ctx.done({ value: st.best }); st.n++; hud.attempt(st.n, 3);
      S = { phase:'ready', x:P.x, y:P.y, vx:0, vy:0, t:0, th:0, ph:0, ws:0, wt:0, warned:false };
      inp.spin = inp.twist = inp.tuck = 0; ['spin','twist','tuck'].forEach(k => hud.slider(k, 0));
      place(a, P.x, P.y, 0); a.body.quaternion.identity(); a.play('HD_Stand'); hud.action('ready', 'DIVE', 'TAP TO JUMP'); hud.chips([]); };
    const score = () => {
      // entry: head-first 50 → horizontal 0 → feet-first 25 (linear), × straightness (tuck 0 … straight 1), × facing (left/right ×1, toward/away from camera ×0.5)
      const up = AY.clone().applyQuaternion(a.body.quaternion), fw = new V3(1,0,0).applyQuaternion(a.body.quaternion), straight = 1 - inp.tuck;
      const orient = up.y < 0 ? 50*(-up.y) : 25*up.y, hz = Math.hypot(fw.x, fw.z), face = hz > 0.2 ? 0.5 + 0.5*Math.abs(fw.x)/hz : 1;
      const entryPts50 = orient*straight*face, entryQ = entryPts50/50, cleanQ = Math.abs(up.y)*straight;
      const spinPts = 25*Math.min(1, Math.abs(S.th)/(2*PI)/T.maxSpins), twistPts = 25*Math.min(1, Math.abs(S.ph)/(2*PI)/T.maxTwists);
      return { entryQ, cleanQ, headFirst: up.y < 0, spinPts, twistPts, entryPts: entryPts50 };
    };
    const enter = () => {
      const { entryQ, cleanQ, headFirst, spinPts, twistPts, entryPts } = score(), trickPts = spinPts + twistPts;
      const v = +((entryQ < 0.3 ? trickPts*0.5 : trickPts) + entryPts).toFixed(1);
      hud.chips([['SPIN '+Math.round(spinPts)+'/25', spinPts >= 24.5 ? 2 : 0], ['TWIST '+Math.round(twistPts)+'/25', twistPts >= 24.5 ? 2 : 0], ['ENTRY '+Math.round(entryPts)+'/50', entryQ > 0.6 ? 2 : 0]]);
      S.phase = 'water'; S.t = 0; S.ex = S.x; S.vyU = Math.max(S.vy, -14); S.streamed = false; splashFX(S.x, 0, clamp(1 - cleanQ, 0.05, 1)); a.play(cleanQ > 0.6 ? (headFirst ? 'HD_Entry_Head' : 'HD_Entry_Feet') : 'HD_Splat', { once:true });
      if (st.best === null || v > st.best) st.best = v; hud.stat('BEST', dive.fmt(st.best));
      hud.cue((cleanQ > 0.6 ? (headFirst ? 'CLEAN! ' : 'FEET FIRST! ') : cleanQ < 0.3 ? 'SPLASH! ' : '')+v+' PTS', cleanQ > 0.6 && headFirst ? 'good' : cleanQ < 0.3 ? 'bad' : '');
      if (cleanQ > 0.6) cheer(headFirst ? 1 : 0.5); S.good = cleanQ > 0.4; setTimeout(next, 7000);
    };
    next();
    return {
      input(k, down, d){
        if (!S) return;
        if (k==='slider'){ if (S.phase==='air') inp[d.id] = d.v; else hud.slider(d.id, inp[d.id]); return; }
        if ((k==='L' || k==='R') && down && S.phase==='air'){ inp.spin = clamp(inp.spin + (k==='R' ? 0.25 : -0.25), -1, 1); hud.slider('spin', inp.spin); return; }
        if (k==='action' && down && S.phase==='ready'){ S.phase='air'; S.vx = 1.2; S.vy = 2.6; S.t = 0; a.play('HD_Takeoff', { once:true }); hud.action('off'); setTimeout(() => { if (S.phase==='air') a.play('HD_Tuck', { scrub:inp.tuck }); }, 550); }
      },
      update(dt){
        if (!S) return; S.t += dt;
        W.slow = lerp(W.slow ?? 1, (S.phase==='air' && S.y - wy < 15) || (S.phase==='water' && S.t < 0.9) ? T.slowmo : 1, 0.12);
        if (S.phase==='air'){
          const acc = (u, w, k) => u*k*dt*(u*w < 0 ? T.counterBoost : 1);
          S.ws = clamp(S.ws + acc(inp.spin, S.ws, T.spinAccel), -T.maxSpin, T.maxSpin);
          S.wt = clamp(S.wt + acc(inp.twist, S.wt, T.twistAccel), -T.maxTwist, T.maxTwist);
          const spinRate = S.ws/lerp(1, T.tuckInertia, inp.tuck), twistRate = S.wt*lerp(1, T.twistTuck, inp.tuck);
          S.th += spinRate*dt; S.ph += twistRate*dt;
          qs.setFromAxisAngle(AX, -S.th); qt.setFromAxisAngle(AY, S.ph); a.body.quaternion.copy(qs).multiply(qt);
          if (a.curName==='HD_Tuck') a.scrub(inp.tuck*0.999);
          S.vy -= 9.8*T.gravity*dt; S.y += S.vy*dt; S.x += S.vx*dt; a.pivot.position.set(S.x, S.y, 0);
          const h = S.y - wy; hud.gauge(clamp(h/(P.y-wy), 0, 1), 15/(P.y-wy));
          { const sc = score(); hud.chips([['SPIN '+Math.round(sc.spinPts)+'/25', sc.spinPts >= 24.5 ? 2 : 0], ['TWIST '+Math.round(sc.twistPts)+'/25', sc.twistPts >= 24.5 ? 2 : 0], ['ENTRY '+Math.round(sc.entryPts)+'/50', sc.entryQ > 0.6 ? 2 : 0]]); }
          if (h < 15 && !S.warned){ S.warned = true; hud.cue('STRAIGHTEN UP!', 'good'); }
          if (S.y <= wy) enter();
        }
        const SWIM_END = 4.4;
        if (S.phase==='water'){
          if (S.t < 1.2){ S.vyU = lerp(S.vyU, 0, dt*3.2); S.y = Math.max(wy - (info.water.depth - 1.4), S.y + S.vyU*dt); S.x += S.vx*0.3*dt; a.body.quaternion.slerp(QI, Math.min(1, dt*4)); if (S.t > 0.35 && !S.streamed){ S.streamed = true; a.play('HD_Entry_Head', { once:true }); } }
          else if (S.t < SWIM_END){ if (a.curName!=='Swim_Crawl'){ a.body.quaternion.identity(); a.play('Swim_Crawl', { fade:0.4 }); } S.x += 1.7*dt; S.y = lerp(S.y, wy-0.65+TUNE.swim.depthOffset, dt*0.9); }
          else { if (a.curName!=='Water_Celebrate' && a.curName!=='Water_HeadShake') a.play(S.good ? 'Water_Celebrate' : 'Water_HeadShake', { fade:0.4 }); S.y = lerp(S.y, wy+TUNE.swim.treadDepth, dt*3); }
          a.pivot.position.set(S.x, S.y, 0);
          if (S.t < SWIM_END && Math.random() < dt*14) bubbles(a.hand('R'));
        }
        if (S.phase==='water' && S.t < 1.4) setCam(new V3(S.ex+2.5, wy+5, 19), new V3(S.ex, wy+2.8, 0));
        else if (S.phase==='water' && S.t < SWIM_END) setCam(new V3(S.x+0.4, S.y+1.3, 7.2), new V3(S.x+1.8, S.y+0.8, 0));
        else if (S.phase==='water') setCam(new V3(S.x+1.2, wy+1.6, 9), new V3(S.x+1.2, wy+0.2, 0));
        else { const cy = clamp(S.y+0.6, 1.2, P.y+0.4); setCam(new V3(S.x+1.2, cy+0.8, 15), new V3(S.x+1.2, cy, 0), S.phase==='air' || (S.phase==='ready' && S.t < 0.05)); }
      }
    };
  }
};

// ---------- archery ----------
const RING = [10, 8, 6, 4, 2];
const archery = { id:'archery', name:'ARCHERY', bug:'30M', short:'ARCHERY', venue:'range', lower:false, fmt:v => v+' pts', attempts:6, cpu:[22, 50],
  cpuSim(skill){ let t = 0; for (let i=0;i<6;i++){ const g = Math.abs((Math.random()+Math.random()+Math.random()-1.5)*1.4), r = g*(0.46 - 0.24*skill); t += RING[Math.floor(r/0.122)] ?? 0; } return Math.min(50, t); },
  howto:[['DRAG DOWN ON THE PAD TO DRAW','DRAG'],['STOP IN THE GOLD AND STEADY THE SIGHT','DRAW'],['LET GO TO SHOOT · 6 ARROWS','SHOOT']],
  make(ctx){
    const { hud, info } = ctx, a = ctx.spawn(ctx.player.kit, ctx.player.name); place(a, 0, 0, 0);
    const bow = prop('bow'); let arrow = null, n = 0, total = 0, S = { phase:'ready', draw:0, t:0 }, wind = (Math.random()*2-1)*TUNE.archery.windMax;
    hud.setup({ code:'30M', name:'ARCHERY', stat:['SCORE','0'], pads:false, drag:true, draw:true, target:true, wind });
    const UB = hasClip('Bow_Aim_Neutral');
    if (UB){ a.play('Bow_Aim_Neutral', { scrub:0.5 }); a.update(0); a.pivot.updateMatrixWorld(true); const d = a.hand('L').sub(a.hand('R')); a.pivot.rotation.y += Math.atan2(d.z, d.x); a.cur = null; a.rigs.forEach(r => r.mixer.stopAllAction()); }
    const reset = () => { wind = (Math.random()*2-1)*TUNE.archery.windMax; hud.wind(wind); S = { phase:'ready', draw:0, t:0, ax:0, ay:0 }; UB ? a.play('Bow_Aim_Neutral', { fade:0.3 }) : a.play('Bow_Draw', { scrub:0 }); n++; hud.attempt(n, 6); hud.reticle(null); W.camera.fov = 34; W.camera.updateProjectionMatrix(); };
    reset();
    const shoot = () => {
      S.phase='fly'; a.play(UB ? 'Bow_Shoot' : 'Bow_Release', { once:true, restart:true }); hud.reticle(null);
      const good = S.draw > 0.7 && S.draw < 0.92, pow = good? 1 : 0.6;
      const ax = S.ax + wind*TUNE.archery.windEffect*(1.6-pow), ay = S.ay - (1-pow)*0.35;
      arrow = prop('arrow'); arrow.position.copy(a.hand('R')); arrow.userData = { from:arrow.position.clone(), to:new V3(info.targetX, 1.3+ay, ax), t:0 };
    };
    return {
      input(k, d){
        if (k!=='drag') return;
        if (S.phase==='ready' && d.phase==='start'){ S.phase='draw'; }
        if (S.phase==='draw' && d.phase==='move'){ S.draw = clamp(d.dy/TUNE.archery.drawPx, 0, 1); if (!UB) a.scrub(Math.min(1, S.draw/0.8)); hud.draw(S.draw); }
        if (S.phase==='draw' && d.phase==='end'){ if (S.draw > 0.3) shoot(); else { S.phase='ready'; S.draw=0; if (!UB) a.scrub(0); hud.draw(0); } }
      },
      update(dt){
        S.t += dt;
        const hl = a.hand('L'), hr = a.hand('R'); poseBow(bow, hl, hr, UB ? S.phase !== 'fly' && S.phase !== 'hit' : S.phase==='draw');
        if (S.phase==='draw'){
          const steady = S.draw > 0.7 && S.draw < 0.92 ? 0.35 : 1, w = TUNE.archery.wobble*steady;
          S.ax = Math.sin(S.t*1.7)*w + Math.sin(S.t*3.1)*w*0.4; S.ay = Math.cos(S.t*1.3)*w*0.8;
          hud.reticle(S.ax/0.61, -S.ay/0.61); W.camera.fov = lerp(W.camera.fov, 7, dt*3); W.camera.updateProjectionMatrix();
        }
        if (S.phase==='fly' && arrow){ const u = arrow.userData; u.t += dt*1.4; const p = Math.min(1, u.t); arrow.position.lerpVectors(u.from, u.to, p); arrow.position.y += Math.sin(PI*p)*0.4;
          if (p >= 1){ S.phase='hit'; const r = Math.hypot(u.to.z, u.to.y-1.3); const ring = Math.floor(r/0.122); const pts = RING[ring] ?? 0; total += pts;
            arrow.userData.stuck = true; hud.targetHit(u.to.z/0.61, -(u.to.y-1.3)/0.61); hud.stat('SCORE', String(total)); hud.cue(pts? pts+'!' : 'MISS', pts>=8? 'good' : pts? '' : 'bad'); if (pts===10) { cheer(1); a.play('Celebration'); }
            setTimeout(() => { removeObj(arrow); arrow = null; if (n >= 6){ removeObj(bow); ctx.done({ value: total }); } else reset(); }, 1600); } }
        const zoom = S.phase==='draw' || S.phase==='fly' || S.phase==='hit';
        setCam(zoom? new V3(-2.2, 1.7, 0.9) : new V3(-3.5, 2, 4), zoom? new V3(info.targetX, 1.3, 0) : new V3(4, 1.1, 0));
        if (!zoom){ W.camera.fov = lerp(W.camera.fov, 34, dt*4); W.camera.updateProjectionMatrix(); }
      },
      dispose(){ removeObj(bow); removeObj(arrow); W.camera.fov = 34; W.camera.updateProjectionMatrix(); }
    };
  }
};

// ---------- 50m swimming ----------
const swim = { id:'swim', name:'50M SWIMMING', bug:'50M', short:'FREESTYLE', venue:'pool', lower:true, fmt:s, attempts:1, cpu:[30, 20],
  howto:[['TAP L R L R TO SWIM','LR'],['KEEP A STEADY RHYTHM','LR'],['TAP TURN AT THE WALL','TURN']],
  make(ctx){
    const { hud, info } = ctx, wy = info.water.y, L = info.wall;
    const rs = [ctx.player, ...ctx.rivals].map((p, i) => { const a = ctx.spawn(p.kit, p.name); place(a, -0.5, 0.85, info.lanes[i]); a.play('Block_Crouch');
      return { p, a, x:-0.5, v:0, dir:1, leg:0, t:null, me:i===0, top: i? 50/(cpuValue(swim, p.skill)-2) : 0, turn:0 }; });
    const wag = new Waggle(); let t = -2, phase = 'set', over = 0; const OFF = () => TUNE.swim.wallOffset;
    dbgLine(rs[0].a, OFF);
    const band = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color:'#F2B705', transparent:true, opacity:.35, depthWrite:false })); band.rotation.x = -PI/2; band.renderOrder = 5;
    hud.setup({ code:'50M', name:'FREESTYLE', sub:'LENGTH 1 OF 2', clock:true, ticker:true, meter:'RHYTHM', pads:'STROKE', action:{ label:'TURN', sub:'AT THE WALL' } });
    hud.cue('TAKE YOUR MARKS'); hud.action('off');
    const doTurn = (r, good) => { r.turn = good? 0.9 : 2; r.tt = 0; r.good = good; r.dir = -1; r.leg = 1; r.a.play('Tumble_Turn', { once:true }); if (r.me) { hud.action('off'); hud.cue(good? 'GREAT TURN!' : 'SLOW TURN', good? 'good':''); hud.sub('LENGTH 2 OF 2'); } };
    return {
      dispose(){ W.scene.remove(band); },
      input(k, down){ if ((k==='L'||k==='R') && phase==='race'){ wag.tap(k); hud.pad(k); } if (k==='action' && down && phase==='race'){ const r = rs[0]; if (r.leg===0 && r.x + OFF() > L-TUNE.swim.turnWindow) doTurn(r, true); } },
      update(dt){
        t += dt;
        if (phase==='set' && t >= -0.9 && !this.saidSet){ this.saidSet = true; hud.cue('SET'); }
        if (phase==='set' && t >= 0){ phase='race'; hud.cue('GO!','good'); cheer(0.6); rs.forEach(r => { r.a.play('Dive_Start', { once:true }); r.dive = 0; }); }
        if (phase==='race'){
          wag.update(dt);
          rs.forEach(r => {
            if (r.t!==null){ const p = r.a.pivot; p.position.y = lerp(p.position.y, wy+TUNE.swim.treadDepth, dt*3); p.rotation.y = lerp(p.rotation.y, PI*1.5, dt*3); return; }
            const sy = wy-0.65+TUNE.swim.depthOffset, D2R = PI/180;
            if (r.dive < 1.3){ r.dive += dt; const d = Math.min(r.dive, 1.3); let y, deg;
              if (d < 0.6){ const p = d/0.6; y = lerp(0.85, wy-0.1, p) + Math.sin(PI*p)*0.5; deg = 110*p*p*(3-2*p); r.x += 3.8*dt; }
              else { const q = (d-0.6)/0.7; y = lerp(wy-0.1, sy, q) - 0.7*Math.sin(PI*q); deg = lerp(110, 90, q); r.x += lerp(3.2, 2.2, q)*dt; }
              r.a.pivot.position.set(r.x, y, info.lanes[rs.indexOf(r)]); r.a.body.rotation.set(0, 0, -deg*D2R);
              if (r.dive >= 1.3){ r.a.play('Swim_Crawl', { fade:0.3 }); r.blend = 0; r.v = 2.2; } return; }
            if (r.blend !== undefined && r.blend < 0.3){ r.blend += dt; r.a.body.rotation.set(0, 0, -PI/2*Math.max(0, 1 - r.blend/0.3)); }
            if (r.turn > 0){ r.turn -= dt; r.tt += dt; const e = r.tt; r.a.body.position.y = 0.95 - 0.8*Math.sin(PI*Math.min(1, e/1.1));
              if (e < 0.45){ const u = e/0.45, s = u*u*(3-2*u); r.a.body.rotation.set(0, 0, -PI*s, 'XYZ'); r.v = 0; }
              else if (e < 0.85){ const u = Math.max(0, (e-0.5)/0.35), s = u*u*(3-2*u); r.a.body.rotation.set(PI*s, 0, -PI, 'ZYX'); r.v = 0; }
              else { if (!r.flipped){ r.flipped = true; r.a.body.rotation.set(0, 0, 0, 'XYZ'); r.a.pivot.rotation.y = PI; r.v = r.good ? 2.4 : 1.2; } r.v = Math.max(0.8, r.v - dt*1.5); }
              if (r.turn <= 0){ r.a.body.position.y = 0.95; if (!r.flipped){ r.flipped = true; r.a.body.rotation.set(0,0,0,'XYZ'); r.a.pivot.rotation.y = PI; } r.a.play('Swim_Crawl'); } }
            else r.v = lerp(r.v, r.me? wag.p*TUNE.swim.top : TUNE.swim.cpuPace*r.top*(0.97+Math.sin(t+r.top)*0.03), dt*2);
            r.x += r.v*r.dir*dt; r.a.pivot.position.x = r.x; r.a.pivot.position.y = wy-0.65+TUNE.swim.depthOffset; if (r.a.curName==='Swim_Crawl') r.a.cur.timeScale = clamp(r.v/1.6, 0.5, 1.6);
            if (r.leg===0 && r.x + OFF() >= L-0.2){ r.x = L-0.2-OFF(); doTurn(r, !r.me); }
            if (r.leg===1 && r.x - OFF() <= 0.1){ const first = rs.every(o => o === r || o.t === null); r.t = +t.toFixed(2); r.a.body.rotation.set(0,0,0,'XYZ'); r.a.body.position.y = 0.95; r.a.play(first ? 'Water_Celebrate' : 'Tread_Water', { fade:0.4 }); if (r.me) cheer(1); }
          });
          const me = rs[0]; if (me.leg===0 && me.turn<=0) hud.action(me.x + OFF() > L-TUNE.swim.turnWindow ? 'hot' : 'ready', 'TURN', me.x + OFF() > L-TUNE.swim.turnWindow ? 'NOW!' : 'WALL IN '+Math.max(0, Math.ceil(L - me.x - OFF()))+'m');
          hud.clock(me.t ?? Math.max(0, t)); hud.meter(null, wag.p);
          const prog = r => r.t!==null? 100-r.t/100 : (r.leg? 25+(L-r.x) : r.x);
          const ord = [...rs].sort((a,b) => (a.t??999) - (b.t??999) || prog(b)-prog(a));
          hud.ticker(ord.map((r,i) => ({ name:r.p.name, color:r.p.kit.color, me:r.me, gap: i===0? '—' : r.t!==null && ord[0].t!==null? '+'+(r.t-ord[0].t).toFixed(2) : '+'+((prog(ord[0])-prog(r))/1.6).toFixed(1) })));
          { const tw = TUNE.swim.turnWindow, hot = me.leg===0 && me.x + OFF() > L-tw; band.visible = me.leg===0; band.scale.set(tw, 2.1, 1); band.position.set(L - tw/2, wy+0.04, info.lanes[0]); band.material.opacity = hot ? 0.6 + 0.2*Math.sin(t*14) : 0.45; }
          setCam(new V3(me.x, 5.5, 15), new V3(me.x, 0, 3));
          if (me.t!==null) over += dt; if (rs.every(r => r.t!==null)) this.allIn = (this.allIn || 0) + dt;
          if (me.t!==null && (over > 10 || (this.allIn || 0) > 1.5)){ phase='end'; rs.forEach(r => { if (r.t===null) r.t = +(t + Math.abs(r.x)/Math.max(0.8,r.v) + (r.leg? 0 : L/1.5)).toFixed(2); });
            W.scene.remove(band); ctx.done({ value: me.t, rivals: rs.slice(1).map(r => r.t) }); }
        } else if (phase==='set') setCam(new V3(-6, 3.4, 12), new V3(2, 0.4, 3), t < -1.95);
      }
    };
  }
};

// ---------- weightlifting ----------
const BAR_OFF = propOffset('bar');
const lift = { id:'lift', name:'WEIGHTLIFTING', bug:'WL', short:'WEIGHTLIFTING', venue:'lift', lower:false, fmt:v => v+'kg', attempts:3, cpu:[60, 120],
  cpuSim(skill){ return Math.round(lerp(60, 120, clamp(skill*0.7 + Math.random()*0.35, 0, 1))/10)*10; },
  howto:[['CHOOSE YOUR WEIGHT: 60, 70 OR 80kg, THEN +10, +20 OR +30','WEIGHT'],['TAP L R L R FAST TO LIFT','LR'],['TAP STEADY TO KEEP THE BAR IN THE GOLD · DON\'T STAY OUT OR HIT THE RED · 10 TAPS MAX','STEADY'],['HOLD IT FOR 2 SECONDS','HOLD']],
  make(ctx){
    const { hud, info } = ctx, a = ctx.spawn(ctx.player.kit, ctx.player.name); place(a, 0, 0.12, 0);
    const bar = prop('bar'); let kg = 60, n = 0, best = null, S, opts = [];
    hud.setup({ code:'WL', name:'WEIGHTLIFTING', stat:['BAR','—'], stat2:['BEST','—'], power:true, pads:'LIFT', action:{ label:'STEADY', sub:'TAP TO KEEP IT IN THE GOLD' }, balance:true });
    const wag = new Waggle();
    const next = () => { if (n >= 3) return ctx.done({ value: best }); n++; hud.attempt(n, 3); hud.stat('BAR', '—'); 
      S = { phase:'choose', p:0, b:0, bv:0, hold:0, t:0 }; wag.p = 0; a.play('Idle_FoldArms_Loop'); bar.position.set(0.4, 0.35, 0); hud.action('off'); hud.chips([['LIFT',1],['HOLD',0]]);
      hud.liftStage('choose'); opts = best === null ? [60, 70, 80] : [best+10, best+20, best+30];
      hud.choose(opts.map((w, i) => ({ id:'w'+w, top:['SAFE','BIG','HUGE'][i], w: w+'kg', sub: best === null ? '' : '+'+(w-best)+'kg' })), best === null ? 'CHOOSE YOUR OPENING WEIGHT' : 'CHOOSE YOUR NEXT WEIGHT'); };
    const pick = w => { if (!S || S.phase!=='choose') return; kg = w; hud.choose(null); hud.stat('BAR', kg+'kg'); S.phase='wait'; S.t = 0; hud.liftStage('lift'); hud.power(0, TUNE.lift.effort + (kg-50)/60*0.3);
      setTimeout(() => { S.phase='lift'; a.play('Lift_Setup', { once:true }); hud.cue('LIFT!','good'); }, 900); };
    const end = ok => { S.phase='done';
      if (ok){ best = kg; hud.stat2('BEST', kg+'kg'); hud.cue('GOOD LIFT! '+kg+'kg','good'); cheer(1); } else hud.cue('NO LIFT','bad');
      a.play('Lift_Drop', { once:true }); S.drop = 0; setTimeout(() => a.play(ok ? (kg >= 120 ? 'BackFlip' : 'Celebration') : 'Crying', { once: ok && kg >= 120 }), 900); setTimeout(next, ok && kg >= 120 ? 3400 : 3000); };
    next();
    return {
      btn(id){ if (id[0]==='w') pick(+id.slice(1)); },
      input(k, down){ if (S.phase==='choose') return; if ((k==='L'||k==='R') && S.phase==='lift'){ wag.tap(k); hud.pad(k); } if (k==='action' && down && S.phase==='hold' && S.left > 0){ S.left--; S.bv -= Math.sign(S.b)*0.6; S.bv *= 0.5; hud.action(S.left ? 'hot' : 'on', 'STEADY', S.left ? S.left+' LEFT · STAY IN THE GOLD' : 'NONE LEFT · HOLD ON!'); } },
      update(dt){
        S.t += dt; const heavy = (kg-50)/60;
        if (S.phase==='lift'){ wag.update(dt); const thr = TUNE.lift.effort + heavy*0.3; S.lt = (S.lt || 0) + dt; S.p = clamp(S.p + (wag.p >= thr ? (TUNE.lift.rate + 0.6*(wag.p - thr)/Math.max(0.05, 1 - thr)) : -0.15)*dt, 0, 1);
          if (S.t > 1.1){ if (S.p < 0.5){ if (a.curName!=='Lift_Clean') a.play('Lift_Clean'); a.scrub(S.p/0.5); } else { if (a.curName!=='Lift_Jerk') a.play('Lift_Jerk'); a.scrub(Math.min(1,(S.p-0.5)/0.5)); } }
          hud.power(wag.p, TUNE.lift.effort + heavy*0.3); if (S.p >= 1){ S.phase='hold'; hud.liftStage('hold'); a.play('Lift_Hold'); hud.chips([['LIFT',2],['HOLD · 2s',1]]); S.left = TUNE.lift.steadyPresses; hud.action('hot','STEADY', S.left+' LEFT · STAY IN THE GOLD'); S.b = (Math.random()-.5)*0.2; S.out = 0; }
          if (S.lt > TUNE.lift.liftTime && S.phase==='lift') end(false); }
        if (S.phase==='hold'){ S.bv += (Math.sign(S.b||0.01)*(0.4+heavy)*TUNE.lift.wobble + (Math.random()-.5)*1.2)*dt; S.b += S.bv*dt; S.hold += dt; const out = Math.abs(S.b) > 0.348; S.out = out ? (S.out||0) + dt : 0; hud.balance(S.b, out); a.body.rotation.x = S.b*0.08;
          if (Math.abs(S.b) >= 0.75 || S.out > TUNE.lift.outTime) end(false); else if (S.hold >= 2.2){ hud.action('off'); end(true); } }
        if (S.phase!=='done' && S.t > 1.1 && S.phase!=='wait' && S.phase!=='choose'){ const gr = a.grip('R'), gl = a.grip('L'), h = gr.clone().add(gl).multiplyScalar(0.5).add(new V3(...BAR_OFF).applyAxisAngle(new V3(0,1,0), a.pivot.rotation.y)); if (S.t < 1.5) bar.position.lerp(h, dt*8); else bar.position.copy(h); bar.quaternion.setFromUnitVectors(new V3(0,0,1), gl.sub(gr).normalize()); }
        if (S.phase==='done'){ S.drop += dt; if (S.drop <= 0.27){ const gr = a.grip('R'), gl = a.grip('L'); bar.position.copy(gr.clone().add(gl).multiplyScalar(0.5).add(new V3(...BAR_OFF))); bar.quaternion.setFromUnitVectors(new V3(0,0,1), gl.sub(gr).normalize()); S.bvy = 0; } else { S.bvy = (S.bvy||0) + 9.8*dt; bar.position.y = Math.max(0.35, bar.position.y - S.bvy*dt); if (bar.position.y <= 0.35) bar.quaternion.slerp(new THREE.Quaternion(), 0.3); } a.body.rotation.x = 0; }
        setCam(new V3(3.2, 1.9, 6.2), new V3(0, 1.1, 0), S.t < 0.05 && n===1);
      },
      dispose(){ removeObj(bar); }
    };
  }
};

// ---------- fencing ----------
const HTS = ['High','Mid','Low'], ORD = ['','1ST','2ND','3RD','4TH'];
const fence = { id:'fence', name:'FENCING', bug:'FEN', short:'FENCING', venue:'piste', lower:true, fmt:v => ORD[v] || '—', attempts:1, cpu:[4, 1],
  howto:[['START 4TH · BEAT THE FENCER ABOVE YOU TO CLIMB · WIN 3 BOUTS FOR GOLD','LADDER'],['WATCH THE RED TARGET · PARRY AT THE SAME HEIGHT (LEFT BUTTONS)','PARRY'],['THEN COUNTER WITH A LIT ATTACK BUTTON · FIRST TO 5','ATTACK']],
  make(ctx){
    const { hud, info } = ctx, R = ctx.rivals, BT = 60;
    const me = ctx.spawn(ctx.player.kit, ctx.player.name); place(me, -1.3, 0.06, 0, 0); me.play('Fence_Idle');
    const lunge = (f, dur=0.8) => { f.lg = 0; f.lgDur = dur; };
    const foils = [prop('foil'), prop('foil')];
    let bout = 0, wins = 0, ai = null, opp = null, sc = [0,0], clock = BT, S = { phase:'intro', t:0 };
    const lamp = (i) => { info.lamps.forEach((l,j) => { l.material = l.material.clone(); l.material.emissive.set(j===i? (i===0? '#35D07F' : '#E5484D') : '#000'); }); };
    const finish = () => { const p = 4 - wins; S = { phase:'over', t:0, winner:S.winner }; setTimeout(() => ctx.done({ value:p, rivals: R.map((r, i) => i+1 < p ? i+1 : i+2) }), 2400); };
    const startBout = () => {
      opp = R[2-bout]; if (ai){ W.scene.remove(ai.pivot); W.athletes = W.athletes.filter(x => x !== ai); }
      ai = ctx.spawn(opp.kit, opp.name); place(ai, 1.3, 0.06, 0, PI); ai.play('Fence_Idle'); me.play('Fence_Idle');
      sc = [0,0]; clock = BT;
      hud.setup({ code:'FEN', name:'FENCING', sub:'BOUT '+(bout+1)+' OF 3 · FOR '+ORD[3-bout]+' PLACE', pads:false, bout:[ctx.player, opp], buttons:{ left:HTS.map(h => ['p'+h, h==='Mid'? 'MIDDLE' : h.toUpperCase()]), right:HTS.map(h => ['a'+h, h==='Mid'? 'MIDDLE' : h.toUpperCase()]), leftLabel:'PARRY', rightLabel:'ATTACK' }, cueTop:560, cueSize:46 });
      hud.bout(sc, clock); lamp(-1); S = { phase:'engarde', t:0, step:-1, full:true }; if (bout===2) setTimeout(() => hud.cue('FINAL · ONLY COUNTERS SCORE'), 2200);
    };
    const boutEnd = (won) => {
      S = { phase:'between', t:0 }; hud.marker(null);
      setTimeout(() => { (won? me : ai).play('Fence_Victory', { once:true }); (won? ai : me).play('Fence_Defeat', { once:true }); }, 500);
      S.winner = won ? me : ai; clearOpen(); setTimeout(() => hud.boutSide(won ? 'right' : 'left'), 400); const score = Math.max(...sc)+'–'+Math.min(...sc);
      if (won){ wins++; cheer(1); hud.cue(wins===3 ? 'GOLD! '+ctx.player.name+' WINS '+score : ctx.player.name+' WINS '+score, 'good'); }
      else hud.cue(opp.name+' WINS '+score, 'bad');
      if (!won || wins===3) return finish();
      bout++; setTimeout(startBout, 3400);
    };
    const touch = (who) => { if (S.phase==='between' || S.phase==='over') return; sc[who]++; lamp(who); hud.bout(sc, clock); hud.cue(who===0? 'TOUCH · '+ctx.player.name : 'TOUCH · '+opp.name, who===0? 'good':'bad'); if (who===0) cheer(0.8);
      (who===0? ai : me).play('Hit_'+HTS[(Math.random()*3)|0], { once:true });
      if (sc[who] >= 5 || clock <= 0) boutEnd(who===0); else S = { phase:'reset', t:0 }; };
    const clearOpen = () => hud.focusBtns(null);
    const react = () => lerp(TUNE.fence.reactMax, TUNE.fence.reactMin, bout/2);
    startBout();
    return {
      btn(id){
        if (!['idle','tele','strike','counter'].includes(S.phase)) return; const h = id.slice(1); hud.btn(id, 'flash');
        if (id[0]==='p'){ me.play('Parry_'+h, { once:true, restart:true }); if (S.phase==='tele' || S.phase==='strike'){ if (h===S.h){ const open = [...HTS].sort(() => Math.random()-.5).slice(0, 3-bout); S = { phase:'counter', t:0, open }; hud.focusBtns(open.map(o => 'a'+o)); hud.cue('PARRY! COUNTER NOW','good'); ai.play('Parry_'+h, { once:true }); } } }
        else { if (S.phase==='tele' || S.phase==='strike') return; me.play((S.phase==='counter'? 'Counter_' : 'Strike_')+h, { once:true, restart:true }); lunge(me);
          if (S.phase==='counter'){ clearOpen(); if (S.open.includes(h)){ S.phase = 'hit'; setTimeout(() => touch(0), 150); } else { ai.play('Parry_'+h, { once:true }); hud.cue(opp.name+' BLOCKS'); S = { phase:'idle', t:0, wait:0.35 }; } }
          else if (S.phase==='idle'){ const guard = HTS[(Math.random()*3)|0]; if (bout < 2 && guard!==h && Math.random() < 0.75){ S.phase = 'hit'; setTimeout(() => touch(0), 180); } else { ai.play('Parry_'+guard, { once:true }); hud.cue(opp.name+' BLOCKS'); S = { phase:'tele', t:0.15, h: HTS[(Math.random()*3)|0] }; } } }
      },
      update(dt){
        S.t += dt;
        if (['idle','tele','strike','counter','reset'].includes(S.phase) && clock > 0){ clock = Math.max(0, clock - dt); hud.bout(sc, clock);
          if (clock <= 0){ if (sc[0] !== sc[1]) boutEnd(sc[0] > sc[1]); else hud.cue('NEXT TOUCH WINS'); } }
        [me, ai].forEach((f, i) => { if (f.lg !== undefined){ f.lg += dt; const u = f.lg/f.lgDur, env = u < 0.22 ? Math.sin(u/0.22*PI/2) : u < 0.55 ? 1 : Math.max(0, 1 - (u-0.55)/0.45); const o = i===0 ? ai : me, dir = i===0 ? 1 : -1, x = dir*-1.3 + dir*TUNE.fence.lunge*env; f.pivot.position.x = dir > 0 ? Math.min(x, o.pivot.position.x - 1.0) : Math.max(x, o.pivot.position.x + 1.0); if (u >= 1) f.lg = undefined; }
          const h = f.hand('R'), fr = f.hand('F'); foils[i].position.copy(h); foils[i].quaternion.setFromUnitVectors(new V3(0,1,0), h.sub(fr).normalize()); });
        if (S.phase==='reset' && S.t > 0.7){ lamp(-1); me.play('Fence_Idle'); ai.play('Fence_Idle'); S = { phase:'engarde', t:0, step:-1, full:false }; }
        if (S.phase==='engarde'){ const seq = S.full ? [['EN GARDE',0],['PRÊTS?',0.75],['ALLEZ!',1.5]] : [['PRÊTS?',0],['ALLEZ!',0.5]], k = seq.findLastIndex(q => S.t >= q[1]);
          if (k !== S.step){ S.step = k; hud.cue(seq[k][0], k===seq.length-1 ? 'good' : ''); }
          if (S.t >= seq[seq.length-1][1] + 0.15) S = { phase:'idle', t:0, wait:0.25+Math.random()*0.4 }; }
        if (S.phase==='idle' && S.t > S.wait){ S = { phase:'tele', t:0, h: HTS[(Math.random()*3)|0] }; }
        if (S.phase==='tele' && S.t > react()){ S.phase='strike'; ai.play('Strike_'+S.h, { once:true, restart:true }); lunge(ai); }
        if (S.phase==='strike' && S.t > react()+0.4){ touch(1); }
        if (S.phase==='counter' && S.t > react()+0.4){ clearOpen(); S = { phase:'idle', t:0, wait:0.4 }; me.play('Fence_Idle'); ai.play('Fence_Idle'); }
        if (S.phase==='tele' || S.phase==='strike'){ const p = new V3(-0.75, { High:1.55, Mid:1.1, Low:0.6 }[S.h], 0).project(W.camera); hud.marker((p.x+1)/2*1333, (1-p.y)/2*690); } else hud.marker(null);
        if (W.camera.fov !== 34){ W.camera.fov = 34; W.camera.updateProjectionMatrix(); }
        if ((S.phase==='between' || S.phase==='over') && S.winner && S.t > 0.4){ const wx = S.winner.pivot.position.x, sd = wx < 0 ? 1 : -1; setCam(new V3(wx + sd*2.4, 1.2, 5.2), new V3(wx, 1.05, 0)); }
        else { const T0 = performance.now()/1000, sway = Math.sin(T0*0.35)*0.55 + Math.sin(T0*0.9)*0.12; setCam(new V3(1.6 + sway, 1.95 + Math.sin(T0*0.5)*0.06, 6.5), new V3(0.15 + sway*0.25, 1.05, 0), bout===0 && S.phase==='engarde' && S.t < 0.05); }
      },
      dispose(){ foils.forEach(removeObj); hud.marker(null); }
    };
  }
};

export const EVENTS_B = [dive, archery, swim, lift, fence];
