// Keyboard state. Held keys are polled; throw is consumed once per press.
import { KEYS } from './config.js';

const held = new Set();
// Held by the on-screen pads. Same four directions as the keys, merged below,
// so nothing downstream knows or cares which one is being used.
const touched = new Set();
let throwQueued = false;
let pauseQueued = false;
let jumpQueued = false;
let editorQueued = false;
let guiQueued = false;

const isBound = code => Object.values(KEYS).some(list => list.includes(code));

// Don't steer the bike or toggle modes while someone is typing in the planner.
const typing = t => !!t?.closest?.('input, select, textarea, [contenteditable]');

addEventListener('keydown', e => {
    if (typing(e.target)) return;
    if (!isBound(e.code)) return;
    e.preventDefault();
    if (KEYS.throw.includes(e.code) && !held.has(e.code)) throwQueued = true;
    if (KEYS.pause.includes(e.code) && !held.has(e.code)) pauseQueued = true;
    if (KEYS.jump.includes(e.code) && !held.has(e.code)) jumpQueued = true;
    if (KEYS.editor.includes(e.code) && !held.has(e.code)) editorQueued = true;
    if (KEYS.gui.includes(e.code) && !held.has(e.code)) guiQueued = true;
    held.add(e.code);
});
addEventListener('keyup', e => {
    if (typing(e.target)) return;
    if (isBound(e.code)) { e.preventDefault(); held.delete(e.code); }
});
addEventListener('blur', () => { held.clear(); touched.clear(); });

const any = list => list.some(c => held.has(c));
const on = name => touched.has(name);

export const input = {
    get left() { return any(KEYS.left) || on('left'); },
    get right() { return any(KEYS.right) || on('right'); },
    get fast() { return any(KEYS.fast) || on('fast'); },
    get slow() { return any(KEYS.slow) || on('slow'); },
    // The pads call these; 'left' | 'right' | 'fast' | 'slow'.
    setTouch(name, down) { if (down) touched.add(name); else touched.delete(name); },
    // The throw pad: one throw per tap, same queue the spacebar fills.
    queueThrow() { throwQueued = true; },
    clearTouch() { touched.clear(); },
    consumeThrow() { const t = throwQueued; throwQueued = false; return t; },
    consumePause() { const p = pauseQueued; pauseQueued = false; return p; },
    consumeJump() { const j = jumpQueued; jumpQueued = false; return j; },
    consumeEditor() { const e = editorQueued; editorQueued = false; return e; },
    consumeGui() { const g = guiQueued; guiQueued = false; return g; },
};
