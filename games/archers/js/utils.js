export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// ~±10% damage variance (0.9–1.1), no branching
export function dmgVar(d) { return d * (0.9 + Math.random() * 0.2); }

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function circRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist(cx, cy, nx, ny) < cr;
}

export function pushOutRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const d = dist(cx, cy, nx, ny);
  if (d < cr && d > 0.01) {
    const pen = cr - d;
    return { x: cx + (cx - nx) / d * pen, y: cy + (cy - ny) / d * pen };
  }
  return null;
}

export function randItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedRandom(arr, weightFn) {
  const total = arr.reduce((sum, item) => sum + weightFn(item), 0);
  let r = Math.random() * total;
  for (const item of arr) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return arr[arr.length - 1];
}

// Word-wrap text to fit within maxWidth. Returns array of lines.
export function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Format number with commas: 1300 -> "1,300"
export function fmt(n) {
  return Math.floor(n).toLocaleString();
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}
