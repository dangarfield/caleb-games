# -*- coding: utf-8 -*-
"""The opening, and the night between one day and the next.

PROLOGUE is what day one opens on, before the counter: three panels that say
where you are, what the shop is, and that you are about to have to learn the
job in front of people. You press through them and the bell goes.

An EVENING is one card between the last customer and the next morning. The
evenings are the egg. Some of them ask it for something, which is the same
verb as serving a customer, pointed at the thing under your floor: pick a
plant you can name and give it. Getting it wrong fails nothing. It makes for
a long night.

Every line in here is short on purpose. See STORY-SIMPLE.md.

Fields
  day    the day that has just ended
  title  the heading
  body   the scene, two or three short sentences
  letter a piece of writing rendered as paper, when there is one
  quote  a line from the book
  egg    { needs, ok, wrong } - a thing the egg wants tonight
  choice { prompt, options:[{label, flag, reply}] } - two ways, no right answer
"""

PROLOGUE = [
 dict(title="The valley",
      body="Four hundred people live here, and rather more dragons than that.\n\n"
           "They are not wild and they are not magic. One sleeps in the grate and eats "
           "what the cat won't. One pulls the brewer's cart up the hill twice a day and "
           "grumbles about it. Everybody has one. Everybody complains about theirs. "
           "About a third of the people who come into this shop are here for something "
           "for the dragon, not for themselves."),
 dict(title="Your shop",
      body="You keep the plant shop on the square. Two hundred pots with labels on, a "
           "counter worn into a dip where people lean, and a book.\n\n"
           "Somebody wrote the book a long time ago. Every plant has a page: what it "
           "looks like, and what it is for. The trouble is that the book has got ahead "
           "of the shelf. There are pages in there for plants you have never had, and "
           "pots on the shelf with nothing to match them to.",
      quote="A page tells you what it is. A pot is the plant."),
 dict(title="Friday",
      body="You open at nine. You know six plants well enough to hand them over with a "
           "straight face, and you are going to have to learn the rest in front of "
           "people.\n\nThe bell over the door needs oiling. It goes anyway."),
]


def E(day, title, body, letter=None, choice=None, quote=None, egg=None):
    d = dict(day=day, title=title, body=body)
    if letter: d["letter"] = letter
    if choice: d["choice"] = choice
    if quote:  d["quote"]  = quote
    if egg:    d["egg"]    = egg
    return d

def C(prompt, a, b):
    return dict(prompt=prompt,
                options=[dict(label=a[0], flag=a[1], reply=a[2]),
                         dict(label=b[0], flag=b[1], reply=b[2])])

def EGG(needs, asks, ok, wrong):
    """`asks` is the sentence that says what the thing in the cellar is doing
    tonight. Without it the panel said only "It wants something", which reads
    as if the news about the moor wants something. It is the egg that wants
    something, and after day twelve it is not an egg any more."""
    return dict(needs=needs, asks=asks, ok=ok, wrong=wrong)


EVENINGS = [

E(1, "The cellar",
  "You go down for coal, because the fire has gone out. The coal is stacked against the "
  "far wall the way it always is. In front of it, under a blanket, is something the size "
  "of a sheep.\n\nIt is warm. You can nearly see through it. No dragon in this valley "
  "laid that.",
  quote="Used to wake a thing that is sleeping."),

E(2, "Something over the moor",
  "The shepherd from the top farm says something went over the moor at dusk, and that it "
  "was the size of a barn. Everybody in the shop laughed at him.\n\nHe is not a man who "
  "makes things up, and everybody laughed anyway.",
  egg=EGG("comfort",
          "Down in the cellar the egg will not settle. It has been shifting in the sand since the light went.",
          "It goes quiet within the hour and stays quiet all night.",
          "It will not settle. You sit on the cellar step until two in the morning.")),

E(3, "A box of old paper",
  "Nan's box is on the counter: notes, lists, torn pages and one dead wasp. People have "
  "been leaving things in this shop for a hundred years.\n\nThe egg was cold when you "
  "went down this morning and warm again by lunchtime. You do not know why either of "
  "those things happened."),

E(4, "The moor is burning",
  "It burned all afternoon and you could see it from the square. Nobody was hurt. The "
  "moor is ash up to your ankles and the wind is bringing it into the shop.\n\nSomething "
  "is looking for something, and it is not finding it.",
  egg=EGG("sleep",
          "The egg is humming. Whatever it can hear out on the burnt moor, it has been hearing it all evening.",
          "Whatever it can hear, it stops hearing. It sleeps.",
          "It shifts about all night, and twice you hear it turn over.")),

E(5, "A burnt sheep",
  "Up on the hill, and not eaten. Burnt, and left where it fell. Half the village has "
  "walked up to look at it.\n\nMrs Coyle asked you today, very politely, for something "
  "that would keep a big animal out of a field. She was frightened. She was not nasty "
  "about it."),

E(6, "One egg, ever",
  "Ivo said it out loud at the counter with two other people listening. A dragon like "
  "his lays six eggs a year. A glass dragon lays one egg. One, in her whole life.\n\n"
  "So the thing in your cellar has a mother. She is looking for it. She will not stop.",
  egg=EGG("fever",
          "The egg has gone cold. You put your hand flat on it and there is nothing coming back.",
          "It is too hot to touch by ten and cool again by midnight.",
          "It stays too hot to touch, and in the morning the sand under it has turned "
          "to glass.")),

E(7, "Tom on the stairs",
  "Tom came round the back for a bag of feed and got two steps down the cellar before "
  "you got in front of him. You have no idea what your face did.\n\nHe did not say "
  "anything. He talked about the weather, and Tom does not talk about the weather.",
  choice=C("He knows you are hiding something. He does not know what.",
           ("Tell him", "told_tom",
            "You tell him. He sits down hard on the step and says, very quietly, that "
            "this is the best day of his entire life."),
           ("Send him home", "kept_secret",
            "You let him go thinking whatever he is thinking. He is careful with you all "
            "week, and that is worse than being asked."))),

E(8, "The lake is empty",
  "Forty feet of black water, gone in one night. There is a lake-shaped hole in the moor "
  "with a floor of grey mud.\n\nShe is looking underneath everything now. That is what "
  "people are saying out loud in the street.",
  egg=EGG("gut",
          "The egg has taken something up off the cellar floor, and you can hear it grinding down there.",
          "Whatever it swallowed comes back up on the cellar floor. It is a nail.",
          "It will not settle, and you do not find out why until Thursday.")),

E(9, "The Warden",
  "A man came in on the coach from town with a notebook and very good manners. He is "
  "asking everybody the same question.\n\nHe starts at the top of the square in the "
  "morning and works his way down. Your shop is halfway.",
  letter="Something very large is breaking this valley up, and I have been sent to find "
         "out why. I shall ask everyone the same question and write down what they say. "
         "Have you seen anything you cannot explain? — the Warden"),

E(10, "It rocks",
  "Not much. Twice, like a boat, and then nothing for an hour, and then again.\n\nNan "
  "says eggs hatch when they are ready and not before, and that nobody has ever hurried "
  "one along.",
  egg=EGG("comfort",
          "The egg is rocking, and it does not stop when you put your hand on it.",
          "You do the thing you would do for any frightened animal, and it works.",
          "You try three things. None of them is the thing."),
  quote="Given as a kindness rather than a cure."),

E(11, "He asks you straight out",
  "The Warden waited until the shop was empty. Then he asked you, in a perfectly kind "
  "voice, whether there is anything in this building he ought to know about.\n\nHe has "
  "a pencil in his hand. He is not writing yet.",
  choice=C("He is waiting. He will wait all day if he has to.",
           ("Tell him the truth", "told_warden",
            "He writes it down. He does not shout, or arrest you, or look at all "
            "surprised. He says: “Thank you. That makes Saturday very difficult.”"),
           ("Say there is nothing", "lied_warden",
            "It is easier than you expected, and that is the part you keep thinking "
            "about afterwards."))),

E(12, "It hatches",
  "Two in the morning, and no fuss at all. The shell comes apart like a nut and there it "
  "is, the size of a cat, wet and cross and warm.\n\nIt looks at you for a long time. "
  "Then it climbs inside your coat and goes to sleep."),

E(13, "The village votes",
  "They met in the church tonight and voted to drive her off. It was not close. Mrs "
  "Coyle made the case so well that you found yourself nodding along.\n\nThey are "
  "getting everything they need from your counter. There is no other counter.",
  egg=EGG("rousing",
          "It has not eaten since yesterday. It lies in your coat with its eyes half shut and will not be moved.",
          "It eats, tears round the back room for an hour, and then sleeps "
                     "like a stone.",
          "It will not eat and it will not settle, and it cries, which you did not know "
          "it could do.")),

E(14, "She is closer",
  "She is on the top of the crags and she has not moved all day. Two weeks of turning "
  "the valley over and she has run out of valley.\n\nThe baby cried half the night and "
  "she came a mile nearer. You have to settle it.",
  letter="SATURDAY. First light, from the church. Everyone who can walk. The plant shop "
         "will make up what we need. — M. COYLE",
  egg=EGG("comfort",
          "It is crying, and every time it cries she comes a mile nearer. You have to settle it.",
          "It stops. It tucks its head under your arm and it stops.",
          "It cries until four, and somewhere out on the moor something answers it.")),

E(15, "The crags",
  "Four miles, and the moon is up, and the hunt is at first light.\n\nYou could walk up "
  "there tonight. Nobody would ever know you had gone.",
  choice=C("Go up and see her, or stay in and get ready.",
           ("Go up", "went_up",
            "You get within a hundred yards. She is enormous, and she is not angry. She "
            "is looking. You come back down with your heart going like a bird's."),
           ("Stay in", "stayed_down",
            "You make up everything they asked for and set it out on the counter in a "
            "row, and look at it for a long time."))),

E(16, "After",
  "Whatever you decided, the lamp is lit in the window at midnight and the shop opens at "
  "nine, because that is when it opens."),
]
