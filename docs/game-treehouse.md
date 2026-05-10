---
color: green
isContextNode: false
agent_name: Ama
---
# Treehouse Quiz Game Created

Built a 'Who Wants to Be a Millionaire' style quiz game themed around the 13 Storey Treehouse book series. 13 levels (one per book: 13-Storey through 169-Storey) with 3 lifelines, safety nets, pre-recorded audio narration, and 210 questions in the bank.

## Game: Treehouse Quiz

**Concept:** WWTBAM-style quiz where each correct answer climbs one level (13 total, named by book number). Themed around Andy Griffiths & Terry Denton's Treehouse book series.

### Features
- **13 levels** with escalating difficulty (easy 1-5, medium 6-10, hard 11-13)
- **3 lifelines:** 50:50, Phone Terry (phone-a-friend), Ask the Monkeys (audience poll with animated bars)
- **Safety nets** at Level 5 and Level 10 (like WWTBAM checkpoints)
- **Timer** per question (30s easy, 25s medium, 20s hard) with visual bar
- **210 questions** in the bank, randomly selected each game for replayability
- **Pre-recorded MP3 audio** reads questions and answers aloud (per-question + per-answer files + letter A/B/C/D clips)
- **Reaction audio** — 15 correct and 12 wrong reaction phrases played after answering
- **Repeat button** to replay current question audio
- **Kids Mode fallback** — if audio playback is blocked, auto-mutes and shows toast notification
- **Storey ladder** on the left showing progress
- **Animated canvas background** with floating leaves and treehouse trunk
- **Web Audio SFX** for correct/wrong/lifeline/victory/tick (with AudioContext try/catch for Kids Mode)
- **Confetti** burst on correct answers (canvas-confetti library)
- **Shared localStorage** tracking best storey reached
- **Touch-optimized** responsive layout
- **Mute toggle** (top-center button)

### Level Numbers (one per book)
13, 26, 39, 52, 65 (safety net), 78, 91, 104, 117, 130 (safety net), 143, 156, 169

### Audio Assets (`games/treehouse/audio/`)
- `q{N}_question.mp3` — question narration (210 files)
- `q{N}_a.mp3`, `q{N}_b.mp3`, `q{N}_c.mp3`, `q{N}_d.mp3` — answer narration (840 files)
- `letter_a.mp3` through `letter_d.mp3` — letter prefix clips (4 files)
- `react_correct_{0-14}.mp3` — correct reaction phrases (15 files)
- `react_wrong_{0-11}.mp3` — wrong reaction phrases (12 files)

### Color Scheme
Green treehouse theme (#7ab648 primary) on the arcade's dark base (#0a0a2e).

## Files

- `games/treehouse/index.html` — single-file game (~1170 lines)
- `games/treehouse/audio/` — pre-recorded MP3 narration and reactions

### NOTES

- Question bank covers books from 13-Storey through 169-Storey Treehouse
- Phone Terry lifeline accuracy scales with difficulty: 85% easy, 65% medium, 50% hard
- Monkey poll percentages are biased toward correct answer but not guaranteed
- Answer order is shuffled per game; `_answerOrder` maps display position back to original audio file
- Audio reader uses a generation counter (`speechGen`) to invalidate stale callbacks on skip/cancel
- If first audio `.play()` is rejected (Kids Mode), shows toast and auto-mutes for the session

[[games-index]]
