# -*- coding: utf-8 -*-
"""The last screen: what the sixteen days added up to.

An ENDING is chosen by the fork in the last hour of day sixteen. A CODA is one
extra line, printed when its flag is set — the small things you decided on the
way that the last screen ought to remember. Short words. See STORY-SIMPLE.md.
"""

ENDINGS = [
  dict(flag="end_return", title="You gave her back her egg.",
       body="You carried the basket up the hill with the whole village watching, and the "
            "men with bows stood aside, because nobody had told them what to do about a "
            "child with a basket.\n\nShe came down off the top to meet you. The light of "
            "her went through the crowd like a lamp through paper. She picked the baby up "
            "the way a cat picks up a kitten, and she was gone before the church clock had "
            "finished striking.\n\nThe shop opens at nine. Everybody still comes in and "
            "asks you about it, and you tell them, and none of them quite believe it."),
  dict(flag="end_keep", title="You kept it.",
       body="Out the back with it under your coat, and three fields away before anybody "
            "noticed the shop was empty.\n\nIt grows up knowing you, and only you, which "
            "is the whole trouble: it will know you for eighty years. Somewhere behind you "
            "a glass dragon is still looking, and she will never stop, because that is the "
            "thing about mothers.\n\nThe shop stays shut. You are not sorry yet."),
  dict(flag="", title="The last hour went by and you did nothing.",
       body="The basket stayed where it was. The square filled up and emptied again. She "
            "was on the top of the crags until dark, and then she was not.\n\nThe shop is "
            "still yours. There is a warm thing in your cellar and no plan at all for what "
            "to do about it."),
]

CODAS = [
  dict(flag="told_tom",      text="You told Tom, and he never told anybody, not even after. "
                                  "He still brings the post."),
  dict(flag="kept_secret",   text="Tom never found out. He still comes round the back on "
                                  "Thursdays and asks how you are, and you answer him."),
  dict(flag="lied_warden",   text="You looked the Warden in the face and lied, and he wrote "
                                  "it down as true and thanked you for it."),
  dict(flag="told_warden",   text="You told the Warden the truth when you did not have to. "
                                  "He never used it against you."),
  dict(flag="went_up",       text="You went up the crags on your own on the Friday night and "
                                  "stood close enough to hear her breathe. Nobody believes "
                                  "that part."),
  dict(flag="warden_delay",  text="The hunt stood down for a day because you told the Warden "
                                  "to stop it, and a day turned out to be exactly enough."),
  dict(flag="warden_ride",   text="The Warden went up the hill with them because you told him "
                                  "to. Nobody was hurt. It was close."),
  dict(flag="offering_shut", text="You gave Mrs Coyle the unkind one. She used it, and she "
                                  "has never once mentioned it to you."),
  dict(flag="reeve_cruel",   text="The man who laughed at Mrs Coyle's wall had blistered "
                                  "hands for a week. He tips his hat to you in the street."),
]
