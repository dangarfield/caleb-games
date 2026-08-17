// First-person hand holding the chosen stone. Parented to the camera so it
// always sits in the corner of the view; the draw-back is what makes the power
// gauge readable without looking at the gauge.

import * as THREE from 'three';
import { lerp, sat, easeOut } from './util.js';

// Kept inside the frustum on purpose. FOV is 58 deg vertical, so on a portrait
// tablet the horizontal half-angle is only ~23 deg: anything wider than about
// x/|z| = 0.4 swings out of view and the player loses the draw-back read.
const REST = new THREE.Vector3(0.26, -0.30, -0.86);
const DRAWN = new THREE.Vector3(0.17, -0.22, -0.54);
const THROWN = new THREE.Vector3(-0.02, -0.05, -1.75);

// Direction from the fist towards the (off-screen) elbow. The frustum bottom at
// the rest depth is only ~0.14 m below the fist, so the forearm must leave the
// view quickly: what sells it is the cuff right at the wrist, which is always in
// frame, plus the first ~0.2 m of sleeve before it clips.
const ELBOW = new THREE.Vector3(0.55, -0.66, 0.51).normalize();
const UP = new THREE.Vector3(0, 1, 0);

export function createHand(camera) {
  const group = new THREE.Group();
  group.name = 'hand';
  group.visible = false;          // hidden until a rock is in hand
  camera.add(group);

  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c9a0, flatShading: true });
  const sleeve = new THREE.MeshLambertMaterial({ color: 0x6c5ce7, flatShading: true });

  // forearm + cuff, both aimed down the ELBOW axis so they read as one limb
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.092, 0.52, 7), sleeve);
  arm.quaternion.setFromUnitVectors(UP, ELBOW);
  arm.position.copy(ELBOW).multiplyScalar(0.30);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.07, 0.11, 8), sleeve);
  cuff.quaternion.copy(arm.quaternion);
  cuff.position.copy(ELBOW).multiplyScalar(0.075);
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.082, 8, 6), skin);
  fist.scale.set(1, 0.92, 1.05);
  // Curled fingers across the front of the fist and a thumb pressing in from the
  // camera side: together they read as "pinching the stone" instead of "ball with
  // a rock balanced on it". Local -z points away from the eye.
  const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.085, 3, 6), skin);
  fingers.position.set(0.0, 0.048, -0.052);
  fingers.rotation.set(0.25, 0, Math.PI / 2);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.023, 0.062, 3, 6), skin);
  thumb.position.set(-0.052, 0.052, -0.012);
  thumb.rotation.set(-0.55, 0, 0.75);
  group.add(arm, cuff, fist, fingers, thumb);

  const holder = new THREE.Group();
  holder.name = 'stoneHolder';        // verification reads its spin from here
  group.add(holder);

  // --- hats (shop cosmetics) -------------------------------------------------
  // First person, so what you actually see of your own hat is the front of the
  // brim peeking in at the very top of the view. Parented to the CAMERA (not the
  // hand) so it stays put while you throw.
  //
  // Sizing is measured, not guessed: the brim's far edge lands near z = -1.03,
  // where the frustum half-height is 1.03*tan(29 deg) = 0.57. Sitting the rig at
  // y = 0.55 with only a 0.18 rad tip leaves the lowest point of the brim at
  // ~0.51, i.e. it eats about 5% of the screen height. (At y = 0.455 / 0.34 rad
  // the wizard brim swallowed a fifth of the view, which reviewers rightly
  // called out as occlusion.)
  const hatRig = new THREE.Group();
  hatRig.position.set(0, 0.55, -0.80);
  hatRig.rotation.x = -0.18;              // front edge tips down towards you
  hatRig.visible = false;
  camera.add(hatRig);
  let hatKind = '';
  // hard override used by the map view (see setHidden)
  let hidden = false;

  function buildHat(kind) {
    while (hatRig.children.length) {
      const c = hatRig.children.pop();
      c.geometry.dispose();
    }
    if (!kind) return;
    const brimGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.022, 22, 1, false, -Math.PI * 0.55, Math.PI * 1.1);
    if (kind === 'cap') {
      const brim = new THREE.Mesh(brimGeo, new THREE.MeshLambertMaterial({
        color: 0x6c5ce7, flatShading: true, side: THREE.DoubleSide,
      }));
      brim.scale.set(1, 1, 0.62);
      hatRig.add(brim);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
        new THREE.MeshLambertMaterial({ color: 0x5a4bd6, flatShading: true })
      );
      dome.position.set(0, 0.02, 0.06);
      dome.scale.set(1, 0.6, 1);
      hatRig.add(dome);
    } else if (kind === 'crown') {
      const gold = new THREE.MeshLambertMaterial({
        color: 0xffd32a, flatShading: true, emissive: 0x8a6a00, emissiveIntensity: 0.35,
      });
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.075, 18, 1, true, -Math.PI * 0.6, Math.PI * 1.2), gold
      );
      band.position.y = 0.01;
      hatRig.add(band);
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5), gold);
        spike.position.set(Math.sin(a) * 0.3, -0.06, Math.cos(a) * 0.3);
        spike.rotation.x = Math.PI;         // points down into view
        hatRig.add(spike);
      }
    } else if (kind === 'wizard') {
      const brim = new THREE.Mesh(brimGeo, new THREE.MeshLambertMaterial({
        color: 0x3b2f7a, flatShading: true, side: THREE.DoubleSide,
      }));
      // the widest brim in the shop, so it gets the shallowest one (z = 0.7)
      brim.scale.set(1.05, 1, 0.7);
      hatRig.add(brim);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.26, 0.5, 9),
        new THREE.MeshLambertMaterial({ color: 0x4c3ca0, flatShading: true })
      );
      cone.position.set(0, 0.24, 0.05);
      hatRig.add(cone);
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.045, 0),
        new THREE.MeshLambertMaterial({
          color: 0xffd32a, flatShading: true, emissive: 0x8a6a00, emissiveIntensity: 0.5,
        })
      );
      star.position.set(0.0, 0.04, -0.2);
      hatRig.add(star);
    }
  }

  function setHat(kind) {
    const k = ['cap', 'crown', 'wizard'].includes(kind) ? kind : '';
    if (k === hatKind) return;
    hatKind = k;
    buildHat(k);
    hatRig.visible = !!k && !hidden;
  }

  /**
   * Hard override for the map view: your own arm and hat brim are parented to the
   * camera, so without this a giant fist would hover over the lake from 400 m up.
   * update() re-decides group.visible every frame, so it has to check this too.
   */
  function setHidden(v) {
    hidden = !!v;
    if (hidden) { group.visible = false; hatRig.visible = false; }
    else hatRig.visible = !!hatKind;
  }

  let rockMesh = null;
  let phase = 'idle';
  let releaseT = 0;
  let bob = 0;

  function setRock(mesh) {
    if (rockMesh) holder.remove(rockMesh);
    rockMesh = mesh;
    if (rockMesh) {
      // pinched at the top of the fist, between the fingers and the thumb. It has
      // to sit above the fist silhouette (radius 0.082) or the sphere hides it.
      rockMesh.position.set(0.004, 0.088, -0.022);
      rockMesh.rotation.set(0.35, 0, 0.18);
      holder.add(rockMesh);   // size is normalised by rocks.makeHandVisual()
    }
  }

  function release() { phase = 'throw'; releaseT = 0; }
  function reset() { phase = 'idle'; releaseT = 0; group.visible = true; }
  function setVisible(v) { group.visible = v; }

  /**
   * @param draw 0..1 wind-up amount
   * @param state throw-controller state
   */
  /**
   * The rest pose was tuned for a tablet (aspect ~0.70). On a narrow phone the
   * frustum is only +-0.22 m wide at the hand's depth, so the same offset would
   * push the whole hand off the right edge: squeeze it in on narrow screens.
   */
  function lateral() {
    return Math.min(1, Math.max(0.6, (camera.aspect || 0.7) / 0.7));
  }

  function update(dt, draw, state, t) {
    if (hidden) { group.visible = false; hatRig.visible = false; return; }
    bob += dt;
    if (state === 'flight' || state === 'result') {
      if (phase !== 'throw') { phase = 'throw'; releaseT = 0; }
    } else if (state === 'idle') {
      phase = 'idle';
    }

    if (phase === 'throw') {
      releaseT += dt;
      const u = sat(releaseT / 0.26);
      group.position.copy(DRAWN).lerp(THROWN, easeOut(u));
      group.position.x *= lateral();
      group.rotation.set(lerp(-0.35, 0.5, u), lerp(0.5, -0.25, u), lerp(0.3, -0.5, u));
      if (rockMesh) rockMesh.visible = releaseT < 0.06;
      group.visible = releaseT < 0.34;
      return;
    }

    group.visible = !!rockMesh;
    if (rockMesh) rockMesh.visible = true;
    const d = sat(draw);
    group.position.copy(REST).lerp(DRAWN, d);
    group.position.x *= lateral();
    group.position.y += Math.sin(bob * 1.7) * 0.012 * (1 - d);
    group.position.x += Math.sin(bob * 1.1) * 0.008 * (1 - d);
    group.rotation.set(lerp(0.05, -0.35, d), lerp(-0.1, 0.5, d), lerp(0, 0.3, d));
    // same direction the stone will spin once it leaves the hand (see
    // skip-physics spinRoll): turning it the other way looked like backspin
    holder.rotation.y -= dt * (0.4 + d * 2.2);
  }

  return {
    group, setRock, release, reset, setVisible, update, setHat, setHidden,
    get hat() { return hatKind; },
    get hidden() { return hidden; },
  };
}
