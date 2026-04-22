// enemyAI.js - Movement AI functions for new-system enemies
// Each AI function: (e, p, dt, arena, obstacles) → updates e.x, e.y and internal timers
import { dist, clamp } from './utils.js';
import { pushOutRect } from './utils.js';
import { T } from './arena.js';

// ─── AI dispatcher ───
export function updateEnemyMovement(e, p, dt, a, obstacles) {
  const aiFn = AI_FUNCTIONS[e.ai];
  if (aiFn) {
    aiFn(e, p, dt, a, obstacles);
  }
  // Clamp to arena
  e.x = clamp(e.x, a.x + e.r, a.x + a.w - e.r);
  e.y = clamp(e.y, a.y + e.r, a.y + a.h - e.r);
  // Push out of obstacles (unless ignoring walls during lunge)
  if (!e._ignoreWalls) {
    for (const ob of obstacles) {
      const pushed = pushOutRect(e.x, e.y, e.r, ob.x, ob.y, ob.w, ob.h);
      if (pushed) { e.x = pushed.x; e.y = pushed.y; }
    }
  }
}

// ─── Individual AI functions ───

function aiHoverLunge(e, p, dt) {
  const params = e.aiParams || {};
  // Init state
  if (e._aiState === undefined) {
    e._aiState = 'hover';
    e._aiTimer = randRange(params.hoverTime);
    e._hoverAng = Math.random() * Math.PI * 2;
  }

  if (e._aiState === 'hover') {
    // Gentle hover drift
    e._hoverAng += (Math.random() - 0.5) * 2 * dt;
    const hoverSpeed = (e.speed || 30) * dt;
    e.x += Math.cos(e._hoverAng) * hoverSpeed;
    e.y += Math.sin(e._hoverAng) * hoverSpeed;

    // Check lunge range
    const d = dist(e.x, e.y, p.x, p.y);
    e._aiTimer -= dt;
    if (e._aiTimer <= 0 && d < (params.lungeRange || 2.86 * T())) {
      e._aiState = 'lunge';
      e._aiTimer = params.lungeDuration || 0.35;
      e._lungeAng = Math.atan2(p.y - e.y, p.x - e.x);
      e._ignoreWalls = params.ignoreWalls || false;
    }
  } else if (e._aiState === 'lunge') {
    const spd = (params.lungeSpeed || 6.16 * T()) * dt;
    e.x += Math.cos(e._lungeAng) * spd;
    e.y += Math.sin(e._lungeAng) * spd;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'hover';
      e._aiTimer = randRange(params.hoverTime);
      e._ignoreWalls = false;
    }
  }
}

function aiStalkCharge(e, p, dt) {
  const params = e.aiParams || {};
  if (e._aiState === undefined) {
    e._aiState = 'stalk';
    e._aiTimer = randRange(params.stalkTime);
    e._lastPlayerDx = 0;
    e._lastPlayerDy = 0;
  }

  // Track player movement direction for anticipation
  if (!e._prevPx) { e._prevPx = p.x; e._prevPy = p.y; }
  const pdx = p.x - e._prevPx;
  const pdy = p.y - e._prevPy;
  if (Math.abs(pdx) > 0.5 || Math.abs(pdy) > 0.5) {
    e._lastPlayerDx = pdx;
    e._lastPlayerDy = pdy;
  }
  e._prevPx = p.x;
  e._prevPy = p.y;

  if (e._aiState === 'stalk') {
    // Circle at preferred distance
    const d = dist(e.x, e.y, p.x, p.y);
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    const [minR, maxR] = params.stalkRange || [2.2 * T(), 3.52 * T()];
    const midR = (minR + maxR) / 2;
    const spd = e.speed * dt;

    if (d > maxR) {
      e.x += Math.cos(ang) * spd;
      e.y += Math.sin(ang) * spd;
    } else if (d < minR) {
      e.x -= Math.cos(ang) * spd * 0.7;
      e.y -= Math.sin(ang) * spd * 0.7;
    } else {
      // Circle perpendicular
      const perpAng = ang + Math.PI / 2;
      e.x += Math.cos(perpAng) * spd * 0.6;
      e.y += Math.sin(perpAng) * spd * 0.6;
    }

    e._aiTimer -= dt;
    if (e._aiTimer <= 0 && d < maxR + 1.1 * T()) {
      e._aiState = 'charge';
      e._aiTimer = params.chargeDuration || 0.5;
      // Charge toward player's predicted position
      if (params.anticipatePlayer && (Math.abs(e._lastPlayerDx) > 0.5 || Math.abs(e._lastPlayerDy) > 0.5)) {
        const pm = Math.sqrt(e._lastPlayerDx * e._lastPlayerDx + e._lastPlayerDy * e._lastPlayerDy);
        const predX = p.x + (e._lastPlayerDx / pm) * 1.32 * T();
        const predY = p.y + (e._lastPlayerDy / pm) * 1.32 * T();
        e._chargeAng = Math.atan2(predY - e.y, predX - e.x);
      } else {
        e._chargeAng = Math.atan2(p.y - e.y, p.x - e.x);
      }
    }
  } else if (e._aiState === 'charge') {
    const spd = (params.chargeSpeed || 7.7 * T()) * dt;
    e.x += Math.cos(e._chargeAng) * spd;
    e.y += Math.sin(e._chargeAng) * spd;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'stalk';
      e._aiTimer = randRange(params.stalkTime);
    }
  }
}

function aiStationary() {
  // Does not move
}

function aiLobber(e, p, dt) {
  const params = e.aiParams || {};
  // Slow wander
  if (!e._wanderAng) e._wanderAng = Math.random() * Math.PI * 2;
  e._wanderAng += (Math.random() - 0.5) * 1.5 * dt;
  const spd = (params.wanderSpeed || 0.55 * T()) * dt;
  e.x += Math.cos(e._wanderAng) * spd;
  e.y += Math.sin(e._wanderAng) * spd;
}

function aiRandomDash(e, p, dt) {
  const params = e.aiParams || {};
  if (e._aiState === undefined) {
    e._aiState = 'idle';
    e._aiTimer = randRange(params.dashCooldown);
  }

  if (e._aiState === 'idle') {
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'dash';
      e._aiTimer = params.dashDuration || 0.3;
      e._dashAng = Math.random() * Math.PI * 2;
    }
  } else if (e._aiState === 'dash') {
    const spd = (params.dashSpeed || 4.4 * T()) * dt;
    e.x += Math.cos(e._dashAng) * spd;
    e.y += Math.sin(e._dashAng) * spd;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'idle';
      e._aiTimer = randRange(params.dashCooldown);
    }
  }
}

function aiChase(e, p, dt) {
  const params = e.aiParams || {};
  const d = dist(e.x, e.y, p.x, p.y);
  const ang = Math.atan2(p.y - e.y, p.x - e.x);
  const prefDist = params.preferredDist || 0;
  const spd = e.speed * dt;

  if (prefDist > 0) {
    // Skeleton-style: tries to maintain preferred distance
    if (d > prefDist + 0.66 * T()) {
      e.x += Math.cos(ang) * spd;
      e.y += Math.sin(ang) * spd;
    } else if (d < prefDist - 0.66 * T()) {
      e.x -= Math.cos(ang) * spd * 0.6;
      e.y -= Math.sin(ang) * spd * 0.6;
    } else {
      // Strafe
      const perpAng = ang + Math.PI / 2 * (e._strafeDir || 1);
      e.x += Math.cos(perpAng) * spd * 0.4;
      e.y += Math.sin(perpAng) * spd * 0.4;
      // Occasionally flip strafe direction
      if (!e._strafeTimer) e._strafeTimer = 1 + Math.random() * 2;
      e._strafeTimer -= dt;
      if (e._strafeTimer <= 0) {
        e._strafeDir = (e._strafeDir || 1) * -1;
        e._strafeTimer = 1 + Math.random() * 2;
      }
    }
  } else {
    // Skull-style: constant pursuit
    if (d > e.r + 0.22 * T()) {
      e.x += Math.cos(ang) * spd;
      e.y += Math.sin(ang) * spd;
    }
  }
}

function aiSpinThrow(e, p, dt) {
  const params = e.aiParams || {};
  if (e._aiState === undefined) {
    e._aiState = 'rest';
    e._aiTimer = randRange(params.restTime);
    e._spinAngle = 0;
  }

  if (e._aiState === 'rest') {
    // Slowly wander toward player
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 1.76 * T()) {
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      const spd = (e.speed || 0.66 * T()) * 0.5 * dt;
      e.x += Math.cos(ang) * spd;
      e.y += Math.sin(ang) * spd;
    }
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'spin';
      e._aiTimer = params.spinDuration || 0.8;
      e._spinAngle = 0;
      e._spinFired = false;
    }
  } else if (e._aiState === 'spin') {
    e._spinAngle += 12 * dt; // fast rotation
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      // Fire on spin end (handled by attack system via _spinReady flag)
      e._spinReady = true;
      e._aiState = 'rest';
      e._aiTimer = randRange(params.restTime);
    }
  }
}

function aiSpinCharge(e, p, dt) {
  const params = e.aiParams || {};
  if (e._aiState === undefined) {
    e._aiState = 'rest';
    e._aiTimer = randRange(params.restTime);
    e._spinAngle = 0;
  }

  if (e._aiState === 'rest') {
    const d = dist(e.x, e.y, p.x, p.y);
    if (d > 1.76 * T()) {
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      const spd = (e.speed || 0.77 * T()) * 0.5 * dt;
      e.x += Math.cos(ang) * spd;
      e.y += Math.sin(ang) * spd;
    }
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'spin';
      e._aiTimer = params.spinDuration || 0.8;
      e._spinAngle = 0;
    }
  } else if (e._aiState === 'spin') {
    e._spinAngle += 12 * dt;
    // Move toward player while spinning
    const ang = Math.atan2(p.y - e.y, p.x - e.x);
    const spd = (params.chargeSpeed || 2.64 * T()) * dt;
    e.x += Math.cos(ang) * spd;
    e.y += Math.sin(ang) * spd;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._spinReady = true;
      e._aiState = 'rest';
      e._aiTimer = randRange(params.restTime);
    }
  }
}

function aiBounce(e, p, dt, a) {
  const params = e.aiParams || {};
  const spd = params.bounceSpeed || 3.96 * T();

  // Initialize velocity
  if (e._bvx === undefined) {
    const ang = Math.random() * Math.PI * 2;
    e._bvx = Math.cos(ang) * spd;
    e._bvy = Math.sin(ang) * spd;
  }

  e.x += e._bvx * dt;
  e.y += e._bvy * dt;

  // Bounce off arena walls
  if (e.x - e.r < a.x) { e.x = a.x + e.r; e._bvx = Math.abs(e._bvx); }
  if (e.x + e.r > a.x + a.w) { e.x = a.x + a.w - e.r; e._bvx = -Math.abs(e._bvx); }
  if (e.y - e.r < a.y) { e.y = a.y + e.r; e._bvy = Math.abs(e._bvy); }
  if (e.y + e.r > a.y + a.h) { e.y = a.y + a.h - e.r; e._bvy = -Math.abs(e._bvy); }
}

function aiBurrow(e, p, dt, a) {
  const params = e.aiParams || {};
  if (e._aiState === undefined) {
    e._aiState = 'surface';
    e._aiTimer = randRange(params.surfaceTime || [2.0, 3.5]);
    e._burrowScale = 1;
    e._underground = false;
  }

  const transition = params.burrowTransition || 0.4;

  if (e._aiState === 'surface') {
    e._burrowScale = 1;
    e._underground = false;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'burrowing';
      e._aiTimer = transition;
    }
  } else if (e._aiState === 'burrowing') {
    e._aiTimer -= dt;
    e._burrowScale = Math.max(0, e._aiTimer / transition);
    if (e._aiTimer <= 0) {
      e._aiState = 'underground';
      e._aiTimer = randRange(params.undergroundTime || [1.0, 1.8]);
      e._underground = true;
      e._burrowScale = 0;
      // Reposition near player
      const ang = Math.random() * Math.PI * 2;
      const dist2 = 1.32 * T() + Math.random() * 1.76 * T();
      const pad = e.r + 0.22 * T();
      e.x = clamp(p.x + Math.cos(ang) * dist2, a.x + pad, a.x + a.w - pad);
      e.y = clamp(p.y + Math.sin(ang) * dist2, a.y + pad, a.y + a.h - pad);
    }
  } else if (e._aiState === 'underground') {
    e._underground = true;
    e._burrowScale = 0;
    e._aiTimer -= dt;
    if (e._aiTimer <= 0) {
      e._aiState = 'emerging';
      e._aiTimer = transition;
    }
  } else if (e._aiState === 'emerging') {
    e._aiTimer -= dt;
    e._burrowScale = 1 - Math.max(0, e._aiTimer / transition);
    e._underground = false;
    if (e._aiTimer <= 0) {
      e._burrowScale = 1;
      e._aiState = 'surface';
      e._aiTimer = randRange(params.surfaceTime || [2.0, 3.5]);
      // Fire attack on emerge
      e._emergeReady = true;
    }
  }
}

// ─── Boss AI: handles attack phase cycling ───

export function updateBossAttackPhase(e, dt) {
  if (!e.attackPhases || e.attackPhases.length === 0) return;

  if (e._phaseIdx === undefined) {
    e._phaseIdx = 0;
    e._phaseTimer = 0;
    e._phaseCooldown = 1.0; // initial delay
    e._phaseActive = false;
  }

  if (!e._phaseActive) {
    // Cooling down between phases
    e._phaseCooldown -= dt;
    if (e._phaseCooldown <= 0) {
      e._phaseActive = true;
      e._phaseTimer = e.attackPhases[e._phaseIdx].duration;
      e._phaseBurstTimer = 0;
    }
  } else {
    e._phaseTimer -= dt;
    if (e._phaseTimer <= 0) {
      // Phase complete, move to next
      const phase = e.attackPhases[e._phaseIdx];
      e._phaseActive = false;
      e._phaseCooldown = phase.cooldown || 2.0;
      e._phaseIdx = (e._phaseIdx + 1) % e.attackPhases.length;
    }
  }
}

/**
 * Get the current active attack phase for a boss, or null if cooling down.
 */
export function getCurrentPhase(e) {
  if (!e.attackPhases || !e._phaseActive) return null;
  return e.attackPhases[e._phaseIdx] || null;
}

// ─── Helpers ───

function randRange(arr) {
  if (!arr || arr.length < 2) return 2;
  return arr[0] + Math.random() * (arr[1] - arr[0]);
}

// ─── Registry ───

const AI_FUNCTIONS = {
  hoverLunge: aiHoverLunge,
  stalkCharge: aiStalkCharge,
  stationary: aiStationary,
  lobber: aiLobber,
  randomDash: aiRandomDash,
  chase: aiChase,
  spinThrow: aiSpinThrow,
  spinCharge: aiSpinCharge,
  bounce: aiBounce,
  burrow: aiBurrow,
};
