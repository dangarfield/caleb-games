// Turns the heightfield into a single vertex-coloured, flat-shaded mesh
// plus the baked depth texture the water shader samples.

import * as THREE from 'three';
import { RAD, clamp, sat, smoothRange, fbm } from '../util.js';
import { LAKE, shoreStyle, WATER_Y } from './layout.js';
import { heightAt, REGION, WATER_REGION } from './heightfield.js';

export { heightAt, depthAt, isWater, islandAt, REGION, WATER_REGION } from './heightfield.js';

const C = {
  sandDry: new THREE.Color(0xe9d9ab),
  sandWet: new THREE.Color(0xcbb385),
  grass: new THREE.Color(0x79c063),
  grassDark: new THREE.Color(0x4f9645),
  rock: new THREE.Color(0x9aa2a8),
  rockDark: new THREE.Color(0x6f777d),
  bedShallow: new THREE.Color(0xc3c78d),
  bedDeep: new THREE.Color(0x2c5a53),
  hill: new THREE.Color(0x5c8f56),
};

const _sand = new THREE.Color();

function colorAt(x, z, h, out) {
  const theta = Math.atan2(z - LAKE.cz, x - LAKE.cx);
  const st = shoreStyle(theta * RAD);
  const n = fbm(x * 0.09, z * 0.09, 2);
  if (h < WATER_Y) {
    const t = smoothRange(0.3, 6.5, -h);
    out.copy(C.bedShallow).lerp(C.bedDeep, t);
    out.lerp(C.rockDark, st.rocky * 0.35 * (1 - t));
    out.offsetHSL(0, 0, (n - 0.5) * 0.05);
  } else {
    const wet = 1 - smoothRange(0.0, 0.55, h);
    const sandy = clamp(st.sandy + (n - 0.5) * 0.25, 0, 1);
    const beachBand = 1 - smoothRange(0.2, 3.4, h);
    out.copy(C.grass).lerp(C.grassDark, n * 0.55);
    out.lerp(C.hill, smoothRange(6, 26, h));
    _sand.copy(C.sandDry).lerp(C.sandWet, wet);
    out.lerp(_sand, sandy * beachBand);
    if (st.rocky > 0.25 && n > 0.62) out.lerp(C.rock, (st.rocky - 0.25) * 1.4);
    out.offsetHSL(0, 0, (n - 0.5) * 0.06);
  }
  return out;
}

/** Terrain mesh — one draw call for the whole lake bed + shores + islands. */
export function buildTerrain(segments = 236) {
  const geo = new THREE.PlaneGeometry(REGION.size, REGION.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + REGION.cx;
    const z = pos.getZ(i) + REGION.cz;
    const h = heightAt(x, z);
    pos.setX(i, x); pos.setZ(i, z); pos.setY(i, h);
    colorAt(x, z, h, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

/**
 * Depth / shore map for the water shader.
 * R = depth (0..8 m normalised), G = shore proximity, B = 1 where dry land.
 */
export function buildDepthTexture(res = 256) {
  const data = new Uint8Array(res * res * 4);
  const half = WATER_REGION.size / 2;
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = WATER_REGION.cx - half + (i + 0.5) / res * WATER_REGION.size;
      const z = WATER_REGION.cz - half + (j + 0.5) / res * WATER_REGION.size;
      const h = heightAt(x, z);
      const depth = Math.max(0, -h);
      const k = (j * res + i) * 4;
      data[k] = Math.round(sat(depth / 8) * 255);
      data[k + 1] = Math.round(sat(1 - depth / 2.2) * 255);
      data[k + 2] = h > 0 ? 255 : 0;
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
