// ============================================================
//  Widget: Ajedrez vs CPU
//  ------------------------------------------------------------
//  Partida completa contra una IA simple (minimax depth 2).
//  Sin dependencias externas más allá de chess.js (CDN).
//
//  Recompensa: 65 monedas por victoria, máximo 1 vez cada 24h.
//  Persistencia: app/ajedrez/{codigo}ajedrez.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_BASE = 'app/ajedrez/';
const RECOMPENSA   = 65;
const COOLDOWN_MS  = 24 * 60 * 60 * 1000;  // 24h
const PROFUNDIDAD_IA = 2;

// Valores material (en centipeones aproximados)
const VALOR_PIEZA = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Glifos Unicode de ajedrez
const GLIFOS = {
    p: '\u265F', n: '\u265E', b: '\u265D',
    r: '\u265C', q: '\u265B', k: '\u265A'
};

// ============================================================
//  ESTADO
// ============================================================
let game = null;
let selectedSquare = null;
let lastMove = null;
let esperandoIA = false;
let partidaTerminada = false;
let usuarioActual = null;
let ultimaRecompensa = 0;
let victoriasTotales = 0;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  TEMA
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
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  DOM
// ============================================================
const $board   = () => document.getElementById('ajBoard');
const $status  = () => document.getElementById('ajStatus');
const $overlay = () => document.getElementById('ajOverlay');
const $footer  = () => document.getElementById('ajFooter');
const $footerTxt = () => document.getElementById('ajFooterTxt');

// ============================================================
//  STATUS / FOOTER
// ============================================================
function setStatus(txt, tipo) {
    const el = $status();
    if (!el) return;
    const txtEl = el.querySelector('.aj-status-txt');
    if (txtEl) txtEl.textContent = txt;
    el.classList.remove('ok', 'err', 'thinking');
    if (tipo === 'ok')       el.classList.add('ok');
    if (tipo === 'err')      el.classList.add('err');
    if (tipo === 'thinking') el.classList.add('thinking');
}

function setFooter(txt, bloqueado) {
    const f = $footer();
    const t = $footerTxt();
    if (!f || !t) return;
    t.textContent = txt;
    f.classList.toggle('bloqueado', !!bloqueado);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    if (!usuarioActual) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'ajedrez.json';
}

async function cargarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object') {
            if (data.ultimaRecompensa) {
                ultimaRecompensa = new Date(data.ultimaRecompensa).getTime() || 0;
            }
            victoriasTotales = Number(data.victoriasTotales) || 0;
        }
    } catch (e) { /* no existe todavía */ }
}

async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            ultimaRecompensa: ultimaRecompensa ? new Date(ultimaRecompensa).toISOString() : null,
            victoriasTotales,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Ajedrez] No se pudo guardar:', e);
    }
}

function puedeCobrar() {
    if (!ultimaRecompensa) return true;
    return (Date.now() - ultimaRecompensa) >= COOLDOWN_MS;
}

function actualizarFooter() {
    if (!usuarioActual) {
        setFooter('+65 al ganar', false);
        return;
    }
    if (puedeCobrar()) {
        setFooter('+65 al ganar', false);
    } else {
        const restante = COOLDOWN_MS - (Date.now() - ultimaRecompensa);
        const h = Math.floor(restante / 3600000);
        const m = Math.floor((restante % 3600000) / 60000);
        setFooter(`Ya cobrado · +65 en ${h}h ${m}m`, true);
    }
}

// ============================================================
//  RENDER DEL TABLERO
// ============================================================
function renderBoard() {
    const board = $board();
    if (!board || !game) return;

    board.innerHTML = '';
    const matriz = game.board();
    const files = ['a','b','c','d','e','f','g','h'];

    // Destinos legales de la casilla seleccionada
    const destinosLegales = new Set();
    if (selectedSquare && !esperandoIA && !partidaTerminada && game.turn() === 'w') {
        try {
            game.moves({ square: selectedSquare, verbose: true })
                .forEach(m => destinosLegales.add(m.to));
        } catch (e) { /* silencioso */ }
    }

    // ¿Rey en jaque?
    let reyEnJaque = null;
    if (game.in_check && game.in_check()) {
        const turno = game.turn();
        outer:
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = matriz[r][f];
                if (p && p.type === 'k' && p.color === turno) {
                    reyEnJaque = files[f] + (8 - r);
                    break outer;
                }
            }
        }
    }

    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const rank = 8 - r;
            const file = files[f];
            const square = file + rank;
            const esClara = (r + f) % 2 === 0;
            const pieza = matriz[r][f];

            const sq = document.createElement('div');
            sq.className = 'aj-square ' + (esClara ? 'light' : 'dark');
            sq.dataset.square = square;

            if (lastMove && (lastMove.from === square || lastMove.to === square)) {
                sq.classList.add('last-move');
            }
            if (selectedSquare === square) sq.classList.add('selected');
            if (destinosLegales.has(square)) {
                sq.classList.add('legal');
                if (pieza) sq.classList.add('legal-capture');
            }
            if (reyEnJaque === square) sq.classList.add('check');

            if (pieza) {
                const span = document.createElement('span');
                span.className = 'aj-piece ' + pieza.color;
                span.textContent = GLIFOS[pieza.type] || '';
                sq.appendChild(span);
            }

            sq.addEventListener('click', () => onSquareClick(square));
            board.appendChild(sq);
        }
    }
}

function ajustarTamanoPiezas() {
    const board = $board();
    if (!board) return;
    const w = board.clientWidth;
    if (w === 0) return;
    const size = w / 8;
    board.style.setProperty('--piece-size', Math.round(size * 0.94) + 'px');
}

// ============================================================
//  CLICK EN CASILLA
// ============================================================
function onSquareClick(square) {
    if (!game || esperandoIA || partidaTerminada) return;
    if (game.turn() !== 'w') return;

    const pieza = game.get(square);

    // Ya hay selección
    if (selectedSquare) {
        if (square === selectedSquare) {
            selectedSquare = null;
            renderBoard();
            return;
        }

        let legal = false;
        try {
            const moves = game.moves({ square: selectedSquare, verbose: true });
            legal = moves.some(m => m.to === square);
        } catch (e) { legal = false; }

        if (legal) {
            const mov = game.move({ from: selectedSquare, to: square, promotion: 'q' });
            if (mov) {
                selectedSquare = null;
                lastMove = { from: mov.from, to: mov.to };
                renderBoard();
                verificarFinPartida();
                if (!partidaTerminada) {
                    setStatus('IA pensando…', 'thinking');
                    esperandoIA = true;
                    setTimeout(turnoIA, 250);
                }
            }
            return;
        }

        if (pieza && pieza.color === 'w') {
            selectedSquare = square;
        } else {
            selectedSquare = null;
        }
        renderBoard();
        return;
    }

    // Sin selección
    if (pieza && pieza.color === 'w') {
        selectedSquare = square;
        renderBoard();
    }
}

// ============================================================
//  IA — Minimax depth N con alpha-beta
// ============================================================
function evaluar(game) {
    const board = game.board();
    let puntaje = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p) {
                const v = VALOR_PIEZA[p.type] || 0;
                puntaje += (p.color === 'w' ? v : -v);
            }
        }
    }
    // Devuelve puntaje desde la perspectiva del bando a mover
    return game.turn() === 'w' ? puntaje : -puntaje;
}

function ordenarMovimientos(movs) {
    // Capturas primero (heurística básica)
    return movs.slice().sort((a, b) => {
        const ca = a.captured ? VALOR_PIEZA[a.captured] : 0;
        const cb = b.captured ? VALOR_PIEZA[b.captured] : 0;
        return cb - ca;
    });
}

function minimax(game, profundidad, alpha, beta) {
    if (profundidad === 0 || game.game_over()) {
        if (game.in_checkmate()) {
            // Mate: valor enorme, ajustado por profundidad para preferir mates rápidos
            return game.turn() === 'w' ? -1e6 - profundidad : 1e6 + profundidad;
        }
        return evaluar(game);
    }

    const movs = ordenarMovimientos(game.moves({ verbose: true }));
    let mejor = -Infinity;

    for (const m of movs) {
        game.move(m);
        const puntaje = -minimax(game, profundidad - 1, -beta, -alpha);
        game.undo();
        if (puntaje > mejor) mejor = puntaje;
        if (puntaje > alpha) alpha = puntaje;
        if (alpha >= beta) break;
    }
    return mejor;
}

function elegirMovimientoIA() {
    const movs = ordenarMovimientos(game.moves({ verbose: true }));
    if (movs.length === 0) return null;

    let mejor = movs[0];
    let mejorPuntaje = -Infinity;

    for (const m of movs) {
        game.move(m);
        const puntaje = -minimax(game, PROFUNDIDAD_IA - 1, -Infinity, Infinity);
        game.undo();
        if (puntaje > mejorPuntaje) {
            mejorPuntaje = puntaje;
            mejor = m;
        }
    }
    return mejor;
}

function turnoIA() {
    if (!game || partidaTerminada) return;
    if (game.turn() !== 'b') return;

    const mov = elegirMovimientoIA();
    if (!mov) {
        esperandoIA = false;
        verificarFinPartida();
        return;
    }

    game.move(mov);
    lastMove = { from: mov.from, to: mov.to };
    esperandoIA = false;
    renderBoard();
    verificarFinPartida();

    if (!partidaTerminada) {
        setStatus('Tu turno', null);
    }
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
async function verificarFinPartida() {
    if (!game || partidaTerminada) return;

    if (game.in_checkmate()) {
        // ¿Quién ganó? El bando a mover está en mate → pierde
        const ganoBlancas = game.turn() === 'b';
        partidaTerminada = true;
        if (ganoBlancas) {
            await manejarVictoria();
        } else {
            await manejarDerrota();
        }
        return;
    }

    if (game.in_stalemate() || game.in_threefold_repetition() ||
        game.insufficient_material() || game.in_draw()) {
        partidaTerminada = true;
        manejarEmpate();
    }
}

async function manejarVictoria() {
    const puede = usuarioActual && puedeCobrar();

    if (puede) {
        victoriasTotales++;
        ultimaRecompensa = Date.now();
        await guardarEstado();

        const api = API();
        if (api && typeof api.canjear === 'function') {
            try {
                await api.canjear('crown', 'ajedrez', 'Victoria vs IA', RECOMPENSA);
            } catch (e) {
                console.warn('[Ajedrez] No se pudo acreditar la recompensa:', e);
            }
        }

        mostrarOverlay(
            '¡Ganaste!',
            `+${RECOMPENSA} monedas acreditadas`,
            'ok'
        );
        setStatus('¡Victoria!', 'ok');
    } else {
        mostrarOverlay(
            '¡Ganaste!',
            'Ya cobraste la recompensa de hoy. Volvé mañana.',
            'ok'
        );
        setStatus('¡Victoria!', 'ok');
    }

    actualizarFooter();
}

async function manejarDerrota() {
    mostrarOverlay(
        'Perdiste',
        'La IA te ganó. Intentá de nuevo.',
        'err'
    );
    setStatus('Derrota', 'err');
}

function manejarEmpate() {
    mostrarOverlay(
        'Empate',
        'Tablas. Nadie cobra.',
        'empate'
    );
    setStatus('Empate', null);
}

function mostrarOverlay(titulo, subtitulo, tipo) {
    const ov = $overlay();
    if (!ov) return;
    ov.hidden = false;
    ov.innerHTML = `
        <div class="aj-overlay-titulo ${tipo}">${titulo}</div>
        <div class="aj-overlay-sub">${subtitulo}</div>
        <button class="aj-overlay-btn" id="ajOverlayBtn">
            <i data-lucide="rotate-ccw"></i>
            Nueva partida
        </button>
    `;
    if (window.lucide) window.lucide.createIcons();
    document.getElementById('ajOverlayBtn')?.addEventListener('click', nuevaPartida);
}

function ocultarOverlay() {
    const ov = $overlay();
    if (ov) ov.hidden = true;
}

// ============================================================
//  NUEVA PARTIDA
// ============================================================
function nuevaPartida() {
    game = new Chess();
    selectedSquare = null;
    lastMove = null;
    esperandoIA = false;
    partidaTerminada = false;

    ocultarOverlay();
    renderBoard();
    ajustarTamanoPiezas();
    setStatus('Tu turno', null);
    actualizarFooter();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    try {
        const api = API();
        usuarioActual = api && typeof api.obtenerCuenta === 'function'
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    if (usuarioActual) {
        await cargarEstado();
    }

    nuevaPartida();

    document.getElementById('ajBtnReset')?.addEventListener('click', () => {
        if (esperandoIA) return;
        nuevaPartida();
    });

    // Reajustar piezas al cambiar tamaño
    window.addEventListener('resize', ajustarTamanoPiezas);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(ajustarTamanoPiezas);
        const b = $board();
        if (b) ro.observe(b);
    }

    // Actualizar footer cada minuto (para el contador de cooldown)
    setInterval(actualizarFooter, 60000);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
