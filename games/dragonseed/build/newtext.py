# -*- coding: utf-8 -*-
"""The simple story: who says what, in plain words. See STORY-SIMPLE.md.

Six people come back again and again. Every line is short. Nobody says more
than three sentences. The structure of the game — which plant answers which
request, who it is for, what each visitor hands over — is untouched; this file
only says who is standing there and what they say.

  W  Doctor Wren   the village doctor. People's medicine, always in a hurry.
  I  Ivo           the dragon farmer. Forty-one dragons and two boys.
  N  Nan           old, walks everywhere, knows where everything grows.
  C  Mrs Coyle     a dragon bit her hand when she was small. Frightened, not nasty.
  T  Tom           a boy your age. Runs messages. Nosy, then loyal.
  D  The Warden    came from the town about the dragon. Polite. Asks the hard one.
"""

WHO = {
  "wren":   ("Doctor Wren", "\U0001FA7A"),
  "ivo":    ("Ivo",         "\U0001F9D1‍\U0001F33E"),
  "nan":    ("Nan",         "\U0001F9F6"),
  "coyle":  ("Mrs Coyle",   "\U0001F9E3"),
  "tom":    ("Tom",         "\U0001F9D2"),
  "warden": ("The Warden",  "\U0001F575"),
  "egg":    ("The last hour", "\U0001F409"),
}

# id: dict(who=, line=, reply= or fork=[a,b])
V = {}

# ------------------------------------------------------------------ day 1
V["v_maren1"] = dict(who="tom",
  line="My little sister can't sleep. Four nights now. Have you got something for sleep?",
  reply="“Four nights,” he says. “She's cross about it too.” He runs off with it.")
V["v_corbin1"] = dict(who="ivo",
  line="Not for me. For Bess, my oldest dragon. Her eyes run all winter and she hates it.",
  reply="“A cold wet cloth on a dragon. You'd think she'd bite. She loves it.”")
V["v_pell1"] = dict(who="coyle",
  opener="My hands shake and I don't sleep well. Nothing strong.",
  reply="“That's the one. Sweet-smelling. I'll take two.”")
V["v_wren1"] = dict(who="wren",
  line="The miller is burning up. I need the thing that breaks a fever. Quickly, please.",
  reply="“Good. Quick, too. I was told you wouldn't be.”")
V["v_cook1"] = dict(who="nan",
  line="I ate something I shouldn't have and my stomach is sorry about it.",
  reply="“That'll do it. I used to walk home on that when I was your age.”")
V["v_marget1"] = dict(who="ivo",
  opener="One of my dragons caught my arm with a claw. Not her fault.",
  reply="“Clean and quick. Right. I'll have four.”")
V["v_ivo1"] = dict(who="ivo",
  line="Forty-one dragons in my yard and I know every one by the noise it makes. You'll see a lot of me.",
  reply=None)

# ------------------------------------------------------------------ day 2
V["v_nan2"] = dict(who="nan",
  line="Found these in your back room. Pages for your book, all from the fen. Somebody dropped them years ago.",
  reply="“A page tells you what a plant is. A pot is the plant. You need both.”")
V["v_tobias2"] = dict(who="tom",
  opener="I have to cross the moor tonight and I'd like to see where I'm going.",
  reply="“Brilliant. I'll bring it back. Probably.”")
V["v_elsie2"] = dict(who="nan",
  line="Not a cure. Something kind. My neighbour's dragon died and she is eleven years old.",
  reply="“That's exactly the difference, and most grown-ups don't know it.”")
V["v_ivo2"] = dict(who="ivo",
  line="My two boys had a fight over a hen. One of them has a cut on his arm.",
  reply="“Closes clean and quick. Right. I'll have four.”")
V["v_reeve2"] = dict(who="coyle",
  line="A dragon knocked my wall down again and its owner laughed. It is the man I want something for.",
  fork=["You hand her the berries. She looks at them, then at you. “Sweets,” she says. “You have been kind and made me look silly.”",
        "She puts it in her bag without looking. “Blisters. That will do.”"])
V["v_pell2"] = dict(who="coyle",
  line="One more thing. The damp in my back room. The whole wall has gone black.",
  reply="“Set it in the room and leave it. Simple as that.”")
V["v_nan2b"] = dict(who="nan",
  line="Here. My old map of the valley. Fourteen places marked on it. Start with Blackfen, at dawn, while the mist is on it.",
  reply="“You can't learn plants in a shop. Go and stand in the wet and look at them.”")

# ------------------------------------------------------------------ day 3
V["v_drawer3"] = dict(who="nan",
  line="A box of old paper. Notes, lists, bits of maps. People leave things in shops for a hundred years.",
  reply="You put the box in the drawer under the counter. Two of the notes are worth reading twice.")
V["v_grayce3"] = dict(who="tom",
  line="Mum says these were in our attic and they're no use to us. They're all pages about meadow plants.",
  reply="“She says you're to have them and not to pay for them.”")
V["v_wren3"] = dict(who="wren",
  line="A boy grabbed a hot pan. He is nine and he is being very brave about it.",
  reply="“At once, it says. It was at once.” He leaves a cutting on the counter. “One good turn.”")
V["v_vaile3"] = dict(who="nan",
  opener="The plain one. The first thing anybody learns, and I still can't pick it out.",
  reply="“Reliable and easy to find. There's no shame in the easy one.”")
V["v_wren3b"] = dict(who="wren",
  line="And a paste for his dad, in three parts. Something for the ache, something to close it, something for the burn.",
  reply="“That is the right paste, in the right order. Nobody taught you that, did they.”")
V["v_amos3"] = dict(who="tom",
  line="I'm on messages all night. Something to keep me going that isn't strong.",
  reply="“Two hours of feeling clever. That's all I want.”")
V["v_marget3"] = dict(who="coyle",
  line="Go west until you reach the sea, then north along the flats. There are plants out there and nothing else.",
  reply="“Mind the tide. It comes in faster than you can walk.”")

# ------------------------------------------------------------------ day 4
V["v_corbin4"] = dict(who="nan",
  line="My hands. It's the cold that does it. Nothing clever, just something for the ache.",
  reply="“The first thing anybody learns, that. So I'm told. By everyone.”")
V["v_ivo4"] = dict(who="ivo",
  line="A cart-dragon sneezed in the forge and took the smith's eyebrows off. It's the smith I'm here for.",
  reply="“Pressed to a burn. And the smith?” “The smith is being very brave about it.”")
V["v_elsie4"] = dict(who="tom",
  opener="For me this time. I've been up since five and I've still got the post to do.",
  reply="“Two hours of feeling clever. Ta.”")
V["v_thea4"] = dict(who="coyle",
  line="Something for over the barn door. The cow's off her milk and the dragons won't go in.",
  reply="“It can't hurt and it might help, and that's most of medicine.”")
V["v_gilbert4"] = dict(who="nan",
  line="I'm ninety-one and I still walk down here. Here — these pages came with my last lot and I can't read them any more.",
  reply="“All the river, those. Take them. I've had my use out of them.”")
V["v_grayce4"] = dict(who="ivo",
  line="My old dragon has started stopping halfway up the yard. Her heart is tired.",
  reply="“She got to the top today. Took her a while. She was pleased with herself.”")
V["v_shepherd4"] = dict(who="tom",
  line="Something went over the moor last night. It was the size of a barn and it didn't flap. It just went.",
  reply=None)

# ------------------------------------------------------------------ day 5
V["v_reeve5"] = dict(who="coyle",
  line="If you're after the sheltered ground, it's south past the last field until the walls close in.",
  reply="“I don't like sending anybody out there. But you'll go anyway.”")
V["v_vaile5"] = dict(who="nan",
  line="Pages for the wood. I've had them a long time and they were never really mine.",
  reply="“Somebody wrote all this down so you wouldn't have to. Use it.”")
V["v_marget5"] = dict(who="coyle",
  line="Something that turns a big animal away from a field. I don't want it hurt. I want it gone.",
  reply="“Thank you. I know what you think of me. You're wrong, but I know.”")
V["v_anne5"] = dict(who="ivo",
  opener="One of mine tore a wing on the wire. It needs holding together while it mends.",
  reply="“She'll be flying by Sunday. Grumbling, but flying.”")
V["v_wren5"] = dict(who="wren",
  line="The smith's foot. It's two weeks of this at least and he can't sit still for two weeks.",
  reply="“The plain one. The thing I ask for most.”")
V["v_amos5"] = dict(who="tom",
  line="I've got to sit up all night with the horses and I mustn't fall asleep.",
  reply="“Wide awake till morning. Don't tell my mum.”")
V["v_pell5"] = dict(who="ivo",
  line="One of my dragons has a chest on her. Coughing since Tuesday. Nothing made for people, mind.",
  reply="“A dragon's chest is not a man's chest. You knew that. Good.”")
V["v_nan5"] = dict(who="nan",
  line="The high tops, west of the sharp peak. Go up until the grass gives out, and take something warm.",
  reply="“Cold up there. The kind that kills. Don't be brave about it.”")

# ------------------------------------------------------------------ day 6
V["v_wren6"] = dict(who="wren",
  line="Three men off the moor with burns. One paste, three parts: the burn, the ache, and their nerves.",
  reply="“Right order. You're getting quick at this.”")
V["v_thea6"] = dict(who="nan",
  line="I'm going up on the tops tomorrow and it will be cold enough to kill a man.",
  reply="“Warm all the way up and all the way down. Good.”")
V["v_shepherd6"] = dict(who="tom",
  line="I went up to look where the fire started and I brought this back. Nobody's laughing at me today.",
  reply="“Burnt ground grows things that won't grow anywhere else. Go and look.”")
V["v_ivo6"] = dict(who="ivo",
  line="One of my old ones is dying and there's nothing to be done. Something kind. That's all.",
  reply="“Not a cure. I know. Kind will do.”")
V["v_pell6"] = dict(who="ivo",
  opener="A dragon that has eaten something it shouldn't and can't shift it.",
  reply="“Shifted. I'll say no more about it.”")
V["v_amos6"] = dict(who="ivo",
  line="Smoke in the yard all afternoon. Every dragon I own has sore eyes.",
  reply="“Cools them right down. Forty-one pairs of eyes, mind.”")
V["v_wren6b"] = dict(who="wren",
  opener="And one for the jar with the red label. Three men have grabbed a handful of it in the dark this week.",
  reply="“Red label. Nobody touches it. That's the point of the red label.”")
V["v_warden6"] = dict(who="warden",
  line="Forty acres burnt. No lightning, no campfire, nobody up there. I am asking everyone the same question and you may as well have it first.",
  reply=None)

# ------------------------------------------------------------------ day 7
V["v_bram7"] = dict(who="tom",
  line="Parcel for the shop, six weeks late, and it's paid for. Somebody ordered pages from the coast.",
  reply="“Damp moss and three cuttings. Still alive, somehow.”")
V["v_corbin7"] = dict(who="nan",
  line="I've gone deaf in one ear and I want to hear the birds again, just for a day.",
  reply="“A drop in the ear. I could hear the river. Lovely.”")
V["v_faye7"] = dict(who="tom",
  line="I keep seeing something at the edge of the field at night. You can quiet that, or you can sharpen it. Your choice, not mine.",
  fork=["“Quiet, then.” He sleeps that night, and says nothing more about it for a week.",
        "“Sharper it is.” He comes back the next morning white as a sheet and will not say why."])
V["v_marget7"] = dict(who="coyle",
  line="Scattered on a path, so nothing walks up it that shouldn't. For the school lane, and I won't be argued with.",
  reply="“The school lane. That's all I'll say.”")
V["v_tobias7"] = dict(who="tom",
  opener="Something to see by, without a lamp. Lamps get you noticed.",
  reply="“Starlight is enough. Who knew.”")
V["v_cook7"] = dict(who="nan",
  opener="My sister's wedding is Sunday and I've nothing to give her.",
  reply="“Warms what's already there, that one. It won't make anything that isn't.”")
V["v_ruth7"] = dict(who="coyle",
  line="Purple, and it mustn't wash out. Forty yards of wool and two weeks, and now everyone wants black.",
  reply="“It will not wash out. I have tried.”")
V["v_ivo7"] = dict(who="ivo",
  line="Collars, numbers, and a shed to keep them in. Do you know what a collar does to a dragon that flies? Mrs Coyle knows. She wrote it.",
  reply=None)

# ------------------------------------------------------------------ day 8
V["v_nan8"] = dict(who="nan",
  line="I was out on that mud at six this morning before anybody else thought of it. Look what grows down there.",
  reply="“Sixty years I've wanted to see the bottom of that lake. Worth getting up for.”")
V["v_wren8"] = dict(who="wren",
  line="Half the village went paddling in the lake bed and about a third of them drank it. Guess what I've got.",
  reply="“Sour stomachs all the way down the square. Thank you.”")
V["v_faye8"] = dict(who="tom",
  line="I'm going out to look at the lake bed at night and I'd rather not carry a lamp.",
  reply="“Saw the whole thing by starlight. It's like a room with the roof off.”")
V["v_masked8"] = dict(who="coyle",
  opener="For over my door. And don't ask me what for.",
  reply="“Bad luck outside, where it belongs.”")
V["v_ivo8"] = dict(who="ivo",
  line="Three for the yard, all for dragons. One to settle them, one for the two that have stopped eating, one for the one that can't shift what she ate.",
  reply="“All three. You're the only shop in the valley that knows dragons aren't people.”")
V["v_thea8"] = dict(who="ivo",
  line="One of mine is sitting on nothing, like she's brooding, and there's nothing under her. Get her up.",
  reply="“Up she got. Sulking. But up.”")
V["v_reeve8"] = dict(who="wren",
  line="A man is ill and I think somebody made him ill. I need to know without asking out loud.",
  reply="“It went black. So I was right and I wish I hadn't been.”")
V["v_warden8"] = dict(who="warden",
  line="A lake. I have written down that a lake is missing and I had to read it back to myself twice.",
  reply=None)

# ------------------------------------------------------------------ day 9
V["v_wren9"] = dict(who="wren",
  line="A rider came off badly. Three things: the ache, closing it, and something so he feels nothing at all.",
  reply="“He'll keep the arm. He would not have kept it yesterday.”")
V["v_tobias9"] = dict(who="tom",
  line="Tom drew what he saw with his left hand because the right one is strapped up. He wants you to keep it.",
  reply="“Everyone keeps telling me what I saw. None of them were there.”")
V["v_vaile9"] = dict(who="nan",
  line="Churchyard pages. All of them. And I'd like you to write down the day I gave them to you.",
  reply="“Old ground, that. Things grow there that grow nowhere else.”")
V["v_thea9"] = dict(who="coyle",
  line="Something to turn away what shouldn't be in a house. I know how that sounds.",
  reply="“Burnt on the doorstep. It helps. Don't tell me it doesn't.”")
V["v_althea9"] = dict(who="wren",
  opener="For the rider. Something that stops pain completely, and the feeling with it.",
  reply="“He slept through the whole thing. Small mercy.”")
V["v_lorena9"] = dict(who="nan",
  opener="My sister's wedding, and it has to be this one. Wrap it twice — it smells terrible.",
  reply="You wrap it twice. She is glad of the second layer.")
V["v_maren9"] = dict(who="tom",
  line="My sister's not sleeping again. She keeps saying there's something outside.",
  reply="“She slept. I didn't much.”")
V["v_amos9b"] = dict(who="nan",
  line="The sharp peak in the north, east of the white crags. Everybody's been up there looking and nobody's looked properly.",
  reply="“It's a long climb over loose stones. Don't go after a day's work.”")

# ------------------------------------------------------------------ day 10
V["v_bram10"] = dict(who="ivo",
  line="Listen. My dragons lay six eggs a year. A glass dragon lays one egg. One, in her whole life.",
  reply="“So if somebody has a glass egg, then somewhere there is a mother looking for it. And she will not stop.”")
V["v_wren10"] = dict(who="wren",
  line="Somebody's been bitten and there's poison in it. I need it drawn back out.",
  reply="“Out it came. Ugly business. Thank you.”")
V["v_warden10"] = dict(who="warden",
  opener="This was in the burnt ground. I want it in a pot with a label on, in your shop, where I can find it again.",
  reply="“Beautiful, isn't it,” he says, and his face does not move at all.")
V["v_constance10"] = dict(who="coyle",
  line="Two ways to do this. The kind one, or the other one. I have not decided and I would like you to decide for me.",
  fork=["“The kind one. Right.” She takes it and looks relieved and pretends she isn't.",
        "She takes it without a word and you both know exactly what it is for."])
V["v_marget10"] = dict(who="coyle",
  line="Held over turned earth it shows what's underneath. I want to know what she's been digging for.",
  reply="“Nothing. She's digging and taking nothing. What does that mean?”")
V["v_constance10b"] = dict(who="nan",
  line="Due east of the town, below the mounds, where the ground opens up. That's the way she went.",
  reply="“Take a light. It's dark before you're ten steps in.”")
V["v_vaile10"] = dict(who="coyle",
  opener="Off the churchyard wall, and burnt — not on the heap, burnt, tonight, and I'll watch you do it.",
  reply="“Gone. Good. Some things you don't keep in a shop.”")
V["v_ivo10"] = dict(who="ivo",
  line="One egg. Once, in a whole life. I keep saying it and it keeps sounding worse.",
  reply=None)

# ------------------------------------------------------------------ day 11
V["v_nan11"] = dict(who="nan",
  line="She's opened three of the old mounds and taken nothing out of them. Nothing. I went up at first light because somebody had to.",
  reply="“She's not robbing them. She's looking under them.”")
V["v_constance11"] = dict(who="wren",
  line="Somebody in this village has been taking things from my bag. I want to know who.",
  reply="“It points at one person. I haven't decided what to do about it yet.”")
V["v_masked11"] = dict(who="tom",
  line="This was behind a loose brick in your back room. I didn't put it there. Neither did you.",
  reply="“Somebody's been keeping notes about this shop for a long time.”")
V["v_lorena11"] = dict(who="nan",
  line="My mum and dad have been married forty years on Sunday. Something for that.",
  reply="“It makes a promise stronger. That's all I'm asking of it.”")
V["v_amos11"] = dict(who="warden",
  line="Somebody is lying to me and there is a locked box I would like opened. Both, if you can.",
  reply="“Useful. Uncomfortable. Thank you.”")
V["v_grayce11"] = dict(who="tom",
  opener="My gran's eyes are sore and she won't come out in this wind.",
  reply="“Better already. She says thanks and to stop growing.”")
V["v_bram11b"] = dict(who="ivo",
  line="South-east, one field past the church. There's a walled garden nobody has tended for years and the gate is off.",
  reply="“Things grow behind walls that don't grow anywhere else. That's walls for you.”")
V["v_warden11"] = dict(who="warden",
  line="Nothing today.",
  reply=None)

# ------------------------------------------------------------------ day 12
V["v_wren12"] = dict(who="wren",
  line="A woman is convinced she's been cursed and she's making herself ill with it. Something to lift it.",
  reply="“She got up and made her own tea. That's what curses are.”")
V["v_reeve12"] = dict(who="coyle",
  line="That business with my wall again. Two weeks I've thought about it. Help me forget it, or help me let it go.",
  fork=["“Gone. The whole thing.” She looks lighter and slightly frightened of you.",
        "“Still there. Just — smaller.” She nods once and goes."])
V["v_anne12"] = dict(who="ivo",
  line="A dragon has got herself tangled in old wire and I can't cut it. Something that cuts what binds.",
  reply="“Off in one go. She was very rude about it.”")
V["v_bram12"] = dict(who="warden",
  line="I have too many things in my head and I keep losing the one that matters. One afternoon of holding a single thought.",
  reply="“One afternoon. I wrote four pages. Most of them are wrong, but they're mine.”")
V["v_faye12"] = dict(who="tom",
  line="I saw something on Tuesday night and now I can't get it back. It's gone slippery in my head.",
  reply="“It came back all at once. I wish it hadn't.”")
V["v_marget12"] = dict(who="coyle",
  line="I'll say it plainly, since you'll make me ask twice. Something that would knock a dragon senseless.",
  reply=None)
V["v_warden12b"] = dict(who="warden",
  opener="The one from the lake bed. Not the pretty one — I have that. This is the other one.",
  reply="“Side by side on my desk. One of them is a warning and one of them is a lie.”")
V["v_warden12"] = dict(who="warden",
  line="I'll ask you the straight question, then. Is there anything in this building I ought to know about?",
  reply=None)

# ------------------------------------------------------------------ day 13
V["v_bell13"] = dict(who="tom",
  line="Mrs Coyle says put one of these in every shop. She says especially yours.",
  reply="“Saturday. First light. Everyone who has a bow.”")
V["v_marget13"] = dict(who="coyle",
  line="Forty men on the crags before dawn on Saturday. Something to get them up there, keep them warm, and keep them awake.",
  reply="“Thank you. I know what this costs you. I've watched your face for two weeks.”")
V["v_ivo13b"] = dict(who="ivo",
  line="Two of mine have gone out. Just — out, like a lamp, and they're sitting in the straw being ashamed of it.",
  reply="“Lit again by teatime. Both of them showing off.”")
V["v_ivo13"] = dict(who="ivo",
  line="I'm going up before they do. I'm not going to do anything. I just want to see her without being seen.",
  reply="“Nobody saw me. I saw her. She's not hunting anything.”")
V["v_vaile13"] = dict(who="nan",
  line="Something for the old stone up the lane, tonight. We've done it for a hundred years and I'm not stopping now.",
  reply="“What answers is another matter,” she says, and she is not joking.")
V["v_corbin13"] = dict(who="tom",
  opener="Something lucky. It's for the whole thing on Saturday and I'm not allowed to go.",
  reply="“Turns your luck a bit. Better than nothing.”")
V["v_wren13"] = dict(who="wren",
  line="A grave, laid tonight. It's for the family, not for the man in it.",
  reply="“They stood in the rain and they were glad of it.”")
V["v_masked13"] = dict(who="nan",
  line="Somebody hid something in this valley a long time ago, and I am starting to think it was hidden three times.",
  reply=None)

# ------------------------------------------------------------------ day 14
V["v_nan14"] = dict(who="nan",
  line="Pages for the pike, before the whole village tramples it on Saturday. Take them.",
  reply="“Somebody ought to get some good out of tomorrow.”")
V["v_vaile14"] = dict(who="nan",
  line="Three things for tonight. One for the ground, one for the doorstep, and a light to do it by.",
  reply="“It is not a funeral, whatever the village thinks. It is asking politely.”")
V["v_marget14"] = dict(who="coyle",
  line="The strongest thing you have. I am not going to use it. I want to know it is in the valley.",
  reply="She takes the no without a word, which frightens you more than the asking did.")
V["v_ivo14"] = dict(who="ivo",
  line="I've already decided what I'm doing tomorrow. I'd just like to be steadier about it than I am.",
  reply="“Steady enough. That'll do.”")
V["v_constance14"] = dict(who="nan",
  opener="Growing through the wall of the old garden, and it glows, and I know how that sounds.",
  reply="“Wakes a sleeping thing, that one. Careful what you wake.”")
V["v_wren14"] = dict(who="wren",
  line="My own teeth. It has been that sort of a week and I have been grinding them to nothing.",
  reply="“Hard as new. Now I only have the rest of it to worry about.”")
V["v_warden14b"] = dict(who="warden",
  opener="The pretty one that turns wanting a thing into something worse. I've asked in every shop in the valley.",
  reply="“There. Now I know where it is, and so do you.”")
V["v_warden14"] = dict(who="warden",
  line="Saturday. I can stop the hunt for one day, or I can go with them and keep it orderly. Give me the thing that fits whichever you think I should do.",
  fork=["“One day, then.” He stands the hunt down and gets shouted at in the square for it.",
        "“I'll ride with them.” He goes, and because he goes, nobody does anything stupid."])

# ------------------------------------------------------------------ day 15
V["v_nan15"] = dict(who="nan",
  line="Half the pike came off in the night. There's a way down into the crack from the north side and I've been as far as the second ledge.",
  reply="“Things down there that have never been rained on. Go carefully.”")
V["v_till15"] = dict(who="tom",
  line="This was under the till drawer, folded in four. It's got your name on it.",
  reply="“Whoever wrote it knew somebody would find it in the first two weeks or never.”")
V["v_wren15"] = dict(who="wren",
  line="A man fell into the crack and came out again. Three things: close it, cool it, and stop him feeling it.",
  reply="“Alive, patched, and asleep. In that order, thanks to you.”")
V["v_amos15"] = dict(who="tom",
  line="Something bright. Really bright. Bright enough to hurt to look at.",
  reply="“I could see my own shadow on the clouds.”")
V["v_maren15"] = dict(who="coyle",
  line="I can't stop shaking and tomorrow is Saturday. Nothing that dulls me. I want my wits.",
  reply="“Steady. Thank you. Wits and all.”")
V["v_masked15"] = dict(who="warden",
  opener="The one there's no coming back from. I don't want to buy it. I want to know you have it, and where.",
  reply="“Locked. Labelled. Written down. Good.”")
V["v_ivo15"] = dict(who="ivo",
  opener="You know the one. It grew back thicker where it killed the Hallam boy's dog.",
  reply="“Burn the gloves after. I mean it.”")
V["v_constance15"] = dict(who="ivo",
  line="If a dragon is sleeping and will not wake, this is what wakes it. I hope you never need it.",
  reply="“Wakes a sleeping dragon. Remember where you put it.”")

# ------------------------------------------------------------------ day 16
V["v_wren16"] = dict(who="wren",
  line="Half the village walked up a mountain yesterday and every one of them aches. Something plain.",
  reply="“Plain and quick. It has been a long two weeks.”")
V["v_ivo16"] = dict(who="ivo",
  line="I got as close as the second cairn and there's a plant up there that does not like being trodden on.",
  reply="“Itches like anything. Worth it.”")
V["v_marget16"] = dict(who="coyle",
  line="I need to be braver than I am for about an hour. That is all I am asking.",
  reply="“An hour. Right. That should be enough.”")
V["v_bram16"] = dict(who="warden",
  line="Three things, and then I'll leave you alone. Where it is, whose it is, and enough light to see it by.",
  reply="“I have written down what I found. I have not written down where I found it.”")
V["v_vaile16"] = dict(who="nan",
  line="One in every window in the valley tonight. All of us. It's the oldest thing we do.",
  reply="“You could see the whole village from the top. Every window lit.”")
V["v_marget16b"] = dict(who="coyle",
  line="The last thing I will ever ask you for, and you already know what it is. Something that would knock her down.",
  reply="You do not give it to her. She takes the no without a word, which frightens you more than the asking did.")
V["v_warden16"] = dict(who="warden",
  line="I am going to stand in your shop and look out of your window for a while, and then I am going to go home.",
  reply=None)
V["v_ending16"] = dict(who="egg",
  line="She is on the top and she has not moved since Thursday. The baby is in the log basket and it is awake. Everybody who wants it is in the square. You can carry it up the hill, or you can put something else in the basket and keep it.",
  fork=["You take the basket up the hill in front of the whole village, and nobody stops you, and forty men with bows stand aside.",
        "Nobody notices. You go out the back with it under your coat and you are three fields away before the square works out the shop is empty."])
