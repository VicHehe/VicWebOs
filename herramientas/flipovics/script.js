// ============================================================
//  FlipoVics — Animación cuadro a cuadro
//  ------------------------------------------------------------
//  · Canvas fijo 320×240 (aspecto 4:3, resolución clásica de
//    consola portátil)
//  · Cada frame es un canvas offscreen con transparencia
//  · Onion skin: dibuja N frames previos al 25% de opacidad
//  · Motor de dibujo pixel-perfect (Bresenham + fillRect)
//  · Undo/redo por frame (30 snapshots de ImageData)
//  · Reproducción en loop con timing preciso
//  · Export: GIF (gif.js), WebM (MediaRecorder), PNG, Galería
//  · Persistencia: IndexedDB (Uint8ClampedArray crudo)
// ============================================================

'use strict';

// ============================================================
//  CONSTANTES
// ============================================================
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsFlipoVics';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';
const HINT_KEY = 'fv_hint_visto';

const ANCHO = 320;
const ALTO = 240;
const MAX_UNDO = 30;
const DEFAULT_FPS = 8;

// Paleta genérica (sin referencias a marcas)
const PALETA_DEFAULT = [
    '#000000', '#FFFFFF',
    '#FF0000', '#FF9900', '#FFE600',
    '#00CC00', '#00CCCC', '#0066FF',
    '#6633CC', '#FF33CC', '#993300',
    '#666666', '#CCCCCC', '#333333'
];

// ============================================================
//  API
// ============================================================
const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  ESTADO
// ============================================================
const state = {
    frames: [],
    frameActivo: 0,
    fps: DEFAULT_FPS,
    playing: false,
    playTimer: null,
    playFrameIdx: 0,
    onionActiva: true,
    onionCount: 1,
    mostrarGrid: false,
    herramienta: 'lapiz',
    color: '#000000',
    tamano: 1,
    undoStack: [],
    redoStack: [],
    dibujando: false,
    formaStart: null,
    formaSnapshot: null,
    coloresRecientes: []
};

let usuarioActual = null;
let visibleCanvas = null;
let visibleCtx = null;
let toastTimeout = null;
let mediaRecorder = null;
let mediaRecorderChunks = [];
let mediaRecorderStream = null;

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
            '--shadow-glow',
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
    const el = document.getElementById('fvToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'fv-toast show ' + tipo;
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
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const r = tx.objectStore(IDB_STORE).get(key);
            r.onsuccess = () => res(r.result);
            r.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

async function idbDelete(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => res();
            tx.onerror = (e) => rej(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveProyecto() {
    return 'fv_' + (usuarioActual?.codigo || 'invitado');
}

// ============================================================
//  HELPERS
// ============================================================
function formatearDuracion(seg) {
    if (seg < 1) return `${(seg * 1000).toFixed(0)} ms`;
    if (seg < 60) return `${seg.toFixed(1)} s`;
    const m = Math.floor(seg / 60);
    const s = Math.round(seg % 60);
    return `${m}m ${s}s`;
}

// ============================================================
//  FRAME MANAGEMENT
// ============================================================
function crearCanvasFrame() {
    const c = document.createElement('canvas');
    c.width = ANCHO;
    c.height = ALTO;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    return { canvas: c, ctx };
}

function crearFrameNuevo() {
    return crearCanvasFrame();
}

function agregarFrame() {
    detenerReproduccion();
    const frame = crearFrameNuevo();
    state.frames.splice(state.frameActivo + 1, 0, frame);
    state.frameActivo++;
    state.undoStack = [];
    state.redoStack = [];
    renderizarTodo();
    toast(`Frame ${state.frameActivo + 1} creado`, 'success');
}

function duplicarFrame() {
    detenerReproduccion();
    const actual = state.frames[state.frameActivo];
    const copia = crearCanvasFrame();
    copia.ctx.drawImage(actual.canvas, 0, 0);
    state.frames.splice(state.frameActivo + 1, 0, copia);
    state.frameActivo++;
    state.undoStack = [];
    state.redoStack = [];
    renderizarTodo();
    toast('Frame duplicado', 'success');
}

function eliminarFrame() {
    if (state.frames.length <= 1) {
        toast('Debe haber al menos 1 frame', 'error');
        return;
    }
    if (!confirm(`¿Eliminar el frame ${state.frameActivo + 1}?`)) return;
    detenerReproduccion();
    state.frames.splice(state.frameActivo, 1);
    state.frameActivo = Math.max(0, state.frameActivo - 1);
    state.undoStack = [];
    state.redoStack = [];
    renderizarTodo();
    toast('Frame eliminado', 'success');
}

function limpiarFrame() {
    const ctx = state.frames[state.frameActivo].ctx;
    ctx.clearRect(0, 0, ANCHO, ALTO);
    guardarSnapshot();
    renderizarTodo();
    toast('Frame limpiado', 'info');
}

function irAFrame(idx) {
    if (idx < 0 || idx >= state.frames.length) return;
    if (idx === state.frameActivo) return;
    state.frameActivo = idx;
    state.undoStack = [];
    state.redoStack = [];
    redibujarCanvas();
    actualizarInfoFrame();
    actualizarStripSeleccion();
    actualizarBotonesUndoRedo();
}

function irAPrimerFrame() { irAFrame(0); }
function irAUltimoFrame() { irAFrame(state.frames.length - 1); }
function irAFrameAnterior() { irAFrame(state.frameActivo - 1); }
function irAFrameSiguiente() { irAFrame(state.frameActivo + 1); }

// ============================================================
//  RENDERIZADO DEL CANVAS VISIBLE
// ============================================================
function redibujarCanvas() {
    if (!visibleCtx) return;

    // 1. Fondo blanco (papel)
    visibleCtx.fillStyle = '#FFFFFF';
    visibleCtx.fillRect(0, 0, ANCHO, ALTO);

    // 2. Onion skin (frames anteriores)
    if (state.onionActiva && !state.playing) {
        const n = state.onionCount;
        for (let i = n; i >= 1; i--) {
            const idx = state.frameActivo - i;
            if (idx < 0) continue;
            const opacity = 0.25 * (1 - (i - 1) * 0.3);
            visibleCtx.globalAlpha = Math.max(0.08, opacity);
            visibleCtx.drawImage(state.frames[idx].canvas, 0, 0);
        }
        visibleCtx.globalAlpha = 1;
    }

    // 3. Frame actual
    visibleCtx.drawImage(state.frames[state.frameActivo].canvas, 0, 0);

    // 4. Cuadrícula
    if (state.mostrarGrid) {
        visibleCtx.strokeStyle = 'rgba(0,0,0,0.08)';
        visibleCtx.lineWidth = 1;
        const paso = 16;
        for (let x = 0; x <= ANCHO; x += paso) {
            visibleCtx.beginPath();
            visibleCtx.moveTo(x + 0.5, 0);
            visibleCtx.lineTo(x + 0.5, ALTO);
            visibleCtx.stroke();
        }
        for (let y = 0; y <= ALTO; y += paso) {
            visibleCtx.beginPath();
            visibleCtx.moveTo(0, y + 0.5);
            visibleCtx.lineTo(ANCHO, y + 0.5);
            visibleCtx.stroke();
        }
    }
}

function mostrarFrameEnPlayback(idx) {
    if (!visibleCtx) return;
    visibleCtx.fillStyle = '#FFFFFF';
    visibleCtx.fillRect(0, 0, ANCHO, ALTO);
    visibleCtx.drawImage(state.frames[idx].canvas, 0, 0);
}

// ============================================================
//  MOTOR DE DIBUJO — pixel-perfect
// ============================================================
function pintarPixel(ctx, x, y, color, tamano, esBorrador) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < -tamano || y < -tamano || x > ANCHO + tamano || y > ALTO + tamano) return;

    if (esBorrador) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
    }

    const half = Math.floor(tamano / 2);
    const startX = x - half;
    const startY = y - half;
    ctx.fillRect(startX, startY, tamano, tamano);
}

function lineaBresenham(ctx, x0, y0, x1, y1, color, tamano, esBorrador) {
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    x1 = Math.floor(x1); y1 = Math.floor(y1);

    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
        pintarPixel(ctx, x0, y0, color, tamano, esBorrador);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
}

function dibujarRect(ctx, x0, y0, x1, y1, color, tamano, esBorrador, relleno) {
    const xmin = Math.min(x0, x1);
    const xmax = Math.max(x0, x1);
    const ymin = Math.min(y0, y1);
    const ymax = Math.max(y0, y1);

    if (relleno) {
        for (let y = ymin; y <= ymax; y++) {
            for (let x = xmin; x <= xmax; x++) {
                pintarPixel(ctx, x, y, color, tamano, esBorrador);
            }
        }
    } else {
        lineaBresenham(ctx, xmin, ymin, xmax, ymin, color, tamano, esBorrador);
        lineaBresenham(ctx, xmax, ymin, xmax, ymax, color, tamano, esBorrador);
        lineaBresenham(ctx, xmax, ymax, xmin, ymax, color, tamano, esBorrador);
        lineaBresenham(ctx, xmin, ymax, xmin, ymin, color, tamano, esBorrador);
    }
}

function dibujarElipse(ctx, x0, y0, x1, y1, color, tamano, esBorrador, relleno) {
    const xmin = Math.min(x0, x1);
    const xmax = Math.max(x0, x1);
    const ymin = Math.min(y0, y1);
    const ymax = Math.max(y0, y1);

    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    const rx = Math.max(0.5, (xmax - xmin) / 2);
    const ry = Math.max(0.5, (ymax - ymin) / 2);

    for (let y = ymin; y <= ymax; y++) {
        for (let x = xmin; x <= xmax; x++) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            const d = dx * dx + dy * dy;
            if (relleno) {
                if (d <= 1.0) pintarPixel(ctx, x, y, color, tamano, esBorrador);
            } else {
                if (d <= 1.05 && d >= 0.55) pintarPixel(ctx, x, y, color, tamano, esBorrador);
            }
        }
    }
}

// ============================================================
//  RELLENO (flood fill por píxeles)
// ============================================================
function floodFill(x0, y0, colorHex) {
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    if (x0 < 0 || y0 < 0 || x0 >= ANCHO || y0 >= ALTO) return;

    const frame = state.frames[state.frameActivo];
    const ctx = frame.ctx;
    const imgData = ctx.getImageData(0, 0, ANCHO, ALTO);
    const data = imgData.data;

    const idx0 = (y0 * ANCHO + x0) * 4;
    const r0 = data[idx0];
    const g0 = data[idx0 + 1];
    const b0 = data[idx0 + 2];
    const a0 = data[idx0 + 3];

    const h = colorHex.replace('#', '');
    const rn = parseInt(h.slice(0, 2), 16);
    const gn = parseInt(h.slice(2, 4), 16);
    const bn = parseInt(h.slice(4, 6), 16);
    const an = 255;

    if (r0 === rn && g0 === gn && b0 === bn && a0 === an) return;

    const tol = 20;

    const coincide = (i) => {
        return Math.abs(data[i] - r0) < tol &&
               Math.abs(data[i + 1] - g0) < tol &&
               Math.abs(data[i + 2] - b0) < tol &&
               Math.abs(data[i + 3] - a0) < tol;
    };

    const visited = new Uint8Array(ANCHO * ALTO);
    const stack = [[x0, y0]];

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= ANCHO || y < 0 || y >= ALTO) continue;
        const ci = y * ANCHO + x;
        if (visited[ci]) continue;
        visited[ci] = 1;
        const di = ci * 4;
        if (!coincide(di)) continue;

        data[di] = rn;
        data[di + 1] = gn;
        data[di + 2] = bn;
        data[di + 3] = an;

        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    ctx.putImageData(imgData, 0, 0);
}

// ============================================================
//  PIPETA
// ============================================================
function pipeta(x, y) {
    const frame = state.frames[state.frameActivo];
    const ctx = frame.ctx;
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= ANCHO || y >= ALTO) return;
    const d = ctx.getImageData(x, y, 1, 1).data;
    if (d[3] === 0) {
        setColor('#FFFFFF');
        toast('Color: blanco (fondo)', 'info');
        return;
    }
    const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    setColor(hex);
    toast('Color copiado', 'info');
}

// ============================================================
//  UNDO / REDO
// ============================================================
function guardarSnapshot() {
    const frame = state.frames[state.frameActivo];
    const ctx = frame.ctx;
    const imgData = ctx.getImageData(0, 0, ANCHO, ALTO);
    state.undoStack.push(imgData);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    actualizarBotonesUndoRedo();
}

function deshacer() {
    if (state.undoStack.length === 0) return;
    const frame = state.frames[state.frameActivo];
    const actual = frame.ctx.getImageData(0, 0, ANCHO, ALTO);
    state.redoStack.push(actual);
    const prev = state.undoStack.pop();
    frame.ctx.putImageData(prev, 0, 0);
    redibujarCanvas();
    renderizarThumbnailFrame(state.frameActivo);
    actualizarBotonesUndoRedo();
}

function rehacer() {
    if (state.redoStack.length === 0) return;
    const frame = state.frames[state.frameActivo];
    const actual = frame.ctx.getImageData(0, 0, ANCHO, ALTO);
    state.undoStack.push(actual);
    const next = state.redoStack.pop();
    frame.ctx.putImageData(next, 0, 0);
    redibujarCanvas();
    renderizarThumbnailFrame(state.frameActivo);
    actualizarBotonesUndoRedo();
}

function actualizarBotonesUndoRedo() {
    const d = document.getElementById('btnDeshacerMobile');
    const r = document.getElementById('btnRehacerMobile');
    if (d) d.disabled = state.undoStack.length === 0;
    if (r) r.disabled = state.redoStack.length === 0;
}

// ============================================================
//  POINTER EVENTS EN EL CANVAS
// ============================================================
let ultimoPunto = null;
let snapshotFormaPrevia = null;

function coordsCanvas(clientX, clientY) {
    const rect = visibleCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (ANCHO / rect.width);
    const y = (clientY - rect.top) * (ALTO / rect.height);
    return { x, y };
}

function onPointerDown(e) {
    if (state.playing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    try { visibleCanvas.setPointerCapture(e.pointerId); } catch (_) {}

    const { x, y } = coordsCanvas(e.clientX, e.clientY);

    if (state.herramienta === 'pipeta') {
        pipeta(x, y);
        return;
    }

    if (state.herramienta === 'relleno') {
        guardarSnapshot();
        floodFill(x, y, state.color);
        redibujarCanvas();
        renderizarThumbnailFrame(state.frameActivo);
        return;
    }

    if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
        guardarSnapshot();
        state.formaStart = { x, y };
        const frame = state.frames[state.frameActivo];
        snapshotFormaPrevia = frame.ctx.getImageData(0, 0, ANCHO, ALTO);
        state.dibujando = true;
        return;
    }

    guardarSnapshot();
    state.dibujando = true;
    ultimoPunto = { x, y };

    const esBorrador = state.herramienta === 'borrador';
    const ctx = state.frames[state.frameActivo].ctx;
    pintarPixel(ctx, x, y, state.color, state.tamano, esBorrador);

    redibujarCanvas();
    renderizarThumbnailFrame(state.frameActivo);
}

function onPointerMove(e) {
    if (state.playing || !state.dibujando) return;
    e.preventDefault();

    const { x, y } = coordsCanvas(e.clientX, e.clientY);
    const ctx = state.frames[state.frameActivo].ctx;
    const esBorrador = state.herramienta === 'borrador';

    if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
        if (snapshotFormaPrevia) {
            ctx.putImageData(snapshotFormaPrevia, 0, 0);
        }
        const s = state.formaStart;
        if (state.herramienta === 'linea') {
            lineaBresenham(ctx, s.x, s.y, x, y, state.color, state.tamano, false);
        } else if (state.herramienta === 'rect') {
            dibujarRect(ctx, s.x, s.y, x, y, state.color, state.tamano, false, false);
        } else if (state.herramienta === 'elipse') {
            dibujarElipse(ctx, s.x, s.y, x, y, state.color, state.tamano, false, false);
        }
        redibujarCanvas();
        return;
    }

    if (ultimoPunto) {
        let eventos = [e];
        if (e.getCoalescedEvents) {
            const c = e.getCoalescedEvents();
            if (c.length > 0) eventos = c;
        }

        eventos.forEach(ev => {
            const p = coordsCanvas(ev.clientX, ev.clientY);
            lineaBresenham(ctx, ultimoPunto.x, ultimoPunto.y, p.x, p.y, state.color, state.tamano, esBorrador);
            ultimoPunto = p;
        });
    } else {
        lineaBresenham(ctx, x, y, x, y, state.color, state.tamano, esBorrador);
        ultimoPunto = { x, y };
    }

    redibujarCanvas();
    renderizarThumbnailFrame(state.frameActivo);
}

function onPointerUp(e) {
    if (!state.dibujando) return;
    state.dibujando = false;
    ultimoPunto = null;

    if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
        state.formaStart = null;
        snapshotFormaPrevia = null;
    }

    redibujarCanvas();
    renderizarThumbnailFrame(state.frameActivo);
    actualizarBotonesUndoRedo();
}

// ============================================================
//  PLAYBACK
// ============================================================
function reproducir() {
    if (state.playing) return;
    if (state.frames.length < 2) {
        toast('Necesitás al menos 2 frames para reproducir', 'info');
        return;
    }

    state.playing = true;
    state.playFrameIdx = 0;
    actualizarBotonPlay();
    marcarPlayback(true);

    const tick = () => {
        if (!state.playing) return;
        mostrarFrameEnPlayback(state.playFrameIdx);
        actualizarInfoReproduccion();
        state.playFrameIdx = (state.playFrameIdx + 1) % state.frames.length;
        state.playTimer = setTimeout(tick, 1000 / state.fps);
    };

    tick();
}

function detenerReproduccion() {
    state.playing = false;
    if (state.playTimer) {
        clearTimeout(state.playTimer);
        state.playTimer = null;
    }
    actualizarBotonPlay();
    marcarPlayback(false);
    redibujarCanvas();
    actualizarInfoFrame();
    actualizarStripSeleccion();
}

function togglePlay() {
    if (state.playing) detenerReproduccion();
    else reproducir();
}

function actualizarBotonPlay() {
    const btn = document.getElementById('btnPlay');
    if (!btn) return;
    if (state.playing) {
        btn.innerHTML = '<i data-lucide="pause"></i>';
        btn.title = 'Pausar';
    } else {
        btn.innerHTML = '<i data-lucide="play"></i>';
        btn.title = 'Reproducir';
    }
    if (window.lucide) window.lucide.createIcons();
}

// Cambia el texto de la barra de info según esté reproduciendo o no.
// NO se superpone sobre el canvas. Es solo una etiqueta en la barra inferior.
function marcarPlayback(activo) {
    const info = document.getElementById('fvPlaybackInfo');
    if (info) info.classList.toggle('reproduciendo', activo);
}

function actualizarInfoReproduccion() {
    const frameEl = document.getElementById('fvPlaybackFrame');
    const fpsEl = document.getElementById('fvPlaybackFps');
    const info = document.getElementById('fvPlaybackInfo');
    if (!frameEl) return;

    if (state.playing) {
        // Mostrar "▶ Reproduciendo" en vez del número de frame
        if (info && !info.querySelector('.fv-playback-play-icon')) {
            // Insertamos un puntito pulsante ANTES del texto
            const dot = document.createElement('span');
            dot.className = 'fv-playback-play-icon';
            info.insertBefore(dot, info.firstChild);
        }
        frameEl.textContent = `Reproduciendo · Frame ${state.playFrameIdx + 1} / ${state.frames.length}`;
        if (fpsEl) fpsEl.textContent = `${state.fps} FPS`;
    } else {
        const dot = info?.querySelector('.fv-playback-play-icon');
        if (dot) dot.remove();
        frameEl.textContent = `Frame ${state.frameActivo + 1} / ${state.frames.length}`;
        if (fpsEl) fpsEl.textContent = `${state.fps} FPS`;
    }
}

// ============================================================
//  FRAME STRIP (thumbnails)
// ============================================================
function renderizarStrip() {
    const strip = document.getElementById('fvFramesStrip');
    if (!strip) return;
    strip.innerHTML = '';

    state.frames.forEach((frame, i) => {
        const item = document.createElement('div');
        item.className = 'fv-frame-item' + (i === state.frameActivo ? ' activo' : '');
        item.dataset.idx = i;

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = ANCHO;
        thumbCanvas.height = ALTO;
        thumbCanvas.className = 'fv-frame-thumb';

        item.appendChild(thumbCanvas);

        const num = document.createElement('span');
        num.className = 'fv-frame-numero';
        num.textContent = i + 1;
        item.appendChild(num);

        item.addEventListener('click', () => irAFrame(i));
        strip.appendChild(item);

        renderizarThumbnailEnCanvas(thumbCanvas, frame);
    });

    if (window.lucide) window.lucide.createIcons();
}

function renderizarThumbnailFrame(idx) {
    const items = document.querySelectorAll('.fv-frame-item');
    const item = items[idx];
    if (!item) return;
    const thumbCanvas = item.querySelector('.fv-frame-thumb');
    if (!thumbCanvas) return;
    renderizarThumbnailEnCanvas(thumbCanvas, state.frames[idx]);
}

function renderizarThumbnailEnCanvas(canvas, frame) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frame.canvas, 0, 0);
}

function actualizarStripSeleccion() {
    const items = document.querySelectorAll('.fv-frame-item');
    items.forEach((item, i) => {
        item.classList.toggle('activo', i === state.frameActivo);
    });
    const actual = items[state.frameActivo];
    if (actual) {
        actual.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// ============================================================
//  ACTUALIZAR INFO
// ============================================================
function actualizarInfoFrame() {
    const badge = document.getElementById('fvFrameBadge');
    if (badge) badge.textContent = `${state.frameActivo + 1} / ${state.frames.length}`;

    const elPlayback = document.getElementById('fvPlaybackFrame');
    if (elPlayback && !state.playing) {
        elPlayback.textContent = `Frame ${state.frameActivo + 1} / ${state.frames.length}`;
    }

    const infoFrames = document.getElementById('infoFrames');
    const infoDuracion = document.getElementById('infoDuracion');
    if (infoFrames) infoFrames.textContent = state.frames.length;
    if (infoDuracion) infoDuracion.textContent = formatearDuracion(state.frames.length / state.fps);

    const elFps = document.getElementById('fvPlaybackFps');
    if (elFps) elFps.textContent = `${state.fps} FPS`;
}

function actualizarOnionBadge() {
    const badge = document.getElementById('fvOnionBadge');
    const txt = document.getElementById('fvOnionBadgeTxt');
    if (!badge || !txt) return;
    if (state.onionActiva && state.onionCount > 0 && !state.playing) {
        badge.hidden = false;
        txt.textContent = `Onion ×${state.onionCount}`;
    } else {
        badge.hidden = true;
    }
}

// ============================================================
//  COLOR
// ============================================================
function setColor(hex) {
    state.color = hex.toUpperCase();
    const picker = document.getElementById('colorPicker');
    const hexEl = document.getElementById('colorHex');
    if (picker) picker.value = state.color;
    if (hexEl) hexEl.textContent = state.color;

    document.querySelectorAll('.fv-paleta-grid .fv-color-btn').forEach(b => {
        b.classList.toggle('seleccionado', b.dataset.color === state.color);
    });

    agregarColorReciente(state.color);
}

function agregarColorReciente(c) {
    state.coloresRecientes = [c, ...state.coloresRecientes.filter(x => x !== c)].slice(0, 8);
    renderizarRecientes();
}

function renderizarRecientes() {
    const cont = document.getElementById('fvRecientes');
    if (!cont) return;
    cont.innerHTML = '';
    state.coloresRecientes.forEach(c => {
        const b = document.createElement('button');
        b.className = 'fv-color-btn';
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => setColor(c));
        cont.appendChild(b);
    });
}

function renderizarPaleta() {
    const grid = document.getElementById('paletaGrid');
    if (!grid) return;
    grid.innerHTML = '';
    PALETA_DEFAULT.forEach(c => {
        const b = document.createElement('button');
        b.className = 'fv-color-btn';
        b.type = 'button';
        b.style.background = c;
        b.dataset.color = c.toUpperCase();
        b.title = c;
        if (c.toUpperCase() === state.color) b.classList.add('seleccionado');
        b.addEventListener('click', () => setColor(c));
        grid.appendChild(b);
    });
}

// ============================================================
//  HERRAMIENTAS
// ============================================================
function activarHerramienta(t) {
    state.herramienta = t;
    document.querySelectorAll('.fv-tool-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tool === t);
    });
    document.querySelectorAll('.fv-tool-nav').forEach(b => {
        if (['lapiz','borrador','relleno'].includes(b.dataset.accion)) {
            b.classList.toggle('activo', b.dataset.accion === t);
        }
    });
}

function setTamano(t) {
    state.tamano = t;
    document.querySelectorAll('.fv-size-btn[data-size]').forEach(b => {
        b.classList.toggle('activo', parseInt(b.dataset.size, 10) === t);
    });
}

function setOnionCount(n) {
    state.onionCount = n;
    document.querySelectorAll('.fv-size-btn[data-onion]').forEach(b => {
        b.classList.toggle('activo', parseInt(b.dataset.onion, 10) === n);
    });
    redibujarCanvas();
    actualizarOnionBadge();
}

function toggleOnion() {
    state.onionActiva = !state.onionActiva;
    const chk = document.getElementById('toggleOnion');
    if (chk) chk.checked = state.onionActiva;
    const btn = document.getElementById('btnToggleOnion');
    if (btn) btn.classList.toggle('activo', state.onionActiva);
    redibujarCanvas();
    actualizarOnionBadge();
}

// ============================================================
//  GUARDAR / CARGAR PROYECTO
// ============================================================
async function guardarProyectoHandler() {
    try {
        const framesData = state.frames.map(f => {
            const img = f.ctx.getImageData(0, 0, ANCHO, ALTO);
            return img.data;
        });

        await idbSet(claveProyecto(), {
            version: 1,
            ancho: ANCHO,
            alto: ALTO,
            frames: framesData,
            fps: state.fps,
            frameActivo: state.frameActivo,
            fecha: new Date().toISOString()
        });

        toast('Proyecto guardado', 'success');
    } catch (e) {
        console.warn('[FlipoVics] Guardar falló:', e);
        toast('No se pudo guardar', 'error');
    }
}

async function cargarProyectoLocal() {
    return await idbGet(claveProyecto());
}

async function borrarProyectoLocal() {
    await idbDelete(claveProyecto());
}

function cargarProyectoDesdeData(data) {
    state.frames = [];
    for (const pixeles of data.frames) {
        const f = crearCanvasFrame();
        const imgData = new ImageData(new Uint8ClampedArray(pixeles), ANCHO, ALTO);
        f.ctx.putImageData(imgData, 0, 0);
        state.frames.push(f);
    }
    if (state.frames.length === 0) state.frames.push(crearFrameNuevo());

    state.fps = data.fps || DEFAULT_FPS;
    state.frameActivo = Math.min(data.frameActivo || 0, state.frames.length - 1);

    const slider = document.getElementById('fpsSlider');
    const val = document.getElementById('fpsValor');
    if (slider) slider.value = state.fps;
    if (val) val.textContent = state.fps;

    state.undoStack = [];
    state.redoStack = [];
}

// ============================================================
//  EXPORT
// ============================================================
async function exportarGIF() {
    if (typeof GIF === 'undefined') {
        toast('No se pudo cargar el codificador GIF', 'error');
        return;
    }

    mostrarModalExportando('Generando GIF...', 'Preparando frames');
    await new Promise(r => setTimeout(r, 80));

    try {
        let workerUrl = 'https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js';
        try {
            const res = await fetch(workerUrl);
            if (res.ok) {
                const code = await res.text();
                const blob = new Blob([code], { type: 'application/javascript' });
                workerUrl = URL.createObjectURL(blob);
            }
        } catch (e) { /* usa el URL remoto */ }

        const gif = new GIF({
            workers: 2,
            quality: 10,
            width: ANCHO,
            height: ALTO,
            workerScript: workerUrl
        });

        const delay = Math.round(1000 / state.fps);

        for (let i = 0; i < state.frames.length; i++) {
            const tmp = document.createElement('canvas');
            tmp.width = ANCHO;
            tmp.height = ALTO;
            const tctx = tmp.getContext('2d');
            tctx.fillStyle = '#FFFFFF';
            tctx.fillRect(0, 0, ANCHO, ALTO);
            tctx.drawImage(state.frames[i].canvas, 0, 0);
            gif.addFrame(tctx, { delay, copy: true });

            const pct = Math.round(((i + 1) / state.frames.length) * 30);
            actualizarModalExportando(`Preparando frame ${i + 1}/${state.frames.length}`, pct);
        }

        gif.on('progress', (p) => {
            actualizarModalExportando('Codificando GIF...', 30 + Math.round(p * 70));
        });

        gif.on('finished', (blob) => {
            cerrarModalExportando();
            descargarBlob(blob, `flipovics_${Date.now()}.gif`);
            toast('GIF descargado', 'success');
            document.getElementById('modalExportar').hidden = true;
        });

        gif.render();
    } catch (e) {
        console.warn('[FlipoVics] GIF falló:', e);
        cerrarModalExportando();
        toast('No se pudo generar el GIF', 'error');
    }
}

async function exportarWebM() {
    if (!window.MediaRecorder) {
        toast('Tu navegador no soporta WebM', 'error');
        return;
    }
    if (state.frames.length < 2) {
        toast('Necesitás al menos 2 frames', 'info');
        return;
    }

    mostrarModalExportando('Grabando WebM...', 'Capturando frames');
    await new Promise(r => setTimeout(r, 80));

    try {
        const recCanvas = document.createElement('canvas');
        recCanvas.width = ANCHO;
        recCanvas.height = ALTO;
        const recCtx = recCanvas.getContext('2d');

        const stream = recCanvas.captureStream(state.fps);

        let mimeType = '';
        const candidatos = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
        for (const c of candidatos) {
            if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
        }

        mediaRecorderChunks = [];
        mediaRecorderStream = stream;
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) mediaRecorderChunks.push(e.data);
        };

        const grabacionLista = new Promise((resolve) => {
            mediaRecorder.onstop = () => {
                const blob = new Blob(mediaRecorderChunks, { type: mimeType || 'video/webm' });
                descargarBlob(blob, `flipovics_${Date.now()}.webm`);
                toast('Video WebM descargado', 'success');
                document.getElementById('modalExportar').hidden = true;
                mediaRecorder = null;
                mediaRecorderChunks = [];
                if (mediaRecorderStream) {
                    mediaRecorderStream.getTracks().forEach(t => t.stop());
                    mediaRecorderStream = null;
                }
                resolve();
            };
        });

        mediaRecorder.start();

        const duracionTotal = (state.frames.length / state.fps) * 1000 + 200;

        const startTime = performance.now();
        const loop = () => {
            const t = performance.now() - startTime;
            const idx = Math.floor((t / 1000) * state.fps) % state.frames.length;
            recCtx.fillStyle = '#FFFFFF';
            recCtx.fillRect(0, 0, ANCHO, ALTO);
            recCtx.drawImage(state.frames[idx].canvas, 0, 0);

            const pct = Math.min(100, Math.round((t / duracionTotal) * 100));
            actualizarModalExportando(`Grabando... ${pct}%`, pct);

            if (t < duracionTotal) {
                requestAnimationFrame(loop);
            } else {
                mediaRecorder.stop();
            }
        };
        loop();

        await grabacionLista;
        cerrarModalExportando();
    } catch (e) {
        console.warn('[FlipoVics] WebM falló:', e);
        cerrarModalExportando();
        toast('No se pudo exportar el video', 'error');
    }
}

function exportarFramePNG() {
    const frame = state.frames[state.frameActivo];
    const tmp = document.createElement('canvas');
    tmp.width = ANCHO;
    tmp.height = ALTO;
    const tctx = tmp.getContext('2d');
    tctx.fillStyle = '#FFFFFF';
    tctx.fillRect(0, 0, ANCHO, ALTO);
    tctx.drawImage(frame.canvas, 0, 0);

    tmp.toBlob((blob) => {
        descargarBlob(blob, `flipovics_frame${state.frameActivo + 1}_${Date.now()}.png`);
        toast('Frame PNG descargado', 'success');
        document.getElementById('modalExportar').hidden = true;
    }, 'image/png');
}

async function exportarGaleria() {
    const mh = MH();
    if (!mh) { toast('Sin conexión al sistema', 'error'); return; }

    try {
        const frame = state.frames[state.frameActivo];
        const tmp = document.createElement('canvas');
        tmp.width = ANCHO;
        tmp.height = ALTO;
        const tctx = tmp.getContext('2d');
        tctx.fillStyle = '#FFFFFF';
        tctx.fillRect(0, 0, ANCHO, ALTO);
        tctx.drawImage(frame.canvas, 0, 0);

        const blob = await new Promise(r => tmp.toBlob(r, 'image/png'));
        const nombre = `FlipoVics frame ${state.frameActivo + 1} - ${new Date().toLocaleDateString('es-CL')}.png`;

        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre,
            carpeta: 'c_general',
            comprimir: false
        });

        toast('Guardado en Galería', 'success');
        document.getElementById('modalExportar').hidden = true;
    } catch (e) {
        console.warn('[FlipoVics] Guardar en Galería falló:', e);
        toast(e.message || 'No se pudo guardar', 'error');
    }
}

function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================================================
//  MODAL EXPORTANDO
// ============================================================
function mostrarModalExportando(titulo, sub) {
    const modal = document.getElementById('modalExportando');
    document.getElementById('fvExportandoTitulo').textContent = titulo;
    document.getElementById('fvExportandoSub').textContent = sub;
    document.getElementById('fvExportandoFill').style.width = '0%';
    modal.hidden = false;
}

function actualizarModalExportando(sub, pct) {
    document.getElementById('fvExportandoSub').textContent = sub;
    document.getElementById('fvExportandoFill').style.width = pct + '%';
}

function cerrarModalExportando() {
    document.getElementById('modalExportando').hidden = true;
}

// ============================================================
//  MODAL SESIÓN
// ============================================================
function preguntarContinuarSesion(data) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modalSesion');
        const fecha = document.getElementById('modalSesionFecha');
        if (fecha && data.fecha) {
            const d = new Date(data.fecha);
            fecha.textContent = 'Guardado el ' + d.toLocaleString('es-CL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }
        modal.hidden = false;
        if (window.lucide) window.lucide.createIcons();

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
//  AJUSTAR TAMAÑO DEL CANVAS VISIBLE
// ============================================================
function ajustarTamanoCanvas() {
    const wrap = document.getElementById('fvCanvasWrap');
    if (!wrap || !visibleCanvas) return;

    const rect = wrap.getBoundingClientRect();
    const ratio = ANCHO / ALTO;
    const wrapRatio = rect.width / rect.height;

    let w, h;
    if (wrapRatio > ratio) {
        h = rect.height;
        w = h * ratio;
    } else {
        w = rect.width;
        h = w / ratio;
    }

    visibleCanvas.style.width = w + 'px';
    visibleCanvas.style.height = h + 'px';
}

// ============================================================
//  UI MÓVIL (panel deslizable)
// ============================================================
function inicializarUIMovil() {
    const panel = document.getElementById('fvPanel');
    const panelTitulo = document.getElementById('fvPanelTitulo');
    const toolbar = document.getElementById('fvToolbar');
    if (!panel || !toolbar) return;

    const titulos = {
        paleta: { icono: 'palette', texto: 'Color' },
        herramientas: { icono: 'brush', texto: 'Herramientas' },
        ajustes: { icono: 'sliders-horizontal', texto: 'Ajustes' }
    };

    function abrirPanel(tab) {
        panel.querySelectorAll('.fv-panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        panel.querySelectorAll('.fv-seccion').forEach(s => {
            s.classList.toggle('activa', s.dataset.seccion === tab);
        });
        const info = titulos[tab] || titulos.paleta;
        if (panelTitulo) {
            panelTitulo.innerHTML = `<i data-lucide="${info.icono}"></i><span>${info.texto}</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
        panel.classList.add('abierto');
    }

    function cerrarPanel() { panel.classList.remove('abierto'); }

    panel.querySelectorAll('.fv-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => abrirPanel(tab.dataset.tab));
    });

    document.getElementById('fvPanelCerrar')?.addEventListener('click', cerrarPanel);
    panel.addEventListener('click', (e) => {
        if (e.target === panel) cerrarPanel();
    });

    toolbar.querySelectorAll('.fv-tool-nav').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = btn.dataset.accion;
            if (['lapiz','borrador','relleno'].includes(a)) {
                activarHerramienta(a);
                toolbar.querySelectorAll('.fv-tool-nav').forEach(b => {
                    if (['lapiz','borrador','relleno'].includes(b.dataset.accion)) {
                        b.classList.toggle('activo', b.dataset.accion === a);
                    }
                });
                return;
            }
            if (a === 'deshacer') { deshacer(); return; }
            if (a === 'rehacer') { rehacer(); return; }
            if (a === 'limpiarFrame') { limpiarFrame(); return; }
            if (a === 'paleta' || a === 'ajustes') abrirPanel(a);
        });
    });
}

// ============================================================
//  WIRING DE UI
// ============================================================
function wireUI() {
    // Header
    document.getElementById('btnAyuda')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('btnGuardar')?.addEventListener('click', guardarProyectoHandler);
    document.getElementById('btnExportar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });

    // Playback
    document.getElementById('btnPlay')?.addEventListener('click', togglePlay);
    document.getElementById('btnPrimerFrame')?.addEventListener('click', irAPrimerFrame);
    document.getElementById('btnFrameAnterior')?.addEventListener('click', irAFrameAnterior);
    document.getElementById('btnFrameSiguiente')?.addEventListener('click', irAFrameSiguiente);
    document.getElementById('btnUltimoFrame')?.addEventListener('click', irAUltimoFrame);
    document.getElementById('btnToggleOnion')?.addEventListener('click', toggleOnion);

    // Frame actions
    document.getElementById('btnFrameNuevo')?.addEventListener('click', agregarFrame);
    document.getElementById('btnFrameDuplicar')?.addEventListener('click', duplicarFrame);
    document.getElementById('btnFrameEliminar')?.addEventListener('click', eliminarFrame);

    // Palette
    document.getElementById('colorPicker')?.addEventListener('input', (e) => setColor(e.target.value));

    // Tools
    document.querySelectorAll('.fv-tool-btn').forEach(b => {
        b.addEventListener('click', () => {
            activarHerramienta(b.dataset.tool);
            document.querySelectorAll('.fv-tool-nav').forEach(n => {
                if (['lapiz','borrador','relleno'].includes(n.dataset.accion)) {
                    n.classList.toggle('activo', n.dataset.accion === b.dataset.tool);
                }
            });
        });
    });

    // Brush sizes
    document.querySelectorAll('.fv-size-btn[data-size]').forEach(b => {
        b.addEventListener('click', () => setTamano(parseInt(b.dataset.size, 10)));
    });

    // Onion count
    document.querySelectorAll('.fv-size-btn[data-onion]').forEach(b => {
        b.addEventListener('click', () => setOnionCount(parseInt(b.dataset.onion, 10)));
    });

    // FPS slider
    const fpsSlider = document.getElementById('fpsSlider');
    const fpsValor = document.getElementById('fpsValor');
    fpsSlider?.addEventListener('input', (e) => {
        state.fps = parseInt(e.target.value, 10);
        if (fpsValor) fpsValor.textContent = state.fps;
        actualizarInfoFrame();
        if (state.playing) {
            clearTimeout(state.playTimer);
            const tick = () => {
                if (!state.playing) return;
                mostrarFrameEnPlayback(state.playFrameIdx);
                actualizarInfoReproduccion();
                state.playFrameIdx = (state.playFrameIdx + 1) % state.frames.length;
                state.playTimer = setTimeout(tick, 1000 / state.fps);
            };
            tick();
        }
    });

    // Toggles
    document.getElementById('toggleOnion')?.addEventListener('change', (e) => {
        state.onionActiva = e.target.checked;
        const btn = document.getElementById('btnToggleOnion');
        if (btn) btn.classList.toggle('activo', state.onionActiva);
        redibujarCanvas();
        actualizarOnionBadge();
    });

    document.getElementById('toggleGrid')?.addEventListener('change', (e) => {
        state.mostrarGrid = e.target.checked;
        redibujarCanvas();
    });

    // Acciones
    document.getElementById('btnNuevoProyecto')?.addEventListener('click', async () => {
        if (!confirm('¿Crear un proyecto nuevo? Se perderá la animación actual si no la guardaste.')) return;
        state.frames = [crearFrameNuevo()];
        state.frameActivo = 0;
        state.undoStack = [];
        state.redoStack = [];
        await borrarProyectoLocal();
        renderizarTodo();
        toast('Proyecto nuevo', 'success');
    });

    document.getElementById('btnBorrarTodo')?.addEventListener('click', async () => {
        if (!confirm('¿Borrar TODOS los frames? Esta acción no se puede deshacer.')) return;
        state.frames = [crearFrameNuevo()];
        state.frameActivo = 0;
        state.undoStack = [];
        state.redoStack = [];
        await borrarProyectoLocal();
        renderizarTodo();
        toast('Todo borrado', 'success');
    });

    // Export modals
    document.getElementById('modalExportarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });
    document.getElementById('btnExportGIF')?.addEventListener('click', exportarGIF);
    document.getElementById('btnExportWebM')?.addEventListener('click', exportarWebM);
    document.getElementById('btnExportPNG')?.addEventListener('click', exportarFramePNG);
    document.getElementById('btnExportGaleria')?.addEventListener('click', exportarGaleria);

    // Ayuda modal
    document.getElementById('modalAyudaCerrar')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = true;
    });

    // Click fuera para cerrar
    ['modalExportar', 'modalSesion', 'modalAyuda', 'modalExportando'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m && id !== 'modalExportando') m.hidden = true;
        });
    });

    // Pointer events en el canvas
    visibleCanvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    visibleCanvas.addEventListener('pointermove', onPointerMove, { passive: false });
    visibleCanvas.addEventListener('pointerup', onPointerUp);
    visibleCanvas.addEventListener('pointercancel', onPointerUp);
    visibleCanvas.addEventListener('pointerleave', onPointerUp);
    visibleCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Resize
    window.addEventListener('resize', ajustarTamanoCanvas);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => ajustarTamanoCanvas());
        const wrap = document.getElementById('fvCanvasWrap');
        if (wrap) ro.observe(wrap);
    }
}

// ============================================================
//  TECLADO (opcional, solo PC)
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); rehacer(); return; }
        if (k === 's') { e.preventDefault(); guardarProyectoHandler(); return; }
        return;
    }

    const k = e.key.toLowerCase();

    if (e.key === ' ') { e.preventDefault(); togglePlay(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); irAFrameAnterior(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); irAFrameSiguiente(); return; }
    if (e.key === 'Home') { e.preventDefault(); irAPrimerFrame(); return; }
    if (e.key === 'End') { e.preventDefault(); irAUltimoFrame(); return; }
    if (e.key === 'Delete') { e.preventDefault(); eliminarFrame(); return; }

    const shortcuts = { b: 'lapiz', e: 'borrador', l: 'linea', r: 'rect', o: 'elipse', g: 'relleno', i: 'pipeta' };
    if (shortcuts[k]) { activarHerramienta(shortcuts[k]); return; }

    if (k === '1') { setTamano(1); return; }
    if (k === '2') { setTamano(2); return; }
    if (k === '3') { setTamano(4); return; }
    if (k === '4') { setTamano(8); return; }
    if (k === '5') { setTamano(16); return; }
    if (k === '6') { setTamano(32); return; }

    if (k === 'n') { agregarFrame(); return; }
    if (k === 'd') { duplicarFrame(); return; }

    if (e.shiftKey && k === 'o') { toggleOnion(); return; }
});

// ============================================================
//  RENDER GENERAL
// ============================================================
function renderizarTodo() {
    redibujarCanvas();
    renderizarStrip();
    actualizarInfoFrame();
    actualizarOnionBadge();
    actualizarBotonesUndoRedo();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('FlipoVics necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar FlipoVics.'); return; }

    const badge = document.getElementById('fvUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    visibleCanvas = document.getElementById('fvCanvas');
    visibleCtx = visibleCanvas.getContext('2d');
    visibleCtx.imageSmoothingEnabled = false;

    renderizarPaleta();
    setColor('#000000');
    renderizarRecientes();

    setTimeout(ajustarTamanoCanvas, 50);
    setTimeout(ajustarTamanoCanvas, 300);

    let proyectoCargado = false;
    try {
        const guardado = await cargarProyectoLocal();
        if (guardado && guardado.frames && guardado.frames.length) {
            const decision = await preguntarContinuarSesion(guardado);
            if (decision === 'continuar') {
                cargarProyectoDesdeData(guardado);
                toast('Animación restaurada', 'success');
                proyectoCargado = true;
            } else if (decision === 'descartar') {
                await borrarProyectoLocal();
            }
        }
    } catch (e) {
        console.warn('[FlipoVics] No se pudo recuperar proyecto:', e);
    }

    if (!proyectoCargado) {
        state.frames = [crearFrameNuevo()];
        state.frameActivo = 0;
    }

    inicializarUIMovil();
    wireUI();
    activarHerramienta('lapiz');
    setTamano(1);
    setOnionCount(1);

    renderizarTodo();

    const btnOnion = document.getElementById('btnToggleOnion');
    if (btnOnion) btnOnion.classList.add('activo');

    window.addEventListener('pagehide', () => {
        if (usuarioActual && state.frames.length > 0) {
            const framesData = state.frames.map(f => {
                const img = f.ctx.getImageData(0, 0, ANCHO, ALTO);
                return img.data;
            });
            idbSet(claveProyecto(), {
                version: 1,
                ancho: ANCHO,
                alto: ALTO,
                frames: framesData,
                fps: state.fps,
                frameActivo: state.frameActivo,
                fecha: new Date().toISOString()
            }).catch(() => {});
        }
    });

    if (window.lucide) window.lucide.createIcons();

    if (!localStorage.getItem(HINT_KEY)) {
        setTimeout(() => {
            toast('1 dedo dibuja · Todo se hace con botones', 'info');
            try { localStorage.setItem(HINT_KEY, '1'); } catch (e) {}
        }, 900);
    }
}

document.addEventListener('DOMContentLoaded', inicializar);