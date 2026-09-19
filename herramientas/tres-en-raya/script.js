// ============================================================
//  Tres en Raya — Clásico 3 en línea con dificultad escalonada
//  ------------------------------------------------------------
//  - Racha de victorias consecutivas sube la dificultad de la CPU
//  - 2 monedas base por victoria, con multiplicador por racha
//  - Persistencia en IndexedDB PROPIO del iframe (no en la BD)
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// Configuración
const APP_ID = 'tres-en-raya';
const MONEDAS_BASE = 2;
const IDB_NAME = 'TresEnRayaDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';

// Jugadores
const YO = 'X';
const CPU = 'O';

// Combinaciones ganadoras (índices 0-8)
const LINEAS_GANADORAS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

// Símbolos como TEXTO (nada de SVG, cero fragilidad)
const SIMBOLO_X = '\u2715';   // ✕
const SIMBOLO_O = '\u25EF';   // ◯

// ---------- ESTADO ----------
let tablero = Array(9).fill(null);
let turno = YO;
let partidaTerminada = false;
let bloqueado = false;
let racha = 0;
let record = 0;
let ganadas = 0;
let perdidas = 0;
let empates = 0;
let monedasGanadas = 0;
let nivelAnterior = 1;
let toastTimeout = null;
let usuarioActual = null;

const API = () => window.parent.__vicwebos || null;

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
    } catch (e) {
        console.warn('[Tres en Raya] idbGet falló:', e);
        return null;
    }
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
    } catch (e) {
        console.warn('[Tres en Raya] idbSet falló:', e);
    }
}

async function idbDelete(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) {
        console.warn('[Tres en Raya] idbDelete falló:', e);
    }
}

function claveEstado() {
    if (!usuarioActual) return null;
    return 'estado_' + usuarioActual.codigo;
}

async function cargarEstado() {
    const key = claveEstado();
    if (!key) return;
    const data = await idbGet(key);
    if (!data || typeof data !== 'object') return;
    racha = Number.isFinite(data.racha) ? data.racha : 0;
    record = Number.isFinite(data.record) ? data.record : 0;
    ganadas = Number.isFinite(data.ganadas) ? data.ganadas : 0;
    perdidas = Number.isFinite(data.perdidas) ? data.perdidas : 0;
    empates = Number.isFinite(data.empates) ? data.empates : 0;
    monedasGanadas = Number.isFinite(data.monedasGanadas) ? data.monedasGanadas : 0;
}

async function guardarEstado() {
    const key = claveEstado();
    if (!key) return;
    await idbSet(key, {
        racha, record, ganadas, perdidas, empates, monedasGanadas,
        actualizado: new Date().toISOString()
    });
}

async function resetearEstado() {
    const key = claveEstado();
    if (!key) return;
    await idbDelete(key);
    racha = 0;
    record = 0;
    ganadas = 0;
    perdidas = 0;
    empates = 0;
    monedasGanadas = 0;
    nivelAnterior = 1;
}

// ============================================================
//  DIFICULTAD
// ============================================================
function nivelDificultad() {
    if (racha >= 10) return 4;
    if (racha >= 6) return 3;
    if (racha >= 3) return 2;
    return 1;
}

// Cuántas victorias faltan para el siguiente nivel
function progresoNivel() {
    if (racha < 3) return { actual: racha, meta: 3 };
    if (racha < 6) return { actual: racha, meta: 6 };
    if (racha < 10) return { actual: racha, meta: 10 };
    return { actual: racha, meta: racha }; // ya es máximo
}

function multiplicadorRecompensa() {
    if (racha >= 12) return 5;
    if (racha >= 8) return 4;
    if (racha >= 5) return 3;
    if (racha >= 3) return 2;
    return 1;
}

// ============================================================
//  LÓGICA DEL JUEGO
// ============================================================
function limpiarTablero() {
    tablero = Array(9).fill(null);
    turno = YO;
    partidaTerminada = false;
    bloqueado = false;
    renderTablero();
    actualizarTurnoUI();
    document.getElementById('trResultado').hidden = true;
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
    const vacias = celdasVacias(t);
    return vacias[Math.floor(Math.random() * vacias.length)];
}

function cpuNivel2(t) {
    // 1. Ganar si puede
    for (const i of celdasVacias(t)) {
        const c = t.slice(); c[i] = CPU;
        if (obtenerGanador(c)?.ganador === CPU) return i;
    }
    // 2. Bloquear si el jugador puede ganar
    for (const i of celdasVacias(t)) {
        const c = t.slice(); c[i] = YO;
        if (obtenerGanador(c)?.ganador === YO) return i;
    }
    // 3. Centro
    if (t[4] === null) return 4;
    // 4. Random
    return cpuNivel1(t);
}

function cpuNivel3(t) {
    for (const i of celdasVacias(t)) {
        const c = t.slice(); c[i] = CPU;
        if (obtenerGanador(c)?.ganador === CPU) return i;
    }
    for (const i of celdasVacias(t)) {
        const c = t.slice(); c[i] = YO;
        if (obtenerGanador(c)?.ganador === YO) return i;
    }
    if (t[4] === null) return 4;
    const esquinas = [0, 2, 6, 8].filter(i => t[i] === null);
    if (esquinas.length) return esquinas[Math.floor(Math.random() * esquinas.length)];
    const bordes = [1, 3, 5, 7].filter(i => t[i] === null);
    if (bordes.length) return bordes[Math.floor(Math.random() * bordes.length)];
    return cpuNivel1(t);
}

function cpuNivel4(t) {
    let mejorScore = -Infinity;
    let mejorJugada = null;
    for (const i of celdasVacias(t)) {
        const c = t.slice(); c[i] = CPU;
        const score = minimax(c, false, 0);
        if (score > mejorScore) {
            mejorScore = score;
            mejorJugada = i;
        }
    }
    return mejorJugada;
}

function minimax(t, esTurnoCPU, profundidad) {
    const r = obtenerGanador(t);
    if (r) {
        if (r.ganador === CPU) return 10 - profundidad;
        if (r.ganador === YO) return profundidad - 10;
        return 0;
    }
    if (esTurnoCPU) {
        let mejor = -Infinity;
        for (const i of celdasVacias(t)) {
            const c = t.slice(); c[i] = CPU;
            mejor = Math.max(mejor, minimax(c, false, profundidad + 1));
        }
        return mejor;
    } else {
        let mejor = Infinity;
        for (const i of celdasVacias(t)) {
            const c = t.slice(); c[i] = YO;
            mejor = Math.min(mejor, minimax(c, true, profundidad + 1));
        }
        return mejor;
    }
}

function elegirJugadaCPU() {
    const nivel = nivelDificultad();
    if (nivel === 1) return cpuNivel1(tablero);
    if (nivel === 2) return cpuNivel2(tablero);
    if (nivel === 3) return cpuNivel3(tablero);
    return cpuNivel4(tablero);
}

// ============================================================
//  FLUJO DE PARTIDA
// ============================================================
async function jugarCelda(idx) {
    if (partidaTerminada || bloqueado) return;
    if (turno !== YO) return;
    if (!esMovimientoValido(tablero, idx)) return;

    tablero[idx] = YO;
    renderTablero();
    const resultado = obtenerGanador(tablero);
    if (resultado) { await finalizarPartida(resultado); return; }

    turno = CPU;
    actualizarTurnoUI();
    bloqueado = true;

    const delay = 250 + Math.random() * 300;
    setTimeout(async () => {
        const jugadaCPU = elegirJugadaCPU();
        if (jugadaCPU !== null && jugadaCPU !== undefined) {
            tablero[jugadaCPU] = CPU;
            renderTablero();
        }
        const resultadoCPU = obtenerGanador(tablero);
        if (resultadoCPU) {
            await finalizarPartida(resultadoCPU);
        } else {
            turno = YO;
            actualizarTurnoUI();
            bloqueado = false;
        }
    }, delay);
}

async function finalizarPartida(resultado) {
    partidaTerminada = true;
    bloqueado = false;

    const resultadoEl = document.getElementById('trResultado');
    let tipo = '', texto = '', icono = '';

    if (resultado.empate) {
        tipo = 'empate';
        texto = 'Empate';
        icono = 'equal';
        empates++;
    } else if (resultado.ganador === YO) {
        tipo = 'ganaste';
        racha++;
        ganadas++;
        if (racha > record) record = racha;
        const mult = multiplicadorRecompensa();
        const recompensa = MONEDAS_BASE * mult;
        texto = mult > 1
            ? `Ganaste · +${recompensa} (x${mult})`
            : `Ganaste · +${recompensa}`;
        icono = 'trophy';

        try {
            const api = API();
            if (api && typeof api.canjear === 'function') {
                const desc = mult > 1 ? `Victoria x${mult} (racha ${racha})` : 'Victoria';
                await api.canjear('grid-3x3', APP_ID, desc, recompensa);
                monedasGanadas += recompensa;
            }
        } catch (e) {
            console.warn('[Tres en Raya] No se pudieron otorgar monedas:', e);
        }
    } else if (resultado.ganador === CPU) {
        tipo = 'perdiste';
        perdidas++;
        racha = 0;
        texto = 'Perdiste · racha reiniciada';
        icono = 'x';
    }

    // Resaltar línea ganadora
    if (resultado.linea) {
        resultado.linea.forEach(i => {
            const celda = document.querySelector(`.tr-celda[data-idx="${i}"]`);
            if (celda) celda.classList.add(resultado.ganador === YO ? 'ganadora' : 'perdedora');
        });
    }

    // Mostrar resultado
    resultadoEl.hidden = false;
    resultadoEl.className = 'tr-resultado ' + tipo;
    resultadoEl.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    if (window.lucide) window.lucide.createIcons();

    // Detectar subida de nivel
    const nivelNuevo = nivelDificultad();
    if (nivelNuevo > nivelAnterior) {
        setTimeout(() => {
            toast(`¡Nivel ${nivelNuevo} desbloqueado!`, 'success');
        }, 500);
    }
    nivelAnterior = nivelNuevo;

    await guardarEstado();
    actualizarStatsUI();
    actualizarBadgeRacha();
    actualizarNivelUI();
}

// ============================================================
//  RENDER
// ============================================================
function renderTablero() {
    document.querySelectorAll('.tr-celda').forEach(celda => {
        const idx = parseInt(celda.dataset.idx, 10);
        const valor = tablero[idx];

        celda.classList.toggle('ocupada', valor !== null);
        celda.classList.toggle('deshabilitada', bloqueado || partidaTerminada);

        // Limpiar y redibujar
        celda.textContent = '';
        if (valor === YO) {
            const span = document.createElement('span');
            span.className = 'tr-marca tr-marca-x';
            span.textContent = SIMBOLO_X;
            celda.appendChild(span);
        } else if (valor === CPU) {
            const span = document.createElement('span');
            span.className = 'tr-marca tr-marca-o';
            span.textContent = SIMBOLO_O;
            celda.appendChild(span);
        }
    });
}

function actualizarTurnoUI() {
    const el = document.getElementById('trInfoTurno');
    if (!el) return;
    if (partidaTerminada) {
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
    el.querySelector('span').textContent = `Nivel ${n}`;
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
//  ACCIONES
// ============================================================
function nuevaPartida() {
    limpiarTablero();
    actualizarNivelUI();
}

async function resetearProgreso() {
    if (!confirm('¿Reiniciar todo el progreso?\n\nSe borrarán: racha, récord, ganadas, monedas contadas. Las monedas YA ganadas siguen en tu cuenta.')) return;
    await resetearEstado();
    actualizarStatsUI();
    actualizarBadgeRacha();
    actualizarNivelUI();
    limpiarTablero();
    toast('Progreso reiniciado', 'success');
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Tres en Raya necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('trUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para jugar.');
        return;
    }

    await cargarEstado();
    nivelAnterior = nivelDificultad();
    actualizarStatsUI();
    actualizarBadgeRacha();
    limpiarTablero();
    actualizarNivelUI();

    // Eventos de celdas
    document.querySelectorAll('.tr-celda').forEach(celda => {
        celda.addEventListener('click', () => {
            const idx = parseInt(celda.dataset.idx, 10);
            jugarCelda(idx);
        });
    });

    document.getElementById('btnNuevaPartida')?.addEventListener('click', nuevaPartida);
    document.getElementById('btnResetear')?.addEventListener('click', resetearProgreso);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
