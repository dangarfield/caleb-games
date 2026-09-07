# Dragonseed

**Status: built.** This is the story as it ships, in the simple form agreed in
`STORY-SIMPLE.md`. The sixteen days are in `build/days.py`, every word anybody
says is in `build/newtext.py`, the evenings and the opening panels are in
`build/evenings.py`, the notes in `build/papers.py`, the last screen in
`build/endings.py` — and `build/validate.py` proves the whole thing playable,
including that no customer ever asks for something you cannot get.

---

## The whole thing in four sentences

You keep the plant shop in a valley where everybody has a dragon.
One night you find a warm, shiny egg in your cellar.
A very big dragon is looking for it, and the village wants her driven away.
You have sixteen days to decide what to do with the egg.

## The world

Four hundred people, and rather more dragons than that. They are not wild and
they are not magic: one sleeps in the grate and eats what the cat won't, one
pulls the brewer's cart up the hill and grumbles about it. Everybody has one.
About a third of the people at your counter want something for the dragon
rather than for themselves, and nobody remarks on it.

**The shop is simply yours.** Nobody died, there is no inheritance to explain
and no relative to remember. **The book is simply your book** — somebody wrote
the pages a long time ago and you do not need to know who. When a page turns up
in a drawer, it is a page you did not have yet.

## Six people

Everyone at the counter is one of six, so by day four you know them all.

| | who they are | what they want |
|---|---|---|
| **Ivo** | Dragon farmer. Forty-one dragons, and he knows every one by its noise. | His dragons well. Later: the big dragon left alone. |
| **Doctor Wren** | The village doctor. | Medicine for people, quickly. |
| **Nan** | Old, walks everywhere, has been up every hill in the valley. | You out of the shop and up a hill. Gives you the map and the notes. |
| **Mrs Coyle** | A dragon bit her hand when she was small. | The big dragon gone. Frightened, not nasty. |
| **Tom** | A boy your age. Runs messages, works at the forge. | To know what you are hiding. Then to help. |
| **The Warden** | Sent from the town about the dragon. | The truth, written down. |

Visits: Nan 27, Ivo 24, Tom 21, Mrs Coyle 21, Doctor Wren 17, the Warden 13,
and one last hour on day sixteen. Two more characters never stand at the
counter: **the big dragon**, who is made of something like glass and never once
attacks anybody, and **the baby**, which is in the egg for eleven days and then
is out, the size of a cat, and knows you.

## Sixteen days

| day | what happens |
|---|---|
| 1 | You open the shop. That night, the cellar. |
| 2 | Nan gives you the map. Something went over the moor at dusk. |
| 3 | A box of old paper. The egg was cold this morning and warm by noon. |
| 4 | The moor burns. Nobody is hurt. |
| 5 | A sheep on the hill, burnt and not eaten. Mrs Coyle asks for something that keeps a big animal out of a field. |
| 6 | Ivo says it out loud: a glass dragon lays one egg, once. So there is a mother. |
| 7 | Tom gets two steps down the cellar stairs. **Tell him, or send him home.** |
| 8 | The lake is empty. She is looking underneath everything. |
| 9 | The Warden arrives and starts asking. |
| 10 | The egg rocks. Ivo writes down what he knows. |
| 11 | He asks you straight out. **Tell him, or say there is nothing.** |
| 12 | Two in the morning, it hatches. |
| 13 | The village votes to drive her off. |
| 14 | She has stopped moving. The baby cries and she comes closer. |
| 15 | **Go up the crags and see her, or stay in and get ready.** |
| 16 | Everyone is in the square. **Carry it up the hill and give it back — or go out the back and keep it.** |

Four choices, each a plain either/or, each remembered on the last screen in one
sentence.

## The evenings

One card between the last customer and the next morning: a short scene, and
sometimes something to do. Seven nights the egg wants something — you pick a
plant off your own shelf and give it, which is serving a customer pointed at
the thing under your floor. Getting it wrong fails nothing; it makes for a long
night. Three nights carry a choice. Two carry a piece of paper.

## The endings

**You gave her back her egg**, or **you kept it**, or the last hour went by and
you did nothing. Then up to three extra lines, one per thing you decided on the
way: whether Tom knew, whether you lied to the Warden, whether you went up the
crags on the Friday night.

## Where the words live

`newtext.py` holds every line anybody speaks, keyed by visitor id, so `days.py`
can stay what it is — the structure: which plant answers which request, who it
is for, what each visitor hands over. Editing a line never risks the puzzle.

Everything in the game that is a sentence is editable in `DEPENDENCIES.html`:
type over it, export the JSON, and `build/apply_edits.py` folds it back into
whichever Python file holds it.

## In numbers

82 plants (58 human, 17 dragon, 7 either) · 17 places · 12 doors · 16 days ·
124 visits · 14 notes · 16 evenings · 691 editable lines.
