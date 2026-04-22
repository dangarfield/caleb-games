let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, dur, type, vol, endFreq) {
  const c = ensureAudio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), c.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.1, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

function playNoise(dur, vol) {
  const c = ensureAudio();
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol || 0.08, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 800;
  f.Q.value = 1;
  src.connect(f);
  f.connect(g);
  g.connect(c.destination);
  src.start();
  src.stop(c.currentTime + dur);
}

export function sfxShoot() {
  // Bowstring twang: quick pluck with pitch drop
  const c = ensureAudio();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(420, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.1);
  g.gain.setValueAtTime(0.07, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  o.connect(g);
  g.connect(c.destination);
  o.start();
  o.stop(c.currentTime + 0.12);
  // String vibration overtone
  const o2 = c.createOscillator();
  const g2 = c.createGain();
  o2.type = 'sine';
  o2.frequency.setValueAtTime(840, c.currentTime);
  o2.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.08);
  g2.gain.setValueAtTime(0.03, c.currentTime);
  g2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  o2.connect(g2);
  g2.connect(c.destination);
  o2.start();
  o2.stop(c.currentTime + 0.08);
  // Subtle whoosh
  playNoise(0.06, 0.02);
}

export function sfxHit() {
  playTone(200, 0.12, 'sawtooth', 0.06, 80);
}

export function sfxEnemyDie() {
  playTone(300, 0.2, 'square', 0.08, 600);
  playNoise(0.1, 0.05);
}

export function sfxPlayerHit() {
  playTone(150, 0.25, 'sawtooth', 0.1, 60);
  playNoise(0.15, 0.08);
}

export function sfxStageClear() {
  playTone(523, 0.12, 'triangle', 0.1);
  setTimeout(() => playTone(659, 0.12, 'triangle', 0.1), 100);
  setTimeout(() => playTone(784, 0.2, 'triangle', 0.12), 200);
}

export function sfxGameOver() {
  playTone(400, 0.3, 'sawtooth', 0.1, 100);
  setTimeout(() => playTone(300, 0.4, 'sawtooth', 0.1, 60), 300);
}

export function sfxEnemyShoot() {
  playTone(250, 0.1, 'triangle', 0.03, 150);
}

export function sfxCoin() {
  playTone(880, 0.08, 'sine', 0.08);
  playTone(1100, 0.1, 'sine', 0.06);
}

export function sfxLevelUp() {
  playTone(523, 0.1, 'triangle', 0.1);
  setTimeout(() => playTone(659, 0.1, 'triangle', 0.1), 80);
  setTimeout(() => playTone(784, 0.1, 'triangle', 0.1), 160);
  setTimeout(() => playTone(1047, 0.2, 'triangle', 0.12), 240);
}

export function sfxSkillPick() {
  playTone(700, 0.15, 'sine', 0.1, 1200);
}

export function sfxEquip() {
  playTone(500, 0.1, 'triangle', 0.08, 800);
}

export function sfxHeal() {
  playTone(600, 0.15, 'sine', 0.08, 900);
  playTone(900, 0.1, 'sine', 0.06);
}

export function sfxChapterClear() {
  playTone(523, 0.12, 'triangle', 0.12);
  setTimeout(() => playTone(659, 0.12, 'triangle', 0.12), 100);
  setTimeout(() => playTone(784, 0.12, 'triangle', 0.12), 200);
  setTimeout(() => playTone(1047, 0.12, 'triangle', 0.14), 300);
  setTimeout(() => playTone(1319, 0.15, 'triangle', 0.14), 400);
  setTimeout(() => playTone(1568, 0.3, 'triangle', 0.16), 500);
}
