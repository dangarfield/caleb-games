# Audio Patterns

Two separate things live here. **SFX are generated at runtime** — no audio assets,
and that covers almost every game. **Theme music is a file**, and the rules for it
are at the bottom. Read this when a game needs sound.

## Web Audio SFX (no files)

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

## Common patterns
- **Action / shoot:** sawtooth 200→800Hz + noise.
- **Collect / pickup:** sine chime C5/E5/G5.
- **Hit / damage:** sine 300→150Hz.
- **Game over:** descending sines.
- **Victory:** ascending triangles.

Note: audio must be kicked off a user gesture (the Play button) — `ensureAudio()`
resumes a suspended context.


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
