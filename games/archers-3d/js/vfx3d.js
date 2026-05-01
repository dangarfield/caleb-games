// vfx3d.js — GPU particle system, trail ribbons, ground shadows, impact effects
// Shared VFX infrastructure for all projectile and spell effects.

import * as THREE from 'three';

// ─── Simplex 2D noise (GLSL) — shared across shaders ───
export const GLSL_NOISE_2D = `
vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289v3(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289v2(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m;m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}`;

// ─── GPU Particle System ───
// Uses THREE.Points with per-particle attributes, updated on CPU each frame.
// Supports multiple "emitter" channels sharing one particle buffer.

export class GPUParticleSystem {
  constructor(scene, maxParticles = 2048) {
    this.max = maxParticles;
    this.count = 0;

    // CPU-side arrays
    this._pos = new Float32Array(maxParticles * 3);
    this._vel = new Float32Array(maxParticles * 3);
    this._col = new Float32Array(maxParticles * 3);
    this._colOrig = new Float32Array(maxParticles * 3); // original colors for fading
    this._size = new Float32Array(maxParticles);
    this._age = new Float32Array(maxParticles);
    this._life = new Float32Array(maxParticles);
    this._drag = new Float32Array(maxParticles);
    this._gravity = new Float32Array(maxParticles);

    this._geo = new THREE.BufferGeometry();
    // Pre-allocate buffer attributes with DynamicDrawUsage for reuse each frame
    const posAttr = new THREE.Float32BufferAttribute(this._pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute('position', posAttr);
    const colAttr = new THREE.Float32BufferAttribute(this._col, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    this._geo.setAttribute('color', colAttr);
    this._geo.setDrawRange(0, 0);

    // Generate a stylized teardrop/comet trail texture via canvas
    const texSize = 128;
    const canvas = document.createElement('canvas');
    canvas.width = texSize; canvas.height = texSize;
    const ctx = canvas.getContext('2d');
    const cx = texSize / 2, cy = texSize / 2;

    // Elongated teardrop shape — bright hot core, streaky tail
    // Base: soft elliptical glow (taller than wide for a streak feel)
    const grad = ctx.createRadialGradient(cx, cy * 0.8, 0, cx, cy, cx * 0.9);
    grad.addColorStop(0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.1, 'rgba(255,250,240,0.95)');
    grad.addColorStop(0.25, 'rgba(255,220,180,0.7)');
    grad.addColorStop(0.45, 'rgba(255,180,100,0.35)');
    grad.addColorStop(0.7, 'rgba(200,120,60,0.1)');
    grad.addColorStop(1, 'rgba(100,60,30,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, texSize, texSize);

    // Add a vertical streak (comet-tail effect)
    ctx.globalCompositeOperation = 'lighter';
    const streakGrad = ctx.createLinearGradient(cx, 0, cx, texSize);
    streakGrad.addColorStop(0, 'rgba(255,255,255,0)');
    streakGrad.addColorStop(0.25, 'rgba(255,240,200,0.2)');
    streakGrad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    streakGrad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    streakGrad.addColorStop(0.6, 'rgba(255,240,200,0.5)');
    streakGrad.addColorStop(0.8, 'rgba(255,180,80,0.15)');
    streakGrad.addColorStop(1, 'rgba(200,100,50,0)');
    ctx.beginPath();
    ctx.ellipse(cx, cy, texSize * 0.18, texSize * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = streakGrad;
    ctx.fill();

    // Hot bright center dot
    const coreGrad = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, texSize * 0.15);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1.0)');
    coreGrad.addColorStop(0.5, 'rgba(255,255,230,0.8)');
    coreGrad.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, texSize, texSize);

    // 6-point subtle star spikes for sparkle
    for (let angle = 0; angle < 6; angle++) {
      const a = (angle / 6) * Math.PI * 2;
      const sGrad = ctx.createLinearGradient(
        cx - Math.cos(a) * cx * 0.7, cy - Math.sin(a) * cy * 0.7,
        cx + Math.cos(a) * cx * 0.7, cy + Math.sin(a) * cy * 0.7
      );
      sGrad.addColorStop(0, 'rgba(255,255,255,0)');
      sGrad.addColorStop(0.42, 'rgba(255,240,200,0.08)');
      sGrad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
      sGrad.addColorStop(0.58, 'rgba(255,240,200,0.08)');
      sGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, 0, texSize, texSize);
    }

    const tex = new THREE.CanvasTexture(canvas);

    this.mat = new THREE.PointsMaterial({
      size: 0.8,
      sizeAttenuation: true,
      vertexColors: true,
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    });

    this.points = new THREE.Points(this._geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
    this._scene = scene;
  }

  emit(pos, vel, color, size, lifetime, drag = 0.97, gravity = 0) {
    if (this.count >= this.max) return;
    const i = this.count;
    const i3 = i * 3;
    this._pos[i3] = pos.x; this._pos[i3+1] = pos.y; this._pos[i3+2] = pos.z;
    this._vel[i3] = vel.x; this._vel[i3+1] = vel.y; this._vel[i3+2] = vel.z;
    this._col[i3] = color.r; this._col[i3+1] = color.g; this._col[i3+2] = color.b;
    this._colOrig[i3] = color.r; this._colOrig[i3+1] = color.g; this._colOrig[i3+2] = color.b;
    this._size[i] = size;
    this._age[i] = 0;
    this._life[i] = lifetime;
    this._drag[i] = drag;
    this._gravity[i] = gravity;
    this.count++;
  }

  // Emit a burst of particles in random directions
  burst(pos, color, count, speed, size, lifetime, opts = {}) {
    const { drag = 0.95, gravity = 0, spread = 1, dirBias = null } = opts;
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * 0.5 + 0.2,
        (Math.random() - 0.5) * spread
      );
      if (dirBias) {
        dir.x += dirBias.x * 0.5;
        dir.y += dirBias.y * 0.5;
        dir.z += dirBias.z * 0.5;
      }
      dir.normalize();
      const spd = speed * (0.5 + Math.random() * 0.5);
      const sz = size * (0.7 + Math.random() * 0.6);
      const lt = lifetime * (0.6 + Math.random() * 0.8);
      // Slight color variation
      const cv = new THREE.Color(c.r + (Math.random()-0.5)*0.1, c.g + (Math.random()-0.5)*0.1, c.b + (Math.random()-0.5)*0.1);
      this.emit(pos, { x: dir.x*spd, y: dir.y*spd, z: dir.z*spd }, cv, sz, lt, drag, gravity);
    }
  }

  // Emit a trail particle at a position (slow-moving, short-lived)
  trail(pos, color, size, lifetime, opts = {}) {
    const { velY = 0.3, spread = 0.2, drag = 0.92, gravity = 0 } = opts;
    const c = new THREE.Color(color);
    this.emit(
      { x: pos.x + (Math.random()-0.5)*spread, y: pos.y + Math.random()*0.05, z: pos.z + (Math.random()-0.5)*spread },
      { x: (Math.random()-0.5)*0.5, y: velY + Math.random()*0.3, z: (Math.random()-0.5)*0.5 },
      c, size * (0.8 + Math.random()*0.4), lifetime * (0.7 + Math.random()*0.6), drag, gravity
    );
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this._age[i] += dt;
      if (this._age[i] >= this._life[i]) {
        // Swap-remove with last
        const last = this.count - 1;
        if (i !== last) {
          const i3 = i * 3, l3 = last * 3;
          this._pos[i3]=this._pos[l3]; this._pos[i3+1]=this._pos[l3+1]; this._pos[i3+2]=this._pos[l3+2];
          this._vel[i3]=this._vel[l3]; this._vel[i3+1]=this._vel[l3+1]; this._vel[i3+2]=this._vel[l3+2];
          this._col[i3]=this._col[l3]; this._col[i3+1]=this._col[l3+1]; this._col[i3+2]=this._col[l3+2];
          this._colOrig[i3]=this._colOrig[l3]; this._colOrig[i3+1]=this._colOrig[l3+1]; this._colOrig[i3+2]=this._colOrig[l3+2];
          this._size[i]=this._size[last]; this._age[i]=this._age[last]; this._life[i]=this._life[last];
          this._drag[i]=this._drag[last]; this._gravity[i]=this._gravity[last];
        }
        this.count--;
        i--;
        continue;
      }
      const i3 = i * 3;
      const drag = Math.pow(this._drag[i], dt * 60);
      this._vel[i3] *= drag; this._vel[i3+1] *= drag; this._vel[i3+2] *= drag;
      this._vel[i3+1] -= this._gravity[i] * dt;
      this._pos[i3] += this._vel[i3] * dt;
      this._pos[i3+1] += this._vel[i3+1] * dt;
      this._pos[i3+2] += this._vel[i3+2] * dt;
      // Fade color based on lifetime
      const t = this._age[i] / this._life[i];
      const fade = 1.0 - t * t;
      this._col[i3]   = this._colOrig[i3]   * fade;
      this._col[i3+1] = this._colOrig[i3+1] * fade;
      this._col[i3+2] = this._colOrig[i3+2] * fade;
    }
    // Update existing buffer attributes (pre-allocated with DynamicDrawUsage)
    const n = this.count;
    const geo = this._geo;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, n);
  }

  dispose() {
    this._scene.remove(this.points);
    this._geo.dispose();
    this.mat.dispose();
  }
}

// ─── Ground Shadow Pool ───
// Fake projected shadows for airborne projectiles (lobs, meteors, stars)

export class GroundShadowPool {
  constructor(scene, maxShadows = 64) {
    this.max = maxShadows;
    this.active = 0;

    // Shared shadow texture
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);

    const geo = new THREE.PlaneGeometry(1, 1);
    this._mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
    });

    this._group = new THREE.Group();
    this._group.name = 'groundShadows';
    this._meshes = [];
    for (let i = 0; i < maxShadows; i++) {
      const m = new THREE.Mesh(geo, this._mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this._group.add(m);
      this._meshes.push(m);
    }
    scene.add(this._group);
    this._scene = scene;
  }

  hideAll() {
    for (let i = 0; i < this.active; i++) this._meshes[i].visible = false;
    this.active = 0;
  }

  // Show a shadow at worldX, worldZ based on projectile height
  show(worldX, worldZ, height, baseScale = 1.0) {
    if (this.active >= this.max) return;
    const m = this._meshes[this.active++];
    m.visible = true;
    m.position.set(worldX, 0.02, worldZ);
    // Higher = larger + fainter shadow
    const scale = baseScale * (0.6 + Math.min(height, 8) * 0.08);
    m.scale.setScalar(scale);
    m.material.opacity = Math.max(0.05, 0.4 - height * 0.03);
  }

  dispose() {
    this._scene.remove(this._group);
    this._mat.map.dispose();
    this._mat.dispose();
    this._meshes[0].geometry.dispose();
  }
}

// ─── Impact Ring Effect ───
// Expanding shockwave ring with shader

const impactRingShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uProgress;
    uniform vec3 uColor;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0;
      float r = length(c);
      // Ring shape: sharp band that thins as it expands
      float ringWidth = 0.15 * (1.0 - uProgress);
      float ringR = 0.3 + uProgress * 0.5;
      float ring = smoothstep(ringR - ringWidth, ringR, r) * smoothstep(ringR + ringWidth, ringR, r);
      // Second inner ring (thinner, faster)
      float innerR = 0.2 + uProgress * 0.7;
      float innerW = 0.06 * (1.0 - uProgress);
      float inner = smoothstep(innerR - innerW, innerR, r) * smoothstep(innerR + innerW, innerR, r) * 0.5;
      float alpha = (ring + inner) * (1.0 - uProgress) * uIntensity;
      // Outer fade
      alpha *= smoothstep(1.0, 0.7, r);
      gl_FragColor = vec4(uColor * (1.5 + ring), alpha);
    }
  `,
};

export class ImpactRingPool {
  constructor(scene, maxRings = 24) {
    this.max = maxRings;
    this._rings = [];
    this._group = new THREE.Group();
    this._group.name = 'impactRings';

    const geo = new THREE.PlaneGeometry(1, 1);

    for (let i = 0; i < maxRings; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uColor: { value: new THREE.Color(1, 0.5, 0.2) },
          uIntensity: { value: 1.0 },
        },
        ...impactRingShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this._group.add(mesh);
      this._rings.push({ mesh, mat, active: false, age: 0, duration: 0 });
    }
    scene.add(this._group);
    this._scene = scene;
  }

  spawn(worldX, worldZ, radius, color, duration = 0.4, intensity = 1.0) {
    for (const ring of this._rings) {
      if (!ring.active) {
        ring.active = true;
        ring.age = 0;
        ring.duration = duration;
        ring.mesh.visible = true;
        ring.mesh.position.set(worldX, 0.05, worldZ);
        ring.mesh.scale.setScalar(radius * 2);
        ring.mat.uniforms.uColor.value.set(color);
        ring.mat.uniforms.uIntensity.value = intensity;
        ring.mat.uniforms.uProgress.value = 0;
        return;
      }
    }
  }

  update(dt) {
    for (const ring of this._rings) {
      if (!ring.active) continue;
      ring.age += dt;
      const t = ring.age / ring.duration;
      if (t >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      // easeOutQuad for expansion
      const eased = 1 - (1 - t) * (1 - t);
      ring.mat.uniforms.uProgress.value = eased;
    }
  }

  dispose() {
    this._scene.remove(this._group);
    for (const ring of this._rings) {
      ring.mat.dispose();
    }
    this._rings[0].mesh.geometry.dispose();
  }
}

// ─── Element color definitions ───
export const ELEM_VFX = {
  fire:   { core: '#ffffff', mid: '#ff8c00', outer: '#ff4500', trail: '#ff6b2b', glow: '#ffaa00', mist: '#884400' },
  ice:    { core: '#ffffff', mid: '#88ddff', outer: '#4488cc', trail: '#74b9ff', glow: '#aaddff', mist: '#ddeeff' },
  poison: { core: '#ccff00', mid: '#44bb00', outer: '#006600', trail: '#2ecc71', glow: '#66ff66', mist: '#ccff88' },
  bolt:   { core: '#ffffff', mid: '#ffd700', outer: '#4444ff', trail: '#ffd32a', glow: '#ffee88', mist: '#ffffcc' },
};

// ─── Utility: spawn element-appropriate trail particle ───
export function emitElementTrail(particles, pos, element, intensity = 1) {
  const e = ELEM_VFX[element];
  if (!e) return;
  const color = e.trail;
  const size = 6.0 * intensity;
  const life = 0.35 + Math.random() * 0.15;

  if (element === 'fire') {
    // Ember particle — bright rising spark
    particles.trail(pos, color, size, life, { velY: 1.2 + Math.random()*0.6, drag: 0.94, gravity: -0.5 });
    // Spark particle — fast, bright, small
    particles.trail(pos, '#ffcc00', size * 0.6, life * 0.5, { velY: 1.5 + Math.random()*0.8, drag: 0.9, spread: 0.15 });
    // Smoke particle — darker, larger, slower
    particles.trail(pos, '#884400', size * 1.3, life * 1.2, { velY: 0.4, drag: 0.97, spread: 0.1 });
  } else if (element === 'ice') {
    // Frost crystal — bright, drifting
    particles.trail(pos, '#aaddff', size * 0.9, life * 1.2, { velY: -0.1, drag: 0.96, spread: 0.15 });
    // Ice mist — larger, faint, lingers
    particles.trail(pos, '#ddeeff', size * 1.2, life * 1.4, { velY: 0.05, drag: 0.98, spread: 0.2 });
    // Small frost sparkle
    particles.trail(pos, '#ffffff', size * 0.5, life * 0.6, { velY: 0.2, drag: 0.92, spread: 0.1 });
  } else if (element === 'poison') {
    // Bubble — rising, larger
    particles.trail(pos, color, size * 1.1, life * 0.9, { velY: 0.6, drag: 0.9, spread: 0.2 });
    // Drip — falling, smaller
    particles.trail(pos, '#44bb00', size * 0.8, life * 0.7, { velY: -0.4, drag: 0.93, spread: 0.08 });
  } else if (element === 'bolt') {
    // Bright spark — shoots fast
    const c = new THREE.Color(Math.random() > 0.5 ? '#ffd32a' : '#ffffff');
    particles.emit(
      { x: pos.x + (Math.random()-0.5)*0.2, y: pos.y, z: pos.z + (Math.random()-0.5)*0.2 },
      { x: (Math.random()-0.5)*4, y: Math.random()*3, z: (Math.random()-0.5)*4 },
      c, size * 0.7, life * 0.4, 0.88, 2
    );
    // Afterglow — slower, larger, lingers
    particles.trail(pos, '#ffee88', size * 0.9, life * 0.6, { velY: 0.4, drag: 0.94, spread: 0.12 });
    // Secondary spark
    const c2 = new THREE.Color(Math.random() > 0.3 ? '#ffd32a' : '#ffffff');
    particles.emit(
      { x: pos.x + (Math.random()-0.5)*0.15, y: pos.y, z: pos.z + (Math.random()-0.5)*0.15 },
      { x: (Math.random()-0.5)*3, y: Math.random()*2.5, z: (Math.random()-0.5)*3 },
      c2, size * 0.5, life * 0.3, 0.85, 3
    );
  }
}

// ─── Utility: spawn impact burst for an element ───
export function emitImpactBurst(particles, rings, pos, element, radius = 1.5) {
  const e = ELEM_VFX[element] || ELEM_VFX.fire;

  // Particle burst
  particles.burst(pos, e.mid, 12, 3, 2.0, 0.35, { drag: 0.92, gravity: 3 });
  // A few bright core particles
  particles.burst(pos, e.core, 4, 1.5, 1.5, 0.2, { drag: 0.95 });

  // Expanding ring
  if (rings) {
    rings.spawn(pos.x, pos.z, radius, e.mid, 0.35, 1.2);
  }
}
