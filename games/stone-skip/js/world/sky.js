// Gradient sky dome, sun, drifting puffy clouds and a few birds.

import * as THREE from 'three';
import { mulberry32, TAU } from '../util.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */`
precision highp float;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunDir;
uniform vec3 uSunTint;   // theme colour of the sun/moon disc
uniform float uGlow;     // how far the glow around it spreads (sunset = big)
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.15 + 0.06, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.72));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunTint * pow(sd, 260.0) * 1.6;                      // sun disc
  col += uSunTint * pow(sd, 9.0) * 0.30 * uGlow;               // glow
  col = mix(col, uHorizon, smoothstep(0.14, -0.04, d.y));      // haze band
  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSky(palette) {
  const group = new THREE.Group();
  group.name = 'sky';

  const domeMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uHorizon: { value: new THREE.Color(palette.skyHorizon) },
      uZenith: { value: new THREE.Color(palette.skyZenith) },
      uSunDir: { value: palette.sunDir.clone().normalize() },
      uSunTint: { value: new THREE.Color(palette.sunTint || 0xffedb8) },
      uGlow: { value: palette.glow === undefined ? 1 : palette.glow },
    },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 20), domeMat);
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);

  // --- stars: one Points cloud, only shown by the night theme -----------------
  // Fixed screen-space size (no attenuation) so they stay crisp pinpricks
  // instead of turning into blobs on the dome.
  const STARS = 520;
  const starPos = new Float32Array(STARS * 3);
  const starRnd = mulberry32(4242);
  for (let i = 0; i < STARS; i++) {
    const a = starRnd() * TAU;
    const y = 0.035 + starRnd() * 0.95;          // upper hemisphere only
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    starPos[i * 3] = Math.cos(a) * r * 1330;
    starPos[i * 3 + 1] = y * 1330;
    starPos[i * 3 + 2] = Math.sin(a) * r * 1330;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff, size: 3.4, sizeAttenuation: false,
    transparent: true, opacity: 0.9, depthWrite: false, fog: false,
  });
  const starField = new THREE.Points(starGeo, starMat);
  starField.frustumCulled = false;
  starField.renderOrder = -9;
  starField.visible = false;
  group.add(starField);

  // --- clouds: one instanced low-poly sphere, puffs grouped into clouds
  const rnd = mulberry32(9182);
  const clouds = [];
  const puffs = [];
  const CLOUDS = 16;
  for (let i = 0; i < CLOUDS; i++) {
    const ang = rnd() * TAU;
    const rad = 240 + rnd() * 520;
    const cloud = {
      x: Math.cos(ang) * rad,
      y: 78 + rnd() * 70,
      z: 55 + Math.sin(ang) * rad,
      speed: 0.55 + rnd() * 0.7,
      scale: 0.8 + rnd() * 1.5,
      puffs: [],
    };
    const n = 4 + Math.floor(rnd() * 3);
    for (let p = 0; p < n; p++) {
      cloud.puffs.push({
        ox: (p - n / 2) * (10 + rnd() * 7),
        oy: (rnd() - 0.4) * 7,
        oz: (rnd() - 0.5) * 12,
        r: 9 + rnd() * 9,
        sy: 0.5 + rnd() * 0.28,
      });
      puffs.push({ cloud: i, p });
    }
    clouds.push(cloud);
  }
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, flatShading: true, emissive: 0x8fb4d6, emissiveIntensity: 0.28, fog: false,
  });
  const cloudMesh = new THREE.InstancedMesh(puffGeo, cloudMat, puffs.length);
  cloudMesh.frustumCulled = false;
  cloudMesh.renderOrder = -8;
  group.add(cloudMesh);

  // --- birds: instanced V shapes
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.6, -1.7, 0.25, -0.6, 0, 0, -0.35,
    0, 0, 0.6, 0, 0, -0.35, 1.7, 0.25, -0.6,
  ], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x3b3f52, side: THREE.DoubleSide, fog: true });
  const BIRDS = 11;
  const birdMesh = new THREE.InstancedMesh(birdGeo, birdMat, BIRDS);
  birdMesh.frustumCulled = false;
  group.add(birdMesh);
  const birds = [];
  for (let i = 0; i < BIRDS; i++) {
    birds.push({
      cx: (rnd() - 0.5) * 220, cz: 40 + (rnd() - 0.5) * 240,
      r: 30 + rnd() * 90, y: 26 + rnd() * 40,
      a: rnd() * TAU, speed: 0.12 + rnd() * 0.16,
      flap: rnd() * TAU, size: 1.1 + rnd() * 1.1,
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let time = 0;

  function update(dt) {
    time += dt;
    // stars twinkle as a whole rather than per-point: 1 uniform write, not 520
    if (starField.visible) starMat.opacity = 0.72 + 0.2 * Math.sin(time * 1.4);
    // clouds
    for (let i = 0; i < puffs.length; i++) {
      const { cloud: ci, p } = puffs[i];
      const c = clouds[ci];
      const pf = c.puffs[p];
      let x = c.x + pf.ox * c.scale + Math.sin(time * 0.11 + ci) * 3;
      x += ((time * c.speed) % 1600) - 800;
      if (x > 800) x -= 1600;
      pos.set(x, c.y + pf.oy, c.z + pf.oz * c.scale);
      scl.set(pf.r * c.scale, pf.r * pf.sy * c.scale, pf.r * c.scale);
      m.compose(pos, q.identity(), scl);
      cloudMesh.setMatrixAt(i, m);
    }
    cloudMesh.instanceMatrix.needsUpdate = true;

    // birds
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      b.a += b.speed * dt;
      pos.set(b.cx + Math.cos(b.a) * b.r, b.y + Math.sin(b.a * 2.2) * 2.5, b.cz + Math.sin(b.a) * b.r);
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(time * 6.5 + b.flap));
      e.set(0, -b.a + Math.PI / 2, 0);
      q.setFromEuler(e);
      scl.set(b.size, b.size * flap, b.size);
      m.compose(pos, q, scl);
      birdMesh.setMatrixAt(i, m);
    }
    birdMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    group, update,
    // exposed so themes.js can retint the sky without rebuilding anything
    uniforms: domeMat.uniforms,
    cloudMat, birdMat,
    setStars(on) { starField.visible = !!on; },
  };
}
