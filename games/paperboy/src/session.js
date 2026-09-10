// The run: whose it is, which day, how many lives and papers are left, and the
// sequence between menu and riding.
//
// Everything that decides when the boy may ride lives here — main.js only
// forwards frames and input, ui.js only draws what it is told. `state.mode` is
// the single source of truth:
//   home     the menu is up and the level is riding itself behind it
//   ready    the get-ready sequence, no input
//   playing  his to steer
//   paused   pause or quit panel up (state.paused freezes the sim)
//   crashed  the continue / game-over panel is up
import { CLIPS, DAYS, INVULN_TIME, LIVES_PER_RUN, PAPERS_MAX, PLAYER_FOOT_DROP, PLAYER_RADIUS, RIDER_HEIGHT_LOCAL, START, state } from './config.js';
import { loadProfiles, recordRun } from './profiles.js';

const wait = ms => new Promise(res => setTimeout(res, ms));

// He crashed INTO something, so restarting on the spot would just crash him
// again the moment the grace ends. player.restartSpot() finds somewhere he can
// actually ride away from; this is what counts as "in the way" while it looks.
const ATTRACT_END = 430;        // the demo ride loops rather than finishing
const ATTRACT_THROW = 1.6;      // seconds between show-off throws

export class Session {

    // The boy arrives later than everything else (his GLB loads separately), so
    // he comes in as a getter rather than a reference that would still be null.
    constructor({ getPlayer, papers, scoring, enemies, planner, plan, ui, finishX }) {
        Object.assign(this, { papers, scoring, enemies, planner, plan, ui });
        this.getPlayer = getPlayer;
        this.getFinishX = finishX;
        this.attract = false;
        this.attractTime = 0;
        this.attractThrow = 0;
        this.savedCrash = null;
        this.seq = 0;              // cancels an intro that has been walked out of
        this.days = [];            // the seven generated plans; see days.js
        ui.onPause = () => this.pause();
        ui.onCancel = () => this.confirmQuit();
    }

    get player() { return this.getPlayer(); }

    // The plan for a day: the generated file if it loaded, else whatever is in
    // the planner, so the level is never empty.
    planFor(day = state.day) { return this.days[day] || this.plan; }

    // --- menu -------------------------------------------------------------
    toHome() {
        this.seq++;
        state.mode = 'home';
        state.paused = false;
        this.ui.setHudVisible(false);
        this.ui.hideBanner();
        this.ui.fadeTo(false);
        this.startAttract();
        this.ui.home({ profiles: loadProfiles(), onPick: name => this.begin(name) });
    }

    // The level rides itself behind the menu: same code path as a real run,
    // with crashing off and a sine wave for a rider.
    startAttract() {
        this.attract = true;
        this.attractTime = 0;
        this.attractThrow = ATTRACT_THROW;
        if (this.savedCrash === null) this.savedCrash = state.crashEnabled;
        state.crashEnabled = false;
        this.player.reset();
        this.papers.clear();
        this.scoring.reset();
        this.enemies.spawn(this.planFor(0));
        this.planner.setVisible(false);
        state.riding = true;
        state.invuln = 0;
        this.player.play(CLIPS.pedal, { fade: 0 });
    }

    stopAttract() {
        this.attract = false;
        // Put the crash setting back — unless it was changed in the panel while
        // the demo was running, in which case that is the wanted value.
        if (this.savedCrash !== null && state.crashEnabled === false) state.crashEnabled = this.savedCrash;
        this.savedCrash = null;
    }

    // Autopilot for the demo; the real input otherwise. A flat cycle rather
    // than a sine: half a second left, a second straight, half a second right,
    // a second straight, over and over.
    rideInput(dt, real) {
        if (!this.attract) return real;
        this.attractTime += dt;
        const t = this.attractTime % 3;
        return { left: t < 0.5, right: t >= 1.5 && t < 2, fast: false, slow: false };
    }

    // --- starting a run ---------------------------------------------------
    async begin(name) {
        this.stopAttract();
        state.player = name;
        state.day = 0;
        state.lives = LIVES_PER_RUN;
        state.score = 0;
        this.ui.closePanel();
        await this.dayIntro();
    }

    async dayIntro() {
        const seq = ++this.seq;
        state.mode = 'ready';
        state.riding = false;
        state.paused = false;
        state.invuln = 0;
        state.papers = PAPERS_MAX;

        // Black out, put everything back on its mark, then reveal.
        this.ui.fadeTo(true);
        await wait(400);
        if (seq !== this.seq) return;
        this.player.reset();
        this.papers.clear();
        this.scoring.reset({ keepScore: true });
        this.enemies.clear();
        this.planner.setVisible(false);
        this.syncHud();
        this.ui.setHudVisible(true);

        this.ui.showBanner('GET READY!');
        await wait(700);
        if (seq !== this.seq) return;
        this.ui.fadeTo(false);
        await wait(900);
        if (seq !== this.seq) return;
        this.ui.setBanner('GO!');
        await wait(500);
        if (seq !== this.seq) return;
        this.ui.hideBanner();

        state.mode = 'playing';
        state.riding = true;
        this.player.play(CLIPS.pedal, { fade: 0.1 });
        this.enemies.spawn(this.planFor());
    }

    syncHud() {
        this.ui.setScore(state.score);
        this.ui.setDay(state.day);
        this.ui.setLives(state.lives);
        this.ui.setPapers(state.papers);
    }

    // --- papers -----------------------------------------------------------
    canThrow() { return this.attract || state.papers > 0; }

    spendPaper() {
        if (this.attract) return;
        state.papers = Math.max(0, state.papers - 1);
        this.ui.setPapers(state.papers);
    }

    refillPapers() {
        state.papers = PAPERS_MAX;
        this.ui.setPapers(state.papers);
    }

    // --- crashing ---------------------------------------------------------
    crashed(why) {
        if (state.mode !== 'playing') return;
        state.mode = 'crashed';
        state.lives = Math.max(0, state.lives - 1);
        this.ui.setLives(state.lives);
        if (state.lives > 0) {
            this.ui.openPanel({
                title: 'CRASHED!',
                tone: 'red',
                actions: [{
                    label: `TRY AGAIN (${state.lives} ${state.lives === 1 ? 'LIFE' : 'LIVES'})`,
                    tone: 'blue',
                    onClick: () => this.continueRun(),
                }],
            });
        } else {
            this.gameOver();
        }
    }

    continueRun() {
        this.ui.closePanel();
        const colliders = this.scoring.colliders;
        const blocked = (x, z, groundY) => colliders.solidAt(
            x, z, PLAYER_RADIUS,
            groundY - PLAYER_FOOT_DROP,
            groundY + RIDER_HEIGHT_LOCAL * state.boyScale,
        ).length > 0;
        const spot = this.player.restartSpot(blocked);
        state.boyPosition.x = spot.x;
        state.boyPosition.z = spot.z;
        state.invuln = INVULN_TIME;
        state.mode = 'playing';
        this.player.resume();
    }

    gameOver() {
        const done = state.day;
        recordRun(state.player, { score: state.score, day: done });
        state.mode = 'over';
        state.riding = false;
        this.ui.openPanel({
            title: 'GAME OVER',
            tone: 'red',
            lines: [
                `${state.player} · ${DAYS[done]}`,
                `SCORE ${Math.round(state.score).toLocaleString()}`,
            ],
            actions: [{ label: 'BACK TO MENU', tone: 'blue', onClick: () => this.toHome() }],
        });
    }

    // --- finishing a day --------------------------------------------------
    async dayDone() {
        const seq = ++this.seq;
        state.mode = 'ready';
        state.riding = false;
        this.player.play(CLIPS.celebrate, { once: true, fade: 0.1 });
        await wait(900);
        if (seq !== this.seq) return;

        const last = state.day >= DAYS.length - 1;
        if (last) recordRun(state.player, { score: state.score, day: DAYS.length - 1 });

        // The round card sits against the left edge with the rest of the
        // furniture, so the finish itself stays on show behind it. A click
        // anywhere carries on.
        let taken = false;
        const go = () => {
            if (taken || seq !== this.seq) return;
            taken = true;
            this.ui.closePanel();
            if (last) { state.mode = 'over'; this.toHome(); return; }
            state.day++;
            this.dayIntro();
        };
        this.ui.openPanel({
            title: last ? 'WEEK COMPLETE!' : `${DAYS[state.day]} DONE!`,
            tone: 'yellow',
            flush: true,
            dim: false,
            big: true,
            // The headline and the score, nothing else — a tap anywhere goes on.
            lines: [`SCORE ${Math.round(state.score).toLocaleString()}`],
            onAnyClick: go,
        });
    }

    // --- pause and quit ---------------------------------------------------
    pause() {
        if (state.mode !== 'playing') return;
        state.mode = 'paused';
        state.paused = true;
        this.ui.openPanel({
            title: 'PAUSED',
            tone: 'blue',
            lines: [`${state.player || 'Paperboy'} · ${DAYS[state.day]}`],
            actions: [
                { label: 'RESUME', tone: 'blue', onClick: () => this.resume() },
                { label: 'BACK TO MENU', tone: 'red', onClick: () => this.quitToMenu() },
            ],
        });
    }

    confirmQuit() {
        if (state.mode === 'home' || state.mode === 'over') return;
        const was = state.mode;
        state.mode = 'paused';
        state.paused = true;
        this.ui.openPanel({
            title: 'LEAVE THE ROUND?',
            tone: 'red',
            lines: ['This run ends here and you go back to the menu.',
                'Your score is kept as a best if it beats it.'],
            actions: [
                { label: 'KEEP RIDING', tone: 'blue', onClick: () => (was === 'crashed' ? this.crashPanel() : this.resume()) },
                { label: 'BACK TO MENU', tone: 'red', onClick: () => this.quitToMenu() },
            ],
        });
    }

    // Re-open the continue prompt after a quit prompt was dismissed over it.
    crashPanel() {
        state.mode = 'playing';   // so crashed() will run
        state.lives++;            // ...without taking a second life
        this.ui.setLives(state.lives);
        this.crashed(this.player.crashReason || 'crashed');
    }

    resume() {
        this.ui.closePanel();
        state.paused = false;
        state.mode = 'playing';
    }

    quitToMenu() {
        if (state.player) recordRun(state.player, { score: state.score, day: state.day });
        this.toHome();
    }

    // --- per frame --------------------------------------------------------
    update(dt) {
        if (state.invuln > 0) {
            state.invuln = Math.max(0, state.invuln - dt);
            this.player.setGlow(state.invuln > 0 ? state.invuln : 0);
        }

        if (this.attract) {
            // Loop the demo, and let him throw a few for the look of it.
            if (state.boyPosition.x > ATTRACT_END || state.crashed) this.startAttract();
            this.attractThrow -= dt;
            if (this.attractThrow <= 0) {
                this.attractThrow = ATTRACT_THROW;
                const t = this.player.throwPaper();
                if (t) this.papers.spawn(t.position, t.direction);
            }
            return;
        }

        if (state.mode === 'playing') {
            const finish = this.getFinishX?.();
            if (Number.isFinite(finish) && state.boyPosition.x >= finish) this.dayDone();
        }
    }
}
