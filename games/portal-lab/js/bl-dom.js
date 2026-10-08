// Portal Lab: tiny DOM layer for the screens (no framework). Adapted from games/ember-bay/js/eb-dom.js.
// render(viewFn, vals) morphs the live #ui tree to match the new markup instead of replacing it, so a
// held hex button keeps its pointer and the three.js canvas keeps its WebGL context. Handlers are
// data-on-<event>="<id>" attributes resolved through the table the view filled this render; refs are
// data-ref="<id>" and get called with their element.
//   data-k   : stable key on each sc-if block root, so siblings never get mixed up
//   data-keep: element whose children (and code-set styles) belong to the engine: the canvas host,
//              the look stick and the hurt flash. Its attributes are only touched when the template's
//              own value for them changes, so the engine's inline styles survive re-renders.

const EVENTS = ['click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'input', 'contextmenu'];

export function createDom(root) {
  let H = [];
  const tpl = document.createElement('template');
  const last = new WeakMap(); // data-keep element -> the template attributes it was last given

  function fire(e, type, only) {
    for (let el = e.target; el && el !== root.parentNode; el = el.parentNode) {
      const id = el.getAttribute && el.getAttribute('data-on-' + type);
      // Handlers are delegated from #ui, so give each one the element it was declared on as
      // e.currentTarget, like React does (the engine's touch code measures and captures on it).
      if (id != null && H[id]) { Object.defineProperty(e, 'currentTarget', { value: el, configurable: true }); try { H[id](e); } finally { delete e.currentTarget; } }
      if (only) break;
    }
  }
  for (const t of EVENTS) root.addEventListener(t, e => fire(e, t));
  // pointerleave does not bubble: catch it on the way down and only for the element it left.
  root.addEventListener('pointerleave', e => fire(e, 'pointerleave', true), true);

  const key = n => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
  const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && key(a) === key(b);

  function attrs(a, b) {
    if (a.hasAttribute('data-keep')) {
      const prev = last.get(a) || {};
      const now = {};
      for (const { name, value } of b.attributes) { now[name] = value; if (prev[name] !== value) a.setAttribute(name, value); }
      last.set(a, now);
      return;
    }
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
    for (const { name, value } of b.attributes) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
    if (a.nodeName === 'INPUT' && b.hasAttribute('value') && document.activeElement !== a && a.value !== b.getAttribute('value')) a.value = b.getAttribute('value');
  }
  function remember(n) {
    if (n.nodeType !== 1) return;
    if (n.hasAttribute('data-keep')) { const o = {}; for (const { name, value } of n.attributes) o[name] = value; last.set(n, o); }
    for (const c of n.querySelectorAll('[data-keep]')) { const o = {}; for (const { name, value } of c.attributes) o[name] = value; last.set(c, o); }
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
      if (a && !same(a, b) && key(a) && !keys.has(key(a))) { const n = a.nextSibling; p.removeChild(a); a = n; continue; }
      const nb = b.nextSibling;
      if (!a) { remember(b); p.appendChild(b); }
      else if (same(a, b)) { morph(a, b); a = a.nextSibling; }
      else {
        const k = key(b); let m = null;
        if (k) for (let s = a.nextSibling; s; s = s.nextSibling) if (key(s) === k) { m = s; break; }
        if (m) { p.insertBefore(m, a); morph(m, b); }
        else { remember(b); p.insertBefore(b, a); }
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
