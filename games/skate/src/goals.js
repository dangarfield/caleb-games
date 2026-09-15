/* goals.js — the Tony Hawk part.
 *
 * Each park carries a short list of objectives and a run is judged against
 * them: a score to beat, the five letters, the barrels, a combo length, grind
 * distance or airtime, and one "do it HERE" objective marked with a ring on the
 * ground. Anything ticked stays ticked between sessions, per level, so there is
 * something to come back for.
 *
 * None of this is in the original — Godot_Skate is a pure sandbox — but it is
 * bolted on beside the ported code rather than through it: the only hooks are a
 * combo landing, and reading the controller's position each frame.
 */
import { LETTERS } from './levels.js';

/* Generous on purpose. A letter hanging over a quarter pipe is collected at
   30 mph on a line you cannot adjust once you have committed to it, so the
   sphere has to forgive a foot either way — missing one by a hand's width and
   having to do the whole lap again is not a challenge, it is an errand. */
const LETTER_REACH = 2.3;
const DECK_REACH = 2.5;
const BARREL_REACH = 0.95;

export class Goals {
  constructor(def, props, saved) {
    this.def = def;
    this.props = props;
    this.list = def.goals || [];
    /* what has ever been done here, loaded from the store */
    this.done = Object.assign({}, saved || {});
    this.onComplete = null;
    this.onPickup = null;
    this.startRun();
  }

  startRun() {
    this.run = {
      score: 0, letters: 0, decks: 0, barrels: 0, glass: 0, combo: 0,
      grind: 0, air: 0, zone: false
    };
    this.airTimer = 0;
    this.justDone = [];
    this.props.reset();
  }

  /* --- the two things the game tells us -------------------------------- */

  /** called when a combo cashes out */
  onCombo(total, count, score, position) {
    this.run.score = score;
    this.run.combo = Math.max(this.run.combo, count);
    if (this.props.zone && position.distanceTo(this.props.zone.at) <= this.props.zone.radius + 1.0) {
      this.run.zone = true;
    }
    this._check();
  }

  /**
   * Called every physics frame with what the skater is doing. Grind distance
   * and airtime accumulate here; letters and barrels are proximity tests.
   */
  update(dt, ctrl, stateName) {
    const pos = ctrl.position;

    if (stateName === 'grind') this.run.grind += Math.abs(ctrl.path_vel) * dt;

    if (stateName === 'air' || stateName === 'pipesnap') {
      this.airTimer += dt;
      this.run.air = Math.max(this.run.air, this.airTimer);
    } else this.airTimer = 0;

    for (const l of this.props.letters) {
      if (l.taken) continue;
      if (pos.distanceTo(l.mesh.position) < LETTER_REACH) {
        l.taken = true; l.mesh.visible = false;
        this.run.letters++;
        if (this.onPickup) this.onPickup('letter', l.ch);
      }
    }

    for (const d of this.props.decks) {
      if (d.taken) continue;
      if (pos.distanceTo(d.mesh.position) < DECK_REACH) {
        d.taken = true; d.mesh.visible = false;
        this.run.decks++;
        if (this.onPickup) this.onPickup('deck', this.run.decks);
      }
    }

    for (const b of this.props.barrels) {
      if (b.hit) continue;
      const d = pos.distanceTo(b.home);
      if (d < BARREL_REACH && Math.abs(pos.y - b.home.y) < 1.3) {
        b.hit = true; b.t = 0;
        b.dir.copy(pos).sub(b.home).setY(0).normalize().multiplyScalar(-1);
        if (b.dir.lengthSq() < 0.01) b.dir.set(1, 0, 0);
        b.spin = (Math.random() - 0.5) * 6;
        this.run.barrels++;
        if (this.onPickup) this.onPickup('barrel', this.run.barrels);
      }
    }

    this._check();
  }

  setScore(score) { this.run.score = score; this._check(); }

  /** a window went. Counted here rather than watched, since Glass knows. */
  onGlass() { this.run.glass++; this._check(); }

  /* --- scoring the list ------------------------------------------------ */

  progress(g) {
    const r = this.run;
    switch (g.type) {
      case 'score':   return { have: Math.round(r.score), need: g.target };
      case 'letters': return { have: r.letters, need: LETTERS.length };
      case 'decks':   return { have: r.decks, need: g.target };
      case 'barrels': return { have: r.barrels, need: g.target };
      case 'glass':   return { have: r.glass, need: g.target };
      case 'combo':   return { have: r.combo, need: g.target };
      case 'grind':   return { have: Math.round(r.grind), need: g.target, unit: 'm' };
      case 'air':     return { have: +r.air.toFixed(1), need: g.target, unit: 's' };
      case 'zone':    return { have: r.zone ? 1 : 0, need: 1 };
      default:        return { have: 0, need: 1 };
    }
  }

  _check() {
    for (const g of this.list) {
      if (this.done[g.id]) continue;
      const p = this.progress(g);
      if (p.have >= p.need) {
        this.done[g.id] = true;
        this.justDone.push(g);
        if (this.onComplete) this.onComplete(g);
      }
    }
  }

  /** for the checklist: label, whether it is ticked, and how far along */
  rows() {
    return this.list.map((g) => {
      const p = this.progress(g);
      return {
        id: g.id, label: g.label, done: !!this.done[g.id],
        have: p.have, need: p.need, unit: p.unit || '',
        frac: Math.max(0, Math.min(1, p.need ? p.have / p.need : 0))
      };
    });
  }

  completed() { return this.list.filter((g) => this.done[g.id]).length; }
  total() { return this.list.length; }
  save() { return Object.assign({}, this.done); }
}
