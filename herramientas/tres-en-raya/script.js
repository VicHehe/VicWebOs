// ============================================================
//  Tres en Raya — Clásico 3 en línea con dificultad escalonada
//  ------------------------------------------------------------
//  FLUJO 100% SÍNCRONO. Sin setTimeout, sin requestAnimationFrame.
//  La CPU juega inmediatamente después del jugador.
//
//  Overlays estilo Dino:
//    - Start: al cargar la app, invita a jugar.
//    - Fin:   al terminar, muestra resultado y stats.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'tres-en-raya';
const MONEDAS_BASE = 2;
const IDB_NAME = 'TresEnRayaDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';

const YO = 'X';
const CPU = 'O';

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
let juegoActivo = false;           // false hasta pulsar "Empezar"
let racha = 0;
let record = 0;
let ganadas = 0;
let perdidas = 0;
let empates = 0;
let monedasGanadas = 0;            // histórico
let monedasEstaPartida = 0;        // solo la partida en curso
let nivelAnterior = 1;
let toastTimeout = null;
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
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('trToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'tr-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
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

function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'estado_' + codigo;
}

async function cargarEstado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return;
    racha          = Number.isFinite(data.racha)          ? data.racha          : 0;
    record         = Number.isFinite(data.record)         ? data.record         : 0;
    ganadas        = Number.isFinite(data.ganadas)        ? data.ganadas        : 0;
    perdidas       = Number.isFinite(data.perdidas)       ? data.perdidas       : 0;
    empates        = Number.isFinite(data.empates)        ? data.empates        : 0;
    monedasGanadas = Number.isFinite(data.monedasGanadas) ? data.monedasGanadas : 0;
}

function guardarEstado() {
    idbSet(claveEstado(), {
        racha, record, ganadas, perdidas, empates, monedasGanadas,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  DIFICULTAD Y RECOMPENSAS
// ============================================================
function nivelDificultad() {
    if (racha >= 10) return 4;
    if (racha >= 6) return 3;
    if (racha >= 3) return 2;
    return 1;
}

function progresoNivel() {
    if (racha < 3) return { actual: racha, meta: 3 };
    if (racha < 6) return { actual: racha, meta: 6 };
    if (racha < 10) return { actual: racha, meta: 10 };
    return { actual: racha, meta: racha };
}

function multiplicadorRecompensa() {
    if (racha >= 12) return 5;
    if (racha >= 8) return 4;
    if (racha >= 5) return 3;
    if (racha >= 3) return 2;
    return 1;
}

// ============================================================
//  LÓGICA
// ============================================================
function resetTablero() {
    tablero = Array(9).fill(null);
    turno = YO;
    partidaTerminada = false;
    bloqueado = false;

    document.querySelectorAll('.tr-celda').forEach(c => {
        c.classList.remove('ganadora', 'perdedora');
    });

    renderTablero();
    actualizarTurnoUI();
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
//  CPU — 4 niveles
// ============================================================
function cpuNivel1(t) {
    const v = celdasVacias(t);
    if (v.length === 0) return -1;
    return v[Math.floor(Math.random() * v.length)];
}

function cpuNivel2(t) {
    const vacias = celdasVacias(t);
    if (vacias.length === 0) return -1;

    for (const i of vacias) {
        const c = t.slice(); c[i] = CPU;
        if (obtenerGanador(c)?.ganador === CPU) return i;
    }
    for (const i of vacias) {
        const c = t.slice(); c[i] = YO;
        if (obtenerGanador(c)?.ganador === YO) return i;
    }
    if (t[4] === null) return 4;
    return cpuNivel1(t);
}

function cpuNivel3(t) {
    const vacias = celdasVacias(t);
    if (vacias.length === 0) return -1;

    for (const i of vacias) {
        const c = t.slice(); c[i] = CPU;
        if (obtenerGanador(c)?.ganador === CPU) return i;
    }
    for (const i of vacias) {
        const c = t.slice(); c[i] = YO;
        if (obtenerGanador(c)?.ganador === YO) return i;
    }
    if (t[4] === null) return 4;
    const esq = [0, 2, 6, 8].filter(i => t[i] === null);
    if (esq.length) return esq[Math.floor(Math.random() * esq.length)];
    const bor = [1, 3, 5, 7].filter(i => t[i] === null);
    if (bor.length) return bor[Math.floor(Math.random() * bor.length)];
    return cpuNivel1(t);
}

function cpuNivel4(t) {
    const vacias = celdasVacias(t);
    if (vacias.length === 0) return -1;

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
    const n = nivelDificultad();
    try {
        if (n === 1) return cpuNivel1(tablero);
        if (n === 2) return cpuNivel2(tablero);
        if (n === 3) return cpuNivel3(tablero);
        return cpuNivel4(tablero);
    } catch (e) {
        console.error('[Tres en Raya] Error eligiendo jugada:', e);
        const vacias = celdasVacias(tablero);
        return vacias.length ? vacias[0] : -1;
    }
}

// ============================================================
//  FLUJO DE PARTIDA
// ============================================================
function jugarCelda(idx) {
    if (!juegoActivo) return;
    if (partidaTerminada) return;
    if (bloqueado) return;
    if (turno !== YO) return;
    if (!esMovimientoValido(tablero, idx)) return;

    // === Turno del jugador ===
    tablero[idx] = YO;
    renderTablero();

    let resultado = obtenerGanador(tablero);
    if (resultado) { finalizarPartida(resultado); return; }

    // === Turno de la CPU — INMEDIATO, sin setTimeout ===
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

    let tipo = 'empate';
    let titulo = 'Empate';
    let subtitulo = 'Nadie ganó esta vez.';
    let icono = 'equal';
    let botonTexto = 'Reintentar';
    let botonIcono = 'rotate-ccw';

    if (resultado.empate) {
        empates++;
    } else if (resultado.ganador === YO) {
        tipo = 'ganaste';
        racha++;
        ganadas++;
        if (racha > record) record = racha;
        const mult = multiplicadorRecompensa();
        const recompensa = MONEDAS_BASE * mult;
        monedasEstaPartida += recompensa;
        monedasGanadas += recompensa;

        titulo = '¡Ganaste!';
        subtitulo = mult > 1
            ? `Racha ×${racha}. ¡Vas en racha x${mult}!`
            : `Racha ×${racha}. ¡Sigue así!`;
        icono = 'trophy';
        botonTexto = 'Continuar';
        botonIcono = 'arrow-right';

        otorgarMonedas(recompensa, mult);
    } else if (resultado.ganador === CPU) {
        tipo = 'perdiste';
        perdidas++;
        racha = 0;
        titulo = '¡Perdiste!';
        subtitulo = 'La racha se reinició. ¡Intenta de nuevo!';
        icono = 'x';
        botonTexto = 'Reintentar';
        botonIcono = 'rotate-ccw';
    }

    // Pintar la línea ganadora (antes del overlay)
    if (resultado.linea) {
        resultado.linea.forEach(i => {
            const celda = document.querySelector(`.tr-celda[data-idx="${i}"]`);
            if (celda) {
                celda.classList.remove('deshabilitada');
                celda.classList.add(resultado.ganador === YO ? 'ganadora' : 'perdedora');
            }
        });
    }

    // Actualizar UI base
    actualizarTurnoUI();
    actualizarStatsUI();
    actualizarBadgeRacha();
    actualizarNivelUI();
    renderTablero();
    // Volver a pintar la línea ganadora (renderTablero limpia clases)
    if (resultado.linea) {
        resultado.linea.forEach(i => {
            const celda = document.querySelector(`.tr-celda[data-idx="${i}"]`);
            if (celda) {
                celda.classList.remove('deshabilitada');
                celda.classList.add(resultado.ganador === YO ? 'ganadora' : 'perdedora');
            }
        });
    }

    // Overlay de fin
    mostrarOverlayFin(tipo, titulo, subtitulo, icono, botonTexto, botonIcono);

    // Toast de nivel nuevo
    const nivelNuevo = nivelDificultad();
    if (nivelNuevo > nivelAnterior) {
        toast(`¡Nivel ${nivelNuevo} desbloqueado!`, 'success');
    }
    nivelAnterior = nivelNuevo;

    guardarEstado();
}

function mostrarOverlayFin(tipo, titulo, subtitulo, icono, botonTexto, botonIcono) {
    // Título y subtítulo
    document.getElementById('trFinTitulo').textContent = titulo;
    document.getElementById('trFinSubtitulo').textContent = subtitulo;

    // Icono del encabezado
    const iconoEl = document.getElementById('trFinIcono');
    iconoEl.className = 'tr-overlay-icono tr-overlay-icono-' + tipo;
    iconoEl.innerHTML = `<i data-lucide="${icono}"></i>`;

    // Stats
    document.getElementById('trFinRacha').textContent   = racha;
    document.getElementById('trFinRecord').textContent  = record;
    document.getElementById('trFinGanadas').textContent = ganadas;

    const monedasFila = document.getElementById('trFinMonedasFila');
    const monedasEl   = document.getElementById('trFinMonedas');
    if (monedasEstaPartida > 0) {
        monedasFila.hidden = false;
        monedasEl.textContent = `+${monedasEstaPartida}`;
    } else {
        monedasFila.hidden = true;
    }

    // Botón
    document.getElementById('trBtnReintentarTexto').textContent = botonTexto;
    const btnIconoEl = document.getElementById('trBtnReintentarIcono');
    if (btnIconoEl) btnIconoEl.setAttribute('data-lucide', botonIcono);

    // Mostrar overlay
    document.getElementById('trOverlayFin').hidden = false;

    if (window.lucide) window.lucide.createIcons();
}

function otorgarMonedas(cantidad, mult) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const desc = mult > 1 ? `Victoria x${mult} (racha ${racha})` : 'Victoria';
    Promise.resolve(api.canjear('grid-3x3', APP_ID, desc, cantidad))
        .catch(e => console.warn('[Tres en Raya] No se pudieron dar monedas:', e));
}

// ============================================================
//  INICIAR PARTIDA / REINICIAR
// ============================================================
function empezarPartida() {
    resetTablero();
    monedasEstaPartida = 0;
    juegoActivo = true;

    document.getElementById('trOverlayStart').hidden = true;
    document.getElementById('trOverlayFin').hidden = true;

    actualizarNivelUI();
    actualizarStatsUI();
    actualizarBadgeRacha();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER
// ============================================================
function renderTablero() {
    document.querySelectorAll('.tr-celda').forEach(celda => {
        const idx = parseInt(celda.dataset.idx, 10);
        const valor = tablero[idx];

        celda.classList.remove('ocupada', 'deshabilitada');
        if (valor !== null) celda.classList.add('ocupada');
        if (bloqueado || partidaTerminada || !juegoActivo) {
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

function actualizarTurnoUI() {
    const el = document.getElementById('trInfoTurno');
    if (!el) return;
    if (!juegoActivo) {
        el.innerHTML = '<i data-lucide="circle-dot"></i><span>Sin empezar</span>';
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

function actualizarNivelUI() {
    const el = document.getElementById('trInfoNivel');
    const em = document.getElementById('trInfoNivelProgreso');
    if (!el) return;
    const n = nivelDificultad();
    const span = el.querySelector('span');
    if (span) span.textContent = `Nivel ${n}`;
    if (em) {
        const p = progresoNivel();
        em.textContent = n === 4 ? 'MÁX' : `${p.actual}/${p.meta}`;
    }
}

function actualizarStatsUI() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('trStatRacha', racha);
    set('trStatRecord', record);
    set('trStatGanadas', ganadas);
    set('trStatMonedas', monedasGanadas);
    set('trRachaActual', racha);
}

function actualizarBadgeRacha() {
    const badge = document.getElementById('trRachaBadge');
    if (!badge) return;
    badge.classList.toggle('activa', racha >= 1 && racha < 6);
    badge.classList.toggle('brillante', racha >= 6);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    // 1) Usuario — OPCIONAL. Si no hay, seguimos como invitado.
    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) {
        console.warn('[Tres en Raya] No se pudo obtener la cuenta:', e);
        usuarioActual = null;
    }

    const badge = document.getElementById('trUserBadge');
    if (badge) {
        badge.textContent = usuarioActual && usuarioActual.codigo
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`
            : 'Invitado';
    }

    // 2) Estado persistido
    try { await cargarEstado(); } catch (e) { /* silencioso */ }

    // 3) Pintar UI inicial (sin empezar partida)
    nivelAnterior = nivelDificultad();
    actualizarStatsUI();
    actualizarBadgeRacha();
    resetTablero();
    actualizarTurnoUI();
    actualizarNivelUI();

    // 4) Listeners de celdas — siempre
    document.querySelectorAll('.tr-celda').forEach(celda => {
        celda.addEventListener('click', () => {
            const idx = parseInt(celda.dataset.idx, 10);
            if (Number.isNaN(idx)) return;
            jugarCelda(idx);
        });
    });

    // 5) Listeners de botones
    document.getElementById('trBtnEmpezar')?.addEventListener('click', empezarPartida);
    document.getElementById('trBtnReintentar')?.addEventListener('click', empezarPartida);

    // 6) Debug
    window.__debug = () => ({
        tablero: tablero.slice(),
        turno, bloqueado, partidaTerminada, juegoActivo,
        racha, ganadas, usuarioActual, inicializado
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
