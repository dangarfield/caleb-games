/* game.js — boot, the mobile tab bar, and a content validator that runs the
 * same checks the build-time validator does, so a hand-edit to data.js can
 * never quietly ship an unsolvable day.
 */

(function () {

  function validate() {
    var problems = [];
    var byId = {};
    SPECIMENS.forEach(function (s) {
      if (byId[s.id]) problems.push("duplicate specimen id " + s.id);
      byId[s.id] = s;
      if (!HABITATS.some(function (h) { return h.id === s.habitat; }))
        problems.push(s.name + ": unknown habitat " + s.habitat);
      if (!EFFECTS[s.effect]) problems.push(s.name + ": effect '" + s.effect + "' has no prose");
      if (!s.use) problems.push(s.name + ": no use text (effect requests would be unanswerable)");
    });

    // every specimen must be separable from every other on the observable axes
    var seen = {};
    SPECIMENS.forEach(function (s) {
      var k = AXES.map(function (a) { return s[a]; }).join("|");
      if (seen[k]) problems.push("identical attributes: " + seen[k] + " / " + s.name);
      seen[k] = s.name;
    });

    // and every puzzle must have an answer that exists
    DAYS.forEach(function (d) {
      d.visitors.forEach(function (v) {
        (v.accepts || []).forEach(function (id) {
          if (!byId[id]) problems.push("day " + d.day + " " + v.name + ": unknown specimen " + id);
        });
        if (v.kind === "describe") {
          var hits = SPECIMENS.filter(function (s) {
            return Object.keys(v.wants).every(function (k) { return s[k] === v.wants[k]; });
          });
          if (hits.length !== 1)
            problems.push("day " + d.day + " " + v.name + ": description matches " + hits.length + " specimens");
        }
        if (v.kind === "effect" && !SPECIMENS.some(function (s) { return s.effect === v.needs; }))
          problems.push("day " + d.day + " " + v.name + ": nothing has effect '" + v.needs + "'");
        if (v.kind === "fork" && (v.accepts || []).length !== 2)
          problems.push("day " + d.day + " " + v.name + ": fork needs two options");
      });
    });

    if (problems.length) console.warn("[dragonseed] content problems:\n - " + problems.join("\n - "));
    else console.log("[dragonseed] content OK: " + SPECIMENS.length + " specimens, " +
      DAYS.length + " days, " + DAYS.reduce(function (n, d) { return n + d.visitors.length; }, 0) + " visitors.");
    return problems.length === 0;
  }

  function wireTabs() {
    var tabs = document.getElementById("tabs");
    if (!tabs) return;
    tabs.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]");
      if (!b) return;
      setView(b.getAttribute("data-view"));
    });
    setView("desk");
  }
  function setView(v) {
    document.body.className = document.body.className.replace(/\bview-\w+/g, "").trim() + " view-" + v;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
      var on = b.getAttribute("data-view") === v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function begin() {
    /* nothing may read a save before the database is open */
    ArcadeStore("dragonseed").ready(function () {
      document.getElementById("start").hidden = true;
      document.getElementById("app").hidden = false;
      Engine.start();
    });
  }

  function init() {
    validate();
    wireTabs();
    document.getElementById("startBtn").addEventListener("click", begin);

    /* The save lives in the browser's database now, which has to be opened
       before anybody can ask whether there is one — so the start screen waits
       for it and then decides whether the button says Carry on. */
    var store = ArcadeStore("dragonseed");
    store.ready(function () {
      if (!store.get()) return;
      document.getElementById("startBtn").textContent = "Carry on";
      var reset = document.getElementById("resetBtn");
      reset.hidden = false;
      reset.addEventListener("click", function () {
        if (!confirm("Start the sixteen days over? This clears your book.")) return;
        store.remove(); store.remove("snaps"); store.flush();
        begin();
      });
    });

    /* Landscape only. The CSS does the actual enforcing — #turn covers the
       screen while the window is taller than it is wide — but where the browser
       allows it (installed to the home screen, or in fullscreen) we ask for the
       lock as well, so a phone turns itself instead of asking. It is refused far
       more often than it is granted; a rejected promise here is the normal case
       and means nothing is wrong. */
    try {
      if (screen.orientation && screen.orientation.lock)
        Promise.resolve(screen.orientation.lock("landscape")).catch(function () {});
    } catch (e) { /* not allowed here, and that is fine */ }

    music();

    // escape closes whatever is open, in the usual order
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || document.getElementById("app").hidden) return;
      if (Engine.state.look) Engine.closeLook();
      else if (Engine.state.shelfBig) Engine.setShelfBig(false);
      else if (Engine.state.modal) { if (Engine.state.modal.kind !== "rite") Engine.closeModal(); }
      else if (Engine.state.overlay) Engine.closeOverlay();
      else if (Engine.state.onDesk) Engine.returnToShelf(Engine.state.onDesk);
    });
  }

  /* ---------------- the theme ----------------
   * No mute button, no volume slider, no "music: on" in a settings panel. It is
   * one piece of music that loops, and the only thing that governs it is the
   * tab being in front of you.
   *
   * Nothing is downloaded and nothing is played until the first pointer, touch
   * or key event anywhere on the document — preload="none" on the element, and
   * load() here. That is not only politeness about bandwidth: browsers refuse
   * audio until the page has been interacted with, so the first gesture is the
   * earliest it could have started anyway. If the browser refuses even then
   * (some want a click specifically), the listeners go straight back on and the
   * next gesture tries again.
   *
   * It does not fade in. The file is encoded 6dB down, so it comes in at
   * background level already and a ramp would only be a ramp for its own sake.
   */
  function music() {
    var el = document.getElementById("theme");
    if (!el) return;

    var LEVEL = 0.5;                // on top of the 6dB already taken off the file
    var EVENTS = ["pointerdown", "touchstart", "keydown"];
    var playing = false;            // it has started at least once

    function arm()   { EVENTS.forEach(function (e) { document.addEventListener(e, start, true); }); }
    function disarm(){ EVENTS.forEach(function (e) { document.removeEventListener(e, start, true); }); }

    function start() {
      disarm();
      el.volume = LEVEL;
      var p;
      try { el.load(); p = el.play(); } catch (e) { arm(); return; }
      /* A refused promise means the browser wanted a different kind of gesture,
         so put the listeners back rather than sitting there silent. */
      if (p && p.then) p.then(function () { playing = true; }, function () { arm(); });
      else playing = true;
    }

    /* Somebody who has tabbed away to something else does not want a plant shop
       playing at them out of a window they cannot see. */
    document.addEventListener("visibilitychange", function () {
      /* `playing` and not `el.paused`: after we have paused it for a hidden tab
         those two say the same thing, and reading el.paused here left the music
         off for good once you had tabbed away one time. */
      if (!playing) return;
      if (document.hidden) el.pause();
      else { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
    });

    arm();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
