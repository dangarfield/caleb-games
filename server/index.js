const express = require('express');
const path = require('path');
const { globSync } = require('fs');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;
const ROOT = path.join(__dirname, '..');

app.use(express.json());

// Auto-discover game plugins from games/*/server.js
const gamesDir = path.join(ROOT, 'games');
if (fs.existsSync(gamesDir)) {
  const entries = fs.readdirSync(gamesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pluginPath = path.join(gamesDir, entry.name, 'server.js');
    if (fs.existsSync(pluginPath)) {
      const router = require(pluginPath);
      app.use(`/api/games/${entry.name}`, router);
      console.log(`Mounted plugin: /api/games/${entry.name}`);
    }
  }
}

// Serve static files from project root
app.use(express.static(ROOT));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
