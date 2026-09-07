/* plate.js — PLACEHOLDER ART.
 * Draws every specimen as a botanical plate directly from its own attributes:
 * petal count and colour, flower form, leaf shape, stem, berries, and its mark.
 * Nothing is random between runs — the jitter is seeded from the specimen id —
 * so a plant always looks the same, and always looks like what the book says.
 *
 * These are stand-ins. To swap in real artwork later, give a specimen an
 * `img` field and Plate.svg() will hand back an <img> instead. Nothing else
 * in the game needs to change.
 *
 * Plate.svg(specimen, opts) -> SVG markup string   (opts: {w, h, ink, paper})
 * Plate.silhouette()        -> the "not yet discovered" placeholder
 */

const Plate = (function () {

  var INK   = "#3a3226";
  var PAPER = "none";

  var HEX = {
    blue:"#5b7fb8", purple:"#8a6fae", red:"#b04a41", pink:"#d295aa",
    yellow:"#d9ae3f", white:"#f0ece0", green:"#6f8f5a",
    orange:"#c8792f", brown:"#8a6b4a", black:"#3b3540"
  };
  function col(c) { return HEX[c] || "#888"; }
  function dark(c) {
    // a deeper version of the same hue, for outlines and shading.
    // pale colours need a much harder push or they vanish on cream paper.
    var f = (c === "white") ? 0.42 : (c === "yellow" || c === "pink") ? 0.55 : 0.62;
    var h = col(c).slice(1), n = parseInt(h, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return "rgb(" + ((r*f)|0) + "," + ((g*f)|0) + "," + ((b*f)|0) + ")";
  }
  function strokeW(c) { return c === "white" ? 1.3 : 0.8; }

  /* deterministic per-specimen jitter -------------------------------- */
  function seed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }

  function petalCount(p) {
    if (p.petals === "many") return 14;
    if (typeof p.petals === "number" && p.petals > 0) return p.petals;
    return 0;
  }

  /* ---------------- stems ---------------- */
  function stem(p, rnd, y0, y1) {
    var x = 50, s = [];
    if (p.stem === "none") return "";
    var wob = p.stem === "woody" ? 3.2 : 1.6;
    var d = "M" + x + " " + y1 + " C" + (x - wob) + " " + (y1 - 20) + " " + (x + wob) + " " + (y0 + 20) + " " + x + " " + y0;
    var wdt = p.stem === "woody" ? 3.4 : p.stem === "square" ? 2.8 : 2;
    s.push('<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="' + wdt + '" stroke-linecap="round"/>');
    if (p.stem === "square")
      s.push('<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="0.6" stroke-dasharray="1 3" transform="translate(1.6,0)"/>');
    if (p.stem === "ridged")
      s.push('<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="0.7" transform="translate(-0.7,0)"/>');
    if (p.stem === "hairy")
      for (var i = 0; i < 12; i++) {
        var yy = y0 + (y1 - y0) * (i + 0.5) / 12, dir = i % 2 ? 1 : -1;
        s.push('<line x1="' + x + '" y1="' + yy + '" x2="' + (x + dir * 3.2) + '" y2="' + (yy - 2) + '" stroke="' + INK + '" stroke-width="0.5"/>');
      }
    if (p.stem === "thorned")
      for (var j = 0; j < 7; j++) {
        var ty = y0 + 8 + (y1 - y0 - 10) * j / 7, td = j % 2 ? 1 : -1;
        s.push('<path d="M' + x + ' ' + ty + ' l' + (td * 5) + ' ' + (-3.5) + ' l' + (-td * 4.4) + ' 1.6 z" fill="' + INK + '"/>');
      }
    return s.join("");
  }

  /* ---------------- leaves ---------------- */
  var LEAF = "#5f7a4a";
  function oneLeaf(kind, x, y, dir, sc, rnd) {
    var L = 17 * sc, W = 7 * sc, e = LEAF, out = [];
    var t = 'transform="translate(' + x + ',' + y + ') scale(' + dir + ',1) rotate(' + (12 + rnd() * 14) + ')"';
    switch (kind) {
      case "heart":
        out.push('<path d="M0 0 C' + L*0.5 + ' ' + (-W*1.5) + ' ' + L + ' ' + (-W*0.6) + ' ' + L*0.55 + ' ' + W*0.9 +
                 ' C' + L*0.35 + ' ' + W*1.5 + ' ' + L*0.1 + ' ' + W*0.8 + ' 0 0 z" fill="' + e + '" opacity=".82" ' + t + '/>'); break;
      case "spiky":
        out.push('<path d="M0 0 L' + L*0.45 + ' ' + (-W*0.7) + ' L' + L*0.5 + ' ' + (-W*0.1) + ' L' + L + ' ' + (-W*0.5) +
                 ' L' + L*0.62 + ' ' + W*0.5 + ' L' + L*0.3 + ' ' + W*0.3 + ' z" fill="' + e + '" opacity=".82" ' + t + '/>'); break;
      case "toothed":
        var dpts = "M0 0";
        for (var i = 1; i <= 6; i++) dpts += " L" + (L*i/6) + " " + ((i%2? -W*0.85 : -W*0.35));
        dpts += " L" + L*0.9 + " " + W*0.5 + " L0 0 z";
        out.push('<path d="' + dpts + '" fill="' + e + '" opacity=".82" ' + t + '/>'); break;
      case "feathery":
        for (var f = 1; f <= 6; f++) {
          var fx = L * f / 7;
          out.push('<line x1="' + fx + '" y1="0" x2="' + (fx + 3) + '" y2="' + (-W*0.9) + '" stroke="' + e + '" stroke-width="1" ' + t + '/>');
          out.push('<line x1="' + fx + '" y1="0" x2="' + (fx + 3) + '" y2="' + (W*0.7) + '" stroke="' + e + '" stroke-width="1" ' + t + '/>');
        }
        out.push('<line x1="0" y1="0" x2="' + L + '" y2="' + (-W*0.15) + '" stroke="' + e + '" stroke-width="1.1" ' + t + '/>'); break;
      case "grassy":
        out.push('<path d="M0 0 Q' + L*0.7 + ' ' + (-W*0.5) + ' ' + L*1.5 + ' ' + (-W*1.4) + ' Q' + L*0.7 + ' ' + (-W*0.1) + ' 0 ' + W*0.35 +
                 ' z" fill="' + e + '" opacity=".8" ' + t + '/>'); break;
      case "needle":
        for (var n = 0; n < 5; n++)
          out.push('<line x1="0" y1="0" x2="' + (L*0.8) + '" y2="' + (-W + n * W*0.5) + '" stroke="' + e + '" stroke-width="1.3" stroke-linecap="round" ' + t + '/>');
        break;
      case "lobed":
        out.push('<path d="M0 0 Q' + L*0.3 + ' ' + (-W*1.3) + ' ' + L*0.55 + ' ' + (-W*0.3) + ' Q' + L*0.75 + ' ' + (-W*1.2) + ' ' + L + ' ' + (-W*0.1) +
                 ' Q' + L*0.75 + ' ' + W + ' ' + L*0.45 + ' ' + W*0.6 + ' Q' + L*0.2 + ' ' + W*0.9 + ' 0 0 z" fill="' + e + '" opacity=".82" ' + t + '/>'); break;
      case "waxy":
        out.push('<ellipse cx="' + L*0.52 + '" cy="0" rx="' + L*0.52 + '" ry="' + W*0.95 + '" fill="' + e + '" opacity=".9" ' + t + '/>');
        out.push('<ellipse cx="' + L*0.42 + '" cy="' + (-W*0.3) + '" rx="' + L*0.2 + '" ry="' + W*0.22 + '" fill="rgba(255,255,255,.28)" ' + t + '/>'); break;
      case "paired": case "oval": default:
        out.push('<ellipse cx="' + L*0.5 + '" cy="0" rx="' + L*0.5 + '" ry="' + W*0.8 + '" fill="' + e + '" opacity=".82" ' + t + '/>');
        out.push('<line x1="0" y1="0" x2="' + L + '" y2="0" stroke="rgba(255,255,255,.25)" stroke-width="0.7" ' + t + '/>');
    }
    return out.join("");
  }

  function leaves(p, rnd, yTop, yBot) {
    if (p.leaf === "none") return "";
    if (p.form === "none") { yTop = Math.max(38, yTop - 22); }
    var out = [], rows = p.form === "none" ? 5 : (p.leaf === "grassy" ? 4 : 3);
    for (var i = 0; i < rows; i++) {
      var y = yTop + (yBot - yTop) * (i + 0.7) / (rows + 0.4);
      var sc = 1 - i * 0.13;
      out.push(oneLeaf(p.leaf, 50, y, 1, sc, rnd));
      // "paired" means both sides at the same height; others alternate
      if (p.leaf === "paired" || p.leaf === "grassy" || i % 2 === 1)
        out.push(oneLeaf(p.leaf, 50, y + (p.leaf === "paired" ? 0 : 4), -1, sc, rnd));
    }
    return out.join("");
  }

  /* ---------------- flower heads ---------------- */
  function head(p, rnd, cx, cy) {
    var n = petalCount(p), c = col(p.colour), d = dark(p.colour), out = [];
    var R = 15;

    function radial(len, wide, rot) {
      var s = [];
      for (var i = 0; i < n; i++) {
        var a = (360 / n) * i + (rot || 0);
        s.push('<ellipse cx="0" cy="' + (-len/2) + '" rx="' + wide + '" ry="' + (len/2) +
               '" fill="' + c + '" stroke="' + d + '" stroke-width="' + strokeW(p.colour) + '" transform="rotate(' + a + ')"/>');
      }
      return '<g transform="translate(' + cx + ',' + cy + ')">' + s.join("") + '</g>';
    }
    function point(len, wide, rot) {
      var s = [];
      for (var i = 0; i < n; i++) {
        var a = (360 / n) * i + (rot || 0);
        s.push('<path d="M0 0 L' + (-wide) + ' ' + (-len*0.45) + ' L0 ' + (-len) + ' L' + wide + ' ' + (-len*0.45) +
               ' z" fill="' + c + '" stroke="' + d + '" stroke-width="' + strokeW(p.colour) + '" transform="rotate(' + a + ')"/>');
      }
      return '<g transform="translate(' + cx + ',' + cy + ')">' + s.join("") + '</g>';
    }
    function centre(r) {
      return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + d + '"/>' +
             '<circle cx="' + (cx - r*0.3) + '" cy="' + (cy - r*0.3) + '" r="' + r*0.35 + '" fill="rgba(255,255,255,.3)"/>';
    }

    switch (p.form) {
      case "disc":    out.push(radial(R*1.15, R*0.34), centre(4)); break;
      case "star":    out.push(point(R*1.35, R*0.3), centre(3)); break;
      case "cup": {
        out.push(radial(R*0.95, R*0.42, 180));
        out.push('<ellipse cx="' + cx + '" cy="' + (cy - 3) + '" rx="' + R*0.5 + '" ry="' + R*0.3 + '" fill="' + d + '" opacity=".55"/>');
        break;
      }
      case "bell": {
        for (var b = 0; b < Math.max(1, Math.min(n, 6)); b++) {
          var bx = cx + (b - (Math.min(n,6) - 1) / 2) * 11, by = cy + (b % 2 ? 4 : 0);
          out.push('<path d="M' + (bx-6) + ' ' + by + ' Q' + (bx-7) + ' ' + (by+13) + ' ' + bx + ' ' + (by+15) +
                   ' Q' + (bx+7) + ' ' + (by+13) + ' ' + (bx+6) + ' ' + by + ' z" fill="' + c + '" stroke="' + d + '" stroke-width="' + strokeW(p.colour) + '"/>');
          out.push('<line x1="' + bx + '" y1="' + (by-5) + '" x2="' + bx + '" y2="' + by + '" stroke="' + INK + '" stroke-width="1.1"/>');
        }
        break;
      }
      case "trumpet": {
        for (var t2 = 0; t2 < Math.min(3, Math.max(1, n - 3)); t2++) {
          var tx = cx + (t2 - (Math.min(3, Math.max(1,n-3)) - 1) / 2) * 15;
          out.push('<path d="M' + tx + ' ' + (cy-4) + ' L' + (tx-9) + ' ' + (cy+18) + ' Q' + tx + ' ' + (cy+24) + ' ' + (tx+9) + ' ' + (cy+18) +
                   ' z" fill="' + c + '" stroke="' + d + '" stroke-width="0.8"/>');
          out.push('<ellipse cx="' + tx + '" cy="' + (cy+18) + '" rx="9" ry="3.2" fill="' + d + '" opacity=".5"/>');
        }
        break;
      }
      case "cluster": {
        for (var k = 0; k < 22; k++) {
          var a2 = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 14;
          out.push('<circle cx="' + (cx + Math.cos(a2)*rr) + '" cy="' + (cy + Math.sin(a2)*rr*0.72) +
                   '" r="' + (2.1 + rnd()*1.5) + '" fill="' + c + '" stroke="' + d + '" stroke-width="' + (strokeW(p.colour)*0.6) + '"/>');
        }
        break;
      }
      case "pompom": {
        for (var q = 0; q < 34; q++) {
          var a3 = (Math.PI * 2 / 34) * q, l3 = 8 + rnd() * 7;
          out.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(a3)*l3) + '" y2="' + (cy + Math.sin(a3)*l3) +
                   '" stroke="' + c + '" stroke-width="2" stroke-linecap="round"/>');
        }
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="4" fill="' + d + '"/>');
        break;
      }
      case "spike": {
        for (var s2 = 0; s2 < 7; s2++) {
          var sy = cy + s2 * 7, sw = 8 - s2 * 0.7, sd = s2 % 2 ? 1 : -1;
          out.push('<ellipse cx="' + (cx + sd * 5) + '" cy="' + sy + '" rx="' + sw*0.7 + '" ry="' + sw*0.5 +
                   '" fill="' + c + '" stroke="' + d + '" stroke-width="0.6"/>');
        }
        break;
      }
      case "cap": {
        out.push('<path d="M' + (cx-19) + ' ' + (cy+8) + ' Q' + cx + ' ' + (cy-17) + ' ' + (cx+19) + ' ' + (cy+8) +
                 ' Q' + cx + ' ' + (cy+15) + ' ' + (cx-19) + ' ' + (cy+8) + ' z" fill="' + c + '" stroke="' + d + '" stroke-width="0.9"/>');
        for (var g2 = -3; g2 <= 3; g2++)
          out.push('<line x1="' + (cx + g2*4.6) + '" y1="' + (cy+9) + '" x2="' + (cx + g2*5.2) + '" y2="' + (cy+12.5) + '" stroke="' + d + '" stroke-width="0.6"/>');
        out.push('<path d="M' + (cx-4) + ' ' + (cy+12) + ' L' + (cx-3) + ' ' + (cy+34) + ' L' + (cx+3) + ' ' + (cy+34) + ' L' + (cx+4) + ' ' + (cy+12) +
                 ' z" fill="#e8e0cd" stroke="' + INK + '" stroke-width="0.9"/>');
        break;
      }
      case "frond": {
        for (var fr = -1; fr <= 1; fr++) {
          var fx2 = cx + fr * 13, fy = cy + Math.abs(fr) * 6;
          var dd = "M" + fx2 + " " + (fy + 40) + " C" + (fx2 + fr*10) + " " + (fy+20) + " " + (fx2 + fr*4) + " " + (fy+6) + " " + (fx2 - fr*5) + " " + fy;
          out.push('<path d="' + dd + '" fill="none" stroke="' + c + '" stroke-width="2.4" stroke-linecap="round"/>');
          for (var pn = 1; pn <= 7; pn++) {
            var tt = pn / 8, px = fx2 + fr*10*tt*(1-tt)*3, py = fy + 40 - 40*tt;
            out.push('<line x1="' + px + '" y1="' + py + '" x2="' + (px + 6*(1-tt) + 2) + '" y2="' + (py - 3) + '" stroke="' + c + '" stroke-width="1.4" stroke-linecap="round"/>');
            out.push('<line x1="' + px + '" y1="' + py + '" x2="' + (px - 6*(1-tt) - 2) + '" y2="' + (py - 3) + '" stroke="' + c + '" stroke-width="1.4" stroke-linecap="round"/>');
          }
          out.push('<circle cx="' + (fx2 - fr*5) + '" cy="' + fy + '" r="2.6" fill="none" stroke="' + c + '" stroke-width="1.8"/>');
        }
        break;
      }
      case "none": default: break;
    }
    return out.join("");
  }

  /* ---------------- berries & marks ---------------- */
  var BERRY_HEX = { red:"#a8332c", black:"#2b2630", yellow:"#d4b12e", orange:"#c8792f" };
  function berries(p, rnd, cx, cy) {
    if (p.berry === "none") return "";
    var f = BERRY_HEX[p.berry] || "#a8332c", out = [];
    for (var i = 0; i < 5; i++) {
      var a = -0.35 + i * 0.5, bx = cx + Math.cos(a) * 13, by = cy + 40 + Math.sin(a) * 9;
      out.push('<line x1="' + cx + '" y1="' + (cy+32) + '" x2="' + bx + '" y2="' + by + '" stroke="' + LEAF + '" stroke-width="0.8"/>' +
                 '<circle cx="' + bx + '" cy="' + by + '" r="3.4" fill="' + f + '" stroke="' + INK + '" stroke-width="0.5"/>');
      out.push('<circle cx="' + (bx-1) + '" cy="' + (by-1) + '" r="0.9" fill="rgba(255,255,255,.45)"/>');
    }
    return out.join("");
  }

  function mark(p, rnd, cx, cy, uid) {
    switch (p.mark) {
      case "glows":
        return '<defs><radialGradient id="g' + uid + '"><stop offset="0" stop-color="' + col(p.colour) + '" stop-opacity=".55"/>' +
               '<stop offset="1" stop-color="' + col(p.colour) + '" stop-opacity="0"/></radialGradient></defs>' +
               '<circle cx="' + cx + '" cy="' + cy + '" r="34" fill="url(#g' + uid + ')"/>';
      case "frost": {
        var s = [];
        for (var i = 0; i < 9; i++) s.push('<circle cx="' + (cx - 26 + rnd()*52) + '" cy="' + (cy - 16 + rnd()*54) + '" r="1.6" fill="#cfe2f0" stroke="#8fb4cd" stroke-width="0.4"/>');
        return s.join("");
      }
      case "moves":
        return '<path d="M' + (cx+22) + ' ' + (cy+6) + ' q7 -6 0 -12" fill="none" stroke="' + INK + '" stroke-width="1" opacity=".5" stroke-dasharray="2 2"/>' +
               '<path d="M' + (cx-22) + ' ' + (cy+14) + ' q-7 -6 0 -12" fill="none" stroke="' + INK + '" stroke-width="1" opacity=".5" stroke-dasharray="2 2"/>';
      case "fuzzy": {
        var h = [];
        for (var j = 0; j < 16; j++) {
          var y = cy + 20 + j * 3.4, d2 = j % 2 ? 1 : -1;
          h.push('<line x1="50" y1="' + y + '" x2="' + (50 + d2*5) + '" y2="' + (y-2.5) + '" stroke="' + INK + '" stroke-width="0.5" opacity=".7"/>');
        }
        return h.join("");
      }
      case "reacts":
        return '<circle cx="' + cx + '" cy="' + (cy+26) + '" r="17" fill="none" stroke="' + INK + '" stroke-width="2.5" opacity=".14" stroke-dasharray="3 4"/>';
      case "sticky": {
        var d3 = [];
        for (var k = 0; k < 5; k++) d3.push('<ellipse cx="' + (cx - 16 + k*8) + '" cy="' + (cy + 26 + (k%2)*5) + '" rx="1.5" ry="2.4" fill="rgba(255,255,255,.55)" stroke="' + INK + '" stroke-width="0.4"/>');
        return d3.join("");
      }
      case "shimmer":
        return '<path d="M' + (cx-24) + ' ' + (cy-14) + ' L' + (cx+24) + ' ' + (cy+10) + '" stroke="rgba(255,255,255,.5)" stroke-width="5" opacity=".5"/>';
      case "weeps":
        return '<path d="M50 ' + (cy+30) + ' q0 6 0 9 q-2.6 0 -2.6 -3 q0 -3 2.6 -6 z" fill="rgba(255,255,255,.6)" stroke="' + INK + '" stroke-width="0.4"/>';
      default: return "";
    }
  }

  /* ---------------- assembly ---------------- */
  var cache = {};
  function svg(p, opts) {
    opts = opts || {};
    var key = p.id + "|" + (opts.w || 0) + "|" + (opts.h || 0);
    if (cache[key]) return cache[key];

    var rnd = seed(p.id);
    var uid = p.id.replace(/[^a-z0-9]/gi, "");
    var isCap = p.form === "cap";
    var headY = isCap ? 34 : 34;
    var stemTop = isCap ? 128 : 46, stemBot = 124;

    var body = [];
    body.push(mark(p, seed(p.id + "m"), 50, headY, uid));           // glow sits behind
    if (!isCap) body.push(stem(p, rnd, stemTop, stemBot));
    if (!isCap) body.push(leaves(p, seed(p.id + "l"), 58, 118));
    body.push(head(p, seed(p.id + "h"), 50, headY));
    body.push(berries(p, seed(p.id + "b"), 50, headY));
    if (p.mark === "fuzzy" || p.mark === "sticky" || p.mark === "weeps")
      body.push(mark(p, seed(p.id + "m2"), 50, headY, uid + "b"));

    var w = opts.w || 100, h = opts.h || 130;
    var out = '<svg class="plate" viewBox="0 0 100 130" width="' + w + '" height="' + h +
      '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(p.name) + '" focusable="false">' +
      body.join("") + '</svg>';
    cache[key] = out;
    return out;
  }

  function silhouette(opts) {
    opts = opts || {};
    var w = opts.w || 100, h = opts.h || 130;
    return '<svg class="plate plate--unknown" viewBox="0 0 100 130" width="' + w + '" height="' + h +
      '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="unidentified specimen" focusable="false">' +
      '<path d="M50 124 C46 96 46 74 50 52" fill="none" stroke="' + INK + '" stroke-width="2" opacity=".33" stroke-linecap="round"/>' +
      '<ellipse cx="38" cy="86" rx="10" ry="4.6" fill="' + INK + '" opacity=".26" transform="rotate(-18 38 86)"/>' +
      '<ellipse cx="62" cy="98" rx="10" ry="4.6" fill="' + INK + '" opacity=".26" transform="rotate(18 62 98)"/>' +
      '<circle cx="50" cy="42" r="17" fill="' + INK + '" opacity=".18"/>' +
      '<text x="50" y="49" text-anchor="middle" font-size="20" font-weight="700" fill="' + INK + '" opacity=".5">?</text>' +
      '</svg>';
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]; }); }

  /* Real artwork wins wherever there is any. `art` is the painted specimen —
     the desk, the shelf, the counter, the modal; `book` is the line-drawn
     plate that belongs on the page. Either falls back to the drawing above
     when the picture does not exist, so a half-finished art set is fine. */
  /* The painted plates are SQUARE (512x512). The drawn ones are 100x130. So a
     caller asks for the box it has room for and gets the biggest square that
     fits inside it — never a 3:4 letterbox with a small plant marooned in it. */
  function picture(p, url, opts) {
    var w = (opts && opts.w) || 100, h = (opts && opts.h) || 130;
    var s = Math.max(w, h);
    if (opts && opts.fit === "width")  s = w;
    if (opts && opts.fit === "height") s = h;
    /* draggable="false": an <img> is natively draggable, and the browser's own
       drag hijacks the pointer gesture the moment you try to pull a specimen
       off the desk or a pot off the shelf. The SVG plates never had this. */
    return '<img class="plate plate--art" src="' + esc(url) + '" width="' + s +
           '" height="' + s + '" alt="' + esc(p.name) + '" draggable="false"' +
           ' loading="lazy" decoding="async">';
  }

  function art(p, opts) {
    if (!p) return silhouette(opts);
    var url = p.img || (typeof Art !== "undefined" && Art.plant(p.id));
    return url ? picture(p, url, opts) : svg(p, opts);
  }

  function book(p, opts) {
    if (!p) return silhouette(opts);
    /* easy plant mode puts the painted picture on the page too, so the book and
       the shelf show the same thing and only the words have to be matched */
    if (typeof Engine !== "undefined" && Engine.state && Engine.state.easyPlants)
      return art(p, opts);
    var url = (typeof Art !== "undefined" && Art.book(p.id));
    return url ? picture(p, url, opts) : art(p, opts);
  }

  return { svg: svg, art: art, book: book, silhouette: silhouette, colour: col, esc: esc };
})();
