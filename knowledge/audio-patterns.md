# Audio Patterns

Three things live here. **SFX are generated at runtime** by default — no audio assets. **Theme music is a
file**, with its own rules below. And **supplied audio** — music and sound effects Dan downloads from
[uppbeat.io](https://uppbeat.io) or records himself — has its own section at the bottom (files, credits,
encoding). Read this when a game needs sound.

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

The SFX above are generated, so most games ship no audio assets. A game with a
**theme tune** is the exception: encode it, wire it in, and keep it quiet.

### Encoding

Opus in WebM, 48k VBR, **6dB off on the way through**, cover art stripped:

```sh
ffmpeg -i theme.mp3 -vn -map 0:a:0 -af "volume=-6dB" \
       -c:a libopus -b:a 48k -vbr on -application audio -ar 48000 \
       audio/<name>-theme.webm
```

A 2-minute 192k mp3 lands around 930KB.

**Make the file quiet, not the player.** Music mixed at full level and turned
down in JS is one `volume` line away from being deafening; encoded 6dB down it is
background level wherever it ends up. **One encode only** — the only thing that
cannot read WebM is Safari before 16, and a second AAC copy undoes the saving.

### Wiring

```html
<!-- No controls, on purpose. preload="none" so nothing is fetched until the
     first gesture, which is also the first moment it could play. -->
<audio id="theme" src="audio/<name>-theme.webm" loop preload="none"
       aria-hidden="true"></audio>
```

```js
function music() {
  const el = document.getElementById('theme');
  if (!el) return;
  const LEVEL = 0.5;                      // on top of the 6dB off the file
  // pointerdown and touchstart do NOT grant user activation on a touch screen —
  // only pointerup, touchend, click and keydown do. See the rules below.
  const EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  let playing = false;

  const arm    = () => EVENTS.forEach(e => document.addEventListener(e, start, true));
  const disarm = () => EVENTS.forEach(e => document.removeEventListener(e, start, true));

  function start() {
    if (playing) return;                  // stay armed until it is really playing
    el.volume = LEVEL;
    let p;
    try { p = el.play(); } catch (e) { return; }   // no el.load(): it aborts the play
    if (p && p.then) p.then(() => { playing = true; disarm(); }, () => {});
    else { playing = true; disarm(); }
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

- **Arm on the events that grant activation, and stay armed until it plays.**
  `pointerdown` counts only for a mouse and `touchstart` never counts, so a
  handler on those two alone is refused on the first tap of a touch screen and
  succeeds on the second — the tap that completes leaves the page with sticky
  activation. That is the "music needs two taps" bug, and it does not show up on
  a desktop mouse.
- **Never `el.load()` before `el.play()`.** The load aborts the play that follows
  it and the promise rejects.
- **No mute button, no volume slider, no "music: on" setting.** One tune, quiet,
  looping. The tab being in front of you is the only control.
  The one exception is the arcade home page: it has a single mute button in the
  header (next to the games count), remembered in `localStorage` as
  `arcadeHomeMuted`. Games themselves still get no audio controls.
- **No fade-in.** The file is already at background level. If the track opens
  loud, fix the encode.
- **`loop` on the element**, not an `ended` handler.
- **Pause on `visibilitychange`**, tracked with your own `playing` flag — reading
  `el.paused` leaves the music off for good once you have paused it.
- **Test it with the real autoplay policy.** Never launch the browser with
  `--autoplay-policy=no-user-gesture-required`; that switches off the exact thing
  under test. Assert two things: no request for the audio URL before the first
  click, and `el.paused === false` after exactly one.

See `games/mmm-leaves/js/audio.js` for a worked example.

## Supplied audio: Uppbeat and other sources

Dan may supply **music and sound effects downloaded from [uppbeat.io](https://uppbeat.io)**, alongside his own
masters. Treat these as first-class audio assets, not exceptions: a game can ship recorded music *and* recorded
SFX files when he hands them over. Generated Web Audio SFX (above) are still the default when nothing is supplied.

### Where the files go
- **Originals** (mp3/wav as downloaded) go in `games/<name>/research/` (gitignored), keeping Uppbeat's file name,
  so the source of every shipped sound can be traced.
- **Credit:** next to each original keep `<original-name>.credit.txt` with the exact credit text Uppbeat gives
  on download (track/sound name, artist, licence code), the Uppbeat plan it was downloaded on, and the date.
  If Dan didn't pass the credit on, ask him for it rather than inventing one.
- **Shipped files:** music in `games/<name>/music/` (or `audio/`), sound effects in `games/<name>/sfx/`,
  named for what they are in the game (`ch1-the-low-meadows.webm`, `door-creak.webm`), not Uppbeat's names.

### Encoding
- **Music:** exactly as *Theme music* above (Opus in WebM, 48k VBR, cover art stripped). Trim leading and
  trailing silence if the track loops, so the loop has no gap.
- **Sound effects:** Opus in WebM, mono, 64k, `-map_metadata -1`, leading/trailing silence trimmed, peaks no
  higher than −1 dBTP. Level them against each other (aim for a similar loudness across a game's SFX set) so
  no single sound jumps out:
  ```sh
  ffmpeg -i "<uppbeat file>" -vn -ac 1 -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse" \
         -c:a libopus -b:a 64k -vbr on -map_metadata -1 sfx/<name>.webm
  ```

### Wiring
- **SFX play through Web Audio, not `<audio>` elements:** fetch and `decodeAudioData` each file once (after the
  first gesture), then play `AudioBufferSourceNode`s through one **sounds** gain node. That gives exact timing,
  lets a sound overlap itself, and works on iPad, where `el.volume` is ignored.
- **Volume:** if the game has volume controls, recorded SFX share the **Sounds** level (with narration and
  generated SFX) and music has its own **Music** level. Without controls, follow the quiet-by-default rules above.