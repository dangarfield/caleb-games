// Waypoints — the standard views, and stepping between them.
//
// Its own file, with nothing in it that needs a browser, so the one part of the
// view stepping that has an opinion can be tested in node. `view.js` imports
// Three, which node cannot resolve — a test that has to reimplement the thing it
// is testing passes whatever the real one does, so the thing moved instead.

/**
 * The stops the buttons walk between.
 *
 *   0    nose on the paper
 *   100  where a hike starts — the map at reading distance
 *   651  third person, just past where the camera leaves his eyes
 *   800  drone
 *   950  macro
 */
export const STOPS = [0, 100, 651, 800, 950];

/**
 * The next standard view in (`-1`) or out (`+1`) from any zoom.
 *
 * The one-unit margin means a stop you are already parked on does not count as
 * the next one, so a button press always moves — including when a glide has
 * left you a fraction off the number.
 */
export function nextStop(z, dir, stops = STOPS) {
  return dir < 0
    ? [...stops].reverse().find((s) => s < z - 1)
    : stops.find((s) => s > z + 1);
}

/**
 * Which animation clip a movement wants, and how fast to run it.
 *
 * Here rather than in `walk.js` because `walk.js` imports Three and node cannot
 * load it — and this is exactly the kind of thing that wants testing. It shipped
 * once as a method that was called but never defined, and nothing caught it
 * until the game crashed the moment autopilot started.
 *
 * `input` is the left stick: `x` across, `y` up the screen (negative is
 * forward), plus `auto`. `mps` is the pace he is actually making.
 */
export function clipFor(input, mps) {
  const fast = mps > 2.5;
  const forward = [fast ? 'run' : 'walk', fast ? 1.15 : 1];
  if (input.auto) return forward;
  const fwd = -input.y, side = input.x;
  // Sideways beats forwards: he faces where the camera faces, so a sidestep has
  // to LOOK like one. A forward walk cycle sliding sideways is what made
  // strafing read as a bug.
  if (Math.abs(side) > Math.abs(fwd)) {
    return [side > 0 ? 'run_right' : 'run_left', fast ? 1 : 0.62];
  }
  if (fwd < 0) return ['run_back', fast ? 1 : 0.62];
  return forward;
}
