/* ui2d.js — the shared 2D parts from the handoff (Btn, Icon, Chip, Bip, Muddler .dc.html) as plain
 * functions that return HTML strings. Same geometry, colours and moods as the prototype; their keyframes
 * (btnPulse, btnSway, btnWob, bipBob, bipSpin, bipGlow, mud*) live in css/style.css. */

export const BTN_COLORS = { red: ['#F2424F', '#B8233A', '#FF9AA2'], orange: ['#FF8A2A', '#C45A0E', '#FFBE7A'], yellow: ['#FFD23A', '#CF950A', '#FFF0A0'], green: ['#45C46A', '#22884A', '#9BE8B0'], blue: ['#3C8CF0', '#1E5AB5', '#9CC8FF'], purple: ['#9A5BE0', '#6433A6', '#CFAEF7'], pink: ['#FF7FC0', '#CF4A8C', '#FFC0E0'], white: ['#F7F4EE', '#BDB3A4', '#FFFFFF'], black: ['#3A3442', '#16121C', '#76708A'] };
function btnPoly(n, r1, r2, cy) { const N = r2 ? n * 2 : n, p = []; for (let i = 0; i < N; i++) { const r = r2 && i % 2 ? r2 : r1, a = -Math.PI / 2 + i * Math.PI * 2 / N; p.push((50 + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1)); } return 'M' + p.join(' L') + ' Z'; }
export const BTN_SHAPES = { circle: 'M6 48 A44 44 0 1 0 94 48 A44 44 0 1 0 6 48 Z', square: 'M24 6 H76 Q94 6 94 24 V72 Q94 90 76 90 H24 Q6 90 6 72 V24 Q6 6 24 6 Z', triangle: 'M50 6 Q57 6 61 13 L95 76 Q99 88 86 88 H14 Q1 88 5 76 L39 13 Q43 6 50 6 Z', star: btnPoly(5, 50, 23, 52), heart: 'M50 90 C20 70 4 52 4 32 C4 17 16 6 30 6 C39 6 46 11 50 18 C54 11 61 6 70 6 C84 6 96 17 96 32 C96 52 80 70 50 90 Z', hexagon: btnPoly(6, 47, 0, 48), cloud: 'M26 84 C12 84 4 74 4 63 C4 51 14 44 24 45 C25 30 36 20 50 20 C62 20 71 28 74 39 C86 38 97 48 97 61 C97 74 87 84 74 84 Z', arrow: 'M8 34 H50 V14 Q50 6 57 11 L95 43 Q100 48 95 53 L57 85 Q50 90 50 82 V62 H8 Q3 62 3 57 V39 Q3 34 8 34 Z' };
const BTN_CENTER = { circle: [50, 48, 1], square: [50, 48, 1], triangle: [50, 62, .7], star: [50, 54, .66], heart: [50, 42, .85], hexagon: [50, 48, .95], cloud: [51, 58, .8], arrow: [44, 48, .72] };
const BTN_PICS = { sun: ['M12 20 A8 8 0 1 0 28 20 A8 8 0 1 0 12 20 Z M20 2 V6 M20 34 V38 M2 20 H6 M34 20 H38 M7.5 7.5 L10.5 10.5 M29.5 29.5 L32.5 32.5 M7.5 32.5 L10.5 29.5 M29.5 10.5 L32.5 7.5', ''], fish: ['M3 20 Q15 6 28 20 Q15 34 3 20 Z M27 20 L38 10 V30 Z', 'M9 17.5 A2.8 2.8 0 1 0 14.6 17.5 A2.8 2.8 0 1 0 9 17.5 Z'], skull: ['M20 3 C10 3 4 10 4 18 C4 24 8 27 12 28.5 V36 H28 V28.5 C32 27 36 24 36 18 C36 10 30 3 20 3 Z', 'M9.5 18 A4.5 4.5 0 1 0 18.5 18 A4.5 4.5 0 1 0 9.5 18 Z M21.5 18 A4.5 4.5 0 1 0 30.5 18 A4.5 4.5 0 1 0 21.5 18 Z'], crown: ['M4 32 L6 10 L14 19 L20 6 L26 19 L34 10 L36 32 Z', ''], lightning: ['M25 2 L7 23 H18 L14 38 L33 15 H22 L26 2 Z', ''] };
let uidN = 0;

/* Btn — a button in the arcade's code-built style (top face gradient, darker side, ink outline, shine) */
export function Btn(o) {
  const px = +(o.px ?? 84), shape = BTN_SHAPES[o.shape] ? o.shape : 'circle', cname = BTN_COLORS[o.color] ? o.color : 'red';
  const [base, deep, light] = BTN_COLORS[cname], fin = o.finish || 'shiny';
  const sym = o.symbol == null || o.symbol === '' || o.symbol === 'none' ? null : String(o.symbol);
  const isPic = !!(sym && BTN_PICS[sym]), isText = !!(sym && !isPic);
  const [cx, cy, k] = BTN_CENTER[shape], lightSym = ['yellow', 'white', 'pink'].includes(cname);
  const { flat, faded, pressed } = o, glowing = fin === 'glowing', rubbery = fin === 'rubbery', ps = 1.12 * k;
  let filter = 'drop-shadow(0 3px 2px rgba(40,20,60,.32))';
  if (glowing) filter = `drop-shadow(0 0 6px ${light}) drop-shadow(0 0 14px ${base})`;
  if (faded) filter = 'grayscale(.8)'; if (flat) filter = 'none';
  const anim = o.sway ? 'btnSway 5s ease-in-out infinite' : (rubbery && !flat ? 'btnWob 2.4s ease-in-out infinite' : 'none');
  const u = 'b' + (++uidN), d = BTN_SHAPES[shape];
  const symFill = lightSym ? '#3B2A4A' : '#FFFFFF', symStroke = lightSym ? 'rgba(255,255,255,.55)' : 'rgba(40,20,60,.35)';
  const depth = pressed ? 2.5 : 8, press = pressed ? 5.5 : 0;
  const overlay = fin === 'stripy' ? `url(#${u}s)` : fin === 'spotty' ? `url(#${u}d)` : 'none';
  let svg;
  if (flat) svg = `<path d="${d}" style="fill:${o.fill || '#5B4B6E'};stroke:#3B2A4A;stroke-width:3;stroke-linejoin:round"/>`;
  else svg = `<path d="${d}" transform="translate(0 ${depth})" style="fill:${deep};stroke:#3B2A4A;stroke-width:4.5;stroke-linejoin:round"/>
<g transform="translate(0 ${press})"><path d="${d}" style="fill:url(#${u}g);stroke:#3B2A4A;stroke-width:4.5;stroke-linejoin:round"/><path d="${d}" style="fill:${overlay}"/>
<g style="clip-path:url(#${u}c)">${rubbery ? `<path d="${d}" style="fill:none;stroke:rgba(40,20,60,.14);stroke-width:12"/>` : `<ellipse cx="33" cy="25" rx="17" ry="7.5" transform="rotate(-28 33 25)" style="fill:#fff;opacity:.62"/><circle cx="58" cy="17" r="3.2" style="fill:#fff;opacity:.55"/>`}</g>
${isPic ? `<g transform="translate(${cx - 20 * ps} ${cy - 20 * ps}) scale(${ps})"><path d="${BTN_PICS[sym][0]}" style="fill:${symFill};stroke:${symFill};stroke-width:3.5;stroke-linejoin:round;stroke-linecap:round"/><path d="${BTN_PICS[sym][1]}" style="fill:${base}"/></g>` : ''}</g>`;
  const g0 = glowing ? '#FFFFFF' : rubbery ? base : light, g2 = rubbery ? base : deep;
  const text = isText ? `<div style="position:absolute;left:${(px - 108 * px / 112) / 2 + (cx + 4) * px / 112}px;top:${(cy + 4 + press) * px / 112}px;width:0;height:0;display:flex;align-items:center;justify-content:center;pointer-events:none"><div style="font-family:Fredoka,sans-serif;font-weight:700;font-size:${(sym.length > 1 ? 36 : 50) * k * px / 112}px;line-height:1;white-space:nowrap;color:${symFill};-webkit-text-stroke:${Math.max(1, 3.5 * px / 112)}px ${symStroke};paint-order:stroke fill">${sym}</div></div>` : '';
  return `<div class="btn2d${o.cls ? ' ' + o.cls : ''}" style="position:relative;display:inline-block;vertical-align:middle;width:${px}px;height:${px}px;opacity:${faded ? .26 : 1};filter:${filter};transition:opacity .4s,filter .4s;perspective:600px;flex:none">
${o.highlight ? `<div style="position:absolute;inset:-24%;border-radius:50%;border:4px dashed #FFC93C;animation:btnPulse 1.1s ease-in-out infinite"></div>` : ''}
<div style="position:absolute;inset:0;animation:${anim}"><svg viewBox="-4 -4 108 112" style="width:100%;height:100%;display:block;overflow:visible"><defs>
<linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${g0}"/><stop offset="0.6" style="stop-color:${base}"/><stop offset="1" style="stop-color:${g2}"/></linearGradient>
<pattern id="${u}s" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="7" height="16" style="fill:rgba(255,255,255,.5)"/></pattern>
<pattern id="${u}d" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="3.8" style="fill:rgba(255,255,255,.7)"/><circle cx="15" cy="15" r="3.8" style="fill:rgba(255,255,255,.7)"/></pattern>
<clipPath id="${u}c"><path d="${d}"/></clipPath></defs>${svg}</svg>${text}</div></div>`;
}

function icStar() { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 9 : 19, a = -Math.PI / 2 + i * Math.PI / 5; p.push((24 + r * Math.cos(a)).toFixed(1) + ' ' + (26 + r * Math.sin(a)).toFixed(1)); } return 'M' + p.join(' L') + ' Z'; }
const ICONS = {
  play: ['M17 11 L37 24 L17 37 Z', 1], pause: ['M17 12 V36 M31 12 V36'], back: ['M29 10 L15 24 L29 38'], next: ['M19 10 L33 24 L19 38'],
  zoomout: ['M7 21 A13 13 0 1 0 33 21 A13 13 0 1 0 7 21 M30 30 L41 41 M14 21 H26'], magnify: ['M7 21 A13 13 0 1 0 33 21 A13 13 0 1 0 7 21 M30 30 L41 41'],
  close: ['M13 13 L35 35 M35 13 L13 35'], check: ['M10 25 L20 35 L38 13'],
  book: ['M7 11 Q16 7 24 13 Q32 7 41 11 V37 Q32 33 24 39 Q16 33 7 37 Z M24 13 V39'], map: ['M6 12 L17 8 L31 13 L42 9 V36 L31 40 L17 35 L6 39 Z M17 8 V35 M31 13 V40'],
  home: ['M7 23 L24 9 L41 23 M12 19 V39 H36 V19 M20 39 V29 H28 V39'], restart: ['M37 17 A15 15 0 1 0 39 29 M39 8 V17 H30'],
  star: [icStar(), 1], lock: ['M13 22 H35 Q38 22 38 25 V38 Q38 41 35 41 H13 Q10 41 10 38 V25 Q10 22 13 22 Z M16 22 V16 A8 8 0 0 1 32 16 V22'],
  timer: ['M9 27 A15 15 0 1 0 39 27 A15 15 0 1 0 9 27 M24 27 V18 M19 6 H29'], bulb: ['M17 31 Q10 25 10 19 A14 14 0 0 1 38 19 Q38 25 31 31 V34 H17 Z M18 41 H30'],
  spark: ['M24 5 Q27 21 43 24 Q27 27 24 43 Q21 27 5 24 Q21 21 24 5 Z', 1], camera: ['M7 16 H15 L18 11 H30 L33 16 H41 V38 H7 Z M17 27 A7 7 0 1 0 31 27 A7 7 0 1 0 17 27'],
  turn: ['M9 24 H39 M16 16 L8 24 L16 32 M32 16 L40 24 L32 32'], tap: ['M18 24 A6 6 0 1 0 30 24 A6 6 0 1 0 18 24 M24 6 V11 M24 37 V42 M6 24 H11 M37 24 H42'],
  skip: ['M12 11 L28 24 L12 37 Z M36 11 V37', 1], user: ['M14 18 A10 10 0 1 0 34 18 A10 10 0 1 0 14 18 M8 42 Q8 30 24 30 Q40 30 40 42']
};
export function Icon(name, color, px, sw) {
  const ic = ICONS[name] || ICONS.star, c = color || '#3B2A4A';
  return `<svg class="ic" viewBox="0 0 48 48" style="width:${px || 32}px;height:${px || 32}px;display:block;flex:none;overflow:visible"><path d="${ic[0]}" style="fill:${ic[1] ? c : 'none'};stroke:${c};stroke-width:${sw ?? (ic[1] ? 3 : 5.5)};stroke-linecap:round;stroke-linejoin:round"/></svg>`;
}

/* Chip — the little picture tile next to a clue or an inspect fact */
export function Chip(o) {
  const px = +(o.px ?? 56), kind = o.kind || 'colour', v = o.value, inner = Math.round(px * .66), ls = Math.round(px * .6);
  const PICS = ['sun', 'fish', 'skull', 'crown', 'lightning'];
  let kk = kind; if (kind === 'symbol') kk = v === 'blank' || v == null || v === '' ? 'blank' : PICS.includes(v) ? 'pic' : 'letter';
  const ON = '#FFC93C', OFF = '#DCCDB4', u = px / 56;
  let body = '';
  if (kk === 'colour') body = Btn({ shape: 'circle', color: v, px: inner });
  else if (kk === 'shape') body = Btn({ shape: v, flat: true, fill: '#5B4B6E', px: inner });
  else if (kk === 'letter') body = `<div style="font-family:Fredoka,sans-serif;font-weight:700;font-size:${String(v).length > 2 ? ls * .62 : ls}px;line-height:1;color:#3B2A4A">${v}</div>`;
  else if (kk === 'pic') body = Btn({ shape: 'circle', color: 'white', symbol: v, px: inner });
  else if (kk === 'blank') body = Btn({ shape: 'circle', color: 'white', px: inner });
  else if (kk === 'finish') body = Btn({ shape: 'circle', color: 'blue', finish: v, px: inner });
  else if (kk === 'size') { const si = { tiny: 0, normal: 1, big: 2, giant: 2 }[v] ?? 1; body = `<div style="display:flex;align-items:flex-end;gap:3px">${[10, 15, 22].map((s, i) => `<div style="width:${s * u}px;height:${s * u}px;border-radius:50%;background:${si === i ? ON : OFF};border:2px solid #3B2A4A"></div>`).join('')}</div>`; }
  else if (kk === 'position') {
    const w = v || 'back', h = o.height, c = x => w === x ? ON : OFF;
    const dx = { left: 14, back: 50, right: 86, floor: 50 }[w] ?? 50, dy = w === 'floor' ? 87 : h === 'low' ? 58 : h === 'high' ? 30 : 44;
    body = `<div style="position:relative;width:78%;height:78%"><div style="position:absolute;inset:0;background:${c('left')};clip-path:polygon(0 0,28% 18%,28% 70%,0 100%)"></div><div style="position:absolute;inset:0;background:${c('back')};clip-path:polygon(30% 18%,70% 18%,70% 70%,30% 70%)"></div><div style="position:absolute;inset:0;background:${c('right')};clip-path:polygon(72% 18%,100% 0,100% 100%,72% 70%)"></div><div style="position:absolute;inset:0;background:${c('floor')};clip-path:polygon(29% 73%,71% 73%,100% 100%,0 100%)"></div>${(h || w === 'floor') ? `<div style="position:absolute;left:${dx}%;top:${dy}%;width:26%;height:26%;margin:-13% 0 0 -13%;border-radius:50%;background:#F2424F;border:2px solid #3B2A4A;box-sizing:border-box"></div>` : ''}</div>`;
  }
  else if (kk === 'landmark') body = `<div style="position:relative;width:70%;height:52%;margin-top:18%;border-radius:6px;background:${v};border:2.5px solid #3B2A4A"><div style="position:absolute;left:50%;top:-58%;width:44%;aspect-ratio:1;transform:translateX(-50%);border-radius:50% 50% 50% 0;rotate:-45deg;background:#F2424F;border:2.5px solid #3B2A4A"></div></div>`;
  else if (kk === 'riddle') body = `<div style="font-family:Fredoka,sans-serif;font-weight:700;font-size:${ls}px;line-height:1;color:#fff;background:#9A5BE0;border:2.5px solid #3B2A4A;width:66%;height:66%;border-radius:40% 40% 40% 8%;display:grid;place-items:center">?</div>`;
  else if (kk === 'order') { const n = parseInt(v) || 1; body = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="font-family:Fredoka,sans-serif;font-weight:700;font-size:${Math.round(px * .38)}px;line-height:1;color:#3B2A4A">${n + (['st', 'nd', 'rd'][n - 1] || 'th')}</div><div style="display:flex;gap:2px">${[1, 2, 3, 4].map(i => `<div style="width:${Math.round(7 * u)}px;height:${Math.round(7 * u)}px;border-radius:50%;background:${i === n ? '#F2424F' : '#DCCDB4'};border:1.5px solid #3B2A4A"></div>`).join('')}</div></div>`; }
  else if (kk === 'muddler') body = Muddler('giggle', inner, { head: true });
  else if (kk === 'fib') body = `<div style="font-family:Fredoka,sans-serif;font-weight:700;font-size:${ls}px;line-height:1;color:#fff;background:#F2424F;border:2.5px solid #3B2A4A;width:66%;height:66%;border-radius:50%;display:grid;place-items:center">!</div>`;
  const nw = Math.max(3, Math.round(px * .08));
  const not = o.not ? `<div style="position:absolute;inset:8%;border-radius:50%;border:${nw}px solid #E3263B;box-sizing:border-box"><div style="position:absolute;left:50%;top:-6%;bottom:-6%;width:${nw}px;margin-left:-${Math.max(1.5, px * .04)}px;background:#E3263B;rotate:45deg"></div></div>` : '';
  return `<div class="chip" style="position:relative;width:${px}px;height:${px}px;flex:none;border-radius:${Math.round(px * .26)}px;background:#FFF6E6;border:3px solid #3B2A4A;box-sizing:border-box;display:grid;place-items:center;box-shadow:0 3px 0 #3B2A4A;overflow:hidden">${body}${not}</div>`;
}

/* Bip — the park helper robot. moods: idle happy think wow oops silly clue */
export function Bip(mood, px, o = {}) {
  px = px || 160; mood = ['idle', 'happy', 'think', 'wow', 'oops', 'silly', 'clue'].includes(mood) ? mood : 'idle';
  const up = mood === 'happy' || mood === 'wow', cheeks = mood === 'happy' || mood === 'silly' || mood === 'idle';
  const anim = o.spin ? 'bipSpin 1.1s cubic-bezier(.3,.7,.3,1) infinite' : o.still ? 'none' : 'bipBob 2.2s ease-in-out infinite';
  const E = '#7CF4E3', ab = (s) => `<div style="position:absolute;${s}"></div>`;
  const face = {
    idle: ab(`left:28px;top:18px;width:16px;height:26px;border-radius:9px;background:${E};box-shadow:0 0 10px ${E}`) + ab(`left:70px;top:18px;width:16px;height:26px;border-radius:9px;background:${E};box-shadow:0 0 10px ${E}`) + ab(`left:42px;top:46px;width:30px;height:14px;border-bottom:4px solid ${E};border-radius:0 0 18px 18px;box-sizing:border-box`),
    happy: ab(`left:25px;top:26px;width:18px;height:18px;border-top:5px solid ${E};border-left:5px solid ${E};rotate:45deg;border-radius:4px 0 0 0`) + ab(`left:67px;top:26px;width:18px;height:18px;border-top:5px solid ${E};border-left:5px solid ${E};rotate:45deg;border-radius:4px 0 0 0`) + ab(`left:36px;top:46px;width:42px;height:20px;border-radius:0 0 22px 22px;background:${E};box-shadow:0 0 10px ${E}`),
    think: ab(`left:26px;top:18px;width:16px;height:26px;border-radius:9px;background:${E};box-shadow:0 0 10px ${E}`) + ab(`left:66px;top:30px;width:22px;height:7px;border-radius:4px;background:${E}`) + ab(`left:40px;top:54px;width:22px;height:5px;border-radius:3px;background:${E};rotate:-8deg`) + `<div style="position:absolute;left:92px;top:8px;font-family:Fredoka,sans-serif;font-weight:700;font-size:22px;color:#FFD84D">?</div>`,
    wow: ab(`left:22px;top:14px;width:26px;height:26px;border-radius:50%;border:5px solid ${E};box-sizing:border-box;box-shadow:0 0 8px ${E}`) + ab(`left:64px;top:14px;width:26px;height:26px;border-radius:50%;border:5px solid ${E};box-sizing:border-box;box-shadow:0 0 8px ${E}`) + ab(`left:48px;top:46px;width:17px;height:17px;border-radius:50%;border:4px solid ${E};box-sizing:border-box`),
    oops: ab(`left:22px;top:22px;width:16px;height:16px;border-top:5px solid ${E};border-right:5px solid ${E};rotate:45deg`) + ab(`left:72px;top:22px;width:16px;height:16px;border-bottom:5px solid ${E};border-left:5px solid ${E};rotate:45deg`) + ab(`left:40px;top:52px;width:34px;height:12px;border-top:4px solid ${E};border-radius:18px 18px 0 0;box-sizing:border-box`),
    silly: `<div style="position:absolute;left:20px;top:12px;width:32px;height:32px;border-radius:50%;border:5px solid ${E};box-sizing:border-box"><div style="position:absolute;left:12px;top:3px;width:8px;height:8px;border-radius:50%;background:${E}"></div></div>` + ab(`left:66px;top:26px;width:22px;height:6px;border-radius:3px;background:${E};rotate:10deg`) + ab(`left:34px;top:50px;width:44px;height:5px;border-radius:3px;background:${E}`) + ab(`left:48px;top:53px;width:18px;height:18px;border-radius:0 0 10px 10px;background:#FF7FC0;border:3px solid #3B2A4A;box-sizing:border-box`),
    clue: `<div style="position:absolute;inset:0;display:grid;place-items:center;font-family:Fredoka,sans-serif;font-weight:700;font-size:54px;line-height:1;color:${E};text-shadow:0 0 12px ${E}">?</div>`
  }[mood];
  const arm = 'background:#D8E3EC;border:4px solid #3B2A4A;box-sizing:border-box';
  const arms = up ? ab(`left:0;top:70px;width:34px;height:52px;border-radius:17px;${arm};rotate:35deg`) + ab(`right:0;top:70px;width:34px;height:52px;border-radius:17px;${arm};rotate:-35deg`)
    : ab(`left:4px;top:128px;width:32px;height:48px;border-radius:16px;${arm};rotate:-20deg`) + ab(`right:4px;top:128px;width:32px;height:48px;border-radius:16px;${arm};rotate:20deg`);
  return `<div class="bip" style="position:relative;width:${px}px;height:${px * 1.15}px;flex:none"><div style="position:absolute;left:0;top:0;width:200px;height:230px;transform-origin:0 0;transform:scale(${px / 200})"><div style="position:absolute;inset:0;animation:${anim}">
${ab('left:97px;top:4px;width:6px;height:34px;background:#3B2A4A;border-radius:3px')}${ab('left:88px;top:0;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FF9AA2,#F2424F 60%);border:4px solid #3B2A4A;box-sizing:border-box')}
${arms}${ab('left:62px;top:194px;width:76px;height:32px;border-radius:0 0 38px 38px;background:#4A3D5C;border:4px solid #3B2A4A;box-sizing:border-box')}
${ab('left:18px;top:30px;width:164px;height:170px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#FFFFFF,#E6EEF4 45%,#B6C6D6);border:5px solid #3B2A4A;box-sizing:border-box;box-shadow:inset -10px -14px 0 rgba(90,110,140,.18)')}
${ab('left:10px;top:104px;width:22px;height:22px;border-radius:50%;background:#FFC93C;border:4px solid #3B2A4A;box-sizing:border-box')}${ab('right:10px;top:104px;width:22px;height:22px;border-radius:50%;background:#FFC93C;border:4px solid #3B2A4A;box-sizing:border-box')}
<div style="position:absolute;left:38px;top:62px;width:124px;height:90px;border-radius:30px;background:linear-gradient(#1E4D60,#0F2A38);border:5px solid #3B2A4A;box-sizing:border-box;box-shadow:inset 0 0 14px rgba(124,244,227,.35);overflow:hidden">${ab('left:12px;top:8px;width:30px;height:10px;border-radius:6px;background:rgba(255,255,255,.14);rotate:-12deg')}<div style="position:absolute;inset:0;animation:bipGlow 2.6s ease-in-out infinite">${face}</div></div>
${cheeks ? ab('left:44px;top:156px;width:20px;height:11px;border-radius:50%;background:#FF9FC6;opacity:.8') + ab('left:136px;top:156px;width:20px;height:11px;border-radius:50%;background:#FF9FC6;opacity:.8') : ''}
${o.extra || ''}</div></div></div>`;
}

/* Muddler — the cheeky gremlin. moods: idle giggle raspberry wave run flag. o.head = head only, o.noHat = hat blown off */
export function Muddler(mood, px, o = {}) {
  px = px || 160; mood = mood || 'idle';
  const head = !!o.head, F = { idle: ['open', 'grin'], giggle: ['shut', 'laugh'], raspberry: ['squeeze', 'tongue'], wave: ['open', 'laugh'], run: ['open', 'grin'], flag: ['open', 'smile'] }[mood] || ['open', 'grin'];
  const anim = o.still ? 'none' : mood === 'giggle' || mood === 'raspberry' ? 'mudShake .35s ease-in-out infinite' : mood === 'run' ? 'mudRun .3s ease-in-out infinite' : 'mudBob 2s ease-in-out infinite';
  const ab = (s, inner) => `<div style="position:absolute;${s}">${inner || ''}</div>`, K = '#3B2A4A', px1 = mood === 'run' ? 18 : 10;
  const blob = ab('left:28px;top:78px;width:144px;height:134px;border-radius:50% 50% 44% 44% / 58% 58% 42% 42%;background:radial-gradient(circle at 36% 30%,#C4F08E,#8BD45A 50%,#5FAF36);border:5px solid #3B2A4A;box-sizing:border-box');
  let h = '';
  if (!head && mood === 'flag') h += ab('left:168px;top:10px;width:6px;height:170px;background:#8A5A34;border-radius:3px;border:2px solid #3B2A4A') + ab('left:174px;top:14px;width:62px;height:44px;background:#FFFFFF;border:4px solid #3B2A4A;border-radius:4px 14px 14px 4px;box-sizing:border-box');
  if (!head) {
    h += ab('left:52px;top:200px;width:40px;height:22px;border-radius:50%;background:#3E8A2A;border:4px solid #3B2A4A;box-sizing:border-box') + ab('left:108px;top:200px;width:40px;height:22px;border-radius:50%;background:#3E8A2A;border:4px solid #3B2A4A;box-sizing:border-box');
    h += ab('left:16px;top:130px;width:30px;height:46px;border-radius:15px;background:#8BD45A;border:4px solid #3B2A4A;box-sizing:border-box;rotate:30deg');
    h += mood === 'wave' ? ab('left:150px;top:64px;width:30px;height:60px;border-radius:15px;background:#8BD45A;border:4px solid #3B2A4A;box-sizing:border-box;transform-origin:50% 100%;animation:mudWave .6s ease-in-out infinite') : ab('left:154px;top:130px;width:30px;height:46px;border-radius:15px;background:#8BD45A;border:4px solid #3B2A4A;box-sizing:border-box;rotate:-30deg');
    h += blob + ab('left:78px;top:176px;width:44px;height:20px;border-radius:50%;background:rgba(255,255,255,.28)');
  } else h += blob;
  const eye = (x) => ab(`left:${x}px;top:104px;width:40px;height:40px;border-radius:50%;background:#fff;border:4px solid ${K};box-sizing:border-box`, ab(`left:${px1}px;top:10px;width:15px;height:15px;border-radius:50%;background:${K}`));
  if (F.includes('open')) h += eye(54) + eye(104);
  if (F.includes('shut')) h += ab(`left:56px;top:116px;width:34px;height:18px;border-top:5px solid ${K};border-radius:18px 18px 0 0;box-sizing:border-box`) + ab(`left:108px;top:116px;width:34px;height:18px;border-top:5px solid ${K};border-radius:18px 18px 0 0;box-sizing:border-box`);
  if (F.includes('squeeze')) h += ab(`left:62px;top:112px;width:18px;height:18px;border-top:5px solid ${K};border-right:5px solid ${K};rotate:45deg`) + ab(`left:118px;top:112px;width:18px;height:18px;border-bottom:5px solid ${K};border-left:5px solid ${K};rotate:45deg`);
  if (F.includes('grin')) h += ab(`left:72px;top:150px;width:56px;height:26px;border-radius:0 0 30px 30px;background:${K}`, ab('left:14px;top:0;width:11px;height:10px;background:#fff;border-radius:0 0 4px 4px'));
  if (F.includes('laugh')) h += ab(`left:66px;top:146px;width:68px;height:38px;border-radius:10px 10px 36px 36px;background:${K};overflow:hidden`, ab('left:18px;top:20px;width:32px;height:24px;border-radius:50%;background:#FF7FC0') + ab('left:12px;top:0;width:12px;height:9px;background:#fff;border-radius:0 0 4px 4px'));
  if (F.includes('tongue')) h += ab(`left:74px;top:152px;width:52px;height:10px;border-radius:6px;background:${K}`) + ab(`left:86px;top:156px;width:28px;height:32px;border-radius:0 0 16px 16px;background:#FF7FC0;border:4px solid ${K};box-sizing:border-box`) + ab(`left:128px;top:150px;width:22px;height:4px;background:${K};border-radius:2px;rotate:-20deg`) + ab(`left:130px;top:164px;width:22px;height:4px;background:${K};border-radius:2px;rotate:10deg`);
  if (F.includes('smile')) h += ab(`left:78px;top:150px;width:44px;height:18px;border-bottom:5px solid ${K};border-radius:0 0 24px 24px;box-sizing:border-box`);
  const hat = ab('left:4px;top:66px;width:192px;height:40px;border-radius:50%;background:linear-gradient(#9A6BE8,#6A3FBE);border:5px solid #3B2A4A;box-sizing:border-box;rotate:-6deg') + ab('left:46px;top:4px;width:108px;height:82px;border-radius:44px 50px 10px 10px;background:linear-gradient(100deg,#A879F0,#7B4FC9);border:5px solid #3B2A4A;box-sizing:border-box;rotate:-10deg', ab('left:-4px;right:-4px;bottom:10px;height:16px;background:#FFC93C;border-top:4px solid #3B2A4A;border-bottom:4px solid #3B2A4A') + ab('left:62px;top:12px;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#FF9AA2,#F2424F 60%);border:4px solid #3B2A4A;box-sizing:border-box'));
  h += o.hatCls ? `<div class="${o.hatCls}" style="position:absolute;inset:0">${hat}</div>` : hat;
  return `<div class="mud" style="position:relative;width:${px}px;height:${head ? px : px * 1.15}px;flex:none;overflow:${head ? 'hidden' : 'visible'}"><div style="position:absolute;left:0;top:0;width:200px;height:230px;transform-origin:0 0;transform:scale(${head ? px / 205 : px / 200})"><div style="position:absolute;inset:0;animation:${anim};transform-origin:50% 90%">${h}${o.extra || ''}</div></div></div>`;
}
