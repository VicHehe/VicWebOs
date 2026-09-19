// ============================================================
//  Tres en Raya — Sistema de 3 rondas consecutivas
//  ------------------------------------------------------------
//  Ronda 1 → Fácil
//  Ronda 2 → Media
//  Ronda 3 → Difícil
//  Ganar las 3 → +15 monedas y ciclo completado.
//  Perder o empatar → vuelves a la ronda 1.
//
//  Sin toasts, sin notificaciones. Solo la píldora de "toca para
//  seguir" entre rondas ganadas 1 y 2, y el overlay al final.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'tres-en-raya';
const RONDAS_POR_CICLO = 3;
const RECOMPENSA_CICLO = 15;
const IDB_NAME = 'TresEnRayaDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';

const YO = 'X';
const CPU = 'O';

const NOMBRE_DIFICULTAD = { 1: 'Fácil', 2: 'Media', 3: 'Difícil' };
const CLASE_DIFICULTAD  = { 1: 'facil', 2: 'media', 3: 'dificil' };

const LINEAS_GANADORAS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// ---------- ESTADO ----------
let tablero = Array(9).fill(null);
let turno = YO;
let partidaTerminada = false;
let bloqueado = false;
let juegoActivo = false;
let esperandoContinuar = false;
let rondaActual = 1;              // 1..3
let ciclosCompletados = 0;
let monedasGanadas = 0;
let usuarioActual = null;
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
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

// Clave "v2_" para ignorar datos del sistema viejo
function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'v2_' + codigo;
}

async function cargarEstado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return;
    ciclosCompletados = Number.isFinite(data.ciclosCompletados) ? data.ciclosCompletados : 0;
    monedasGanadas    = Number.isFinite(data.monedasGanadas)    ? data.monedasGanadas    : 0;
}

function guardarEstado() {
    idbSet(claveEstado(), {
        ciclosCompletados, monedasGanadas,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  DIFICULTAD
// ============================================================
function dificultadActual() {
    // ronda 1 → fácil, ronda 2 → media, ronda 3 → difícil
    return rondaActual;
}

function nombreDificultadActual() {
    return NOMBRE_DIFICULTAD[dificultadActual()] || 'Fácil';
}

// ============================================================
//  LÓGICA DEL JUEGO
// ============================================================
function resetTablero() {
    tablero = Array(9).fill(null);
    turno = YO;
    partidaTerminada = false;
    bloqueado = false;
    document.querySelectorAll('.tr-celda').forEach(c => c.classList.remove('ganadora', 'perdedora'));
    renderTablero();
}

function esMovimientoValido(t, i) {
    return i >= 0 && i < 9 && t[i] === null;
}

function obtenerGanador(t) {
    for (const [a, b, c] of LINEAS_GANADORAS) {
        if (t[a] && t[a] === t[b] && t[b] === t[c]) {
            return { ganador: t[a], linea: [a, b, c] };
        }
    }
    if (t.every(v => v !== null)) return { ganador: null, empate: true };
    return null;
}

function celdasVacias(t) {
    const res = [];
    t.forEach((v, i) => { if (v === null) res.push(i); });
    return res;
}

// ============================================================
//  CPU — 3 niveles
// ============================================================
function cpuFacil(t) {
    const v = celdasVacias(t);
    if (!v.length) return -1;
    return v[Math.floor(Math.random() * v.length)];
}

function cpuMedia(t) {
    const vacias = celdasVacias(t);
    if (!vacias.length) return -1;

    for (const i of vacias) {
        const c = t.slice(); c[i] = CPU;
        if (obtenerGanador(c)?.ganador === CPU) return i;
    }
    for (const i of vacias) {
        const c = t.slice(); c[i] = YO;
        if (obtenerGanador(c)?.ganador === YO) return i;
    }
    if (t[4] === null) return 4;
    return cpuFacil(t);
}

function cpuDificil(t) {
    const vacias = celdasVacias(t);
    if (!vacias.length) return -1;

    let mejorScore = -Infinity;
    let mejorJugada = vacias[0];
    for (const i of vacias) {
        const c = t.slice(); c[i] = CPU;
        const score = minimax(c, false, 0);
        if (score > mejorScore) { mejorScore = score; mejorJugada = i; }
    }
    return mejorJugada;
}

function minimax(t, esTurnoCPU, prof) {
    const r = obtenerGanador(t);
    if (r) {
        if (r.ganador === CPU) return 10 - prof;
        if (r.ganador === YO) return prof - 10;
        return 0;
    }
    const vacias = celdasVacias(t);
    if (esTurnoCPU) {
        let mejor = -Infinity;
        for (const i of vacias) {
            const c = t.slice(); c[i] = CPU;
            mejor = Math.max(mejor, minimax(c, false, prof + 1));
        }
        return mejor;
    } else {
        let mejor = Infinity;
        for (const i of vacias) {
            const c = t.slice(); c[i] = YO;
            mejor = Math.min(mejor, minimax(c, true, prof + 1));
        }
        return mejor;
    }
}

function elegirJugadaCPU() {
    const d = dificultadActual();
    try {
        if (d === 1) return cpuFacil(tablero);
        if (d === 2) return cpuMedia(tablero);
        return cpuDificil(tablero);
    } catch (e) {
        console.error('[Tres en Raya] Error CPU:', e);
        const vacias = celdasVacias(tablero);
        return vacias.length ? vacias[0] : -1;
    }
}

// ============================================================
//  FLUJO DE PARTIDA
// ============================================================
function jugarCelda(idx) {
    // Si ganó ronda 1 o 2, el click avanza a la siguiente ronda
    if (esperandoContinuar) {
        avanzarRonda();
        return;
    }

    if (!juegoActivo) return;
    if (partidaTerminada) return;
    if (bloqueado) return;
    if (turno !== YO) return;
    if (!esMovimientoValido(tablero, idx)) return;

    // Turno del jugador
    tablero[idx] = YO;
    renderTablero();

    let resultado = obtenerGanador(tablero);
    if (resultado) { finalizarPartida(resultado); return; }

    // Turno CPU — SÍNCRONO
    bloqueado = true;
    turno = CPU;
    actualizarTurnoUI();

    const jugada = elegirJugadaCPU();
    if (jugada >= 0 && jugada < 9 && tablero[jugada] === null) {
        tablero[jugada] = CPU;
    } else {
        const vacias = celdasVacias(tablero);
        if (vacias.length) tablero[vacias[0]] = CPU;
    }
    renderTablero();

    resultado = obtenerGanador(tablero);
    if (resultado) { finalizarPartida(resultado); return; }

    turno = YO;
    bloqueado = false;
    actualizarTurnoUI();
    renderTablero();
}

function finalizarPartida(resultado) {
    partidaTerminada = true;
    bloqueado = false;
    juegoActivo = false;

    if (resultado.empate) {
        const superadas = rondaActual - 1;
        rondaActual = 1;
        actualizarInfoUI();
        renderTablero();
        mostrarOverlayFin('empate', superadas);
        return;
    }

    if (resultado.ganador === YO) {
        if (rondaActual >= RONDAS_POR_CICLO) {
            completarCiclo();
        } else {
            // Ganó ronda 1 o 2: esperar click para seguir
            esperandoContinuar = true;
            rondaActual++;
            actualizarInfoUI();
            mostrarPildoraContinuar();
            renderTablero();
            resaltarLineaGanadora(resultado.linea, resultado.ganador);
        }
        return;
    }

    if (resultado.ganador === CPU) {
        const superadas = rondaActual - 1;
        rondaActual = 1;
        actualizarInfoUI();
        renderTablero();
        resaltarLineaGanadora(resultado.linea, resultado.ganador);
        mostrarOverlayFin('perdiste', superadas);
    }
}

function avanzarRonda() {
    esperandoContinuar = false;
    ocultarPildoraContinuar();
    resetTablero();
    juegoActivo = true;
    actualizarInfoUI();
    actualizarTurnoUI();
    renderTablero();
}

function completarCiclo() {
    ciclosCompletados++;
    monedasGanadas += RECOMPENSA_CICLO;
    otorgarMonedas(RECOMPENSA_CICLO);
    guardarEstado();
    actualizarStatsUI();

    rondaActual = 1;
    actualizarInfoUI();
    renderTablero();
    mostrarOverlayFin('ciclo', RONDAS_POR_CICLO);
}

function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    Promise.resolve(api.canjear('grid-3x3', APP_ID, `Ciclo completado (+${cantidad})`, cantidad))
        .catch(e => console.warn('[Tres en Raya] No se pudieron dar monedas:', e));
}

function empezarCiclo() {
    rondaActual = 1;
    esperandoContinuar = false;
    ocultarPildoraContinuar();
    resetTablero();
    juegoActivo = true;

    document.getElementById('trOverlayStart').hidden = true;
    document.getElementById('trOverlayFin').hidden = true;

    actualizarInfoUI();
    actualizarTurnoUI();
    actualizarStatsUI();
    renderTablero();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER
// ============================================================
function renderTablero() {
    document.querySelectorAll('.tr-celda').forEach(celda => {
        const idx = parseInt(celda.dataset.idx, 10);
        const valor = tablero[idx];

        celda.classList.remove('ocupada', 'deshabilitada', 'ganadora', 'perdedora');
        if (valor !== null) celda.classList.add('ocupada');
        if (bloqueado || partidaTerminada || !juegoActivo || esperandoContinuar) {
            celda.classList.add('deshabilitada');
        }

        celda.textContent = '';

        if (valor === YO) {
            const marca = document.createElement('div');
            marca.className = 'tr-marca tr-marca-x';
            marca.innerHTML = '<span></span><span></span>';
            celda.appendChild(marca);
        } else if (valor === CPU) {
            const marca = document.createElement('div');
            marca.className = 'tr-marca tr-marca-o';
            celda.appendChild(marca);
        }
    });
}

function resaltarLineaGanadora(linea, ganador) {
    if (!linea) return;
    linea.forEach(i => {
        const celda = document.querySelector(`.tr-celda[data-idx="${i}"]`);
        if (celda) {
            celda.classList.remove('deshabilitada');
            celda.classList.add(ganador === YO ? 'ganadora' : 'perdedora');
        }
    });
}

function actualizarInfoUI() {
    const rondaTexto = document.getElementById('trInfoRondaTexto');
    const rondaDif = document.getElementById('trInfoRondaDif');
    const rondaChip = document.getElementById('trInfoRonda');
    if (rondaTexto) rondaTexto.textContent = `Ronda ${rondaActual}/${RONDAS_POR_CICLO}`;
    if (rondaDif) rondaDif.textContent = nombreDificultadActual();
    if (rondaChip) {
        rondaChip.classList.remove('facil', 'media', 'dificil');
        rondaChip.classList.add(CLASE_DIFICULTAD[dificultadActual()] || 'facil');
    }
}

function actualizarTurnoUI() {
    const el = document.getElementById('trInfoTurno');
    if (!el) return;
    if (!juegoActivo) {
        el.innerHTML = '<i data-lucide="circle-dot"></i><span>Listo</span>';
        el.classList.remove('cpu');
    } else if (partidaTerminada) {
        el.innerHTML = '<i data-lucide="flag"></i><span>Terminada</span>';
        el.classList.remove('cpu');
    } else if (turno === YO) {
        el.innerHTML = '<i data-lucide="circle-dot"></i><span>Tu turno</span>';
        el.classList.remove('cpu');
    } else {
        el.innerHTML = '<i data-lucide="cpu"></i><span>CPU pensando</span>';
        el.classList.add('cpu');
    }
    if (window.lucide) window.lucide.createIcons();
}

function actualizarStatsUI() {
    const ciclos = document.getElementById('trStatCiclos');
    const monedas = document.getElementById('trStatMonedas');
    if (ciclos) ciclos.textContent = ciclosCompletados;
    if (monedas) monedas.textContent = monedasGanadas;
}

function mostrarPildoraContinuar() {
    document.getElementById('trInfoChips').hidden = true;
    document.getElementById('trInfoContinuar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function ocultarPildoraContinuar() {
    document.getElementById('trInfoChips').hidden = false;
    document.getElementById('trInfoContinuar').hidden = true;
}

// ============================================================
//  OVERLAY DE FIN
// ============================================================
function mostrarOverlayFin(tipo, rondasSuperadas) {
    const icono = document.getElementById('trFinIcono');
    const titulo = document.getElementById('trFinTitulo');
    const subtitulo = document.getElementById('trFinSubtitulo');
    const rondas = document.getElementById('trFinRondas');
    const monedasFila = document.getElementById('trFinMonedasFila');
    const monedasEl = document.getElementById('trFinMonedas');
    const btnTexto = document.getElementById('trBtnReintentarTexto');
    const btnIcono = document.getElementById('trBtnReintentarIcono');

    if (tipo === 'ciclo') {
        icono.className = 'tr-overlay-icono tr-overlay-icono-ganaste';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Ciclo completado!';
        subtitulo.textContent = 'Ganaste las 3 rondas. ¡Excelente!';
        rondas.textContent = `${RONDAS_POR_CICLO}/${RONDAS_POR_CICLO}`;
        monedasFila.hidden = false;
        monedasEl.textContent = `+${RECOMPENSA_CICLO}`;
        btnTexto.textContent = 'Jugar otra vez';
        btnIcono.setAttribute('data-lucide', 'rotate-ccw');
    } else if (tipo === 'perdiste') {
        icono.className = 'tr-overlay-icono tr-overlay-icono-perdiste';
        icono.innerHTML = '<i data-lucide="x"></i>';
        titulo.textContent = '¡Perdiste!';
        subtitulo.textContent = rondasSuperadas === 0
            ? 'No pasaste ninguna ronda. Inténtalo de nuevo.'
            : `Superaste ${rondasSuperadas} ronda${rondasSuperadas === 1 ? '' : 's'}. Vuelves al inicio.`;
        rondas.textContent = `${rondasSuperadas}/${RONDAS_POR_CICLO}`;
        monedasFila.hidden = true;
        btnTexto.textContent = 'Reintentar';
        btnIcono.setAttribute('data-lucide', 'rotate-ccw');
    } else if (tipo === 'empate') {
        icono.className = 'tr-overlay-icono tr-overlay-icono-empate';
        icono.innerHTML = '<i data-lucide="equal"></i>';
        titulo.textContent = 'Empate';
        subtitulo.textContent = rondasSuperadas === 0
            ? 'No pasaste ninguna ronda. Inténtalo de nuevo.'
            : `Superaste ${rondasSuperadas} ronda${rondasSuperadas === 1 ? '' : 's'}. Vuelves al inicio.`;
        rondas.textContent = `${rondasSuperadas}/${RONDAS_POR_CICLO}`;
        monedasFila.hidden = true;
        btnTexto.textContent = 'Reintentar';
        btnIcono.setAttribute('data-lucide', 'rotate-ccw');
    }

    document.getElementById('trOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    // Usuario (opcional)
    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    const badge = document.getElementById('trUserBadge');
    if (badge) {
        badge.textContent = usuarioActual && usuarioActual.codigo
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`
            : 'Invitado';
    }

    try { await cargarEstado(); } catch (e) { /* silencioso */ }

    actualizarStatsUI();
    actualizarInfoUI();
    actualizarTurnoUI();
    resetTablero();
    renderTablero();

    // Listeners de las celdas
    document.querySelectorAll('.tr-celda').forEach(celda => {
        celda.addEventListener('click', () => {
            const idx = parseInt(celda.dataset.idx, 10);
            if (Number.isNaN(idx)) return;
            jugarCelda(idx);
        });
    });

    // Botones de los overlays
    document.getElementById('trBtnEmpezar')?.addEventListener('click', empezarCiclo);
    document.getElementById('trBtnReintentar')?.addEventListener('click', empezarCiclo);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
