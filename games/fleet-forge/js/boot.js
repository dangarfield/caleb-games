/* boot.js — load the data, open the save, show the hangar. */
(function () {
  var boot = document.getElementById('boot');
  function fail(e) {
    boot.textContent = 'Could not load fleet data — ' + (e && e.message ? e.message : e);
    boot.style.color = T.danger;
  }
  App.init();
  Data.load(function () {
    Progress.load(function () {
    Opponents.load(function () {
    Save.ready(function () {
      boot.classList.add('hidden');
      /* Armed here rather than in App.init so nothing is fetched while the
         loading screen is still up. The first tap on a pilot card is the
         gesture that starts it. */
      Music.arm();
      App.start(HomeScreen);
      if (!Save.working()) {
        /* Tell the player rather than silently losing their fleet. */
        var n = document.createElement('div');
        n.textContent = Save.stalled()
          ? 'Storage is not responding — playing on, but nothing is being saved yet'
          : 'No storage available — this session will not be saved';
        /* If the store turns up late, say so and stop worrying the player. */
        var poll = setInterval(function () {
          var r = Save.recovered();
          if (!r) return;
          clearInterval(poll);
          n.textContent = r === 'loaded' ? 'Storage recovered — your save was loaded'
                                         : 'Storage recovered — saving again from here';
          n.style.color = '#5ce89b';
          setTimeout(function () { n.remove(); }, 6000);
        }, 500);
        n.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:9999;' +
          'font:600 12px/1.4 "Segoe UI",system-ui,sans-serif;color:#ffd32a;' +
          'background:rgba(0,0,0,0.6);padding:6px 12px;border-radius:14px;';
        document.body.appendChild(n);
      }
    });
    }, fail);
    }, fail);
  }, fail);
})();
