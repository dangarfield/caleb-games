# Arcade Boilerplate

The HTML/CSS/canvas starting point every game shares. This is *knowledge* (read
just-in-time by the builder), not a rule file — the MUST rules live in
`.apm/instructions/arcade-build.instructions.md`.

## HTML shell

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="mobile-web-app-capable" content="yes">
<title>Game Name - Garfield Boys' Arcade</title>
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

## Back button (REQUIRED — href MUST be ../../index.html)

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

`href` must be `../../index.html` (two levels up from `games/<name>/`). The
`back-button-check` hook enforces this; `../../` and `/` 404 on GitHub Pages.

## Start overlay

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

## Color palette

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

Background gradient: `#0a0a2e` → `#141452` → `#1a1a6e` (3-stop vertical).

## Canvas setup

```js
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W, H;
function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize();
window.addEventListener('resize', resize);
```

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

## Porting from an open-source repo
1. Clone into `games/<name>/research/` (gitignored) — `git clone <repo-url> games/<name>/research/<repo-name>`.
2. Use it as reference; implement in `games/<name>/index.html` using these conventions.
3. Don't copy-paste wholesale — adapt to single-file, Canvas 2D, dark theme, touch-first, Web Audio, shared localStorage.

Examples: Speed Racer ported from `js13kGames/dr1v3n-wild`, Racer 13 from
`js13kGames/sub13`, Worms references `hedgewars`.
