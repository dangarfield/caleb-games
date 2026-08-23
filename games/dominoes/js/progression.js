// Achievements are the ONLY currency: no coins, no shop, no grind. Twenty-two of them,
// each granting one concrete, visible upgrade. The count is never written down outside
// this file — ACH_COUNT is ACHIEVEMENTS.length, so "N of 22 badges" follows the table.
//
// Pure data and pure functions — no DOM, no Three.js, no Rapier (the stone-skip
// progression.js model). Everything is derived, which is the important structural
// decision here: there is no separate "owned items" list to keep in step with the
// achievement list, so there is nothing that can drift out of sync and no migration to
// write when the table changes. What you have unlocked is always, by definition,
// exactly what your earned set implies.
//
// TWO DELIBERATE DEVIATIONS FROM THE PLAN'S TABLE, both to break dependency loops:
//
//  * Rainbow ("use 4+ colours in one run") was listed as unlocking the colour palette,
//    which it needs in order to be earned. All eight colours are therefore available
//    from the start, and Rainbow unlocks the domino PATTERNS instead.
//  * Each prerequisite item is now granted one step BEFORE the achievement that needs
//    it: Long Line grants the Ball Run (whose marble earns Strike), Fifty Down grants the splitter
//    (for Two Ways), Two Ways grants the bridge (for Bridge Builder), Bridge Builder
//    grants the tower (for Tumbling Tower), Tumbling Tower grants the confetti cannon
//    (for Grand Finale). The bell is free from the start so that Ding! is reachable in
//    the first minute.
//
// The plan specified table tiers up to Huge and budgets up to 500 but only said where
// Medium/Large and 150/300 came from, so Grand Finale grants the Huge table.
//
// THIRD DEVIATION, same reason - the ladder has to be walkable from a fresh save. See
// upgradeBudget() below: every budget rung is now earned by a target that fits inside
// the rung before it. Clockwork therefore grants a cosmetic (the gold skin) rather than
// a budget jump, because it was the only escape from a 60-domino wall and reaching it
// requires collecting five different tricks, which is not what a child who wants a
// longer line is trying to do.

import { TABLE_ORDER, BUDGETS } from './consts.js';

/**
 * ctx = {
 *   run:        the sim's run stats for the run that just finished
 *   stats:      the player's lifetime stats
 *   challenges: { ch1: 1, ... }
 *   dominoCap:  this device's hard cap (for the honest Two Fifty target)
 * }
 */
export const ACHIEVEMENTS = [
  {
    id: 'firstfall', icon: 'gi-domino-tiles', name: 'First Fall',
    desc: 'Topple 10 dominoes in one run', gives: 'The Arc tool',
    check: (c) => c.run.fell >= 10,
    prog: (c) => Math.min(1, c.stats.bestRun / 10),
  },
  {
    id: 'longline', icon: 'gi-measure-tape', name: 'Long Line',
    desc: 'Topple 25 dominoes in one run', gives: 'The Ball Run',
    check: (c) => c.run.fell >= 25,
    prog: (c) => Math.min(1, c.stats.bestRun / 25),
  },
  {
    id: 'bend', icon: 'gi-spiral-arrow', name: 'Round the Bend',
    desc: 'Topple a curved run', gives: 'The spacing dial',
    check: (c) => c.run.curvedFell >= 6,
    prog: (c) => Math.min(1, (c.run.curvedFell || 0) / 6),
  },
  {
    id: 'fifty', icon: 'gi-bright-explosion', name: 'Fifty Down',
    desc: 'Topple 50 dominoes in one run', gives: 'Medium table + Splitter + 150 dominoes',
    check: (c) => c.run.fell >= 50,
    prog: (c) => Math.min(1, c.stats.bestRun / 50),
  },
  {
    id: 'ding', icon: 'gi-ringing-bell', name: 'Ding!',
    desc: 'Ring a bell with your run', gives: 'Chimes + Xylophone',
    check: (c) => c.run.bells >= 1,
    prog: (c) => (c.stats.bells ? 1 : 0),
  },
  {
    // The Bowling Ball used to be the obvious way to earn this and it has been removed — it
    // did not work well enough to be the gate on a rung of the ladder. The id and the icon
    // stay, because saves store the id.
    //
    // The rung had to be RE-GATED, not just re-worded, and only measuring showed why. It used
    // to ask for 10 with one ball; sim.js credits a ball for every domino that falls within
    // 60 mm of it while it is moving, and a domino wave leaves any ball in this game standing
    // — measured, a marble rolled into the end of a 24-domino line is credited with exactly
    // 1 (research/dfix.cjs, the `strike` suite). So 10 was unreachable and this rung, which
    // hands out the Springboard AND the Pinwheel, was a dead end. It now asks for a ball to
    // START a run of 25, which is a bowling strike in the sense a child means it: one ball,
    // and the whole pack goes down.
    id: 'strike', icon: 'gi-bowling-strike', name: 'Strike',
    desc: 'Knock a run of 25 down with a rolling ball', gives: 'Springboard + Pinwheel',
    check: (c) => c.run.bestBallKnock >= 1 && c.run.fell >= 25,
    prog: (c) => Math.min(1, (c.stats.bestBallKnock ? c.stats.bestRun : 0) / 25),
  },
  {
    id: 'twoways', icon: 'gi-split-arrows', name: 'Two Ways',
    desc: 'Fork a run with the Splitter', gives: 'The Bridge',
    check: (c) => c.run.forkL >= 3 && c.run.forkR >= 3,
    prog: (c) => Math.min(1, (Math.min(c.run.forkL, c.run.forkR) || 0) / 3),
  },
  {
    id: 'century', icon: 'gi-star-medal', name: 'Century',
    desc: 'Topple 100 dominoes in one run', gives: 'Loop the Loop + 300 dominoes',
    check: (c) => c.run.fell >= 100,
    prog: (c) => Math.min(1, c.stats.bestRun / 100),
  },
  {
    id: 'bridged', icon: 'gi-arch-bridge', name: 'Bridge Builder',
    desc: 'Topple a domino up off the table', gives: 'Stairs + The Tower',
    check: (c) => c.run.elevated === 1,
    prog: (c) => (c.stats.elevated ? 1 : 0),
  },
  // `wrecked` ("Land a wrecking-ball hit") used to sit here and granted the Tower. The
  // Wrecking Ball was removed, so the badge went with it and Bridge Builder hands out the
  // Tower directly — otherwise Tumbling Tower, and the Confetti Cannon behind it, would be
  // unreachable. Old saves may still carry `wrecked: 1`; nothing reads it, and earnedCount
  // walks this table, so a stale key cannot inflate the badge count.
  {
    id: 'tower', icon: 'gi-stone-tower', name: 'Tumbling Tower',
    desc: 'Collapse a tower stack', gives: 'Confetti Cannon',
    check: (c) => c.run.towerCollapsed === 1,
    prog: (c) => (c.run.items && c.run.items.tower ? 0.5 : 0),
  },
  {
    id: 'rainbow', icon: 'gi-rainbow-star', name: 'Rainbow',
    desc: 'Topple 4 different colours in one run', gives: 'Domino patterns',
    check: (c) => c.run.colours >= 4,
    prog: (c) => Math.min(1, c.stats.maxColours / 4),
  },
  {
    id: 'finale', icon: 'gi-firework-rocket', name: 'Grand Finale',
    desc: 'Set off the confetti cannon', gives: 'Huge table',
    check: (c) => c.run.confettiFired === 1,
    prog: (c) => (c.stats.confetti ? 1 : 0),
  },
  {
    id: 'twofifty', icon: 'gi-tower-fall', name: 'Two Fifty',
    // The target bends to the device, because on the Low tier the hard cap IS 250 and
    // an achievement that needs every single domino to fall is not an achievement, it
    // is a coin flip. The panel shows the real number so it is never a surprise.
    desc: 'Topple a really big run',
    gives: 'Large table + Budget: 500',
    target: (c) => Math.min(250, Math.max(60, Math.round(c.dominoCap * 0.9))),
    check: (c) => c.run.fell >= Math.min(250, Math.max(60, Math.round(c.dominoCap * 0.9))),
    prog: (c) => Math.min(1, c.stats.bestRun / Math.min(250, Math.max(60, Math.round(c.dominoCap * 0.9)))),
  },
  {
    id: 'clockwork', icon: 'gi-gears', name: 'Clockwork',
    desc: 'Set off 5 different tricks in one run', gives: 'Gold skin',
    check: (c) => c.run.itemCount >= 5,
    prog: (c) => Math.min(1, (c.stats.maxChain || 0) / 5),
  },
  {
    id: 'architect', icon: 'gi-pencil-ruler', name: 'Architect',
    desc: 'Save 5 creations', gives: 'More save slots',
    check: (c) => c.stats.saveCount >= 5,
    prog: (c) => Math.min(1, c.stats.saveCount / 5),
  },
  {
    id: 'ch1', icon: 'gi-rank-1', name: 'Ring the Bell',
    desc: 'Finish challenge 1', gives: 'Wood table',
    check: (c) => !!c.challenges.ch1,
    prog: (c) => (c.challenges.ch1 ? 1 : 0),
  },
  {
    id: 'ch2', icon: 'gi-rank-2', name: 'Both Sides',
    desc: 'Finish challenge 2', gives: 'Ice table',
    check: (c) => !!c.challenges.ch2,
    prog: (c) => (c.challenges.ch2 ? 1 : 0),
  },
  {
    id: 'ch3', icon: 'gi-rank-3', name: 'Over the Wall',
    desc: 'Finish challenge 3', gives: 'Neon Grid table',
    check: (c) => !!c.challenges.ch3,
    prog: (c) => (c.challenges.ch3 ? 1 : 0),
  },
  {
    id: 'ch4', icon: 'gi-trophy', name: 'The Big One',
    desc: 'Finish challenge 4', gives: 'Deep Space table',
    check: (c) => !!c.challenges.ch4,
    prog: (c) => (c.challenges.ch4 ? 1 : 0),
  },
  // The three launcher challenges. Each one LENDS its trick for the duration (grant, in
  // challenges.js) and clearing it keeps the trick for good, because the item's `unlock`
  // key is this very achievement id. That is the whole reason a child plays them.
  {
    id: 'ch5', icon: 'gi-spiral-arrow', name: 'Through the Hoop',
    desc: 'Finish challenge 5', gives: 'Fire Jump + Candy Floss table',
    check: (c) => !!c.challenges.ch5,
    prog: (c) => (c.challenges.ch5 ? 1 : 0),
  },
  {
    id: 'ch6', icon: 'gi-firework-rocket', name: 'Blast Off',
    desc: 'Finish challenge 6', gives: 'The Rocket + Lava Rock table',
    check: (c) => !!c.challenges.ch6,
    prog: (c) => (c.challenges.ch6 ? 1 : 0),
  },
  {
    id: 'ch7', icon: 'gi-tower-fall', name: 'Down the Tower',
    desc: 'Finish challenge 7', gives: 'Slalom Tower + Gold Leaf table',
    check: (c) => !!c.challenges.ch7,
    prog: (c) => (c.challenges.ch7 ? 1 : 0),
  },
];

export const ACH_BY_ID = {};
for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;
export const ACH_COUNT = ACHIEVEMENTS.length;

/**
 * Award anything newly earned. Already-earned rows are skipped without running their
 * check, so this is cheap enough to call after every single run.
 * @returns the newly earned achievement objects, in table order
 */
export function settleAchievements(earned, ctx) {
  const fresh = [];
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    if (earned[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch (e) { ok = false; }
    if (ok) { earned[a.id] = 1; fresh.push(a); }
  }
  return fresh;
}

// ==========================================================================
// DERIVED UPGRADES
// ==========================================================================

/** Which trick items are available. The keys match `unlock` in items-def.js. */
export function unlockSet(earned) {
  const s = new Set();
  for (const id in earned) if (earned[id]) s.add(id);
  return s;
}

/** Biggest table this player has earned. */
export function tableFor(earned) {
  let tier = 0;
  if (earned.fifty) tier = 1;
  if (earned.twofifty) tier = 2;
  if (earned.finale) tier = 3;
  return TABLE_ORDER[tier];
}
export function tableTier(earned) { return TABLE_ORDER.indexOf(tableFor(earned)); }

/**
 * Domino budget from upgrades alone, before the device cap is applied.
 *
 * THE LADDER MUST BE WALKABLE, and it was not. Budget 150 used to be gated behind
 * Century ("topple 100 in one run") while the starting budget was 60, so the only escape
 * was Clockwork ("5 different tricks in one run") which jumped straight to 500 - leaving
 * the 150 and 300 tiers as dead content and a child who just wants a long line stuck at
 * 60 forever. Each rung is now earned by a target that is reachable INSIDE the previous
 * rung: 50 of 60, then 100 of 150, then ~225 of 300.
 */
export function upgradeBudget(earned) {
  let tier = 0;
  if (earned.fifty) tier = 1;        // 150, from "topple 50" - reachable inside 60
  if (earned.century) tier = 2;      // 300, from "topple 100" - reachable inside 150
  if (earned.twofifty) tier = 3;     // 500, from "topple ~225" - reachable inside 300
  return BUDGETS[tier];
}

/**
 * The number of dominoes you may actually place. The device cap is real and it is
 * allowed to bind: the honest thing is to show BOTH numbers rather than silently
 * truncate a run, because silent truncation reads to a kid as a bug.
 */
export function effectiveBudget(earned, tierCap) {
  return Math.min(upgradeBudget(earned), tierCap);
}
export function budgetIsCapped(earned, tierCap) {
  return upgradeBudget(earned) > tierCap;
}

/** Editor features, all derived. */
export function tools(earned) {
  return {
    arc: !!earned.firstfall,
    spacing: !!earned.bend,
    patterns: !!earned.rainbow,
    gold: !!earned.clockwork,
    slots: earned.architect ? 12 : 4,
  };
}

/** Table surfaces this player may choose. Felt is always there. */
export function surfacesFor(earned) {
  const s = ['felt'];
  if (earned.ch1) s.push('wood');
  if (earned.ch2) s.push('ice');
  if (earned.ch3) s.push('neon');
  if (earned.ch4) s.push('space');
  if (earned.ch5) s.push('candy');
  if (earned.ch6) s.push('lava');
  if (earned.ch7) s.push('gold');
  return s;
}

/** Skins this player may choose. */
export function skinsFor(earned) {
  const s = ['plain'];
  if (earned.rainbow) { s.push('stripe'); s.push('spots'); }
  if (earned.clockwork) s.push('gold');
  return s;
}

export function earnedCount(earned) {
  let n = 0;
  for (let i = 0; i < ACHIEVEMENTS.length; i++) if (earned[ACHIEVEMENTS[i].id]) n++;
  return n;
}

/** Fold a finished run into the lifetime stats (what the progress bars read). */
export function foldStats(stats, run) {
  stats.runs = (stats.runs || 0) + 1;
  stats.totalFallen = (stats.totalFallen || 0) + run.fell;
  if (run.fell > (stats.bestRun || 0)) stats.bestRun = run.fell;
  if (run.bestBallKnock > (stats.bestBallKnock || 0)) stats.bestBallKnock = run.bestBallKnock;
  if (run.colours > (stats.maxColours || 0)) stats.maxColours = run.colours;
  if (run.itemCount > (stats.maxChain || 0)) stats.maxChain = run.itemCount;
  if (run.bells) stats.bells = (stats.bells || 0) + run.bells;
  if (run.elevated) stats.elevated = 1;
  if (run.confettiFired) stats.confetti = (stats.confetti || 0) + 1;
  return stats;
}
