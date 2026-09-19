// ============================================================
//  Golpea el Topo — Whack-a-mole con foto de perfil
//  ------------------------------------------------------------
//  Los topos son la foto del usuario (o su inicial si no tiene).
//  3 dificultades: fácil (0.5 mon), media (1 mon), difícil (2 mon).
//  Tope de monedas por partida para no romper la economía.
//  Partidas de 30 segundos. Recompensa al final.
//
//  IMPORTANTE: sin setTimeout. Todo el timing se hace con
//  requestAnimationFrame + deltas de performance.now().
//  Los setTimeout se throttlean en iframes anidados.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'whack-a-mole';
const IDB_NAME = 'WhackAMoleDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';
const DURACION_MS = 30000;   // 30 segundos
const MAX_HOYOS = 9;

// Configuración por dificultad
// El tope de monedas existe para que una partida excepcional no
// rompa la economía. Difícil sigue siendo el más rentable pero
// ya no escala infinitamente.
const DIFICULTADES = {
    facil: {
        nombre: 'Fácil',
        moleVida: 1400,          // ms que dura un topo visible
        spawnMin: 700,
        spawnMax: 1100,
        maxSimultaneos: 1,
        monedasPorTopo: 0.5,     // 1 moneda cada 2 topos
        topeMonedas: 15
    },
    media: {
        nombre: 'Media',
        moleVida: 1000,
        spawnMin: 500,
        spawnMax: 800,
        maxSimultaneos: 1,
        monedasPorTopo: 1,
        topeMonedas: 30
    },
    dificil: {
        nombre: 'Difícil',
        moleVida: 500,
        spawnMin: 300,
        spawnMax: 550,
        maxSimultaneos: 2,
        monedasPorTopo: 2,
        topeMonedas: 50
    }
};

// ---------- ESTADO ----------
let usuarioActual = null;
let fotoPerfil = null;        // base64 o null
let inicialUsuario = '?';

let dificultadActual = 'facil';
let config = DIFICULTADES.facil;

let juegoActivo = false;
let rafId = null;
let ultimoFrameMs = 0;
let tiempoRestanteMs = DURACION_MS;
let proximoSpawnMs = 0;
let vidasTopos = new Array(MAX_HOYOS).fill(0);   // ms restantes por hoyo
let aciertos = 0;
let toposFallados = 0;

let record = 0;
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

function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'wm_' + codigo;
}

async function cargarEstado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return;
    record = Number.isFinite(data.record) ? data.record : 0;
}

function guardarEstado() {
    idbSet(claveEstado(), {
        record,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  FOTO DE PERFIL — leer del shell
// ============================================================
function cargarFotoPerfil() {
    try {
        // El shell expone `cuentaActual` con la propiedad `foto` (base64)
        const cuenta = window.parent.cuentaActual;
        if (cuenta && cuenta.foto) {
            fotoPerfil = cuenta.foto;
        }
        if (cuenta && cuenta.nombre) {
            inicialUsuario = cuenta.nombre.charAt(0).toUpperCase();
        }
    } catch (e) {
        // Cross-origin o shell no listo — usar inicial por defecto
    }
}

function aplicarFotoATopos() {
    const caras = document.querySelectorAll('.wm-topo-cara');
    caras.forEach(cara => {
        if (fotoPerfil) {
            cara.style.backgroundImage = `url('${fotoPerfil}')`;
            cara.textContent = '';
        } else {
            cara.style.backgroundImage = 'none';
            cara.textContent = inicialUsuario;
        }
    });
}

// ============================================================
//  LÓGICA DEL JUEGO
// ============================================================
function empezarPartida(dif) {
    dificultadActual = dif;
    config = DIFICULTADES[dif];
    if (!config) { dificultadActual = 'facil'; config = DIFICULTADES.facil; }

    // Reset estado
    vidasTopos = new Array(MAX_HOYOS).fill(0);
    tiempoRestanteMs = DURACION_MS;
    proximoSpawnMs = 400;   // primer spawn rápido para que arranque con acción
    aciertos = 0;
    toposFallados = 0;
    ultimoFrameMs = 0;
    juegoActivo = true;

    // Reset UI
    document.querySelectorAll('.wm-hoyo').forEach(h => {
        h.classList.remove('activo', 'golpe');
    });
    actualizarHUD();
    actualizarBarraProgreso();
    actualizarChipDificultad();

    // Overlays
    document.getElementById('wmOverlayStart').hidden = true;
    document.getElementById('wmOverlayFin').hidden = true;

    // Arrancar loop
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

function loop(now) {
    if (!juegoActivo) return;

    if (!ultimoFrameMs) ultimoFrameMs = now;
    // Cap de 100ms por si el navegador pausa el iframe por un instante
    const delta = Math.min(now - ultimoFrameMs, 100);
    ultimoFrameMs = now;

    // Countdown
    tiempoRestanteMs -= delta;
    if (tiempoRestanteMs <= 0) {
        tiempoRestanteMs = 0;
        actualizarHUD();
        actualizarBarraProgreso();
        terminarPartida();
        return;
    }

    // Actualizar vida de los topos
    for (let i = 0; i < MAX_HOYOS; i++) {
        if (vidasTopos[i] > 0) {
            vidasTopos[i] -= delta;
            if (vidasTopos[i] <= 0) {
                vidasTopos[i] = 0;
                ocultarTopo(i);
                toposFallados++;
            }
        }
    }

    // Programar spawn
    proximoSpawnMs -= delta;
    if (proximoSpawnMs <= 0) {
        intentarSpawnear();
        const rango = config.spawnMax - config.spawnMin;
        proximoSpawnMs = config.spawnMin + Math.random() * rango;
    }

    actualizarHUD();
    actualizarBarraProgreso();

    rafId = requestAnimationFrame(loop);
}

function intentarSpawnear() {
    const activos = vidasTopos.filter(v => v > 0).length;
    if (activos >= config.maxSimultaneos) return;

    const libres = [];
    vidasTopos.forEach((v, i) => { if (v === 0) libres.push(i); });
    if (libres.length === 0) return;

    const idx = libres[Math.floor(Math.random() * libres.length)];
    vidasTopos[idx] = config.moleVida;
    mostrarTopo(idx);
}

function mostrarTopo(idx) {
    const hoyo = document.querySelector(`.wm-hoyo[data-idx="${idx}"]`);
    if (!hoyo) return;
    hoyo.classList.add('activo');
}

function ocultarTopo(idx) {
    const hoyo = document.querySelector(`.wm-hoyo[data-idx="${idx}"]`);
    if (!hoyo) return;
    hoyo.classList.remove('activo');
}

// ============================================================
//  INPUT
// ============================================================
function golpearHoyo(idx) {
    if (!juegoActivo) return;
    if (vidasTopos[idx] <= 0) return;   // no había topo → miss (no penaliza)

    // Acierto
    vidasTopos[idx] = 0;
    aciertos++;

    const hoyo = document.querySelector(`.wm-hoyo[data-idx="${idx}"]`);
    if (hoyo) {
        hoyo.classList.add('golpe');
        const cara = hoyo.querySelector('.wm-topo-cara');
        if (cara) {
            const quitar = () => {
                hoyo.classList.remove('golpe');
                cara.removeEventListener('animationend', quitar);
            };
            cara.addEventListener('animationend', quitar);
        }
    }

    // Ocultar el topo (baja)
    ocultarTopo(idx);

    actualizarHUD();
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function terminarPartida() {
    juegoActivo = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    // Limpiar topos restantes
    for (let i = 0; i < MAX_HOYOS; i++) {
        if (vidasTopos[i] > 0) {
            vidasTopos[i] = 0;
            ocultarTopo(i);
        }
    }

    // Cálculo con tope: multiplicador × aciertos, limitado por config.topeMonedas
    const monedasBrutas = Math.floor(aciertos * config.monedasPorTopo);
    const monedas = Math.min(monedasBrutas, config.topeMonedas);

    const esRecord = aciertos > record;
    if (esRecord) {
        record = aciertos;
        document.getElementById('wmRecord').textContent = record;
        guardarEstado();
    }

    // Otorgar monedas
    if (monedas > 0) {
        otorgarMonedas(monedas);
    }

    mostrarOverlayFin(monedas, esRecord);
}

function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const desc = `${aciertos} topos en ${config.nombre}`;
    Promise.resolve(api.canjear('hammer', APP_ID, desc, cantidad))
        .catch(e => console.warn('[Whack-a-mole] No se pudieron dar monedas:', e));
}

function mostrarOverlayFin(monedas, esRecord) {
    const icono = document.getElementById('wmFinIcono');
    const titulo = document.getElementById('wmFinTitulo');
    const subtitulo = document.getElementById('wmFinSubtitulo');

    if (aciertos >= 20) {
        icono.className = 'wm-overlay-icono wm-overlay-icono-ganaste';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Impresionante!';
        subtitulo.textContent = `Golpeaste ${aciertos} topos. ¡Sos una máquina!`;
    } else if (aciertos >= 10) {
        icono.className = 'wm-overlay-icono wm-overlay-icono-normal';
        icono.innerHTML = '<i data-lucide="target"></i>';
        titulo.textContent = '¡Buen trabajo!';
        subtitulo.textContent = `Golpeaste ${aciertos} topos.`;
    } else {
        icono.className = 'wm-overlay-icono wm-overlay-icono-malo';
        icono.innerHTML = '<i data-lucide="meh"></i>';
        titulo.textContent = '¡Se acabó!';
        subtitulo.textContent = `Golpeaste ${aciertos} topos. ¿Probás de nuevo?`;
    }

    document.getElementById('wmFinDif').textContent = config.nombre;
    document.getElementById('wmFinAciertos').textContent = aciertos;
    document.getElementById('wmFinMonedas').textContent = `+${monedas}`;

    const filaRecord = document.getElementById('wmFinRecordFila');
    if (esRecord) {
        document.getElementById('wmFinRecord').textContent = aciertos;
        filaRecord.hidden = false;
    } else {
        filaRecord.hidden = true;
    }

    document.getElementById('wmOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER
// ============================================================
function actualizarHUD() {
    const segundos = (tiempoRestanteMs / 1000).toFixed(1);
    const tiempoEl = document.getElementById('wmTiempo');
    const tiempoBox = tiempoEl ? tiempoEl.closest('.wm-hud-tiempo') : null;
    if (tiempoEl) tiempoEl.textContent = `${segundos}s`;
    if (tiempoBox) {
        tiempoBox.classList.toggle('peligro', tiempoRestanteMs <= 5000);
    }

    const aciertosEl = document.getElementById('wmAciertos');
    if (aciertosEl) aciertosEl.textContent = aciertos;
}

function actualizarBarraProgreso() {
    const fill = document.getElementById('wmProgresoFill');
    if (!fill) return;
    const pct = (tiempoRestanteMs / DURACION_MS) * 100;
    fill.style.width = pct + '%';
    fill.classList.toggle('peligro', tiempoRestanteMs <= 5000);
}

function actualizarChipDificultad() {
    const chip = document.getElementById('wmHudDif');
    const nombre = document.getElementById('wmHudDifNombre');
    if (!chip || !nombre) return;
    chip.classList.remove('facil', 'media', 'dificil');
    chip.classList.add(dificultadActual);
    nombre.textContent = config.nombre;
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();
    cargarFotoPerfil();
    aplicarFotoATopos();

    // Usuario
    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    const badge = document.getElementById('wmUserBadge');
    if (badge) {
        badge.textContent = usuarioActual && usuarioActual.codigo
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`
            : 'Invitado';
    }

    // Récord
    try { await cargarEstado(); } catch (e) { /* silencioso */ }
    const recordEl = document.getElementById('wmRecord');
    if (recordEl) recordEl.textContent = record;

    // Listeners de hoyos (pointerdown para respuesta inmediata, + click como respaldo)
    document.querySelectorAll('.wm-hoyo').forEach(hoyo => {
        const idx = parseInt(hoyo.dataset.idx, 10);
        if (Number.isNaN(idx)) return;
        let ultimoTs = 0;
        const manejar = () => {
            const ahora = Date.now();
            if (ahora - ultimoTs < 200) return;   // evitar doble disparo
            ultimoTs = ahora;
            golpearHoyo(idx);
        };
        hoyo.addEventListener('pointerdown', manejar);
        hoyo.addEventListener('click', manejar);
    });

    // Botones de dificultad
    document.querySelectorAll('.wm-dif-card').forEach(card => {
        card.addEventListener('click', () => {
            empezarPartida(card.dataset.dif);
        });
    });

    // Botón "jugar otra vez"
    document.getElementById('wmBtnReintentar')?.addEventListener('click', () => {
        document.getElementById('wmOverlayFin').hidden = true;
        document.getElementById('wmOverlayStart').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
