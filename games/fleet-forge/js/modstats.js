/* modstats.js — what a module's numbers ARE, in one place.
 *
 * Two things read this: the row in the module bay, which has space for the two
 * that matter most plus the power draw, and the MODULE STATS card, which has
 * room for six. They must agree — a row that says one thing and a card that
 * says another is worse than either — so the table is written once and the row
 * is simply its first two entries.
 *
 * SIX PER GROUP, ALWAYS AN EVEN NUMBER, because the card lays them out two to a
 * line and a seventh would hang. Where the data cannot honestly fill six (the
 * warp drive has a power draw and nothing else) the group is four, not six with
 * two invented rows.
 *
 * EVERY FIELD HERE IS ONE THE SIM READS. A number that exists in the data and
 * is never used in a fight is not a stat, it is trivia: `cost`, `hardCost`,
 * `techTreeIndex` and the source game's own `requiredLevel` are all left out.
 */
var ModStats = (function () {

  function n(v) {
    if (v === undefined || v === null || v !== v) return '0';
    return (Math.abs(v % 1) > 0.001) ? v.toFixed(1) : String(Math.round(v));
  }
  function pct(v) { return Math.round((v || 0) * 100) + '%'; }
  function cells(m) { return m.width + '×' + m.height; }

  /* Damage a second. `attackSpeed` is the INTERVAL between shots, not a rate —
     0.3 on a Chaingun is three and a third shots a second — and `damage` is per
     shot for every weapon including a laser, whose `damage` is the whole burst.
     Same arithmetic `Geom.summarise` uses, so the card and the fit total can
     never disagree. */
  function dps(m) { return (m.damage || 0) / (m.attackSpeed > 0 ? m.attackSpeed : 0.5); }

  /* Damage and how often, as one line, because neither means much alone: a
     railgun at 19 a shot and a chaingun at 4 are the same gun until you know
     how fast they cycle. */
  function dmgRate(m) {
    if (!(m.attackSpeed > 0)) return n(m.damage);
    var r = 1 / m.attackSpeed;
    /* A Doomsday Laser cycles every 34 seconds. As a rate that is 0.0/s, which
       is both wrong-looking and useless, so anything slower than one shot in
       five seconds states its interval instead. */
    return n(m.damage) + (r >= 0.2 ? ' ×' + n(r) + '/s'
                                   : ' /' + n(m.attackSpeed) + 's');
  }


  /* Whether a shot carries on through into the module behind. The sim works it
     out as `recoilPush / impactPush` and it is the widest-spread thing about a
     ballistic weapon — a Chaingun is 0% and a Gaussian Shotgun is 100% — so it
     is worth a row of its own and neither raw field is. */
  function pierce(m) {
    return m.impactPush > 0 ? Math.min(1, (m.recoilPush || 0) / m.impactPush) : 1;
  }

  function arc(m) { return (m.fireCone || 0) >= 180 ? 'turret' : n(m.fireCone) + '°'; }
  function power(m) {
    var g = m.powerGeneration || 0, u = m.powerUse || 0;
    return g > u ? '+' + n(g - u) : n(u - g);
  }

  /* The repair bay and the warp drive carry NO numbers of their own — the sim
     holds them as constants in `sim/modules.js`. Mirrored here rather than
     read, because a module file cannot reach into the sim; if those constants
     move, these move with them. */
  var SIM = { repairRate: 9, repairCap: 2500, repairBays: 3, warpCool: 5 };

  /* tone: '' plain, 'key' the module's own category colour, 'pwr' the power
     green. The card colours by tone; the row ignores it. */
  /* `b` is a shorter value for the bay row, where three stats have to share a
     line 150 pixels wide in 10px mono. Only the compound ones need it: the
     card has room to say "4 ×3.3/s" and the row does not. */
  function K(k, v, tone, b) { return { k: k, v: v, tone: tone || '', b: b }; }

  function table(m) {
    var st = m.subtype;

    if (st === 'weapon') {
      var dt = m.damageType;
      if (dt === 'missile') return [
        K('DPS', n(dps(m)), 'key'), K('DMG', dmgRate(m), '', n(m.damage)),
        K('SALVO', n(m.missileCount || 1)), K('BLAST', n(m.missileExplosionRadius)),
        K('RANGE', n(m.range)), K('PWR', power(m), 'pwr')
      ];
      if (dt === 'laser') return [
        K('DPS', n(dps(m)), 'key'), K('DMG', dmgRate(m), '', n(m.damage)),
        K('BEAM', n(m.maxShootDuration) + 's'), K('RANGE', n(m.range)),
        K('ARC', arc(m)), K('PWR', power(m), 'pwr')
      ];
      return [
        K('DPS', n(dps(m)), 'key'), K('DMG', dmgRate(m), '', n(m.damage)),
        K('RANGE', n(m.range)), K('ARC', arc(m)),
        K('PIERCE', pct(pierce(m))), K('PWR', power(m), 'pwr')
      ];
    }

    if (st === 'armor') return [
      K('HP', n(m.health), 'key'), K('ARMOUR', n(m.armor)),
      K('REFLECT', pct(m.reflect)), K('PWR', power(m), 'pwr'),
      K('MASS', n(m.mass)), K('CELLS', cells(m))
    ];

    if (st === 'shield') return [
      K('STRENGTH', n(m.shieldStrength), 'key'), K('RADIUS', n(m.shieldRadius)),
      K('REGEN', n(m.shieldRegenSpeed) + '/s', '', n(m.shieldRegenSpeed)), K('PWR', power(m), 'pwr'),
      K('HP', n(m.health)), K('MASS', n(m.mass))
    ];

    if (st === 'reactor') return [
      K('PWR', '+' + n(m.powerGeneration), 'key'), K('BLAST', n(m.explosionRadius)),
      K('BLAST DMG', n(m.explosionDamage)), K('HP', n(m.health)),
      K('MASS', n(m.mass)), K('CELLS', cells(m))
    ];

    /* Thrust stays on the card at zero. Two of the seven engines make none —
       they are pure turn rate — and a missing row would read as a bug rather
       than as the point of the module. */
    if (st === 'engine') return [
      K('THRUST', n(m.thrustPower), 'key'), K('TURN', n(m.turnSpeed)),
      K('PWR', power(m), 'pwr'), K('HP', n(m.health)),
      K('MASS', n(m.mass)), K('CELLS', cells(m))
    ];

    if (st === 'pointdefense') return [
      K('RADIUS', n(m.pdRadius), 'key'), K('vs MISS', pct(m.pdMissileShootDownChance)),
      K('vs MINE', pct(m.pdMineShootDownChance)), K('vs TORP', pct(m.pdTorpedoShootDownChance)),
      K('PWR', power(m), 'pwr'), K('HP', n(m.health))
    ];

    if (st === 'afterburner') return [
      K('SPEED', '×' + n(m.movementBoost), 'key'), K('TURN', '×' + n(m.turnBoost)),
      K('DURATION', n(m.duration) + 's'), K('COOLDOWN', n(m.cooldown) + 's'),
      K('PWR', power(m), 'pwr'), K('HP', n(m.health))
    ];

    if (st === 'mine') return [
      K('DPS', n(dps(m)), 'key'), K('DMG', dmgRate(m), '', n(m.damage)),
      K('RANGE', n(m.range)), K('BLAST', n(m.impactPush)),
      K('PWR', power(m), 'pwr'), K('HP', n(m.health))
    ];

    if (st === 'repair') return [
      K('REPAIRS', SIM.repairRate + ' HP/s', 'key', String(SIM.repairRate)), K('CAPACITY', String(SIM.repairCap)),
      K('MAX BAYS', String(SIM.repairBays)), K('PWR', power(m), 'pwr'),
      K('HP', n(m.health)), K('CELLS', cells(m))
    ];

    if (st === 'junk') return [
      K('RATE', m.attackSpeed > 0 ? n(1 / m.attackSpeed) + '/s' : '—', 'key'),
      K('RANGE', n(m.range)), K('PWR', power(m), 'pwr'),
      K('HP', n(m.health)), K('MASS', n(m.mass)), K('CELLS', cells(m))
    ];

    /* The warp drive, and anything the data has not met yet. Four, because
       four is what there is. */
    if (st === 'warp') return [
      K('COOLDOWN', '~' + SIM.warpCool + 's', 'key'), K('PWR', power(m), 'pwr'),
      K('HP', n(m.health)), K('MASS', n(m.mass))
    ];

    return [
      K('HP', n(m.health), 'key'), K('MASS', n(m.mass)),
      K('PWR', power(m), 'pwr'), K('CELLS', cells(m))
    ];
  }

  /* The bay row: the two that matter most, then the draw. The two come off the
     front of the same table the card shows, so the row can never claim a stat
     the card does not. PWR is always last and always present — it is the one
     number every module is judged against. */
  /* Short labels, for the row only. The card has 216 pixels and says ARMOUR;
     the row has about 144 and three stats to get into them, so it says ARM.
     Anything not in here is already short enough. The row still truncates with
     an ellipsis where a value runs long, which is what the handoff's own row
     does. */
  var SHORT = {
    'STRENGTH': 'STR', 'RADIUS': 'RAD', 'RANGE': 'RNG', 'REFLECT': 'REF',
    'ARMOUR': 'ARM', 'THRUST': 'THR', 'TURN': 'TRN', 'PIERCE': 'PRC',
    'SALVO': 'SLV', 'BLAST': 'BLST', 'BLAST DMG': 'BDMG', 'CELLS': 'CEL',
    'MASS': 'MAS', 'SPEED': 'SPD', 'REGEN': 'REG', 'DURATION': 'DUR',
    'COOLDOWN': 'CD', 'CAPACITY': 'CAP', 'MAX BAYS': 'BAYS', 'REPAIRS': 'RPR',
    'vs MISS': 'MSL', 'vs MINE': 'MINE', 'vs TORP': 'TRP'
  };

  /* Row-only number shortening. The card can afford "117.6" and "1500"; the
     row has about twenty-five characters for three stats and their labels, so
     it drops the decimal and says 1.5k. Only touches values that are plainly a
     number — "×3.3/s", "35°" and "30%" are left alone. */
  function compact(v) {
    if (!/^[+-]?[0-9]+(\.[0-9]+)?$/.test(v)) return v;
    var sign = v.charAt(0) === '+' ? '+' : '';
    var x = parseFloat(v);
    if (Math.abs(x) >= 1000) {
      var k = x / 1000;
      return sign + (Math.abs(k) >= 10 ? Math.round(k) : k.toFixed(1).replace('.0', '')) + 'k';
    }
    return sign + String(Math.round(x));
  }

  function brief(m) {
    var t = table(m), out = [], pwr = null, i;
    /* Keyed on the LABEL, not the tone: a reactor's power is its headline stat
       and carries the `key` tone, so a tone test dropped it from the top two
       and then found nothing to append, and the row came out a stat short. */
    for (i = 0; i < t.length; i++) if (t[i].k === 'PWR') { pwr = t[i]; break; }
    for (i = 0; i < t.length && out.length < 2; i++) {
      if (t[i] === pwr) continue;
      out.push((SHORT[t[i].k] || t[i].k) + ' ' +
                compact(t[i].b === undefined ? t[i].v : t[i].b));
    }
    if (pwr) out.push('PWR ' + compact(pwr.v));
    return out.join(' · ');
  }


  /* The row in two pieces, because the power draw must never be the thing that
     gets cut. As one string it was: the line is about twenty characters wide
     and three labelled stats do not fit, so the ellipsis always landed on the
     last value — the one number every module is judged against. The two stats
     go left and truncate; PWR is right-aligned against the same edge the name
     uses and is always whole. */
  function briefParts(m) {
    var t = table(m), out = [], pwr = null, i;
    for (i = 0; i < t.length; i++) if (t[i].k === 'PWR') { pwr = t[i]; break; }
    for (i = 0; i < t.length && out.length < 2; i++) {
      if (t[i] === pwr) continue;
      out.push((SHORT[t[i].k] || t[i].k) + ' ' +
               compact(t[i].b === undefined ? t[i].v : t[i].b));
    }
    return { left: out.join(' \u00b7 '), pwr: pwr ? 'PWR ' + compact(pwr.v) : '' };
  }

  /* What the card's badge says — the family a player would name it by. */
  function label(m) {
    if (m.subtype === 'weapon') return (m.damageType || 'weapon').toUpperCase();
    if (m.subtype === 'pointdefense') return 'POINT DEF';
    return String(m.subtype || '').toUpperCase();
  }

  return { table: table, brief: brief, briefParts: briefParts, label: label, dps: dps };
})();
