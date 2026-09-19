// ============================================================
//  Tres en Raya — Clásico 3 en línea con dificultad escalonada
//  ------------------------------------------------------------
//  - Racha de victorias consecutivas sube la dificultad de la CPU
//  - 2 monedas base por victoria, con multiplicador por racha
//  - Persistencia en IndexedDB PROPIO del iframe (no en la BD)
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// Configuración de la app
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
    [0, 1, 2], [3, 4, 5], [6, 7, 8],   // filas
    [0, 3, 6], [1, 4, 7], [2, 5, 8],   // columnas
    [0, 4, 8], [2, 4, 6]                // diagonales
];

// ---------- ESTADO ----------
let tablero = Array(9).fill(null);
let turno = YO;               // 'X' siempre empieza
let partidaTerminada = false;
let bloqueado = false;        // mientras la CPU piensa
let racha = 0;
let record = 0;
let ganadas = 0;
let perdidas = 0;
let empates = 0;
let monedasGanadas = 0;
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
//  INDEXEDDB (propio del iframe, aislado del shell)
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
        racha,
        record,
        ganadas,
        perdidas,
        empates,
        monedasGanadas,
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
}

// ============================================================
//  DIFICULTAD SEGÚN RACHA
// ============================================================
function nivelDificultad() {
    if (racha >= 10) return 4;
    if (racha >= 6) return 3;
    if (racha >= 3) return 2;
    return 1;
}

function nombreNivel(n) {
    return `Nivel ${n}`;
}

// ============================================================
//  MULTIPLICADOR DE RECOMPENSA
// ============================================================
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

// Nivel 1: al azar
function cpuNivel1(t) {
    const vacias = celdasVacias(t);
    return vacias[Math.floor(Math.random() * vacias.length)];
}

// Nivel 2: gana si puede, bloquea si el jugador puede ganar, luego centro, luego random
function cpuNivel2(t) {
    // 1. Ganar si puede
    for (const i of celdasVacias(t)) {
        const copia = t.slice();
        copia[i] = CPU;
        if (obtenerGanador(copia)?.ganador === CPU) return i;
    }
    // 2. Bloquear si el jugador puede ganar
    for (const i of celdasVacias(t)) {
        const copia = t.slice();
        copia[i] = YO;
        if (obtenerGanador(copia)?.ganador === YO) return i;
    }
    // 3. Centro si está libre
    if (t[4] === null) return 4;
    // 4. Random
    return cpuNivel1(t);
}

// Nivel 3: gana > bloquea > centro > esquinas > bordes
function cpuNivel3(t) {
    // 1. Ganar
    for (const i of celdasVacias(t)) {
        const copia = t.slice();
        copia[i] = CPU;
        if (obtenerGanador(copia)?.ganador === CPU) return i;
    }
    // 2. Bloquear
    for (const i of celdasVacias(t)) {
        const copia = t.slice();
        copia[i] = YO;
        if (obtenerGanador(copia)?.ganador === YO) return i;
    }
    // 3. Centro
    if (t[4] === null) return 4;
    // 4. Esquinas
    const esquinas = [0, 2, 6, 8].filter(i => t[i] === null);
    if (esquinas.length) return esquinas[Math.floor(Math.random() * esquinas.length)];
    // 5. Bordes
    const bordes = [1, 3, 5, 7].filter(i => t[i] === null);
    if (bordes.length) return bordes[Math.floor(Math.random() * bordes.length)];
    // 6. Cualquier cosa
    return cpuNivel1(t);
}

// Nivel 4: minimax perfecto
function cpuNivel4(t) {
    let mejorScore = -Infinity;
    let mejorJugada = null;

    for (const i of celdasVacias(t)) {
        const copia = t.slice();
        copia[i] = CPU;
        const score = minimax(copia, false, 0);
        if (score > mejorScore) {
            mejorScore = score;
            mejorJugada = i;
        }
    }
    return mejorJugada;
}

function minimax(t, esTurnoCPU, profundidad) {
    const resultado = obtenerGanador(t);
    if (resultado) {
        if (resultado.ganador === CPU) return 10 - profundidad;
        if (resultado.ganador === YO) return profundidad - 10;
        return 0; // empate
    }

    if (esTurnoCPU) {
        let mejor = -Infinity;
        for (const i of celdasVacias(t)) {
            const copia = t.slice();
            copia[i] = CPU;
            mejor = Math.max(mejor, minimax(copia, false, profundidad + 1));
        }
        return mejor;
    } else {
        let mejor = Infinity;
        for (const i of celdasVacias(t)) {
            const copia = t.slice();
            copia[i] = YO;
            mejor = Math.min(mejor, minimax(copia, true, profundidad + 1));
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

    // Turno del jugador
    tablero[idx] = YO;
    renderTablero();
    const resultado = obtenerGanador(tablero);
    if (resultado) {
        await finalizarPartida(resultado);
        return;
    }

    // Turno de la CPU (con delay para que se sienta natural)
    turno = CPU;
    actualizarTurnoUI();
    bloqueado = true;

    const delay = 250 + Math.random() * 350;
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
    let tipo = '';
    let texto = '';
    let icono = '';

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
            ? `Ganaste · +${recompensa} monedas (x${mult})`
            : `Ganaste · +${recompensa} monedas`;
        icono = 'trophy';

        // Dar monedas vía API del shell
        try {
            const api = API();
            if (api && typeof api.canjear === 'function') {
                const descripcion = mult > 1
                    ? `Victoria x${mult} (racha ${racha})`
                    : 'Victoria';
                await api.canjear('grid-3x3', APP_ID, descripcion, recompensa);
                monedasGanadas += recompensa;
            }
        } catch (e) {
            console.warn('[Tres en Raya] No se pudieron otorgar monedas:', e);
            texto = 'Ganaste · error dando monedas';
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
        resultado.linea.forEach(idx => {
            const celda = document.querySelector(`.tr-celda[data-idx="${idx}"]`);
            if (celda) {
                celda.classList.add(resultado.ganador === YO ? 'ganadora' : 'perdedora');
            }
        });
    }

    // Mostrar resultado
    resultadoEl.hidden = false;
    resultadoEl.className = 'tr-resultado ' + tipo;
    resultadoEl.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    if (window.lucide) window.lucide.createIcons();

    // Actualizar UI de racha y stats
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

        // Limpiar
        celda.classList.toggle('ocupada', valor !== null);
        celda.classList.toggle('deshabilitada', bloqueado || partidaTerminada);
        celda.innerHTML = '';

        if (valor === YO) {
            celda.innerHTML = `
                <svg class="tr-marca tr-marca-x" viewBox="0 0 100 100">
                    <line x1="22" y1="22" x2="78" y2="78" />
                    <line x1="78" y1="22" x2="22" y2="78" />
                </svg>
            `;
        } else if (valor === CPU) {
            celda.innerHTML = `
                <svg class="tr-marca tr-marca-o" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="28" />
                </svg>
            `;
        }
    });
}

function actualizarTurnoUI() {
    const el = document.getElementById('trInfoTurno');
    if (!el) return;
    if (partidaTerminada) {
        el.innerHTML = '<i data-lucide="flag"></i><span>Partida terminada</span>';
        el.classList.remove('cpu');
    } else if (turno === YO) {
        el.innerHTML = '<i data-lucide="circle-dot"></i><span>Tu turno</span>';
        el.classList.remove('cpu');
    } else {
        el.innerHTML = '<i data-lucide="cpu"></i><span>Turno de la CPU</span>';
        el.classList.add('cpu');
    }
    if (window.lucide) window.lucide.createIcons();
}

function actualizarNivelUI() {
    const el = document.getElementById('trInfoNivel');
    if (!el) return;
    const n = nivelDificultad();
    el.innerHTML = `<i data-lucide="cpu"></i><span>${nombreNivel(n)}</span>`;
    if (window.lucide) window.lucide.createIcons();
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
    if (!confirm('¿Reiniciar todo el progreso?\n\nSe borrarán: racha, récord, partidas ganadas, monedas contadas. Las monedas YA ganadas siguen en tu cuenta.')) return;

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

    // Acciones
    document.getElementById('btnNuevaPartida')?.addEventListener('click', nuevaPartida);
    document.getElementById('btnResetear')?.addEventListener('click', resetearProgreso);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
