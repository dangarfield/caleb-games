/* clues.js — deduction helpers. No DOM, no state mutation.
 * Turns attribute values into readable words, decides whether a specimen
 * answers a visitor, and drives the book's FILTER (not a solver — see
 * FILTER_CAP below).
 */

const Clues = (function () {

  /* The book's filter is a tool, not an answer machine. Applying every axis
   * at once would always leave exactly one page, which is the game playing
   * itself. Three is enough to be genuinely useful and never enough to
   * finish the job for you. */
  var FILTER_CAP = 3;

  function specimenById(id) { return SPECIMENS.find(function (s) { return s.id === id; }); }
  function habitatById(id)  { return HABITATS.find(function (h) { return h.id === id; }); }

  /* readable label for one attribute value */
  function attrText(key, value) {
    var t = PHRASE[key] && PHRASE[key][value];
    if (t) return t;
    if (key === "petals") return value + (value === 1 ? " petal" : " petals");
    if (key === "colour") return String(value);
    if (key === "form")   return String(value);
    if (key === "scent")  return "smells " + value;
    if (key === "berry")  return value + " berries";
    return String(value);
  }

  /* short chip label, for the pinned observations */
  function chipText(key, value) {
    if (key === "colour") return value;
    if (key === "petals") return value === 0 ? "no petals" : value + " petals";
    if (key === "form")   return value;
    return attrText(key, value);
  }

  function effectText(e) { return EFFECTS[e] || e; }

  /* ---- does this specimen answer this visitor? ------------------------
   * describe : the visitor named a set of attributes; the specimen must have
   *            all of them (validated at build time to resolve to exactly one).
   * effect   : ANY specimen with the needed effect will do. A visitor who asks
   *            for "something that breaks a fever" does not care which plant
   *            it is, and this is much kinder to a young player.
   * fork     : either listed option, with different consequences.
   */
  /* Species is half of an effect request. "both" cuts either way. */
  function fitsWho(specimen, who) {
    if (!who || who === "both") return true;
    return specimen.species === who || specimen.species === "both";
  }

  function answers(specimen, visitor) {
    if (!specimen || !visitor) return false;
    if (visitor.kind === "effect")
      return specimen.effect === visitor.needs && fitsWho(specimen, visitor.who);
    if (visitor.kind === "fork" || visitor.kind === "describe")
      return (visitor.accepts || []).indexOf(specimen.id) !== -1;
    return false;
  }

  function forkOutcome(visitor, specimenId) {
    if (!visitor.fork) return null;
    return visitor.fork.find(function (f) { return f.plant === specimenId; }) || null;
  }

  /* the canonical answer, used only by the paid hint */
  function canonical(visitor) {
    if (visitor.accepts && visitor.accepts.length) return specimenById(visitor.accepts[0]);
    if (visitor.kind === "effect")
      return SPECIMENS.find(function (s) {
        return s.effect === visitor.needs && fitsWho(s, visitor.who); });
    return null;
  }
  function speciesText(sp) { return SPECIES_SAY[sp] || sp; }

  /* ---- the book filter ------------------------------------------------
   * `filter` is { axis: value } chosen BY THE PLAYER from what they have
   * observed. Never applied automatically.
   */
  function filterCap() { return FILTER_CAP; }

  function passesFilter(specimen, filter) {
    return Object.keys(filter).every(function (k) { return specimen[k] === filter[k]; });
  }

  function countMatching(list, filter) {
    return list.filter(function (s) { return passesFilter(s, filter); }).length;
  }

  /* Free-text search over a page: the drawing's description and what the plant
   * is FOR — every page carries its use, named or not, so searching "fever"
   * finds the thing that breaks one whether or not you have worked out what it
   * is called. The NAME and binomial only match on pages you have filled in;
   * otherwise typing a name you had merely guessed would confirm it for you.
   * `known` is passed in so this stays state-free and testable on its own. */
  function search(specimen, q, known) {
    if (!q) return true;
    q = q.toLowerCase();
    /* "dragon" and "for people" are searches too — species is half of every
       effect request, so it has to be findable the same way the use is. */
    var hay = specimen.plate + " " + specimen.use + " " +
              effectText(specimen.effect) + " " + specimen.effect + " " +
              specimen.species + " " + speciesText(specimen.species) +
              (specimen.species === "dragon" ? " dragons dragon" :
               specimen.species === "both" ? " dragons people" : " people");
    if (known) hay += " " + specimen.name + " " + specimen.binomial;
    return hay.toLowerCase().indexOf(q) !== -1;
  }

  /* Every use written in the pages you hold, sorted by its readable phrasing so
   * the picker reads like a list of jobs rather than a list of keys. */
  function effectsIn(list) {
    var seen = {};
    list.forEach(function (s) { seen[s.effect] = true; });
    return Object.keys(seen)
      .map(function (e) { return { key: e, label: effectText(e) }; })
      .sort(function (a, b) { return a.label.localeCompare(b.label); });
  }

  /* Which attributes has the player revealed but not yet used as a filter?
   * Used only to offer chips — the player still chooses. */
  function offerableChips(revealed, filter) {
    return Object.keys(revealed || {})
      .filter(function (k) { return !(k in filter); })
      .map(function (k) { return { axis: k, value: revealed[k], label: chipText(k, revealed[k]) }; });
  }

  return {
    fitsWho: fitsWho, speciesText: speciesText,
    specimenById: specimenById, habitatById: habitatById,
    attrText: attrText, chipText: chipText, effectText: effectText,
    answers: answers, forkOutcome: forkOutcome, canonical: canonical,
    filterCap: filterCap, passesFilter: passesFilter, countMatching: countMatching,
    search: search, effectsIn: effectsIn, offerableChips: offerableChips
  };
})();
