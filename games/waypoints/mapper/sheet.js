// Waypoints — one way to put the sheet on a canvas.
//
// The mapper and the game draw the same board, and they must draw it the SAME.
// Every time that setup was written out twice it drifted: the game shipped once
// with no icons at all, because the page that renders the sheet was written
// without the one call that loads the symbols.
//
// So there is one function, both pages call it, and there is nowhere for a
// difference to hide.

import { Editor2D } from './editor2d.js';
import { loadIcons } from './palette.js';

export const DEFAULT_UNDERLAY = 'assets/underlays/map-01.jpg';

/**
 * Build the sheet renderer for a document.
 *
 * `onIcons` fires once the symbols have landed, for anything else that needs
 * repainting then (the mapper's palette swatches). The redraw itself is done
 * here, because forgetting it is exactly the bug this function exists to stop.
 */
export function createSheet(canvas, doc, opts = {}) {
  const ed = new Editor2D(canvas, doc);

  // Two switches, and they are about what the canvas IS, not how the map is
  // drawn. The map is drawn one way; a board is a map you cannot edit, with the
  // tracing photo and the tracing notes taken off it.
  //   underlay  the photo the map was traced over — an authoring reference
  //   pips      the markers on line ends that go nowhere — an authoring note
  //   locked    no dragging, no tools, no keys; pan and zoom only
  ed.locked = !!opts.locked;
  ed.hidePips = opts.pips === false;
  ed.noUnderlay = opts.underlay === false;
  syncSheet(ed, doc);

  // Every symbol on the sheet is an image cut from the rules PDF, and they
  // arrive after the first paint. `drawIcon` draws nothing until the load event
  // has fired, so without a redraw the board keeps the blank first frame.
  loadIcons(() => {
    if (opts.onIcons) opts.onIcons();
    ed.draw();
  });
  return ed;
}

/** Point the underlay at the document's, unless this canvas does without one. */
export function syncSheet(ed, doc) {
  ed.setUnderlay(ed.noUnderlay ? null : (doc.map.underlay && doc.map.underlay.src));
}
