// Waypoints — how hard to work this machine.
//
// The park is fifteen kilometres of terrain with a few million triangles of
// scenery on it, and it is meant to be played by an eight-year-old on a tablet.
// A laptop with a real GPU can have all of it; a four-year-old Android tablet
// cannot, and the honest thing to do is give it a smaller park rather than the
// same park at four frames a second.
//
// Two parts, and they are different jobs. The TIER is a guess made before
// anything has been drawn, from what the browser will tell us about the
// machine. The GOVERNOR is the correction: it watches real frames and turns
// things down if the guess was optimistic. The guess is allowed to be wrong.
// Only the governor is allowed to be slow.
//
// Pure except for reading `navigator` and `performance`, so the numbers can be
// checked in node.

/** What each tier is allowed. Multipliers, so the mapper's numbers stay the source. */
export const TIERS = {
  // A desktop or a recent iPad: the park as designed.
  high: { pixels: 2, aa: true, res: 56, scenery: 1, cover: 1, shadows: true, pins: true },
  // Most tablets. Half the pixels is the single biggest win on a mobile GPU —
  // these are fill-rate bound long before they are triangle bound — and it is
  // the one a child will not notice on a nine-inch screen.
  mid: { pixels: 1.5, aa: true, res: 48, scenery: 0.7, cover: 0.55, shadows: true, pins: true },
  // Old, small, or measured to be struggling. No antialiasing, one pixel per
  // pixel, and a third of the scenery.
  low: { pixels: 1, aa: false, res: 40, scenery: 0.45, cover: 0.3, shadows: false, pins: false },
};

const ORDER = ['low', 'mid', 'high'];

/**
 * A guess at what this machine can do, before a frame has been drawn.
 *
 * Nothing here is reliable on its own — `deviceMemory` is Chrome-only and
 * rounded, `hardwareConcurrency` counts little cores as big ones, and a phone
 * can report eight of them. Taken together they sort machines into the right
 * bucket often enough to be worth doing, and the governor fixes the rest.
 */
export function guessTier(nav = typeof navigator === 'undefined' ? {} : navigator,
                          win = typeof window === 'undefined' ? {} : window) {
  const mem = nav.deviceMemory || 0;                 // GB, rounded down, Chrome
  const cores = nav.hardwareConcurrency || 0;
  const ua = String(nav.userAgent || '');
  const touch = (nav.maxTouchPoints || 0) > 1;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touch;
  const px = (win.screen ? win.screen.width * (win.devicePixelRatio || 1) : 0);

  // Anything that says it is short of memory or cores is low, whatever it is.
  if ((mem && mem <= 2) || (cores && cores <= 2)) return 'low';
  // A desktop browser with no touch: assume it can cope.
  if (!mobile) return (mem && mem <= 4) ? 'mid' : 'high';
  // On a tablet, plenty of memory and cores and a big screen earns mid. A
  // modern iPad reports neither deviceMemory nor much else, so a large backing
  // store is taken as a sign of a machine that can drive it.
  if ((mem >= 6 && cores >= 6) || px >= 2200) return 'mid';
  if (mem >= 4 || cores >= 6) return 'mid';
  return 'low';
}

/** The next tier down, or null at the bottom. */
export function lower(tier) {
  const i = ORDER.indexOf(tier);
  return i > 0 ? ORDER[i - 1] : null;
}

/**
 * Watch real frames and call back when this machine is plainly struggling.
 *
 * A median rather than a mean, over a whole second of frames: one 300 ms hitch
 * while the scenery rebuilds is not a slow machine, and a mean would say it
 * was. Two bad seconds in a row before anything is turned down, because the
 * first one may be the build itself — and once turned down it waits a good
 * while before judging again, so a machine on a boundary cannot flap.
 */
export function governor(onDrop, opts = {}) {
  const slowMs = opts.slowMs || 34;          // below ~30fps
  const window_ = opts.window || 1000;
  const runs = opts.runs || 2;
  const cool = opts.cool || 6000;
  let frames = [], mark = 0, bad = 0, until = 0, last = 0, stop = false;

  const tick = (now) => {
    if (stop) return;
    if (last) frames.push(now - last);
    last = now;
    if (!mark) mark = now;
    if (now - mark >= window_) {
      const med = median(frames);
      if (now > until) {
        if (med > slowMs) {
          bad++;
          if (bad >= runs) { bad = 0; until = now + cool; onDrop(med); }
        } else bad = 0;
      }
      frames = []; mark = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => { stop = true; };
}

/** The middle frame time, which a hitch cannot drag around. */
export function median(a) {
  if (!a || !a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
