/* controls.js — the four on-screen buttons, and the one rule they all follow.
 *
 * WHY THIS IS ITS OWN FILE. The POD button was unreliable — "not consistent
 * for me at all" — and the reason was structural rather than a bug in one
 * handler, so the fix is structural too. Three things were wrong with a
 * control that lived as a plain element next to the canvas:
 *
 *   1. A press that MOVES is not a click. The pod was fired from a handler on
 *      a button that a thumb often slides on: on a touchscreen that press
 *      becomes a drag and the tap is never delivered. Every control here fires
 *      on `pointerdown` and is finished with the gesture at that instant.
 *   2. A press that starts on a control must never become a ship drag, and a
 *      ship drag must never be stolen by a control. Each control CAPTURES its
 *      own pointer, so every move and the release belong to it whatever the
 *      thumb does afterwards, and input.js additionally refuses any pointer
 *      whose target is inside the pad.
 *   3. The bottom-right corner of an iPad is the home-indicator zone, which
 *      eats the start of a touch. The pad is inset away from the corner (the
 *      art side's CSS does this with env(safe-area-inset-*)).
 *
 * The beam button additionally needs press-AND-HOLD to survive a thumb that
 * slides: capture makes `pointerup` land on the button that was pressed, even
 * if the thumb has wandered onto the canvas by then, so a charge can never get
 * stuck on.
 */
import { CFG } from './config.js';
import { ICONS, installControlCSS } from './icons.js';

export function createControls(host, handlers = {}) {
  installControlCSS(document);

  const pad = document.createElement('div');
  pad.className = 'dfc-pad';
  pad.id = 'dfcPad';

  const topPad = document.createElement('div');
  // the class is the contract; the id is only there for the CSS's bridge
  topPad.className = 'dfc-pad dfc-pad--top';
  topPad.id = 'dfcTopPad';

  /* A button and its hint slip, side by side inside a slot.
   *
     The slip is a SIBLING of the button, not a child: the pod and the pause
     both swap their own innerHTML when their meaning changes, which would
     throw away anything parented inside them. */
  function button(cls, icon, label, hintText) {
    const slot = document.createElement('span');
    slot.className = 'dfc-slot';
    const b = document.createElement('button');
    b.className = 'dfc ' + cls;
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = icon;
    slot.appendChild(b);
    /* Only the two primaries get a label. Pause and infinite-lives are a
       universal glyph and a symbol a child works out by pressing it once;
       explaining them costs attention that belongs to the two controls the
       game is actually about. */
    let hint = null;
    if (hintText) {
      hint = document.createElement('span');
      hint.className = 'dfc-label';
      hint.textContent = hintText;
      hint.setAttribute('aria-hidden', 'true');
      slot.appendChild(hint);
    }
    /* NOT `b.slot` and NOT `b.hint`: `slot` is a real HTMLElement property —
       the shadow-DOM slot name — and its setter coerces whatever you give it
       to a STRING. Assigning the element produced "[object HTMLSpanElement]",
       appendChild was handed that string, and module initialisation died on
       the spot, taking the whole game with it. Anything stashed on a DOM node
       gets a prefix the platform will never own. */
    b.dfSlot = slot;
    b.dfHint = hint;
    return b;
  }

  const L = CFG.intro.labels;
  /* Every slip sits directly above its own button, right edges aligned — one
     placement rule, and since they are shown one at a time they can never
     collide or need nudging out of each other's way. */
  const beamBtn = button('dfc--beam', ICONS.beam, 'Hold to charge the Wave Cannon', L.beam);
  const podBtn = button('dfc--pod', ICONS.pod, 'Throw or call back the Force pod', L.pod);
  const pauseBtn = button('dfc--small dfc--pause', ICONS.pause, 'Pause', null);
  const infBtn = button('dfc--small dfc--inf', ICONS.infinity, 'Infinite lives', null);

  pad.appendChild(beamBtn.dfSlot);
  pad.appendChild(podBtn.dfSlot);
  topPad.appendChild(pauseBtn.dfSlot);
  topPad.appendChild(infBtn.dfSlot);
  (host || document.body).appendChild(pad);
  (host || document.body).appendChild(topPad);

  /* One press model for every control.
   *
   * `onPress` fires the instant the thumb lands. `onRelease` fires when that
   * same pointer lifts or is cancelled — and because the control captured the
   * pointer, that is guaranteed to arrive even if the thumb has slid right off
   * the button, which is what stops a held charge from sticking on. */
  /* `stillHeld` lets a control keep looking held down after the thumb has
     lifted — the pod button does this while a press is queued through a
     respawn, and without it the release handler wipes the very feedback that
     says "I took that". */
  function wire(el, onPress, onRelease, stillHeld) {
    let held = -1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      /* A press while another pointer is still held on this button takes it
         over rather than being ignored. If a `pointerup` were ever lost — a
         browser quirk, a system gesture stealing the touch — ignoring would
         leave the button dead for the rest of the run, and this is the control
         the whole game hangs on. The old press is released first so a held
         beam can never be left charging. */
      if (held !== -1 && held !== e.pointerId) {
        held = -1;
        el.classList.remove('is-pressed');
        if (onRelease) onRelease();
      }
      if (held === e.pointerId) return;
      held = e.pointerId;
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
      el.classList.add('is-pressed');
      if (onPress) onPress();
    }, { passive: false });

    const up = (e) => {
      if (e.pointerId !== held) return;
      held = -1;
      if (!(stillHeld && stillHeld())) el.classList.remove('is-pressed');
      if (el.releasePointerCapture) { try { el.releasePointerCapture(e.pointerId); } catch (err) {} }
      if (onRelease) onRelease();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // a pointer lost to the system (a call, a notification) must not stick
    el.addEventListener('lostpointercapture', () => {
      if (held === -1) return;
      held = -1;
      if (!(stillHeld && stillHeld())) el.classList.remove('is-pressed');
      if (onRelease) onRelease();
    });
    // these are not links and they are not text
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dragstart', (e) => e.preventDefault());
  }

  wire(podBtn, () => handlers.onPod && handlers.onPod(), null, () => podPending);
  wire(beamBtn, () => handlers.onBeamDown && handlers.onBeamDown(),
    () => handlers.onBeamUp && handlers.onBeamUp());
  wire(pauseBtn, () => handlers.onPause && handlers.onPause());
  wire(infBtn, () => handlers.onInfinite && handlers.onInfinite());

  /* ------------------------------------------------------------- the state */

  let podOut = null, charge = -1, ready = null, paused = null, infinite = null;
  let enabled = null, podPending = false;

  const api = {
    pad, topPad, podBtn, beamBtn, pauseBtn, infBtn,
    setVisible(on) {
      pad.style.display = on ? '' : 'none';
      topPad.style.display = on ? '' : 'none';
    },
    /* The pod button IS the recall button when the pod is out — different
       colour, different icon, so what pressing it will do is never a guess. */
    setPodOut(v) {
      if (v === podOut) return;
      podOut = v;
      podBtn.classList.toggle('is-armed', !!v);
      podBtn.innerHTML = v ? ICONS.podRecall : ICONS.pod;
      podBtn.setAttribute('aria-label', v ? 'Call back the Force pod' : 'Throw the Force pod');
    },
    setCharge(v, isReady) {
      const q = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;   // 5% steps
      if (q !== charge) {
        charge = q;
        beamBtn.style.setProperty('--dfc-charge', String(q));
        beamBtn.classList.toggle('is-charging', q > 0.02);
      }
      if (isReady !== ready) {
        ready = isReady;
        beamBtn.classList.toggle('is-ready', !!isReady);
      }
    },
    /* The art side's [disabled] styling, used only where a press really will
       do nothing. A button that looks identical whether or not it will act is
       the thing that makes a control feel broken. */
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      for (const b of [podBtn, beamBtn]) {
        if (on) b.removeAttribute('disabled');
        else b.setAttribute('disabled', '');
      }
    },
    /* A press taken during a respawn: the button holds itself down until the
       ship is back and the press is spent, so the player can see it landed. */
    setPodPending(v) {
      if (v === podPending) return;
      podPending = v;
      podBtn.classList.toggle('is-pressed', !!v);
    },
    setPaused(v) {
      if (v === paused) return;
      paused = v;
      pauseBtn.innerHTML = v ? ICONS.play : ICONS.pause;
      pauseBtn.setAttribute('aria-label', v ? 'Carry on' : 'Pause');
    },
    setInfinite(v) {
      if (v === infinite) return;
      infinite = v;
      infBtn.classList.toggle('is-on', !!v);
      infBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
    },
  };

  /* ------------------------------------------------ the fold's opening */

  /* Buttons arrive one after another; each slip follows its own button. All of
     it is the art side's CSS — this sets a class and a few custom properties.
     Nothing here touches pointer handling, so every button is live from the
     first frame of its own entrance: the animation is decoration over a
     control that already works.
   *
     `withHints` false keeps the entrance and drops the labels, which is what
     the later folds get. */
  const ORDER = [beamBtn, podBtn, pauseBtn, infBtn];
  /* The two that explain themselves, and only these two. Pause and infinite
     lives are a universal glyph and a symbol a child works out by pressing it
     once; labelling them spends attention that belongs to the other two. */
  const TOLD = [beamBtn, podBtn];
  let introOn = false;
  let timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  function intro({ withHints = true, hold = CFG.intro.hintHold } = {}) {
    const I = CFG.intro;
    if (!I.on) return;
    skipIntro();
    introOn = true;
    const ms = (sec) => Math.round(sec * 1000) + 'ms';

    /* Every button arrives, staggered. */
    ORDER.forEach((b, i) => {
      const delay = i * I.stagger;
      b.classList.remove('dfc--enter');
      // a class removed and re-added in one frame does not restart an
      // animation; reading a layout property between the two is what does
      void (b.offsetWidth || 0);
      b.style.setProperty('--dfc-enter-dur', ms(I.enterDur));
      b.style.setProperty('--dfc-enter-delay', ms(delay));
      b.classList.add('dfc--enter');
    });
    if (!withHints) return;

    /* BOTH primaries arrive as labelled pills, together, and BOTH collapse
       together after the hold. Together rather than in turn because a player
       who starts flying immediately — which is every player — would otherwise
       only ever see the first one. */
    for (const b of TOLD) {
      b.classList.add('dfc--pill');
      b.dfSlot.classList.add('is-telling');
    }
    at((I.hintIn + hold) * 1000, collapse);
  }

  /* Shrink the pills to their icons. This IS the animation — width, shape and
     padding are transitioned on .dfc, so the button visibly becomes the thing
     you will be pressing for the rest of the game. */
  function collapse() {
    for (const b of TOLD) {
      b.classList.remove('dfc--pill');
      b.dfSlot.classList.remove('is-telling');
    }
    introOn = false;
  }

  /* Nothing on the screen cancels this any more. The old version dropped the
     whole intro on any pointer or key anywhere, which meant a player who put a
     thumb down to fly — again, every player — killed it before the second
     label had been shown at all. Pressing one of the two buttons collapses
     them, because at that point the player has plainly got the idea. */
  function skipIntro() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (!introOn && !ORDER.some((b) => b.classList.contains('dfc--enter'))) return;
    introOn = false;
    for (const b of ORDER) b.classList.remove('dfc--enter');
    collapse();
  }

  /* Pressing either of the two collapses them both: the player has the idea. */
  for (const b of TOLD) {
    b.addEventListener('pointerdown', () => { if (introOn) skipIntro(); }, true);
  }

  api.intro = intro;
  api.skipIntro = skipIntro;
  api.introRunning = () => introOn;
  api.told = TOLD;

  api.setEnabled(true);
  api.setPodPending(false);
  api.setVisible(false);
  api.setPodOut(false);
  api.setPaused(false);
  api.setInfinite(false);
  api.setCharge(0, false);
  return api;
}
