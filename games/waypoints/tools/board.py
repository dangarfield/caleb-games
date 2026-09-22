#!/usr/bin/env python3
"""
Rectify the WHOLE board photo into grid-cell coordinates.

trace_map.py squares the 6x4 map to a rectified image and throws the rest of the
sheet away. The rest of the sheet is the game board — the weather track round the
edge, the scoring rows, the title bar — and the mapper wants it around the map.

One global homography is fitted to all 35 grid intersections (the sheet is flat,
so a single projective map is enough), then the entire photo is warped through
it. The output is the board in cell units, with a sidecar saying where it sits
relative to the 6x4 sheet, so the mapper can place it with one drawImage.
"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace_map import detect_grid

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'research', 'map-01.jpeg')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'underlays')
COLS, ROWS, PPC = 6, 4, 300          # px per cell in the output

img = cv2.imread(SRC)
lut = detect_grid(img, COLS, ROWS)

src, dst = [], []
for (i, j), (x, y) in lut.items():
    src.append([i, j]); dst.append([x, y])
H, _ = cv2.findHomography(np.float32(src), np.float32(dst), 0)   # cell -> photo
Hi = np.linalg.inv(H)

h, w = img.shape[:2]
corners = np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2)
cell = cv2.perspectiveTransform(corners, Hi).reshape(-1, 2)
x0, y0 = cell.min(axis=0)
x1, y1 = cell.max(axis=0)
print(f'board spans x {x0:.3f}..{x1:.3f}  y {y0:.3f}..{y1:.3f} cells')

# cell -> output px, then out -> photo for the warp
T = np.float32([[PPC, 0, -x0 * PPC], [0, PPC, -y0 * PPC], [0, 0, 1]])
M = H @ np.linalg.inv(T)
W, Hh = int(round((x1 - x0) * PPC)), int(round((y1 - y0) * PPC))
board = cv2.warpPerspective(img, np.linalg.inv(M), (W, Hh), flags=cv2.INTER_CUBIC)

os.makedirs(OUT, exist_ok=True)
cv2.imwrite(os.path.join(OUT, 'map-01-board.jpg'), board, [cv2.IMWRITE_JPEG_QUALITY, 88])
json.dump({'src': 'map-01-board.jpg',
           'x': round(float(x0), 4), 'y': round(float(y0), 4),
           'w': round(float(x1 - x0), 4), 'h': round(float(y1 - y0), 4)},
          open(os.path.join(OUT, 'map-01-board.json'), 'w'), indent=1)
print('wrote', W, 'x', Hh)
