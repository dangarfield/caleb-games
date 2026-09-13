/* states.js — the run's shape, kept out of main.js's frame loop.
 *
 * Six states and the rules for getting between them:
 *
 *   menu    the start overlay is up; nothing in the world is moving
 *   ready   "Ready" is on screen, the stage is scrolling, the player cannot die
 *   play    the game
 *   paused  frozen, P or a tap resumes
 *   dying   the ship has burst; after a beat it either respawns or it is over
 *   over    game over, waiting for a tap
 *   clear   the boss is down, waiting for a tap
 *
 * A state machine this small is worth having as its own file for one reason:
 * every transition has a side effect somewhere (audio, input, the HUD), and
 * with the transitions in one place those side effects are a list you can read
 * rather than a set of flags scattered through the loop.
 */

export function createStates(hooks = {}) {
  const S = {
    phase: 'menu',
    prev: '',
    time: 0,               // seconds in the current state
    timer: 0,              // counts down; fires `then` at zero
    then: null,
    set, update, is, after, fade,
  };

  function set(phase, opts = {}) {
    if (S.phase === phase && !opts.force) return;
    const from = S.phase;
    if (hooks.onExit) hooks.onExit(from, phase);
    S.prev = from;
    S.phase = phase;
    S.time = 0;
    S.timer = opts.timer || 0;
    S.then = opts.then || null;
    if (hooks.onEnter) hooks.onEnter(phase, from);
  }

  /* Schedule a transition without a separate timer variable in main.js. */
  function after(seconds, fn) {
    S.timer = seconds;
    S.then = fn;
  }

  function is(phase) { return S.phase === phase; }

  /* 0..1 over the first `d` seconds of the state — the end screens fade in
     with it rather than snapping on. */
  function fade(d) { return Math.min(1, S.time / (d || 0.5)); }

  function update(dt) {
    S.time += dt;
    if (S.timer > 0) {
      S.timer -= dt;
      if (S.timer <= 0) {
        S.timer = 0;
        const fn = S.then;
        S.then = null;
        if (fn) fn();
      }
    }
    return S.phase;
  }

  return S;
}
