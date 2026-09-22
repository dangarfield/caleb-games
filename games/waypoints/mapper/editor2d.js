// Waypoints — the 2D map editor canvas: pan/zoom, drawing tools, selection.
import { COLOR, WAYPOINTS, drawWaypointIcon, levelColor, levelInk,
  DECOR, drawDecorGlyph, decorH, ICON_H, ICON_SCALE, FEATURE_TILE, FEATURE_FILL,
  drawIcon, iconPattern } from './palette.js';
import { uid, dist, resolvePts, touch, nearestOnPolyline, pointInPoly, joinEnds, openEnds,
  DEFAULT_SMOOTHING, onSheetEdge, clampToSheet } from './state.js';
import { regionPolygon } from './terrain.js';
import { drawBoard, hitBoard, blankPlay } from './board.js';
import { drawCard, hitCard, cardRect, cardBelow } from './card.js';

const HIT = 9;             // screen px for grabbing a vertex
const SNAP = 11;           // screen px snap radius
const EDGE = 14;           // screen px within which a point sticks to the map border
const JOIN = 16;           // screen px within which two loose ends weld together


export class Editor2D {
  constructor(canvas, doc) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.doc = doc;
    this.tool = 'select';
    this.wpType = 'bear';
    this.decorType = 'grass';
    this.contourLevel = 1;   // the base map is level 0, so drawn contours start at 1
    this.snapGrid = true; this.snapVerts = true;
    this.view = { x: -0.3, y: -0.3, scale: 150 };   // cell units -> px
    this.draft = null;        // click-chain in progress: { pts:[], closed }
    this.autoJoin = true;
    this.smoothing = DEFAULT_SMOOTHING;   // roundness given to new shapes
    this.sel = null;          // { layer, id }
    this.hover = null;
    this.drag = null;
    this.onChange = () => {};
    this.onBoardClick = () => {};
    this.onCardClick = () => {};
    this.boardHover = null;
    this.cardHover = null;
    this.cardBox = null;   // the box taking typed digits
    this.underlayImg = null;
    this._bind();
  }

  get map() { return this.doc.map; }

  // ------------------------------------------------------------ coordinates
  toScreen([x, y]) { const v = this.view; return [(x - v.x) * v.scale, (y - v.y) * v.scale]; }
  toMap(sx, sy) { const v = this.view; return [sx / v.scale + v.x, sy / v.scale + v.y]; }
  eventPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return this.toMap(e.clientX - r.left, e.clientY - r.top);
  }

  /** Frame whatever is showing — the sheet, or the whole board if it is on. */
  fit() {
    const r = this.canvas.getBoundingClientRect();
    const { cols, rows } = this.map.grid;
    const b = this.map.board;
    const on = b && b.visible;
    const t = on ? b.band * 1.2 : 0;
    const x0 = -t, y0 = -t, x1 = cols + t;
    const y1 = rows + (on ? cardBelow(this.map) : 0) + t;
    const w = x1 - x0, h = y1 - y0;
    const s = Math.min(r.width / (w + 0.25), r.height / (h + 0.25));
    this.view.scale = s;
    this.view.x = x0 - (r.width / s - w) / 2;
    this.view.y = y0 - (r.height / s - h) / 2;
    this.draw();
  }

  setUnderlay(src) {
    if (!src) { this.underlayImg = null; this.draw(); return; }
    const im = new Image();
    im.onload = () => { this.underlayImg = im; this.draw(); };
    im.onerror = () => { this.underlayImg = null; this.draw(); };
    im.src = src;
  }

  /** The board space under a map point, or null. */
  pickBoard(p) {
    const m = this.map;
    if (!m.board || !m.board.visible) return null;
    return hitBoard(m.board, m.grid, p[0], p[1], cardBelow(m));
  }

  /** The score-card region under a map point, or null. */
  pickCard(p) {
    const m = this.map;
    if (!m.card || !m.board || !m.board.visible) return null;
    return hitCard(m, p[0], p[1]);
  }

  // ------------------------------------------------------------ snapping
  snap(p, ignore) {
    const v = this.view;
    let best = SNAP / v.scale, hit = null;
    if (this.snapVerts) {
      // loose ends of open lines win over ordinary points: that is where you join
      for (const layer of ['contours', 'rivers']) {
        for (const e of openEnds(this.map, layer)) {
          if (e.shape === ignore) continue;
          const d = dist(p, e.p);
          if (d < JOIN / v.scale && d < best + 0.5) { best = d; hit = e.p.slice(); }
        }
      }
      if (!hit) {
        for (const layer of ['contours', 'rivers', 'lakes', 'woodland']) {
          for (const sh of this.map[layer]) {
            if (sh === ignore) continue;
            for (const q of sh.pts) { const d = dist(p, q); if (d < best) { best = d; hit = q.slice(); } }
          }
        }
      }
    }
    const out = hit ? hit : [p[0], p[1]];
    if (!hit && this.snapGrid) {
      const t = SNAP / v.scale;
      const rx = Math.round(out[0]), ry = Math.round(out[1]);
      if (Math.abs(out[0] - rx) < t) out[0] = rx;
      if (Math.abs(out[1] - ry) < t) out[1] = ry;
    }
    return this.clampToSheet(out);
  }

  /** Nothing lives outside the printed sheet; near an edge, sit exactly on it. */
  clampToSheet(p) {
    const { cols, rows } = this.map.grid, t = EDGE / this.view.scale;
    let [x, y] = p;
    if (x < t) x = 0; else if (x > cols - t) x = cols;
    if (y < t) y = 0; else if (y > rows - t) y = rows;
    return clampToSheet([x, y]);
  }

  onEdge(p) { return onSheetEdge(p); }

  /**
   * A contour is finished when it either closes on itself or runs from one edge
   * of the sheet to another — those are the two ways a real contour bounds an
   * area. Anything else has a loose end and is drawn as unfinished.
   */
  isComplete(sh, layer) {
    if (sh.closed) return true;
    if (!sh.pts || sh.pts.length < 2) return false;
    return this.looseEnds(sh, layer).length === 0;
  }

  /**
   * The ends of a line that go nowhere.
   *
   * A contour has to close or run edge to edge — it only ever joins itself. A
   * RIVER is different: a watercourse is drawn in sections that meet each other
   * at confluences, and it can end by running into a lake. An end that meets
   * another river or a lake is finished, so it is not flagged.
   */
  looseEnds(sh, layer) {
    if (sh.closed || !sh.pts || sh.pts.length < 2) return [];
    const ends = [sh.pts[0], sh.pts[sh.pts.length - 1]];
    if (layer !== 'rivers') return ends.filter((p) => !this.onEdge(p));
    const joined = this._riverJoins();
    return ends.filter((p, k) => !this.onEdge(p) && !joined.has(`${sh.id}:${k ? 'b' : 'a'}`));
  }

  /**
   * Which river ends meet something. Rebuilt only when the rivers or lakes
   * change — it is O(ends x courses) and the draw loop asks for it per river.
   *
   * The tolerance is the two channels' own width: if their banks overlap, the
   * water is continuous. On map 01 that separates the real confluences (all
   * within 0.013 of a cell) from the genuine gaps (0.085 and up) with room to
   * spare, so it is not a number tuned to one map.
   */
  _riverJoins() {
    const m = this.map;
    const rivers = m.rivers || [], lakes = m.lakes || [];
    let sig = `${rivers.length}/${lakes.length}`;
    for (const r of rivers) sig += `|${r.id}:${r.rev | 0}:${r.width || 0}`;
    for (const l of lakes) sig += `|${l.id}:${l.rev | 0}`;
    if (this._joinSig === sig) return this._joinSet;

    const set = new Set();
    const courses = rivers.map((r) => ({ r, pts: resolvePts(r) }));
    const shores = lakes.map((l) => resolvePts(l));
    for (const { r, pts } of courses) {
      if (pts.length < 2) continue;
      const w = r.width || 0.05;
      [['a', pts[0]], ['b', pts[pts.length - 1]]].forEach(([tag, p]) => {
        for (const o of courses) {
          if (o.r === r || o.pts.length < 2) continue;
          const tol = (w + (o.r.width || 0.05)) / 2;
          const n = nearestOnPolyline(p, o.pts);
          if (n && n.d <= tol) { set.add(`${r.id}:${tag}`); return; }
        }
        for (const shore of shores) {
          if (shore.length < 3) continue;
          if (pointInPoly(p, shore)) { set.add(`${r.id}:${tag}`); return; }
          const n = nearestOnPolyline(p, shore.concat([shore[0]]));
          if (n && n.d <= w) { set.add(`${r.id}:${tag}`); return; }
        }
      });
    }
    this._joinSig = sig; this._joinSet = set;
    return set;
  }

  /** Brief pulse on a shape that has just become complete. */
  flash(id) {
    this._flash = { id, until: performance.now() + 850 };
    const tick = () => {
      if (!this._flash) return;
      this.draw();
      if (performance.now() < this._flash.until) requestAnimationFrame(tick);
      else { this._flash = null; this.draw(); }
    };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------ picking
  pick(p) {
    const t = HIT / this.view.scale;
    for (const wp of [...(this.map.waypoints || [])].reverse())
      if (dist(p, [wp.x, wp.y]) < 0.09) return { layer: 'waypoints', id: wp.id };
    for (const dc of [...(this.map.decor || [])].reverse())
      if (dist(p, [dc.x, dc.y]) < Math.max(0.06, (dc.radius ?? 0.26) * 0.45))
        return { layer: 'decor', id: dc.id };
    for (const b of [...(this.map.bridges || [])].reverse())
      if (dist(p, [b.x, b.y]) < 0.07) return { layer: 'bridges', id: b.id };
    for (const pl of [...(this.map.places || [])].reverse())
      if (this.hitText(p, pl)) return { layer: 'places', id: pl.id };
    for (const layer of ['lakes', 'woodland']) {
      for (const sh of [...(this.map[layer] || [])].reverse())
        if (pointInPoly(p, resolvePts(sh))) return { layer, id: sh.id };
    }
    for (const layer of ['rivers', 'contours']) {
      for (const sh of [...(this.map[layer] || [])].reverse()) {
        const n = nearestOnPolyline(p, resolvePts(sh));
        if (n && n.d < Math.max(t, 0.03)) return { layer, id: sh.id };
      }
    }
    return null;
  }
  shapeOf(ref) { return ref ? this.map[ref.layer].find((s) => s.id === ref.id) : null; }

  /** Text is picked by its rotated box, so long names are easy to grab. */
  hitText(p, pl) {
    const w = (pl._w || 0.4), h = (pl.size || 0.13) * 1.5;
    const a = -(pl.angle || 0);
    const dx = p[0] - pl.x, dy = p[1] - pl.y;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= w / 2 + 0.02 && Math.abs(ly) <= h / 2 + 0.02;
  }

  // ------------------------------------------------------------ tools
  setTool(t) { this.commitDraft(true); this.tool = t; this.draw(); this.onChange(); }

  startOrExtend(p) {
    if (!this.draft) this.draft = { pts: [] };
    this.draft.pts.push(this.snap(p));
  }

  commitDraft(cancel) {
    const d = this.draft; this.draft = null;
    if (!d || cancel) { this.draw(); return; }
    this.addShape(d.pts, false);
  }

  /** Turn a list of points — clicked or drawn — into a shape on the current layer. */
  addShape(pts, _unused, forceClose) {
    if (!pts || pts.length < 2) { this.draw(); return; }
    const tool = this.tool;
    const closedTool = tool === 'lake' || tool === 'woodland';
    const p = pts.slice();
    const layer = { contour: 'contours', river: 'rivers', lake: 'lakes', woodland: 'woodland' }[tool];
    if (!layer) { this.draw(); return; }

    const meets = p.length > 3 && dist(p[0], p[p.length - 1]) < JOIN / this.view.scale;
    const closed = !!forceClose || closedTool || meets;
    if (closed && meets && p.length > 3) p.pop();

    this.doc.edit(`draw ${tool}`, (m) => {
      const sh = {
        id: uid(layer[0]), closed, smoothing: this.smoothing, rev: 0, pts: p,
      };
      if (layer === 'contours') sh.level = Math.max(1, this.contourLevel | 0);   // carried from the last one you touched
      if (layer === 'rivers') sh.width = 0.05;
      m[layer].push(sh);
      let final = sh;
      if (!closed && this.autoJoin && (layer === 'contours' || layer === 'rivers')) {
        final = joinEnds(m, layer, sh, JOIN / this.view.scale);
      }
      this.sel = { layer, id: final.id };
      if (final.closed) this.flash(final.id);
    });
    this.draw(); this.onChange();
  }

  placePoint(p) {
    const doc = this.doc;
    if (this.tool === 'waypoint') {
      const def = WAYPOINTS[this.wpType];
      doc.edit('place waypoint', (m) => {
        const wp = { id: uid('wp'), type: this.wpType, x: +p[0].toFixed(4), y: +p[1].toFixed(4) };
        if (def.field) wp[def.field] = this.nextFieldValue(m, def);
        m.waypoints.push(wp); this.sel = { layer: 'waypoints', id: wp.id };
      });
    } else if (this.tool === 'bridge') {
      let angle = 0, best = 9e9, at = p;
      for (const r of this.map.rivers) {
        const pts = resolvePts(r); const n = nearestOnPolyline(p, pts);
        if (n && n.d < best) {
          best = n.d; at = n.p;
          const a = pts[n.i], b = pts[Math.min(pts.length - 1, n.i + 1)];
          angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
        }
      }
      if (best > 0.25) { at = p; }
      doc.edit('place bridge', (m) => {
        const b = { id: uid('b'), x: +at[0].toFixed(4), y: +at[1].toFixed(4), angle: +angle.toFixed(3) };
        m.bridges.push(b); this.sel = { layer: 'bridges', id: b.id };
      });
    } else if (this.tool === 'decor') {
      const def = DECOR[this.decorType];
      doc.edit('place decoration', (m) => {
        const dc = { id: uid('dc'), type: this.decorType, x: +p[0].toFixed(4), y: +p[1].toFixed(4),
          radius: def.radius };   // how many is the map's density, not a per-point setting
        m.decor.push(dc); this.sel = { layer: 'decor', id: dc.id };
      });
    } else if (this.tool === 'label') {
      doc.edit('place name', (m) => {
        const pl = { id: uid('pl'), text: 'NEW PLACE', x: +p[0].toFixed(4), y: +p[1].toFixed(4),
          angle: 0, size: 0.06, spacing: 0.012 };
        m.places.push(pl); this.sel = { layer: 'places', id: pl.id }; this.focusText = true;
      });
    }
    this.draw(); this.onChange();
  }

  nextFieldValue(m, def) {
    if (def.field === 'number') {
      const used = new Set(m.waypoints.filter((w) => w.type === 'campsite').map((w) => w.number));
      for (let i = 1; i <= 12; i++) if (!used.has(i)) return i;
      return 1;
    }
    return def.fieldDefault;
  }

  deleteSelected() {
    if (!this.sel) return;
    const { layer, id } = this.sel;
    this.doc.edit('delete', (m) => { m[layer] = m[layer].filter((s) => s.id !== id); });
    this.sel = null; this.draw(); this.onChange();
  }

  duplicateSelected() {
    const sh = this.shapeOf(this.sel); if (!sh) return;
    const { layer } = this.sel;
    this.doc.edit('duplicate', (m) => {
      const c = JSON.parse(JSON.stringify(sh));
      c.id = uid(layer[0]); c.rev = 0;
      if (c.pts) c.pts = c.pts.map(([x, y]) => [x + 0.08, y + 0.08]);
      else { c.x += 0.08; c.y += 0.08; }
      m[layer].push(c); this.sel = { layer, id: c.id };
    });
    this.draw(); this.onChange();
  }

  nudgeLevel(delta) {
    const sh = this.shapeOf(this.sel);
    if (sh && this.sel.layer === 'contours') {
      this.doc.edit('level', () => { sh.level = (sh.level | 0) + delta; });
    } else {
      this.contourLevel += delta;
    }
    this.draw(); this.onChange();
  }

  // ------------------------------------------------------------ input
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('dblclick', (e) => this._dbl(e));
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); this.commitDraft(false); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const before = this.toMap(e.clientX - r.left, e.clientY - r.top);
      const f = Math.exp(-e.deltaY * 0.0012);
      this.view.scale = Math.max(28, Math.min(3200, this.view.scale * f));
      const after = this.toMap(e.clientX - r.left, e.clientY - r.top);
      this.view.x += before[0] - after[0]; this.view.y += before[1] - after[1];
      this.draw();
    }, { passive: false });
  }

  _down(e) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    const p = this.eventPos(e);
    // A locked canvas is a BOARD, not a document. The play controller gets first
    // refusal on the pointer; anything it does not want becomes a pan, and
    // nothing at all reaches the editing tools — on a board there is no such
    // thing as dragging a contour out of place.
    const pan = e.button === 1 || e.altKey || this.spaceDown;
    if (this.play && !pan && this.play.down(p, e) !== false) return;
    if (this.locked) {
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      return;
    }
    if (e.button === 1 || e.altKey && this.tool !== 'select' || this.spaceDown) {
      this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
      return;
    }
    if (e.button !== 0) return;

    // The board is outside the sheet, so a click out there is always a board
    // click whatever tool is up — you can circle a space mid-edit.
    const bs = this.pickBoard(p);
    if (bs) { this.onBoardClick(bs); return; }
    const cs = this.pickCard(p);
    if (cs) { this.onCardClick(cs); return; }

    if (this.tool === 'select') {
      const t = HIT / this.view.scale;
      const sh = this.shapeOf(this.sel);
      if (sh && sh.pts) {                                  // grab a vertex of the selection
        for (let i = 0; i < sh.pts.length; i++) {
          if (dist(p, sh.pts[i]) < t) {
            if (e.altKey) {
              if (sh.pts.length > 2) { this.doc.edit('remove point', () => { sh.pts.splice(i, 1); sh.rev = (sh.rev | 0) + 1; touch(sh); }); this.draw(); this.onChange(); }
              return;
            }
            this.doc.begin();
            this.drag = { mode: 'vertex', shape: sh, index: i };
            return;
          }
        }
      }
      const hit = this.pick(p);
      this.sel = hit;
      if (hit) {
        this.doc.begin();
        const s = this.shapeOf(hit);
        this.drag = { mode: 'shape', shape: s, layer: hit.layer, start: p,
          orig: s.pts ? s.pts.map((q) => q.slice()) : [s.x, s.y] };
      }
      this.draw(); this.onChange();
      return;
    }
    if (this.tool === 'waypoint' || this.tool === 'bridge' || this.tool === 'label' || this.tool === 'decor') {
      this.placePoint(this.snap(p)); return;
    }
    // click to lay a point; click back on the first point to close the ring
    if (this.draft && this.draft.pts.length > 2 && this.nearDraftStart(p)) {
      this.addShape(this.draft.pts, false, true);
      this.draft = null;
      return;
    }
    this.startOrExtend(p); this.draw();
  }

  /** Is the cursor over the first point of the line being drawn? */
  nearDraftStart(p) {
    if (!this.draft || this.draft.pts.length < 3) return false;
    return dist(p, this.draft.pts[0]) < JOIN / this.view.scale;
  }

  _move(e) {
    if (this.play && !this.drag) { if (this.play.move(this.eventPos(e), e) !== false) return; }
    if (this.locked && (!this.drag || this.drag.mode !== 'pan')) return;
    const p = this.eventPos(e);
    this.cursor = p;
    const d = this.drag;
    if (d) {
      if (d.mode === 'pan') {
        this.view.x = d.vx - (e.clientX - d.sx) / this.view.scale;
        this.view.y = d.vy - (e.clientY - d.sy) / this.view.scale;
      } else if (d.mode === 'vertex') {
        const q = this.snap(p, d.shape);
        d.shape.pts[d.index] = [+q[0].toFixed(4), +q[1].toFixed(4)];
        d.shape.rev = (d.shape.rev | 0) + 1; touch(d.shape);
        d.moved = true;
      } else if (d.mode === 'shape') {
        const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        if (d.shape.pts) {
          d.shape.pts = d.orig.map(([x, y]) => [+(x + dx).toFixed(4), +(y + dy).toFixed(4)]);
          d.shape.rev = (d.shape.rev | 0) + 1; touch(d.shape);
        } else {
          d.shape.x = +(d.orig[0] + dx).toFixed(4); d.shape.y = +(d.orig[1] + dy).toFixed(4);
        }
        d.moved = true;
      }
      this.draw();
      return;
    }
    if (this.draft) { this.draw(); return; }
    const bh = this.pickBoard(p);
    const ch = bh ? null : this.pickCard(p);
    const bchanged = JSON.stringify(bh) !== JSON.stringify(this.boardHover) ||
      (ch && ch.kind) !== (this.cardHover && this.cardHover.kind) ||
      (ch && ch.key) !== (this.cardHover && this.cardHover.key) ||
      (ch && ch.n) !== (this.cardHover && this.cardHover.n);
    this.boardHover = bh; this.cardHover = ch;
    const h = !bh && !ch && this.tool === 'select' ? this.pick(p) : null;
    const changed = JSON.stringify(h) !== JSON.stringify(this.hover);
    this.hover = h;
    if (changed || bchanged) this.draw();
  }

  _up(e) {
    if (this.play && !this.drag) { if (this.play.up(e) !== false) return; }
    if (this.locked) { this.drag = null; return; }
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.mode === 'pan') return;
    if (d.moved) { this.doc.commit('move'); this.onChange(); }
    else { this.doc._pre = null; }
  }

  _dbl(e) {
    if (this.play || this.locked) return;
    const p = this.eventPos(e);
    if (this.draft) { this.draft.pts.pop(); this.commitDraft(false); return; }
    if (this.tool === 'select') {
      const sh = this.shapeOf(this.sel);
      if (sh && sh.pts) {                                   // insert a vertex on the nearest edge
        const n = nearestOnPolyline(p, sh.pts);
        if (n && n.d < 0.06) {
          this.doc.edit('add point', () => { sh.pts.splice(n.i + 1, 0, [+n.p[0].toFixed(4), +n.p[1].toFixed(4)]); sh.rev = (sh.rev | 0) + 1; touch(sh); });
          this.draw(); this.onChange();
        }
      }
    }
  }

  key(e) {
    if (this.play || this.locked) return;
    if (e.target && /input|textarea/i.test(e.target.tagName)) return false;
    const k = e.key;
    if (k === 'Escape') { this.commitDraft(true); this.sel = null; this.draw(); this.onChange(); return true; }
    if (k === 'Enter') { this.commitDraft(false); return true; }
    if (k === 'Backspace' && this.draft) { this.draft.pts.pop(); if (!this.draft.pts.length) this.draft = null; this.draw(); return true; }
    if ((k === 'Delete' || k === 'Backspace') && this.sel) { this.deleteSelected(); return true; }
    if (k === '[') { this.nudgeLevel(-1); return true; }
    if (k === ']') { this.nudgeLevel(1); return true; }
    if (k === 'f') { this.fit(); return true; }
    if (k === 'g') { this.snapGrid = !this.snapGrid; this.onChange(); return true; }
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'd') { this.duplicateSelected(); return true; }
    return false;
  }

  // ------------------------------------------------------------ render
  draw() {
    const c = this.canvas, ctx = this.ctx;
    const r = c.getBoundingClientRect();
    // The page may cap this. The printed sheet is repainted on every frame of a
    // route being dragged, and on a tablet a backing store at 2x is four times
    // the pixels of one at 1x for a picture nobody is looking at that closely.
    const dpr = Math.min(devicePixelRatio, this.maxDpr || 2);
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.fillStyle = COLOR.surround; ctx.fillRect(0, 0, r.width, r.height);

    const m = this.map, v = this.view, S = v.scale;
    ctx.save();
    ctx.translate(-v.x * S, -v.y * S); ctx.scale(S, S);

    // The printed board around the sheet — the weather track you roll on. It
    // lies outside the map and so outside the sheet clip below: it is the one
    // thing that is SUPPOSED to be off the paper.
    // In play mode the sheet shows the GAME's marks, not the document's. The
    // document is never written to: the mapper autosaves it, and a game in
    // progress is not an edit to the map.
    const play = this.play ? this.play.sheet() : (m.play || blankPlay());
    drawBoard(ctx, m, play, { hover: this.boardHover, below: cardBelow(m) });
    drawCard(ctx, m, play, { hover: this.cardHover, selected: this.cardBox });

    // the sheet itself, so the map still sits on paper now that the canvas
    // behind it is the desk rather than the page
    ctx.fillStyle = COLOR.paper;
    ctx.fillRect(0, 0, m.grid.cols, m.grid.rows);

    // underlay photo
    const u = m.underlay;
    if (this.underlayImg && u.visible) {
      ctx.save(); ctx.globalAlpha = u.opacity;
      ctx.drawImage(this.underlayImg, u.x, u.y, u.w, u.h);
      ctx.restore();
    }

    const px = 1 / S;
    const show = (k) => !(this._hidden && this._hidden.has(k));

    // Nothing belongs off the paper. A river's round cap and a decoration's wash
    // both reach past the point that made them, so the sheet is a hard clip.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, m.grid.cols, m.grid.rows); ctx.clip();

    // Level bands. Each contour's ground is tinted by its level, painted
    // largest first so an inner ring covers the one it sits in — the same ramp
    // the 3D preview colours the terrain with.
    if (show('contours') && this.showBands !== false) {
      const bands = [];
      for (const ct of m.contours) {
        if (ct.level == null && ct.height == null) continue;
        const poly = regionPolygon(ct, m.grid.cols, m.grid.rows);
        if (!poly || poly.length < 3) continue;
        bands.push({ poly, level: ct.level | 0, area: Math.abs(polyArea(poly)) });
      }
      bands.sort((a, b) => b.area - a.area);
      ctx.save();
      for (const bd of bands) {
        ctx.fillStyle = levelColor(bd.level, this.bandAlpha ?? 0.34);
        ctx.beginPath(); trace(ctx, bd.poly, true); ctx.fill();
      }
      ctx.restore();
    }
    // contours
    if (show('contours')) for (const ct of m.contours) {
      const pts = resolvePts(ct); if (pts.length < 2) continue;
      const noLevel = ct.level == null && ct.height == null;
      const done = this.isComplete(ct, 'contours');
      const major = !noLevel && ((ct.level | 0) % 5) === 0;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (!done) {
        ctx.strokeStyle = COLOR.unfinished;
        ctx.lineWidth = 2.0 * px;
        ctx.setLineDash([0.05, 0.035]);
      } else {
        ctx.strokeStyle = noLevel ? COLOR.noLevel : levelInk(ct.level | 0);
        ctx.lineWidth = (major ? 2.3 : 1.5) * px;
        if (noLevel) ctx.setLineDash([0.035, 0.028]);
      }
      ctx.beginPath(); trace(ctx, pts, ct.closed); ctx.stroke();
      if (this._flash && this._flash.id === ct.id) {
        const k = Math.max(0, (this._flash.until - performance.now()) / 850);
        ctx.strokeStyle = COLOR.complete;
        ctx.globalAlpha = k;
        ctx.lineWidth = (2 + 10 * (1 - k)) * px;
        ctx.beginPath(); trace(ctx, pts, ct.closed); ctx.stroke();
      }
      ctx.restore();
      if (this._isSel('contours', ct.id)) this._selStroke(ctx, pts, ct.closed, px);
    }
    // woodland + lakes — each filled with its own symbol, tiled
    if (show('woodland')) for (const wd of m.woodland) this._poly(ctx, wd, COLOR.woodFill, COLOR.wood, px, 'woodland', FEATURE_FILL.woodland);
    if (show('lakes')) for (const lk of m.lakes) this._poly(ctx, lk, COLOR.waterFill, COLOR.water, px, 'lakes', FEATURE_FILL.lakes);

    // ---- decoration: the background colouring only. Its glyph is an icon and
    // goes in the icon pass below, so nothing paints over a symbol.
    if (show('decor')) for (const dc of (m.decor || [])) {
      const rr = dc.radius ?? 0.26;
      const def = DECOR[dc.type] || DECOR.grass;
      const grad = ctx.createRadialGradient(dc.x, dc.y, 0, dc.x, dc.y, rr);
      grad.addColorStop(0, def.wash + '52');
      grad.addColorStop(0.65, def.wash + '30');
      grad.addColorStop(1, def.wash + '00');
      ctx.save(); ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(dc.x, dc.y, rr, rr * 0.82, 0, 0, 7); ctx.fill();
      ctx.restore();
      if (this._isSel('decor', dc.id)) {
        ctx.save();
        ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 2 * px; ctx.setLineDash([0.04, 0.03]);
        ctx.beginPath(); ctx.ellipse(dc.x, dc.y, rr, rr * 0.82, 0, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(dc.x, dc.y, 0.02, 0, 7); ctx.fillStyle = COLOR.sel; ctx.fill();
        ctx.restore();
      }
    }

    // The river runs over the decoration's wash but under the bridge that crosses
    // it, which is the order it reads in on the printed map.
    if (show('rivers')) for (const rv of m.rivers) {
      const pts = resolvePts(rv); if (pts.length < 2) continue;
      ctx.strokeStyle = COLOR.water; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = (rv.width || 0.05);
      ctx.beginPath(); trace(ctx, pts, false); ctx.stroke();
      if (this._isSel('rivers', rv.id)) this._selStroke(ctx, pts, false, px);
    }

    // grid over the ground, under the symbols, as on the printed map — you can
    // see which lines a route crosses, and crossing one costs a movement point
    ctx.strokeStyle = COLOR.grid; ctx.lineWidth = 1.6 * px;
    ctx.beginPath();
    for (let i = 0; i <= m.grid.cols; i++) { ctx.moveTo(i, 0); ctx.lineTo(i, m.grid.rows); }
    for (let j = 0; j <= m.grid.rows; j++) { ctx.moveTo(0, j); ctx.lineTo(m.grid.cols, j); }
    ctx.stroke();

    // ================================================================ icons
    // Everything with a printed symbol, drawn last so nothing covers it, and
    // sized in CELL UNITS so it grows and shrinks with the zoom like the map.
    if (show('bridges')) for (const b of m.bridges) {
      drawIcon(ctx, 'bridge', b.x, b.y, ICON_H.bridge, { angle: -(b.angle || 0) });
      if (this._isSel('bridges', b.id)) this._selDot(ctx, b.x, b.y, px);
    }
    if (show('decor')) for (const dc of (m.decor || [])) {
      const dh = decorH(dc.type, ICON_H.decor);
      ctx.save(); ctx.translate(dc.x, dc.y + dh * 0.45);
      drawDecorGlyph(ctx, dc.type, dh, 1, true);
      ctx.restore();
    }
    // (wp.x, wp.y) IS the orange ring — the waypoint's position on the ground.
    // The symbol stands above it.
    if (show('waypoints')) for (const wp of m.waypoints) {
      const def = WAYPOINTS[wp.type];
      const h = ICON_H.waypoint;
      ctx.save(); ctx.translate(wp.x, wp.y);
      drawWaypointIcon(ctx, wp.type, h, { text: def && def.field ? wp[def.field] : null });
      ctx.restore();
      const sel = this._isSel('waypoints', wp.id);
      const hov = this.hover && this.hover.layer === 'waypoints' && this.hover.id === wp.id;
      if (sel || hov) {
        const art = h * (ICON_SCALE[wp.type] || 1);
        const mid = -(h * 0.30 + art / 2) / 2;      // between the ring and the symbol
        ctx.save();
        ctx.strokeStyle = sel ? COLOR.sel : COLOR.glow; ctx.lineWidth = (sel ? 2 : 1.5) * px;
        ctx.beginPath(); ctx.arc(wp.x, wp.y + mid, h * 0.30 + art * 0.62, 0, 7); ctx.stroke();
        ctx.restore();
      }
    }
    // The play overlay draws INSIDE the sheet clip and the map transform, so a
    // route is in cell units like everything else and cannot spill off the paper.
    if (this.play) this.play.drawMap(ctx, 1 / S);
    ctx.restore();        // the sheet clip
    ctx.restore();        // the map transform

    // place names in screen space, so the type hinting stays crisp
    if (show('places')) for (const pl of m.places) {
      const [sx, sy] = this.toScreen([pl.x, pl.y]);
      const px2 = Math.max(8, (pl.size || 0.13) * S);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(pl.angle || 0);
      ctx.font = `600 ${px2}px "Segoe UI", system-ui, sans-serif`;
      ctx.letterSpacing = `${(pl.spacing == null ? 0.018 : pl.spacing) * S}px`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const text = pl.text || '';
      pl._w = (ctx.measureText(text).width || 1) / S;    // cell units, for picking
      ctx.lineWidth = Math.max(2, px2 * 0.18);
      ctx.strokeStyle = 'rgba(223,231,216,0.85)';         // halo so names read over contours
      ctx.lineJoin = 'round';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = pl.color || '#2a3441';
      ctx.fillText(text, 0, 0);
      if (this._isSel('places', pl.id)) {
        ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 2;
        ctx.strokeRect(-pl._w * S / 2 - 4, -px2 * 0.75, pl._w * S + 8, px2 * 1.5);
      }
      ctx.restore();
    }
    // the level number, printed on the line where a map would print it
    if (show('contours') && this.showLevelNums === true && S > 70) {
      ctx.save();
      ctx.font = `600 ${Math.max(9, Math.min(13, S * 0.075))}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const ct of m.contours) {
        if (ct.level == null && ct.height == null) continue;
        const pts = resolvePts(ct); if (pts.length < 3) continue;
        let top = pts[0];
        for (const q of pts) if (q[1] < top[1]) top = q;
        const [sx, sy] = this.toScreen(top);
        const label = String(ct.level | 0);
        const wdt = ctx.measureText(label).width + 8;
        ctx.fillStyle = 'rgba(255,252,244,0.86)';
        ctx.beginPath(); ctx.roundRect(sx - wdt / 2, sy - 8, wdt, 16, 5); ctx.fill();
        ctx.fillStyle = levelInk(ct.level | 0);
        ctx.fillText(label, sx, sy);
      }
      ctx.restore();
    }

    // loose ends — the thing still to finish. Ends that sit on the sheet edge
    // are not loose, so an edge-to-edge contour shows nothing.
    // The pips marking ends that go nowhere. On a trace made of short open
    // sections that is one on every contour, which is the right amount of noise
    // while tracing and the wrong amount on a board.
    ctx.save();
    for (const layer of this.hidePips ? [] : ['contours', 'rivers']) {
      if (!show(layer)) continue;
      for (const sh of m[layer]) {
        for (const q of this.looseEnds(sh, layer)) {
          const [sx, sy] = this.toScreen(q);
          ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 7);
          ctx.fillStyle = '#fffaf0'; ctx.fill();
          ctx.strokeStyle = COLOR.unfinished; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    }
    ctx.restore();

    // draft in progress
    if (this.draft && this.draft.pts.length) {
      ctx.save();
      ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const sp = this.draft.pts.map((p) => this.toScreen(p));
      sp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (this.cursor) { const q = this.toScreen(this.snap(this.cursor)); ctx.lineTo(q[0], q[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COLOR.glow;
      sp.forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, 7); ctx.fill(); });
      // hovering the first point closes the ring
      if (this.cursor && this.nearDraftStart(this.cursor)) {
        ctx.strokeStyle = COLOR.complete; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sp[0][0], sp[0][1], 10, 0, 7); ctx.stroke();
        ctx.fillStyle = COLOR.complete;
        ctx.font = '600 12px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('close', sp[0][0], sp[0][1] - 16);
      }
      ctx.restore();
    }
    // vertices of the selection
    const sel = this.shapeOf(this.sel);
    if (sel && sel.pts) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 2;
      for (const q of sel.pts) {
        const [sx, sy] = this.toScreen(q);
        ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, 7); ctx.fill(); ctx.stroke();
      }
    }
  }

  _isSel(layer, id) { return this.sel && this.sel.layer === layer && this.sel.id === id; }
  /** An area feature: flat colour, then its own symbol tiled over it. */
  _poly(ctx, sh, fill, stroke, px, layer, tile) {
    const pts = resolvePts(sh); if (pts.length < 3) return;
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.6 * px;
    ctx.beginPath(); trace(ctx, pts, true); ctx.fill();
    if (tile) {
      const pat = iconPattern(ctx, tile, FEATURE_TILE.size, FEATURE_TILE.alpha);
      if (pat) { ctx.save(); ctx.fillStyle = pat; ctx.fill(); ctx.restore(); }
    }
    ctx.stroke();
    if (this._isSel(layer, sh.id)) this._selStroke(ctx, pts, true, px);
  }
  _selStroke(ctx, pts, closed, px) {
    ctx.save(); ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 3 * px; ctx.globalAlpha = 0.8;
    ctx.beginPath(); trace(ctx, pts, closed); ctx.stroke(); ctx.restore();
  }
  _selDot(ctx, x, y, px) {
    ctx.save(); ctx.strokeStyle = COLOR.sel; ctx.lineWidth = 3 * px;
    ctx.beginPath(); ctx.arc(x, y, 0.06, 0, 7); ctx.stroke(); ctx.restore();
  }
}

/** Area-weighted centre of a ring — where a feature's roundel sits. */
function centroid(p) {
  if (!p || p.length < 3) return p && p.length ? p[0].slice() : null;
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const f = p[j][0] * p[i][1] - p[i][0] * p[j][1];
    a += f; cx += (p[j][0] + p[i][0]) * f; cy += (p[j][1] + p[i][1]) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

function polyArea(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
}

function trace(ctx, pts, closed) {
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (closed) ctx.closePath();
}
