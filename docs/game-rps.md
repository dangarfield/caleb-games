---
color: green
isContextNode: false
---
# Rock Paper Scissors

Classic RPS with custom set creator. Purely static — no server needed.

## Features
- Three screens: Menu, Game, Creator
- Classic RPS with rock/paper/scissors emoji icons
- Custom set creator: name items, define beats-what relationships via chip toggles
- Custom sets persisted to localStorage (`rps-custom-sets` key)
- Touch-optimized with shake/bounce/pop-in animations
- Custom set validation: minimum 3 items, every item must beat at least one other

## History
Originally had AI icon generation via AWS Bedrock Nova Canvas server plugin. Server and AI features were removed — game now works as purely static page. Icon display falls back to emoji or first letter for custom items.

## Files
- games/rps/index.html

[[games-index]]
