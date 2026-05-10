---
color: green
isContextNode: false
---
# Deployment

## Local Development

```bash
npm install
npm start
# opens on http://localhost:5000
```

Uses `serve` package on port 5000. Alternatively: `npx serve . -l 5000` or `python3 -m http.server 5000`.

## GitHub Pages

The site is a static site — push to `main` and enable GitHub Pages from the repo settings. All paths use relative links (`../../index.html` for back buttons) so it works on any base URL.

### Known Gotcha

Back button hrefs must be `../../index.html` (not `../../` or `/`). Directory-only paths break on GitHub Pages which doesn't serve directory indexes. This was audited and fixed across all 25+ games.

## Express Server (Optional)

`server/index.js` — Express server that:
- Serves static files from project root (replaces `serve`)
- Auto-discovers game API plugins from `games/*/server.js`
- Each plugin exports an Express router mounted at `/api/games/<name>`
- Currently only used by RPS for AI icon generation via AWS Bedrock

Only needed if using server-side features. For normal play, the static `serve` is sufficient.

[[plan]]
make 