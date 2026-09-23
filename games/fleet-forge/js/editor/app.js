/* editor/app.js — wiring: the roster list, the metadata form, the tabs, and
 * getting the JSON back out again.
 *
 * WHAT THIS PAGE IS
 * A developer tool for tuning data/opponents.json by hand, opened directly at
 * /games/fleet-forge/editor.html. It is deliberately not linked from the game
 * and is not in the arcade index. It loads the game's own theme, core, data,
 * geom, shipview and sim so that what it shows and what the game does are the
 * same code — the only file it does not load is save.js, which is the player's
 * save and none of a tool's business.
 *
 * A STATIC PAGE CANNOT WRITE TO DISK, so the end of every session is a paste:
 * Copy JSON, then replace data/opponents.json with it. The working copy lives
 * in localStorage (see editor/store.js for why that is allowed here and
 * nowhere else) purely so a refresh does not cost an hour.
 */
var EditorApp = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var saveT = null, statusT = null;

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }

  function status(msg, bad) {
    var s = $('status');
    s.textContent = msg;
    s.className = bad ? 'status bad' : 'status';
    if (statusT) clearTimeout(statusT);
    statusT = setTimeout(function () { s.textContent = ''; }, 4000);
  }

  /* Every edit lands on the roster object immediately; the write to
     localStorage is debounced because a slider drag is fifty edits a second
     and JSON.stringify of the whole roster is not free. */
  function touched() {
    renderRosterRow(EditorStore.selected);
    renderStats();
    if (saveT) clearTimeout(saveT);
    saveT = setTimeout(function () {
      EditorStore.persist();
      $('saved').textContent = 'working copy saved ' + new Date().toLocaleTimeString();
      if ($('jsonText') && !$('tab-json').classList.contains('hidden')) fillJSON();
    }, 350);
  }

  /* ---- the roster list -------------------------------------------------- */

  /* What an opponent is carrying, in one line. Routed on subtype/damageType,
     never on a display name. */
  function armament(o) {
    var n = { ballistic: 0, missile: 0, laser: 0, launcher: 0 }, i, m;
    for (i = 0; i < o.ship.modules.length; i++) {
      m = Data.module(o.ship.modules[i].moduleId);
      if (!m) continue;
      if (m.subtype === 'weapon' && n[m.damageType] !== undefined) n[m.damageType]++;
      else if (m.subtype === 'mine' || m.subtype === 'junk') n.launcher++;
    }
    var parts = [];
    if (n.ballistic) parts.push(n.ballistic + ' ballistic');
    if (n.missile)   parts.push(n.missile + ' missile');
    if (n.laser)     parts.push(n.laser + ' laser');
    if (n.launcher)  parts.push(n.launcher + ' launcher' + (n.launcher > 1 ? 's' : ''));
    return parts.join(' · ') || 'unarmed';
  }

  function hullName(o) {
    var s = o.ship.shipId ? Data.ship(o.ship.shipId) : null;
    return s ? s.displayName : (o.ship.shipId || 'no hull');
  }

  function rowEl(i) {
    var o = EditorStore.at(i), chk = EditorStore.check(o);
    var row = el('button', 'rost' + (i === EditorStore.selected ? ' on' : '') + (chk.ok ? '' : ' bad'));
    row.dataset.index = i;

    var top = el('div', 'rost-top');
    top.appendChild(el('span', 'rost-n', String(i + 1)));
    top.appendChild(el('span', 'rost-name', o.name));
    var pips = '';
    for (var d = 0; d < Math.min(9, o.difficulty); d++) pips += '★';
    top.appendChild(el('span', 'rost-diff', pips));
    row.appendChild(top);

    row.appendChild(el('div', 'rost-sub', hullName(o) + ' · ' + armament(o)));
    row.appendChild(el('div', 'rost-sub dim',
      o.ship.modules.length + ' modules' +
      (chk.ok ? '' : ' · ' + chk.errors.join('; '))));

    row.onclick = function () { select(i); };
    return row;
  }

  function renderRoster() {
    var host = $('rosterList');
    host.innerHTML = '';
    for (var i = 0; i < EditorStore.list.length; i++) host.appendChild(rowEl(i));
    $('rosterCount').textContent = EditorStore.list.length + ' on the ladder, top to bottom';
  }

  function renderRosterRow(i) {
    var host = $('rosterList'), old = host.children[i];
    if (!old) { renderRoster(); return; }
    host.replaceChild(rowEl(i), old);
  }

  /* ---- metadata --------------------------------------------------------- */

  function fillMeta() {
    var o = EditorStore.current();
    if (!o) return;
    $('fId').value = o.id;
    $('fName').value = o.name;
    $('fBlurb').value = o.blurb;
    $('fDiff').value = o.difficulty;
    fillHulls();
  }

  function fillHulls() {
    var o = EditorStore.current(), sel = $('fHull');
    if (sel.options.length === 0) {
      var list = Data.shipList;
      for (var i = 0; i < list.length; i++) {
        var g = Geom.shipGrid(list[i]);
        var op = el('option', null, list[i].displayName + '  —  ' + g.w + '×' + g.h + ', ' + g.capacity + ' cells');
        op.value = list[i].key;
        sel.appendChild(op);
      }
    }
    sel.value = o.ship.shipId || '';
  }

  function bindMeta() {
    $('fId').oninput = function () {
      EditorStore.current().id = this.value.trim();
      touched();
    };
    $('fName').oninput = function () { EditorStore.current().name = this.value; touched(); };
    $('fBlurb').oninput = function () { EditorStore.current().blurb = this.value; touched(); };
    $('fDiff').oninput = function () {
      EditorStore.current().difficulty = Math.max(0, parseInt(this.value, 10) || 0);
      touched();
    };
    $('fHull').onchange = function () {
      var o = EditorStore.current();
      if (o.ship.modules.length &&
          !window.confirm('Changing hull throws the fit away — module coordinates mean ' +
                          'nothing on a different grid. Continue?')) {
        this.value = o.ship.shipId;
        return;
      }
      o.ship.shipId = this.value;
      o.ship.modules.length = 0;
      EditorFit.edit(o);
      touched();
      renderRoster();
    };
  }

  /* ---- stats and errors ------------------------------------------------- */

  function renderStats() {
    var o = EditorStore.current(), host = $('stats'), errs = $('errors');
    host.innerHTML = ''; errs.innerHTML = '';
    if (!o) return;
    var ship = o.ship.shipId ? Data.ship(o.ship.shipId) : null;
    if (!ship) { errs.appendChild(el('span', 'bad', 'No hull chosen')); return; }

    var v = Geom.validate(ship, o.ship.modules, Data.modules), s = v.stats;
    var cells = [
      ['CELLS', s.cellsUsed + ' / ' + s.capacity, s.cellsUsed > s.capacity],
      ['POWER', Math.round(s.powerUse) + ' / ' + Math.round(s.powerGen), s.power < 0],
      ['MASS', String(Math.round(s.mass)), false],
      ['THRUST', String(Math.round(s.thrust)), s.thrust <= 0],
      ['WEAPONS', String(s.weapons), !s.weapons],
      ['REACTORS', String(s.reactors), !s.reactors],
      ['ENGINES', String(s.engines), !s.engines]
    ];
    for (var i = 0; i < cells.length; i++) {
      var c = el('div', 'stat' + (cells[i][2] ? ' bad' : ''));
      c.appendChild(el('span', 'stat-k', cells[i][0]));
      c.appendChild(el('span', 'stat-v', cells[i][1]));
      host.appendChild(c);
    }
    if (v.ok) {
      errs.appendChild(el('span', 'ok', 'Legal — Geom.validate is happy'));
    } else {
      for (i = 0; i < v.errors.length; i++) errs.appendChild(el('span', 'bad', v.errors[i]));
    }
    var m = EditorFit.selectedModule();
    $('pick').textContent = m ? (m.displayName + '  ·  ' + m.w + '×' + m.h +
                                 '  ·  click the hull to place, right-click to pull one off')
                              : 'Pick a module on the right, or click one on the hull';
  }

  /* ---- selection and tabs ----------------------------------------------- */

  function select(i) {
    EditorStore.select(i);
    var o = EditorStore.current();
    fillMeta();
    EditorFit.edit(o);
    EditorTest.edit(o);
    renderRoster();
    renderStats();
    EditorStore.persist();
  }

  function tab(name) {
    ['fit', 'ai', 'test', 'json'].forEach(function (n) {
      $('tab-' + n).classList.toggle('hidden', n !== name);
      $('tb-' + n).classList.toggle('on', n === name);
    });
    if (name === 'json') fillJSON();
    if (name === 'fit') EditorFit.refresh();
  }

  /* ---- export / import --------------------------------------------------- */

  function fillJSON() { $('jsonText').value = EditorStore.toJSON(); }

  function copyJSON() {
    var txt = EditorStore.toJSON();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { status('Copied — paste it over data/opponents.json'); },
        function () { fallbackCopy(txt); });
    } else fallbackCopy(txt);
  }

  function fallbackCopy(txt) {
    var ta = $('jsonText');
    tab('json');
    ta.value = txt;
    ta.focus(); ta.select();
    try {
      document.execCommand('copy');
      status('Copied — paste it over data/opponents.json');
    } catch (e) {
      status('Could not reach the clipboard — the JSON is selected, copy it by hand', true);
    }
  }

  function download() {
    var blob = new Blob([EditorStore.toJSON()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'opponents.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    status('Downloaded — move it to data/opponents.json');
  }

  function importJSON() {
    var r = EditorStore.fromJSON($('jsonText').value);
    if (!r.ok) { status(r.error, true); return; }
    EditorStore.persist();
    select(0);
    renderRoster();
    status('Imported ' + r.count + ' opponents');
  }

  function reloadFromFile() {
    if (!window.confirm('Throw away the working copy and reload data/opponents.json?')) return;
    fetchRoster(function () {
      EditorStore.persist();
      select(0);
      renderRoster();
      status('Reloaded from data/opponents.json');
    });
  }

  function fetchRoster(done) {
    fetch('./data/opponents.json')
      .then(function (r) { if (!r.ok) throw new Error('opponents.json ' + r.status); return r.text(); })
      .then(function (txt) {
        var res = EditorStore.fromJSON(txt);
        if (!res.ok) throw new Error(res.error);
        done();
      })
      .catch(function (e) { fail('Could not load data/opponents.json — ' + e.message); });
  }

  function fail(msg) {
    var b = $('boot');
    b.classList.remove('hidden');
    b.textContent = msg;
  }

  /* ---- boot -------------------------------------------------------------- */

  function wire() {
    $('tb-fit').onclick  = function () { tab('fit'); };
    $('tb-test').onclick = function () { tab('test'); };
    $('tb-json').onclick = function () { tab('json'); };

    $('bAdd').onclick = function () {
      EditorStore.add(Data.shipList[0].key);
      renderRoster();
      select(EditorStore.selected);
      tab('fit');
    };
    $('bDup').onclick = function () {
      EditorStore.duplicate(EditorStore.selected);
      renderRoster();
      select(EditorStore.selected);
    };
    $('bDel').onclick = function () {
      var o = EditorStore.current();
      if (!o || !window.confirm('Delete ' + o.name + '?')) return;
      EditorStore.remove(EditorStore.selected);
      if (!EditorStore.list.length) EditorStore.add(Data.shipList[0].key);
      renderRoster();
      select(EditorStore.selected);
    };
    $('bUp').onclick   = function () { select(EditorStore.move(EditorStore.selected, -1)); };
    $('bDown').onclick = function () { select(EditorStore.move(EditorStore.selected, 1)); };

    $('bAuto').onclick   = function () { EditorFit.autofillCurrent($('fWeapon').value); };
    $('bClear').onclick  = function () { EditorFit.clear(); };
    $('bRemove').onclick = function () { EditorFit.removeSelected(); };

    $('bCopy').onclick     = copyJSON;
    $('bCopy2').onclick    = copyJSON;
    $('bDownload').onclick = download;
    $('bImport').onclick   = importJSON;
    $('bReload').onclick   = reloadFromFile;

    bindMeta();
  }

  function start() {
    EditorStore.attach(window.localStorage || null);

    Data.load(function () {
      var restored = EditorStore.restore();
      var go = function () {
        wire();
        EditorFit.init({ canvas: $('grid'), browser: $('browser'), onChange: touched });
        EditorTest.init({ host: $('tab-test'), overlay: $('battleOverlay'),
                          closeBtn: $('closeWatch') });
        if (!EditorStore.list.length) EditorStore.add(Data.shipList[0].key);
        renderRoster();
        select(EditorStore.selected);
        tab('fit');
        $('boot').classList.add('hidden');
        $('saved').textContent = restored
          ? 'restored the working copy from this browser'
          : 'loaded data/opponents.json';
      };
      if (restored) go(); else fetchRoster(go);
    }, function (e) {
      fail('Could not load data/data.json — ' + (e && e.message ? e.message : e));
    });
  }

  return { start: start, select: select, tab: tab, status: status };
})();
