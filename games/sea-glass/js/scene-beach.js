// The beach: sky/env, sea with a lapping foam line, damp sand, the bounded
// combing pit and its border stones. One scene reused for every beach — a
// beach swap just re-tints the materials and swaps the environment map.

import * as THREE from 'three';
import {
  makeEnvironment, sandTexture, shingleTexture, stoneBedTexture, glowTexture,
  pebbleGeometry, perf, STONE_VARIANT_SCALE, stoneTint,
} from './env.js';

// The combing pit, in world units. Everything else is sized off this.
// Nearly square on purpose: seen from a 62-degree pitch the depth foreshortens to
// about 0.88, so a squarish pit projects to roughly a 4:3 rectangle and fills a
// landscape tablet with very little wasted sand. (A wider pit left big empty
// bands top and bottom once the width was fitted.)
export const PIT = { w: 3.3, d: 2.9, hw: 1.65, hd: 1.45 };

/**
 * The rim around the pit: geometry shared by the collider (physics.js builds one
 * fixed body with four cuboids from this) and the visible bank (below).
 *
 * `t` is how far the frame sticks OUTWARDS from the pit edge, so the inner faces
 * land exactly on ±PIT.hw / ±PIT.hd and the dig area is untouched. `h` is the
 * collider's height — far taller than anything can be thrown, because a rim only
 * as tall as the visible bank would be a reachable ledge for a raked shard to park
 * on (at 0.9 that ledge was real, and shards ended up hovering on it outside the
 * pit). `visH` is the height of the bank you can actually see, and it is DELIBERATELY
 * tiny. At 0.135 the bank was 55px tall at the near edge on a portrait tablet: it
 * hid the whole front row of the pile, its top face projected up-screen into the far
 * pit, and its smooth lit side faces read as a wooden picture frame around the
 * shingle. At 0.055 it is a kerb — the border stones bedded along it are what the
 * eye reads as the edge, and almost nothing is occluded.
 */
export const RIM = { t: 0.26, h: 1.8, visH: 0.055 };

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);

// Steep enough that a piece of glass lying between stones is visible from above
// (a shallow, cinematic angle hides everything behind the nearest cobble), but
// not so steep that the sea and the horizon drop out of frame.
const CAM_PITCH = THREE.MathUtils.degToRad(62);
const CAM_TARGET = new THREE.Vector3(0, 0.06, -0.12);
// The camera aims slightly SHOREWARD of the pit centre, which lifts the pit up
// the frame and leaves the bottom strip for the button bar to sit over.
const LOOK_BIAS = 0.34;
// Tall screens are width-bound, so the pit cannot grow to fill the height: the
// slack has to go SOMEWHERE. Biasing the look point less on a portrait phone drops
// the pit down the frame, which moves that slack up into the water/wet sand (which
// is scenery worth seeing, and half-hidden by the HUD anyway) instead of leaving a
// dead band of dry sand under the pile.
const LOOK_BIAS_PORTRAIT = 0.16;
let lookBias = LOOK_BIAS;

const hemi = new THREE.HemisphereLight(0xcfe8ff, 0xd9c9a4, 0.62);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d8, 1.5);
sun.position.set(-3.6, 6.2, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -2.6;
sun.shadow.camera.right = 2.6;
sun.shadow.camera.top = 2.2;
sun.shadow.camera.bottom = -2.2;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 14;
sun.shadow.bias = -0.0012;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// --- sand ------------------------------------------------------------------
const sandMat = new THREE.MeshStandardMaterial({
  map: sandTexture(0xd8c9a6), roughness: 0.94, metalness: 0.0, envMapIntensity: 0.5,
});
sandMat.map.repeat.set(14, 14);

const sandPlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), sandMat);
sandPlane.rotation.x = -Math.PI / 2;
sandPlane.position.y = -0.004;
sandPlane.receiveShadow = true;
scene.add(sandPlane);

// The pit floor: a touch darker + damper so the pile reads as sitting in a scoop,
// and painted with bedded-in shingle so the gaps between the movable stones look
// like more beach rather than bare sand (see shingleTexture).
// The plane runs well past the walls so its painted edge fades out on the OPEN
// sand, not inside the pit where the stones are.
const PIT_FLOOR_W = PIT.w + 1.3;
const PIT_FLOOR_D = PIT.d + 1.3;
const pitMat = new THREE.MeshStandardMaterial({
  map: sandTexture(0xc0ae8a), roughness: 0.66, metalness: 0.0, envMapIntensity: 0.85,
});
pitMat.map.repeat.set(5, 4);
const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(PIT_FLOOR_W, PIT_FLOOR_D), pitMat);
pitFloor.rotation.x = -Math.PI / 2;
pitFloor.position.y = 0.001;
pitFloor.receiveShadow = true;
scene.add(pitFloor);

// --- sea + foam ------------------------------------------------------------
// The water line sits just far enough beyond the pit to appear as a band across
// the top of the frame. At this camera pitch the horizon is well above the frame,
// so the sea has to be brought TO the shot rather than the shot opened up to it.
const SEA_Z = -2.45;
// Foam and damp sand only need to span what is actually on screen at the water
// line (about ±5 world units, even zoomed out). They used to be 120 units wide,
// which is a lot of full-width TRANSPARENT overdraw for pixels nobody ever sees —
// and transparent fill is the single most expensive thing in this scene.
const WATER_W = 26;
const seaGeo = new THREE.PlaneGeometry(200, 190, 26, 14);

/**
 * The water used to be an untextured slab, which read as a sheet of blue card with
 * a ruled edge. This paints the near-shore band instead: a shallow-to-deep ramp
 * plus swell lines and crest glints.
 *
 * The plane is 190 deep but at this pitch the horizon is far above the frame, so
 * only the first METRE or two of water is ever on screen. The map is scaled to
 * cover SEA_BAND units and clamped in v, so the whole shallow-to-deep ramp lands
 * inside the visible strip and everything past it inherits the deep row. Every x term is an
 * integer number of cycles across the canvas so the horizontal repeat is seamless.
 * Kept near-neutral in luminance because seaMat.color carries the per-beach tint.
 */
const SEA_BAND = 1.6;
function waterTexture() {
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const waves = [];
  for (let i = 0; i < 7; i++) {
    waves.push({
      n: 1 + Math.floor(Math.random() * 5),
      amp: 0.028 + Math.random() * 0.055,
      ph: Math.random() * 6.283,
      ky: 3 + Math.random() * 9,
    });
  }
  for (let y = 0; y < H; y++) {
    // Canvas bottom row is v=0, which after the -90° rotation is the SHORE edge.
    const v = 1 - y / (H - 1);
    const base = 1.26 - 0.52 * Math.min(1, v * 1.15);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      let s = 0;
      for (const w of waves) s += w.amp * Math.sin(u * w.n * 6.283 + w.ph + v * w.ky);
      // Long swell lines running parallel to the beach, bent a little by u.
      s += 0.055 * Math.sin(v * 41 + 0.7 * Math.sin(u * 2 * 6.283));
      // Crest glints: sharp, and only where the water is shallow.
      const cr = Math.pow(Math.max(0, Math.sin(v * 27 + Math.sin(u * 3 * 6.283) * 1.5)), 8);
      const lum = Math.max(0.34, base + s + cr * 0.34 * (1 - v));
      const q = Math.min(215, lum * 176);
      const px = (y * W + x) * 4;
      img.data[px] = q * (1 - 0.2 * v);       // shallows warmer/greener,
      img.data[px + 1] = q * (1 - 0.05 * v);  // deep water bluer
      img.data[px + 2] = Math.min(255, q * (0.9 + 0.16 * v));
      img.data[px + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(6, 190 / SEA_BAND);
  return t;
}
const waterTex = waterTexture();

/**
 * The water's shore edge is a straight geometric edge, and left opaque it reads as
 * a ruled line across the beach. This ramp fades the last SEA_FADE units of water
 * out over the damp sand and bites a wandering scallop out of it, so the sea ends
 * in a shallow wet fringe instead. Clamped in v: past the fade the sea is solid.
 */
const SEA_FADE = 0.85;
function seaEdgeAlpha() {
  const W = 128, H = 64;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Canvas BOTTOM row is v=0, which after the -90° rotation is the shore edge.
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0.0, '#000000');
  grad.addColorStop(0.3, '#9a9a9a');
  grad.addColorStop(0.72, '#ffffff');
  grad.addColorStop(1.0, '#ffffff');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < W; x += 2) {
    // Integer cycle counts across the canvas keep the repeat seamless.
    const bite = 15 + Math.sin((x / W) * 6.283 * 3) * 9 + Math.sin((x / W) * 6.283 * 7 + 1.4) * 5;
    g.fillStyle = 'rgba(0,0,0,0.92)';
    g.fillRect(x, H - bite, 2, bite);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  // ~1.4 world units per scallop cycle across the shoreline.
  t.repeat.set(200 / 4.2, 190 / SEA_FADE);
  return t;
}
const seaMat = new THREE.MeshStandardMaterial({
  color: 0x4f9cc4, roughness: 0.2, metalness: 0.0, envMapIntensity: 1.5,
  map: waterTex, alphaMap: seaEdgeAlpha(), transparent: true, opacity: 0.96,
});
const sea = new THREE.Mesh(seaGeo, seaMat);
sea.rotation.x = -Math.PI / 2;
// Sits clear of the sand plane. The swell displacement below is kept strictly
// POSITIVE for the same reason: when the troughs dipped under the sand plane the
// water was occluded in huge diagonal stripes across the top of the frame.
sea.position.set(0, 0.03, SEA_Z - 95);
scene.add(sea);
const seaBase = Float32Array.from(seaGeo.attributes.position.array);

function foamTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  for (let i = 0; i < 380; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 64;
    const r = 2 + Math.random() * 10;
    // Foam only occupies a 40px band at the top of the frame, so it has to be
    // properly white to read at all: at half these alphas it was a faint haze.
    const a = 0.3 + Math.random() * 0.6;
    const edge = 1 - Math.abs(y - 30) / 34;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${a * edge})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3.4, 1);
  return t;
}
const foamTex = foamTexture();
const foamMat = new THREE.MeshBasicMaterial({
  map: foamTex, transparent: true, depthWrite: false, opacity: 0.9,
});
const FOAM_Z = SEA_Z + 0.2;
// The wash must never reach the pit: foam is a flat plane at y=0.02, so if its
// leading edge crosses the pit edge it paints white between the pebbles. It now
// stops at the seaward foot of the rim bank, which is a believable place for a
// wave to die and hides the plane's edge behind solid geometry.
const FOAM_FRONT_MAX = -(PIT.hd + RIM.t);
const FOAM_BASE_DEPTH = 0.9;
const foam = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, FOAM_BASE_DEPTH), foamMat);
foam.rotation.x = -Math.PI / 2;
foam.position.set(0, 0.02, FOAM_Z);
scene.add(foam);

// A thin bright line right on the leading edge — this is what actually sells
// "the water just rushed up the sand", far more than moving the whole band does.
const foamEdgeMat = new THREE.MeshBasicMaterial({
  map: foamTex, transparent: true, depthWrite: false, opacity: 0,
  blending: THREE.AdditiveBlending,
});
const foamEdge = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, 0.16), foamEdgeMat);
foamEdge.rotation.x = -Math.PI / 2;
foamEdge.position.set(0, 0.024, FOAM_Z);
scene.add(foamEdge);

// Spent foam: lags behind the retreating water and fades out where it was left.
const spentMat = new THREE.MeshBasicMaterial({
  map: foamTex, transparent: true, depthWrite: false, opacity: 0,
});
const spentFoam = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, 0.34), spentMat);
spentFoam.rotation.x = -Math.PI / 2;
spentFoam.position.set(0, 0.018, FOAM_Z);
scene.add(spentFoam);

/**
 * Surf at the water line itself. Without it the sea ends on the sand in a ruled
 * line: this is a band lying just SEAWARD of that edge whose alpha is strongest at
 * the shore and fades out to sea, so the join becomes a broken foamy fringe.
 */
function surfAlpha() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  // v=1 (canvas top) is the seaward end of this band, v=0 sits on the water line.
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.0, '#000000');
  grad.addColorStop(0.42, '#3a3a3a');
  grad.addColorStop(0.86, '#ffffff');
  grad.addColorStop(1.0, '#d2d2d2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  // Break the band up so the fringe is scalloped rather than a soft ribbon.
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 128; x += 2) {
    const bite = 11 + Math.sin(x * 0.11) * 8 + Math.sin(x * 0.37 + 2.1) * 5;
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillRect(x, 64 - bite, 2, bite);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(2.3, 1);
  return t;
}
const surfMat = new THREE.MeshBasicMaterial({
  map: foamTex, alphaMap: surfAlpha(), transparent: true, depthWrite: false,
  opacity: 0.8,
});
const SURF_DEPTH = 0.8;
const SURF_Z = SEA_Z - SURF_DEPTH / 2 + 0.34;
const surf = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, SURF_DEPTH), surfMat);
surf.rotation.x = -Math.PI / 2;
surf.position.set(0, 0.042, SURF_Z);
scene.add(surf);

// Damp band from the water line up to just behind the pit's border stones. It
// must stop short of the pit or it paints a grey stripe across the pile.
// Damp sand has to come out DARKER than dry sand. A strong env reflection on a
// low-roughness plane made it brighter instead, which read as a bleached stripe.
// The grain is the same sand texture as the dry beach, cloned so it can carry its
// own repeat: a flat untextured slab read as a strip of painted cardboard laid on
// the shingle. The clone's base is deliberately near-grey, so wetMat.color alone
// decides how dark the damp sand is on each beach.
const wetTex = sandTexture(0xc8c8c8).clone();
wetTex.needsUpdate = true;
// Dry sand tiles every 90/14 = 6.4 world units; match that so the two bands share
// one grain size and the tide line does not look like a change of material.
const WET_TILE = 90 / 14;
wetTex.repeat.set(WATER_W / WET_TILE, 0.11);

/**
 * Alpha ramp for the damp band's shoreward edge. Without it the band ends in a
 * dead-straight seam right across the beach; with it the sand just gets gradually
 * drier, and the edge wanders a little.
 */
function wetEdgeAlpha() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  // Canvas top row is v=1, which after the -90° rotation is the SEAWARD edge.
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0.0, '#ffffff');
  grad.addColorStop(0.55, '#ffffff');
  grad.addColorStop(0.82, '#8a8a8a');
  grad.addColorStop(1.0, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 64);
  // Wander the dry edge so it is not a ruler line.
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 128; x += 2) {
    const bite = 8 + Math.sin(x * 0.09) * 5 + Math.sin(x * 0.31 + 1.7) * 3.5;
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fillRect(x, 64 - bite, 2, bite);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1.7, 1);
  return t;
}

const wetMat = new THREE.MeshStandardMaterial({
  color: 0xa08c68, roughness: 0.4, metalness: 0.0, envMapIntensity: 0.8,
  map: wetTex, alphaMap: wetEdgeAlpha(),
  transparent: true, opacity: 0.92,
});
const WET_BASE_DEPTH = 0.7;
const WET_BACK_Z = SEA_Z - 0.15;
const WET_FRONT_MAX = -(PIT.hd + 0.32);
const wetBand = new THREE.Mesh(new THREE.PlaneGeometry(WATER_W, WET_BASE_DEPTH), wetMat);
wetBand.rotation.x = -Math.PI / 2;
wetBand.position.set(0, 0.006, SEA_Z + 0.35);
scene.add(wetBand);

// --- the rim bank: what the containment collider looks like -----------------
// The barrier around the pit is ONE fixed body with four cuboid colliders
// (physics.js). This is its visible half: a low bank of bedded shingle around the
// pit edge — one static mesh, one draw call, no bodies at all.
//
// The geometry is built by hand rather than from four scaled boxes for one reason:
// UVs. A unit box stretched to 3.8 x 0.14 x 0.26 stretches its texture with it, and
// the bank came out as smeared toffee. Here every face carries WORLD-space UVs (the
// two axes it lies in, divided by RIM_TILE), so the shingle is the same size on the
// top as on the sides and the same size as the shingle on the pit floor.
const RIM_TILE = 1.0;    // world units per repeat of the bank's texture

function rimFrameGeometry(t, h) {
  const pos = [], nor = [], uv = [], idx = [];
  // Four boxes that TILE the frame rather than overlap it: the long sides run the
  // full outer width, the short sides fill the gap between them.
  const boxes = [
    [-(PIT.hw + t), -(PIT.hd + t), PIT.hw + t, -PIT.hd],
    [-(PIT.hw + t), PIT.hd, PIT.hw + t, PIT.hd + t],
    [-(PIT.hw + t), -PIT.hd, -PIT.hw, PIT.hd],
    [PIT.hw, -PIT.hd, PIT.hw + t, PIT.hd],
  ];
  // One quad. `u`/`v` pick which world axes become texture coordinates, so the
  // shingle never stretches with the face.
  const quad = (verts, n, ui, vi) => {
    const base = pos.length / 3;
    for (const p of verts) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(p[ui] / RIM_TILE, p[vi] / RIM_TILE);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const [x0, z0, x1, z1] of boxes) {
    // Top (the face the loose border stones bed into), then the four sides. No
    // bottom: it is flat on the sand and never seen.
    quad([[x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0]], [0, 1, 0], 0, 2);
    quad([[x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], 0, 1);
    quad([[x1, 0, z0], [x0, 0, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], 0, 1);
    quad([[x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], 2, 1);
    quad([[x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], 2, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const rimMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.6,
});
const rimBank = new THREE.Mesh(rimFrameGeometry(RIM.t, RIM.visH), rimMat);
rimBank.position.y = -0.008;      // just into the sand, so no seam at the base
rimBank.castShadow = true;
rimBank.receiveShadow = true;
scene.add(rimBank);

// --- pit border stones (static dressing, no bodies) ------------------------
const borderGeo = pebbleGeometry(0);
const borderMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.7,
});
// Dense enough to read as a continuous bedded kerb along the bank rather than a
// dotted line — one instanced mesh either way, so the extra stones are free.
const BORDER_N = 84;
const border = new THREE.InstancedMesh(borderGeo, borderMat, BORDER_N);
border.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
border.castShadow = true;
border.receiveShadow = true;
border.frustumCulled = false;
scene.add(border);

// --- scattered dry-sand stones (static dressing, no bodies) ----------------
// The background used to be identical on every visit. This is one instanced mesh
// of stones lying OUTSIDE the pit, re-laid out with a different pattern every
// section — same palette and same style, just never the same arrangement twice.
const SCATTER_N = 72;
const scatter = new THREE.InstancedMesh(pebbleGeometry(1), borderMat, SCATTER_N);
scatter.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scatter.castShadow = true;
scatter.receiveShadow = true;
scatter.frustumCulled = false;
scene.add(scatter);

// --- driftwood, shells + weed: a fixed pool, re-placed every section --------
const props = new THREE.Group();
scene.add(props);
const woodMat = new THREE.MeshStandardMaterial({ color: 0xa8977c, roughness: 0.85, envMapIntensity: 0.7 });
const shellMat = new THREE.MeshStandardMaterial({
  color: 0xf5e6d8, roughness: 0.3, envMapIntensity: 1.5, side: THREE.DoubleSide,
});
const weedMat = new THREE.MeshStandardMaterial({
  color: 0x4a5a34, roughness: 0.55, envMapIntensity: 0.9,
});
const driftLog = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 1.9, 7), woodMat);
driftLog.castShadow = true;
props.add(driftLog);
const driftStub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 6), woodMat);
driftStub.castShadow = true;
props.add(driftStub);
const shells = [];
for (let i = 0; i < 10; i++) {
  const s = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  s.castShadow = true;
  props.add(s);
  shells.push(s);
}
const weeds = [];
for (let i = 0; i < 7; i++) {
  const w = new THREE.Mesh(new THREE.SphereGeometry(0.09, 7, 5), weedMat);
  props.add(w);
  weeds.push(w);
}

// --- radar / glint sprite pool ---------------------------------------------
const glowTex = glowTexture();
const markerMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0x8ef0ff, transparent: true, opacity: 0,
  depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
});
export const markers = [];
for (let i = 0; i < 30; i++) {
  const s = new THREE.Sprite(markerMat.clone());
  s.scale.set(0.34, 0.34, 1);
  s.visible = false;
  s.renderOrder = 20;
  scene.add(s);
  markers.push(s);
}

// Radar pulse ring on the sand.
const ringMat = new THREE.MeshBasicMaterial({
  color: 0x8ef0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
});
const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 48), ringMat);
pulseRing.rotation.x = -Math.PI / 2;
pulseRing.position.y = 0.03;
pulseRing.visible = false;
scene.add(pulseRing);

// Wave-wash sweep: a foam band that crosses the pit.
const sweepMat = new THREE.MeshBasicMaterial({
  map: foamMat.map, transparent: true, opacity: 0, depthWrite: false,
});
const sweep = new THREE.Mesh(new THREE.PlaneGeometry(PIT.w + 0.8, 1.1), sweepMat);
sweep.rotation.x = -Math.PI / 2;
sweep.position.y = 0.05;
sweep.visible = false;
scene.add(sweep);

// --- collect burst particles ----------------------------------------------
const burstMat = new THREE.SpriteMaterial({
  map: glowTex, transparent: true, depthTest: false, depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const bursts = [];
for (let i = 0; i < 26; i++) {
  const s = new THREE.Sprite(burstMat.clone());
  s.visible = false;
  s.renderOrder = 22;
  scene.add(s);
  bursts.push({ sprite: s, life: 0, vel: new THREE.Vector3() });
}

export function spawnBurst(pos, colorHex, count) {
  let made = 0;
  for (const b of bursts) {
    if (b.life > 0) continue;
    b.sprite.position.copy(pos);
    b.sprite.material.color.setHex(colorHex);
    b.sprite.material.opacity = 1;
    b.sprite.scale.setScalar(0.12 + Math.random() * 0.1);
    b.sprite.visible = true;
    b.vel.set((Math.random() - 0.5) * 1.5, 0.9 + Math.random() * 1.4, (Math.random() - 0.5) * 1.5);
    b.life = 0.55 + Math.random() * 0.3;
    if (++made >= (count || 8)) break;
  }
}

function updateBursts(dt) {
  for (const b of bursts) {
    if (b.life <= 0) continue;
    b.life -= dt;
    if (b.life <= 0) { b.sprite.visible = false; continue; }
    b.vel.y -= 3.4 * dt;
    b.sprite.position.addScaledVector(b.vel, dt);
    b.sprite.material.opacity = Math.max(0, Math.min(1, b.life * 2.4));
  }
}

// --- effects state --------------------------------------------------------
let pulse = null;      // { t, dur }
let sweepFx = null;    // { t, dur }

export function startPulse(dur) { pulse = { t: 0, dur: dur || 1.2 }; }
export function startSweep(dur) { sweepFx = { t: 0, dur: dur || 1.3 }; }
export function sweepProgress() { return sweepFx ? sweepFx.t / sweepFx.dur : -1; }

// --- beach theming --------------------------------------------------------
let currentBeachId = null;

/**
 * Re-tint everything for a beach (once per beach — the PMREM bake is the single
 * most expensive thing in the game) and then lay the loose dressing out fresh.
 */
export function applyBeach(beach) {
  if (currentBeachId !== beach.id) {
    themeBeach(beach);
    currentBeachId = beach.id;
  }
  redress(beach);
}

function themeBeach(beach) {
  const envSet = makeEnvironment(beach.id, beach.seaColor, beach.hazeColor, beach.sandColor);
  scene.background = envSet.background;
  scene.environment = envSet.environment;
  scene.fog = new THREE.Fog(beach.hazeColor, 14, 120);

  sandMat.map = sandTexture(beach.sandColor);
  sandMat.map.repeat.set(14, 14);
  sandMat.needsUpdate = true;
  // The painted bed under the pile and the bank around it are both drawn from this
  // beach's OWN palette and stone-size band, by the same painter that the dynamic
  // pebbles get their tints from (env.js). That is what keeps the fixed surround
  // and the movable pile reading as one continuous beach instead of two materials.
  pitMat.map = shingleTexture(beach.id, beach.sandColor,
    beach.stones, beach.stoneSize, PIT_FLOOR_W, PIT_FLOOR_D);
  pitMat.needsUpdate = true;
  rimMat.map = stoneBedTexture(beach.id, beach.stones, beach.stoneSize, RIM_TILE, RIM_TILE);
  rimMat.needsUpdate = true;
  // 0.72 against the near-grey grain map lands damp sand at ~0.57 of the dry
  // beach's brightness, which is about what wet sand actually looks like.
  wetMat.color.copy(new THREE.Color(beach.sandColor).multiplyScalar(0.72));
  // The water map averages ~0.7 luminance, so the tint is lifted to compensate.
  seaMat.color.setHex(beach.seaColor).multiplyScalar(1.4);
  hemi.color.setHex(beach.hazeColor);
}

// --- per-section dressing -------------------------------------------------
// Everything below is re-rolled for every new stretch of beach. It deliberately
// only varies ARRANGEMENT — palette, sizes and style stay exactly as they are,
// because those are the bits that make each beach recognisable.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _col = new THREE.Color();

const rr = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

let dressStyle = 0;      // which scatter pattern is in play (for debug)
let washScale = 1;       // per-section tide tempo
let foamBaseZ = FOAM_Z;
// A compact fingerprint of the current dressing, so "did this section actually
// change?" is answerable without eyeballing a screenshot.
const dressSig = { scatterN: 0, gaps: 0, jag: 0, sandRot: 0, log: false, shells: 0, weeds: 0 };

export function redress(beach) {
  dressBorder(beach);
  dressScatter(beach);
  dressProps(beach);
  // Tide tempo and reach shift a little each time, so two sections never breathe
  // in sync even though the wash itself always looks the same shape.
  washScale = rr(0.82, 1.24);
  foamBaseZ = FOAM_Z + rr(-0.12, 0.1);
  // Rotating the sand texture is the cheapest possible way to make the ground
  // itself look like a different patch of beach. Only the tiled dry sand can be
  // rotated — the pit's shingle covers its patch exactly once, so turning it
  // would swing the faded edge into view.
  if (sandMat.map) {
    sandMat.map.center.set(0.5, 0.5);
    sandMat.map.rotation = Math.random() * Math.PI * 2;
  }
  dressSig.sandRot = +sandMat.map.rotation.toFixed(3);
}

/**
 * Loose stones bedded along the top of the rim bank: jitter, size band and gaps
 * all vary per section.
 *
 * These are DRESSING and always were — the containment is the rim collider under
 * them. They used to lie on the sand with up to 0.38 of jitter, which on a
 * fine-shingle beach scattered them into a dotted line that read as spilt gravel
 * rather than an edge. Now they sit ON the bank, and the jitter is capped to the
 * bank's own width so every one of them is actually resting on something.
 */
function dressBorder(beach) {
  const halfW = PIT.hw + RIM.t / 2, halfD = PIT.hd + RIM.t / 2;
  const jag = Math.min(rr(0.06, 0.16), RIM.t * 0.42);   // how ragged the ring is
  const sizeMul = rr(0.86, 1.18);
  // One or two washed-out gaps in the ring, which is what stops it reading as a
  // deliberate border and starts it reading as shingle.
  const gaps = [];
  for (let g = 0, n = (Math.random() * 3) | 0; g < n; g++) {
    gaps.push({ at: Math.random(), w: rr(0.04, 0.11) });
  }
  // Walk the RING's own perimeter, not the pit's — they differ by the bank's width,
  // and using the pit's put the stones a little short of each corner.
  const W = halfW * 2, D = halfD * 2;
  for (let i = 0; i < BORDER_N; i++) {
    const t = i / BORDER_N;
    const per = t * (W + D) * 2;
    let x, z;
    if (per < W) { x = -halfW + per; z = -halfD; }
    else if (per < W + D) { x = halfW; z = -halfD + (per - W); }
    else if (per < W * 2 + D) { x = halfW - (per - W - D); z = halfD; }
    else { x = -halfW; z = halfD - (per - W * 2 - D); }
    let inGap = false;
    for (const g of gaps) if (Math.abs(t - g.at) < g.w) inGap = true;
    // Kept close to the pile's own stone size. Big border cobbles overlapped each
    // other so heavily that the intersections read as a ring of broken shells.
    const r = beach.stoneSize[1] * (0.7 + Math.random() * 0.55) * sizeMul;
    // On top of the bank, sunk into it by a third of the stone, so the ring reads
    // as stones bedded into the berm rather than balanced on a kerb.
    _v.set(x + (Math.random() - 0.5) * jag * 2,
      RIM.visH + r * 0.30,
      z + (Math.random() - 0.5) * jag * 2);
    _e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    _q.setFromEuler(_e);
    const s = inGap ? 0 : 1;
    // Same footprint and the same tint rules as a dynamic pebble of variant 0 —
    // this mesh IS pebbleGeometry(0), so anything else would be a stone that looks
    // subtly unlike every stone next to it.
    const v0 = STONE_VARIANT_SCALE[0];
    _sc.set(r * v0.x * s, r * v0.y * s, r * v0.z * s);
    _m.compose(_v, _q, _sc);
    border.setMatrixAt(i, _m);
    stoneTint(_col, beach.stones[i % beach.stones.length], 0, Math.random, 1);
    border.setColorAt(i, _col);
  }
  border.instanceMatrix.needsUpdate = true;
  if (border.instanceColor) border.instanceColor.needsUpdate = true;
  dressSig.gaps = gaps.length;
  dressSig.jag = +jag.toFixed(3);
}

/**
 * Stones lying on the dry sand around the pit. Three arrangements — an even
 * sprinkle, a couple of clumps, or a strand line parallel to the water — chosen
 * at random so the background genuinely changes between sections.
 */
function dressScatter(beach) {
  dressStyle = (Math.random() * 3) | 0;
  const n = 34 + ((Math.random() * (SCATTER_N - 34)) | 0);
  const clumps = [];
  for (let c = 0; c < 3; c++) {
    clumps.push({ x: rr(-3.4, 3.4), z: rr(-1.9, 2.2), r: rr(0.4, 1.0) });
  }
  const strandZ = rr(-1.95, -1.6);
  for (let i = 0; i < SCATTER_N; i++) {
    if (i >= n) { _sc.set(0, 0, 0); _m.compose(_v.set(0, -9, 0), _q.identity(), _sc); scatter.setMatrixAt(i, _m); continue; }
    let x, z;
    if (dressStyle === 1) {
      const c = clumps[i % clumps.length];
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * c.r;
      x = c.x + Math.cos(a) * d;
      z = c.z + Math.sin(a) * d * 0.7;
    } else if (dressStyle === 2) {
      x = rr(-4.6, 4.6);
      z = strandZ + (Math.random() - 0.5) * 0.42;
    } else {
      x = rr(-4.6, 4.6);
      z = rr(-2.0, 2.6);
    }
    // Keep clear of the pit itself: these stones are scenery, not shingle.
    if (Math.abs(x) < PIT.hw + 0.5 && Math.abs(z) < PIT.hd + 0.5) {
      x += (x < 0 ? -1 : 1) * (PIT.hw + 0.7);
    }
    // Every layout keeps some stones in the strip between the near edge of the pit
    // and the bottom of the frame. On a portrait phone that strip is unavoidably
    // tall (the pit is width-bound), and bare it read as blank cardboard.
    if (i % 5 === 3) {
      x = rr(-2.5, 2.5);
      z = rr(PIT.hd + 0.55, 2.6);
    }
    // A handful of proper boulders among the small stuff.
    const big = Math.random() < 0.12;
    const r = beach.stoneSize[1] * (big ? rr(1.6, 2.8) : rr(0.45, 1.0));
    _v.set(x, r * 0.4, z);
    _e.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    _q.setFromEuler(_e);
    // This mesh is pebbleGeometry(1), so it takes variant 1's shape and tint.
    const v1 = STONE_VARIANT_SCALE[1];
    _sc.set(r * v1.x, r * v1.y, r * v1.z);
    _m.compose(_v, _q, _sc);
    scatter.setMatrixAt(i, _m);
    stoneTint(_col, pick(beach.stones), 1, Math.random, 1);
    scatter.setColorAt(i, _col);
  }
  scatter.instanceMatrix.needsUpdate = true;
  if (scatter.instanceColor) scatter.instanceColor.needsUpdate = true;
  dressSig.scatterN = n;
}

/** Driftwood, shells and weed: which of them show up, and where, changes too. */
function dressProps(beach) {
  const side = Math.random() < 0.5 ? -1 : 1;
  driftLog.visible = Math.random() < 0.78;
  driftLog.rotation.set(rr(-0.2, 0.2), rr(0, 1.2), Math.PI / 2 + rr(-0.25, 0.25));
  driftLog.position.set(side * rr(2.4, 3.3), 0.09, rr(0.2, 1.6));
  driftStub.visible = driftLog.visible && Math.random() < 0.7;
  driftStub.rotation.set(rr(0, 0.4), 0, Math.PI / 2 + rr(-0.8, 0.8));
  driftStub.position.set(side * rr(1.9, 3.0), 0.05, rr(0.6, 1.9));

  const nShells = 3 + ((Math.random() * 7) | 0);
  shells.forEach((s, i) => {
    s.visible = i < nShells;
    if (!s.visible) return;
    const a = Math.random() * Math.PI * 2;
    const r = 2.3 + Math.random() * 1.5;
    s.position.set(Math.cos(a) * r * 1.25, 0.012, -0.2 + Math.sin(a) * r * 0.8);
    s.rotation.set(Math.PI + rr(-0.25, 0.25), Math.random() * 3, rr(-0.25, 0.25));
    const sz = rr(0.8, 1.3);
    s.scale.set(sz, sz * 0.55, sz * 0.8);
  });

  // A line of dried weed along the strand, present about half the time.
  const nWeed = Math.random() < 0.55 ? 3 + ((Math.random() * 5) | 0) : 0;
  const wz = rr(-2.0, -1.72);
  weeds.forEach((w, i) => {
    w.visible = i < nWeed;
    if (!w.visible) return;
    w.position.set(rr(-4.2, 4.2), 0.015, wz + rr(-0.16, 0.16));
    w.rotation.set(0, Math.random() * 3, 0);
    w.scale.set(rr(1.2, 2.6), 0.22, rr(0.4, 0.8));
  });
  dressSig.log = driftLog.visible;
  dressSig.shells = nShells;
  dressSig.weeds = nWeed;
}

// --- camera framing -------------------------------------------------------
// The corners of the pit plus the top of a full pile. Closed-form framing maths
// got the foreshortening wrong at a steep pitch and let the pit spill off the
// screen, so we just project these and pull back until they all fit.
const FRAME_PTS = [];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    // 0.34 is the realistic top of a settled pile. Framing for a taller pile than
    // ever actually exists just pushes the camera back and wastes the screen.
    for (const y of [0, 0.34]) {
      FRAME_PTS.push(new THREE.Vector3(sx * (PIT.hw + 0.26), y, sz * (PIT.hd + 0.26)));
    }
  }
}
const _fp = new THREE.Vector3();
const _look = new THREE.Vector3();

function placeCamera(dist) {
  camera.position.set(
    CAM_TARGET.x,
    CAM_TARGET.y + Math.sin(CAM_PITCH) * dist,
    CAM_TARGET.z + Math.cos(CAM_PITCH) * dist
  );
  _look.copy(CAM_TARGET);
  _look.z += lookBias;
  camera.lookAt(_look);
  camera.updateMatrixWorld(true);
}

// Asymmetric margins in NDC. The bottom bar and the move buttons live over the
// lower ~18% of the screen and the HUD pill over the top ~10%, so the pit is
// fitted into the band between them rather than into the raw viewport — that is
// what stops the near edge of the pile disappearing behind the buttons.
// LIM_TOP is deliberately tight: the band above the pit is where the wet sand,
// the foam line and a strip of sea have to fit, and without that context the shot
// is just a rectangle of gravel.
const LIM_X = 0.92;
const LIM_TOP = 0.70;
const LIM_BOTTOM = 0.84;
// Portrait is WIDTH-bound: the pit's side corners hit the frame long before the
// vertical band is used up, so with the landscape limits a phone/tablet held
// upright wasted a fifth of the screen on empty dry sand below the pile. In
// portrait the outer corners are allowed a few percent off the sides (they are
// sand and border stones, never playable pebbles) and the vertical band is opened
// up, which brings the camera in and fills the frame.
const P_LIM_X = 1.06;
const P_LIM_TOP = 0.75;
const P_LIM_BOTTOM = 0.88;
let camDist = 0;
let limX = LIM_X, limTop = LIM_TOP, limBottom = LIM_BOTTOM;

/** Does every framing point sit inside the safe band at this distance? */
function fits(dist) {
  placeCamera(dist);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanX = tanY * camera.aspect;
  for (const p of FRAME_PTS) {
    _fp.copy(p).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_fp.z;
    if (depth < 0.2) return false;             // behind the camera: never "fits"
    if (Math.abs(_fp.x) > limX * tanX * depth) return false;
    if (_fp.y > limTop * tanY * depth) return false;
    if (-_fp.y > limBottom * tanY * depth) return false;
  }
  return true;
}

/**
 * Pull the camera back until the pit fits the safe band. Bisection, not a
 * fixed-point loop: because the eye orbits the pit while the look target stays
 * put, the view DIRECTION changes with distance, so "project, scale, repeat"
 * oscillates instead of converging — and at short distances the near corners of
 * the pit fall behind the camera and project to nonsense.
 */
export function frameCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const portrait = camera.aspect < 1.0;
  limX = portrait ? P_LIM_X : LIM_X;
  limTop = portrait ? P_LIM_TOP : LIM_TOP;
  limBottom = portrait ? P_LIM_BOTTOM : LIM_BOTTOM;
  lookBias = portrait ? LOOK_BIAS_PORTRAIT : LOOK_BIAS;

  let lo = 3.0, hi = 13.0;
  if (!fits(hi)) { lo = hi; }
  else if (fits(lo)) { hi = lo; }
  else {
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
  }
  fitDist = hi;
  applyZoom();
  return camDist;
}

// --- zoom -----------------------------------------------------------------
// Zoom is a multiplier on the FITTED distance, not an absolute one: the fit
// changes with the viewport, and "1x" always has to mean "the whole pit".
export const ZOOM_MIN = 0.92;
export const ZOOM_MAX = 2.3;
let fitDist = 0;
let zoom = 1;

function applyZoom() {
  if (!fitDist) return;
  camDist = fitDist / zoom;
  placeCamera(camDist);
}

export function zoomFactor() { return zoom; }
export function setZoom(z) {
  zoom = THREE.MathUtils.clamp(z, ZOOM_MIN, ZOOM_MAX);
  applyZoom();
  return zoom;
}
export function nudgeZoom(mul) { return setZoom(zoom * mul); }
export function resetZoom() { return setZoom(1); }

// --- the tide -------------------------------------------------------------
// A real wash is not a sine wave: the water RUSHES up the sand in about a
// quarter of the cycle and then drains back over the remaining three quarters,
// leaving foam behind it. That asymmetry is the whole effect.
const WASH_PERIOD = 7.4;
const WASH_REACH = 0.9;

/** 0 = fully drained, 1 = furthest up the sand. */
function washCurve(p) {
  if (p < 0.26) {
    const k = p / 0.26;
    return 1 - Math.pow(1 - k, 2.6);        // fast in, decelerating
  }
  const k = (p - 0.26) / 0.74;
  return Math.pow(1 - k, 1.7);              // slow, lingering drain
}

let wash = 0;         // current reach
let washV = 0;        // reach velocity — drives the foam brightness
let spent = 0;        // where the last wash left its foam
let wetReach = 0;     // damp sand dries off slowly behind the water

// --- per-frame ------------------------------------------------------------
let t = 0;
export function updateScene(dt) {
  t += dt;

  const period = WASH_PERIOD * washScale;
  const p = (t % period) / period;
  const w = washCurve(p);
  washV = (w - wash) / Math.max(dt, 1e-4);
  wash = w;

  // Swell on the sea plane. The amplitude breathes with the wash so the water
  // looks like it is gathering itself before each run up the beach.
  const pos = seaGeo.attributes.position;
  const amp = 0.85 + w * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = seaBase[i * 3], y = seaBase[i * 3 + 1];
    pos.setZ(i, 0.1 + (Math.sin(x * 0.09 + t * 0.9) * 0.05
      + Math.sin(y * 0.13 - t * 0.6) * 0.04
      + Math.sin(x * 0.31 - y * 0.17 + t * 1.7) * 0.018) * amp);
  }
  pos.needsUpdate = true;
  sea.position.z = SEA_Z - 95 + w * 0.35;
  // Crest lines drift along the shore so the water is never a still picture.
  waterTex.offset.x = (waterTex.offset.x + dt * 0.004) % 1;

  // Surf at the water line rides in with the sea plane and brightens on the rush.
  surf.position.z = SURF_Z + w * 0.35;
  surfMat.opacity = 0.5 + 0.3 * Math.min(1, w + Math.max(0, washV) * 0.4);

  // The main foam band: its leading edge advances and it thickens as it comes.
  const depth = FOAM_BASE_DEPTH * (0.68 + w * 0.55);
  const front = Math.min(foamBaseZ - 0.2 + w * WASH_REACH, FOAM_FRONT_MAX);
  foam.scale.y = depth / FOAM_BASE_DEPTH;
  foam.position.z = front - depth / 2;
  foamMat.opacity = 0.3 + 0.62 * Math.min(1, w * 1.25 + Math.max(0, washV) * 0.3);
  // Texture scroll tracks how fast the water is actually moving.
  foamTex.offset.x = (foamTex.offset.x + dt * (0.02 + Math.abs(washV) * 0.06)) % 1;
  foamTex.offset.y = (foamTex.offset.y + dt * 0.01) % 1;

  // Bright line right on the edge, brightest during the rush.
  foamEdge.position.z = front - 0.05;
  foamEdge.scale.y = 0.7 + w * 0.8;
  foamEdgeMat.opacity = Math.min(0.75, 0.08 + Math.max(0, washV) * 0.55);

  // Foam left stranded as the water pulls back.
  spent = Math.max(spent - dt * 0.42, w);
  const spentFront = Math.min(foamBaseZ - 0.2 + spent * WASH_REACH, FOAM_FRONT_MAX);
  spentFoam.position.z = spentFront - 0.1;
  spentMat.opacity = Math.max(0, Math.min(0.5, (spent - w) * 1.7));
  spentFoam.visible = spentMat.opacity > 0.01;

  // Damp sand: advances with the water, dries off over many seconds. Its front
  // edge is clamped short of the pit — damp sand painted over the shingle read
  // as a grey stripe across the pile.
  // At 0.05/s the band never visibly dried — it just sat there as a fixed stripe.
  // 0.13/s lets it creep back between washes, which is what makes the beach look
  // like it is breathing rather than painted.
  wetReach = Math.max(wetReach - dt * 0.13, w);
  const wetFront = THREE.MathUtils.lerp(SEA_Z + 0.15, WET_FRONT_MAX, wetReach);
  wetBand.position.z = (wetFront + WET_BACK_Z) / 2;
  wetBand.scale.y = (wetFront - WET_BACK_Z) / WET_BASE_DEPTH;
  // The plane is scaled, so the grain has to be re-tiled or it stretches with it.
  wetTex.repeat.y = (WET_BASE_DEPTH * wetBand.scale.y) / WET_TILE;
  wetMat.opacity = 0.7 + 0.24 * wetReach;

  // radar pulse
  if (pulse) {
    pulse.t += dt;
    const p = pulse.t / pulse.dur;
    if (p >= 1) { pulse = null; pulseRing.visible = false; }
    else {
      pulseRing.visible = true;
      const s = 0.15 + p * 2.3;
      pulseRing.scale.set(s, s, 1);
      ringMat.opacity = (1 - p) * 0.75;
    }
  }

  // wave-wash sweep
  if (sweepFx) {
    sweepFx.t += dt;
    const p = sweepFx.t / sweepFx.dur;
    if (p >= 1) { sweepFx = null; sweep.visible = false; }
    else {
      sweep.visible = true;
      sweep.position.z = -PIT.hd - 0.6 + p * (PIT.d + 1.2);
      sweepMat.opacity = Math.sin(p * Math.PI) * 0.85;
    }
  }

  updateBursts(dt);
}

export function setShadowsEnabled(on) {
  sun.castShadow = on;
  border.castShadow = on;
  scatter.castShadow = on;
  rimBank.castShadow = on;
}

export function markerPool() { return markers; }


export function debugCounts() {
  const ndcY = (z) => +_fp.set(0, 0, z).project(camera).y.toFixed(3);
  return {
    border: BORDER_N, scatter: SCATTER_N, pixelRatio: perf.pixelRatio,
    rim: { t: RIM.t, visH: RIM.visH, tris: rimBank.geometry.index.count / 3 },
    camDist: +camDist.toFixed(2), fitDist: +fitDist.toFixed(2), zoom: +zoom.toFixed(2),
    dressStyle, washScale: +washScale.toFixed(2), wash: +wash.toFixed(2),
    dress: { ...dressSig },
    ndcYFar: ndcY(-PIT.hd - 0.3), ndcYNear: ndcY(PIT.hd + 0.3),
    ndcYWater: ndcY(SEA_Z), ndcYFoam: ndcY(foam.position.z),
  };
}
