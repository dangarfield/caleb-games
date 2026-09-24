# Fleet Forge — audio catalogue

Everything the game can make a noise about, in one place, so the placeholder
cues can be swapped for real recordings without hunting through five screens.

## Music

Two themes, both from Dan, encoded to the house format
(`knowledge/audio-patterns.md`): Opus in WebM, 48k VBR, **6dB off on the way
through**, so the file is at background level and nothing is turned down in JS.

```sh
ffmpeg -i research/fleet-forge-<name>.m4a -vn -map 0:a:0 -af "volume=-6dB" \
       -c:a libopus -b:a 48k -vbr on -application audio -ar 48000 \
       audio/fleet-forge-<name>.webm
```

| file | plays on | ~size |
|---|---|---|
| `audio/fleet-forge-hangar.webm` | pilot select, hangar, fitting bay, results | 1.4 MB |
| `audio/fleet-forge-battle.webm` | the arena, including a TEST flight | 1.4 MB |

`Music.to('hangar' \| 'battle')` is called from each screen's `enter`. Asking
for the theme already playing does nothing; asking for the other one **cross-fades
over two seconds** — both elements run, one up and one down, and whichever
reaches zero is paused so a finished fade is not two decoders for nothing.

**This is a deliberate departure from the house rule**, which says one tune and
no fades. Dan asked for two and for them to cross rather than cut, and for a
mute button the rule does not mention.

**The mute button is the music's alone.** It takes the themes to zero and
leaves the cue bus at its own level, so a tap, a launch and an explosion still
answer you with the music off — they are feedback for what you just did, and
turning the music down is not a request for the buttons to go dead. The cue bus
is not in `level()`'s path at all, which is what keeps the two separable.

Everything else holds: no volume slider, `loop` on the elements, paused on
`visibilitychange`, `preload="none"` so nothing is fetched before the first
gesture, and the arming list is `pointerdown / pointerup / click / touchend /
keydown` — `touchstart` never grants activation, which is the "music needs two
taps" bug.

## Cues

Generated at runtime in `js/audio.js`: a couple of oscillators and a filtered
noise burst each, on one gain bus at 0.55 so they sit under the music. **They are
placeholders.** To replace the bank with real sounds, change `CUES` — every call
site names a cue by string and nothing else has to move.

`Sfx.play(name)` — or `Sfx.play(name, seconds)` to schedule it ahead on the
audio clock rather than on a timer.

| cue | what it is | where it fires |
|---|---|---|
| `tap` | the everyday blip | **the default for every widget** — `UI.zone`, `UI.button` |
| `select` | picking a thing out of a list | hull cards, module rows (`UI.row` default), pilot cards |
| `toggle` | a segmented control moving | tier rail, fit slots, OPS/UNLOCKS, WEP/DEF/UTIL, family tabs, autofit options, match speed |
| `back` | leaving without committing | CANCEL, QUIT, the pilot chip, a module put back |
| `deny` | a refusal | locked tier, over-budget drop, CLEAR on an empty grid |
| `open` | a panel or screen opening | AUTOFIT and COPY menus, OPEN FITTING BAY, REFIT |
| `close` | the same panel closing | AUTOFIT and COPY dismissed |
| `confirm` | committing | SAVE, COPY, the first press of APPLY, `UI.primary` default |
| `grab` | a module lifted | *reserved — the drag promote does not call it yet* |
| `place` | a module set on the hull | a legal drop |
| `strip` | a module removed | a drop on DROP TO STRIP, CLEAR |
| `autofit` | the hull rebuilding | the second press of APPLY |
| `launch` | a match starting | ENTER ARENA, TEST, REMATCH |
| `win` | the verdict | result screen, on a win |
| `lose` | the verdict | result screen, on a defeat |
| `levelup` | a level gained | result screen, half a second after `win` |

### Rules for a cue

- **Short.** Under about a fifth of a second for anything that fires on a tap.
  Longer than that and it stops being feedback and starts being a noise the game
  makes at you.
- **Quiet.** Write it at a relative level and let the bus set the absolute one.
- **Never load-bearing.** `play()` on an unknown name is silence, not a throw, so
  a call site may name a cue that does not exist yet.
