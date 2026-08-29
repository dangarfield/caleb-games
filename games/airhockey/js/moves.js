/* Air Hockey World Cup — moves.js  (Super Cup only)
 *
 * SPINNER MODEL (2026-08-29 rework):
 * Special moves are no longer fixed per nation. Instead, during a Super Cup
 * match a SPINNER periodically pops up and spins through the six moves, landing
 * on a random one that is handed to a side. Both the player and the CPU get
 * moves this way — but the PLAYER always gets the first spin of the match.
 *
 * Timing is periodic with jitter (see game.js SPIN scheduling): roughly every
 * ~10-16s, alternating-ish but weighted so the player is served first and a bit
 * more often. When you hold a move you fire it with the move button (the CPU
 * fires on its own logic).
 *
 * This module is DATA + helpers only — the actual effect is applied by game.js
 * which owns the puck/mallets. Each move sets a flag/timer in a side's
 * `effects` object; game.js reads those in its physics + input steps.
 *
 * Move types (6):
 *   power   🔥  Power Slam  — your NEXT strike is a cannon (uncapped, big power)
 *   big     🛡️  Big Wall    — your mallet grows ~1.8× for 5s
 *   freeze  ❄️  Deep Freeze — the opponent's mallet is frozen for 1.6s
 *   shield  🧱  Goal Shield — a barrier covers your goal mouth for 4s
 *   magnet  🧲  Magnet      — while the puck is in your half it curves at the goal (2.5s)
 *   slow    🐢  Slow-Mo     — the puck slows for everyone for 2.5s (you reposition)
 */

export const MOVE_TYPES = {
  power:  { id: 'power',  name: 'Power Slam',  icon: '🔥', dur: 0,    color: '#ff6b35',
            blurb: 'Your next strike is a big cannon shot.' },
  big:    { id: 'big',    name: 'Big Wall',    icon: '🛡️', dur: 10.0,  color: '#4da3ff',
            blurb: 'Your mallet grows huge for 10 seconds.' },
  freeze: { id: 'freeze', name: 'Deep Freeze', icon: '❄️', dur: 3.2,  color: '#66e0ff',
            blurb: "Freezes the opponent's mallet for 3.2s." },
  shield: { id: 'shield', name: 'Goal Shield', icon: '🧱', dur: 8.0,  color: '#a29bfe',
            blurb: 'A barrier guards your goal for 8 seconds.' },
  magnet: { id: 'magnet', name: 'Magnet',      icon: '🧲', dur: 5.0,  color: '#ff4dd2',
            blurb: 'Bends the puck toward their goal for 5s.' },
  slow:   { id: 'slow',   name: 'Slow-Mo',     icon: '🐢', dur: 5.0,  color: '#26de81',
            blurb: 'Slows the puck for everyone for 5s.' },
};

/* The wheel order used by the spinner UI. */
export const MOVE_POOL = ['power', 'big', 'freeze', 'shield', 'magnet', 'slow'];

export function moveById(id) {
  return MOVE_TYPES[id] || MOVE_TYPES.power;
}

/* Pick a random move id for a spin result. */
export function randomMoveId() {
  return MOVE_POOL[Math.floor(Math.random() * MOVE_POOL.length)];
}

/* A fresh effects bag for one side. `held` is the move currently in hand
 * (id string) waiting to be fired, or null. */
export function makeEffects() {
  return {
    held: null,        // move id in hand, ready to fire
    armedPower: false, // power slam waiting for next strike
    bigUntil: 0,
    freezeUntil: 0,    // this side is frozen until t (set by OPPONENT's freeze)
    shieldUntil: 0,
    magnetUntil: 0,
    slowUntil: 0,      // global slow (either side can set)
  };
}

/* Apply a fired move. `self` is the firer's effects, `foe` is the opponent's,
 * `now` is performance.now()/1000. Returns the move def for a toast. */
export function fireMove(moveId, self, foe, now) {
  const m = MOVE_TYPES[moveId];
  if (!m) return null;
  switch (moveId) {
    case 'power':  self.armedPower = true; break;
    case 'big':    self.bigUntil = now + m.dur; break;
    case 'freeze': foe.freezeUntil = now + m.dur; break;
    case 'shield': self.shieldUntil = now + m.dur; break;
    case 'magnet': self.magnetUntil = now + m.dur; break;
    case 'slow':   self.slowUntil = now + m.dur; break;
  }
  self.held = null;
  return m;
}
