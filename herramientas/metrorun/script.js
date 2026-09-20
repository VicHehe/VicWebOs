// ============================================================
//  The MetroRun — Runner de 3 líneas con vista aérea
//  ------------------------------------------------------------
//  Mecánica:
//    - El jugador (con su foto de perfil) corre en una de 3 líneas.
//    - Debe cambiar de línea para esquivar vagones y tomar monedas.
//    - Cada moneda recolectada = 1 moneda real de VicWebOs.
//    - Cada 5 monedas sube la dificultad (velocidad + spawn).
//    - Tope de dificultad a las 55 monedas.
//
//  Persistencia:
//    - Récord en app/metrorun/{codigo}metrorun.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'metrorun';
const ARCHIVO_RECORD_BASE = 'app/metrorun/';

// ---- Canvas ----
const CANVAS_W = 420;
const CANVAS_H = 640;

// ---- Líneas ----
const LANES = 3;
const SIDE_W = 30;
const ROAD_W = CANVAS_W - SIDE_W * 2;
const LANE_W = ROAD_W / LANES;
const LANE_CENTERS = [
    SIDE_W + LANE_W * 0.5,
    SIDE_W + LANE_W * 1.5,
    SIDE_W + LANE_W * 2.5
];

// ---- Jugador ----
const PLAYER_Y = CANVAS_H - 110;
const PLAYER_RADIUS = 22;
const PLAYER_HITBOX = 15;   // hitbox más chica = más perdón

// ---- Obstáculos ----
const OBSTACLE_W = 64;
const OBSTACLE_H = 90;
const OBSTACLE_HITBOX_W = 54;
const OBSTACLE_HITBOX_H = 78;

// ---- Monedas ----
const COIN_RADIUS = 14;
const COIN_HITBOX = 20;

// ---- Dificultad ----
const MONEDAS_POR_NIVEL = 5;
const NIVEL_MAX = 11;                    // 55 monedas / 5
const VELOCIDAD_BASE = 250;              // px/s
const VELOCIDAD_MAX = 750;               // px/s
const SPAWN_BASE_MS = 900;
const SPAWN_MIN_MS = 220;
const COIN_SPAWN_FACTOR = 1.7;

// ============================================================
//  ESTADO
// ============================================================
let canvas, ctx;
let rafId = null;
let ultimoFrameMs = 0;
let gameState = 'idle';   // idle | jugando | gameover

const jugador = {
    lane: 1,
    x: LANE_CENTERS[1],
    targetX: LANE_CENTERS[1]
};

let obstaculos = [];
let monedas = [];
let particulas = [];
let popups = [];
let scrollY = 0;
let monedasRecolectadas = 0;
let proximoSpawnObs = 0;
let proximoSpawnMon = 0;
let recordPersonal = 0;
let nivelActual = 0;

let fotoImg = null;
let inicialUsuario = '?';
let fotoCargada = false;

let toastTimeout = null;

// Paleta leída del tema (se refresca al cambiar tema)
const colores = {
    fondo:       '#18181B',
    anden:       '#27272A',
    carretera:   '#1F1F23',
    lineaCarril: '#52525B',
    bordeAcento: '#8B5CF6'
};

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

function colorVar(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) {
        return fallback;
    }
}

function refrescarColores() {
    colores.fondo       = colorVar('--gray-900', '#18181B');
    colores.anden       = colorVar('--gray-800', '#27272A');
    colores.carretera   = colorVar('--gray-800', '#1F1F23');
    colores.lineaCarril = colorVar('--gray-600', '#52525B');
    colores.bordeAcento = colorVar('--violet-500', '#8B5CF6');
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
        setTimeout(refrescarColores, 60);
    }
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('mrToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mr-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  FOTO DE PERFIL
// ============================================================
function cargarFotoPerfil() {
    try {
        const cuenta = window.parent.cuentaActual;
        if (cuenta && cuenta.foto) {
            fotoImg = new Image();
            fotoImg.onload = () => { fotoCargada = true; };
            fotoImg.onerror = () => { fotoCargada = false; };
            fotoImg.src = cuenta.foto;
        }
        if (cuenta && cuenta.nombre) {
            inicialUsuario = cuenta.nombre.charAt(0).toUpperCase();
        }
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  RÉCORD
// ============================================================
function rutaRecord() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO_RECORD_BASE + cuenta.codigo + 'metrorun.json';
}

async function cargarRecord() {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return 0;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data.record === 'number') return data.record;
    } catch (e) { /* silencioso */ }
    return 0;
}

async function guardarRecord(n) {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            record: n,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[MetroRun] No se pudo guardar el récord:', e);
    }
}

// ============================================================
//  CANVAS
// ============================================================
function configurarCanvas() {
    canvas = document.getElementById('mrCanvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width  = '';
    canvas.style.height = '';
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ============================================================
//  DIBUJADO
// ============================================================
function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
}

function dibujar() {
    if (!ctx) return;

    // Fondo general
    ctx.fillStyle = colores.fondo;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Andenes laterales
    ctx.fillStyle = colores.anden;
    ctx.fillRect(0, 0, SIDE_W, CANVAS_H);
    ctx.fillRect(CANVAS_W - SIDE_W, 0, SIDE_W, CANVAS_H);

    // Borde acento de los andenes
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colores.bordeAcento;
    ctx.fillRect(SIDE_W - 2, 0, 2, CANVAS_H);
    ctx.fillRect(CANVAS_W - SIDE_W, 0, 2, CANVAS_H);
    ctx.globalAlpha = 1;

    // Carretera
    ctx.fillStyle = colores.carretera;
    ctx.fillRect(SIDE_W, 0, ROAD_W, CANVAS_H);

    // Dashes entre carriles
    ctx.strokeStyle = colores.lineaCarril;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const dashTotal = 60;
    const dashLen   = 22;
    const offset    = scrollY % dashTotal;
    for (let i = -1; i < CANVAS_H / dashTotal + 1; i++) {
        const y = i * dashTotal + offset;
        for (let j = 1; j < LANES; j++) {
            const x = SIDE_W + LANE_W * j;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + dashLen);
            ctx.stroke();
        }
    }

    // Obstáculos
    for (const o of obstaculos) dibujarObstaculo(o);

    // Monedas
    for (const c of monedas) dibujarMoneda(c);

    // Partículas
    for (const p of particulas) {
        ctx.globalAlpha = Math.max(0, p.life / p.lifeMax);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Jugador
    dibujarJugador();

    // Popups (+1)
    for (const cp of popups) {
        ctx.globalAlpha = Math.max(0, cp.life / cp.lifeMax);
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 22px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeText('+1', cp.x, cp.y);
        ctx.fillText('+1', cp.x, cp.y);
    }
    ctx.globalAlpha = 1;
}

function dibujarJugador() {
    const x = jugador.x;
    const y = PLAYER_Y;
    const r = PLAYER_RADIUS;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aro exterior (acento del tema)
    ctx.strokeStyle = colores.bordeAcento;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    //
