// Waypoints — the phone in your pocket.
//
// Everything the game says to the player says it here, on the right, in
// something shaped like a phone. There are two reasons for that and neither is
// decoration. One: the park is the thing worth looking at, and a panel across
// the bottom of a landscape tablet sits exactly where the ground is. Two: a
// phone is a thing an eight-year-old already knows how to read — a header, a
// line of text, some buttons, and a little ⓘ in the corner when he has
// forgotten what he is doing.
//
// It knows nothing about the rules. It is handed a title, a line, some buttons
// and optionally a lump of phase-specific content, and it draws them.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export class Phone {
  constructor(root) {
    this.root = root;
    this.head = root.querySelector('.ph-head');
    this.titleEl = root.querySelector('.ph-title');
    this.lineEl = root.querySelector('.ph-line');
    this.bodyEl = root.querySelector('.ph-body');
    this.actsEl = root.querySelector('.ph-acts');
    this.statEl = root.querySelector('.ph-stat');
    this.sheetEl = root.querySelector('.ph-sheet');
    this.sheetTx = root.querySelector('.ph-sheet-text');
    this.infoBtn = root.querySelector('.ph-info');
    // The notes live on the PAGE, not in the phone: the phone can be put away
    // and a note still has to be able to arrive.
    this.toastEl = document.querySelector('.ph-toasts');
    this.infoText = '';
    this.openKey = null;              // which prompt the open sheet belongs to

    this.shutBtn = root.querySelector('.ph-shut');
    this.backBtn = document.getElementById('phoneBack');

    this.infoBtn.onclick = () => this.info(this.sheetEl.classList.contains('on') ? false : true);
    root.querySelector('.ph-sheet-close').onclick = () => this.info(false);
    this.shutBtn.onclick = () => this.open(false);
    if (this.backBtn) this.backBtn.onclick = () => this.open(true);
  }

  /**
   * The phone, out or away.
   *
   * Away is the whole panel gone, not shrunk: while he is walking the park is
   * the thing worth looking at, and a strip of chrome down the side of it is
   * just a smaller version of being in the way. The chip in the corner is how it
   * comes back, and it is the only thing left behind.
   */
  open(on) {
    this.root.classList.toggle('gone', !on);
    if (this.backBtn) this.backBtn.classList.toggle('on', !on);
    if (!on) this.info(false);
  }

  get isOpen() { return !this.root.classList.contains('gone'); }

  /**
   * Draw a turn.
   *
   * Everything is replaced every time rather than diffed: a turn is a handful of
   * nodes, and a panel that rebuilds cannot get out of step with the game, which
   * a panel that patches itself eventually does.
   */
  set(v) {
    this.titleEl.textContent = v.title || '';
    this.lineEl.innerHTML = v.line || '';
    this.infoText = v.info || '';
    this.infoBtn.hidden = !v.info;

    this.bodyEl.textContent = '';
    if (v.body) this.bodyEl.appendChild(v.body);
    this.bodyEl.hidden = !v.body;

    this.actsEl.textContent = '';
    for (const b of v.buttons || []) {
      // A pair sits side by side on one row: two halves of the same thought,
      // like Undo and Start again, which are both "that is not what I meant".
      if (b.pair) {
        const row = el('div', 'ph-row');
        for (const half of b.pair) if (half) row.appendChild(this._btn(half));
        this.actsEl.appendChild(row);
        continue;
      }
      this.actsEl.appendChild(this._btn(b));
    }
    this.actsEl.hidden = !(v.buttons && v.buttons.length);

    this.statEl.innerHTML = v.stat || '';
    this.statEl.hidden = !v.stat;

    // The sheet follows the turn: if it is open and the turn has moved on, it
    // shows the new turn's help rather than yesterday's.
    if (this.sheetEl.classList.contains('on')) this.sheetTx.textContent = this.infoText;
  }

  /** One button. */
  _btn(b) {
    const node = el('button', 'ph-btn' + (b.go ? ' go' : '') + (b.quiet ? ' quiet' : ''));
    if (b.tint) node.classList.add(b.tint);
    const main = el('span', 'ph-btn-main', b.label);
    // A count belongs ON the line with the thing it counts, in smaller grey:
    // "Drink a water (you have 2)" is one thought, not two.
    if (b.note) main.appendChild(el('span', 'ph-btn-note', ` (${b.note})`));
    node.appendChild(main);
    if (b.sub) node.appendChild(el('span', 'ph-btn-sub', b.sub));
    node.onclick = b.onClick;
    if (b.disabled) node.disabled = true;
    return node;
  }

  /** Open or close the help sheet. */
  info(open) {
    this.sheetTx.textContent = this.infoText;
    this.sheetEl.classList.toggle('on', !!open);
  }

  /**
   * A little note sliding in: crossed a ridge, filled a bottle, arrived.
   *
   * They stack and clear themselves. Three on screen at once is plenty — beyond
   * that it is a wall of text during a walk, which is the opposite of the point.
   */
  toast(n) {
    const t = el('div', 'ph-toast');
    t.appendChild(el('span', 'ph-toast-i', n.icon || '•'));
    t.appendChild(el('span', 'ph-toast-t', n.text || ''));
    if (n.cost) t.appendChild(el('span', 'ph-toast-c', n.cost));
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  clearToasts() { this.toastEl.textContent = ''; }
}

/** A button spec, so callers read as a list of what the player can do. */
export const act = (label, onClick, opts = {}) => ({ label, onClick, ...opts });
