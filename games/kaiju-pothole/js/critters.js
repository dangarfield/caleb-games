// People and animals: they wander, and scramble clear of any hole. Nothing alive is ever swallowed.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { critterLod } from './lod.js';

const clipOf = (clips, names) => { for (const n of names) { const c = clips.find(c => c.name === n || c.name.endsWith('|' + n) || c.name.toLowerCase() === n.toLowerCase()); if (c) return c; } return null; };
const SOUND = { animal_pig: 'oink', animal_cat: 'meow', animal_hen: 'chick', animal_chick: 'chick' };

export class Critters {
  constructor(scene) { this.scene = scene; this.list = []; this.group = new THREE.Group(); scene.add(this.group); }
  clear() { this.scene.remove(this.group); this.group = new THREE.Group(); this.scene.add(this.group); this.list = []; }
  spawn(src, x, z, area, opts = {}) {
    if (!src) return;
    const obj = SkeletonUtils.clone(src.scene); obj.position.set(x, 0, z); obj.rotation.y = Math.random() * 6.28;
    if (opts.scale) obj.scale.setScalar(opts.scale);
    this.group.add(obj);
    const mixer = new THREE.AnimationMixer(obj), c = src.clips;
    const acts = {}; for (const [k, names] of Object.entries({ idle: ['Idle'], walk: ['Walk', 'WalkSlow'], run: ['Run', 'Walk', 'Jump'], jump: ['Jump'], win: ['Victory', 'Jump', 'Idle'] })) { const cl = clipOf(c, names); if (cl) acts[k] = mixer.clipAction(cl); }
    const e = src.entry, cr = { obj, mixer, acts, cur: null, area, id: e.id, rad: Math.max(e.w, e.d) * (opts.scale || 1) / 2, speed: e.id.startsWith('person') ? 1.4 : 1, tx: x, tz: z, wait: Math.random() * 3, fleeing: 0, sound: SOUND[e.id] || (e.id.startsWith('animal') ? 'boing' : null), bob: !c.length };
    this.play(cr, 'idle'); this.list.push(cr);
  }
  play(cr, k) { const a = cr.acts[k] || cr.acts.idle; if (!a || cr.cur === a) return; a.reset().fadeIn(0.15).play(); if (cr.cur) cr.cur.fadeOut(0.15); cr.cur = a; }
  cheer() { for (const cr of this.list) { cr.fleeing = 0; cr.won = true; this.play(cr, 'win'); } }
  update(dt, holes, cam, bounds, onSound, world) {
    for (const cr of this.list) {
      const p = cr.obj.position, near = Math.hypot(p.x - cam.x, p.z - cam.z) < cam.range;
      let threat = null, td = 1e9;
      for (const h of holes) { if (!h.active) continue; const d = Math.hypot(p.x - h.x, p.z - h.z) - h.r; if (d < td) { td = d; threat = h; } }
      if (cr.won) { const shown = near && (!this.camera || critterLod(cr, this.camera)); if (shown) cr.mixer.update(dt); cr.obj.visible = shown; continue; }
      if (threat && td < 3 + threat.r * 0.4) {
        if (!cr.fleeing && near && cr.sound) onSound(cr.sound, cr);
        cr.fleeing = 1.2;
        let dx = p.x - threat.x, dz = p.z - threat.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const sp = (cr.speed * 3.6 + threat.r * 0.8) * dt; p.x += dx * sp; p.z += dz * sp; cr.obj.rotation.y = Math.atan2(dx, dz);
        const min = threat.r + cr.rad + 0.35; if (l < min) { p.x = threat.x + dx * min; p.z = threat.z + dz * min; }
        this.play(cr, td < 1 && cr.acts.jump ? 'jump' : 'run');
      } else if (cr.fleeing > 0) { cr.fleeing -= dt; if (cr.fleeing <= 0) { cr.tx = p.x; cr.tz = p.z; cr.wait = 1; } }
      else if (cr.wait > 0) { cr.wait -= dt; this.play(cr, 'idle'); if (cr.wait <= 0) { const a = cr.area; for (let t = 0; t < 5; t++) { if (a.pick) [cr.tx, cr.tz] = a.pick(); else { cr.tx = a.x + Math.random() * a.w; cr.tz = a.z + Math.random() * a.d; } if (!world || world.clearAt(cr.tx, cr.tz, cr.rad)) break; } } }
      else {
        const dx = cr.tx - p.x, dz = cr.tz - p.z, l = Math.hypot(dx, dz);
        if (l < 0.3) cr.wait = 1 + Math.random() * 4;
        else { const sp = Math.min(l, cr.speed * dt), nx = p.x + dx / l * sp, nz = p.z + dz / l * sp;
          if (near && world && !world.clearAt(nx + dx / l * cr.rad, nz + dz / l * cr.rad, cr.rad * 0.5)) cr.wait = 0.3 + Math.random();
          else { p.x = nx; p.z = nz; cr.obj.rotation.y = Math.atan2(dx, dz); this.play(cr, 'walk'); } }
      }
      if (bounds) { p.x = Math.max(bounds.minX, Math.min(bounds.maxX, p.x)); p.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, p.z)); }
      // drawn only when near enough to see (lod.js swaps in a simplified mesh further out and hides tiny ones)
      const shown = near && (!this.camera || critterLod(cr, this.camera));
      if (shown) { cr.mixer.update(dt); if (cr.bob) p.y = cr.fleeing > 0 ? Math.abs(Math.sin(performance.now() / 90)) * 0.15 : 0; }
      cr.obj.visible = shown;
    }
  }
}
