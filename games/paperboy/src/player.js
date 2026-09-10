// The boy: transform, steering, and which clip is playing.
import * as THREE from 'three';
import { audio } from './audio.js';
import { CLIPS, CRANK_RATIO, GRAVITY, INVULN_FLASHES, INVULN_TIME, KERB_SAMPLE, KERB_SIDE_PROBE, PLAYER_RADIUS, RANGE, START, WHEEL_RADIUS_LOCAL, YAW_FORWARD, state } from './config.js';

const FADE = 0.18;
const AXIS_X = new THREE.Vector3(1, 0, 0);   // the rig spins wheels/crank about local X
const FALL_LIMIT = -1;                       // below this he has fallen off the world
// Restarting after a crash: how far ahead has to be clear, and where to look.
// A ramp counts as "his" if any part of the bike is on it, not just the ray
// under his centre.
const RAMP_GRIP = PLAYER_RADIUS;
const RESTART_AHEAD = 1.6;
const RESTART_SAMPLE = 0.08;
const RESTART_BACK = [1.2, 2.5, 4, 6, 9];
const RESTART_SIDE = [0, -0.9, 0.9, -1.8, 1.8, -2.7, 2.7, -3.6, 3.6, -4.5, 4.5];

const _spin = new THREE.Quaternion();
const GLOW = new THREE.Color(0xffd32a);      // the grace-period flash

export class Player {
    constructor({ model, mixer, actions }) {
        this.model = model;
        this.mixer = mixer;
        this.actions = actions;
        this.current = null;      // base action (idle / pedal / fast)
        this.throwAction = null;  // one-shot overlay, non-null while throwing
        this.turn = 0;            // current steer, degrees (-turnAngle..+turnAngle)
        this.throwTimer = 0;
        this.speed = 0;           // eased ground speed, also drives the wheels
        this.terrain = null;      // set by main once the level is loaded
        this.vy = 0;              // vertical velocity while airborne
        this.airborne = false;
        this.groundY = START.y;   // surface height under him, null over a gap
        this.surfaceSlope = 0;    // rise per unit travelled this frame
        this.lastSlope = 0;
        this.slopePeak = 0;       // peak slope over the last few frames (ramps)
        this.climb = 0;           // height gained on the rise he is currently on
        this.onRamp = null;       // the ramp collider under his wheels
        this.colliders = null;    // set by main, for rampAt

        // Wheels and crank are driven from speed (their clip tracks are stripped
        // in assets.js). Keep the rest pose and rotate relative to it, so we
        // never clobber the bone's bind orientation.
        this.roll = 0;
        this.wheels = ['WheelBone_Front', 'WheelBone_Rear']
            .map(n => model.getObjectByName(n)).filter(Boolean)
            .map(bone => ({ bone, rest: bone.quaternion.clone() }));
        const crank = model.getObjectByName('CrankBone');
        this.crank = crank ? { bone: crank, rest: crank.quaternion.clone() } : null;
        // GLTFLoader sanitises node names (PropertyBinding.sanitizeNodeName), so
        // Blender's "Hand.L" arrives as "Hand_L". Try both spellings, then fall
        // back to any left-hand-ish bone, then to the model origin.
        this.hand = ['Hand.L', 'Hand_L', 'HandTarget.L', 'HandTarget_L']
            .map(n => model.getObjectByName(n)).find(Boolean) || null;
        if (!this.hand) model.traverse(o => { if (!this.hand && /hand[._]?l$/i.test(o.name)) this.hand = o; });
        if (!this.hand) console.warn('No left-hand bone found; papers will spawn at the boy origin');

        // A one-shot throw hands control back to whatever should be playing.
        mixer.addEventListener('finished', e => {
            if (this.throwAction && e.action === this.throwAction) {
                this.throwAction = null;
                this.play(this.baseClip(), { fade: 0.12 });
            }
        });

        this.applyTransform();
        this.play(state.currentAnimation);
    }

    baseClip() {
        if (!state.riding) return CLIPS.idle;
        // Slow uses the normal pedal clip, just played slower (see update).
        return this.fastHeld ? CLIPS.fast : CLIPS.pedal;
    }

    // Crossfade to a clip. once:true plays it one shot and clamps on the last frame.
    play(name, { once = false, fade = FADE } = {}) {
        const next = this.actions[name];
        if (!next) { console.warn(`No clip "${name}"`); return null; }
        if (!once && this.current === next) return next;
        if (this.current && this.current !== next) {
            if (fade > 0) this.current.fadeOut(fade);
            else this.current.stop();          // a zero fade means immediately
        }
        next.reset();
        next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
        next.clampWhenFinished = once;
        if (fade > 0) next.fadeIn(fade).play();
        else next.setEffectiveWeight(1).play();
        this.current = next;
        state.currentAnimation = name;
        return next;
    }

    // Wipe the mixer back to nothing. The fall clip is a one-shot that clamps
    // on its last frame, so without this a restart began with that pose still
    // weighted in and he flopped straight over again.
    stopAll() {
        for (const a of Object.values(this.actions)) {
            a.stop();
            a.reset();
            a.paused = false;
            a.clampWhenFinished = false;
            a.setLoop(THREE.LoopRepeat, Infinity);
            a.setEffectiveTimeScale(1);
            a.setEffectiveWeight(1);
        }
        this.mixer.stopAllAction();
        this.current = null;
        this.throwAction = null;
    }

    applyTransform() {
        const p = state.boyPosition;
        this.model.position.set(p.x, p.y, p.z);
        this.model.rotation.y = THREE.MathUtils.degToRad(state.boyRotationY);
        this.model.scale.setScalar(state.boyScale);
    }

    reset() {
        state.riding = false;
        Object.assign(state.boyPosition, START);
        this.turn = 0;
        this.speed = 0;
        this.roll = 0;
        this.vy = 0;
        this.airborne = false;
        this.surfaceSlope = 0;
        this.lastSlope = 0;
        this.slopePeak = 0;
        this.climb = 0;
        this.onRamp = null;
        this.throwTimer = 0;
        state.crashed = false;
        state.boyRotationY = YAW_FORWARD;
        this.applyTransform();
        this.stopAll();
        this.play(CLIPS.idle, { fade: 0 });
    }

    // Back on the bike after a crash, from wherever the session has put him.
    // Not reset(): the position, the score and the day all stay as they were.
    resume() {
        state.crashed = false;
        state.riding = true;
        this.turn = 0;
        this.vy = 0;
        this.airborne = false;
        this.surfaceSlope = 0;
        this.lastSlope = 0;
        this.slopePeak = 0;
        this.climb = 0;
        this.onRamp = null;
        this.throwTimer = 0;
        this.crashReason = null;
        state.boyRotationY = YAW_FORWARD;
        this.applyTransform();
        this.stopAll();
        this.play(CLIPS.pedal, { fade: 0 });
    }

    // Can he set off from here? Ground under the wheels, nothing solid on him,
    // and a clear run of RESTART_AHEAD with no kerb face across it. Sampled as
    // finely as stepMove, because a kerb is only 0.1 tall and a coarse sample
    // cannot tell one from a ramp.
    canRideFrom(x, z, isBlocked) {
        if (!this.terrain) return true;
        let cy = this.terrain.heightAt(x, z);
        if (cy === null) return false;
        if (isBlocked(x, z, cy)) return false;
        for (let d = RESTART_SAMPLE; d <= RESTART_AHEAD; d += RESTART_SAMPLE) {
            const h = this.terrain.heightAt(x + d, z);
            if (h === null) return false;
            if (this.isKerb(cy, h, RESTART_SAMPLE)) return false;
            if (isBlocked(x + d, z, h)) return false;
            cy = h;
        }
        return true;
    }

    // Where to put him for a continue.
    //
    // Backing him up a fixed distance is not enough: a kerb that runs across
    // the road is still across the road two metres earlier, so he would set off
    // and hit the same face again — and if the kerb beside him blocks steering
    // too, every remaining life goes the same way. So look for a spot he can
    // ride out of, sideways first (that is what gets him round a kerb face) and
    // only then further back.
    restartSpot(isBlocked = () => false) {
        const from = state.boyPosition;
        for (const back of RESTART_BACK) {
            for (const side of RESTART_SIDE) {
                const x = Math.max(START.x, from.x - back);
                const z = THREE.MathUtils.clamp(from.z + side, RANGE.lateral[0], RANGE.lateral[1]);
                if (this.canRideFrom(x, z, isBlocked)) return { x, z, moved: side !== 0 };
            }
        }
        // Nothing clear within reach: back him up and let the grace period and
        // his own steering sort it out.
        return { x: Math.max(START.x, from.x - RESTART_BACK[1]), z: from.z, moved: false };
    }

    // Flash gold while he is invulnerable. `remaining` counts down to 0, and
    // |sin| gives one pulse a second, so the whole grace period is two pulses.
    // Emissive rather than opacity: he stays solid and readable, he just glows.
    setGlow(remaining) {
        if (!this.glowMats) {
            this.glowMats = [];
            const seen = new Set();
            this.model.traverse(o => {
                for (const m of [].concat(o.material || [])) {
                    if (!m || !m.emissive || seen.has(m)) continue;
                    seen.add(m);
                    this.glowMats.push({ m, colour: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 });
                }
            });
        }
        const elapsed = INVULN_TIME - remaining;
        const k = remaining > 0
            ? Math.abs(Math.sin(Math.PI * elapsed * INVULN_FLASHES / INVULN_TIME))
            : 0;
        for (const g of this.glowMats) {
            if (k > 0) {
                g.m.emissive.copy(GLOW);
                g.m.emissiveIntensity = k * 1.5;
            } else {
                g.m.emissive.copy(g.colour);
                g.m.emissiveIntensity = g.intensity;
            }
        }
    }

    // Throw a paper. Returns { position, direction } or null if on cooldown.
    // Straight-left is his heading + 90deg; throwAngle swings that forward.
    throwPaper() {
        if (this.throwTimer > 0 || !this.actions[CLIPS.throwLeft]) return null;
        this.throwTimer = state.throwCooldown;
        audio.play('throw');
        this.throwAction = this.play(CLIPS.throwLeft, { once: true, fade: 0.08 });

        const position = new THREE.Vector3();
        (this.hand || this.model).getWorldPosition(position);

        const yaw = THREE.MathUtils.degToRad(state.boyRotationY + 90 - state.throwAngle);
        const direction = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        return { position, direction };
    }

    jump() {
        if (this.airborne || !state.riding || state.crashed) return false;   // no hops off the deck
        this.vy = state.jumpVelocity;
        this.airborne = true;
        audio.play('jump');
        return true;
    }

    // Every crash comes through here — obstacles, hazards and kerbs alike — so
    // there is one place that stops the run and one place that tells the UI.
    crash(why = 'crashed') {
        // Just continued: he rides through everything for a moment.
        if (state.invuln > 0) return;
        // With crashing off, a hit is only reported — useful for riding the
        // whole course to check a plan. Deduped, or standing inside an
        // obstacle would report it every frame.
        if (!state.crashEnabled) {
            const now = performance.now();
            if (why !== this._lastMissWhy || now - (this._lastMissAt || 0) > 900) {
                this._lastMissWhy = why;
                this._lastMissAt = now;
                this.onNearMiss?.(why);
            }
            return;
        }
        if (state.crashed) return;
        this.crashReason = why;
        state.crashed = true;
        state.riding = false;
        // Crashing puts him on the floor, never in the air.
        this.airborne = false;
        this.vy = 0;
        this.slopePeak = 0;
        this.lastSlope = 0;
        this.surfaceSlope = 0;
        this.throwAction = null;
        audio.play('crash');
        this.play(CLIPS.fall, { once: true, fade: 0.05 });
        this.onCrashed?.(why);
    }

    update(dt, input) {
        this.fastHeld = input.fast && state.riding;
        this.slowHeld = input.slow && state.riding && !this.fastHeld;
        if (this.throwTimer > 0) this.throwTimer -= dt;

        // Steer: lerp toward the held direction, or back to straight on release.
        let target = 0;
        if (state.riding && !state.crashed) {
            // He can lean harder into a turn in the slow gear.
            const angle = this.slowHeld ? state.slowTurnAngle : state.turnAngle;
            if (input.left) target = angle;
            else if (input.right) target = -angle;
            // Steering into a kerb he cannot climb should read as not steering
            // at all, so the bike straightens rather than grinding along at an
            // angle. Probe close in: further out and a kerb face averages out
            // into a gentle slope.
            //
            // Except just after a continue: for those two seconds he can steer
            // over a kerb, so being boxed in by one is never the end of a run.
            if (target !== 0 && state.invuln <= 0 && this.kerbToSide(target > 0 ? -1 : 1)) target = 0;
        }
        const k = state.turnLerp > 0 ? Math.min(1, dt / state.turnLerp) : 1;
        this.turn += (target - this.turn) * k;
        state.boyRotationY = YAW_FORWARD + this.turn;

        // Ease between stopped / cruising / fast rather than stepping.
        const targetSpeed = !state.riding ? 0
            : this.fastHeld ? state.fastSpeed
            : this.slowHeld ? state.slowSpeed
            : state.forwardSpeed;
        const ks = state.fastEase > 0 ? Math.min(1, dt / state.fastEase) : 1;
        this.speed += (targetSpeed - this.speed) * ks;

        const p = state.boyPosition;
        this.blockedByKerb = false;
        if (state.riding && !state.crashed) {
            const yaw = THREE.MathUtils.degToRad(state.boyRotationY);
            const dist = this.speed * dt;
            this.stepMove(Math.sin(yaw) * dist, Math.cos(yaw) * dist);
        }

        // --- Vertical: ride the surface, or fly ---
        this.lastRayMs = 0;
        if (this.terrain) {
            const tRay = performance.now();
            this.groundY = this.terrain.heightAt(p.x, p.z);
            this.lastRayMs = performance.now() - tRay;
        }

        // Am I on a ramp? Asked of the ramp's own box, because the ones that
        // guard the rivers are a metre wide and the ray under his centre made
        // catching one a coin toss — a wheel over the edge missed the launch
        // entirely and rode him into the water. On a ramp he follows its wedge,
        // and leaving the top launches him.
        const ramp = (!this.airborne && this.colliders)
            ? this.colliders.rampAt(p.x, p.z, RAMP_GRIP) : null;
        if (ramp) {
            const b = ramp.box;
            const along = THREE.MathUtils.clamp((p.x - b.min.x) / Math.max(1e-6, b.max.x - b.min.x), 0, 1);
            const rampY = b.min.y + along * (b.max.y - b.min.y);
            if (this.groundY === null || rampY > this.groundY) this.groundY = rampY;
            this.onRamp = ramp;
        } else if (this.onRamp) {
            // Off the end of it (rather than out of the side) is a launch.
            const past = p.x > this.onRamp.box.max.x - RAMP_GRIP;
            this.onRamp = null;
            if (past && !this.airborne && this.speed > 1 && state.riding) {
                this.vy = state.rampLaunch;
                this.airborne = true;
                audio.play('jump');
                this.climb = 0;
                this.slopePeak = 0;
                this.lastSlope = 0;
            }
        }
        const gy = this.groundY;

        if (state.crashed && gy !== null) {
            // Settle him onto the ground and leave the jump logic alone.
            p.y = gy + state.groundOffset;
        } else if (state.groundSnap) {
            if (this.airborne) {
                this.vy -= GRAVITY * dt;
                p.y += this.vy * dt;
                if (gy !== null && p.y <= gy + state.groundOffset && this.vy <= 0) {
                    p.y = gy + state.groundOffset;
                    // Only the drops worth hearing, or every kerb clicks.
                    if (this.vy < -2) audio.play('land');
                    this.vy = 0;
                    this.airborne = false;
                }
                // Nothing below him at all (over the river, having fallen short).
                if (p.y < FALL_LIMIT) this.crash();
            } else if (gy !== null) {
                // Leaving the top of a ramp launches him. The slope is still
                // tracked (peak-held, because a ramp's last frame is only a
                // fraction of its real slope) to tell a ramp from a kerb — but
                // it no longer sets how hard he goes up.
                this.slopePeak = Math.min(state.kerbMaxSlope,
                    Math.max(this.surfaceSlope, this.slopePeak * 0.85));
                this.climb += Math.max(0, gy - (this._prevGy ?? gy));
                if (!ramp && !this.onRamp
                    && this.lastSlope > 0.05 && this.surfaceSlope <= 0 && this.speed > 1 && state.riding) {
                    // Height climbed is what makes it a ramp: jump ramps rise
                    // 0.30 and kerbs 0.10, so this tells them apart at any
                    // speed where slope alone could not, and kerbs stop
                    // launching him into little hops.
                    if (this.climb >= state.rampMinRise) {
                        // A fixed kick, not one scaled by ground speed. Every
                        // ramp in the level is the same 1 x 0.3 wedge, so every
                        // launch should be the same launch; it used to be
                        // slope x speed x boost, which threw him half again as
                        // high in the fast gear off the very same ramp. Riding
                        // faster still carries him further — same height,
                        // longer arc — which is what speed should buy.
                        this.vy = state.rampLaunch;
                        this.airborne = true;
                    }
                    this.slopePeak = 0;
                    this.climb = 0;
                }
                this.lastSlope = this.surfaceSlope;

                if (!this.airborne && gy <= p.y + state.groundMaxStep) {
                    const target = gy + state.groundOffset;
                    const kg = state.groundEase > 0 ? Math.min(1, dt / state.groundEase) : 1;
                    p.y += (target - p.y) * kg;
                }
            }
        }

        this._prevGy = gy;
        this.spinWheels(dt);

        // Keep the base clip honest (e.g. fast key pressed/released mid-ride).
        // Not while crashed: the fall clip is a one-shot that holds its last
        // frame, and re-asserting the base clip here would cut it off instantly.
        if (!this.throwAction && !state.crashed) {
            this.play(this.baseClip());
            // Slow gear = the same pedal clip at a reduced rate.
            this.current?.setEffectiveTimeScale(this.slowHeld ? state.slowClipRate : 1);
        }
        this.applyTransform();
    }

    // Does climbing from `fromY` to surface height `h` over `dist` count as a
    // kerb? It has to be both steep AND a real step — road paint is steep-edged
    // but only ~0.026 tall, and blocking on slope alone made it a wall.
    isKerb(fromY, h, dist) {
        if (h === null || fromY === null) return false;
        const rise = h - fromY;
        return rise > state.kerbMinRise && rise / dist > state.kerbMaxSlope;
    }

    // Is the surface this far to one side (zSign -1 = his left) too steep to
    // ride onto?
    kerbToSide(zSign) {
        if (!this.terrain || this.airborne || this.groundY === null) return false;
        const p = state.boyPosition;
        const h = this.terrain.heightAt(p.x, p.z + zSign * KERB_SIDE_PROBE);
        return this.isKerb(this.groundY, h, KERB_SIDE_PROBE);
    }

    // Walk a move in short steps, following the surface. A single sample at the
    // far end of a frame's travel cannot tell a 0.1 kerb from a 0.1 ramp, which
    // is why this samples every KERB_SAMPLE units instead.
    //
    // Sideways into a kerb: lose the sideways part, keep rolling forwards.
    // Kerb across his path: that is a crash, not a stop.
    stepMove(dx, dz) {
        const p = state.boyPosition;
        const dist = Math.hypot(dx, dz);
        if (dist === 0) return;

        const startY = this.groundY;
        const noKerbs = this.airborne || !this.terrain || this.groundY === null;
        const steps = noKerbs ? 1 : Math.min(12, Math.max(1, Math.ceil(dist / KERB_SAMPLE)));
        const sx = dx / steps, sz = dz / steps;
        const stepDist = Math.hypot(sx, sz);
        let cx = p.x, cz = p.z, cy = this.groundY;

        for (let i = 0; i < steps; i++) {
            const tx = cx + sx, tz = cz + sz;
            if (noKerbs) { cx = tx; cz = tz; continue; }

            const h = this.terrain.heightAt(tx, tz);
            // The grace period after a continue lets him ride over kerbs, so a
            // restart against one is something he can get out of.
            const tooSteep = state.invuln <= 0 && this.isKerb(cy, h, stepDist);
            if (!tooSteep) {
                cx = tx; cz = tz;
                if (h !== null) cy = h;
                continue;
            }

            this.blockedByKerb = true;
            // Would going straight ahead climb it too? Then the kerb runs across
            // his path rather than beside him, and hitting it is a crash.
            if (Math.abs(sx) > 1e-6) {
                const hx = this.terrain.heightAt(tx, cz);
                if (this.isKerb(cy, hx, Math.abs(sx))) {
                    p.x = cx; p.z = cz;
                    this.crash('rode into a kerb');   // it runs across his path
                    return;
                }
                cx = tx;                     // slide along the kerb face
                if (hx !== null) cy = hx;
            }
        }

        p.x = THREE.MathUtils.clamp(cx, RANGE.worldX[0], RANGE.worldX[1]);
        p.z = THREE.MathUtils.clamp(cz, RANGE.lateral[0], RANGE.lateral[1]);

        // How steeply he actually climbed, per unit travelled. Ramp launches use
        // this rather than a per-frame height delta: the delta spikes whenever
        // the surface changes mesh, which flung him about.
        const travelled = Math.hypot(p.x - (cx - dx), p.z - (cz - dz)) || dist;
        this.surfaceSlope = (startY === null || cy === null || travelled === 0)
            ? 0 : (cy - startY) / travelled;
    }

    // Roll the wheels at ground speed, and the crank at pedal cadence.
    spinWheels(dt) {
        const radius = WHEEL_RADIUS_LOCAL * state.boyScale;
        if (radius <= 0) return;
        this.roll += (this.speed / radius) * dt;
        for (const w of this.wheels) w.bone.quaternion.copy(w.rest).multiply(_spin.setFromAxisAngle(AXIS_X, this.roll));
        if (this.crank) {
            this.crank.bone.quaternion.copy(this.crank.rest)
                .multiply(_spin.setFromAxisAngle(AXIS_X, this.roll / CRANK_RATIO));
        }
    }
}
