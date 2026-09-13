/* guide.js — "who you're up against", on the start overlay.
 *
 * The point of this panel is RECOGNITION, not information: a player who has
 * seen the actual paper shape once will know what is coming at them the next
 * time it comes. So every row is rendered from designs.js — the same geometry
 * the game flies at you — rather than described in words.
 *
 * How the pictures are made: one small WebGL renderer, off to the side, with
 * preserveDrawingBuffer on so the canvas can be read back. Each actor is built,
 * framed by moving the CAMERA to its bounding box (not by scaling the actor,
 * which would drag its shadow offsets out with it and break the one-light
 * rule), rendered, and copied out as a data URL. Then the whole apparatus is
 * disposed. It costs about a dozen draws, once, and only if the panel is ever
 * opened — it is built lazily on the first open and never again.
 *
 * Every number in here is read out of CFG at build time. Nothing about the
 * roster is written down twice.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { disposeObject } from './paper.js';
import * as DESIGNS from './designs.js';
import { makePickupArt } from './waves.js';

const SHOT_W = 168, SHOT_H = 104;

export function createGuide(container, { rampName = 'STAGE1' } = {}) {
  let built = false;

  function secs(v) { return v.toFixed(1).replace(/\.0$/, '') + 's'; }
  function hp(n) { return n + (n === 1 ? ' hit' : ' hits'); }

  /* The roster, assembled from config so it cannot drift out of step with the
     game. `art` is a thunk: nothing is built unless the panel is opened. */
  /* What a boss actually does, read out of its own script so the panel cannot
     drift away from the fight. Duplicates are dropped and the order is the
     order the player will meet them in. */
  const PATTERN_WORDS = {
    gatling: 'a sweeping stream', fan: 'wide fans with gaps',
    halfWall: 'walls filling half the screen', curtain: 'a curtain with a sliding gap',
    spiral: 'turning spiral arms', bloom: 'expanding rings',
    burst: 'aimed three-round bursts', seeds: 'slow shots that follow you',
    rain: 'shots falling from above', beam: 'a charging beam',
    crossfire: 'two emitters crossing', summon: 'calling in help',
  };

  function bossLine(i) {
    const b = CFG.stages[i].boss;
    const seen = [];
    for (const ph of b.phases) {
      for (const st of ph.steps) {
        const w = PATTERN_WORDS[st[0]] || st[0];
        if (seen.indexOf(w) < 0) seen.push(w);
      }
    }
    const weak = b.weak === 'shutter'
      ? ' Two weak points — the second only opens between attacks, and is worth double.'
      : ' Shoot the gold weak point; the hull soaks almost everything.';
    return 'Stage ' + (i + 1) + '. ' + seen.join(', ') + '.' + weak;
  }

  function rows() {
    const E = CFG.enemies;
    const P = CFG.powerups;
    const R = CFG.stages[0].rampName;
    const out = [
      {
        name: 'Popcorn drone', art: () => DESIGNS.popcornDrone({ rampName, radius: E.drone.radius }),
        line: hp(E.drone.hp) + ' · never shoots · darts in bursts, weaves, zigzags, and some of them drop out of formation and dive straight at you.',
      },
      {
        name: 'Chain worm', art: () => DESIGNS.chainWorm({ rampName, beads: E.worm.beads, radius: E.worm.radius, spread: E.worm.beadGap }),
        line: E.worm.beads + ' linked beads, ' + hp(E.worm.hp) + ' down the whole chain · never shoots · an obstacle that snakes.',
      },
      {
        name: 'Spike mine', art: () => DESIGNS.spikeMine({ rampName, radius: E.mine.radius }),
        line: hp(E.mine.hp) + ' · never shoots, but touching it kills you · leans toward you as it comes, and some ricochet off the walls.',
      },
      {
        name: 'Jelly drifter', art: () => DESIGNS.jellyDrifter({ rampName, size: 7.5 }),
        line: hp(E.jelly.hp) + ' · slow, rises and sinks through a tall column · fires every ' + secs(E.jelly.fireRate) + '.',
      },
      {
        name: 'Wall turret', art: () => DESIGNS.wallTurret({ rampName, size: 8 }),
        line: hp(E.turret.hp) + ' · bolted to the rock, cannot move · tracks you and fires every ' + secs(E.turret.fireRate) + '.',
      },
      {
        name: 'Gunship', art: () => DESIGNS.gunship({ rampName, len: 9 }),
        line: hp(E.gunship.hp) + ' · the heavy · shoves forward and backs off while it fires, every ' + secs(E.gunship.fireRate) + ', and takes real shooting to drop.',
      },
      { head: 'Deeper down' },
      {
        name: 'Urchin', art: () => DESIGNS.urchin({ rampName, radius: E.urchin.radius }),
        line: hp(E.urchin.hp) + ' · clamped to the rock · every ' + secs(E.urchin.fireRate) + ' it fires spines in every direction at once. Do not be hugging the wall.',
      },
      {
        name: 'Angler', art: () => DESIGNS.angler({ rampName, size: 6.5 }),
        line: hp(E.angler.hp) + ' · sits in the dark looking like scenery, with one bright lure · come inside its reach and it charges.',
      },
      {
        name: 'Puffer', art: () => DESIGNS.puffer({ rampName, radius: E.puffer.radius }),
        line: hp(E.puffer.hp) + ' · harmless until you crowd it · then it inflates — that is your warning — and bursts into a ring of spines.',
      },
      {
        name: 'Ray', art: () => DESIGNS.ray({ rampName, size: 5.2 }),
        line: hp(E.ray.hp) + ' · glides in a long arc and lays a mine behind it every ' + secs(E.ray.dropEvery) + ' · what it leaves is the problem.',
      },
      {
        name: 'Baitball', art: () => DESIGNS.baitball({ rampName, size: 6.2 }),
        line: 'A flock that moves as one · shooting it scatters the fish, and they swim back together if you let them. ' + hp(E.baitball.hp) + ' in all.',
      },
      {
        name: 'Crab', art: () => DESIGNS.crab({ rampName, size: 6 }),
        line: hp(E.crab.hp) + ' · walks the floor — or the ceiling, upside down — and fires straight out of the rock every ' + secs(E.crab.fireRate) + '.',
      },
      {
        name: 'Eel', art: () => DESIGNS.eel({ rampName, beads: E.eel.beads, radius: E.eel.radius, spread: E.eel.beadGap }),
        line: E.eel.beads + ' beads, ' + hp(E.eel.hp) + ' · runs along the rock, and lunges when you come level with it. Faster than you are.',
      },
      { head: 'What to pick up' },
      {
        name: 'SPREAD', art: () => makePickupArt('SPREAD', rampName),
        line: 'Three-way shot for ' + secs(P.duration) + '.',
      },
      {
        name: 'SPEED', art: () => makePickupArt('SPEED', rampName),
        line: 'The ship answers faster for ' + secs(P.duration) + '.',
      },
      {
        name: 'SHIELD', art: () => makePickupArt('SHIELD', rampName),
        line: 'Soaks one hit. No timer — it waits until you need it.',
      },
      { note: 'Power-ups fall out of certain enemies — ' + Math.round(P.dropChance * 100) + '% of the time, from the ones carrying something.' },
      { note: 'Every stage speeds up as it goes: more of them, faster, firing more often, right up to the boss. The last half-minute is the hard part.' },
      { head: 'What you’ve got' },
      {
        name: 'The Force pod', art: () => DESIGNS.forcePod({ rampName, radius: CFG.force.radius }),
        line: 'Docked, it eats enemy fire — a shield you choose the side of. Thrown, it parks where it stopped, shoots on its own and grinds anything it touches. It cannot be destroyed.',
      },
      {
        name: 'Wave Cannon', art: () => DESIGNS.playerShip({ rampName, len: 9 }),
        line: 'Hold the beam button and it charges — about ' + secs(CFG.charge.full) + ' for a full one — and it fires when you let go. You keep flying the whole time, so the longer you hold it the longer you are flying without shooting.',
      },
      { head: 'The seven bosses' },
    ];
    for (let i = 0; i < CFG.stages.length; i++) {
      out.push({
        name: CFG.stages[i].boss.label,
        art: i === 0 ? () => DESIGNS.bossHulk({ rampName, radius: CFG.boss.radius }) : null,
        line: bossLine(i),
      });
    }
    out.push({ note: 'Every boss attack has a wind-up you can read — a bar where the beam will land, a tint over the half about to fill. Watch for it and you have a second to be somewhere else.' });
    return out;
  }

  /* One renderer, one scene, one camera, for as long as it takes to take the
     photographs. If WebGL will not give us a second context the panel still
     builds, just without the pictures. */
  function shooter() {
    let canvas, renderer;
    try {
      canvas = document.createElement('canvas');
      canvas.width = SHOT_W;
      canvas.height = SHOT_H;
      renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(SHOT_W, SHOT_H, false);
      renderer.setClearAlpha(0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch (e) {
      return null;
    }
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    const aspect = SHOT_W / SHOT_H;
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    const size = new THREE.Vector3();

    function shoot(obj) {
      scene.add(obj);
      box.setFromObject(obj);
      box.getCenter(centre);
      box.getSize(size);
      // frame by moving the camera, never by scaling the actor
      const half = Math.max(size.y, size.x / aspect) * 0.62 + 0.6;
      cam.left = -half * aspect; cam.right = half * aspect;
      cam.top = half; cam.bottom = -half;
      cam.position.set(centre.x, centre.y, 100);
      cam.updateProjectionMatrix();
      renderer.render(scene, cam);
      let url = '';
      try { url = canvas.toDataURL('image/png'); } catch (e) { url = ''; }
      scene.remove(obj);
      disposeObject(obj);
      return url;
    }
    /* The thumbnails are taken with a SECOND WebGL context. Handing it back
       properly matters: a context that is merely dereferenced sits there until
       the collector notices, and a browser only has a handful to give. */
    function done() {
      try {
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
      } catch (e) {}
    }
    return { shoot, done };
  }

  /* Build the panel. Called once, the first time it is opened. */
  function build() {
    if (built || !container) return;
    built = true;
    const cam = shooter();
    const frag = document.createDocumentFragment();

    for (const r of rows()) {
      if (r.head) {
        const h = document.createElement('div');
        h.className = 'gHead';
        h.textContent = r.head;
        frag.appendChild(h);
        continue;
      }
      if (r.note) {
        const n = document.createElement('div');
        n.className = 'gNote';
        n.textContent = r.note;
        frag.appendChild(n);
        continue;
      }
      const row = document.createElement('div');
      row.className = 'gRow';
      const pic = document.createElement('div');
      pic.className = 'gPic';
      if (cam && r.art) {
        let url = '';
        try { url = cam.shoot(r.art()); } catch (e) { url = ''; }
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          pic.appendChild(img);
        }
      }
      row.appendChild(pic);
      const txt = document.createElement('div');
      txt.className = 'gTxt';
      const b = document.createElement('b');
      b.textContent = r.name;
      const sp = document.createElement('span');
      sp.textContent = r.line;
      txt.appendChild(b);
      txt.appendChild(sp);
      row.appendChild(txt);
      frag.appendChild(row);
    }

    if (cam) cam.done();
    container.appendChild(frag);
  }

  return { build, isBuilt: () => built };
}
