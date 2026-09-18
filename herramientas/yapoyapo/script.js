// ============================================================
//  Yapo Yapo — Juego de puzzle para VicWebOs
//  ------------------------------------------------------------
//  Mecánica: caen pares de Yapos, junta 4+ del mismo tipo
//  para explotarlos. A más puntos, más rápido y mejores
//  recompensas.
//
//  Recompensas (versión demo, reducidas 50%):
//    4→1, 6→2, 8→3, 10→4 monedas base
//    Cada 350 pts: +1 moneda extra y +10% velocidad
//
//  Controles:
//    PC: ←/→ mover, ↑ girar, ↓ bajar rápido, Enter caída
//        Alternativa WASD
//    Android: botones en pantalla
// ============================================================

'use strict';

// ---------- Constantes del juego ----------
const COLS = 6;
const ROWS = 12;
const CELL = 50;
const W = COLS * CELL;
const H = ROWS * CELL;

const FALL_SPEED_BASE = 1.28;
const SOFT_DROP_MULT = 9;
const CLEAR_DURATION = 0.38;
const LOCK_DELAY = 0.18;

// Sistema de tiers
const TIER_POINTS = 350;
const TIER_COIN_BONUS = 1;      // +1 moneda por tier (era +2)
const TIER_SPEED_BONUS = 0.10;  // +10% velocidad por tier

// ============================================================
//  YAPOS: 5 iconos Lucide con colores distintivos
//  Los paths son los oficiales de Lucide (viewBox 0 0 24 24)
// ============================================================
const ICON_PATHS = {
    heart:   'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
    star:    'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
    hexagon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
    zap:     'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
    diamond: 'M2.7 10.3a2.41 2.41 0 0 0 0 3.4l7.6 7.6a2.41 2.41 0 0 0 3.4 0l7.6-7.6a2.41 2.41 0 0 0 0-3.4l-7.6-7.6a2.41 2.41 0 0 0-3.4 0Z'
};

const YAPOS = [
    { id: 'heart',   color: '#e63946', darkColor: '#b32c37', glow: 'rgba(230,57,70,0.45)',   label: 'Corazón' },
    { id: 'star',    color: '#f4b400', darkColor: '#c49000', glow: 'rgba(244,180,0,0.45)',   label: 'Estrella' },
    { id: 'hexagon', color: '#27ae60', darkColor: '#1e824c', glow: 'rgba(39,174,96,0.45)',   label: 'Hexágono' },
    { id: 'zap',     color: '#3498db', darkColor: '#2478a8', glow: 'rgba(52,152,219,0.45)',  label: 'Rayo' },
    { id: 'diamond', color: '#8e44ad', darkColor: '#6b3082', glow: 'rgba(142,68,173,0.45)',  label: 'Diamante' }
];

// Imágenes precargadas de los iconos (blanco, sobre el yapo coloreado)
const _iconImages = {};

function crearIconImage(pathData, color = '#FFFFFF', strokeWidth = 2.2) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><path d="${pathData}"/></svg>`;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = new Image();
    img.src = url;
    return img;
}

function precargarIconos() {
    YAPOS.forEach(y => {
        _iconImages[y.id] = crearIconImage(ICON_PATHS[y.id]);
    });
}

// ============================================================
//  Estado global
// ============================================================
let usuarioActual = null;

const state = {
    phase: 'menu',
    grid: [],
    pair: null,
    next: null,
    score: 0,
    coins: 0,
    clearingCells: [],
    clearProgress: 0,
    softDropping: false,
    chainCount: 0,
    rafId: null,
    running: false,
    lastTime: 0
};

// ============================================================
//  DOM
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('nextCanvas');
const nextCtx = nextCanvas.getContext('2d');
const userBadge = document.getElementById('ypUserBadge');
const scoreDisplay = document.getElementById('scoreDisplay');
const coinsDisplay = document.getElementById('coinsDisplay');
const tierDisplay = document.getElementById('tierDisplay');
const tierBonus = document.getElementById('tierBonus');
const tierProgressFill = document.getElementById('tierProgressFill');
const tierNext = document.getElementById('tierNext');
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const gameOverModal = document.getElementById('gameOverModal');
const finalScoreEl = document.getElementById('finalScore');
const finalCoinsEl = document.getElementById('finalCoins');
const finalTierEl = document.getElementById('finalTier');
const chainOverlay = document.getElementById('chainOverlay');
const modalIcon = document.getElementById('modalIcon');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');

// ============================================================
//  TEMA — heredar variables CSS del padre
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300',
            '--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt',
            '--gray-50','--gray-100','--gray-200','--gray-300','--gray-400',
            '--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3',
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'vicwebos_tema_cambio') {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  CANVAS SETUP
// ============================================================
function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const nW = 90, nH = 90;
    nextCanvas.width = nW * dpr;
    nextCanvas.height = nH * dpr;
    nextCanvas.style.width = nW + 'px';
    nextCanvas.style.height = nH + 'px';
    nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ============================================================
//  SISTEMA DE NIVELES
// ============================================================
function getCurrentTier() {
    return Math.floor(state.score / TIER_POINTS);
}

function getCurrentFallSpeed() {
    return FALL_SPEED_BASE * (1 + getCurrentTier() * TIER_SPEED_BONUS);
}

// ============================================================
//  API de VicWebOs
// ============================================================
function obtenerAPI() {
    return window.parent?.__vicwebos || null;
}

async function cargarContexto() {
    const api = obtenerAPI();
    if (!api) return false;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return false;
    usuarioActual = cuenta;
    return true;
}

async function sumarMonedas(cantidad) {
    if (cantidad <= 0) return;
    const api = obtenerAPI();
    if (!api) return;
    try {
        await api.canjear(
            'puzzle',
            'yapoyapo',
            `Partida: ${state.score} pts · Nivel ${getCurrentTier()}`,
            cantidad
        );
    } catch (e) {
        console.warn('[Yapo Yapo] No se pudieron sumar monedas:', e);
    }
}

// ============================================================
//  LÓGICA DEL GRID
// ============================================================
function createEmptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
}

function randomYapoIndex() {
    return Math.floor(Math.random() * YAPOS.length);
}

function createRandomPair() {
    return {
        x: Math.floor(COLS / 2) - 1,
        gridY: 0,
        visualY: 0,
        rotation: 0,
        rootColor: randomYapoIndex(),
        attachedColor: randomYapoIndex(),
        lockDelay: 0
    };
}

function getGridCells(x, y, rotation, rootColor, attachedColor) {
    const root = { x, y, color: rootColor };
    let attached;
    switch (rotation) {
        case 0: attached = { x, y: y - 1, color: attachedColor }; break;
        case 1: attached = { x: x + 1, y, color: attachedColor }; break;
        case 2: attached = { x, y: y + 1, color: attachedColor }; break;
        case 3: attached = { x: x - 1, y, color: attachedColor }; break;
    }
    return [root, attached];
}

function canPairBeAt(pair, x, y, rotation) {
    const cells = getGridCells(x, y, rotation, pair.rootColor, pair.attachedColor);
    for (const c of cells) {
        if (c.x < 0 || c.x >= COLS) return false;
        if (c.y >= ROWS) return false;
        if (c.y >= 0 && state.grid[c.y][c.x] !== -1) return false;
    }
    return true;
}

// ============================================================
//  FLUJO DE LA PARTIDA
// ============================================================
function initGame() {
    state.grid = createEmptyGrid();
    state.pair = null;
    state.next = createRandomPair();
    state.score = 0;
    state.coins = 0;
    state.clearingCells = [];
    state.clearProgress = 0;
    state.softDropping = false;
    state.chainCount = 0;
    state.phase = 'playing';
    updateUI();
    updateTierUI();
    spawnNextPair();
}

function spawnNextPair() {
    if (!state.next) state.next = createRandomPair();

    const pair = state.next;
    state.next = createRandomPair();

    pair.x = Math.floor(COLS / 2) - 1;
    pair.gridY = 0;
    pair.visualY = 0;
    pair.rotation = 0;
    pair.lockDelay = 0;

    if (!canPairBeAt(pair, pair.x, pair.gridY, pair.rotation)) {
        state.pair = null;
        endGame(false);
        return;
    }

    state.pair = pair;
    renderNext();
}

function lockPair() {
    const pair = state.pair;
    if (!pair) return;

    const cells = getGridCells(
        pair.x, pair.gridY, pair.rotation,
        pair.rootColor, pair.attachedColor
    );

    for (const c of cells) {
        if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) {
            state.grid[c.y][c.x] = c.color;
        }
    }

    state.pair = null;

    const matches = findMatches();
    if (matches.length > 0) {
        state.chainCount = 0;
        startClear(matches);
    } else {
        spawnNextPair();
    }
}

function startClear(cells) {
    state.chainCount++;
    state.clearingCells = cells;
    state.clearProgress = 0;
    state.phase = 'clearing';

    if (state.chainCount >= 2) {
        showChainBanner(state.chainCount);
    }
}

function finishClear() {
    const cleared = state.clearingCells.length;

    // Capturamos tier ANTES de sumar puntos, para no saltar brusco
    const tierAtClear = getCurrentTier();
    const coinBonus = tierAtClear * TIER_COIN_BONUS;

    for (const c of state.clearingCells) {
        state.grid[c.y][c.x] = -1;
    }
    state.clearingCells = [];
    state.clearProgress = 0;

    state.score += cleared * 10 * state.chainCount;

    // Recompensas base (reducidas 50% respecto a la v1)
    let baseReward = 0;
    if (cleared >= 10) baseReward = 4;      // antes 8
    else if (cleared >= 8) baseReward = 3;  // antes 6
    else if (cleared >= 6) baseReward = 2;  // antes 4
    else if (cleared >= 4) baseReward = 1;  // antes 2

    if (baseReward > 0) {
        state.coins += baseReward + coinBonus;
    }

    updateUI();
    updateTierUI();
    applyGravity();

    const matches = findMatches();
    if (matches.length > 0) {
        startClear(matches);
    } else {
        state.chainCount = 0;
        state.phase = 'playing';
        spawnNextPair();
    }
}

function applyGravity() {
    for (let x = 0; x < COLS; x++) {
        let writeY = ROWS - 1;
        for (let y = ROWS - 1; y >= 0; y--) {
            if (state.grid[y][x] !== -1) {
                state.grid[writeY][x] = state.grid[y][x];
                if (writeY !== y) state.grid[y][x] = -1;
                writeY--;
            }
        }
        for (let y = writeY; y >= 0; y--) {
            state.grid[y][x] = -1;
        }
    }
}

function findMatches() {
    const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const matches = [];

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (state.grid[y][x] === -1 || visited[y][x]) continue;

            const color = state.grid[y][x];
            const group = [];
            const stack = [{ x, y }];
            visited[y][x] = true;

            while (stack.length > 0) {
                const { x: cx, y: cy } = stack.pop();
                group.push({ x: cx, y: cy, color });

                const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
                for (const [dx, dy] of dirs) {
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS &&
                        !visited[ny][nx] && state.grid[ny][nx] === color) {
                        visited[ny][nx] = true;
                        stack.push({ x: nx, y: ny });
                    }
                }
            }

            if (group.length >= 4) {
                matches.push(...group);
            }
        }
    }
    return matches;
}

// ============================================================
//  UPDATE
// ============================================================
function update(dt) {
    if (state.phase === 'clearing') {
        state.clearProgress += dt / CLEAR_DURATION;
        if (state.clearProgress >= 1) finishClear();
        return;
    }

    if (state.phase !== 'playing' || !state.pair) return;

    const pair = state.pair;
    const canFall = canPairBeAt(pair, pair.x, pair.gridY + 1, pair.rotation);

    if (!canFall) {
        pair.visualY = pair.gridY;
        pair.lockDelay += dt;
        if (pair.lockDelay >= LOCK_DELAY) {
            lockPair();
        }
        return;
    }

    pair.lockDelay = 0;
    const speed = state.softDropping
        ? getCurrentFallSpeed() * SOFT_DROP_MULT
        : getCurrentFallSpeed();
    pair.visualY += speed * dt;

    if (pair.visualY >= pair.gridY + 1) {
        pair.gridY++;
        pair.visualY = pair.gridY;
    }
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    // Fondo del tablero: siempre oscuro para que los yapos resalten
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#241830');
    bgGrad.addColorStop(1, '#1a1520');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Grid sutil
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL + 0.5, 0);
        ctx.lineTo(x * CELL + 0.5, H);
        ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL + 0.5);
        ctx.lineTo(W, y * CELL + 0.5);
        ctx.stroke();
    }

    // Yapos fijos
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const v = state.grid[y][x];
            if (v === -1) continue;
            drawYapo(x, y, v, 1, 1, 0);
        }
    }

    // Animación de explosión
    if (state.phase === 'clearing') {
        const p = state.clearProgress;
        const scale = Math.max(0, 1 - p * 1.2);
        const alpha = Math.max(0, 1 - p);
        const rotation = p * Math.PI;

        for (const c of state.clearingCells) {
            drawYapo(c.x, c.y, c.color, scale, alpha, rotation);
        }
    }

    // Pieza activa
    if (state.pair && state.phase === 'playing') {
        drawPair(state.pair);
    }
}

function drawYapo(gridX, gridY, colorIdx, scale, alpha, rotation) {
    if (colorIdx < 0 || colorIdx >= YAPOS.length) return;
    const yapo = YAPOS[colorIdx];
    const cx = gridX * CELL + CELL / 2;
    const cy = gridY * CELL + CELL / 2;
    const size = CELL * 0.9 * scale;
    const radius = size / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    if (rotation) ctx.rotate(rotation);

    // 1) Glow exterior (difuminado del color del yapo)
    const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.35);
    glowGrad.addColorStop(0, yapo.glow);
    glowGrad.addColorStop(0.65, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
    ctx.fill();

    // 2) Círculo principal con degradado interno (da sensación de esfera)
    const mainGrad = ctx.createRadialGradient(
        -radius * 0.35, -radius * 0.35, 0,
        0, 0, radius
    );
    mainGrad.addColorStop(0, yapo.color);
    mainGrad.addColorStop(1, yapo.darkColor);

    ctx.fillStyle = mainGrad;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.fill();

    // 3) Borde blanco sutil
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    // 4) Highlight superior (brillo)
    const highlight = ctx.createRadialGradient(
        -radius * 0.35, -radius * 0.4, 0,
        -radius * 0.35, -radius * 0.4, radius * 0.55
    );
    highlight.addColorStop(0, 'rgba(255,255,255,0.45)');
    highlight.addColorStop(1, 'transparent');
    ctx.fillStyle = highlight;
    ctx.beginPath();
    ctx.arc(-radius * 0.15, -radius * 0.2, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 5) Icono Lucide blanco centrado
    const img = _iconImages[yapo.id];
    if (img && img.complete && img.naturalWidth > 0) {
        const iconSize = size * 0.55;
        ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize);
    }

    ctx.restore();
}

function drawPair(pair) {
    const x = pair.x;
    const y = pair.visualY;

    let cells;
    switch (pair.rotation) {
        case 0:
            cells = [
                { x, y: y - 1, color: pair.attachedColor },
                { x, y,       color: pair.rootColor }
            ];
            break;
        case 1:
            cells = [
                { x,       y, color: pair.rootColor },
                { x: x + 1, y, color: pair.attachedColor }
            ];
            break;
        case 2:
            cells = [
                { x, y,       color: pair.rootColor },
                { x, y: y + 1, color: pair.attachedColor }
            ];
            break;
        case 3:
            cells = [
                { x: x - 1, y, color: pair.attachedColor },
                { x,       y, color: pair.rootColor }
            ];
            break;
    }

    for (const c of cells) {
        if (c.y < -1) continue;
        drawYapo(c.x, c.y, c.color, 1, 1, 0);
    }
}

function renderNext() {
    const Wn = 90, Hn = 90;
    nextCtx.clearRect(0, 0, Wn, Hn);

    const bg = nextCtx.createLinearGradient(0, 0, 0, Hn);
    bg.addColorStop(0, '#241830');
    bg.addColorStop(1, '#1a1520');
    nextCtx.fillStyle = bg;
    nextCtx.fillRect(0, 0, Wn, Hn);

    if (!state.next) return;

    const size = 34;
    const cx = Wn / 2;
    const cyTop = Hn / 2 - size * 0.55;
    const cyBot = Hn / 2 + size * 0.55;

    drawYapoIn(nextCtx, cx, cyTop, size, state.next.attachedColor);
    drawYapoIn(nextCtx, cx, cyBot, size, state.next.rootColor);
}

function drawYapoIn(c, cx, cy, size, colorIdx) {
    if (colorIdx < 0 || colorIdx >= YAPOS.length) return;
    const yapo = YAPOS[colorIdx];
    const radius = size / 2;

    // Glow
    const glowGrad = c.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.3);
    glowGrad.addColorStop(0, yapo.glow);
    glowGrad.addColorStop(0.65, 'transparent');
    c.fillStyle = glowGrad;
    c.beginPath();
    c.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
    c.fill();

    // Main
    const mainGrad = c.createRadialGradient(
        cx - radius * 0.35, cy - radius * 0.35, 0,
        cx, cy, radius
    );
    mainGrad.addColorStop(0, yapo.color);
    mainGrad.addColorStop(1, yapo.darkColor);
    c.fillStyle = mainGrad;
    c.beginPath();
    c.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
    c.fill();

    // Border
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = Math.max(1, size * 0.045);
    c.beginPath();
    c.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
    c.stroke();

    // Icon
    const img = _iconImages[yapo.id];
    if (img && img.complete && img.naturalWidth > 0) {
        const iconSize = size * 0.55;
        c.drawImage(img, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
    }
}

// ============================================================
//  UI
// ============================================================
function updateUI() {
    scoreDisplay.textContent = state.score;
    coinsDisplay.textContent = state.coins;
}

function updateTierUI() {
    const tier = getCurrentTier();
    tierDisplay.textContent = tier;

    const bonus = tier * TIER_COIN_BONUS;
    const speedMult = (1 + tier * TIER_SPEED_BONUS).toFixed(2);
    tierBonus.textContent = `+${bonus} · x${speedMult}`;

    const pointsIntoCurrentTier = state.score - (tier * TIER_POINTS);
    const progressPct = Math.min(100, (pointsIntoCurrentTier / TIER_POINTS) * 100);
    tierProgressFill.style.width = progressPct + '%';

    const pointsToNext = (tier + 1) * TIER_POINTS - state.score;
    tierNext.textContent = `${pointsToNext} pts → nivel ${tier + 1}`;
}

function showChainBanner(count) {
    chainOverlay.textContent = `x${count}`;
    chainOverlay.classList.remove('show');
    void chainOverlay.offsetWidth;
    chainOverlay.classList.add('show');
}

function setModalIcon(iconName) {
    modalIcon.innerHTML = `<i data-lucide="${iconName}"></i>`;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  CONTROLES — Teclado
// ============================================================
const KEY_MAP = {
    ArrowLeft: 'left',  a: 'left',  A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'rotate',  w: 'rotate', W: 'rotate',
    ArrowDown: 'softDrop', s: 'softDrop', S: 'softDrop',
    Enter: 'hardDrop'
};

document.addEventListener('keydown', (e) => {
    const action = KEY_MAP[e.key];
    if (!action) return;
    e.preventDefault();

    if (state.phase !== 'playing' || !state.pair) {
        // Si estamos en gameover, Enter/espacio relanza
        return;
    }

    switch (action) {
        case 'left':
            if (canPairBeAt(state.pair, state.pair.x - 1, state.pair.gridY, state.pair.rotation)) {
                state.pair.x--;
                state.pair.lockDelay = 0;
            }
            break;

        case 'right':
            if (canPairBeAt(state.pair, state.pair.x + 1, state.pair.gridY, state.pair.rotation)) {
                state.pair.x++;
                state.pair.lockDelay = 0;
            }
            break;

        case 'rotate':
            tryRotate(1);
            break;

        case 'softDrop':
            state.softDropping = true;
            break;

        case 'hardDrop':
            hardDrop();
            break;
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        state.softDropping = false;
    }
});

function tryRotate(dir) {
    const pair = state.pair;
    if (!pair) return;
    const newRot = (pair.rotation + dir + 4) % 4;
    if (canPairBeAt(pair, pair.x, pair.gridY, newRot)) {
        pair.rotation = newRot;
        pair.lockDelay = 0;
    }
}

function hardDrop() {
    const pair = state.pair;
    if (!pair) return;
    while (canPairBeAt(pair, pair.x, pair.gridY + 1, pair.rotation)) {
        pair.gridY++;
    }
    pair.visualY = pair.gridY;
    lockPair();
}

// ============================================================
//  CONTROLES — Botones móviles
// ============================================================
function initMobileControls() {
    const mcLeft = document.getElementById('mcLeft');
    const mcRight = document.getElementById('mcRight');
    const mcRotate = document.getElementById('mcRotate');
    const mcDown = document.getElementById('mcDown');
    if (!mcLeft || !mcRight || !mcRotate || !mcDown) return;

    // Mover izquierda
    mcLeft.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.phase !== 'playing' || !state.pair) return;
        if (canPairBeAt(state.pair, state.pair.x - 1, state.pair.gridY, state.pair.rotation)) {
            state.pair.x--;
            state.pair.lockDelay = 0;
        }
    });

    // Mover derecha
    mcRight.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.phase !== 'playing' || !state.pair) return;
        if (canPairBeAt(state.pair, state.pair.x + 1, state.pair.gridY, state.pair.rotation)) {
            state.pair.x++;
            state.pair.lockDelay = 0;
        }
    });

    // Rotar
    mcRotate.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.phase !== 'playing' || !state.pair) return;
        tryRotate(1);
    });

    // Soft drop — mantener para bajar rápido
    const iniciarSoftDrop = (e) => {
        e.preventDefault();
        if (state.phase !== 'playing') return;
        state.softDropping = true;
    };
    const terminarSoftDrop = (e) => {
        if (e) e.preventDefault();
        state.softDropping = false;
    };

    mcDown.addEventListener('touchstart', iniciarSoftDrop, { passive: false });
    mcDown.addEventListener('touchend', terminarSoftDrop, { passive: false });
    mcDown.addEventListener('touchcancel', terminarSoftDrop, { passive: false });
    mcDown.addEventListener('mousedown', iniciarSoftDrop);
    mcDown.addEventListener('mouseup', terminarSoftDrop);
    mcDown.addEventListener('mouseleave', terminarSoftDrop);
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
async function endGame(wasRetired) {
    state.phase = 'over';
    stopLoop();

    const tier = getCurrentTier();

    finalScoreEl.textContent = state.score;
    finalCoinsEl.textContent = state.coins;
    finalTierEl.textContent = tier;

    if (wasRetired) {
        setModalIcon('flag');
        modalTitle.textContent = '¡Te retiraste!';
        modalSubtitle.textContent = 'Conservas todas las monedas que ganaste';
    } else {
        setModalIcon('zap-off');
        modalTitle.textContent = '¡Game Over!';
        modalSubtitle.textContent = 'La torre llegó al límite';
    }

    gameOverModal.classList.add('visible');

    if (state.coins > 0) {
        await sumarMonedas(state.coins);
    }
}

// ============================================================
//  LOOP PRINCIPAL
// ============================================================
function loop(now) {
    if (!state.running) return;

    if (state.lastTime === 0) state.lastTime = now;
    const dt = Math.min((now - state.lastTime) / 1000, 0.1);
    state.lastTime = now;

    update(dt);
    render();

    state.rafId = requestAnimationFrame(loop);
}

function startLoop() {
    if (state.running) return;
    state.running = true;
    state.lastTime = 0;
    state.rafId = requestAnimationFrame(loop);
}

function stopLoop() {
    state.running = false;
    if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
    }
}

// ============================================================
//  PANTALLAS
// ============================================================
function showStartScreen() {
    startScreen.classList.add('visible');
    gameScreen.classList.remove('visible');
    gameOverModal.classList.remove('visible');
}

function showGameScreen() {
    startScreen.classList.remove('visible');
    gameScreen.classList.add('visible');
    gameOverModal.classList.remove('visible');
}

// ============================================================
//  ACCIONES DE BOTONES
// ============================================================
function startGame() {
    showGameScreen();
    initGame();
    startLoop();
}

document.getElementById('btnStart').addEventListener('click', startGame);
document.getElementById('btnPlayAgain').addEventListener('click', startGame);

document.getElementById('btnBackMenu').addEventListener('click', () => {
    stopLoop();
    state.phase = 'menu';
    showStartScreen();
});

document.getElementById('btnExitStart').addEventListener('click', () => {
    // No hay API estándar para cerrar pestaña desde iframe,
    // pero podemos pedirle al padre que cierre esta app.
    const api = obtenerAPI();
    if (api && api.abrirApp) {
        // No hay un "cerrarApp" directo en la API pública, así
        // que volvemos al welcome mostrando el menú de inicio.
        window.location.hash = '';
    }
});

document.getElementById('btnExitGame').addEventListener('click', () => {
    if (state.phase === 'playing' && state.score > 0) {
        if (!confirm('¿Salir sin retirarte? Perderás las monedas de esta partida.')) return;
    }
    stopLoop();
    state.phase = 'menu';
    showStartScreen();
});

document.getElementById('btnRetire').addEventListener('click', () => {
    if (state.phase !== 'playing') return;
    const tier = getCurrentTier();
    const msg = `¿Retirarte ahora?\n\n` +
                `Puntos: ${state.score}\n` +
                `Nivel: ${tier}\n` +
                `Monedas a conservar: ${state.coins}\n\n` +
                `Si sigues jugando podrías alcanzar recompensas más altas, pero también arriesgas perderlo todo.`;
    if (!confirm(msg)) return;
    endGame(true);
});

// ============================================================
//  INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    precargarIconos();
    setupCanvas();

    const ok = await cargarContexto();
    if (ok && usuarioActual) {
        userBadge.textContent = usuarioActual.nombre || usuarioActual.codigo;
    } else {
        userBadge.textContent = 'Invitado';
    }

    initMobileControls();

    // Estado inicial: menú
    state.phase = 'menu';
    showStartScreen();

    // Render inicial del tablero (vacío) por si acaso
    state.grid = createEmptyGrid();
    render();

    if (window.lucide) window.lucide.createIcons();
});
