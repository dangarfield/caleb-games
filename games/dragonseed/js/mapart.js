/* mapart.js — draws Morrowfen as an ink-on-parchment map, one symbol set per
 * terrain code, seeded per square so the coastline never wanders between
 * renders. Pure drawing: it knows nothing about the game.
 *
 * TERRAIN codes (from data.js): s sea · m saltmarsh · h hill · p peak · w wood
 *                               l meadow · r river · v valley · y churchyard
 *                               t town · g moor
 *
 * MapArt.svg() -> markup for a viewBox of cols*100 x rows*100, so square D5 is
 * always the rect at x=300..400, y=400..500. The clickable grid is HTML laid
 * over the top and lines up because both use the same proportions.
 */

const MapArt = (function () {

  var INK   = "#4a4130";
  var LINE  = "#6b5f47";
  var SEA   = "#c3d3d8";
  var WATER = "#a9c4cf";
  var LAND  = "#efe6cd";
  var GREEN = "#dfe3c2";
  var MOOR  = "#e6e0c0";
  var ROCK  = "#ded5bf";

  function seed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }

  var FILL = { s: SEA, m: WATER, h: ROCK, p: ROCK, w: GREEN, l: "#e4ecc6",
               r: WATER, v: GREEN, y: LAND, t: LAND, g: MOOR,
               /* the three grounds she makes */
               a: "#cbc1b0",   /* burnt over */
               b: "#d9d2bd",   /* lake bed */
               c: "#b6ab99" }; /* the gorge */

  function tufts(x, y, rnd, n, colour) {
    var o = [];
    for (var i = 0; i < n; i++) {
      var cx = x + 14 + rnd() * 72, cy = y + 18 + rnd() * 66;
      o.push('<path d="M' + cx + ' ' + cy + ' l-4 -7 M' + cx + ' ' + cy + ' l0 -9 M' + cx + ' ' + cy + ' l4 -7"' +
             ' stroke="' + colour + '" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".5"/>');
    }
    return o.join("");
  }

  function cellArt(code, col, row, rnd) {
    var x = col * 100, y = row * 100, o = [];
    switch (code) {
      case "s":
        for (var i = 0; i < 4; i++) {
          var wy = y + 22 + i * 20, wx = x + 8 + rnd() * 14;
          o.push('<path d="M' + wx + ' ' + wy + ' q10 -6 20 0 t20 0 t20 0" fill="none" stroke="' + LINE +
                 '" stroke-width="1.5" opacity=".42"/>');
        }
        break;
      case "h":
        for (var j = 0; j < 3; j++) {
          var hx = x + 16 + j * 26 + rnd() * 6, hy = y + 42 + rnd() * 30;
          o.push('<path d="M' + hx + ' ' + hy + ' l13 -17 l13 17" fill="none" stroke="' + LINE +
                 '" stroke-width="2.2" stroke-linecap="round" opacity=".72"/>');
        }
        break;
      case "p":
        o.push('<path d="M' + (x + 20) + ' ' + (y + 74) + ' L' + (x + 50) + ' ' + (y + 20) + ' L' + (x + 80) + ' ' + (y + 74) +
               ' z" fill="' + ROCK + '" stroke="' + LINE + '" stroke-width="2.4"/>');
        o.push('<path d="M' + (x + 38) + ' ' + (y + 46) + ' l12 -22 l12 22 l-8 -4 l-8 6 z" fill="#f6f1e2" stroke="' + LINE + '" stroke-width="1"/>');
        break;
      case "w":
        for (var k = 0; k < 5; k++) {
          var tx = x + 14 + rnd() * 70, ty = y + 26 + rnd() * 56;
          o.push('<path d="M' + tx + ' ' + (ty + 12) + ' l0 -6 M' + (tx - 8) + ' ' + (ty + 6) + ' l8 -16 l8 16 z"' +
                 ' fill="#b9c79c" stroke="' + LINE + '" stroke-width="1.3"/>');
        }
        break;
      case "a":                       /* burnt over — stubble and new green */
        for (var a1 = 0; a1 < 7; a1++) {
          var ax = x + 12 + rnd() * 76, ay = y + 22 + rnd() * 58;
          o.push('<path d="M' + ax + ' ' + ay + ' l0 -13" stroke="#5a5348" stroke-width="2" opacity=".7"/>');
          if (a1 % 3 === 0)
            o.push('<path d="M' + (ax + 4) + ' ' + ay + ' l4 -7" stroke="#7fa05e" stroke-width="2" opacity=".85"/>');
        }
        break;
      case "b":                       /* a lake bed, cracked and drying */
        for (var b1 = 0; b1 < 4; b1++) {
          var bx = x + 16 + rnd() * 60, by = y + 24 + rnd() * 54;
          o.push('<path d="M' + bx + ' ' + by + ' l14 6 l10 -8" fill="none" stroke="' + LINE +
                 '" stroke-width="1.4" opacity=".45"/>');
        }
        break;
      case "c":                       /* the gorge */
        o.push('<path d="M' + (x + 22) + ' ' + (y + 16) + ' l14 30 l-10 22 l16 16" fill="none" stroke="' +
               LINE + '" stroke-width="3.2" stroke-linecap="round" opacity=".85"/>');
        o.push('<path d="M' + (x + 58) + ' ' + (y + 14) + ' l-8 26 l12 24 l-6 20" fill="none" stroke="' +
               LINE + '" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>');
        break;
      case "m":
        for (var m = 0; m < 5; m++) {
          var mx = x + 12 + rnd() * 46, my = y + 20 + m * 15 + rnd() * 6;
          o.push('<line x1="' + mx + '" y1="' + my + '" x2="' + (mx + 26) + '" y2="' + my +
                 '" stroke="' + LINE + '" stroke-width="1.8" opacity=".5"/>');
          o.push('<line x1="' + (mx + 34) + '" y1="' + (my + 6) + '" x2="' + (mx + 50) + '" y2="' + (my + 6) +
                 '" stroke="' + LINE + '" stroke-width="1.8" opacity=".38"/>');
        }
        break;
      case "l":
        for (var f2 = 0; f2 < 7; f2++) {
          var fx = x + 14 + rnd() * 70, fy = y + 20 + rnd() * 64;
          o.push('<circle cx="' + fx + '" cy="' + fy + '" r="2.6" fill="#d8a0b4" stroke="' + LINE + '" stroke-width=".7"/>');
        }
        o.push(tufts(x, y, rnd, 2, LINE));
        break;
      case "y":
        o.push('<rect x="' + (x + 24) + '" y="' + (y + 30) + '" width="52" height="42" fill="none" stroke="' + LINE + '" stroke-width="1.4" opacity=".55"/>');
        o.push('<path d="M' + (x + 50) + ' ' + (y + 36) + ' v22 M' + (x + 42) + ' ' + (y + 44) + ' h16" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>');
        for (var st2 = 0; st2 < 3; st2++)
          o.push('<rect x="' + (x + 30 + st2 * 14) + '" y="' + (y + 60) + '" width="6" height="8" rx="3" fill="#cfc4a6" stroke="' + LINE + '" stroke-width="1"/>');
        break;
      case "v":
        for (var v = 0; v < 3; v++)
          o.push('<path d="M' + (x + 8) + ' ' + (y + 30 + v * 20) + ' q42 ' + (16 + v * 4) + ' 84 0" fill="none" stroke="' + LINE +
                 '" stroke-width="1.4" opacity=".38"/>');
        o.push(tufts(x, y, rnd, 2, LINE));
        break;
      case "t":
        o.push('<rect x="' + (x + 30) + '" y="' + (y + 42) + '" width="18" height="16" fill="#e0d3ae" stroke="' + INK + '" stroke-width="1.6"/>');
        o.push('<path d="M' + (x + 28) + ' ' + (y + 42) + ' l11 -10 l11 10 z" fill="#c9b78d" stroke="' + INK + '" stroke-width="1.6"/>');
        o.push('<rect x="' + (x + 54) + '" y="' + (y + 48) + '" width="14" height="12" fill="#e0d3ae" stroke="' + INK + '" stroke-width="1.4"/>');
        o.push('<path d="M' + (x + 52) + ' ' + (y + 48) + ' l9 -8 l9 8 z" fill="#c9b78d" stroke="' + INK + '" stroke-width="1.4"/>');
        break;
      default:
        o.push(tufts(x, y, rnd, 3, LINE));
    }
    return o.join("");
  }

  function svg() {
    /* Draw the valley as it is TODAY. She burns the moor on Wednesday and the
       chart has to agree with the window. */
    var GROUND = (typeof Engine !== "undefined" && Engine.terrainToday) ? Engine.terrainToday() : TERRAIN;
    var cols = GRID.cols.length, rows = GRID.rows;
    var W = cols * 100, H = rows * 100;
    var o = [];

    o.push('<svg class="mapart" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" ' +
           'preserveAspectRatio="none" aria-hidden="true" focusable="false">');
    o.push('<rect width="' + W + '" height="' + H + '" fill="' + LAND + '"/>');

    // terrain fills
    for (var r = 0; r < rows; r++)
      for (var c = 0; c < cols; c++) {
        var code = GROUND[r][c];
        o.push('<rect x="' + (c * 100) + '" y="' + (r * 100) + '" width="100" height="100" fill="' + (FILL[code] || LAND) + '"/>');
      }

    // the coastline, traced along the edge of every sea square
    var coast = [];
    for (var r2 = 0; r2 < rows; r2++)
      for (var c2 = 0; c2 < cols; c2++) {
        if (GROUND[r2][c2] !== "s") continue;
        if (c2 + 1 < cols && GROUND[r2][c2 + 1] !== "s")
          coast.push("M" + ((c2 + 1) * 100) + " " + (r2 * 100) + " v100");
        if (r2 + 1 < rows && GROUND[r2 + 1][c2] !== "s")
          coast.push("M" + (c2 * 100) + " " + ((r2 + 1) * 100) + " h100");
      }
    if (coast.length)
      o.push('<path d="' + coast.join(" ") + '" fill="none" stroke="' + LINE + '" stroke-width="3.2" stroke-linecap="round"/>');

    // terrain symbols
    for (var r3 = 0; r3 < rows; r3++)
      for (var c3 = 0; c3 < cols; c3++)
        o.push(cellArt(GROUND[r3][c3], c3, r3, seed("c" + c3 + "r" + r3)));

    // the river: out of the tarn, down the vale, to the sea
    o.push('<path d="M470 330 C480 400 430 430 440 500 C450 570 470 600 480 660 C492 720 470 760 452 800"' +
           ' fill="none" stroke="' + WATER + '" stroke-width="9" stroke-linecap="round"/>');
    o.push('<path d="M470 330 C480 400 430 430 440 500 C450 570 470 600 480 660 C492 720 470 760 452 800"' +
           ' fill="none" stroke="' + LINE + '" stroke-width="1.6" opacity=".5"/>');
    // the tarn itself
    o.push('<ellipse cx="452" cy="288" rx="34" ry="24" fill="' + WATER + '" stroke="' + LINE + '" stroke-width="2"/>');

    // grid
    for (var g = 1; g < cols; g++)
      o.push('<line x1="' + (g * 100) + '" y1="0" x2="' + (g * 100) + '" y2="' + H + '" stroke="' + INK + '" stroke-width="1" opacity=".2"/>');
    for (var g2 = 1; g2 < rows; g2++)
      o.push('<line x1="0" y1="' + (g2 * 100) + '" x2="' + W + '" y2="' + (g2 * 100) + '" stroke="' + INK + '" stroke-width="1" opacity=".2"/>');
    o.push('<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" fill="none" stroke="' + INK + '" stroke-width="2.5" opacity=".55"/>');

    o.push("</svg>");
    return o.join("");
  }

  return { svg: svg };
})();
