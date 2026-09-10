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

## Web Audio SFX (no audio files)

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


## Theme music (when there IS an audio file)

The SFX above are generated, so most games ship no audio assets at all. A game
with a **theme tune** is the exception: the user hands over an mp3 and it has to
be encoded, wired in, and — this is the part that is easy to get wrong — kept
quiet and kept out of the way.

### Encoding

Encode the supplied mp3 to **Opus in WebM, 48k VBR**, and take **6dB off it** on
the way through. Strip any embedded cover art (`-vn`); a JPEG welded inside an
mp3 is pure weight.

```sh
ffmpeg -i theme.mp3 -vn -map 0:a:0 -af "volume=-6dB" \
       -c:a libopus -b:a 48k -vbr on -application audio -ar 48000 \
       audio/<name>-theme.webm
```

Typical result: a 2-minute 192k mp3 goes from ~3MB to ~930KB.

**Make the file quiet, not the player.** Background music mixed at full level and
then turned down in JavaScript is one `volume` line away from being deafening.
Encoding it 6dB down means the file is already background level wherever it ends
up, and there is no magic number to lose.

**One file, not two.** The only thing that cannot read WebM is Safari before 16.
Carrying a second AAC copy of the whole track for it would undo most of what the
encode just saved, and the point of the exercise is space. Ship the WebM.

### Wiring

```html
<!-- No controls, on purpose. preload="none" so nothing is fetched until the
     first gesture, which is also the first moment it could play. -->
<audio id="theme" src="audio/<name>-theme.webm" loop preload="none"
       aria-hidden="true"></audio>
```

```js
/* Nothing loads and nothing plays until the first pointer, touch or key event
   anywhere on the document. Browsers refuse audio until the page has been
   interacted with, so that gesture is the earliest it could start anyway — and
   a tune that begins before anybody has touched anything is startling. */
function music() {
  const el = document.getElementById('theme');
  if (!el) return;
  const LEVEL = 0.5;                      // on top of the 6dB off the file
  const EVENTS = ['pointerdown', 'touchstart', 'keydown'];
  let playing = false;

  const arm    = () => EVENTS.forEach(e => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach(e => document.removeEventListener(e, start, true));

  function start() {
    disarm();
    el.volume = LEVEL;
    let p;
    try { el.load(); p = el.play(); } catch (e) { arm(); return; }
    // refused: the browser wanted a different gesture. Wait for the next one.
    if (p && p.then) p.then(() => { playing = true; }, arm);
    else playing = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (!playing) return;                 // never started; leave it alone
    if (document.hidden) el.pause();
    else el.play().catch(() => {});
  });

  arm();
}
```

### Rules

- **No mute button, no volume slider, no "music: on" in a settings panel.** One
  tune, quiet, looping. The tab being in front of you is the only control.
- **No fade-in.** The file is already at background level, so a ramp is a ramp
  for its own sake. (A fade is worth it only if the track opens loud, and the
  right fix for that is a better encode.)
- **`loop` on the element**, not an `ended` handler. The browser wraps cleanly.
- **Pause on `visibilitychange`.** Track it with your own `playing` flag, not
  `el.paused` — once you have paused it for a hidden tab those two say the same
  thing, and reading `el.paused` leaves the music off for good.
- **One encode only.** No fallback source, no mp3 alongside it.
- **Test that nothing is fetched before the gesture.** Listen on `page.on('request')`
  in Playwright and assert the audio URL is absent until after the first click.

See `games/dragonseed/` for a worked example (`js/game.js` → `music()`,
`tests/musictest.mjs`).

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
