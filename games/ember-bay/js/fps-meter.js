// Ember Bay: a small frame-rate counter (bottom centre) for checking performance on the tablet.
// Toggled with P on a keyboard, or by holding the Fast mode row in Settings for a moment. Saved in settings.
export function createFps(getRenderer) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:50%;bottom:4px;transform:translateX(-50%);z-index:999;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#e5e043;font:700 13px/1.4 monospace;pointer-events:none;display:none';
  document.body.appendChild(el);
  let on = false, raf = 0, n = 0, t0 = 0, last = 0, worst = 0;
  const f = now => {
    raf = requestAnimationFrame(f); n++; worst = Math.max(worst, now - last); last = now;
    if (now - t0 >= 1000) {
      const R = getRenderer(), r = R && R.info.render;
      el.textContent = `${Math.round(n * 1000 / (now - t0))} fps · worst ${Math.round(worst)} ms` + (r ? ` · ${r.calls} calls · ${Math.round(r.triangles / 1000)}k tris` : '');
      n = 0; t0 = now; worst = 0;
    }
  };
  return {
    show(v) {
      on = !!v; el.style.display = on ? 'block' : 'none'; cancelAnimationFrame(raf);
      if (on) { el.textContent = '… fps'; n = 0; t0 = last = performance.now(); worst = 0; raf = requestAnimationFrame(f); }
    },
    get on() { return on; },
  };
}
