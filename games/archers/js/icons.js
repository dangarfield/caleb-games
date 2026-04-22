// icons.js - Preload skill icon images for canvas rendering
import { ALL_SKILLS } from './skills.js';

const iconImages = {}; // id -> Image (loaded) or null
let loaded = false;

export function preloadIcons() {
  if (loaded) return;
  loaded = true;
  for (const skill of ALL_SKILLS) {
    const img = new Image();
    img.src = 'icons/' + skill.id + '.png';
    img.onerror = () => { iconImages[skill.id] = null; };
    img.onload = () => { iconImages[skill.id] = img; };
    iconImages[skill.id] = img; // store immediately; check .complete when drawing
  }
}

// Returns the loaded Image for a skill id, or null if not available yet / missing
export function getSkillIcon(id) {
  const img = iconImages[id];
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}
