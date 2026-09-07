# -*- coding: utf-8 -*-
"""Emit js/data.js from the validated content tables."""
import sys, os, json, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import taxonomy as T
from plants import PLANTS
from days import DAYS
from evenings import EVENINGS, PROLOGUE
from papers import PAPERS
from endings import ENDINGS, CODAS

def js(o): return json.dumps(o, ensure_ascii=False)

out = io.StringIO()
w = out.write
w("""/* data.js — GENERATED. Do not edit by hand.
 * Source: build/{taxonomy,plants,days}.py + build/validate.py
 * Every specimen is proven uniquely identifiable from its observable axes, no
 * attribute value belongs to only one specimen, and every visitor puzzle is
 * proven solvable with the stock available on the day they are asked.
 *
 * All names, prose and characters are original to Morrowfen.
 */

""")

w("/* the axes the lens can reveal, in the order the lens offers them */\n")
w("const AXES = %s;\n\n" % js(T.AXES))

w("/* readable phrasing for an attribute value */\n")
w("const PHRASE = %s;\n\n" % json.dumps(T.PHRASE, ensure_ascii=False, indent=1))

w("/* what a specimen is FOR. Printed on a page only once the plant is named. */\n")
w("const EFFECTS = %s;\n\n" % json.dumps(T.EFFECTS, ensure_ascii=False, indent=1))

w("/* WHO a plant is for. Ten effects exist for both species as two different\n"
  "   plants, so \'something for a cough\' is half a question until you know who\n"
  "   is coughing. A visitor's request carries `who`. */\n")
w("const SPECIES = %s;\n" % js(T.SPECIES))
w("const SPECIES_SAY = %s;\n\n" % js(T.SPECIES_SAY))

w("/* The map is a %dx%d grid. Every location sits in one square; the hidden ones\n"
  "   are found by reading the lead and clicking the right square. */\n" % (len(T.GRID_COLS), T.GRID_ROWS))
w("const GRID = { cols:%s, rows:%d, town:%s };\n" % (js(list(T.GRID_COLS)), T.GRID_ROWS, js(T.TOWN_CELL)))
w("const TERRAIN = %s;\n\n" % js(list(T.TERRAIN)))

w("/* Three of these do not exist on day one. `from` is the morning the mother\n"
  "   makes them: before it the square is ordinary ground and the place is on no\n"
  "   chart, because it is not there.\n"
  "   A hidden place is also SHUT. `wants` is what it asks for in words, `keys`\n"
  "   are the effects that get you in, and `behind` is what is in there — which\n"
  "   for twelve of them is the only cutting of something somebody wants later. */\n")
w("const HABITATS = [\n")
for hid, name, short, emoji, note, known, cell, lead in T.HABITATS:
    w("  { id:%s, name:%s, short:%s, emoji:%s, note:%s, known:%s, cell:%s, lead:%s"
      % (js(hid), js(name), js(short), js(emoji), js(note), "true" if known else "false", js(cell), js(lead)))
    if hid in T.FROM_DAY: w(", from:%d" % T.FROM_DAY[hid])
    if hid in T.GATES:
        why, want, keys, rew = T.GATES[hid]
        w(",\n    shut:%s, wants:%s, keys:%s, behind:%s"
          % (js(why), js(want), js(keys),
             js({k: v for k, v in rew.items()})))
    w(" },\n")
w("];\n\n")
w("/* She is searching, not attacking, and a search that size leaves marks. Each\n"
  "   entry repaints one square from the morning of that day. */\n")
w("const TERRAIN_CHANGES = [\n")
for day, cell, code, note in T.TERRAIN_CHANGES:
    w("  { day:%d, cell:%s, code:%s, note:%s },\n" % (day, js(cell), js(code), js(note)))
w("];\n\n")

w("/* %d specimens. `start` means it is on the shelf on day one; otherwise it has\n"
  "   no pot and no page until the story or the map turns it up. There are no\n"
  "   quantities - a visitor buys a dose made from the plant, not the plant. */\n" % len(PLANTS))
w("const SPECIMENS = [\n")
for p in PLANTS:
    w("  { id:%s, name:%s, binomial:%s, kind:%s,\n" % (js(p["id"]), js(p["name"]), js(p["binomial"]), js(p["kind"])))
    w("    colour:%s, form:%s, petals:%s, leaf:%s, stem:%s, scent:%s, berry:%s, mark:%s,\n"
      % (js(p["colour"]), js(p["form"]), js(p["petals"]), js(p["leaf"]),
         js(p["stem"]), js(p["scent"]), js(p["berry"]), js(p["mark"])))
    w("    habitat:%s, effect:%s, species:%s, pot:%s, page:%s,\n"
      % (js(p["habitat"]), js(p["effect"]), js(p["species"]),
         "true" if p["start"] in ("both", "pot")  else "false",
         "true" if p["start"] in ("both", "page") else "false"))
    w("    plate:%s,\n" % js(p["plate"]))
    w("    use:%s },\n" % js(p["use"]))
w("];\n\n")

w("/* %d days, %d visitors. `wants` on a describe-visitor is exactly the set of\n"
  "   attributes their line states, and it resolves to exactly one specimen.\n"
  "   An effect-visitor accepts ANY specimen with that effect; `accepts` is the\n"
  "   canonical answer used for hints.\n"
  "   `finds` are specimens that appear on the shelf; `opens` are locations you\n"
  "   are told about, which become leads to find on the map. */\n" % (len(DAYS), sum(len(d["visitors"]) for d in DAYS)))
w("const DAYS = [\n")
for d in DAYS:
    w("  { day:%d, weekday:%s, note:%s,\n" % (d["day"], js(d["weekday"]), js(d["note"])))
    w("    pots:%s, pages:%s, papers:%s, opens:%s,\n"
      % (js(d["pots"]), js(d["pages"]), js(d["papers"]), js(d["opens"])))
    w("    visitors:[\n")
    for v in d["visitors"]:
        w("      { id:%s, name:%s, emoji:%s, kind:%s,\n" % (js(v["id"]), js(v["name"]), js(v["emoji"]), js(v["kind"])))
        w("        line:%s" % js(v["line"]))
        for k in ("pic","wants","needs","who","accepts","reply","opens","pots","pages","papers","steps","item","hi"):
            if k in v: w(",\n        %s:%s" % (k, js(v[k])))
        if "fork" in v: w(",\n        fork:%s" % js(v["fork"]))
        w(" },\n")
    w("    ] },\n")
w("];\n")

w("\n/* What day one opens on, before the counter. */\n")
w("const PROLOGUE = [\n")
for p in PROLOGUE:
    w("  { title:%s,\n    body:%s" % (js(p["title"]), js(p["body"])))
    if "quote" in p: w(",\n    quote:%s" % js(p["quote"]))
    w(" },\n")
w("];\n")

w("\n/* The clues drawer. A paper is a thing you pick up and read, and it is DONE\n"
  "   when everything it carries has been taken. */\n")
w("const PAPERS = [\n")
for n in PAPERS:
    w("  { id:%s, kind:%s, title:%s, byline:%s,\n    body:%s"
      % (js(n["id"]), js(n["kind"]), js(n["title"]), js(n["byline"]), js(n["body"])))
    for k in ("gives", "points", "flags"):
        if k in n: w(",\n    %s:%s" % (k, js(n[k])))
    w(" },\n")
w("];\n")

w("\n/* The evening between one day and the next: a scene, sometimes a letter from\n"
  "   Alice, sometimes a choice that sets a flag the way a fork does. */\n")
w("const EVENINGS = [\n")
for e in EVENINGS:
    w("  { day:%d, title:%s,\n    body:%s" % (e["day"], js(e["title"]), js(e["body"])))
    for k in ("letter", "quote"):
        if k in e: w(",\n    %s:%s" % (k, js(e[k])))
    if "egg" in e:
        g = e["egg"]
        w(",\n    egg:{ needs:%s, asks:%s, ok:%s, wrong:%s }"
          % (js(g["needs"]), js(g["asks"]), js(g["ok"]), js(g["wrong"])))
    if "choice" in e:
        c = e["choice"]
        w(",\n    choice:{ prompt:%s, options:[\n" % js(c["prompt"]))
        for o in c["options"]:
            w("      { label:%s, flag:%s, reply:%s },\n" % (js(o["label"]), js(o["flag"]), js(o["reply"])))
        w("    ] }")
    w(" },\n")
w("];\n")

w("\n/* The last screen. Chosen by the fork in the last hour of day sixteen; the\n"
  "   codas are the small things you decided on the way that it remembers. */\n")
w("const ENDINGS = [\n")
for e in ENDINGS:
    w("  { flag:%s, title:%s,\n    body:%s },\n" % (js(e["flag"]), js(e["title"]), js(e["body"])))
w("];\n")
w("const CODAS = [\n")
for c in CODAS:
    w("  { flag:%s, text:%s },\n" % (js(c["flag"]), js(c["text"])))
w("];\n")

src = out.getvalue()
open('/home/claude/build/js/data.js','w').write(src)
print("wrote data.js  %d lines  %.1f KB" % (src.count('\n'), len(src.encode())/1024))
