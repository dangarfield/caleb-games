/* force.js — the Force pod, and the reason this is not just another shooter.
 *
 * Four states and one button:
 *
 *   docked   sitting on the ship's nose or tail, eating anything that hits it
 *   out      launched, flying forward under its own power
 *   held     stopped where it ran out of run, indestructible, shooting
 *   back     recalled, flying to the dock point
 *
 * The pod is never destroyed and never collides with the player. It damages
 * whatever it touches, so parking it in a turret nest clears the nest while
 * the player is somewhere else entirely; keeping it docked at the TAIL turns
 * the ship's back into a wall, which is the answer to fire from behind.
 *
 * Which end it docks to: normally the end it launched from, as the spec says.
 * The exception is the case that makes the mechanic usable with one button —
 * if the ship has flown PAST the pod, the nearest end is the tail, and it
 * docks there. That is how a player moves the pod to the back without a second
 * control: launch it, fly past it, recall.
 */
import * as THREE from 'three';
import { CFG } from './config.js';
import { forcePod } from './designs.js';
import { mergeShadows } from './paper.js';

export function createForce(scene, { rampName = 'STAGE1', bullets } = {}) {
  const F = CFG.force;
  const group = new THREE.Group();
  group.position.z = 1.6;
  if (scene) scene.add(group);

  const art = forcePod({ rampName, radius: F.radius });
  mergeShadows(art);            // one rigid disc; it spins as a whole
  group.add(art);

  const pod = {
    group,
    x: 0, y: 0,
    state: 'docked',
    side: 'nose',
    launchSide: 'nose',
    fireTimer: 0,
    contactTimer: 0,
    hitRadius: F.hitRadius,
    toggle, update, reset, dockPoint, isDetached,
  };

  function isDetached() { return pod.state !== 'docked'; }

  function dockPoint(ship, side) {
    const s = side || pod.side;
    return {
      x: ship.x + (s === 'nose' ? F.dockNose : F.dockTail),
      y: ship.y,
    };
  }

  function reset(ship) {
    pod.state = 'docked';
    pod.side = 'nose';
    pod.launchSide = 'nose';
    pod.fireTimer = 0;
    pod.contactTimer = 0;
    const d = dockPoint(ship, 'nose');
    pod.x = d.x; pod.y = d.y;
    group.position.set(pod.x, pod.y, 1.6);
    group.rotation.z = 0;
  }

  /* The POD button and SHIFT both land here. One button, two meanings, and
     which one it is is never ambiguous: attached launches, detached recalls. */
  function toggle(ship) {
    if (pod.state === 'docked') {
      pod.state = 'out';
      pod.launchSide = pod.side;
      return 'launch';
    }
    pod.state = 'back';
    return 'recall';
  }

  /* `scrollSpeed` is the LIVE stage's speed, not the house default: stage two
     runs at 28 and stage three at 30, and a pod that drifts at 26 slides
     forward through the stage instead of holding station in it. */
  function update(dt, ship, layout, diff, scrollSpeed) {
    if (pod.state === 'docked') {
      const d = dockPoint(ship);
      const k = 1 - Math.exp(-F.dockLerp * dt);
      pod.x += (d.x - pod.x) * k;
      pod.y += (d.y - pod.y) * k;
      group.rotation.z *= 1 - Math.min(1, dt * 6);
    } else if (pod.state === 'out') {
      pod.x += F.launchSpeed * dt;
      group.rotation.z += F.spin * dt;
      if (pod.x >= layout.podStopX) { pod.x = layout.podStopX; pod.state = 'held'; }
    } else if (pod.state === 'held') {
      // It sits where it stopped and lets the stage scroll past it, which is
      // what makes "park it over there" a real decision.
      pod.x -= (scrollSpeed || CFG.stage.scrollSpeed) * dt * 0.35;
      group.rotation.z += F.spin * dt;
      if (pod.x < layout.shipXMin - 30) pod.state = 'back';
    } else if (pod.state === 'back') {
      /* Home is the end it left from — unless the ship is now in front of the
         pod, in which case the tail is the end it is actually arriving at. */
      let side = pod.launchSide;
      if (pod.x < ship.x - 1) side = 'tail';
      const d = dockPoint(ship, side);
      const dx = d.x - pod.x, dy = d.y - pod.y;
      const dist = Math.hypot(dx, dy);
      const step = F.recallSpeed * dt;
      group.rotation.z += F.spin * dt * 1.6;
      if (dist <= step || dist < 0.6) {
        pod.x = d.x; pod.y = d.y;
        pod.side = side;
        pod.state = 'docked';
      } else {
        pod.x += dx / dist * step;
        pod.y += dy / dist * step;
      }
    }

    group.position.x = pod.x;
    group.position.y = pod.y;

    if (pod.contactTimer > 0) pod.contactTimer -= dt;

    // Detached, it fights on its own. Docked, the ship's guns are the guns.
    if (isDetached() && bullets) {
      pod.fireTimer -= dt;
      if (pod.fireTimer <= 0) {
        pod.fireTimer = F.fireRate;
        bullets.firePod(pod.x + F.radius, pod.y, F.bulletSpeed, 0, F.bulletDamage);
      }
    }
  }

  return pod;
}
