/* feel_test.mjs — the three things that make a converted THPS level rideable:
 * what hitting a wall does, how hard it steers, and whether you can see past
 * the park at all.
 *
 * Needs node, playwright, a chromium, and the game served. From games/skate:
 *
 *     python3 -m http.server 8099 &
 *     node tools/feel_test.mjs
 *
 * CHROMIUM and THREE_DIR can point at your own copies.
 */
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const T=process.env.THREE_DIR||'node_modules/three';
const CHROMIUM=process.env.CHROMIUM||undefined;
const ok=[],bad=[];
const check=(l,p,d='')=>{(p?ok:bad).push(l);console.log(`  ${p?'PASS':'FAIL'} ${l}${d?'  -- '+d:''}`);};
const b=await chromium.launch({executablePath:CHROMIUM,args:['--headless=new','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:1000,height:640}});
await p.route('https://cdn.jsdelivr.net/**',(r)=>{const f=path.join(T,new URL(r.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//,''));fs.existsSync(f)?r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(f)}):r.fulfill({status:404,body:'no'});});
await p.goto('http://localhost:8099/index.html');
await p.waitForFunction(()=>window.__skate&&window.__skate.mode==='menu',{timeout:60000});

console.log('\n1. what hitting a wall does');
const LEVEL=process.env.LEVEL||'thps-skware';
await p.evaluate((i)=>window.__skate._loadLevel(i), LEVEL);
await p.waitForFunction((i)=>window.__skate.levelId===i, LEVEL, {timeout:60000});
// Drive handleWallBounce directly with a known contact, so the result is about
// the rule and not about where a ledge happens to be.
const bounce=async(degIntoWall,speed)=>p.evaluate(([deg,spd])=>{
  const g=window.__skate,T=window.__three;
  g._startRun(); g.mode='play'; g._respawn(); g.sm.go('reset'); g.sm.go('ground');
  const ctrl=g.ctrl;
  const n=new T.Vector3(1,0,0);                       // wall faces +X
  const a=deg*Math.PI/180;
  // travelling mostly along the wall (+Z), tilted `deg` into it
  const head=new T.Vector3(-Math.sin(a),0,Math.cos(a)).normalize();
  ctrl.up_direction.set(0,1,0);
  ctrl.velocity.copy(head).multiplyScalar(spd);
  ctrl.lookAlong(head.clone());
  ctrl.shape_col_fwd=[{group:'wall',normal:n.clone(),point:ctrl.body.position.clone()}];
  const before=ctrl.velocity.clone();
  ctrl.handleWallBounce();
  const after=ctrl.velocity.clone();
  const intoBefore=-before.dot(n), intoAfter=-after.dot(n);
  return {speedBefore:+before.length().toFixed(2), speedAfter:+after.length().toFixed(2),
          kept:+(after.length()/before.length()).toFixed(2),
          intoWallAfter:+intoAfter.toFixed(2),
          awayFromWall:+after.dot(n).toFixed(2),
          turnedDeg:+(Math.acos(Math.max(-1,Math.min(1,after.clone().normalize().dot(before.clone().normalize()))))*180/Math.PI).toFixed(0)};
},[degIntoWall,speed]);

const g5 =await bounce(5,10);   console.log('     5 deg, 10 m/s:',JSON.stringify(g5));
const g20=await bounce(20,10);  console.log('    20 deg, 10 m/s:',JSON.stringify(g20));
const g45=await bounce(45,10);  console.log('    45 deg, 10 m/s:',JSON.stringify(g45));
const sq =await bounce(85,10);  console.log('    85 deg, 10 m/s:',JSON.stringify(sq));
const slow=await bounce(85,2);  console.log('    85 deg,  2 m/s:',JSON.stringify(slow));

check('a 20 deg clip keeps almost all your speed', g20.kept>0.9, `kept ${g20.kept}`);
check('and barely changes your line', g20.turnedDeg<25, `turned ${g20.turnedDeg} deg`);
check('and angles you off the wall, not into it', g20.awayFromWall>0, `${g20.awayFromWall} m/s away`);
check('a 45 deg clip is still a deflection, not a reversal', g45.kept>0.65 && g45.turnedDeg<60,
  `kept ${g45.kept}, turned ${g45.turnedDeg} deg`);
check('a near-parallel graze is left alone', g5.kept>0.95 && g5.turnedDeg<12,
  `kept ${g5.kept}, turned ${g5.turnedDeg} deg`);
check('riding squarely into it at speed still bounces you back', sq.turnedDeg>100,
  `turned ${sq.turnedDeg} deg, kept ${sq.kept}`);
check('and squarely into it slowly just stops you', slow.turnedDeg<95 && slow.intoWallAfter<0.01,
  `turned ${slow.turnedDeg} deg, ${slow.intoWallAfter} m/s still into it`);

console.log('\n2. steering rate');
const steer=await p.evaluate(()=>{
  const g=window.__skate;
  g._startRun(); g.mode='play'; g._respawn(); g.sm.go('reset'); g.sm.go('ground');
  const inp=g.input; inp.held=Object.create(null); inp.held.Up=true; inp.held.Left=true;
  // accumulate the per-tick heading change: after more than half a turn the
  // net angle between start and end stops meaning anything
  const heading=()=>{g.ctrl.body.updateMatrixWorld(true);
    const m=g.ctrl.body.matrixWorld.elements; return Math.atan2(m[8],m[10]);};
  let prev=heading(), total=0, ticks=0;
  for(let i=0;i<30;i++){
    inp.update(1/60); g.sm.physics(1/60);
    if(g.sm.current.name!=='ground') break;
    const h=heading(); let d=h-prev;
    while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
    total+=Math.abs(d); prev=h; ticks++;
  }
  return {degPerSec:+(total/ticks*60*180/Math.PI).toFixed(0), ticks};
});
console.log('    full left =',steer.degPerSec,'deg/s over',steer.ticks,'ticks');
check('turning is calmer than the original 229 deg/s', steer.degPerSec<190 && steer.degPerSec>130,
  `${steer.degPerSec} deg/s (original 4.0 rad/s = 229)`);

console.log('\n3. camera occlusion (Downtown is corridors)');
await p.evaluate(()=>window.__skate._loadLevel('thps-skdown'));
await p.waitForFunction(()=>window.__skate.levelId==='thps-skdown',{timeout:60000});
const cam=await p.evaluate(()=>{
  const g=window.__skate,T=window.__three;
  g._startRun(); g.mode='play';
  const inp=g.input; inp.held=Object.create(null); inp.held.Up=true;
  let seed=99; const rnd=()=>((seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff);
  let blocked=0, samples=0, closest=99, pulledIn=0;
  const eye=new T.Vector3(), ray=new T.Vector3();
  for(let i=0;i<1800;i++){
    if(i%30===0){inp.held.Left=rnd()<0.25; inp.held.Right=!inp.held.Left&&rnd()<0.3;}
    inp.update(1/60); g.sm.physics(1/60); g.cam.update(1/60,g.ctrl,g.sm.current.name);
    if(i%6) continue;
    samples++;
    const t=g.ctrl.position;
    eye.set(t.x,t.y+1.0,t.z);
    ray.subVectors(g.camera.position,eye);
    const d=ray.length(); ray.divideScalar(d);
    closest=Math.min(closest,d);
    if(d < 6.3) pulledIn++;
    const hit=g.level.world.probe(eye,ray,d-0.25);
    if(hit) blocked++;
  }
  return {samples,blocked,pulledIn,closest:+closest.toFixed(2),
          blockedPct:+(100*blocked/samples).toFixed(1)};
});
console.log('   ',JSON.stringify(cam));
check('the camera pulls in when something is in the way', cam.pulledIn>50, `${cam.pulledIn}/${cam.samples} frames pulled in, closest ${cam.closest} m`);
/* 3.5%, not the 2% this used to want. Dropping the collision that nothing draws
   (World.dropUndrawnFloors) changed where this ride GOES: Downtown used to carry
   the skater along an invisible plate above the streets, and now they ride the
   streets. The camera has more than twice as much to duck round as a result —
   frames pulled in went from 86 of 300 to 198 — and a couple more of them graze
   something on the way. The camera itself is unchanged. */
check('the skater is almost never behind a wall', cam.blockedPct<3.5, `${cam.blockedPct}% of frames blocked`);

console.log(bad.length?`\nFAILURES: ${bad.join(', ')}`:`\nALL PASS (${ok.length})`);
await b.close(); process.exit(bad.length?1:0);
