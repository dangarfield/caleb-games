/* store.js — Deepfold's save, in IndexedDB, through the arcade's store.
 *
 * WHY NOT localStorage. It is ONE quota of about five megabytes for the whole
 * origin, shared by every game in the arcade at once, and in September 2026 it
 * filled up: writes started failing silently across games that had nothing to
 * do with each other. `.apm/instructions/arcade-build.instructions.md` now
 * requires a new game to save through `js/arcade-store.js`, which is the same
 * manners over IndexedDB — a different cupboard on the same origin with
 * hundreds of megabytes in it. (The compiled AGENTS.md still says localStorage;
 * it is stale.)
 *
 * The key is unchanged — `calebArcadeData:paperstorm` — and the store imports
 * anything it finds under that key in localStorage on first run and then takes
 * it off that shelf, so a save made by the earlier build survives.
 *
 * TWO TABS. An old tab left open on the arcade still saves when it renders and
 * again when it is closed, writing the state IT is holding — which is how a
 * real best score gets stamped on by a stale one, with nothing looking broken.
 * Every write carries `sid` (which tab) and `gen` (a counter that only goes up)
 * and goes out with {guard: true}, so the store refuses it inside the
 * transaction if the stored copy is at least as new and came from another tab.
 * `Store.conflict()` is then the failure signal this file reports upward, and
 * `record` rolls back in memory so the screen never shows a score the shelf
 * does not have.
 *
 * IndexedDB is asynchronous, so nothing may be read before `ready` has run.
 * main.js keeps the Launch button disabled until it has.
 */
import { CFG } from './config.js';

const NS = 'deepfold';                    // -> calebArcadeData:deepfold

/* The game was called Paper Storm until it was called Deepfold, and Dan has
   scores under the old name. On the first run with the new key, anything
   sitting under the old one is copied across — once, and only if the new key
   is still empty, so a later Paper Storm save can never overwrite real
   Deepfold progress. The old item is left where it is: it costs nothing, and
   an import that also deletes is an import you cannot check afterwards. */
const OLD_NS = 'paperstorm';

/* Which tab this is. Short, random, and stable for the life of the page. */
const SID = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/* One of these per player.
 *
 *   bests      the high score, PER DIFFICULTY: Easy and Normal are different
 *              games and one list flattered whichever was played second.
 *   assisted   the best set with infinite lives on. Kept, shown, and never
 *              allowed to be the high score — a run you cannot lose is not a
 *              score, but binning it would be mean.
 *   stage      the furthest fold REACHED, `cleared` the highest one finished.
 *   infinite   whether this player has the assist switched on. Per player:
 *              one brother wants it and the other does not.
 */
function freshPlayer() {
  return {
    bests: { easy: 0, normal: 0 },
    assisted: { easy: 0, normal: 0 },
    stage: 0, cleared: 0, runs: 0, sawPodHint: 0, infinite: 0,
    last: null,
  };
}

function diffKey(d) { return d === 'normal' ? 'normal' : 'easy'; }

function freshSave() {
  const players = {};
  for (const n of CFG.store.players) players[n] = freshPlayer();
  return {
    v: CFG.store.version,
    mute: false,
    difficulty: 'easy',
    player: CFG.store.players[0],
    players,
  };
}

export function createStore() {
  const store = {
    data: freshSave(),
    working: false,
    loaded: false,
    reason: '',
    ready, save, setPlayer, setMute, setDifficulty, record, playerData, bytes,
    inheritedOldSave: () => inherited,
    firstTime, conflict, bestFor, setInfinite,
    /* main.js sets this to redraw the best-score line if the save turns out to
       have been refused after the fact. */
    onTrouble: null,
  };

  let backing = null;
  let inherited = false;
  let gen = 0;
  let watchdog = null;
  const queue = [];

  function shelf() {
    if (backing) return backing;
    const AS = typeof window !== 'undefined' ? window.ArcadeStore : null;
    if (typeof AS !== 'function') {
      store.reason = 'the save library did not load; this run will not be kept';
      return null;
    }
    backing = AS(NS);
    return backing;
  }

  /* Call this before reading anything. Runs cb once the database is open and
     this game's items are in memory; safe to call more than once. */
  function ready(cb) {
    if (store.loaded) { if (cb) cb(store); return; }
    if (cb) queue.push(cb);
    const s = shelf();
    if (!s) { finish(); return; }
    /* The old namespace is opened alongside the new one: both are views onto
       the same database, and the migration below needs the old one's cache to
       have been read before it looks. */
    const AS = typeof window !== 'undefined' ? window.ArcadeStore : null;
    const old = typeof AS === 'function' ? AS(OLD_NS) : null;
    let waiting = old ? 2 : 1;
    const done = () => { if (--waiting <= 0) { pull(s); finish(); } };
    s.ready(done);
    if (old) old.ready(done);
  }

  function finish() {
    store.loaded = true;
    const q = queue.splice(0, queue.length);
    for (const fn of q) { try { fn(store); } catch (e) { /* a bad callback is not a bad save */ } }
  }

  /* Read what is on the shelf into our own shape. Anything missing or of the
     wrong type falls back to a fresh value rather than reaching the game. */
  function pull(s) {
    store.working = s.working();
    if (!store.working) {
      store.reason = 'no database here (a private window?) — this run will not be kept';
      return;
    }
    let got = s.get();
    if (!got || typeof got !== 'object') got = inherit(s);
    if (!got || typeof got !== 'object') return;
    gen = got.gen || 0;
    const d = freshSave();
    d.mute = !!got.mute;
    d.difficulty = got.difficulty === 'normal' ? 'normal' : 'easy';
    if (CFG.store.players.indexOf(got.player) >= 0) d.player = got.player;
    for (const n of CFG.store.players) {
      const p = got.players && got.players[n];
      if (!p) continue;
      const to = d.players[n];
      if (p.bests) {
        to.bests.easy = Math.max(0, p.bests.easy | 0);
        to.bests.normal = Math.max(0, p.bests.normal | 0);
      } else if (p.best) {
        /* A save from before scores were kept per difficulty. The one number
           it has was set on whatever difficulty was selected at the time, so
           that is where it goes — losing it would be the worst possible
           outcome of a rename. */
        to.bests[diffKey(got.difficulty)] = Math.max(0, p.best | 0);
      }
      if (p.assisted) {
        to.assisted.easy = Math.max(0, p.assisted.easy | 0);
        to.assisted.normal = Math.max(0, p.assisted.normal | 0);
      }
      to.infinite = p.infinite ? 1 : 0;
      d.players[n].stage = Math.max(0, p.stage | 0);
      d.players[n].cleared = Math.max(0, p.cleared | 0);
      d.players[n].runs = Math.max(0, p.runs | 0);
      d.players[n].sawPodHint = p.sawPodHint ? 1 : 0;
    }
    store.data = d;
  }

  /* Look for a save under the game's previous name, exactly once, and only
     when there is nothing under the current one. */
  function inherit(s) {
    let old = null;
    try {
      const AS = typeof window !== 'undefined' ? window.ArcadeStore : null;
      if (typeof AS !== 'function') return null;
      old = AS(OLD_NS).get();
    } catch (e) { return null; }
    if (!old || typeof old !== 'object') return null;
    store.reason = 'brought your Paper Storm scores across';
    inherited = true;
    return old;
  }

  function conflict() {
    const s = backing;
    return s ? s.conflict() : null;
  }

  /* Into memory now, into the database in a moment. Returns false when this
     tab has been overtaken by another one — the caller must then roll back
     whatever it was about to show. */
  function save() {
    const s = shelf();
    if (!s) return false;
    if (s.conflict()) {
      store.working = false;
      store.reason = 'another tab is playing; this one has stopped saving';
      return false;
    }
    gen += 1;
    s.set(null, Object.assign({ gen, sid: SID }, store.data), { guard: true });
    store.working = s.working();
    if (!store.working) store.reason = 'this run will not be kept';
    watchForRefusal();
    return store.working;
  }

  /* A guarded write is only refused INSIDE the flush transaction, which is a
     moment after `save` has returned — so a conflict cannot be the return
     value of the call that provoked it. One check after the flush window turns
     that into something the player can be told, instead of a game that quietly
     stops saving and says nothing. */
  function watchForRefusal() {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      watchdog = null;
      if (!backing || !backing.conflict()) return;
      store.working = false;
      store.reason = 'another tab is playing this game; this one has stopped saving';
      if (typeof store.onTrouble === 'function') store.onTrouble(store);
    }, 260);
  }

  function bytes() {
    const s = backing;
    if (s) return s.bytes();
    try { return JSON.stringify(store.data).length; } catch (e) { return -1; }
  }

  function playerData(name) {
    const n = name || store.data.player;
    if (!store.data.players[n]) store.data.players[n] = freshPlayer();
    return store.data.players[n];
  }

  function setPlayer(name) {
    if (CFG.store.players.indexOf(name) < 0) return;
    store.data.player = name;
    save();
  }

  function setMute(m) { store.data.mute = !!m; save(); }

  function setDifficulty(d) {
    store.data.difficulty = d === 'normal' ? 'normal' : 'easy';
    save();
  }

  /* One-shot teaching flags. True the FIRST time it is asked for a player and
     false ever after. */
  function firstTime(name, flag) {
    const p = playerData(name);
    if (p[flag]) return false;
    p[flag] = 1;
    save();
    return true;
  }

  /* The best this player has on this difficulty, and the assisted one beside
     it. Everything that shows a score goes through here. */
  function bestFor(name, difficulty) {
    const p = playerData(name);
    const k = diffKey(difficulty || store.data.difficulty);
    return { best: p.bests[k] | 0, assisted: p.assisted[k] | 0, key: k };
  }

  function setInfinite(name, on) {
    playerData(name).infinite = on ? 1 : 0;
    save();
  }

  /* A finished run. Rolled back in memory if the write is refused, so the
     screen and the shelf never disagree.
   *
     A run flown with infinite lives is recorded — the score happened, and a
     child who has just scored fifty thousand should see it — but it is marked
     `infinite` and it goes in `assisted`, never into the high score. You
     cannot set a record in a game you cannot lose. */
  function record(name, score, stageReached, stageCleared, difficulty, infinite) {
    const p = playerData(name);
    const k = diffKey(difficulty || store.data.difficulty);
    const was = {
      best: p.bests[k], assisted: p.assisted[k],
      stage: p.stage, cleared: p.cleared, runs: p.runs, last: p.last,
    };
    p.runs++;
    p.last = { score: score | 0, difficulty: k, infinite: !!infinite, stage: stageReached | 0 };
    if (infinite) {
      if (score > p.assisted[k]) p.assisted[k] = score;
    } else {
      if (score > p.bests[k]) p.bests[k] = score;
      if (stageCleared > p.cleared) p.cleared = stageCleared;
    }
    if (stageReached > p.stage) p.stage = stageReached;
    if (!save()) {
      p.bests[k] = was.best; p.assisted[k] = was.assisted;
      p.stage = was.stage; p.cleared = was.cleared; p.runs = was.runs; p.last = was.last;
      return false;
    }
    return true;
  }

  return store;
}
