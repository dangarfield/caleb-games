// Bakes Splat Attack!'s walkable heightfields for every map x mode into terrain.json + terrain.bin.
// The game fetches these at boot instead of ray-casting the terrain on the tablet at match start.
// Re-run after editing any map in index.html (the game warns in the console when an entry is stale):
//   node games/splat-attack/tools/bake-terrain.mjs            (from the repo root)
//   CHROME=/path/to/chrome node games/splat-attack/tools/bake-terrain.mjs   (if puppeteer has no browser of its own)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODES = ['tt', 'lss', 'bb', 'gga'];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webm': 'audio/webm', '.bin': 'application/octet-stream' };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  // The bake must not read the previous bake, so terrain.* is always "missing" to the page.
  if (/^terrain\.(json|bin)$/.test(rel)) { res.writeHead(404); return res.end(); }
  const f = path.join(GAME, rel);
  if (!f.startsWith(GAME) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME || undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [])] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  // Offline / sandboxed runs: LOCAL_THREE=<path to node_modules/three@0.160.0> serves three from disk instead of unpkg.
  if (process.env.LOCAL_THREE) {
    await page.setRequestInterception(true);
    page.on('request', r => {
      const m = r.url().match(/^https:\/\/unpkg\.com\/three@0\.160\.0\/(.*)$/);
      if (m) return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(process.env.LOCAL_THREE, m[1])) });
      if (/^https?:\/\//.test(r.url()) && !r.url().startsWith('http://127.0.0.1')) return r.abort(); // fonts / icons aren't needed to bake
      r.continue();
    });
  }
  await page.setViewport({ width: 1333, height: 690 });
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.SA && window.SA.buildWorld, { timeout: 60000 });
  const maps = await page.evaluate(() => window.SA.maps);
  const out = {};
  for (const map of maps) for (const mode of MODES) {
    const t0 = Date.now();
    const got = await page.evaluate((map, mode) => {
      const T = window.SA.TERRAIN; T.off = true; T.baked = {};
      window.SA.buildWorld(map, mode, { bbA: 'pink', bbB: 'cyan' });
      const [k, a] = Object.entries(T.baked)[0] || [];
      if (!k) return null;
      let s = ''; const b = new Uint8Array(a.buffer); for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
      return { k, n: a.length / 3, b64: btoa(s) };
    }, map, mode);
    if (!got) throw new Error(`no heightfield came out of ${map}/${mode}`);
    out[got.k] = got;
    console.log(`${map.padEnd(8)} ${mode.padEnd(4)} ${got.n} cells  ${Date.now() - t0} ms`);
  }
  // Pack: identical grids (modes that don't change a map's shape) are stored once.
  const entries = {}, chunks = [], seen = new Map(); let off = 0;
  for (const [k, { n, b64 }] of Object.entries(out)) {
    if (!seen.has(b64)) { const buf = Buffer.from(b64, 'base64'); seen.set(b64, off); chunks.push(buf); off += buf.length; }
    entries[k] = { off: seen.get(b64), n };
  }
  fs.writeFileSync(path.join(GAME, 'terrain.bin'), Buffer.concat(chunks));
  fs.writeFileSync(path.join(GAME, 'terrain.json'), JSON.stringify({ baked: new Date().toISOString().slice(0, 10), note: 'Int16 heights x100: H, NH, HI per cell. Built by tools/bake-terrain.mjs', entries }, null, 1) + '\n');
  console.log(`terrain.bin ${off} bytes, ${seen.size} unique grids for ${Object.keys(entries).length} map x mode entries`);
} finally { await browser.close(); server.close(); }
