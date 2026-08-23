// Undo AND redo, by command pattern.
//
// Every other game in this arcade uses the same idiom: push a deep snapshot of the
// board, and undo pops it. That idiom cannot give you redo (popping throws the future
// away) and it does not scale here — 50 snapshots of a 300-domino scene is 15,000
// objects held live on a tablet, for a feature that is meant to be free.
//
// So: two stacks of {do, undo} pairs. Redo is the inverse pile, and it is cleared the
// moment you do something new, which is the behaviour every drawing app has trained
// an eight-year-old to expect. Memory per entry is proportional to what CHANGED, so a
// one-domino tap costs one object and a 60-domino stroke costs sixty.
//
// ONE STROKE IS ONE ENTRY (the linky precedent): a child who drew a long snaking line
// and taps undo expects the line to go, not the last domino of it.

import {
  addDominoes, addItem, removeByIds, restore, rebuildSurfaces,
} from './layout.js';

const undoStack = [];
const redoStack = [];
const DEPTH = 60;

let listener = null;
/** Called after every apply/undo/redo with the command's label. */
export function onChange(fn) { listener = fn; }
function fire(label, kind) { if (listener) listener(label, kind); }

export function apply(cmd) {
  cmd.do();
  undoStack.push(cmd);
  if (undoStack.length > DEPTH) undoStack.shift();
  // A new action invalidates the future. Not clearing this is the classic bug where
  // redo replays an edit that no longer makes sense against the current board.
  redoStack.length = 0;
  fire(cmd.label, 'do');
  return cmd;
}

export function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return null;
  cmd.undo();
  redoStack.push(cmd);
  fire(cmd.label, 'undo');
  return cmd;
}

export function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return null;
  cmd.do();
  undoStack.push(cmd);
  fire(cmd.label, 'redo');
  return cmd;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }
export function undoDepth() { return undoStack.length; }
export function redoDepth() { return redoStack.length; }
/** Called when the layout is replaced wholesale (load, new, challenge start). */
export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  fire('', 'clear');
}

// ==========================================================================
// COMMANDS
// ==========================================================================

/**
 * Add a batch of dominoes (a whole stroke). Ids are assigned on the first `do` and
 * REUSED on every redo, so anything that referenced them (the start marker) survives
 * an undo/redo round trip.
 */
export function cmdAddDominoes(L, list, label) {
  let ids = null;
  let prevStart = L.startId;
  return {
    label: label || (list.length === 1 ? '1 domino' : list.length + ' dominoes'),
    n: list.length,
    do() {
      prevStart = L.startId;
      if (ids) for (let i = 0; i < list.length; i++) list[i].id = ids[i];
      addDominoes(L, list);
      if (!ids) ids = list.map(d => d.id);
    },
    undo() {
      removeByIds(L, ids, null);
      L.startId = prevStart;
    },
  };
}

export function cmdAddItem(L, item, label) {
  let prevStart = L.startId;
  return {
    label: label || 'item',
    n: 1,
    do() { prevStart = L.startId; addItem(L, item); },
    undo() { removeByIds(L, null, [item.id]); L.startId = prevStart; },
  };
}

/** Erase. Stores what came out and where, so undo puts it back in the same order. */
export function cmdRemove(L, dominoIds, itemIds, label) {
  let rd = null, ri = null, prevStart = L.startId;
  const nd = dominoIds ? dominoIds.length : 0;
  const ni = itemIds ? itemIds.length : 0;
  return {
    label: label || (ni && !nd ? 'erased item' : 'erased ' + nd),
    n: nd + ni,
    do() {
      prevStart = L.startId;
      const r = removeByIds(L, dominoIds, itemIds);
      rd = r.rd; ri = r.ri;
    },
    undo() { restore(L, rd, ri, prevStart); },
  };
}

/** Move (and/or rotate) one item. Undoable because kids nudge things constantly. */
export function cmdMoveItem(L, item, x, z, r) {
  const ox = item.x, oz = item.z, or = item.r;
  return {
    label: 'moved item',
    n: 1,
    do() { item.x = x; item.z = z; item.r = r; rebuildSurfaces(L); },
    undo() { item.x = ox; item.z = oz; item.r = or; rebuildSurfaces(L); },
  };
}

/**
 * Rotate one domino or one item to a new angle. ONE slider drag is ONE entry: the slider
 * moves the piece live so the child can see what they are choosing, and only the angle it
 * started at and the angle it was let go at are recorded. Recording every intermediate
 * angle would fill all 60 undo slots with one drag.
 */
export function cmdRotate(L, kind, target, from, to, what) {
  const isItem = kind === 'item';
  const set = (a) => {
    target.r = a;
    // An item's rotation moves its placement surfaces and blockers with it; a domino's
    // does not, because a domino is not something you can put anything on.
    if (isItem) rebuildSurfaces(L);
  };
  return {
    label: 'turned the ' + (what || (isItem ? 'trick' : 'domino')),
    n: 1,
    do() { set(to); },
    undo() { set(from); },
  };
}

export function cmdSetStart(L, id) {
  const prev = L.startId;
  return {
    label: 'start',
    n: 0,
    do() { L.startId = id; },
    undo() { L.startId = prev; },
  };
}

/** Clear the table. One entry, fully reversible — the most-feared button made safe. */
export function cmdClearAll(L) {
  const ids = L.dominoes.map(d => d.id);
  const iids = L.items.filter(it => !it.locked).map(it => it.id);
  let rd = null, ri = null, prevStart = L.startId;
  return {
    label: 'cleared the table',
    n: ids.length + iids.length,
    do() {
      prevStart = L.startId;
      const r = removeByIds(L, ids, iids);
      rd = r.rd; ri = r.ri;
    },
    undo() { restore(L, rd, ri, prevStart); },
  };
}
