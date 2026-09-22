#!/usr/bin/env python3
"""Cut the hiker out of the Ultimate Modular Men pack.

Adventurer.glb ships with twenty-four animations — sword slashes, gun poses,
death — and the sampler keyframes are nearly all of its 1.9 MB. The map needs
three: standing, walking, running. Everything else is dropped and the buffer is
rebuilt from only the views that survive, which is the difference between
shipping the character and shipping the character twice over in clips nobody
plays.

Textures: there are none. The pack is untextured, materials are flat colours,
so nothing has to be resized or written alongside.
"""
import json, struct, sys, os

SRC = os.path.join(os.path.dirname(__file__), '..', 'research',
                   'Ultimate Modular Men Pack-glb', 'Adventurer.glb')
OUT = os.path.join(os.path.dirname(__file__), '..', 'models', 'Adventurer.glb')

# The names the game asks for, as `character.js` spells them.
#
# Three was right while he only ever walked in a straight line. He now strafes,
# kneels at a lake to fill a bottle, and kneels at a box to pick up gear — so the
# directional runs and `Interact` earn their keyframes. `Wave` is for spotting an
# animal. The other sixteen are sword slashes, gun poses and dying, and stay out.
KEEP = {'Idle', 'Walk', 'Run', 'Run_Left', 'Run_Right', 'Run_Back', 'Interact', 'Wave'}


def read_glb(path):
    d = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', d, 0)
    assert magic == 0x46546C67, 'not a glb'
    off, js, bin_ = 12, None, b''
    while off < total:
        clen, ctype = struct.unpack_from('<II', d, off)
        chunk = d[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf8'))
        elif ctype == 0x004E4942:
            bin_ = chunk
        off += 8 + clen
    return js, bin_


def pack_glb(js, bin_, path):
    j = json.dumps(js, separators=(',', ':')).encode('utf8')
    j += b' ' * (-len(j) % 4)
    b = bin_ + b'\x00' * (-len(bin_) % 4)
    total = 12 + 8 + len(j) + (8 + len(b) if b else 0)
    out = struct.pack('<III', 0x46546C67, 2, total)
    out += struct.pack('<II', len(j), 0x4E4F534A) + j
    if b:
        out += struct.pack('<II', len(b), 0x004E4942) + b
    open(path, 'wb').write(out)
    return total


def shrink_attributes(js, bin_):
    """Drop the UVs and narrow the skin attributes, rewriting their data in place.

    The data is stashed on each accessor as `_data`; `main` writes that out
    instead of re-reading the old bufferView when it rebuilds the buffer.
    """
    import array
    for m in js.get('meshes', []):
        for p in m['primitives']:
            p['attributes'].pop('TEXCOORD_0', None)

    for a in js.get('accessors', []):
        a['_data'] = None

    def raw(a):
        bv = js['bufferViews'][a['bufferView']]
        st = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        return bv, st

    for m in js.get('meshes', []):
        for p in m['primitives']:
            ji = p['attributes'].get('JOINTS_0')
            if ji is not None:
                a = js['accessors'][ji]
                if a['componentType'] == 5123:            # ushort -> ubyte
                    bv, st = raw(a)
                    n = a['count'] * 4
                    v = array.array('H'); v.frombytes(bin_[st:st + n * 2])
                    assert max(v) < 256, 'more than 255 joints'
                    a['_data'] = array.array('B', v).tobytes()
                    a['componentType'] = 5121
            wi = p['attributes'].get('WEIGHTS_0')
            if wi is not None:
                a = js['accessors'][wi]
                if a['componentType'] == 5126:            # float -> normalised ubyte
                    bv, st = raw(a)
                    n = a['count'] * 4
                    f = array.array('f'); f.frombytes(bin_[st:st + n * 4])
                    b = array.array('B', [0]) * n
                    # round the set of four together and push the rounding error
                    # into the largest weight, so every vertex still sums to 255
                    for i in range(0, n, 4):
                        q = [int(round(min(1.0, max(0.0, f[i + k])) * 255)) for k in range(4)]
                        big = max(range(4), key=lambda k: q[k])
                        q[big] = max(0, min(255, q[big] + 255 - sum(q)))
                        for k in range(4):
                            b[i + k] = q[k]
                    a['_data'] = b.tobytes()
                    a['componentType'] = 5121
                    a['normalized'] = True


def main():
    js, bin_ = read_glb(SRC)
    before = len(bin_)

    # 1. keep only the clips we want, renamed to the bare verb
    anims = []
    for a in js.get('animations', []):
        short = a.get('name', '').split('|')[-1]
        if short in KEEP:
            a['name'] = short
            anims.append(a)
    got = {a['name'] for a in anims}
    missing = KEEP - got
    if missing:
        sys.exit('missing clips: %s' % sorted(missing))
    js['animations'] = anims

    # 2a. the pack is untextured, so every UV is dead weight; and 86 joints fit
    #     in a byte, so the joint indices do too. Both are lossless.
    shrink_attributes(js, bin_)

    # 2. which accessors are still reachable?
    used_acc = set()
    for m in js.get('meshes', []):
        for p in m['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p:
                used_acc.add(p['indices'])
            for t in p.get('targets', []):
                used_acc.update(t.values())
    for s in js.get('skins', []):
        if 'inverseBindMatrices' in s:
            used_acc.add(s['inverseBindMatrices'])
    for a in anims:
        for s in a['samplers']:
            used_acc.add(s['input'])
            used_acc.add(s['output'])

    # 3. renumber accessors, and the bufferViews they and the images need
    acc_map, accessors = {}, []
    for i, a in enumerate(js.get('accessors', [])):
        if i in used_acc:
            acc_map[i] = len(accessors)
            accessors.append(a)

    used_bv = {a['bufferView'] for a in accessors
               if 'bufferView' in a and a.get('_data') is None}
    for im in js.get('images', []):
        if 'bufferView' in im:
            used_bv.add(im['bufferView'])

    # 4. rebuild the binary chunk, 4-byte aligned. An accessor we rewrote in
    #    step 2a carries its new bytes on `_data` and gets a view of its own;
    #    everything else is copied across as it stands.
    bv_map, views, blob = {}, [], bytearray()

    def put(data, src=None):
        blob.extend(b'\x00' * (-len(blob) % 4))
        nbv = dict(src) if src else {}
        nbv['buffer'] = 0
        nbv['byteOffset'] = len(blob)
        nbv['byteLength'] = len(data)
        nbv.pop('byteStride', None)          # our data is tightly packed
        blob.extend(data)
        views.append(nbv)
        return len(views) - 1

    for i, bv in enumerate(js.get('bufferViews', [])):
        if i not in used_bv:
            continue
        start = bv.get('byteOffset', 0)
        bv_map[i] = put(bin_[start:start + bv['byteLength']], bv)

    for a in accessors:
        data = a.pop('_data', None)
        if data is not None:
            a['bufferView'] = put(data)
            a.pop('byteOffset', None)
        elif 'bufferView' in a:
            a['bufferView'] = bv_map[a['bufferView']]

    for im in js.get('images', []):
        if 'bufferView' in im:
            im['bufferView'] = bv_map[im['bufferView']]
    for m in js.get('meshes', []):
        for p in m['primitives']:
            p['attributes'] = {k: acc_map[v] for k, v in p['attributes'].items()}
            if 'indices' in p:
                p['indices'] = acc_map[p['indices']]
            if 'targets' in p:
                p['targets'] = [{k: acc_map[v] for k, v in t.items()} for t in p['targets']]
    for s in js.get('skins', []):
        if 'inverseBindMatrices' in s:
            s['inverseBindMatrices'] = acc_map[s['inverseBindMatrices']]
    for a in anims:
        for s in a['samplers']:
            s['input'] = acc_map[s['input']]
            s['output'] = acc_map[s['output']]

    for a in js.get('accessors', []):
        a.pop('_data', None)
    js['accessors'] = accessors
    js['bufferViews'] = views
    js['buffers'] = [{'byteLength': len(blob)}]
    js.pop('extensionsUsed', None) if not js.get('extensionsUsed') else None

    total = pack_glb(js, bytes(blob), OUT)
    print('clips %s' % sorted(got))
    print('bin %d -> %d bytes, file %d bytes' % (before, len(blob), total))


if __name__ == '__main__':
    main()
