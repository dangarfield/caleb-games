/* e2e_thps.mjs — convert a synthetic THPS level, load it in a real browser,
 * and skate it.
 *
 * The Python test (test_thps2glb.py) proves the converter reads the format.
 * This proves the other half: that what it writes is a park the game can
 * actually load, collide against, ride up and grind.
 *
 * Needs node, playwright, and a chromium. From games/skate:
 *
 *     npm i playwright && npx playwright install chromium
 *     python3 tools/make_fixture.py --park /tmp/PARK
 *     python3 tools/thps2glb.py /tmp/PARK.PSX /tmp/PARK.TRG \
 *         --scale 256 --name "Test Park" -o assets/thps/park.glb
 *     python3 -m http.server 8099 &
 *     node tools/e2e_thps.mjs
 *
 * Then delete assets/thps/park.glb and assets/thps/levels.json — the test park
 * is not something anyone wants in the level select.
 *
 * CHROMIUM and THREE_DIR below may need pointing at your own copies.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const THREE_DIR = process.env.THREE_DIR || 'node_modules/three';
const CHROMIUM = process.env.CHROMIUM || undefined;   // undefined = playwright's own
const ok = [], bad = [];
const check = (label, pass, detail = '') => {
  (pass ? ok : bad).push(label);
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${label}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

// cdn.jsdelivr.net is blocked by the egress proxy; serve three from node_modules
await page.route('https://cdn.jsdelivr.net/**', (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname.replace(/^\/npm\/three@[^/]+\//, '');
  const file = path.join(THREE_DIR, rel);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'no' });
  route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(file) });
});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => errors.push('REQ ' + r.url() + ' ' + (r.failure()||{}).errorText));
page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

await page.goto('http://localhost:8099/index.html');
await page.waitForFunction(() => window.__skate && window.__skate.mode === 'menu', { timeout: 60000 });

console.log('\n1. discovery');
const levels = await page.evaluate(() => window.__skate.levels.map((l) => ({ id: l.id, name: l.name, thps: !!l.thps })));
console.log('   ', JSON.stringify(levels));
check('the three built-in parks are still there', levels.filter((l) => !l.thps).length === 3);
check('the converted park was discovered', levels.some((l) => l.thps && l.name === 'Test Park'));

console.log('\n2. loading the converted park');
const t0 = Date.now();
await page.evaluate(() => window.__skate._loadLevel('thps-park'));
await page.waitForFunction(() => window.__skate.levelId === 'thps-park', { timeout: 30000 });
check('it became the active level', true, `${Date.now() - t0} ms`);

const info = await page.evaluate(() => {
  const g = window.__skate, T = window.__three;
  const counts = { floor: 0, wall: 0, pipe: 0, apron: 0 };
  for (const t of g.level.world.tris) counts[t.group] = (counts[t.group] || 0) + 1;
  const box = new T.Box3().setFromObject(g.level.root);
  let visible = 0, coloured = 0;
  g.level.root.traverse((o) => {
    if (!o.isMesh || !o.visible || /_CSG$/.test(o.name)) return;   // rails are their own tube mesh
    visible++; if (o.material.vertexColors) coloured++;
  });
  return {
    counts, paths: g.level.paths.length,
    pathLen: g.level.paths.map((p) => +p.length.toFixed(2)),
    spawn: g.def.spawn, letters: g.def.letters.length, barrels: g.def.barrels.length,
    goals: g.goals.rows().map((r) => r.label),
    box: { min: box.min.toArray().map((n) => +n.toFixed(2)), max: box.max.toArray().map((n) => +n.toFixed(2)) },
    visible, coloured
  };
});
console.log('   ', JSON.stringify(info, null, 1).replace(/\n/g, '\n    '));

/* 88 collision triangles, split between flat ground and the quarter pipe's
   catchment. The split moved from 72/16 to 61/27 when --pipe-reach went from
   2.5 m to 5 m for the doubled level scale: the same geometry, a wider lip. */
check('collision buckets arrived intact', info.counts.floor + info.counts.pipe === 88
  && info.counts.pipe > 8, JSON.stringify(info.counts));
check('the rail became a grindable path', info.paths === 1 && info.pathLen[0] > 15,
  JSON.stringify(info.pathLen));
check('the park is 26 m across', Math.abs((info.box.max[0] - info.box.min[0]) - 26) < 0.5);
check('one visible mesh, and it is vertex-coloured', info.visible === 1 && info.coloured === 1,
  `${info.visible} visible, ${info.coloured} coloured`);
check('S-K-A-T-E and barrels were scattered onto the floor',
  info.letters === 5 && info.barrels >= 6, `${info.letters} letters, ${info.barrels} barrels`);
check('the barrel objective matches how many were actually placed',
  info.goals.some((l) => l === `Smash all ${info.barrels} barrels`), info.goals.join(' / '));
check('spawn came from the .trg Restart node',
  Math.abs(info.spawn.pos[0]) < 0.01 && Math.abs(info.spawn.pos[2] - 10) < 0.01,
  JSON.stringify(info.spawn.pos));

console.log('\n3. skating it');
const run = await page.evaluate(async () => {
  const g = window.__skate;
  g._startRun(); g.mode='play';
  const step = (keys, ticks) => {
    const inp = g.input;
    inp.held = Object.create(null);
    for (const k of keys) inp.held[k] = true;
    const trail = [];
    for (let i = 0; i < ticks; i++) {
      inp.update(1 / 60);
      g.sm.physics(1 / 60);
      trail.push({ y: g.ctrl.body.position.y, st: g.sm.current.name, v: g.ctrl.velocity.length() });
    }
    return trail;
  };
  const roll = step(['Up'], 150);                 // push forward off the spawn
  const speed = roll[roll.length - 1].v;
  const minY = Math.min(...roll.map((s) => s.y));
  const states = [...new Set(roll.map((s) => s.st))];
  return { speed: +speed.toFixed(2), minY: +minY.toFixed(2), states,
           endY: +roll[roll.length - 1].y.toFixed(2) };
});
console.log('   ', JSON.stringify(run));
check('the skater stays on the floor', run.minY > -1, `min y ${run.minY}`);
check('pushing builds speed', run.speed > 5, `${run.speed} m/s`);
console.log('\n4. the quarter pipe (VERT-flagged faces)');
const pipe = await page.evaluate(() => {
  const g = window.__skate, T = window.__three;
  const place = (x, y, z, heading) => {
    g.ctrl.setStartTransform(new T.Vector3(x, y, z), heading);
    g.anim.snapTo(g.ctrl.body); g.cam.snap(g.ctrl);
    g.sm.go('reset'); g.sm.go('ground');
  };
  place(0, 0.15, -4, Math.PI);          // face -Z, straight at the transition
  const inp = g.input; inp.held = Object.create(null); inp.held.Up = true;
  const states = new Set(); let maxY = -99;
  for (let i = 0; i < 200; i++) {
    inp.update(1 / 60); g.sm.physics(1 / 60);
    states.add(g.sm.current.name);
    maxY = Math.max(maxY, g.ctrl.body.position.y);
  }
  return { states: [...states], maxY: +maxY.toFixed(2) };
});
console.log('   ', JSON.stringify(pipe));
check('riding at the transition puts the skater on the pipe',
  pipe.states.some((s) => s.startsWith('pipe')), pipe.states.join(','));
check('and carries them up it', pipe.maxY > 0.6, `max y ${pipe.maxY}`);

console.log('\n5. the rail (chained out of the .trg)');
const grind = await page.evaluate(() => {
  const g = window.__skate, T = window.__three;
  // start on the rail's own line, at its far end, facing along it (+X)
  g.ctrl.setStartTransform(new T.Vector3(-11, 0.15, 6), Math.PI / 2);
  g.anim.snapTo(g.ctrl.body); g.cam.snap(g.ctrl);
  g.sm.go('reset'); g.sm.go('ground');
  const inp = g.input; inp.held = Object.create(null); inp.held.Up = true;
  const states = new Set(); let ground = 0;
  for (let i = 0; i < 240; i++) {
    // GRIND is read off the input buffer, which real keys push on press
    if (i >= 30 && i % 20 === 0) inp.buffer.push(3);
    inp.update(1 / 60); g.sm.physics(1 / 60);
    states.add(g.sm.current.name);
    if (g.sm.current.name === 'grind') ground++;
  }
  return { states: [...states], grindTicks: ground };
});
console.log('   ', JSON.stringify(grind));
check('the rail is grindable', grind.grindTicks > 10,
  `${grind.grindTicks} ticks in grind, saw ${grind.states.join(',')}`);

// Google Fonts is blocked by this sandbox's egress proxy and the favicon lives
// at the repo root, not the game folder; neither says anything about the game.
const real = errors.filter((e) =>
  !/fonts\.googleapis|favicon|ERR_TUNNEL_CONNECTION_FAILED/.test(e) &&
  e !== 'Failed to load resource: the server responded with a status of 404 (File not found)');
check('no page errors', real.length === 0, real.slice(0, 3).join(' | '));

console.log(`\n${bad.length ? 'FAILURES: ' + bad.join(', ') : 'ALL PASS'}  (${ok.length} passed, ${bad.length} failed)`);
await browser.close();
process.exit(bad.length ? 1 : 0);
