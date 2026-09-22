// ============================================================
//  Widget: Ajedrez Puzzle
//  ------------------------------------------------------------
//  Puzzle diario de Lichess (lichess.org/api/puzzle/daily).
//  - Sin autenticación, sin key.
//  - CORS resuelto con proxy (mismo patrón que Wiki Lector).
//  - Tablero propio con CSS Grid + Unicode pieces.
//  - Lógica con chess.js (CDN).
//  - 1 petición al día → muy por debajo del rate limit.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const PUZZLE_URL   = 'https://lichess.org/api/puzzle/daily';

// Proxies CORS en orden de preferencia
const PROXIES = [
    (u) => 'https://corsproxy.io/?url='   + encodeURIComponent(u),
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://cors.eu.org/' + u
];

// Glifos Unicode de ajedrez (negras - luego se colorean por CSS)
const GLIFOS = {
    p: '\u265F', // ♟ peón
    n: '\u265E', // ♞ caballo
    b: '\u265D', // ♝ alfil
    r: '\u265C', // ♜ torre
    q: '\u265B', // ♛ dama
    k: '\u265A'  // ♚ rey
};

// Traducciones de temas de Lichess
const THEMES_ES = {
    opening:            'Apertura',
    middlegame:         'Medio juego',
    endgame:            'Final',
    rookEndgame:        'Final de torres',
    pawnEndgame:        'Final de peones',
    queenEndgame:       'Final de damas',
    bishopEndgame:      'Final de alfiles',
    knightEndgame:      'Final de caballos',
    queenRookEndgame:   'Final de dama y torre',
    mate:               'Mate',
    mateIn1:            'Mate en 1',
    mateIn2:            'Mate en 2',
    mateIn3:            'Mate en 3',
    mateIn4:            'Mate en 4',
    mateIn5:            'Mate en 5',
    anastasiaMate:      'Mate de Anastasia',
    arabianMate:        'Mate árabe',
    backRankMate:       'Mate del pasillo',
    bodenMate:          'Mate de Boden',
    dovetailMate:       'Mate de cola de milano',
    hookMate:           'Mate del gancho',
    smotheredMate:      'Mate de la coz',
    doubleBishopMate:   'Mate de dos alfiles',
    fork:               'Horquilla',
    pin:                'Clavada',
    skewer:             'Enfilada',
    discoveredAttack:   'Ataque descubierto',
    doubleCheck:        'Jaque doble',
    sacrifice:          'Sacrificio',
    hangingPiece:       'Pieza colgada',
    trappedPiece:       'Pieza atrapada',
    deflection:         'Desvío',
    attraction:         'Atracción',
    interference:       'Interferencia',
    intermezzo:         'Intermedio',
    xRayAttack:         'Ataque rayos X',
    capturingDefender:  'Captura del defensor',
    clearance:          'Despeje',
    promotion:          'Coronación',
    zugzwang:           'Zugzwang',
    quietMove:          'Jugada silenciosa',
    advantage:          'Ventaja',
    crushing:           'Demoledor',
    equality:           'Igualdad',
    defensiveMove:      'Defensa',
    attackingMove:      'Ataque',
    oneMove:            'Un movimiento',
    short:              'Corto',
    long:               'Largo',
    veryLong:           'Muy largo'
};

// Estado
let game            = null;
let solution        = [];
let solutionIndex   = 0;
let selectedSquare  = null;
let lastMove        = null;
let esperando       = false;   // true mientras el oponente "piensa"
let turnoUsuario    = 'w';
let puzzleId        = null;
let resuelto        = false;

// DOM refs
const $board   = () => document.getElementById('ajBoard');
const $status  = () => document.getElementById('ajStatus');
const $overlay = () => document.getElementById('ajOverlay');

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
//  UTILIDADES
// ============================================================
function uciAMovimiento(uci) {
    return {
        from: uci.slice(0, 2),
        to:   uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : 'q'
    };
}

function prettifyTheme(t) {
    if (THEMES_ES[t]) return THEMES_ES[t];
    return String(t)
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

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

function mostrarOverlay(texto, esError) {
    const ov = $overlay();
    if (!ov) return;
    ov.hidden = false;
    ov.classList.toggle('error', !!esError);
    ov.innerHTML = '';
    if (esError) {
        const p = document.createElement('p');
        p.textContent = texto || 'No se pudo cargar el puzzle.';
        ov.appendChild(p);
        const btn = document.createElement('button');
        btn.className = 'aj-btn-retry';
        btn.innerHTML = '<i data-lucide="refresh-cw"></i> Reintentar';
        btn.addEventListener('click', cargarPuzzle);
        ov.appendChild(btn);
        if (window.lucide) window.lucide.createIcons();
    } else {
        const sp = document.createElement('div');
        sp.className = 'aj-spinner';
        ov.appendChild(sp);
        const p = document.createElement('p');
        p.textContent = texto || 'Cargando puzzle…';
        ov.appendChild(p);
    }
}

function ocultarOverlay() {
    const ov = $overlay();
    if (ov) ov.hidden = true;
}

// ============================================================
//  FETCH CON PROXY
// ============================================================
async function fetchConProxy(url) {
    let ultimoError = null;
    for (const construirUrl of PROXIES) {
        try {
            const res = await fetch(construirUrl(url), {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            ultimoError = e;
            console.warn('[Ajedrez] Proxy falló:', e.message);
        }
    }
    throw ultimoError || new Error('Ningún proxy funcionó.');
}

// ============================================================
//  CARGA DEL PUZZLE
// ============================================================
async function cargarPuzzle() {
    resuelto = false;
    selectedSquare = null;
    lastMove = null;
    esperando = false;

    mostrarOverlay('Cargando puzzle…', false);
    setStatus('Conectando con Lichess…', 'thinking');

    const btnReload = document.getElementById('ajBtnReload');
    if (btnReload) btnReload.classList.add('girando');

    try {
        const data = await fetchConProxy(PUZZLE_URL);

        if (!data || !data.puzzle || !data.game || !data.game.pgn) {
            throw new Error('Respuesta inválida de Lichess.');
        }

        puzzleId = data.puzzle.id || null;

        // Reconstruir posición inicial del puzzle
        const tmp = new Chess();
        tmp.load_pgn(data.game.pgn, { sloppy: true });
        const historial = tmp.history({ verbose: true });

        const initialPly = parseInt(data.puzzle.initialPly, 10) || 0;

        game = new Chess();
        for (let i = 0; i < initialPly && i < historial.length; i++) {
            const m = historial[i];
            game.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' });
        }

        solution      = Array.isArray(data.puzzle.solution) ? data.puzzle.solution.slice() : [];
        solutionIndex = 0;
        turnoUsuario  = game.turn();

        // Info UI
        const rating = data.puzzle.rating || '—';
        const ratingTxt = document.getElementById('ajRatingTxt');
        if (ratingTxt) ratingTxt.textContent = String(rating);

        const themes = (data.puzzle.themes || []).slice(0, 3).map(prettifyTheme);
        const themesEl = document.getElementById('ajThemes');
        if (themesEl) themesEl.textContent = themes.length ? themes.join(' · ') : '—';

        const plays = data.puzzle.plays || 0;
        const playsEl = document.getElementById('ajPlays');
        if (playsEl) {
            playsEl.textContent = plays > 0
                ? plays.toLocaleString('es-CL') + ' intentos'
                : '—';
        }

        // Render
        ocultarOverlay();
        renderBoard();
        ajustarTamanoPiezas();

        const turnoTxt = turnoUsuario === 'w' ? 'Juegan blancas · encuentra la mejor jugada' : 'Juegan negras · encuentra la mejor jugada';
        setStatus(turnoTxt, null);

    } catch (e) {
        console.error('[Ajedrez] Error cargando puzzle:', e);
        mostrarOverlay('No se pudo cargar el puzzle. Revisá tu conexión.', true);
        setStatus('Error de conexión', 'err');
    } finally {
        if (btnReload) btnReload.classList.remove('girando');
    }
}

// ============================================================
//  RENDER DEL TABLERO
// ============================================================
function renderBoard() {
    const board = $board();
    if (!board || !game) return;

    board.innerHTML = '';

    const matriz = game.board(); // 8x8, [0] = rank 8
    const files = ['a','b','c','d','e','f','g','h'];

    // Jugadas legales desde la casilla seleccionada (deduplicadas por destino)
    const destinosLegales = new Set();
    if (selectedSquare && !esperando && !resuelto) {
        try {
            const moves = game.moves({ square: selectedSquare, verbose: true });
            moves.forEach(m => destinosLegales.add(m.to));
        } catch (e) { /* silencioso */ }
    }

    // Detectar rey en jaque
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
            if (selectedSquare === square) {
                sq.classList.add('selected');
            }
            if (destinosLegales.has(square)) {
                sq.classList.add('legal');
                if (pieza) sq.classList.add('legal-capture');
            }
            if (reyEnJaque === square) {
                sq.classList.add('check');
            }

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

// ============================================================
//  AJUSTE DE TAMAÑO DE PIEZAS
// ============================================================
function ajustarTamanoPiezas() {
    const board = $board();
    if (!board) return;
    const w = board.clientWidth;
    if (w === 0) return;
    const size = w / 8;
    board.style.setProperty('--piece-size', Math.round(size * 0.86) + 'px');
}

// ============================================================
//  CLICK EN CASILLA
// ============================================================
function onSquareClick(square) {
    if (!game || esperando || resuelto) return;

    const pieza = game.get(square);
    const turno = game.turn();

    // --- Ya hay selección ---
    if (selectedSquare) {
        // Mismo cuadro → deseleccionar
        if (square === selectedSquare) {
            selectedSquare = null;
            renderBoard();
            return;
        }

        // ¿Es destino legal?
        let legal = false;
        try {
            const moves = game.moves({ square: selectedSquare, verbose: true });
            legal = moves.some(m => m.to === square);
        } catch (e) { legal = false; }

        if (legal) {
            intentarJugada(selectedSquare, square);
            return;
        }

        // No es legal → cambiar selección si es pieza propia
        if (pieza && pieza.color === turno) {
            selectedSquare = square;
        } else {
            selectedSquare = null;
        }
        renderBoard();
        return;
    }

    // --- Sin selección ---
    if (pieza && pieza.color === turno) {
        selectedSquare = square;
        renderBoard();
    }
}

// ============================================================
//  INTENTO DE JUGADA
// ============================================================
function intentarJugada(from, to) {
    const esperado = solution[solutionIndex];
    if (!esperado) {
        // Sin más solución (no debería pasar)
        setStatus('Puzzle completado', 'ok');
        return;
    }

    const esperadoFromTo = esperado.slice(0, 4);
    const intentoFromTo  = from + to;

    if (intentoFromTo !== esperadoFromTo) {
        // --- INCORRECTO: mostrar jugada por 400ms y deshacer ---
        esperando = true;
        const promotion = esperado.length > 4 ? esperado[4] : 'q';

        let seAplico = false;
        try {
            game.move({ from, to, promotion });
            seAplico = true;
        } catch (e) { /* no debería pasar */ }

        selectedSquare = null;

        if (seAplico) {
            const prevLast = lastMove;
            lastMove = { from, to };
            renderBoard();

            // Shake visual
            const board = $board();
            if (board) {
                const sqFrom = board.querySelector(`[data-square="${from}"]`);
                const sqTo   = board.querySelector(`[data-square="${to}"]`);
                [sqFrom, sqTo].forEach(sq => {
                    if (sq) {
                        sq.classList.add('shake');
                        setTimeout(() => sq.classList.remove('shake'), 320);
                    }
                });
            }

            setTimeout(() => {
                game.undo();
                lastMove = prevLast;
                renderBoard();
                setStatus('Incorrecto. Intenta de nuevo.', 'err');
                esperando = false;

                setTimeout(() => {
                    if (!resuelto && game) {
                        const txt = game.turn() === 'w'
                            ? 'Juegan blancas · encuentra la mejor jugada'
                            : 'Juegan negras · encuentra la mejor jugada';
                        setStatus(txt, null);
                    }
                }, 1500);
            }, 400);
        } else {
            esperando = false;
            setStatus('Incorrecto. Intenta de nuevo.', 'err');
        }
        return;
    }

    // --- CORRECTO ---
    const promotion = esperado.length > 4 ? esperado[4] : 'q';
    try {
        game.move({ from, to, promotion });
    } catch (e) {
        console.error('[Ajedrez] Error aplicando jugada correcta:', e);
        return;
    }

    solutionIndex++;
    selectedSquare = null;
    lastMove = { from, to };
    renderBoard();

    // ¿Terminó el puzzle?
    if (solutionIndex >= solution.length) {
        marcarResuelto();
        return;
    }

    // --- El oponente responde ---
    setStatus('¡Correcto!', 'ok');
    esperando = true;

    setTimeout(() => {
        const uciOpp = solution[solutionIndex];
        if (!uciOpp) {
            esperando = false;
            marcarResuelto();
            return;
        }

        const movOpp = uciAMovimiento(uciOpp);
        try {
            game.move({
                from: movOpp.from,
                to: movOpp.to,
                promotion: movOpp.promotion
            });
        } catch (e) {
            console.error('[Ajedrez] Error aplicando jugada del oponente:', e);
        }

        solutionIndex++;
        lastMove = { from: movOpp.from, to: movOpp.to };
        esperando = false;
        renderBoard();

        if (solutionIndex >= solution.length) {
            marcarResuelto();
        } else {
            const txt = game.turn() === 'w'
                ? 'Juegan blancas · sigue la secuencia'
                : 'Juegan negras · sigue la secuencia';
            setStatus(txt, null);
        }
    }, 650);
}

// ============================================================
//  RESUELTO
// ============================================================
function marcarResuelto() {
    resuelto = true;
    esperando = false;
    setStatus('¡Resuelto! 🎉 Buen ojo.', 'ok');

    const board = $board();
    if (board) {
        board.querySelectorAll('.aj-square').forEach((sq, i) => {
            setTimeout(() => {
                sq.classList.add('resuelto');
                setTimeout(() => sq.classList.remove('resuelto'), 650);
            }, i * 6);
        });
    }
}

// ============================================================
//  INIT
// ============================================================
function inicializarEventos() {
    document.getElementById('ajBtnReload')?.addEventListener('click', () => {
        if (esperando) return;
        cargarPuzzle();
    });

    window.addEventListener('resize', ajustarTamanoPiezas);

    // ResizeObserver por si el iframe cambia de tamaño sin disparar 'resize'
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => ajustarTamanoPiezas());
        const b = $board();
        if (b) ro.observe(b);
    }
}

function inicializar() {
    aplicarTemaDelPadre();
    inicializarEventos();
    ajustarTamanoPiezas();
    cargarPuzzle();
    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
