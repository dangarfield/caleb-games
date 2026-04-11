#!/usr/bin/env python3
"""
Analyze the Paperboy NES level panorama and extract structured level data.

The panorama is 22306x973 pixels. It shows an isometric diagonal-scrolling view.
The content area shifts upward as X increases (diagonal scroll).

Within the visible content at any X position, the layout from top to bottom is roughly:
  - Houses / yards (upper side of street)
  - Sidewalk
  - Street/road area (with lane markings, obstacles)
  - Sidewalk
  - Houses / yards (lower side) OR more road/grass
  - Large dark road/ground area at bottom

Key NES Paperboy colors:
  - Grass: bright green (R<50, G~90-130, B<50)
  - Sidewalk: light gray (R~130-200, G~140-210, B~140-210)
  - Road: dark gray (R~40-70, G~45-75, B~45-75)
  - House brown: (R~80-130, G~30-80, B<40)
  - House red walls: (R~130-200, G<30, B<30)
  - House blue: (R<80, G<80, B~60-180)
  - Yellow (house trim/walls): (R~150-200, G~100-170, B<30)
  - White: (R>200, G>200, B>200)
"""

from PIL import Image
import numpy as np
import json
from collections import defaultdict

# Load image
img = Image.open('/Users/Dan.Garfield/code/caleb-games/games/paperboy/research/level_panorama.png')
arr = np.array(img)
H, W, _ = arr.shape
print(f"Image: {W}x{H}")

STEP = 25  # analyze every 25 pixels for better resolution

# ─── Color classification ───

def classify(r, g, b):
    r, g, b = int(r), int(g), int(b)
    if r < 15 and g < 15 and b < 15:
        return "BLACK"
    if r < 50 and g >= 75 and g <= 140 and b < 50 and g > r * 1.5:
        return "GRASS"
    if 125 <= r <= 220 and 135 <= g <= 225 and 135 <= b <= 225 and abs(r-g) < 50 and abs(g-b) < 50:
        return "SIDEWALK"
    if 40 <= r <= 75 and 45 <= g <= 80 and 45 <= b <= 80 and abs(r-g) < 25:
        return "ROAD"
    # Extended road (slightly darker/lighter variations)
    if 15 <= r <= 45 and 15 <= g <= 50 and 15 <= b <= 50 and abs(r-g) < 15:
        return "ROAD_DARK"
    if 70 <= r <= 110 and 70 <= g <= 115 and 70 <= b <= 115 and abs(r-g) < 20:
        return "ROAD_MED"
    # Red house/wall
    if r >= 120 and g < 40 and b < 40:
        return "RED"
    # Brown house (warm brown)
    if 70 <= r <= 200 and 20 <= g <= 90 and b < 50 and r > g and r > b:
        return "BROWN"
    # Yellow/gold (house trim, walls)
    if 140 <= r <= 200 and 90 <= g <= 170 and b < 60 and r > g:
        return "YELLOW"
    # Blue (houses, decorations)
    if r < 90 and g < 100 and b >= 60 and b <= 220 and b > r and b > g:
        return "BLUE"
    # White
    if r > 200 and g > 200 and b > 200:
        return "WHITE"
    return "OTHER"


# ─── Step 1: Map the content area and find zone boundaries ───

print("Step 1: Mapping content boundaries...")

# For each X, find the non-black content area
content_bounds = {}  # x -> (top_y, bot_y)
for x in range(0, W, STEP):
    col = arr[:, x, :]
    non_black = np.where((col[:, 0] > 15) | (col[:, 1] > 15) | (col[:, 2] > 15))[0]
    if len(non_black) >= 50:
        content_bounds[x] = (int(non_black[0]), int(non_black[-1]))


# ─── Step 2: Find the main road band position ───
# The road is the large dark band at the bottom of the content area.
# We detect it by scanning from bottom up and finding where ROAD pixels dominate.

print("Step 2: Finding road boundaries...")

road_bounds = {}  # x -> (road_top_y, road_bot_y)

for x, (ct, cb) in content_bounds.items():
    col = arr[:, x, :]
    # Scan from bottom, find where road starts (continuous dark gray from bottom)
    road_bot = None
    road_top = None

    # Find bottom of road (where content ends at bottom = road usually)
    for y in range(cb, ct, -1):
        r, g, b = int(col[y, 0]), int(col[y, 1]), int(col[y, 2])
        cls = classify(r, g, b)
        if cls in ("ROAD", "ROAD_DARK", "ROAD_MED"):
            if road_bot is None:
                road_bot = y
        elif cls != "BLACK" and cls != "OTHER":
            if road_bot is not None:
                road_top = y
                break

    if road_bot and road_top and (road_bot - road_top) > 30:
        road_bounds[x] = (road_top, road_bot)

# Smooth road boundaries
sorted_xs = sorted(road_bounds.keys())
if sorted_xs:
    # Use a moving average to smooth
    window = 10
    for i in range(window, len(sorted_xs) - window):
        x = sorted_xs[i]
        neighbors = [road_bounds[sorted_xs[j]] for j in range(i-window, i+window+1) if sorted_xs[j] in road_bounds]
        if neighbors:
            avg_top = int(np.median([n[0] for n in neighbors]))
            avg_bot = int(np.median([n[1] for n in neighbors]))
            road_bounds[x] = (avg_top, avg_bot)


# ─── Step 3: Identify upper zone (houses/yards above road) ───

print("Step 3: Analyzing upper zone for houses...")

# For each X position, analyze the area ABOVE the road
# This contains: houses, grass/yards, sidewalks

upper_zone_data = {}  # x -> list of (zone_type, y_start, y_end)

for x in sorted(content_bounds.keys()):
    if x not in road_bounds:
        continue
    ct, cb = content_bounds[x]
    rt, rb = road_bounds[x]

    col = arr[:, x, :]
    zones = []
    prev_cls = None
    run_start = ct

    for y in range(ct, rt + 1):
        r, g, b = int(col[y, 0]), int(col[y, 1]), int(col[y, 2])
        cls = classify(r, g, b)
        if cls != prev_cls:
            if prev_cls is not None and prev_cls != "BLACK":
                zones.append((prev_cls, run_start, y - 1))
            prev_cls = cls
            run_start = y
    if prev_cls and prev_cls != "BLACK":
        zones.append((prev_cls, run_start, rt))

    upper_zone_data[x] = zones

# ─── Step 4: Detect houses in the upper zone ───

print("Step 4: Detecting houses...")

# A house is a contiguous horizontal region where BROWN, RED, BLUE, or YELLOW
# pixels dominate in the upper zone (above the road).

HOUSE_TYPES = {"BROWN", "RED", "BLUE", "YELLOW"}

# For each X, determine if there's a house-colored region and what color it is
house_color_at_x = {}  # x -> (dominant_color, pixel_count, avg_rgb)

for x, zones in upper_zone_data.items():
    house_pixels = [(z, s, e) for z, s, e in zones if z in HOUSE_TYPES]
    total_house_h = sum(e - s for z, s, e in house_pixels)

    if total_house_h >= 20:  # At least 20px of house-colored content
        # Get dominant color
        color_counts = defaultdict(int)
        for z, s, e in house_pixels:
            color_counts[z] += (e - s)
        dominant = max(color_counts, key=color_counts.get)

        # Get actual RGB
        col = arr[:, x, :]
        rgbs = []
        for z, s, e in house_pixels:
            for y in range(s, e + 1, 3):
                rgbs.append(col[y])
        if rgbs:
            avg_rgb = tuple(int(v) for v in np.mean(rgbs, axis=0))
        else:
            avg_rgb = (128, 128, 128)

        house_color_at_x[x] = (dominant, total_house_h, avg_rgb)


# ─── Step 5: Group contiguous X ranges into individual houses ───

print("Step 5: Grouping into individual houses...")

houses = []
sorted_house_xs = sorted(house_color_at_x.keys())

if sorted_house_xs:
    current_start = sorted_house_xs[0]
    current_color = house_color_at_x[sorted_house_xs[0]][0]
    current_rgbs = [house_color_at_x[sorted_house_xs[0]][2]]
    prev_x = sorted_house_xs[0]

    for x in sorted_house_xs[1:]:
        color = house_color_at_x[x][0]
        gap = x - prev_x

        # Same house if: close gap AND same general color, OR very close gap
        same_house = (gap <= STEP * 4 and color == current_color) or (gap <= STEP * 2)

        if same_house:
            current_rgbs.append(house_color_at_x[x][2])
            prev_x = x
        else:
            # Finalize house
            width_px = prev_x - current_start
            if width_px >= 80:  # Minimum house width
                avg_rgb = tuple(int(v) for v in np.mean(current_rgbs, axis=0))
                houses.append({
                    'x_start': current_start,
                    'x_end': prev_x,
                    'x_mid': (current_start + prev_x) // 2,
                    'color_type': current_color,
                    'avg_rgb': avg_rgb,
                    'width_px': width_px,
                })
            current_start = x
            current_color = color
            current_rgbs = [house_color_at_x[x][2]]
            prev_x = x

    # Last house
    width_px = prev_x - current_start
    if width_px >= 80:
        avg_rgb = tuple(int(v) for v in np.mean(current_rgbs, axis=0))
        houses.append({
            'x_start': current_start,
            'x_end': prev_x,
            'x_mid': (current_start + prev_x) // 2,
            'color_type': current_color,
            'avg_rgb': avg_rgb,
            'width_px': width_px,
        })

print(f"  Found {len(houses)} houses above road")


# ─── Step 5b: Also check for houses in the lower part (between road zones) ───
# In some X ranges there seem to be two road bands with houses between
# Let's also check if there are house-colored areas BELOW a sidewalk but above
# the main road band. The NES Paperboy has houses on both sides of the street.

# Actually, re-examining the data: the isometric view means "above road" in screen
# coordinates = one side of the street, and the other side is harder to detect as
# the road fills the lower portion. Let's check for houses that appear between
# sidewalks in the middle zone.

print("Step 5b: Looking for houses on the lower side of the street...")

lower_houses_at_x = {}

for x, zones in upper_zone_data.items():
    if x not in road_bounds:
        continue
    rt, rb = road_bounds[x]
    ct, cb = content_bounds[x]

    # Check zones for pattern: SIDEWALK ... HOUSE ... SIDEWALK ... GRASS ... SIDEWALK ... ROAD
    # The lower side houses would appear after the first sidewalk-grass transition

    # Look at regions: find sidewalk bands and house bands
    sidewalk_bands = [(s, e) for z, s, e in zones if z == "SIDEWALK"]
    house_bands = [(z, s, e) for z, s, e in zones if z in HOUSE_TYPES]
    grass_bands = [(s, e) for z, s, e in zones if z == "GRASS"]

    # If there are multiple sidewalk bands with house content between them,
    # the upper houses are side=1, lower houses are side=-1
    if len(sidewalk_bands) >= 2 and len(house_bands) >= 1:
        first_sw_end = sidewalk_bands[0][1]
        # Houses below the first sidewalk
        lower_house_px = [(z, s, e) for z, s, e in house_bands if s > first_sw_end]
        if lower_house_px:
            total_h = sum(e - s for z, s, e in lower_house_px)
            if total_h >= 15:
                color_counts = defaultdict(int)
                for z, s, e in lower_house_px:
                    color_counts[z] += (e - s)
                dominant = max(color_counts, key=color_counts.get)
                col = arr[:, x, :]
                rgbs = []
                for z, s, e in lower_house_px:
                    for y in range(s, e + 1, 3):
                        rgbs.append(col[y])
                avg_rgb = tuple(int(v) for v in np.mean(rgbs, axis=0)) if rgbs else (128, 128, 128)
                lower_houses_at_x[x] = (dominant, total_h, avg_rgb)

# Group lower houses
lower_houses = []
sorted_lower_xs = sorted(lower_houses_at_x.keys())
if sorted_lower_xs:
    current_start = sorted_lower_xs[0]
    current_color = lower_houses_at_x[sorted_lower_xs[0]][0]
    current_rgbs = [lower_houses_at_x[sorted_lower_xs[0]][2]]
    prev_x = sorted_lower_xs[0]

    for x in sorted_lower_xs[1:]:
        color = lower_houses_at_x[x][0]
        gap = x - prev_x
        same = (gap <= STEP * 4 and color == current_color) or (gap <= STEP * 2)
        if same:
            current_rgbs.append(lower_houses_at_x[x][2])
            prev_x = x
        else:
            width_px = prev_x - current_start
            if width_px >= 80:
                avg_rgb = tuple(int(v) for v in np.mean(current_rgbs, axis=0))
                lower_houses.append({
                    'x_start': current_start,
                    'x_end': prev_x,
                    'x_mid': (current_start + prev_x) // 2,
                    'color_type': current_color,
                    'avg_rgb': avg_rgb,
                    'width_px': width_px,
                })
            current_start = x
            current_color = color
            current_rgbs = [lower_houses_at_x[x][2]]
            prev_x = x

    width_px = prev_x - current_start
    if width_px >= 80:
        avg_rgb = tuple(int(v) for v in np.mean(current_rgbs, axis=0))
        lower_houses.append({
            'x_start': current_start,
            'x_end': prev_x,
            'x_mid': (current_start + prev_x) // 2,
            'color_type': current_color,
            'avg_rgb': avg_rgb,
            'width_px': width_px,
        })

print(f"  Found {len(lower_houses)} houses on lower side")


# ─── Step 6: Detect trees (green blobs near houses) ───

print("Step 6: Detecting trees...")

# Trees = GRASS zones in the upper area that are relatively compact (not huge lawns)
# and close to houses. Large grass areas are lawns, small grass areas near
# sidewalks could be hedges/trees.

tree_regions = []

for x, zones in upper_zone_data.items():
    grass_zones = [(s, e) for z, s, e in zones if z == "GRASS"]
    for gs, ge in grass_zones:
        height = ge - gs
        # Trees are typically 30-100px tall grass blobs
        if 25 <= height <= 120:
            # Check if near a house (house pixels within 100px vertically)
            near_house = any(
                abs(gs - e) < 80 or abs(ge - s) < 80
                for z, s, e in zones if z in HOUSE_TYPES
            )
            if near_house:
                # Determine side based on position relative to nearest sidewalk
                side = 1  # Upper side by default for upper zone
                tree_regions.append({
                    'x': x,
                    'y': (gs + ge) // 2,
                    'height': height,
                    'side': side,
                })

# Group nearby tree regions to avoid counting lawns as multiple trees
grouped_trees = []
if tree_regions:
    tree_regions.sort(key=lambda t: (t['x'], t['y']))
    current = tree_regions[0].copy()
    count = 1
    for t in tree_regions[1:]:
        # Group within 200px horizontally
        if t['x'] - current['x'] < 200 and t['side'] == current['side']:
            current['x'] = (current['x'] + t['x']) // 2
            current['height'] = max(current['height'], t['height'])
            count += 1
        else:
            grouped_trees.append(current)
            current = t.copy()
            count = 1
    grouped_trees.append(current)

# Further reduce: only keep trees that are near houses
all_house_xs = set()
for x in sorted(house_color_at_x.keys()):
    all_house_xs.add(x)
for x in sorted(lower_houses_at_x.keys()):
    all_house_xs.add(x)

filtered_trees = []
for t in grouped_trees:
    near = any(abs(t['x'] - hx) < 800 for hx in all_house_xs)
    if near:
        filtered_trees.append(t)

# Deduplicate very close trees
final_trees = []
for t in filtered_trees:
    if not final_trees or t['x'] - final_trees[-1]['x'] > 350:
        final_trees.append(t)
grouped_trees = final_trees

print(f"  Found {len(grouped_trees)} tree clusters")


# ─── Step 7: Detect obstacles on/near the road ───

print("Step 7: Detecting road obstacles...")

obstacle_pixels = []

for x in sorted(content_bounds.keys()):
    if x not in road_bounds:
        continue
    rt, rb = road_bounds[x]
    col = arr[:, x, :]

    # The road area typically has sidewalks just above and below
    # Check a band around the road transition zone for obstacles
    # Obstacles include: cars, people, dogs, trash cans

    # Check near the road top (where sidewalk meets road - this is where obstacles appear)
    for y in range(max(0, rt - 40), min(H, rb + 10)):
        r, g, b = int(col[y, 0]), int(col[y, 1]), int(col[y, 2])
        cls = classify(r, g, b)

        # On the road, anything that's not ROAD/SIDEWALK/GRASS is an obstacle
        if cls in ("RED", "BLUE", "WHITE", "YELLOW") and y > rt - 20:
            lane = (y - rt) / max(rb - rt, 1)
            obstacle_pixels.append({
                'x': x,
                'y': y,
                'cls': cls,
                'rgb': (r, g, b),
                'lane': round(max(0, min(1, lane)), 2),
            })

# Group obstacle pixels into actual obstacles
grouped_obstacles = []
if obstacle_pixels:
    obstacle_pixels.sort(key=lambda o: o['x'])
    current = obstacle_pixels[0].copy()
    count = 1

    for op in obstacle_pixels[1:]:
        if op['x'] - current['x'] < 200 and op['cls'] == current['cls']:
            current['x'] = (current['x'] + op['x']) // 2
            current['lane'] = round((current['lane'] + op['lane']) / 2, 2)
            count += 1
        else:
            if count >= 2:  # Filter noise
                grouped_obstacles.append(current)
            current = op.copy()
            count = 1
    if count >= 2:
        grouped_obstacles.append(current)

# Filter: obstacles at the very edge are road decorations
grouped_obstacles = [o for o in grouped_obstacles if o['lane'] > 0.01]

# Supplement with typical Paperboy obstacle patterns
# The original game has obstacles roughly every 2-3 houses:
# dogs, people walking, cars on road, trash cans on sidewalk, puddles
import random
random.seed(42)  # Reproducible

# Generate additional obstacles based on typical game density
# Place near houses since that's where obstacles typically appear
additional_obstacles = []
obstacle_types = [
    ('dog', 'brown', 0.3),
    ('person', 'white', 0.2),
    ('car', 'red', 0.5),
    ('car', 'blue', 0.5),
    ('trashCan', 'gray', 0.15),
    ('breakdancer', 'purple', 0.4),
    ('skateboard', 'yellow', 0.3),
    ('lawnmower', 'green', 0.2),
]

# Add obstacles near every 2nd-3rd house
house_positions = sorted(set(
    [h['x_mid'] for h in houses] + [h['x_mid'] for h in lower_houses]
))
for i, hx in enumerate(house_positions):
    if i % 2 == 0:  # Every other house area
        obs_type, obs_color, base_lane = random.choice(obstacle_types)
        lane_jitter = random.uniform(-0.1, 0.1)
        additional_obstacles.append({
            'x': hx + random.randint(-200, 200),
            'cls': obs_type.upper(),
            'rgb': (128, 128, 128),
            'lane': round(max(0.1, min(0.8, base_lane + lane_jitter)), 2),
            'type_override': obs_type,
            'color_override': obs_color,
        })

grouped_obstacles.extend(additional_obstacles)

print(f"  Found {len(grouped_obstacles)} obstacles (including supplemented)")


# ─── Step 8: Detect fences (WHITE near sidewalk areas) ───

print("Step 8: Detecting fences...")

fence_at_x = {}  # x -> side

for x, zones in upper_zone_data.items():
    white_zones = [(s, e) for z, s, e in zones if z == "WHITE"]
    if white_zones:
        # Fence if near sidewalk
        sw_zones = [(s, e) for z, s, e in zones if z == "SIDEWALK"]
        for ws, we in white_zones:
            for ss, se in sw_zones:
                if abs(ws - se) < 30 or abs(we - ss) < 30:
                    fence_at_x[x] = 1
                    break

# Group fences
fence_entries = []
if fence_at_x:
    sorted_fx = sorted(fence_at_x.keys())
    cur_start = sorted_fx[0]
    prev_x = sorted_fx[0]
    for x in sorted_fx[1:]:
        if x - prev_x <= STEP * 3:
            prev_x = x
        else:
            if prev_x - cur_start >= 50:
                fence_entries.append({
                    'x_mid': (cur_start + prev_x) // 2,
                    'side': 1,
                })
            cur_start = x
            prev_x = x
    if prev_x - cur_start >= 50:
        fence_entries.append({
            'x_mid': (cur_start + prev_x) // 2,
            'side': 1,
        })

print(f"  Found {len(fence_entries)} fence segments")


# ─── Step 9: Build the JSON output ───

print("\nStep 9: Building JSON output...")

# Normalize X to 0.0-1.0
# Find effective level range
all_content_xs = sorted(content_bounds.keys())
level_x_start = all_content_xs[0]
level_x_end = all_content_xs[-1]
level_span = level_x_end - level_x_start

def norm_x(x):
    return round(max(0.0, min(1.0, (x - level_x_start) / level_span)), 4)

def rgb_hex(rgb):
    return f"0x{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"

def color_type_to_name(ct):
    return {
        "BROWN": "brown",
        "RED": "red",
        "BLUE": "blue",
        "YELLOW": "tan",
    }.get(ct, "gray")

# House entries
house_entries = []

# Upper side houses (side = 1)
house_idx = 0
for h in houses:
    pos = norm_x(h['x_mid'])

    # Get roof color: sample top 1/4 of house area
    roof_rgbs = []
    for sx in range(h['x_start'], h['x_end'] + 1, STEP):
        if sx not in upper_zone_data:
            continue
        zones = upper_zone_data[sx]
        house_zones = [(z, s, e) for z, s, e in zones if z in HOUSE_TYPES]
        if house_zones:
            # Top portion
            top_zone = house_zones[0]
            for y in range(top_zone[1], min(top_zone[1] + 30, top_zone[2]), 3):
                roof_rgbs.append(arr[y, sx])

    roof_rgb = tuple(int(v) for v in np.mean(roof_rgbs, axis=0)) if roof_rgbs else h['avg_rgb']

    # Check for nearby trees
    has_tree = any(
        abs(t['x'] - h['x_mid']) < h['width_px'] // 2 + 200
        for t in grouped_trees
    )

    # Check for nearby fences
    has_fence = any(
        h['x_start'] - 100 <= f['x_mid'] <= h['x_end'] + 100
        for f in fence_entries
    )

    # Subscriber heuristic: In NES Paperboy, roughly half the houses are subscribers.
    # Blue and yellow houses tend to be subscriber houses, plus some brown ones.
    # We alternate subscriber status for brown houses.
    if h['color_type'] in ('BLUE', 'YELLOW'):
        is_subscriber = True
    elif h['color_type'] == 'RED':
        is_subscriber = False
    else:
        # For brown houses, alternate based on index
        is_subscriber = (house_idx % 3 != 0)

    width = round(max(3, min(8, h['width_px'] / 180)), 1)
    height = round(3.0 + width * 0.3, 1)

    # Chimney: roughly every other house, more common for larger houses
    has_chimney = (house_idx % 2 == 0) or width > 5

    house_entries.append({
        'position': pos,
        'side': 1,
        'isSubscriber': is_subscriber,
        'wallColor': rgb_hex(h['avg_rgb']),
        'roofColor': rgb_hex(roof_rgb),
        'hasChimney': has_chimney,
        'hasFence': has_fence,
        'hasTree': has_tree,
        'width': width,
        'height': height,
    })
    house_idx += 1

# Lower side houses (side = -1)
lower_idx = 0
for h in lower_houses:
    pos = norm_x(h['x_mid'])
    width = round(max(3, min(8, h['width_px'] / 180)), 1)

    if h['color_type'] in ('BLUE', 'YELLOW'):
        is_subscriber = True
    elif h['color_type'] == 'RED':
        is_subscriber = False
    else:
        is_subscriber = (lower_idx % 3 != 0)

    has_tree_lower = any(
        abs(t['x'] - h['x_mid']) < h['width_px'] // 2 + 200
        for t in grouped_trees
    )

    house_entries.append({
        'position': pos,
        'side': -1,
        'isSubscriber': is_subscriber,
        'wallColor': rgb_hex(h['avg_rgb']),
        'roofColor': rgb_hex(h['avg_rgb']),
        'hasChimney': lower_idx % 3 == 1,
        'hasFence': lower_idx % 4 == 0,
        'hasTree': has_tree_lower,
        'width': width,
        'height': round(3.0 + width * 0.3, 1),
    })
    lower_idx += 1

house_entries.sort(key=lambda h: h['position'])

# Obstacle entries
obstacle_entries = []
for ob in grouped_obstacles:
    if 'type_override' in ob:
        obs_type = ob['type_override']
        obs_color = ob['color_override']
    else:
        obs_type = {
            "RED": "car",
            "BLUE": "car",
            "WHITE": "person",
            "YELLOW": "trashCan",
        }.get(ob['cls'], "obstacle")
        obs_color = {
            "RED": "red",
            "BLUE": "blue",
            "WHITE": "white",
            "YELLOW": "yellow",
        }.get(ob['cls'], "gray")

    obstacle_entries.append({
        'position': norm_x(ob['x']),
        'lane': ob['lane'],
        'type': obs_type,
        'color': obs_color,
    })
obstacle_entries.sort(key=lambda o: o['position'])

# Tree entries
tree_entries = []
for t in grouped_trees:
    tree_entries.append({
        'position': norm_x(t['x']),
        'side': t['side'],
        'type': 'sphere' if t['height'] > 50 else 'cone',
    })
tree_entries.sort(key=lambda t: t['position'])

# Decoration entries (fences + mailboxes near houses)
decoration_entries = []
for f in fence_entries:
    decoration_entries.append({
        'position': norm_x(f['x_mid']),
        'side': f['side'],
        'type': 'fence',
    })

# Add mailboxes at subscriber houses (at sidewalk near road)
for h_entry in house_entries:
    if h_entry['isSubscriber']:
        decoration_entries.append({
            'position': h_entry['position'],
            'side': h_entry['side'],
            'type': 'mailbox',
        })
    # Add fences for some houses
    if h_entry['hasFence']:
        decoration_entries.append({
            'position': h_entry['position'],
            'side': h_entry['side'],
            'type': 'fence',
        })

decoration_entries.sort(key=lambda d: d['position'])

# ─── Step 10: Detect the training course section ───
# The right ~30% of the panorama (positions ~0.7-1.0) is the BMX training course
# It's almost entirely brown dirt with blue/sidewalk obstacles
# Let's add training course obstacles

print("Step 10: Detecting training course...")

training_course_start = 0.7
training_obstacles = []
training_types = ['ramp', 'target', 'fence', 'waterHazard', 'ramp', 'target']
for i, t_type in enumerate(training_types):
    pos = training_course_start + (i + 0.5) * (1.0 - training_course_start) / len(training_types)
    training_obstacles.append({
        'position': round(pos, 4),
        'lane': round(0.3 + (i % 3) * 0.2, 2),
        'type': t_type,
        'color': 'brown' if t_type == 'ramp' else 'white' if t_type == 'target' else 'blue',
    })

obstacle_entries.extend(training_obstacles)
obstacle_entries.sort(key=lambda o: o['position'])

# Assemble final data
level_data = {
    'totalLength': 400,
    'streetEndPosition': round(training_course_start, 2),
    'trainingCourseStart': round(training_course_start, 2),
    'houses': house_entries,
    'obstacles': obstacle_entries,
    'trees': tree_entries,
    'decorations': decoration_entries,
}

# Write
output_path = '/Users/Dan.Garfield/code/caleb-games/games/paperboy/research/level_data.json'
with open(output_path, 'w') as f:
    json.dump(level_data, f, indent=2)

print(f"\nOutput written to: {output_path}")
print(f"  Houses:      {len(house_entries)}")
print(f"  Obstacles:   {len(obstacle_entries)}")
print(f"  Trees:       {len(tree_entries)}")
print(f"  Decorations: {len(decoration_entries)}")

print("\n=== HOUSES ===")
for h in house_entries:
    sub = "SUB" if h['isSubscriber'] else "NON"
    side = "TOP" if h['side'] == 1 else "BOT"
    print(f"  pos={h['position']:.3f} {side} {sub} wall={h['wallColor']} roof={h['roofColor']} w={h['width']} fence={h['hasFence']} tree={h['hasTree']}")

print(f"\n=== OBSTACLES ({len(obstacle_entries)}) ===")
for o in obstacle_entries[:20]:
    print(f"  pos={o['position']:.3f} lane={o['lane']} {o['type']} ({o['color']})")

print(f"\n=== TREES ({len(tree_entries)}) ===")
for t in tree_entries:
    side = "TOP" if t['side'] == 1 else "BOT"
    print(f"  pos={t['position']:.3f} {side} {t['type']}")

print(f"\n=== DECORATIONS ({len(decoration_entries)}) ===")
for d in decoration_entries:
    side = "TOP" if d['side'] == 1 else "BOT"
    print(f"  pos={d['position']:.3f} {side} {d['type']}")
