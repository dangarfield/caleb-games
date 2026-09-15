#!/usr/bin/env python3
"""build_sfx.py — pack the clipped sounds into the one file the game loads.

    python3 tools/build_sfx.py                 # from research/, into assets/audio/
    python3 tools/build_sfx.py path/to/wavs

Takes ride.wav, grind.wav, jump.wav, land.wav and crash.wav as they come out of
tools/sound-clipper.html and writes:

    assets/audio/sfx.ogg      every sound, end to end, in one file
    assets/audio/sounds.json  where each one starts and stops inside it

One file rather than five because the browser then makes one request and
decodes one buffer, and the two looping sounds can loop anywhere inside that
buffer — a looping AudioBufferSourceNode takes a loopStart and a loopEnd, and
neither has to be the ends of the file. Vorbis rather than WAV because five
seconds of 16-bit PCM is a quarter of a megabyte and the same five seconds at
q2 mono is nearer forty kilobytes, for a rumble nobody will hear the difference
in. Every clip is separated by a moment of silence so the codec cannot smear
the end of one into the start of the next.

The ride is the awkward one. A recording of rolling is twenty seconds long and
wants to be two, and the two have to join so cleanly that nobody hears the
wrap. So rather than trusting the clip's own ends, this hunts for the pair of
points inside it whose waveforms match best — a normalised cross correlation
over a 40 ms window, both ends pinned to an upward zero crossing — and cuts
there. See best_loop.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile
import wave

import numpy as np

RATE = 22050
GAP = 0.15                 # silence between clips, seconds
ORDER = ['ride', 'grind', 'jump', 'land', 'crash',
         'trick', 'pickup', 'objective', 'smash']
LOOPS = {'ride', 'grind'}
# What each sound may be called in the source folder, beyond <name>.wav and
# <name>.mp3 — the recordings arrive named for what they are, not for the
# game's word for it.
ALIASES = {
    'ride':      ['sound-skate2', 'sound-skate'],
    'grind':     ['sound-grind'],
    'jump':      ['sound-jump'],
    'crash':     ['sound-fall'],
    # first match wins, so the current pick leads and the earlier take stays
    # behind it as a fallback
    'trick':     ['sound-trick3', 'sound-trick'],
    'pickup':    ['sound-unlock', 'sound-pickup'],
    'objective': ['sound-trick4', 'sound-achieve'],
    'smash':     ['sound-glass'],
}
HUSH = 0.01                # below this share of the peak counts as dead air
PAD = 0.02                 # seconds of it kept either side, so nothing clips off
LOUD = 0.10                # samples above this share of peak are "the sound"
CEIL = 0.95                # no one-shot may peak above this
MIX = 0.89                 # and the finished pack sits here
QUALITY = 2                # Vorbis -q:a; q1 saves 9 kB but measurably worse
RIDE_LOOP = 2.0            # how long the rolling loop wants to be
MATCH = 0.04               # the window the two ends of a loop are matched over
BLEND = 0.03               # crossfade at the wrap, seconds


def load(path):
    """Any of the formats a recording turns up in, as mono float at RATE."""
    if path.lower().endswith('.wav'):
        try:
            return read_wav(path)
        except Exception:
            pass                      # not plain 16-bit PCM; let ffmpeg have it
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(RATE),
         '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float32)


def find(src, name):
    """the file for `name`, whatever it happens to be called"""
    for stem in [name] + ALIASES.get(name, []):
        for ext in ('.wav', '.mp3', '.aac', '.m4a', '.ogg', '.opus'):
            p = os.path.join(src, stem + ext)
            if os.path.exists(p):
                return p
    return None


def trim_silence(a):
    """
    Cut the dead air off both ends.

    Recordings arrive with a moment before the sound and a long nothing after
    it, and both are paid for twice: once in the file and once in the delay
    between pressing the button and hearing anything. The threshold is a share
    of the clip's own peak, so it works the same on a loud sound and a quiet
    one, and a pad either side means a soft attack is never bitten off.
    """
    peak = float(np.abs(a).max())
    if peak <= 0:
        return a, 0.0, 0.0
    w = max(1, int(RATE * 0.005))
    env = np.maximum.reduceat(np.abs(a), np.arange(0, len(a), w))
    loud = np.nonzero(env > peak * HUSH)[0]
    if not len(loud):
        return a, 0.0, 0.0
    pad = int(PAD * RATE)
    s = max(0, loud[0] * w - pad)
    e = min(len(a), (loud[-1] + 1) * w + pad)
    return a[s:e], s / RATE, (len(a) - e) / RATE


def loud_rms(a):
    """how loud the sound IS, ignoring its own silence"""
    peak = float(np.abs(a).max())
    if peak <= 0:
        return 0.0
    body = a[np.abs(a) > peak * LOUD]
    return float(np.sqrt(np.mean(body * body))) if len(body) else 0.0


def read_wav(path):
    with wave.open(path) as w:
        if w.getsampwidth() != 2:
            raise SystemExit('%s: expected 16-bit PCM' % path)
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        if w.getnchannels() == 2:
            a = a.reshape(-1, 2).mean(axis=1)
        a = a.astype(np.float32) / 32768.0
        rate = w.getframerate()
    if rate != RATE:
        n = int(round(len(a) * RATE / rate))
        a = np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)
    return a


def zero_crossings(a, lo, hi):
    """indices in [lo, hi) where the wave crosses zero going up"""
    seg = a[lo:hi]
    idx = np.nonzero((seg[:-1] <= 0) & (seg[1:] > 0))[0] + lo
    return idx


def best_loop(a, want=RIDE_LOOP):
    """
    The cleanest pair of cut points inside a rolling recording.

    Every candidate start is an upward zero crossing in the steadiest part of
    the clip; every candidate end is an upward zero crossing about `want`
    seconds later. The pair whose following 40 ms look most alike wins, which
    is as close as this gets to a join you cannot hear.

    @returns (start, end) in samples
    """
    W = int(MATCH * RATE)
    if len(a) < int((want + MATCH) * RATE) * 1.2:
        return 0, len(a)

    # the steadiest half of the clip: rolling has an attack and a run-down, and
    # neither belongs in a loop
    B = int(RATE * 0.05)
    k = len(a) // B
    env = np.sqrt((a[:k * B].reshape(k, B) ** 2).mean(axis=1))
    span = max(1, int(want * 1.4 / 0.05))
    if k > span + 2:
        means = np.convolve(env, np.ones(span) / span, 'valid')
        sds = np.array([env[i:i + span].std() for i in range(len(means))])
        score = -sds / np.maximum(means, 1e-6) + means / max(env.max(), 1e-9) * 0.3
        at = int(score.argmax()) * B
    else:
        at = 0

    starts = zero_crossings(a, at, min(len(a) - int((want + MATCH) * RATE), at + int(0.4 * RATE)))
    if not len(starts):
        starts = np.array([at])

    best, best_score = (at, at + int(want * RATE)), -2.0
    for s in starts[::4]:
        head = a[s:s + W]
        hn = np.linalg.norm(head)
        if hn < 1e-6:
            continue
        lo = s + int((want - 0.25) * RATE)
        hi = min(len(a) - W, s + int((want + 0.25) * RATE))
        if hi <= lo:
            continue
        for e in zero_crossings(a, lo, hi)[::2]:
            tail = a[e:e + W]
            tn = np.linalg.norm(tail)
            if tn < 1e-6:
                continue
            score = float(head @ tail) / (hn * tn)
            if score > best_score:
                best_score, best = score, (int(s), int(e))
    print('  ride loop: %.3fs, ends match %.3f (1.0 is identical)'
          % ((best[1] - best[0]) / RATE, best_score))
    return best


def blend_wrap(a, s, e):
    """
    Cut [s, e) out, and make its end flow into its start.

    The wrap plays sample e-1 and then sample s. Nothing can make two unrelated
    pieces of noise line up exactly, but the recording carries the samples that
    DID lead into s, so the last stretch of the loop is faded into those. By
    the time it wraps it is already most of the way to being its own beginning.
    """
    x = int(BLEND * RATE)
    body = a[s:e].copy()
    if s < x or len(body) < x * 3:
        return body
    ramp = np.linspace(1, 0, x, dtype=np.float32)
    body[-x:] = body[-x:] * ramp + a[s - x:s] * (1 - ramp)
    return body


def level(clips):
    """
    Put the one-shots at the same loudness and under the ceiling.

    They come from different places at wildly different levels — one arrived
    peaking 2 dB ABOVE full scale, already clipped, next to another at a third
    of that. Matching on the peak alone does not work, because a sharp crack
    and a sustained chime with the same peak are nothing like as loud as each
    other, so the target is the RMS of the part that is actually sounding.
    Peak still wins where the two disagree: nothing is allowed to clip.
    """
    ones = [(n, a) for n, a, loop in clips if not loop]
    rms = sorted(r for r in (loud_rms(a) for _, a in ones) if r > 0)
    if not rms:
        return
    target = rms[len(rms) // 2]          # the middle one, so nothing drags it
    for name, a in ones:
        r, peak = loud_rms(a), float(np.abs(a).max())
        if r <= 0 or peak <= 0:
            continue
        g = min(target / r, CEIL / peak)
        a *= g
        note = ''
        if peak > 1.0:
            note = '  (was clipping at %.2f)' % peak
        print('  %-9s gain %+5.1f dB -> peak %.2f%s'
              % (name, 20 * np.log10(g), float(np.abs(a).max()), note))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    args = [a for a in sys.argv[1:] if not a.startswith('-q')]
    qs = [a for a in sys.argv[1:] if a.startswith('-q')]
    quality = qs[-1][2:].lstrip('=') if qs else str(QUALITY)
    src = args[0] if args else os.path.join(root, 'research')
    out_dir = os.path.join(root, 'assets', 'audio')
    os.makedirs(out_dir, exist_ok=True)

    clips, meta = [], {}
    for name in ORDER:
        path = find(src, name)
        if not path:
            print('  %-9s missing, skipped' % name)
            continue
        a = load(path).copy()
        print('  %-9s <- %s' % (name, os.path.basename(path)))
        loop = None
        if name == 'ride':
            s, e = best_loop(a)
            a = blend_wrap(a, s, e)
            loop = (0.0, len(a) / RATE)
        elif name in LOOPS:
            # short enough to loop whole; just pin both ends to a zero crossing
            z = zero_crossings(a, 0, min(len(a), int(0.05 * RATE)))
            s = int(z[0]) if len(z) else 0
            z = zero_crossings(a, max(s + 1, len(a) - int(0.05 * RATE)), len(a))
            e = int(z[-1]) if len(z) else len(a)
            a = a[s:e]
            loop = (0.0, len(a) / RATE)
        else:
            a, cut_a, cut_b = trim_silence(a)
            if cut_a > 0.005 or cut_b > 0.005:
                print('  %-9s trimmed %.2fs of silence off the front and %.2fs '
                      'off the end' % (name, cut_a, cut_b))
            # a couple of milliseconds of fade so a one shot cannot click
            f = min(int(RATE * 0.004), len(a) // 2)
            if f:
                ramp = np.linspace(0, 1, f, dtype=np.float32)
                a[:f] *= ramp
                a[-f:] *= ramp[::-1]
        clips.append((name, a, loop))

    if not clips:
        raise SystemExit('nothing to pack')

    level(clips)

    silence = np.zeros(int(GAP * RATE), dtype=np.float32)
    parts, at = [], 0.0
    for i, (name, a, loop) in enumerate(clips):
        if i:
            parts.append(silence)
            at += GAP
        parts.append(a)
        entry = {'offset': round(at, 4), 'duration': round(len(a) / RATE, 4)}
        if loop:
            entry['loop'] = True
            entry['loopStart'] = round(at + loop[0], 4)
            entry['loopEnd'] = round(at + loop[1], 4)
        meta[name] = entry
        print('  %-9s %6.3fs at %6.3fs%s' % (name, len(a) / RATE, at, '  (loops)' if loop else ''))
        at += len(a) / RATE

    whole = np.concatenate(parts)
    peak = float(np.abs(whole).max()) or 1.0
    # One gain for the lot, so the balance between them holds. It divides by
    # the peak only when something is over full scale — dividing by it always
    # meant one hot clip quietly turned every other sound down.
    whole = whole * (MIX / max(1.0, peak))

    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        pcm = (np.clip(whole, -1, 1) * 32000).astype('<i2').tobytes()
        tmp.write(b'RIFF' + struct.pack('<I', 36 + len(pcm)) + b'WAVEfmt '
                  + struct.pack('<IHHIIHH', 16, 1, 1, RATE, RATE * 2, 2, 16)
                  + b'data' + struct.pack('<I', len(pcm)) + pcm)
        raw = tmp.name

    ogg = os.path.join(out_dir, 'sfx.ogg')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw,
                    '-c:a', 'libvorbis', '-q:a', quality, '-ac', '1', ogg], check=True)
    os.unlink(raw)

    meta['_rate'] = RATE
    with open(os.path.join(out_dir, 'sounds.json'), 'w') as f:
        json.dump(meta, f, indent=2)

    print('  wrote %s at q%s (%.1f kB for %.2fs) and sounds.json'
          % (os.path.relpath(ogg, root), quality,
             os.path.getsize(ogg) / 1024.0, len(whole) / RATE))


if __name__ == '__main__':
    main()
