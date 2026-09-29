# Summer Champs: sound audit and suggestions

For Dan to read and pick from. Nothing in this file is built yet apart from the theme music and its ducking.

## 1. What's there now

| Where | What it does | Verdict |
|---|---|---|
| **Theme** `audio/summer-champs-theme.webm` | Your `summer-champs.m4a`: the 1.2 s of silence at the end trimmed so the loop doesn't gap, then encoded 6dB down to Opus 48k (1.1 MB, 2:59). Plays from the first tap and loops. **Ducks** to about -11dB when an event starts, comes back up when it finishes, and also comes back up while paused. | Done. No mute, per the arcade rule. |
| UI tap (`on()` in `sc-ui.js`) | 880Hz triangle, 40ms, on every menu button | OK as a placeholder, but a bit "computer". |
| L / R pads | 520 / 600Hz square, 30ms, on every tap | **Tiring.** At 9 taps a second for 10 s it's a buzzer. Replace first. |
| Event start | 300Hz sawtooth, 200ms | Sounds like an error. Replace with the start gun or whistle below. |
| Pause | 400Hz square, 50ms | Fine. |
| `cheer(v)` in `sc-world.js` | Only makes the crowd *bounce*. It already gets called at every big moment (GO, landings, PBs, podium, 13 places) | **The best hook in the game.** Put a crowd roar on it and every event gets reactions for free. |
| `splashFX(x, z, size)` / `splash()` | Visual only, and it already scales with dive entry quality | Same deal: put the splash sound on it. |

The handoff's §9 "to do" list (start gun, crowd, footsteps, splash, bow, foil, bar drop, UI taps, medal stings) is all still open. Keep the SOUND EFFECTS setting muting only these, never the theme (it already works that way).

## 2. How to make them

The arcade rule is **generated SFX, no audio files** (`knowledge/audio-patterns.md`). Almost everything below synthesises well with Web Audio: an oscillator, a noise buffer and a filter. The one exception is a *realistic* crowd, which synthesised noise only approximates. See the choice in §4.

All of it goes through `sfxOut()` in `js/sc-audio.js`, so the SOUND EFFECTS toggle and the context are already handled. Tips for the tablet:

- Make **one** 2 s white-noise buffer at boot and reuse it with random offsets. Don't allocate a buffer per sound.
- Cap it at about 8 voices at once and drop the oldest. The sprint can fire 18 sounds a second.
- Randomise pitch ±5% and level ±2dB on repeated sounds (steps, strokes, taps) so they don't machine-gun.
- The theme sits at 0.14 while you're playing, so SFX around 0.05–0.15 on the sfx bus will sit on top of it nicely.

## 3. Suggestions by moment

Priority: **P1** = biggest win for least work, **P2** = makes events feel finished, **P3** = polish.

### Everywhere

| Sound | When | Recipe | Pri |
|---|---|---|---|
| **Crowd bed** | Loops quietly under outdoor events, softer indoors (lift, piste) | Pink-ish noise → bandpass 500–900Hz, slow random LFO on the gain. Level from `W.crowd` (null = no crowd). | P1 |
| **Crowd roar** | Every `cheer(v)` call | The bed swells by `v` over 0.3 s and decays over 2.5 s, with a brighter filter (1.2kHz) and a few "whoo" sine sweeps (600→900Hz) at random | P1 |
| **Pad tap** (replaces the beep) | L/R on sprint, run-ups, swim, lift, discus spin | Short soft thud: sine 180→90Hz, 35ms, plus a tick of noise at 2kHz. L and R a semitone apart. | P1 |
| **Start gun** | GO! (sprint, swimming) | Noise burst 80ms through a lowpass falling 4k→600Hz, plus a sine drop 120→40Hz. Loud-ish, then crowd +0.6 (already there). | P1 |
| "Marks… set…" | ON YOUR MARKS / SET cues | Nothing, or a soft tick on SET. Silence before the gun is the tension. | P3 |
| **Whistle** | Starts of field events (long jump, triple, javelin, discus, lift), "GO 1 OF 3" | Two sines at 2.8k + 3.1k with vibrato, 350ms | P2 |
| **Foul horn** | FOUL, OUT OF SECTOR, NO LIFT | Square 180Hz + 190Hz (a beating buzz), 450ms, lowpass 1.5k. Not scary, "game-show wrong". | P1 |
| **PERFECT / GOOD** | Triple jump cues, gold-zone hits | Rising chime C6→G6 (triangle, 90ms each). GOOD = a single note. | P2 |
| **Medal stings** | Results screen: gold / silver / bronze / out | Gold: C–E–G–C arpeggio (triangle), then a crowd roar. Silver: C–E–G. Bronze: C–G. 4th: a single soft note, never a sad trombone for 6-year-olds. | P1 |
| **NEW PB** | Results with `pb` | Sparkle: 5 fast sines up an octave, 40ms each | P2 |
| Menu tap | All buttons | Softer than now: sine 660Hz, 25ms, with a very short attack so it's a "tock", not a beep | P2 |
| Screen swoosh | Menu → intro / results | Noise through a bandpass sweeping 400→2k, 180ms | P3 |
| **Podium fanfare** | After event 10 | Short brass-ish fanfare: detuned saws through a lowpass, 4 notes. The theme stays under it. | P2 |

### Event by event

| # | Event | Sounds (beyond the shared ones) | Pri |
|---|---|---|---|
| 1 | 100m | Start gun; tap thuds; **footsteps** tied to the Sprint loop cadence (quick noise ticks, rate = speed); finish-line crowd roar; photo-finish "click" on results | P1 |
| 2 | Long jump | Run-up footsteps; **take-off thump** on release; a rising "whoosh" while airborne (noise bandpass sweep, length = air time); **sand thud** on Land_Sand (lowpass noise 300Hz, 150ms); foul horn | P1 |
| 3 | Triple jump | As long jump, plus a thump on each hop/step. The pitch of the thump rises with quality (PERFECT = highest) so you *hear* a good rhythm. | P2 |
| 4 | Javelin | Footsteps; **release swish** (noise sweep 3k→800Hz); a soft flight whistle that Dopplers down; **thunk** into the grass (sine 90Hz + noise, 80ms) | P2 |
| 5 | Discus | **Spin whoosh** that rises with spin speed (looping bandpass noise, frequency follows the dial rate); release grunt-free "hup" swish; a metallic **clank-thud** on landing (a sine pair at 400/620Hz, quick decay, plus a thud) | P2 |
| 6 | High diving | Wind rush during the fall (noise, gain grows with speed); a soft whoosh per spin/twist; **splash scaled by entry**: head-first = tight "plip", belly-flop = big "splat" (noise burst, lowpass, length and level from `splashFX` size); muffled underwater bed while the camera is under (`W.isUnder`): lowpass the crowd to 400Hz | P1 |
| 7 | Archery | **Bow creak** while drawing (quiet sawtooth 60–90Hz, pitch rising with draw); **twang** on release (plucked string: noise into a short comb/delay at ~220Hz, or a sine 220Hz with a fast decay); **thwack** on the target, brighter for gold rings; wind "hush" scaled by the wind value | P1 |
| 8 | 50m swim | Start gun; **stroke splashes** alternating L/R (short filtered noise, rate = stroke rate); tumble-turn "bloop"; crowd bed softer and echoey (pool = indoor-ish) | P2 |
| 9 | Weightlifting | Weight-card "clunk" as you choose; **chalk puff** on setup (tiny noise); effort strain = a low rising hum while lifting (not a voice); STEADY taps as soft ticks; **GOOD LIFT** bell (single triangle 1.5k plus a crowd roar); **bar drop crash** (big low noise thud + metallic ring 180/270Hz) | P1 |
| 10 | Fencing | "En garde / Prêts / Allez" as three rising ticks; **blade clash** on parry (two detuned squares at 2.2k/2.9k, 60ms, fast decay: a "shing"); **touch buzzer** on a hit (the real fencing box sound: square 440Hz, 400ms, one per scorer); the bout-winning touch gets the crowd | P1 |

### Crowd reactions worth adding to the code

`cheer()` already fires on the big moments. Two small hooks would make it much better:

- A **"ooh"** (disappointed): a falling sine sweep 700→400Hz layered on the crowd for fouls, NO LIFT, a missed arrow and a belly-flop. Needs a `groan()` next to `cheer()`.
- An **anticipation build**: the crowd rises slowly during the last 20 m of the sprint and swim and while the lifter is holding.

## 4. The one decision for you

**The crowd.** Synthesised noise gets you a believable "stadium hum" and swells, but not *voices*. There are two ways to do it:

1. **All-synth (recommended to start):** follows the arcade rule, zero bytes. It sounds like a crowd from far away, which suits the low-poly look.
2. **One CC0 crowd loop** (about 10 s, mono Opus 32k, roughly 40 KB) plus synth swells on top. It's much more "Olympics", but it breaks the no-audio-files rule for SFX, so it would need a line in `docs/decisions.memory.md` like the theme-music exception has.

Tell me 1 or 2. Everything else in §3 is synth either way.

## 5. Suggested build order

1. P1 shared: tap thud, start gun, foul horn, medal stings, crowd bed + roar on `cheer()`. One sitting, and every event feels alive.
2. P1 events: dive splash, archery twang/thwack, fencing clash/buzzer, bar drop, sprint footsteps.
3. P2 and then P3.
