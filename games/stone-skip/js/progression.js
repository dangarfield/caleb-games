// Skip Points, achievements and the unlock shop. Pure data + pure functions:
// nothing here touches Three.js or the DOM, so the whole economy can be reasoned
// about (and node-checked) on its own.

import { TARGETS } from './targets.js';
import { ROCK_KINDS, SPECIAL_STONES } from './stones.js';

// --- currency ---------------------------------------------------------------
// Tuned so a modest throw (5 skips, 45 m) pays ~25 and a great one (12 skips,
// 85 m, perfect release) pays ~60. The first cosmetics are 3-4 throws away, the
// whole shop is a long tail of a hundred-odd throws plus the achievements.
export const POINTS = {
  perSkip: 3,
  per10m: 2,
  perfect: 8,
  great: 3,
  newBestSkips: 15,
  newBestDistance: 12,
};

/** Skip Points earned by one throw (before achievement bonuses). */
export function throwPoints(t) {
  let p = t.skips * POINTS.perSkip + Math.floor(t.distance / 10) * POINTS.per10m;
  if (t.grade === 'perfect') p += POINTS.perfect;
  else if (t.grade === 'great') p += POINTS.great;
  if (t.newBestSkips) p += POINTS.newBestSkips;
  if (t.newBestDistance) p += POINTS.newBestDistance;
  return p;
}

// --- unlocks / shop ---------------------------------------------------------
// The shop comes before the achievements because the collection badges below are
// DERIVED from it: their name, icon and completion all come from the unlock row,
// so a new unlock can never drift from its badge.
export const SHOP_GROUPS = ['Special stones', 'New throwing spots', 'Arm strength', 'Lake life', 'Day & night', 'Looks'];

/** Price per special stone, cheapest first (the display order too). */
const STONE_PRICE = { rainbow: 180, feather: 260, slate: 300, rune: 420, golden: 550 };

export const UNLOCKS = [
  // Special stones. The row describes WHAT THE STONE DOES: the effect line comes
  // straight from the definition in stones.js, so the card can never drift from
  // the physics. (How you get one — it washes up among the loose rocks on a
  // one-minute timer — is shown as live state on the stone-bag card instead.)
  ...SPECIAL_STONES.map(s => ({
    id: s.unlock, group: 'Special stones', kind: 'stone', stone: s.id,
    icon: s.icon, name: s.name, desc: s.effect, price: STONE_PRICE[s.id],
  })),

  // new throwing spots
  { id: 'spot_rocky', group: 'New throwing spots', kind: 'spot', spot: 'rocky', icon: '🪨', name: 'Rocky Point', desc: 'Boulders and deep water off the point', price: 150 },
  { id: 'spot_dock', group: 'New throwing spots', kind: 'spot', spot: 'dock', icon: '🚣', name: 'Boat Dock', desc: 'Moored rowboats and a long clear lane', price: 220 },
  { id: 'spot_lily', group: 'New throwing spots', kind: 'spot', spot: 'lily', icon: '🪷', name: 'Lily-Pad Cove', desc: 'Big lily raft to land on', price: 280 },
  { id: 'spot_falls', group: 'New throwing spots', kind: 'spot', spot: 'falls', icon: '💦', name: 'Waterfall Inlet', desc: 'Skip out past the falling water', price: 360 },
  { id: 'spot_cliff', group: 'New throwing spots', kind: 'spot', spot: 'cliff', icon: '🧗', name: 'Cliff Ledge', desc: 'High up — throws fly for ages', price: 460 },
  { id: 'spot_mist', group: 'New throwing spots', kind: 'spot', spot: 'mist', icon: '🌫️', name: 'Misty Far Shore', desc: 'The widest water in the lake', price: 600 },

  // arm strength (two tiers; each raises the ceiling AND speeds the bar up)
  { id: 'arm1', group: 'Arm strength', kind: 'arm', level: 1, icon: '💪', name: 'Arm Strength I', desc: 'Throw harder — and the power bar sweeps faster', price: 300 },
  { id: 'arm2', group: 'Arm strength', kind: 'arm', level: 2, icon: '💪', name: 'Arm Strength II', desc: 'Even harder, even faster. Needs Arm Strength I', price: 700, needs: 'arm1' },

  // lake life
  { id: 'fish', group: 'Lake life', kind: 'fish', icon: '🐟', name: 'See The Fish', desc: 'Fish appear under the surface — and one might swallow your stone', price: 200 },

  // themes
  { id: 'theme_sunset', group: 'Day & night', kind: 'theme', theme: 'sunset', icon: '🌇', name: 'Sunset', desc: 'Golden evening light on the water', price: 240 },
  { id: 'theme_misty', group: 'Day & night', kind: 'theme', theme: 'misty', icon: '🌁', name: 'Misty Morning', desc: 'Soft grey mist and still water', price: 300 },
  { id: 'theme_night', group: 'Day & night', kind: 'theme', theme: 'night', icon: '🌙', name: 'Starry Night', desc: 'Stars, moonlight and reflections', price: 420 },

  // cosmetics
  { id: 'hat_cap', group: 'Looks', kind: 'hat', hat: 'cap', icon: '🧢', name: 'Cap', desc: 'A little cap on your hand', price: 60 },
  { id: 'splash_gold', group: 'Looks', kind: 'splash', splash: 'gold', icon: '✨', name: 'Golden Splashes', desc: 'Every skip splashes gold', price: 70 },
  { id: 'trail_sparkle', group: 'Looks', kind: 'trail', trail: 'sparkle', icon: '🌟', name: 'Sparkle Trail', desc: 'Sparkles follow the stone', price: 90 },
  { id: 'trail_bubble', group: 'Looks', kind: 'trail', trail: 'bubble', icon: '🫧', name: 'Bubble Trail', desc: 'A line of bubbles behind the stone', price: 120 },
  { id: 'splash_rainbow', group: 'Looks', kind: 'splash', splash: 'rainbow', icon: '🌈', name: 'Rainbow Splashes', desc: 'Skips splash every colour', price: 130 },
  { id: 'hat_crown', group: 'Looks', kind: 'hat', hat: 'crown', icon: '👑', name: 'Crown', desc: 'For the king of skipping', price: 150 },
  { id: 'hat_wizard', group: 'Looks', kind: 'hat', hat: 'wizard', icon: '🧙', name: 'Wizard Hat', desc: 'Stone magic', price: 190 },
];

export function unlockById(id) { return UNLOCKS.find(u => u.id === id) || null; }

/** Every unlock of one kind (`spot`, `theme`, `trail`, `splash`, `hat`, …). */
export function unlocksOfKind(kind) { return UNLOCKS.filter(u => u.kind === kind); }

// --- achievements -----------------------------------------------------------
// ONE list, one word: everything you can earn is an achievement. The 12 lake
// targets (targets.js) are simply its first group — they are detected in flight
// rather than by a stats check, which is the only difference.
// `check(c)` sees { t: this throw, s: cumulative stats, save }.
// `prog(s, save)` is optional and returns [have, need] so a counting achievement
// can show how far along it is ("247 / 500"). Only add it where a running count
// reads naturally: a one-off trick shot ("0 / 1") tells you nothing.
const TARGET_PTS = {
  skip3: 20, skip6: 30, skip10: 60, dist60: 25, dist80: 45,
  buoyRed: 35, buoyYellow: 40, buoyBlue: 70, ring: 55, bridge: 50,
  island: 60, reeds: 45,
};

const BASE_SPOTS = ['west', 'reeds', 'main', 'pier', 'willow', 'cove'];

export const ACH_GROUPS = ['Lake targets', 'Skill', 'Trick shots', 'Stone mastery', 'Lots of skipping', 'Cheeky', 'Collection'];

/**
 * A 0-point collection badge, derived from the shop rows it is about.
 * Unlocks are bought WITH Skip Points, so paying points for the badge would be a
 * loop that part-funds the next purchase: these are trophies only (`pts: 0`,
 * `badge: true`). Completion is read straight from `save.owned`, so a badge can
 * never disagree with what the player actually has.
 */
function ownAllBadge(id, kind, icon, name, desc) {
  const ids = () => unlocksOfKind(kind).map(u => u.id);
  return {
    id, icon, name, desc, pts: 0, badge: true, group: 'Collection',
    check: c => ids().every(x => !!c.save.owned[x]),
    prog: (s, save) => [ids().filter(x => save.owned[x]).length, ids().length],
  };
}
const COLLECTION = [
  // one badge per new shore spot, so unlocking the lake leaves a trail of them
  ...unlocksOfKind('spot').map(u => ({
    id: 'got_' + u.id, icon: u.icon, name: u.name, desc: 'Unlock this shore spot',
    pts: 0, badge: true, group: 'Collection', check: c => !!c.save.owned[u.id],
  })),
  // one per day/night look
  ...unlocksOfKind('theme').map(u => ({
    id: 'got_' + u.id, icon: u.icon, name: u.name, desc: 'Unlock this look for the lake',
    pts: 0, badge: true, group: 'Collection', check: c => !!c.save.owned[u.id],
  })),
  // and one each for finishing a cosmetic set
  ownAllBadge('allTrails', 'trail', '🌠', 'Every Trail', 'Own all the stone trails'),
  ownAllBadge('allSplashes', 'splash', '🎨', 'Every Splash', 'Own all the splash colours'),
  ownAllBadge('allHats', 'hat', '🎩', 'Every Hat', 'Own all the hats'),
];

export const ACHIEVEMENTS = [
  // ---- the 12 lake targets, as achievements like everything else -----------
  ...TARGETS.map(c => ({
    id: c.id, icon: c.icon, name: c.name, desc: c.desc,
    pts: TARGET_PTS[c.id] || 30, group: 'Lake targets', fromTarget: true, spot: c.spot,
  })),

  // ---- skill milestones ----------------------------------------------------
  // The one-throw ones count from the personal best, which is what "how close am
  // I?" means for a record: 12 / 15 says "three more skips than you have ever
  // managed", not "this throw was a dud".
  { id: 'skip15', icon: '💦', name: 'Fifteen!', desc: '15 skips in one throw', pts: 60, group: 'Skill', check: c => c.t.skips >= 15, prog: (s, save) => [save.bestSkips || 0, 15] },
  { id: 'skip20', icon: '🌀', name: 'Twenty!', desc: '20 skips in one throw', pts: 90, group: 'Skill', check: c => c.t.skips >= 20, prog: (s, save) => [save.bestSkips || 0, 20] },
  { id: 'skip25', icon: '👑', name: 'Skip King', desc: '25 skips in one throw', pts: 140, group: 'Skill', check: c => c.t.skips >= 25, prog: (s, save) => [save.bestSkips || 0, 25] },
  { id: 'perfect1', icon: '🎯', name: 'Bullseye Release', desc: 'Release dead-centre in the gold band', pts: 40, group: 'Skill', check: c => c.s.perfects >= 1 },
  { id: 'perfect5', icon: '🎯', name: 'Five Perfects', desc: '5 dead-centre releases', pts: 70, group: 'Skill', check: c => c.s.perfects >= 5, prog: s => [s.perfects, 5] },
  { id: 'perfect25', icon: '💫', name: 'Clockwork Arm', desc: '25 dead-centre releases', pts: 160, group: 'Skill', check: c => c.s.perfects >= 25, prog: s => [s.perfects, 25] },
  { id: 'streak10', icon: '🔥', name: 'On Fire', desc: '10 throws in a row with 5+ skips', pts: 120, group: 'Skill', check: c => c.s.bestStreak5 >= 10, prog: s => [Math.max(s.streak5 || 0, s.bestStreak5 || 0), 10] },
  { id: 'dist150', icon: '🏹', name: 'Long Haul', desc: 'Throw 150 m in one go', pts: 100, group: 'Skill', check: c => c.t.distance >= 150, prog: (s, save) => [Math.floor(save.bestDistance || 0), 150, 'm'] },
  { id: 'dist200', icon: '🛰️', name: 'Two Hundred!', desc: 'Throw 200 m in one go', pts: 180, group: 'Skill', check: c => c.t.distance >= 200, prog: (s, save) => [Math.floor(save.bestDistance || 0), 200, 'm'] },

  // ---- trick shots ---------------------------------------------------------
  { id: 'reedsDouble', icon: '🌾', name: 'Double Gate', desc: 'Thread both reed gates in one throw', pts: 110, group: 'Trick shots', check: c => c.t.reedGates >= 2 },
  { id: 'bridgeSkip', icon: '🌉', name: 'Bridge Runner', desc: 'Skip under the bridge and keep skipping', pts: 90, group: 'Trick shots', check: c => c.t.bridge && c.t.afterBridge >= 1 },
  { id: 'lilyPad', icon: '🪷', name: 'Frog Landing', desc: 'Land a stone on a lily pad', pts: 100, group: 'Trick shots', check: c => c.s.lilyLands >= 1 },
  { id: 'buoy3', icon: '🎳', name: 'Buoy Sweep', desc: 'Bonk all three buoys', pts: 80, group: 'Trick shots', check: c => BUOY_IDS.every(b => c.s.buoys[b]), prog: s => [BUOY_IDS.filter(b => s.buoys[b]).length, BUOY_IDS.length] },
  { id: 'beacon', icon: '🗼', name: 'Beacon Bonk', desc: 'Hit the beacon on Sand Isle', pts: 120, group: 'Trick shots', check: c => c.s.beaconHits >= 1 },
  { id: 'postBounce', icon: '🪵', name: 'Trick Shot', desc: 'Bounce a stone off a mooring post', pts: 110, group: 'Trick shots', check: c => c.s.postBounces >= 1 },

  // ---- stone mastery -------------------------------------------------------
  { id: 'allKinds', icon: '🧺', name: 'Rock Collector', desc: 'Skip with every kind of stone', pts: 90, group: 'Stone mastery', check: c => ROCK_KINDS.every(k => c.s.kinds[k.id]), prog: s => [ROCK_KINDS.filter(k => s.kinds[k.id]).length, ROCK_KINDS.length] },
  // 6 is the measured ceiling for a round pebble with no arm upgrades (see the
  // table in stones.js): a dead-centre release with a bad rock, which is exactly
  // the point of this one. Asking for more would need luck on the rock jitter.
  { id: 'roundHero', icon: '🥎', name: 'Round Is Fine', desc: '6 skips with a Round Pebble', pts: 100, group: 'Stone mastery', check: c => c.s.roundBest >= 6, prog: s => [s.roundBest || 0, 6] },
  { id: 'goldenUse', icon: '🥇', name: 'Golden Arm', desc: 'Throw the Golden Skipper', pts: 50, group: 'Stone mastery', check: c => !!c.s.specials.golden },

  // ---- volume --------------------------------------------------------------
  { id: 'total100', icon: '💧', name: 'A Hundred Skips', desc: '100 skips altogether', pts: 40, group: 'Lots of skipping', check: c => c.s.totalSkips >= 100, prog: s => [s.totalSkips, 100] },
  // 500 is the top volume tier on purpose: a 1000-skip one sat unreachable at the
  // bottom of the list for a whole play-through. A save that earned the retired
  // `total1000` keeps its points and is simply not counted (see achCount).
  { id: 'total500', icon: '🌊', name: 'Five Hundred Skips', desc: '500 skips altogether', pts: 90, group: 'Lots of skipping', check: c => c.s.totalSkips >= 500, prog: s => [s.totalSkips, 500] },
  { id: 'everySpot', icon: '🗺️', name: 'Lake Wanderer', desc: 'Throw from all six starting spots', pts: 80, group: 'Lots of skipping', check: c => BASE_SPOTS.every(s => c.s.spots[s]), prog: s => [BASE_SPOTS.filter(id => s.spots[id]).length, BASE_SPOTS.length] },
  // no running count: four of the six spots hold a single target, so "0 / 1" is
  // exactly the useless reading a count is meant to avoid
  { id: 'spotSweep', icon: '📋', name: 'Clean Sweep', desc: 'Get every lake target at one spot', pts: 90, group: 'Lots of skipping', check: c => sweptASpot(c.save) },

  // ---- cheeky --------------------------------------------------------------
  { id: 'plunk10', icon: '🥲', name: 'Plunk Master', desc: 'Plunk 10 stones straight into the lake', pts: 30, group: 'Cheeky', check: c => c.s.plunks >= 10, prog: s => [s.plunks, 10] },
  { id: 'fishEat', icon: '🐟', name: 'Fish Food', desc: 'A fish jumps up and swallows your stone', pts: 150, group: 'Cheeky', check: c => c.s.fishEaten >= 1 },

  // ---- collection: badges only, no points (see ownAllBadge) ----------------
  ...COLLECTION,
];

const BUOY_IDS = ['buoyRed', 'buoyYellow', 'buoyBlue'];

function sweptASpot(save) {
  const bySpot = {};
  for (const c of TARGETS) {
    if (!bySpot[c.spot]) bySpot[c.spot] = [];
    bySpot[c.spot].push(c.id);
  }
  for (const spot in bySpot) {
    if (bySpot[spot].every(id => save.targets[id])) return true;
  }
  return false;
}

export function achById(id) { return ACHIEVEMENTS.find(a => a.id === id) || null; }

/**
 * Running count for a counting achievement: { have, need, unit } or null when the
 * achievement is a one-off (a single trick shot reads better as its description
 * than as "0 / 1"). `have` is clamped to `need` so a finished one never shows a
 * silly "612 / 500", and it is read live from the save so it tracks every throw.
 */
export function achProgress(a, save) {
  if (!a || !a.prog || !save) return null;
  let p;
  try { p = a.prog(save.stats || {}, save); } catch (e) { return null; }
  if (!p || !isFinite(p[0]) || !isFinite(p[1]) || p[1] <= 0) return null;
  const need = p[1];
  return { have: clampCount(p[0], need), need, unit: p[2] || '' };
}
function clampCount(n, need) { return Math.max(0, Math.min(need, Math.floor(n || 0))); }

// --- special stones: timed spawns, not a held item ---------------------------
// A bought special stone is not carried around. It washes up on the beach among
// the loose rocks, is picked up like any other stone, and then has to wash up
// again — one minute per stone, tracked by the moment it was last claimed so the
// wait survives a reload. Buying one leaves it ready immediately (the reward
// should arrive straight away).
export const SPECIAL_CD_MS = 60000;

/** Milliseconds left before this special stone can wash up again (0 = ready). */
export function specialCooldownLeft(save, stoneId, now = Date.now()) {
  const at = (save.specialAt || {})[stoneId];
  if (!at) return 0;
  return Math.max(0, SPECIAL_CD_MS - (now - at));
}

/** Every special stone the player owns, with its cooldown. */
export function ownedSpecials(save, now = Date.now()) {
  return UNLOCKS.filter(u => u.kind === 'stone' && save.owned[u.id]).map(u => ({
    unlock: u, id: u.stone, left: specialCooldownLeft(save, u.stone, now),
  }));
}

/** Owned + off cooldown, so it may appear on the beach. */
export function readySpecials(save, now = Date.now()) {
  return ownedSpecials(save, now).filter(s => s.left <= 0);
}

/** Picking one up restarts its minute. */
export function claimSpecial(save, stoneId, now = Date.now()) {
  if (!save.specialAt) save.specialAt = {};
  save.specialAt[stoneId] = now;
}

/**
 * Arm strength: [level0, level1, level2] multipliers.
 * A stronger arm throws harder and fills the POWER bar faster, so the wind-up
 * stays a skill test as the ceiling rises. The RELEASE sweep is untouched
 * (swingRate all 1): making the third beat harder every time you buy an upgrade
 * turns the reward into a punishment, which is exactly the wrong feeling.
 */
export const ARM = {
  speed: [1, 1.12, 1.25],       // launch-speed ceiling
  windRate: [1, 0.86, 0.74],    // power bar sweep duration (smaller = faster)
  swingRate: [1, 1, 1],         // release needle sweep duration — never faster
};

/** Can this unlock be bought right now? -> { ok, why } */
export function canBuy(save, u) {
  if (save.owned[u.id]) return { ok: false, why: 'owned' };
  if (u.needs && !save.owned[u.needs]) return { ok: false, why: 'needs' };
  if ((save.points || 0) < u.price) return { ok: false, why: 'points' };
  return { ok: true };
}

/** Spends the points and records the unlock. Returns true when it happened. */
export function buy(save, u) {
  const c = canBuy(save, u);
  if (!c.ok) return false;
  save.points -= u.price;
  save.owned[u.id] = true;
  if (u.kind === 'arm') save.armLevel = Math.max(save.armLevel || 0, u.level);
  return true;
}

// --- per-throw bookkeeping --------------------------------------------------
/** Folds one throw into the cumulative stats. Mutates save.stats. */
export function applyThrow(save, t) {
  const s = save.stats;
  s.throws = (s.throws || 0) + 1;
  s.totalSkips += t.skips;
  if (t.skips <= 0) s.plunks++;
  if (t.grade === 'perfect') s.perfects++;
  s.streak5 = t.skips >= 5 ? s.streak5 + 1 : 0;
  if (s.streak5 > s.bestStreak5) s.bestStreak5 = s.streak5;
  if (t.kindId) s.kinds[t.kindId] = true;
  if (t.specialId) s.specials[t.specialId] = true;
  if (t.spotId) s.spots[t.spotId] = true;
  for (const b of t.buoys || []) s.buoys[b] = true;
  if (t.kindId === 'round' && t.skips > (s.roundBest || 0)) s.roundBest = t.skips;
  if (t.lily) s.lilyLands++;
  if (t.fish) s.fishEaten++;
  if (t.post) s.postBounces++;
  if (t.beacon) s.beaconHits++;
  if (t.reedGates >= 2) s.reedDoubles++;
}

/**
 * Awards every achievement whose condition is now true.
 * @returns array of { ach, pts } newly earned (points already added to save)
 */
export function settleAchievements(save, t) {
  const ctx = { t, s: save.stats, save };
  const gained = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    let ok = false;
    if (a.fromTarget) ok = !!save.targets[a.id];
    else if (a.check) { try { ok = !!a.check(ctx); } catch (e) { ok = false; } }
    if (!ok) continue;
    save.achievements[a.id] = true;
    save.points += a.pts;             // 0 for the collection badges, by design
    gained.push(a);
  }
  return gained;
}

/**
 * Marks the collection badges the save has already qualified for. Called right
 * after a load (so a save that already owns half the shop walks in with its
 * badges, quietly) and right after a purchase (so the badge lands with the buy).
 * Points are never touched — every badge is worth 0.
 * @returns the badges newly marked
 */
export function settleBadges(save) {
  const ctx = { t: {}, s: save.stats, save };
  const gained = [];
  for (const a of ACHIEVEMENTS) {
    if (!a.badge || save.achievements[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(ctx); } catch (e) { ok = false; }
    if (!ok) continue;
    save.achievements[a.id] = true;
    gained.push(a);
  }
  return gained;
}

export function achCount(save) {
  return ACHIEVEMENTS.filter(a => save.achievements[a.id]).length;
}
export const ACH_TOTAL = ACHIEVEMENTS.length;
