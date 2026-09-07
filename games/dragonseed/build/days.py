# -*- coding: utf-8 -*-
"""Sixteen days at the plant shop, and a glass dragon turning the valley over.

Everybody here keeps a dragon the way other places keep dogs, so a third of the
people at your counter want something for theirs. What is not ordinary is the
egg in your cellar. See STORY-SIMPLE.md.

A POT and a PAGE are separate things
  A pot is stock: a cutting on the shelf, and you can make a dose from it.
  A page is knowledge: the book's entry, what it looks like and what it is for.
  You need both to serve anybody — the page to name what you are holding, the
  pot to actually have any. (Nothing changes hands for money: a visitor asks
  and you give. What is scarce is knowing, not coin.)
  Pots come off the fell, or somebody brings you one. Pages come back to the
  book a PLACE AT A TIME: the loose leaves are out of order and turn up in the
  drawer, in the back room, in other people's attics. Recovering the leaves for
  the fen is what makes the fen worth walking to.

Visitor kinds
  describe / effect / recipe / fork   as before
  gift    hands you pots, pages, papers, or a story object
  lead    tells you where a place is
  visit   story only

Any visitor may carry pots=, pages=, papers=, opens=. Nothing arrives without
somebody bringing it.
"""

import taxonomy as T
from plants import PLANTS
from papers import PAPERS

# Every word anybody says lives in newtext.py, keyed by visitor id. This file
# is the STRUCTURE — which plant answers which request, who it is for, what
# each visitor hands over — and it stays put while the words change.
try:
    from newtext import V as NEW, WHO
except ImportError:                      # structure alone still builds
    NEW, WHO = {}, {}

BY_ID   = {p["id"]: p for p in PLANTS}
BY_NAME = {p["name"]: p for p in PLANTS}
PAPER_IDS = {n["id"] for n in PAPERS}

def fits(p, who):
    """Does this plant answer a request for that species? "both" cuts either way."""
    return p["species"] == who or p["species"] == "both" or who == "both"

def ids(*names):
    out = []
    for n in names:
        assert n in BY_NAME, n
        out.append(BY_NAME[n]["id"])
    return out

def leaves(hab):
    """The loose leaves for one place — every page for it you do not start
    with. The book comes back a habitat at a time, which is what makes a place
    worth walking to before you have been."""
    return [p["id"] for p in PLANTS
            if p["habitat"] == hab and p["start"] not in ("both", "page")]

# ---------------------------------------------------------------- the voice
SAY = {
  "colour": lambda v: v.capitalize(),
  "form": lambda v: {
    "bell":"bells that hang down", "star":"flat star flowers", "cup":"a deep cup",
    "cluster":"little heads all bunched together", "spike":"flowers up a spike",
    "disc":"broad flat discs", "trumpet":"long trumpets", "pompom":"round pompom heads",
    "cap":"a cap on a stalk", "frond":"fronds, not flowers", "none":"no flower at all"}[v],
  "petals": lambda v: {0:"no petals to speak of", 4:"four petals", 5:"five petals",
    6:"six points to it", 7:"seven petals", 12:"twelve petals",
    "many":"more petals than you can count"}[v],
  "leaf": lambda v: {
    "paired":"the leaves come in pairs", "heart":"heart-shaped leaves",
    "spiky":"stiff spiky leaves", "oval":"plain oval leaves", "toothed":"toothed leaves",
    "feathery":"feathery leaves", "grassy":"long grassy blades", "waxy":"thick waxy leaves",
    "lobed":"big lobed leaves", "needle":"dark needle leaves", "none":"no real leaves"}[v],
  "stem": lambda v: {
    "smooth":"a smooth stem", "hairy":"a hairy stem", "thorned":"thorns on it",
    "square":"a square stem", "woody":"a woody stem", "ridged":"a ridged stem",
    "none":"barely a stem"}[v],
  "scent": lambda v: {
    "none":"no smell at all", "sweet":"it smells sweet", "musk":"a heavy musky smell",
    "citrus":"it smells sharp, like peel", "smoke":"it smells of woodsmoke",
    "rot":"it smells of rot", "pine":"it smells of pine", "almond":"it smells of almonds",
    "earth":"it smells of turned earth", "mint":"a cold minty smell"}[v],
  "berry": lambda v: {"none":"no berries on it", "red":"red berries", "black":"black berries",
    "yellow":"yellow berries", "orange":"orange fruit"}[v],
  "mark": lambda v: {"none":"nothing odd about it", "glows":"it glows in the dark",
    "moves":"the leaves move on their own", "fuzzy":"fuzzy barbs on the stem",
    "reacts":"it darkens near poison", "sticky":"sticky resin on the leaves",
    "frost":"it is cold to the touch", "shimmer":"the petals shimmer",
    "weeps":"it weeps sap where you cut it"}[v],
}
PREF = ["colour", "form", "petals", "berry", "mark", "scent", "leaf", "stem"]

def _wants(target, axes=None, size=3):
    p = BY_ID[target]
    if axes:
        keys = axes.split()
    else:
        import itertools
        keys = None
        for n in range(1, 6):
            for combo in itertools.combinations(PREF, n):
                if sum(1 for q in PLANTS if all(q[a] == p[a] for a in combo)) == 1:
                    keys = list(combo); break
            if keys: break
        for a in PREF:
            if len(keys) >= size: break
            if a not in keys: keys.append(a)
        keys.sort(key=PREF.index)
    hits = [q for q in PLANTS if all(q[a] == p[a] for a in keys)]
    assert len(hits) == 1, (p["name"], keys, [h["name"] for h in hits])
    return {a: p[a] for a in keys}

def _clause(wants):
    bits = [SAY[a](v) for a, v in sorted(wants.items(), key=lambda kv: PREF.index(kv[0]))]
    if len(bits) == 1: return bits[0] + "."
    return ", ".join(bits[:-1]) + ", and " + bits[-1] + "."

# ---------------------------------------------------------------- builders
def _v(vid, name, emoji, kind, line, **kw):
    n = NEW.get(vid)
    pic = None
    if n:
        who = WHO.get(n.get("who"))
        if who: name, emoji = who
        pic = n.get("who")            # which face to draw, when there is artwork
        if n.get("line"): line = n["line"]
        if "reply" in n: kw["reply"] = n["reply"]
    d = dict(id=vid, name=name, emoji=emoji, kind=kind, line=line)
    if pic: d["pic"] = pic
    d.update({k: v for k, v in kw.items() if v not in (None, (), [])})
    return d

def show(vid, name, emoji, target, opener, reply, axes=None, size=3, **kw):
    w = _wants(target, axes, size)
    opener = NEW.get(vid, {}).get("opener", opener)
    line = (opener + " " if opener else "") + _clause(w)
    return _v(vid, name, emoji, "describe", line, wants=w, accepts=[target], reply=reply, **kw)

def ask(vid, name, emoji, need, line, reply, who="human", **kw):
    """`who` is the species the request is for, and it is half the puzzle: the
    answer must be that species or "both". A cough in a dragon is not a cough in
    a man."""
    assert who in T.SPECIES, who
    canon = [p["id"] for p in PLANTS if p["effect"] == need and fits(p, who)]
    assert canon, (need, who)
    return _v(vid, name, emoji, "effect", line, needs=need, who=who,
              accepts=canon[:1], reply=reply, **kw)

def recipe(vid, name, emoji, needs, line, reply, who="human", **kw):
    """A recipe is all for the same patient — three things for one man, or three
    things for one dragon."""
    assert who in T.SPECIES, who
    for n in needs:
        assert any(p["effect"] == n and fits(p, who) for p in PLANTS), (n, who)
    return _v(vid, name, emoji, "recipe", line, needs=needs, who=who, reply=reply,
              steps=["Something " + T.EFFECTS[n] + "." for n in needs], **kw)

def fork(vid, name, emoji, line, a, b, **kw):
    said = NEW.get(vid, {}).get("fork")
    ra, rb = (said[0], said[1]) if said else (a[2], b[2])
    return _v(vid, name, emoji, "fork", line, accepts=[a[0], b[0]],
              fork=[dict(plant=a[0], flag=a[1], reply=ra),
                    dict(plant=b[0], flag=b[1], reply=rb)], **kw)

def gift(vid, name, emoji, line, reply, **kw):
    return _v(vid, name, emoji, "gift", line, reply=reply, **kw)

def lead(vid, name, emoji, line, reply, **kw):
    return _v(vid, name, emoji, "lead", line, reply=reply, **kw)

def chat(vid, name, emoji, line, reply=None, **kw):
    return _v(vid, name, emoji, "visit", line, reply=reply, **kw)

# ------------------------------------------------------------- the underlines
# The first four days underline the words that matter, because a seven-year-old
# reading a wall of speech does not yet know which half of it is the puzzle. A
# DESCRIBE visitor gets its description underlined automatically (those phrases
# are generated, so they match to the letter); everything else is picked by hand
# below. After day four the underlines stop and you are reading for yourself.
HI = {
  # day 1
  "v_maren1":  ["can't sleep", "something for sleep"],
  "v_corbin1": ["eyes run all winter"],
  "v_wren1":   ["burning up", "breaks a fever"],
  "v_cook1":   ["ate something I shouldn't have", "my stomach is sorry"],
  # day 2
  "v_elsie2":  ["Not a cure", "Something kind"],
  "v_ivo2":    ["a cut on his arm"],
  "v_reeve2":  ["It is the man I want something for"],
  "v_pell2":   ["damp in my back room", "gone black"],
  "v_nan2b":   ["Blackfen", "at dawn"],
  # day 3
  "v_wren3":   ["grabbed a hot pan"],
  "v_wren3b":  ["the ache", "close it", "the burn"],
  "v_amos3":   ["all night", "isn't strong"],
  "v_marget3": ["west until you reach the sea, then north along the flats"],
  # day 4
  "v_corbin4": ["My hands", "the cold", "the ache"],
  "v_ivo4":    ["forge", "the smith I'm here for"],
  "v_thea4":   ["over the barn door", "The cow's off her milk", "the dragons won't go in"],
  "v_grayce4": ["stopping halfway up the yard", "Her heart is tired"],
}
UNDERLINE_UNTIL_DAY = 4
LOST_UNDERLINES = []      # phrases an edit has rewritten away; validate.py says so

def _underline(day, v):
    """Attach the phrases this line should underline. They must appear in the
    line exactly, or the runtime would have nothing to mark."""
    if day > UNDERLINE_UNTIL_DAY:
        v.pop("hi", None); return
    hi = []
    if v["kind"] == "describe":
        hi += [SAY[a](val) for a, val in
               sorted(v["wants"].items(), key=lambda kv: PREF.index(kv[0]))]
    hi += HI.get(v["id"], [])
    hi = [h for h in dict.fromkeys(hi) if h]
    # an edit can rewrite a line out from under its underlines 
    gone = [h for h in hi if h not in v["line"]]
    if gone:
        LOST_UNDERLINES.append((v["id"], gone))
        hi = [h for h in hi if h in v["line"]]
    if hi: v["hi"] = hi


def D(n, weekday, note, visitors):
    """A cutting handed over the counter comes with its leaf — whoever brings it
    knows what it is and says so. A cutting you dig up yourself does not, which
    is why gathering fills the shelf with unnamed pots and the drawer full of
    the loose leaves is what turns them into stock."""
    pots, pages, papers, opens = [], [], [], []
    for v in visitors:
        _underline(n, v)
        # the implication belongs on the VISITOR, because that is what the
        # runtime applies when they walk in — a day-level roll-up is only a
        # summary and nobody reads it
        if v.get("pots"):
            have = list(v.get("pages", []))
            for i in v["pots"]:
                if i not in have: have.append(i)
            v["pages"] = have
        for i in v.get("pots", []):
            assert i in BY_ID, i
            if i not in pots: pots.append(i)
        for i in v.get("pages", []):
            assert i in BY_ID, i
            if i not in pages: pages.append(i)
        for i in v.get("papers", []):
            assert i in PAPER_IDS, i
            if i not in papers: papers.append(i)
        for o in v.get("opens", []):
            if o not in opens: opens.append(o)
    return dict(day=n, weekday=weekday, note=note, visitors=visitors,
                pots=pots, pages=pages, papers=papers, opens=opens)


DAYS = [

# ========================= ACT I — AN ORDINARY SHOP =========================

D(1, "Friday", "Six plants you can name, and two hundred pots you can't.", [
  ask("v_maren1", "Maren Ash", "🧕", "sleep",
      "My little one hasn't slept in four nights. Nor has her dragon, and it sleeps on her bed, "
      "so you can imagine.",
      "She counts out the coins twice. “Four nights,” she says again, to nobody."),
  ask("v_corbin1", "Old Corbin", "👴", "eyes",
      "Not for me. For Bess. She's thirty-one, which is old for a hearth-dragon, and her "
      "eyes run all winter.",
      "“A cold wet cloth on a dragon. You'd think it would take your hand off. She loves it.”",
      who="dragon"),
  show("v_pell1", "Goodwife Pell", "👵", "n052",
       "For my nerves, and nothing strong — I've a grandson to mind and a dragon that bites.",
       "“That's it. Sweet-smelling. Alice used to wrap it in the blue paper.”"),
  ask("v_wren1", "Doctor Wren", "🧑‍⚕️", "fever",
      "The miller's burning up. I need the thing that breaks a fever, not the thing that "
      "dulls him.",
      "“Good. Quick, too. I was told you wouldn't be.”"),
  ask("v_cook1", "Arthur Cook", "🧑‍🍳", "stomach",
      "Something for a sour stomach — mine. I cooked for a wedding on Tuesday and I would rather not talk about it.",
      "“Safe enough for anyone, your grandmother used to say. She was being kind about "
      "my cooking and we both knew it.”"),
  show("v_marget1", "Marget Coyle", "🧣", "n287",
       "My neighbour's dragon had my hand last Tuesday and it has gone a colour I don't like.",
       "“Thank you. — And I'm sorry about Alice. She'd not have agreed with a word I say, "
       "but she'd have sold me this.”"),
  chat("v_ivo1", "Ivo Skelt", "🧑‍🌾",
       "Forty-one of them and I know every one by the sound it makes coming down the yard. "
       "You'll be seeing a lot of me.",
       "“Alice kept a jar back for me every week and never once told me what was in it. "
       "You'll work it out.”"),
]),

D(2, "Saturday", "Nan has a map of the valley, and nine of the fourteen places are crossed out.", [
  gift("v_nan2", "Nan Trethow", "🧶",
       "I found these in the back room when I helped clear it. Loose leaves out of that book "
       "of hers, and they're all the fen.",
       "“Hester wrote it and never bound it. Sixty years of pages in the wrong order.” "
       "She turns three of them face up on the counter and points at three pots on your "
       "shelf that have no labels. “Those. That's what a page is for.”",
       pages=leaves("fen") + ids("Kittleberry", "Pinkhaven", "Moonlace")),
  show("v_tobias2", "Tobias Reed", "🧔", "n019",
       "I cross the moor tonight and I'd rather see the path. My dragon won't fly after dark, "
       "which makes one of us sensible.",
       "“Never travel without it. Alice told me that and she was right.”"),
  ask("v_elsie2", "Elsie Fern", "👧", "comfort",
      "Not a cure. Something kind. My friend's dragon died and she's eleven and nobody's told "
      "her that's allowed to be a big thing.",
      "“That is exactly the difference and most grown-ups don't know it.”",
      pots=ids("Weeping Belle", "Palliance")),
  ask("v_ivo2", "Ivo Skelt", "🧑‍🌾", "wound",
      "Two of my lads went at each other over a hen — my sons, not my dragons. "
      "One's fine and one is not.",
      "“Closes clean and quick. Right. I'll have four.”"),
  fork("v_reeve2", "Halloran the Reeve", "🎖",
       "My neighbour's dragon keeps knocking my wall down and my neighbour keeps "
       "laughing about it. It is the man I want something for. Something he will "
       "not forget in a hurry.",
       ("n163", "reeve_kind",
        "You hand him the berries. He looks at them, then at you. “Sweets,” he says. "
        "“You've made a fool of me kindly.”"),
       ("n293", "reeve_cruel",
        "He pockets it without looking. “Blisters. That'll do.”"),
       pots=ids("Meakdew")),
  ask("v_pell2", "Goodwife Pell", "👵", "cough",
      "And one more thing — the damp in my back room. The whole wall's gone black.",
      "“Set it in the room and leave it. Simple as that.”"),
  lead("v_nan2b", "Nan Trethow", "🧶",
       "And you'll want to walk it, not just read it. Blackfen first, at dawn, while the mist "
       "is still on the water.",
       "“Five things worth the walk and one of them grows nowhere else in the vale.”",
       opens=["fen"]),
]),

D(3, "Sunday", "A box of old paper, and nobody left to ask about any of it.", [
  gift("v_drawer3", "Alice's drawer", "🗄",
       "String, sealing wax, a dead wasp, and about forty years of paper that Alice could not "
       "bring herself to throw away.",
       "You put the drawer where you can reach it. There are two things in it you want to read "
       "properly, and one you would rather not have found.",
       papers=["p_inventory", "p_hester1", "p_wanted"]),
  gift("v_grayce3", "Grayce Enwright", "👩‍🦰",
       "These were in with my mother's things and they're not hers. All the meadow, by the "
       "look of them, and half of them have your family's name on the back.",
       "“She'd have wanted them back where they came from.”",
       pages=leaves("meadow"),
       pots=ids("Trimblehuff", "Feverkiss", "Lanternhead", "Farmer's Worry",
                "Frostcup", "Forest Camphry")),
  ask("v_wren3", "Doctor Wren", "🧑‍⚕️", "burn",
      "He took hold of a pot straight off the fire, and he is nine, and very brave about "
      "it in the wrong way.",
      "“At once, it says. It was at once. He's furious about being cured.” He leaves a cutting "
      "on the counter as he goes. “Alice always had one and you haven't.”",
      pots=ids("Spring Waxcap")),
  show("v_vaile3", "Sister Vaile", "👩", "n642",
       "The plain one. The first thing anyone learns, and I've been coming here forty "
       "years and I still can't pick it out of the row.",
       "“Reliable and easy to find. There's no shame in the easy one, is what Hester "
       "wrote next to it.”"),
  recipe("v_wren3b", "Doctor Wren", "🧑‍⚕️", ["ache", "wound", "burn"],
         "And a paste for his father, in three parts. Something for the ache, something "
         "to close it, and something for the hand he did it with.",
         "“That is the right paste, in the right order. Alice taught me that and I've never found better.”"),
  ask("v_amos3", "Amos Pike", "⛏", "quicken",
      "Night shift at the cut. Something harmless — I've tried the strong stuff and I don't "
      "like who I am on it.",
      "“An hour or two of bright and nothing after. Perfect.”"),
  lead("v_marget3", "Marget Coyle", "🧣",
       "You'll have seen the notice — collared, numbered and kept, and nobody's "
       "dragon gets hurt. And since you're new: west till you hit the sea, then north along the "
       "flats. Alice went out there every spring and never once said what for.",
       "“Eleven years ago this village found out what a loose one does, and it has"
       "spent eleven years deciding to forget it. — Mind the tide out there. It comes in faster "
       "than a man walks.”",
       opens=["coast"]),
]),

D(4, "Monday", "Something went over the moor at dusk the size of a barn.", [
  ask("v_corbin4", "Old Corbin", "👴", "ache",
      "My hands. It's the cold does it. Nothing clever.",
      "“The first thing anybody learns, that. So I'm told. By everyone.”",
      pots=ids("Larkspire")),
  ask("v_ivo4", "Ivo Skelt", "🧑‍🌾", "burn",
      "Cart-dragon sneezed in the forge and took the smith's eyebrows off. It's the smith "
      "I'm here for. The dragon is very pleased with itself.",
      "“Pressed to a burn. And the smith?” “The smith is being very brave about it.”"),
  show("v_elsie4", "Elsie Fern", "👧", "n163",
       "Not a present this time. For me, and I've been up since five with a dragon that has "
       "learned to open the pantry.",
       "“Two hours of feeling clever. That's all I want.”"),
  ask("v_thea4", "Thea Dunn", "🧑‍🌾", "luckherd",
      "Something for over the byre door. The cow's off her milk, the dragons won't go in, "
      "and I'm not taking chances with the way this week is going.",
      "“It can't hurt and it might help, and that's most of medicine.”",
      who="dragon", pots=ids("Sheepsnap")),
  gift("v_gilbert4", "Gilbert Ash", "👴",
       "Ninety-one and I still walk down for it. Hester started me on it in nineteen and four. "
       "Here — these came with the last lot and I can't read them any more.",
       "“All the river, those. She had lovely handwriting when she was young and it went to "
       "the devil after.”",
       pages=leaves("river") + leaves("moor"), pots=ids("Lemon Dandy", "Bluecoin", "Skyreed")),
  ask("v_grayce4", "Grayce Enwright", "👩‍🦰", "heart",
      "For my father's dragon. She's older than I am and she has started stopping halfway "
      "up the yard.",
      "“He won't say it out loud, but he'd rather she went before he did.”",
      who="dragon"),
  chat("v_shepherd4", "The shepherd from the top farm", "🧑‍🌾",
       "I know what I saw and I know what you're all going to say about it. It was the size "
       "of a barn and it did not flap. It just went.",
       "Everybody laughed. He is not a man who makes things up, and everybody laughed anyway."),
]),

# ============================ ACT II — THE SHADOW ============================

D(5, "Tuesday", "A sheep on the hill, burnt and not eaten.", [
  lead("v_reeve5", "Halloran the Reeve", "🎖",
       "For the dog — it won't go in the top field and it won't say why. And if you're "
       "after the sheltered ground for your gathering, it's south past the last field "
       "until the walls close in on you.",
       "“Settles them without dulling them, that's what I want. — Mind the dogs at that "
       "wall. They know you're not from here.”",
       opens=["valley"]),
  gift("v_vaile5", "Sister Vaile", "👩",
       "The Sisters have had these a long time and they were never ours. All the wood, and "
       "one that isn't.",
       "“There is a reason we are giving them back this week and I am not going to give you "
       "the reason.”",
       pots=ids("Norwood", "Candlewood", "Ghostcap", "Swiftsnare", "Duskmoth"),
       pages=leaves("wood") + ids("Witchphygg", "Gravewreath")),
  ask("v_marget5", "Marget Coyle", "🧣", "dread",
      "I want to be plain. Something that would turn a large animal away from a field "
      "without touching it. I am not asking you to hurt anything.",
      "“A dread they cannot name. Yes. That's the one I'd heard of.”",
      pots=ids("Harrowbell")),
  show("v_anne5", "Anne Wood", "👩‍🦳", "n495",
       "There's a thing growing on my gate that has hold of the latch. Really hold"
       "of it. Mind how you carry it.",
       "“Not loose in a basket. Never loose in a basket.”"),
  ask("v_wren5", "Doctor Wren", "🧑‍⚕️", "ache",
      "The smith's foot. It's two weeks of this at least and he can't be asleep for two weeks.",
      "“The plain one. The first thing anybody learns, and the thing I ask for most.”"),
  ask("v_amos5", "Amos Pike", "⛏", "nightlong",
      "Double shift. Don't tell the Doctor.",
      "“I won't tell the Doctor.”"),
  ask("v_pell5", "Goodwife Pell", "👵", "cough",
      "My dragon has a chest on her. She's been coughing since Tuesday and it's the kind "
      "you can hear through a wall.",
      "“A steam under the perch, not a tea. Right. I'd have given her mine and killed her.”",
      who="dragon", pots=ids("Phennet")),
  lead("v_nan5", "Nan Trethow", "🧶",
       "The high tops, west of the sharp peak — go up until the grass gives out. And take "
       "something warm, I'm not joking about that.",
       "“Six things up there and four of them are worth the walk.”",
       opens=["crag"], pages=leaves("crag"), pots=ids("Brimlock", "Wintervane", "Fellgorse")),
]),

D(6, "Wednesday", "The moor burned all afternoon. You could see it from the square.", [
  recipe("v_wren6", "Doctor Wren", "🧑‍⚕️", ["burn", "ache", "nerves"],
         "Three, and quickly. Two men off the moor. The burn first, then the pain, then "
         "something so they'll lie still while I work.",
         "“Nobody died. I want to say that before you hear anything else today.”"),
  ask("v_thea6", "Thea Dunn", "🧑‍🌾", "wardcold",
      "We were out on the moor till two in the morning with buckets and my husband can't "
      "get warm.",
      "“Lining a coat with it. I'll line the whole bed with it.”"),
  gift("v_shepherd6", "The shepherd from the top farm", "🧑‍🌾",
       "Nobody's laughing today. I went up to look at where it came down and I brought "
       "this back — it was in my father's cottage, up on the moor, and the cottage is gone.",
       "Hester's journal, the summer the moor burned before. Ash to the ankle, she says, "
       "and green already showing through it.",
       papers=["p_hester2"], pages=leaves("scar"), opens=["scar"]),
  ask("v_ivo6", "Ivo Skelt", "🧑‍🌾", "comfort",
      "Every dragon in my yard is on the roof and won't come down. They know something and "
      "they can't tell me what.",
      "“Kindness rather than a cure. Aye. That's what's wanted.”",
      who="dragon"),
  show("v_pell6", "Goodwife Pell", "👵", "n446",
       "The one where the petals help and the root does the opposite. I want to be very sure "
       "which half you've sold me.",
       "“The petals. Say it again so I've heard you say it.”",
       pots=ids("Gandyroot")),
  ask("v_amos6", "Amos Pike", "⛏", "eyes",
      "Ash in every dragon's eyes down the cut and they'll not go under with them shut. "
      "I'll take whatever's cheap and take a lot of it.",
      "“Dull, cheap and asked for constantly. Your grandmother wrote that in the margin.”",
      who="dragon"),
  show("v_wren6b", "Doctor Wren", "🧑‍⚕️", "n088",
       "And one for the jar with the red label. Three men off the moor have grabbed a "
       "handful of it in the dark this week and I would like to stop that.",
       "“Itches for days, nothing worse and nothing kind. Exactly. A red label.”"),
  chat("v_warden6", "The Warden", "🕵",
       "Forty acres. No lightning, no beacon, and nobody up there to be careless. "
       "I am asking everyone the same question and you may as well have it first.",
       "“Have you seen anything unusual.” He writes down that you have not."),
]),

D(7, "Thursday", "There is a new rule about dragons on every wall in the village.", [
  gift("v_bram7", "A carrier from the coast", "📯",
       "Package for the plant shop, six weeks late, and it's paid for. Ordered months ago "
       "and she's not here to sign, so you'll do.",
       "Inside: a dozen of Hester's leaves for the shore, and three cuttings still in damp "
       "moss, which is either a miracle or the moss.",
       pages=leaves("coast"), pots=ids("Grey Sandfire")),
  ask("v_corbin7", "Old Corbin", "👴", "hearing",
      "I've started saying pardon. My father said pardon for eleven years and I'll not do it.",
      "“A drop in the ear. Grows thick in the churchyard, she says. Somebody's picked it, then.”",
      pots=ids("Saint Quill")),
  fork("v_faye7", "Faye Swift", "👩‍🌾",
       "I've been seeing things at the edge of the field at night and I've stopped telling "
       "people. You can quiet that, or you can sharpen it. Your choice, not mine.",
       ("n052", "faye_calm",
        "“Quiet, then.” She sounds relieved and a little disappointed."),
       ("n115", "faye_sharp",
        "“Sharpen it.” She takes it like something she has been waiting for."),
       pots=ids("Thorncrown")),
  ask("v_marget7", "Marget Coyle", "🧣", "wardpath",
      "Scattered on a path, so it keeps off what oughtn't be on it. For the school lane, "
      "and I will not be argued with about the school lane.",
      "“They burst and they sting and they hurt nothing that has any sense. Good.”",
      pots=ids("Larkshine")),
  show("v_tobias7", "Tobias Reed", "🧔", "n210",
       "Not the white one. The blue. I'm flying at night now because I'm not flying in the day.",
       "“Rubbed on the eyelids. I know how it sounds.”",
       pots=ids("Tarnlace")),
  show("v_cook7", "Arthur Cook", "🧑‍🍳", "n094",
       "Thirty years married on Sunday. It can't make one where there isn't one — I know, "
       "I asked, and I got told off for asking.",
       "“There is one,” he says. “I'd just like it warmed up a bit.”"),
  ask("v_ruth7", "Ruth Alderly", "🧵", "dye",
      "Purple, and it must not wash out. Forty yards of wool and two weeks, and half the village suddenly wants"
      "black.",
      "“Deep purple and it stays. Little else it's good for, Alice used to say. "
      "Little else I want.”"),
  chat("v_ivo7", "Ivo Skelt", "🧑‍🌾",
       "Collared, numbered and kept. Do you know what a collar does to a dragon that flies? "
       "Marget knows. That's the part I can't get past.",
       "“She's not a fool and she's not cruel and she is going to get one of mine killed.”"),
]),

D(8, "Friday", "Forty feet of black water, gone in one night.", [
  gift("v_nan8", "Nan Trethow", "🧶",
       "I was out on that mud at six this morning before anybody else thought of it. "
       "Sixty years I've wanted to know what was under there.",
       "Two cuttings, and a journal leaf about the tarn that Hester wrote knowing she'd "
       "never see the bottom of it.",
       papers=["p_hester3"], pages=leaves("tarn") + leaves("bed"),
       pots=ids("Deepwhistle", "Longmeg"), opens=["bed", "tarn"]),
  ask("v_wren8", "Doctor Wren", "🧑‍⚕️", "stomach",
      "Half the village has been paddling in a lake bed full of things that have "
      "been under water for a thousand years, and about a third of them drank it. "
      "Guess what I have got.",
      "“Safe enough for anybody. Twelve of them, please, and I'll be back tomorrow.”"),
  ask("v_faye8", "Faye Swift", "👩‍🌾", "starlight",
      "I want to see it. Everyone else wants it gone and I want to see it, and I'd rather "
      "you didn't repeat that.",
      "“By starlight. Right.” She pays and does not explain further."),
  show("v_masked8", "The Masked Woman", "🎭", "n176",
       "For the door. And do not ask what for.",
       "She pays in coin that is older than you are, and looks at the cellar door on her "
       "way out, which is not on the way out."),
  recipe("v_ivo8", "Ivo Skelt", "🧑‍🌾", ["comfort", "rousing", "gut"],
         "Three for the yard, and all of them for dragons. One to settle them, one for the "
         "two that have stopped, and one for the big one that has eaten a boot.",
         "“Forty-one dragons and not one of them has been right since Wednesday.”",
         who="dragon"),
  ask("v_thea8", "Thea Dunn", "🧑‍🌾", "broody",
      "My best layer is sitting on a patch of gravel and will not be moved, and she has "
      "been there since Sunday.",
      "“Sitting on nothing. It happens to them after a fright, and there has been a fright.”",
      who="dragon"),
  ask("v_reeve8", "Halloran the Reeve", "🎖", "poisontest",
      "The Bell wants the water tested before the stock drink out of the beck. "
      "I said I'd ask you and I have asked you.",
      "“Laid across a cup, and it says so without a word being said. That'll do them.”"),
  chat("v_warden8", "The Warden", "🕵",
       "A lake. I have written down that a lake is missing and I have had to read it back "
       "to myself twice.",
       "“Nobody in this valley is telling me everything. I don't think anybody's lying, "
       "either. That's the part I dislike.”"),
]),

D(9, "Saturday", "A man from the town is asking everybody the same question.", [
  recipe("v_wren9", "Doctor Wren", "🧑‍⚕️", ["ache", "wound", "numb"],
         "The rider. The pain, the arm itself, and something to stop him feeling what I'm "
         "about to do to it.",
         "“He'll keep it. Ask me again in a week and I'll say the same with more confidence.”"),
  gift("v_tobias9", "Tobias Reed", "🧔",
       "Drew it with my off hand. You take it. I've had four people tell me today what I "
       "saw and none of them were there.",
       "It went over him at the height of a chimney. Not red. Clear, like a window with "
       "weather behind it.",
       papers=["p_sketch1"]),
  gift("v_vaile9", "Sister Vaile", "👩",
       "The churchyard leaves. All of them. And I would like you to note the day you were "
       "given them.",
       "“Just south of the town, past the yews. You've walked past it a hundred times.”",
       pages=leaves("yard"), opens=["yard"], pots=ids("Mary's Breath")),
  ask("v_thea9", "Thea Dunn", "🧑‍🌾", "spirits",
      "Burned on the doorstep. I know what you think of that and I don't care what you "
      "think of that.",
      "She joins the Bell that afternoon. You hear about it before she's out of the square."),
  show("v_althea9", "Althea O'Shea", "🧝", "n635",
       "I know exactly what it does and I'd like it anyway.",
       "“Small amounts,” she says. “I can read.”"),
  show("v_lorena9", "Lorena Chapman", "👰", "n621",
       "Two weeks tomorrow, and I am ordering it now so that I stop thinking about it. "
       "Wrap it twice and don't make me say any more than that.",
       "You wrap it twice. She is glad of the second layer.",
       pots=ids("Fool's Midnight")),
  ask("v_maren9", "Maren Ash", "🧕", "sleep",
      "The same again. And she asked me last night whether the big one eats children, "
      "and I said no, and I don't know that.",
      "“Thank you. And she doesn't. Nothing has been eaten.”"),
  lead("v_amos9b", "Amos Pike", "⛏",
       "The sharp peak in the north, east of the white crags. Half the cut's been up there "
       "this week looking for her and coming back with nothing but wet feet.",
       "“It's a long climb over loose stones and you'll want something to keep you going. I'd not try it after a day's work, and I've said so to four men who did.” He turns out "
       "his pockets: a fold of leaves, all of them the pike.",
       opens=["pike"], pages=leaves("pike")),
]),

# ========================== ACT III — WHAT SHE IS ==========================

D(10, "Sunday", "Ivo has written down everything he knows about glass dragons.", [
  gift("v_bram10", "Bramwell Hale", "🎩",
       "Madam. I have come four days on the strength of one drawing. Now I am going to"
       "say a thing, and you are going to think less of me for it. Crystal dragon.",
       "He has brought pictures from his museum — a dozen leaves drawn better than"
       "Hester's and half as useful — and a letter with two facts in it.",
       papers=["p_bramwell"], pages=leaves("valley"), pots=ids("Royal Gentia", "Hopheart")),
  ask("v_wren10", "Doctor Wren", "🧑‍⚕️", "antidote",
      "A dog has been given something. I need the thing that pulls poison back out and "
      "I need it in the next ten minutes.",
      "He runs. He does not close the door."),
  show("v_warden10", "The Warden", "🕵", "n670",
       "And this is what was in it. I want to see it in a pot with a label on, in your shop, "
       "where I can find it again.",
       "“Beautiful, isn't it,” he says, and his face does not move at all."),
  fork("v_constance10", "Constance Rye", "👩‍🦱",
       "An offering is to be laid at the old stone tonight and the Sisters are split on how. "
       "The open way, or the shut way.",
       ("n565", "offering_open",
        "“The open way.” She looks almost frightened and almost pleased. “Something will answer.”"),
       ("n244", "offering_shut",
        "“The shut way, then.” She takes it in a cloth and does not touch it with her hands."),
       pots=ids("Cauldwick")),
  ask("v_marget10", "Marget Coyle", "🧣", "revealburied",
      "Held over turned earth, it shows what's under it. I want to know what she's been "
      "looking for and I'd rather know before Saturday.",
      "“So would I,” she says. “That's the first thing you and I have agreed on.”",
      pots=ids("Goldenlight")),
  lead("v_constance10b", "Constance Rye", "👩‍🦱",
       "Due east of the town, below the barrow mounds, where the ground opens. That is the "
       "way she went and that is where nobody has looked.",
       "“Three steps in and the dark is total, and a lamp will not stay lit in that air. "
       "Do not ask me how I know that.”",
       opens=["cave"]),
  show("v_vaile10", "Sister Vaile", "👩", "n691",
       "Off the churchyard wall, and burned — not put on the heap, burned, tonight, and I "
       "will come and watch you do it.",
       "“The smell is the least of it,” she says, and does not explain."),
  chat("v_ivo10", "Ivo Skelt", "🧑‍🌾",
       "One egg. Once, in a whole life. He said it like it was a fact out of a book and "
       "then he said the other half and the shop went quiet.",
       "“If it's lost they don't stop looking. Not for years. Not, he said, for forty.”"),
]),

D(11, "Monday", "Three of the old mounds on the hill are open, and nothing has been taken.", [
  gift("v_nan11", "Nan Trethow", "🧶",
       "Went up at first light because somebody had to. She's opened them and left them "
       "open and taken nothing out.",
       "“She's not robbing them. She's looking under them.” — and the barrow leaves, which "
       "Hester copied from somebody who was not supposed to have them.",
       papers=["p_barrowmap"], pages=leaves("barrow"), opens=["barrow"],
       pots=ids("Jacob's Worth")),
  ask("v_constance11", "Constance Rye", "👩‍🦱", "trace",
      "One of ours hasn't come back from the fell and I have her glove.",
      "“If you have something of theirs,” she reads. “I have her glove.”"),
  gift("v_masked11", "The Masked Woman", "🎭",
       "This was in the wall of the back room and I did not put it there. Neither did you.",
       "A letter your grandmother wrote to a woman who had been dead thirty years, "
       "and never sent.",
       papers=["p_alice1", "p_bill"]),
  ask("v_lorena11", "Lorena Chapman", "👰", "wedding",
      "Ten days on Saturday, and I would like one thing in these two weeks to be"
      "a nice thing. One thing.",
      "“It makes a promise stronger. That's all I'm asking of it.”"),
  ask("v_amos11", "Amos Pike", "⛏", "revealie",
      "Held to a lock, they say. The company's locked the tool store and told us there's "
      "nothing in it.",
      "“There is something in it,” he says on the way out."),
  show("v_grayce11", "Grayce Enwright", "👩‍🦰", "n376",
       "I can't hold a thought for five minutes and the thorns don't scare me.",
       "“The thorns are the price. Understood.”",
       pages=leaves("garden"), pots=ids("Maiden's Sorrow", "Worryless", "Ambrella")),
  lead("v_bram11b", "Bramwell Hale", "🎩",
       "South-east, one field over from the church. A walled garden somebody tended once and "
       "stopped, and it is in your grandmother's ledger nine separate times.",
       "“There is a vine over the gate that will not cut and it has hold of the latch. "
       "You will want something for that before you set out.”",
       opens=["garden"], pots=ids("Henchuck")),
  chat("v_warden11", "The Warden", "🕵",
       "Nothing today.",
       "He stands in the shop for eleven minutes, buys nothing, and reads every label on "
       "the top shelf, including the ones at the back."),
]),

D(12, "Tuesday", "The garden wall came down when she went over it.", [
  ask("v_wren12", "Doctor Wren", "🧑‍⚕️", "uncurse",
      "The Sister they lost came back this morning and she is not right, and I have "
      "exhausted what I know, so I am asking you for the other thing.",
      "“If the curse is young,” he reads, and looks at you. “It's eleven days old. "
      "Is that young?”",
      pots=ids("Verecund")),
  fork("v_reeve12", "Halloran the Reeve", "🎖",
       "The business with my wall again, and I've had two weeks to think about it. "
       "Help me forget it, or help me be sure he never does.",
       ("n551", "reeve_amnesia",
        "He drinks it at the counter. When he leaves he nods at you politely, like a stranger."),
       ("n460", "reeve_letgo",
        "“Aye,” he says, after a while. “Aye, all right.”")),
  ask("v_anne12", "Anne Wood", "👩‍🦳", "unbind",
      "The wall's down and there's a vine across the gate that I cannot cut and I would "
      "very much like to see my own garden.",
      "“Pressed juice. Straight through it. Remarkable.”"),
  ask("v_bram12", "Bramwell Hale", "🎩", "attention",
      "I am close to something and I keep losing the thread of it. One afternoon of "
      "holding a single thought is all I want.",
      "“Too much of it unseats the mind,” he reads. “One afternoon. I am not a fool.”"),
  ask("v_faye12", "Faye Swift", "👩‍🌾", "memory",
      "There's a night I can't account for and I think I saw her close to, and I would "
      "like it back.",
      "“It can be got back,” she repeats. “You said that like it was a small thing.”"),
  chat("v_marget12", "Marget Coyle", "🧣",
       "No. I'll say it plainly, since you're going to make me ask twice. Something "
       "that would unseat a mind that size.",
       "You have not got it and you would not sell it. She takes the no without a word, which frightens you more than the asking"
       "did."),
  show("v_warden12b", "The Warden", "🕵", "n262",
       "The one from the black water. Not the beautiful one — I have that one. This is "
       "the other, and I want them side by side on my desk.",
       "“The almond is the warning,” he says. “There is no warning at all in the other.”"),
  chat("v_warden12", "The Warden", "🕵",
       "I'll ask you the direct question, then. Is there anything in this building that "
       "I ought to know about.",
       "Whatever you said, he wrote it down."),
]),

D(13, "Wednesday", "The village met in the church, and it was not close.", [
  gift("v_bell13", "A boy with a notice", "🧒",
       "Marget says put one in every shop. She says especially yours.",
       "The muster is Saturday at first light, from the church, and the apothecary at the "
       "plant shop will make up what they need.",
       papers=["p_muster"]),
  recipe("v_marget13", "Marget Coyle", "🧣", ["courage", "wardcold", "nightlong"],
         "Forty men on the crags before dawn on Saturday. Something to get them up there, "
         "something to keep the cold out, and something so the watch stays awake.",
         "“Thank you. I know what this costs you. I've watched your face for two weeks.”",
        ),
  ask("v_ivo13b", "Ivo Skelt", "🧑‍🌾", "flame",
      "Two of mine have gone out. Just — out, like a lamp, and they're sitting in the "
      "straw being ashamed of themselves.",
      "“Burned underneath them. Aye. Every keeper carries one and none of us will say so.”",
      who="dragon", pots=ids("Sunset Mountcap")),
  ask("v_ivo13", "Ivo Skelt", "🧑‍🌾", "unnoticed",
      "I'm going up before they do. I'm not going to do anything. I just want to stand "
      "where I can see her once before forty men with bows do.",
      "“Not invisible,” he reads. “Unnoticed. That'll do. That's usually enough.”", pages=leaves("cave")),
  ask("v_vaile13", "Sister Vaile", "👩", "offering",
      "Laid at the stone, tonight, and we will be doing it whether the village likes it "
      "or not.",
      "“What answers is another matter,” she says. “That's what Hester wrote and she was "
      "not being poetic.”"),
  show("v_corbin13", "Old Corbin", "👴", "n130",
       "Everybody in Morrowfen carries one and I've lost mine, and this is not the week "
       "to be without it.",
       "“A sprig in the pocket. That's all it is. That's all it's ever been.”"),
  ask("v_wren13", "Doctor Wren", "🧑‍⚕️", "graverest",
      "Not for anyone here. The Sister who came back. She went again this morning and "
      "this time it was quiet.",
      "He is not a man who cries in shops and he does not, quite."),
  chat("v_masked13", "The Masked Woman", "🎭",
       "Your grandmother hid it three times. Nineteen and four, nineteen thirty-one, "
       "and the year you were born.",
       "“I am not going to tell you how I know. I am going to tell you that she was "
       "wrong all three times and she knew it.”"),
]),

# ========================== ACT IV — THE CHOICE ==========================

D(14, "Thursday", "She is on the crags and she has stopped moving.", [
  gift("v_nan14", "Nan Trethow", "🧶",
       "Red Pike, before the muster gets there. All of it — the pike leaves and the ones "
       "for the top, and I'll not be going up again.",
       "“Two weeks of turning this valley over and she's run out of valley. That's all "
       "that's happened.”",
       pages=leaves("pike")),
  recipe("v_vaile14", "Sister Vaile", "👩", ["graverest", "spirits", "lightwalk"],
         "Three for the rite, and it is not a funeral, whatever the village thinks. "
         "One for the ground, one for the doorstep, and a light to do it by.",
         "“Hester wrote this out for my mother. She did not say what it was for either.”",
         pots=ids("Glowhorn")),
  ask("v_marget14", "Marget Coyle", "🧣", "poisonmind",
      "You know what I am asking for. Forty men and bows will not do it and we both "
      "know that as well.",
      "You say no. She says: “Then I'll ask in Kendal, and it will take two days, "
      "and Saturday will happen anyway.”",
      pots=ids("Storian"), pages=leaves("gorge")),
  ask("v_ivo14", "Ivo Skelt", "🧑‍🌾", "resolve",
      "I've already decided. I'd just like to be steadier about it than I am.",
      "“Strengthens someone who's already decided. Aye. That's me.”"),
  show("v_constance14", "Constance Rye", "👩‍🦱", "n684",
       "Growing through the wall of the old garden, and it glows, and I know how that "
       "sounds. The Sisters want it and I am asking you first.",
       "You wrap it and you do not sell it. Alice underlined it twice."),
  ask("v_wren14", "Doctor Wren", "🧑‍⚕️", "claw",
      "My own teeth. It has been that sort of a week and I have been grinding them to nothing.",
      "The dullest thing you have sold all week and he takes longer over it than any of them."),
  show("v_warden14b", "The Warden", "🕵", "n320",
       "Before I ask you the real thing. The beautiful one that turns wanting a thing into something worse. I have"
       "asked for it in every shop in the valley.",
       "“So you have one,” he says. “Everybody has one. Nobody will say so.”",
       pots=ids("Bellanox")),
  fork("v_warden14", "The Warden", "🕵",
       "Saturday. I can stand the muster down for one day, or I can go with them and "
       "keep it orderly. Sell me the thing that fits whichever you think I should do.",
       ("n523", "warden_delay",
        "“Courage it is. I'll stand them down till Sunday and take what comes for it.”"),
       ("n255", "warden_ride",
        "“Then I'll go with them and see it's done properly, which is not the same as "
        "seeing it's done kindly.”")),
]),

D(15, "Friday", "Half of Red Pike came off the hill in the night.", [
  gift("v_nan15", "Nan Trethow", "🧶",
       "There's a way down into it from the north side and I've been as far as the second "
       "ledge. Things growing on that ledge that have been in the dark since the world "
       "was made.",
       "“I'm too old to climb it. You are not.”",
       papers=["p_gorge"], opens=["gorge"],),
  gift("v_till15", "Under the till", "🕯",
       "Folded in four, under the drawer of the till, where she knew you would find it in the first two weeks or never.",
       "The last thing Alice wrote. It is addressed to whoever has the shop.",
       papers=["p_alice2", "p_hester4"]),
  recipe("v_wren15", "Doctor Wren", "🧑‍⚕️", ["wound", "burn", "numb"],
         "For tomorrow, whatever tomorrow is. I would like a box of the three things I "
         "am going to need most and I would like not to talk about why.",
         "“Same order Alice taught me. Thank you. For all of it.”"),
  ask("v_amos15", "Amos Pike", "⛏", "lightbright",
      "Every man on that muster wants a light and the company won't open the store.",
      "“Bright enough to hurt. Good. That's the sort of night it's going to be.”"),
  ask("v_maren15", "Maren Ash", "🧕", "nerves",
      "She's asked me whether we're going to kill it. She's six. I didn't have an answer "
      "and I'd like something so I can sit with her while I don't have one.",
      "“Settles them without dulling them. Yes. That's what I want.”"),
  show("v_masked15", "The Masked Woman", "🎭", "n607",
       "The one there's no coming back from. I don't want to buy it. I want to know "
       "you have it and where you keep it.",
       "“Because somebody is going to ask you for it tomorrow,” she says, “and it "
       "will not be Marget.”",
       pots=ids("Copper Caledonian")),
  show("v_ivo15", "Ivo Skelt", "🧑‍🌾", "n677",
       "You know the one. It grew back thicker where it killed the Hallam boy's dog and "
       "it has been thicker every spring since.",
       "“Where it kills, it comes back. That is the whole trouble with it.”",
       pots=ids("Devil's Nightcap")),
  ask("v_constance15", "Constance Rye", "👩‍🦱", "waking",
      "You know what it does. You have known since Tuesday what it does. "
      "The Sisters are asking.",
      "“Wakes a thing that is sleeping,” she reads, and looks at the floor, "
      "and then at the cellar door.", who="dragon"),
]),

D(16, "Saturday", "First light, from the church. And you have not gone.", [
  ask("v_wren16", "Doctor Wren", "🧑‍⚕️", "ache",
      "Forty men walked up a mountain in the dark and about thirty have come back down "
      "it. Nothing dramatic. Everything aches.",
      "“Plain ache. It is going to be a very long day of plain things.”"),
  ask("v_ivo16", "Ivo Skelt", "🧑‍🌾", "rash",
      "I got as close as the second cairn and there is a plant up there that does not "
      "like being trodden on, and my arm has come up in it.",
      "“At once, it says. It was at once.” He is grinning like a boy. “I saw her.”"),
  ask("v_marget16", "Marget Coyle", "🧣", "courage",
      "One more, and it is for me, and I would rather you did not say anything kind.",
      "“Wears off by morning,” she reads. “By morning it will be done either way.”"),
  recipe("v_bram16", "Bramwell Hale", "🎩", ["revealburied", "trace", "starlight"],
         "Three. Where it is, whose it is, and enough light to see it by. I will pay "
         "whatever you ask and I would like you to think about what I am asking for.",
         "“I am not a bad man,” he says. “I am a man who wants a thing very much, "
         "which is worse and more common.”"),
  ask("v_vaile16", "Sister Vaile", "👩", "lightbright",
      "One in every window in the valley tonight. All of us. It is the oldest thing "
      "we do and we have not done it in three generations.",
      "“You will see them from the crags,” she says. “If you are on the crags.”"),
  ask("v_marget16b", "Marget Coyle", "🧣", "unseat",
      "The last thing I will ever ask you for, and you already know what it is. "
      "Something that would unseat a mind that size.",
      "You do not give it to her. She takes the no without a word, "
      "which frightens you more than the asking did."),
  chat("v_warden16", "The Warden", "🕵",
       "I am going to stand in your shop and look out of your window for a while, "
       "and then I am going to go up.",
       "“Whatever is in your cellar,” he says, to the window, “today is the day it "
       "stops being in your cellar.”"),
  fork("v_ending16", "The last hour", "🐉",
       "She is on the top and she has not moved since Thursday. It is in the log basket "
       "and it is awake. Everybody who wanted it is in the square. You can carry it up "
       "the hill, or you can put something in its place and keep it.",
       ("n684", "end_return",
        "You take the Sceptre and the basket and you walk up the hill in front of the "
        "whole village, and nobody stops you, and forty men with bows stand aside."),
       ("n530", "end_keep",
        "Unnoticed. You go out the back with it under your coat and you are three fields "
        "away before the square works out that the shop is empty.")),
]),
]

# The loose leaves come back a place at a time, and a cutting brings its own leaf
# with it, so the same page can be offered twice. Keep the first offer and drop
# the rest — including anything you already have on day one.
_seen = {p["id"] for p in PLANTS if p["start"] in ("both", "page")}
for _d in DAYS:
    _d["pages"] = [i for i in _d["pages"] if not (i in _seen or _seen.add(i))]
