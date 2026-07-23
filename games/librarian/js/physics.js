import * as CANNON from 'cannon-es';
import { getStairGeometry } from './library.js';

let world = null;

export function createPhysicsWorld() {
  world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 4;
  world.allowSleep = true;

  const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Room walls (10 wide x 14 deep x 7.2 tall)
  addWall(0, 3.6, -7, 10, 7.2, 0.2);   // back
  addWall(0, 3.6, 7, 10, 7.2, 0.2);    // front
  addWall(-5, 3.6, 0, 0.2, 7.2, 14);   // left
  addWall(5, 3.6, 0, 0.2, 7.2, 14);    // right

  // Balcony floors (left, right stop at z=-3.0 so stairs can arrive)
  addWall(-3.9, 3.8, 2.0, 2.2, 0.15, 10.0);          // left balcony
  addWall(3.9, 3.8, 2.0, 2.2, 0.15, 10.0);           // right balcony
  addWall(0, 3.8, 5.9, 5.6, 0.15, 2.2);              // front balcony

  // Stair steps (each one is a physics collider)
  const steps = getStairGeometry();
  for (const step of steps) {
    addWall(step.x, step.y, step.z, step.w, step.h, step.d);
  }

  // Tables (physics colliders)
  addWall(0, 0.75, 1, 1.8, 0.08, 1.0);   // table 1
  addWall(0, 0.75, 4, 1.8, 0.08, 1.0);   // table 2

  return world;
}

function addWall(x, y, z, w, h, d) {
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
  });
  body.position.set(x, y, z);
  world.addBody(body);
}

export function getWorld() {
  return world;
}

export function stepPhysics(dt) {
  if (world) {
    world.step(1 / 60, dt, 3);
  }
}

export function createBookBody(position) {
  const halfExtents = new CANNON.Vec3(0.075, 0.2, 0.15);
  const shape = new CANNON.Box(halfExtents);
  const body = new CANNON.Body({
    mass: 0.5,
    shape,
    linearDamping: 0.3,
    angularDamping: 0.4,
    sleepSpeedLimit: 0.2,
    sleepTimeLimit: 1.0,
  });
  body.position.set(position.x, position.y, position.z);
  body.quaternion.setFromEuler(
    (Math.random() - 0.5) * 0.5,
    Math.random() * Math.PI * 2,
    (Math.random() - 0.5) * 0.5
  );
  world.addBody(body);
  return body;
}

export function removeBody(body) {
  if (world && body) {
    world.removeBody(body);
  }
}

export function tossBody(body, direction, speed) {
  body.wakeUp();
  body.velocity.set(
    direction.x * speed,
    3.0,
    direction.z * speed
  );
  body.angularVelocity.set(
    (Math.random() - 0.5) * 6,
    (Math.random() - 0.5) * 4,
    (Math.random() - 0.5) * 6
  );
}
