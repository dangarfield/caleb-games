// Generates the seven day plans from the hand-authored obstacles.json.
//
// Run once: `node tools/make-days.mjs`. Everything is seeded, so re-running it
// reproduces the same seven files byte for byte — Monday has to be the same
// Monday every time anyone replays it.
//
// The week builds: Monday is the smallest set and each day KEEPS the day
// before and adds seven more, so a boy who has learned Monday still recognises
// Saturday. Every day carries all twelve paper pickups (they are his ammo), and
// each day nudges its obstacles within half a unit or so of where they were
// authored, so the days feel hand-placed rather than identical.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src', 'obstacles.json');
const OUT = join(here, '..', 'src', 'plans');

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const FIRST_DAY = 40;      // obstacles on Monday
const PER_DAY = 7;         // added each day after that
const JITTER_X = 1.2;      // how far an obstacle may drift from its authored spot
const JITTER_Z = 0.9;
const SEED = 0x50415045;   // "PAPE"

// mulberry32: small, fast, and identical everywhere.
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const shuffled = (list, rand) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
};

const src = JSON.parse(readFileSync(SRC, 'utf8')).plan;
const papers = src.filter(e => e.type === 'papers');
const hazards = src.filter(e => e.type !== 'papers');

// The week needs more obstacles than were authored, so fill the biggest empty
// stretches of street with copies of hazards from elsewhere in the plan.
function extras(count, rand) {
    const xs = src.map(e => e.spawn.x).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push({ at: (xs[i - 1] + xs[i]) / 2, size: xs[i] - xs[i - 1] });
    gaps.sort((a, b) => b.size - a.size);
    const donors = shuffled(hazards, rand);
    const out = [];
    for (let i = 0; i < count; i++) {
        const gap = gaps[i % gaps.length];
        const donor = donors[i % donors.length];
        const dx = gap.at - donor.spawn.x;
        out.push({
            ...structuredClone(donor),
            id: `x${i + 1}`,
            spawn: { ...donor.spawn, x: +gap.at.toFixed(2) },
            trigger: { ...donor.trigger, x: +(donor.trigger.x + dx).toFixed(2) },
            waypoints: donor.waypoints.map(w => ({ x: +(w.x + dx).toFixed(2), z: w.z })),
        });
    }
    return out;
}

const rand = rng(SEED);
const pool = shuffled(hazards, rand);
const needed = FIRST_DAY + PER_DAY * (DAYS.length - 1) - papers.length;   // hazards for Sunday
const filled = pool.concat(extras(Math.max(0, needed - pool.length), rng(SEED ^ 0x9e3779b9)));

// Day 1 is the papers plus the first slice of the pool; each later day extends it.
function hazardsFor(day) {
    return filled.slice(0, FIRST_DAY - papers.length + PER_DAY * day);
}

// Same obstacle, slightly different spot each day. Seeded on the day and the id
// so it is stable per file and never drifts far enough to break a crossing.
function place(entity, day) {
    const r = rng(SEED ^ (day * 2654435761) ^ [...entity.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
    const dx = +((r() - 0.5) * JITTER_X).toFixed(2);
    const dz = +((r() - 0.5) * JITTER_Z).toFixed(2);
    return {
        id: entity.id,
        type: entity.type,
        spawn: {
            x: +(entity.spawn.x + dx).toFixed(2),
            y: entity.spawn.y,
            z: +(entity.spawn.z + dz).toFixed(2),
        },
        dir: entity.dir,
        // The trigger keeps its lead on the spawn, so things still start moving
        // the same distance before he arrives.
        trigger: { x: +(entity.trigger.x + dx).toFixed(2), z: entity.trigger.z },
        repeat: entity.repeat,
        // Waypoints move with the body, or a crossing would start off to one side.
        waypoints: entity.waypoints.map(w => ({ x: +(w.x + dx).toFixed(2), z: +(w.z + dz).toFixed(2) })),
    };
}

let report = [];
for (let day = 0; day < DAYS.length; day++) {
    const chosen = papers.concat(hazardsFor(day));
    const plan = chosen
        .map(e => place(e, day))
        .sort((a, b) => a.spawn.x - b.spawn.x);
    const file = join(OUT, `day${day + 1}.json`);
    writeFileSync(file, `${JSON.stringify({ day: day + 1, label: DAYS[day], count: plan.length, plan }, null, 2)}\n`);
    report.push(`day${day + 1} ${DAYS[day].padEnd(9)} ${plan.length} obstacles (${plan.length - papers.length} hazards + ${papers.length} papers)`);
}
console.log(report.join('\n'));
