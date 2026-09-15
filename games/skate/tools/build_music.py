#!/usr/bin/env python3
"""build_music.py — turn a folder of songs into the game's music.

    python3 tools/build_music.py                    # from research/songs/, into assets/music/
    python3 tools/build_music.py path/to/songs      # somewhere else
    python3 tools/build_music.py -b64               # a different bitrate

Writes assets/music/<slug>.ogg for every track, and assets/music/music.json
listing them with their titles and lengths, which is what the game reads.

Three things happen to each track on the way in.

FORMAT. The files came out of Suno as ".m4a", which they are not: they are
Opus inside an MP4 container, a combination almost nothing outside Chrome will
play. Safari will not touch it. So everything is re-packed as Ogg Opus, which
is both playable and the most efficient codec available for this.

SIZE. Opus at 80k beat AAC at 128k on a spectral comparison against the source
— partly because the source is itself Opus, so staying in the same codec keeps
its own artefacts rather than layering new ones on top. 80k is the setting
where the album lands near half its original size and the vocals still sound
like the vocals; these songs are ABOUT the boys, so the words matter.

LOUDNESS. The tracks arrive up to several dB apart, which is very obvious when
one follows another on shuffle. Each is measured and given ONE flat gain to
land it on the same loudness — not a compressor. These are already squashed
flat (a loudness range of about 2.5 dB), and running a dynamic normaliser over
material like that makes it pump. A single number cannot.
"""

import json
import os
import re
import subprocess
import sys

BITRATE = 80               # kbit/s, Opus, stereo
TARGET_I = -16.0           # LUFS, a comfortable level under the sound effects
TARGET_TP = -1.5           # dBTP, headroom so nothing clips on the way out
SUFFIX = ('.m4a', '.mp3', '.wav', '.flac', '.ogg', '.opus', '.aac')

# Slugs that title case gets wrong, because they are names being spelled out
SPECIAL = {
    'e-zed-r-a': 'E-Zed-R-A',
    'seeayellybee': 'Seeayellybee',
}
SMALL = {'the', 'a', 'an', 'of', 'to', 'with', 'in', 'on', 'and'}


def slug(name):
    """'kickflip-dreams [3ffc...].m4a' -> 'kickflip-dreams'"""
    return re.sub(r'\s*\[[^\]]*\]\s*', '', os.path.splitext(name)[0]).strip()


def title(s):
    if s in SPECIAL:
        return SPECIAL[s]
    words = s.replace('_', '-').split('-')
    out = []
    for i, w in enumerate(words):
        out.append(w if (i and w.lower() in SMALL) else w[:1].upper() + w[1:])
    return ' '.join(out)


def probe(path):
    """(loudness in LUFS, true peak in dBTP, length in seconds)"""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', path,
                        '-af', 'loudnorm=print_format=json', '-f', 'null', os.devnull],
                       capture_output=True, text=True).stderr
    m = re.search(r'\{[^{}]*"input_i"[^{}]*\}', r, re.S)
    if not m:
        raise SystemExit('could not measure %s' % path)
    d = json.loads(m.group(0))
    secs = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                           '-of', 'default=nw=1:nk=1', path],
                          capture_output=True, text=True).stdout.strip()
    return float(d['input_i']), float(d['input_tp']), float(secs or 0)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    args = [a for a in sys.argv[1:] if not a.startswith('-b')]
    bs = [a for a in sys.argv[1:] if a.startswith('-b')]
    rate = bs[-1][2:].lstrip('=') if bs else str(BITRATE)

    src = args[0] if args else os.path.join(root, 'research', 'songs')
    if not os.path.isdir(src):
        raise SystemExit('no such folder: %s' % src)
    # the songs may sit one folder further down, as they do out of Suno
    files = [os.path.join(src, f) for f in sorted(os.listdir(src))
             if f.lower().endswith(SUFFIX)]
    if not files:
        for d in sorted(os.listdir(src)):
            p = os.path.join(src, d)
            if os.path.isdir(p):
                files += [os.path.join(p, f) for f in sorted(os.listdir(p))
                          if f.lower().endswith(SUFFIX)]
    if not files:
        raise SystemExit('no audio under %s' % src)

    out_dir = os.path.join(root, 'assets', 'music')
    os.makedirs(out_dir, exist_ok=True)

    force = '-f' in sys.argv or '--force' in sys.argv
    tracks, before, after = [], 0, 0
    for path in files:
        s = slug(os.path.basename(path))
        dest = os.path.join(out_dir, s + '.ogg')
        # Encoding a dozen songs takes minutes, so a run that gets interrupted
        # picks up where it left off rather than starting again.
        if not force and os.path.exists(dest) \
                and os.path.getmtime(dest) >= os.path.getmtime(path):
            secs = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                                   'format=duration', '-of', 'default=nw=1:nk=1', dest],
                                  capture_output=True, text=True).stdout.strip()
            b, a = os.path.getsize(path), os.path.getsize(dest)
            before += b
            after += a
            tracks.append({'file': s + '.ogg', 'title': title(s),
                           'seconds': round(float(secs or 0), 1)})
            print('  %-30s already done' % title(s))
            continue
        i, tp, secs = probe(path)
        # one number: whichever of loudness and peak asks for less
        gain = min(TARGET_I - i, TARGET_TP - tp)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path,
                        '-af', 'volume=%.2fdB' % gain,
                        '-c:a', 'libopus', '-b:a', rate + 'k', '-vbr', 'on',
                        '-ac', '2', '-map_metadata', '-1', dest], check=True)
        b, a = os.path.getsize(path), os.path.getsize(dest)
        before += b
        after += a
        tracks.append({'file': s + '.ogg', 'title': title(s), 'seconds': round(secs, 1)})
        print('  %-30s %5.1f LUFS %+5.1f dB  %5.1f -> %4.1f MB'
              % (title(s), i, gain, b / 1048576.0, a / 1048576.0))

    with open(os.path.join(out_dir, 'music.json'), 'w') as f:
        json.dump({'tracks': tracks}, f, indent=2)
    print('  %d tracks, %.1f MB -> %.1f MB at %sk (%.0f%% smaller)'
          % (len(tracks), before / 1048576.0, after / 1048576.0, rate,
             100 * (1 - after / max(before, 1))))


if __name__ == '__main__':
    main()
