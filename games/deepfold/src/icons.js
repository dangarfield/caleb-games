/* icons.js — the on-screen controls.
 *
 * This is the one file in the game that cannot use the paper kit. The controls
 * are HTML over a WebGL canvas, so the cut-paper language has to be rebuilt out
 * of SVG and CSS: same light, same rim, same palette, drawn a different way.
 *
 * What carries across from paper.js, and must stay in step with it:
 *
 *   - ONE LIGHT. Every shadow is offset down and right by the same amount, and
 *     it is HARD — no blur anywhere. paperPiece stacks two copies of a piece at
 *     one and two times the offset at half opacity each, so the overlap reads
 *     full strength and the outer band reads half: a two-step soft edge with no
 *     gradient in it. Two stacked box-shadows do exactly the same thing.
 *   - THE RIM. Every actor carries a near-white sheet a little larger than
 *     itself. A control gets the same, as a spread-only ring outside the fill.
 *   - FLAT FILL. No gradients, no glass, no blur. If a control needs to say
 *     something, it says it by changing colour or by moving, not by glowing.
 *
 * It is a tablet game with no keyboard, so these ARE the controls. Everything
 * below is sized for a thumb first and looked at second.
 *
 * Markup this expects:
 *
 *   <div class="dfc-pad">
 *     <button class="dfc dfc--beam" id="beamBtn">...beam...</button>
 *     <button class="dfc dfc--pod"  id="podBtn">...pod...</button>
 *     <div class="dfc-row">
 *       <button class="dfc dfc--small dfc--pause">...pause...</button>
 *       <button class="dfc dfc--small dfc--inf">...infinity...</button>
 *     </div>
 *   </div>
 *
 * State is classes: `is-armed` on the pod while it is out, `is-on` on the
 * infinity toggle, `is-charging` plus a `--dfc-charge` of 0..1 on the beam,
 * and `is-ready` when that charge is full.
 */

/* --------------------------------------------------------------- icons ---
 *
 * All 24x24, all `currentColor`, so the CSS colours them and a disabled or
 * pressed state needs no second copy of the artwork. They scale to whatever
 * box they are put in.
 */

const SVG = (body) =>
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  body + '</svg>';

/* The Force pod, going out. Concentric rings — the pod is a contour stack in
   the game and the icon says so — with the arrow leading away to the right. */
export const pod = SVG(
  '<circle cx="8.6" cy="12" r="6.1" stroke="currentColor" stroke-width="1.7"/>' +
  '<circle cx="8.6" cy="12" r="3.1" fill="currentColor"/>' +
  '<path d="M16.4 12h5.1" stroke="currentColor" stroke-width="2.1"/>' +
  '<path d="M18.9 9.2 21.7 12l-2.8 2.8" stroke="currentColor" stroke-width="2.1"/>'
);

/* The same pod coming back. Deliberately the exact mirror of `pod`: at a
   glance the only thing that has changed is which way the picture faces, which
   is the fastest possible way to read an inverse. */
export const podRecall = SVG(
  '<circle cx="15.4" cy="12" r="6.1" stroke="currentColor" stroke-width="1.7"/>' +
  '<circle cx="15.4" cy="12" r="3.1" fill="currentColor"/>' +
  '<path d="M7.6 12H2.5" stroke="currentColor" stroke-width="2.1"/>' +
  '<path d="M5.1 9.2 2.3 12l2.8 2.8" stroke="currentColor" stroke-width="2.1"/>'
);

/* The Wave Cannon. Two things had to be designed out of it before it read:
 *
 *   - a triangle with its apex at the emitter is the REWIND glyph, so the beam
 *     is a cone with a flat edge at both ends — something leaving, rather than
 *     an arrow pointing at something;
 *   - a cone with upright bars beside it is the VOLUME glyph, so the charge
 *     marks run along the beam's axis instead of across it. Nothing about a
 *     speaker icon is axial, and that is what tells the two apart.
 */
export const beam = SVG(
  '<path d="M1.5 12h5.6M3.4 8.3h3.7M3.4 15.7h3.7" stroke="currentColor" stroke-width="1.9"/>' +
  '<path d="M8.8 10.1 21.6 4.6v14.8L8.8 13.9Z" fill="currentColor" ' +
  'stroke="currentColor" stroke-width="1.5"/>'
);

export const pause = SVG(
  '<rect x="6.3" y="4.6" width="4.4" height="14.8" rx="1.7" fill="currentColor"/>' +
  '<rect x="13.3" y="4.6" width="4.4" height="14.8" rx="1.7" fill="currentColor"/>'
);

export const play = SVG(
  '<path d="M7.8 5 19.2 12 7.8 19Z" fill="currentColor" stroke="currentColor" stroke-width="1.9"/>'
);

export const infinity = SVG(
  '<path d="M12 12c-1.6-2.6-3.2-3.8-5.2-3.8a3.8 3.8 0 1 0 0 7.6c2 0 3.6-1.2 5.2-3.8' +
  'c1.6-2.6 3.2-3.8 5.2-3.8a3.8 3.8 0 1 1 0 7.6c-2 0-3.6-1.2-5.2-3.8Z" ' +
  'stroke="currentColor" stroke-width="2.1"/>'
);

/* One life, drawn as the ship. The game's hull is a delta with a straight tail
   cut; this has a notched one, because at HUD size a plain triangle is the
   play icon and the two must never be confused. */
export const life = SVG(
  '<path d="M21.4 12 5.2 4.4 10.1 12 5.2 19.6Z" fill="currentColor" ' +
  'stroke="currentColor" stroke-width="1.6"/>'
);

export const ICONS = { pod, podRecall, beam, pause, play, infinity, life };

/* ----------------------------------------------------------------- css ---
 *
 * Injected once: document.head.appendChild(Object.assign(
 *   document.createElement('style'), { textContent: CONTROL_CSS }))
 *
 * The custom properties at the top are the whole theme. They mirror
 * palette.js — SHADOW, RIM and the ramp colours — so if the palette moves,
 * these are the seven lines to move with it.
 */
export const CONTROL_CSS = `
.dfc-pad {
  --dfc-ink: #f2fbff;            /* RIM: the rim and the icon */
  --dfc-shadow: 16 42 92;        /* SHADOW.color, as channels for rgb() */
  --dfc-step: 0.09;              /* SHADOW.opacity split over two copies */
  --dfc-dx: 5px;                 /* one light, down and right, for everything */
  --dfc-dy: 5px;
  --dfc-rim: 3px;
  --dfc-face: #2b5fd9;
  --dfc-ring: transparent;

  position: fixed;
  right: calc(14px + env(safe-area-inset-right, 0px));
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  display: flex;
  align-items: flex-end;
  gap: 14px;
  pointer-events: none;          /* the gaps are still play area */
}
.dfc-pad > * { pointer-events: auto; }
.dfc-row { display: flex; flex-direction: column; gap: 10px; }

/* The secondaries live top-right. Same pad, flipped to the other corner — the
   hint slips still open leftward, so nothing about the hint logic changes.
   (#dfcTopPad is a bridge for the pad controls.js already builds; the class is
   the contract, and the id selector can go once that pad carries it.) */
.dfc-pad--top, #dfcTopPad {
  top: calc(14px + env(safe-area-inset-top, 0px));
  bottom: auto;
  align-items: flex-start;
}

/* Anchor for a hint slip. A button whose innerHTML gets swapped — the pod and
   the pause both do — would throw away a slip parented inside it, so the slip
   goes beside the button in one of these instead:

     <span class="dfc-slot">
       <button class="dfc dfc--pod">...</button>
       <span class="dfc-hint">Throw the pod</span>
     </span>  */
.dfc-slot { position: relative; display: inline-flex; flex: 0 0 auto; }

.dfc {
  --dfc-size: 76px;
  position: relative;
  width: var(--dfc-size);
  height: var(--dfc-size);
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  appearance: none;
  -webkit-appearance: none;
  background: var(--dfc-face);
  color: var(--dfc-ink);
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  /* rim first (a spread-only ring, so it sits OUTSIDE the fill like the
     actors' rim sheet), then the two hard offset copies that make the shadow */
  box-shadow:
    0 0 0 var(--dfc-rim) var(--dfc-ink),
    var(--dfc-dx) var(--dfc-dy) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step)),
    calc(var(--dfc-dx) * 2) calc(var(--dfc-dy) * 2) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step));
  transition: transform 90ms ease-out, box-shadow 90ms ease-out,
              background-color 140ms linear,
              width 520ms cubic-bezier(.2, .8, .3, 1),
              border-radius 520ms cubic-bezier(.2, .8, .3, 1),
              padding-left 520ms cubic-bezier(.2, .8, .3, 1);
}
.dfc > svg { position: relative; z-index: 2; width: 52%; height: 52%; display: block; }

/* Pressed: the paper is pushed down onto its own shadow. The button travels
   exactly one step along the light's direction and the shadow loses that step,
   so the two meet — which is why it reads as pressure and not as a slide. */
.dfc:active,
.dfc.is-pressed {
  transform: translate(var(--dfc-dx), var(--dfc-dy));
  box-shadow:
    0 0 0 var(--dfc-rim) var(--dfc-ink),
    0 0 0 0 rgb(var(--dfc-shadow) / var(--dfc-step)),
    var(--dfc-dx) var(--dfc-dy) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step));
}

/* The armed / on ring: a second sheet of card behind the button, showing as a
   band around it. Only ever one colour at a time, so it cannot be ambiguous. */
.dfc::after {
  content: '';
  position: absolute;
  inset: calc(-1 * (var(--dfc-rim) + 7px));
  border-radius: inherit;
  border: 4px solid var(--dfc-ring);
  pointer-events: none;
  transition: border-color 140ms linear;
}

.dfc:focus-visible { outline: 3px solid #ffd32a; outline-offset: 6px; }

/* ---------------------------------------------------------- the intro pill
 * When a fold opens, each primary ARRIVES AS A LABELLED PILL and then shrinks
 * to its icon. The button is its own explanation: nothing floats over the play
 * area, nothing has to be positioned beside anything, and both can say their
 * piece at the same time because each one is only ever as wide as its own
 * label. The shrink is the animation — a button visibly becoming the thing you
 * will be pressing for the rest of the game.
 */
/* Doubled class on purpose: .dfc--pod and .dfc--beam set their own
   border-radius further up and would otherwise win on equal specificity,
   leaving a 236x92 box with a 50% radius — an ellipse, not a pill. */
.dfc.dfc--pill {
  width: var(--dfc-pill, 236px);
  border-radius: calc(var(--dfc-size) / 2);
  display: flex;
  justify-content: flex-start;
  align-items: center;
  padding-left: calc((var(--dfc-size) - var(--dfc-size) * 0.52) / 2);
}
/* The icon is a percentage of the box, so on a pill it would stretch: pin it. */
.dfc.dfc--pill > svg { width: calc(var(--dfc-size) * 0.52); height: calc(var(--dfc-size) * 0.52); flex: 0 0 auto; }

/* The label lives on the SLOT, not in the button — the pod and the pause swap
   their own innerHTML, which would throw away anything parented inside them. */
.dfc-label {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%) translateX(10px);
  opacity: 0;
  font: 800 18px/1 'Segoe UI', system-ui, sans-serif;
  letter-spacing: .01em;
  color: var(--dfc-ink);
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
  transition: opacity 200ms ease, transform 200ms ease;
}
.dfc-slot.is-telling .dfc-label {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
  transition: opacity 300ms ease 180ms, transform 300ms ease 180ms;
}
.dfc[disabled] { opacity: 0.45; cursor: default; }

/* ---- the two primaries. Different SHAPE as well as different icon, because
   on a tablet the thumb finds them by outline before the eye reads them. ---- */
.dfc--pod  { --dfc-size: 92px; border-radius: 50%; }        /* round  */
.dfc--beam { --dfc-size: 92px; border-radius: 30%; }        /* square */

.dfc--pod  { --dfc-face: #2b5fd9; }
.dfc--beam { --dfc-face: #5a45e0; --dfc-charge-face: #2ce8f5; }

/* Pod out: the button becomes the recall button. Magenta is used for nothing
   else on the pad, and the icon flips to podRecall at the same time. */
.dfc--pod.is-armed { --dfc-face: #c026d3; --dfc-ring: #e487e0; }

/* Charging: a second sheet slides up the face. A flat edge with no gradient —
   the same move as a contour band, just animated. */
.dfc--beam::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  background: var(--dfc-charge-face);
  clip-path: inset(calc((1 - var(--dfc-charge, 0)) * 100%) 0 0 0);
  transition: clip-path 80ms linear;
}
.dfc--beam.is-charging { --dfc-ring: #2ce8f5; }
.dfc--beam.is-ready    { --dfc-ring: #ffd32a; --dfc-charge: 1; }
/* The ready blink animates the ring's own border-color rather than the custom
   property behind it: a custom property in a keyframe only switches at all if
   it has been registered with @property, and this has to work everywhere. */
.dfc--beam.is-ready::after { animation: dfc-ready 620ms steps(1, end) infinite; }
@keyframes dfc-ready { 0%, 49% { border-color: #ffd32a; } 50%, 100% { border-color: #f2fbff; } }

/* ---- secondaries: still a 64px target, just quieter ---- */
.dfc--small { --dfc-size: 64px; border-radius: 50%; --dfc-face: #3a5cd8; --dfc-rim: 2.5px; }
.dfc--small > svg { width: 46%; height: 46%; }

/* Infinite lives on: gold, the game's one "this is a cheat and we know" colour,
   and the only gold on the pad. */
.dfc--inf.is-on { --dfc-face: #ffd32a; --dfc-ring: #ffd32a; color: #0a0a2e; }

/* ---- HUD lives: the same paper, not a button ---- */
.dfc-lives { display: flex; gap: 6px; align-items: center; }
.dfc-lives > svg { width: 22px; height: 22px; color: #f2fbff;
  filter: drop-shadow(var(--dfc-dx, 5px) var(--dfc-dy, 5px) 0 rgb(16 42 92 / 0.18)); }
.dfc-lives > svg.is-spent { color: #3a5cd8; }

/* ---- the fold's opening: buttons arrive, then say what they are ----------
 *
 * Both of these are pure CSS. The gameplay side adds a class and, where it
 * wants a sequence, sets one custom property; nothing here needs a frame loop.
 *
 * Add .dfc--enter to each button as the fold loads, with --dfc-enter-delay
 * rising across them so they arrive one after another rather than all at once.
 */
.dfc--enter {
  /* animation-fill-mode is backwards, NOT both. Backwards holds the 0% state
     through the stagger delay so the button is not on screen before its turn,
     and then hands the element back to its normal rules once it lands. A
     forwards fill would keep
     the final keyframe's transform and box-shadow applied for good, and the
     pressed state — which is a plain declaration — could never win against it
     again. The 100% keyframe is the resting style, so nothing moves at the
     hand-off. Leaving the class on is therefore harmless. */
  animation: dfc-enter var(--dfc-enter-dur, 460ms) cubic-bezier(.2, .8, .3, 1)
             var(--dfc-enter-delay, 0ms) backwards;
}

/* Comes in from down-right — out of where its own shadow lies — lands a little
   past its resting size and settles back. The shadow is animated from nothing
   to full along with it, so the piece arrives WITH its shadow instead of the
   shadow having been on the page the whole time waiting for it. */
@keyframes dfc-enter {
  0% {
    opacity: 0;
    transform: translate(calc(var(--dfc-dx) * 2.6), calc(var(--dfc-dy) * 2.6)) scale(0.62);
    box-shadow:
      0 0 0 var(--dfc-rim) var(--dfc-ink),
      0 0 0 0 rgb(var(--dfc-shadow) / 0),
      0 0 0 0 rgb(var(--dfc-shadow) / 0);
  }
  58% {
    opacity: 1;
    transform: translate(0, 0) scale(1.07);
    box-shadow:
      0 0 0 var(--dfc-rim) var(--dfc-ink),
      calc(var(--dfc-dx) * 1.3) calc(var(--dfc-dy) * 1.3) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step)),
      calc(var(--dfc-dx) * 2.6) calc(var(--dfc-dy) * 2.6) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step));
  }
  80% { transform: translate(0, 0) scale(0.982); }
  100% {
    opacity: 1;
    transform: none;
    box-shadow:
      0 0 0 var(--dfc-rim) var(--dfc-ink),
      var(--dfc-dx) var(--dfc-dy) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step)),
      calc(var(--dfc-dx) * 2) calc(var(--dfc-dy) * 2) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step));
  }
}

/* ---- hint slips -----------------------------------------------------------
 *
 * A slip of card beside a button saying what it does. Add .is-showing and it
 * comes in, holds, and goes again on its own.
 *
 * Both pads sit against the right edge, so every slip opens to the LEFT of its
 * button whichever pad it is in. Two things keep them out of each other's way:
 * --dfc-hint-row lifts a slip clear by whole rows, for when two are up at once
 * (the primaries sit side by side, so the right-hand one's slip would
 * otherwise cross the left-hand button), and the width is capped against the
 * viewport so it wraps rather than running off the left edge on a phone.
 */
.dfc-hint {
  /* A hint is a slip of CUT PAPER, not a tooltip. Built like every other piece
     in this game: a face, a pale rim, then bands stepping out and down the
     ramp, then the one light's hard offset shadow. Concentric spread rings are
     how you stack paper in CSS - and there is no blur anywhere in it. */
  --dfc-hint-face: #16305c;
  /* The two sheets under the face. They have to be ramp colours a shade or two
     apart from each other AND from the water behind, or the stack reads as one
     dark card with a rim — which is what a first pass at this looked like. */
  --dfc-hint-band1: #2f7fd8;
  --dfc-hint-band2: #7b3fe4;
  --dfc-hint-rim: 3px;
  --dfc-hint-gap: 20px;
  /* Where the tail meets the button: half the button's width, set from the
     measured button so it lands on the centre at any breakpoint. */
  --dfc-hint-point: 46px;
  /* The bands are box-shadow SPREAD, so they sit outside the slip's own box and
     outside the pad's inset with it. Hold the slip in by that much or the
     outermost sheet is sliced off by the right edge of the screen. */
  --dfc-hint-inset: 17px;
  --dfc-hint-in: 420ms;
  --dfc-hint-hold: 1800ms;
  --dfc-hint-out: 320ms;
  --dfc-hint-delay: 0ms;

  /* ABOVE its own button, right edges aligned. One rule for every slip, so two
     labels can never be placed differently - and since only one is on screen
     at a time they cannot collide either. */
  position: absolute;
  bottom: calc(100% + var(--dfc-hint-gap));
  right: var(--dfc-hint-inset);
  z-index: 3;

  width: max-content;
  max-width: min(62vw, 260px);
  box-sizing: border-box;
  padding: 10px 15px;
  border-radius: 13px;
  background: var(--dfc-hint-face);
  color: var(--dfc-ink);
  font: 700 16px/1.25 'Segoe UI', system-ui, sans-serif;
  text-align: right;
  text-wrap: balance;
  pointer-events: none;
  opacity: 0;
  box-shadow:
    0 0 0 var(--dfc-hint-rim) var(--dfc-ink),
    0 0 0 calc(var(--dfc-hint-rim) + 7px) var(--dfc-hint-band1),
    0 0 0 calc(var(--dfc-hint-rim) + 13px) var(--dfc-hint-band2),
    calc(var(--dfc-dx) * 1.6) calc(var(--dfc-dy) * 1.6) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step)),
    calc(var(--dfc-dx) * 3.2) calc(var(--dfc-dy) * 3.2) 0 0 rgb(var(--dfc-shadow) / var(--dfc-step));
}

/* The tail: a turned square behind the slip, pointing DOWN at the middle of
   the button it belongs to. The slip's body covers its upper half, so what
   shows is a rimmed point cut from the same card. */
.dfc-hint::after {
  content: '';
  position: absolute;
  bottom: -8px;
  /* Still lands on the button's centre: the slip was moved left by the inset,
     so the tail comes back right by the same amount. */
  right: calc(var(--dfc-hint-point) - 9px - var(--dfc-hint-inset));
  width: 18px;
  height: 18px;
  z-index: -1;
  background: var(--dfc-hint-face);
  box-shadow: 0 0 0 var(--dfc-hint-rim) var(--dfc-ink);
  transform: rotate(45deg);
}

/* The button being talked about beats a ring for as long as its slip is up.
   This is the drawing-attention half: a label that merely appears is something
   to read; a label over a button visibly pulsing is somewhere to look. The
   ring is a pseudo-element with its own box-shadow, so it cannot fight the
   button's real one or be wiped by an innerHTML swap. */
.dfc--callout::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: 1;
  pointer-events: none;
  animation: dfc-callout 1000ms ease-out infinite;
}
@keyframes dfc-callout {
  0%   { box-shadow: 0 0 0 0 rgb(242 251 255 / .9); }
  70%  { box-shadow: 0 0 0 26px rgb(242 251 255 / 0); }
  100% { box-shadow: 0 0 0 0 rgb(242 251 255 / 0); }
}

/* In, hold, out as two animations rather than one, because a single set of
   keyframes cannot have its stops placed by three independent durations. The
   second starts after the first plus the hold, and wins from then on. */
.dfc-hint.is-showing {
  transform-origin: bottom right;
  animation:
    dfc-hint-in var(--dfc-hint-in) cubic-bezier(.2, .8, .3, 1) var(--dfc-hint-delay) both,
    dfc-hint-out var(--dfc-hint-out) ease-in
      calc(var(--dfc-hint-delay) + var(--dfc-hint-in) + var(--dfc-hint-hold)) both;
}
@keyframes dfc-hint-in {
  0%   { opacity: 0; transform: translateY(10px) scaleY(.05) rotate(-2deg); }
  55%  { opacity: 1; transform: translateY(0) scaleY(1.10) rotate(1.2deg); }
  78%  { opacity: 1; transform: translateY(0) scaleY(.96) rotate(-.5deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes dfc-hint-out {
  0%   { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(8px) scaleY(.08) rotate(-1.5deg); }
}

/* ---- small screens: keep the thumb targets, shrink the gaps first ---- */
@media (max-width: 560px) {
  .dfc-pad { gap: 10px; right: calc(10px + env(safe-area-inset-right, 0px));
             bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }
  .dfc--pod, .dfc--beam { --dfc-size: 78px; }
  .dfc--small { --dfc-size: 64px; }
  .dfc-row { gap: 8px; }
}
/* Landscape phones have almost no height to give away, so the secondaries go
   beside the primaries rather than stacked above them. */
@media (max-height: 430px) {
  .dfc-row { flex-direction: row; }
  .dfc--pod, .dfc--beam { --dfc-size: 72px; }
}

/* Reduced motion: everything still arrives and every slip is still readable
   for the same length of time. Only the travel and the overshoot go — the
   entrance becomes a straight fade at full size with its shadow already on,
   and the slips fade where they sit. */
@media (prefers-reduced-motion: reduce) {
  .dfc, .dfc--beam::before, .dfc::after { transition: none; }
  .dfc--beam.is-ready::after { animation: none; }
  .dfc, .dfc-label { transition-duration: 1ms; }
  .dfc--callout::before { animation: none; box-shadow: 0 0 0 6px rgb(242 251 255 / .55); }
  .dfc--enter { animation-name: dfc-enter-fade; }   /* fill mode carries over */
  .dfc-hint.is-showing {
    animation:
      dfc-hint-fade-in var(--dfc-hint-in) linear var(--dfc-hint-delay) both,
      dfc-hint-fade-out var(--dfc-hint-out) linear
        calc(var(--dfc-hint-delay) + var(--dfc-hint-in) + var(--dfc-hint-hold)) both;
  }
}
@keyframes dfc-enter-fade {
  0%   { opacity: 0; transform: none; }
  100% { opacity: 1; transform: none; }
}
@keyframes dfc-hint-fade-in {
  0%   { opacity: 0; transform: none; }
  100% { opacity: 1; transform: none; }
}
@keyframes dfc-hint-fade-out {
  0%   { opacity: 1; transform: none; }
  100% { opacity: 0; transform: none; }
}
`;

/* Convenience for the usual case: inject the stylesheet once. */
export function installControlCSS(doc = document) {
  if (doc.getElementById('dfc-css')) return;
  const el = doc.createElement('style');
  el.id = 'dfc-css';
  el.textContent = CONTROL_CSS;
  doc.head.appendChild(el);
}
