// Waypoints — play mode on the sheet.
//
// No 3D at all. This is the game played the way it is played on paper: roll,
// drag a route, watch what it costs, commit, watch the card fill in. It exists
// so the rules can be checked against the printed game before anything is hung
// off them — if a turn here disagrees with a turn on the table, the rules are
// wrong and no amount of landscape will hide it.
//
// It hangs off the mapper's Editor2D rather than reimplementing the sheet: the
// board, the card, the map and the icons are already drawn correctly there, so
// this adds only what play adds — where you are, where you have been, the route
// you are dragging and what it is about to earn you.

import { indexMap, TOUCH, toShore, keepDry, inWater, meetsRiver } from './rules.js';
import { smoothPath } from './geometry.js';
import {
  newGame, chooseGoal, chooseStart, rollWeather, previewMove, commitMove, rest,
  glide, glideTargets, photograph, photoTargets,
  mustRest, markTrack, budgetFor, hikeOver, endHike, journalOptions, chooseJournal,
  advanceHike, score, hasAction, wearCoat, syncWater,
} from './state.js';
import { resolvePts } from '../mapper/state.js';
import { hitCard } from '../mapper/card.js';

// Yellow is the colour of this turn: the route you are drawing, the waypoint you
// are standing on, the things the route is about to earn you. Blue is where you
// have already been, red is a route that is not allowed.
// Everywhere he has walked is gold, the same gold as the line he is drawing now:
// a hike is one continuous thing, and drawing the past in a different colour
// made the map look like two games played on top of each other.
const INK = { route: '#e0a92b', draft: '#f2c230', bad: '#c0392b', live: '#f2c230',
  done: '#e0a92b', flash: '#fff0b8', quiet: '#7b8a99' };

/**
 * The pulse, on or off right now.
 *
 * Exported because the page has to know WHEN it flips: redrawing the sheet on a
 * timer that does not line up with the pulse is either a stutter or wasted work,
 * and the only way it cannot drift is if both read the same clock.
 */
export const PULSE = { period: 900, on: 500 };
export const pulsing = () => (Date.now() % PULSE.period) < PULSE.on;

export class Play2D {
  /** @param ed the Editor2D to take over @param doc the map document */
  constructor(ed, doc, onChange) {
    this.ed = ed; this.doc = doc; this.onChange = onChange || (() => {});
    this.reset();
  }

  reset(opts = {}) {
    const map = this.doc.map;
    this.ix = indexMap(map, resolvePts);
    this.g = newGame(this.ix, opts);
    this.board = map.board;
    this.routes = [];            // every committed route, for drawing the walk so far
    this.draft = null;           // the route being dragged
    this.preview = null;         // what the draft would earn
    this.pending = null;         // a woodland waiting for its track to be chosen
    this.startPick = null;       // the campsite the die offered, awaiting a tap
    this.ed.play = this;
    this.paint(); this.onChange();
  }

  stop() { this.ed.play = null; this.ed.draw(); }   // a real draw: the game is over

  get me() { return this.g.players[0]; }
  get at() { return this.me.at ? this.ix.byId.get(this.me.at) : null; }

  /**
   * How this turn's route is being travelled.
   *
   * The kayak is taken out BEFORE the route is drawn and changes what the route
   * costs, so every sum about the drafted line has to be told about it — which
   * is why it lives in one place rather than being remembered at each call.
   */
  get how() { return { kayak: !!this.kayak }; }

  // ---------------------------------------------------------------- the turn
  roll(d = 1 + Math.floor(Math.random() * 6)) {
    if (this.g.phase === 'start') {
      // The die says WHICH campsite, but the player still has to be shown it and
      // put their finger on it. Rolling a number and being teleported somewhere
      // is not a start to a hike.
      const camp = this.ix.waypoints.find((w) => w.type === 'campsite' && w.number === d);
      this.startPick = camp ? { n: d, wp: camp } : null;
      this.last = d;
    } else if (this.g.phase === 'roll') { rollWeather(this.g, this.board, d); this.last = d; }
    this.after();
    return d;
  }

  /** Take the offered campsite and set off. */
  confirmStart() {
    if (!this.startPick) return;
    chooseStart(this.g, this.ix, this.startPick.n);
    this.startPick = null;
    this.after();
  }

  /** The campsites, for the start-point screen. */
  campsites() {
    return this.ix.waypoints.filter((w) => w.type === 'campsite')
      .sort((a, b) => (a.number || 0) - (b.number || 0));
  }

  setGoal(goal) { chooseGoal(this.g, goal); this.after(); }

  /** Throw the drawn route away and start the turn over. */
  restart() { this.draft = null; this.preview = null; this.dragging = false; this.after(); }

  /**
   * Drink a bottle for one more point of movement.
   *
   * Water is the game's one stretchy resource — you fill bottles by resting and
   * at lakes, and spend them on days the weather was mean. Spent up front rather
   * than at the moment of committing, so the meter he is drawing against is the
   * number he actually has.
   */
  spendWater(n = 1) {
    if (this.g.phase !== 'move' || this.me.water < n) return false;
    this.drink = (this.drink || 0) + n;
    this.me.water -= n;
    // A bottle you have drunk is CROSSED on the card, not rubbed out. Taking it
    // off `water` without adding it to `waterUsed` made the bottle disappear
    // instead — so the card said he had never had it.
    this.me.waterUsed = (this.me.waterUsed || 0) + n;
    // ...and the CARD is what the child looks at. It keeps its own copy of the
    // two numbers, and a bottle that moves from carried to drunk has to move on
    // the card too, or the sheet quietly says he still has it.
    syncWater(this.me);
    this.g.budget += n;
    if (this.draft && this.draft.to) {
      this.preview = previewMove(this.g, this.ix, this.me, this.draft.line || this.draft.pts,
        this.draft.to, this.how);
    }
    this.after();
    return true;
  }

  /**
   * Take back the last line drawn.
   *
   * A whole route thrown away because the last drag went wide is the sort of
   * thing that makes a child stop playing. If the route had reached a waypoint,
   * the first undo lets go of the waypoint and leaves the corners; after that
   * each one drops a corner, and the last one is just a restart.
   */
  undo() {
    if (!this.draft) return false;
    if (this.draft.to) {
      this.draft.to = null; this.preview = null;
      this.draft.pts = this.draft.pts.slice(0, this.draft.fixed || 1);
      this.draft.line = keepDry(this.ix, smoothPath(this.draft.pts));
      this.after(); return true;
    }
    const pts = this.draft.pts.slice(0, Math.max(0, (this.draft.fixed || 1) - 1));
    if (pts.length < 2) { this.restart(); return true; }
    this.draft.pts = pts;
    this.draft.fixed = pts.length;
    this.draft.line = keepDry(this.ix, smoothPath(pts));
    this.preview = null;
    this.after(); return true;
  }

  takeRest() {
    if (this.g.phase !== 'move') return;
    rest(this.g, this.ix, this.me);
    this.endTurn();
  }

  /** A woodland marks Bear, Bird or Rabbit — the player picks which. */
  chooseWood(track) {
    if (!this.pending) return;
    const got = markTrack(this.ix, this.me, track);
    for (const kind of (got && got.actions) || []) this.me.actions.push({ kind, used: false });
    this.pending.left--;
    if (this.pending.left <= 0) { this.pending = null; this.endTurn(); }
    this.after();
  }

  pickJournal(which) {
    if (this.g.phase !== 'journal') return;
    chooseJournal(this.g, this.ix, this.me, which);
    advanceHike(this.g, this.ix, this.board);
    this.after();
  }

  /** Close the turn: either the hike is over, or the die comes round again. */
  endTurn() {
    this.drink = 0;
    this.kayak = false;                           // the boat does not come with you
    this.draft = null; this.preview = null;
    if (this.pending) return;                     // still owed a woodland choice
    if (hikeOver(this.g, this.board)) endHike(this.g, this.ix);
    else this.g.phase = 'roll';
    this.after();
  }

  /**
   * Redraw the sheet.
   *
   * The page may take this over. In the game every pointer move ends in a
   * repaint that draws the sheet once per animation frame, so drawing it here
   * as well painted the whole printed map twice for every finger movement —
   * the single most expensive thing a tablet was being asked to do.
   */
  paint() { if (!this.deferDraw) this.ed.draw(); }

  after() { this.paint(); this.onChange(); }

  /**
   * The play state the printed sheet draws from.
   *
   * Shaped exactly like `map.play` so `drawBoard` and `drawCard` need to know
   * nothing about the game — and kept OUT of the map document, because the
   * mapper autosaves that and a game in progress is not an edit to the map.
   */
  sheet() {
    const p = this.me;
    // keep the goal box on the card agreeing with what the goal has actually
    // scored, so the printed total and the panel's total are one number
    score(this.g, this.ix, p);
    return { hike: this.g.ring.hike, pos: this.g.ring.pos, done: this.g.ring.done,
      goal: this.g.goal, water: p.water, waterUsed: p.waterUsed || 0, card: p.card,
      // Where you are on the weather track pulses while you are deciding the
      // weather, so a child looking for "where am I on this border" has
      // something moving to find.
      flash: this.g.phase === 'roll' && pulsing() };
  }

  // ---------------------------------------------------------------- pointer
  /**
   * Snap a dragged point.
   *
   * Waypoints pull hardest, because they are what a route is FOR. Bridges pull
   * next, because crossing the river anywhere else is illegal and hunting for
   * the exact pixel of a bridge is not a skill the game is about.
   */
  snap(p) {
    let best = null;
    for (const w of this.ix.waypoints) {
      const d = Math.hypot(w.x - p[0], w.y - p[1]);
      if (d < 0.1 && (!best || d < best.d)) best = { d, at: [w.x, w.y], wp: w };
    }
    if (best) return best;
    for (const b of this.ix.bridges) {
      const d = Math.hypot(b.x - p[0], b.y - p[1]);
      if (d < 0.09 && (!best || d < best.d)) best = { d, at: [b.x, b.y], bridge: b };
    }
    if (best) return best;
    // Last: the water. You cannot walk on a lake, so dragging over one does not
    // draw a line you are then told off for — it goes to the shore, which is
    // near enough to count as having visited it.
    const w = inWater(this.ix, p, 0);
    if (w) return { d: w.depth, at: toShore(this.ix, p), lake: w.lake };
    return null;
  }

  /** The corner a new drag has to start from: the tip of what is drawn so far. */
  tip() {
    if (!this.draft) return null;
    return this.draft.pts[Math.max(0, (this.draft.fixed || 1) - 1)];
  }

  /**
   * What is in the pack, and what could actually be used right now.
   *
   * A kayak is only a kayak where there is water; a glider is only a glider on
   * top of a mountain. Offering either anywhere else is offering a child a
   * choice that does nothing, which he will make once and never trust again.
   */
  kit() {
    const p = this.me;
    const held = (kind) => p.actions.filter((a) => !a.used && a.kind === kind).length;
    // A backpack is a wildcard: `useAction` spends one in place of whatever you
    // are short of, so a player holding a backpack HOLDS a kayak as far as the
    // pack is concerned, and the menu has to agree with the rule or he will be
    // offered a boat he cannot take.
    const packs = held('backpack');
    const line = this.draft && (this.draft.line || this.draft.pts);
    // "next to the water" — either the line you have drawn reaches the river, or
    // you are standing on its bank.
    const at = this.at;
    const byWater = !!(line && line.length > 1 && meetsRiver(this.ix, line))
      || !!(at && meetsRiver(this.ix, [[at.x, at.y], [at.x, at.y]]));
    const onMountain = !!(at && at.type === 'mountain');
    const item = (kind, can, why) =>
      ({ own: held(kind), have: held(kind) + packs, can: !!can, why });
    return {
      backpacks: packs,
      water: p.water,
      // everything unused in the pack, which is the number on "Open backpack"
      count: p.actions.filter((a) => !a.used).length,
      out: { kayak: !!this.kayak, coat: !!p.coated },
      kayak: item('kayak', byWater, 'you have to be beside the river'),
      glider: item('glider', onMountain && glideTargets(this.g, this.ix, p).length > 0,
        onMountain ? 'nowhere close enough to land' : 'you have to be on a mountain'),
      coat: item('coat', this.g.budget <= 2, 'save it for a day the weather is mean'),
      // The camera reaches the square you are in and the four touching it, and
      // only places you have not been. If there is nothing in range it is not
      // offered, because a camera you cannot point at anything is a button that
      // does nothing.
      camera: item('camera', photoTargets(this.g, this.ix, this.me).length > 0,
        'nothing near enough to photograph'),
    };
  }

  /**
   * Take the kayak out.
   *
   * It is not spent here. Getting the boat out only changes what the route you
   * are about to draw is allowed to do — the rules take the kayak off you when
   * the move is committed, so a child who gets it out, looks at the river and
   * changes his mind has not lost anything.
   */
  useKayak() {
    const k = this.kit().kayak;
    if (this.g.phase !== 'move') return { ok: false, why: 'not right now' };
    if (!k.have) return { ok: false, why: 'no kayak' };
    if (!k.can) return { ok: false, why: k.why };
    this.kayak = true;
    if (this.draft && this.draft.to) {
      this.preview = previewMove(this.g, this.ix, this.me,
        this.draft.line || this.draft.pts, this.draft.to, this.how);
    }
    this.after();
    return { ok: true };
  }

  /** Put it away again, and re-cost the route without it. */
  stowKayak() {
    this.kayak = false;
    if (this.draft && this.draft.to) {
      this.preview = previewMove(this.g, this.ix, this.me,
        this.draft.line || this.draft.pts, this.draft.to, this.how);
    }
    this.after();
    return { ok: true };
  }

  /** Put the coat on: three more points of movement, this turn only. */
  useCoat() {
    const r = wearCoat(this.g, this.me);
    this.after();
    return r;
  }

  /** Where a glider could take you from here. */
  glideTargets() { return glideTargets(this.g, this.ix, this.me); }

  /**
   * Take the glider out and put the landing grounds on the MAP.
   *
   * Where you can land is a question about places, and places are on the paper.
   * Listing them as three lines of text on the phone asked him to match names to
   * a map he was already looking at — so the map lights them up instead, and he
   * draws the flight the same way he draws a walk.
   */
  startGlide() { return this._aim('glide', glideTargets(this.g, this.ix, this.me)); }

  /**
   * Take a photograph: the same gesture, a different rule.
   *
   * The printed rules give the camera its own reach — "the same grid square or
   * an orthogonally adjacent grid square", corners excluded, where the glider
   * takes the corners too — and its own consequence: the place goes on your
   * card as if you had been there, and you can never go there again.
   */
  startPhoto() { return this._aim('photo', photoTargets(this.g, this.ix, this.me)); }

  _aim(kind, targets) {
    this.aimKind = kind;
    this.glideAim = targets.map((w) => w.id);
    this.glidePick = null; this.glidePtr = null;
    this.draft = null; this.preview = null;
    this.after();
    return this.glideAim.length;
  }

  stopGlide() {
    this.glideAim = null; this.glidePick = null; this.glidePtr = null; this.aimKind = null;
    this.after();
  }

  /** The landing ground nearest a point, if it is near enough to mean it. */
  aimAt(p) {
    let best = null;
    for (const id of this.glideAim || []) {
      const w = this.ix.byId.get(id);
      if (!w) continue;
      const d = Math.hypot(w.x - p[0], w.y - p[1]);
      if (d < 0.22 && (!best || d < best.d)) best = { d, w };
    }
    return best ? best.w : null;
  }

  /** Take the glide, or the photograph — whichever the lit rings are for. */
  glideTo(id) {
    const r = this.aimKind === 'photo'
      ? photograph(this.g, this.ix, this.me, id)
      : glide(this.g, this.ix, this.me, id);
    if (r.ok) {
      this.glideAim = null; this.glidePick = null; this.glidePtr = null; this.aimKind = null;
    }
    this.after();
    return r;
  }

  /** Where a photograph could reach from here. */
  photoTargets() { return photoTargets(this.g, this.ix, this.me); }

  /**
   * Set this turn's movement by hand.
   *
   * The other half of the debug door. The weather track hands out ones and twos
   * as often as sixes, and testing what a long turn does should not mean sitting
   * through six short ones first.
   */
  setBudget(n) {
    if (this.g.phase !== 'move') return false;
    this.g.budget = Math.max(0, n | 0);
    this.after();
    return true;
  }

  /**
   * Shift-click a space on the card to set it by hand.
   *
   * A debugging door, and an honest one: it writes straight to the card and says
   * nothing to the rules, which is what makes it a debug tool rather than a
   * feature. What it cycles through depends on what the space IS, because the
   * three tracks mean different things by a mark:
   *
   *   tools and water   empty -> have it -> used it
   *   animals and trig  empty -> found it            (there is nothing to spend)
   *   mountains         empty -> 1 -> 2 -> 3 -> ...  (a height is written, not circled)
   */
  poke(p) {
    const r = hitCard(this.doc.map, p[0], p[1]);
    if (!r) return false;

    if (r.kind === 'water') {
      // The bottles are two counts rather than a set of marks. Clicking the
      // fourth one asks for "the fourth bottle in its next state", and the
      // totals either side of it follow.
      const drunk = this.me.waterUsed || 0;
      const got = this.me.water + drunk;
      let nGot = got, nDrunk = drunk;
      if (r.n >= got) { nGot = r.n + 1; }                    // empty -> have it
      else if (r.n >= drunk) { nDrunk = r.n + 1; nGot = Math.max(nGot, nDrunk); }
      else { nGot = r.n; nDrunk = Math.min(drunk, r.n); }    // used -> empty again
      this.me.waterUsed = nDrunk;
      this.me.water = Math.max(0, nGot - nDrunk);
      syncWater(this.me);

    } else if (r.kind === 'box' && r.key) {
      // A mountain box holds a height, not a circle. Step it rather than
      // toggling it, so a box can be set to something plausible.
      const was = +this.me.card.boxes[r.key] || 0;
      const next = was >= 4 ? 0 : was + 1;
      if (next) this.me.card.boxes[r.key] = next;
      else delete this.me.card.boxes[r.key];

    } else if (r.key) {
      const two = this.twoState(r);
      const was = this.me.card.marks[r.key] || 0;
      // Two-state tracks skip "circled": an animal you have seen is a thing you
      // found, not a thing you are carrying about with you.
      const next = two ? (was ? 0 : 2) : (was + 1) % 3;
      if (next) this.me.card.marks[r.key] = next;
      else delete this.me.card.marks[r.key];

    } else return false;

    this.after();
    return true;
  }

  /**
   * Does this space mean "found", rather than "have and may spend"?
   *
   * By the SPACE, not by the track. The kayak, the coat and the glider are
   * printed on the bear, rabbit and bird tracks — a kayak space is `bear:1` —
   * so a rule that went by track name made every tool two-state and skipped
   * straight past "you have it" to "you have used it".
   */
  twoState(r) {
    if (r.sp && r.sp.act) return false;            // anything you can spend
    const track = String(r.key || '').split(':')[0];
    return ['bear', 'bird', 'rabbit', 'trig'].includes(track);
  }

  down(p, ev) {
    if (ev && ev.shiftKey && this.poke(p)) return false;
    // A flight is drawn, not chosen from a list: drag from where you are to a
    // lit landing ground and let go.
    if (this.glideAim) {
      this.dragging = 'glide';
      this.glidePtr = p; this.glidePick = this.aimAt(p);
      this.after();
      return true;
    }
    if (this.g.phase === 'start') {
      if (!this.startPick) return false;
      const w = this.startPick.wp;
      if (Math.hypot(w.x - p[0], w.y - p[1]) <= 0.16) { this.confirmStart(); return true; }
      return false;
    }
    if (this.g.phase !== 'move' || this.pending) return false;
    const from = this.at;
    if (!from) return false;

    // A route is as many lines as you want to draw. A second drag carries on
    // from the corner you let go at rather than starting over, which is what it
    // used to do — silently throwing away everything drawn so far.
    if (this.draft) {
      if (this.draft.to) return false;          // already at a waypoint; Start again to redraw
      const tip = this.tip();
      if (Math.hypot(tip[0] - p[0], tip[1] - p[1]) > 0.18) return false;
      this.draft.pts = this.draft.pts.slice(0, this.draft.fixed || 1);
      this.preview = null;
      this.dragging = true;
      return true;
    }

    // and the first one starts on the waypoint you are standing on
    if (Math.hypot(from.x - p[0], from.y - p[1]) > 0.18) return false;
    this.draft = { pts: [[from.x, from.y]], to: null, fixed: 1 };
    this.dragging = true;
    return true;
  }

  move(p) {
    if (this.dragging === 'glide') {
      this.glidePtr = p; this.glidePick = this.aimAt(p);
      this.paint(); this.onChange();
      return true;
    }
    if (!this.dragging || !this.draft) return false;
    const s = this.snap(p);
    const at = s ? s.at : p;
    const pts = this.draft.pts.slice(0, this.draft.fixed || 1).concat([at]);
    this.draft.pts = pts;
    // The corners are what the player placed; the LINE is the rounded walk
    // between them, and the line is what is drawn and what is charged for.
    // Smoothing rounds corners, and a rounded corner beside a lake would bow
    // INTO it. The curve is pushed back to the shore rather than allowed to
    // swim: the drawn line is the walked line, so it has to be walkable.
    this.draft.line = keepDry(this.ix, smoothPath(pts));
    this.draft.to = s && s.wp && s.wp.id !== this.me.at ? s.wp.id : null;
    this.preview = this.draft.to
      ? previewMove(this.g, this.ix, this.me, this.draft.line, this.draft.to, this.how)
      : null;
    this.paint(); this.onChange();
    return true;
  }

  up() {
    if (this.dragging === 'glide') {
      this.dragging = false;
      const w = this.glidePick;
      this.glidePtr = null; this.glidePick = null;
      // Let go short of anywhere and nothing happens: the glider is still out
      // and the landing grounds are still lit, so he can have another go.
      if (w) this.glideTo(w.id); else this.after();
      return true;
    }
    if (!this.dragging) return false;
    this.dragging = false;
    // Releasing on open ground drops a corner and keeps drawing, so a route can
    // go round a hill rather than only straight at things.
    if (this.draft && !this.draft.to) {
      this.draft.fixed = this.draft.pts.length;
      this.paint(); this.onChange();
      return true;
    }
    return true;
  }

  /** Take the drafted route. Called from the panel's Go button. */
  go(water = 0) {
    if (!this.draft || !this.draft.to) return { ok: false, why: 'no route drawn' };
    const line = this.draft.line || this.draft.pts;
    const r = commitMove(this.g, this.ix, this.board, this.me,
      line, this.draft.to, { water, kayak: !!this.kayak });
    if (!r.ok) { this.after(); return r; }
    this.routes.push({ hike: this.g.ring.hike, pts: line.map((q) => [q[0], q[1]]) });
    this.draft = null; this.preview = null;
    // a woodland owes the player a choice of three tracks before the turn closes
    if (r.woodland && r.woodland.length) this.pending = { left: r.woodland.length };
    this.endTurn();
    return r;
  }

  // ---------------------------------------------------------------- drawing
  drawMap(ctx, px) {
    const g = this.g, me = this.me;
    const flash0 = pulsing();

    // The start-point screen: every campsite marked, the rolled one pulsing.
    // Seeing where the other five were is half of understanding the map.
    if (g.phase === 'start') {
      for (const c of this.campsites()) {
        const picked = this.startPick && this.startPick.wp.id === c.id;
        ctx.save();
        ctx.lineWidth = (picked ? 4 : 2) * px;
        ctx.strokeStyle = picked ? INK.live : INK.quiet;
        ctx.globalAlpha = picked ? 1 : 0.4;
        ctx.beginPath(); ctx.arc(c.x, c.y, picked ? 0.1 : 0.075, 0, 7); ctx.stroke();
        if (picked && flash0) {
          ctx.globalAlpha = 0.5; ctx.lineWidth = 9 * px;
          ctx.beginPath(); ctx.arc(c.x, c.y, 0.14, 0, 7); ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }

    // 1. where you have walked, this hike solid and earlier ones faded
    for (const r of this.routes) {
      ctx.save();
      ctx.strokeStyle = INK.route;
      ctx.globalAlpha = r.hike === g.ring.hike ? 0.9 : 0.32;
      ctx.lineWidth = 2.6 * px; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r.pts[0][0], r.pts[0][1]);
      for (const q of r.pts.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.stroke(); ctx.restore();
    }

    // 2. what is spent, and what this turn would take
    const flash = pulsing();
    const ring = (x, y, colour, w) => {
      ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = w * px;
      ctx.beginPath(); ctx.arc(x, y, 0.062, 0, 7); ctx.stroke(); ctx.restore();
    };
    for (const id of me.visited) {
      const w = this.ix.byId.get(id);
      if (w && w.id !== me.at) ring(w.x, w.y, INK.done, 2.4);
    }
    for (const id of me.photographed) {
      const w = this.ix.byId.get(id);
      if (w) { ring(w.x, w.y, INK.done, 1.4); }
    }
    if (this.preview && this.preview.ok && flash) {
      const t = this.ix.byId.get(this.draft.to);
      if (t) ring(t.x, t.y, INK.live, 3.4);
      for (const id of this.preview.lakes) this.outline(ctx, px, this.ix.lakes, id, INK.live);
      for (const id of this.preview.woodland) this.outline(ctx, px, this.ix.woods, id, INK.live);
    }

    // 3. the route being drawn: yellow, dotted, and rounded through every corner
    //    you put down. Dotted the whole way because nothing is walked until you
    //    take it — a solid line is what you have already done.
    const line = this.draft && (this.draft.line || this.draft.pts);
    if (line && line.length > 1) {
      const bad = this.preview ? !this.preview.ok : false;
      ctx.save();
      ctx.strokeStyle = bad ? INK.bad : INK.draft;
      ctx.globalAlpha = this.draft.to ? 1 : 0.75;
      ctx.setLineDash([0.045, 0.032]);
      ctx.lineWidth = 3.4 * px; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(line[0][0], line[0][1]);
      for (const q of line.slice(1)) ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      ctx.setLineDash([]);

      // the corners you put down, so it is obvious where the next line carries
      // on from — and the tip, which is the one you can grab
      const fixed = this.draft.fixed || 1;
      for (let i = 1; i < fixed; i++) {
        ctx.fillStyle = bad ? INK.bad : INK.draft;
        ctx.beginPath(); ctx.arc(this.draft.pts[i][0], this.draft.pts[i][1], 3.2 * px, 0, 7);
        ctx.fill();
      }
      if (!this.draft.to && !this.dragging && fixed > 1) {
        const tip = this.draft.pts[fixed - 1];
        ctx.globalAlpha = flash ? 0.9 : 0.35;
        ctx.strokeStyle = INK.draft; ctx.lineWidth = 2.2 * px;
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 0.03, 0, 7); ctx.stroke();
      }
      ctx.restore();
      // a tick on every line the route is charged for, so the cost is visible
      // on the map rather than only in a number
      if (this.preview) for (const c of this.preview.crossings || []) {
        ctx.save(); ctx.fillStyle = bad ? INK.bad : INK.draft;
        ctx.beginPath(); ctx.arc(c.x, c.y, 2.2 * px, 0, 7); ctx.fill(); ctx.restore();
      }
      if (this.preview && this.preview.blocked) {
        const [bx, by] = this.preview.blocked.at;
        ctx.save(); ctx.strokeStyle = INK.bad; ctx.lineWidth = 3 * px;
        ctx.beginPath(); ctx.moveTo(bx - 0.04, by - 0.04); ctx.lineTo(bx + 0.04, by + 0.04);
        ctx.moveTo(bx + 0.04, by - 0.04); ctx.lineTo(bx - 0.04, by + 0.04);
        ctx.stroke(); ctx.restore();
      }
    }

    // 3b. the flight: every landing ground lit, and a straight dotted line to
    //     the one under his finger. Straight because a glider does not follow
    //     the ground — it goes over everything in between, which is the whole
    //     reason to take one.
    if (this.glideAim && this.glideAim.length) {
      const from = this.at;
      for (const id of this.glideAim) {
        const w = this.ix.byId.get(id);
        if (!w) continue;
        const on = this.glidePick && this.glidePick.id === id;
        // The printed sheet already has a small circle at every waypoint, so a
        // landing ground has to be louder than one of those or it is just
        // another circle: a filled gold disc, and a pulse around it.
        ctx.save();
        ctx.fillStyle = INK.live;
        ctx.globalAlpha = on ? 0.42 : 0.24;
        ctx.beginPath(); ctx.arc(w.x, w.y, on ? 0.115 : 0.095, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = on ? INK.live : INK.done;
        ctx.lineWidth = (on ? 4.4 : 3) * px;
        ctx.beginPath(); ctx.arc(w.x, w.y, on ? 0.115 : 0.095, 0, 7); ctx.stroke();
        if (flash || on) {
          ctx.globalAlpha = on ? 0.8 : 0.45;
          ctx.lineWidth = 2 * px;
          ctx.beginPath(); ctx.arc(w.x, w.y, on ? 0.16 : 0.14, 0, 7); ctx.stroke();
        }
        ctx.restore();
      }
      const aim = this.glidePick ? [this.glidePick.x, this.glidePick.y] : this.glidePtr;
      // A photograph is a sight line, not a walk: thinner, and no arrow-straight
      // flight path — but drawn the same way, because it is the same gesture.
      if (from && aim) {
        ctx.save();
        ctx.strokeStyle = this.glidePick ? INK.draft : INK.quiet;
        ctx.globalAlpha = this.glidePick ? 1 : 0.6;
        ctx.setLineDash(this.aimKind === 'photo' ? [0.02, 0.03] : [0.05, 0.035]);
        ctx.lineWidth = (this.aimKind === 'photo' ? 2.4 : 3.4) * px; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(aim[0], aim[1]);
        ctx.stroke(); ctx.setLineDash([]); ctx.restore();
      }
    }

    // 4. you, pulsing — on a sheet this full, the one thing that has to be
    //    findable at a glance is where you are standing.
    const at = this.at;
    if (at) {
      ctx.save();
      ctx.strokeStyle = INK.live; ctx.lineWidth = 3.4 * px;
      ctx.beginPath(); ctx.arc(at.x, at.y, 0.07, 0, 7); ctx.stroke();
      ctx.globalAlpha = flash ? 0.85 : 0.2;
      ctx.strokeStyle = INK.flash; ctx.lineWidth = 8 * px;
      ctx.beginPath(); ctx.arc(at.x, at.y, flash ? 0.105 : 0.085, 0, 7); ctx.stroke();
      ctx.restore();
    }
    if (flash !== this._flash) { this._flash = flash; }
  }

  outline(ctx, px, set, id, colour) {
    const f = set.find((x) => x.id === id);
    if (!f) return;
    ctx.save(); ctx.strokeStyle = colour; ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]);
    for (const q of f.pts.slice(1)) ctx.lineTo(q[0], q[1]);
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- the panel
  /** Everything the HTML panel needs, so it never reaches into the game state. */
  view() {
    const g = this.g, p = this.me;
    const s = score(g, this.ix, p);
    return {
      phase: g.phase, hike: g.ring.hike + 1, turn: g.turn,
      startPick: this.startPick ? this.startPick.n : null,
      goal: g.goal, difficulty: g.difficulty,
      budget: g.budget, weather: g.weather, water: p.water,
      at: this.at ? this.at.type : null,
      // A route part-drawn is not a route with a destination — the panel needs
      // both, so it can offer Start again before you have reached anything.
      drawing: !!this.draft,
      canUndo: !!this.draft && (!!this.draft.to || (this.draft.fixed || 1) > 1),
      corners: this.draft ? Math.max(0, (this.draft.fixed || 1) - 1) : 0,
      visited: p.visited.length,
      pending: this.pending ? this.pending.left : 0,
      draft: this.draft && this.draft.to ? (() => {
        // Work the preview out here if the route arrived some way other than a
        // drag. It used to fall back to "not allowed, no reason given", which is
        // the worst thing a rules panel can say.
        const pv = this.preview
          || previewMove(g, this.ix, p, this.draft.pts, this.draft.to, this.how);
        return {
          to: this.ix.byId.get(this.draft.to).type,
          cost: pv.cost, ok: pv.ok, why: pv.why,
          lakes: pv.lakes.length, woodland: pv.woodland.length, bridges: pv.bridges.length,
        };
      })() : null,
      stuck: g.phase === 'move' && mustRest(g, this.ix, p),
      journal: g.phase === 'journal' ? journalOptions(g, this.ix, p) : null,
      actions: p.actions.filter((a) => !a.used).map((a) => a.kind),
      kayak: !!this.kayak, coated: !!p.coated,
      gliding: this.glideAim ? this.glideAim.length : 0,
      aiming: this.glideAim ? this.aimKind : null,
      score: s, results: g.results || null,
      log: g.log.slice(-6).reverse(),
    };
  }
}
