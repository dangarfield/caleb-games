#!/usr/bin/env python3
"""Waypoints map tracer.

Turns a photo of a printed Waypoints map into a vector map JSON:
grid -> rectified image -> contours / river / lakes / woodland / bridges /
waypoints. Output is a first pass meant to be corrected in mapper.html.

    python3 trace_map.py --src ../research/map-01.jpeg --id map-01 \
        --name "Whistling Water National Park" --labels _labels_map01.json
"""
import cv2, numpy as np, json, argparse, os, math
from skimage.morphology import skeletonize

CELL = 300  # rectified px per grid square


# ---------------------------------------------------------------- rectify
def detect_grid(img, cols, rows, roi=(30, 40, 1810, 1040)):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    x0, y0, x1, y1 = roi
    sub = g[y0:y1, x0:x1]
    m = (sub < 130).astype(np.uint8) * 255
    V = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (1, 151)))
    Hz = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (251, 1)))

    def cl(p, th, gap=14):
        idx = np.where(p > th)[0]
        out, cur = [], [idx[0]]
        for i in idx[1:]:
            if i - cur[-1] <= gap:
                cur.append(i)
            else:
                out.append(cur); cur = [i]
        out.append(cur); return out

    vc = cl(V.sum(0) / 255., 80)
    hc = [c if len(c) < 20 else c[:10] for c in cl(Hz.sum(1) / 255., 120)]
    if len(vc) != cols + 1 or len(hc) != rows + 1:
        raise SystemExit(f"grid detect: found {len(vc)}x{len(hc)} lines, expected {cols+1}x{rows+1}")

    def fitv(b):
        a, z = b[0], b[-1]; pts = []
        for yy in range(0, V.shape[0], 6):
            r = V[yy, max(0, a - 6):z + 7]
            if r.sum(): pts.append((max(0, a - 6) + np.where(r > 0)[0].mean(), yy))
        p = np.array(pts); A = np.vstack([np.ones(len(p)), p[:, 1]]).T
        return np.linalg.lstsq(A, p[:, 0], rcond=None)[0]

    def fith(b):
        a, z = b[0], b[-1]; pts = []
        for xx in range(0, Hz.shape[1], 6):
            c = Hz[max(0, a - 6):z + 7, xx]
            if c.sum(): pts.append((xx, max(0, a - 6) + np.where(c > 0)[0].mean()))
        p = np.array(pts); A = np.vstack([np.ones(len(p)), p[:, 0]]).T
        return np.linalg.lstsq(A, p[:, 1], rcond=None)[0]

    vl, hl = [fitv(c) for c in vc], [fith(c) for c in hc]
    lut = {}
    for i, c in enumerate(vl):
        for j, d in enumerate(hl):
            yy = (d[0] + d[1] * c[0]) / (1 - d[1] * c[1])
            lut[(i, j)] = (c[0] + c[1] * yy + x0, yy + y0)
    return lut


def rectify(img, lut, cols, rows):
    """Piecewise-perspective warp: exact at every grid intersection."""
    out = np.zeros((rows * CELL, cols * CELL, 3), np.uint8)
    for i in range(cols):
        for j in range(rows):
            s = np.float32([lut[(i, j)], lut[(i + 1, j)], lut[(i + 1, j + 1)], lut[(i, j + 1)]])
            d = np.float32([[i * CELL, j * CELL], [(i + 1) * CELL, j * CELL],
                            [(i + 1) * CELL, (j + 1) * CELL], [i * CELL, (j + 1) * CELL]])
            M = cv2.getPerspectiveTransform(s, d)
            w = cv2.warpPerspective(img, M, (cols * CELL, rows * CELL), flags=cv2.INTER_CUBIC)
            out[j * CELL:(j + 1) * CELL, i * CELL:(i + 1) * CELL] = \
                w[j * CELL:(j + 1) * CELL, i * CELL:(i + 1) * CELL]
    return out


# ---------------------------------------------------------------- masks
def build_masks(rect):
    hsv = cv2.cvtColor(rect, cv2.COLOR_BGR2HSV).astype(np.int16)
    h, s, v = cv2.split(hsv)
    gray = cv2.cvtColor(rect, cv2.COLOR_BGR2GRAY)
    m = {}
    m['water'] = ((h > 90) & (h < 140) & (s > 60) & (v > 60) & (v < 210)).astype(np.uint8)
    m['salmon'] = (((h < 15) | (h > 170)) & (s > 60) & (v > 140)).astype(np.uint8)
    m['black'] = ((gray < 100) & (s < 130)).astype(np.uint8)
    m['green'] = ((h > 38) & (h < 92) & (s > 70) & (v > 70) & (v < 205)).astype(np.uint8)
    for k in m:
        m[k] = cv2.morphologyEx(m[k], cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    return m, gray


def components(mask, minarea=1):
    n, lab, st, cen = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA]
        if a < minarea: continue
        out.append(dict(i=i, area=int(a), x=int(st[i, cv2.CC_STAT_LEFT]), y=int(st[i, cv2.CC_STAT_TOP]),
                        w=int(st[i, cv2.CC_STAT_WIDTH]), h=int(st[i, cv2.CC_STAT_HEIGHT]),
                        cx=float(cen[i][0]), cy=float(cen[i][1])))
    return out, lab


def compactness(mask_bin):
    cnts, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts: return 0.0
    c = max(cnts, key=cv2.contourArea)
    a, p = cv2.contourArea(c), cv2.arcLength(c, True)
    return float(4 * math.pi * a / (p * p)) if p > 0 else 0.0


def poly_from_mask(mask_bin, eps=2.5):
    cnts, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts: return []
    c = max(cnts, key=cv2.contourArea)
    ap = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
    return [[float(p[0]), float(p[1])] for p in ap]


# ---------------------------------------------------------------- skeleton tracing
NB = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


def trace_skeleton(sk, min_len=25):
    """Skeleton bitmap -> list of polylines (pixel coords)."""
    H, W = sk.shape
    pts = set(zip(*np.where(sk)))          # (y,x)
    deg = {}
    for (y, x) in pts:
        deg[(y, x)] = sum(1 for dx, dy in NB if (y + dy, x + dx) in pts)
    used = set()
    paths = []

    def walk(start, first):
        path = [start, first]
        used.add((start, first)); used.add((first, start))
        cur, prev = first, start
        while True:
            if deg.get(cur, 0) != 2:
                break
            nxt = None
            for dx, dy in NB:
                c = (cur[0] + dy, cur[1] + dx)
                if c in pts and c != prev and (cur, c) not in used:
                    nxt = c; break
            if nxt is None: break
            used.add((cur, nxt)); used.add((nxt, cur))
            path.append(nxt); prev, cur = cur, nxt
        return path

    # start at endpoints and junctions first
    seeds = [p for p in pts if deg[p] != 2]
    for p in seeds:
        for dx, dy in NB:
            q = (p[0] + dy, p[1] + dx)
            if q in pts and (p, q) not in used:
                paths.append(walk(p, q))
    # remaining closed loops
    for p in pts:
        for dx, dy in NB:
            q = (p[0] + dy, p[1] + dx)
            if q in pts and (p, q) not in used:
                paths.append(walk(p, q))
    out = []
    for pa in paths:
        if len(pa) < min_len: continue
        out.append([[float(x), float(y)] for (y, x) in pa])
    return out


def rdp(points, eps):
    pts = np.array(points, dtype=np.float64)
    if len(pts) < 3: return points
    closed = np.hypot(*(pts[0] - pts[-1])) < 3
    ap = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, closed).reshape(-1, 2)
    res = [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in ap]
    if closed and len(res) > 2: res.append(res[0])
    return res


def chaikin(points, iters=2, closed=False):
    p = [list(x) for x in points]
    for _ in range(iters):
        q = [] if closed else [p[0]]
        for i in range(len(p) - 1):
            a, b = p[i], p[i + 1]
            q.append([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25])
            q.append([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75])
        if not closed: q.append(p[-1])
        else: q.append(q[0])
        p = q
    return [[round(a, 1), round(b, 1)] for a, b in p]


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--id', required=True)
    ap.add_argument('--name', default='')
    ap.add_argument('--cols', type=int, default=6)
    ap.add_argument('--rows', type=int, default=4)
    ap.add_argument('--labels', default=None)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()

    img = cv2.imread(a.src)
    lut = detect_grid(img, a.cols, a.rows)
    rect = rectify(img, lut, a.cols, a.rows)
    W, H = a.cols * CELL, a.rows * CELL
    rectpath = os.path.join(os.path.dirname(a.src), f'{a.id}-rect.png')
    cv2.imwrite(rectpath, rect)

    m, gray = build_masks(rect)
    dbg = rect.copy()

    # ---- water: river vs lakes by compactness
    comps, lab = components(m['water'], 250)
    river_mask = np.zeros((H, W), np.uint8)
    lakes = []
    for c in comps:
        bin_ = (lab == c['i']).astype(np.uint8)
        k = compactness(bin_[c['y']:c['y'] + c['h'], c['x']:c['x'] + c['w']])
        if k > 0.42 and c['area'] < 9000:
            poly = poly_from_mask(bin_, 2.0)
            lakes.append(dict(id=f"lake{len(lakes)+1}", poly=chaikin(poly, 2, True)))
        else:
            river_mask |= bin_
    # river centreline (dilate to bridge the bridge gaps, then skeletonise)
    rm = cv2.morphologyEx(river_mask, cv2.MORPH_CLOSE, np.ones((29, 29), np.uint8))
    sk = skeletonize(rm > 0)
    river = [chaikin(rdp(p, 3.0), 2) for p in trace_skeleton(sk.astype(np.uint8), 40)]
    river.sort(key=len, reverse=True)

    # ---- woodland: green blobs
    gm = cv2.morphologyEx(m['green'], cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    gcomps, glab = components(gm, 700)
    woodland = []
    for c in gcomps:
        if c['area'] > 14000: continue           # background wash
        bin_ = (glab == c['i']).astype(np.uint8)
        if compactness(bin_[c['y']:c['y'] + c['h'], c['x']:c['x'] + c['w']]) < 0.30: continue
        woodland.append(dict(id=f"wood{len(woodland)+1}", poly=chaikin(poly_from_mask(bin_, 2.5), 2, True)))

    # ---- salmon: campsite pins, bridges, waypoint dots
    scomps, slab = components(m['salmon'], 18)
    pins, bridges, dots = [], [], []
    rdil = cv2.dilate(river_mask, np.ones((25, 25), np.uint8))
    for c in scomps:
        if c['area'] >= 900:
            pins.append(c)
        elif c['area'] >= 190:
            bridges.append(c)
        elif c['w'] <= 22 and c['h'] <= 22:
            if rdil[int(c['cy']), int(c['cx'])]:
                bridges.append(c)                 # small salmon blob sitting on the river
            else:
                dots.append(c)
    # merge bridge fragments within 45px
    bpts, taken = [], [False] * len(bridges)
    for i, c in enumerate(bridges):
        if taken[i]: continue
        grp = [c]; taken[i] = True
        for j in range(i + 1, len(bridges)):
            if taken[j]: continue
            if math.hypot(c['cx'] - bridges[j]['cx'], c['cy'] - bridges[j]['cy']) < 45:
                grp.append(bridges[j]); taken[j] = True
        bpts.append([round(float(np.mean([g['cx'] for g in grp])), 1),
                     round(float(np.mean([g['cy'] for g in grp])), 1)])

    # ---- waypoints
    waypoints = []
    labels = json.load(open(a.labels))['labels'] if a.labels else []
    def lookup(cx, cy):
        best, bd = None, 1e9
        for L in labels:
            d = math.hypot(L[1] - cx, L[2] - cy)
            if d < bd: bd, best = d, L
        return best if bd < 22 else None
    for c in dots + pins:
        cx, cy = c['cx'], c['cy']
        L = lookup(cx, cy)
        wp = dict(id=f"wp{len(waypoints)+1}", x=round(cx, 1), y=round(cy, 1),
                  type=(L[0] if L else 'unknown'))
        if L and L[0] == 'mountain' and len(L) > 3: wp['height'] = L[3]
        if L and L[0] == 'campsite' and len(L) > 3: wp['number'] = L[3]
        if c['area'] >= 900 and (not L or L[0] != 'campsite'):
            continue                                # pin without a dot label
        waypoints.append(wp)
    # dedupe pin+dot pairs of the same campsite
    seen, uniq = [], []
    for wp in sorted(waypoints, key=lambda w: (w['type'] == 'unknown')):
        if any(math.hypot(wp['x'] - s['x'], wp['y'] - s['y']) < 60 and s['type'] == wp['type']
               for s in seen):
            continue
        seen.append(wp); uniq.append(wp)
    waypoints = sorted(uniq, key=lambda w: (round(w['y'] / 60), w['x']))
    for i, wp in enumerate(waypoints): wp['id'] = f"wp{i+1}"

    # ---- contours: thin dark ridges, everything else masked out
    suppress = np.zeros((H, W), np.uint8)
    for k in ('water', 'salmon', 'black'):
        suppress |= cv2.dilate(m[k], np.ones((7, 7), np.uint8))
    suppress |= cv2.dilate(gm, np.ones((5, 5), np.uint8))
    for x in range(0, W + 1, CELL): suppress[:, max(0, x - 6):x + 6] = 1
    for y in range(0, H + 1, CELL): suppress[max(0, y - 6):y + 6, :] = 1

    g32 = gray.astype(np.float32)
    bg = cv2.GaussianBlur(g32, (0, 0), 5.0)
    ridge = np.clip(bg - g32, 0, 255)                      # thin-dark-line response
    ridge = cv2.GaussianBlur(ridge, (0, 0), 0.8)
    th = max(3.0, float(np.percentile(ridge[suppress == 0], 93)))
    cm = ((ridge > th) & (suppress == 0)).astype(np.uint8)
    cm = cv2.morphologyEx(cm, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, clab, cst, _ = cv2.connectedComponentsWithStats(cm, 8)
    keep = np.zeros_like(cm)
    for i in range(1, n):
        if cst[i, cv2.CC_STAT_AREA] >= 90: keep[clab == i] = 1
    csk = skeletonize(keep > 0).astype(np.uint8)
    contours = []
    for p in trace_skeleton(csk, 45):
        s = chaikin(rdp(p, 2.2), 2)
        if len(s) >= 6: contours.append(dict(id=f"c{len(contours)+1}", level=None, pts=s))

    # ---- missed-icon check: black blobs with no waypoint nearby
    bm = cv2.morphologyEx(m['black'], cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    bcomps, _ = components(bm, 120)
    orphans = []
    for c in bcomps:
        if c['w'] > 90 or c['h'] > 90: continue
        if min([math.hypot(c['cx'] - w['x'], c['cy'] - w['y']) for w in waypoints] or [999]) > 60:
            orphans.append([round(c['cx'], 1), round(c['cy'], 1), c['area']])

    # ---- debug overlay
    for c in contours: cv2.polylines(dbg, [np.int32(c['pts'])], False, (40, 90, 200), 1)
    for r in river: cv2.polylines(dbg, [np.int32(r)], False, (255, 0, 0), 3)
    for l in lakes: cv2.polylines(dbg, [np.int32(l['poly'])], True, (255, 200, 0), 2)
    for w in woodland: cv2.polylines(dbg, [np.int32(w['poly'])], True, (0, 180, 0), 2)
    for b in bpts: cv2.drawMarker(dbg, (int(b[0]), int(b[1])), (0, 0, 255), cv2.MARKER_SQUARE, 22, 3)
    for w in waypoints:
        cv2.circle(dbg, (int(w['x']), int(w['y'])), 13, (0, 0, 0), 2)
        cv2.putText(dbg, w['type'][:4], (int(w['x']) - 16, int(w['y']) - 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 255), 1)
    for o in orphans: cv2.drawMarker(dbg, (int(o[0]), int(o[1])), (0, 255, 255), cv2.MARKER_TILTED_CROSS, 24, 2)
    cv2.imwrite(f'_trace_{a.id}.png', dbg)

    data = dict(
        schema='waypoints.map/1',
        id=a.id, name=a.name,
        source=os.path.basename(a.src),
        rectified=os.path.basename(rectpath),
        image=dict(w=W, h=H),
        grid=dict(cols=a.cols, rows=a.rows, cell=CELL),
        world=dict(metresPerCell=2500, contourInterval=100, verticalExaggeration=3.0,
                   baseElevation=100, seaLevel=60),
        contours=contours, river=river, bridges=bpts,
        lakes=lakes, woodland=woodland, waypoints=waypoints,
        places=[], weather=dict(hikes=[]),
        trace=dict(orphanIcons=orphans),
    )
    out = a.out or f'../assets/maps/{a.id}.json'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(data, open(out, 'w'), separators=(',', ':'))
    print(json.dumps(dict(contours=len(contours), riverParts=len(river), bridges=len(bpts),
                          lakes=len(lakes), woodland=len(woodland), waypoints=len(waypoints),
                          orphans=len(orphans), bytes=os.path.getsize(out)), indent=1))
    from collections import Counter
    print(Counter(w['type'] for w in waypoints))


if __name__ == '__main__':
    main()
