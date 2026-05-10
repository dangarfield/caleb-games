---
color: green
isContextNode: false
---
# Captain Callisto

Space platformer using WebGL with 3D rendering. The most graphically complex game in the arcade.

## Features
- WebGL2 3D rendering with shadows, bloom, and post-processing
- Fixed 4-button D-pad (replaced joystick) for tablet touch controls
- Multi-touch support (hold direction + press jump simultaneously)
- Restart/mute buttons in top-right

## Tablet Performance Optimizations
Adaptive quality system detects mobile devices and reduces:

| Setting | Desktop | Mobile |
|---------|---------|--------|
| Shadow map FBO | 2048x2048 | 1024x1024 |
| Main render FBO | 2048x2048 | 1024x1024 |
| Bloom FBO | 512x512 | 256x256 |
| Shadow PCF samples | 49/pixel | 9/pixel |
| Space fractal iters | 15 | 7 |
| Dynamic lights | 16 | 8 |
| Bloom passes | 5 | 3 |
| GLSL precision | highp | mediump |

Desktop rendering is completely unchanged — all optimizations are behind `IS_MOBILE` flag.

## Files
- games/callisto/index.html

[[games-index]]
j