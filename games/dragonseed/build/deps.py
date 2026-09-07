# -*- coding: utf-8 -*-
"""Emit DEPENDENCIES.html — every word in the game, and a pencil.

The page is three things at once: the dependency chains, the day-by-day audit,
and — since build 42 — an EDITOR. Every piece of writing the player can ever
see is on it in a box you can type into: the opening panels, every line and
reply at the counter, the evenings, the notes in the drawer, all 82 plants,
the places, what each effect is called, and the endings. An edited box marks
itself and keeps the original underneath so you can see what you changed, the
edits are kept in the browser between visits, and Export hands back a JSON
file that build/apply_edits.py folds into the Python tables.

Two views of the same thing.

The CHAINS are a transit diagram: five lines, each one dependency running
through the two weeks — a clue names a place, a plant opens it, and what is
inside is the only cutting of something somebody asks for later. Stops are laid
out left to right in day order but never closer than one label's width, so
nothing can ever overlap; each stop says which day it belongs to.

The DAY CARDS are the audit: every visitor, what they want, who for, and
everything the day puts in your hands — cuttings, pages, notes, leads, the
squares she changed, and any door that comes open.

Run it after validate.py; it replays the same diligent-player closure, so the
door days here are the ones the validator proved.
"""
import sys, os, re, html, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import taxonomy as T
from plants import PLANTS
from days import DAYS
from papers import PAPERS
from evenings import EVENINGS, PROLOGUE
from endings import ENDINGS, CODAS

e = html.escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def build_no():
    """The game's build number, so a printed page can be matched to a build."""
    try:
        src = open(os.path.join(ROOT, "js", "engine.js")).read()
        m = re.search(r'var BUILD\s*=\s*"([^"]+)"', src)
        return m.group(1) if m else "?"
    except Exception:
        return "?"

byid = {p["id"]: p for p in PLANTS}
byeff = collections.defaultdict(list)
for p in PLANTS: byeff[p["effect"]].append(p)
hab = {h[0]: dict(id=h[0], name=h[1], short=h[2], emoji=h[3], cell=h[6]) for h in T.HABITATS}
paper = {n["id"]: n for n in PAPERS}

# ---- replay the diligent player, exactly as validate.py does ----
pots  = {p["id"] for p in PLANTS if p["start"] in ("both", "pot")}
pages = {p["id"] for p in PLANTS if p["start"] in ("both", "page")}
told  = {h[0] for h in T.HABITATS if h[5]}
opened, gate_day = set(told), {}

def diligent(day):
    while True:
        moved = False
        for hid, (why, want, keys, rew) in T.GATES.items():
            if hid in opened or hid not in told: continue
            if T.FROM_DAY.get(hid, 1) > day: continue
            if not any(p["id"] in pots and p["id"] in pages for k in keys for p in byeff[k]): continue
            opened.add(hid); gate_day[hid] = day; moved = True
            for i in rew.get("pots", []): pots.add(i)
        if not moved: return

KIND = {"describe": "describes it", "effect": "has a problem", "recipe": "needs 3 things",
        "fork": "you choose", "gift": "gives you", "lead": "tells you where", "visit": "just talks"}
day_rows = []
for d in DAYS:
    row = dict(day=d["day"], weekday=d["weekday"], note=d["note"],
               visitors=[], pots=[], pages=0, papers=[], leads=[], doors=[],
               changes=[dict(cell=c[1], note=c[3]) for c in T.TERRAIN_CHANGES if c[0] == d["day"]])
    for v in d["visitors"]:
        for i in v.get("pots", []):
            pots.add(i); row["pots"].append(byid[i]["name"])
        for i in v.get("pages", []):
            if i not in pages: pages.add(i); row["pages"] += 1
        for pid in v.get("papers", []):
            n = paper[pid]; told.update(n.get("points", []))
            for g in n.get("gives", []): pages.add(g)
            row["papers"].append(dict(title=n["title"],
                gives=[byid[g]["name"] for g in n.get("gives", [])],
                points=[hab[x]["short"] for x in n.get("points", [])]))
        for h in v.get("opens", []):
            told.add(h); row["leads"].append(hab[h]["short"])
        before = set(opened); diligent(d["day"])
        for h in opened - before:
            row["doors"].append(dict(place=hab[h]["short"], emoji=hab[h]["emoji"],
                wants=T.GATES[h][1],
                keys=sorted({p["name"] for k in T.GATES[h][2] for p in byeff[k]
                             if p["id"] in pots and p["id"] in pages}),
                gives=[byid[i]["name"] for i in T.GATES[h][3].get("pots", [])]))

        item = dict(vid=v["id"], name=v["name"], kind=v["kind"], emoji=v["emoji"], who=v.get("who"),
                    say=v.get("line", ""), reply=v.get("reply", ""), answers=[], parts=[], forks=[])
        who = v.get("who", "human")

        def card_for(pid):
            q = byid[pid]
            return dict(name=q["name"], use=q["use"], species=q["species"],
                        where=hab[q["habitat"]]["name"] if q["habitat"] in hab else q["habitat"],
                        effect=T.EFFECTS[q["effect"]])
        def all_for(eff, wh):
            return [card_for(q["id"]) for q in byeff[eff]
                    if q["species"] == wh or q["species"] == "both" or wh == "both"]

        if v["kind"] == "describe":
            item["asks"] = byid[v["accepts"][0]]["name"]
            item["answers"] = [card_for(v["accepts"][0])]
        elif v["kind"] == "effect":
            item["asks"] = "something that " + T.EFFECTS[v["needs"]]
            item["answers"] = all_for(v["needs"], who)
        elif v["kind"] == "recipe":
            item["asks"] = ("%d things: " % len(v["needs"])) + "; ".join(T.EFFECTS[n] for n in v["needs"])
            item["parts"] = [dict(need=T.EFFECTS[n], answers=all_for(n, who)) for n in v["needs"]]
        elif v["kind"] == "fork":
            item["asks"] = " <b>or</b> ".join(byid[a]["name"] for a in v["accepts"])
            item["parts"] = [dict(need="give " + byid[f["plant"]]["name"],
                                  answers=[card_for(f["plant"])]) for f in v["fork"]]
            item["forks"] = [dict(plant=byid[f["plant"]]["name"], reply=f["reply"])
                             for f in v["fork"]]
        else:
            bits = []
            if v.get("pots"):   bits.append("%d cutting%s" % (len(v["pots"]), "" if len(v["pots"])==1 else "s"))
            if v.get("pages"):  bits.append("%d page%s" % (len(v["pages"]), "" if len(v["pages"])==1 else "s"))
            if v.get("papers"): bits.append("%d note%s" % (len(v["papers"]), "" if len(v["papers"])==1 else "s"))
            if v.get("opens"):  bits.append("where " + ", ".join(hab[h]["short"] for h in v["opens"]) + " is")
            if v.get("item"):   bits.append(v["item"].lower())
            item["asks"] = ", ".join(bits)
        row["visitors"].append(item)

    ev = next((x for x in EVENINGS if x["day"] == d["day"]), None)
    if ev:
        row["evening"] = dict(title=ev["title"],
                              egg=T.EFFECTS[ev["egg"]["needs"]] if ev.get("egg") else None,
                              letter=bool(ev.get("letter")), choice=bool(ev.get("choice")))
    day_rows.append(row)

# ---- the five chains, written by hand because they are a story, not a graph ----
LINES = [
 dict(id="shore", name="The shore line", colour="#3f8ea8", stops=[
   ("d3", "Marget names the shore"), ("coast", "Moonlace opens it"),
   ("Liverstone", "the only thing that numbs"), ("d9", "Wren works on the rider")]),
 dict(id="crag", name="The cold line", colour="#8f6fc4", stops=[
   ("d5", "Nan names the crags"), ("crag", "Brimlock opens it"),
   ("Winterglass", "the only burn cure for a dragon"), ("d14", "the Warden's fork")]),
 dict(id="deep", name="The dark line", colour="#c4863f", stops=[
   ("d8", "the tarn empties"), ("bed", "Skyreed opens it"),
   ("Shimmerlung", "a light of its own"), ("d10", "Constance names the cave"),
   ("cave", "Shimmerlung opens it"), ("Mellowglow", "pass unnoticed"),
   ("d11", "Nan at the barrows"), ("barrow", "Mellowglow opens it"),
   ("Solomon's Sceptre", "wakes a sleeping thing"), ("d14", "Constance asks for it")]),
 dict(id="gorge", name="The gorge line", colour="#b5495b", stops=[
   ("cave", "the cave gives twice"), ("Wanderlamp", "a light that moves"),
   ("d15", "half the pike comes off"), ("gorge", "Wanderlamp opens it"),
   ("Nightvane", "unseats a mind"), ("d16", "Marget's last ask")]),
 dict(id="garden", name="The garden line", colour="#4d9160", stops=[
   ("d5", "the Reeve names the valley"), ("valley", "Fenwhistle opens it"),
   ("Royal Gentia", "cuts what binds"), ("d11", "Bramwell names the garden"),
   ("garden", "Royal Gentia opens it"), ("Sour Bandy", "brings a memory back"),
   ("d12", "Faye's lost night")]),
]

LANE_H, TOP, LEFT, COL, GAP = 108, 82, 156, 104, 168
W = LEFT + COL * 16 + 300
H = TOP + LANE_H * len(LINES) + 26
def x_for(day): return LEFT + (day - 1) * COL + COL / 2
def day_of(key):
    if re.fullmatch(r"d\d+", key): return int(key[1:])
    if key in gate_day: return gate_day[key]
    for row in day_rows:
        for door in row["doors"]:
            if key in door["gives"]: return row["day"]
        if key in row["pots"]: return row["day"]
    return 1

svg = ['<svg viewBox="0 0 %d %d" class="tube" role="img" '
       'aria-label="Five dependency chains across the sixteen days">' % (W, H)]
for d in range(1, len(DAYS) + 1):
    x = x_for(d)
    svg.append('<line class="tube__rule" x1="%.0f" y1="%d" x2="%.0f" y2="%d"/>' % (x, TOP-42, x, H-12))
    svg.append('<text class="tube__day" x="%.0f" y="%d">DAY %d</text>' % (x, TOP-50, d))
for i, ln in enumerate(LINES):
    y = TOP + i * LANE_H
    ds = [day_of(k) for k, _ in ln["stops"]]
    xs = []
    for d in ds:
        x = x_for(d)
        if xs: x = max(x, xs[-1] + GAP)
        xs.append(x)
    svg.append('<path class="tube__line" style="stroke:%s" d="M%.0f %d L%.0f %d"/>'
               % (ln["colour"], xs[0], y, xs[-1], y))
    svg.append('<text class="tube__name" x="%d" y="%d" style="fill:%s">%s</text>'
               % (LEFT-20, y+4, ln["colour"], e(ln["name"])))
    for j, ((key, label), x, d) in enumerate(zip(ln["stops"], xs, ds)):
        isday, isdoor = bool(re.fullmatch(r"d\d+", key)), key in gate_day
        cls = "tube__stop--door" if isdoor else ("tube__stop--day" if isday else "tube__stop--thing")
        svg.append('<circle class="tube__stop %s" cx="%.0f" cy="%d" r="%d" style="stroke:%s"/>'
                   % (cls, x, y, 9 if isdoor else 6, ln["colour"]))
        ty = y - 24 if j % 2 == 0 else y + 32
        svg.append('<text class="tube__stoplab" x="%.0f" y="%d">%s</text>'
                   % (x, ty, e("Day %d" % d if isday else key)))
        svg.append('<text class="tube__stopsub" x="%.0f" y="%d">%s</text>'
                   % (x, ty + 13, e(("" if isday else "day %d · " % d) + label)))
svg.append('</svg>')


# ---------------------------------------------------------------- the editor
# Every editable string in the game gets a stable id: the same id the applier
# uses to find it again in the Python tables. ORIG is shipped to the page so a
# box knows when it has been changed, can show what it used to say, and can put
# it back.
ORIG = {}

def field(fid, label, text, cls=""):
    """One editable box. Returns HTML; records the original."""
    if text is None: text = ""
    ORIG[fid] = text
    return ('<div class="f %s" data-id="%s"><span class="f__lab">%s</span>'
            '<div class="f__v" contenteditable="true" spellcheck="true">%s</div></div>'
            % (cls, e(fid), e(label), e(text)))

KIND = {"describe": "describes it", "effect": "has a problem", "recipe": "needs 3 things",
        "fork": "you choose", "gift": "gives you", "lead": "tells you where", "visit": "just talks"}

def answer_html(a):
    sp = ("dragons" if a["species"] == "dragon" else
          "people" if a["species"] == "human" else "either")
    return ('<div class="ans"><span class="ans__n">%s</span>'
            '<span class="ans__sp ans__sp--%s">%s</span>'
            '<span class="ans__w">%s</span><p class="ans__u">%s</p></div>'
            % (e(a["name"]), a["species"], sp, e(a["where"]), e(a["use"])))

# ---- day cards -------------------------------------------------------------
cards = []
for row in day_rows:
    vs = []
    for v in row["visitors"]:
        vid = v["vid"]
        who = ' <span class="who">for a dragon</span>' if v.get("who") == "dragon" else \
              (' <span class="who who--h">for a person</span>' if v.get("who") == "human" else "")
        asks = v["asks"] if v["asks"] else '<span class="dim">nothing changes hands</span>'

        body = [field("v:%s:line" % vid, "says", v["say"], "f--say")]
        if v["answers"]:
            body.append('<p class="lab">Right answer%s</p>' % ("" if len(v["answers"]) == 1 else "s"))
            body.append("".join(answer_html(a) for a in v["answers"]))
        for i, part in enumerate(v["parts"]):
            body.append('<p class="lab">%s</p>' % e(part["need"]))
            body.append("".join(answer_html(a) for a in part["answers"]))
        for i, fk in enumerate(v.get("forks", [])):
            body.append(field("v:%s:fork:%d:reply" % (vid, i),
                              "then, if you give " + fk["plant"], fk["reply"], "f--rep"))
        if v["reply"] and not v.get("forks"):
            body.append(field("v:%s:reply" % vid, "then", v["reply"], "f--rep"))
        vs.append('<li class="v v--%s"><span class="v__k">%s</span>'
                  '<span class="v__n">%s %s</span><span class="v__a">%s%s</span>'
                  '<div class="v__body">%s</div></li>'
                  % (v["kind"], KIND[v["kind"]], v["emoji"], e(v["name"]), asks, who, "".join(body)))

    got = []
    if row["pots"]:  got.append('<p class="got"><b>Cuttings</b> %s</p>' % e(", ".join(row["pots"])))
    if row["pages"]: got.append('<p class="got"><b>Pages</b> %d back in the book</p>' % row["pages"])
    for n in row["papers"]:
        bits = []
        if n["gives"]:  bits.append("pages for " + ", ".join(n["gives"]))
        if n["points"]: bits.append("where " + ", ".join(n["points"]) + " is")
        got.append('<p class="got got--paper"><b>Note</b> %s%s</p>'
                   % (e(n["title"]), (" — " + e("; ".join(bits))) if bits else ""))
    for l in row["leads"]:
        got.append('<p class="got got--lead"><b>Told about</b> %s</p>' % e(l))
    for c in row["changes"]:
        got.append('<p class="got got--change"><b>%s changes</b> %s</p>' % (e(c["cell"]), e(c["note"])))
    for dr in row["doors"]:
        got.append('<p class="got got--door"><b>%s %s opens</b> — it wanted %s; you had %s; '
                   'inside: <em>%s</em></p>'
                   % (dr["emoji"], e(dr["place"]), e(dr["wants"]),
                      e(", ".join(dr["keys"][:3]) or "nothing"), e(", ".join(dr["gives"]))))

    ev = next((x for x in EVENINGS if x["day"] == row["day"]), None)
    evh = ""
    if ev:
        d = ev["day"]
        parts = [field("evening:%d:title" % d, "night title", ev["title"]),
                 field("evening:%d:body" % d, "the scene", ev["body"])]
        if ev.get("letter"): parts.append(field("evening:%d:letter" % d, "a note", ev["letter"], "f--letter"))
        if ev.get("quote"):  parts.append(field("evening:%d:quote" % d, "from the book", ev["quote"]))
        if ev.get("egg"):
            parts.append('<p class="lab">The egg wants something that %s</p>' % e(T.EFFECTS[ev["egg"]["needs"]]))
            parts.append(field("evening:%d:egg:ok" % d, "if you get it right", ev["egg"]["ok"]))
            parts.append(field("evening:%d:egg:wrong" % d, "if you get it wrong", ev["egg"]["wrong"]))
        if ev.get("choice"):
            parts.append(field("evening:%d:choice:prompt" % d, "the choice", ev["choice"]["prompt"]))
            for i, o in enumerate(ev["choice"]["options"]):
                parts.append(field("evening:%d:choice:%d:label" % (d, i), "option %d" % (i + 1), o["label"]))
                parts.append(field("evening:%d:choice:%d:reply" % (d, i), "…and what happens", o["reply"], "f--rep"))
        evh = '<div class="eve"><p class="eve__lab">The evening</p>%s</div>' % "".join(parts)

    cards.append('<section class="day" id="day%d">'
      '<header class="day__head"><span class="day__n">%d</span>'
      '<span class="day__wd">%s</span>%s</header>'
      '<ul class="vs">%s</ul><div class="unlocks">%s</div>%s</section>'
      % (row["day"], row["day"], e(row["weekday"]),
         field("day:%d:note" % row["day"], "the day's note", row["note"], "f--note"),
         "".join(vs), "".join(got) or '<p class="got dim">Nothing new.</p>', evh))

# ---- the other narrative ---------------------------------------------------
pro = []
for i, panel in enumerate(PROLOGUE):
    bits = [field("prologue:%d:title" % i, "title", panel["title"]),
            field("prologue:%d:body" % i, "panel %d" % (i + 1), panel["body"])]
    if panel.get("quote"): bits.append(field("prologue:%d:quote" % i, "from the book", panel["quote"]))
    pro.append('<section class="card">%s</section>' % "".join(bits))

plants = []
for p in sorted(PLANTS, key=lambda x: x["name"]):
    sp = ("dragons" if p["species"] == "dragon" else "people" if p["species"] == "human" else "either")
    plants.append('<section class="card card--plant">'
      '<header class="card__head"><b>%s</b> <i>%s</i>'
      '<span class="ans__sp ans__sp--%s">%s</span>'
      '<span class="ans__w">%s · %s</span></header>%s%s</section>'
      % (e(p["name"]), e(p["binomial"]), p["species"], sp,
         e(hab[p["habitat"]]["name"] if p["habitat"] in hab else p["habitat"]),
         e(T.EFFECTS[p["effect"]]),
         field("plant:%s:plate" % p["id"], "what it looks like", p["plate"]),
         field("plant:%s:use" % p["id"], "what the book says it is for", p["use"])))

notes = []
for n in PAPERS:
    notes.append('<section class="card"><header class="card__head"><b>%s</b>'
      '<span class="ans__w">%s</span></header>%s%s%s</section>'
      % (e(n["title"]), e(n["kind"]),
         field("paper:%s:title" % n["id"], "title", n["title"]),
         field("paper:%s:byline" % n["id"], "byline", n["byline"]),
         field("paper:%s:body" % n["id"], "the note", n["body"], "f--letter")))

places = []
for h in T.HABITATS:
    hid, name, short, emoji, note, known, cell, lead = h
    bits = [field("place:%s:name" % hid, "name", name),
            field("place:%s:note" % hid, "what it is like", note)]
    if lead: bits.append(field("place:%s:lead" % hid, "how you are told to find it", lead))
    if hid in T.GATES:
        why, wants, keys, rew = T.GATES[hid]
        bits.append(field("gate:%s:why" % hid, "why you cannot get in", why))
        bits.append(field("gate:%s:wants" % hid, "what it wants, in words", wants))
    places.append('<section class="card"><header class="card__head">%s <b>%s</b>'
                  '<span class="ans__w">%s</span></header>%s</section>'
                  % (emoji, e(name), e(cell), "".join(bits)))

effects = []
for k in sorted(T.EFFECTS):
    effects.append(field("effect:%s" % k, k, T.EFFECTS[k], "f--eff"))

ends = []
for en in ENDINGS:
    ends.append('<section class="card">%s%s</section>'
      % (field("ending:%s:title" % (en["flag"] or "none"), "ending — " + (en["flag"] or "neither"), en["title"]),
         field("ending:%s:body" % (en["flag"] or "none"), "what it says", en["body"])))
for c in CODAS:
    ends.append('<section class="card card--coda">%s</section>'
      % field("coda:%s:text" % c["flag"], "if " + c["flag"], c["text"], "f--rep"))

sp = collections.Counter(p["species"] for p in PLANTS)
CSS = """
:root{--ink:#241f17;--dim:#7a7060;--rule:#ded5c0;--paper:#f6f1e4;--card:#fffdf7;
      --brass:#9a7433;--dragon:#a8552c;--edit:#3f7a8c;--editbg:#eef6f8}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);
     font:15px/1.5 ui-serif,Georgia,serif;-webkit-font-smoothing:antialiased}
header.top{padding:26px 34px 0;border-bottom:2px solid var(--ink)}
h1{margin:0;font-size:1.8rem}
.sub{margin:6px 0 0;color:var(--dim);font-size:.95rem;max-width:96ch}
.stats{display:flex;gap:26px;margin:14px 0;flex-wrap:wrap;
       font:600 .72rem/1 ui-sans-serif,system-ui;letter-spacing:.1em;text-transform:uppercase}
.stats b{display:block;font-size:1.5rem;letter-spacing:0;margin-bottom:3px;font-family:ui-serif,Georgia,serif}
.bar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
     margin:0 -34px;padding:10px 34px;background:#efe8d6;border-top:1px solid var(--rule)}
.bar button{font:700 .74rem ui-sans-serif,system-ui;padding:7px 14px;border-radius:8px;cursor:pointer;
     border:1px solid #b8a67e;background:#fffdf7;color:var(--ink)}
.bar button:hover{border-color:var(--ink);background:#fff}
.bar button.go{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.bar button.go:hover{background:#3b3325}
.bar .count{font:800 .74rem ui-sans-serif,system-ui;letter-spacing:.06em;text-transform:uppercase;
     color:var(--dim);margin-right:auto}
.bar .count.on{color:var(--edit)}
.bar input[type=search]{font:inherit;font-size:.82rem;padding:6px 10px;border-radius:8px;
     border:1px solid #b8a67e;background:#fffdf7;min-width:210px}
.bar label{font:600 .74rem ui-sans-serif,system-ui;color:var(--dim);display:flex;align-items:center;gap:5px}
nav.jump{position:sticky;top:47px;z-index:19;display:flex;gap:14px;flex-wrap:wrap;padding:8px 34px;
     background:var(--paper);border-bottom:1px solid var(--rule);
     font:700 .72rem ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase}
nav.jump a{color:var(--brass);text-decoration:none}
nav.jump a:hover{color:var(--ink)}
section.wrap{padding:22px 34px 60px}
h2{font-size:1.15rem;margin:36px 0 4px;scroll-margin-top:130px}
h2:first-child{margin-top:0}
.lede{margin:0 0 16px;color:var(--dim);font-size:.92rem;max-width:78ch}
.tubebox{overflow-x:auto;border:1px solid var(--rule);border-radius:10px;background:var(--card);padding:8px 0}
svg.tube{display:block;min-width:1960px;width:100%;height:auto}
.tube__rule{stroke:#e8e0cd;stroke-width:1}
.tube__day{fill:#a2937a;font:800 9px ui-sans-serif,system-ui;text-anchor:middle;letter-spacing:.13em}
.tube__line{fill:none;stroke-width:7;stroke-linecap:round;opacity:.9}
.tube__name{font:700 12px ui-sans-serif,system-ui;text-anchor:end}
.tube__stop{stroke-width:4}
.tube__stop--day{fill:#241f17}
.tube__stop--door{fill:#fffdf7;stroke-width:5}
.tube__stop--thing{fill:#fffdf7}
.tube__stoplab{font:800 11px ui-sans-serif,system-ui;fill:var(--ink);text-anchor:middle}
.tube__stopsub{font:italic 10.5px ui-serif,Georgia,serif;fill:var(--dim);text-anchor:middle}
.key{display:flex;gap:20px;margin:10px 0 0;font-size:.8rem;color:var(--dim);flex-wrap:wrap}
.key span{display:flex;align-items:center;gap:7px}
.key i{width:13px;height:13px;border-radius:50%;border:3px solid #8a7c62;display:inline-block}
.key i.d{background:#241f17;border-color:#241f17}.key i.o{background:#fffdf7;border-width:4px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(430px,1fr))}
.grid--wide{grid-template-columns:repeat(auto-fill,minmax(560px,1fr))}
.day,.card{border:1px solid var(--rule);border-radius:10px;background:var(--card);overflow:hidden}
.card{padding:12px 14px}
.card__head{font-size:.95rem;margin-bottom:6px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.card__head i{color:var(--dim);font-size:.84rem}
.card--coda{background:#fbf7ea}
.day__head{padding:11px 14px 9px;border-bottom:1px solid var(--rule);background:#f1ead8}
.day__n{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;
        background:var(--ink);color:var(--paper);font:800 .82rem ui-sans-serif,system-ui}
.day__wd{margin-left:8px;font:700 .7rem ui-sans-serif,system-ui;letter-spacing:.11em;
         text-transform:uppercase;color:var(--dim)}
.vs{list-style:none;margin:0;padding:9px 12px;border-bottom:1px dashed var(--rule)}
.v{display:grid;grid-template-columns:52px 1fr;gap:3px 8px;padding:5px 0;font-size:.84rem}
.v+.v{border-top:1px solid #f0ead9}
.v__k{font:800 .58rem/1.9 ui-sans-serif,system-ui;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
.v--effect .v__k,.v--recipe .v__k{color:var(--brass)}
.v--fork .v__k{color:#a8552c}.v--gift .v__k,.v--lead .v__k{color:#4d7a46}
.v__n{font-weight:600}.v__a{grid-column:2;color:#584f3f;font-size:.82rem}
.v__body{grid-column:2;margin-top:5px}
.who{display:inline-block;margin-left:5px;padding:0 6px;border-radius:8px;background:rgba(168,85,44,.13);
     color:var(--dragon);font:800 .56rem/1.6 ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase}
.who--h{background:rgba(77,122,70,.14);color:#3f6a3a}
.lab{margin:6px 0 4px;font:800 .58rem ui-sans-serif,system-ui;letter-spacing:.09em;
     text-transform:uppercase;color:var(--brass)}
.ans{margin:0 0 5px;padding:6px 9px;border:1px solid var(--rule);border-radius:8px;background:#fff}
.ans__n{font-weight:700}
.ans__sp{margin-left:6px;padding:0 6px;border-radius:8px;font:800 .55rem/1.7 ui-sans-serif,system-ui;
         letter-spacing:.07em;text-transform:uppercase;display:inline-block;vertical-align:1px}
.ans__sp--dragon{background:rgba(168,85,44,.13);color:var(--dragon)}
.ans__sp--human{background:rgba(77,122,70,.14);color:#3f6a3a}
.ans__sp--both{background:rgba(154,116,51,.15);color:var(--brass)}
.ans__w{margin-left:6px;color:var(--dim);font-size:.76rem}
.ans__u{margin:3px 0 0;font-size:.82rem;line-height:1.45;color:#4c4436}
.unlocks{padding:9px 12px}
.got{margin:0 0 5px;font-size:.8rem;line-height:1.45}
.got b{font:800 .6rem ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;color:var(--brass)}
.got--door{background:#f3ecd7;border-left:3px solid var(--brass);padding:6px 8px;border-radius:0 5px 5px 0}
.got--door b{color:#7d5a1e}
.got--paper b{color:#5b6b8a}.got--lead b{color:#4d7a46}.got--change b{color:#a8552c}
.eve{padding:10px 12px;border-top:1px solid var(--rule);background:#f1ead8}
.eve__lab{margin:0 0 6px;font:800 .6rem ui-sans-serif,system-ui;letter-spacing:.08em;
     text-transform:uppercase;color:var(--brass)}
.dim{color:var(--dim)}em{color:#7d5a1e;font-style:normal;font-weight:600}
.f{margin:0 0 7px;padding:5px 0 0}
.f__lab{display:block;font:800 .55rem ui-sans-serif,system-ui;letter-spacing:.09em;
     text-transform:uppercase;color:#a2937a;margin-bottom:2px}
.f__v{white-space:pre-wrap;font-size:.86rem;line-height:1.5;padding:5px 8px;border-radius:7px;
     border:1px solid transparent;background:transparent;outline:none}
.f__v:hover{border-color:#e3d9bf;background:#fffdf5}
.f__v:focus{border-color:var(--edit);background:#fff;box-shadow:0 0 0 3px rgba(63,122,140,.13)}
.f--say .f__v{background:#f3ecd7;border-color:#e6dcc0;font-size:.9rem}
.f--rep .f__v{background:#eef2e9;border-color:#dce6d6;color:#43503f}
.f--letter .f__v{background:#fffaf0;border-color:#e3d9bf;font-style:italic}
.f--note .f__v{font-style:italic;color:#4c4436}
.f--eff{display:grid;grid-template-columns:170px 1fr;align-items:baseline;gap:8px;margin:0;
     border-bottom:1px solid #f0ead9;padding:3px 0}
.f--eff .f__lab{margin:0;font-family:ui-monospace,monospace;text-transform:none;letter-spacing:0;font-size:.72rem}
.f.is-edited>.f__lab:after{content:" · edited";color:var(--edit)}
.f.is-edited .f__v{border-color:var(--edit);background:var(--editbg)}
.f__was{margin:4px 0 0;padding:4px 8px;border-left:2px solid #c9bfa4;background:#faf6ea;
     font-size:.78rem;line-height:1.45;color:var(--dim);white-space:pre-wrap}
.f__was b{font:800 .55rem ui-sans-serif,system-ui;letter-spacing:.08em;text-transform:uppercase;
     color:#a2937a;display:block}
.f__undo{float:right;font:700 .62rem ui-sans-serif,system-ui;color:var(--edit);background:none;
     border:none;cursor:pointer;padding:0 2px}
.f__undo:hover{text-decoration:underline}
body.only-edited .f:not(.is-edited){display:none}
body.only-edited .day:not(.has-edit),body.only-edited .card:not(.has-edit),
body.only-edited .v:not(.has-edit),body.only-edited .ans,body.only-edited .lab,
body.only-edited .unlocks,body.only-edited .tubebox,body.only-edited .key{display:none}
.hidden{display:none !important}
@media print{body{background:#fff}.day,.card{break-inside:avoid}.bar,nav.jump{display:none}}
"""

JS = r"""
/* Where the edits live: the same database the game uses, never the 5MB
   localStorage shelf the whole arcade shares. */
var KEY = "calebArcadeData:dragonseed:edits", DB = null;
function withDB(fn){
  if (DB) return fn(DB);
  var r; try { r = indexedDB.open("arcade", 1); } catch (e) { return fn(null); }
  r.onupgradeneeded = function(){ try { r.result.createObjectStore("kv"); } catch(e){} };
  r.onsuccess = function(){ DB = r.result; fn(DB); };
  r.onerror = function(){ fn(null); };
}
function loadEdits(then){
  withDB(function(d){
    if (!d) return then({});
    try { var q = d.transaction("kv","readonly").objectStore("kv").get(KEY);
          q.onsuccess = function(){ then(q.result || {}); };
          q.onerror = function(){ then({}); }; }
    catch (e) { then({}); }
  });
}
var saveTimer = null;
function saveEdits(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    withDB(function(d){
      if (!d) return;
      try { d.transaction("kv","readwrite").objectStore("kv").put(EDITS, KEY); } catch(e){}
    });
  }, 250);
}

var EDITS = {};
function boxes(){ return Array.prototype.slice.call(document.querySelectorAll(".f")); }
function textOf(box){
  return box.querySelector(".f__v").innerText.replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "");
}

function paint(box){
  var id = box.dataset.id, now = textOf(box), was = ORIG[id];
  var changed = now !== was;
  box.classList.toggle("is-edited", changed);
  var old = box.querySelector(".f__was");
  if (changed) {
    if (!old) { old = document.createElement("div"); old.className = "f__was"; box.appendChild(old); }
    old.innerHTML = "";
    var u = document.createElement("button");
    u.className = "f__undo"; u.textContent = "put it back";
    u.onclick = function(){ box.querySelector(".f__v").textContent = ORIG[id]; change(box); };
    var b = document.createElement("b"); b.textContent = "was";
    old.appendChild(u); old.appendChild(b);
    old.appendChild(document.createTextNode(was));
    EDITS[id] = now;
  } else {
    if (old) old.remove();
    delete EDITS[id];
  }
  var card = box.closest(".day, .card"), v = box.closest(".v");
  if (v) v.classList.toggle("has-edit", !!v.querySelector(".f.is-edited"));
  if (card) card.classList.toggle("has-edit", !!card.querySelector(".f.is-edited"));
}
function change(box){ paint(box); count(); saveEdits(); }
function count(){
  var n = Object.keys(EDITS).length;
  var el = document.getElementById("count");
  el.textContent = n ? (n + (n === 1 ? " edit" : " edits")) : "no edits yet";
  el.classList.toggle("on", !!n);
}

function download(name, obj){
  var blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function stamp(){ return new Date().toISOString().slice(0,19).replace("T"," "); }

document.addEventListener("DOMContentLoaded", function(){
  loadEdits(function(saved){
    EDITS = {};
    boxes().forEach(function(box){
      var id = box.dataset.id;
      if (saved[id] !== undefined && saved[id] !== ORIG[id])
        box.querySelector(".f__v").textContent = saved[id];
      paint(box);
    });
    count();
  });

  document.addEventListener("input", function(ev){
    var box = ev.target.closest && ev.target.closest(".f");
    if (box) change(box);
  });
  /* paste as plain text, or the page fills up with other people's fonts */
  document.addEventListener("paste", function(ev){
    if (!ev.target.closest || !ev.target.closest(".f__v")) return;
    ev.preventDefault();
    var t = (ev.clipboardData || window.clipboardData).getData("text");
    document.execCommand("insertText", false, t);
  });

  document.getElementById("exportEdits").onclick = function(){
    if (!Object.keys(EDITS).length) { alert("Nothing has been changed yet."); return; }
    download("dragonseed-edits.json", { build: BUILD, exported: stamp(), kind: "edits", edits: EDITS });
  };
  document.getElementById("exportAll").onclick = function(){
    var all = {};
    boxes().forEach(function(b){ all[b.dataset.id] = textOf(b); });
    download("dragonseed-text.json", { build: BUILD, exported: stamp(), kind: "everything",
                                    edited: Object.keys(EDITS), text: all });
  };
  document.getElementById("revertAll").onclick = function(){
    if (!Object.keys(EDITS).length) return;
    if (!confirm("Put every box back to what the game says? Your changes here are lost.")) return;
    boxes().forEach(function(b){
      if (b.classList.contains("is-edited")) {
        b.querySelector(".f__v").textContent = ORIG[b.dataset.id];
        paint(b);
      }
    });
    count(); saveEdits();
  };
  document.getElementById("onlyEdited").onchange = function(){
    document.body.classList.toggle("only-edited", this.checked);
  };
  document.getElementById("find").oninput = function(){
    var q = this.value.trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll(".day, .card"), function(c){
      c.classList.toggle("hidden", !!q && c.textContent.toLowerCase().indexOf(q) === -1);
    });
  };
});
"""

DOC = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Morrowfen — every word, and a pencil</title>
<style>%s</style>
<header class="top">
  <h1>Morrowfen — every word, and a pencil</h1>
  <p class="sub">Every line the player can ever read, in a box you can type into.
     Change one and it marks itself and keeps the original underneath; the changes stay
     in this browser. When you have finished, <b>Export changes</b> and hand the file back —
     <code>build/apply_edits.py</code> folds it into the game.
     Generated by <code>build/deps.py</code> — <b>build %s</b>, %s.</p>
  <div class="stats">
    <span><b>%d</b>visitors</span><span><b>%d</b>days</span><span><b>%d</b>plants</span>
    <span><b>%d</b>for dragons</span><span><b>%d</b>either</span><span><b>%d</b>doors</span>
    <span><b>%d</b>editable lines</span>
  </div>
  <div class="bar">
    <span class="count" id="count">no edits yet</span>
    <input type="search" id="find" placeholder="find a line, a name, a word…">
    <label><input type="checkbox" id="onlyEdited"> only what I changed</label>
    <button id="revertAll">Put it all back</button>
    <button id="exportAll">Export everything</button>
    <button class="go" id="exportEdits">Export changes</button>
  </div>
</header>
<nav class="jump">
  <a href="#chains">The chains</a><a href="#opening">The opening</a><a href="#days">Day by day</a>
  <a href="#plants">The plants</a><a href="#drawer">The drawer</a><a href="#places">The places</a>
  <a href="#uses">What things are for</a><a href="#endings">The endings</a>
</nav>
<section class="wrap">
  <h2 id="chains">The chains</h2>
  <p class="lede">Each line is one dependency running through the two weeks: a clue names a place,
     a plant opens it, and what is inside is the only cutting of something somebody asks for later.
     Stops run left to right in day order and every one says which day it is.</p>
  <div class="tubebox">%s</div>
  <p class="key"><span><i class="d"></i>a day</span><span><i></i>a door</span>
     <span><i class="o"></i>what you come away with</span></p>

  <h2 id="opening">The opening</h2>
  <p class="lede">The four panels day one starts on, before the shop.</p>
  <div class="grid">%s</div>

  <h2 id="days">Day by day</h2>
  <p class="lede">Every customer, word for word: what they say, whether it is for a person or a
     dragon, every plant that counts as a right answer with what the book says it is for, and what
     they say back when you get it right. The night at the foot of each card is the whole evening.</p>
  <div class="grid">%s</div>

  <h2 id="plants">The plants</h2>
  <p class="lede">What each one looks like (the description the player reads on its page) and what
     the book says it is for. Names, species and where they grow are structure, not prose — change
     those in <code>build/plants.py</code>.</p>
  <div class="grid">%s</div>

  <h2 id="drawer">The drawer</h2>
  <p class="lede">Alice's fourteen scraps of paper.</p>
  <div class="grid grid--wide">%s</div>

  <h2 id="places">The places</h2>
  <p class="lede">How each place is described, how you are told to find the ones nobody has pinned,
     and what the shut ones say when you cannot get in.</p>
  <div class="grid">%s</div>

  <h2 id="uses">What things are for</h2>
  <p class="lede">The phrase the book prints for every effect — the words a customer's problem is
     matched against. Sixty-nine of them, and the same phrase is read out at the counter.</p>
  <div class="card">%s</div>

  <h2 id="endings">The endings</h2>
  <p class="lede">The last screen, and the small things it remembers.</p>
  <div class="grid">%s</div>
</section>
<script>
const BUILD = %s;
const ORIG = %s;
%s
</script>
""" % (CSS, build_no(), __import__("datetime").date.today().isoformat(),
       sum(len(d["visitors"]) for d in DAYS), len(DAYS), len(PLANTS),
       sp["dragon"], sp["both"], len(T.GATES), len(ORIG),
       "\n".join(svg), "".join(pro), "".join(cards), "".join(plants),
       "".join(notes), "".join(places), "".join(effects), "".join(ends),
       __import__("json").dumps(build_no()), __import__("json").dumps(ORIG), JS)

open(os.path.join(ROOT, "DEPENDENCIES.html"), "w").write(DOC)
print("wrote DEPENDENCIES.html  %d days, %d visitors, %d doors, %d editable lines"
      % (len(DAYS), sum(len(d["visitors"]) for d in DAYS), len(gate_day), len(ORIG)))
