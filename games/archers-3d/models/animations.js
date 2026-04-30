/**
 * Procedural animation generator for rigged GLB models.
 * Analyzes skeleton hierarchy and generates AnimationClips at runtime.
 * Usage: const clip = createAnimation(skinnedMesh, 'idle-normal');
 */
import * as THREE from 'three';

function findSkinnedMesh(model) {
  let mesh = null;
  model.traverse(c => { if (c.isSkinnedMesh && !mesh) mesh = c; });
  return mesh;
}

function analyzeSkeleton(skinnedMesh) {
  const bones = skinnedMesh.skeleton.bones;
  let rootBone = bones.find(b => !b.parent || !b.parent.isBone) || bones[0];
  const depthMap = new Map();
  const walk = (bone, depth) => { depthMap.set(bone, depth); bone.children.forEach(c => { if (c.isBone) walk(c, depth + 1); }); };
  walk(rootBone, 0);
  let maxDepth = 0; depthMap.forEach(d => { if (d > maxDepth) maxDepth = d; });
  // Find head (topmost Y)
  let topBone = bones[0], topY = -Infinity;
  bones.forEach(b => { const wp = new THREE.Vector3(); b.getWorldPosition(wp); if (wp.y > topY) { topY = wp.y; topBone = b; } });
  return { bones, rootBone, topBone, depthMap, maxDepth };
}

function makeTimes(duration, fps) {
  const n = Math.floor(duration * fps);
  const times = []; for (let i = 0; i <= n; i++) times.push(i / fps);
  return { times, numFrames: n };
}

// --- Idle ---
function idleAnimation(info, flying) {
  const duration = 2.0, td = makeTimes(duration, 30), tracks = [];
  if (flying) {
    const rp = [];
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; rp.push(info.rootBone.position.x, info.rootBone.position.y + Math.sin(t * Math.PI * 2) * 0.08, info.rootBone.position.z); }
    tracks.push(new THREE.VectorKeyframeTrack(info.rootBone.name + '.position', td.times, rp));
  }
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const amplitude = 0.04 + nd * 0.06, phase = depth * 0.3;
    const axis = depth % 2 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const rots = []; const baseQ = bone.quaternion.clone();
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone(); q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, Math.sin((t + phase) * Math.PI * 2) * amplitude)); rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip(flying ? 'idle-flying' : 'idle-normal', duration, tracks);
}

// --- Move Human ---
function moveHumanAnimation(info) {
  const duration = 1.0, td = makeTimes(duration, 30), tracks = [];
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (depth > info.maxDepth * 0.6 && depth % 2 === 0) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(t * Math.PI * 2) * 0.3 * (bone.name.charCodeAt(bone.name.length - 1) % 2 === 0 ? 1 : -1))); }
      else if (depth > info.maxDepth * 0.3 && depth < info.maxDepth * 0.7 && depth % 2 === 1) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(t * Math.PI * 2) * 0.15 * (bone.name.charCodeAt(bone.name.length - 1) % 2 === 0 ? -1 : 1))); }
      else if (depth > 0 && depth <= 2) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * Math.PI * 2) * 0.04)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('move-human', duration, tracks);
}

// --- Move Fly ---
function moveFlyAnimation(info) {
  const duration = 1.0, td = makeTimes(duration, 30), tracks = [];
  const rp = [];
  for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; rp.push(info.rootBone.position.x, info.rootBone.position.y + Math.sin(t * Math.PI * 2) * 0.04, info.rootBone.position.z); }
  tracks.push(new THREE.VectorKeyframeTrack(info.rootBone.name + '.position', td.times, rp));
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (depth > info.maxDepth * 0.6 && depth % 2 === 0) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(t * Math.PI * 2) * 0.3 * (bone.name.charCodeAt(bone.name.length - 1) % 2 === 0 ? 1 : -1))); }
      else if (depth > info.maxDepth * 0.3 && depth < info.maxDepth * 0.7 && depth % 2 === 1) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin(t * Math.PI * 2) * 0.15 * (bone.name.charCodeAt(bone.name.length - 1) % 2 === 0 ? -1 : 1))); }
      else if (depth > 0 && depth <= 2) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * Math.PI * 2) * 0.04)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('move-fly', duration, tracks);
}

// --- Move Slither ---
function moveSlitherAnimation(info) {
  const duration = 2.0, td = makeTimes(duration, 30), tracks = [];
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const rots = []; const baseQ = bone.quaternion.clone(); const phase = depth * 0.6;
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin((t + phase) * Math.PI * 2) * (0.08 + nd * 0.12)));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin((t + phase * 0.5) * Math.PI * 4) * 0.03));
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('move-slither', duration, tracks);
}

// --- Move Quad ---
function moveQuadAnimation(info) {
  const duration = 0.8, td = makeTimes(duration, 30), tracks = [];
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    const wp = new THREE.Vector3(); bone.getWorldPosition(wp);
    const phase = (wp.x < 0 ? 0 : 0.5) + (nd > 0.5 ? 0.25 : 0);
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (depth > info.maxDepth * 0.4) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.sin((t + phase) * Math.PI * 2) * 0.25)); }
      else if (depth > 0 && depth <= 3) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * Math.PI * 4) * 0.03)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('move-quad', duration, tracks);
}

// --- Attack Throw ---
function attackThrowAnimation(info, side) {
  const dir = side === 'left' ? -1 : 1;
  const duration = 0.8, td = makeTimes(duration, 30), tracks = [];
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    const wp = new THREE.Vector3(); bone.getWorldPosition(wp);
    const isSide = dir > 0 ? wp.x > 0.01 : wp.x < -0.01;
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (isSide && depth > info.maxDepth * 0.3 && depth < info.maxDepth * 0.8) { let p; if (t < 0.4) p = -Math.sin(t / 0.4 * Math.PI * 0.5) * 0.6; else p = Math.sin((t - 0.4) / 0.6 * Math.PI * 0.5) * 1.0; q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), p)); }
      else if (depth > 0 && depth <= 2) { let l; if (t < 0.4) l = -Math.sin(t / 0.4 * Math.PI * 0.5) * 0.1; else l = Math.sin((t - 0.4) / 0.6 * Math.PI * 0.5) * 0.15; q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), l)); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l * dir * 0.3)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('attack-throw-' + side, duration, tracks);
}

// --- Attack Leap ---
function attackLeapAnimation(info) {
  const duration = 1.0, td = makeTimes(duration, 30), tracks = [];
  const rp = [];
  for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; let y = 0;
    if (t < 0.25) y = -Math.sin(t / 0.25 * Math.PI * 0.5) * 0.04;
    else if (t < 0.5) y = ((t - 0.25) / 0.25) * 0.1 - 0.04;
    else if (t < 0.75) y = 0.06 - ((t - 0.5) / 0.25) * 0.1;
    else y = -0.04 + ((t - 0.75) / 0.25) * 0.04;
    rp.push(info.rootBone.position.x, info.rootBone.position.y + y, info.rootBone.position.z); }
  tracks.push(new THREE.VectorKeyframeTrack(info.rootBone.name + '.position', td.times, rp));
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (depth > info.maxDepth * 0.5) { let tk = 0; if (t < 0.25) tk = Math.sin(t / 0.25 * Math.PI * 0.5) * 0.4; else if (t < 0.5) tk = 0.4 - ((t - 0.25) / 0.25) * 0.6; else if (t < 0.75) tk = -0.2 + ((t - 0.5) / 0.25) * 0.3; else tk = 0.1 * (1 - (t - 0.75) / 0.25); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tk)); }
      else if (depth > 0 && depth <= 3) { let l = 0; if (t < 0.3) l = Math.sin(t / 0.3 * Math.PI * 0.5) * 0.15; else if (t < 0.6) l = 0.15; else l = 0.15 * (1 - (t - 0.6) / 0.4); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), l)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('attack-leap', duration, tracks);
}

// --- Attack Bite ---
function attackBiteAnimation(info) {
  const duration = 0.7, td = makeTimes(duration, 30), tracks = [];
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    const isHead = bone === info.topBone || (info.topBone.parent && bone === info.topBone.parent);
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      if (isHead) { let a = 0; if (t < 0.35) a = -Math.sin(t / 0.35 * Math.PI * 0.5) * 0.4; else if (t < 0.55) a = -0.4 + ((t - 0.35) / 0.2) * 1.0; else a = 0.6 * Math.exp(-(t - 0.55) * 8); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a)); }
      else if (depth > 0 && depth <= 3) { let f = 0; if (t < 0.35) f = -Math.sin(t / 0.35 * Math.PI * 0.5) * 0.1; else if (t < 0.55) f = -0.1 + ((t - 0.35) / 0.2) * 0.25; else f = 0.15 * Math.exp(-(t - 0.55) * 6); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('attack-bite', duration, tracks);
}

// --- Damage ---
function damageAnimation(info, direction) {
  const duration = 0.6, td = makeTimes(duration, 30), tracks = [];
  const backAngle = -0.35; let sideAngle = 0;
  if (direction === 'back-left') sideAngle = 0.25;
  else if (direction === 'back-right') sideAngle = -0.25;
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    const isHead = bone === info.topBone || (info.topBone.parent && bone === info.topBone.parent);
    const isUpper = depth > 0 && depth <= 3;
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      let intensity = 0; if (t < 0.15) intensity = t / 0.15; else if (t < 0.35) intensity = 1.0; else intensity = 1.0 - (t - 0.35) / 0.65;
      if (isHead) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), backAngle * intensity * 1.2)); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sideAngle * intensity * 1.2)); }
      else if (isUpper) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), backAngle * intensity * 0.4)); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), sideAngle * intensity * 0.4)); }
      else if (depth > 3) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), backAngle * intensity * 0.1)); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('damage-' + direction, duration, tracks);
}

// --- Death ---
function deathAnimation(info, direction) {
  const duration = 1.5, td = makeTimes(duration, 30), tracks = [];
  const rp = [];
  for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; let drop = 0;
    if (t < 0.15) drop = 0; else if (t < 0.6) drop = -Math.pow((t - 0.15) / 0.45, 2) * 0.15; else drop = -0.15 - (t - 0.6) / 0.4 * 0.03;
    rp.push(info.rootBone.position.x, info.rootBone.position.y + drop, info.rootBone.position.z); }
  tracks.push(new THREE.VectorKeyframeTrack(info.rootBone.name + '.position', td.times, rp));
  let fallX = 0, fallZ = 0;
  if (direction === 'back') { fallX = -0.8; } else if (direction === 'side') { fallZ = 0.9; } else if (direction === 'front') { fallX = 0.6; }
  info.bones.forEach(bone => {
    const depth = info.depthMap.get(bone) || 0;
    const nd = info.maxDepth > 0 ? depth / info.maxDepth : 0;
    const rots = []; const baseQ = bone.quaternion.clone();
    const isHead = bone === info.topBone || (info.topBone.parent && bone === info.topBone.parent);
    for (let i = 0; i <= td.numFrames; i++) { const t = i / td.numFrames; const q = baseQ.clone();
      let intensity = 0; if (t < 0.15) intensity = t / 0.15 * 0.3; else if (t < 0.7) intensity = 0.3 + ((t - 0.15) / 0.55) * 0.7; else intensity = 1.0;
      if (isHead) { const hl = Math.min(1, intensity * 1.3); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fallX * hl)); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), fallZ * hl)); if (t > 0.15 && t < 0.7) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 20) * 0.05)); }
      else if (depth <= 3 && depth > 0) { q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), fallX * intensity * 0.7)); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), fallZ * intensity * 0.7)); }
      else if (depth > 3) { const ld = Math.max(0, intensity - 0.2) / 0.8; q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ld * 0.3 * (1 + nd * 0.5))); q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ld * 0.15 * (bone.name.charCodeAt(bone.name.length-1) % 2 === 0 ? 1 : -1))); }
      rots.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(bone.name + '.quaternion', td.times, rots));
  });
  return new THREE.AnimationClip('death-' + direction, duration, tracks);
}

// --- Public API ---
export function createAnimation(model, variantName) {
  const mesh = findSkinnedMesh(model);
  if (!mesh || !mesh.skeleton) return null;
  const info = analyzeSkeleton(mesh);
  switch (variantName) {
    case 'idle-normal': return idleAnimation(info, false);
    case 'idle-flying': return idleAnimation(info, true);
    case 'move-human': return moveHumanAnimation(info);
    case 'move-fly': return moveFlyAnimation(info);
    case 'move-slither': return moveSlitherAnimation(info);
    case 'move-quad': return moveQuadAnimation(info);
    case 'attack-throw-right': return attackThrowAnimation(info, 'right');
    case 'attack-throw-left': return attackThrowAnimation(info, 'left');
    case 'attack-leap': return attackLeapAnimation(info);
    case 'attack-bite': return attackBiteAnimation(info);
    case 'damage-back': return damageAnimation(info, 'back');
    case 'damage-back-left': return damageAnimation(info, 'back-left');
    case 'damage-back-right': return damageAnimation(info, 'back-right');
    case 'death-back': return deathAnimation(info, 'back');
    case 'death-side': return deathAnimation(info, 'side');
    case 'death-front': return deathAnimation(info, 'front');
    default: return null;
  }
}

export function createAllAnimations(model, config) {
  const clips = {};
  for (const [slot, variant] of Object.entries(config)) {
    if (variant) { const clip = createAnimation(model, variant); if (clip) clips[slot] = clip; }
  }
  return clips;
}
