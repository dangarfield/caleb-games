// duel-logic.js — pure sword-duel rules (no DOM, no THREE). Driven by duel.js.
// Track: 9 cells, 0 = player's rail (left) … 8 = enemy's rail (right). Start at 4.
// Push the enemy past cell 8 to win; get pushed past cell 0 to lose.

export const HEIGHTS = ['high', 'mid', 'low'];
export const HEIGHT_NAME = { high: 'High', mid: 'Middle', low: 'Low' };

export const WEAPONS = {
  rapier:    { id: 'rapier',    name: 'Rapier',    speed: 3, reach: 1, note: 'Fast, short reach', blurb: 'Quick to change your guard. Hard to land a hit from afar.',
               recover: 0.24, reachBonus: -0.06, openMul: 1.1, windMul: 0.85, blockBonus: -0.05 },
  cutlass:   { id: 'cutlass',   name: 'Cutlass',   speed: 2, reach: 2, note: 'Balanced',          blurb: 'A sailor’s blade. Good at everything.',
               recover: 0.34, reachBonus: 0.04, openMul: 1.0, windMul: 1.0, blockBonus: 0 },
  longsword: { id: 'longsword', name: 'Longsword', speed: 1, reach: 3, note: 'Slow, long reach',  blurb: 'Heavy and slow, but it hits from far away.',
               recover: 0.5, reachBonus: 0.16, openMul: 0.92, windMul: 1.18, blockBonus: 0.08 },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const TRACK_CELLS = 9;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const OPPOSITE = { high: 'low', mid: 'high', low: 'high' };

/**
 * createDuel(opts) → duel
 * opts: { skill 0..1, windowMul (player windows, age/fencing), speedMul (battleSpeed: >1 = slower/relaxed),
 *         gentle (difficulty window multiplier), pWeapon, eWeapon, pCrew, pMorale, eCrew, eMorale, solo, rng, emit(ev, data) }
 * Input: duel.parry(h), duel.strike(h). Loop: duel.update(dt).
 * Events emitted: windup{h}, feint{h}, enemyStrike{h}, block{h}, open{dur}, openEnd, hurt{h}, pstrike{h, result:'counter'|'clean'|'blocked'|'early'},
 *   eparry{h}, push{dir:+1|-1, by:'blade'|'crew'}, tip{text}, win, lose.
 */
export function createDuel(o) {
  const rng = o.rng || Math.random, emit = o.emit || (() => {});
  const pw = WEAPONS[o.pWeapon] || WEAPONS.cutlass, ew = WEAPONS[o.eWeapon] || WEAPONS.cutlass;
  const skill = clamp(o.skill == null ? 0.7 : o.skill, 0.2, 1);
  const W = (o.windowMul || 1) * (o.speedMul || 1) * (o.gentle || 1); // player's window multiplier
  const S = o.speedMul || 1;                                            // pace of the whole duel
  const d = {
    pos: 4, phase: 'ready', timer: 0, total: 0,
    eh: null, guard: null, guardT: 0, cool: 0, feinted: false, riposte: false,
    fav: HEIGHTS[Math.floor(rng() * 3)], recent: [],
    pCrew: Math.max(0, o.pCrew || 0), eCrew: Math.max(0, o.eCrew || 0), pCrew0: 0, eCrew0: 0,
    pMorale: clamp(o.pMorale == null ? 60 : o.pMorale, 0, 100), eMorale: clamp(o.eMorale == null ? 55 : o.eMorale, 0, 100),
    crewPush: 0, solo: !!o.solo, result: null, W, skill, stats: { blocks: 0, hits: 0, hurts: 0 },
    windupDur: 1, windupLeft: 0,
    parry, strike, update, forceEnd, strength, windupProgress,
  };
  d.pCrew0 = d.pCrew || 1; d.eCrew0 = d.eCrew || 1;
  const pauseDur = () => (0.9 + rng() * 1.0) * (1.25 - skill * 0.5) * S;
  d.timer = 1.4 * S; // breathing room at the start

  function strength(side) {
    const c = side === 'p' ? d.pCrew : d.eCrew, m = side === 'p' ? d.pMorale : d.eMorale;
    return c * (0.5 + m / 100);
  }
  function windupProgress() { return d.phase === 'windup' ? clamp(1 - d.windupLeft / d.windupDur, 0, 1) : 0; }

  function startWindup(short) {
    const h = rng() < 0.55 ? d.fav : HEIGHTS[Math.floor(rng() * 3)];
    d.eh = h; d.feinted = false; d.phase = 'windup';
    d.windupDur = d.windupLeft = (0.95 + (1 - skill) * 0.7) * ew.windMul * W * (short ? 0.8 : 1);
    d.recent.push(h); if (d.recent.length > 3) d.recent.shift();
    emit('windup', { h, dur: d.windupDur });
    const rep = d.recent.filter(x => x === h).length;
    if (rep >= 2) emit('tip', { text: `He keeps swinging ${h === 'mid' ? 'to the middle' : h}. Parry ${h === 'mid' ? 'middle' : h}, then strike ${OPPOSITE[h]}.` });
    else emit('tip', { text: `He’s swinging ${h === 'mid' ? 'to the middle' : h}! Parry ${HEIGHT_NAME[h].toLowerCase()}!` });
  }
  function push(dir, by) {
    d.pos += dir;
    if (dir > 0) { d.eMorale = clamp(d.eMorale - 5, 0, 100); d.pMorale = clamp(d.pMorale + 2, 0, 100); }
    else { d.pMorale = clamp(d.pMorale - 4, 0, 100); d.eMorale = clamp(d.eMorale + 2, 0, 100); }
    emit('push', { dir, by, pos: d.pos });
    if (d.pos > TRACK_CELLS - 1) end(true); else if (d.pos < 0) end(false);
  }
  function end(won) {
    if (d.result) return;
    d.pos = clamp(d.pos, -1, TRACK_CELLS); d.phase = 'over'; d.result = won ? 'won' : 'lost';
    emit(won ? 'win' : 'lose', {});
  }
  function forceEnd(won) { d.pos = won ? TRACK_CELLS : -1; end(!!won); }

  function parry(h) {
    if (d.phase === 'over' || d.cool > 0) return false;
    d.cool = pw.recover * 0.7;
    d.guard = h;
    d.guardT = d.phase === 'windup' ? 99 : 0.55 * W; // a guard raised during his wind-up holds until he swings
    return true;
  }
  function strike(h) {
    if (d.phase === 'over' || d.cool > 0) return false;
    d.cool = pw.recover; d.guard = null;
    if (d.phase === 'open') {
      d.stats.hits++; emit('pstrike', { h, result: 'counter' });
      d.phase = 'recover'; d.timer = 0.75 * S; push(+1, 'blade');
      if (!d.result) emit('tip', { text: 'Great counter! Keep watching his sword.' });
      return true;
    }
    if (d.phase === 'ready') {
      const land = clamp(0.5 - skill * 0.35 + pw.reachBonus - ew.blockBonus * 0.5 + (W > 1.2 ? 0.08 : 0), 0.08, 0.7);
      if (rng() < land) {
        d.stats.hits++; emit('pstrike', { h, result: 'clean' });
        d.phase = 'recover'; d.timer = 0.6 * S; push(+1, 'blade');
        if (!d.result) emit('tip', { text: 'A clean hit! He staggers back.' });
      } else {
        emit('pstrike', { h, result: 'blocked' }); emit('eparry', { h });
        emit('tip', { text: 'He blocked it! Parry his swing first, then strike while he’s open.' });
        d.timer = 0.28 * S; d.riposte = true; // he answers quickly
      }
      return true;
    }
    // during his wind-up / swing / recovery: he's ready for it
    emit('pstrike', { h, result: 'early' }); emit('eparry', { h });
    if (d.phase === 'windup') emit('tip', { text: `Too soon! Parry ${HEIGHT_NAME[d.eh].toLowerCase()} first.` });
    return true;
  }

  function update(dt) {
    if (d.phase === 'over') return;
    d.total += dt;
    if (d.cool > 0) d.cool -= dt;
    if (d.guard && d.guardT < 50) { d.guardT -= dt; if (d.guardT <= 0) d.guard = null; }

    // crews brawling behind: casualties (cosmetic) and the slow nudge of the stronger side
    if (!d.solo && d.pCrew + d.eCrew > 0) {
      const ps = strength('p'), es = strength('e');
      d.pCrew = Math.max(0, d.pCrew - dt * 0.0012 * es / S);
      d.eCrew = Math.max(0, d.eCrew - dt * 0.0012 * ps / S);
      const adv = (ps - es) / Math.max(1, ps + es);
      d.crewPush += adv * 0.11 * dt / S;
      if (Math.abs(d.crewPush) >= 1 && (d.phase === 'ready' || d.phase === 'recover')) {
        const dir = d.crewPush > 0 ? 1 : -1; d.crewPush -= dir;
        emit('tip', { text: dir > 0 ? 'Your crew is winning the brawl! They drive him back.' : 'His crew is pushing hard! Hold your ground.' });
        push(dir, 'crew'); if (d.result) return;
      }
    }

    if (d.phase === 'ready') {
      d.timer -= dt;
      if (d.timer <= 0) { startWindup(d.riposte); d.riposte = false; }
    } else if (d.phase === 'windup') {
      d.windupLeft -= dt;
      // skilled foes sometimes switch height half-way (a feint)
      if (!d.feinted && d.windupLeft < d.windupDur * 0.5 && skill >= 0.7 && rng() < (skill - 0.6) * 0.9 * dt * 4) {
        d.feinted = true;
        const nh = HEIGHTS.filter(x => x !== d.eh)[Math.floor(rng() * 2)];
        d.eh = nh; d.windupLeft += 0.4 * W; d.windupDur = d.windupLeft / 0.5; // progress resets to half-way
        if (d.guard && d.guardT > 50) d.guardT = 0.4 * W + 0.3; // old guard no longer locked in
        emit('feint', { h: nh }); emit('tip', { text: `A trick! He switched ${HEIGHT_NAME[nh].toLowerCase()}!` });
      }
      if (d.windupLeft <= 0) { d.phase = 'strike'; d.timer = 0.14; emit('enemyStrike', { h: d.eh }); }
    } else if (d.phase === 'strike') {
      d.timer -= dt;
      if (d.timer <= 0) {
        if (d.guard === d.eh) {
          d.stats.blocks++; d.guard = null;
          const dur = 1.25 * W * pw.openMul;
          emit('block', { h: d.eh }); d.phase = 'open'; d.timer = dur; emit('open', { dur });
          emit('tip', { text: 'Blocked! He’s open. STRIKE now!' });
        } else {
          d.stats.hurts++; d.guard = null;
          emit('hurt', { h: d.eh }); d.phase = 'recover'; d.timer = 0.75 * S; push(-1, 'blade');
          if (!d.result) emit('tip', { text: 'Ouch! Watch the glow. It shows where he’ll swing.' });
        }
      }
    } else if (d.phase === 'open') {
      d.timer -= dt;
      if (d.timer <= 0) { emit('openEnd', {}); d.phase = 'ready'; d.timer = pauseDur() * 0.6; emit('tip', { text: 'Too slow! Strike quickly after a block.' }); }
    } else if (d.phase === 'recover') {
      d.timer -= dt;
      if (d.timer <= 0) { d.phase = 'ready'; d.timer = pauseDur(); }
    }
  }
  return d;
}

/** Words for how a crew is doing (0..100 morale). */
export function spiritWords(m, crew) {
  if (crew <= 0) return 'beaten';
  return m >= 70 ? 'spirits high' : m >= 50 ? 'holding firm' : m >= 30 ? 'wavering' : 'breaking';
}
