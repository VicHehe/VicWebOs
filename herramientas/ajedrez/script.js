// ============================================================
//  Ajedrez — Juego premium de VicWebOs
//  ------------------------------------------------------------
//  Integra chess.js (lógica) + cm-chessboard (UI) + js-chess-engine (IA).
//  Dos niveles: Media (x1) y Difícil (x2).
//  Recompensas por piezas capturadas, victoria y eficiencia.
//  Sin guardado de partida. Sin setTimeout en el flujo crítico.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'ajedrez';
const PRECIO_APP = 50;

// Configuración de dificultad
const DIFICULTADES = {
    media:   { nombre: 'Media',   multiplicador: 1, aiLevel: 3 },
    dificil: { nombre: 'Difícil', multiplicador: 2, aiLevel: 5 }
};

// Recompensas base (x1)
const RECOMPENSAS_BASE = {
    peon: 1, caballo: 2, alfil: 2, torre: 3, dama: 5,
    bonusVictoria: 12,
    bonusEficiencia30: 10,  // Si gana en ≤30 movimientos
    bonusEficiencia50: 5,   // Si gana en ≤50 movimientos
    topeMedia: 60,
    topeDificil: 120
};

// ---------- ESTADO ----------
let usuarioActual = null;
let dificultadActual = 'media';
let partidaActiva = false;
let tablero = null;         // Instancia de cm-chessboard
let chess = null;           // Instancia de chess.js
let motor = null;           // Instancia de js-chess-engine
let capturas = { peon: 0, caballo: 0, alfil: 0, torre: 0, dama: 0 };
let movimientos = 0;
let inicializado = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

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
//  MENSAJES DE ESTADO
// ============================================================
function mostrarMensaje(texto, tipo = 'info') {
    const el = document.getElementById('ajMensaje');
    if (el) {
        el.textContent = texto;
        el.style.color = tipo === 'error' ? '#991B1B' : (tipo === 'success' ? '#065F46' : '');
    }
}

// ============================================================
//  INICIALIZACIÓN
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    // Obtener usuario
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

    // Inicializar componentes de ajedrez
    chess = new Chess();
    motor = new jsChessEngine.Game();

    // Verificar compra
    const comprado = await verificarCompra();
    if (!comprado) {
        document.getElementById('ajOverlayCompra').hidden = false;
        document.getElementById('ajBtnComprar').addEventListener('click', comprarApp);
    } else {
        // Ya comprado: iniciar directamente
        document.getElementById('ajOverlayCompra').hidden = true;
        iniciarPartida();
    }

    // Eventos de dificultad
    document.querySelectorAll('.aj-btn-dificultad').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.aj-btn-dificultad').forEach(b => b.classList.remove('activo'));
            btn.classList.add('activo');
            dificultadActual = btn.dataset.dificultad;
        });
    });

    // Botones de partida
    document.getElementById('ajBtnNuevaPartida')?.addEventListener('click', iniciarPartida);
    document.getElementById('ajBtnRendirse')?.addEventListener('click', rendirse);
    document.getElementById('ajBtnJugarOtra')?.addEventListener('click', () => {
        document.getElementById('ajOverlayFin').hidden = true;
        iniciarPartida();
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  VERIFICAR COMPRA (indexedDB local del iframe)
// ============================================================
function claveCompra() {
    const cod = usuarioActual && usuarioActual.codigo ? usuarioActual.codigo : 'invitado';
    return 'ajedrez_comprado_' + cod;
}

async function verificarCompra() {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve) => {
            const tx = db.transaction('compras', 'readonly');
            const req = tx.objectStore('compras').get(claveCompra());
            req.onsuccess = () => resolve(!!req.result);
            req.onerror = () => resolve(false);
        });
    } catch (e) {
        return false;
    }
}

async function marcarComoComprado() {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction('compras', 'readwrite');
            tx.objectStore('compras').put(true, claveCompra());
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('AjedrezDB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('compras')) db.createObjectStore('compras');
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

// ============================================================
//  COMPRA
// ============================================================
async function comprarApp() {
    const btn = document.getElementById('ajBtnComprar');
    const status = document.getElementById('ajCompraStatus');
    if (btn.disabled) return;
    btn.disabled = true;
    status.textContent = 'Procesando...';
    status.className = 'aj-status';

    try {
        const api = API();
        if (!api || typeof api.gastoBoleta !== 'function') {
            throw new Error('Sin conexión con VicWebOs');
        }

        await api.gastoBoleta('crown', APP_ID, 'Compra de Ajedrez', PRECIO_APP);
        await marcarComoComprado();

        status.textContent = '¡Compra exitosa!';
        status.className = 'aj-status success';

        // Iniciar partida tras breve pausa
        requestAnimationFrame(() => {
            document.getElementById('ajOverlayCompra').hidden = true;
            iniciarPartida();
        });
    } catch (e) {
        status.textContent = e.message || 'Error al comprar';
        status.className = 'aj-status error';
        btn.disabled = false;
    }
}

// ============================================================
//  PARTIDA
// ============================================================
function iniciarPartida() {
    if (!chess) return;

    // Reset estado
    chess = new Chess();
    motor = new jsChessEngine.Game();
    capturas = { peon: 0, caballo: 0, alfil: 0, torre: 0, dama: 0 };
    movimientos = 0;
    partidaActiva = true;

    // Reset UI
    document.getElementById('ajHistorial').innerHTML = '<div class="aj-historial-vacio">La partida no ha comenzado</div>';
    actualizarRecompensas();
    actualizarTurnoUI();

    // Inicializar tablero
    if (tablero) {
        tablero.destroy();
    }
    tablero = new Chessboard(document.getElementById('ajTablero'), {
        position: 'start',
        orientation: 'white',
        responsive: true,
        sprite: 'https://cdn.jsdelivr.net/npm/cm-chessboard@8/src/assets/pieces/standard.svg',
        moveInputHandler: onMovimientoUsuario
    });

    mostrarMensaje('Tu turno. Mueve una pieza blanca.');
}

function onMovimientoUsuario(from, to) {
    if (!partidaActiva) return;
    if (!esTurnoJugador()) return;

    // Validar movimiento con chess.js
    const movimiento = chess.move({ from, to, promotion: 'q' });
    if (!movimiento) {
        mostrarMensaje('Movimiento inválido', 'error');
        return;
    }

    // Actualizar tablero
    tablero.setPosition(chess.fen());

    // Actualizar estado
    movimientos++;
    registrarCaptura(movimiento);
    actualizarHistorial();
    actualizarRecompensas();

    // Comprobar fin de partida
    if (comprobarFinPartida()) return;

    // Turno de la IA
    actualizarTurnoUI();
    mostrarMensaje('La IA está pensando...');
    requestAnimationFrame(() => turnoIA());
}

function esTurnoJugador() {
    return chess.turn() === 'w';
}

function turnoIA() {
    if (!partidaActiva) return;
    if (chess.turn() !== 'b') return;

    const nivel = DIFICULTADES[dificultadActual].aiLevel;
    let movimientoIA = null;

    // Usar js-chess-engine para obtener el mejor movimiento
    try {
        const fen = chess.fen();
        const config = jsChessEngine.getFen ? jsChessEngine.getFen(fen) : fen;
        // La API de js-chess-engine: ai(config, level) devuelve {from, to}
        const resultado = jsChessEngine.ai(config, nivel);
        if (resultado && resultado.from && resultado.to) {
            movimientoIA = chess.move({ from: resultado.from, to: resultado.to, promotion: 'q' });
        }
    } catch (e) {
        console.warn('[Ajedrez] Error en motor, usando movimiento aleatorio:', e);
    }

    // Fallback: movimiento aleatorio si falla
    if (!movimientoIA) {
        const movimientosLegales = chess.moves({ verbose: true });
        if (movimientosLegales.length > 0) {
            const m = movimientosLegales[Math.floor(Math.random() * movimientosLegales.length)];
            movimientoIA = chess.move(m);
        }
    }

    if (movimientoIA) {
        tablero.setPosition(chess.fen());
        movimientos++;
        registrarCaptura(movimientoIA);
        actualizarHistorial();
        actualizarRecompensas();
    }

    if (comprobarFinPartida()) return;

    actualizarTurnoUI();
    mostrarMensaje('Tu turno.');
}

function registrarCaptura(movimiento) {
    if (movimiento.captured) {
        const pieza = movimiento.captured; // 'p', 'n', 'b', 'r', 'q'
        const mapa = { p: 'peon', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama' };
        const clave = mapa[pieza];
        if (clave && capturas[clave] !== undefined) {
            capturas[clave]++;
        }
    }
}

function comprobarFinPartida() {
    if (chess.isCheckmate()) {
        const ganador = chess.turn() === 'w' ? 'negras' : 'blancas';
        if (ganador === 'blancas') {
            finalizarPartida('victoria');
        } else {
            finalizarPartida('derrota');
        }
        return true;
    }
    if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
        finalizarPartida('empate');
        return true;
    }
    return false;
}

// ============================================================
//  RENDIRSE
// ============================================================
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

    // Calcular recompensas
    const mult = DIFICULTADES[dificultadActual].multiplicador;
    const tope = dificultadActual === 'media' ? RECOMPENSAS_BASE.topeMedia : RECOMPENSAS_BASE.topeDificil;

    let monedas = 0;
    monedas += capturas.peon * RECOMPENSAS_BASE.peon * mult;
    monedas += capturas.caballo * RECOMPENSAS_BASE.caballo * mult;
    monedas += capturas.alfil * RECOMPENSAS_BASE.alfil * mult;
    monedas += capturas.torre * RECOMPENSAS_BASE.torre * mult;
    monedas += capturas.dama * RECOMPENSAS_BASE.dama * mult;

    if (resultado === 'victoria') {
        monedas += RECOMPENSAS_BASE.bonusVictoria * mult;
        // Bonus por eficiencia
        const movsJugador = Math.ceil(movimientos / 2);
        if (movsJugador <= 30) {
            monedas += RECOMPENSAS_BASE.bonusEficiencia30 * mult;
        } else if (movsJugador <= 50) {
            monedas += RECOMPENSAS_BASE.bonusEficiencia50 * mult;
        }
    }

    monedas = Math.min(monedas, tope);

    // Mostrar overlay
    const icono = document.getElementById('ajFinIcono');
    const titulo = document.getElementById('ajFinTitulo');
    const subtitulo = document.getElementById('ajFinSubtitulo');

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

    const totalCapturas = capturas.peon + capturas.caballo + capturas.alfil + capturas.torre + capturas.dama;
    document.getElementById('ajFinCapturas').textContent = totalCapturas;
    document.getElementById('ajFinMovimientos').textContent = movimientos;
    document.getElementById('ajFinMonedas').textContent = `+${monedas}`;

    document.getElementById('ajOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    // Otorgar monedas
    if (monedas > 0) {
        otorgarMonedas(monedas);
    }
}

function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const desc = `Ajedrez ${DIFICULTADES[dificultadActual].nombre} (${capturas.peon + capturas.caballo + capturas.alfil + capturas.torre + capturas.dama} capturas)`;
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
    if (!cont) return;
    const historial = chess.history();
    if (historial.length === 0) {
        cont.innerHTML = '<div class="aj-historial-vacio">La partida no ha comenzado</div>';
        return;
    }
    cont.innerHTML = '';
    for (let i = 0; i < historial.length; i += 2) {
        const num = (i / 2) + 1;
        const blanca = historial[i] || '';
        const negra = historial[i + 1] || '';
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
    set('ajMonedasPeon', capturas.peon * RECOMPENSAS_BASE.peon * mult);
    set('ajMonedasCaballo', capturas.caballo * RECOMPENSAS_BASE.caballo * mult);
    set('ajMonedasTorre', capturas.torre * RECOMPENSAS_BASE.torre * mult);
    set('ajMonedasDama', capturas.dama * RECOMPENSAS_BASE.dama * mult);

    // Total (sin bonus hasta que termine)
    let total = 0;
    total += capturas.peon * RECOMPENSAS_BASE.peon * mult;
    total += capturas.caballo * RECOMPENSAS_BASE.caballo * mult;
    total += capturas.alfil * RECOMPENSAS_BASE.alfil * mult;
    total += capturas.torre * RECOMPENSAS_BASE.torre * mult;
    total += capturas.dama * RECOMPENSAS_BASE.dama * mult;
    const totalEl = document.getElementById('ajMonedasTotal');
    if (totalEl) totalEl.textContent = total;
}

// ============================================================
//  INICIO
// ============================================================
document.addEventListener('DOMContentLoaded', inicializar);
