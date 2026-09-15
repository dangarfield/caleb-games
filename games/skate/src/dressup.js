/* dressup.js — the colour picker's little skater.
 *
 * A second, much smaller renderer showing the character standing on the spot
 * so you can see what a colour actually looks like on him before you keep it.
 *
 * It is deliberately its own renderer on its own canvas rather than a corner
 * of the game's. The game's renderer is set up for a park — its size, its
 * pixel ratio, its shadow map and its animation loop all belong to that — and
 * borrowing it would mean tearing all of that down and putting it back every
 * time the panel opens. A 260x300 canvas with one light and one model costs
 * almost nothing, and it can be thrown away when the panel closes.
 *
 * The model is a SECOND copy of the glb rather than the one being skated,
 * because that one is parented into the park, posed by the physics every frame
 * and mid-trick as often as not. This one only ever stands still.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IDLE = ['Idle_Stand', 'Idle'];      // in order of preference
const SPIN = 0.38;                        // radians a second — slow enough to judge a colour by

export class DressUp {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {function} asset   turns 'SK_char.glb' into a URL
   * @param {function} dress   (root, skater) => void — the game's own painter
   */
  constructor(canvas, asset, dress) {
    this.canvas = canvas;
    this.asset = asset;
    this.dress = dress;
    this.ready = false;
    this.running = false;
    this.skater = null;
  }

  async _build() {
    if (this.ready || this.building) return this.building;
    this.building = (async () => {
      const gltf = await new GLTFLoader().loadAsync(this.asset('SK_char.glb'));
      this.model = gltf.scene;

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas, antialias: true, alpha: true
      });
      this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      this.renderer.setSize(this.canvas.clientWidth || 260,
                            this.canvas.clientHeight || 300, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(1.6, 2.4, 1.8);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xa29bfe, 0.9);
      rim.position.set(-2, 1, -1.5);
      this.scene.add(rim);

      this.turn = new THREE.Group();
      /* The model faces away from the camera in its rest pose — which is
         right in the game, where you are behind him, and wrong here. Turn him
         round to face out, then a few degrees off square so he reads as
         three-dimensional rather than as a flat front-on cut-out. */
      this.turn.rotation.y = Math.PI - 0.45;
      this.turn.add(this.model);
      this.scene.add(this.turn);

      /* frame him: measure rather than guess, so a re-export still fits */
      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());
      const mid = box.getCenter(new THREE.Vector3());
      this.model.position.y -= box.min.y;          // stand him on zero
      /* Frame him head to toe with a little air, from slightly above eye
         level. The bounding box includes the board, which is wider than he
         is, so the height is what the framing is built on. */
      const h = Math.max(size.y, 0.001);
      this.camera = new THREE.PerspectiveCamera(
        30, (this.canvas.clientWidth || 260) / (this.canvas.clientHeight || 300), 0.05, 40);
      this.camera.position.set(0, h * 0.62, h * 1.95);
      this.camera.lookAt(0, h * 0.47, 0);

      this.mixer = new THREE.AnimationMixer(this.model);
      const byName = new Map(gltf.animations.map((c) => [c.name, c]));
      const clip = IDLE.map((n) => byName.get(n)).find(Boolean) || gltf.animations[0];
      if (clip) this.mixer.clipAction(clip).play();

      this.clock = new THREE.Clock();
      this.ready = true;
      if (this.skater) this.dress(this.model, this.skater);
    })();
    return this.building;
  }

  /** Show the panel's skater, building the little scene the first time. */
  async show(skater) {
    this.skater = skater;
    await this._build();
    this.dress(this.model, skater);
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();                 // drop the time spent loading
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = this.clock.getDelta();
      this.mixer.update(dt);
      this.turn.rotation.y += dt * SPIN;
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  /** Repaint without rebuilding — this runs on every drag of a colour slider. */
  recolour(skater) {
    this.skater = skater;
    if (this.ready) this.dress(this.model, skater);
  }

  /** Stop drawing, but keep everything so reopening is instant. */
  hide() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}
