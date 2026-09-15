/* input.js — character_input.gd + character_input_buffer.gd, plus thumbs.
 *
 * The buffer is the whole trick system's memory: four actions deep, each one
 * ageing out after half a second, and a trick fires when the tail of the buffer
 * matches its input sequence. Everything about tricks depends on this being
 * exactly the original's shape — including the odd-looking detail that JUMP is
 * pushed on RELEASE, not press, which is what lets you hold space to crouch and
 * let go to pop.
 *
 * The arcade is touch-first, so the same nine actions are also produced by a
 * left thumb-stick and four right-hand buttons.
 */

export const Action = {
  JUMP: 0, FLIP: 1, GRAB: 2, GRIND: 3,
  UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7, REVERT: 8
};
export const ACTION_NAME = ['JUMP', 'FLIP', 'GRAB', 'GRIND', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'REVERT'];

/* How each action is drawn: its key, and the colour of the button that does the
   same job. One map, so the recent-input readout, the trick list and the
   on-screen buttons can never drift apart — which they had, back when the
   readout used Xbox face buttons and put grind on yellow. */
/* Which picture and which colour each action wears — see src/icons.js. The
   key IS the icon name, so the pad you press and the chip that echoes it can
   never drift apart. */
export const ACTION_CHIP = {
  JUMP:   { c: 'a', pad: 'Jump' },
  FLIP:   { c: 'x', pad: 'Flip' },
  GRAB:   { c: 'y', pad: 'Grab' },
  GRIND:  { c: 'b', pad: 'Grind' },
  UP:     { c: 'd' },
  DOWN:   { c: 'd' },
  LEFT:   { c: 'd' },
  RIGHT:  { c: 'd' },
  REVERT: { c: 'r' }
};

const MAX_SIZE = 4;
const COOLDOWN = 0.5;
const JUMP_COOLDOWN = 0.1;

export class InputBuffer {
  constructor() { this.buffer = []; this.cooldown = 0; this.changed = false; }
  push(action) {
    this.buffer.push(action);
    if (this.buffer.length > MAX_SIZE) this.buffer.shift();
    this.cooldown = COOLDOWN;
    this.changed = true;
  }
  clear() { this.buffer.length = 0; this.changed = true; }
  last() { return this.buffer.length ? this.buffer[this.buffer.length - 1] : -1; }
  secondLast() { return this.buffer.length >= 2 ? this.buffer[this.buffer.length - 2] : -1; }
  tick(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    else { this.buffer.shift(); this.cooldown = COOLDOWN; this.changed = true; }
  }
}

/* Keyboard mapping. Steering and jump are the original's; the three trick keys
   are J K L instead of F G X, so they sit under the right hand in the order the
   on-screen buttons are in — flip, grab, grind, left to right. */
const KEYS = {
  KeyW: 'Up', ArrowUp: 'Up',
  KeyS: 'Down', ArrowDown: 'Down',
  KeyA: 'Left', ArrowLeft: 'Left',
  KeyD: 'Right', ArrowRight: 'Right',
  Space: 'Jump',
  KeyJ: 'Flip',
  KeyK: 'Grab',
  KeyL: 'Grind',
  KeyQ: 'Revert'
};

export class CharacterInput {
  constructor() {
    this.buffer = new InputBuffer();
    this.input = { x: 0, y: 0, z: 0 };
    this._jumpTimer = 0;
    this.upPresses = 0;
    this.held = Object.create(null);   // action name -> true
    this.pressed = Object.create(null);
    this.released = Object.create(null);
    this.onBufferChange = null;
    this.enabled = true;
    this.pauseRequested = false;
    this.resetRequested = false;
    this._pad = { x: 0, y: 0 };        // touch stick, -1..1
    this._padActive = false;
  }

  attach(el) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape') { this.pauseRequested = true; return; }
      if (e.code === 'KeyR') { this.resetRequested = true; return; }
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      this._down(a);
    });
    addEventListener('keyup', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      this._up(a);
    });
    addEventListener('blur', () => { for (const k in this.held) this._up(k); });
    this._attachTouch(el);
  }

  _down(a) { if (this.held[a]) return; this.held[a] = true; this.pressed[a] = true; }
  _up(a) { if (!this.held[a]) return; this.held[a] = false; this.released[a] = true; }

  /* --- touch: a stick on the left, four buttons on the right --- */
  _attachTouch(root) {
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stickKnob');
    if (stick) {
      let id = null, cx = 0, cy = 0, r = 1;
      const start = (e) => {
        const t = e.changedTouches ? e.changedTouches[0] : e;
        id = t.identifier ?? 'mouse';
        const b = stick.getBoundingClientRect();
        cx = b.left + b.width / 2; cy = b.top + b.height / 2; r = b.width * 0.42;
        this._padActive = true;
        move(e);
      };
      const move = (e) => {
        if (!this._padActive) return;
        const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
        const t = list.find((p) => (p.identifier ?? 'mouse') === id);
        if (!t) return;
        let dx = (t.clientX - cx) / r, dy = (t.clientY - cy) / r;
        const len = Math.hypot(dx, dy);
        if (len > 1) { dx /= len; dy /= len; }
        this._pad.x = dx; this._pad.y = dy;
        knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
        /* the stick also fires discrete LEFT/RIGHT/UP/DOWN so trick sequences
           like UP+GRAB are reachable with a thumb */
        this._padDiscrete(dx, dy);
        e.preventDefault();
      };
      const end = (e) => {
        this._padActive = false; this._pad.x = 0; this._pad.y = 0;
        knob.style.transform = '';
        for (const a of ['Left', 'Right', 'Up', 'Down']) this._up(a);
      };
      stick.addEventListener('pointerdown', (e) => { stick.setPointerCapture(e.pointerId); start(e); });
      stick.addEventListener('pointermove', move);
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
    }

    root.querySelectorAll('[data-act]').forEach((btn) => {
      const a = btn.dataset.act;
      btn.addEventListener('pointerdown', (e) => {
        btn.setPointerCapture(e.pointerId); btn.classList.add('on'); this._down(a); e.preventDefault();
      });
      const off = (e) => { btn.classList.remove('on'); this._up(a); };
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
    });
  }

  _padDiscrete(dx, dy) {
    const T = 0.55;
    const want = { Left: dx < -T, Right: dx > T, Up: dy < -T, Down: dy > T };
    for (const a in want) { if (want[a]) this._down(a); else this._up(a); }
  }

  /* character_input.gd::_process */
  update(dt) {
    this._updateBuffer();
    if (this._jumpTimer > 0) this._jumpTimer -= dt;
    this.buffer.tick(dt);
    this._handler();
    if (this.buffer.changed) {
      this.buffer.changed = false;
      if (this.onBufferChange) this.onBufferChange(this.buffer.buffer);
    }
    /* one-shot flags live for exactly one update */
    this.pressed = Object.create(null);
    this.released = Object.create(null);
  }

  _handler() {
    const stickX = this._padActive ? -this._pad.x : 0;
    const stickY = this._padActive ? -this._pad.y : 0;
    this.input.x = (this.held.Left ? 1 : 0) - (this.held.Right ? 1 : 0) || stickX;
    this.input.y = (this.held.Up ? 1 : 0) - (this.held.Down ? 1 : 0) || stickY;
    this.input.z = this.held.Jump ? 1 : 0;
  }

  _updateBuffer() {
    /* A running count of forward presses. The pipe lock uses it to tell a
       deliberate "take me over the lip" from the push you were already holding
       to get up the ramp — see Pipesnap._leaveCheck. */
    if (this.pressed.Up) this.upPresses++;
    if (this.released.Jump) this.buffer.push(Action.JUMP);   // on release, as in the original
    if (this.pressed.Grind) this.buffer.push(Action.GRIND);
    if (this.pressed.Grab) this.buffer.push(Action.GRAB);
    if (this.pressed.Flip) this.buffer.push(Action.FLIP);
    if (this.pressed.Up) this.buffer.push(Action.UP);
    if (this.pressed.Down) this.buffer.push(Action.DOWN);
    if (this.pressed.Left) this.buffer.push(Action.LEFT);
    if (this.pressed.Right) this.buffer.push(Action.RIGHT);
    if (this.pressed.Revert) this.buffer.push(Action.REVERT);
  }

  reset() {
    this.input.x = this.input.y = this.input.z = 0;
    this.buffer.clear();
  }

  canJump() { return this._jumpTimer < 0.01; }
  forwardAsks() { return this.upPresses; }
  setJumpCooldown() { this._jumpTimer = JUMP_COOLDOWN; }
  getInput() { return this.input; }
  getInputJump() { return this.buffer.last() === Action.JUMP && this.canJump(); }
  getInputGrind() { return this.buffer.last() === Action.GRIND; }
  /* which way you were leaning before the pop — kicks you off a rail sideways */
  dirBeforeJump() {
    const s = this.buffer.secondLast();
    if (s === Action.LEFT) return 1;
    if (s === Action.RIGHT) return -1;
    return 0;
  }
  isHeld(a) { return !!this.held[a]; }
}
