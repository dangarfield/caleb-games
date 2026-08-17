// Toon-ish lake surface: depth-tinted, ripple-shaded, foam at the shoreline.
// Reads the baked depth texture from terrain.js so shallows go turquoise and
// the water fades out exactly at the waterline.

import * as THREE from 'three';
import { WATER_REGION } from './heightfield.js';

const VERT = /* glsl */`
uniform sampler2D uDepthMap;
uniform vec2 uCenter;
uniform float uSize;
uniform float uTime;
varying vec3 vWorld;
varying float vDepth;
varying float vShore;
varying vec2 vMapUv;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 uv = (wp.xz - (uCenter - uSize * 0.5)) / uSize;
  vMapUv = uv;
  vec4 dm = texture2D(uDepthMap, uv);
  vDepth = dm.r * 8.0;
  vShore = dm.g;
  float damp = smoothstep(0.0, 1.6, vDepth);
  float h =
      sin(wp.x * 0.135 + uTime * 0.9) * 0.055
    + sin(wp.z * 0.17 - uTime * 1.05) * 0.05
    + sin((wp.x + wp.z) * 0.075 + uTime * 0.62) * 0.075;
  wp.y += h * damp;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uSky;
uniform vec3 uHaze;
// Distance band the surface fades into the haze over. A uniform, not a constant,
// because the map view (camera-rig 'overview') sits hundreds of metres up: at the
// eye-level band every pixel of the lake would be past the far edge and the whole
// map would render as one flat sheet of haze.
uniform vec2 uHazeRange;
uniform vec3 uSunDir;
varying vec3 vWorld;
varying float vDepth;
varying float vShore;

vec2 rippleGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.91, 0.42);
  vec2 d2 = vec2(-0.51, 0.86);
  vec2 d3 = vec2(0.19, -0.98);
  vec2 d4 = vec2(0.74, 0.67);
  g += d1 * cos(dot(p, d1 * 0.55) + t * 1.7) * 0.055;
  g += d2 * cos(dot(p, d2 * 0.86) + t * 2.1) * 0.040;
  g += d3 * cos(dot(p, d3 * 1.65) - t * 2.6) * 0.022;
  g += d4 * cos(dot(p, d4 * 3.1) + t * 3.4) * 0.009;
  return g;
}

void main() {
  vec2 g = rippleGrad(vWorld.xz, uTime);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);

  vec3 base = mix(uShallow, uDeep, smoothstep(0.1, 5.5, vDepth));
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = mix(base, uSky, clamp(fres * 0.9, 0.0, 0.85));

  vec3 H = normalize(uSunDir + V);
  float nh = max(dot(n, H), 0.0);
  col += vec3(1.0, 0.97, 0.88) * pow(nh, 90.0) * 0.85;
  col += vec3(1.0) * pow(nh, 500.0) * 1.5;

  // Ripple shading that does NOT depend on fresnel. Right in front of the player
  // the view is so grazing that fresnel is ~0, and without this the shallow shelf
  // reads as flat mud instead of moving water.
  float rip = (g.x + g.y) * 2.4;
  col *= 1.0 + rip * 0.13;
  float crest = smoothstep(0.055, 0.16, length(g)) * (1.0 - smoothstep(0.3, 2.6, vDepth));
  col = mix(col, vec3(1.0), crest * 0.13);

  // shoreline lapping foam - gated on real depth so it hugs the waterline
  // instead of bleaching the whole shallow shelf white
  float band = smoothstep(0.5, 1.0, vShore) * (1.0 - smoothstep(0.22, 1.1, vDepth));
  float foam = band * (0.42 + 0.58 * sin(vDepth * 7.5 - uTime * 2.1));
  foam += smoothstep(0.9, 1.0, vShore) * (1.0 - smoothstep(0.1, 0.6, vDepth)) * 0.3;
  col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.42);

  // atmosphere towards the far shore
  col = mix(col, uHaze, smoothstep(uHazeRange.x, uHazeRange.y, dist));

  float alpha = smoothstep(0.015, 0.45, vDepth) * 0.94;
  gl_FragColor = vec4(col, alpha);
}
`;

// Standing on the shore, the far side of the lake should melt into the haze.
export const HAZE_NEAR = 120;
export const HAZE_FAR = 430;

export function buildWater(depthTex, palette, segments = 132) {
  const geo = new THREE.PlaneGeometry(WATER_REGION.size, WATER_REGION.size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    // No depth write: the fish (renderOrder 2) are drawn after the surface and
    // must not be depth-rejected by it, which is what makes them read as shapes
    // moving under the water. Everything opaque already sorted before this.
    depthWrite: false,
    uniforms: {
      uDepthMap: { value: depthTex },
      uCenter: { value: new THREE.Vector2(WATER_REGION.cx, WATER_REGION.cz) },
      uSize: { value: WATER_REGION.size },
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(palette.shallow) },
      uDeep: { value: new THREE.Color(palette.deep) },
      uSky: { value: new THREE.Color(palette.skyReflect) },
      uHaze: { value: new THREE.Color(palette.haze) },
      uHazeRange: { value: new THREE.Vector2(HAZE_NEAR, HAZE_FAR) },
      uSunDir: { value: palette.sunDir.clone().normalize() },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(WATER_REGION.cx, 0, WATER_REGION.cz);
  mesh.renderOrder = 1;
  mesh.name = 'water';
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms: mat.uniforms,          // themes.js retints the lake through these
    update(t) { mat.uniforms.uTime.value = t; },
    /** Push the haze band out (the map view looks down from ~400 m). */
    setHazeRange(near, far) { mat.uniforms.uHazeRange.value.set(near, far); },
  };
}

/** Approximate visual surface height so splashes sit on the ripples. */
export function surfaceY(x, z, t, depth) {
  const damp = Math.min(1, Math.max(0, depth / 1.6));
  return (
    Math.sin(x * 0.135 + t * 0.9) * 0.055 +
    Math.sin(z * 0.17 - t * 1.05) * 0.05 +
    Math.sin((x + z) * 0.075 + t * 0.62) * 0.075
  ) * damp;
}
