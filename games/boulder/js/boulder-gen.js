// Boulder — route generator. Climbs a route into existence one move at a time, inserting the grade's
// signature move partway up; the grader (gradeRoute) then keeps only routes that truly need that move.
import { HOLD, BODY, LIMBS, isHand, validState, dynoLanding, dynoShoulder, buildLayout, gradeRoute, GRADE_NEEDS, GAP } from './boulder-core.js';

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const POOLS = {
  hands: { 0: ['jug'], 1: ['pinch', 'jug', 'jug'], 2: ['crimp', 'sloper', 'pinch', 'crimp'], 3: ['jug', 'pinch', 'crimp', 'jug'], 4: ['crimp', 'pinch', 'jug'], 5: ['pocket'], 6: ['pinch', 'crimp', 'jug'], 7: ['pinch', 'crimp', 'sloper'], 8: ['pocket'] },
  feet: { 0: ['jug'], 1: ['jug', 'pinch'], 2: ['crimp', 'pinch', 'jug'], 3: ['jug', 'crimp', 'pinch'], 4: ['crimp', 'pinch', 'jug'], 5: ['foot'], 6: ['foot', 'foot', 'crimp'], 7: ['foot', 'crimp'], 8: ['foot'] }
};
export const NAMES = {
  0: ['Green Ladder', 'Jungle Gym', 'Easy Peasy', 'First Steps', 'Bucket List'], 1: ['Yellow Zigzag', 'Squeezy', 'Sunny Side', 'Banana Split', 'Lemon Drop'],
  2: ['Blue Crimps', 'Fingertips', 'Ice Edges', 'Deep End', 'Blue Moon'], 3: ['Far Out', 'Giant Steps', 'Long Arms', 'Big Spender', 'Stretchy'],
  4: ['Sideways', 'Lean Machine', 'Under Over', 'Side Car', 'Wonky'], 5: ['Step Up', 'Knee High', 'High Kick', 'Stairway', 'Pocket Rocket'],
  6: ['Moon Jump', 'Leap Frog', 'Sky Hop', 'Kangaroo', 'Pogo'], 7: ['Zig Zap', 'Side Hop', 'Pinball', 'Ping Pong', 'Wobbler'], 8: ['Boss Wall', 'The Gauntlet', 'Final Exam', 'Thunder', 'Big Cheese']
};
export const MIXES = [['side', 'dyno'], ['high', 'cross'], ['side', 'high'], ['cross', 'dyno']];
const TOP_Y = 8.35;

export function generateRoute(grade, cx, seed, techs, lat = 0, half = 1.3) {
  const rnd = mulberry(seed), U = (a, b) => a + rnd() * (b - a), pick = a => a[Math.floor(rnd() * a.length)];
  const hp = POOLS.hands[grade], fp = POOLS.feet[grade], H = [];
  const STRICT = { cross: false, high: false };
  const fits = (x, y, r) => x - r >= cx - half && x + r <= cx + half && y - r >= .12 && y + r <= 9.0 && H.every(h => Math.hypot(h.x - x, h.y - y) >= h.r + r + GAP + .02);
  const tryHold = (type, x, y, dir, jump, test) => {
    const r = HOLD[type].r; if (!fits(x, y, r)) return null;
    H.push({ type, x, y, r, dir: dir || null, jump: !!jump }); const id = H.length - 1;
    const res = test(id); if (res) return res;
    H.pop(); return null;
  };
  let s = {};
  // start
  for (let k = 0; k < 60 && !s.LH; k++) {
    H.length = 0;
    const j = U(-.15, .15);
    H.push({ type: pick(fp), x: cx - .2 + j, y: U(.28, .4), r: .13, dir: null }, { type: pick(fp), x: cx + .22 + j, y: U(.3, .45), r: .13, dir: null });
    H.push({ type: pick(hp), x: cx - .22 + j, y: U(1.4, 1.55), r: .13, dir: null }, { type: pick(hp), x: cx + .22 + j, y: U(1.42, 1.6), r: .13, dir: null });
    H.forEach(h => h.r = HOLD[h.type].r);
    const s0 = { LF: 0, RF: 1, LH: 2, RH: 3 };
    if (validState(s0, H, STRICT)) s = s0;
  }
  if (!s.LH && s.LH !== 0) return null;
  const startState = { ...s }, sol = [{ ...s }];
  const reachT = grade === 3 ? .96 : grade === 0 ? .7 : .8;

  const moveHand = (l, opt = {}) => {
    const O = { cross: !!opt.cross, high: !!opt.high }, cur = H[s[l]], other = H[s[l === 'LH' ? 'RH' : 'LH']];
    let best = null;
    for (let k = 0; k < 70; k++) {
      const dir = opt.side ? pick(['left', 'right', 'under']) : null;
      const xr = opt.xr || (l === 'LH' ? opt.xrL || [-.95, .1] : opt.xrR || [-.1, .95]);
      let x = cx + U(xr[0], xr[1]), y = (cur ? cur.y : other.y) + U(opt.reach ? .35 : .22, opt.reach ? .85 : .75);
      if (opt.lead) { x = cur.x + opt.lead * U(.28, .62); y = cur.y + U(-.08, .3); }
      if (opt.trail) { x = other.x - opt.trail * U(.14, .42); y = other.y + U(-.18, .18); }
      const type = dir ? pick(['crimp', 'pinch']) : pick(hp);
      tryHold(type, x, y, dir, false, id => {
        const n = { ...s, [l]: id }, v = validState(n, H, O); if (!v) return null;
        const o = BODY.off[l], ratio = Math.hypot(H[id].x - v.p[0] - o[0], H[id].y - v.p[1] - o[1]) / BODY.arm;
        const prog = opt.lead ? (H[id].x - cur.x) * opt.lead * 1.4 : opt.trail ? (H[id].x - cur.x) * opt.trail : (y - (cur ? cur.y : 0)) * 1.2;
        const sc = prog - Math.abs(ratio - (opt.lead ? .82 : reachT)) * 2 + rnd() * .2;
        if (!best || sc > best.sc) best = { sc, h: { ...H[id] } };
        return null;
      });
    }
    if (!best) return false;
    H.push(best.h); s = { ...s, [l]: H.length - 1 }; sol.push({ ...s }); return true;
  };
  const moveFoot = (l, opt = {}) => {
    const O = { cross: !!opt.cross, high: !!(opt.high || opt.mustHigh) }, cur = H[s[l]];
    const vNow = validState(s, H, { cross: true, high: true }); if (!vNow) return false;
    let best = null;
    const taken = new Set(Object.values(s));
    H.forEach((h, id) => { // feet love old hand holds
      if (taken.has(id) || h.type === 'pocket' || h.type === 'top' || h.dir === 'under' || (opt.minY && h.y < opt.minY)) return;
      if (cur && (opt.lat ? (h.y < cur.y - .3 || Math.abs(h.x - cur.x) < .14) : h.y <= cur.y + .1)) return;
      const n = { ...s, [l]: id }, v = validState(n, H, O); if (!v) return;
      if (opt.mustHigh && (!v.high || validState(n, H, { ...O, high: false }))) return;
      const sc = (opt.lat ? (h.x - (cur ? cur.x : 0)) * opt.lat + h.y * .3 : h.y) + .12 + rnd() * .15;
      if (!best || sc > best.sc) best = { sc, id };
    });
    for (let k = 0; k < 70; k++) {
      const side = l === 'LF' ? -1 : 1;
      let y = opt.mustHigh ? vNow.p[1] + U(.05, .3) : (cur ? cur.y + (opt.lat ? U(-.25, .45) : U(.15, .75)) : vNow.p[1] - U(.4, .9));
      if (opt.minY) y = Math.max(y, opt.minY + U(0, .3));
      tryHold(opt.chip ? 'foot' : pick(fp), vNow.p[0] + side * U(.04, .42), y, null, false, id => {
        const n = { ...s, [l]: id }, v = validState(n, H, O); if (!v) return null;
        if (opt.mustHigh && (!v.high || validState(n, H, { ...O, high: false }))) return null;
        const sc = (opt.lat ? (H[id].x - (cur ? cur.x : 0)) * opt.lat + y * .3 : y) + rnd() * .15;
        if (!best || sc > best.sc) best = { sc, h: { ...H[id] } };
        return null;
      });
    }
    if (!best) return false;
    if (best.id != null) s = { ...s, [l]: best.id }; else { H.push(best.h); s = { ...s, [l]: H.length - 1 }; }
    sol.push({ ...s }); return true;
  };
  const lowerHand = () => H[s.LH].y <= H[s.RH].y ? 'LH' : 'RH';
  const lowerFoot = () => s.LF == null ? 'LF' : s.RF == null ? 'RF' : H[s.LF].y <= H[s.RF].y ? 'LF' : 'RF';
  const handY = () => Math.max(H[s.LH].y, H[s.RH].y);
  const feetUp = (n = 2, opt) => { for (let i = 0; i < n; i++) if (!moveFoot(lowerFoot(), opt)) return false; return true; };
  let travDir = rnd() < .5 ? 1 : -1, trav = 0;
  const traverse = () => {
    const lead = travDir > 0 ? 'RH' : 'LH', trail = lead === 'RH' ? 'LH' : 'RH';
    if (!moveHand(lead, { lead: travDir })) return false;
    if (!moveHand(trail, { trail: travDir })) return false;
    const f1 = travDir > 0 ? 'RF' : 'LF', f2 = f1 === 'RF' ? 'LF' : 'RF';
    if (!moveFoot(f1, { lat: travDir })) return false;
    return moveFoot(f2, { lat: travDir });
  };
  const roomAhead = () => { const x = H[s[travDir > 0 ? 'RH' : 'LH']].x; return travDir > 0 ? x < cx + half - .55 : x > cx - half + .55; };
  const cycle = (opt = {}) => {
    const a = lowerHand(); if (!moveHand(a, opt)) return false;
    const b = a === 'LH' ? 'RH' : 'LH'; if (!moveHand(b, opt)) return false;
    return feetUp(2);
  };

  const special = {
    cross: () => {
      // traverse: A (far left) -> B (middle) -> C (far right). RH cannot span A..C, so LH must cross over to C.
      const cX = cx + U(.78, .86), y0 = Math.max(H[s.LH].y, H[s.RH].y) + U(.1, .35);
      const place = (l, fx, fy, type) => {
        for (let round = 0; round < 3; round++) {
          for (let k = 0; k < 40; k++) { const id = tryHold(type || pick(hp), fx(), fy(), null, false, id => validState({ ...s, [l]: id }, H, STRICT) ? id : null); if (id != null) { s = { ...s, [l]: id }; sol.push({ ...s }); return true; } }
          if (!moveFoot(lowerFoot(), {})) return false;
        }
        return false;
      };
      if (!place('LH', () => cX - U(1.62, 1.7), () => y0 + U(-.1, .1), 'pinch')) return false;
      if (!place('RH', () => cX - U(.6, .7), () => H[s.LH].y + U(-.05, .15))) return false;
      if (!feetUp(2)) return false;
      let okC = null;
      for (let k = 0; k < 4 && okC == null; k++) {
        for (let q = 0; q < 30 && okC == null; q++) okC = tryHold('pinch', cX + U(-.03, .03), H[s.RH].y + U(-.05, .22), null, false, id => {
          if (!validState({ ...s, LH: id }, H, { cross: true })) return null;
          if (validState({ ...s, RH: id }, H, STRICT)) return null;
          return id;
        });
        if (okC == null && !moveFoot(lowerFoot(), {})) break;
      }
      if (okC == null) return false; s = { ...s, LH: okC }; sol.push({ ...s });
      // RH goes up past C on the far right, which uncrosses the hands
      let okD = null;
      for (let q = 0; q < 50 && okD == null; q++) okD = tryHold('pinch', H[s.LH].x + U(0, .07), H[s.LH].y + U(.32, .55), null, false, id => {
        const v = validState({ ...s, RH: id }, H, { cross: true }); return v && !v.crossed ? id : null;
      });
      if (okD == null) return false; s = { ...s, RH: okD }; sol.push({ ...s });
      if (!feetUp(2)) return false;
      // keep to the right for a while so the way on starts from C
      for (let i = 0; i < 2; i++) if (!cycle({ xrL: [.15, .7], xrR: [.45, .95] })) return false;
      return true;
    },
    side: () => { for (let i = 0; i < 2; i++) if (!cycle({ side: true })) return false; return true; },
    high: () => {
      // a foot goes ~1 m above the other foot: only reachable as a high step, then stand up on it
      for (let i = 0; i < 2; i++) {
        const other = lowerFoot(), mv = other === 'LF' ? 'RF' : 'LF', v = validState(s, H, { cross: true, high: true }); if (!v || s[other] == null) return false;
        let ok = null;
        for (let k = 0; k < 80 && ok == null; k++) {
          ok = tryHold(pick(fp), v.p[0] + (mv === 'LF' ? -1 : 1) * U(.08, .4), H[s[other]].y + U(.98, 1.16), null, false, id => {
            const n = { ...s, [mv]: id }, vv = validState(n, H, {}); if (!vv || validState(n, H, { high: false })) return null;
            return id;
          });
        }
        if (ok == null) return false; s = { ...s, [mv]: ok }; sol.push({ ...s });
        const a = lowerHand(); if (!moveHand(a, { high: true, reach: true })) return false;
        if (!moveFoot(other, { high: true, minY: H[ok].y - .12, chip: true })) return false;
        if (!moveHand(a === 'LH' ? 'RH' : 'LH', { high: true })) return false;
      }
      return true;
    },
    dyno: () => {
      const l = lowerHand(), oh = l === 'LH' ? 'RH' : 'LH';
      for (let i = 0; i < 2 && H[s[oh]].y < Math.min(H[s.LF].y, H[s.RF].y) + 1.25; i++) if (!moveHand(oh, { reach: true })) return false;
      const v = validState(s, H, { cross: true, high: true }); if (!v) return false;
      const o = BODY.off[l], fy = Math.min(H[s.LF].y, H[s.RF].y); let jumped = false;
      for (let k = 0; k < 80; k++) {
        const tall = dynoShoulder(s, l, H, v.p), lo = fy + 2.02, hi = Math.min(fy + 2.36, H[s[oh]].y + 1.18);
        if (hi <= lo + .02) return false;
        const x = tall[0] + U(-.25, .25), y = U(lo, hi);
        const land = tryHold('jug', x, y, null, true, id => {
          if (validState({ ...s, [l]: id }, H, { cross: true, high: true })) return null;
          const land = dynoLanding(s, l, id, H, v.p, {}); return land && land.LF == null ? land : null;
        });
        if (land) { s = land; sol.push({ ...s }); jumped = true; break; }
      }
      if (!jumped) return false;
      if (!feetUp(2, { minY: fy + 1.25, chip: true })) return false;
      return moveHand(l === 'LH' ? 'RH' : 'LH', {});
    }
  };
  const triggers = techs.map((t, i) => ({ t, y: techs.length > 1 ? (i ? 5.4 : 2.9) : 3.4, done: false }));
  let n = 0;
  while (handY() < TOP_Y - .6) {
    if (++n > 70) return null;
    const tr = triggers.find(t => !t.done && handY() >= t.y && special[t.t]);
    if (tr) { tr.done = true; if (!special[tr.t]()) return null; continue; }
    if (lat > 0 && rnd() < lat && handY() > 2.2 && handY() < TOP_Y - 1.4) {
      if (!roomAhead()) travDir = -travDir;
      if (roomAhead()) { const before = sol.length; traverse(); if (sol.length > before) { trav += sol.length - before; continue; } }
    }
    if (!cycle({ reach: grade === 3, cycleN: n })) return null;
  }
  if (triggers.some(t => special[t.t] && !t.done)) return null;
  // top: both hands must fit on it
  let top = null;
  for (let tries = 0; tries < 3 && top == null; tries++) {
    for (let k = 0; k < 60 && top == null; k++) {
      top = tryHold('top', cx + U(-.25, .25), Math.min(8.7, handY() + U(.2, .6)), null, false, id => {
        const st = { ...s }; const a = lowerHand();
        const s1 = { ...st, [a]: id }; if (!validState(s1, H, { cross: true })) return null;
        const s2 = { ...s1, [a === 'LH' ? 'RH' : 'LH']: id }; if (!validState(s2, H, { cross: true })) return null;
        return [s1, s2, id];
      });
    }
    if (top == null && !feetUp(1)) return null;
  }
  if (!top) return null;
  sol.push(top[0], top[1]);
  const topIdx = top[2];
  // reorder so the top is last; holds -> data rows
  const order = H.map((_, i) => i).filter(i => i !== topIdx).concat([topIdx]), map = new Map(order.map((o, i) => [o, i]));
  const rows = order.map(i => { const h = H[i], row = [h.type, +(h.x - cx).toFixed(3), +h.y.toFixed(3)]; if (h.dir || h.jump) row.push(h.dir || null); if (h.jump) row.push('J'); return row; });
  const start = {}; for (const l of LIMBS) start[l] = map.get(startState[l]);
  return { grade, cx, start, holds: rows, trav };
}

// Generate until a route passes the grader for its grade.
export function makeRoute(grade, cx, seed0, tries = 40, deadline = Infinity, lat = 0) {
  const techs = GRADE_NEEDS[grade];
  for (let k = 0; k < tries && Date.now() < deadline; k++) {
    const seed = seed0 + k * 7919, p = generateRoute(grade, cx, seed, techs, lat);
    if (!p) continue;
    const L = buildLayout(0, [{ problems: [p] }], false), g = gradeRoute(L, 0);
    if (!g.ok) continue;
    const need = techs.every(t => g.required.includes(t));
    const clean = techs.length ? true : g.required.length === 0 && (grade !== 3 || g.reachAvg >= .88);
    if (!need || !clean || g.minGrip < .25 || g.moves < 16 || g.moves > 64) continue;
    return { p, g, seed, tries: k + 1 };
  }
  return null;
}
