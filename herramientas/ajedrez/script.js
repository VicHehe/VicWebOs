// ============================================================
//  Ajedrez — Versión corregida
//  ------------------------------------------------------------
//  Cambios clave respecto al original:
//   1. Espera a que las dependencias ESM estén listas.
//   2. Usa new jsChessEngine.Game(fen) → ai(game, nivel).
//   3. moveInputHandler devuelve true/false correctamente.
//   4. Sincroniza el tablero con setPosition() tras cada jugada
//      (imprescindible para castling / en passant / coronación).
//   5. La IA se ejecuta fuera del handler para no bloquear.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'ajedrez';

const DIFICULTADES = {
    // aiLevel: profundidad minimax (1 = muy fácil, 4 = difícil)
    media:   { nombre: 'Media',   multiplicador: 1, aiLevel: 2 },
    dificil: { nombre: 'Difícil', multiplicador: 2, aiLevel: 4 }
};

const RECOMPENSAS_BASE = {
    peon: 1, caballo: 2, alfil: 2, torre: 3, dama: 5,
    bonusVictoria: 12,
    bonusEficiencia30: 10,
    bonusEficiencia50: 5,
    topeMedia: 60,
    topeDificil: 120
};

// ---------- ESTADO ----------
let usuarioActual      = null;
let dificultadActual   = 'media';
let partidaActiva      = false;
let tablero            = null;
let chess              = null;
let capturas           = { peon: 0, caballo: 0, alfil: 0, torre: 0, dama: 0 };
let movimientos        = 0;
let inicializado       = false;
let esperandoIA        = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre  = window.parent.document.documentElement;
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
//  MENSAJES
// ============================================================
function mostrarMensaje(texto, tipo = 'info') {
    const el = document.getElementById('ajMensaje');
    if (!el) return;
    el.textContent = texto;
    el.style.color =
        tipo === 'error'   ? '#991B1B' :
        tipo === 'success' ? '#065F46' : '';
}

// ============================================================
//  INIT — espera dependencias
// ============================================================
function depsListas() {
    return typeof window.Chessboard    !== 'undefined' &&
           typeof window.Chess         !== 'undefined' &&
           typeof window.jsChessEngine !== 'undefined';
}

function esperarDependenciasYIniciar() {
    if (inicializado) return;
    if (depsListas()) { inicializar(); return; }

    let intentos = 0;
    const iv = setInterval(() => {
        intentos++;
        if (depsListas()) {
            clearInterval(iv);
            inicializar();
        } else if (intentos > 60) {   // 6 segundos
            clearInterval(iv);
            mostrarMensaje('No se pudieron cargar las dependencias del ajedrez.', 'error');
            console.error('[Ajedrez] Dependencias no disponibles');
        }
    }, 100);

    window.addEventListener('chess-deps-ready', () => {
        if (!inicializado) inicializar();
    }, { once: true });
}

function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    // Usuario
    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    const badge = document.getElementById('ajUserBadge');
    if (badge) {
        badge.textContent = usuarioActual && usuarioActual.codigo
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`
            : 'Invitado';
    }

    // Crear instancia de chess.js (compatible con varios builds)
    const ChessClass = window.Chess.Chess || window.Chess;
    chess = new ChessClass();

    // Botones de dificultad
    document.querySelectorAll('.aj-btn-dificultad').forEach(btn => {
        btn.addEventListener('click', () => {
            if (partidaActiva) {
                const ok = confirm('Cambiar de dificultad reinicia la partida. ¿Continuar?');
                if (!ok) return;
            }
            document.querySelectorAll('.aj-btn-dificultad')
                .forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            dificultadActual = btn.dataset.dificultad;
            iniciarPartida();
        });
    });

    document.getElementById('ajBtnNuevaPartida')?.addEventListener('click', iniciarPartida);
    document.getElementById('ajBtnRendirse')?.addEventListener('click', rendirse);
    document.getElementById('ajBtnJugarOtra')?.addEventListener('click', () => {
        document.getElementById('ajOverlayFin').hidden = true;
        iniciarPartida();
    });

    iniciarPartida();

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  PARTIDA
// ============================================================
function iniciarPartida() {
    if (!chess) return;

    const ChessClass = window.Chess.Chess || window.Chess;
    chess = new ChessClass();
    capturas = { peon: 0, caballo: 0, alfil: 0, torre: 0, dama: 0 };
    movimientos = 0;
    partidaActiva = true;
    esperandoIA = false;

    const hist = document.getElementById('ajHistorial');
    if (hist) hist.innerHTML = '<div class="aj-historial-vacio">La partida no ha comenzado</div>';

    actualizarRecompensas();
    actualizarTurnoUI();
    actualizarHistorial();

    // Destruir tablero previo
    if (tablero) {
        try { tablero.destroy(); } catch (e) {}
        tablero = null;
    }

    const elemento = document.getElementById('ajTablero');
    if (!elemento) return;
    elemento.innerHTML = '';

    // Crear el tablero
    tablero = new window.Chessboard(elemento, {
        position: 'start',
        orientation: 'white',
        responsive: true,
        animationDuration: 200,
        sprite: {
            url: 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/assets/pieces/standard.svg',
            grid: 40
        },
        moveInputHandler: onMovimientoUsuario
    });

    mostrarMensaje('Tu turno. Mueve una pieza blanca.');
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INPUT DEL JUGADOR
//  Devuelve true si el movimiento se acepta, false si se rechaza.
// ============================================================
function onMovimientoUsuario(from, to) {
    if (!partidaActiva) return false;
    if (esperandoIA)    return false;
    if (!chess || chess.turn() !== 'w') return false;

    let movimiento = null;
    try {
        movimiento = chess.move({ from, to, promotion: 'q' });
    } catch (e) {
        movimiento = null;
    }

    if (!movimiento) {
        mostrarMensaje('Movimiento inválido', 'error');
        return false;
    }

    // CRÍTICO: sincronizar el tablero con chess.js
    // (necesario para castling, en passant, coronación)
    if (tablero) tablero.setPosition(chess.fen(), false);

    movimientos++;
    registrarCaptura(movimiento);
    actualizarHistorial();
    actualizarRecompensas();

    if (comprobarFinPartida()) return true;

    // Turno de la IA (fuera del handler para que el tablero pinte primero)
    esperandoIA = true;
    actualizarTurnoUI();
    mostrarMensaje('La IA está pensando...');

    requestAnimationFrame(() => {
        setTimeout(() => turnoIA(), 30);
    });

    return true;
}

// ============================================================
//  TURNO DE LA IA
// ============================================================
function turnoIA() {
    if (!partidaActiva) return;
    if (!chess || chess.turn() !== 'b') { esperandoIA = false; return; }

    const nivel = DIFICULTADES[dificultadActual].aiLevel;
    let movimientoIA = null;

    try {
        // js-chess-engine espera un Game, NO un FEN suelto
        const game = new window.jsChessEngine.Game(chess.fen());
        const resultado = window.jsChessEngine.ai(game, nivel);

        if (resultado && resultado.from && resultado.to) {
            // js-chess-engine devuelve coordenadas en mayúsculas ("E2"),
            // chess.js las quiere en minúsculas ("e2")
            movimientoIA = chess.move({
                from: String(resultado.from).toLowerCase(),
                to:   String(resultado.to).toLowerCase(),
                promotion: 'q'
            });
        }
    } catch (e) {
        console.warn('[Ajedrez] Error en motor IA, usando fallback aleatorio:', e);
    }

    // Fallback: movimiento legal al azar
    if (!movimientoIA) {
        try {
            const legales = chess.moves({ verbose: true });
            if (legales.length > 0) {
                const m = legales[Math.floor(Math.random() * legales.length)];
                movimientoIA = chess.move(m);
            }
        } catch (e) { /* nada */ }
    }

    if (movimientoIA) {
        if (tablero) tablero.setPosition(chess.fen());
        movimientos++;
        registrarCaptura(movimientoIA);
        actualizarHistorial();
        actualizarRecompensas();
    }

    esperandoIA = false;

    if (comprobarFinPartida()) return;

    actualizarTurnoUI();
    mostrarMensaje('Tu turno.');
}

// ============================================================
//  HELPERS
// ============================================================
function registrarCaptura(movimiento) {
    if (!movimiento || !movimiento.captured) return;
    const mapa = { p: 'peon', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama' };
    const clave = mapa[movimiento.captured];
    if (clave && capturas[clave] !== undefined) capturas[clave]++;
}

function comprobarFinPartida() {
    let fin = false, resultado = null;

    if (chess.isCheckmate && chess.isCheckmate()) {
        const ganador = chess.turn() === 'w' ? 'negras' : 'blancas';
        resultado = (ganador === 'blancas') ? 'victoria' : 'derrota';
        fin = true;
    } else if (chess.isDraw && chess.isDraw()) {
        resultado = 'empate'; fin = true;
    } else if (chess.isStalemate && chess.isStalemate()) {
        resultado = 'empate'; fin = true;
    } else if (chess.isThreefoldRepetition && chess.isThreefoldRepetition()) {
        resultado = 'empate'; fin = true;
    }

    if (fin) finalizarPartida(resultado);
    return fin;
}

function rendirse() {
    if (!partidaActiva) return;
    if (!confirm('¿Seguro que quieres rendirte?')) return;
    finalizarPartida('derrota');
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function finalizarPartida(resultado) {
    partidaActiva = false;
    esperandoIA = false;

    const mult = DIFICULTADES[dificultadActual].multiplicador;
    const tope = dificultadActual === 'media'
        ? RECOMPENSAS_BASE.topeMedia
        : RECOMPENSAS_BASE.topeDificil;

    let monedas = 0;
    monedas += capturas.peon    * RECOMPENSAS_BASE.peon    * mult;
    monedas += capturas.caballo * RECOMPENSAS_BASE.caballo * mult;
    monedas += capturas.alfil   * RECOMPENSAS_BASE.alfil   * mult;
    monedas += capturas.torre   * RECOMPENSAS_BASE.torre   * mult;
    monedas += capturas.dama    * RECOMPENSAS_BASE.dama    * mult;

    if (resultado === 'victoria') {
        monedas += RECOMPENSAS_BASE.bonusVictoria * mult;
        const movsJugador = Math.ceil(movimientos / 2);
        if (movsJugador <= 30)      monedas += RECOMPENSAS_BASE.bonusEficiencia30 * mult;
        else if (movsJugador <= 50) monedas += RECOMPENSAS_BASE.bonusEficiencia50 * mult;
    }

    monedas = Math.max(0, Math.min(monedas, tope));

    const icono    = document.getElementById('ajFinIcono');
    const titulo   = document.getElementById('ajFinTitulo');
    const subtitulo= document.getElementById('ajFinSubtitulo');

    if (resultado === 'victoria') {
        icono.className = 'aj-overlay-icono aj-overlay-icono-ganaste';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Victoria!';
        subtitulo.textContent = 'Has derrotado a la IA.';
    } else if (resultado === 'derrota') {
        icono.className = 'aj-overlay-icono aj-overlay-icono-perdiste';
        icono.innerHTML = '<i data-lucide="x"></i>';
        titulo.textContent = 'Derrota';
        subtitulo.textContent = 'La IA ha ganado esta vez.';
    } else {
        icono.className = 'aj-overlay-icono aj-overlay-icono-empate';
        icono.innerHTML = '<i data-lucide="equal"></i>';
        titulo.textContent = 'Empate';
        subtitulo.textContent = 'Tablas.';
    }

    const totalCapturas =
        capturas.peon + capturas.caballo + capturas.alfil +
        capturas.torre + capturas.dama;

    document.getElementById('ajFinCapturas').textContent = totalCapturas;
    document.getElementById('ajFinMovimientos').textContent = movimientos;
    document.getElementById('ajFinMonedas').textContent = `+${monedas}`;

    document.getElementById('ajOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    if (monedas > 0) otorgarMonedas(monedas);
}

function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const desc = `Ajedrez ${DIFICULTADES[dificultadActual].nombre}`;
    Promise.resolve(api.canjear('crown', APP_ID, desc, cantidad))
        .catch(e => console.warn('[Ajedrez] No se pudieron dar monedas:', e));
}

// ============================================================
//  UI
// ============================================================
function actualizarTurnoUI() {
    const el = document.getElementById('ajTurnoIndicador');
    if (!el) return;
    const esMiTurno = chess && chess.turn() === 'w';
    el.innerHTML = esMiTurno
        ? '<i data-lucide="circle-dot"></i><span>Tu turno</span>'
        : '<i data-lucide="cpu"></i><span>Turno de la IA</span>';
    el.classList.toggle('turno-cpu', !esMiTurno);
    if (window.lucide) window.lucide.createIcons();
}

function actualizarHistorial() {
    const cont = document.getElementById('ajHistorial');
    if (!cont || !chess) return;

    const historial = chess.history();
    if (historial.length === 0) {
        cont.innerHTML = '<div class="aj-historial-vacio">La partida no ha comenzado</div>';
        return;
    }
    cont.innerHTML = '';
    for (let i = 0; i < historial.length; i += 2) {
        const num    = (i / 2) + 1;
        const blanca = historial[i] || '';
        const negra  = historial[i + 1] || '';
        const fila = document.createElement('div');
        fila.className = 'aj-historial-fila';
        fila.innerHTML = `
            <span class="aj-historial-num">${num}.</span>
            <span class="aj-historial-mov">${blanca} ${negra}</span>
        `;
        cont.appendChild(fila);
    }
    cont.scrollTop = cont.scrollHeight;
}

function actualizarRecompensas() {
    const mult = DIFICULTADES[dificultadActual].multiplicador;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `+${val}`;
    };
    set('ajMonedasPeon',    capturas.peon    * RECOMPENSAS_BASE.peon    * mult);
    set('ajMonedasCaballo', capturas.caballo * RECOMPENSAS_BASE.caballo * mult);
    set('ajMonedasTorre',   capturas.torre   * RECOMPENSAS_BASE.torre   * mult);
    set('ajMonedasDama',    capturas.dama    * RECOMPENSAS_BASE.dama    * mult);

    let total = 0;
    total += capturas.peon    * RECOMPENSAS_BASE.peon    * mult;
    total += capturas.caballo * RECOMPENSAS_BASE.caballo * mult;
    total += capturas.alfil   * RECOMPENSAS_BASE.alfil   * mult;
    total += capturas.torre   * RECOMPENSAS_BASE.torre   * mult;
    total += capturas.dama    * RECOMPENSAS_BASE.dama    * mult;

    const totalEl = document.getElementById('ajMonedasTotal');
    if (totalEl) totalEl.textContent = total;
}

// ============================================================
//  ARRANQUE
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', esperarDependenciasYIniciar);
} else {
    esperarDependenciasYIniciar();
}
