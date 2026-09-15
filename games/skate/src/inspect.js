/* inspect.js — a pin board for talking about places in a level.
 *
 * WHY. Half of what is left to do on this port is about SPOTS: which ramp the
 * skater sticks on, where the letters should go, which doorway is the one that
 * ought to open. Describing one of those in words is hopeless ("the big bank
 * near the start, past the second rail") and a screenshot only says roughly
 * where the camera was. This turns a click into a set of numbers — where in the
 * level, what is under the cursor, what the collision there thinks it is — and
 * puts them on the clipboard, so a spot can be pasted into a conversation and
 * meant exactly.
 *
 * It is a developer tool and it says so: nothing is on until I is pressed.
 */
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);

export class Inspector {
  constructor(game) {
    this.game = game;
    this.on = false;
    this.pins = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 400;
    this.markers = new THREE.Group();
    this.markers.name = 'InspectPins';
    this.panel = null;
    this.overlay = null;          // the collision soup, drawn
    this.overlayFor = null;       // which level it was built from
    this.overlayMode = 0;         // 0 off, 1 outline over the level, 2 collision alone
    this._wasVisible = null;      // what mode 2 hid, so it can be put back
  }

  attach() {
    const canvas = this.game.el.canvas;
    addEventListener('keydown', (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      if (e.code === 'KeyI') { this.toggle(); return; }
      if (e.code === 'KeyO') { this.cycleOverlay(); return; }
      if (!this.on) return;
      if (e.code === 'KeyC') this.copy();
      if (e.code === 'KeyX') this.clear();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.on || e.button !== 0) return;
      e.preventDefault();
      this.pick(e.clientX, e.clientY);
    });
  }

  toggle() {
    this.on = !this.on;
    if (this.on) {
      this.game.scene.add(this.markers);
      this._panel();
    } else if (this.panel) {
      this.panel.remove(); this.panel = null;
    }
    this._render();
  }

  /**
   * Draw what the skater can actually touch.
   *
   * A converted level has two versions of itself — the one you look at and the
   * one you collide with — and every awkward bug in this port so far has been a
   * disagreement between them. Floor you fall through is a hole in the green;
   * scenery you ride on air over is green where nothing is drawn; a bank that
   * behaves like a wall is red where you expected green. Showing the collision
   * over the level answers all three by looking.
   *
   * Wireframe first, because it reads over the top of the level; press again
   * for solid, which is easier to judge coverage from; again to turn it off.
   */
  cycleOverlay() {
    const g = this.game;
    if (!g.level) return;
    this.overlayMode = (this.overlayMode + 1) % 3;
    if (this.overlayFor !== g.levelId) this._buildOverlay();
    if (!this.overlay) return;

    const mode = this.overlayMode;
    this.overlay.visible = mode > 0;
    for (const m of this.overlay.children) {
      /* mode 1 lays the outline over the level you can see; mode 2 takes the
         level away and leaves the collision standing on its own, solid and
         still showing every triangle */
      if (m.userData.edges) {
        m.visible = mode > 0;
        /* over the level the outline wants to be the group's own colour; on top
           of the group's own fill it has to be the opposite, or the triangles
           disappear into what they are drawn on */
        m.material.color.setHex(mode === 2 ? 0x101820 : m.userData.tint);
        m.material.opacity = mode === 2 ? 0.55 : 0.9;
      } else m.visible = mode === 2;
    }
    this._hideLevel(mode === 2);

    if (this.panel) this._render();
    else if (mode) this._legend();
  }

  /**
   * Take the level away so the collision can be seen on its own.
   *
   * Not a material swap — every drawn mesh in a converted level carries its own
   * material, so swapping them means keeping a map of a hundred and fifty of
   * them and putting them all back. Hiding is the same picture and cannot leave
   * anything behind. The rails stay: they are the one bit of scenery worth
   * having as a landmark while you look at a wireframe.
   */
  _hideLevel(hide) {
    const g = this.game;
    if (!g.level) return;
    if (hide && !this._wasVisible) {
      this._wasVisible = [];
      g.level.root.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        if (/_Rail_/.test(o.name)) return;
        this._wasVisible.push(o);
        o.visible = false;
      });
      if (g.apron) { g.apron.visible = false; this._apronHidden = true; }
    } else if (!hide && this._wasVisible) {
      for (const o of this._wasVisible) o.visible = true;
      this._wasVisible = null;
      if (this._apronHidden) { if (g.apron) g.apron.visible = true; this._apronHidden = false; }
    }
  }

  _buildOverlay() {
    const g = this.game;
    if (this.overlay) { this._disposeOverlay(); }
    const colours = { floor: 0x2fd46b, wall: 0xff4d4d, pipe: 0x4d9bff };
    const by = { floor: [], wall: [], pipe: [] };
    for (const t of g.level.world.tris) {
      const l = by[t.group];
      if (!l) continue;
      l.push(t.a.x, t.a.y, t.a.z, t.b.x, t.b.y, t.b.z, t.c.x, t.c.y, t.c.z);
    }
    const group = new THREE.Group();
    group.name = 'CollisionOverlay';
    for (const k in by) {
      if (!by[k].length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(by[k], 3));
      geo.computeVertexNormals();

      /* the filled plane — flat colour, no texture, nothing to read but shape */
      const solid = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: colours[k], side: THREE.DoubleSide
      }));
      solid.name = 'Collision_' + k;
      solid.renderOrder = 900;

      /* and its triangles over the top, dark enough to read against the fill */
      const edges = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: colours[k], wireframe: true, transparent: true, opacity: 0.9,
        side: THREE.DoubleSide, depthWrite: false
      }));
      edges.name = 'CollisionEdges_' + k;
      edges.renderOrder = 901;
      edges.userData.edges = true;
      edges.userData.tint = colours[k];

      group.add(solid, edges);
    }
    g.scene.add(group);
    this.overlay = group;
    this.overlayFor = g.levelId;
  }

  _disposeOverlay() {
    if (!this.overlay) return;
    this._hideLevel(false);
    this.game.scene.remove(this.overlay);
    const done = new Set();
    for (const m of this.overlay.children) {
      if (!done.has(m.geometry)) { m.geometry.dispose(); done.add(m.geometry); }
      m.material.dispose();
    }
    this.overlay = null;
    this.overlayFor = null;
  }

  _legend() {
    if (this.panel) return;
    this.toggle();               // the panel carries the legend, so bring it up
  }

  /**
   * What is under the cursor?
   *
   * Two questions, two answers, because they are different things. The drawn
   * mesh says what you are LOOKING at — a texture group, which is as close to
   * "that building" as a converted level gets. The collision world says what
   * the skater would MEET there, and that is the one that matters when the
   * complaint is that a surface behaves wrongly: a wall you can see may be
   * floor to the physics, or nothing at all.
   */
  pick(clientX, clientY) {
    const g = this.game;
    if (!g.level) return;
    const r = g.el.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1
    );
    this.ray.setFromCamera(ndc, g.camera);

    const drawn = [];
    g.level.root.traverse((o) => { if (o.isMesh && o.visible && !/_Col_/.test(o.name)) drawn.push(o); });
    const seen = this.ray.intersectObjects(drawn, false)[0] || null;

    const dir = this.ray.ray.direction.clone().normalize();
    const from = this.ray.ray.origin.clone();
    const solid = g.level.world.probe(from, dir, this.ray.far);

    /* whichever is nearer is the thing the cursor is actually on */
    const useSolid = solid && (!seen || solid.distance <= seen.distance + 0.05);
    const point = useSolid ? solid.point.clone() : (seen ? seen.point.clone() : null);
    if (!point) return;

    const pin = {
      n: this.pins.length + 1,
      level: g.levelId,
      at: point,
      mesh: seen ? seen.object.name : null,
      seenDist: seen ? +seen.distance.toFixed(1) : null,
      group: solid ? solid.group : null,
      normal: solid ? solid.normal.clone() : null,
      solidDist: solid ? +solid.distance.toFixed(1) : null
    };

    /* the face you are looking at, when nothing collides there — which is worth
       knowing on its own: drawn and not solid is a real answer */
    if (!solid && seen && seen.face && seen.object) {
      pin.drawnNormal = seen.face.normal.clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(seen.object.matrixWorld)).normalize();
    }

    /* how high is this above whatever is under it, and what is that? 60 m, not
       200: probe() widens its broadphase query with the distance, and a query
       the height of the level walks a hundred thousand empty grid cells. */
    const below = g.level.world.probe(point.clone().addScaledVector(DOWN, -0.05), DOWN, 60);
    pin.above = below ? +(point.y - below.point.y).toFixed(2) : null;
    pin.floorGroup = below ? below.group : null;

    /* the nearest rail, because most of what we discuss is grindable or not */
    let bestRail = null, bestD = Infinity;
    for (const path of g.level.paths || []) {
      path.closestOffset(point);
      if (path.lastDistance < bestD) { bestD = path.lastDistance; bestRail = path; }
    }
    pin.rail = bestRail ? { name: bestRail.name, away: +bestD.toFixed(1) } : null;

    /* the nearest thing the level has scattered, so "next to the second letter"
       is a thing that can be said */
    let prop = null, propD = Infinity;
    for (const [kind, list] of [['letter', g.def && g.def.letters], ['barrel', g.def && g.def.barrels]]) {
      for (const q of list || []) {
        const v = q.isVector3 ? q : new THREE.Vector3(q[0], q[1], q[2]);
        const d = v.distanceTo(point);
        if (d < propD) { propD = d; prop = kind; }
      }
    }
    if (prop) pin.prop = { kind: prop, away: +propD.toFixed(1) };

    /* and where the skater is, so "over there" has a direction */
    if (g.ctrl && g.ctrl.body) {
      const d = point.clone().sub(g.ctrl.body.position);
      pin.fromSkater = +d.length().toFixed(1);
    }

    this.pins.push(pin);
    this._marker(pin);
    this._render();
    console.log('[pin ' + pin.n + ']', this.line(pin));
  }

  /** One pin as one line of text, which is the thing that gets pasted. */
  line(p) {
    const bits = [
      '#' + p.n,
      p.level,
      'at ' + p.at.x.toFixed(1) + ',' + p.at.y.toFixed(1) + ',' + p.at.z.toFixed(1)
    ];
    if (p.mesh) bits.push('mesh ' + p.mesh);
    if (p.group) bits.push('collision ' + p.group +
      (p.normal ? ' n.y ' + p.normal.y.toFixed(2) : ''));
    else bits.push('NO collision' + (p.drawnNormal ? ' (drawn n.y ' + p.drawnNormal.y.toFixed(2) + ')' : ''));
    if (p.above != null) bits.push(p.above.toFixed(1) + 'm above ' + (p.floorGroup || 'nothing'));
    if (p.rail) bits.push('rail ' + p.rail.name + ' ' + p.rail.away + 'm away');
    if (p.prop) bits.push('nearest ' + p.prop.kind + ' ' + p.prop.away + 'm');
    if (p.fromSkater != null) bits.push(p.fromSkater + 'm from skater');
    return bits.join(' | ');
  }

  text() {
    if (!this.pins.length) return '';
    return this.pins.map((p) => this.line(p)).join('\n');
  }

  copy() {
    const t = this.text();
    if (!t) return;
    const done = () => { this._flash('copied ' + this.pins.length + ' pin(s)'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, () => this._fallbackCopy(t, done));
    } else this._fallbackCopy(t, done);
  }

  _fallbackCopy(t, done) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { this._flash('copy blocked — select the text'); }
    ta.remove();
  }

  clear() {
    this.pins.length = 0;
    while (this.markers.children.length) {
      const m = this.markers.children.pop();
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    }
    this._render();
  }

  /* a pin you can see through the level, because half of them are behind something */
  _marker(pin) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3bd0, depthTest: false, transparent: true, opacity: 0.95 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat);
    ball.position.copy(pin.at);
    ball.renderOrder = 999;
    /* short enough to find from across the park, short enough not to be in the
       way of the thing it is pointing at */
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), mat);
    stick.position.copy(pin.at).y += 0.8;
    stick.renderOrder = 999;
    this.markers.add(ball, stick);
  }

  _panel() {
    const el = document.createElement('div');
    el.id = 'inspect';
    el.innerHTML = '<b>PIN MODE</b> — click the level to drop a pin · <b>C</b> copy · <b>X</b> clear · <b>I</b> off'
      + '<div id="inspectLegend"></div><div id="inspectList"></div>';
    document.body.appendChild(el);
    this.panel = el;
  }

  _flash(msg) {
    if (!this.panel) return;
    const b = this.panel.querySelector('b');
    const was = b.textContent;
    b.textContent = msg.toUpperCase();
    setTimeout(() => { if (b) b.textContent = was; }, 1400);
  }

  _render() {
    if (!this.panel) return;
    const leg = this.panel.querySelector('#inspectLegend');
    if (leg) {
      const names = ['off', 'outline over the level', 'collision only, no textures'];
      leg.innerHTML = '<b>O</b> collision overlay: ' + names[this.overlayMode]
        + (this.overlayMode
          ? ' &nbsp; <span class="sw f"></span>floor <span class="sw w"></span>wall <span class="sw p"></span>pipe'
          : '');
    }
    const list = this.panel.querySelector('#inspectList');
    list.innerHTML = this.pins.length
      ? this.pins.map((p) => '<div class="pinRow">' + this.line(p).replace(/</g, '&lt;') + '</div>').join('')
      : '<div class="pinRow dim">no pins yet</div>';
  }
}
