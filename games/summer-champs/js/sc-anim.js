// Summer Champs: custom pose clips (aim-solver on the UE-style Quaternius rig). Extracted from Animation Coverage Test.
import * as THREE from 'three';
import { ANIM_PATCH } from './sc-anim-patch.js';
const V3 = THREE.Vector3, Q = THREE.Quaternion, PI = Math.PI, TAU = PI*2;
// ---------- pose authoring ----------
const RIG_UE = { hips:'pelvis', spine:[['spine_01','spine_02'],['spine_02','spine_03'],['spine_03','neck_01']], neck:[['neck_01','Head']],
  R:{ua:['upperarm_r','lowerarm_r'],la:['lowerarm_r','hand_r'],th:['thigh_r','calf_r'],ca:['calf_r','foot_r'],ft:['foot_r','ball_r']},
  L:{ua:['upperarm_l','lowerarm_l'],la:['lowerarm_l','hand_l'],th:['thigh_l','calf_l'],ca:['calf_l','foot_l'],ft:['foot_l','ball_l']},
  finger:(f,j,s)=>f+'_0'+j+'_'+s, hand:s=>'hand_'+s };
const HS = s => s==='r' ? 'Right' : 'Left', HF = { index:'Index', middle:'Middle', ring:'Ring', pinky:'Little', thumb:'Thumb' };
const RIG_H = { hips:'Hips', spine:[['Spine','Chest'],['Chest','UpperChest'],['UpperChest','Neck']], neck:[['Neck','Head']],
  R:{ua:['RightUpperArm','RightLowerArm'],la:['RightLowerArm','RightHand'],th:['RightUpperLeg','RightLowerLeg'],ca:['RightLowerLeg','RightFoot'],ft:['RightFoot','RightToes']},
  L:{ua:['LeftUpperArm','LeftLowerArm'],la:['LeftLowerArm','LeftHand'],th:['LeftUpperLeg','LeftLowerLeg'],ca:['LeftLowerLeg','LeftFoot'],ft:['LeftFoot','LeftToes']},
  finger:(f,j,s)=>HS(s)+HF[f]+(f==='thumb' ? ['Metacarpal','Proximal','Distal'] : ['Proximal','Intermediate','Distal'])[j-1], hand:s=>HS(s)+'Hand' };
let RIG = RIG_UE;
const PARTS = ['ua','la','th','ca','ft'];
const DEF = {spine:[1,0,0], neck:[1,0,0], ua:[-1,0,0.15], la:[-1,0,0.1], th:[-1,0,0.02], ca:[-1,0,0], ft:[0,1,0]};
function expand(p){ const o={pitch:p.pitch??0, roll:p.roll??0, twS:p.twS??0, twH:p.twH??0, rlR:p.rlR??p.rl??0, rlL:p.rlL??p.rl??0, spine:p.spine??DEF.spine, neck:p.neck??p.spine??DEF.neck}; for(const k of PARTS) for(const s of ['R','L']) o[k+s] = p[k+s] ?? p[k] ?? DEF[k]; return o; }
function lerpPose(a,b,t){ const o={}; for(const k in a){ o[k] = Array.isArray(a[k]) ? a[k].map((x,i)=>x+(b[k][i]-x)*t) : a[k]+(b[k]-a[k])*t; } return o; }
function keyed(keys, kp){ const ks = keys.map(([t,p],i)=>[t,{...expand(p), ...(kp?.[i]||{})}]); const f = t=>{ let i=0; while(i<ks.length-2 && t>ks[i+1][0]) i++; const [t0,p0]=ks[i],[t1,p1]=ks[i+1]; let u=Math.min(1,Math.max(0,(t-t0)/(t1-t0||1))); u=u*u*(3-2*u); return lerpPose(p0,p1,u); }; f.keys = keys; return f; }
const loop = f => { const g = t => expand(f(t)); g.loopFn = f; return g; };
const sn = x=>Math.sin(x), cs = x=>Math.cos(x);

// swimming
const armCrawl = th => { const s=sn(th), c=cs(th); return { ua:[c,s,s<0?0.45:0.12], la: s>=0 ? [c,s+0.4,0.1] : [cs(th+1.2),sn(th+1.2),0.3] }; };
const TREAD = t => { const s=sn(TAU*t), c=cs(TAU*t); return {pitch:0.12, neck:[1,0.1,0], uaR:[-0.3,0.35*s+0.2,0.9], laR:[-0.05,0.7*s+0.3,0.75], uaL:[-0.3,-0.35*s+0.2,0.9], laL:[-0.05,-0.7*s+0.3,0.75], th:[-0.75,0.5,0.25], caR:[-0.85,-0.25+0.35*c,0.3*s+0.1], caL:[-0.85,-0.25-0.35*c,-0.3*s+0.1], ft:[-0.3,0.9,0.2]}; };
const CROUCH = {spine:[0.35,0.95,0], neck:[0.15,1,0], ua:[-0.55,0.8,0.12], la:[-0.85,0.5,0.05], th:[-0.45,0.9,0.1], ca:[-1,-0.2,0], ft:[-0.5,1,0]};
const COIL = {...CROUCH, spine:[0.25,1,0], ua:[-0.3,-0.75,0.25], la:[-0.5,-0.75,0.2]};
const STREAM = {spine:[1,0,0], neck:[1,0,0], ua:[1,0.03,0.04], la:[1,0,0.01], th:[-1,0,0.02], ca:[-1,0,0], ft:[-1,0.2,0]};
const SPRING = {...STREAM, th:[-1,-0.15,0.03], ca:[-1,-0.25,0]};
const TUCK = {pitch:PI/2, spine:[0.3,0.95,0], neck:[0.1,1,0], ua:[-0.8,0.45,0.25], la:[0.1,1,0.1], th:[0.35,0.95,0.06], ca:[-0.95,-0.3,0], ft:[-0.3,-1,0]};
// high diving
const HD_STAND = {ft:[-0.5,1,0], ua:[0.8,0.5,0.3], la:[0.9,0.4,0.2]};
const HD_DIP = {spine:[0.9,0.3,0], th:[-0.7,0.7,0.05], ca:[-1,-0.3,0], ua:[-0.6,-0.75,0.2], la:[-0.6,-0.75,0.15]};
const HD_EXT = {...STREAM, ua:[1,0.25,0.2], la:[1,0.2,0.1]};
const PIKE = {spine:[0.5,0.85,0], neck:[0.4,0.9,0], th:[0.55,0.83,0.03], ca:[0.55,0.83,0], ft:[0.7,0.7,0], ua:[-0.2,0.98,0.1], la:[0.2,0.98,0.05]};
const TUCK2 = {spine:[0.4,0.9,0], neck:[0.2,1,0], th:[0.45,0.88,0.1], ca:[-0.9,-0.35,0], ft:[-0.4,-0.9,0], ua:[-0.4,0.85,0.3], la:[0.3,0.85,-0.4]};
const PENCIL = {ua:[-1,0.02,0.06], la:[-1,0,0.04], th:[-1,0,0.01], ca:[-1,0,0], ft:[-1,0.2,0]};
const CANNON = {spine:[0.35,0.93,0], neck:[0.3,0.95,0], th:[0.55,0.83,0.1], ca:[-0.85,-0.5,0], ft:[-0.3,-0.95,0], ua:[-0.3,0.9,0.35], la:[0.1,0.8,-0.6]};
const SPLAT = {spine:[1,-0.1,0], neck:[0.9,-0.45,0], ua:[0.1,-0.1,1], la:[0.1,-0.1,1], th:[-0.9,-0.05,0.4], ca:[-0.9,-0.05,0.4], ft:[-0.6,-0.6,0.3]};
// sprint + jumps
const MARKS = {spine:[0.45,0.9,0], neck:[0.5,0.85,0], ua:[-1,0.12,0.2], la:[-1,0.1,0.15], thL:[-0.25,0.95,0.08], caL:[-1,-0.15,0], ftL:[-0.5,1,0], thR:[-0.95,-0.15,0.1], caR:[-0.1,-1,0.05], ftR:[-0.3,-0.95,0]};
const SET = {spine:[0.25,0.95,0], neck:[0.35,0.95,0], ua:[-1,0.05,0.2], la:[-1,0.05,0.15], thL:[-0.55,0.8,0.08], caL:[-0.95,-0.3,0], ftL:[-0.5,1,0], thR:[-0.75,-0.55,0.1], caR:[-0.55,-0.85,0.05], ftR:[-0.3,-0.6,0]};
const LAND_REACH = {spine:[0.85,0.5,0], neck:[0.9,0.3,0], th:[0.05,1,0.06], ca:[0.1,1,0], ft:[1,0.2,0], ua:[0.1,1,0.15], la:[0.1,1,0.1]};
const LAND_SIT = {spine:[0.92,0.35,0], neck:[1,0.2,0], th:[0.02,1,0.08], ca:[-0.15,1,0], ft:[0.9,0.4,0], ua:[-0.45,0.8,0.3], la:[-0.15,0.95,0.2]};
const footed = (p, kR, kL) => { const d = p.ca || [-1,0,0], f = (c, k) => [c[1] + k*c[0], -c[0] + k*c[1], 0]; return { ...p, ftR: f(p.caR || d, kR), ftL: f(p.caL || d, kL) }; };
const TJ0 = footed({spine:[1,0.2,0], thR:[-0.85,-0.5,0.05], caR:[-0.8,-0.6,0], thL:[0.1,1,0.08], caL:[-1,0.2,0], uaR:[-0.3,0.9,0.15], laR:[0.4,0.9,0.1], uaL:[-0.3,-0.9,0.15], laL:[-0.6,-0.3,0.1]}, 1.2, 0.5);
const TJ1 = footed({spine:[1,0.15,0], thR:[-0.3,0.95,0.05], caR:[-0.9,0.4,0], thL:[-0.8,-0.55,0.08], caL:[-0.3,-0.95,0], uaR:[-0.3,-0.9,0.15], laR:[-0.6,-0.3,0.1], uaL:[-0.3,0.9,0.15], laL:[0.4,0.9,0.1]}, 0.4, 1);
const TJ2 = footed({spine:[1,0.15,0], thR:[-0.95,0.3,0.05], caR:[-1,0.1,0], thL:[-0.7,-0.6,0.08], caL:[-0.4,-0.9,0], ua:[-0.6,0.7,0.2], la:[0,1,0.1]}, 0.4, 1);
const TJ3 = footed({spine:[1,0.1,0], thL:[0.15,1,0.08], caL:[-1,0.1,0], thR:[-0.6,-0.8,0.05], caR:[-0.25,-0.95,0], ua:[0.3,0.95,0.2], la:[0.6,0.8,0.1]}, 1, 0.4);
const TJ4 = footed({spine:[1,0.15,0], thL:[-0.95,0.3,0.08], caL:[-1,0.1,0], thR:[-0.7,-0.6,0.05], caR:[-0.4,-0.9,0], ua:[-0.6,0.7,0.2], la:[0,1,0.1]}, 1, 0.4);
const runLegs = (th) => { const o={}; for (const [s,ph] of [['R',th],['L',th+PI]]){ const a=0.8*sn(ph), bend=0.25+1.1*Math.max(0,sn(ph-1.2)), b=a-bend; o['th'+s]=[-cs(a),sn(a),0.05]; o['ca'+s]=[-cs(b),sn(b),0]; o['ft'+s]=[-0.1,1,0]; } return o; };
// archery
const BOWB = {th:[-0.97,0,0.25], ca:[-1,0,0.1], twS:-0.9, twH:0.9, uaL:[0.08,1,-0.02], laL:[0.08,1,-0.02]};
const DRAW0 = {...BOWB, uaR:[0.05,1,-0.05], laR:[0.05,1,-0.05]};
const DRAW1 = {...BOWB, uaR:[0.12,-0.85,0.5], laR:[0.1,0.7,-0.7]};
const REL = {...BOWB, uaR:[0.1,-0.95,0.4], laR:[0.05,-0.9,0.45]};
const RELX = {...REL, uaL:[-0.2,0.95,-0.02], laL:[-0.2,0.95,-0.02]};
// weightlifting
const LFT = [-0.5,1,0], LSTAND = {ft:LFT};
const SQ = {spine:[0.75,0.65,0], neck:[1,0.35,0], th:[-0.3,0.9,0.3], ca:[-1,-0.2,0.05], ft:[-0.5,1,0.25], ua:[-1,0.2,0.18], la:[-1,0.15,0.1]};
const PULL = {ft:LFT, spine:[0.97,0.2,0], th:[-0.95,0.25,0.15], ca:[-1,-0.05,0.05], ua:[-1,0.15,0.18], la:[-1,0.1,0.1]};
const RACK = {ft:LFT, th:[-1,0.05,0.15], ua:[-0.35,0.75,0.4], la:[0.95,-0.05,-0.25]};
const DIP = {...RACK, th:[-0.85,0.5,0.15], ca:[-1,-0.3,0.05]};
const SPLIT = {rl:1.57, ua:[1,0.04,0.3], la:[1,0,0.15], thR:[-0.8,0.6,0.1], caR:[-1,0.05,0], thL:[-0.75,-0.6,0.12], caL:[-0.65,-0.75,0.1], ftR:LFT, ftL:[-0.7,0.2,0]};
const OVER = {ft:LFT, rl:1.57, ua:[1,0.05,0.3], la:[1,0,0.15], th:[-1,0,0.15], ca:[-1,0,0.05]};
// fencing
const GUARD = {spine:[1,0.05,0], neck:[1,0.1,0], twS:0.6, twH:-0.5, thR:[-0.85,0.5,0.12], caR:[-1,-0.1,0.05], ftR:[-0.65,1.02,-0.1], thL:[-0.9,0.02,0.24], caL:[-0.95,0.2,0.1], ftL:[-0.8,1.23,0.8], uaR:[-0.35,0.9,0.1], laR:[0.15,1,0], uaL:[0.27,-0.33,0.84], laL:[1.01,1.1,0.21]};
const HGT = {High:0.3, Mid:0, Low:-0.3};
const LUNGE = h => ({...GUARD, spine:[1,0.2,0], twS:0.7, thR:[-0.35,0.95,0.08], caR:[-1,0.15,0], thL:[-0.55,-0.85,0.12], caL:[-0.5,-0.85,0.1], ftL:[-1,1.13,0.8], uaR:[h,1,0.05], laR:[h,1,0.02], uaL:[0.05,-1,0.25], laL:[0,-1,0.2]});
const PARRY = {High:{uaR:[0.2,0.8,0.25], laR:[1,0.15,-0.3]}, Mid:{uaR:[-0.2,0.8,0.45], laR:[0.4,0.8,-0.5]}, Low:{uaR:[-0.55,0.7,0.2], laR:[-0.85,0.45,-0.2]}};
const PAR = k => ({...GUARD, thR:[-0.9,0.4,0.12], ...PARRY[k]});
const COUNTER = h => ({...GUARD, thR:[-0.7,0.7,0.1], caR:[-1,0.05,0], uaR:[h,1,0.05], laR:[h,1,0.02]});
const HIT = {High:{spine:[1,-0.25,0], neck:[0.8,-0.6,0], uaR:[-0.5,0.6,0.5], laR:[-0.3,0.8,0.3]}, Mid:{spine:[0.85,0.4,0], neck:[0.8,0.5,0], uaR:[-0.8,0.5,0.2], laR:[-0.5,0.8,0.1]}, Low:{thR:[-0.5,0.7,0.1], caR:[-1,-0.3,0], spine:[0.95,0.25,0], uaR:[-0.7,0.6,0.3]}};
const SALUTE = {uaR:[0.9,0.3,0.1], laR:[1,0.05,0], uaL:[-1,0,0.15], laL:[-1,0,0.1]};
const VEE = {uaR:[0.9,0.1,0.45], laR:[1,0.05,0.3], uaL:[0.9,0.1,0.45], laL:[1,0.05,0.3]};
const SLUMP = {...GUARD, twS:0.25, twH:0, spine:[0.85,0.5,0], neck:[0.55,0.85,0], uaR:[-1,0.25,0.1], laR:[-1,0.2,0.05], uaL:[-1,0.2,0.1], laL:[-1,0.15,0.05], thR:[-0.8,0.55,0.12], caR:[-1,-0.25,0.05], thL:[-0.9,0.05,0.24]};
// discus
const DSPIN = t => { const s=sn(TAU*t); return {spine:[1,0.15,0], twS:-0.6, thR:[-0.8,0.45*s,0.25], caR:[-1,-0.2,0.1], thL:[-0.8,-0.45*s,0.25], caL:[-1,-0.2,0.1], ft:[0,1,0.2], uaR:[-0.1,-0.55,0.85], laR:[-0.1,-0.55,0.85], uaL:[0.05,0.55,0.85], laL:[0.1,0.4,0.9]}; };

const CUSTOM = [
 ['Blocks_Marks',1,keyed([[0,MARKS],[1,MARKS]]),2,1,0],
 ['Blocks_Set',0.9,keyed([[0,MARKS],[0.6,SET],[1,SET]]),20,1,1],
 ['Land_Sand',1.2,keyed([[0,LAND_REACH],[0.3,LAND_REACH],[0.75,LAND_SIT],[1,LAND_SIT]]),20,1,1],
 ['TJ_Hop',0.55,keyed([[0,TJ0],[0.5,TJ1],[1,TJ2]]),16,0,1],
 ['TJ_Step',0.55,keyed([[0,TJ2],[0.45,TJ3],[1,TJ4]]),16,0,1],
 ['Javelin_Run',0.66,loop(t=>({spine:[1,0.2,0], ...runLegs(TAU*t), uaR:[0.3,-0.6,0.45], laR:[0.95,0.05,0.1], uaL:[-cs(0.7*sn(TAU*t)),sn(0.7*sn(TAU*t)),0.12], laL:[-cs(0.7*sn(TAU*t)+1.4),sn(0.7*sn(TAU*t)+1.4),0.05]})),24,0,0],
 ['Discus_Ready',1.6,loop(t=>{ const s=sn(TAU*t); return {th:[-0.95,0.05,0.3], ca:[-1,-0.05,0.15], ft:[0,1,0.3], twS:0.7*s, uaR:[-0.15,0.65*s,0.75], laR:[-0.1,0.65*s,0.75], uaL:[0,0.7,0.6], laL:[0.1,0.8,0.3]}; }),24,1,0],
 ['Discus_Spin',0.55,loop(DSPIN),16,1,0],
 ['Discus_Release',1,keyed([[0,{...DSPIN(0), twS:-0.9, uaR:[-0.05,-0.75,0.65], laR:[-0.05,-0.75,0.65]}],[0.4,{...DSPIN(0), spine:[1,0.25,0], twS:0.5, uaR:[0.2,0.95,0.25], laR:[0.25,0.95,0.2], thR:[-0.95,-0.2,0.2], thL:[-0.8,0.5,0.2]}],[1,{...DSPIN(0), spine:[1,0.3,0], twS:1, uaR:[0.05,0.45,-0.85], laR:[0,0.3,-0.95], uaL:[-0.6,-0.5,0.6], laL:[-0.6,-0.5,0.6], thR:[-0.9,0.35,0.15], thL:[-0.95,-0.2,0.2]}]]),20,1,1],
 ['HD_Stand',2,keyed([[0,HD_STAND],[1,HD_STAND]]),2,1,0],
 ['HD_Takeoff',0.6,keyed([[0,HD_STAND],[0.4,HD_DIP],[1,HD_EXT]]),16,1,1],
 ['HD_Pike',1.1,keyed([[0,STREAM],[1,PIKE]]),20,0,1],
 ['HD_Tuck',1.1,keyed([[0,STREAM],[1,TUCK2]]),20,0,1],
 ['HD_Entry_Head',1,keyed([[0,{...STREAM, ua:[0.9,0.3,0.2], la:[0.9,0.3,0.1]}],[0.35,STREAM],[1,STREAM]]),12,0,1],
 ['HD_Entry_Feet',1,keyed([[0,PENCIL],[1,PENCIL]]),2,0,0],
 ['HD_Cannonball',1,keyed([[0,STREAM],[0.3,CANNON],[1,CANNON]]),12,0,1],
 ['HD_Splat',1,keyed([[0,{...SPLAT, ua:[0.6,0,0.8], la:[0.6,0,0.8]}],[1,SPLAT]]),12,0,1],
 ['Water_HeadShake',1.2,loop(t=>({...TREAD(t), neck:[1,0.15,0], twH:0.6*sn(TAU*2*t)})),24,0,0],
 ['Block_Crouch',1,keyed([[0,CROUCH],[1,CROUCH]]),2,1,0],
 ['Dive_Start',0.9,keyed([[0,CROUCH],[0.22,COIL],[0.5,SPRING],[1,STREAM]]),24,1,1],
 ['Swim_Crawl',1.3,loop(t=>{ const th=TAU*t, R=armCrawl(th), L=armCrawl(th+PI), k=sn(TAU*3*t); return {pitch:PI/2, roll:0.4*sn(th), rl:PI, neck:[1,0.35,0], uaR:R.ua, laR:R.la, uaL:L.ua, laL:L.la, thR:[-1,0.2*k,0.05], caR:[-1,0.32*k-0.06,0.05], thL:[-1,-0.2*k,0.05], caL:[-1,-0.32*k-0.06,0.05], ft:[-1,0.25,0]}; }),32,0,0],
 ['Tumble_Turn',0.9,keyed([[0,{...STREAM,pitch:PI/2}],[0.25,TUCK],[0.7,TUCK],[1,{...STREAM,pitch:PI/2}]]),24,0,1],
 ['Tread_Water',1.6,loop(TREAD),24,0,0],
 ['Water_Celebrate',1.2,loop(t=>{ const s=sn(TAU*t*1.5), p=TREAD(t); return {...p, uaR:[0.9+0.15*s,0.15,0.35], laR:[1,0.25*s+0.1,0.05], roll:0.08*s}; }),24,0,0],
 ['Bow_Draw',1,keyed([[0,DRAW0],[1,DRAW1]]),20,1,1],
 ['Bow_Aim',1.6,loop(t=>({...DRAW1, uaL:[0.08+0.015*sn(TAU*t),1,-0.02+0.015*cs(TAU*t)], laL:[0.08+0.015*sn(TAU*t),1,-0.02+0.015*cs(TAU*t)]})),24,1,0],
 ['Bow_Release',0.8,keyed([[0,DRAW1],[0.15,REL],[1,RELX]]),16,1,1],
 ['Lift_Setup',1.1,keyed([[0,LSTAND],[1,SQ]]),16,1,1,t=>Math.min(1,Math.max(0,(t-0.6)/0.3))],
 ['Lift_Clean',1,keyed([[0,SQ],[0.45,PULL],[0.75,DIP],[1,RACK]]),20,1,1,1],
 ['Lift_Jerk',0.8,keyed([[0,RACK],[0.35,DIP],[0.7,SPLIT],[1,SPLIT]]),16,1,1,1],
 ['Lift_Hold',1.2,loop(t=>({...OVER, ua:[1,0.06*sn(TAU*t),0.3+0.03*sn(TAU*2*t)], roll:0.04*sn(TAU*t)})),20,1,0,1],
 ['Lift_Drop',0.9,keyed([[0,OVER],[0.35,{ft:LFT, ua:[0.3,0.9,0.3], la:[0.2,0.95,0.2]}],[1,LSTAND]]),16,1,1,t=>Math.max(0,1-t/0.35)],
 ['Fence_Idle',1,loop(t=>{ const s=sn(TAU*t); return {...GUARD, thR:[-0.85+0.05*s,0.5,0.12], thL:[-0.9+0.05*s,0.02,0.24]}; }),16,1,0],
 ...['High','Mid','Low'].flatMap(k=>[
   ['Strike_'+k,1,keyed([[0,GUARD],[0.35,LUNGE(HGT[k])],[0.6,LUNGE(HGT[k])],[1,GUARD]]),20,1,1],
   ['Parry_'+k,0.8,keyed([[0,GUARD],[0.3,PAR(k)],[0.7,PAR(k)],[1,GUARD]]),16,1,1],
   ['Counter_'+k,0.8,keyed([[0,PAR(k)],[0.35,COUNTER(HGT[k])],[0.65,COUNTER(HGT[k])],[1,GUARD]]),16,1,1],
   ['Hit_'+k,0.9,keyed([[0,GUARD],[0.25,{...GUARD,...HIT[k]}],[0.65,{...GUARD,...HIT[k]}],[1,GUARD]]),16,1,1],
 ]),
 ['Fence_Victory',1.6,keyed([[0,GUARD],[0.3,SALUTE],[0.6,VEE],[1,VEE]]),20,1,1],
 ['Fence_Defeat',1.4,keyed([[0,GUARD],[0.5,SLUMP],[1,SLUMP]]),16,1,1],
 ['Wave',1,loop(t=>({uaR:[0.55,0.15,0.82], laR:[0.95,0.1,0.35*sn(TAU*t)], neck:[1,0.05,0], twH:0.15*sn(TAU*t)})),16,1,0],
];

// library-based clips: body from a UAL clip (root motion + yaw stripped), arms re-aimed by the pose solver
const LAYERED = {
  Javelin_Run: { base:'Sprint', n:24, keep:true, arms: t => ({ uaR:[0.3,-0.6,0.45], laR:[0.95,0.05,0.1] }) },
  Javelin_Start: { base:'Sprint_Enter', n:24, keep:true, once:true, arms: t => ({ uaR:[0.3,-0.6,0.45], laR:[0.95,0.05,0.1] }) },
  Discus_Spin: { base:'Turn180_L_RM', n:24, arms: t => ({ uaR:[0.05,-0.55,0.85], laR:[0.05,-0.5,0.9], uaL:[0.05,0.75,0.5], laL:[0.1,0.95,0.1] }) },
};
export const layeredBase = name => LAYERED[name]?.base;
// ---------- patches (anim editor) ----------
export const EDIT_PARTS = ['pitch','roll','twS','twH','rlR','rlL','spine','neck','uaR','laR','uaL','laL','thR','caR','ftR','thL','caL','ftL'];
const addOffset = (pose, off) => { const o = {...pose}; for (const k in off){ const v = off[k]; o[k] = Array.isArray(v) ? o[k].map((x,i)=>x+(v[i]||0)) : o[k]+v; } return o; };
function patchedFn(fn, p){ if (!p) return fn; const base = fn.keys ? keyed(fn.keys, p.keys) : fn; return p.offset ? t => addOffset(base(t), p.offset) : base; }
export function activePatch(){ const out = JSON.parse(JSON.stringify(ANIM_PATCH || {})); try { const live = JSON.parse(localStorage.getItem('sc.animPatch.live') || 'null'); if (live) Object.assign(out, live); } catch {} return out; }
export const propOffset = (kind, patch = activePatch()) => patch._props?.[kind] || [0,0,0];
export const CLIP_LIST = CUSTOM.map(([name,dur,fn,n,plant,once]) => ({ name, dur, n, plant:!!plant, once:!!once, keyed:!!fn.keys, keys: fn.keys ? fn.keys.map(([t,p])=>({ t, pose:expand(p) })) : null, sample: t => fn(t) }));
for (const n in LAYERED) if (!CLIP_LIST.some(c => c.name === n)) CLIP_LIST.push({ name:n, dur:1, n:LAYERED[n].n, plant:false, once:!!LAYERED[n].once, keyed:false, keys:null, sample: t => expand(LAYERED[n].arms(t)) });

export function createClipBuilder(model, libClips = {}){
  const get = n => model.getObjectByName(n); RIG = get('Hips') && get('RightUpperArm') ? RIG_H : RIG_UE;
  const miss=[]; const need = n => { const b=get(n); if(!b) miss.push(n); return b; };
  const hips = need(RIG.hips);
  const chains = [...RIG.spine.map(([a,b])=>[need(a),need(b),'spine']), ...RIG.neck.map(([a,b])=>[need(a),need(b),'neck'])];
  for (const s of ['R','L']) for (const k of PARTS){ const [a,b]=RIG[s][k]; chains.push([need(a),need(b),k+s,s]); }
  if (miss.length){ console.warn('custom rig bones missing',miss); return null; }
  const bones = [hips, ...new Set(chains.map(c=>c[0]))];
  bones.forEach(b=>{ if(!b.userData.rest) b.userData.rest = b.quaternion.clone(); });
  model.updateMatrixWorld(true);
  const mq = model.getWorldQuaternion(new Q()), mqi = mq.clone().invert();
  const inv = model.matrixWorld.clone().invert(); const toModel = o => o.getWorldPosition(new V3()).applyMatrix4(inv);
  const F = toModel(get(RIG.R.ft[1])).sub(toModel(get(RIG.R.ft[0]))); F.y=0; F.normalize();
  const U = new V3(0,1,0), Rv = new V3().crossVectors(F,U).normalize();
  const sgn = U.clone().applyQuaternion(new Q().setFromAxisAngle(Rv,1)).dot(F) > 0 ? 1 : -1;
  const vec = (a,side)=> U.clone().multiplyScalar(a[0]).addScaledVector(F,a[1]).addScaledVector(Rv,(side==='L'?-1:1)*a[2]).normalize();
  const setWorld = (b,qw)=>{ const pq=b.parent.getWorldQuaternion(new Q()); b.quaternion.copy(pq.invert().multiply(qw)); b.updateMatrixWorld(true); };
  const nSp = RIG.spine.length;
  function solve(p){
    bones.forEach(b=>b.quaternion.copy(b.userData.rest)); model.updateMatrixWorld(true);
    const Qb = new Q().setFromAxisAngle(Rv, sgn*p.pitch).multiply(new Q().setFromAxisAngle(U, p.roll));
    const Qw = mq.clone().multiply(Qb).multiply(mqi);
    setWorld(hips, Qw.clone().multiply(hips.getWorldQuaternion(new Q())));
    for (const [b,c,key,side] of chains){
      const D = vec(p[key], side).applyQuaternion(Qb).applyQuaternion(mq);
      const cur = c.getWorldPosition(new V3()).sub(b.getWorldPosition(new V3())).normalize();
      let q = new Q().setFromUnitVectors(cur, D);
      const tw = key==='spine' ? p.twS/nSp : key==='neck' ? p.twH : key==='laR' ? p.rlR : key==='laL' ? -p.rlL : 0;
      if (tw) q = new Q().setFromAxisAngle(D, tw).multiply(q);
      setWorld(b, q.multiply(b.getWorldQuaternion(new Q())));
    }
  }
  const feet = [get(RIG.R.ft[0]), get(RIG.L.ft[0])];
  const restHip = hips.position.clone();
  const reset = () => { hips.position.copy(restHip); bones.forEach(b=>b.quaternion.copy(b.userData.rest)); model.updateMatrixWorld(true); };
  reset();
  const restFootY = Math.min(...feet.map(f=>f.getWorldPosition(new V3()).y));
  // finger curl (grip): per-bone local axis that closes the finger toward the palm
  const fingers = [];
  for (const s of ['r','l']){
    const F_ = (f,j) => get(RIG.finger(f,j,s)), hand = get(RIG.hand(s)), i1 = F_('index',1), p1 = F_('pinky',1), m1 = F_('middle',1), th = F_('thumb',3); if (!hand || !i1 || !p1 || !m1) continue;
    const W = o => o.getWorldPosition(new V3()), k = W(i1).sub(W(p1)).normalize(), dh = W(m1).sub(W(hand)).normalize();
    let n = new V3().crossVectors(k, dh).normalize(); if (th && W(th).sub(W(hand)).dot(n) < 0) n.negate();
    for (const f of ['index','middle','ring','pinky','thumb']) [1,2,3].forEach(j => { const b = F_(f,j), c = b && b.children.find(x => x.isBone); if (!b || !c || (f==='thumb' && j===1)) return;
      const d = W(c).sub(W(b)).normalize(), ax = new V3().crossVectors(d, n).normalize().applyQuaternion(b.getWorldQuaternion(new Q()).invert());
      fingers.push({ b, ax, amt: f==='thumb' ? (j===2 ? 0.45 : 0.6) : [1.25, 1.35, 0.9][j-1], rest: b.quaternion.clone() }); });
  }
  function buildLayered(name, cfg, patch){
    const src = libClips[cfg.base]; if (!src) return null;
    const hn = RIG.hips, drop = t => /^Root\./.test(t.name);
    const yaw = q => new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    const tracks = src.tracks.filter(t => !drop(t)).map(t => t.clone());
    const hq = tracks.find(t => t.name === hn+'.quaternion'), hp = tracks.find(t => t.name === hn+'.position');
    if (hq && !cfg.keep){ const v = hq.values, q = new Q(), y0 = yaw(q.fromArray(v, 0)); for (let i=0;i<v.length;i+=4){ q.fromArray(v, i); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); e.y -= yaw(q); q.setFromEuler(e); q.toArray(v, i); } }
    if (hp){ const v = hp.values; for (let i=0;i<v.length;i+=3){ v[i] = v[0]; v[i+2] = v[2]; } }
    const base = new THREE.AnimationClip(cfg.base+'_inplace', src.duration, tracks), dur = patch?.dur ?? src.duration;
    const mx = new THREE.AnimationMixer(model), act = mx.clipAction(base); act.play();
    const armFn = patchedFn(loop(cfg.arms), patch), own = Object.keys(cfg.arms(0)), extra = Object.keys(patch?.offset || {}), armChains = chains.filter(c => /^(ua|la)[RL]$/.test(c[2]) && (own.includes(c[2]) || extra.includes(c[2])));
    const armBones = [...new Set(armChains.map(c => c[0]))], times = [], vals = armBones.map(() => []);
    for (let i=0;i<=cfg.n;i++){ const f = i/cfg.n; act.time = f*src.duration; mx.update(0); model.updateMatrixWorld(true); const p = armFn(f);
      for (const [b,c,key,side] of armChains){ const D = vec(p[key], side).applyQuaternion(mq); const cur = c.getWorldPosition(new V3()).sub(b.getWorldPosition(new V3())).normalize(); let q = new Q().setFromUnitVectors(cur, D); const tw = key==='laR' ? p.rlR : key==='laL' ? -p.rlL : 0; if (tw) q = new Q().setFromAxisAngle(D, tw).multiply(q); setWorld(b, q.multiply(b.getWorldQuaternion(new Q()))); }
      times.push(f*dur); armBones.forEach((b,j) => { const q = b.quaternion, a = vals[j], L = a.length; if (L && a[L-4]*q.x+a[L-3]*q.y+a[L-2]*q.z+a[L-1]*q.w < 0) a.push(-q.x,-q.y,-q.z,-q.w); else a.push(q.x,q.y,q.z,q.w); }); }
    act.stop(); mx.uncacheRoot(model); reset();
    const keep = tracks.filter(t => !armBones.some(b => t.name === b.name+'.quaternion')).map(t => { if (dur === src.duration) return t; const c = t.clone(); c.scale(dur/src.duration); return c; });
    const clip = new THREE.AnimationClip(name, dur, [...keep, ...armBones.map((b,j) => new THREE.QuaternionKeyframeTrack(b.name+'.quaternion', times, vals[j]))]); clip.userData = { once:!!cfg.once, layered:cfg.base }; return clip;
  }
  function build(name, patch){
    if (LAYERED[name] && libClips[LAYERED[name].base]) return buildLayered(name, LAYERED[name], patch);
    const row = CUSTOM.find(r => r[0]===name); if (!row) return null;
    const [, dur0, fn0, n, plant, once, grip] = row, dur = patch?.dur ?? dur0, fn = patchedFn(fn0, patch);
    const times=[], vals=bones.map(()=>[]), pos=[], rootY = patch?.rootY || 0;
    for (let i=0;i<=n;i++){ const t=i/n; hips.position.copy(restHip); solve(fn(t)); times.push(t*dur);
      { const hw=hips.getWorldPosition(new V3()); if (plant){ const fy=Math.min(...feet.map(f=>f.getWorldPosition(new V3()).y)); hw.y-=(fy-restFootY); } hw.y += rootY; const lp=hips.parent.worldToLocal(hw); pos.push(lp.x,lp.y,lp.z); }
      bones.forEach((b,j)=>{ const q=b.quaternion, a=vals[j], L=a.length; if(L && a[L-4]*q.x+a[L-3]*q.y+a[L-2]*q.z+a[L-1]*q.w<0) a.push(-q.x,-q.y,-q.z,-q.w); else a.push(q.x,q.y,q.z,q.w); });
    }
    const tracks = bones.map((b,j)=> new THREE.QuaternionKeyframeTrack(b.name+'.quaternion', times, vals[j]));
    if (grip !== undefined) for (const f of fingers){ const v = []; times.forEach(tt => { const g = typeof grip === 'function' ? grip(tt/dur) : grip; const q = f.rest.clone().multiply(new Q().setFromAxisAngle(f.ax, f.amt*g)); v.push(q.x,q.y,q.z,q.w); }); tracks.push(new THREE.QuaternionKeyframeTrack(f.b.name+'.quaternion', times, v)); }
    tracks.push(new THREE.VectorKeyframeTrack(hips.name+'.position', times, pos));
    const clip = new THREE.AnimationClip(name, dur, tracks); clip.userData = {once:!!once};
    reset(); return clip;
  }
  return { build };
}
export function buildCustomClips(model, patch = activePatch(), libClips = {}){
  const b = createClipBuilder(model, libClips), out = {}; if (!b) return out;
  for (const name of new Set([...CUSTOM.map(r => r[0]), ...Object.keys(LAYERED)])){ const c = b.build(name, patch[name]); if (c) out[name] = c; }
  return out;
}
