/* settings.js — the handful of choices, and where they live.
 *
 * Everything here rides in the game's own IndexedDB item alongside the scores
 * (calebArcadeData:skate), so a setting survives a reload and follows the same
 * rules as every other save in the arcade.
 */
export const DEFAULTS = {
  camera: 'follow',      // follow | fixed
  shadows: true,
  showState: true,
  /* How many pixels to actually render, as a cap on devicePixelRatio. A tablet
     with a 2x screen draws four times the pixels of a 1x one for the same
     picture, and fill rate is the first thing to run out on a weak GPU.
     full | balanced | fast — see PIXEL_CAP. */
  resolution: 'full',
  /* The music volume as the slider sits, 0..1. It belongs here rather than in
     a player's save slot: it is how loud the room wants to be, not something
     about Ezra or Caleb. */
  musicVolume: 0.8,
  musicOn: true,
  /* Double-size on-screen stick and buttons, for small hands and big screens */
  bigControls: false
};

/* The cap each setting puts on devicePixelRatio. 1.5 is about 44% fewer pixels
   than 2 and very hard to see on a screen you hold at arm's length. */
export const PIXEL_CAP = { full: 2, balanced: 1.5, fast: 1 };

export class Settings {
  constructor() {
    this.values = Object.assign({}, DEFAULTS);
    this.onChange = null;
  }
  load(saved) {
    Object.assign(this.values, DEFAULTS, saved || {});
    return this;
  }
  get(k) { return this.values[k]; }
  set(k, v) {
    if (this.values[k] === v) return;
    this.values[k] = v;
    if (this.onChange) this.onChange(k, v);
  }
  toJSON() { return Object.assign({}, this.values); }
}
