/* icons.js — the pictures on the buttons.
 *
 * Both places an action shows up — the four pads at the bottom right and the
 * readout of what you just pressed at the bottom middle — draw from here, so a
 * button and its echo can never end up meaning different things.
 *
 * They were letters: SPACE, J, K, L. That is fine on a keyboard and useless on
 * a tablet, where there is no J to press and the word is just something to read
 * before you can play. A shape does not have to be read.
 *
 * Every glyph is one monochrome path on a 24x24 grid, drawn in currentColor so
 * a white pad and a yellow one both come out right without a second copy.
 */

/* stroke-drawn: round caps and joins, 2.4 wide, nothing filled */
const STROKE = { fill: 'none', stroke: 'currentColor', width: 2.4 };
/* filled: solid shapes, no stroke */
const FILL = { fill: 'currentColor', stroke: 'none', width: 0 };

export const ICONS = {
  /* an ollie: the board leaves the ground */
  JUMP: { ...STROKE, d: 'M12 4.5v10 M7.5 9L12 4.5 16.5 9 M4.5 19h15' },
  /* a kickflip: the board turns over */
  FLIP: { ...STROKE, d: 'M5.5 12a6.5 6.5 0 1 1 2.2 4.9 M5.5 12V7.6 M5.5 12h4.4' },
  /* a grab: a hand closing on the deck */
  GRAB: {
    ...FILL,
    d: 'M9.2 3.2a1.3 1.3 0 0 1 1.3 1.3v5.1h1V3.6a1.3 1.3 0 0 1 2.6 0v6h1V4.9a1.3 1.3 0 0 1 2.6 0v8.4'
       + 'c0 4.2-2.5 7.2-6.1 7.2-3.3 0-5-1.7-6.3-4.6L3.3 12a1.3 1.3 0 0 1 2.2-1.4l2.4 3V4.5'
       + 'a1.3 1.3 0 0 1 1.3-1.3z'
  },
  /* a grind: the board riding the edge of something. The wheels have to touch
     the rail or it reads as a table hovering over a line. */
  GRIND: { ...STROKE, d: 'M2.5 18.5h19 M6.6 12.4h10.8 M9 12.4v6.1 M15 12.4v6.1' },
  /* the stick, four ways */
  UP: { ...FILL, d: 'M12 5l6 8H6z' },
  DOWN: { ...FILL, d: 'M12 19l-6-8h12z' },
  LEFT: { ...FILL, d: 'M5 12l8-6v12z' },
  RIGHT: { ...FILL, d: 'M19 12l-8 6V6z' },
  /* a revert: turn round on the spot */
  REVERT: { ...STROKE, d: 'M7 8h7.5a4 4 0 0 1 0 8H7 M10.2 4.8L7 8l3.2 3.2' }
};

/**
 * One <svg> for a named action, as markup.
 * @param {string} name  a key of ICONS
 * @param {number} size  pixels, square
 */
export function iconSvg(name, size = 22) {
  const g = ICONS[name];
  if (!g) return '';
  const paint = g.width
    ? `fill="none" stroke="currentColor" stroke-width="${g.width}"`
      + ' stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor" stroke="none"';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"`
       + ` focusable="false"><path d="${g.d}" ${paint}/></svg>`;
}
