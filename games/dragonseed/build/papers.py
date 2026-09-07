# -*- coding: utf-8 -*-
"""The clues drawer.

A paper is a thing you can pick up and read, not a tooltip. It lives in the
drawer under the counter, you put it on the desk the way you put a specimen
there, and it opens as an actual sheet you can drag around the screen.

What a paper can carry
  gives  : book pages. Somebody's notes, a torn leaf out of the old notebook,
           a drawing. This is one of the ways pages arrive.
  points : a habitat. The note tells you where something is; the place becomes
           a lead on the map exactly as a spoken direction does.
  flags  : story flags, for the ones that change what people say to you.

A paper is DONE when everything it carries has been taken: the pages are in
your book and the place is on your map. Done papers stay in the drawer — you
can always read them again — but they are marked, so the drawer at day fourteen
still tells you at a glance which two notes you have not finished with.

`kind` drives how the sheet is drawn: a letter is written on good paper, a
notebook leaf is foxed and close-ruled, a handbill is printed and shouty, a
sketch is mostly picture, a list is columns.

The words are plain on purpose. See STORY-SIMPLE.md.
"""

def N(pid, kind, title, byline, body, gives=(), points=(), flags=()):
    d = dict(id=pid, kind=kind, title=title, byline=byline, body=body)
    if gives:  d["gives"]  = list(gives)
    if points: d["points"] = list(points)
    if flags:  d["flags"]  = list(flags)
    return d


PAPERS = [

# ------------------------------------------------------------ day 3, the box
N("p_inventory", "ledger", "A list left in the drawer", "no name on it",
  "Ten pots down from the spring. The book has got ahead of the shelf again — there are "
  "pages in here for things that have not been in the window for years.\n\n"
  "Start with the ones you have got. Hand out what you can name. Go and dig up the rest.",
  gives=["n362"]),

N("p_hester1", "journal", "From the old notebook — the fen", "the old notebook",
  "Blackfen first, always, and go at dawn while the mist is still on the water. Five "
  "things worth the walk and one of them grows nowhere else.\n\n"
  "The blue bell and the blue cluster are not the same plant. The difference is the "
  "leaf. Pairs, and grassy. Learn that before you sell either one to a child.",
  gives=["n425"], points=["fen"]),

N("p_wanted", "handbill", "THE NEW RULE ABOUT DRAGONS", "put up in the square",
  "From next month every dragon in the village must have a collar with a number on it, "
  "and must be kept. Any dragon found loose on the hill will be taken away.\n\n"
  "This is not aimed at people who look after their dragons properly. It is a bell rung "
  "early.\n\n— M. COYLE",
  flags=["knows_rule"]),

# -------------------------------------------------------- day 6, after the fire
N("p_hester2", "journal", "From the old notebook — after a fire", "the old notebook",
  "The moor burned in the dry summer and I was sad about it, and I was wrong to be.\n\n"
  "Some things will not come up at all until the ground has been through a fire. They "
  "came up that autumn in hundreds, where nothing had grown in my whole life. Go back "
  "the year after a burn. Go back the week after if you cannot wait, which you can't.",
  gives=["n308", "n488"], points=["scar"]),

# --------------------------------------------------------- day 8, the empty lake
N("p_hester3", "journal", "From the old notebook — the lake", "the old notebook",
  "I have wanted to know what is under Cold Tarn for thirty years and I shall die not "
  "knowing. Forty feet deep and black as a boot.\n\n"
  "The fishermen say there is a shelf halfway down with weed on it that nobody has ever "
  "brought up. If that lake is ever dry I shall be out on the mud before the sun is.",
  points=["bed"]),

# ------------------------------------------------------------ day 9, the Warden
N("p_sketch1", "sketch", "What Tom saw", "Tom",
  "Drew this quick so dont laugh. It went over the top of the forge at about the height "
  "of a chimney and I had time to look at it properly.\n\n"
  "IT IS NOT RED. Thats the bit nobody believes. It was clear, like a window with "
  "weather behind it. And it was looking at the ground the whole way over. Not at me. "
  "At the ground.",
  flags=["saw_drawing"]),

# ----------------------------------------------------------- day 10, what Ivo knows
N("p_bramwell", "letter", "What Ivo wrote down for you", "Ivo",
  "You asked me so here it is, and I have spelled it as well as I can.\n\n"
  "A dragon like mine lays six eggs a year. A GLASS DRAGON lays one egg. One, in her "
  "whole life. There has not been one seen round here since my grandfather was a boy.\n\n"
  "If somebody has that egg, then somewhere there is a mother looking for it, and she "
  "will not stop looking. Not for years. Not ever, I should think.",
  gives=["n684"], flags=["knows_glass"]),

# -------------------------------------------------------------- day 11, the mounds
N("p_barrowmap", "sketch", "What she dug at the mounds", "Nan",
  "Went up at first light because somebody had to. She has opened three of the old "
  "mounds and left them open, and taken nothing out of them. I looked.\n\n"
  "She is not stealing. She is looking underneath them.",
  points=["barrow"]),

N("p_alice1", "letter", "A note pushed under the door", "T.",
  "I know there is something in your cellar.\n\n"
  "I havent told anybody and I am not going to. Not my mum, not the man with the "
  "notebook, not anybody.\n\nBut I would quite like to see it. — T",
  flags=["tom_knows"]),

N("p_bill", "ledger", "Nan's note about eggs", "Nan",
  "You asked me what an egg wants. Two things, and they are both dull.\n\n"
  "SAND. Six inches of it, raked flat, so it can push about without cracking on stone. "
  "FOUR BUCKETS a week if you want it clean.\n\n"
  "WARM. Not hot. Blood warm. If it goes cold it is not dying, it is waiting.",
  flags=["sand_noticed"]),

# ---------------------------------------------------------------- day 13, the vote
N("p_muster", "handbill", "THE HUNT", "put up in the square",
  "SATURDAY, at first light, from the church. Everyone who can walk.\n\n"
  "The plant shop will make up what we need. Bring what you have.\n\n— M. COYLE",
  flags=["hunt_called"]),

# ----------------------------------------------------------------- day 15, the gorge
N("p_gorge", "sketch", "The east face, before and after", "Nan",
  "Two drawings on one sheet. Thursday, and Friday.\n\n"
  "There is a way down from the north side and I have been as far as the second ledge. "
  "There are things growing on that ledge that have been in the dark since the world "
  "started, and I am too old to climb it. You are not.",
  points=["gorge"]),

N("p_alice2", "letter", "Nan's last note", "Nan",
  "I am not going to tell you what to do on Saturday, so don't ask me again.\n\n"
  "I will tell you one thing and then I am going to bed. An egg belongs to whoever laid "
  "it. That is true of hens and it is true of this.\n\n"
  "Whatever you decide, decide it yourself, and decide it before Saturday, because "
  "Saturday will decide it for you. — Nan",
  flags=["knows_choice"]),

N("p_hester4", "journal", "From the old notebook — the last page", "the old notebook",
  "The last page in the book, and the writing has gone shaky.\n\n"
  "This one is laid at the old stone as a present. You leave it there and you go home "
  "and you do not look back at it.\n\n"
  "What answers is another matter. I have done it once. I am leaving the page in "
  "because you might need it, and taking my advice out because you would ignore it.",
  gives=["n565"], flags=["knows_wake"]),
]
