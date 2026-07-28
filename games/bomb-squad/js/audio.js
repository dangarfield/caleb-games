// Audio - Web Audio SFX (no files)
let audioCtx = null;

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type, vol, endFreq) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), ctx.currentTime + duration);
  gain.gain.setValueAtTime(vol || 0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + duration);
}

function playNoise(duration, vol) {
  const ctx = ensureAudio();
  const buf = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol || 0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 1;
  src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime + duration);
}

export function playWireSnip() {
  playNoise(0.08, 0.15);
  playTone(800, 0.05, 'square', 0.06);
}

export function playButtonClick() {
  playTone(600, 0.06, 'sine', 0.1);
  playTone(900, 0.04, 'sine', 0.06);
}

export function playSwitchToggle() {
  playTone(400, 0.04, 'square', 0.08);
  setTimeout(() => playTone(600, 0.03, 'square', 0.06), 40);
}

export function playKeyTurn() {
  playTone(300, 0.1, 'sawtooth', 0.05, 500);
  playNoise(0.06, 0.04);
}

export function playKeypadPress() {
  playTone(700, 0.05, 'sine', 0.08);
}

export function playValveTap() {
  playTone(200, 0.04, 'triangle', 0.08);
  playNoise(0.03, 0.05);
}

export function playScrewTurn() {
  playTone(250, 0.08, 'sawtooth', 0.04, 350);
}

export function playExplosion() {
  playNoise(0.8, 0.25);
  playTone(80, 0.6, 'sawtooth', 0.2, 20);
  setTimeout(() => playNoise(0.4, 0.15), 100);
  setTimeout(() => playTone(40, 0.5, 'sine', 0.15, 15), 200);
}

export function playSuccess() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, 'triangle', 0.1), i * 100);
  });
}

export function playLevelComplete() {
  const notes = [523, 659, 784, 880, 1047, 1319];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.25, 'triangle', 0.12), i * 120);
  });
}

export function playCountdownTick() {
  playTone(1000, 0.03, 'square', 0.05);
}
