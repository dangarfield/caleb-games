// Times of day. Bought in the shop, then applied live — nothing is rebuilt, the
// theme only re-tints uniforms, materials, the fog and the two lights.
//
// Deliberately free of Three.js imports: every value is a plain hex or an array,
// and applyTheme only calls methods that already exist on the objects handed to
// it (Color.setHex, Vector3.set). That keeps the palettes readable in one place
// and testable in node.

export const THEMES = {
  day: {
    id: 'day', name: 'Bright Day', icon: '☀️',
    skyHorizon: 0xdcf2ff, skyZenith: 0x3f9ce8,
    sunTint: 0xffedb8, glow: 1.0,
    shallow: 0x74ddd0, deep: 0x14608f, skyReflect: 0xbfe4ff,
    haze: 0xd6ecfb, fogNear: 210, fogFar: 640,
    sun: [0.42, 0.55, -0.72],
    hemiSky: 0xd6ecff, hemiGround: 0x6f8f5a, hemi: 0.95,
    dirColor: 0xfff3dc, dir: 0.85,
    cloud: 0xffffff, cloudEmissive: 0x8fb4d6, cloudEmissiveI: 0.28,
    bird: 0x3b3f52,
    stars: false,
  },
  sunset: {
    id: 'sunset', name: 'Golden Sunset', icon: '🌇',
    skyHorizon: 0xffc07a, skyZenith: 0x2f4d8f,
    sunTint: 0xffb45c, glow: 2.4,
    shallow: 0x8fc0b4, deep: 0x113a63, skyReflect: 0xffb877,
    haze: 0xf6bd92, fogNear: 170, fogFar: 600,
    // low sun: the glare sits right on the horizon behind the lake
    sun: [0.86, 0.14, -0.49],
    hemiSky: 0xffd2a4, hemiGround: 0x6a5340, hemi: 0.8,
    dirColor: 0xffb066, dir: 1.05,
    cloud: 0xffd9b8, cloudEmissive: 0xff9d5c, cloudEmissiveI: 0.4,
    bird: 0x2a2438,
    stars: false,
  },
  misty: {
    id: 'misty', name: 'Misty Morning', icon: '🌫️',
    skyHorizon: 0xe2eaed, skyZenith: 0xa4bdc8,
    sunTint: 0xfbfaf4, glow: 0.5,
    shallow: 0xa4cbc6, deep: 0x496e80, skyReflect: 0xe0eaee,
    // the whole point of this one: you cannot see the far shore
    haze: 0xdfe7ea, fogNear: 70, fogFar: 320,
    sun: [0.3, 0.72, -0.62],
    hemiSky: 0xe6f0f2, hemiGround: 0x7f8a78, hemi: 1.05,
    dirColor: 0xf0f4f0, dir: 0.4,
    cloud: 0xf4f8f9, cloudEmissive: 0xc9d8dd, cloudEmissiveI: 0.42,
    bird: 0x6b7480,
    stars: false,
  },
  night: {
    id: 'night', name: 'Starry Night', icon: '🌙',
    skyHorizon: 0x1b2a52, skyZenith: 0x060b1e,
    sunTint: 0xd8e4ff, glow: 0.45,          // the "sun" disc is now the moon
    shallow: 0x1f6068, deep: 0x05162c, skyReflect: 0x93aade,
    haze: 0x111c38, fogNear: 140, fogFar: 520,
    sun: [-0.36, 0.6, -0.71],
    hemiSky: 0x375282, hemiGround: 0x141f38, hemi: 0.5,
    dirColor: 0xbcd0ff, dir: 0.45,
    cloud: 0x4d5a7a, cloudEmissive: 0x1b2440, cloudEmissiveI: 0.5,
    bird: 0x121628,
    stars: true,
  },
};

export const THEME_ORDER = ['day', 'sunset', 'misty', 'night'];

export function themeById(id) { return THEMES[id] || THEMES.day; }

/**
 * Re-tint the live scene.
 * ctx: { scene, renderer, sky, water, hemi, dir }
 */
export function applyTheme(id, ctx) {
  const t = themeById(id);
  const { scene, renderer, sky, water, hemi, dir } = ctx;

  if (renderer) renderer.setClearColor(t.skyHorizon);
  if (scene && scene.fog) {
    scene.fog.color.setHex(t.haze);
    scene.fog.near = t.fogNear;
    scene.fog.far = t.fogFar;
  }

  if (sky) {
    const u = sky.uniforms;
    u.uHorizon.value.setHex(t.skyHorizon);
    u.uZenith.value.setHex(t.skyZenith);
    u.uSunTint.value.setHex(t.sunTint);
    u.uGlow.value = t.glow;
    u.uSunDir.value.set(t.sun[0], t.sun[1], t.sun[2]).normalize();
    sky.cloudMat.color.setHex(t.cloud);
    sky.cloudMat.emissive.setHex(t.cloudEmissive);
    sky.cloudMat.emissiveIntensity = t.cloudEmissiveI;
    sky.birdMat.color.setHex(t.bird);
    sky.setStars(t.stars);
  }

  if (water) {
    const u = water.uniforms;
    u.uShallow.value.setHex(t.shallow);
    u.uDeep.value.setHex(t.deep);
    u.uSky.value.setHex(t.skyReflect);
    u.uHaze.value.setHex(t.haze);
    u.uSunDir.value.set(t.sun[0], t.sun[1], t.sun[2]).normalize();
  }

  if (hemi) {
    hemi.color.setHex(t.hemiSky);
    hemi.groundColor.setHex(t.hemiGround);
    hemi.intensity = t.hemi;
  }
  if (dir) {
    dir.color.setHex(t.dirColor);
    dir.intensity = t.dir;
    dir.position.set(t.sun[0], t.sun[1], t.sun[2]).normalize().multiplyScalar(160);
  }
  return t;
}
