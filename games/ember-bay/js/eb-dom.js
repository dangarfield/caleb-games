// Ember Bay: tiny DOM layer for the screens (no framework).
// render(html) morphs the live #ui tree to match the new markup instead of replacing it, so a
// held drive button keeps its pointer, canvases keep their WebGL context and the range slider
// keeps its drag. Handlers are data-on-<event>="<id>" attributes resolved through the table the
// view filled this render; refs are data-ref="<id>" and get called with their element.
//   data-k   : stable key on each screen/overlay root (sc-if blocks) so siblings never get mixed up
//   data-keep: element whose children are owned by someone else (canvas, three.js hosts)

const EVENTS = ['click', 'pointerdown', 'pointerup', 'pointercancel', 'input', 'contextmenu'];

export function createDom(root) {
  let H = [];
  const tpl = document.createElement('template');

  function fire(e, type, only) {
    for (let el = e.target; el && el !== root.parentNode; el = el.parentNode) {
      const id = el.getAttribute && el.getAttribute('data-on-' + type);
      if (id != null && H[id]) H[id](e);
      if (only) break;
    }
  }
  for (const t of EVENTS) root.addEventListener(t, e => fire(e, t));
  // pointerleave does not bubble: catch it on the way down and only for the element it left.
  root.addEventListener('pointerleave', e => fire(e, 'pointerleave', true), true);

  const key = n => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
  const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === key(b);

  function attrs(a, b) {
    // Kept nodes (canvas, img, three.js hosts) also carry attributes set by code (width/height, src): never strip those.
    if (!a.hasAttribute('data-keep')) for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
    for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
    if (a.nodeName === 'INPUT' && b.hasAttribute('value') && document.activeElement !== a && a.value !== b.getAttribute('value')) a.value = b.getAttribute('value');
  }
  function morph(a, b) {
    if (a.nodeType === 3) { if (a.data !== b.data) a.data = b.data; return; }
    attrs(a, b);
    if (!a.hasAttribute('data-keep')) kids(a, b);
  }
  function kids(p, np) {
    let a = p.firstChild, b = np.firstChild;
    const keys = new Set([...np.childNodes].map(key).filter(Boolean));
    while (b) {
      // A keyed block that is gone from the new markup: drop it, so the unkeyed siblings after it
      // (drive buttons, minimap) are morphed in place rather than rebuilt mid-hold.
      if (a && !same(a, b) && key(a) && !keys.has(key(a))) { const n = a.nextSibling; p.removeChild(a); a = n; continue; }
      const nb = b.nextSibling;
      if (!a) p.appendChild(b);
      else if (same(a, b)) { morph(a, b); a = a.nextSibling; }
      else {
        const k = key(b); let m = null;
        if (k) for (let s = a.nextSibling; s; s = s.nextSibling) if (key(s) === k) { m = s; break; }
        if (m) { p.insertBefore(m, a); morph(m, b); }
        else p.insertBefore(b, a);
      }
      b = nb;
    }
    while (a) { const n = a.nextSibling; p.removeChild(a); a = n; }
  }

  return {
    render(viewFn, vals) {
      const next = [];
      const on = fn => { if (typeof fn !== 'function') return ''; next.push(fn); return next.length - 1; };
      tpl.innerHTML = viewFn(vals, on);
      H = next;
      kids(root, tpl.content);
      for (const el of root.querySelectorAll('[data-ref]')) { const f = H[el.getAttribute('data-ref')]; if (f) f(el); }
    },
  };
}
