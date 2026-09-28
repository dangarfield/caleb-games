/* main.js — Buttons! controller. A vanilla port of the ButtonsGame component in the Claude Design prototype
 * (research/New game design overview/Buttons 3D.dc.html): screen flow, the room state machine (intro →
 * controls intro → play → inspect → press → got one / Muddler mix-up × 3 → win), wrong-button gags, the
 * free-clue offer, pause + "Make it easier", the Button Book, the Big Dipper ride and the on-ride photo.
 * HTML screens and HUD sit over the Three.js canvas on a 1333×690 stage scaled to fit.
 * window.__btn is a debug hook: __btn.room(n), __btn.go('book'), __btn.ride('loop'), __btn.win() … */
import { ROOMS, MAPXY, GAGS, PLAYERS, THING_SAY, FIN_TXT, CAPW, genRoom, layoutRoom, gFmt } from './rooms.js';
import { Btn, Icon, Chip, Bip, Muddler } from './ui2d.js';
import { sfx, unlock } from './audio.js';
import * as GAG from './gags.js';
import { S, PIDS, loadSave, save, flush, boy, rooms, roomOpen, dipperOpen, totalStars, totalTime, roomsDone, recordRoom, recordGag, recordPhoto, setSetting } from './state.js';
import { setPixelRatio, STAGE_W, STAGE_H } from './gl.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), elBd = $('bd'), elGl = $('gl'), elRide = $('ride'), elScreen = $('screen'), elHud = $('hud'), elOv = $('ov');
const K = '#3B2A4A';
const player = () => S.data.settings.player;
const me = () => ({ name: player(), initial: player()[0], ...PLAYERS[player()] });

const app = {
  screen: 'home', bookFrom: 'home', bookSel: null,
  game: null, round: 1, rounds: 3, phase: 'play', step: 0, zoom: null, found: [], taken: [], open: [],
  wrong: 0, wrongRound: 0, stars: 3, time: 0, overlay: null, sel: null, pressing: false,
  gag: 'duck', gagNew: false, doorOpen: false, walking: false, bipMood: 'idle', mixStep: 0, newBest: false, toast: null,
  rideLoading: false, ridePhase: '', rideStart: 0,
};
const DBG = { hold: false };          // __btn.hold(true) keeps a gag on screen for checking
let seenControls = false, scale = 1, timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearT = () => { timers.forEach(clearTimeout); timers = []; };

/* ---------------- layout ---------------- */
function fit() {
  scale = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H);
  const x = (innerWidth - STAGE_W * scale) / 2, y = (innerHeight - STAGE_H * scale) / 2;
  stage.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  setPixelRatio((devicePixelRatio || 1) * scale);
}

/* ---------------- small template helpers ---------------- */
const act = (a, arg) => `data-act="${a}"${arg != null ? ` data-arg="${arg}"` : ''}`;
const starIcons = (n, px, of = 3) => Array.from({ length: of }, (_, i) => Icon('star', i < n ? '#FFB400' : '#E4D3B6', px)).join('');
function pips(size, mode) {
  const s = app, ov = s.overlay;
  return `<div class="pips">${[1, 2, 3].map(k => {
    let done, cur;
    if (mode === 'mix') { done = k <= s.round; cur = false; }
    else { done = k < s.round || ov === 'win' || (ov === 'mixup' && k === s.round); cur = k === s.round && !done; }
    const bg = done ? '#45C46A' : cur ? '#FFC93C' : '#E4D3B6', sh = cur ? '0 0 0 4px rgba(255,201,60,.45)' : 'none', tf = cur ? 'scale(1.12)' : (mode === 'mix' && done && k === s.round ? 'scale(1.15)' : 'none');
    return `<div class="pip" style="width:${size}px;height:${size}px;background:${bg};box-shadow:${sh};transform:${tf}">${done ? Icon('check', '#fff', Math.round(size * .6), 7) : ''}</div>`;
  }).join('')}</div>`;
}
const partsHTML = parts => parts.map(p => p.b ? `<b>${p.t}</b>` : p.t).join('');
function speech(text, style, extra = '') { return `<div class="fd" style="position:absolute;${style};padding:14px 20px;border-radius:24px 24px 24px 6px;background:#fff;border:4px solid ${K};font-weight:600;font-size:24px;line-height:1.15;${extra}">${text}</div>`; }

/* =====================================================================
   SCREENS: home, map, book, photo
   ===================================================================== */
function homeHTML() {
  const houses = ROOMS.map((R, i) => ({ x: 40 + i * 95 + (i > 5 ? 90 : 0), b: 40 + (i % 3) * 18, w: 62 + (i % 2) * 14, h: 60 + (i % 3) * 14, c: R.wall[1], roof: R.door }));
  const title = [['circle', 'red', 'B', 78, -8, 3], ['square', 'yellow', 'U', 74, 6, 3.3], ['hexagon', 'blue', 'T', 78, -4, 2.8], ['circle', 'green', 'T', 72, 8, 3.1, 'stripy'], ['circle', 'orange', 'O', 78, -6, 3.4, 'spotty'], ['square', 'purple', 'N', 74, 5, 2.9], ['circle', 'pink', 'S', 76, -7, 3.2], ['star', 'yellow', '!', 84, 10, 2.7, 'glowing']];
  const trk = 'M640 280 C740 280 820 30 900 30 S960 200 1040 200 S1110 60 1185 60 S1300 220 1380 150 S1480 90 1600 130';
  const players = PIDS.map(name => {
    const sel = player() === name, pl = PLAYERS[name];
    return `<div class="tap" ${act('player', name)} style="position:relative;flex:1;height:200px;padding:16px;border-radius:28px;background:${sel ? '#FFFFFF' : '#FFF6E6'};border:${sel ? '5px solid #F2424F' : '4px solid ' + K};box-shadow:0 6px 0 ${K};display:flex;gap:14px;align-items:center;transform:${sel ? 'translateY(-4px) rotate(-1deg)' : 'none'};transition:transform .2s">
      ${Btn({ shape: pl.shape, color: pl.color, symbol: name[0], px: 96 })}
      <div style="display:flex;flex-direction:column;gap:6px"><div class="fd" style="font-weight:700;font-size:36px;line-height:1">${name}</div>
        <div style="display:flex;align-items:center;gap:6px;font-weight:900;font-size:20px">${Icon('star', '#FFB400', 24)}${totalStars(name)} stars</div>
        <div style="font-weight:800;font-size:16px;opacity:.8">${roomsDone(name)} of 10 rooms</div></div>
      ${sel ? `<div style="position:absolute;right:-10px;top:-10px;width:44px;height:44px;border-radius:50%;background:#45C46A;border:4px solid ${K};display:grid;place-items:center">${Icon('check', '#fff', 26)}</div>` : ''}</div>`;
  }).join('');
  const line = (pic, txt) => `<div style="display:flex;gap:16px;align-items:center"><div style="width:64px;flex:none;display:grid;place-items:center">${pic}</div><div>${txt}</div></div>`;
  return `<div style="position:absolute;inset:0;background:linear-gradient(180deg,#8ED2F6 0%,#C9EDFF 58%,#E9F7DA 100%);overflow:hidden">
  <div style="position:absolute;left:760px;top:40px;width:170px;height:50px;border-radius:30px;background:#fff;opacity:.8"></div>
  <div style="position:absolute;left:330px;top:540px;width:130px;height:40px;border-radius:30px;background:#fff;opacity:.7"></div>
  <div style="position:absolute;left:-60px;bottom:0;width:1560px;height:300px;animation:parkPan 26s ease-in-out infinite alternate">
    <div style="position:absolute;left:-100px;bottom:-160px;width:900px;height:300px;border-radius:50%;background:#9BDB7A"></div>
    <div style="position:absolute;left:600px;bottom:-190px;width:1100px;height:330px;border-radius:50%;background:#86CF66"></div>
    <svg viewBox="0 0 1560 300" style="position:absolute;inset:0;width:1560px;height:300px;overflow:visible">
      <path d="M820 300 V120 M900 300 V40 M980 300 V150 M1120 300 V60 M1250 300 V150 M1370 300 V100 M1480 300 V140" style="stroke:#C9B8E6;stroke-width:10;stroke-linecap:round"/>
      <circle cx="1185" cy="130" r="70" style="fill:none;stroke:${K};stroke-width:20"/><circle cx="1185" cy="130" r="70" style="fill:none;stroke:#FF6B7A;stroke-width:11"/>
      <path d="${trk}" style="fill:none;stroke:${K};stroke-width:22;stroke-linecap:round"/><path d="${trk}" style="fill:none;stroke:#FF6B7A;stroke-width:13;stroke-linecap:round"/><path d="${trk}" style="fill:none;stroke:#fff;stroke-width:3;stroke-dasharray:6 14"/></svg>
    ${houses.map(h => `<div style="position:absolute;left:${h.x}px;bottom:${h.b}px;width:${h.w}px;height:${h.h}px"><div style="position:absolute;left:-8px;right:-8px;top:-26px;height:44px;border-radius:30px 30px 8px 8px;background:${h.roof};border:4px solid ${K}"></div><div style="position:absolute;inset:0;border-radius:10px;background:${h.c};border:4px solid ${K}"></div><div style="position:absolute;left:50%;bottom:0;width:26px;height:34px;margin-left:-13px;border-radius:13px 13px 0 0;background:${K}"></div></div>`).join('')}
  </div>
  <div style="position:absolute;left:52px;top:84px;display:flex;gap:2px;align-items:center;transform:scale(.78);transform-origin:0 50%">
    ${title.map(([sh, c, l, px, r, d, f]) => `<div style="rotate:${r}deg;animation:float ${d}s ease-in-out infinite">${Btn({ shape: sh, color: c, symbol: l, px, finish: f })}</div>`).join('')}</div>
  <div style="position:absolute;left:52px;top:188px;width:600px;padding:22px 26px 22px 18px;background:#FFF6E6;border:4px solid ${K};border-radius:30px;box-shadow:0 6px 0 ${K};display:flex;flex-direction:column;gap:14px;font-size:24px;line-height:1.3;font-weight:800">
    ${line(Btn({ shape: 'star', color: 'red', px: 56 }), 'Buttonland opens tomorrow. It has the best ride ever: the <b style="color:#F2424F">Big Dipper</b>!')}
    ${line(Muddler('giggle', 60, { head: true }), 'But the cheeky <b style="color:#6A3FBE">Button Muddler</b> put pretend buttons everywhere. Now all the doors are locked!')}
    ${line(Bip('happy', 54), 'Only <b>one</b> button in each room is real. <b style="color:#1E7F86">Bip</b> the robot has clues to help you find it.')}
    ${line(Icon('play', '#F2424F', 44), 'Get out of all 10 rooms. Then ride the Big Dipper!')}</div>
  <div style="position:absolute;left:700px;top:110px;width:580px;display:flex;flex-direction:column;gap:18px">
    <div class="fd" style="font-weight:600;font-size:26px">Who's playing?</div>
    <div style="display:flex;gap:16px">${players}</div>
    <div style="display:flex;gap:16px;margin-top:10px">
      <div class="cb red" ${act('goMap')} style="flex:1;height:104px;border-radius:52px;box-shadow:0 8px 0 ${K};gap:16px;font-size:46px;letter-spacing:1px">${Icon('play', '#fff', 46)}Play</div>
      <div class="cb" ${act('goBook')} style="width:150px;height:104px;border-radius:32px;background:#FFC93C;box-shadow:0 8px 0 ${K};flex-direction:column;gap:2px;font-weight:600;font-size:19px">${Icon('book', K, 40)}Button Book</div>
    </div></div>
  <div style="position:absolute;left:1150px;top:560px;rotate:-14deg">${Bip('wow', 150)}</div></div>`;
}

function mapHTML() {
  const P = player(), R = rooms(P);
  let nextSet = false;
  const path = 'M200 190 L410 165 L620 195 L830 165 C960 175 990 330 870 375 L650 400 L430 375 L210 400 C80 450 170 580 420 585 L690 590 L1000 560';
  const stops = ROOMS.map((Rm, i) => {
    const n = i + 1, best = R[n], unl = roomOpen(P, n), next = unl && !best && !nextSet; if (next) nextSet = true;
    const [x, y] = MAPXY[i];
    return `<div class="tap" ${unl ? act('room', n) : act('locked')} style="position:absolute;left:${x}px;top:${y}px;width:176px;height:124px;margin:-62px 0 0 -88px;border-radius:24px;background:${unl ? '#FFF6E6' : '#E3DCE8'};border:4px solid ${K};box-shadow:0 6px 0 ${K};animation:${next ? 'nextPulse 1.4s ease-in-out infinite' : 'none'};display:flex;flex-direction:column">
      <div class="fd" style="height:48px;border-radius:19px 19px 0 0;background:${unl ? Rm.wall[1] : '#CFC6D8'};border-bottom:4px solid ${K};display:flex;align-items:center;padding-left:54px;font-weight:600;font-size:17px;line-height:1.05;color:${unl && n >= 6 ? '#fff' : K}">${Rm.name}</div>
      <div style="position:absolute;left:-14px;top:-14px">${Btn({ shape: 'circle', color: unl ? (best ? 'green' : 'red') : 'white', symbol: n, px: 58 })}</div>
      ${!unl ? `<div style="flex:1;display:grid;place-items:center">${Icon('lock', '#8C7FA0', 40)}</div>` : `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px"><div style="display:flex;gap:2px">${starIcons(best ? best.s : 0, 28)}</div><div style="display:flex;align-items:center;gap:4px;font-weight:900;font-size:15px">${Icon('timer', K, 16, 5)}${best ? gFmt(best.t) : '–:––'}</div></div>`}
      ${next ? `<div style="position:absolute;right:-40px;bottom:-34px">${Bip('happy', 58)}</div><div class="fd" style="position:absolute;left:50%;bottom:-24px;transform:translateX(-50%);padding:3px 14px;border-radius:14px;background:#F2424F;border:3px solid ${K};color:#fff;font-weight:700;font-size:17px">Play!</div>` : ''}</div>`;
  }).join('');
  const d10 = dipperOpen(P), m = me();
  return `<div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 40%,#C9EFA8,#9FD97E 70%);overflow:hidden">
  <div style="position:absolute;left:40px;top:470px;width:220px;height:120px;border-radius:50%;background:rgba(255,255,255,.18)"></div>
  <div style="position:absolute;left:560px;top:250px;width:260px;height:90px;border-radius:50%;background:rgba(255,255,255,.18)"></div>
  <svg viewBox="0 0 1333 690" style="position:absolute;inset:0;width:1333px;height:690px"><path d="${path}" style="fill:none;stroke:${K};stroke-width:46;stroke-linecap:round;stroke-linejoin:round"/><path d="${path}" style="fill:none;stroke:#FFE9C2;stroke-width:36;stroke-linecap:round;stroke-linejoin:round"/><path d="${path}" style="fill:none;stroke:#F5C98A;stroke-width:5;stroke-dasharray:4 22;stroke-linecap:round"/></svg>
  <div class="fd pill" style="position:absolute;left:50%;top:14px;transform:translateX(-50%);margin-left:-160px;height:64px;padding:0 28px;display:flex;align-items:center;gap:12px;border-radius:32px;font-weight:700;font-size:30px">${Icon('map', K, 34)}Buttonland Park</div>
  ${stops}
  <div class="tap" ${act(d10 ? 'ride' : 'lockedDipper')} style="position:absolute;left:1040px;top:120px;width:268px;height:530px;border-radius:34px;background:linear-gradient(#8ED2F6,#D6F1FF);border:5px solid ${K};box-shadow:0 8px 0 ${K};overflow:hidden">
    <svg viewBox="0 0 268 530" style="position:absolute;inset:0;width:100%;height:100%"><path d="M40 530 V300 M100 530 V120 M170 530 V260 M230 530 V180" style="stroke:#C9B8E6;stroke-width:8;stroke-linecap:round"/><path d="M-10 470 C40 470 70 110 110 110 S150 330 190 300 S240 170 290 200" style="fill:none;stroke:${K};stroke-width:18;stroke-linecap:round"/><path d="M-10 470 C40 470 70 110 110 110 S150 330 190 300 S240 170 290 200" style="fill:none;stroke:#FF6B7A;stroke-width:10;stroke-linecap:round"/></svg>
    <div style="position:absolute;left:0;right:0;bottom:0;height:150px;background:#FFF6E6;border-top:5px solid ${K};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px">
      <div class="fd" style="font-weight:700;font-size:32px;color:#F2424F">Big Dipper</div>
      <div style="display:flex;align-items:center;gap:8px;font-weight:900;font-size:17px">${Icon(d10 ? 'play' : 'lock', K, 24)}${d10 ? 'Ride again!' : 'Escape all 10 rooms'}</div></div>
    ${d10 ? '' : `<div style="position:absolute;inset:0;background:rgba(59,42,74,.25)"></div>`}</div>
  <div style="position:absolute;right:16px;top:14px;display:flex;gap:10px;align-items:center">
    <div class="fd pill" style="height:64px;padding:0 18px 0 8px;display:flex;align-items:center;gap:10px;border-radius:32px;font-weight:600;font-size:20px">${Btn({ shape: m.shape, color: m.color, symbol: m.initial, px: 48 })}${m.name}</div>
    <div class="cb sq" ${act('goBook')} style="width:72px;height:72px;background:#FFC93C">${Icon('book', K, 32)}Book</div>
    <div class="cb sq" ${act('goHome')} style="width:72px;height:72px">${Icon('home', K, 32)}Home</div></div></div>`;
}

function bookHTML() {
  const have = boy().gags, sel = GAGS.find(x => x[0] === app.bookSel);
  const tiles = GAGS.map(x => {
    const f = have.includes(x[0]);
    return `<div class="bookTile" ${act('bookSel', x[0])} style="background:${f ? '#FFFFFF' : '#EDE4D6'}">${Btn({ shape: f ? x[5] : 'circle', color: f ? x[4] : 'white', symbol: f ? '' : '?', finish: f ? 'shiny' : 'rubbery', px: 52 })}<div class="n" style="color:${f ? K : '#9A8CA8'}">${f ? x[1] : '???'}</div></div>`;
  }).join('');
  return `<div style="position:absolute;inset:0;background:radial-gradient(circle,#F3E2C4 2px,transparent 3px) 0 0/28px 28px,#FFF1D8;overflow:hidden">
  <div class="fd" style="position:absolute;left:160px;top:14px;height:64px;padding:0 26px 0 12px;display:flex;align-items:center;gap:12px;background:#FFC93C;border:4px solid ${K};border-radius:32px;box-shadow:0 5px 0 ${K};font-weight:700;font-size:32px">${Icon('book', K, 38)}Button Book</div>
  <div style="position:absolute;left:470px;top:22px;height:48px;padding:0 18px;display:flex;align-items:center;gap:8px;background:#FFF6E6;border:4px solid ${K};border-radius:24px;font-weight:900;font-size:19px">${have.length} of 30 gags found</div>
  <div class="fd pill" style="position:absolute;left:690px;top:22px;height:48px;padding:0 16px 0 6px;display:flex;align-items:center;gap:8px;border-radius:24px;font-weight:600;font-size:19px">${Btn({ shape: me().shape, color: me().color, symbol: me().initial, px: 36 })}${me().name}'s book</div>
  <div class="cb sq" ${act('bookBack')} style="position:absolute;right:16px;top:10px">${Icon('back', K, 32)}Back</div>
  <div style="position:absolute;left:24px;top:100px;width:320px;display:flex;flex-direction:column;gap:16px">
    <div style="height:276px;padding:16px 18px;border-radius:28px;background:linear-gradient(#DDF6F2,#FFF6E6 60%);border:4px solid ${K};box-shadow:0 6px 0 ${K};display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:12px">${Bip('happy', 100)}<div><div class="fd" style="font-weight:700;font-size:34px;line-height:1">Bip</div><div style="font-weight:800;font-size:15px;color:#1E7F86">Park helper robot</div></div></div>
      <div style="font-weight:700;font-size:15.5px;line-height:1.35">Has a clue scanner for a face. Rolls everywhere on one wheel. Does a happy spin when you find the real button.</div></div>
    <div style="height:276px;padding:16px 18px;border-radius:28px;background:linear-gradient(#E9FFD6,#FFF6E6 60%);border:4px solid ${K};box-shadow:0 6px 0 ${K};display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:12px">${Muddler('raspberry', 100)}<div><div class="fd" style="font-weight:700;font-size:30px;line-height:1">Button Muddler</div><div style="font-weight:800;font-size:15px;color:#6A3FBE">Cheeky gremlin</div></div></div>
      <div style="font-weight:700;font-size:15.5px;line-height:1.35">Covered the park in pretend buttons. His hat is three sizes too big. Blows a raspberry every time you press a wrong one.</div></div></div>
  <div style="position:absolute;left:368px;top:100px;right:24px;bottom:22px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(5,minmax(0,1fr));gap:12px">${tiles}</div>
  ${sel ? `<div ${act('bookClose')} style="position:absolute;inset:0;background:rgba(43,33,64,.55);display:grid;place-items:center">
    <div class="card" style="width:600px;padding:30px;border-radius:36px;display:flex;gap:24px;align-items:center;animation:pop .35s cubic-bezier(.3,1.5,.5,1) both">
      ${Btn({ shape: sel[5], color: sel[4], finish: 'shiny', px: 150 })}
      <div style="display:flex;flex-direction:column;gap:8px"><div class="fd" style="font-weight:700;font-size:38px;line-height:1;color:#F2424F">${sel[2]}</div><div class="fd" style="font-weight:700;font-size:30px;line-height:1.05">${sel[1]}</div><div style="font-weight:700;font-size:18px;line-height:1.35">${sel[3]}</div></div></div></div>` : ''}</div>`;
}

function photoHTML() {
  const m = me(), P = player();
  return `<div style="position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 40%,#5A3F86,#2B2140)">
  <div style="position:absolute;inset:0;background:repeating-conic-gradient(rgba(255,226,120,.12) 0 8deg,rgba(255,226,120,0) 8deg 16deg);animation:raysSpin 40s linear infinite"></div>
  <div style="position:absolute;left:150px;top:44px;width:700px;padding:18px 18px 16px;background:#fff;border:5px solid ${K};border-radius:20px;box-shadow:0 12px 0 ${K};rotate:-3deg;display:flex;flex-direction:column;gap:14px;animation:pop .6s cubic-bezier(.3,1.4,.5,1) both">
    <div style="position:relative;height:380px;border-radius:10px;overflow:hidden;background:linear-gradient(#8ED2F6,#D6F1FF 60%,#9BDB7A 60%);border:4px solid ${K}">
      <div class="fd" style="position:absolute;left:14px;top:12px;padding:3px 12px;border-radius:10px;background:#F2424F;color:#fff;font-weight:700;font-size:18px">BUTTONLAND · BIG DIPPER</div>
      <div style="position:absolute;left:520px;top:120px">${Muddler('flag', 120)}</div>
      <div style="position:absolute;left:120px;top:110px;rotate:-6deg">${Btn({ shape: m.shape, color: m.color, symbol: m.initial, px: 150 })}</div>
      <div style="position:absolute;left:300px;top:90px;rotate:8deg">${Bip('silly', 170, { still: true })}</div>
      <div style="position:absolute;left:40px;right:40px;bottom:-30px;height:130px;border-radius:70px 70px 0 0;background:linear-gradient(#FF6B78,#F2424F 50%,#C92637);border:5px solid ${K}"><div style="position:absolute;left:10%;right:10%;top:20px;height:22px;border-radius:11px;background:#FFC93C;border:4px solid ${K}"></div></div></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 6px">
      <div class="fd" style="font-weight:700;font-size:44px;line-height:1">${m.name}!</div>
      <div style="display:flex;gap:22px;align-items:center">
        <div class="fd" style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:30px">${Icon('timer', K, 32)}${gFmt(totalTime(P))}</div>
        <div class="fd" style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:30px">${Icon('star', '#FFB400', 34)}${totalStars(P)} / 30</div></div></div></div>
  <div style="position:absolute;left:900px;top:90px;width:390px;display:flex;flex-direction:column;gap:18px">
    <div class="fd" style="font-weight:700;font-size:48px;line-height:1.05;color:#FFF6E6">You rode the Big Dipper!</div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:20px;background:#45C46A;border:4px solid ${K};color:#fff;font-weight:900;font-size:19px">${Icon('camera', '#fff', 30)}Photo saved to ${m.name}'s page</div>
    <div class="cb red" ${act('ride')} style="height:96px;border-radius:48px;box-shadow:0 8px 0 #1A1228;font-size:34px">${Icon('restart', '#fff', 40)}Ride again</div>
    <div style="display:flex;gap:14px">
      <div class="cb" ${act('goMap')} style="flex:1;height:80px;border-radius:40px;background:#FFF6E6;box-shadow:0 7px 0 #1A1228;gap:8px;font-size:24px">${Icon('map', K, 32)}Map</div>
      <div class="cb" ${act('goHome')} style="flex:1;height:80px;border-radius:40px;background:#FFC93C;box-shadow:0 7px 0 #1A1228;gap:8px;font-size:24px">${Icon('home', K, 32)}Home</div></div></div></div>`;
}

/* =====================================================================
   ROOM: HUD (pill, pause, Bip's clue panel, Back out, toast)
   ===================================================================== */
const hudSeen = { panel: false, pause: false, back: false };
let shownCards = new Set();
const liveClues = () => app.game.clues.filter(c => app.found.includes(c.id) && !c.lie && !c.meta);
const fadedIds = () => S.data.settings.easier ? app.game.buttons.filter(b => liveClues().some(c => !c.test(b))).map(b => b.id) : [];

function pillHTML() {
  const g = app.game;
  return `<div style="position:absolute;left:666px;top:12px;transform:translateX(-50%);height:66px;padding:0 20px 0 8px;display:flex;align-items:center;gap:14px;background:#FFF6E6;border:4px solid ${K};border-radius:34px;box-shadow:0 5px 0 ${K};white-space:nowrap">
    ${Btn({ shape: 'circle', color: 'red', symbol: g.n, px: 50 })}<div class="fd" style="font-weight:600;font-size:22px">${g.R.name}</div>
    <div style="width:4px;height:36px;border-radius:2px;background:#E4D3B6"></div>
    <div class="fd" style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:26px;font-variant-numeric:tabular-nums;min-width:86px">${Icon('timer', K, 28)}${gFmt(app.time)}</div>
    <div style="width:4px;height:36px;border-radius:2px;background:#E4D3B6"></div>
    <div style="display:flex;gap:2px">${starIcons(app.stars, 32)}</div>
    <div style="width:4px;height:36px;border-radius:2px;background:#E4D3B6"></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:1px"><div class="fd" style="font-weight:600;font-size:13px;line-height:1;color:#6A5A7C">ROUND</div>${pips(24)}</div></div>`;
}
function cardHTML(c, fibFound) {
  const seen = shownCards.has(c.id); shownCards.add(c.id);
  const na = seen ? ' noanim' : '';
  if (c.lie) return `<div class="clue lie${fibFound ? ' struck' : ''}${na}">${Chip({ kind: 'muddler', px: 46 })}<div class="t">${partsHTML(c.parts)}</div>${fibFound ? `<div class="fibstamp${c._stamped ? ' noanim' : ''}">FIB!</div>` : ''}</div>`;
  if (fibFound) c._stamped = true;
  return `<div class="clue normal${na}">${Chip({ kind: c.chip.kind, value: c.chip.value ?? '', height: c.chip.height ?? '', not: !!c.chip.not, px: 46 })}<div class="t">${partsHTML(c.parts)}</div></div>`;
}
function renderHud() {
  if (app.screen !== 'room' || !app.game) { elHud.innerHTML = ''; return; }
  const g = app.game, ph = app.phase, st = app.step, ov = app.overlay, cOn = ph === 'controls';
  const showPill = ph !== 'intro' && ov !== 'win' && ov !== 'mixup', showPanel = showPill;
  const showPause = (ph === 'play' || (cOn && st >= 4)) && !ov;
  const showBack = (ph === 'play' && !!app.zoom && !ov && !app.walking) || (cOn && st === 3);
  let h = '';
  if (showPill) h += `<div id="pill" class="pe0">${pillHTML()}</div>`;
  const pauseHTML = showPause ? `<div class="cb sq" ${act('pause')} style="flex:none;margin-left:auto;width:66px;height:66px;border-radius:22px;${hudSeen.pause ? '' : 'animation:pop .45s cubic-bezier(.3,1.6,.5,1) both'}">${Icon('pause', K, 30)}Pause</div>` : '<div style="flex:none;margin-left:auto;width:66px;height:66px"></div>';
  hudSeen.pause = showPause;
  if (showPanel) {
    const fibFound = g.clues.some(c => c.meta && app.found.includes(c.id));
    const cards = app.found.slice().reverse().map(id => g.clues.find(x => x.id === id)).filter(Boolean).map(c => cardHTML(c, fibFound)).join('');
    h += `<div id="panel" style="position:absolute;right:14px;top:10px;height:670px;width:292px;border-radius:30px;background:#FFF6E6;border:4px solid ${K};box-shadow:0 6px 0 ${K};display:flex;flex-direction:column;${hudSeen.panel ? '' : 'animation:cardIn .6s cubic-bezier(.3,1.2,.5,1) both'}">
      <div style="height:86px;flex:none;display:flex;align-items:center;gap:8px;padding:0 9px 0 6px;border-bottom:4px dashed #E4D3B6">
        <div style="flex:none;${hudSeen.panel ? '' : 'animation:rollIn .9s .2s cubic-bezier(.3,1.1,.5,1) both'}">${Bip(app.bipMood, 64)}</div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div class="fd" style="font-weight:700;font-size:22px;line-height:1;white-space:nowrap">Bip's clues</div>
          <div style="display:flex;align-items:center;gap:5px;font-weight:900;font-size:16px;color:#6A5A7C">${Icon('spark', '#E9A21A', 18)}${app.found.length} of ${g.clues.length} found</div></div>${pauseHTML}</div>
      <div class="cards">${cards}</div></div>`;
  }
  hudSeen.panel = showPanel;
  if (showBack) h += `<div class="cb" ${act('backOut')} style="position:absolute;left:20px;bottom:20px;height:84px;padding:0 30px 0 20px;border-radius:42px;background:#FFC93C;box-shadow:0 7px 0 ${K};font-size:28px;${hudSeen.back ? '' : 'animation:pop .4s cubic-bezier(.3,1.6,.5,1) both'}">${Icon('zoomout', K, 44)}Back out</div>`;
  hudSeen.back = showBack;
  if (app.toast) h += `<div class="fd pe0" style="position:absolute;left:505px;top:96px;transform:translateX(-50%);padding:12px 22px;border-radius:26px;background:#fff;border:4px solid ${K};box-shadow:0 5px 0 ${K};display:flex;align-items:center;gap:10px;font-weight:600;font-size:22px;white-space:nowrap;${app.toast.seen ? '' : 'animation:toastIn .35s both'}">${Icon('spark', '#E9A21A', 26)}${app.toast.text}</div>`;
  if (app.toast) app.toast.seen = true;
  elHud.innerHTML = h;
}
const renderPill = () => { const p = $('pill'); if (p) p.innerHTML = pillHTML(); };

/* =====================================================================
   ROOM: overlays (intro, controls intro, inspect, mix-up, win, wrong, free clue, pause, walking)
   ===================================================================== */
let ovKey = '', prev = null;
function renderOv(force) {
  if (app.screen !== 'room' || !app.game) { if (prev) { prev.dispose(); prev = null; } elOv.innerHTML = ''; ovKey = ''; return; }
  const key = [app.phase, app.step, app.overlay, app.mixStep, app.sel, app.walking, app.loading, app.overlay === 'wrong' ? app.gag + app.wrong : ''].join('|');
  const wasIntro = ovKey.startsWith('intro|');
  const same = key === ovKey; ovKey = key;
  // intro: the room card stays put (no re-slam); only the CLUNK / Muddler beats swap underneath it
  if (!same && app.phase === 'intro' && wasIntro && $('introStep')) { $('introStep').innerHTML = introStepHTML(); return; }
  if (prev && !(app.overlay === 'inspect' && same)) { prev.dispose(); prev = null; }
  if (same && (app.overlay === 'inspect' || !force)) return;   // nothing changed: leave it (and its animations) alone
  elOv.innerHTML = ovHTML();
  elOv.classList.toggle('same', same);
  if (app.overlay === 'inspect' && ctl) { const b = app.game.buttons.find(x => x.id === app.sel), el = $('prevHost'); if (b && el) prev = ctl.preview(el, { shape: b.shape, color: b.color, finish: b.finish, sym: b.symType === 'none' ? '' : String(b.sym) }); }
}
function introStepHTML() {
  const st = app.step;
  return `
      ${st === 0 ? `<div class="sfxword" style="position:absolute;left:140px;top:360px;animation:pop .5s .45s cubic-bezier(.3,1.6,.5,1) both;font-size:92px;rotate:-8deg">CLUNK!</div>` : ''}
      ${st === 1 ? `<div style="position:absolute;left:560px;top:410px;animation:popUp .6s cubic-bezier(.3,1.4,.5,1) both">${Muddler('wave', 200)}</div>${speech('Hee hee! Only one is real… good luck!', 'left:760px;top:410px;max-width:260px', 'animation:pop .4s .3s both')}` : ''}
      ${st === 2 ? `<div style="position:absolute;left:560px;top:410px;animation:runOff 1s ease-in both">${Muddler('run', 200)}</div>` : ''}
`;
}
function ovHTML() {
  const g = app.game, R = g.R, ph = app.phase, st = app.step, ov = app.overlay, m = me();
  let h = '';
  if (app.loading && ph !== 'intro') h += `<div class="pe0" style="position:absolute;left:0;top:0;bottom:0;right:316px;display:grid;place-items:center"><div class="fd pill" style="display:flex;align-items:center;gap:16px;padding:18px 30px 18px 18px;border-radius:30px;box-shadow:0 6px 0 ${K};font-weight:700;font-size:28px">${Bip('think', 80)}Building the ${R.name}…</div></div>`;
  if (ph === 'intro') {
    h += `<div ${act('skipIntro')} style="position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(43,33,64,.15),rgba(43,33,64,.6));cursor:pointer">
      <div style="position:absolute;left:50%;top:120px;width:640px;margin-left:-320px;animation:slam .8s cubic-bezier(.3,.9,.4,1) both">
        <div class="card" style="padding:26px 34px;border-radius:36px;display:flex;gap:22px;align-items:center">${Btn({ shape: 'circle', color: 'red', symbol: g.n, px: 104 })}
          <div style="display:flex;flex-direction:column;gap:4px"><div class="fd" style="font-weight:600;font-size:22px;color:#F2424F">Room ${g.n} of 10</div>
            <div class="fd" style="font-weight:700;font-size:50px;line-height:1">${R.name}</div>
            <div style="font-weight:800;font-size:19px">${g.buttons.length} buttons. Only 1 is real… each time!</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:4px">${pips(30)}<div class="fd" style="font-weight:600;font-size:20px">Find it 3 times to escape</div></div></div></div></div>
      <div id="introStep">${introStepHTML()}</div>
      <div class="fd" style="position:absolute;right:24px;bottom:22px;height:48px;padding:0 18px;border-radius:24px;background:rgba(255,246,230,.92);border:3px solid ${K};display:flex;align-items:center;gap:8px;font-weight:600;font-size:18px">${Icon('skip', K, 22)}Tap to skip</div></div>`;
  }
  if (ph === 'controls') {
    const A = 'animation:labelInOut 1.7s ease both';
    h += `<div ${act('skipControls')} style="position:absolute;inset:0;cursor:pointer">
      ${st === 0 ? `<div style="position:absolute;right:322px;top:160px;${A};display:flex;align-items:center"><div class="label">Bip's clues</div><div style="width:0;height:0;border-left:22px solid ${K};border-top:16px solid transparent;border-bottom:16px solid transparent"></div></div>` : ''}
      ${st === 1 ? `<div style="position:absolute;left:505px;top:420px;width:0;height:0"><div style="position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.75);border:5px solid ${K};animation:finger 1.6s ease-in-out infinite"></div><div style="position:absolute;left:-150px;top:62px;width:300px;display:flex;justify-content:center;${A}"><div class="label">${Icon('turn', '#FFF6E6', 32)}Drag to turn</div></div></div>` : ''}
      ${st === 2 ? `<div style="position:absolute;left:505px;top:300px;width:0;height:0"><div style="position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;border:6px solid #fff;animation:ripple 1s ease-out infinite"></div><div style="position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.85);border:5px solid ${K}"></div><div style="position:absolute;left:-200px;top:54px;width:400px;display:flex;justify-content:center;${A}"><div class="label">${Icon('tap', '#FFF6E6', 32)}Tap a wall to look closer</div></div></div>` : ''}
      ${st === 3 ? `<div style="position:absolute;left:24px;bottom:124px;${A};display:flex;flex-direction:column;align-items:flex-start"><div class="label">Back out</div><div style="margin-left:60px;width:0;height:0;border-top:20px solid ${K};border-left:16px solid transparent;border-right:16px solid transparent"></div></div>` : ''}
      ${st === 4 ? `<div style="position:absolute;right:96px;top:28px;${A};display:flex;align-items:center"><div class="label">Pause</div><div style="width:0;height:0;border-left:22px solid ${K};border-top:16px solid transparent;border-bottom:16px solid transparent"></div></div>` : ''}</div>`;
  }
  if (ov === 'inspect') {
    const sb = g.buttons.find(b => b.id === app.sel);
    if (sb) {
      const lmId = sb.on || sb.inD || sb.near, L = lmId && (g.lms.find(l => l.id === lmId) || g.drs.find(d => d.id === lmId));
      const symCap = sb.symType === 'none' ? 'Nothing on it' : sb.symType === 'letter' ? 'Letter ' + sb.sym : sb.symType === 'number' ? 'Number ' + sb.sym : CAPW(sb.sym);
      const chips = [{ kind: 'colour', value: sb.color, cap: CAPW(sb.color) }, { kind: 'shape', value: sb.shape, cap: CAPW(sb.shape) }, { kind: 'symbol', value: sb.symType === 'none' ? 'blank' : String(sb.sym), cap: symCap },
        { kind: 'size', value: sb.size, cap: CAPW(sb.size) }, { kind: 'finish', value: sb.finish, cap: CAPW(FIN_TXT[sb.finish]) },
        { kind: 'position', value: sb.wall, height: sb.wall === 'floor' ? '' : sb.high ? 'high' : 'low', cap: sb.wall === 'floor' ? 'On the floor' : CAPW(sb.wall) + ' wall, ' + (sb.high ? 'high' : 'low') }];
      if (L && L.name) chips.push({ kind: 'landmark', value: L.color, cap: (sb.inD ? 'Inside ' : sb.on ? 'On ' : 'Next to ') + L.name });
      h += `<div style="position:absolute;left:0;top:0;bottom:0;right:316px;background:rgba(43,33,64,.55)">
        <div class="card" style="position:absolute;left:40px;top:96px;width:940px;height:560px;border-radius:40px;display:flex;animation:pop .35s cubic-bezier(.3,1.4,.5,1) both;rotate:0deg">
          <div style="width:380px;flex:none;display:grid;place-items:center;position:relative">
            <div style="position:absolute;left:40px;top:70px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,#FFF0B8,#FFE08A 55%,rgba(255,224,138,0) 70%)"></div>
            <div style="position:absolute;left:90px;top:330px;width:200px;height:34px;border-radius:50%;background:rgba(59,42,74,.18)"></div>
            <div id="prevHost" style="position:relative;width:340px;height:340px;margin-top:-50px"></div>
            <div class="fd" style="position:absolute;left:30px;bottom:30px;right:10px;font-weight:600;font-size:18px;color:#8A7A9C;text-align:center">Turning slowly so you can check it</div></div>
          <div style="flex:1;padding:34px 36px 30px 10px;display:flex;flex-direction:column;gap:18px">
            <div class="fd" style="font-weight:700;font-size:42px;line-height:1">Is this the one?</div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 12px">${chips.map(c => `<div style="display:flex;align-items:center;gap:10px;min-width:0">${Chip({ ...c, px: 64 })}<div class="fd" style="font-weight:600;font-size:19px;line-height:1.1">${c.cap}</div></div>`).join('')}</div>
            <div style="flex:1"></div>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px">
              <div class="cb" ${act('closeInspect')} style="height:84px;padding:0 30px 0 22px;border-radius:42px;background:#FFFFFF;font-size:26px">${Icon('close', K, 36)}Not this one</div>
              <div id="pressBtn" class="fd" ${act('press')} style="width:176px;height:176px;margin:-50px -60px -60px 0;border-radius:50%;background:radial-gradient(circle at 38% 30%,#FF9AA2,#F2424F 45%,#C92637);border:6px solid ${K};box-shadow:0 12px 0 ${K};transition:transform .12s,box-shadow .12s;display:grid;place-items:center;cursor:pointer;color:#fff;font-weight:700;font-size:40px;letter-spacing:1px;text-shadow:0 3px 0 #9B1B2A">PRESS</div></div></div></div></div>`;
    }
  }
  if (ov === 'mixup') {
    const SW = ['red', 'blue', 'yellow', 'green', 'pink', 'purple', 'orange'], SH = ['circle', 'star', 'heart', 'square', 'hexagon', 'cloud', 'triangle', 'arrow'];
    const left = app.rounds - app.round;
    h += `<div style="position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 55%,rgba(106,63,190,.55),rgba(43,33,64,.85))">
      <div style="position:absolute;left:50%;top:50%;width:1600px;height:1600px;margin:-800px 0 0 -800px;background:repeating-conic-gradient(rgba(197,240,142,.16) 0 9deg,rgba(197,240,142,0) 9deg 18deg);animation:raysSpin 6s linear infinite"></div>`;
    if (app.mixStep === 0) h += `<div class="card" style="position:absolute;left:50%;top:110px;width:560px;margin-left:-280px;padding:26px 30px;border-radius:36px;display:flex;flex-direction:column;align-items:center;gap:14px;animation:pop .45s cubic-bezier(.3,1.5,.5,1) both">
        <div class="fd" style="font-weight:700;font-size:54px;line-height:1;color:#2E9E50">Got one!</div>${pips(46, 'mix')}<div style="font-weight:800;font-size:21px">${left === 1 ? '1 more to go!' : left + ' more to go!'}</div></div>
      <div style="position:absolute;left:90px;top:400px">${Bip('happy', 170, { spin: true })}</div>`;
    else h += Array.from({ length: 16 }, (_, i) => `<div style="position:absolute;left:${80 + (i * 211) % 1100}px;top:${120 + (i * 137) % 420}px;--dx:${((i * 97) % 240) - 120}px;--dy:${((i * 61) % 200) - 100}px;animation:mixSwirl ${(1.6 + (i % 5) * .3).toFixed(1)}s cubic-bezier(.5,0,.5,1) ${((i % 7) * .12).toFixed(2)}s infinite">${Btn({ shape: SH[i % 8], color: SW[i % 7], symbol: i % 3 ? '' : String.fromCharCode(65 + (i * 5) % 26), px: 46 + (i * 13) % 40 })}</div>`).join('') +
      `<div style="position:absolute;left:440px;top:300px;animation:mixSpin 1.2s cubic-bezier(.3,1.4,.5,1) both">${Muddler('giggle', 260)}</div>
      ${speech("Hee hee! I've muddled the whole room up again!", 'left:720px;top:250px;max-width:330px', `font-size:28px;border-radius:26px 26px 26px 6px;box-shadow:0 6px 0 ${K};animation:pop .4s .5s both`)}
      <div class="fd" style="position:absolute;left:50%;top:40px;transform:translateX(-50%);margin-left:-160px;padding:12px 30px;border-radius:32px;background:#8BD45A;border:5px solid ${K};box-shadow:0 6px 0 ${K};font-weight:700;font-size:40px;white-space:nowrap;animation:pop .45s cubic-bezier(.3,1.6,.5,1) both;display:flex;align-items:center;gap:14px">MUDDLE!${pips(30, 'mix')}</div>
      <div class="cb red" ${act('nextRound')} style="position:absolute;left:50%;bottom:38px;margin-left:-160px;transform:translateX(-50%);height:96px;padding:0 34px 0 22px;border-radius:48px;box-shadow:0 8px 0 #1A1228;gap:14px;font-size:34px;animation:pop .45s 1.1s cubic-bezier(.3,1.6,.5,1) both">${Icon('magnify', '#fff', 40)}Round ${app.round + 1} of ${app.rounds}!</div>`;
    h += `</div>`;
  }
  if (ov === 'win') {
    const nx = g.n < 10 ? ROOMS[g.n].name : 'the Big Dipper';
    h += `<div style="position:absolute;inset:0;overflow:hidden">
      <div style="position:absolute;left:50%;top:50%;width:1800px;height:1800px;margin:-900px 0 0 -900px;background:repeating-conic-gradient(rgba(255,226,120,.38) 0 10deg,rgba(255,226,120,0) 10deg 20deg);animation:raysSpin 14s linear infinite"></div>
      <div class="pe0" style="position:absolute;inset:0;background:radial-gradient(circle at 70% 50%,rgba(255,255,255,.9),rgba(255,255,255,0) 50%);animation:flash .5s ease-in-out 4;opacity:0"></div>
      <div class="card" style="position:absolute;left:50%;top:92px;width:600px;margin-left:-300px;padding:30px 34px;border-radius:40px;display:flex;flex-direction:column;align-items:center;gap:14px;animation:pop .5s cubic-bezier(.3,1.5,.5,1) both">
        <div class="fd" style="font-weight:700;font-size:56px;line-height:1;color:#F2424F">You escaped!</div>
        <div style="display:flex;align-items:center;gap:10px">${pips(34)}<div style="font-weight:800;font-size:20px">3 real buttons found. The door to ${nx} is open.</div></div>
        <div style="display:flex;gap:10px">${[1, 2, 3].map(k => `<div style="animation:starPop .6s cubic-bezier(.3,1.5,.5,1) both;animation-delay:${0.3 + k * 0.25}s">${Icon('star', k <= app.stars ? '#FFB400' : '#E4D3B6', 88, 3)}</div>`).join('')}</div>
        <div style="display:flex;align-items:center;gap:14px"><div class="fd" style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:34px">${Icon('timer', K, 36)}${gFmt(app.time)}</div>
          ${app.newBest ? `<div class="fd" style="padding:4px 14px;border-radius:14px;background:#F2424F;color:#fff;border:3px solid ${K};font-weight:700;font-size:20px;rotate:-4deg">New best!</div>` : ''}</div>
        <div style="display:flex;gap:16px;margin-top:8px">
          <div class="cb" ${act('goMap')} style="height:84px;padding:0 26px 0 20px;border-radius:42px;background:#fff;gap:10px;font-size:26px">${Icon('map', K, 36)}Park map</div>
          <div class="cb red" ${act('nextRoom')} style="height:84px;padding:0 26px 0 30px;border-radius:42px;gap:10px;font-size:28px">${g.n < 10 ? 'Next room' : 'Ride the Big Dipper!'}${Icon('next', '#fff', 36)}</div></div></div>
      <div style="position:absolute;left:60px;top:420px">${Bip('happy', 190, { spin: true })}</div>
      <div style="position:absolute;left:760px;top:470px;animation:runOff 1.4s .6s ease-in both">${Muddler('run', 160)}</div></div>`;
  }
  if (ov === 'wrong') {
    const G = GAGS.find(x => x[0] === app.gag) || GAGS[0], mud = GAG.MUD[app.gag] || ['giggle'];
    h += `<div ${act('afterWrong')} style="position:absolute;inset:0;overflow:hidden;cursor:pointer">
      <div class="pe0" style="position:absolute;inset:0">${GAG.art(app.gag)}</div>
      <div class="sfxword" style="position:absolute;left:560px;top:230px;animation:pop .45s .5s cubic-bezier(.3,1.6,.5,1) both;font-size:96px;rotate:8deg">${G[2]}</div>
      <div class="pill" style="position:absolute;left:50%;top:96px;transform:translateX(-50%);margin-left:-160px;display:flex;align-items:center;gap:14px;padding:12px 24px 12px 14px;border-radius:30px;box-shadow:0 6px 0 ${K};animation:pop .5s .9s cubic-bezier(.3,1.5,.5,1) both;white-space:nowrap">
        <div style="width:58px;height:58px;border-radius:18px;background:#FFC93C;border:4px solid ${K};display:grid;place-items:center">${Icon('book', K, 36)}</div>
        <div style="display:flex;flex-direction:column;gap:2px"><div style="font-weight:900;font-size:15px;color:#F2424F;letter-spacing:.5px">${app.gagNew ? 'NEW! ADDED TO YOUR BUTTON BOOK' : 'ALREADY IN YOUR BUTTON BOOK'}</div><div class="fd" style="font-weight:700;font-size:28px;line-height:1">${G[1]}</div></div></div>
      ${app.starLost ? `<div style="position:absolute;left:640px;top:14px;animation:starFall 1.2s .3s ease-in both">${Icon('star', '#FFB400', 46)}</div><div class="fd" style="position:absolute;left:600px;top:84px;padding:2px 12px;border-radius:12px;background:${K};color:#fff;font-weight:700;font-size:22px;animation:pop .4s .4s both">−1 star</div>` : ''}
      <div class="pe0" style="position:absolute;inset:0;animation:popUp .6s .7s cubic-bezier(.3,1.4,.5,1) both"><div style="position:absolute;left:40px;bottom:-20px">${Muddler(mud[0], 200, mud[1] || {})}</div>${GAG.MUD_PROP[app.gag] || ''}</div>
      ${speech('Hee hee hee! Wrong one!', 'left:236px;bottom:150px', 'font-size:26px;animation:pop .4s 1.1s both;white-space:nowrap')}
      <div class="fd" style="position:absolute;left:505px;bottom:22px;transform:translateX(-50%);height:48px;padding:0 18px;border-radius:24px;background:rgba(255,246,230,.92);border:3px solid ${K};display:flex;align-items:center;gap:8px;font-weight:600;font-size:18px;white-space:nowrap">${Icon('tap', K, 22)}Tap to carry on</div></div>`;
  }
  if (ov === 'offer') h += `<div style="position:absolute;left:0;top:0;bottom:0;right:316px;background:rgba(43,33,64,.5);display:grid;place-items:center">
      <div class="card" style="width:560px;padding:28px;border-radius:36px;display:flex;gap:20px;align-items:center;animation:pop .4s cubic-bezier(.3,1.5,.5,1) both">${Bip('think', 140)}
        <div style="display:flex;flex-direction:column;gap:16px"><div class="fd" style="font-weight:700;font-size:32px;line-height:1.1">Tricky one! Want a free clue?</div>
          <div style="display:flex;gap:12px"><div class="cb" ${act('offerYes')} style="height:72px;padding:0 22px;border-radius:36px;background:#45C46A;color:#fff;border-width:4px;box-shadow:0 5px 0 ${K};gap:8px;font-size:24px">${Icon('spark', '#fff', 28)}Yes please</div>
            <div class="cb" ${act('offerNo')} style="height:72px;padding:0 22px;border-radius:36px;background:#fff;border-width:4px;box-shadow:0 5px 0 ${K};font-size:24px">No thanks</div></div></div></div></div>`;
  if (ov === 'pause') {
    const on = !!S.data.settings.easier;
    h += `<div style="position:absolute;inset:0;background:rgba(43,33,64,.62);display:grid;place-items:center">
      <div class="card" style="width:620px;padding:34px;border-radius:40px;display:flex;flex-direction:column;align-items:center;gap:20px;animation:pop .35s cubic-bezier(.3,1.5,.5,1) both">
        <div style="display:flex;align-items:center;gap:16px">${Bip('idle', 90)}<div class="fd" style="font-weight:700;font-size:58px">Paused</div></div>
        <div class="cb red" ${act('resume')} style="width:100%;height:100px;border-radius:50px;box-shadow:0 8px 0 ${K};gap:14px;font-size:40px">${Icon('play', '#fff', 42)}Keep playing</div>
        <div class="cb" ${act('easier')} style="width:100%;height:92px;padding:0 16px 0 20px;border-radius:30px;background:${on ? '#DFF7E6' : '#FFFFFF'};gap:14px;justify-content:flex-start;transition:background .25s">
          ${Icon('bulb', K, 42)}
          <div style="flex:1;display:flex;flex-direction:column;gap:2px"><div class="fd" style="font-weight:700;font-size:30px;line-height:1">Make it easier</div><div style="font-family:Nunito,sans-serif;font-weight:800;font-size:16px;color:#5B4B6E">Greys out buttons your clues rule out</div></div>
          <div style="position:relative;width:118px;height:62px;flex:none;border-radius:31px;background:${on ? '#45C46A' : '#E4D3B6'};border:4px solid ${K};transition:background .25s">
            <div style="position:absolute;top:4px;left:${on ? 60 : 4}px;width:46px;height:46px;border-radius:50%;background:#FFFFFF;border:4px solid ${K};transition:left .25s cubic-bezier(.3,1.4,.5,1);display:grid;place-items:center">${on ? Icon('check', '#2E9E50', 24, 7) : ''}</div>
            <div class="fd" style="position:absolute;top:0;bottom:0;left:${on ? 14 : 56}px;display:flex;align-items:center;font-weight:700;font-size:18px;color:${on ? '#FFFFFF' : '#6A5A7C'}">${on ? 'ON' : 'OFF'}</div></div></div>
        <div style="display:flex;gap:16px;width:100%">
          <div class="cb" ${act('restart')} style="flex:1;height:84px;border-radius:42px;background:#FFC93C;gap:10px;font-size:25px">${Icon('restart', K, 36)}Restart room</div>
          <div class="cb" ${act('goMap')} style="flex:1;height:84px;border-radius:42px;background:#fff;gap:10px;font-size:25px">${Icon('map', K, 36)}Park map</div></div></div></div>`;
  }
  if (app.walking) h += `<div style="position:absolute;inset:0;background:#FFF8E0;animation:fadeWhite .8s ease-in both"></div>`;
  return h;
}

/* =====================================================================
   ROOM: the 3D controller (room3d.js)
   ===================================================================== */
let ctl = null, ctlN = 0, roomMod = null, glToken = 0;
const L = (g, id) => g.lms.find(l => l.id === id) || g.drs.find(d => d.id === id);
const btnSpec = g => g.buttons.map(b => ({ id: b.id, wall: b.wall, x: b.x, y: b.y, depth: b.inD ? L(g, b.inD).dz : b.on ? L(g, b.on).depth : 0, shape: b.shape, color: b.color, finish: b.finish, size: b.size, sym: b.symType === 'none' ? '' : String(b.sym), mi: b.on ? L(g, b.on).mi : null, inD: !!b.inD }));
const thingSpec = g => g.things.map(t => ({ id: t.id, type: t.type, wall: t.wall, x: t.x, y: t.y, depth: t.inD ? L(g, t.inD).dz + .02 : t.on ? L(g, t.on).depth : 0, inD: !!t.inD, mi: t.on ? L(g, t.on).mi : null }));
function killGL() { glToken++; if (prev) { prev.dispose(); prev = null; } if (ctl) { ctl.dispose(); ctl = null; } ctlN = 0; }
async function attachGL(g) {
  const tok = ++glToken; app.loading = true;
  try {
    if (!roomMod) roomMod = await import('./room3d.js');
    const LY = layoutRoom(g.R), R = g.R;
    const room = { easy: false, dims: R.dims, doorRect: LY.door, windows: LY.wins, outside: R.outside, dark: R.dark, ground: R.ground, fill: R.fill, wall: R.wall, floor: R.floor, ceil: R.ceil, slab: R.slab, models: R.models,
      drawers: g.drs.map(d => ({ id: d.id, wall: d.wall, node: d.node, axis: d.axis, amt: d.amt })), buttons: btnSpec(g), things: thingSpec(g) };
    const c = await roomMod.createRoom(elGl, { room, baseURL: new URL('assets/', document.baseURI).href, onTap: onGLTap });
    if (tok !== glToken) { c.dispose(); return; }
    ctl = c; ctlN = g.n; c.game = g;
  } catch (err) { console.error('3D room failed', err); }
  if (tok === glToken) { app.loading = false; syncGL(); renderOv(); }
}
function syncGL() {
  const g = app.game;
  if (app.screen !== 'room' || !g) { if (ctl || app.loading) killGL(); app.loading = false; return; }
  if (!ctl) { if (!app.loading || ctlN !== g.n) { ctlN = g.n; attachGL(g); } return; }
  if (ctl.game !== g) {
    if (ctlN === g.n) { ctl.setRound(btnSpec(g), thingSpec(g)); ctl.game = g; }  // same furniture, new buttons
    else { killGL(); ctlN = g.n; attachGL(g); return; }
  }
  pushGL();
}
function pushGL() {
  if (!ctl || !app.game) return;
  ctl.setView({ easy: !!S.data.settings.easier, zoom: app.zoom, sel: app.overlay === 'inspect' ? app.sel : null, faded: fadedIds(), taken: app.taken, open: app.open, doorOpen: app.doorOpen, walking: app.walking, interactive: app.phase === 'play' && !app.overlay });
}
function onGLTap(i) {
  const g = app.game; if (!g || app.phase !== 'play' || app.overlay) return;
  if (i.type === 'button') { const b = g.buttons.find(x => x.id === i.id); if (b) tapBtn(b); }
  else if (i.type === 'thing') { const t = g.things.find(x => x.id === i.id); if (t) collect(t); }
  else if (i.type === 'drawer') { const d = g.drs.find(x => x.id === i.id); if (d) tapDrawer(d); }
  else if (i.type === 'wall') tapWall(i.wall);
}

/* =====================================================================
   ROOM: flow
   ===================================================================== */
function update() { renderHud(); renderOv(); syncGL(); }
function toast(text, ms) { app.toast = { text }; renderHud(); sfx.toast(); later(() => { app.toast = null; app.bipMood = 'idle'; renderHud(); }, ms || 1900); }

function startRoom(n) {
  clearT();
  const g = genRoom(n, (Date.now() % 100000) + n * 131, player());
  Object.assign(app, { screen: 'room', game: g, round: 1, wrongRound: 0, mixStep: 0, found: g.initial.slice(), taken: [], open: [], wrong: 0, stars: 3, time: 0,
    phase: 'intro', step: 0, zoom: null, overlay: null, sel: null, pressing: false, doorOpen: false, walking: false, toast: null, bipMood: 'idle', newBest: false });
  shownCards = new Set(); hudSeen.panel = hudSeen.pause = hudSeen.back = false;
  renderScreen(); update();
  elGl.style.animation = 'shake .5s .5s both'; later(() => { elGl.style.animation = ''; }, 1100);
  sfx.clunk(); later(() => sfx.clunk(), 500);
  scheduleIntro(0);
}
function scheduleIntro(from) {
  if (from < 1) later(() => { app.step = 1; sfx.giggle(); renderOv(); }, 1300);
  if (from < 2) later(() => { app.step = 2; sfx.whoosh(); renderOv(); }, from < 1 ? 2700 : 1300);
  later(endIntro, from < 1 ? 3600 : 2300);
}
function endIntro() {
  clearT();
  if (!seenControls) { seenControls = true; app.phase = 'controls'; app.step = 0; update(); scheduleControls(0); }
  else { app.phase = 'play'; update(); }
}
function scheduleControls(from) {
  for (let i = from + 1; i <= 4; i++) later(() => { app.step = i; update(); }, (i - from) * 1700);
  later(() => { app.phase = 'play'; update(); }, (5 - from) * 1700);
}
function tapWall(w) { if (app.zoom) return; app.zoom = w; sfx.zoom(); update(); }
function tapBtn(b) {
  if (!app.zoom) { app.zoom = b.wall === 'floor' ? 'floor' : b.wall; sfx.zoom(); update(); return; }
  app.overlay = 'inspect'; app.sel = b.id; app.pressing = false; sfx.tap(); update();
}
function tapDrawer(d) {
  if (!app.zoom) { app.zoom = d.wall; sfx.zoom(); update(); return; }
  app.open = app.open.includes(d.id) ? app.open.filter(x => x !== d.id) : [...app.open, d.id]; sfx.drawer(); update();
}
function collect(t) {
  if (app.taken.includes(t.id)) return;
  app.taken = [...app.taken, t.id]; app.found = [...app.found, t.clue]; app.bipMood = 'wow';
  sfx.clue(); toast(THING_SAY[t.type]); update();
}
function press() {
  if (app.pressing) return; app.pressing = true;
  const pb = $('pressBtn'); if (pb) { pb.style.transform = 'translateY(10px) scale(.96)'; pb.style.boxShadow = `0 2px 0 ${K}`; }
  if (prev) prev.setPressed(true);
  sfx.squish(); sfx.press();
  later(() => { app.sel === app.game.target.id ? foundOne() : wrongPress(); }, 480);
}
function foundOne() {
  if (app.round >= app.rounds) { win(); return; }
  Object.assign(app, { overlay: 'mixup', mixStep: 0, pressing: false, sel: null, zoom: null, bipMood: 'happy' });
  sfx.got(); update();
  later(muddle, 1700);
}
function muddle() {
  if (app.overlay !== 'mixup' || app.mixStep >= 1) return;
  const g = app.game, ng = genRoom(g.n, (Date.now() % 100000) + g.n * 131 + app.round * 7919, player());
  Object.assign(app, { mixStep: 1, game: ng, found: ng.initial.slice(), taken: [], open: [] });
  sfx.muddle(); update();
}
function nextRound() {
  if (app.mixStep < 1) muddle();
  clearT();
  Object.assign(app, { round: app.round + 1, wrongRound: 0, overlay: null, mixStep: 0, sel: null, zoom: null, bipMood: 'idle' });
  shownCards = new Set(); hudSeen.panel = false;
  sfx.tap(); update();
  toast('Round ' + app.round + ' of ' + app.rounds + '. New clues from Bip!', 2200);
}
function win() {
  const g = app.game;
  app.newBest = recordRoom(player(), g.n, app.stars, app.time);
  Object.assign(app, { overlay: 'win', doorOpen: true, pressing: false, bipMood: 'happy', sel: null, zoom: null });
  sfx.win(); for (let k = 1; k <= app.stars; k++) later(() => sfx.star(), 550 + k * 250);
  update();
}
function wrongPress(force) {
  const have = boy().gags;
  let pool = GAGS.map(x => x[0]).filter(x => !have.includes(x));
  if (!pool.length) pool = GAGS.map(x => x[0]);
  const gag = force || pool[Math.floor(Math.random() * pool.length)];
  const isNew = recordGag(player(), gag);
  const lost = app.stars > 1;
  Object.assign(app, { overlay: 'wrong', gag, gagNew: isNew, starLost: lost, stars: Math.max(1, app.stars - 1), wrong: app.wrong + 1, wrongRound: app.wrongRound + 1, pressing: false, sel: null, bipMood: 'oops' });
  sfx.wrong(); later(() => sfx.gag(gag), 150); if (lost) later(() => sfx.lose(), 350); later(() => sfx.giggle(), 1100);
  const fx = GAG.FX[gag];
  if (fx) { elGl.classList.add(fx); later(() => elGl.classList.remove(fx), 2400); }
  update();
  if (!DBG.hold) later(afterWrong, 3800);
}
function afterWrong() {
  if (app.overlay !== 'wrong') return;
  clearT(); elGl.classList.remove('fx-flip', 'fx-sneeze', 'fx-jelly');
  const hidden = app.game.things.filter(t => !app.taken.includes(t.id));
  if (app.wrongRound === 2 && hidden.length) { app.overlay = 'offer'; app.bipMood = 'think'; }
  else { app.overlay = null; app.bipMood = 'idle'; }
  update();
}
function nextRoom() {
  const n = app.game.n; app.walking = true; app.overlay = null; sfx.whoosh(); update();
  setTimeout(() => { if (app.screen !== 'room') return; n < 10 ? startRoom(n + 1) : startRide(0); }, 900);
}

/* =====================================================================
   BIG DIPPER
   ===================================================================== */
let rideCtl = null, rideMod = null, rideTok = 0;
const CAP = { station: 'All aboard! Hold on tight!', lift: 'Clack… clack… clack…', drop: 'WHEEEEEEE!', turn: 'Here come the rooms!', rooms: 'Look! All 10 rooms you escaped!', loop: 'LOOP-THE-LOOP!', swoop: 'Whoosh!', splash: 'SPLOOOSH!', swoop2: 'Faster! Faster!', flag: 'The Muddler gives up!', home: 'Nearly home…', photo: 'Say cheese!' };
const RP = ['station', 'lift', 'drop', 'turn', 'rooms', 'loop', 'swoop', 'splash', 'swoop2', 'flag', 'home', 'photo'];
function rideHTML() {
  const pct = Math.round(Math.max(0, RP.indexOf(app.ridePhase)) / (RP.length - 1) * 100), cap = CAP[app.ridePhase];
  return `${app.rideLoading ? `<div style="position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(#5DB6EC,#BFE6FF)"><div class="fd pill" style="display:flex;align-items:center;gap:16px;padding:18px 30px 18px 18px;border-radius:30px;box-shadow:0 6px 0 ${K};font-weight:700;font-size:30px">${Bip('wow', 84)}Climbing aboard the Big Dipper…</div></div>` : ''}
  ${!app.rideLoading && cap ? `<div class="fd pill pe0" style="position:absolute;left:50%;top:24px;transform:translateX(-50%);padding:12px 30px;border-radius:32px;border-width:5px;box-shadow:0 6px 0 ${K};font-weight:700;font-size:38px;white-space:nowrap;animation:pop .45s cubic-bezier(.3,1.6,.5,1) both">${cap}</div>` : ''}
  ${app.ridePhase === 'photo' ? `<div class="pe0" style="position:absolute;inset:0;background:#FFFFFF;animation:flash .9s ease-out both"></div>` : ''}
  <div class="pe0" style="position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:420px;height:16px;border-radius:8px;background:rgba(59,42,74,.35);border:3px solid ${K};overflow:hidden"><div style="width:${pct}%;height:100%;background:#FFC93C;transition:width .6s linear"></div></div>
  <div class="cb sq" ${act('skipRide')} style="position:absolute;right:16px;top:10px">${Icon('skip', K, 30)}Skip</div>`;
}
function killRide() { rideTok++; if (rideCtl) { rideCtl.dispose(); rideCtl = null; } }
async function startRide(startAt) {
  clearT(); killGL(); killRide();
  app.game = null; app.screen = 'coaster'; app.rideLoading = true; app.ridePhase = ''; app.rideStart = startAt || 0;
  renderScreen(); sfx.ride();
  const tok = rideTok;
  try {
    if (!rideMod) rideMod = await import('./coaster3d.js');
    const c = await rideMod.createRide(elRide, { baseURL: new URL('assets/', document.baseURI).href, startAt: app.rideStart,
      onPhase: p => { if (tok !== rideTok) return; app.ridePhase = p; if (p === 'drop' || p === 'loop' || p === 'swoop2') sfx.whoosh(); if (p === 'photo') sfx.flash(); if (app.screen === 'coaster') elScreen.innerHTML = rideHTML(); },
      onDone: () => { if (tok === rideTok) toPhoto(); }, onClack: () => sfx.clack(), onSplash: () => sfx.splash() });
    if (tok !== rideTok) { c.dispose(); return; }
    rideCtl = c; app.rideT0 = performance.now();
  } catch (err) { console.error('ride failed', err); }
  app.rideLoading = false; if (app.screen === 'coaster') elScreen.innerHTML = rideHTML();
}
function toPhoto() {
  if (app.screen !== 'coaster') return;
  app.rideSecs = app.rideT0 ? (performance.now() - app.rideT0) / 1000 : 0;
  killRide(); recordPhoto(player()); app.screen = 'photo'; sfx.flash(); renderScreen();
}

/* =====================================================================
   screens + actions
   ===================================================================== */
function renderScreen() {
  const s = app.screen;
  if (s !== 'room') { killGL(); app.game = null; elBd.style.background = 'none'; }
  if (s !== 'coaster') killRide();
  elRide.style.display = s === 'coaster' ? 'block' : 'none'; elGl.style.display = s === 'room' ? 'block' : 'none';
  if (s === 'room') { elScreen.innerHTML = ''; elBd.style.background = app.game.R.bd; }
  else if (s === 'coaster') elScreen.innerHTML = rideHTML();
  else elScreen.innerHTML = s === 'home' ? homeHTML() : s === 'map' ? mapHTML() : s === 'book' ? bookHTML() : photoHTML();
  if (s !== 'room') { elHud.innerHTML = ''; elOv.innerHTML = ''; ovKey = ''; }
}
function go(s) { clearT(); if (s === 'book') app.bookFrom = app.screen === 'book' ? app.bookFrom : app.screen; app.screen = s; app.bookSel = null; renderScreen(); }

const ACT = {
  player: p => { setSetting('player', p); sfx.tap(); renderScreen(); },
  goMap: () => { sfx.tap(); go('map'); },
  goHome: () => { sfx.tap(); go('home'); },
  goBook: () => { sfx.tap(); go('book'); },
  bookBack: () => { sfx.back(); go(['home', 'map'].includes(app.bookFrom) ? app.bookFrom : 'home'); },
  bookSel: id => { if (!boy().gags.includes(id)) { sfx.lose(); return; } app.bookSel = id; sfx.gag(id); renderScreen(); },
  bookClose: () => { app.bookSel = null; renderScreen(); },
  room: n => { sfx.tap(); startRoom(+n); },
  locked: () => sfx.lose(),
  lockedDipper: () => sfx.lose(),
  ride: () => { startRide(0); },
  skipRide: () => toPhoto(),
  skipIntro: () => endIntro(),
  skipControls: () => { clearT(); app.phase = 'play'; update(); },
  pause: () => { app.overlay = 'pause'; sfx.tap(); update(); },
  resume: () => { app.overlay = null; sfx.tap(); update(); },
  easier: () => { setSetting('easier', !S.data.settings.easier); sfx.toggle(S.data.settings.easier); update(); renderOv(true); },
  restart: () => { sfx.tap(); startRoom(app.game.n); },
  backOut: () => { app.zoom = null; sfx.back(); update(); },
  closeInspect: () => { app.overlay = null; app.sel = null; sfx.back(); update(); },
  press: () => press(),
  nextRound: () => nextRound(),
  nextRoom: () => nextRoom(),
  afterWrong: () => afterWrong(),
  offerYes: () => { const t = app.game.things.find(t => !app.taken.includes(t.id)); app.overlay = null; app.bipMood = 'idle'; if (t) collect(t); else update(); },
  offerNo: () => { app.overlay = null; app.bipMood = 'idle'; sfx.tap(); update(); },
};
stage.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || !stage.contains(t)) return;
  const f = ACT[t.dataset.act]; if (f) { e.stopPropagation(); f(t.dataset.arg); }
});

/* timer: runs in play and while inspecting; stops on pause and overlays */
setInterval(() => {
  if (app.screen !== 'room' || app.phase !== 'play' || !app.game) return;
  if (app.overlay && app.overlay !== 'inspect') return;
  if (app.loading) return;
  app.time++; renderPill();
}, 1000);

addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
$('backBtn').addEventListener('click', () => flush());
fit();
loadSave(() => {
  document.fonts.ready.then(() => renderScreen());
  renderScreen();
});

/* debug hook (desktop only; the boys never see it) */
window.__btn = {
  app, S, ROOMS,
  go, room: n => startRoom(n), ride: at => startRide(at || 0), photo: () => { app.screen = 'photo'; renderScreen(); },
  win: () => { if (app.game) { app.round = 3; app.sel = app.game.target.id; foundOne(); } },
  found: () => { if (app.game) { app.sel = app.game.target.id; foundOne(); } },
  wrong: gag => { if (app.game) { clearT(); wrongPress(gag); } },
  target: () => app.game && app.game.target,
  hold: on => { DBG.hold = !!on; },
  tap: (type, id, wall) => onGLTap({ type, id, wall }),
  ctl: () => ctl, skip: () => { if (app.phase === 'intro') endIntro(); if (app.phase === 'controls') ACT.skipControls(); },
  unlockAll: () => { for (const p of PIDS) for (let n = 1; n <= 10; n++) if (!rooms(p)[n]) rooms(p)[n] = { s: 3, t: 99 }; save(); renderScreen(); },
};
