/* ui.js — HTML for every screen, following the Claude Design prototype screen by screen.
 * Pure templates: they read the app model and return markup. Taps carry data-act / data-arg
 * and are dispatched in main.js. */

import { icon } from './icons.js';
import { PL, PIDS, WORLDS, NW, PARS, HAZ, HAZ_PAGES, whereOf, SHOP, RESULT, DIFFS, starsFor, holeHazards, CAP_OVER } from './data.js';
import { HOLES, WORLD_IDS } from './holes.js';
import { S, prof, totalStars, worldStars, diffProg, bestTotal } from './state.js';

const INK = '#0B3640', CREAM = '#FFF6E4', TEAL = '#0F5A63';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const A = (act, arg) => `data-act="${act}"${arg != null ? ` data-arg="${esc(arg)}"` : ''}`;

export const av = (pid, size, fs, border = 4) => { const p = PL[pid];
  return `<div class="avatar blob" style="width:${size}px;height:${size}px;background:${p.color};font-size:${fs}px;border-width:${border}px">${p.letter}</div>`; };
const dot = (pid, size = 26, fs = 15) => `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${PL[pid].color};display:flex;align-items:center;justify-content:center;color:${CREAM};font:700 ${fs}px 'Fredoka',sans-serif;flex:none">${PL[pid].letter}</div>`;
export function rb(act, ic, { size = 72, isz = 36, bg = CREAM, fg = TEAL, label = '', arg = null, lblStyle = '', extra = '' } = {}) {
  return `<div class="rb" ${A(act, arg)}><div class="disc" style="width:${size}px;height:${size}px;background:${bg}">${icon(ic, isz, fg)}${extra}</div>${label ? `<span class="lbl ol2" style="${lblStyle}">${label}</span>` : ''}</div>`;
}
const closeBtn = () => `<div class="close">${rb('closeModal', 'close', { size: 68, isz: 32, fg: INK })}</div>`;
const seg = (opts, cur, act, extraCls = '') => `<div class="seg ${extraCls}">${opts.map(o => `<div class="${o.v === cur ? 'on' : ''}" ${A(act, o.v)}>${o.icon ? icon(o.icon, 28, o.v === cur ? (extraCls ? INK : CREAM) : (extraCls ? CREAM : INK)) : ''}${o.pips ? `<span class="pips">${'<i></i>'.repeat(o.pips)}</span>` : ''}${o.label}</div>`).join('')}</div>`;
const starRow = (n, size = 30, off = 'rgba(11,54,64,.16)') => `<div style="display:flex;gap:4px">${[0, 1, 2].map(k => icon('star', size, k < n ? '#FFC93C' : off)).join('')}</div>`;

/* ---------------- world backdrops (behind the canvas) ---------------- */
export function skyHTML(id) {
  switch (id) {
    case 'jungle': return `<div class="sky-el" style="left:-60px;top:-110px;width:1460px;height:200px;display:flex;justify-content:space-between">${[260, 200, 240, 190, 250, 220].map((w, i) => `<div style="width:${w}px;height:${w - 20}px;border-radius:50%;background:${i % 2 ? '#3A9E52' : '#2F8F4A'};${i % 2 ? 'margin-top:-20px' : ''}"></div>`).join('')}</div>
      <div class="sky-el" style="left:-120px;top:170px;width:760px;height:360px;border-radius:50%;background:#A6DB9D"></div><div class="sky-el" style="left:640px;top:140px;width:860px;height:400px;border-radius:50%;background:#8FCF8E"></div>
      ${[[250, 150, 4], [560, 110, 5], [860, 170, 4.5], [1180, 130, 5.5]].map(([x, h, s]) => `<div class="sky-el" style="left:${x}px;top:60px;width:12px;height:${h}px;border-radius:6px;background:#3E9E4A;transform-origin:50% 0;animation:cgSway ${s}s ease-in-out infinite"><div style="position:absolute;left:-9px;bottom:-12px;width:30px;height:24px;border-radius:50%;background:#6CC56A"></div></div>`).join('')}`;
    case 'pirate': return `<div class="sky-el" style="left:1080px;top:30px;width:120px;height:120px;border-radius:50%;background:#FFE9A0;box-shadow:0 0 70px 20px rgba(255,233,160,.7)"></div>
      <div class="sky-el" style="left:120px;top:60px;display:flex;align-items:flex-end;animation:cgDrift 16s ease-in-out infinite"><div style="width:90px;height:50px;border-radius:30px;background:#fff"></div><div style="width:110px;height:80px;border-radius:50%;background:#fff;margin-left:-40px"></div><div style="width:90px;height:46px;border-radius:30px;background:#fff;margin-left:-30px"></div></div>
      <div class="sky-el" style="left:700px;top:110px;display:flex;align-items:flex-end;opacity:.9;animation:cgDrift 22s ease-in-out infinite reverse"><div style="width:70px;height:40px;border-radius:30px;background:#fff"></div><div style="width:90px;height:64px;border-radius:50%;background:#fff;margin-left:-30px"></div></div>`;
    case 'space': return `<div class="sky-el" style="inset:0;background:radial-gradient(#fff 1.2px,transparent 1.8px) 20px 50px/120px 120px;animation:cgTwinkle 4s ease-in-out infinite"></div>
      <div class="sky-el" style="left:1060px;top:24px;width:170px;height:170px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFB3E2,#C77DFF 55%,#7A4BD6);box-shadow:0 0 60px rgba(199,125,255,.5)"></div>
      <div class="sky-el" style="left:995px;top:88px;width:300px;height:48px;border-radius:50%;border:9px solid #FFD37A;transform:rotate(-16deg)"></div>
      <div class="sky-el" style="left:160px;top:60px;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#9DF5EA,#2FB8B0);box-shadow:0 0 30px rgba(79,240,224,.5)"></div>`;
    case 'haunted': return `<div class="sky-el" style="left:190px;top:40px;width:150px;height:150px;border-radius:50%;background:#FFF4D6;box-shadow:0 0 90px 30px rgba(255,244,214,.45)"></div>
      <div class="sky-el" style="left:880px;top:10px;width:340px;height:260px"><div style="position:absolute;left:30px;top:90px;width:280px;height:180px;border-radius:30px 30px 0 0;background:#3A2A5C"></div><div style="position:absolute;left:0;top:30px;width:340px;height:110px;border-radius:50% 50% 18px 18px / 90% 90% 18px 18px;background:#34264F"></div><div style="position:absolute;left:210px;top:-10px;width:80px;height:140px;border-radius:40px 40px 10px 10px;background:#3A2A5C"></div><div style="position:absolute;left:230px;top:30px;width:40px;height:44px;border-radius:20px 20px 8px 8px;background:#FFC857;box-shadow:0 0 24px #FFC857"></div><div style="position:absolute;left:70px;top:150px;width:54px;height:60px;border-radius:26px 26px 10px 10px;background:#FFC857;box-shadow:0 0 24px #FFC857"></div><div style="position:absolute;left:190px;top:150px;width:54px;height:60px;border-radius:26px 26px 10px 10px;background:#E8A73A"></div></div>`;
    default: return '';
  }
}
export const fogHTML = (id) => id === 'haunted' ? `<div style="position:absolute;left:0;top:520px;width:1333px;height:190px;animation:cgDrift 12s ease-in-out infinite"><div style="position:absolute;left:80px;top:40px;width:380px;height:110px;border-radius:50%;background:rgba(200,180,255,.3);filter:blur(22px)"></div><div style="position:absolute;left:520px;top:70px;width:420px;height:120px;border-radius:50%;background:rgba(200,180,255,.26);filter:blur(24px)"></div><div style="position:absolute;left:960px;top:20px;width:360px;height:120px;border-radius:50%;background:rgba(200,180,255,.3);filter:blur(22px)"></div></div>` : '';

/* ---------------- 01 Home ---------------- */
export function home(app) {
  const st = S.data.settings, pnp = st.mode === 'pnp';
  const cards = PIDS.map(id => {
    const p = PL[id], sel = pnp || st.player === id;
    return `<div class="pcard" ${A('pickPlayer', id)} style="height:auto;${sel ? `border-color:${p.color};background:${p.soft};transform:translateY(-4px);box-shadow:0 6px 0 ${p.color}` : ''}">
      ${av(id, 92, 54)}<div class="fd" style="font-weight:600;font-size:28px;line-height:1">${p.name}</div>
      <div style="display:flex;gap:12px;font:800 17px 'Nunito',sans-serif;color:${TEAL}"><span style="display:flex;align-items:center;gap:4px">${icon('star', 20, '#E0A21A')}${totalStars(id)}</span><span style="display:flex;align-items:center;gap:4px">${icon('gem', 20, '#FF4FA3')}${prof(id).gems}</span></div>
      ${sel ? `<div class="selbadge" style="background:${p.color}">${pnp ? (st.player === id ? '1st' : '2nd') : icon('check', 24, CREAM, 6)}</div>` : ''}</div>`;
  }).join('');
  return `<div class="home-shade"></div>
  <div style="position:absolute;left:0;top:0;width:749px;height:690px;display:flex;flex-direction:column;align-items:center">
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <div class="logo home-logo"><span class="ol6" style="color:#FFC93C">Crazy</span><span class="ol6" style="color:${CREAM};margin-left:96px">Golf!</span></div>
    </div>
    <div style="display:flex;gap:30px;justify-content:center;padding-bottom:34px">
      ${rb('go', 'bag', { arg: 'shop', bg: '#FF4FA3', fg: CREAM, label: 'Shop' })}
      ${rb('go', 'trophy', { arg: 'trophies', bg: '#FFC93C', fg: INK, label: 'Trophies' })}
      ${rb('go', 'book', { arg: 'guide', label: 'Guide' })}
    </div>
  </div>
  <div class="panel" style="position:absolute;right:44px;top:56px;width:540px;height:590px;border-radius:38px;box-shadow:0 9px 0 ${INK},0 24px 40px rgba(0,0,0,.25);padding:24px 28px;display:flex;flex-direction:column;gap:16px">
    <div class="fd" style="font-weight:600;font-size:34px;color:${TEAL};text-align:center">Who's playing?</div>
    ${seg([{ v: 'solo', label: 'Solo', icon: 'solo' }, { v: 'pnp', label: 'Caleb vs Ezra', icon: 'duo' }], st.mode, 'setMode')}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;flex:1;margin-bottom:10px">${cards}</div>
    <div class="btn sun" ${A('go', 'map')} style="margin-top:auto;height:86px;font-size:40px">${icon('play', 40, INK)}Play!</div>
  </div>`;
}

/* ---------------- 02 Course map ---------------- */
export function map(app) {
  const pid = app.lead(), my = totalStars(pid);
  let dots = '';
  for (let i = 0; i < NW - 1; i++) {
    const a = WORLDS[i], b = WORLDS[i + 1], ax = a.x + 104, ay = a.y + 72, bx = b.x + 104, by = b.y + 72;
    if (i === 3) { for (let k = 1; k <= 5; k++) dots += `<div class="mdot" style="left:${ax + 150 - 7}px;top:${ay + (by - ay) * k / 6 - 7}px"></div>`; continue; }
    const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let k = 0; k <= 5; k++) { const t = .38 + k * .24 / 5, wob = Math.sin(t * Math.PI) * 18; dots += `<div class="mdot" style="left:${ax + (bx - ax) * t + nx * wob - 7}px;top:${ay + (by - ay) * t + ny * wob - 7}px"></div>`; }
  }
  const isl = WORLDS.map((w, i) => {
    const locked = my < w.need;
    const bests = PIDS.map(id => { const v = bestTotal(id, i); return `<div style="display:flex;align-items:center;gap:5px;background:rgba(11,54,64,.55);border-radius:999px;padding:4px 12px 4px 4px;font:800 17px 'Nunito',sans-serif;color:${CREAM}">${dot(id)}${v ?? '–'}</div>`; }).join('');
    return `<div class="island" ${A('world', i)} style="left:${w.x}px;top:${w.y}px;transform:scale(.8);transform-origin:0 0;${app.shake === i ? 'animation:cgShake .4s' : ''}">
      <div class="isl" style="${locked ? 'filter:saturate(.3) brightness(.78)' : ''}">
        <div class="side" style="background:${w.side}"></div><div class="top" style="background:${w.top}"></div>
        <div class="fw" style="border-color:${w.rim}"></div>
        <div style="position:absolute;left:30px;top:-18px;animation:cgBob 3s ease-in-out infinite">${icon(w.icon1, 70, w.propColor)}</div>
        <div style="position:absolute;left:170px;top:6px;animation:cgBob 3.6s ease-in-out infinite">${icon(w.icon2, 56, w.propColor)}</div>
        <div style="position:absolute;left:132px;top:20px;width:5px;height:58px;border-radius:3px;background:${CREAM}"></div>
        <div style="position:absolute;left:136px;top:20px;width:34px;height:22px;border-radius:4px 20px 16px 4px;background:${w.flag};border:3px solid ${INK}"></div>
      </div>
      ${locked ? `<div class="lockbadge">${icon('lock', 40, CREAM)}</div>` : ''}
      <div class="namepill">${w.name}</div>
      ${locked ? `<div class="darkchip">${icon('star', 22, '#FFC93C')}${w.need - my} more stars to open</div>`
               : `<div style="display:flex;gap:8px;align-items:center"><div class="darkchip">${icon('star', 22, '#FFC93C')}${worldStars(pid, i)}/27</div>${bests}</div>`}
    </div>`;
  }).join('');
  const p = PL[pid];
  return `<div class="sky-map" style="position:absolute;inset:0"></div>
  <div style="position:absolute;left:120px;top:150px;width:1100px;height:120px;border-radius:50%;background:rgba(255,255,255,.05)"></div>
  <div style="position:absolute;left:120px;top:450px;width:1100px;height:120px;border-radius:50%;background:rgba(255,255,255,.05)"></div>
  ${dots}${isl}
  <div class="title-pill" style="background:${CREAM};padding:6px 30px;font-size:30px;color:${TEAL}">Pick a world</div>
  <div style="position:absolute;right:20px;top:16px;display:flex;gap:10px">
    <div style="display:flex;align-items:center;gap:8px;background:${CREAM};border:4px solid ${INK};border-radius:999px;padding:4px 16px 4px 4px;font:600 22px 'Fredoka',sans-serif">${dot(pid, 40, 22)}${app.mode() === 'pnp' ? 'Caleb vs Ezra' : p.name}</div>
    <div style="display:flex;align-items:center;gap:6px;background:${CREAM};border:4px solid ${INK};border-radius:999px;padding:4px 16px 4px 10px;font:600 22px 'Fredoka',sans-serif">${icon('star', 28, '#E0A21A')}${my}</div>
    <div style="display:flex;align-items:center;gap:6px;background:${CREAM};border:4px solid ${INK};border-radius:999px;padding:4px 16px 4px 10px;font:600 22px 'Fredoka',sans-serif">${icon('gem', 28, '#FF4FA3')}${prof(pid).gems}</div>
  </div>
  <div style="position:absolute;left:24px;bottom:22px">${rb('go', 'home', { arg: 'home', size: 68, isz: 34, label: 'Home', lblStyle: 'font-size:18px;text-shadow:none' })}</div>
  <div style="position:absolute;right:24px;bottom:22px">${rb('go', 'book', { arg: 'guide', size: 68, isz: 34, label: 'Guide', lblStyle: 'font-size:18px;text-shadow:none' })}</div>`;
}

/* ---------------- 03 Hole select ---------------- */
export function holes(app) {
  const w = app.world, W = WORLDS[w], pid = app.lead(), my = totalStars(pid), ws = worldStars(pid, w), next = WORLDS[w + 1];
  const note = !next ? 'Last world. Bring the Golden Putter home!' : my >= next.need ? `${next.name} is open!` : `${next.need - my} more stars to open ${next.name}`;
  const tiles = PARS[w].map((par, i) => {
    const b = diffProg(pid).best[w][i], st = starsFor(b, par), played = b != null;
    return `<div class="tile ${played ? '' : 'fresh'}" ${A('pickHole', i)}>
      <div style="display:flex;justify-content:space-between;align-items:center"><div class="numdisc">${i + 1}</div><div class="parchip">Par ${par}</div></div>
      ${played ? `<div style="display:flex;align-items:baseline;gap:8px;font:800 16px 'Nunito',sans-serif;color:${TEAL}">Best<span class="fd" style="font-weight:600;font-size:32px;color:${INK}">${b}</span>${b === 1 ? `<span style="background:#FF4FA3;color:#fff;border-radius:999px;padding:2px 10px;font:600 15px 'Fredoka',sans-serif">Ace!</span>` : ''}</div>`
               : `<div style="display:flex;align-items:center;gap:8px;font:600 26px 'Fredoka',sans-serif">${icon('play', 26, INK)}New hole!</div>`}
      ${starRow(st)}</div>`;
  }).join('');
  return `<div style="position:absolute;inset:0;background:rgba(11,54,64,.35)"></div>
  <div class="panel" style="position:absolute;left:36px;top:72px;width:420px;height:590px;padding:20px;display:flex;flex-direction:column;gap:14px">
    <div style="position:relative;width:370px;height:192px;border-radius:24px;border:4px solid ${INK};overflow:hidden;flex:none;background:#0F5A63 url('${app.thumb(w)}') center/cover"></div>
    <div class="fd" style="font-weight:600;font-size:36px;line-height:1">${W.name}</div>
    <div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font:800 17px 'Nunito',sans-serif;color:${TEAL}"><span>Stars</span><span>${ws} / 27</span></div><div class="bar"><div style="width:${Math.round(ws / 27 * 100)}%"></div></div></div>
    <div style="display:flex;flex-direction:column;gap:8px">${PIDS.map(id => `<div style="display:flex;align-items:center;gap:10px;font:800 18px 'Nunito',sans-serif">${dot(id, 34, 18)}<span style="flex:1">${PL[id].name}</span><span class="fd" style="font-weight:600;font-size:16px;color:${TEAL}">best scores</span><span class="fd" style="font-weight:600;font-size:24px;min-width:40px;text-align:right">${bestTotal(id, w) ?? '–'}</span></div>`).join('')}</div>
    <div style="font:700 16px 'Nunito',sans-serif;color:${TEAL};background:#EEDDB8;border-radius:16px;padding:8px 12px">${note}</div>
    <div ${A('go', 'map')} style="margin-top:auto;display:flex;align-items:center;gap:10px;cursor:pointer;align-self:flex-start" class="rb"><div class="disc" style="width:60px;height:60px;background:${TEAL};border-width:4px;box-shadow:0 5px 0 ${INK}">${icon('map', 30, CREAM)}</div><span class="fd" style="font-weight:600;font-size:22px">Back to map</span></div>
  </div>
  <div style="position:absolute;left:486px;top:72px;right:40px;bottom:36px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:18px">${tiles}</div>`;
}

/* ---------------- 04 Hole intro ---------------- */
export function intro(app) {
  const w = app.world, h = app.hole, hole = HOLES[WORLD_IDS[w]][h], pid = app.player();
  const hz = holeHazards(hole).slice(0, 2), best = diffProg(pid).best[w][h];
  const hazHTML = hz.length ? hz.map(k => { const d = HAZ[k]; return `<div style="flex:1;display:flex;align-items:center;gap:12px;background:#FFFDF7;border:4px solid ${INK};border-radius:24px;padding:8px 14px 8px 8px"><div class="blob" style="width:62px;height:62px;background:${d.color};display:flex;align-items:center;justify-content:center;flex:none">${icon(d.icon, 40, CREAM)}</div><span class="fd" style="font-weight:600;font-size:21px;line-height:1.1">${d.name}</span></div>`; }).join('')
    : `<div style="flex:1;display:flex;align-items:center;gap:12px;background:#FFFDF7;border:4px solid ${INK};border-radius:24px;padding:8px 14px 8px 8px"><div class="blob" style="width:62px;height:62px;background:#8BD94A;display:flex;align-items:center;justify-content:center;flex:none">${icon('sparkle', 40, CREAM)}</div><span class="fd" style="font-weight:600;font-size:21px;line-height:1.1">Nothing! Just walls and a cup</span></div>`;
  const pnp = app.mode() === 'pnp';
  return `<div style="position:absolute;inset:0;background:linear-gradient(rgba(11,54,64,0) 45%,rgba(11,54,64,.6))"></div>
  <div style="position:absolute;left:0;right:0;top:18px;display:flex;flex-direction:column;align-items:center;gap:6px;animation:cgDrop .7s .2s cubic-bezier(.3,1.4,.5,1) both">
    <div style="display:flex;align-items:center;gap:18px"><span class="fd ol5" style="font-weight:700;font-size:84px;color:${CREAM};line-height:1">Hole ${h + 1}</span>
    <div style="width:104px;height:104px;border-radius:50%;background:#FFC93C;border:5px solid ${INK};box-shadow:0 7px 0 ${INK};display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(8deg)"><span style="font:800 15px 'Nunito',sans-serif;letter-spacing:.1em">PAR</span><span class="fd" style="font-weight:700;font-size:46px;line-height:.9">${hole.par}</span></div></div>
    <div style="display:flex;gap:8px;align-items:center"><div class="namepill" style="font-size:22px;padding:4px 18px">${esc(hole.name)}</div>${pnp ? `<div class="namepill" style="font-size:22px;padding:4px 18px 4px 6px;display:flex;align-items:center;gap:8px;background:${PL[pid].color};color:${CREAM}"><div style="width:32px;height:32px;border-radius:50%;background:${CREAM};color:${PL[pid].color};display:flex;align-items:center;justify-content:center;font:700 18px 'Fredoka',sans-serif">${PL[pid].letter}</div>${PL[pid].name}'s go</div>` : ''}</div>
  </div>
  <div class="panel" style="position:absolute;left:36px;bottom:30px;width:600px;border-radius:34px;box-shadow:0 8px 0 ${INK};padding:20px 24px;display:flex;flex-direction:column;gap:16px;animation:cgRise .5s .9s cubic-bezier(.3,1.3,.5,1) both">
    <div style="display:flex;align-items:center;gap:14px"><div style="width:56px;height:56px;border-radius:50%;background:#FFC93C;border:4px solid ${INK};display:flex;align-items:center;justify-content:center;flex:none">${icon('bulb', 30, INK)}</div><div class="fd" style="font-weight:600;font-size:26px;line-height:1.15">${esc(hole.hint)}</div></div>
    <div style="display:flex;flex-direction:column;gap:10px"><div class="cap">Watch out for</div><div style="display:flex;gap:14px">${hazHTML}</div></div>
  </div>
  <div class="panel teal" style="position:absolute;left:660px;bottom:30px;width:330px;height:268px;border-radius:34px;box-shadow:0 8px 0 ${INK};padding:18px 20px;display:flex;flex-direction:column;align-items:center;gap:10px;animation:cgRise .5s 1.1s cubic-bezier(.3,1.3,.5,1) both">
    <div class="cap" style="color:${CREAM};opacity:.85">${PL[pid].name}'s best here</div>
    ${best == null
      ? `<div style="width:110px;height:110px;border-radius:50%;background:#FFC93C;border:5px solid ${INK};display:flex;align-items:center;justify-content:center;animation:cgBob 2.4s ease-in-out infinite">${icon('sparkle', 60, INK)}</div><div class="fd" style="font-weight:600;font-size:30px;line-height:1">New hole!</div><div style="font:700 16px/1.3 'Nunito',sans-serif;text-align:center;opacity:.9">Get it in ${hole.par} or fewer for 2 stars.</div>`
      : `<div style="display:flex;align-items:baseline;gap:8px"><span class="fd" style="font-weight:700;font-size:84px;line-height:.9">${best}</span><span class="fd" style="font-weight:600;font-size:24px">${best === 1 ? 'stroke' : 'strokes'}</span></div>${starRow(starsFor(best, hole.par), 44, 'rgba(255,246,228,.25)')}<div style="font:700 16px/1.3 'Nunito',sans-serif;text-align:center;opacity:.9">${starsFor(best, hole.par) === 3 ? 'Perfect! Can you do it again?' : `Beat it for more stars!`}</div>`}
  </div>
  <div style="position:absolute;right:40px;bottom:30px;width:290px;display:flex;flex-direction:column;gap:18px;animation:cgRise .5s 1.3s cubic-bezier(.3,1.3,.5,1) both">
    <div class="btn sm" ${A('go', 'guide')} style="height:62px;font-size:22px;box-shadow:0 6px 0 ${INK}">${icon('book', 28, TEAL)}Hazard book</div>
    <div class="btn sun glow" ${A('startPlay')} style="height:96px;font-size:36px">${icon('putter', 38, INK)}Let's putt!</div>
  </div>`;
}

/* ---------------- 05 Play HUD ---------------- */
export function hud(app) {
  const pid = app.player(), p = PL[pid], hole = app.holeData;
  const cap = hole.par + CAP_OVER;
  return `<div id="hPill" class="hpill"><div class="row">
      <div class="cell" style="flex:1">${icon('flag', 28, '#E8453C')}<span>Hole ${app.hole + 1}</span></div><div class="div"></div>
      <div class="cell" style="flex:.8;align-items:baseline;gap:6px"><span style="font:800 15px 'Nunito',sans-serif;color:${TEAL}">PAR</span><span style="font-size:28px">${hole.par}</span></div><div class="div"></div>
      <div class="cell" style="flex:1">${icon('putter', 28, TEAL)}<span id="hStrokes" style="font-size:28px">0</span><span style="font:800 14px 'Nunito',sans-serif;color:${TEAL}">of ${cap}</span></div><div class="div"></div>
      <div class="cell" style="flex:.9">${icon('gem', 28, '#FF4FA3')}<span id="hGems" style="font-size:28px">${prof(pid).gems}</span></div>
    </div>${app.mode() === 'pnp' ? `<div class="gotab"><div style="background:${p.color}"><div style="width:30px;height:30px;border-radius:50%;background:${CREAM};color:${p.color};display:flex;align-items:center;justify-content:center;font:700 18px 'Fredoka',sans-serif">${p.letter}</div>${p.name}'s go</div></div>` : ''}
    <div id="lPill" class="hlabel off0" style="left:50%;top:${app.mode() === 'pnp' ? 128 : 92}px;transform:translateX(-50%)">Your hole, par and score</div></div>
  <div id="bPause" class="hudbtn" style="right:22px;top:14px">${rb('pause', 'pause', { size: 70, isz: 32, fg: INK })}</div>
  <div id="lPause" class="hlabel off0" style="right:106px;top:26px;transform-origin:100% 50%">Pause</div>
  <div id="bCam" class="hudbtn" style="right:22px;bottom:18px;width:96px;display:flex;justify-content:center">${rb('cam', app.cam === 'overhead' ? 'camTop' : 'camBehind', { size: 76, isz: 40, bg: TEAL, fg: CREAM, label: app.cam === 'overhead' ? 'Overhead' : 'Behind', lblStyle: 'font-size:18px' })}</div>
  <div id="lCam" class="hlabel off0" style="right:126px;bottom:52px;transform-origin:100% 50%">Camera: tap to switch view</div>
  <div id="hHint" class="hidden"></div>`;
}
/* ---------------- 12 Pause ---------------- */
export function pause(app) {
  const st = S.data.settings;
  return `<div class="scrim"></div>
  <div style="position:absolute;left:236px;top:78px;width:860px;height:560px;background:${TEAL};border:5px solid ${INK};border-radius:42px;box-shadow:0 10px 0 ${INK},0 30px 60px rgba(0,0,0,.35);padding:26px 34px;display:flex;flex-direction:column;gap:22px;animation:cgPop .35s both">
    <div class="fd" style="text-align:center;font-weight:700;font-size:58px;color:${CREAM};line-height:1;text-shadow:0 6px 0 ${INK}">Paused</div>
    <div style="display:flex;gap:28px;flex:1">
      <div style="width:330px;display:flex;flex-direction:column;gap:16px">
        <div class="btn sun" ${A('resume')} style="height:96px;justify-content:flex-start;padding:0 28px;font-size:36px">${icon('play', 40, INK)}Resume</div>
        ${app.mode() === 'pnp' && app.round && app.round.order.length > 1 ? '' : `<div class="btn sm" ${A('restartHole')} style="height:78px;justify-content:flex-start;padding:0 26px;font-size:28px">${icon('restart', 34, TEAL)}Restart hole</div>`}
        <div class="btn sm" ${A('go', 'map')} style="height:78px;justify-content:flex-start;padding:0 26px;font-size:28px">${icon('map', 34, TEAL)}Quit to map</div>
        <div class="btn sm" ${A('go', 'guide')} style="height:78px;justify-content:flex-start;padding:0 26px;font-size:28px">${icon('book', 34, TEAL)}Hazard book</div>
      </div>
      <div style="flex:1;background:${CREAM};border:5px solid ${INK};border-radius:32px;padding:16px 24px;display:flex;flex-direction:column;gap:10px">
        <div class="fd" style="display:flex;align-items:center;gap:10px;font-weight:600;font-size:26px">${icon('sliders', 30, TEAL)}Settings</div>
        <div class="cap" style="margin-top:6px">Camera speed</div>
        <div style="display:flex;align-items:center;gap:10px">
          ${rb('sens', 'minus', { arg: -1, size: 58, isz: 28, bg: TEAL, fg: CREAM })}
          <div style="flex:1;display:flex;gap:6px">${[1, 2, 3, 4, 5].map(k => `<div ${A('sensTo', k)} style="flex:1;height:34px;border-radius:999px;border:4px solid ${INK};background:${k <= st.camSens ? '#FFC93C' : '#EEDDB8'};cursor:pointer"></div>`).join('')}</div>
          ${rb('sens', 'plus', { arg: 1, size: 58, isz: 28, bg: TEAL, fg: CREAM })}
        </div>
        <div style="display:flex;justify-content:space-between;font:700 15px 'Nunito',sans-serif;color:${TEAL};padding:0 70px;margin-top:-6px"><span>Slow</span><span>Fast</span></div>
        <div class="cap">View</div>
        ${seg([{ v: 'ortho', label: 'Flat', icon: 'camTop' }, { v: 'persp', label: '3D', icon: 'camBehind' }], st.projection || 'ortho', 'setProjection')}
      </div>
    </div>
  </div>`;
}

/* ---------------- 07 Hole result ---------------- */
export function result(app) {
  const r = app.lastResult, rv = RESULT[r.type], other = app.nextPlayerName();
  const stars = (size, on, off) => [0, 1, 2].map(k => `<div class="star" style="animation:cgPop .6s ${.45 + k * .28}s cubic-bezier(.3,1.6,.5,1) both">${icon('star', size, k < r.stars ? on : off)}</div>`).join('');
  let top;
  if (r.type === 'hio') {
    const COLS = [CREAM, '#3DB7F0', '#FF4FA3', '#8BD94A', '#9A6BFF', CREAM];
    const letters = 'HOLE IN ONE!'.split('').map((ch, i) => `<span class="fd ol6" style="display:inline-block;font-weight:700;font-size:128px;color:${COLS[i % 6]};animation:cgLetter 1s ${i * .07}s ease-in-out infinite">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    let conf = ''; for (let i = 0; i < 34; i++) { const q = ((i * 37) % 17) / 17, w = 12 + (i % 3) * 8; conf += `<div class="conf" style="left:${(i * 83) % 1333}px;width:${w}px;height:${i % 2 ? w : w * 2}px;background:${['#FF4FA3', '#3DB7F0', '#8BD94A', '#9A6BFF', CREAM, '#FF6B57'][i % 6]};animation:cgFall ${2.6 + q * 2.4}s ${-q * 4}s linear infinite"></div>`; }
    top = `<div class="hio-bg"></div><div class="rays"></div>${conf}
      <div style="position:absolute;left:50%;top:118px;margin-left:-100px;width:200px;height:200px;animation:cgBob 1.2s ease-in-out infinite">
        <div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#EDEDED 55%,#C8C8C8);border:6px solid ${INK};animation:cgWiggle .9s ease-in-out infinite"><div style="position:absolute;left:44px;top:52px;width:44px;height:52px;border-radius:50%;background:#fff;border:5px solid ${INK}"><div style="position:absolute;left:12px;top:14px;width:18px;height:20px;border-radius:50%;background:${INK}"></div></div><div style="position:absolute;left:104px;top:44px;width:50px;height:58px;border-radius:50%;background:#fff;border:5px solid ${INK}"><div style="position:absolute;left:18px;top:22px;width:18px;height:20px;border-radius:50%;background:${INK}"></div></div><div style="position:absolute;left:58px;top:118px;width:84px;height:44px;border-radius:0 0 42px 42px;background:#E8453C;border:5px solid ${INK}"></div></div>
        <div style="position:absolute;left:30px;top:-54px;animation:cgWiggle .6s ease-in-out infinite">${icon('crown', 140, '#FFC93C')}</div></div>
      <div style="position:absolute;left:0;right:0;top:318px;display:flex;justify-content:center;line-height:.88">${letters}</div>
      <div style="position:absolute;left:60px;top:170px;display:flex;flex-direction:column;transform:rotate(-12deg)">${stars(96, CREAM, CREAM)}</div>
      <div style="position:absolute;right:70px;top:150px;transform:rotate(10deg);animation:cgPop .6s 1.2s cubic-bezier(.3,1.5,.5,1) both"><div style="background:#FF4FA3;border:5px solid ${INK};border-radius:30px;box-shadow:0 8px 0 ${INK};padding:14px 24px;display:flex;flex-direction:column;align-items:center;color:${CREAM}"><span class="fd" style="font-weight:700;font-size:54px;line-height:1">+10</span><span class="fd" style="font-weight:600;font-size:22px">bonus gems!</span></div></div>`;
  } else {
    top = `<div class="scrim" style="background:rgba(8,42,49,.45)"></div>
      <div style="position:absolute;left:0;right:0;top:40px;display:flex;flex-direction:column;align-items:center;gap:10px">
        <div class="banner" style="background:${rv[2]}"><span class="fd ol5">${rv[0]}</span></div>
        <div class="fd" style="font-weight:600;font-size:30px;color:${CREAM};text-shadow:0 3px 0 ${INK};animation:cgFade .4s .3s both">${rv[1]}</div>
        <div style="display:flex;gap:18px;margin-top:6px">${stars(118, '#FFC93C', 'rgba(255,246,228,.3)')}</div>
        ${r.newStars > 0 ? `<div class="chip" style="background:${CREAM};border:4px solid ${INK};padding:4px 16px 4px 8px;font-size:18px;animation:cgPop .4s 1.4s both">${icon('sparkle', 22, '#E0A21A')}+${r.newStars} new star${r.newStars > 1 ? 's' : ''}!</div>` : ''}
      </div>`;
  }
  const R = app.round, pnp2 = R && R.order.length > 1;
  const next = pnp2 ? (R.turn === 1 && app.hole >= 8 ? 'Scorecard' : `Pass to ${other}`) : app.hole >= 8 ? 'Scorecard' : 'Next hole';
  return `${top}<div style="position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:center;align-items:center;gap:22px;animation:cgRise .5s .8s both">
    <div class="sumpill"><span style="display:flex;align-items:center;gap:8px">${icon('putter', 30, TEAL)}${r.strokes} ${r.strokes === 1 ? 'stroke' : 'strokes'}</span><span class="div"></span><span style="color:${TEAL}">Par ${r.par}</span><span class="div"></span><span style="display:flex;align-items:center;gap:8px">${icon('gem', 30, '#FF4FA3')}+${r.gems}</span></div>
    ${pnp2 ? '' : rb('restartHole', 'restart', { size: 74 })}
    <div class="btn sun" ${A('nextHole')} style="height:88px;padding:0 36px">${next}${icon('next', 36, INK, 6)}</div>
  </div>`;
}

/* ---------------- 08 Scorecard ---------------- */
export function scorecard(app) {
  const w = app.world, R = app.round, pnp = R.order.length > 1, pars = PARS[w];
  const cols = pnp ? '80px 80px 1fr 1fr' : '80px 80px 1fr';
  const cell = (v, p) => {
    const base = `min-width:40px;height:34px;display:flex;align-items:center;justify-content:center;font:600 22px 'Fredoka',sans-serif;padding:0 6px;`;
    if (v == null) return `<div style="${base}color:#C8B894">–</div>`;
    const d = v - p;
    if (v === 1) return `<div style="${base}border-radius:50%;background:#FF4FA3;color:#fff;border:3px solid ${INK};box-shadow:0 0 0 3px ${CREAM},0 0 0 6px #FF4FA3">${v}</div>`;
    if (d < 0) return `<div style="${base}border-radius:50%;background:#FFC93C;border:3px solid ${INK}">${v}</div>`;
    if (d === 0) return `<div style="${base}">${v}</div>`;
    return `<div style="${base}border-radius:10px;background:${d === 1 ? '#FFDCC8' : '#FF9C85'};border:3px solid ${INK}">${v}</div>`;
  };
  const tot = (pid) => R.scores[pid].reduce((a, v) => a + (v || 0), 0);
  const rows = pars.map((p, i) => `<div class="scrow" style="grid-template-columns:${cols}"><span class="fd" style="font-weight:600;font-size:22px">${i + 1}</span><span class="fd" style="text-align:center;font-weight:600;font-size:20px;color:${TEAL}">${p}</span>${R.order.map(pid => `<div style="display:flex;justify-content:center">${cell(R.scores[pid][i], p)}</div>`).join('')}</div>`).join('');
  const parTot = pars.reduce((a, b) => a + b, 0);
  let winner = '';
  if (pnp) {
    const [a, b] = R.order, ta = tot(a), tb = tot(b);
    const wpid = ta === tb ? null : ta < tb ? a : b;
    winner = wpid ? `<div style="background:${PL[wpid].color};border:5px solid ${INK};border-radius:36px;box-shadow:0 9px 0 ${INK};padding:20px;display:flex;align-items:center;gap:18px;color:${CREAM};animation:cgPop .5s both">
      <div style="position:relative;flex:none"><div class="avatar blob" style="width:96px;height:96px;background:${CREAM};color:${PL[wpid].color};font-size:56px">${PL[wpid].letter}</div><div style="position:absolute;left:14px;top:-40px;animation:cgWiggle 1s ease-in-out infinite">${icon('crown', 68, '#FFC93C')}</div></div>
      <div style="display:flex;flex-direction:column"><span class="fd" style="font-weight:700;font-size:44px;line-height:1;text-shadow:0 4px 0 ${INK}">${PL[wpid].name} wins!</span><span style="font:800 19px 'Nunito',sans-serif">${Math.min(ta, tb)} to ${Math.max(ta, tb)} · lowest score wins</span></div></div>`
      : `<div style="background:#8BD94A;border:5px solid ${INK};border-radius:36px;box-shadow:0 9px 0 ${INK};padding:20px;display:flex;align-items:center;gap:18px;animation:cgPop .5s both"><div style="width:96px;height:96px;border-radius:50%;background:${CREAM};border:4px solid ${INK};display:flex;align-items:center;justify-content:center">${icon('heart', 56, '#FF4FA3')}</div><div style="display:flex;flex-direction:column"><span class="fd" style="font-weight:700;font-size:44px;line-height:1">All square!</span><span style="font:800 19px 'Nunito',sans-serif">${ta} each · what a match</span></div></div>`;
  }
  const bestCards = R.order.map(pid => {
    const n = PL[pid].name, info = R.bests[pid];
    let head, sub;
    const now = info ? info.now : null, old = info ? info.old : null;
    if (now == null) { head = `Round done, ${n}!`; sub = 'Score on all 9 holes to get a best scores total'; }
    else if (old == null || now < old) { head = `New best scores, ${n}!`; sub = `Your best on each hole adds up to ${now}${old != null ? ` · was ${old}` : ''}`; }
    else { head = `Well played, ${n}!`; sub = `${tot(pid)} strokes · best scores add up to ${now}`; }
    return `<div class="panel" style="padding:${pnp ? 12 : 18}px 22px;display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;align-items:center;gap:14px"><div style="width:${pnp ? 56 : 70}px;height:${pnp ? 56 : 70}px;border-radius:50%;background:#FFC93C;border:4px solid ${INK};display:flex;align-items:center;justify-content:center;flex:none;animation:cgPulse 1.2s ease-in-out infinite">${icon('sparkle', pnp ? 32 : 40, INK)}</div><div style="display:flex;flex-direction:column"><span class="fd" style="font-weight:700;font-size:${pnp ? 26 : 32}px;line-height:1">${head}</span><span style="font:800 ${pnp ? 16 : 18}px 'Nunito',sans-serif;color:${TEAL}">${sub}</span></div></div>
      <div style="display:flex;gap:12px"><div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#EEDDB8;border-radius:20px;height:${pnp ? 46 : 58}px;font:600 24px 'Fredoka',sans-serif">${icon('star', 30, '#E0A21A')}+${R.stars[pid]} stars</div><div style="flex:1;display:flex;align-items:center;justify-content:center;gap:8px;background:#EEDDB8;border-radius:20px;height:${pnp ? 46 : 58}px;font:600 24px 'Fredoka',sans-serif">${icon('gem', 30, '#FF4FA3')}+${R.gems[pid]} gems</div></div></div>`;
  }).join('');
  return `<div style="position:absolute;inset:0;background:rgba(11,54,64,.45)"></div>
  <div class="panel" style="position:absolute;left:36px;top:64px;width:690px;height:604px;padding:18px 24px;display:flex;flex-direction:column;gap:8px">
    <div style="display:flex;align-items:center;justify-content:space-between"><span class="fd" style="font-weight:600;font-size:32px">${WORLDS[w].name}</span></div>
    <div style="display:grid;grid-template-columns:${cols};font:800 15px 'Nunito',sans-serif;color:${TEAL};letter-spacing:.06em;text-transform:uppercase;border-bottom:4px solid ${INK};padding-bottom:6px"><span>Hole</span><span style="text-align:center">Par</span>${R.order.map(pid => `<span style="text-align:center;color:${PL[pid].dark}">${PL[pid].name}</span>`).join('')}</div>
    ${rows}
    <div style="display:grid;grid-template-columns:${cols};align-items:center;height:56px;margin-top:4px;background:${TEAL};border-radius:20px;color:${CREAM};padding:0 12px">
      <span class="fd" style="font-weight:600;font-size:22px">Total</span><span class="fd" style="text-align:center;font-weight:600;font-size:24px">${parTot}</span>
      ${R.order.map((pid, i) => i === 0 ? `<div style="display:flex;justify-content:center"><div style="min-width:64px;height:44px;border-radius:999px;background:#FFC93C;color:${INK};border:4px solid ${INK};display:flex;align-items:center;justify-content:center;font:700 26px 'Fredoka',sans-serif;animation:cgGlow 1.4s infinite">${tot(pid)}</div></div>` : `<div style="display:flex;justify-content:center;font:700 26px 'Fredoka',sans-serif">${tot(pid)}</div>`).join('')}
    </div>
  </div>
  <div style="position:absolute;left:756px;top:64px;right:36px;bottom:30px;display:flex;flex-direction:column;gap:18px">
    ${winner}${bestCards}
    <div style="display:flex;gap:14px;margin-top:auto">
      <div class="btn sun" ${A('go', 'map')} style="flex:1.4;height:88px;font-size:32px">${icon('map', 34, INK)}${app.world < NW - 1 ? 'Next world' : 'World map'}</div>
      <div class="btn sm" ${A('againCourse')} style="flex:1;height:88px;font-size:26px;box-shadow:0 8px 0 ${INK}">${icon('restart', 30, TEAL)}Again</div>
    </div>
  </div>`;
}

/* ---------------- 09 Pass and play ---------------- */
export function handoff(app) {
  const h = app.handoff, to = PL[h.to], from = PL[h.from], R = app.round;
  const sc = (pid) => R.scores[pid].reduce((a, v) => a + (v || 0), 0);
  const both = R.scores.caleb.map((v, i) => v != null && R.scores.ezra[i] != null);
  const sub2 = (pid) => R.scores[pid].reduce((a, v, i) => a + (both[i] ? v : 0), 0);
  const a = sub2('caleb'), b = sub2('ezra');
  const lead = !both.some(Boolean) ? 'First hole!' : a === b ? 'All square!' : `${a < b ? 'Caleb' : 'Ezra'} leads by ${Math.abs(a - b)}`;
  const par = PARS[app.world][h.hole];
  const sub = h.newHole ? `Hole ${h.hole + 1} is next. ${to.name} goes first.` : `Hole ${h.hole + 1} · Par ${par}. Beat ${from.name}'s score!`;
  return `<div style="position:absolute;inset:0;overflow:hidden;background:${to.color}">
    <div style="position:absolute;left:-120px;top:-160px;width:520px;height:520px;border-radius:50%;background:rgba(255,255,255,.16)"></div>
    <div style="position:absolute;right:-160px;bottom:-200px;width:640px;height:640px;border-radius:50%;background:rgba(255,255,255,.14)"></div>
    <div style="position:absolute;right:180px;top:60px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.18)"></div>
    <div style="position:absolute;left:0;right:0;top:54px;display:flex;flex-direction:column;align-items:center;gap:14px">
      <div style="display:flex;align-items:center;gap:28px">
        <div class="avatar blob" style="width:120px;height:120px;background:${from.color};font-size:64px;border-width:5px;opacity:.9">${from.letter}</div>
        <div style="animation:cgWiggle 1s ease-in-out infinite">${icon('next', 80, CREAM, 7)}</div>
        <div class="avatar blob" style="width:190px;height:190px;background:${CREAM};color:${to.color};font-size:110px;border-width:6px;box-shadow:0 10px 0 ${INK};animation:cgBob 1.6s ease-in-out infinite">${to.letter}</div>
      </div>
      <div class="fd ol5" style="font-weight:700;font-size:104px;line-height:1;white-space:nowrap;color:${CREAM};animation:cgPop .6s both">Pass to ${to.name}!</div>
      <div class="fd" style="font-weight:600;font-size:28px">${sub}</div>
      <div style="display:flex;gap:16px;align-items:center;background:${CREAM};border:5px solid ${INK};border-radius:999px;box-shadow:0 7px 0 ${INK};padding:8px 26px 8px 10px">
        ${PIDS.map(id => `<div style="display:flex;align-items:center;gap:10px">${dot(id, 46, 24)}<span class="fd" style="font-weight:600;font-size:32px">${sc(id)}</span></div>`).join('')}
        <span style="font:800 17px 'Nunito',sans-serif;color:${TEAL};margin-left:6px">${lead}</span>
      </div>
    </div>
    <div class="btn sun" ${A('handoffGo')} style="position:absolute;left:50%;bottom:40px;transform:translateX(-50%);height:92px;padding:0 44px;font-size:36px;animation:cgGlow 1.6s infinite">I'm ${to.name}, let's go!${icon('play', 36, INK)}</div>
  </div>`;
}

/* ---------------- 10 Hazard book ---------------- */
export function guide(app) {
  const page = app.guideTab === 'p2' ? 1 : 0;
  const cards = HAZ_PAGES[page].map(k => { const h = HAZ[k]; return `<div class="hcard"><div class="blob" style="width:92px;height:92px;flex:none;background:${h.color};border:4px solid ${INK};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 -8px 0 rgba(0,0,0,.14)">${icon(h.icon, 54, CREAM)}</div><div style="display:flex;flex-direction:column;gap:3px;min-width:0"><span class="fd" style="font-weight:600;font-size:21px;line-height:1.05">${h.name}</span><span style="font:700 14.5px/1.25 'Nunito',sans-serif;color:${TEAL}">${h.desc}</span><span style="align-self:flex-start;margin-top:2px;background:#EEDDB8;border-radius:999px;padding:1px 10px;font:800 12px 'Nunito',sans-serif;text-transform:uppercase;letter-spacing:.06em">${whereOf(k)}</span></div></div>`; }).join('');
  return `<div class="dotbg" style="position:absolute;inset:0">
    <div class="title-pill" style="background:${TEAL};color:${CREAM}">${icon('book', 36, '#FFC93C')}Hazard Book</div>${closeBtn()}
    <div style="position:absolute;left:50%;top:96px;transform:translateX(-50%);width:560px">${seg([{ v: 'p1', label: 'Worlds 1 to 4', icon: 'map' }, { v: 'p2', label: 'Worlds 5 to 8', icon: 'map' }], page ? 'p2' : 'p1', 'guideTab')}</div>
    <div style="position:absolute;left:36px;right:36px;top:176px;bottom:30px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);gap:16px">${cards}</div></div>`;
}

/* ---------------- 11 Shop ---------------- */
function skinArt(tab, it, big) {
  if (tab === 'balls') return `<div class="skinball" style="width:${big ? 150 : 78}px;height:${big ? 150 : 78}px;background:${it.bg};${big ? 'border-width:5px;animation:cgBob 2s ease-in-out infinite' : ''}"></div>`;
  if (tab === 'putters') return big
    ? `<div style="position:relative;width:170px;height:210px;transform:rotate(-18deg);animation:cgWiggle 2.4s ease-in-out infinite"><div style="position:absolute;left:92px;top:0;width:24px;height:170px;border-radius:12px;border:4px solid ${INK};background:${it.shaft}"></div><div style="position:absolute;left:20px;top:160px;width:120px;height:46px;border-radius:23px;border:4px solid ${INK};box-shadow:inset 0 -8px 0 rgba(0,0,0,.15);background:${it.head}"></div></div>`
    : `<div style="position:relative;width:80px;height:96px;transform:rotate(-18deg)"><div style="position:absolute;left:44px;top:0;width:14px;height:80px;border-radius:7px;border:3px solid ${INK};background:${it.shaft}"></div><div style="position:absolute;left:8px;top:72px;width:60px;height:24px;border-radius:12px;border:3px solid ${INK};background:${it.head}"></div></div>`;
  return big
    ? `<div style="position:relative;width:170px;height:210px"><div style="position:absolute;left:40px;top:0;width:12px;height:210px;border-radius:6px;background:${CREAM};border:3px solid ${INK}"></div><div style="position:absolute;left:50px;top:6px;width:120px;height:80px;border-radius:8px 60px 50px 8px;border:4px solid ${INK};transform-origin:0 50%;animation:cgWiggle 1.6s ease-in-out infinite;background:${it.bg}"></div></div>`
    : `<div style="position:relative;width:80px;height:96px"><div style="position:absolute;left:16px;top:0;width:8px;height:96px;border-radius:4px;background:${INK}"></div><div style="position:absolute;left:22px;top:4px;width:58px;height:40px;border-radius:5px 30px 26px 5px;border:3px solid ${INK};background:${it.bg}"></div></div>`;
}
export function shop(app) {
  const pid = app.lead(), P = prof(pid), tab = app.shopTab, list = SHOP[tab];
  const items = list.map((it, i) => {
    const owned = P.owned[tab].includes(it.id), eq = P.equipped[tab] === it.id, sel = app.shopSel === i;
    const chip = eq ? ['Using', 'check', '#8BD94A', INK, INK] : owned ? ['Yours', 'heart', '#EEDDB8', INK, INK] : [String(it.price), 'gem', INK, CREAM, '#FF4FA3'];
    return `<div class="shopitem ${sel ? 'sel' : ''}" ${A('shopSel', i)}><div style="height:96px;display:flex;align-items:center;justify-content:center">${skinArt(tab, it, false)}</div><span class="fd" style="font-weight:600;font-size:20px;text-align:center;line-height:1.05">${it.name}</span><div class="chip" style="padding:3px 12px 3px 6px;font-size:16px;background:${chip[2]};color:${chip[3]}">${icon(chip[1], 20, chip[4])}${chip[0]}</div></div>`;
  }).join('');
  const si = list[app.shopSel] || list[0], owned = P.owned[tab].includes(si.id), eq = P.equipped[tab] === si.id;
  const btn = eq ? ['Using it!', 'check', 'lime'] : owned ? ['Use this', 'heart', 'sun'] : [`Buy for ${si.price}`, 'gem', 'sun'];
  return `<div style="position:absolute;inset:0;background:radial-gradient(rgba(255,255,255,.07) 2px,transparent 2.5px) 0 0/28px 28px,linear-gradient(#13707A,#0F5A63)">
    <div class="title-pill" style="background:#FF4FA3;color:${CREAM}">${icon('bag', 36, CREAM)}Shop</div>
    <div style="position:absolute;right:108px;top:20px;display:flex;align-items:center;gap:8px;background:${CREAM};border:4px solid ${INK};border-radius:999px;padding:6px 20px 6px 6px;font:600 28px 'Fredoka',sans-serif">${dot(pid, 34, 19)}${icon('gem', 34, '#FF4FA3')}${P.gems}</div>${closeBtn()}
    <div class="panel" style="position:absolute;left:36px;top:96px;width:400px;bottom:30px;padding:20px;display:flex;flex-direction:column;gap:14px">
      <div style="position:relative;height:250px;border-radius:26px;background:radial-gradient(ellipse at 50% 80%,#6CCB78,#45B35A 60%);border:4px solid ${INK};overflow:hidden;display:flex;align-items:center;justify-content:center"><div style="position:absolute;left:90px;bottom:26px;width:190px;height:44px;border-radius:50%;background:rgba(0,0,0,.18)"></div>${skinArt(tab, si, true)}</div>
      <div class="fd" style="font-weight:600;font-size:34px;line-height:1">${si.name}</div>
      <div style="font:700 17px/1.35 'Nunito',sans-serif;color:${TEAL}">${si.blurb}</div>
      <div class="btn ${btn[2]}" ${A('shopAct')} style="margin-top:auto;height:84px;font-size:30px">${icon(btn[1], 32, INK)}${btn[0]}</div>
    </div>
    <div style="position:absolute;left:466px;right:36px;top:96px">${seg([{ v: 'balls', label: 'Balls', icon: 'ball' }, { v: 'putters', label: 'Putters', icon: 'putter' }, { v: 'flags', label: 'Flags', icon: 'flag' }], tab, 'shopTab', 'dark')}</div>
    <div style="position:absolute;left:466px;right:36px;top:176px;bottom:30px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:1fr 1fr;gap:16px">${items}</div>
  </div>`;
}

/* ---------------- 13 Trophies ---------------- */
export function trophies(app) {
  const td = 'normal';
  const head = PIDS.map(id => { const n = prof(id).aces; return `<div style="display:flex;align-items:center;justify-content:center;gap:10px;font:600 26px 'Fredoka',sans-serif">${dot(id, 42, 22)}${PL[id].name}<span style="font:800 15px 'Nunito',sans-serif;color:${TEAL}">${n} ${n === 1 ? 'ace' : 'aces'}</span></div>`; }).join('');
  const rows = WORLDS.map((w, i) => {
    const bests = PIDS.map(id => bestTotal(id, i, td));
    const cells = PIDS.map((id, k) => { const bv = bests[k], ov = bests[1 - k]; const crown = bv != null && (ov == null || bv < ov);
      return `<div style="display:flex;align-items:center;justify-content:center;gap:12px">${crown ? icon('crown', 24, '#FFC93C') : ''}<span class="fd" style="font-weight:600;font-size:26px;min-width:40px;text-align:center">${bv ?? '–'}</span><span style="display:flex;align-items:center;gap:4px;font:800 16px 'Nunito',sans-serif;color:${TEAL}">${icon('star', 20, '#E0A21A')}${worldStars(id, i, td)}/27</span></div>`; }).join('');
    return `<div style="flex:1;display:grid;grid-template-columns:1.3fr 1fr 1fr;align-items:center;border-bottom:2px dashed #E4D2AE">
      <div style="display:flex;align-items:center;gap:12px"><div class="blob" style="width:38px;height:38px;background:${w.top};border:3px solid ${INK};display:flex;align-items:center;justify-content:center">${icon(w.icon1, 24, w.propColor === '#F4F0FF' ? CREAM : INK)}</div><span class="fd" style="font-weight:600;font-size:21px">${w.name}</span></div>${cells}</div>`;
  }).join('');
  return `<div style="position:absolute;inset:0;background:radial-gradient(rgba(15,90,99,.08) 2px,transparent 2.5px) 0 0/26px 26px,linear-gradient(#FFF6E4,#F4E2BC)">
    <div class="title-pill" style="background:#FFC93C">${icon('trophy', 36, INK)}Trophies</div>${closeBtn()}
    <div style="position:absolute;left:110px;right:110px;top:112px;bottom:30px;background:#FFFDF7;border:5px solid ${INK};border-radius:36px;box-shadow:0 9px 0 ${INK};padding:10px 26px;display:flex;flex-direction:column">
      <div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;align-items:center;height:54px;border-bottom:4px solid ${INK};flex:none"><span class="cap">Best scores</span>${head}</div>${rows}
    </div></div>`;
}

export const toastHTML = (msg) => `<div class="toast">${esc(msg)}</div>`;
