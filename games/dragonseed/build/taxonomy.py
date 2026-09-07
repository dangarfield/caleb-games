# -*- coding: utf-8 -*-
"""Observable-attribute taxonomy for the plant shop.

Design rule (the whole point): a single attribute never resolves a specimen.
Values are chosen so every axis has heavy collisions, and identity only falls
out of a COMBINATION. Deliberate lookalike clusters are asserted by validate.py.
"""

# --- the axes the player can observe with the lens ------------------------
AXES = ["colour", "form", "petals", "leaf", "stem", "scent", "berry", "mark"]

COLOUR = ["blue","purple","red","pink","yellow","white","green","orange","brown","black"]
FORM   = ["bell","star","cup","cluster","spike","disc","trumpet","pompom","cap","frond","none"]
PETALS = [0,4,5,6,7,12,"many"]
LEAF   = ["paired","heart","spiky","oval","toothed","feathery","grassy","waxy","lobed","needle","none"]
STEM   = ["smooth","hairy","thorned","square","woody","ridged","none"]
SCENT  = ["none","sweet","musk","citrus","smoke","rot","pine","almond","earth","mint"]
BERRY  = ["none","red","black","yellow","orange"]
MARK   = ["none","glows","moves","fuzzy","reacts","sticky","frost","shimmer","weeps"]

SPECIES = ["human", "dragon", "both"]
SPECIES_SAY = { "human": "for people", "dragon": "for dragons",
                "both": "for people and dragons alike" }

KIND   = ["flower","fungus","herb"]

# --- readable phrasing, used by the lens and the book ---------------------
PHRASE = {
  "petals": {0:"no petals", "many":"too many petals to count"},
  "leaf": {
    "paired":"leaves in opposite pairs", "heart":"heart-shaped leaves",
    "spiky":"stiff spiky leaves", "oval":"plain oval leaves",
    "toothed":"jagged, toothed leaves", "feathery":"fine feathery leaves",
    "grassy":"long grassy blades", "waxy":"thick waxy leaves",
    "lobed":"broad lobed leaves", "needle":"dark needle leaves", "none":"no true leaves",
  },
  "stem": {
    "smooth":"a smooth stem", "hairy":"a hairy stem", "thorned":"a thorned stem",
    "square":"a square stem", "woody":"a woody stem", "ridged":"a ridged stem",
    "none":"no stem to speak of",
  },
  "scent": {
    "none":"no scent", "sweet":"a sweet scent", "musk":"a heavy musky scent",
    "citrus":"a sharp citrus scent", "smoke":"a smell of woodsmoke",
    "rot":"a smell of rot", "pine":"a smell of pine", "almond":"a smell of almonds",
    "earth":"a smell of wet earth", "mint":"a cold minty scent",
  },
  "berry": {"none":"no berries","red":"red berries","black":"black berries",
            "yellow":"yellow berries","orange":"orange fruit"},
  "mark": {
    "none":"nothing unusual", "glows":"glows faintly in the dark",
    "moves":"the leaves move on their own", "fuzzy":"fuzzy barbs along the stem",
    "reacts":"darkens near poison", "sticky":"a sticky resin on the leaves",
    "frost":"cold to the touch, always", "shimmer":"the petals shimmer as they turn",
    "weeps":"weeps clear sap from the cut",
  },
  "form": {
    "bell":"drooping bells", "star":"flat star-shaped flowers", "cup":"deep cupped flowers",
    "cluster":"tight clusters of florets", "spike":"flowers up a tall spike",
    "disc":"broad flat discs", "trumpet":"long trumpet flowers",
    "pompom":"round pompom heads", "cap":"a domed cap on a stalk",
    "frond":"unfurling fronds", "none":"no flower at all",
  },
}

# --- what a plant is FOR. The book prints this only once identified. ------
# Every plant also has a SPECIES - human, dragon or both - and ten of these
# effects exist for BOTH as two different plants, which is where the puzzle
# lives now: "something for a cough" is half a question until you know who is
# coughing. See plants.py.
#
# One plant, one use, with deliberate PAIRS where the pair is the point:
# the two heart tinctures, the two poison-testers, the two things that put a
# person to sleep. Nothing has three. An effect request is therefore a real
# question, and the book's search by use is worth doing.
EFFECTS = {
  "sleep":"brings deep, dreamless sleep",
  "nerves":"settles the nerves without dulling the wits",
  "witless":"drains the wits for a day and a night",
  "forgetting":"takes a memory clean away",
  "poisontest":"names a poisoning without a word being said",
  "wayfind":"points the way to a thing that is lost",
  "fever":"breaks a fever",
  "pathfinding":"shows the path across open ground at night",
  "nighteyes":"sharpens the night vision",
  "wound":"closes a wound clean and quickly",
  "blister":"raises weeping blisters on the skin",
  "quicken":"gives an hour or two of bright, harmless energy",
  "rousing":"wakes a tired body that has stopped",
  "comfort":"is a kindness more than a cure",
  "broody":"moves a dragon that is sitting on nothing",
  "wardluck":"keeps bad luck outside a door",
  "strength":"gives brief, unnatural strength",
  "ache":"dulls a plain ache",
  "revealie":"shows a lie, or what a lock is hiding",
  "stomach":"eases a sour stomach",
  "cough":"quiets a cough and clears the air",
  "heart":"eases a labouring heart",
  "dread":"fills the drinker with a dread they cannot name",
  "affection":"warms an affection already there",
  "nightlong":"holds off sleep for a whole night",
  "wardmind":"keeps affliction of the mind from crossing a door",
  "wing":"holds a torn wing while the hide knits",
  "spirits":"turns unwanted spirits away",
  "poisonground":"kills, and grows back thicker where it killed",
  "uncurse":"lifts a curse, if the curse is young",
  "unbind":"cuts what binds",
  "antidote":"draws a poison back out",
  "courage":"lends courage until morning",
  "burn":"takes the pain out of a burn or a bruise",
  "attention":"sharpens the attention",
  "luck":"turns a person's luck a little",
  "wardpath":"keeps the unwelcome off a path",
  "wardcold":"keeps the cold from killing a man on the fell",
  "numb":"stops pain entirely, and the feeling with it",
  "claw":"hardens a cracked claw, and cleans teeth",
  "obsession":"turns a want into an obsession",
  "hearing":"sharpens the hearing for a day",
  "secrecy":"binds the tongue",
  "graverest":"is laid on a grave so the dead may rest",
  "resolve":"strengthens someone who has already decided",
  "curse":"lays a curse",
  "eyes":"cools tired eyes",
  "gut":"shifts a blockage in a dragon",
  "memory":"brings back a memory that has slipped",
  "revealburied":"shows what has been buried",
  "offering":"is laid at a stone as an offering",
  "flame":"brings a dragon's fire back when it has gone out",
  "wedding":"strengthens what is already promised",
  "trace":"points to one particular person",
  "desire":"is an aphrodisiac, and a foul-smelling one",
  "waking":"wakes a thing that is sleeping",
  "starlight":"lets the eye see by starlight",
  "poison":"is a deadly poison and a beautiful one",
  "unnoticed":"lets one pass unnoticed",
  "lightmoving":"gives a light that moves in the dark",
  "lightwalk":"lights a wood well enough to walk it",
  "dye":"yields a deep purple dye that will not wash out",
  "rash":"raises a rash that itches for days",
  "luckherd":"brings good fortune to a herd",
  "poisonwater":"poisons a cup, and the almond is the only warning",
  "lightbright":"burns with a white light bright enough to hurt",
  "unseat":"unseats the mind",
  "poisonmind":"brings madness first and death after",
  "wither":"ages a body years in a night",
}

# id, name, short (for the map), emoji, note, known-at-start, map cell, lead
HABITATS = [
  ("fen",    "Blackfen Mire", "Blackfen",     "\U0001F578", "Still water and reed. Cold mist most mornings.", True,  "D5", None),
  ("wood",   "Hollow Wood", "Hollow Wood",       "\U0001F332", "Dense, dim, and older than the town.",           True,  "F4", None),
  ("moor",   "Ashen Moor", "Ashen Moor",        "\U0001F33E", "Open heath under a wide grey sky.",              True,  "C3", None),
  ("meadow", "Larkmeadow", "Larkmeadow",        "\U0001F337", "Sunny grass along the low fields.",              True,  "C6", None),
  ("river",  "River Sable", "River Sable",       "\U0001F3DE",  "Slow dark water winding through the vale.",     True,  "E7", None),
  ("crag",   "The Whitecrags", "Whitecrags",    "\u26F0",      "Cold bare rock, high and hard to reach.",       False, "F1",
     "High on the northern tops, west of the sharp peak. You go up until the grass gives out."),
  ("valley", "Quiet Valley", "Quiet Valley",      "\U0001F32B",  "Sheltered hollows and old stone walls.",        False, "F8",
     "Follow the river all the way south, past the last field, until the walls close in."),
  ("tarn",   "Cold Tarn", "Cold Tarn",         "\U0001F4A7",  "A black lake that never quite thaws.",          False, "E3",
     "The black water in the middle of the northern moor. The river runs out of it."),
  ("coast",  "Saltmarsh Shore", "Saltmarsh",   "\U0001F30A",  "Grey tide flats and salt-burnt grass.",         False, "B2",
     "West until you hit the sea, then north along the flats. You will smell it first."),
  ("cave",   "The Underhollow", "Underhollow",   "\U0001F56F",  "Wet limestone, and no light at all.",           False, "I5",
     "Due east of the town, below the barrow mounds, where the ground opens."),
  ("yard",   "Sadgill Churchyard", "Sadgill","\u26EA",      "Old stones, older yews, and long grass.",       False, "G6",
     "Just south of the town. You have walked past it a hundred times."),
  ("garden", "The Walled Garden", "Walled Garden", "\U0001F9F1",  "Somebody tended this once, and stopped.",       False, "H6",
     "South-east of the town, one field over from the church."),
  ("pike",   "Red Pike", "Red Pike",          "\U0001F3D4",  "A long scree climb. Worth it, they say.",       False, "G2",
     "The sharp peak in the north, east of the white crags."),
  ("barrow", "The Barrows", "Barrows",       "\U0001FAA6",  "Grass mounds nobody ploughs.",                  False, "I4",
     "North-east, on the high ground. Grass mounds in a row, and nobody ploughs them."),

  # --- the three places that do not exist until she makes them -------------
  # Each has a FROM_DAY: before that morning the square is ordinary ground and
  # the place is on no chart, because it is not there yet.
  ("scar",   "The Burn Scar", "Burn Scar",    "\U0001F525",  "Ash to the ankle, and things coming up through it.", False, "C4",
     "Where she came down on the moor. You will not need directions - you can see it from the road."),
  ("bed",    "The Tarn Bed", "Tarn Bed",      "\U0001FAA8",  "A lake's worth of nothing, and everything that was under it.", False, "D3",
     "The black water is not there any more. Walk out onto where it was."),
  ("gorge",  "Sundered Gorge", "The Gorge",   "\U0001F5FF",  "A crack a hundred feet down, opened in one night.", False, "H2",
     "The whole east face of Red Pike came away. You could not miss it if you tried."),
]

# When each new place comes into existence.
FROM_DAY = { "scar": 6, "bed": 8, "gorge": 15 }

# --- the map she is rewriting ---------------------------------------------
# She is not attacking the valley, she is searching it, and a search that size
# leaves marks. Each entry repaints one square from the morning of that day;
# the note is what the map says when you look at it.
#   (day, cell, new terrain code, what changed)
TERRAIN_CHANGES = [
  (6,  "C3", "a", "Ashen Moor has burned. The name was always a joke. It is not one now."),
  (6,  "C4", "a", "Ash a foot deep where she came down, and green already showing through it."),
  (8,  "E3", "b", "Cold Tarn is empty. She drank it or she broke it; nobody agrees which."),
  (8,  "D3", "b", "The tarn bed, open to the sky for the first time in living memory."),
  (11, "I4", "h", "She has dug at the Barrows. The mounds are open and nobody will go near them."),
  (12, "H6", "g", "The garden wall came down when she went over it. You can simply walk in now."),
  (15, "G2", "h", "Half of Red Pike is at the bottom of the valley."),
  (15, "H2", "c", "A gorge, where there was a mountainside on Thursday."),
]


# --- shut places, and what is behind them --------------------------------
# Finding a place and getting into it are two different things. Every hidden
# location is shut as well as unknown: read the clue, click the right square,
# and then the place tells you in plain words what it wants before it lets you
# in. You bring it a plant the way you bring one to a person.
#
# This is the critical path, not decoration. Behind twelve of these doors is the
# ONLY cutting of something somebody asks for later, so a player who never
# leaves the counter will get stuck — and the chains run through each other:
#
#     coast -> Brimlock -> crag
#     bed   -> Shimmerlung -> cave -> Mellowglow -> barrow
#                             cave -> Glowhorn    -> gorge
#     valley -> Royal Gentia -> garden
#
# Two rules keep it fair. Every door takes at least two different plants, so it
# is never one plant one door; and the plant is not used up, because you brew a
# dose from it exactly as you would for a person.
#
#   id: (why it is shut, what it wants in words, [effects that work],
#        {pots / pages / papers that are behind it})
GATES = {
  "coast":  ("The tide comes in faster than a man walks and you cannot read it.",
             "something that points the way",
             ["pathfinding", "wayfind", "trace"],
             {"pots": ["n635"]}),                       # Liverstone
  "crag":   ("Above the grass line the cold is the kind that kills.",
             "something that keeps the cold out of a body",
             ["wardcold", "numb"],
             {"pots": ["n255"]}),                       # Winterglass
  "valley": ("Dogs at the wall, and they know you are not from here.",
             "something to quiet a frightened animal",
             ["nerves", "comfort", "sleep"],
             {"pots": ["n474"]}),                       # Elderphinium
  "scar":   ("The ground is still hot enough through a boot to make you swear.",
             "something for a burn, because you are going to get one",
             ["burn", "ache", "wardcold"],
             {"pots": ["n308", "n088"]}),               # Pryttle, Scarwort
  "tarn":   ("Black mud to the knee and no light off the water any more.",
             "something to see by once the light has gone",
             ["starlight", "pathfinding", "wayfind", "nighteyes"],
             {"pots": ["n670"]}),                       # Gilded Dendra
  "bed":    ("A lake-bed is a maze and every part of it looks like every other.",
             "something that points the way",
             ["wayfind", "trace", "pathfinding"],
             {"pots": ["n544"]}),                       # Shimmerlung
  "pike":   ("A long scree climb, and you have been on your feet since six.",
             "something to keep you going",
             ["quicken", "nightlong", "rousing"],
             {"pots": ["n565"]}),                       # Emberfell
  "yard":   ("After dark you are not on your own in there, whatever anybody says.",
             "something that turns a spirit from a threshold, or binds your own tongue",
             ["spirits", "secrecy", "graverest"],
             {"pots": ["n628", "n691"]}),               # Dead Man's Fingers, Twilight Lepiota
  "cave":   ("Three steps in the dark is total and a lamp will not stay lit in that air.",
             "a light that does not need a flame",
             ["lightbright", "starlight", "lightmoving", "lightwalk"],
             {"pots": ["n530", "n593"]}),               # Mellowglow, Wanderlamp
  "garden": ("A vine over the gate that will not cut, and it has hold of the latch.",
             "something that cuts what binds, or the strength to tear it",
             ["unbind", "strength"],
             {"pots": ["n572"]}),                       # Sour Bandy
  "barrow": ("There is a man on the road who writes down who goes up there.",
             "a way past a man who is watching, or a mind he cannot bring in with him",
             ["unnoticed", "wardmind", "dread", "witless"],
             {"pots": ["n684"]}),                       # Solomon's Sceptre
  "gorge":  ("A hundred feet down in the dark, on wet rock, on a rope.",
             "a light you can climb with",
             ["lightwalk", "lightmoving", "nighteyes"],
             {"pots": ["n314"]}),                       # Nightvane
}

# where the shop is. Not a habitat; a landmark so the map reads as a place.
TOWN_CELL = "G5"

GRID_COLS = "ABCDEFGHIJ"
GRID_ROWS = 8

# Base terrain, one letter per square, row 1 at the top. Drives the drawing only,
# but it has to AGREE with where the locations are and with what the leads say -
# validate.py checks that every location's square is drawn as something sensible.
#      A B C D E F G H I J
TERRAIN = [
  "ssgggh gggg".replace(" ",""),   # 1   F1 Whitecrags
  "smgggh pggg".replace(" ",""),   # 2   B2 Saltmarsh · G2 Red Pike
  "gggglg gghg".replace(" ",""),   # 3   C3 Ashen Moor · E3 Cold Tarn
  "gggmgw gghg".replace(" ",""),   # 4   F4 Hollow Wood · I4 Barrows
  "gggmgw tghg".replace(" ",""),   # 5   D5 Blackfen · G5 the shop · I5 Underhollow
  "gglggw yggg".replace(" ",""),   # 6   C6 Larkmeadow · G6 Sadgill · H6 Walled Garden
  "ggggrv gggg".replace(" ",""),   # 7   E7 River Sable · F7 Quiet Valley
  "ggggrv gggg".replace(" ",""),   # 8   F8 Quiet Valley
]
# s sea   m saltmarsh   h hill   p peak   w wood   l meadow
# r river v valley      y churchyard      t town   g moor/grass
# a burnt ground (day 6+)   b drained lake bed (day 8+)   c gorge (day 15+)
