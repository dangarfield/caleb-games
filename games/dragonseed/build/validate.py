# -*- coding: utf-8 -*-
import sys, os, itertools, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import taxonomy as T
from plants import PLANTS

problems = []
def bad(m): problems.append(m)

by_id = {p["id"]: p for p in PLANTS}
hab_ids = {h[0] for h in T.HABITATS}

# 1. every attribute value is in the taxonomy
DOMAIN = {"colour":T.COLOUR,"form":T.FORM,"petals":T.PETALS,"leaf":T.LEAF,
          "stem":T.STEM,"scent":T.SCENT,"berry":T.BERRY,"mark":T.MARK}
for p in PLANTS:
    for k, dom in DOMAIN.items():
        if p[k] not in dom: bad(f"{p['name']}: {k}={p[k]!r} not in taxonomy")
    if p["kind"] not in T.KIND: bad(f"{p['name']}: kind={p['kind']!r}")
    if p["habitat"] not in hab_ids: bad(f"{p['name']}: habitat={p['habitat']!r}")
    if p["effect"] not in T.EFFECTS: bad(f"{p['name']}: effect={p['effect']!r} has no prose")
    if p["species"] not in T.SPECIES: bad(f"{p['name']}: species={p['species']!r}")

# 2. every specimen is uniquely identifiable from the 8 observable axes
sig = collections.defaultdict(list)
for p in PLANTS: sig[tuple(p[a] for a in T.AXES)].append(p["name"])
for s, names in sig.items():
    if len(names) > 1: bad(f"identical attribute vectors: {names}")

# 3. nothing is identifiable from one glance: every specimen must share its
#    colour with >=3 others and its form with >=3 others.
ccount = collections.Counter(p["colour"] for p in PLANTS)
fcount = collections.Counter(p["form"] for p in PLANTS)
for p in PLANTS:
    if ccount[p["colour"]] < 4: bad(f"{p['name']}: only {ccount[p['colour']]} specimens are {p['colour']}")
    if fcount[p["form"]]   < 4: bad(f"{p['name']}: only {fcount[p['form']]} specimens are {p['form']}")

# 4. no axis is a giveaway: no attribute VALUE may be unique to one plant
for a in T.AXES:
    c = collections.Counter(p[a] for p in PLANTS)
    for v, n in c.items():
        if n == 1: bad(f"axis {a}: value {v!r} is unique to one specimen (instant giveaway)")

pair = collections.Counter((p["colour"], p["form"]) for p in PLANTS)
twins = sum(1 for p in PLANTS if pair[(p["colour"], p["form"])] > 1)
print(f"{len(PLANTS)} specimens, {len(T.HABITATS)} locations on a {len(T.GRID_COLS)}x{T.GRID_ROWS} map")
print(f"colour+form twins: {twins}/{len(PLANTS)} ({100*twins//len(PLANTS)}%)")
print("colours:", dict(ccount))
print("forms:  ", dict(fcount))
if problems:
    print(f"\n{len(problems)} PROBLEMS:")
    for m in problems: print(" -", m)
else:
    print("all checks pass")


# ==================== puzzle solvability ====================
from days import DAYS
from papers import PAPERS
from evenings import EVENINGS
import copy
paper_ids = {n["id"] for n in PAPERS}
seen_papers = set()
day_start_pots = {p["id"] for p in PLANTS if p["start"] in ("both", "pot")}

by_effect = collections.defaultdict(list)
for p in PLANTS: by_effect[p["effect"]].append(p)

def fits(p, who):
    """Species is half of an effect request now. "both" cuts either way."""
    return p["species"] == who or p["species"] == "both" or who == "both"
def forWho(eff, who): return [p for p in by_effect[eff] if fits(p, who)]

def matches(p, wants):
    return all(p[k] == v for k, v in wants.items())

# A POT and a PAGE are separate things and both are needed to serve anybody.
pots  = {p["id"] for p in PLANTS if p["start"] in ("both", "pot")}
pages = {p["id"] for p in PLANTS if p["start"] in ("both", "page")}
found = pots            # kept for the map/gathering checks below
open_habs = {h[0] for h in T.HABITATS if h[5]}
for p in PLANTS:
    if p["start"] not in ("both", "pot", "page", ""):
        bad(f"{p['name']}: start={p['start']!r} is not both/pot/page/blank")
def onHand(pid):
    """Ready to hand over: a cutting on the shelf AND a page to name it by.
    Nothing is sold in this game — a visitor asks and you give — so the test
    is whether you could put it in their hands, not whether you could price it."""
    return pid in pots and pid in pages

# --- the map itself -------------------------------------------------------
cells = {}
for h in T.HABITATS:
    hid, cell, known, lead, short = h[0], h[6], h[5], h[7], h[2]
    if not short or len(short) > 14: bad(f"{hid}: map label {short!r} is missing or too long")
    if len(cell) < 2 or cell[0] not in T.GRID_COLS or not cell[1:].isdigit():
        bad(f"{hid}: bad map cell {cell!r}")
    elif not (1 <= int(cell[1:]) <= T.GRID_ROWS):
        bad(f"{hid}: map cell {cell} is off the grid")
    if cell in cells: bad(f"map cell {cell} holds both {cells[cell]} and {hid}")
    cells[cell] = hid
    if not known and not lead: bad(f"{hid}: hidden location with no lead to find it by")
    if known and lead: bad(f"{hid}: known from the start but also has a lead")
if T.TOWN_CELL in cells: bad(f"the town sits on top of {cells[T.TOWN_CELL]}")
SENSIBLE = {"fen":"m","wood":"w","moor":"g","meadow":"l","river":"r","crag":"h","valley":"v",
            "tarn":"l","coast":"m","cave":"h","yard":"y","garden":"g","pike":"p","barrow":"h"}
if len(T.TERRAIN) != T.GRID_ROWS: bad("terrain has the wrong number of rows")
KNOWN_CODES = set("smhpwlrvytg")
for i, row in enumerate(T.TERRAIN):
    if len(row) != len(T.GRID_COLS): bad(f"terrain row {i+1} is {len(row)} wide, want {len(T.GRID_COLS)}")
    for ch in row:
        if ch not in KNOWN_CODES: bad(f"terrain row {i+1} uses unknown code {ch!r}")
def code_at(cell):
    c = T.GRID_COLS.index(cell[0]); r = int(cell[1:]) - 1
    return T.TERRAIN[r][c]
for h in T.HABITATS:
    hid, cell = h[0], h[6]
    want = SENSIBLE.get(hid)
    got = code_at(cell)
    if want and got != want:
        bad(f"{hid} sits at {cell} which is drawn as {got!r}, expected {want!r}")
if code_at(T.TOWN_CELL) != "t": bad(f"the town at {T.TOWN_CELL} is not drawn as a town")

for d in DAYS:
    tag = f"day {d['day']}"
    for pid in d["papers"]:
        if pid not in paper_ids: bad(f"{tag}: unknown paper {pid}")
        if pid in seen_papers: bad(f"{tag}: paper {pid} handed over twice")
        seen_papers.add(pid)
    for fid in d["pots"]:
        if fid not in by_id: bad(f"{tag}: hands you unknown specimen {fid}"); continue
        if fid in day_start_pots: bad(f"{tag}: hands you a cutting of {by_id[fid]['name']} you already have")
    day_start_pots |= set(d["pots"])

    # The runtime applies a visitor's grants WHEN THEY WALK IN, not at dawn, so
    # a cutting handed over by the seventh customer is no use to the second.
    # Walk the day in order and hold the shelf to what it actually holds.
    for v in d["visitors"]:
        vt = f"{tag} {v['name']}"
        for pid in v.get("accepts", []):
            if pid not in by_id: bad(f"{vt}: accepts unknown specimen {pid}")
        for i2 in v.get("pots", []):  pots.add(i2); found.add(i2)
        for i2 in v.get("pages", []): pages.add(i2)
        for pid in v.get("papers", []):
            n = next((x for x in PAPERS if x["id"] == pid), None)
            if n:
                for g in n.get("gives", []): pages.add(g)
                for pl in n.get("points", []): open_habs.add(pl)
        for h in v.get("opens", []):
            if h not in hab_ids: bad(f"{vt}: opens unknown location {h}")
            open_habs.add(h)

        if v["kind"] == "describe":
            w = v.get("wants")
            if not w: bad(f"{vt}: describe with no wants"); continue
            for k in w:
                if k not in T.AXES: bad(f"{vt}: wants unobservable axis {k!r}")
            hits = [p for p in PLANTS if matches(p, w)]
            if len(hits) != 1:
                bad(f"{vt}: description matches {len(hits)} specimens {[h['name'] for h in hits]}")
            elif hits[0]["id"] not in v["accepts"]:
                bad(f"{vt}: description matches {hits[0]['name']} but accepts {v['accepts']}")
            for pid in v["accepts"]:
                pass   # the closure below is the real test now

        elif v["kind"] == "effect":
            need = v.get("needs")
            if need not in T.EFFECTS: bad(f"{vt}: needs unknown effect {need!r}"); continue
            if not forWho(need, v.get("who", "human")):
                bad(f"{vt}: no plant at all does {need!r} for a {v.get('who','human')}")
            for pid in v.get("accepts", []):
                if not fits(by_id[pid], v.get("who", "human")):
                    bad(f"{vt}: canonical answer {by_id[pid]['name']} is for "
                        f"{by_id[pid]['species']}, not {v.get('who','human')}")
            for pid in v.get("accepts", []):
                if by_id[pid]["effect"] != need:
                    bad(f"{vt}: canonical answer {by_id[pid]['name']} has effect "
                        f"{by_id[pid]['effect']!r}, not {need!r}")

        elif v["kind"] == "recipe":
            needs = v.get("needs") or []
            if not (2 <= len(needs) <= 3): bad(f"{vt}: a recipe wants two or three things")
            if len(set(needs)) != len(needs): bad(f"{vt}: recipe asks for the same thing twice")
            for need in needs:
                if need not in T.EFFECTS: bad(f"{vt}: recipe needs unknown effect {need!r}"); continue
                pass
            if len(v.get("steps") or []) != len(needs):
                bad(f"{vt}: recipe step lines do not match its steps")

        elif v["kind"] == "fork":
            if len(v.get("accepts", [])) != 2: bad(f"{vt}: fork needs exactly 2 options")
            flags = [f["plant"] for f in v.get("fork", [])]
            if sorted(flags) != sorted(v.get("accepts", [])): bad(f"{vt}: fork options != accepts")
            for pid in v.get("accepts", []):
                pass

        elif v["kind"] in ("gift", "lead"):
            if v["kind"] == "gift" and not (v.get("pots") or v.get("pages")
                                            or v.get("papers") or v.get("item")):
                bad(f"{vt}: a gift that gives nothing")
            if v["kind"] == "lead" and not v.get("opens"):
                bad(f"{vt}: a lead that leads nowhere")

        elif v["kind"] != "visit":
            bad(f"{vt}: unknown kind {v['kind']!r}")

    # the egg asks at the end of the day, so it may use anything that arrived
    ev = next((e for e in EVENINGS if e["day"] == d["day"]), None)
    if ev and ev.get("egg") and ev["egg"]["needs"] not in T.EFFECTS:
        bad(f"evening {d['day']}: egg needs unknown effect {ev['egg']['needs']!r}")

# --- the living map: nothing may point at a place that does not exist yet
for hid, day in T.FROM_DAY.items():
    if hid not in hab_ids: bad(f"FROM_DAY names unknown location {hid}")
for d in DAYS:
    for h in d["opens"]:
        born = T.FROM_DAY.get(h, 1)
        if d["day"] < born:
            bad(f"day {d['day']}: told about {h}, which does not exist until day {born}")
for day, cell, code, note in T.TERRAIN_CHANGES:
    if len(cell) < 2 or cell[0] not in T.GRID_COLS or not cell[1:].isdigit():
        bad(f"terrain change on day {day}: bad cell {cell!r}")
    if code not in set("smhpwlrvytgabc"): bad(f"terrain change on day {day}: unknown code {code!r}")
    if not (1 <= day <= len(DAYS)): bad(f"terrain change on day {day}: no such day")
for hid, born in T.FROM_DAY.items():
    h = next(x for x in T.HABITATS if x[0] == hid)
    if not any(c == h[6] and dy <= born for dy, c, _co, _n in T.TERRAIN_CHANGES):
        bad(f"{hid} appears on day {born} but its square {h[6]} is never repainted")

# --- papers
for n in PAPERS:
    pt = f"paper {n['id']}"
    if len(n["body"]) < 60: bad(f"{pt}: too short to be worth opening")
    for g in n.get("gives", []):
        if g not in by_id: bad(f"{pt}: gives unknown page {g}")
    for pl in n.get("points", []):
        if pl not in hab_ids: bad(f"{pt}: points at unknown place {pl}")
for n in PAPERS:
    if n["id"] not in seen_papers: bad(f"paper {n['id']} is never handed to anybody")

# ==================== THE CLOSURE ====================
# The map and the drawer are the critical path now, so "is it answerable" can no
# longer mean "is it already on the shelf". It means: could a player who does
# everything available to them have it by now?
#
# Simulate that player. Each day, in arrival order: take what people hand over,
# read the notes, walk to any place you have been told about, and open any door
# whose key is on your shelf — then keep going round, because opening one door
# hands you the key to the next. When it settles, check the day's requests.
#
# This is what proves the chains work AND that nobody can be stranded: if the
# closure ever fails to produce an answer in time, the build fails.
lead_day, gate_day, reward_day = {}, {}, {}
start_pots  = {p["id"] for p in PLANTS if p["start"] in ("both", "pot")}
handed_pots = {i for d in DAYS for v in d["visitors"] for i in v.get("pots", [])}
c_pots  = {p["id"] for p in PLANTS if p["start"] in ("both", "pot")}
c_pages = {p["id"] for p in PLANTS if p["start"] in ("both", "page")}
c_told  = {h[0] for h in T.HABITATS if h[5]}
c_open  = set(c_told)
by_hab = collections.defaultdict(list)
for p in PLANTS: by_hab[p["habitat"]].append(p)

def diligent(day):
    """Walk every door we can, over and over, until nothing new opens."""
    while True:
        moved = False
        for hid, (why, want, keys, rew) in T.GATES.items():
            if hid in c_open or hid not in c_told: continue
            if T.FROM_DAY.get(hid, 1) > day: continue
            if not any(p["id"] in c_pots and p["id"] in c_pages
                       for k in keys for p in by_effect[k]): continue
            c_open.add(hid); gate_day.setdefault(hid, day); moved = True
            for i in rew.get("pots", []):
                # what is behind a door is a CUTTING. You dug it up yourself, so
                # it comes with no leaf — the page has to reach the book some
                # other way, and if it has not, this is where we find out.
                c_pots.add(i); reward_day.setdefault(i, day)
            for i in rew.get("pages", []): c_pages.add(i)
        if not moved: return

def ready(pid):  return pid in c_pots and pid in c_pages
def anyFor(eff, who="human"): return any(ready(p["id"]) for p in forWho(eff, who))

for d in DAYS:
    day = d["day"]
    for v in d["visitors"]:
        vt = f"day {day} {v['name']}"
        for i in v.get("pots", []):  c_pots.add(i)
        for i in v.get("pages", []): c_pages.add(i)
        for h in v.get("opens", []): c_told.add(h)
        for pid in v.get("papers", []):
            n = next((x for x in PAPERS if x["id"] == pid), None)
            if not n: continue
            for g in n.get("gives", []):  c_pages.add(g)
            for pl in n.get("points", []): c_told.add(pl)
        for h in c_told: lead_day.setdefault(h, day)
        diligent(day)

        if v["kind"] == "describe":
            for pid in v["accepts"]:
                if not ready(pid):
                    bad(f"{vt}: {by_id[pid]['name']} cannot be had by now "
                        f"(pot={pid in c_pots}, page={pid in c_pages})")
        elif v["kind"] == "effect":
            who = v.get("who", "human")
            if who not in T.SPECIES: bad(f"{vt}: asks for species {who!r}")
            elif not anyFor(v["needs"], who):
                bad(f"{vt}: nothing that {v['needs']!r} FOR A {who.upper()} can be had by now")
        elif v["kind"] == "recipe":
            who = v.get("who", "human")
            for need in v["needs"]:
                if not anyFor(need, who):
                    bad(f"{vt}: recipe step {need!r} for a {who} cannot be had by now")
        elif v["kind"] == "fork":
            for pid in v.get("accepts", []):
                if not ready(pid):
                    bad(f"{vt}: fork option {by_id[pid]['name']} cannot be had by now")

    ev = next((e for e in EVENINGS if e["day"] == day), None)
    if ev and ev.get("egg") and not anyFor(ev["egg"]["needs"], "dragon"):
        bad(f"evening {day}: the egg wants {ev['egg']['needs']!r} and nothing can be had by now")

# --- the doors have to be worth having, and fair
for hid, (why, want, keys, rew) in T.GATES.items():
    if hid not in hab_ids: bad(f"gate on unknown location {hid}"); continue
    if hid in {h[0] for h in T.HABITATS if h[5]}:
        bad(f"gate on {hid}, which is known from the start")
    for k in keys:
        if k not in T.EFFECTS: bad(f"gate {hid}: unknown key effect {k!r}")
    if hid not in gate_day: bad(f"gate {hid} is never openable in sixteen days"); continue
    told = lead_day.get(hid, 99)
    # At least two ways in. A plant counts only if you could actually have it
    # without going through THIS door: on the shelf at the start, handed over
    # the counter, or found behind some other door that opens sooner. Where it
    # grows is beside the point — Mary's Breath grows in the churchyard and
    # Sister Vaile brings you one.
    obtainable = start_pots | handed_pots | {
        i for h2, (a, b, c, r) in T.GATES.items()
        if h2 != hid and gate_day.get(h2, 99) <= gate_day[hid]
        for i in r.get("pots", [])}
    ways = [p["name"] for k in keys for p in by_effect[k] if p["id"] in obtainable]
    if len(ways) < 2:
        bad(f"gate {hid}: only {len(ways)} way(s) in ({ways}) — never one plant, one door")
    if gate_day[hid] < told:
        bad(f"gate {hid} opens on day {gate_day[hid]} but is not led to until {told}")
for hid, (why, want, keys, rew) in T.GATES.items():
    for i in rew.get("pots", []):
        if any(i in v.get("pots", []) for d in DAYS for v in d["visitors"]):
            bad(f"gate {hid}: its reward {by_id[i]['name']} is also handed over the counter, "
                f"so the door is decoration")

# --- every plant earns its place: asked for by somebody, or it opens a door
asked = collections.Counter()
for d in DAYS:
    for v in d["visitors"]:
        if v["kind"] == "describe": asked[v["accepts"][0]] += 1
        elif v["kind"] == "fork":
            for pid in v.get("accepts", []): asked[pid] += 1
        elif v["kind"] in ("effect", "recipe"):
            for need in ([v["needs"]] if v["kind"] == "effect" else v["needs"]):
                for p in by_effect[need]: asked[p["id"]] += 1
keyplants = {q["id"] for hid, (w, x, ks, r) in T.GATES.items() for k in ks for q in by_effect[k]}
rewards   = {i for hid, (w, x, ks, r) in T.GATES.items() for i in r.get("pots", [])}
handed    = {i for d in DAYS for v in d["visitors"] for i in v.get("pots", [])}
for p in PLANTS:
    if p["id"] not in c_pages:
        bad(f"{p['name']}: no page for it ever reaches the book")
    if not asked[p["id"]] and p["id"] not in keyplants:
        bad(f"{p['name']} is never asked for and opens no door — it is decoration")

# --- the effect split has to stay split
ec = collections.Counter((p["effect"], p["species"]) for p in PLANTS)
for (e, sp), n in ec.items():
    if n > 2:
        bad(f"{e!r} for {sp} covers {n} plants — that request would have {n} right answers")
cross = sorted({e for e in {p["effect"] for p in PLANTS}
                if len({p["species"] for p in by_effect[e]}) > 1})

# --- days are a readable length
for d in DAYS:
    n = len(d["visitors"])
    if not (5 <= n <= 8): bad(f"day {d['day']} has {n} visitors")

sp_count = collections.Counter(p["species"] for p in PLANTS)
print(f"effects: {len(T.EFFECTS)} for {len(PLANTS)} plants; "
      f"{sum(1 for v in ec.values() if v == 2)} same-species pairs, none with three")
print(f"species: {sp_count['human']} human, {sp_count['dragon']} dragon, {sp_count['both']} either; "
      f"{len(cross)} effects exist for both as different plants ({', '.join(cross)})")
print(f"start: {len([p for p in PLANTS if p['start'] in ('both','pot')])} pots, "
      f"{len([p for p in PLANTS if p['start'] in ('both','page')])} pages, "
      f"{len([p for p in PLANTS if p['start']=='both'])} ready to hand over on day one")
print(f"pages in the book by day 16: {len(c_pages)}/{len(PLANTS)}; "
      f"cuttings over the counter: {len(handed)}; {len(rewards)} only exist behind a door")
print(f"asked for by somebody: {sum(1 for p in PLANTS if asked[p['id']])}/{len(PLANTS)}; "
      f"{len(keyplants - {p['id'] for p in PLANTS if asked[p['id']]})} more open one")
print("doors, in the order a diligent player reaches them: "
      + ", ".join(f"{h} d{gate_day[h]}" for h in sorted(gate_day, key=gate_day.get)))

# --- the evenings
if len(EVENINGS) != len(DAYS): bad(f"{len(EVENINGS)} evenings for {len(DAYS)} days")
seen_days = set()
for e in EVENINGS:
    et = f"evening {e['day']}"
    if e["day"] in seen_days: bad(f"{et}: two evenings for the same day")
    seen_days.add(e["day"])
    if not (1 <= e["day"] <= len(DAYS)): bad(f"{et}: no such day")
    if len(e["body"]) < 80: bad(f"{et}: body is too short to be a scene")
    ch = e.get("choice")
    if ch:
        if len(ch["options"]) != 2: bad(f"{et}: a choice has two ways")
        flags = [o["flag"] for o in ch["options"]]
        if len(set(flags)) != 2: bad(f"{et}: both options set the same flag")
        for o in ch["options"]:
            if not o["reply"]: bad(f"{et}: option {o['label']!r} has no consequence")
# a quote in an evening must be a line Hester actually wrote in the book
uses = {p["use"] for p in PLANTS}
for e in EVENINGS:
    q = e.get("quote")
    if q and not any(q in u for u in uses):
        bad(f"evening {e['day']}: quote {q!r} is not in any plant's notes")
nchoice = sum(1 for e in EVENINGS if "choice" in e)
print(f"{len(EVENINGS)} evenings, {nchoice} with a choice, "
      f"{sum(1 for e in EVENINGS if 'letter' in e)} letters")

print(f"{len(DAYS)} days, {sum(len(d['visitors']) for d in DAYS)} visitors")
print(f"locations led to: {len(open_habs)}/{len(T.HABITATS)}  "
      f"(three of them do not exist until she makes them)")
if problems:
    print(f"\n{len(problems)} PROBLEMS:")
    for m in problems: print(" -", m)
    raise SystemExit(1)
from days import LOST_UNDERLINES
if LOST_UNDERLINES:
    print("NOTE: an edit rewrote a line out from under its underline:")
    for vid, gone in LOST_UNDERLINES:
        print("   %s no longer contains %s" % (vid, ", ".join(repr(g) for g in gone)))

print("all checks pass")
