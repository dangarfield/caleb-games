let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function playTone(freq, duration, type = 'sine', vol = 0.1, endFreq = null) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), ctx.currentTime + duration);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

export function playPickup() {
  playTone(523, 0.1, 'sine', 0.12);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.1), 50);
}

export function playPlace() {
  playTone(440, 0.15, 'triangle', 0.1);
  setTimeout(() => playTone(554, 0.12, 'triangle', 0.08), 60);
  setTimeout(() => playTone(659, 0.1, 'triangle', 0.06), 120);
}

export function playError() {
  playTone(200, 0.2, 'sawtooth', 0.08, 100);
}

export function playSeriesComplete() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((n, i) => {
    setTimeout(() => playTone(n, 0.2, 'sine', 0.1), i * 100);
  });
}

export function playVictory() {
  const notes = [523, 587, 659, 698, 784, 880, 988, 1047];
  notes.forEach((n, i) => {
    setTimeout(() => playTone(n, 0.3, 'triangle', 0.08), i * 120);
  });
}

export function playAbility() {
  playTone(880, 0.15, 'sine', 0.08, 1320);
}

export function playDrop() {
  playTone(300, 0.15, 'sine', 0.06, 150);
}
