// ============================================================
//  Arte Flash — Editor de dibujo por capas
//  ------------------------------------------------------------
//  Motor de dibujo original preservado. Integración adaptada:
//    - Persistencia local: IndexedDB (1 dibujo activo)
//    - Exportación: PNG local o Galería
//    - Referencias: picker de la galería de VicWebOs
//    - Tema: heredado del padre
//    - UI adaptativa: barra inferior + panel flotante en móvil,
//      panel lateral fijo en PC
//    - Pan sin botón dedicado:
//        · Móvil: toque fuera del canvas · 2 dedos (pan + zoom)
//        · PC:    click derecho · click fuera del canvas ·
//                 botón medio · Space+click · long-press izquierdo
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsArteFlash';
const IDB_VERSION = 1;
const IDB_STORE = 'dibujos';
const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOL = 8;

const PALETA_BLK_NX64 = [
    '#000000','#12173d','#293268','#464b8c','#6b74b2','#909edd','#c1d9f2','#ffffff',
    '#a293c4','#7b6aa5','#53427f','#3c2c68','#431e66','#5d2f8c','#854cbf','#b483ef',
    '#8cff9b','#42bc7f','#22896e','#14665b','#0f4a4c','#0a2a33','#1d1a59','#322d89',
    '#354ab2','#3e83d1','#50b9eb','#8cdaff','#53a1ad','#3b768f','#21526b','#163755',
    '#008782','#00aaa5','#27d3cb','#78fae6','#cdc599','#988f64','#5c5d41','#353f23',
    '#919b45','#afd370','#ffe091','#ffaa6e','#ff695a','#b23c40','#ff6675','#dd3745',
    '#a52639','#721c2f','#b22e69','#e54286','#ff6eaf','#ffa5d5','#ffd3ad','#cc817a',
    '#895654','#61393b','#3f1f3c','#723352','#994c69','#c37289','#f29faa','#ffccd0'
];

let usuarioActual = null;
let dibujoGuardado = null;

let longPressTimer = null;
let longPressStartX = 0;
let longPressStartY = 0;
let longPressActivo = false;

// Estado para el gesto de 2 dedos: guardamos centro y distancia del frame anterior
let gesto2DedosActivo = false;
let gesto2DedosCentro = { x: 0, y: 0 };
let gesto2DedosDistancia = 0;

const state = {
    herramienta: 'pincel',
    color: '#ffa5d5',
    tamano: 5,
    opacidad: 1,
    dureza: 1,
    estabilizador: 0,
    dibujando: false,
    spaceDown: false,
    zoom: 1,
    panX: 0, panY: 0,
    puntos: [],
    presiones: [],
    historia: [],
    historiaIdx: -1,
    MAX_HISTORIA: 40,
    pipetaActiva: false,
    capas: [],
    capaActiva: 0,
    touches: [],
    lastPinchDist: null,
    textoPendienteX: 0,
    textoPendienteY: 0,
    formaStart: null,
    colaPuntos: [],
    lastX: 0, lastY: 0, lastT: 0,
    lastWidth: 5,
    coloresRecientes: []
};

let referencias = [];
let panStart = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d', { willReadFrequently: true });
const wrapper = document.getElementById('lienzoWrapper');
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

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
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('afToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'af-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  INDEXEDDB — 1 dibujo por usuario
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

async function idbDelete(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveDibujo() {
    const codigo = usuarioActual?.codigo || 'invitado';
    return 'af_' + codigo;
}

async function cargarDibujoGuardado() {
    return await idbGet(claveDibujo());
}

async function guardarDibujoLocal() {
    const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
    const data = { blob, fecha: new Date().toISOString() };
    await idbSet(claveDibujo(), data);
    return data;
}

async function borrarDibujoLocal() {
    await idbDelete(claveDibujo());
}

// ============================================================
//  CANVAS SETUP
// ============================================================
function setupCanvas() {
    const W = 1600, H = 1200;
    lienzo.width = W;
    lienzo.height = H;
    lienzo.style.width = W + 'px';
    lienzo.style.height = H + 'px';
    offCanvas.width = W;
    offCanvas.height = H;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    offCtx.fillStyle = '#fff';
    offCtx.fillRect(0, 0, W, H);

    fitCanvasToWrapper();

    requestAnimationFrame(fitCanvasToWrapper);
    setTimeout(fitCanvasToWrapper, 100);
    setTimeout(fitCanvasToWrapper, 300);

    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            fitCanvasToWrapper();
        });
        ro.observe(wrapper);
    }
}

function fitCanvasToWrapper() {
    const ww = wrapper.clientWidth;
    const wh = wrapper.clientHeight;
    if (ww <= 0 || wh <= 0) return;

    const padding = 40;
    const availW = Math.max(50, ww - padding);
    const availH = Math.max(50, wh - padding);
    const scaleX = availW / lienzo.width;
    const scaleY = availH / lienzo.height;
    state.zoom = Math.min(scaleX, scaleY, 1);
    state.panX = (ww - lienzo.width * state.zoom) / 2;
    state.panY = (wh - lienzo.height * state.zoom) / 2;
    applyTransform();
}

function applyTransform() {
    lienzo.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    const nivelEl = document.getElementById('zoomNivel');
    if (nivelEl) nivelEl.textContent = Math.round(state.zoom * 100) + '%';
    actualizarMinimapa();
}

function zoomAt(clientX, clientY, factor) {
    const rect = wrapper.getBoundingClientRect();
    const wx = clientX - rect.left;
    const wy = clientY - rect.top;
    const newZoom = Math.min(Math.max(state.zoom * factor, 0.05), 20);
    const ratio = newZoom / state.zoom;
    state.panX = wx - ratio * (wx - state.panX);
    state.panY = wy - ratio * (wy - state.panY);
    state.zoom = newZoom;
    applyTransform();
}

function wrapperCenter() {
    const r = wrapper.getBoundingClientRect();
    return { x: r.left + wrapper.clientWidth / 2, y: r.top + wrapper.clientHeight / 2 };
}

function getCanvasCoords(clientX, clientY) {
    const rect = wrapper.getBoundingClientRect();
    return {
        x: (clientX - rect.left - state.panX) / state.zoom,
        y: (clientY - rect.top - state.panY) / state.zoom
    };
}

function estaFueraDelCanvas(clientX, clientY) {
    const rect = wrapper.getBoundingClientRect();
    const x = clientX - rect.left - state.panX;
    const y = clientY - rect.top - state.panY;
    const w = lienzo.width * state.zoom;
    const h = lienzo.height * state.zoom;
    return x < 0 || y < 0 || x > w || y > h;
}

// ============================================================
//  PALETA UI
// ============================================================
function inicializarPaleta() {
    const paleta = document.getElementById('paleta');
    if (!paleta) return;
    paleta.innerHTML = '';
    PALETA_BLK_NX64.forEach(color => {
        const btn = document.createElement('button');
        btn.className = 'af-color-btn';
        btn.style.background = color;
        btn.title = color;
        btn.addEventListener('click', () => setColor(color));
        paleta.appendChild(btn);
    });
}

function setColor(c) {
    state.color = c;
    const sel = document.getElementById('selectorColor');
    const hex = document.getElementById('colorHex');
    if (sel) sel.value = c;
    if (hex) hex.textContent = c.toUpperCase();
    actualizarPaletaSeleccion();
    agregarColorReciente(c);
}

function actualizarPaletaSeleccion() {
    document.querySelectorAll('.af-paleta .af-color-btn').forEach(btn => {
        const bg = btn.style.background;
        const match = bg === state.color || bg === hexToRgb(state.color);
        btn.classList.toggle('seleccionado', match);
    });
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgb(${r}, ${g}, ${b})`;
}

function agregarColorReciente(c) {
    state.coloresRecientes = [c, ...state.coloresRecientes.filter(x => x !== c)].slice(0, 8);
    renderColoresRecientes();
}

function renderColoresRecientes() {
    const el = document.getElementById('coloresRecientes');
    if (!el) return;
    el.innerHTML = '';
    state.coloresRecientes.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'af-color-btn';
        btn.style.background = c;
        btn.title = c;
        btn.addEventListener('click', () => setColor(c));
        el.appendChild(btn);
    });
}

// ============================================================
//  CAPAS
// ============================================================
function inicializarCapas() {
    agregarCapa('Capa 1');
    renderCapas();
}

function agregarCapa(nombre) {
    const c = document.createElement('canvas');
    c.width = lienzo.width;
    c.height = lienzo.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.clearRect(0, 0, c.width, c.height);
    state.capas.push({
        nombre: nombre || `Capa ${state.capas.length + 1}`,
        canvas: c,
        ctx: cx,
        visible: true
    });
    state.capaActiva = state.capas.length - 1;
    flattenLayers();
    renderCapas();
}

function renderCapas() {
    const lista = document.getElementById('listaCapas');
    if (!lista) return;
    lista.innerHTML = '';
    state.capas.slice().reverse().forEach((capa, i) => {
        const realIdx = state.capas.length - 1 - i;
        const div = document.createElement('div');
        div.className = 'af-capa-item' + (realIdx === state.capaActiva ? ' activa' : '');
        div.innerHTML = `
            <span class="af-capa-visibilidad" data-idx="${realIdx}" title="Mostrar/ocultar">
                <i data-lucide="${capa.visible ? 'eye' : 'eye-off'}"></i>
            </span>
            <span class="af-capa-nombre">${capa.nombre}</span>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.af-capa-visibilidad')) {
                capa.visible = !capa.visible;
                flattenLayers();
                renderCapas();
                return;
            }
            state.capaActiva = realIdx;
            renderCapas();
        });
        lista.appendChild(div);
    });
    if (window.lucide) window.lucide.createIcons();
}

function flattenLayers() {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    state.capas.forEach(capa => {
        if (capa.visible) ctx.drawImage(capa.canvas, 0, 0);
    });
}

function capaCtxActiva() {
    return state.capas[state.capaActiva]?.ctx || ctx;
}

// ============================================================
//  HISTORIA
// ============================================================
function guardarHistoria() {
    const snapshot = state.capas.map(c => {
        const tmp = document.createElement('canvas');
        tmp.width = c.canvas.width;
        tmp.height = c.canvas.height;
        tmp.getContext('2d').drawImage(c.canvas, 0, 0);
        return tmp;
    });
    state.historia = state.historia.slice(0, state.historiaIdx + 1);
    state.historia.push(snapshot);
    if (state.historia.length > state.MAX_HISTORIA) {
        state.historia.shift();
    } else {
        state.historiaIdx++;
    }
    actualizarBotonesHistorial();
}

function actualizarBotonesHistorial() {
    const d = document.getElementById('btnDeshacer');
    const r = document.getElementById('btnRehacer');
    if (d) d.disabled = state.historiaIdx <= 0;
    if (r) r.disabled = state.historiaIdx >= state.historia.length - 1;
}

function deshacer() {
    if (state.historiaIdx <= 0) return;
    state.historiaIdx--;
    restaurarHistoria(state.historiaIdx);
    actualizarBotonesHistorial();
}

function rehacer() {
    if (state.historiaIdx >= state.historia.length - 1) return;
    state.historiaIdx++;
    restaurarHistoria(state.historiaIdx);
    actualizarBotonesHistorial();
}

function restaurarHistoria(idx) {
    const snap = state.historia[idx];
    if (!snap) return;
    snap.forEach((tmpCanvas, i) => {
        if (state.capas[i]) {
            state.capas[i].ctx.clearRect(0, 0, lienzo.width, lienzo.height);
            state.capas[i].ctx.drawImage(tmpCanvas, 0, 0);
        }
    });
    flattenLayers();
}

// ============================================================
//  BRUSH ENGINE
// ============================================================
function calcWidth(x, y, pressure) {
    const base = state.tamano;
    const t = performance.now();
    const dt = t - state.lastT || 1;
    const dx = x - state.lastX;
    const dy = y - state.lastY;
    const speed = Math.sqrt(dx * dx + dy * dy) / dt;
    state.lastX = x; state.lastY = y; state.lastT = t;
    let pressureFactor = 1;
    if (pressure > 0 && pressure < 1) pressureFactor = 0.3 + pressure * 0.7;
    const speedFactor = Math.max(0.4, 1 - speed * 0.5);
    const targetWidth = base * pressureFactor * speedFactor;
    state.lastWidth = state.lastWidth * 0.6 + targetWidth * 0.4;
    return Math.max(1, state.lastWidth);
}

function lazyPoint(x, y) {
    const k = state.estabilizador;
    if (k === 0) return { x, y };
    state.colaPuntos.push({ x, y });
    if (state.colaPuntos.length > k + 1) state.colaPuntos.shift();
    const avg = state.colaPuntos.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y }), { x: 0, y: 0 });
    return { x: avg.x / state.colaPuntos.length, y: avg.y / state.colaPuntos.length };
}

function prepCtx(c, width, isEraser) {
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    if (isEraser) {
        c.globalCompositeOperation = 'destination-out';
        c.strokeStyle = 'rgba(0,0,0,1)';
        c.filter = 'none';
    } else {
        c.globalCompositeOperation = 'source-over';
        const blur = Math.round((1 - state.dureza) * width * 0.5);
        c.filter = blur > 0 ? `blur(${blur}px)` : 'none';
        c.strokeStyle = hexToRgba(state.color, state.opacidad);
    }
}

function hexToRgba(hex, alpha) {
    if (!hex || hex.length < 7) return `rgba(0,0,0,${alpha ?? 1})`;
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha ?? 1})`;
}

// ============================================================
//  TRAZO
// ============================================================
let rafId = null;
let pendingX, pendingY, pendingP;

function startStroke(x, y, pressure) {
    state.puntos = [{ x, y }];
    state.presiones = [pressure];
    state.colaPuntos = [];
    state.lastX = x; state.lastY = y; state.lastT = performance.now();
    state.lastWidth = state.tamano;
    offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    offCtx.drawImage(capaCtxActiva().canvas, 0, 0);
    state.dibujando = true;
}

function addStrokePoint(x, y, pressure) {
    const lazy = lazyPoint(x, y);
    state.puntos.push(lazy);
    state.presiones.push(pressure);
    pendingX = lazy.x; pendingY = lazy.y; pendingP = pressure;
    if (!rafId) rafId = requestAnimationFrame(renderStroke);
}

function renderStroke() {
    rafId = null;
    const pts = state.puntos;
    if (pts.length < 2) return;
    const isEraser = state.herramienta === 'borrador';
    const width = calcWidth(pendingX, pendingY, pendingP);
    offCtx.save();
    prepCtx(offCtx, width, isEraser);
    offCtx.beginPath();
    if (pts.length === 2) {
        offCtx.moveTo(pts[0].x, pts[0].y);
        offCtx.lineTo(pts[1].x, pts[1].y);
    } else {
        offCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i+1].x) / 2;
            const my = (pts[i].y + pts[i+1].y) / 2;
            offCtx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        offCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }
    offCtx.stroke();
    offCtx.restore();
    flattenLayersWithPreview();
}

function flattenLayersWithPreview() {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    state.capas.forEach((capa, i) => {
        if (!capa.visible) return;
        ctx.drawImage(i === state.capaActiva ? offCanvas : capa.canvas, 0, 0);
    });
}

function endStroke() {
    if (!state.dibujando) return;
    state.dibujando = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    const pts = state.puntos;
    const isEraser = state.herramienta === 'borrador';
    if (pts.length === 0) return;
    const capa = capaCtxActiva();
    capa.save();
    prepCtx(capa, state.tamano, isEraser);
    if (pts.length === 1) {
        capa.beginPath();
        capa.arc(pts[0].x, pts[0].y, state.tamano / 2, 0, Math.PI * 2);
        if (isEraser) {
            capa.globalCompositeOperation = 'destination-out';
            capa.fillStyle = 'rgba(0,0,0,1)';
        } else {
            capa.fillStyle = hexToRgba(state.color, state.opacidad);
        }
        capa.fill();
    } else {
        capa.beginPath();
        capa.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i].x + pts[i+1].x) / 2;
            const my = (pts[i].y + pts[i+1].y) / 2;
            capa.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        capa.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        capa.stroke();
    }
    capa.restore();
    state.puntos = [];
    flattenLayers();
    guardarHistoria();
}

function cancelarTrazo() {
    if (!state.dibujando) return;
    state.dibujando = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    state.puntos = [];
    state.presiones = [];
    state.colaPuntos = [];
    flattenLayers();
}

// ============================================================
//  FORMAS
// ============================================================
let snapshotParaForma = null;

function startForma(x, y) {
    snapshotParaForma = document.createElement('canvas');
    snapshotParaForma.width = lienzo.width;
    snapshotParaForma.height = lienzo.height;
    snapshotParaForma.getContext('2d').drawImage(capaCtxActiva().canvas, 0, 0);
    state.formaStart = { x, y };
    state.dibujando = true;
}

function previewForma(x, y) {
    if (!state.formaStart || !snapshotParaForma) return;
    const capa = capaCtxActiva();
    capa.clearRect(0, 0, lienzo.width, lienzo.height);
    capa.drawImage(snapshotParaForma, 0, 0);
    dibujarForma(capa, state.formaStart.x, state.formaStart.y, x, y);
    flattenLayers();
}

function endForma(x, y) {
    if (!state.formaStart) return;
    const capa = capaCtxActiva();
    capa.clearRect(0, 0, lienzo.width, lienzo.height);
    if (snapshotParaForma) capa.drawImage(snapshotParaForma, 0, 0);
    dibujarForma(capa, state.formaStart.x, state.formaStart.y, x, y);
    flattenLayers();
    guardarHistoria();
    state.formaStart = null;
    snapshotParaForma = null;
    state.dibujando = false;
}

function cancelarForma() {
    if (!state.formaStart) return;
    const capa = capaCtxActiva();
    capa.clearRect(0, 0, lienzo.width, lienzo.height);
    if (snapshotParaForma) capa.drawImage(snapshotParaForma, 0, 0);
    flattenLayers();
    state.formaStart = null;
    snapshotParaForma = null;
    state.dibujando = false;
}

function dibujarForma(c, x1, y1, x2, y2) {
    c.save();
    c.strokeStyle = hexToRgba(state.color, state.opacidad);
    c.lineWidth = state.tamano;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.beginPath();
    if (state.herramienta === 'linea') {
        c.moveTo(x1, y1);
        c.lineTo(x2, y2);
        c.stroke();
    } else if (state.herramienta === 'circulo') {
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        c.ellipse(x1 + (x2-x1)/2, y1 + (y2-y1)/2, rx, ry, 0, 0, Math.PI*2);
        c.stroke();
    }
    c.restore();
}

// ============================================================
//  FLOOD FILL
// ============================================================
function floodFill(x, y, fillColorHex) {
    const imageData = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const data = imageData.data;
    const W = lienzo.width, H = lienzo.height;
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || px >= W || py < 0 || py >= H) return;
    const idx = (py * W + px) * 4;
    const tr = data[idx], tg = data[idx+1], tb = data[idx+2], ta = data[idx+3];
    const fr = parseInt(fillColorHex.slice(1,3),16);
    const fg = parseInt(fillColorHex.slice(3,5),16);
    const fb = parseInt(fillColorHex.slice(5,7),16);
    const fa = Math.round(state.opacidad * 255);
    if (tr === fr && tg === fg && tb === fb && ta === fa) return;
    const tolerance = 30;
    const stack = [[px, py]];
    const visited = new Uint8Array(W * H);
    function match(i) {
        return Math.abs(data[i]-tr) + Math.abs(data[i+1]-tg) + Math.abs(data[i+2]-tb) + Math.abs(data[i+3]-ta) < tolerance * 4;
    }
    while (stack.length) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= W || cy < 0 || cy >= H) continue;
        const ci = cy * W + cx;
        if (visited[ci]) continue;
        visited[ci] = 1;
        const di = ci * 4;
        if (!match(di)) continue;
        data[di] = fr; data[di+1] = fg; data[di+2] = fb; data[di+3] = fa;
        stack.push([cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]);
    }
    ctx.putImageData(imageData, 0, 0);
    const capa = capaCtxActiva();
    capa.clearRect(0, 0, lienzo.width, lienzo.height);
    capa.drawImage(lienzo, 0, 0);
    guardarHistoria();
}

// ============================================================
//  PIPETA
// ============================================================
function pipeta(x, y) {
    const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const hex = '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('');
    setColor(hex);
    state.pipetaActiva = false;
    const btn = document.getElementById('btnPipeta');
    if (btn) btn.classList.remove('activo');
    activarHerramienta('pincel');
}

// ============================================================
//  TEXTO
// ============================================================
function mostrarModalTexto(x, y) {
    state.textoPendienteX = x;
    state.textoPendienteY = y;
    const modal = document.getElementById('modalTexto');
    if (!modal) return;
    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('inputTexto')?.focus(), 100);
}

function cerrarModalTexto() {
    const modal = document.getElementById('modalTexto');
    if (modal) modal.hidden = true;
    const input = document.getElementById('inputTexto');
    if (input) input.value = '';
}

function agregarTexto() {
    const txt = document.getElementById('inputTexto').value.trim();
    const size = parseInt(document.getElementById('tamanoTexto').value) || 24;
    if (!txt) { cerrarModalTexto(); return; }
    const c = capaCtxActiva();
    c.save();
    c.font = `700 ${size}px Nunito, sans-serif`;
    c.fillStyle = hexToRgba(state.color, state.opacidad);
    c.globalCompositeOperation = 'source-over';
    c.fillText(txt, state.textoPendienteX, state.textoPendienteY);
    c.restore();
    flattenLayers();
    guardarHistoria();
    cerrarModalTexto();
}

// ============================================================
//  MOVER (PAN)
// ============================================================
function startPan(clientX, clientY) {
    panStart = { x: clientX, y: clientY, px: state.panX, py: state.panY };
}
function updatePan(clientX, clientY) {
    if (!panStart) return;
    state.panX = panStart.px + (clientX - panStart.x);
    state.panY = panStart.py + (clientY - panStart.y);
    applyTransform();
}
function endPan() { panStart = null; }

// ============================================================
//  POINTER EVENTS
// ============================================================
wrapper.addEventListener('pointerdown', onPointerDown, { passive: false });
wrapper.addEventListener('pointermove', onPointerMove, { passive: false });
wrapper.addEventListener('pointerup', onPointerUp);
wrapper.addEventListener('pointercancel', onPointerUp);
wrapper.addEventListener('pointerleave', onPointerLeave);
wrapper.addEventListener('contextmenu', (e) => e.preventDefault());

function onPointerDown(e) {
    e.preventDefault();

    const esClickDerecho = e.pointerType === 'mouse' && e.button === 2;
    const fueraDelCanvas = estaFueraDelCanvas(e.clientX, e.clientY);

    if (e.pointerType === 'touch') {
        state.touches.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
    }

    // --- GESTO DE 2 DEDOS: inicializar seguimiento ---
    if (e.pointerType === 'touch' && state.touches.length === 2) {
        // Cancelar cualquier trazo/form en curso
        cancelarTrazo();
        cancelarForma();

        // Iniciar el seguimiento del gesto de 2 dedos
        gesto2DedosActivo = true;
        const centro = getTouchCenter();
        gesto2DedosCentro = { x: centro.x, y: centro.y };
        gesto2DedosDistancia = getTouchDist();

        return;
    }

    // Si hay 3+ dedos, ignorar
    if (e.pointerType === 'touch' && state.touches.length >= 3) return;

    // Modo pan manual: click derecho · fuera del canvas · space · botón medio
    if (esClickDerecho || fueraDelCanvas || state.spaceDown || e.button === 1) {
        startPan(e.clientX, e.clientY);
        wrapper.style.cursor = 'grabbing';
        return;
    }

    const { x, y } = getCanvasCoords(e.clientX, e.clientY);
    const pressure = e.pressure || 0.5;

    if (state.pipetaActiva) { pipeta(x, y); return; }

    if (e.pointerType === 'mouse' && e.button === 0) {
        longPressStartX = e.clientX;
        longPressStartY = e.clientY;
        longPressActivo = false;
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            longPressActivo = true;
            cancelarTrazo();
            cancelarForma();
            startPan(e.clientX, e.clientY);
            wrapper.style.cursor = 'grabbing';
        }, LONG_PRESS_MS);
    }

    switch (state.herramienta) {
        case 'pincel':
        case 'borrador':
            startStroke(x, y, pressure);
            break;
        case 'linea':
        case 'circulo':
            startForma(x, y);
            break;
        case 'relleno':
            floodFill(x, y, state.color);
            break;
        case 'texto':
            mostrarModalTexto(x, y);
            break;
    }
}

function onPointerMove(e) {
    e.preventDefault();

    // --- GESTO DE 2 DEDOS: pan + zoom combinados ---
    if (e.pointerType === 'touch' && state.touches.length >= 2 && gesto2DedosActivo) {
        // Actualizar posición del dedo que se movió
        const t = state.touches.find(t => t.id === e.pointerId);
        if (t) { t.x = e.clientX; t.y = e.clientY; }

        // Calcular el centro actual y la distancia actual
        const centro = getTouchCenter();
        const distancia = getTouchDist();

        if (gesto2DedosDistancia > 0 && distancia > 0) {
            // 1. PAN: desplazar el lienzo según cuánto se movió el centro de los dedos
            const dxCentro = centro.x - gesto2DedosCentro.x;
            const dyCentro = centro.y - gesto2DedosCentro.y;
            state.panX += dxCentro;
            state.panY += dyCentro;

            // 2. ZOOM: aplicar el cambio de distancia entre los dedos
            const factor = distancia / gesto2DedosDistancia;
            const rect = wrapper.getBoundingClientRect();
            const wx = centro.x - rect.left;
            const wy = centro.y - rect.top;
            const newZoom = Math.min(Math.max(state.zoom * factor, 0.05), 20);
            const ratio = newZoom / state.zoom;
            state.panX = wx - ratio * (wx - state.panX);
            state.panY = wy - ratio * (wy - state.panY);
            state.zoom = newZoom;

            applyTransform();

            // Actualizar referencia para el siguiente frame
            gesto2DedosCentro = { x: centro.x, y: centro.y };
            gesto2DedosDistancia = distancia;
        }
        return;
    }

    // Long-press cancelado si el usuario se mueve
    if (longPressTimer && !longPressActivo) {
        const dx = e.clientX - longPressStartX;
        const dy = e.clientY - longPressStartY;
        if (Math.sqrt(dx*dx + dy*dy) > LONG_PRESS_MOVE_TOL) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    // Actualización táctil (un solo dedo)
    if (e.pointerType === 'touch') {
        const t = state.touches.find(t => t.id === e.pointerId);
        if (t) { t.x = e.clientX; t.y = e.clientY; }
    }

    if (!panStart) updateCursorIndicator(e.clientX, e.clientY);
    if (panStart) { updatePan(e.clientX, e.clientY); return; }
    if (!state.dibujando) return;

    let events = [e];
    if (e.getCoalescedEvents) {
        const coalesced = e.getCoalescedEvents();
        if (coalesced.length > 0) events = coalesced;
    }

    events.forEach(ev => {
        const pressure = ev.pressure || 0.5;
        const coords = getCanvasCoords(ev.clientX, ev.clientY);
        switch (state.herramienta) {
            case 'pincel':
            case 'borrador':
                addStrokePoint(coords.x, coords.y, pressure);
                break;
            case 'linea':
            case 'circulo':
                previewForma(coords.x, coords.y);
                break;
        }
    });
}

function onPointerUp(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    longPressActivo = false;

    if (e && e.pointerType === 'touch') {
        state.touches = state.touches.filter(t => t.id !== e.pointerId);

        // Si quedan menos de 2 dedos, desactivar el gesto
        if (state.touches.length < 2) {
            gesto2DedosActivo = false;
            state.lastPinchDist = null;
        }

        // Si aún quedan dedos, no procesar el pointerup normal
        if (state.touches.length >= 1) return;
    }

    if (panStart) {
        endPan();
        wrapper.style.cursor = getCursorForHerramienta();
        return;
    }

    if (!state.dibujando) return;
    const coords = e ? getCanvasCoords(e.clientX, e.clientY) : null;

    switch (state.herramienta) {
        case 'pincel':
        case 'borrador':
            endStroke();
            break;
        case 'linea':
        case 'circulo':
            if (coords) endForma(coords.x, coords.y);
            break;
    }
}

function onPointerLeave() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    const ci = document.getElementById('cursorIndicator');
    if (ci) ci.style.display = 'none';
}

// ============================================================
//  WHEEL ZOOM
// ============================================================
wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

// ============================================================
//  TOUCH HELPERS
// ============================================================
function getTouchDist() {
    if (state.touches.length < 2) return 0;
    const dx = state.touches[0].x - state.touches[1].x;
    const dy = state.touches[0].y - state.touches[1].y;
    return Math.sqrt(dx*dx + dy*dy);
}
function getTouchCenter() {
    if (state.touches.length < 2) return { x: 0, y: 0 };
    return {
        x: (state.touches[0].x + state.touches[1].x) / 2,
        y: (state.touches[0].y + state.touches[1].y) / 2
    };
}

// ============================================================
//  CURSOR
// ============================================================
const cursorIndicator = document.getElementById('cursorIndicator');

function updateCursorIndicator(clientX, clientY) {
    if (!cursorIndicator) return;
    if (state.herramienta === 'texto' || state.herramienta === 'relleno') {
        cursorIndicator.style.display = 'none';
        return;
    }
    const rect = wrapper.getBoundingClientRect();
    const size = Math.max(4, state.tamano * state.zoom * 2);
    cursorIndicator.style.display = 'block';
    cursorIndicator.style.width = size + 'px';
    cursorIndicator.style.height = size + 'px';
    cursorIndicator.style.left = (clientX - rect.left) + 'px';
    cursorIndicator.style.top = (clientY - rect.top) + 'px';
}

// ============================================================
//  TECLADO
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();

    if (e.ctrlKey || e.metaKey) {
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); return; }
        if (k === '=' || k === '+') { e.preventDefault(); const c = wrapperCenter(); zoomAt(c.x, c.y, 1.25); return; }
        if (k === '-') { e.preventDefault(); const c = wrapperCenter(); zoomAt(c.x, c.y, 0.8); return; }
        if (k === 's') { e.preventDefault(); guardarSesion(); return; }
    }

    if (e.key === ' ') {
        e.preventDefault();
        state.spaceDown = true;
        wrapper.style.cursor = 'grab';
        return;
    }

    const shortcuts = {
        b: 'pincel', e: 'borrador', l: 'linea',
        c: 'circulo', g: 'relleno', t: 'texto'
    };
    if (shortcuts[k]) { activarHerramienta(shortcuts[k]); return; }
    if (k === 'i') { activarPipeta(); return; }
    if (k === '[') cambiarTamano(-1);
    if (k === ']') cambiarTamano(1);
});

document.addEventListener('keyup', (e) => {
    if (e.key === ' ') {
        state.spaceDown = false;
        wrapper.style.cursor = getCursorForHerramienta();
    }
});

function cambiarTamano(delta) {
    const el = document.getElementById('tamanioPincel');
    if (!el) return;
    const val = Math.min(50, Math.max(1, parseInt(el.value) + delta));
    el.value = val;
    state.tamano = val;
    const lbl = document.getElementById('tamanioValor');
    if (lbl) lbl.textContent = val + 'px';
}

// ============================================================
//  HERRAMIENTAS
// ============================================================
function getCursorForHerramienta() {
    const cursors = {
        pincel: 'crosshair',
        borrador: 'cell',
        linea: 'crosshair',
        circulo: 'crosshair',
        relleno: 'copy',
        texto: 'text'
    };
    return cursors[state.herramienta] || 'crosshair';
}

function activarHerramienta(h) {
    state.herramienta = h;
    document.querySelectorAll('.af-btn-herramienta').forEach(btn => {
        btn.classList.toggle('activo', btn.dataset.herramienta === h);
    });
    wrapper.style.cursor = getCursorForHerramienta();
}

function activarPipeta() {
    state.pipetaActiva = true;
    const btn = document.getElementById('btnPipeta');
    if (btn) btn.classList.add('activo');
    wrapper.style.cursor = 'crosshair';
}

// ============================================================
//  SLIDERS
// ============================================================
function inicializarSliders() {
    document.getElementById('tamanioPincel')?.addEventListener('input', function() {
        state.tamano = parseInt(this.value);
        document.getElementById('tamanioValor').textContent = this.value + 'px';
    });
    document.getElementById('opacidadPincel')?.addEventListener('input', function() {
        state.opacidad = parseInt(this.value) / 100;
        document.getElementById('opacidadValor').textContent = this.value + '%';
    });
    document.getElementById('durezaPincel')?.addEventListener('input', function() {
        state.dureza = parseInt(this.value) / 100;
        document.getElementById('durezaValor').textContent = this.value + '%';
    });
    document.getElementById('estabilizador')?.addEventListener('input', function() {
        state.estabilizador = parseInt(this.value);
        document.getElementById('estabilizadorValor').textContent = this.value;
    });
    document.getElementById('selectorColor')?.addEventListener('input', function() {
        setColor(this.value);
    });
}

// ============================================================
//  GUARDAR SESIÓN (IndexedDB)
// ============================================================
async function guardarSesion() {
    try {
        await guardarDibujoLocal();
        toast('Sesión guardada', 'success');
    } catch (e) {
        console.warn('[Arte Flash] Guardar sesión falló:', e);
        toast('No se pudo guardar', 'error');
    }
}

async function cargarSesionEnCanvas(data) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(data.blob);
        const img = new Image();
        img.onload = () => {
            const capa = capaCtxActiva();
            capa.drawImage(img, 0, 0);
            flattenLayers();
            guardarHistoria();
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = (e) => {
            URL.revokeObjectURL(url);
            reject(e);
        };
        img.src = url;
    });
}

// ============================================================
//  GUARDAR / EXPORTAR
// ============================================================
async function guardarPNG() {
    try {
        const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `arte-flash_${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('PNG descargado', 'success');
    } catch (e) {
        console.warn('[Arte Flash] PNG falló:', e);
        toast('No se pudo descargar', 'error');
    }
}

async function guardarEnGaleria() {
    const mh = MH();
    if (!mh) { toast('Sin conexión al sistema', 'error'); return; }
    try {
        const blob = await new Promise(r => lienzo.toBlob(r, 'image/png'));
        const nombre = `Dibujo ${new Date().toLocaleDateString('es-CL')}.png`;
        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre: nombre,
            carpeta: 'c_general'
        });
        toast('Guardado en Galería', 'success');
    } catch (e) {
        console.warn('[Arte Flash] Guardar en Galería falló:', e);
        toast(e.message || 'No se pudo guardar', 'error');
    }
}

// ============================================================
//  REFERENCIAS
// ============================================================
async function anadirReferencia() {
    const mh = MH();
    if (!mh) { toast('Sin conexión', 'error'); return; }
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige una imagen de referencia'
        });
        if (!id) return;
        const meta = await mh.galeria.obtenerImagen(id);
        const url = await mh.galeria.leerImagenURL(id);
        if (!url) { toast('No se pudo cargar', 'error'); return; }
        referencias.push({
            id,
            url,
            nombre: meta?.nombre || 'Referencia'
        });
        renderReferencias();
        toast('Referencia añadida', 'success');
    } catch (e) {
        console.warn('[Arte Flash] Referencia falló:', e);
        toast('No se pudo añadir', 'error');
    }
}

function renderReferencias() {
    const lista = document.getElementById('referenciasLista');
    if (!lista) return;
    if (referencias.length === 0) {
        lista.innerHTML = '';
        return;
    }
    lista.innerHTML = referencias.map((ref, i) => `
        <div class="af-referencia-item">
            <img src="${ref.url}" alt="">
            <span class="af-referencia-info">${escapar(ref.nombre)}</span>
            <button class="af-referencia-remove" data-idx="${i}" title="Quitar">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons();
    lista.querySelectorAll('.af-referencia-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const ref = referencias[idx];
            if (ref) {
                try { URL.revokeObjectURL(ref.url); } catch (e) {}
                referencias.splice(idx, 1);
                renderReferencias();
            }
        });
    });
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
//  MINIMAPA
// ============================================================
function actualizarMinimapa() {
    const minimapa = document.getElementById('minimapa');
    const vista = document.getElementById('minimapaVista');
    if (!minimapa || !vista) return;
    const mW = minimapa.offsetWidth;
    const mH = minimapa.offsetHeight;
    if (mW === 0 || mH === 0) return;
    const escala = Math.min(mW / lienzo.width, mH / lienzo.height);
    const vW = (wrapper.clientWidth / state.zoom) * escala;
    const vH = (wrapper.clientHeight / state.zoom) * escala;
    const vX = (-state.panX / state.zoom) * escala;
    const vY = (-state.panY / state.zoom) * escala;
    vista.style.left = Math.max(0, vX) + 'px';
    vista.style.top = Math.max(0, vY) + 'px';
    vista.style.width = Math.min(vW, mW) + 'px';
    vista.style.height = Math.min(vH, mH) + 'px';
}

// ============================================================
//  LIMPIAR
// ============================================================
function limpiarLienzo() {
    if (!confirm('¿Limpiar todo el lienzo? Se perderá el dibujo actual.')) return;
    state.capas.forEach(c => c.ctx.clearRect(0, 0, lienzo.width, lienzo.height));
    flattenLayers();
    guardarHistoria();
}

// ============================================================
//  MODAL SESIÓN GUARDADA
// ============================================================
async function preguntarContinuarSesion(data) {
    const modal = document.getElementById('modalSesion');
    const fecha = document.getElementById('modalSesionFecha');
    if (!modal) return 'nueva';
    if (fecha) {
        const d = new Date(data.fecha);
        fecha.textContent = 'Guardado el ' + d.toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    return new Promise(resolve => {
        const cerrar = (modo) => {
            modal.hidden = true;
            resolve(modo);
        };
        document.getElementById('btnContinuarSesion').onclick = () => cerrar('continuar');
        document.getElementById('btnNuevaSesion').onclick = () => cerrar('nueva');
        document.getElementById('btnDescartarSesion').onclick = () => cerrar('descartar');
    });
}

// ============================================================
//  UI MÓVIL — barra inferior + panel flotante
// ============================================================
function inicializarUIMovil() {
    const app = document.getElementById('afApp');
    const panel = document.getElementById('afPanel');
    const panelTitulo = document.getElementById('afPanelTitulo');
    const toolbar = document.getElementById('afToolbar');

    if (!panel || !toolbar) return;

    const titulos = {
        color:        { icono: 'palette',              texto: 'Color' },
        herramientas: { icono: 'brush',                texto: 'Herramientas' },
        ajustes:      { icono: 'sliders-horizontal',   texto: 'Ajustes' },
        capas:        { icono: 'layers',               texto: 'Capas' },
        referencias:  { icono: 'image',                texto: 'Referencias' }
    };

    function abrirPanel(tab) {
        panel.querySelectorAll('.af-panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        panel.querySelectorAll('.af-seccion').forEach(s => {
            s.classList.toggle('activa', s.dataset.seccion === tab);
        });
        const info = titulos[tab] || titulos.color;
        if (panelTitulo) {
            panelTitulo.innerHTML = `<i data-lucide="${info.icono}"></i><span>${info.texto}</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
        panel.classList.add('abierto');
    }

    function cerrarPanel() {
        panel.classList.remove('abierto');
    }

    panel.querySelectorAll('.af-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => abrirPanel(tab.dataset.tab));
    });

    document.getElementById('afPanelCerrar')?.addEventListener('click', cerrarPanel);

    panel.addEventListener('click', (e) => {
        if (e.target === panel) cerrarPanel();
    });

    toolbar.querySelectorAll('.af-tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const accion = btn.dataset.accion;

            if (accion === 'pincel' || accion === 'borrador') {
                toolbar.querySelectorAll('.af-tool-btn').forEach(b => b.classList.remove('activo'));
                btn.classList.add('activo');
                activarHerramienta(accion);
                return;
            }
            if (accion === 'deshacer') { deshacer(); return; }
            if (accion === 'formas') { abrirPanel('herramientas'); return; }
            if (accion === 'color' || accion === 'capas' || accion === 'ajustes') {
                abrirPanel(accion);
                return;
            }
        });
    });

    toolbar.querySelector('.af-tool-btn[data-accion="pincel"]')?.classList.add('activo');
    panel.querySelector('.af-panel-tab[data-tab="color"]')?.classList.add('active');
    panel.querySelector('.af-seccion[data-seccion="color"]')?.classList.add('activa');
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Arte Flash necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitas iniciar sesión para usar Arte Flash.'); return; }

    const badge = document.getElementById('afUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    setupCanvas();
    inicializarPaleta();
    inicializarCapas();
    inicializarSliders();
    activarHerramienta('pincel');
    setColor('#ffa5d5');
    guardarHistoria();

    inicializarUIMovil();

    dibujoGuardado = await cargarDibujoGuardado();
    if (dibujoGuardado && dibujoGuardado.blob) {
        const decision = await preguntarContinuarSesion(dibujoGuardado);
        if (decision === 'continuar') {
            try {
                await cargarSesionEnCanvas(dibujoGuardado);
                toast('Sesión restaurada', 'success');
            } catch (e) {
                console.warn('[Arte Flash] No se pudo restaurar:', e);
                toast('No se pudo restaurar', 'error');
            }
        } else if (decision === 'descartar') {
            await borrarDibujoLocal();
            dibujoGuardado = null;
        }
    }

    document.getElementById('btnDeshacer')?.addEventListener('click', deshacer);
    document.getElementById('btnRehacer')?.addEventListener('click', rehacer);
    document.getElementById('btnLimpiar')?.addEventListener('click', limpiarLienzo);
    document.getElementById('btnGuardarPNG')?.addEventListener('click', guardarPNG);
    document.getElementById('btnGuardarGaleria')?.addEventListener('click', guardarEnGaleria);
    document.getElementById('btnGuardarSesion')?.addEventListener('click', guardarSesion);

    document.querySelectorAll('.af-btn-herramienta').forEach(btn => {
        btn.addEventListener('click', () => activarHerramienta(btn.dataset.herramienta));
    });
    document.getElementById('btnPipeta')?.addEventListener('click', activarPipeta);

    document.getElementById('btnCapaNueva')?.addEventListener('click', () => agregarCapa());
    document.getElementById('btnCapaArriba')?.addEventListener('click', () => {
        const i = state.capaActiva;
        if (i >= state.capas.length - 1) return;
        [state.capas[i], state.capas[i+1]] = [state.capas[i+1], state.capas[i]];
        state.capaActiva = i + 1;
        flattenLayers(); renderCapas(); guardarHistoria();
    });
    document.getElementById('btnCapaAbajo')?.addEventListener('click', () => {
        const i = state.capaActiva;
        if (i <= 0) return;
        [state.capas[i], state.capas[i-1]] = [state.capas[i-1], state.capas[i]];
        state.capaActiva = i - 1;
        flattenLayers(); renderCapas(); guardarHistoria();
    });
    document.getElementById('btnCapaEliminar')?.addEventListener('click', () => {
        if (state.capas.length <= 1) { toast('Debe haber al menos 1 capa', 'error'); return; }
        state.capas.splice(state.capaActiva, 1);
        state.capaActiva = Math.min(state.capaActiva, state.capas.length - 1);
        flattenLayers(); renderCapas(); guardarHistoria();
    });

    document.getElementById('zoomIn')?.addEventListener('click', () => { const c = wrapperCenter(); zoomAt(c.x, c.y, 1.25); });
    document.getElementById('zoomOut')?.addEventListener('click', () => { const c = wrapperCenter(); zoomAt(c.x, c.y, 0.8); });
    document.getElementById('zoomFit')?.addEventListener('click', fitCanvasToWrapper);
    document.getElementById('zoomReset')?.addEventListener('click', () => {
        state.zoom = 1;
        state.panX = (wrapper.clientWidth - lienzo.width) / 2;
        state.panY = (wrapper.clientHeight - lienzo.height) / 2;
        applyTransform();
    });

    document.getElementById('btnAgregarTexto')?.addEventListener('click', agregarTexto);
    document.getElementById('modalTextoCerrar')?.addEventListener('click', cerrarModalTexto);
    document.getElementById('btnCancelarTexto')?.addEventListener('click', cerrarModalTexto);
    document.getElementById('inputTexto')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') agregarTexto();
        if (e.key === 'Escape') cerrarModalTexto();
    });

    document.getElementById('btnAnadirReferencia')?.addEventListener('click', anadirReferencia);

    window.addEventListener('resize', () => {
        fitCanvasToWrapper();
        actualizarMinimapa();
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    referencias.forEach(r => {
        try { URL.revokeObjectURL(r.url); } catch (e) {}
    });
});
