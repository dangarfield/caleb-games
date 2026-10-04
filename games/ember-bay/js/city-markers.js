// Quest markers for the 3D town: hovering map-pin in the game's colour with its icon, spinning light burst, glow, light column + ground pool.
import * as THREE from 'three';

const FG = { fire: '#fff3e2', rescue: '#1c1d1f', water: '#fff3e2', safety: '#1c1d1f', drive: '#f2f1ec' };
const GLOW = { drive: '#b9bec4' };
const R = 2.3, H = R * 2.05, DEPTH = R * 0.5, BEV = R * 0.32, HOVER = 5.2, CY = HOVER + H; // CY = pin circle centre height

let shared = null;
function sharedParts() {
  if (shared) return shared;
  const a = Math.acos(R / H), s = new THREE.Shape();
  s.moveTo(0, -H); s.lineTo(R * Math.sin(a), -R * Math.cos(a));
  s.absarc(0, 0, R, -(Math.PI / 2 - a), Math.PI + (Math.PI / 2 - a), false); s.lineTo(0, -H);
  const pin = new THREE.ExtrudeGeometry(s, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV * 0.85, bevelSegments: 6, curveSegments: 40 });
  pin.translate(0, 0, -DEPTH / 2); pin.computeVertexNormals();
  const face = DEPTH / 2 + BEV + 0.03;
  const icon = new THREE.PlaneGeometry(R * 1.45, R * 1.45);
  // burst: alternating long/short rays, alpha fading to the tips
  const N = 12, P = [], C = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2, w = 0.085, L = i % 2 ? 8 : 12;
    P.push(0, 0, 0, Math.cos(t - w) * L, Math.sin(t - w) * L, 0, Math.cos(t + w) * L, Math.sin(t + w) * L, 0);
    C.push(1, 1, 1, 0.45, 1, 1, 1, 0, 1, 1, 1, 0);
  }
  const burst = new THREE.BufferGeometry(); burst.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); burst.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
  const colH = CY - R * 0.2, col = new THREE.CylinderGeometry(0.9, 2.6, colH, 28, 1, true); col.translate(0, colH / 2, 0);
  { const pos = col.attributes.position, c = []; for (let i = 0; i < pos.count; i++) { const k = pos.getY(i) / colH; c.push(1, 1, 1, 0.32 * (1 - k)); } col.setAttribute('color', new THREE.Float32BufferAttribute(c, 4)); }
  const pool = new THREE.CircleGeometry(4.6, 40); pool.rotateX(-Math.PI / 2);
  { const pos = pool.attributes.position, c = []; for (let i = 0; i < pos.count; i++) { const k = Math.hypot(pos.getX(i), pos.getZ(i)) / 4.6; c.push(1, 1, 1, 0.55 * Math.pow(1 - k, 1.6)); } pool.setAttribute('color', new THREE.Float32BufferAttribute(c, 4)); }
  const g = document.createElement('canvas'); g.width = g.height = 128; const x = g.getContext('2d'), rg = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,0.85)'); rg.addColorStop(0.35, 'rgba(255,255,255,0.28)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, 128, 128);
  shared = { pin, face, icon, burst, col, pool, glowTex: new THREE.CanvasTexture(g), icons: new Map() };
  return shared;
}

function iconTex(name) {
  const S = sharedParts(); if (S.icons.has(name)) return S.icons.get(name);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const draw = () => { const x = cv.getContext('2d'); x.clearRect(0, 0, 256, 256); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = "220px 'Material Symbols Sharp'"; x.fillText(name, 128, 134); tex.needsUpdate = true; };
  (document.fonts ? document.fonts.load("220px 'Material Symbols Sharp'", name) : Promise.resolve()).then(draw, draw);
  S.icons.set(name, tex); return tex;
}

const add = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const tag = (m, call, op = 1) => { m.userData.call = call; m.userData.op = op; return m; };

export function makeMarker({ cat, icon, call }) {
  const S = sharedParts(), hex = new THREE.Color({ fire: '#e2452f', rescue: '#f2cf1d', water: '#2f88c4', safety: '#f2f1ec', drive: '#3b3c3f' }[cat] || '#e2452f');
  const glowCol = new THREE.Color(GLOW[cat] || hex.getStyle());
  const grp = new THREE.Group(), pin = new THREE.Group(); pin.position.y = CY; grp.add(pin);
  const body = new THREE.Mesh(S.pin, new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.22, roughness: 0.38, metalness: 0, transparent: true }));
  body.castShadow = false; pin.add(tag(body, call));
  const im = new THREE.MeshBasicMaterial({ map: iconTex(icon), color: FG[cat] || '#fff', transparent: true, depthWrite: false, toneMapped: false });
  for (const sgn of [1, -1]) { const m = new THREE.Mesh(S.icon, im); m.position.z = sgn * S.face; if (sgn < 0) m.rotation.y = Math.PI; m.renderOrder = 2; pin.add(tag(m, call)); }
  const burst = new THREE.Mesh(S.burst, add(glowCol, 0.9)); burst.position.y = CY; burst.renderOrder = -1; grp.add(tag(burst, null, 0.9));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glowTex, color: glowCol, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.scale.setScalar(12); glow.position.y = CY; grp.add(tag(glow, null, 1));
  const colM = new THREE.Mesh(S.col, add(glowCol, 1)), poolM = new THREE.Mesh(S.pool, add(glowCol, 1)); grp.add(tag(colM, null, 1), tag(poolM, null, 1));
  const ph = Math.random() * 6.28;
  grp.userData.marker = {
    update(t, camera) {
      const near = camera.position.distanceToSquared(grp.position) < 380 * 380;
      burst.visible = colM.visible = poolM.visible = near;
      pin.position.y = CY + Math.sin(t * 2.1 + ph) * 0.45; pin.rotation.y = t * 1.1 + ph;
      burst.position.y = glow.position.y = pin.position.y;
      burst.quaternion.copy(camera.quaternion); burst.rotateZ(t * 0.5 + ph);
      const pulse = 0.85 + 0.15 * Math.sin(t * 3.2 + ph);
      glow.scale.setScalar(12 * pulse); burst.scale.setScalar(0.9 + 0.1 * pulse);
    },
  };
  return grp;
}

export function setMarkerDim(grp, dim) { grp.traverse(o => { if (o.material && o.userData.op !== undefined) o.material.opacity = o.userData.op * (dim ? 0.18 : 1); }); }
