---
color: green
isContextNode: false
---
# Sensible Soccer

A complete single-file top-down 2D soccer game inspired by Sensible Soccer and YSoccer (Yoda Soccer). Features 11v11 match play with AI opponents and teammates, pixel-art sprites, touch controls for tablet play, and physics-based ball and tackle mechanics reverse-engineered from the YSoccer open-source codebase.

## Features

- **11v11 match play**: Full teams with 4-4-2 formations that shift dynamically based on ball position
- **Pixel-art sprites**: Blocky players with shirt, shorts, socks, hair, directional facing, walk animation, and shadows
- **Pitch rendering**: Grass stripes, penalty areas, goal areas, center circle, corner arcs, penalty spots, goalposts, and goal nets
- **Ball physics**: Friction-based movement with z-axis for lofted shots and arcing throws; goalpost collision bouncing
- **AI**: Opponent AI with dribbling, passing, and shooting decisions; teammate AI with formation holding and ball chasing; goalkeeper AI with tracking, rushing out, and clearing
- **Match rules**: 3-minute arcade matches, half-time with side swap, kick-off, throw-ins, goal kicks, full-time screen
- **HUD**: Scoreboard with team colors and score, countdown timer, half indicator, dead ball labels
- **Debug GUI**: lil-gui panel (loaded from CDN) with toggleable visualizations for tackle range, ball proximity, hasBall indicators, and distance overlays; live tuning sliders for tackle range and ball proximity

## Controls

### Keyboard
| Key | Action |
|-----|--------|
| WASD / Arrow keys | Movement |
| K | Pass (tackle when without ball) |
| X | Shoot |
| J | Switch player |

### Touch
- **Virtual joystick** (left side): 60px outer ring, 24px thumb, always visible on touch devices
- **Action buttons** (right side, diamond layout): SHOOT (top, red), PASS/TACKLE (left, green), SWITCH (bottom-right, blue)
- Buttons are 38px radius with 55px hit zones for tablet play
- Pass button label dynamically shows "PASS" or "TACKLE" based on ball possession
- Press glow effect for visual feedback

## YSoccer-Inspired Mechanics

Three major gameplay systems were rebuilt based on analysis of the YSoccer Java source code. YSoccer runs at 512 subframes/sec; all timing constants were proportionally scaled to 60fps.

### Ball Physics
- **Ground friction**: Square-root decay (`v -= friction * sqrt(v)`), so fast balls decelerate more than slow ones
- **Air friction**: Exponential decay when airborne
- **Bounce**: Coefficient 0.9 with horizontal speed loss proportional to vertical impact speed
- **Pass power**: Distance-scaled (`base + 0.008 * distance`), inspired by YSoccer's `base + 0.3 * dist` formula
- **Grass types** in YSoccer range from frozen to muddy; the game uses normal grass defaults

### Passing & Control Switching
- **Kick state lock**: 21 frames (0.35s) after pass/shoot blocks all auto-switching
- **Passing mate protection**: The intended pass target is recorded; auto-switch will never prematurely switch to this player
- **Hysteresis**: Auto-switch only triggers if the nearest player is less than 0.5x the distance of the current controlled player (from YSoccer's `near1.frameDistance < 0.5 * controlled.frameDistance`)
- **Ball receipt**: Control transfers when a teammate actually picks up the ball
- **Pass targeting**: Direction-based within a cone of the player's facing, selecting the nearest teammate by distance; goalkeeper excluded from pass targets

### Tackling
- **Slide tackle system**: Replaces the original instant-knockback model
- **Entry conditions**: Player must be moving, ball must be in front, ball 12-120px away and approaching
- **Slide mechanics**: 10px initial lunge + speed of 5.5 (1.4x run speed), sqrt-based deceleration
- **Opponent contact**: Knocks opponent into DOWN state for 90 frames (1.5s)
- **Possession contests**: When two players contest the ball, loser enters NOT_RESPONSIVE for 12 frames (0.2s)
- **No explicit cooldown**: The slide deceleration itself is the natural cooldown (YSoccer design)
- **Visual states**: Sliding player drawn flat/stretched, downed player drawn horizontal
- **Proximity-based triggering**: Press pass button near an opponent who is near the ball (within 40px of ball, within 35px of player)

### Throw-Ins
- **Multi-phase flow** replacing the original 40-frame freeze:
  - Phase 1 (reposition): All players move to shifted formation positions for 30 frames
  - Phase 2 (walk): Nearest player on throwing team walks to ball position
  - Phase 3 (throw): After 15 frames, auto-throws to best pass target with ball arc (z component)
- Players keep moving throughout -- no game freeze during dead balls
- Ball cleared from all ownership on dead ball start

### Player State Machine
```
standrun -> tackle (slide) -> standrun (when speed < 0.5)
         -> down (knocked by tackle) -> standrun (after 1.5s)
         -> notresponsive (lost contest) -> standrun (after 0.2s)
```

### Key Constants (Scaled from YSoccer)
| Constant | Value | Origin |
|----------|-------|--------|
| TACKLE_LUNGE_SPEED | 5.5 | 1.4x run speed |
| TACKLE_DECEL | 0.12 | sqrt(v) based |
| DOWN_DURATION | 90 frames | 1.5s |
| NOT_RESPONSIVE_DURATION | 12 frames | 0.2s |
| KICK_STATE_DURATION | 21 frames | 0.35s |
| TACKLE_RANGE | 35 | Proximity check |
| TACKLE_COOLDOWN | 60 frames | Applied to both tackler and tackled |

## Bug Fixes & Improvements

- **AI de-clustering**: Fixed opponent AI where 3+ players chased the ball simultaneously; now only the nearest-to-ball player chases while others hold formation
- **Throw-in freeze**: Removed early return during dead ball that froze the entire game; players now continue repositioning while only the ball stays held
- **Pass auto-switch**: Added 30-frame `passSwitchLock` to prevent auto-switching to the pass target immediately after passing; clears when a teammate actually receives the ball
- **Tackle cooldown balance**: Increased from 20 to 60 frames (1 second) and applied to both the tackler and the tackled player to prevent re-tackle chains
- **Tackle/switch separation**: Tackle button purely switches player; pass button doubles as tackle when without ball (FIFA-style)
- **Auto-switch improvement**: Switches when nearest teammate is 40px+ closer than controlled player; detection radius raised to 60px
- **Teammate loose ball chasing**: Nearest teammate sprints toward loose balls at 1.1x AI speed; any teammate within 40px also chases
- **Control remapping**: K=Pass, X=Shoot, J=Switch (from original Z/X/C)
- **Touch control overhaul**: Larger buttons (38px radius), diamond layout, always-visible joystick, generous 55px hit zones, color-coded buttons with press glow

## Files

- games/soccer/index.html

[[games-index]]
