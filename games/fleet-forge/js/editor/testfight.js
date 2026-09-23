/* editor/testfight.js — fight the opponent you are editing.
 *
 * Two modes, both driving the real `Sim` and nothing else:
 *
 *  WATCH — hands the fit to the game's own BattleScreen on a full-screen
 *  overlay canvas. Not a second renderer: the same file the player sees,
 *  including the briefing, which is the useful part when tuning behaviour
 *  because the briefing describes the ship you are tuning.
 *
 *  BATCH — N headless fights, the way tools/balance.js runs them: create a
 *  world, step it at a fixed 1/60 until it is over, read the winner. This is
 *  the mode that actually tunes an opponent, so it runs in chunks off a
 *  timer with a progress line and a cancel, rather than locking the tab up
 *  for the twenty seconds a hundred flagship fights take.
 *
 * SIDES. The opponent being edited is always the sim's `enemy` (side 1) and
 * the sparring partner is `player` (side 0) — so a win for the thing you are
 * editing is `winner === 'enemy'`, and BattleScreen's briefing panel, which
 * describes the *enemy*, describes the ship you are working on.
 */
var EditorTest = (function () {
  'use strict';

  var CHUNK = 3;              /* fights per timer slice — a flagship pair is
                                 ~40ms each, so three keeps the tab alive     */
  var GUARD = 60000;          /* ticks; the sim's own maxTime ends it long
                                 before this, so this only catches a bug      */

  var host = null, overlay = null, resultEl = null;
  var opp = null, running = null;
  var oppSelect = null, hullSelect = null, weaponSelect = null,
      seedInput = null, runsInput = null, runBtn = null, watchBtn = null;
  var appStarted = false;

  var IDLE = { draw: function (ctx) { bgGradient(ctx, VW, VH); } };

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  /* ---- the opposition --------------------------------------------------- */

  /* Either another roster row, or a bare hull with a one-click legal fit. */
  function sparringFit() {
    var v = oppSelect.value;
    if (v.indexOf('opp:') === 0) {
      var o = EditorStore.byId(v.slice(4));
      return o ? { fit: EditorStore.fitFor(o), label: o.name } : null;
    }
    var key = hullSelect.value, w = weaponSelect.value;
    var f = EditorFit.quickFit(key, w, 'brawler');
    if (!f) return null;
    /* Some hulls cannot carry a legal fit at all — the Drone is 1x2 with no
       engine cell — so say so rather than quietly fighting a wreck. */
    var v = Geom.validate(Data.ship(key), f.modules, Data.modules);
    return { fit: f, label: Data.ship(key).displayName + ' (quick ' + w + ' fit)',
             warn: v.ok ? '' : 'The sparring hull cannot carry a legal fit (' +
                               v.errors.join('; ') + '). ' };
  }

  function refreshOpponents() {
    var keep = oppSelect.value;
    oppSelect.innerHTML = '';
    var list = EditorStore.list, i;
    for (i = 0; i < list.length; i++) {
      if (opp && list[i] === opp) continue;          /* no mirror match here */
      var o = el('option', null, list[i].name);
      o.value = 'opp:' + list[i].id;
      oppSelect.appendChild(o);
    }
    var q = el('option', null, '— a hull with a quick fit —');
    q.value = 'hull';
    oppSelect.appendChild(q);
    if (keep) oppSelect.value = keep;
    if (!oppSelect.value) oppSelect.selectedIndex = 0;
    syncHullRow();
  }

  function syncHullRow() {
    var on = oppSelect.value === 'hull';
    hullSelect.parentNode.style.display = on ? '' : 'none';
  }

  /* ---- batch ------------------------------------------------------------ */

  function runOne(playerFit, enemyFit, seed) {
    var w = Sim.create({ playerFit: playerFit, enemyFit: enemyFit, seed: seed });
    var guard = 0;
    while (!w.over && guard++ < GUARD) w.step(1 / 60);
    return { winner: w.winner, reason: w.reason, time: w.time, guarded: guard >= GUARD };
  }

  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return (s.length % 2) ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function startBatch() {
    if (running) { running.cancelled = true; running = null; setButtons(false); return; }
    var sp = sparringFit();
    if (!sp) { show('Pick something to fight.', true); return; }
    var mine = EditorStore.fitFor(opp);

    var chk = EditorStore.check(opp);
    var warn = (chk.ok ? '' : 'Heads up — this fit is illegal (' + chk.errors.join('; ') + '). ') +
               (sp.warn || '');

    var n = Math.max(1, Math.min(500, parseInt(runsInput.value, 10) || 25));
    var base = parseInt(seedInput.value, 10) || 1;

    running = { i: 0, n: n, base: base, mine: mine, spar: sp, cancelled: false,
                wins: 0, losses: 0, draws: 0, timeouts: 0, times: [], warn: warn,
                t0: Date.now() };
    setButtons(true);
    step();
  }

  function step() {
    var r = running;
    if (!r || r.cancelled) return;
    for (var c = 0; c < CHUNK && r.i < r.n; c++, r.i++) {
      var out;
      try {
        /* seeds are spread the way tools/balance.js spreads them — a stride
           that is not 1, so consecutive runs are not near-identical worlds */
        out = runOne(r.spar.fit, r.mine, (r.base + r.i * 977) | 0);
      } catch (e) {
        running = null; setButtons(false);
        show('Could not run: ' + (e && e.message ? e.message : e), true);
        return;
      }
      if (out.winner === 'enemy') r.wins++;
      else if (out.winner === 'player') r.losses++;
      else r.draws++;
      if (out.reason === 'timeout') r.timeouts++;
      r.times.push(out.time);
    }
    if (r.i < r.n) {
      show('Running ' + r.i + ' / ' + r.n + '…');
      setTimeout(step, 0);
      return;
    }
    running = null;
    setButtons(false);
    report(r);
  }

  function report(r) {
    resultEl.innerHTML = '';
    if (r.warn) resultEl.appendChild(el('p', 'bad', r.warn));
    var pct = Math.round((r.wins / r.n) * 100);
    var head = el('p', 'test-head',
      opp.name + ' wins ' + r.wins + ' of ' + r.n + '  (' + pct + '%)  vs ' + r.spar.label);
    resultEl.appendChild(head);

    var t = el('table', 'test-table');
    function tr(k, v) {
      var row = el('tr');
      row.appendChild(el('td', 'k', k));
      row.appendChild(el('td', 'v', v));
      t.appendChild(row);
    }
    tr('wins / losses / draws', r.wins + ' / ' + r.losses + ' / ' + r.draws);
    tr('median duration', median(r.times).toFixed(1) + ' s');
    tr('shortest / longest', Math.min.apply(Math, r.times).toFixed(1) + ' s  /  ' +
                             Math.max.apply(Math, r.times).toFixed(1) + ' s');
    tr('ran out of clock', r.timeouts + ' of ' + r.n);
    tr('seeds', r.base + ' + n×977');
    tr('wall time', ((Date.now() - r.t0) / 1000).toFixed(1) + ' s');
    resultEl.appendChild(t);

    if (r.timeouts > r.n / 3) {
      resultEl.appendChild(el('p', 'hint',
        'A lot of these ended on the clock rather than on a kill — usually an ' +
        'weapons that outrange what the fit can actually close with, or not enough thrust for the mass.'));
    }
  }

  function show(msg, bad) {
    resultEl.innerHTML = '';
    resultEl.appendChild(el('p', bad ? 'bad' : 'hint', msg));
  }

  function setButtons(busy) {
    runBtn.textContent = busy ? 'Stop' : 'Run batch';
    watchBtn.disabled = busy;
  }

  /* ---- watch ------------------------------------------------------------ */

  function watch() {
    var sp = sparringFit();
    if (!sp) { show('Pick something to fight.', true); return; }
    var seed = parseInt(seedInput.value, 10) || 1;
    if (sp.warn) show(sp.warn, true);

    overlay.classList.remove('hidden');
    /* App owns the whole window: the overlay canvas is full-screen, so the
       virtual stage maps exactly as it does in the game. Init is deferred to
       the first watch because App.init measures the canvas. */
    if (!appStarted) { App.init(); appStarted = true; }

    App.start(BattleScreen({
      playerFit: sp.fit,
      enemyFit: EditorStore.fitFor(opp),
      opponent: { id: opp.id, name: opp.name, blurb: opp.blurb, difficulty: opp.difficulty },
      seed: seed,
      onDone: function (result) {
        closeWatch();
        if (result) {
          show(result.winner === 'enemy'
            ? opp.name + ' won in ' + result.time.toFixed(1) + 's (' + result.reason + ')'
            : (result.winner === 'draw' ? 'A draw after ' + result.time.toFixed(1) + 's'
                                        : opp.name + ' lost in ' + result.time.toFixed(1) + 's (' + result.reason + ')'));
        }
      }
    }));
  }

  function closeWatch() {
    /* The loop cannot be stopped from outside, so it is parked on a screen
       that draws a background and reads no input. */
    App.start(IDLE);
    overlay.classList.add('hidden');
  }

  /* ---- panel ------------------------------------------------------------ */

  function build() {
    host.innerHTML = '';

    var f = el('div', 'form-grid');

    var l1 = el('label', null, 'Fights against');
    oppSelect = el('select');
    oppSelect.onchange = function () { syncHullRow(); };
    l1.appendChild(oppSelect);
    f.appendChild(l1);

    var l2 = el('label', null, 'Hull');
    hullSelect = el('select');
    var ships = Data.shipList, i;
    for (i = 0; i < ships.length; i++) {
      var o = el('option', null, ships[i].displayName + '  (' + Geom.shipGrid(ships[i]).capacity + ' cells)');
      o.value = ships[i].key;
      hullSelect.appendChild(o);
    }
    l2.appendChild(hullSelect);
    weaponSelect = el('select');
    ['ballistic', 'missile', 'laser'].forEach(function (w) {
      var o = el('option', null, w); o.value = w; weaponSelect.appendChild(o);
    });
    l2.appendChild(weaponSelect);
    f.appendChild(l2);

    var l3 = el('label', null, 'Runs');
    runsInput = el('input'); runsInput.type = 'number'; runsInput.min = 1;
    runsInput.max = 500; runsInput.value = 25;
    l3.appendChild(runsInput);
    f.appendChild(l3);

    var l4 = el('label', null, 'Base seed');
    seedInput = el('input'); seedInput.type = 'number'; seedInput.value = 1234;
    l4.appendChild(seedInput);
    f.appendChild(l4);

    host.appendChild(f);

    var bar = el('div', 'row-buttons');
    runBtn = el('button', 'btn primary', 'Run batch');
    runBtn.onclick = startBatch;
    watchBtn = el('button', 'btn', 'Watch one');
    watchBtn.onclick = watch;
    bar.appendChild(runBtn);
    bar.appendChild(watchBtn);
    host.appendChild(bar);

    resultEl = el('div', 'test-result');
    host.appendChild(resultEl);
    show('Batch mode is the one to tune with: twenty-five runs of the same pair ' +
         'tells you what one fight cannot.');
  }

  return {
    init: function (opts) {
      host = opts.host;
      overlay = opts.overlay;
      build();
      if (opts.closeBtn) opts.closeBtn.onclick = closeWatch;
    },
    edit: function (opponent) {
      opp = opponent;
      if (running) { running.cancelled = true; running = null; setButtons(false); }
      refreshOpponents();
    },
    refresh: refreshOpponents,
    runOne: runOne,
    median: median
  };
})();
