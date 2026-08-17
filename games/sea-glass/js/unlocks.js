// Milestone evaluation. Rewards are granted exactly once and recorded in
// save.milestones so a reload does not re-fire the banner.

import { MILESTONES } from './data.js';

export function progressOf(save, m) {
  const p = m.progress(save);
  return { have: Math.min(p.have, p.need), need: p.need, done: p.have >= p.need };
}

function grant(save, reward) {
  if (!reward) return;
  const bucket = {
    beach: 'beaches', bottle: 'bottles', move: 'moves', title: 'titles',
  }[reward.type];
  if (!bucket) return;
  if (!save.unlocked[bucket].includes(reward.id)) save.unlocked[bucket].push(reward.id);
}

/** Award anything newly earned. Returns the milestones that just fired. */
export function evaluate(save) {
  const fired = [];
  for (const m of MILESTONES) {
    if (save.milestones.includes(m.id)) continue;
    const p = m.progress(save);
    if (p.have >= p.need) {
      save.milestones.push(m.id);
      grant(save, m.reward);
      fired.push(m);
    }
  }
  return fired;
}

/**
 * Backfill on load: re-grant everything already recorded, then silently award
 * anything the save's numbers ALREADY satisfy but never got credited — a save
 * from before a milestone existed would otherwise sit there with the reward
 * locked until the player happened to pick up one more piece. No banners: this
 * is catch-up, not an achievement.
 */
export function reconcile(save) {
  for (const m of MILESTONES) {
    if (save.milestones.includes(m.id)) grant(save, m.reward);
  }
  evaluate(save);
}
