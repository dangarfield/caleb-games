# -*- coding: utf-8 -*-
"""Fold a dragonseed-edits.json from DEPENDENCIES.html back into the content tables.

    python3 build/apply_edits.py ~/Downloads/dragonseed-edits.json [--dry]

DEPENDENCIES.html hands out an id for every editable line — "v:v_maren1:line",
"evening:5:letter", "plant:n128:use" — and those ids are the addresses used
here. For each one the applier knows which Python file holds it, finds the
CURRENT text in that file, and puts the new text in its place.

Finding it is the only hard part, because a string in the source is not the
string the game sees: it is split across lines with implicit concatenation
("…so " / "you can imagine.") and its newlines are written \\n. So the search
is built as a pattern that lets any two characters be separated by a quote, a
line break and indentation, and that accepts either a real newline or its
escape. The replacement is re-wrapped the same way, so the file still reads
like something a person typed.

Nothing is written unless every edit was located: a half-applied batch is worse
than none. Run validate.py and emit.py afterwards (deploy does).
"""
import sys, os, re, json, textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import taxonomy as T
from plants import PLANTS
from days import DAYS
from papers import PAPERS
from evenings import EVENINGS, PROLOGUE
from endings import ENDINGS, CODAS
try:
    from newtext import V as NEW
except ImportError:
    NEW = {}

def _where(vid, *keys):
    """Everything anybody says now lives in newtext.py, keyed by visitor id;
    days.py keeps only the lines newtext.py has not taken over."""
    n = NEW.get(vid) or {}
    return "newtext.py" if any(k in n for k in keys) else "days.py"

# ---- the same ids DEPENDENCIES.html hands out, and where each one lives -----
def current():
    """id -> (file, text as the game sees it)."""
    m = {}          # id -> (file, text as the game sees it, generated tail to strip)
    for i, panel in enumerate(PROLOGUE):
        m["prologue:%d:title" % i] = ("evenings.py", panel["title"])
        m["prologue:%d:body" % i]  = ("evenings.py", panel["body"])
        if panel.get("quote"): m["prologue:%d:quote" % i] = ("evenings.py", panel["quote"])
    for d in DAYS:
        m["day:%d:note" % d["day"]] = ("days.py", d["note"])
        for v in d["visitors"]:
            vid = v["id"]
            # a DESCRIBE line is an opener plus a clause the build generates from
            # the plant's own axes. Only the opener is written down anywhere, so
            # that is what gets edited, and the generated tail comes off first.
            line, tail = v.get("line", ""), None
            if v["kind"] == "describe":
                n = NEW.get(vid) or {}
                said = n.get("opener")
                if said is None:
                    said = line.rsplit(". ", 1)[0] if ". " in line else line
                if line.startswith(said):
                    tail = line[len(said):]
                    line = said
            m["v:%s:line" % vid] = (_where(vid, "line", "opener"), line, tail)
            if v.get("reply") and not v.get("fork"):
                m["v:%s:reply" % vid] = (_where(vid, "reply"), v["reply"], None)
            for i, f in enumerate(v.get("fork", [])):
                m["v:%s:fork:%d:reply" % (vid, i)] = (_where(vid, "fork"), f["reply"], None)
    for e in EVENINGS:
        d = e["day"]
        m["evening:%d:title" % d] = ("evenings.py", e["title"])
        m["evening:%d:body" % d]  = ("evenings.py", e["body"])
        for k in ("letter", "quote"):
            if e.get(k): m["evening:%d:%s" % (d, k)] = ("evenings.py", e[k])
        if e.get("egg"):
            m["evening:%d:egg:ok" % d]    = ("evenings.py", e["egg"]["ok"])
            m["evening:%d:egg:wrong" % d] = ("evenings.py", e["egg"]["wrong"])
        if e.get("choice"):
            m["evening:%d:choice:prompt" % d] = ("evenings.py", e["choice"]["prompt"])
            for i, o in enumerate(e["choice"]["options"]):
                m["evening:%d:choice:%d:label" % (d, i)] = ("evenings.py", o["label"])
                m["evening:%d:choice:%d:reply" % (d, i)] = ("evenings.py", o["reply"])
    for p in PLANTS:
        m["plant:%s:plate" % p["id"]] = ("plants.py", p["plate"])
        m["plant:%s:use" % p["id"]]   = ("plants.py", p["use"])
    for n in PAPERS:
        for k in ("title", "byline", "body"):
            m["paper:%s:%s" % (n["id"], k)] = ("papers.py", n[k])
    for h in T.HABITATS:
        hid, name, short, emoji, note, known, cell, lead = h
        m["place:%s:name" % hid] = ("taxonomy.py", name)
        m["place:%s:note" % hid] = ("taxonomy.py", note)
        if lead: m["place:%s:lead" % hid] = ("taxonomy.py", lead)
    for hid, (why, wants, keys, rew) in T.GATES.items():
        m["gate:%s:why" % hid]   = ("taxonomy.py", why)
        m["gate:%s:wants" % hid] = ("taxonomy.py", wants)
    for k, v in T.EFFECTS.items():
        m["effect:%s" % k] = ("taxonomy.py", v)
    for e in ENDINGS:
        f = e["flag"] or "none"
        m["ending:%s:title" % f] = ("endings.py", e["title"])
        m["ending:%s:body" % f]  = ("endings.py", e["body"])
    for c in CODAS:
        m["coda:%s:text" % c["flag"]] = ("endings.py", c["text"])
    return {k: (v if len(v) == 3 else (v[0], v[1], None)) for k, v in m.items()}

# ---- finding a runtime string in Python source -----------------------------
JOIN = r'(?:\s*"\s*(?:#[^\n]*)?\s*"\s*)?'      # …" \n  "… implicit concatenation

def pattern_for(text):
    """A regex that finds `text` however the source has wrapped or escaped it."""
    out = []
    for ch in text:
        if ch == "\n":
            out.append(r'(?:\\n|\n)')
        elif ch == '"':
            out.append(r'(?:\\"|")')
        elif ch == " ":
            out.append(r'(?:\s|"\s*")+')       # a space may be where the line broke
        else:
            out.append(re.escape(ch))
        out.append(JOIN)
    return re.compile("".join(out[:-1]))

def literal(text, indent):
    """The new text, wrapped, as the inside of a double-quoted literal."""
    chunks = []
    for para in text.split("\n"):
        chunks.append(textwrap.wrap(para, 74, break_long_words=False,
                                    drop_whitespace=False) or [""])
    lines, first = [], True
    for i, para in enumerate(chunks):
        for line in para:
            lines.append(line)
        if i < len(chunks) - 1:
            lines[-1] = lines[-1] + "\\n"
    body = ('"\n' + indent + '"').join(l.replace('"', '\\"') for l in lines)
    return body

def apply(path, was, now):
    src = open(path, encoding="utf-8").read()
    pat = pattern_for(was)
    m = pat.search(src)
    if not m: return None
    start = src.rfind("\n", 0, m.start()) + 1
    indent = " " * (len(src[start:]) - len(src[start:].lstrip()))
    if len(indent) < 4: indent = "      "
    return src[:m.start()] + literal(now, indent) + src[m.end():]

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    dry = "--dry" in sys.argv
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    edits = data.get("edits") or data.get("text") or {}
    have = current()

    todo, same, unknown = [], 0, []
    for fid, now in edits.items():
        if fid not in have: unknown.append(fid); continue
        f, was, tail = have[fid]
        if tail and now.endswith(tail): now = now[:-len(tail)]
        if now == was: same += 1; continue
        todo.append((fid, f, was, now))

    print("%d edits in the file · %d already match · %d unknown ids"
          % (len(edits), same, len(unknown)))
    for u in unknown: print("   unknown:", u)
    if not todo:
        print("nothing to do"); return

    files, missed = {}, []
    for fid, f, was, now in todo:
        path = os.path.join(HERE, f)
        if path not in files: files[path] = open(path, encoding="utf-8").read()
        saved = files[path]
        open(path, "w", encoding="utf-8").write(saved)     # apply against the live file
        out = apply(path, was, now)
        if out is None:
            missed.append((fid, f)); continue
        open(path, "w", encoding="utf-8").write(out)
        print("   %-34s %s" % (fid, f))

    if missed:
        print("\nCOULD NOT FIND %d — nothing was left half-done, but check these by hand:"
              % len(missed))
        for fid, f in missed: print("   %s  (%s)" % (fid, f))

    if dry:
        for path, saved in files.items(): open(path, "w", encoding="utf-8").write(saved)
        print("\n--dry: put the files back")
    else:
        print("\nApplied. Now: python3 build/validate.py && python3 build/emit.py "
              "&& python3 build/deps.py")

if __name__ == "__main__":
    main()
