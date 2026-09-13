// Everything on top of the canvas: the corner blocks, the two buttons, the
// GET READY banner, the fade, and every overlay panel including the home menu.
//
// One look, used everywhere: a solid block of one of the boy's own colours with
// padding, square against the left edge of the screen and rounded away from it.
// This module owns no game rules — session.js tells it what to show.
import { DAYS, LIVES_PER_RUN, PAPERS_MAX } from './config.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { readStore, writeStore } from './store.js';

// A rolled paper leaving his hand: the throw pad. Black on white, no colour,
// so it reads at any size.
const THROW_ICON = '<svg viewBox="0 0 26 24" aria-hidden="true">'
    + '<rect x="9" y="6.5" width="14" height="11" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M12.5 10.2h7M12.5 13.4h4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    + '<path d="M6.2 8.6H2.6M5.2 12H1M6.2 15.4H2.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>';

// His cap, small: dome plus brim, in the cap yellow. One per life left.
const HAT = '<svg viewBox="0 0 20 12" aria-hidden="true">'
    + '<path d="M3.4 8.2C3.4 4.4 6.1 2 10 2c3.9 0 6.6 2.4 6.6 6.2z" fill="currentColor"/>'
    + '<rect x="1" y="8.2" width="18" height="2.4" rx="1.2" fill="currentColor"/></svg>';

function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class Ui {
    constructor() {
        this.root = document.body;
        // Anta arrives after the first paint. The banner is one wide line of it,
        // so showing it before the face is in lays it out in the fallback and
        // then resizes mid-animation. Everything waits on this once.
        this.fonts = document.fonts?.ready ?? Promise.resolve();

        // --- always there: back to the arcade ---
        // The page ships this anchor in its markup (see index.html), so it
        // works before the module loads and the pre-commit hook can see it.
        // Fall back to building one if the element is ever missing.
        let back = document.getElementById('backBtn');
        if (!back) {
            back = el('a', 'chip', '← Games');
            back.id = 'backBtn';
            back.href = '../../index.html';
        }

        // --- the corner blocks ---
        this.score = el('span', 'val', '0');
        this.day = el('div', 'blk blk-day', DAYS[0]);
        this.lives = el('div', 'hats');
        // Remembered between sessions, so the younger one does not have to
        // find the button every time.
        this.unlimited = readStore().unlimited === true;
        this.renderLives();
        this.pips = el('div', 'pips');
        for (let i = 0; i < PAPERS_MAX; i++) this.pips.appendChild(el('i', 'pip'));

        const scoreBlk = el('div', 'blk blk-score');
        scoreBlk.append(el('span', 'lbl', 'SCORE'), this.score);
        const livesBlk = el('div', 'blk blk-lives');
        livesBlk.append(this.lives);

        // "NO PAPERS!" sits to the right of the papers block and flashes when
        // he pulls the trigger on an empty bag.
        this.noPapersTag = el('div', 'tag', 'NO PAPERS!');
        const papersBlk = el('div', 'blk blk-papers');
        papersBlk.append(this.pips);
        const papersRow = el('div', 'row');
        papersRow.append(papersBlk, this.noPapersTag);

        this.hud = el('div');
        this.hud.id = 'hud';
        this.hud.append(scoreBlk, this.day, livesBlk, papersRow);

        // --- unlimited lives, pause and quit ---
        this.infBtn = el('button', 'chip icon', '∞');
        this.infBtn.title = 'Unlimited lives';
        this.infBtn.classList.toggle('on', this.unlimited);
        this.infBtn.setAttribute('aria-pressed', String(this.unlimited));
        this.infBtn.addEventListener('click', () => {
            audio.play('click');
            this.onUnlimited?.(this.setUnlimited(!this.unlimited));
        });
        this.pauseBtn = el('button', 'chip icon', '⏸');
        this.pauseBtn.title = 'Pause';
        this.cancelBtn = el('button', 'chip icon', '✕');
        this.cancelBtn.title = 'Back to the menu';
        const corner = el('div');
        corner.id = 'topRight';
        corner.append(this.infBtn, this.pauseBtn, this.cancelBtn);
        this.pauseBtn.addEventListener('click', () => this.onPause?.());
        this.cancelBtn.addEventListener('click', () => this.onCancel?.());

        // --- touch pads: steering bottom left, speed bottom right ---
        // They hold the same four directions as the arrow keys, so the rest of
        // the game never learns which one is in use.
        this.padLeft = el('div', 'pad pad-l');
        this.padLeft.append(this.padButton('left', '◀'), this.padButton('right', '▶'));
        this.padRight = el('div', 'pad pad-r');
        const throwBtn = this.padButton('throw', '');
        throwBtn.classList.add('padBtn-icon');
        throwBtn.innerHTML = THROW_ICON;
        this.padRight.append(throwBtn, this.padButton('fast', '▲'), this.padButton('slow', '▼'));
        this.pads = el('div');
        this.pads.id = 'pads';
        this.pads.append(this.padLeft, this.padRight);
        this.padsWanted = false;
        // A pointer let go anywhere (dragged off the button, cancelled by the
        // browser) must not leave him steering into a wall.
        for (const ev of ['pointerup', 'pointercancel']) {
            addEventListener(ev, () => input.clearTouch());
        }

        // --- banner, fade, overlay ---
        this.bannerBox = el('div', 'bannerBox', 'GET READY!');
        this.banner = el('div');
        this.banner.id = 'banner';
        this.banner.appendChild(this.bannerBox);

        this.fade = el('div');
        this.fade.id = 'fade';

        this.panel = el('div', 'panel');
        this.overlay = el('div');
        this.overlay.id = 'overlay';
        this.overlay.appendChild(this.panel);

        this.root.append(back, this.hud, corner, this.fade, this.pads, this.banner, this.overlay);
        this.setHudVisible(false);
        this.closePanel();
    }

    padButton(name, glyph) {
        const b = el('button', 'padBtn', glyph);
        b.type = 'button';
        b.dataset.dir = name;
        b.addEventListener('pointerdown', e => {
            e.preventDefault();
            b.setPointerCapture?.(e.pointerId);
            // Throwing is one per tap; steering and gears are held.
            if (name === 'throw') input.queueThrow();
            else input.setTouch(name, true);
        });
        const off = () => { if (name !== 'throw') input.setTouch(name, false); };
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
        // Stops a long press turning into a text selection or a context menu.
        b.addEventListener('contextmenu', e => e.preventDefault());
        return b;
    }

    // The pads follow the HUD, and duck out of the way of any panel.
    setPadsVisible(on) {
        this.padsWanted = on;
        this.applyPads();
    }

    applyPads() {
        const show = this.padsWanted && !this.overlay.classList.contains('on');
        this.pads.classList.toggle('in', show);
        if (!show) input.clearTouch();
    }

    // --- blocks ---
    setScore(n) { this.score.textContent = Math.round(n).toLocaleString(); }
    setDay(i) { this.day.textContent = DAYS[i % DAYS.length]; }
    setLives(n) {
        if (this.unlimited) return;   // one hat and a sideways eight: nothing to count down
        this.lives.childNodes.forEach((hat, i) => hat.classList.toggle('gone', i >= n));
    }

    // Five hats normally; one hat and ∞ when crashes are free.
    renderLives() {
        this.lives.replaceChildren();
        for (let i = 0; i < (this.unlimited ? 1 : LIVES_PER_RUN); i++) {
            const hat = el('i', 'hat');
            hat.innerHTML = HAT;
            this.lives.appendChild(hat);
        }
        if (this.unlimited) this.lives.appendChild(el('i', 'inf', '∞'));
    }

    setUnlimited(on) {
        this.unlimited = !!on;
        writeStore({ unlimited: this.unlimited });
        this.infBtn.classList.toggle('on', this.unlimited);
        this.infBtn.setAttribute('aria-pressed', String(this.unlimited));
        this.renderLives();
        return this.unlimited;
    }

    // He tried to throw with nothing left.
    noPapers() {
        audio.play('nopapers');
        this.noPapersTag.classList.remove('show');
        // Restart the flash even if it is already up.
        void this.noPapersTag.offsetWidth;
        this.noPapersTag.classList.add('show');
        clearTimeout(this._noPapersTimer);
        this._noPapersTimer = setTimeout(() => this.noPapersTag.classList.remove('show'), 1500);
    }
    setPapers(n) {
        this.pips.childNodes.forEach((pip, i) => pip.classList.toggle('spent', i >= n));
    }

    setHudVisible(on) {
        this.hud.classList.toggle('off', !on);
        document.getElementById('topRight').classList.toggle('off', !on);
        this.setPadsVisible(on);
    }

    // --- banner: bounces in from the left, leaves to the right ---
    // Waits for the font, then commits the off-screen start position before
    // flipping the class — otherwise the first show either jumps straight to
    // the middle or animates at the fallback font's width. The wait is a timer,
    // not a frame callback: requestAnimationFrame does not run in a background
    // tab, and a banner that never got its class would sit off screen for good.
    async showBanner(text) {
        await this.fonts;
        this.bannerBox.textContent = text;
        this.banner.classList.remove('out', 'in');
        this.banner.classList.add('on');
        void this.bannerBox.offsetWidth;   // commit the start position
        await new Promise(r => setTimeout(r, 32));
        this.banner.classList.add('in');
    }

    setBanner(text) { this.bannerBox.textContent = text; }

    hideBanner() {
        this.banner.classList.remove('in');
        this.banner.classList.add('out');
        setTimeout(() => this.banner.classList.remove('on', 'out'), 600);
    }

    // --- black curtain ---
    fadeTo(black) { this.fade.classList.toggle('on', black); }

    // --- overlay panels ---
    // { title, tone, lines, actions, body, dim, flush, big, onAnyClick }
    // big: the lines carry the weight (the finish card's score).
    // flush: hard against the left edge, like the corner blocks.
    // onAnyClick: a click anywhere dismisses it (used by the finish card).
    openPanel({ title, tone = 'yellow', lines = [], actions = [], body = null, dim = true, flush = false, big = false, onAnyClick = null }) {
        this.panel.textContent = '';
        this.panel.appendChild(el('div', `panel-title tone-${tone}`, title));
        if (lines.length) {
            const text = el('div', big ? 'panel-body big' : 'panel-body');
            for (const line of lines) text.appendChild(el('p', null, line));
            this.panel.appendChild(text);
        }
        if (body) this.panel.appendChild(body);
        if (actions.length) {
            const row = el('div', 'panel-actions');
            for (const a of actions) {
                const b = el('button', `btn tone-${a.tone || 'blue'}`, a.label);
                b.addEventListener('click', () => { audio.play('click'); a.onClick?.(); });
                row.appendChild(b);
            }
            this.panel.appendChild(row);
        }
        this.overlay.classList.toggle('dim', dim);
        this.overlay.classList.toggle('flush', flush);
        this.panel.classList.toggle('flush', flush);
        this.overlay.onclick = onAnyClick
            ? e => { if (!e.target.closest('.btn')) onAnyClick(); }
            : null;
        clearTimeout(this._panelTimer);
        this.overlay.classList.remove('out');
        this.overlay.classList.add('on');
        this.applyPads();
        // Commit the off-screen start position, then bounce in like the banner.
        // A timer rather than a frame callback, for the same reason: a panel
        // opened while the tab is in the background would never arrive.
        void this.panel.offsetWidth;
        setTimeout(() => this.overlay.classList.add('in'), 16);
    }

    closePanel() {
        this.overlay.onclick = null;
        if (!this.overlay.classList.contains('on')) return;
        this.overlay.classList.remove('in');
        this.overlay.classList.add('out');
        clearTimeout(this._panelTimer);
        this._panelTimer = setTimeout(() => {
            this.overlay.classList.remove('on', 'out');
            this.applyPads();
        }, 520);
    }

    // --- the home menu: pick a boy, with what he has done before ---
    home({ profiles, onPick }) {
        const list = el('div', 'players');
        for (const [name, p] of Object.entries(profiles)) {
            const card = el('button', 'player');
            card.append(
                el('span', 'player-name', name.toUpperCase()),
                el('span', 'player-stat', `FURTHEST  ${DAYS[Math.min(p.bestDay, DAYS.length - 1)]}`),
                el('span', 'player-score', `BEST  ${p.highScore.toLocaleString()}`),
            );
            card.addEventListener('click', () => { audio.play('click'); onPick(name); });
            list.appendChild(card);
        }
        this.openPanel({
            title: 'PAPERBOY',
            lines: ['Pick your rider'],
            body: list,
            dim: true,
        });
    }
}
