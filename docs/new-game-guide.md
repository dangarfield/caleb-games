---
color: green
isContextNode: false
---
# New Game Guide

How to add a new game to Caleb's Arcade. Follow these conventions for consistency.

## File Structure

Create `games/<name>/index.html` — single self-contained file with inline CSS and JS.

## Using a GitHub Repo as a Base

When porting an existing open-source game:

1. Create a `research/` folder inside the game folder: `games/<name>/research/`
2. Clone the source repo into it: `git clone <repo-url> games/<name>/research/<repo-name>`
3. The `research/` folder is gitignored — it won't be committed
4. Use the cloned repo as reference, but implement the game in `games/<name>/index.html` using the conventions and boilerplate in this guide
5. Don't copy-paste wholesale — adapt the code to match the arcade's patterns (single file, Canvas 2D, dark theme, touch-first, Web Audio SFX, shared localStorage)

Examples: DR1V3N WILD was ported from `js13kGames/dr1v3n-wild`, Racer 13 from `js13kGames/sub13`, Worms references `hedgewars`.

## HTML Boilerplate

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<title>Game Name - Caleb's Arcade</title>
<style>/* styles below */</style>
</head>
<body>
<a id="backBtn" href="../../index.html">&larr; Games</a>
<canvas id="c"></canvas>
<div id="overlay">
  <h1>Game Title</h1>
  <div class="sub">Short tagline</div>
  <div class="info">Instructions — keep concise, non-intrusive</div>
  <button id="startBtn">Play</button>
</div>
<script>/* game code */</script>
</body>
</html>
```

## Core CSS

```css
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a2e; overflow:hidden; touch-action:none;
  font-family:'Segoe UI',system-ui,sans-serif; }
canvas { display:block; width:100%; height:100%; }
.hidden { display:none !important; }
```

## Back Button (REQUIRED)

```css
#backBtn { position:fixed; top:12px; left:12px; z-index:9999;
  background:rgba(0,0,0,0.55); color:#fff; text-decoration:none;
  padding:6px 18px; border-radius:20px;
  font:bold 15px/1.4 'Segoe UI',system-ui,sans-serif;
  border:1px solid rgba(255,255,255,0.18);
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
  transition:background 0.2s; }
#backBtn:hover { background:rgba(0,0,0,0.75); }
```

href must be `../../index.html` (two levels up from `games/name/`).

## Start Overlay

```css
#overlay { position:fixed; inset:0; z-index:20; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  background:rgba(0,0,0,0.7); color:#fff; text-align:center; }
#overlay h1 { font-size:clamp(2rem,8vw,4rem); margin-bottom:0.5rem; }
#overlay .sub { font-size:clamp(1rem,3vw,1.4rem); color:#a0c4ff; margin-bottom:1.5rem; }
#overlay .info { font-size:clamp(0.85rem,2.5vw,1.1rem); color:rgba(255,255,255,0.7);
  margin-bottom:2rem; max-width:500px; padding:0 1rem; line-height:1.5; }
#overlay button { padding:14px 40px; font-size:1.3rem; border:none; border-radius:12px;
  background:linear-gradient(135deg,#6c5ce7,#a29bfe); color:#fff;
  cursor:pointer; font-weight:700;
  box-shadow:0 4px 20px rgba(108,92,231,0.4); transition:transform 0.15s; }
#overlay button:hover { transform:scale(1.05); }
#overlay button:active { transform:scale(0.95); }
```

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Background base | `#0a0a2e` | Body background |
| Accent primary | `#6c5ce7` | Buttons, active elements |
| Accent glow | `#a29bfe` | Glow, hover, progress bar |
| Subtitle text | `#a0c4ff` | Overlay subtitle |
| Score highlight | `#ffd32a` | Score numbers, gold |
| White | `#fff` | Primary text |
| Muted white | `rgba(255,255,255,0.7)` | Info text |
| Error/danger | `#e74c3c` | Low lives, damage |

Background gradient: `#0a0a2e` -> `#141452` -> `#1a1a6e` (3-stop vertical).

## Canvas Setup

```js
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize();
window.addEventListener('resize', resize);
```

## Web Audio SFX (No audio files)

```js
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type, vol, endFreq) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq,20), ctx.currentTime+duration);
  gain.gain.setValueAtTime(vol||0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+duration);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime+duration);
}
function playNoise(duration, vol) {
  const ctx = ensureAudio();
  const buf = ctx.createBuffer(1, ctx.sampleRate*duration, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0; i<d.length; i++) d[i] = Math.random()*2-1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol||0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+duration);
  const filt = ctx.createBiquadFilter();
  filt.type='bandpass'; filt.frequency.value=800; filt.Q.value=1;
  src.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime+duration);
}
```

Common patterns: sawtooth 200->800Hz + noise (action), sine chime C5/E5/G5 (collect), sine 300->150Hz (hit), descending sines (game over), ascending triangles (victory).

## Shared localStorage

```js
function loadArcadeData() {
  try { return JSON.parse(localStorage.getItem('calebArcadeData')) || {}; }
  catch(e) { return {}; }
}
function saveArcadeData(data) {
  localStorage.setItem('calebArcadeData', JSON.stringify(data));
}
// Per-game: data.gameName.highScore, data.gameName.bestTime, etc.
```

## HUD Pill (Canvas-drawn, top center)

```
Position: centered horizontally, y = 14
Background: rgba(0,0,0,0.4), roundRect radius 14
Border: rgba(255,255,255,0.1) 1px stroke
Height: 52-54px, width: dynamic
```

Score: `bold 24px` white. Labels: `bold 14px` muted white. Progress bar: `#a29bfe` fill, 3-4px height.

## Game Over Screen (Canvas-drawn, NOT HTML)

1. Fade-in black overlay (globalAlpha 0 -> 0.6)
2. Title: "Game Over" — large, white, accent shadow glow blur 30
3. Score: `#ffd32a` gold
4. Play Again button: gradient fill, roundRect radius 12, 200x50px

Victory variant: `#ffd32a` glow title + confetti particles.

## Landing Page Card

After creating the game, add a card to `index.html`:
- CSS class `.card-<name>` with a themed gradient background
- Link to `games/<name>/index.html`
- Icon (emoji or inline SVG), title, and brief description

[[plan]]
