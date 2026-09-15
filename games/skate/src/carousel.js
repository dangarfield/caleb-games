/* carousel.js — the park picker, as a ring you spin.
 *
 * Twenty parks in a grid is a wall of small type that says nothing about any
 * of them. The same twenty on a ring, with a picture of the place on each
 * card, says what a park is before you have read its name: you can tell the
 * bullring from the mall at a glance, which is the whole job.
 *
 * The ring is real 3D — the cards sit on a circle, tangent to it, tipped back
 * a few degrees, so the ones either side turn away from you and the ones
 * behind are actually behind. No fake scaling. The browser does the maths and
 * it costs one transform on the parent plus one opacity per card.
 *
 * It is driven by a single float, `pos`, measured in cards rather than
 * degrees. Dragging moves it, letting go springs it to the nearest whole
 * number, and everything else — which card is selected, how faded its
 * neighbours are — is read off it. That is what makes the drag feel attached
 * to your finger instead of stepping between slots.
 */

/* Negative leans the BACK of the ring up, so you look down into it a little
   and the cards behind show above the ones in front. Positive did the
   opposite: it lifted the front card and dropped the rest out of frame,
   which read as a flat filmstrip with a hole under it. */
const TILT = -12;          // degrees the ring leans back
const DRAG_PER_CARD = 150; // pixels of drag that move it on by one
/* Settling used to be a spring, which by definition overshoots and rings —
   it read as a twang on every single card change. This is a plain
   exponential ease instead: it only ever approaches the target, never passes
   it, so there is nothing to bounce. EASE is the fraction of the remaining
   distance covered in one 60fps frame. */
const EASE = 0.2;
const FLICK = 3.2;         // cards of travel per card-per-frame of throw
const FLICK_MAX = 4;       // cards a single throw may carry you
const VISIBLE = 3;         // cards either side that are drawn at all
/* The card in front is the one you are choosing, so it is the one you should
   be able to see. The others only have to say "there is more round here",
   which they do at a third of the size. */
const FRONT_SCALE = 3;

export class Carousel {
  /**
   * @param {HTMLElement} host emptied and filled with the ring
   * @param {object} [opts] onPick(item) when the front card is chosen,
   *                        onChange(item) whenever the front card changes
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.onPick = opts.onPick || (() => {});
    this.onChange = opts.onChange || (() => {});
    this.items = [];
    this.cards = [];
    this.pos = 0;
    this.target = 0;
    this.vel = 0;
    this.raf = 0;
    this.drag = null;
    this.last = -1;

    host.classList.add('carousel');
    host.innerHTML =
      '<div class="ringWrap"><div class="ring"></div></div>' +
      '<div class="ringLabel"><b><span class="nm"></span>' +
        '<span class="pr"></span></b><span class="gm"></span></div>' +
      '<div class="ringDots"></div>';
    this.wrap = host.querySelector('.ringWrap');
    this.ring = host.querySelector('.ring');
    this.label = host.querySelector('.ringLabel');
    this.dots = host.querySelector('.ringDots');

    /* The ring is usually built while its panel is hidden, where every card
       measures zero and the radius cannot be worked out. Watch the wrapper
       instead of guessing: it reports a real width the instant the panel is
       shown, and again on every resize. */
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.relayout());
      this.ro.observe(this.wrap);
    }

    this._bind();
  }

  /**
   * @param {Array} items [{ id, name, group, sub, img, icon }]
   * @param {number} [at] which one starts at the front
   */
  setItems(items, at = 0) {
    /* Switching skater re-renders with the same parks and different scores.
       Rebuilding would throw the ring back to the start mid-browse, so when
       the parks themselves have not changed, just swap the data underneath
       and leave the ring where the player left it. */
    const same = this.items.length === items.length &&
      this.items.every((x, i) => x.id === items[i].id);
    if (same) {
      this.items = items;
      this.last = -1;          // force the label to redraw with the new score
      this._draw();
      return;
    }
    this.items = items;
    this.ring.innerHTML = '';
    this.dots.innerHTML = '';
    this.cards = items.map((it, i) => {
      const b = document.createElement('button');
      b.className = 'ringCard';
      b.style.setProperty('--i', i);
      /* Just the picture. A caption on the card would be either unreadable on
         the small ones or enormous on the hero, and the label under the ring
         already names whatever is in front. */
      b.title = it.name;
      b.innerHTML =
        `<div class="shot">${it.img
          ? `<img src="${it.img}" alt="${it.name}" loading="lazy" draggable="false">`
          : ''}<div class="fallback">${it.icon || ''}</div></div>`;
      const img = b.querySelector('img');
      /* a park with no picture yet still gets a card, with its icon on it */
      if (img) img.addEventListener('error', () => { img.remove(); });
      this.ring.appendChild(b);

      const dot = document.createElement('i');
      this.dots.appendChild(dot);
      return b;
    });
    /* how far out the ring has to be for the cards not to intersect: the more
       cards, the wider the circle, which is what keeps the gap between them
       looking the same whether there are six parks or twenty-six */
    this.n = Math.max(3, items.length);
    this.host.style.setProperty('--step', (360 / this.n) + 'deg');
    this.cw = 0;
    this._sizeRing();
    this.pos = this.target = at;
    this.vel = 0;
    this.last = -1;
    this._draw();
  }

  /* The card width is set in CSS and changes with the viewport, so ask the
     page rather than hard-coding it — get that wrong and the cards overlap on
     a phone. A ring built while its panel is hidden measures zero, so this is
     cheap to call again and does nothing once the width has settled. */
  _sizeRing() {
    const cw = (this.cards[0] && this.cards[0].offsetWidth) || 0;
    /* zero means the panel is still hidden — the observer will call back the
       moment it is laid out for real */
    if (!cw || cw === this.cw) return;
    this.cw = cw;
    /* far enough out that the chord between neighbouring cards is wider than a
       card, or the ring reads as one continuous panorama instead of a row of
       separate things */
    /* Neighbouring cards must not collide, and the front one is FRONT_SCALE
       times the width of the rest. Because the scale falls off linearly with
       distance, any two neighbours' half-widths always add up to the same
       thing — (1 + FRONT_SCALE) / 2 cards — so one number covers every
       position of the ring, mid-drag included. Everything is a share of the
       card width rather than fixed pixels, or the ring is a comfortable size
       on a laptop and wider than the screen on a phone. */
    const span = cw * (1 + FRONT_SCALE) / 2 * 1.06;
    this.radius = Math.round(span / Math.sin(2 * Math.PI / this.n));
    /* Tipping the ring about its own centre swings the front card downwards by
       radius*sin(tilt). Undo exactly that, so the front card stays where the
       layout put it and the tilt only shows as the sides arcing up. */
    this.lift = Math.round(this.radius * Math.sin(TILT * Math.PI / 180));
    this.host.style.setProperty('--radius', this.radius + 'px');
  }

  /** call when the ring becomes visible or the window resizes */
  relayout() { this._sizeRing(); this._draw(); }

  /** the item at the front */
  index() {
    const n = this.items.length || 1;
    return ((Math.round(this.pos) % n) + n) % n;
  }

  /** the shortest way round from the front to card i, in cards */
  _delta(i) {
    const n = this.items.length || 1;
    let d = i - this.pos;
    while (d > n / 2) d -= n;
    while (d < -n / 2) d += n;
    return d;
  }

  goTo(target, snap = false) {
    this.target = target;
    if (snap) { this.pos = target; this.vel = 0; }
    this._run();
  }

  /** put park `id` at the front, by the shortest way round */
  showId(id, snap = false) {
    const i = this.items.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.goTo(Math.round(this.pos) + this._delta(i), snap);
  }

  _bind() {
    const wrap = this.wrap;
    wrap.addEventListener('pointerdown', (e) => {
      wrap.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, from: this.pos, t: performance.now(), lastX: e.clientX };
      this.moved = false;
      this.vel = 0;
      this.host.classList.add('dragging');
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      if (Math.abs(dx) > 4) this.moved = true;
      this.pos = this.drag.from - dx / DRAG_PER_CARD;
      const now = performance.now();
      const dt = Math.max(1, now - this.drag.t);
      this.vel = -(e.clientX - this.drag.lastX) / DRAG_PER_CARD / dt * 16;
      this.drag.t = now; this.drag.lastX = e.clientX;
      this._draw();
    });
    const end = () => {
      if (!this.drag) return;
      this.drag = null;
      this.host.classList.remove('dragging');
      const throw_ = Math.max(-FLICK_MAX, Math.min(FLICK_MAX, this.vel * FLICK));
      this.target = Math.round(this.pos + throw_);
      this._run();
      /* a click fires after pointerup, so the flag has to outlive this frame */
      setTimeout(() => { this.moved = false; }, 0);
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);

    /* One click handler for the whole ring, and it decides by WHERE the click
       landed rather than by which element caught it: the cards are stacked in
       3D and a click can land on a card's image, its box, or the empty space
       between, and all three should mean the same thing.
         - inside the big front card: that is the park you want
         - anywhere left or right of it: step one park that way
       One step per click, whatever is under the pointer, because the cards out
       at the sides are a third of the size and much too small to aim at. */
    wrap.addEventListener('click', (e) => {
      if (this.moved) return;                   // that was a drag, not a click
      const front = this.cards[this.index()];
      const box = front && front.classList.contains('front')
        ? front.getBoundingClientRect() : null;
      if (box && e.clientX >= box.left && e.clientX <= box.right &&
                 e.clientY >= box.top && e.clientY <= box.bottom) {
        this.onPick(this.items[this.index()]);
        return;
      }
      const r = wrap.getBoundingClientRect();
      this.nudge(e.clientX < r.left + r.width / 2 ? -1 : 1);
    });

    wrap.addEventListener('wheel', (e) => {
      /* trackpads send a lot of small deltas; one notch is one park */
      if (Math.abs(e.deltaX) < 2 && Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.goTo(Math.round(this.pos) + Math.sign(d));
    }, { passive: false });
  }

  /** arrow keys, wired up by whoever owns the screen this is on */
  nudge(dir) { this.goTo(Math.round(this.pos) + dir); }

  _run() {
    if (this.raf) return;
    let prev = performance.now();
    const tick = (now) => {
      this.raf = 0;
      if (!this.drag) {
        /* framerate-independent decay: the same curve on a 60Hz laptop and a
           120Hz phone, rather than twice as fast on the phone */
        const frames = Math.min(4, (now - prev) / (1000 / 60));
        const k = 1 - Math.pow(1 - EASE, frames);
        const gap = this.target - this.pos;
        this.pos += gap * k;
        if (Math.abs(gap) < 0.002) {
          this.pos = this.target; this.vel = 0;
          this._draw();
          return;
        }
      }
      prev = now;
      this._draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  _draw() {
    if (!this.cw) this._sizeRing();
    const step = 360 / (this.items.length || 1);
    this.ring.style.transform =
      `translateY(${this.lift || 0}px) translateZ(calc(var(--radius) * -1)) ` +
      `rotateX(${TILT}deg) rotateY(${-this.pos * step}deg)`;
    for (let i = 0; i < this.cards.length; i++) {
      const d = this._delta(i);
      const a = Math.abs(d);
      const c = this.cards[i];
      if (a > VISIBLE) {
        /* Hiding used to skip straight past the rest of this loop, which left
           whatever the card was last time frozen on it — including `front`.
           Spin twice round and several cards claim to be the front one. */
        c.style.visibility = 'hidden';
        c.classList.remove('front');
        continue;
      }
      c.style.visibility = '';
      /* fading with distance is what makes the ones behind read as behind
         rather than as a mess of cards at the edge of the frame */
      /* the hero shrinks to the ordinary size over one card's travel, so the
         growing and the turning happen together as you drag */
      const scale = 1 + (FRONT_SCALE - 1) * Math.max(0, 1 - a);
      c.style.setProperty('--s', scale.toFixed(3));
      c.style.opacity = String(Math.max(0, 1 - a * 0.30));
      c.style.zIndex = String(100 - Math.round(a * 10));
      c.classList.toggle('front', a < 0.5);
    }
    const i = this.index();
    if (i !== this.last) {
      this.last = i;
      const it = this.items[i];
      if (it) {
        this.label.querySelector('.nm').textContent = it.name;
        this.label.querySelector('.gm').textContent = it.group || '';
        /* How far THIS skater has got in THIS park, at the size of the name
           and in its own colour, because it is the thing they came to look
           at. Ezra and Caleb have separate save slots, so the same park shows
           different numbers depending on who is picked. */
        const pr = this.label.querySelector('.pr');
        const has = typeof it.total === 'number' && it.total > 0;
        pr.textContent = has ? `${it.done || 0}/${it.total}` : '';
        pr.classList.toggle('all', has && (it.done || 0) >= it.total);
        for (let k = 0; k < this.dots.children.length; k++) {
          const dot = this.dots.children[k];
          dot.classList.toggle('on', k === i);
          /* the position dot takes the score's colour, so a finished park
             reads the same way in both places */
          dot.classList.toggle('all', k === i && pr.classList.contains('all'));
        }
        this.onChange(it);
      }
    }
  }

  dispose() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.ro) { this.ro.disconnect(); this.ro = null; }
  }
}
