/* hud.js — Scenes/UI/ingame_hud.tscn, balance_overlay.gd, trick_overlay.gd,
 * plus the objective furniture this port adds on top.
 *
 * From the original:
 *   1. the balance crescent — a red/green/red arc with a pointer that swings
 *      with balance_angle. It sits on the LEFT of its square for a lip and the
 *      whole control is rotated 90 degrees for a grind, which is why one arc
 *      serves both;
 *   2. the trick label, centred and low, cleared two seconds after the last
 *      thing you landed;
 *   3. the points/multiplier line above it;
 *   4. the input buffer, drawn as the controller faces along the bottom — the
 *      thing that tells you WHY a trick did or did not come out.
 *
 * New here: the S-K-A-T-E pips, the objective checklist, and the banner that
 * fires when one of them ticks.
 */
import { TRICK_LABEL_COOLDOWN } from './config.js';
import { iconSvg } from './icons.js';
import { ACTION_NAME, ACTION_CHIP as CHIP } from './input.js';


export class Hud {
  constructor(root) {
    this.root = root;
    this.balance = root.querySelector('#balance');
    this.needle = root.querySelector('#needle');
    this.trickLabel = root.querySelector('#trickLabel');
    this.pointsLabel = root.querySelector('#pointsLabel');
    this.inputView = root.querySelector('#inputView');
    this.failView = root.querySelector('#failView');
    this.scoreVal = root.querySelector('#scoreVal');
    this.stateVal = root.querySelector('#stateVal');
    this.stateRow = root.querySelector('#stateRow');
    this.speedBar = root.querySelector('#speedFill');
    this.levelName = root.querySelector('#levelName');
    this.pips = root.querySelector('#skatePips');
    this.goalList = root.querySelector('#goalList');
    this.goalCount = root.querySelector('#goalCount');
    this.toastEl = root.querySelector('#toast');
    this.cooldown = 0;
    this.toastTimer = 0;
    this.setBalanceView(false);
  }

  /* balance_overlay.gd */
  setBalanceView(on, rot = 0) {
    this.balance.classList.toggle('on', !!on);
    this.balance.style.transform = `translate(-50%, -50%) rotate(${rot}rad)`;
    if (!on) this.setBalanceValue(0);
  }
  setBalanceValue(v) {
    /* Godot rotates the indicator by -value about the control's pivot */
    this.needle.style.transform = `rotate(${-v}rad)`;
  }

  /* trick_overlay.gd */
  setTrick(text, points) {
    this.trickLabel.textContent = text || '';
    this.pointsLabel.textContent = points || '';
    this.cooldown = TRICK_LABEL_COOLDOWN;
    if (text) {
      this.trickLabel.classList.remove('pop');
      void this.trickLabel.offsetWidth;
      this.trickLabel.classList.add('pop');
    }
  }
  clearTrick() { this.trickLabel.textContent = ''; this.pointsLabel.textContent = ''; }

  update(dt) {
    if (this.cooldown > 0) { this.cooldown -= dt; if (this.cooldown <= 0) this.clearTrick(); }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('on');
    }
  }

  /* trick_overlay.gd::update_input_buffer_vis */
  setBuffer(buffer) {
    const want = buffer.length;
    while (this.inputView.children.length < want) {
      const s = document.createElement('span');
      s.className = 'chip';
      this.inputView.appendChild(s);
    }
    while (this.inputView.children.length > want) this.inputView.lastChild.remove();
    for (let i = 0; i < want; i++) {
      const name = ACTION_NAME[buffer[i]];
      const info = CHIP[name] || { c: 'd' };
      const el = this.inputView.children[i];
      const want2 = 'chip c-' + info.c;
      /* only touch the DOM when the chip actually changes — this runs on every
         buffer change and the icons are the same handful over and over */
      if (el.dataset.act !== name) {
        el.innerHTML = iconSvg(name, 20);
        el.dataset.act = name;
      }
      if (el.className !== want2) el.className = want2;
    }
  }

  /**
   * The big red word when you come off.
   *
   * In endless mode the only thing that can still stop a run is dropping out
   * of the park, which is a rescue rather than a bail — calling it BAIL! there
   * would contradict the mode the player just turned on.
   */
  setFailView(on, forgiving = false) {
    this.failView.classList.toggle('on', !!on);
    const line = this.failView.firstElementChild;
    if (!on || !line) return;
    line.firstChild.nodeValue = forgiving ? 'OOPS!' : 'BAIL!';
    const sub = line.querySelector('small');
    if (sub) sub.textContent = forgiving
      ? 'hold W or Space to get back on'
      : 'hold W or Space to get back up';
  }
  setScore(n) { this.scoreVal.textContent = n.toLocaleString('en-GB'); }

  /* the state machine's own names are for the console; the HUD gets words */
  setState(name) {
    if (!this.stateVal) return;
    this.stateVal.textContent = ({
      ground: 'Riding', pipe: 'In the bowl', pipesnap: 'Above the lip',
      air: 'Air', grind: 'Grinding', lip: 'Lip trick', wallride: 'Wallride',
      fall: 'Off the board', reset: 'Getting up', setup: 'Ready'
    })[name] || name;
  }
  showState(on) { if (this.stateRow) this.stateRow.classList.toggle('off', !on); }
  setSpeed(f) { this.speedBar.style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`; }

  /* --- the objective furniture ---------------------------------------- */

  setLevelName(name) { if (this.levelName) this.levelName.textContent = name; }

  /** one pip per letter of S-K-A-T-E, lit as they are picked up */
  setLetters(letters) {
    if (!this.pips) return;
    if (this.pips.children.length !== letters.length) {
      this.pips.innerHTML = '';
      for (const l of letters) {
        const s = document.createElement('span');
        s.className = 'pip';
        s.textContent = l.ch;
        this.pips.appendChild(s);
      }
    }
    letters.forEach((l, i) => this.pips.children[i].classList.toggle('got', l.taken));
  }

  renderGoals(rows) {
    if (!this.goalList) return;
    const done = rows.filter((r) => r.done).length;
    this.goalCount.textContent = `${done}/${rows.length}`;
    if (this.goalList.children.length !== rows.length) {
      this.goalList.innerHTML = '';
      for (const _ of rows) {
        const li = document.createElement('li');
        li.innerHTML = '<i></i><span class="gl"></span><b class="gp"></b>';
        this.goalList.appendChild(li);
      }
    }
    rows.forEach((r, i) => {
      const li = this.goalList.children[i];
      li.classList.toggle('done', r.done);
      li.querySelector('.gl').textContent = r.label;
      li.querySelector('.gp').textContent = r.done ? '✓'
        : (r.need > 1 ? `${r.have}${r.unit}/${r.need}${r.unit}` : '');
    });
  }

  toast(title, sub = '') {
    if (!this.toastEl) return;
    this.toastEl.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    this.toastTimer = 2.6;
  }
}
