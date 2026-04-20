// =====================================================================
// DR1V3N WILD - Garfield Boys' Arcade Customizations
// Loaded after all original game files, before gameInit() is called.
// NOT strict mode - we need to reassign global function declarations.
// =====================================================================

// --- Player config ---
const PLAYERS = {
    caleb: { name: 'CALEB', number: '8', plateText: 'CALEB', color: null },
    ezra:  { name: 'EZRA',  number: '4', plateText: 'EZRA',  color: null }
};
let selectedPlayer = 'caleb';
let noClockMode = false; // false = beat the clock (Caleb default), true = no clock (Ezra default)
let customMenuVisible = true;
let gameOverVisible = false;
let touchLeft = false, touchRight = false;

// --- Mobile/Tablet Performance Optimization ---
const isMobileDevice = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) <= 1024);

// Resolution scale for WebGL rendering (1.0 = full, lower = faster)
let perfScale = isMobileDevice ? 0.65 : 1.0;
const PERF_MIN_SCALE = 0.4;
const PERF_MAX_SCALE = 1.0;
const PERF_FPS_LOW = 30;
const PERF_FPS_OK = 50;
let perfAdaptFrames = 0;

// Sky complexity (cloud/parallax sprite counts)
const perfCloudCount = isMobileDevice ? 40 : 99;
const perfParallaxCount = isMobileDevice ? 40 : 99;
const perfSunSteps = isMobileDevice ? 0.1 : 0.05;

// Colors are set after Color class is available
PLAYERS.caleb.color = hsl(0.13, 0.9, 0.55); // Yellow/gold
PLAYERS.ezra.color  = hsl(0.6, 0.8, 0.5);   // Blue

// --- High scores (per player, per mode) ---
// Keys: driven-wild-{player}-hard-best (distance), driven-wild-{player}-easy-time (completion time)
function getHighScore(player) {
    return parseInt(localStorage.getItem('driven-wild-' + player + '-hard-best') || '0');
}
function setHighScore(player, score) {
    const best = getHighScore(player);
    if (score > best) { localStorage.setItem('driven-wild-' + player + '-hard-best', score); return true; }
    return false;
}
function getHighTime(player) {
    return parseFloat(localStorage.getItem('driven-wild-' + player + '-easy-time') || '0');
}
function setHighTime(player, t) {
    const best = getHighTime(player);
    if (t > 0 && (best === 0 || t < best)) {
        localStorage.setItem('driven-wild-' + player + '-easy-time', t);
        return true;
    }
    return false;
}
function formatDistance(d) {
    if (d >= 1000) return (d/1000).toFixed(1) + ' km';
    return d + ' m';
}

// --- Menu system ---
function isOverlayActive() {
    return customMenuVisible || gameOverVisible;
}

function showCustomMenu() {
    customMenuVisible = true;
    gameOverVisible = false;
    document.getElementById('menu-overlay').classList.remove('hidden');
    document.getElementById('gameover-overlay').classList.remove('active');
    updatePlayerSelection();
    // Enter title/attract mode
    titleScreenMode = 1;
}

function hideCustomMenu() {
    customMenuVisible = false;
    document.getElementById('menu-overlay').classList.add('hidden');
}

function updatePlayerSelection() {
    document.getElementById('btn-caleb').classList.toggle('selected', selectedPlayer === 'caleb');
    document.getElementById('btn-ezra').classList.toggle('selected', selectedPlayer === 'ezra');
    // Update mode button scores for selected player
    updateModeScores();
}

function updateModeScores() {
    const p = selectedPlayer;
    const easyTime = getHighTime(p);
    document.getElementById('best-easy').textContent =
        easyTime > 0 ? formatTimeString(easyTime) : '';
    const hardDist = getHighScore(p);
    document.getElementById('best-hard').textContent =
        hardDist > 0 ? formatDistance(hardDist) : '';
}

function selectPlayer(player) {
    selectedPlayer = player;
    updatePlayerSelection();
}

function selectModeAndStart(easy) {
    noClockMode = easy;
    startCustomGame();
}

function showSteerHints() {
    const l = document.getElementById('hint-left');
    const r = document.getElementById('hint-right');
    l.classList.remove('show');
    r.classList.remove('show');
    void l.offsetWidth;
    l.classList.add('show');
    r.classList.add('show');
}

function showGameOverScreen() {
    gameOverVisible = true;
    const dist = Math.round(playerVehicle.pos.z / 100);
    let isNew = false;
    document.getElementById('go-title').classList.toggle('win', !!playerWin);

    if (noClockMode) {
        // No clock mode: show time, save best time if finished
        document.getElementById('go-title').textContent = playerWin ? 'FINISHED!' : 'GAME OVER';
        document.getElementById('go-distance').textContent = 'TIME: ' + formatTimeString(raceTime);
        if (playerWin) {
            isNew = setHighTime(selectedPlayer, raceTime);
            const bestT = getHighTime(selectedPlayer);
            document.getElementById('go-best').textContent = 'Best: ' + formatTimeString(bestT);
        } else {
            document.getElementById('go-best').textContent = '';
        }
    } else {
        // Beat the clock mode: show distance, save best distance
        document.getElementById('go-title').textContent = playerWin ? 'YOU WIN!' : 'TIME\'S UP!';
        if (playerWin) {
            isNew = setHighTime(selectedPlayer, raceTime);
            document.getElementById('go-distance').textContent = 'TIME: ' + formatTimeString(raceTime);
            const bestT = getHighTime(selectedPlayer);
            document.getElementById('go-best').textContent = bestT > 0 ? 'Best: ' + formatTimeString(bestT) : '';
        } else {
            isNew = setHighScore(selectedPlayer, dist);
            document.getElementById('go-distance').textContent = formatDistance(dist);
            const best = getHighScore(selectedPlayer);
            document.getElementById('go-best').textContent = 'Best: ' + formatDistance(best);
        }
    }
    document.getElementById('go-new').style.display = isNew ? 'block' : 'none';
    document.getElementById('gameover-overlay').classList.add('active');
}

function startCustomGame() {
    const cfg = PLAYERS[selectedPlayer];

    hideCustomMenu();
    titleScreenMode = 0;

    // Rebuild track and start game
    gameStart();

    // Set player color
    playerVehicle.color = cfg.color;

    // In no-clock mode, use freeRide so the original timer logic is bypassed
    if (noClockMode) {
        freeRide = 1;
    }

    // Regenerate license plate and number textures for this player
    regeneratePlayerTextures(cfg);

    showSteerHints();
}

// --- Regenerate the license plate and roof number on the texture atlas ---
function regeneratePlayerTextures(cfg) {
    // The generative texture is on mainCanvas initially, then uploaded to WebGL.
    // We need to redraw tiles (3,0) and (4,0) then re-upload.
    const tileSize = generativeTileSize; // 512
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = tileSize;
    const ctx = canvas.getContext('2d');

    // License plate (tile 3,0)
    ctx.clearRect(0, 0, tileSize, tileSize);
    ctx.fillStyle = hsl(0,0,.8).toString(false);
    ctx.fillRect(0, 0, tileSize, tileSize);
    ctx.fillStyle = hsl(.7,.9,.25).toString(false);
    ctx.font = 'bold ' + (tileSize * 0.35) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.plateText, tileSize/2, tileSize * 0.55);

    // Draw onto the WebGL texture
    const gl = glContext;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 3 * tileSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

    // Roof number (tile 4,0)
    ctx.clearRect(0, 0, tileSize, tileSize);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, tileSize, tileSize);
    ctx.fillStyle = '#fff';
    ctx.font = '900 ' + (tileSize * 0.85) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.number, tileSize/2, tileSize * 0.55);

    gl.texSubImage2D(gl.TEXTURE_2D, 0, 4 * tileSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

// --- Performance: Resolution scaling for WebGL canvas ---
const _origGlPreRender = glPreRender;
glPreRender = function(canvasSize) {
    if (perfScale < 1.0) {
        canvasSize = vec3(
            Math.max(360, canvasSize.x * perfScale | 0),
            Math.max(240, canvasSize.y * perfScale | 0)
        );
    }
    _origGlPreRender(canvasSize);
};

// --- Performance: Aggressive shadow culling on mobile ---
if (isMobileDevice) {
    const _origPushShadow = pushShadow;
    pushShadow = function(pos, xSize, zSize) {
        if (pos.z > 1e4) return; // cull shadows beyond 10k (vs default 20k)
        _origPushShadow(pos, xSize, zSize);
    };
}

// --- Performance: Cap AI vehicle count on mobile ---
if (isMobileDevice) {
    const _origSpawnVehicle = spawnVehicle;
    spawnVehicle = function(z) {
        if (vehicles.length >= 6) return; // cap at 6 (vs default 10)
        _origSpawnVehicle(z);
    };
}

// --- Performance: Reduced sky complexity on mobile ---
const _origDrawSky = drawSky;
drawSky = function() {
    glEnableLighting = glEnableFog = 0;
    glSetDepthTest(0,0);
    random.setSeed(13);

    const levelFloat = cameraOffset/checkpointDistance;
    const levelInfo = getLevelInfo(levelFloat);
    const levelInfoLast = getLevelInfo(levelFloat-1);
    const levelPercent = levelFloat%1;
    const levelLerpPercent = percent(levelPercent, 0, levelLerpRange);

    const skyTop = 13e2;
    const skyZ   = 1e3;
    const skyW   = 5e3;
    const skyH   = 8e2;
    {
        const skyColorTop = levelInfoLast.skyColorTop.lerp(levelInfo.skyColorTop, levelLerpPercent);
        const skyColorBottom = levelInfoLast.skyColorBottom.lerp(levelInfo.skyColorBottom, levelLerpPercent);
        pushGradient(vec3(0,skyH,skyZ).addSelf(cameraPos), vec3(skyW,skyH), skyColorTop, skyColorBottom);
        glLightDirection = vec3(0,1,1).rotateY(worldHeading).normalize();
        glLightColor = skyColorTop.lerp(WHITE,.8).lerp(BLACK,.1);
        glAmbientColor = skyColorBottom.lerp(WHITE,.8).lerp(BLACK,.6);
        glFogColor = skyColorBottom.lerp(WHITE,.5);
    }

    const headingScale = -5e3;
    const circleSpriteTile = spriteList.circle.spriteTile;
    const dotSpriteTile = spriteList.dot.spriteTile;
    {
        const sunSize = 2e2;
        const sunHeight = skyTop*lerp(levelLerpPercent, levelInfoLast.sunHeight, levelInfo.sunHeight);
        const sunColor = levelInfoLast.sunColor.lerp(levelInfo.sunColor, levelLerpPercent);
        const x = mod(worldHeading+PI,2*PI)-PI;
        for(let i=0;i<1;i+=perfSunSteps)
        {
            sunColor.a = i?(1-i)**7:1;
            pushSprite(vec3(x*headingScale, sunHeight, skyZ).addSelf(cameraPos), vec3(sunSize*(1+i*30)), sunColor, i?dotSpriteTile:circleSpriteTile);
        }
    }

    const range = 1e4;
    const windSpeed = 50;
    for(let i=perfCloudCount;i--;)
    {
        const cloudColor = levelInfoLast.cloudColor.lerp(levelInfo.cloudColor, levelLerpPercent);
        const cloudWidth = lerp(levelLerpPercent, levelInfoLast.cloudWidth, levelInfo.cloudWidth);
        const cloudHeight = lerp(levelLerpPercent, levelInfoLast.cloudHeight, levelInfo.cloudHeight);
        let x = worldHeading*headingScale + random.float(range) + time*windSpeed*random.float(1,1.5);
        x = mod(x,range) - range/2;
        const y = random.float(skyTop);
        const s = random.float(3e2,8e2);
        pushSprite(vec3(x, y, skyZ).addSelf(cameraPos), vec3(s*cloudWidth,s*cloudHeight), cloudColor, dotSpriteTile)
    }

    const horizonSprite = levelInfo.horizonSprite;
    const horizonSpriteTile = horizonSprite.spriteTile;
    const horizonSpriteSize = levelInfo.horizonSpriteSize;
    for(let i=perfParallaxCount;i--;)
    {
        const p = i/perfParallaxCount;
        const ltp = lerp(p,1,.5);
        const ltt = .1;
        const levelTransition = levelFloat<.5 || levelFloat > levelGoal-.5 ? 1 : levelPercent < ltt ? (levelPercent/ltt)**ltp :
                levelPercent > 1-ltt ? 1-((levelPercent-1)/ltt+1)**ltp : 1;
        const parallax = lerp(p, .9, .98);
        const s = random.float(1e2,2e2)*horizonSpriteSize* lerp(p,1,.5)
        const size = vec3(random.float(1,2)*(horizonSprite.canMirror ? s*random.sign() : s),s,s);
        const x = mod(worldHeading*headingScale/parallax + random.float(range),range) - range/2;
        const yMax = size.y*.75;
        if (!js13kBuildLevel2 && levelInfo.horizonFlipChance)
        {
            if (random.bool(levelInfo.horizonFlipChance))
                size.y *= -1;
        }
        const y = lerp(levelTransition, -yMax*1.5, yMax);
        const c = horizonSprite.getRandomSpriteColor();
        pushSprite(vec3(x, y, skyZ).addSelf(cameraPos), size, c, horizonSpriteTile);
    }

    {
        const lookAhead = .2;
        const levelFloatAhead = levelFloat + lookAhead;
        const levelInfo = getLevelInfo(levelFloatAhead);
        const levelInfoLast = getLevelInfo(levelFloatAhead-1);
        const levelPercent = levelFloatAhead%1;
        const levelLerpPercent = percent(levelPercent, 0, levelLerpRange);
        const groundColor = levelInfoLast.groundColor.lerp(levelInfo.groundColor, levelLerpPercent).brighten(.1);
        pushSprite(vec3(0,-skyH,skyZ).addSelf(cameraPos), vec3(skyW,skyH), groundColor);
    }

    glRender();
    glSetDepthTest();
    glEnableLighting = glEnableFog = 1;
};

// --- Patch: Override the original gameInit to add our menu ---
const _originalGameInit = gameInit;
gameInit = function() {
    _originalGameInit();

    // Set canvas z-index low so our overlays are above
    if (mainCanvas) mainCanvas.style.zIndex = '1';
    if (typeof glCanvas !== 'undefined' && glCanvas) glCanvas.style.zIndex = '1';

    initCustomMenus();
    showCustomMenu();
};

// --- Patch: Override gameUpdateInternal to intercept game over ---
const _originalGameUpdateInternal = gameUpdateInternal;
gameUpdateInternal = function() {
    // If our menu is visible, only do title screen attract mode updates
    if (customMenuVisible) {
        if (titleScreenMode) {
            playerVehicle.pos.z += 20;
            playerVehicle.velocity.z = 20;
        }
        updateCars();
        return;
    }

    // In no-clock mode, track raceTime ourselves (freeRide skips it in original)
    if (noClockMode && !startCountdown && !gameOverTimer.isSet()) {
        raceTime += timeDelta;
    }

    // Prevent original's auto-return to title when our game over overlay is showing
    // (original would auto-return after 9 seconds)
    if (gameOverVisible && gameOverTimer.isSet()) {
        // Just update cars, skip original's game-over-return logic
        updateCars();
        return;
    }

    _originalGameUpdateInternal();

    // If original set titleScreenMode (e.g. Escape key), show our menu instead
    if (titleScreenMode && !customMenuVisible) {
        showCustomMenu();
        return;
    }

    // Check for game over to show our overlay
    if (gameOverTimer.isSet() && !gameOverVisible && gameOverTimer.get() > 0.5) {
        showGameOverScreen();
    }
};

// --- Patch: Override title screen click handling ---
// The original checks mouseWasPressed(0) to exit title screen.
// We prevent that when our menu is showing.
const _originalMouseWasPressed = mouseWasPressed;
// Can't easily override this, so we'll just block input when overlay is active.

// --- Patch: Auto-accelerate + touch steering in PlayerVehicle.update ---
const _originalPlayerUpdate = PlayerVehicle.prototype.update;
PlayerVehicle.prototype.update = function() {
    if (customMenuVisible || titleScreenMode) {
        if (titleScreenMode) {
            this.pos.z += this.velocity.z = 20;
        }
        return;
    }

    // Inject auto-accelerate and touch steering into gamepad data
    // so it works on touch devices where isUsingGamepad=true
    if (!gameOverTimer.isSet()) {
        // Auto-accelerate: press gamepad button 0 (gas) and button 7 (RT gas)
        if (gamepadData && gamepadData[0]) {
            gamepadData[0][0] = 3; // gas button pressed
            gamepadData[0][7] = 3;
            if (gamepadDataValues && gamepadDataValues[0])
                gamepadDataValues[0][7] = 1; // full analog gas
        }
        // Touch zone steering via gamepad stick
        if (gamepadStickData && gamepadStickData[0]) {
            let stickX = gamepadStickData[0][0] ? gamepadStickData[0][0].x : 0;
            if (touchLeft) stickX = -1;
            if (touchRight) stickX = 1;
            gamepadStickData[0][0] = vec3(stickX, 0);
        }
    }

    _originalPlayerUpdate.call(this);
};

// Override keyIsDown for keyboard auto-accelerate and touch steering
const _originalKeyIsDown = keyIsDown;
keyIsDown = function(key, device) {
    if (isOverlayActive()) return false;

    // Auto-accelerate: always report ArrowUp as pressed during gameplay
    if (!titleScreenMode && !gameOverTimer.isSet()) {
        if (key === 'ArrowUp') return true;
    }

    // Touch zone steering (also for keyboard fallback)
    if (key === 'ArrowLeft' && touchLeft) return true;
    if (key === 'ArrowRight' && touchRight) return true;

    return _originalKeyIsDown(key, device);
};

// --- Patch: Touch zone input handling ---
function initTouchZones() {
    // Listen for touch events on the document to track our steering zones
    document.addEventListener('touchstart', updateTouchZones, { passive: true });
    document.addEventListener('touchmove', updateTouchZones, { passive: true });
    document.addEventListener('touchend', updateTouchZones, { passive: true });
    document.addEventListener('touchcancel', updateTouchZones, { passive: true });
}

function updateTouchZones(e) {
    if (isOverlayActive()) {
        touchLeft = false;
        touchRight = false;
        return;
    }
    touchLeft = false;
    touchRight = false;
    for (let i = 0; i < e.touches.length; i++) {
        const tx = e.touches[i].clientX / innerWidth;
        if (tx < 0.4) touchLeft = true;
        if (tx > 0.6) touchRight = true;
    }
}

// --- Patch: Disable the original touch gamepad overlay (we use our own touch zones) ---
touchGamepadRender = function() {};

// --- Patch: Override HUD — speed bottom-left, distance bottom-right ---
const _originalDrawHUD = drawHUD;
drawHUD = function() {
    // Adaptive quality: adjust resolution based on actual FPS
    if (++perfAdaptFrames >= 180) { // check every ~3 seconds
        perfAdaptFrames = 0;
        if (averageFPS < PERF_FPS_LOW && perfScale > PERF_MIN_SCALE)
            perfScale = Math.max(PERF_MIN_SCALE, perfScale - 0.1);
        else if (averageFPS > PERF_FPS_OK && perfScale < PERF_MAX_SCALE)
            perfScale = Math.min(PERF_MAX_SCALE, perfScale + 0.05);
    }

    if (freeCamMode) return;

    if (enhancedMode && paused) {
        drawHUDText('-PAUSE-', vec3(.5,.9), .08, undefined, 'monospace',undefined,900,undefined,undefined,undefined,3);
    }

    if (titleScreenMode) {
        // Skip original's oscillating title text — our overlay handles the menu
        return;
    }

    if (startCountdownTimer.active() || startCountdown) {
        const a = 1-time%1;
        const t = !startCountdown && startCountdownTimer.active() ? 'GO!' : startCountdown|0;
        const c = (startCountdown?RED:GREEN).copy();
        c.a = a;
        drawHUDText(t, vec3(.5,.2), .25-a*.1, c, undefined,undefined,900,undefined,undefined,.03);
    } else {
        const wave1 = .04*(1 - abs(Math.sin(time*2)));

        if (gameOverTimer.isSet()) {
            // Win/game over screen handled by our overlay
            const c = playerWin?YELLOW:WHITE;
            const wave2 = .04*(1 - abs(Math.sin(time*2+PI/2)));
            drawHUDText(playerWin?'YOU':'GAME', vec3(.5,.2), .1+wave1, c, undefined,undefined,900,'italic',.5,undefined,4);
            drawHUDText(playerWin?'WIN!':'OVER!', vec3(.5,.3), .1+wave2, c, undefined,undefined,900,'italic',.5,undefined,4);
            if (playerNewRecord || playerNewDistanceRecord && !bestTime)
                drawHUDText('NEW RECORD', vec3(.5,.6), .08+wave1/4, RED, 'monospace',undefined,900,undefined,undefined,undefined,3);
        } else if (!startCountdownTimer.active() && !gameOverTimer.isSet()) {
            if (noClockMode) {
                // No clock mode: elapsed time top center
                const timeString = formatTimeString(raceTime);
                drawHUDText(timeString, vec3(.5,.05), .05, WHITE, 'monospace','center');
            } else {
                // Beat the clock: big center checkpoint time
                const c = checkpointTimeLeft < 4 ? RED : checkpointTimeLeft < 11 ? YELLOW : WHITE;
                const t = checkpointTimeLeft|0;
                let y=.13, s=.14;
                if (enhancedMode && getAspect() < .6)
                    y=.14, s=.1;
                drawHUDText(t, vec3(.5,y), s, c, undefined,undefined,900,undefined,undefined,.04);
            }
        }

    }

    // Stage number — top right
    if (!titleScreenMode && !gameOverTimer.isSet()) {
        const level = playerLevel+1;
        drawHUDText('STAGE '+level, vec3(.99,.05), .05, undefined, 'monospace','right');
    }

    // Speed — bottom left
    if (!titleScreenMode && !gameOverTimer.isSet()) {
        const speed = abs(playerVehicle.velocity.z)|0;
        drawHUDText(speed+' MPH', vec3(.01,.95), .06, WHITE, 'monospace','left',900,'italic');
    }

    // Distance — bottom right
    if (!titleScreenMode && !gameOverTimer.isSet()) {
        const dist = Math.round(playerVehicle.pos.z / 100);
        drawHUDText(formatDistance(dist), vec3(.99,.95), .06, WHITE, 'monospace','right',900,'italic');
    }
};

// --- Menu event setup ---
function initCustomMenus() {
    // Stop overlays from letting events through to game
    for (const id of ['menu-overlay', 'gameover-overlay', 'back-btn', 'btn-easy', 'btn-hard']) {
        const el = document.getElementById(id);
        if (!el) continue;
        for (const evt of ['mousedown','mouseup','touchstart','touchmove','touchend','click','pointerdown','pointerup']) {
            el.addEventListener(evt, (e) => e.stopPropagation());
        }
    }

    document.getElementById('btn-caleb').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectPlayer('caleb');
    });
    document.getElementById('btn-ezra').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectPlayer('ezra');
    });
    document.getElementById('btn-easy').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectModeAndStart(true);
    });
    document.getElementById('btn-hard').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        selectModeAndStart(false);
    });
    document.getElementById('gameover-overlay').addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        document.getElementById('gameover-overlay').classList.remove('active');
        gameOverVisible = false;
        showCustomMenu();
    });

    updatePlayerSelection();
    initTouchZones();
}

// --- Patch: Override the save data to use per-player keys ---
// The original uses localStorage['DW3'] and ['DW4'].
// We override writeSaveData to also save per-player data.
const _originalWriteSaveData = writeSaveData;
writeSaveData = function() {
    _originalWriteSaveData();
};

// --- Start the game! ---
gameInit();
