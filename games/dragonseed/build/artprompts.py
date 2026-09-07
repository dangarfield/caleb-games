# -*- coding: utf-8 -*-
"""Build research/ART_PROMPTS.flux2.json and research/ART_PROMPTS.krea.json.

    python3 build/artprompts.py

Every plant prompt is DERIVED from the plant's own axes in plants.py, so a
specimen's picture and the clue somebody gives you across the counter can never
drift apart: if the puzzle says five drooping blue bells, so does the prompt.
The people, the places, the story panels and the interface assets are written
out by hand below, because there is no table to derive them from.

Re-run this whenever plants.py, taxonomy.py or evenings.py changes.
"""
import sys, os, json, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import taxonomy as T
from plants import PLANTS
from evenings import EVENINGS, PROLOGUE
from endings import ENDINGS, CODAS

OUT = os.path.join(os.path.dirname(HERE), "research")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- vocabularies
MARK = {
 "glows":   "faintly luminous, a soft cold light coming from inside it",
 "moves":   "caught mid-movement, curling as though awake",
 "fuzzy":   "fine fuzzy barbs bristling along it",
 "reacts":  "the tissue darkened in patches, as if bruised",
 "sticky":  "beaded all over with clear sticky resin",
 "frost":   "a rime of frost along its edges",
 "shimmer": "an oil-on-water shimmer over it",
 "weeps":   "a bead of clear sap weeping from a cut",
 "none":    "",
}
GROUND = {
 "fen":"rooted in black peat and reed litter", "wood":"rooted in deep leaf mould",
 "moor":"rooted in dry heath turf", "meadow":"rooted in summer grass",
 "river":"rooted in wet river silt", "crag":"rooted in bare cold rock",
 "valley":"rooted in a mossy drystone wall", "tarn":"rooted at the edge of black water",
 "coast":"rooted in salt-crusted sand", "cave":"rooted in wet limestone, in the dark",
 "yard":"rooted in long churchyard grass", "garden":"rooted in neglected garden soil",
 "pike":"rooted in loose scree", "barrow":"rooted in a grass mound",
 "scar":"pushing up through ankle-deep ash", "bed":"rooted in cracked grey lake mud",
 "gorge":"rooted on a wet rock ledge",
}
MARK_WORD = {
 "glows":  ["glow", "shine", "shines", "phosphor", "luminous"],
 "moves":  ["move", "turn slowly", "not always where"],
 "fuzzy":  ["fuzz", "barb"],
 "reacts": ["darken", "blacken", "blackens"],
 "sticky": ["resin", "sticky"],
 "frost":  ["frost", "cold to the touch", "stay cold", "cold in any weather"],
 "shimmer":["shimmer", "iridesc"],
 "weeps":  ["weep", "sap"],
 "none":   [],
}
KIND = {"flower":"flowering plant", "herb":"herb", "fungus":"fungus"}
HNAME = {h[0]: h[1] for h in T.HABITATS}
COLOURS = ("blue","yellow","orange","black","red","white","green","purple","pink","brown")

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def strip_colour(text):
    out = text
    for c in COLOURS:
        out = re.sub(r"\b%s\b" % c, "", out, flags=re.I)
        out = re.sub(r"\b%s\b" % c.capitalize(), "", out)
    return re.sub(r"\s{2,}", " ", out).replace(" ,", ",").strip()

# ---------------------------------------------------------------- plants
def plant_items():
    items = []
    for p in PLANTS:
        bits = ["%s (%s), an invented %s of %s"
                % (p["name"], p["binomial"], KIND[p["kind"]], HNAME[p["habitat"]])]
        bits.append(p["plate"].rstrip("."))
        low = p["plate"].lower()                     # the plate often says it already
        said = any(w in low for w in MARK_WORD[p["mark"]])
        if MARK[p["mark"]] and not said: bits.append(MARK[p["mark"]])
        bits.append(GROUND[p["habitat"]])
        cap = lambda t: t[0].upper() + t[1:] if t else t
        subject = ". ".join(cap(b) for b in bits if b) + "."
        bbits = [bits[0], strip_colour(p["plate"].rstrip(".")),
                 "" if said else strip_colour(MARK[p["mark"]]), GROUND[p["habitat"]],
                 "Colour is irrelevant here: render form, structure and texture in tone alone"]
        book = ". ".join(cap(b) for b in bbits if b) + "."
        items.append(dict(
            id=p["id"], name=p["name"], binomial=p["binomial"],
            filename="plant_%s_%s.png" % (p["id"], slug(p["name"])),
            book_filename="plantbook_%s_%s.png" % (p["id"], slug(p["name"])),
            subject=subject, book_subject=book,
            meta=dict(kind=p["kind"], habitat=p["habitat"], habitat_name=HNAME[p["habitat"]],
                      colour=p["colour"], form=p["form"], leaf=p["leaf"], stem=p["stem"],
                      berry=p["berry"], mark=p["mark"], species=p["species"],
                      effect=p["effect"], book_text=p["use"])))
    return items

# ---------------------------------------------------------------- people
PEOPLE = [
 dict(id="ivo", name="Ivo", accent="brick orange",
   subject="Ivo, the dragon farmer. A broad, weather-beaten man in his fifties with a "
           "short grey beard, deep laugh lines, a flat cap and a collarless work shirt "
           "under a canvas smock, one sleeve rolled. Cheerful and blunt. A small scorch "
           "mark on the shoulder of the smock. Brick-orange neckerchief as the one bright "
           "colour."),
 dict(id="wren", name="Doctor Wren", accent="ink blue",
   subject="Doctor Wren, the village doctor. A neat, narrow man in his forties, "
           "close-cropped dark hair, small round spectacles, high buttoned collar and a "
           "dark coat, already half-turned as though leaving. Brisk, not unkind. "
           "Ink-blue tie as the one bright colour."),
 dict(id="nan", name="Nan", accent="mustard yellow",
   subject="Nan, old and unstoppable. A small woman in her eighties, white hair pinned "
           "up, bright observant eyes, deep wrinkles, a huge hand-knitted shawl over a "
           "plain dress, walking stick. Kind and a bit dry. Mustard-yellow shawl as the "
           "one bright colour."),
 dict(id="coyle", name="Mrs Coyle", accent="deep teal",
   subject="Mrs Coyle, careful and frightened and firm about it. A woman in her fifties, "
           "dark hair drawn back severely, straight mouth, high-necked dark dress and a "
           "long scarf, one gloved hand held slightly in front of the other to hide an "
           "old scar. Deep-teal scarf as the one bright colour."),
 dict(id="tom", name="Tom", accent="postbox red",
   subject="Tom, a boy of about eleven. Scruffy sandy hair, freckles, a gap in his grin, "
           "a too-big jacket over a jersey, a satchel of messages across his body, "
           "leaning forward as though about to run off. Postbox-red cap as the one bright "
           "colour."),
 dict(id="warden", name="The Warden", accent="brass gold",
   subject="The Warden, sent from the town. A tall, very polite man in his sixties, "
           "clean-shaven, long dark travelling coat buttoned to the throat, a small "
           "notebook and pencil held ready, an expression of patient enquiry. "
           "Brass-gold coat buttons and pencil ferrule as the one bright colour."),
 dict(id="dragon", name="The glass dragon", accent="prism white", extra=True,
   subject="The glass dragon, seen as an avatar bust. An enormous dragon's head and neck "
           "made of something like clear glass with weather behind it, faceted, catching "
           "colours that are not quite colours, eyes calm and searching rather than "
           "angry. Drawn in the same simplified flat cartoon style as the people, not "
           "realistic, not frightening."),
 dict(id="baby", name="The hatchling", accent="prism white", extra=True,
   subject="The hatchling, the size of a cat. A small clear-glass dragon with a heavy "
           "head, stubby wings folded, sitting up on its haunches like a kitten, damp "
           "and cross and entirely charming. Same simplified flat cartoon style as the "
           "people."),
]

# ---------------------------------------------------------------- locations
LOC_EXTRA = {
 "fen":   "Still black water between reed beds, a plank walkway half sunk, cold mist "
          "lying on the surface at dawn, willows going into the fog.",
 "wood":  "Dense old woodland, trunks too close together, almost no sky, deep leaf "
          "mould, a green half-dark that never brightens.",
 "moor":  "Open heath rolling to a low horizon under a wide grey sky, heather and cotton "
          "grass, one drystone wall running away into nothing.",
 "meadow":"Low sunny grass fields along the river, buttercups, a warm break in the "
          "weather, hedgerows and a distant church tower.",
 "river": "A slow dark river winding through the vale, alders on the bank, a stone "
          "packhorse bridge, the water almost black and quite still.",
 "crag":  "High bare rock above the grass line, wind-scoured, cold blue-grey stone, the "
          "valley far below under cloud, a cairn on the top.",
 "valley":"A sheltered hollow of old stone walls and small crooked fields, gates off "
          "their hinges, nobody about.",
 "tarn":  "A black mountain lake that never quite thaws, sheer sides, absolutely flat "
          "water, snow still in the gullies above it.",
 "coast": "Grey tide flats going out further than seems possible, salt-burnt grass, "
          "channels of water in the mud, sea fret coming in.",
 "cave":  "A wet limestone cave mouth going down into total dark, flowstone, a dropped "
          "lantern, no light at all beyond three steps.",
 "yard":  "An old churchyard, leaning headstones, enormous black yews, long uncut grass, "
          "a lychgate, late afternoon going to dusk.",
 "garden":"A high-walled garden that somebody tended once and stopped: espaliered fruit "
          "gone wild, a bound gate, a dry fountain, everything green and overgrown.",
 "pike":  "A sharp peak reached by a long scree climb, loose red-brown stone, a thin "
          "path zigzagging up, cloud tearing over the summit.",
 "barrow":"A line of grass burial mounds on high ground, unploughed, a rutted track "
          "past them, a wide empty sky.",
 "scar":  "Forty acres of burnt moor, ash to the ankle, black stumps of heather, and "
          "small green shoots already coming up through the ash.",
 "bed":   "The floor of a drained lake: cracked grey mud from side to side, a stone "
          "shelf halfway across, weed drying where the water was, the old shoreline high "
          "and dry above it.",
 "gorge": "A hundred-foot crack opened in a mountainside in one night, wet raw rock, "
          "ledges with pale plants on them that have never had sun, a rope over the edge.",
}
LOC_PHASES = {
 "moor":   [dict(id="before", label="days 1-4, before the fire",
                 subject="Open heath rolling to a low horizon, heather and cotton grass, "
                         "green-brown and wet, one drystone wall running into the "
                         "distance under a wide grey sky."),
            dict(id="after", label="day 4 onward, burnt",
                 subject="The same heath burnt black, ash to the ankle, stumps of heather "
                         "still smoking faintly, the drystone wall scorched, the same "
                         "wide grey sky above it.")],
 "tarn":   [dict(id="full", label="days 1-7, full",
                 subject="A black mountain lake, sheer sided, absolutely flat water, "
                         "snow in the gullies above."),
            dict(id="drained", label="day 8 onward, drained",
                 subject="The same corrie with no lake in it at all: a lake-shaped hole "
                         "of cracked grey mud, the old waterline like a tidemark round "
                         "the rock, a stone shelf exposed halfway across.")],
 "pike":   [dict(id="whole", label="days 1-14, whole",
                 subject="A sharp scree peak, loose red-brown stone, a thin zigzag path, "
                         "cloud tearing over the summit."),
            dict(id="broken", label="day 15 onward, the east face gone",
                 subject="The same peak with its whole east face sheared away overnight, "
                         "a raw pale scar of new rock, a hundred-foot crack running down "
                         "into shadow, rubble fanned out at the base.")],
 "barrow": [dict(id="closed", label="days 1-10, undisturbed",
                 subject="A line of grass burial mounds on high ground, smooth and "
                         "unbroken, a rutted track past them."),
            dict(id="opened", label="day 11 onward, three opened",
                 subject="The same line of mounds with three of them torn open from "
                         "above and left open, turf peeled back, dark holes, nothing "
                         "taken out and nothing scattered.")],
}
LOC_BONUS = [
 dict(id="town", name="The village square",
      subject="A small rainy Victorian village square: wet cobbles, a market cross, a "
              "pump, shuttered shopfronts, a church tower behind, everything running "
              "with rain and nobody out in it."),
 dict(id="shop", name="The plant shop, from outside",
      subject="A narrow shopfront on the square at dusk: a bowed window full of small "
              "labelled pots and dried bunches, warm lamplight inside, a hand-painted "
              "sign with no words legible on it, wet cobbles reflecting the light."),
 dict(id="cellar", name="The coal cellar",
      subject="A low brick cellar under a shop: a stack of coal against the far wall, a "
              "bed of raked sand in front of it, a blanket half off something warm and "
              "faintly luminous, one candle, stone steps going up out of frame."),
]

def location_items():
    items = []
    for hid, name, short, emoji, note, known, cell, lead in T.HABITATS:
        it = dict(id=hid, name=name, filename="loc_%s.png" % hid,
                  subject="%s. %s" % (name, LOC_EXTRA[hid]),
                  meta=dict(map_cell=cell, known_on_day_one=known,
                            note=note, how_you_hear_of_it=lead))
        if hid in LOC_PHASES:
            it["phases"] = [dict(p, filename="loc_%s_%s.png" % (hid, p["id"]))
                            for p in LOC_PHASES[hid]]
        items.append(it)
    for b in LOC_BONUS:
        items.append(dict(b, filename="loc_%s.png" % b["id"], extra=True))
    return items

# ---------------------------------------------------------------- story
STORY_SCENES = {
 ("prologue", 0): "A wide view of a green rainy valley with a river down the middle and a "
                  "small village in it, and — quite ordinary, unremarked — cart-sized and "
                  "cat-sized dragons everywhere among the people: one asleep in a doorway, "
                  "one pulling a brewer's dray up a hill, three in a wicker box outside the "
                  "post house. Nobody is looking at them.",
 ("prologue", 1): "The inside of a small plant shop: two hundred little labelled pots on "
                  "shelves floor to ceiling, dried bunches hanging, a worn wooden counter "
                  "with a dip in it, and one heavy open book on the counter under a lamp.",
 ("prologue", 2): "The shop door from inside, first thing in the morning: grey light "
                  "coming through the bowed window, the bell on its curled spring over the "
                  "door, a hand about to turn the sign round, the counter waiting.",
 ("evening", 1):  "A child with a candle at the bottom of cellar steps, a coal stack "
                  "behind, and in front of it a blanket half pulled off a warm, faintly "
                  "see-through egg the size of a sheep. Wonder, not fear.",
 ("evening", 2):  "Dusk over the moor from the village: an enormous shape crossing the sky "
                  "far off, only a silhouette against the last light, too big, not "
                  "flapping. In the foreground a shepherd pointing and two people laughing "
                  "at him.",
 ("evening", 3):  "A wooden box of old paper tipped out on a shop counter under a lamp — "
                  "notes, torn pages, folded maps, a dead wasp — and a child sorting "
                  "through it late at night.",
 ("evening", 4):  "The moor on fire seen from the village square in the afternoon: a wall "
                  "of orange low down under an enormous brown smoke sky, the whole village "
                  "standing in the street watching, ash falling like snow.",
 ("evening", 5):  "A hillside at grey noon: a single burnt sheep lying in the bracken, not "
                  "eaten, and half a dozen villagers standing round it at a distance with "
                  "their hands in their pockets. Sombre, not gruesome, no blood.",
 ("evening", 6):  "Inside the shop: a broad farmer leaning on the counter with two fingers "
                  "held up, saying something, and two other customers turning round to "
                  "listen. Lamplight, everyone very still.",
 ("evening", 7):  "A boy caught two steps down a cellar stairway, and a child blocking the "
                  "top of the stairs with the door half shut behind them. Warm light "
                  "coming up from below and neither of them saying anything.",
 ("evening", 8):  "A drained mountain lake at first light: a lake-shaped hole of grey mud, "
                  "a tidemark round the rock, a stone shelf exposed halfway across, two "
                  "tiny figures standing on the old shoreline looking at it.",
 ("evening", 9):  "A tall polite man in a long coat stepping down from a coach in the "
                  "village square in the rain, notebook already in his hand, villagers "
                  "watching from doorways.",
 ("evening", 10): "Night in the cellar, lit by one candle: the great glassy egg tipped a "
                  "little to one side in its bed of sand, mid-rock, and an old woman and a "
                  "child sitting on the bottom step watching it.",
 ("evening", 11): "The shop, empty of customers: the Warden standing at the counter with a "
                  "pencil held over an open notebook, waiting, and a child on the other "
                  "side of the counter not answering. Long shadows, very quiet.",
 ("evening", 12): "Two in the morning in the cellar: the shell in pieces like a cracked "
                  "nut, and a wet, cross, cat-sized glass dragon looking straight up at "
                  "the viewer. One candle. Enormously charming, not scary.",
 ("evening", 13): "A village meeting inside a small church at night: full pews, lamps, one "
                  "woman standing to speak, hands going up. Seen from the back, faces "
                  "mostly turned away.",
 ("evening", 14): "Night: a huge glass dragon lying still on the top of a crag above the "
                  "valley, lit from below by the village lamps, and far below one lit "
                  "shop window with a small shape in it.",
 ("evening", 15): "A moonlit path going up onto the crags, four miles of it, with a small "
                  "figure standing at the bottom of it deciding. The dragon's shape "
                  "visible on the skyline, asleep.",
 ("ending", "end_return"):
                  "The whole village stood along a hillside in the morning, forty men "
                  "with bows lowering them and standing aside, and a small figure walking "
                  "up through them with a covered basket. An enormous dragon of clear "
                  "glass coming down off the top to meet them, the light of her going "
                  "through the crowd like a lamp through paper. Awe, and relief, and "
                  "nobody frightened.",
 ("ending", "end_keep"):
                  "Late dusk, three fields from the village: a small figure hurrying away "
                  "along a hedge with something the size of a cat held inside a coat, one "
                  "clear glass wing showing at the collar. Behind and below, the shop "
                  "window still lit and the square empty. No one following yet.",
 ("ending", "none"):
                  "An empty village square at the end of the day, wet cobbles, a few "
                  "people drifting home, the crag above gone dark and nothing on it. "
                  "Through the shop window, on the floor inside, a covered basket that "
                  "nobody carried anywhere.",
 ("evening", 16): "Morning after everything: an empty village square, wet cobbles, a shop "
                  "with the lamp still lit in the window and the sign turned to open, one "
                  "feather-sized shard of clear glass on the doorstep.",
}
def story_items():
    items = []
    for i, panel in enumerate(PROLOGUE):
        items.append(dict(id="prologue_%d" % i, kind="prologue", index=i,
                          title=panel["title"], filename="story_prologue_%d.png" % i,
                          subject=STORY_SCENES[("prologue", i)]))
    for e in EVENINGS:
        items.append(dict(id="evening_%02d" % e["day"], kind="evening", day=e["day"],
                          title=e["title"], filename="story_evening_%02d.png" % e["day"],
                          subject=STORY_SCENES[("evening", e["day"])]))
    for en in ENDINGS:
        flag = en["flag"] or "none"
        items.append(dict(id="ending_%s" % flag, kind="ending", flag=en["flag"],
                          title=en["title"], filename="story_ending_%s.png" % flag,
                          subject=STORY_SCENES[("ending", flag)],
                          meta=dict(chosen_by="the fork in the last hour of day sixteen",
                                    ending_text=en["body"])))
    return items

# ---------------------------------------------------------------- assets
ASSETS = [
 ("desk_surface", "The desk top", "1536x1024", "3:2", False,
  "A shop counter top seen straight down: oiled dark oak, deeply worn, a dip polished "
  "into it where elbows go, ring marks, ink stains, a few scattered dried leaves. Empty "
  "in the middle. Fills the whole frame edge to edge."),
 ("desk_mat", "The leather working mat", "1024x768", "4:3", True,
  "A rectangular working mat of dark green weathered leather, scuffed pale at the "
  "corners, a scorch mark near one edge, stitched border. Seen straight on, flat, "
  "isolated."),
 ("shelf_wall", "The wall of pots", "512x1024", "1:2", False,
  "A tall narrow section of shop shelving crammed with small glazed earthenware pots and "
  "stoppered jars, every one with a hand-written paper label gone brown, dried bunches "
  "hanging above, dust. Fills the frame top to bottom."),
 ("pot_empty", "An empty pot", "512x512", "1:1", True,
  "One small squat earthenware pot, chipped cream glaze, a blank brown paper label tied "
  "at the neck with string. Empty. Isolated, straight-on, slight top-down tilt."),
 ("pot_cutting", "A pot with a cutting in it", "512x512", "1:1", True,
  "One small squat earthenware pot with a fresh unnamed green cutting stuck in it, roots "
  "and soil showing, no label yet. Isolated, straight-on, slight top-down tilt."),
 ("drawer_front", "The clues drawer, shut", "1024x512", "2:1", True,
  "The front of one wide shallow drawer under a shop counter: dark oak, a worn brass "
  "cup handle, a small brass card frame with nothing legible in it. Straight on."),
 ("drawer_open", "The clues drawer, open", "1024x768", "4:3", False,
  "A wide shallow drawer pulled out and seen from above: string, sealing wax, a dead "
  "wasp, and forty years of folded paper — notes, torn leaves, a printed handbill, a "
  "drawing on the back of an envelope."),
 ("book_closed", "The book, shut", "768x1024", "3:4", True,
  "A heavy old book lying shut: cracked dark leather, blind-tooled border, brass corner "
  "pieces, a cloth marker hanging out, the fore-edge foxed and swollen. Isolated, "
  "three-quarter view from above."),
 ("book_open", "The book, open", "1536x1024", "3:2", False,
  "The same heavy book open flat at a double spread of blank heavy foxed paper, faint "
  "ruled lines, the gutter shadow deep, a marker ribbon lying across the page. No text "
  "and no illustration on the pages — they will be drawn on."),
 ("paper_sheet", "A blank note", "1024x1024", "1:1", True,
  "One sheet of old writing paper, foxed and creased in four, torn along one edge, "
  "completely blank, lying flat. Isolated."),
 ("map_paper", "The map chart, blank", "1024x768", "4:3", False,
  "A large sheet of heavy chart paper pinned flat at the corners: aged, water-stained, "
  "a faint printed grid, brass drawing pins, curling slightly. Completely blank in the "
  "middle — the map is drawn on top of it."),
 ("lens", "The magnifying glass", "512x512", "1:1", True,
  "A heavy brass magnifying glass with a turned rosewood handle, the glass slightly "
  "green, one small dent in the rim. Isolated, three-quarter view."),
 ("rune_stones", "The rite stones", "1024x512", "2:1", True,
  "Six small flat river pebbles in a row, each with one simple angular mark cut into it "
  "and rubbed with white chalk. Isolated, straight down."),
 ("bell", "The counter bell", "512x512", "1:1", True,
  "A small tarnished brass shop bell on a curled spring bracket, the kind screwed above "
  "a door. Isolated."),
 ("lamp", "The counter lamp", "512x512", "1:1", True,
  "A small brass oil lamp with a smoked glass chimney, lit, the flame low. Isolated."),
 ("window_rain", "The shop window", "768x1024", "3:4", False,
  "A bowed shop window seen from inside at dusk: small panes, rain running down the "
  "outside, the square beyond gone to blur and lamplight, a dead fly on the sill."),
 ("start_backdrop", "Start screen backdrop", "1920x1080", "16:9", False,
  "A wide, quiet establishing image of the shop interior at opening time: the counter in "
  "the middle distance, shelves of pots left and right, one lamp lit, grey morning "
  "through the window, nobody in it. Room left in the centre for a title."),
 ("dayend_card", "Day-end card texture", "1024x768", "4:3", False,
  "A blank sheet of heavy cream card with a deckle edge and a faint printed rule round "
  "the border, lying on dark wood. Nothing written on it."),
 ("egg_in_sand", "The egg in the cellar", "1024x768", "4:3", False,
  "A great warm faintly see-through egg the size of a sheep, bedded in six inches of "
  "raked sand on a brick cellar floor, a coarse blanket half off it, one candle to the "
  "side. Lit partly from inside."),
 ("label_stamp", "A blank label and stamp", "1024x512", "2:1", True,
  "A blank brown paper luggage label with a string loop, and beside it a small wooden "
  "rubber stamp and a shallow tin of black ink. Isolated, straight down."),
]
def asset_items():
    return [dict(id=a[0], name=a[1], size=a[2], aspect_ratio=a[3], transparent=a[4],
                 filename="asset_%s.png" % a[0], subject=a[5]) for a in ASSETS]

# ---------------------------------------------------------------- style bases
FLUX = {
"plants":
 "Antique botanical illustration of one invented plant specimen, in the manner of a "
 "nineteenth-century field guide or a herbalist's encyclopaedia: meticulous hand-drawn "
 "detail, fine ink linework under soft watercolour washes, botanically plausible "
 "structure, the whole plant shown root to flower like a mounted herbarium specimen. "
 "Muted cosy-noir palette of deep browns, forest greens, stormy greys and aged ochres, "
 "with the plant's own colour left vivid and saturated so it is the one bright thing in "
 "the frame. Even diffuse light, no cast shadow, no vignette. Centred, filling about "
 "eighty percent of a square frame with clean margins. Transparent background, nothing "
 "behind the plant, no paper texture, no pot, no hand, no label, no text, no scale bar, "
 "no border. The specimen:",
"plants_book":
 "Single-colour antique engraved plate of one invented plant, in the manner of the plant "
 "book in Strange Horticulture: pure line drawing, copperplate hatching and stipple "
 "only, no colour and no wash, dark sepia-brown ink. Confident varied line weight, "
 "cross-hatching for shade, the whole plant root to flower laid out flat like a "
 "herbarium sheet, one or two structures shown separately beside it as a detail study. "
 "Flat even rendering, no lighting, no shadow, no perspective. Centred in a square frame "
 "with clean margins. Transparent background, no paper, no text, no label, no border, no "
 "signature. The specimen:",
"people":
 "Character avatar for a cosy-gothic Victorian village game. Clean simplified flat "
 "two-dimensional cartoon portrait, an indie-comic sticker look: bold confident outline, "
 "flat colour fills with a single soft shade tone, minimal facial detail, warm and "
 "approachable, deliberately far simpler than the detailed botanical art it sits beside. "
 "Head and shoulders, three-quarter view turned slightly to the viewer's left, eyeline "
 "level, calm expression. Muted earthy palette of wool browns, moss greens, slate greys "
 "and oatmeal, with exactly one saturated accent colour. Flat even lighting, no "
 "gradients, no rendering, no scenery. Transparent background, no frame, no drop shadow, "
 "no text. The character:",
"locations":
 "Wide establishing illustration of a place in a rainy Victorian valley, painted as an "
 "antique tinted lithograph: ink underdrawing with loose watercolour washes over it, "
 "visible paper grain in the wash, hand-made and slightly imperfect. Cosy-noir palette "
 "of deep browns, forest greens and stormy greys, desaturated overall, at most one small "
 "vivid accent. Overcast diffuse light, low horizon, weather in the air. No people, no "
 "animals, no text, no border, no watermark. Landscape four by three. The place:",
"story":
 "Full-bleed story illustration for a cosy-gothic Victorian village game, in the manner "
 "of a tinted plate in an old novel: ink linework under muted watercolour washes, "
 "painterly and hand-made, heavy atmosphere, strong simple composition. Cosy-noir "
 "palette of deep browns, forest greens and stormy greys lit by one warm source — lamp, "
 "hearth or moon — with a single vivid accent where the strangeness is. Quiet and "
 "unhurried; never gory, never frightening, safe for an eight-year-old. Faces small and "
 "simply drawn in the same flat cartoon manner as the character avatars. No text, no "
 "speech bubbles, no border. Landscape four by three. The scene:",
"assets":
 "Game interface asset for a cosy-gothic Victorian shop, drawn as a tactile hand-painted "
 "object: rich material detail — weathered leather, aged brass, oiled dark oak, heavy "
 "foxed parchment, chipped glaze — with visible grain, scuffs and honest use. Cosy-noir "
 "palette, warm lamplight from the upper left, soft contact shadow only. Straight-on "
 "orthographic view, no perspective distortion, no people, no text, no watermark. "
 "The object:",
}

KREA = {
"plants":
 "antique botanical illustration, invented plant specimen, 19th century field guide "
 "plate, fine ink linework under soft watercolour wash, whole plant root to flower, "
 "herbarium mount, cosy-noir muted palette of deep brown forest green stormy grey aged "
 "ochre with the flower colour left vivid and saturated, even diffuse light, no shadow, "
 "centred with clean margins, transparent background, subject:",
"plants_book":
 "antique engraved plant plate, monochrome sepia line drawing, copperplate hatching and "
 "stipple, no colour no wash, whole plant root to flower flat like a herbarium sheet, "
 "small detail study beside it, flat even rendering, no shadow, centred with clean "
 "margins, transparent background, Strange Horticulture plant book style, subject:",
"people":
 "flat 2d cartoon avatar, indie comic sticker style, bold clean outline, flat fills with "
 "one soft shade tone, minimal face detail, head and shoulders three-quarter view, warm "
 "approachable, muted earthy palette with one saturated accent, flat lighting, no "
 "gradient, transparent background, character:",
"locations":
 "antique tinted lithograph landscape, ink underdrawing with loose watercolour wash, "
 "visible paper grain, rainy Victorian valley, cosy-noir desaturated palette of deep "
 "brown forest green stormy grey, overcast diffuse light, low horizon, no people, "
 "place:",
"story":
 "tinted plate story illustration from an old novel, ink linework under muted "
 "watercolour wash, painterly and hand made, cosy-gothic, cosy-noir palette lit by one "
 "warm lamp or moon source with a single vivid accent, gentle and child-safe, small "
 "simply drawn flat cartoon faces, scene:",
"assets":
 "hand painted game ui asset, tactile antique object, weathered leather aged brass oiled "
 "dark oak foxed parchment chipped glaze, visible grain and scuffs, cosy-noir palette, "
 "warm lamplight upper left, straight-on orthographic, isolated object:",
}

NEG = {
"plants": "photograph, 3d render, cgi, plastic, glossy, neon airbrush, anime, manga, "
          "text, watermark, signature, label, caption, ruler, pot, hand, drop shadow, "
          "background, paper texture, frame, border, cropped, multiple specimens",
"plants_book": "colour, colour wash, watercolour, photograph, 3d render, greyscale "
          "photo, text, caption, label, watermark, signature, shading gradient, "
          "background, paper texture, frame, border, multiple plates",
"people": "photorealistic, realistic skin, 3d render, anime, manga, big anime eyes, "
          "detailed rendering, gradient shading, background, scenery, text, watermark, "
          "signature, frame, drop shadow, full body, hands, weapon, horror, gore",
"locations": "people, figures, animals, dragons, text, signpost lettering, watermark, "
          "signature, frame, border, hdr, oversaturated, neon, photograph, 3d render, "
          "modern buildings, cars, power lines",
"story": "gore, blood, violence, horror, scary monster, sharp teeth, screaming faces, "
          "text, speech bubble, watermark, signature, frame, border, photograph, 3d "
          "render, anime, oversaturated, neon",
"assets": "people, hands, text, lettering, readable label, watermark, signature, "
          "photograph, 3d render, plastic, glossy highlight, harsh shadow, cluttered "
          "background, perspective distortion",
}

SIZES = {
 "plants": ("512x512", "1:1"), "plants_book": ("512x512", "1:1"),
 "people": ("640x480", "4:3"), "locations": ("1024x768", "4:3"),
 "story": ("1024x768", "4:3"), "assets": ("varies", "varies"),
}

TRANSPARENCY = {
 "flux2":
  "FLUX.2 writes RGB, not RGBA. For anything marked transparent, generate on a flat "
  "matte — add 'on a flat pure #00FF00 chroma background' to the end of the prompt — "
  "then key it out, or run a background remover over the result. Do not ask FLUX for "
  "'a transparent background' and expect alpha; the phrase is in the style base only to "
  "stop it inventing scenery.",
 "krea":
  "Krea's image tools have a remove-background step; run it after generation for "
  "anything marked transparent, or generate on the flat chroma matte named in "
  "chroma_hint and key it yourself. The 'transparent background' words in the style base "
  "are there to stop it inventing scenery, not to produce alpha.",
}

PARAMS = {
 "flux2": dict(model="flux.2", guidance=3.5, steps=40, sampler="default",
               note="Lower guidance (2.5-3) if the plants come out too illustrated and "
                    "stiff; raise to 4.5 if it drifts off the described structure. "
                    "Keep the seed and vary only the subject clause when you want a set "
                    "that matches."),
 "krea":  dict(model="krea-1", steps=32, style_strength="medium",
               note="Generate one plant, one person and one location first, then reuse "
                    "those three as style references for everything else in their "
                    "section — that is what keeps 82 plants looking like one book."),
}

# ---------------------------------------------------------------- emit
def build(fmt):
    styles = FLUX if fmt == "flux2" else KREA
    def section(key, items, size=None, ar=None, extra=None):
        s, a = SIZES[key if key in SIZES else "plants"]
        d = dict(
            style_base=styles[key],
            template="{style_base} {subject}",
            size=size or s, aspect_ratio=ar or a,
            transparent_background=key in ("plants", "plants_book", "people"),
            count=len(items), items=items)
        if fmt == "krea":
            d["negative_prompt"] = NEG[key]
            d["chroma_hint"] = "#00FF00"
        if extra: d.update(extra)
        return d

    plants = plant_items()
    main = [{k: v for k, v in p.items() if k not in ("book_subject", "book_filename")}
            for p in plants]
    book = [dict(id=p["id"], name=p["name"], filename=p["book_filename"],
                 subject=p["book_subject"]) for p in plants]

    doc = dict(
      meta=dict(
        game="Dragonseed — sixteen days at the plant shop", build=43, format=fmt,
        purpose="Art-direction prompts for every image the game needs. Each section has "
                "one style_base you concatenate in front of a per-item subject; nothing "
                "here is a finished prompt on its own.",
        how_to_use="prompt = style_base + ' ' + subject. Keep style_base byte-identical "
                   "across a whole section — that is the only thing making 82 plants "
                   "look like one book.",
        art_direction=[
          "Antique botanical illustration: meticulous hand-drawn fictional plants in the "
          "manner of vintage field guides and 19th-century encyclopaedias, with the "
          "distinguishing trait of each specimen clearly legible, because the trait IS "
          "the puzzle.",
          "A muted cosy-noir palette: deep browns, forest greens, stormy greys, "
          "desaturated and rainy, punctured deliberately by vivid saturated colour on "
          "the flowers and anything magical, so the eye goes to what you interact with.",
          "Tactile stationary UI: one fixed view of your counter, everything made of "
          "paper texture, weathered leather, brass and heavy parchment, so handling the "
          "book and the lens feels like handling real antiques.",
          "Minimalist sticker-like character portraits: the people are flat, simple and "
          "charming in deliberate contrast to the detailed plants, which keeps the "
          "darker parts of the story approachable."],
        palette=dict(
          ground=["#1B1614 bitumen", "#2E2620 dark oak", "#4A3F35 leather",
                  "#6B6357 stone", "#8C8577 wet slate"],
          paper=["#E8DFC8 aged paper", "#CDBF9E foxed", "#A8946E ochre"],
          green=["#22301F deep forest", "#3D5236 moss", "#6E7F52 lichen"],
          accents=["#D94F2B ember", "#E8B830 lamp gold", "#3FA9B8 glass blue",
                   "#8E4FA8 spore violet", "#C4325C bloom pink"],
          note="Accents are for flowers, glowing marks, the egg and the dragon only. "
               "Nothing structural is ever an accent colour."),
        transparency=TRANSPARENCY[fmt],
        params=PARAMS[fmt],
        naming="Each item carries the filename the game will expect. Keep them.",
      ),
      sections=dict(
        plants=section("plants", main, extra=dict(
          note="82 specimens. The subject already carries every trait the puzzle depends "
               "on — colour, flower form, petal count, leaf, stem, berry and the odd "
               "mark — so do not paraphrase it. If a generated plate loses the "
               "distinguishing trait, regenerate; the trait is the gameplay.")),
        plants_book=section("plants_book", book, extra=dict(
          note="Optional second set: the line-drawn version for the book page, in the "
               "Strange Horticulture manner. Same 82 ids. Colour words are stripped from "
               "these subjects on purpose.")),
        people=section("people", PEOPLE and [dict(p, filename="person_%s.png" % p["id"])
                                             for p in PEOPLE], extra=dict(
          note="Six recurring customers plus two extras. Nobody else ever stands at the "
               "counter, so these eight are the whole cast.")),
        locations=section("locations", location_items(), extra=dict(
          note="Seventeen places on the map, plus three bonus views. Four of them change "
               "during the story and carry a phases list; the game already treats the "
               "burnt moor, the drained tarn and the broken pike as separate places, so "
               "the 'after' phase and that separate location can be the same picture.")),
        story=section("story", story_items(), extra=dict(
          note="Three opening panels, sixteen evening cards and the three endings, in "
               "the order you meet them. These are the only images with narrative in "
               "them. The nine codas — the one-line postscripts on the last screen "
               "about whether Tom knew, whether you lied to the Warden, whether you "
               "went up the crags — are deliberately text only; they are listed in "
               "codas_no_art if you decide you want vignettes for them.",
          codas_no_art=[dict(flag=c["flag"], text=c["text"]) for c in CODAS])),
        assets=section("assets", asset_items(), size="varies", ar="varies", extra=dict(
          note="Each asset carries its own size and aspect ratio, and says whether it "
               "needs to be cut out. The map background is deliberately not decided — "
               "map_paper is the blank chart the drawn map sits on if you want one.")),
      ))
    return doc

for fmt in ("flux2", "krea"):
    path = os.path.join(OUT, "ART_PROMPTS.%s.json" % fmt)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(build(fmt), f, ensure_ascii=False, indent=2)
    print(path, os.path.getsize(path), "bytes")
