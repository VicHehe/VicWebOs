// ============================================================
//  PixEvan — Editor de pixel art
//  ------------------------------------------------------------
//  Adaptado desde PixelFlash (demo) al sistema VicWebOs.
//  Motor de dibujo original preservado.
//
//  Persistencia:
//    · IndexedDB local → proyecto en curso (por usuario)
//    · mh.galeria.subirImagen() → exportar PNG a la Galería
//
//  Tema: heredado del padre via aplicarTemaDelPadre()
//  Sin emojis en la UI. Todo con Lucide.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsPixEvan';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';

// ============================================================
//  PALETA PICO-8 (default)
// ============================================================
const PALETA_PICO8 = [
    '#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8',
    '#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'
];

// ============================================================
//  API / BD / MH
// ============================================================
const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  ESTADO
// ============================================================
const state = {
    ancho: 32,
    alto: 32,
    frames: [],           // [{ capas: [{nombre, pixeles, visible, opacidad}], historia, historiaIdx }]
    frameActivo: 0,
    capaActiva: 0,
    color: '#000000',
    herramienta: 'lapiz',
    tamanoPincel: 1,
    paleta: [],
    paletaNombre: 'PICO-8',
    zoom: 16,
    panX: 0,
    panY: 0,
    espejoX: false,
    espejoY: false,
    mostrarGrid: true,
    dibujando: false,
    formaStart: null,
    formaSnapshot: null,
    exportEscala: 1,
    exportModo: 'horizontal',
    exportPadding: 0,
    MAX_HISTORIA: 50
};

let usuarioActual = null;

// ============================================================
//  TEMA: heredar variables del padre
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
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('pxToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'px-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  INDEXEDDB — proyecto actual por usuario
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

function claveProyecto() {
    const codigo = usuarioActual?.codigo || 'invitado';
    return 'px_' + codigo;
}

async function guardarProyectoLocal() {
    const data = {
        version: 1,
        ancho: state.ancho,
        alto: state.alto,
        frames: state.frames.map(f => ({
            capas: f.capas.map(c => ({
                nombre: c.nombre,
                pixeles: [...c.pixeles],
                visible: c.visible,
                opacidad: c.opacidad
            }))
        })),
        paleta: [...state.paleta],
        paletaNombre: state.paletaNombre,
        frameActivo: state.frameActivo,
        capaActiva: state.capaActiva,
        fecha: new Date().toISOString()
    };
    await idbSet(claveProyecto(), data);
    return data;
}

async function cargarProyectoLocal() {
    return await idbGet(claveProyecto());
}

async function borrarProyectoLocal() {
    await idbDelete(claveProyecto());
}

// ============================================================
//  CANVAS
// ============================================================
const canvas = document.getElementById('pxCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvasWrapper');

const canvasTmp = document.createElement('canvas');
const ctxTmp = canvasTmp.getContext('2d');

function redimensionarCanvas() {
    canvas.width = state.ancho * state.zoom;
    canvas.height = state.alto * state.zoom;
    aplicarPanZoom();
    render();
}

function aplicarPanZoom() {
    const wrapRect = wrapper.getBoundingClientRect();
    const cw = canvas.width;
    const ch = canvas.height;
    const x = (wrapRect.width - cw) / 2 + state.panX;
    const y = (wrapRect.height - ch) / 2 + state.panY;
    canvas.style.left = x + 'px';
    canvas.style.top = y + 'px';
    const nivelEl = document.getElementById('zoomNivel');
    if (nivelEl) nivelEl.textContent = state.zoom + '×';
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    if (!canvas.width || !canvas.height) return;
    const frame = frameActual();
    if (!frame) return;

    canvasTmp.width = state.ancho;
    canvasTmp.height = state.alto;
    const imgData = ctxTmp.createImageData(state.ancho, state.alto);

    for (let y = 0; y < state.alto; y++) {
        for (let x = 0; x < state.ancho; x++) {
            const idx = y * state.ancho + x;
            let colorFinal = null;
            for (let i = 0; i < frame.capas.length; i++) {
                const capa = frame.capas[i];
                if (!capa.visible) continue;
                const c = capa.pixeles[idx];
                if (c) colorFinal = c;
            }
            if (colorFinal) {
                const [r, g, b, a] = hexARgba(colorFinal);
                const i4 = idx * 4;
                imgData.data[i4] = r;
                imgData.data[i4+1] = g;
                imgData.data[i4+2] = b;
                imgData.data[i4+3] = a;
            }
        }
    }
    ctxTmp.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvasTmp, 0, 0, canvas.width, canvas.height);

    if (state.mostrarGrid && state.zoom >= 8) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= state.ancho; x++) {
            ctx.beginPath();
            ctx.moveTo(x * state.zoom + 0.5, 0);
            ctx.lineTo(x * state.zoom + 0.5, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= state.alto; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * state.zoom + 0.5);
            ctx.lineTo(canvas.width, y * state.zoom + 0.5);
            ctx.stroke();
        }
    }
}

function hexARgba(hex) {
    const h = hex.replace('#', '');
    if (h.length === 6) {
        return [
            parseInt(h.slice(0,2), 16),
            parseInt(h.slice(2,4), 16),
            parseInt(h.slice(4,6), 16),
            255
        ];
    } else if (h.length === 8) {
        return [
            parseInt(h.slice(0,2), 16),
            parseInt(h.slice(2,4), 16),
            parseInt(h.slice(4,6), 16),
            parseInt(h.slice(6,8), 16)
        ];
    }
    return [0, 0, 0, 255];
}

// ============================================================
//  COORDS
// ============================================================
function coordsDeCliente(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / state.zoom);
    const y = Math.floor((clientY - rect.top) / state.zoom);
    return { x, y };
}

// ============================================================
//  FRAME / CAPA HELPERS
// ============================================================
function crearCapaVacia(nombre) {
    return {
        nombre: nombre || 'Capa 1',
        pixeles: new Array(state.ancho * state.alto).fill(null),
        visible: true,
        opacidad: 1
    };
}

function crearFrameNuevo() {
    return {
        capas: [crearCapaVacia('Capa 1')],
        historia: [],
        historiaIdx: -1
    };
}

function frameActual() { return state.frames[state.frameActivo]; }
function capaActual()  { return frameActual()?.capas[state.capaActiva]; }

// ============================================================
//  DIBUJO — operaciones atómicas
// ============================================================
function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= state.ancho || y >= state.alto) return false;
    const capa = capaActual();
    if (!capa) return false;
    const idx = y * state.ancho + x;
    if (capa.pixeles[idx] === color) return false;
    capa.pixeles[idx] = color;
    return true;
}

function pintarPincel(x, y, color) {
    const t = state.tamanoPincel;
    const offset = Math.floor((t - 1) / 2);
    let cambio = false;
    const puntos = [];
    for (let dy = 0; dy < t; dy++) {
        for (let dx = 0; dx < t; dx++) {
            puntos.push({ x: x + dx - offset, y: y + dy - offset });
        }
    }
    for (const p of puntos) {
        if (setPixel(p.x, p.y, color)) cambio = true;
        if (state.espejoX) {
            if (setPixel(state.ancho - 1 - p.x, p.y, color)) cambio = true;
        }
        if (state.espejoY) {
            if (setPixel(p.x, state.alto - 1 - p.y, color)) cambio = true;
        }
        if (state.espejoX && state.espejoY) {
            if (setPixel(state.ancho - 1 - p.x, state.alto - 1 - p.y, color)) cambio = true;
        }
    }
    return cambio;
}

function floodFill(x0, y0, colorNuevo) {
    if (x0 < 0 || y0 < 0 || x0 >= state.ancho || y0 >= state.alto) return false;
    const capa = capaActual();
    if (!capa) return false;
    const idx0 = y0 * state.ancho + x0;
    const colorViejo = capa.pixeles[idx0];
    if (colorViejo === colorNuevo) return false;

    const stack = [[x0, y0]];
    const visitados = new Uint8Array(state.ancho * state.alto);
    let cambio = false;

    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= state.ancho || y >= state.alto) continue;
        const i = y * state.ancho + x;
        if (visitados[i]) continue;
        visitados[i] = 1;
        if (capa.pixeles[i] !== colorViejo) continue;
        capa.pixeles[i] = colorNuevo;
        cambio = true;
        stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
    }
    return cambio;
}

function lineaBresenham(x0, y0, x1, y1, color) {
    let cambio = false;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
        if (pintarPincel(x0, y0, color)) cambio = true;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return cambio;
}

function dibujarRect(x0, y0, x1, y1, color, relleno) {
    const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
    const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
    let cambio = false;
    if (relleno) {
        for (let y = ymin; y <= ymax; y++)
            for (let x = xmin; x <= xmax; x++)
                if (pintarPincel(x, y, color)) cambio = true;
    } else {
        for (let x = xmin; x <= xmax; x++) {
            if (pintarPincel(x, ymin, color)) cambio = true;
            if (pintarPincel(x, ymax, color)) cambio = true;
        }
        for (let y = ymin; y <= ymax; y++) {
            if (pintarPincel(xmin, y, color)) cambio = true;
            if (pintarPincel(xmax, y, color)) cambio = true;
        }
    }
    return cambio;
}

function dibujarElipse(x0, y0, x1, y1, color, relleno) {
    const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
    const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const rx = (xmax - xmin) / 2, ry = (ymax - ymin) / 2;
    if (rx === 0 && ry === 0) return pintarPincel(Math.round(cx), Math.round(cy), color);
    let cambio = false;
    for (let y = ymin; y <= ymax; y++) {
        for (let x = xmin; x <= xmax; x++) {
            const dx = (x - cx) / (rx || 0.5);
            const dy = (y - cy) / (ry || 0.5);
            const d = dx*dx + dy*dy;
            if (relleno) {
                if (d <= 1.0) { if (pintarPincel(x, y, color)) cambio = true; }
            } else {
                if (d <= 1.05 && d >= 0.5) { if (pintarPincel(x, y, color)) cambio = true; }
            }
        }
    }
    return cambio;
}

// ============================================================
//  HISTORIA (por frame)
// ============================================================
function snapshotFrame(frame) {
    return frame.capas.map(c => ({
        nombre: c.nombre,
        visible: c.visible,
        opacidad: c.opacidad,
        pixeles: [...c.pixeles]
    }));
}

function guardarHistoria() {
    const frame = frameActual();
    if (!frame) return;
    frame.historia = frame.historia.slice(0, frame.historiaIdx + 1);
    frame.historia.push(snapshotFrame(frame));
    if (frame.historia.length > state.MAX_HISTORIA) frame.historia.shift();
    else frame.historiaIdx++;
    actualizarBotonesHistorial();
}

function actualizarBotonesHistorial() {
    const frame = frameActual();
    const d = document.getElementById('btnDeshacer');
    const r = document.getElementById('btnRehacer');
    if (!frame) return;
    if (d) d.disabled = frame.historiaIdx <= 0;
    if (r) r.disabled = frame.historiaIdx >= frame.historia.length - 1;
}

function restaurarSnapshot(snap) {
    const frame = frameActual();
    frame.capas = snap.map(s => ({
        nombre: s.nombre,
        pixeles: [...s.pixeles],
        visible: s.visible,
        opacidad: s.opacidad
    }));
    if (state.capaActiva >= frame.capas.length) state.capaActiva = frame.capas.length - 1;
    render();
    renderCapas();
}

function deshacer() {
    const frame = frameActual();
    if (!frame || frame.historiaIdx <= 0) return;
    frame.historiaIdx--;
    restaurarSnapshot(frame.historia[frame.historiaIdx]);
    actualizarBotonesHistorial();
}

function rehacer() {
    const frame = frameActual();
    if (!frame || frame.historiaIdx >= frame.historia.length - 1) return;
    frame.historiaIdx++;
    restaurarSnapshot(frame.historia[frame.historiaIdx]);
    actualizarBotonesHistorial();
}

// ============================================================
//  POINTER EVENTS
// ============================================================
let panStart = null;

canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    if (state.herramienta === 'mover' || e.button === 1 || e.shiftKey) {
        panStart = { x: e.clientX, y: e.clientY, panX: state.panX, panY: state.panY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    const { x, y } = coordsDeCliente(e.clientX, e.clientY);
    const color = state.herramienta === 'borrador' ? null : state.color;

    if (state.herramienta === 'pipeta') {
        const capa = capaActual();
        const idx = y * state.ancho + x;
        if (capa && capa.pixeles[idx]) setColor(capa.pixeles[idx]);
        return;
    }

    if (state.herramienta === 'relleno') {
        if (floodFill(x, y, color)) { render(); guardarHistoria(); renderFrames(); }
        return;
    }

    if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
        state.formaStart = { x, y };
        state.formaSnapshot = snapshotFrame(frameActual());
        state.dibujando = true;
        return;
    }

    state.dibujando = true;
    if (pintarPincel(x, y, color)) render();
});

canvas.addEventListener('pointermove', (e) => {
    const { x, y } = coordsDeCliente(e.clientX, e.clientY);
    const coordEl = document.getElementById('coordsIndicator');
    if (coordEl) coordEl.textContent = `${x}, ${y}`;

    if (panStart) {
        state.panX = panStart.panX + (e.clientX - panStart.x);
        state.panY = panStart.panY + (e.clientY - panStart.y);
        aplicarPanZoom();
        return;
    }

    if (!state.dibujando) return;

    if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
        restaurarSnapshot(state.formaSnapshot);
        const s = state.formaStart;
        if (state.herramienta === 'linea') lineaBresenham(s.x, s.y, x, y, state.color);
        else if (state.herramienta === 'rect') dibujarRect(s.x, s.y, x, y, state.color, false);
        else if (state.herramienta === 'elipse') dibujarElipse(s.x, s.y, x, y, state.color, false);
        render();
        return;
    }

    const color = state.herramienta === 'borrador' ? null : state.color;
    if (pintarPincel(x, y, color)) render();
});

canvas.addEventListener('pointerup', (e) => {
    if (panStart) {
        panStart = null;
        canvas.style.cursor = cursorHerramienta();
        return;
    }
    if (state.dibujando) {
        state.dibujando = false;
        if (state.herramienta === 'linea' || state.herramienta === 'rect' || state.herramienta === 'elipse') {
            state.formaStart = null;
            state.formaSnapshot = null;
        }
        guardarHistoria();
        renderFrames();
    }
});

canvas.addEventListener('pointercancel', () => {
    if (panStart) { panStart = null; canvas.style.cursor = cursorHerramienta(); }
    if (state.dibujando) {
        state.dibujando = false;
        state.formaStart = null;
        state.formaSnapshot = null;
    }
});

wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 2 : -2;
    const nuevoZoom = Math.max(1, Math.min(64, state.zoom + delta));
    if (nuevoZoom !== state.zoom) {
        state.zoom = nuevoZoom;
        redimensionarCanvas();
    }
}, { passive: false });

function cursorHerramienta() {
    if (state.herramienta === 'mover') return 'grab';
    return 'crosshair';
}

// ============================================================
//  TECLADO
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); guardarProyectoHandler(); return; }

    if (e.ctrlKey || e.metaKey) return;

    const shortcuts = { b: 'lapiz', e: 'borrador', g: 'relleno', l: 'linea', r: 'rect', o: 'elipse', i: 'pipeta', m: 'mover' };
    const k = e.key.toLowerCase();
    if (shortcuts[k]) activarHerramienta(shortcuts[k]);
    if (k === 'x') toggleEspejoX();
    if (k === 'y') toggleEspejoY();
    if (k === 'h') toggleGrid();
    if (k === '+' || k === '=') { state.zoom = Math.min(64, state.zoom + 2); redimensionarCanvas(); }
    if (k === '-') { state.zoom = Math.max(1, state.zoom - 2); redimensionarCanvas(); }
});

// ============================================================
//  HERRAMIENTAS UI
// ============================================================
function activarHerramienta(h) {
    state.herramienta = h;
    document.querySelectorAll('.px-tool-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tool === h);
    });
    document.querySelectorAll('.px-tool-nav').forEach(b => {
        if (b.dataset.accion === 'lapiz' || b.dataset.accion === 'borrador' || b.dataset.accion === 'relleno') {
            b.classList.toggle('activo', b.dataset.accion === h);
        }
    });
    canvas.style.cursor = cursorHerramienta();
}

// ============================================================
//  COLOR / PALETA
// ============================================================
function setColor(hex) {
    state.color = hex.toUpperCase();
    const picker = document.getElementById('colorPicker');
    const hexEl = document.getElementById('colorHex');
    if (picker) picker.value = state.color;
    if (hexEl) hexEl.textContent = state.color;
    actualizarPaletaSeleccion();
}

function actualizarPaletaSeleccion() {
    document.querySelectorAll('.px-paleta-grid .px-color-btn').forEach(el => {
        el.classList.toggle('seleccionado', el.dataset.color === state.color);
    });
}

function renderizarPaleta() {
    const grid = document.getElementById('paletaGrid');
    if (!grid) return;
    grid.innerHTML = '';
    state.paleta.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'px-color-btn';
        btn.type = 'button';
        btn.style.background = c;
        btn.dataset.color = c;
        btn.title = c;
        if (c.toUpperCase() === state.color) btn.classList.add('seleccionado');
        btn.addEventListener('click', () => setColor(c));
        grid.appendChild(btn);
    });
    const info = document.getElementById('paletaInfo');
    if (info) info.textContent = `${state.paletaNombre} · ${state.paleta.length} colores`;
}

function parsearPaleta(texto) {
    const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith(';') && !l.startsWith('//'));
    if (!lineas.length) return null;

    const primera = lineas[0].toUpperCase();

    // JASC-PAL
    if (primera.startsWith('JASC-PAL')) {
        const cantidad = parseInt(lineas[2]) || 0;
        const colores = [];
        for (let i = 3; i < lineas.length && colores.length < cantidad; i++) {
            const p = lineas[i].split(/\s+/);
            if (p.length >= 3) {
                const r = parseInt(p[0]), g = parseInt(p[1]), b = parseInt(p[2]);
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                    colores.push('#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase());
                }
            }
        }
        return colores.length ? colores : null;
    }

    // GIMP .gpl
    if (primera.startsWith('GIMP PALETTE')) {
        const colores = [];
        for (let i = 1; i < lineas.length; i++) {
            const l = lineas[i];
            if (l.startsWith('Name:') || l.startsWith('Columns:') || l.startsWith('#')) continue;
            const p = l.split(/\s+/);
            if (p.length >= 3) {
                const r = parseInt(p[0]), g = parseInt(p[1]), b = parseInt(p[2]);
                if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
                    colores.push('#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase());
                }
            }
        }
        return colores.length ? colores : null;
    }

    // Formato simple
    const colores = [];
    for (const l of lineas) {
        const m = l.match(/#?([0-9a-fA-F]{6})/);
        if (m) colores.push('#' + m[1].toUpperCase());
    }
    return colores.length ? colores : null;
}

// ============================================================
//  CAPAS UI
// ============================================================
function renderCapas() {
    const cont = document.getElementById('capasLista');
    const frame = frameActual();
    if (!cont || !frame) return;
    cont.innerHTML = '';
    frame.capas.slice().reverse().forEach((capa, i) => {
        const idxReal = frame.capas.length - 1 - i;
        const div = document.createElement('div');
        div.className = 'px-capa-item' + (idxReal === state.capaActiva ? ' activa' : '');
        div.innerHTML = `
            <span class="px-capa-vis" title="${capa.visible ? 'Ocultar' : 'Mostrar'}">
                <i data-lucide="${capa.visible ? 'eye' : 'eye-off'}"></i>
            </span>
            <span class="px-capa-nombre">${capa.nombre}</span>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.closest('.px-capa-vis')) {
                capa.visible = !capa.visible;
                render();
                renderCapas();
                renderFrames();
                return;
            }
            state.capaActiva = idxReal;
            renderCapas();
        });
        cont.appendChild(div);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  FRAMES UI
// ============================================================
function renderFrames() {
    const cont = document.getElementById('framesLista');
    const count = document.getElementById('framesCount');
    if (!cont) return;
    if (count) count.textContent = state.frames.length;
    cont.innerHTML = '';

    state.frames.forEach((frame, i) => {
        const div = document.createElement('div');
        div.className = 'px-frame-item' + (i === state.frameActivo ? ' activo' : '');
        div.dataset.idx = i;

        const mini = document.createElement('canvas');
        mini.width = state.ancho;
        mini.height = state.alto;
        const mctx = mini.getContext('2d');
        const imgData = mctx.createImageData(state.ancho, state.alto);
        for (let y = 0; y < state.alto; y++) {
            for (let x = 0; x < state.ancho; x++) {
                const idx = y * state.ancho + x;
                let colorFinal = null;
                for (const capa of frame.capas) {
                    if (!capa.visible) continue;
                    const c = capa.pixeles[idx];
                    if (c) colorFinal = c;
                }
                if (colorFinal) {
                    const [r, g, b, a] = hexARgba(colorFinal);
                    const i4 = idx * 4;
                    imgData.data[i4] = r;
                    imgData.data[i4+1] = g;
                    imgData.data[i4+2] = b;
                    imgData.data[i4+3] = a;
                }
            }
        }
        mctx.putImageData(imgData, 0, 0);
        div.appendChild(mini);

        const num = document.createElement('span');
        num.className = 'px-frame-numero';
        num.textContent = i + 1;
        div.appendChild(num);

        div.addEventListener('click', () => cambiarFrame(i));
        cont.appendChild(div);
    });
}

function cambiarFrame(i) {
    if (i < 0 || i >= state.frames.length || i === state.frameActivo) return;
    state.frameActivo = i;
    state.capaActiva = 0;
    render();
    renderCapas();
    renderFrames();
    actualizarBotonesHistorial();
}

// ============================================================
//  ESPEJOS / GRID
// ============================================================
function toggleEspejoX() {
    state.espejoX = !state.espejoX;
    document.getElementById('btnEspejoX')?.classList.toggle('activo', state.espejoX);
}
function toggleEspejoY() {
    state.espejoY = !state.espejoY;
    document.getElementById('btnEspejoY')?.classList.toggle('activo', state.espejoY);
}
function toggleGrid() {
    state.mostrarGrid = !state.mostrarGrid;
    document.getElementById('btnGrid')?.classList.toggle('activo', state.mostrarGrid);
    render();
}

// ============================================================
//  PROYECTO
// ============================================================
function crearProyecto(tamaño) {
    state.ancho = tamaño;
    state.alto = tamaño;
    state.frames = [crearFrameNuevo()];
    state.frameActivo = 0;
    state.capaActiva = 0;
    state.panX = 0;
    state.panY = 0;

    redimensionarCanvas();
    ajustarZoom();
    render();
    renderCapas();
    renderFrames();
    guardarHistoria();
}

function ajustarZoom() {
    const rect = wrapper.getBoundingClientRect();
    const zoomX = Math.floor((rect.width - 40) / state.ancho);
    const zoomY = Math.floor((rect.height - 40) / state.alto);
    state.zoom = Math.max(1, Math.min(zoomX, zoomY));
    state.panX = 0;
    state.panY = 0;
    redimensionarCanvas();
}

// ============================================================
//  EXPORTAR
// ============================================================
function calcularLayoutExport() {
    const a = state.ancho, al = state.alto;
    const esc = state.exportEscala;
    const pad = state.exportPadding;
    const N = state.frames.length;

    if (state.exportModo === 'frame') {
        return { w: a * esc, h: al * esc };
    }
    if (state.exportModo === 'horizontal') {
        return { w: (a * N) * esc, h: al * esc };
    }
    if (state.exportModo === 'vertical') {
        return { w: a * esc, h: (al * N) * esc };
    }
    if (state.exportModo === 'grid') {
        const cols = Math.ceil(Math.sqrt(N));
        const rows = Math.ceil(N / cols);
        const celdaW = a * esc + pad;
        const celdaH = al * esc + pad;
        return { w: celdaW * cols + pad, h: celdaH * rows + pad };
    }
    return { w: a * esc, h: al * esc };
}

function actualizarPreviewInfo() {
    const { w, h } = calcularLayoutExport();
    const N = state.exportModo === 'frame' ? 1 : state.frames.length;
    const el = document.getElementById('previewInfo');
    if (el) el.textContent = `${w} × ${h} px · ${N} frame${N !== 1 ? 's' : ''} · Escala ${state.exportEscala}×`;
}

function generarImagenExport() {
    const { w, h } = calcularLayoutExport();
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = w;
    exportCanvas.height = h;
    const ectx = exportCanvas.getContext('2d');
    ectx.imageSmoothingEnabled = false;

    const esc = state.exportEscala;
    const a = state.ancho * esc, al = state.alto * esc;
    const pad = state.exportPadding;
    const N = state.frames.length;

    function drawFrameEn(x, y, frame) {
        const tmp = document.createElement('canvas');
        tmp.width = state.ancho;
        tmp.height = state.alto;
        const tctx = tmp.getContext('2d');
        const imgData = tctx.createImageData(state.ancho, state.alto);
        for (let yy = 0; yy < state.alto; yy++) {
            for (let xx = 0; xx < state.ancho; xx++) {
                const idx = yy * state.ancho + xx;
                let colorFinal = null;
                for (const capa of frame.capas) {
                    if (!capa.visible) continue;
                    const c = capa.pixeles[idx];
                    if (c) colorFinal = c;
                }
                if (colorFinal) {
                    const [r, g, b, aa] = hexARgba(colorFinal);
                    const i4 = idx * 4;
                    imgData.data[i4] = r;
                    imgData.data[i4+1] = g;
                    imgData.data[i4+2] = b;
                    imgData.data[i4+3] = aa;
                }
            }
        }
        tctx.putImageData(imgData, 0, 0);
        ectx.drawImage(tmp, x, y, a, al);
    }

    if (state.exportModo === 'frame') {
        drawFrameEn(0, 0, frameActual());
    } else if (state.exportModo === 'horizontal') {
        for (let i = 0; i < N; i++) drawFrameEn(i * a, 0, state.frames[i]);
    } else if (state.exportModo === 'vertical') {
        for (let i = 0; i < N; i++) drawFrameEn(0, i * al, state.frames[i]);
    } else if (state.exportModo === 'grid') {
        const cols = Math.ceil(Math.sqrt(N));
        const celdaW = a + pad;
        const celdaH = al + pad;
        for (let i = 0; i < N; i++) {
            const cx = (i % cols) * celdaW + pad;
            const cy = Math.floor(i / cols) * celdaH + pad;
            drawFrameEn(cx, cy, state.frames[i]);
        }
    }
    return exportCanvas;
}

// ============================================================
//  GUARDAR PROYECTO (IndexedDB)
// ============================================================
async function guardarProyectoHandler() {
    try {
        await guardarProyectoLocal();
        toast('Proyecto guardado', 'success');
    } catch (e) {
        console.warn('[PixEvan] Guardar proyecto falló:', e);
        toast('No se pudo guardar', 'error');
    }
}

// ============================================================
//  GUARDAR EN GALERÍA
// ============================================================
async function guardarEnGaleriaHandler() {
    const mh = MH();
    if (!mh) { toast('Sin conexión al sistema', 'error'); return; }
    const titulo = (document.getElementById('inputTituloObra').value || '').trim() || 'PixEvan';

    try {
        const c = generarImagenExport();
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        if (!blob) throw new Error('No se pudo generar el PNG.');

        // IMPORTANTE: comprimir: false para preservar bordes duros del pixel art
        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre: titulo + '.png',
            carpeta: 'c_general',
            comprimir: false
        });

        toast('Guardado en Galería', 'success');
        document.getElementById('modalGuardarGaleria').hidden = true;
        document.getElementById('modalExportar').hidden = true;
    } catch (e) {
        console.warn('[PixEvan] Guardar en Galería falló:', e);
        toast(e.message || 'No se pudo guardar', 'error');
    }
}

// ============================================================
//  UI MÓVIL: panel deslizable + toolbar inferior
// ============================================================
function inicializarUIMovil() {
    const panel = document.getElementById('pxPanel');
    const panelTitulo = document.getElementById('pxPanelTitulo');
    const toolbar = document.getElementById('pxToolbar');
    if (!panel || !toolbar) return;

    const titulos = {
        paleta:       { icono: 'palette',       texto: 'Paleta' },
        herramientas: { icono: 'brush',         texto: 'Herramientas' },
        capas:        { icono: 'layers',        texto: 'Capas' },
        frames:       { icono: 'film',          texto: 'Frames' }
    };

    function abrirPanel(tab) {
        panel.querySelectorAll('.px-panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        panel.querySelectorAll('.px-seccion').forEach(s => {
            s.classList.toggle('activa', s.dataset.seccion === tab);
        });
        const info = titulos[tab] || titulos.paleta;
        if (panelTitulo) {
            panelTitulo.innerHTML = `<i data-lucide="${info.icono}"></i><span>${info.texto}</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
        panel.classList.add('abierto');
    }

    function cerrarPanel() {
        panel.classList.remove('abierto');
    }

    panel.querySelectorAll('.px-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => abrirPanel(tab.dataset.tab));
    });

    document.getElementById('pxPanelCerrar')?.addEventListener('click', cerrarPanel);
    panel.addEventListener('click', (e) => {
        if (e.target === panel) cerrarPanel();
    });

    toolbar.querySelectorAll('.px-tool-nav').forEach(btn => {
        btn.addEventListener('click', () => {
            const accion = btn.dataset.accion;

            if (accion === 'lapiz' || accion === 'borrador' || accion === 'relleno') {
                activarHerramienta(accion);
                return;
            }
            if (accion === 'deshacer') { deshacer(); return; }
            if (accion === 'paleta' || accion === 'capas' || accion === 'frames') {
                abrirPanel(accion);
                return;
            }
        });
    });
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

async function cargarProyectoDesdeData(data) {
    state.ancho = data.ancho || 32;
    state.alto = data.alto || 32;
    state.paleta = Array.isArray(data.paleta) && data.paleta.length ? [...data.paleta] : [...PALETA_PICO8];
    state.paletaNombre = data.paletaNombre || 'PICO-8';
    state.frames = (data.frames || []).map(f => ({
        capas: (f.capas || []).map(c => ({
            nombre: c.nombre || 'Capa',
            pixeles: Array.isArray(c.pixeles) ? [...c.pixeles] : new Array(state.ancho * state.alto).fill(null),
            visible: c.visible !== false,
            opacidad: typeof c.opacidad === 'number' ? c.opacidad : 1
        })),
        historia: [],
        historiaIdx: -1
    }));
    if (state.frames.length === 0) state.frames = [crearFrameNuevo()];
    state.frameActivo = Math.min(data.frameActivo || 0, state.frames.length - 1);
    state.capaActiva = Math.min(data.capaActiva || 0, (state.frames[state.frameActivo].capas.length - 1));

    redimensionarCanvas();
    ajustarZoom();
    renderizarPaleta();
    render();
    renderCapas();
    renderFrames();
    guardarHistoria();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('PixEvan necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitas iniciar sesión para usar PixEvan.'); return; }

    const badge = document.getElementById('pxUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    // Estado inicial
    state.paleta = [...PALETA_PICO8];
    state.paletaNombre = 'PICO-8';
    renderizarPaleta();
    setColor('#000000');

    inicializarUIMovil();

    // Proyecto: ¿hay uno guardado?
    let proyectoRecuperado = false;
    try {
        const guardado = await cargarProyectoLocal();
        if (guardado && guardado.frames && guardado.frames.length) {
            const decision = await preguntarContinuarSesion(guardado);
            if (decision === 'continuar') {
                await cargarProyectoDesdeData(guardado);
                toast('Proyecto restaurado', 'success');
                proyectoRecuperado = true;
            } else if (decision === 'descartar') {
                await borrarProyectoLocal();
            }
        }
    } catch (e) {
        console.warn('[PixEvan] No se pudo recuperar el proyecto:', e);
    }

    if (!proyectoRecuperado) {
        crearProyecto(32);
    }

    document.getElementById('btnGrid')?.classList.add('activo');

    // ============ WIRING ============

    // Header
    document.getElementById('btnNuevoProyecto')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('btnDeshacer')?.addEventListener('click', deshacer);
    document.getElementById('btnRehacer')?.addEventListener('click', rehacer);
    document.getElementById('btnLimpiarFrame')?.addEventListener('click', () => {
        if (!confirm('¿Limpiar todas las capas del frame actual?')) return;
        const frame = frameActual();
        frame.capas.forEach(c => c.pixeles.fill(null));
        render();
        renderFrames();
        guardarHistoria();
    });
    document.getElementById('btnGuardarProyecto')?.addEventListener('click', guardarProyectoHandler);
    document.getElementById('btnExportar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = false;
        actualizarPreviewInfo();
        if (window.lucide) window.lucide.createIcons();
    });

    // Zoom / mirror / grid
    document.getElementById('zoomIn')?.addEventListener('click', () => {
        state.zoom = Math.min(64, state.zoom + 2);
        redimensionarCanvas();
    });
    document.getElementById('zoomOut')?.addEventListener('click', () => {
        state.zoom = Math.max(1, state.zoom - 2);
        redimensionarCanvas();
    });
    document.getElementById('zoomFit')?.addEventListener('click', ajustarZoom);
    document.getElementById('btnGrid')?.addEventListener('click', toggleGrid);
    document.getElementById('btnEspejoX')?.addEventListener('click', toggleEspejoX);
    document.getElementById('btnEspejoY')?.addEventListener('click', toggleEspejoY);

    // Herramientas
    document.querySelectorAll('.px-tool-btn').forEach(b => {
        b.addEventListener('click', () => activarHerramienta(b.dataset.tool));
    });
    document.querySelectorAll('.px-size-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.px-size-btn').forEach(x => x.classList.remove('activo'));
            b.classList.add('activo');
            state.tamanoPincel = parseInt(b.dataset.size, 10);
        });
    });

    // Color
    document.getElementById('colorPicker')?.addEventListener('input', (e) => {
        setColor(e.target.value);
    });

    // Paleta: input archivo
    document.getElementById('inputPaleta')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const texto = await file.text();
        const colores = parsearPaleta(texto);
        if (!colores || colores.length === 0) {
            toast('No se detectó una paleta válida', 'error');
            e.target.value = '';
            return;
        }
        state.paleta = colores;
        state.paletaNombre = file.name.replace(/\.[^.]+$/, '');
        renderizarPaleta();
        toast(`Paleta cargada: ${state.paletaNombre}`, 'success');
        e.target.value = '';
    });

    document.getElementById('btnPaletaDefault')?.addEventListener('click', () => {
        state.paleta = [...PALETA_PICO8];
        state.paletaNombre = 'PICO-8';
        renderizarPaleta();
        toast('Paleta restaurada', 'info');
    });

    // Capas
    document.getElementById('btnCapaNueva')?.addEventListener('click', () => {
        const frame = frameActual();
        frame.capas.push(crearCapaVacia(`Capa ${frame.capas.length + 1}`));
        state.capaActiva = frame.capas.length - 1;
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });
    document.getElementById('btnCapaArriba')?.addEventListener('click', () => {
        const frame = frameActual();
        const i = state.capaActiva;
        if (i >= frame.capas.length - 1) return;
        [frame.capas[i], frame.capas[i+1]] = [frame.capas[i+1], frame.capas[i]];
        state.capaActiva = i + 1;
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });
    document.getElementById('btnCapaAbajo')?.addEventListener('click', () => {
        const frame = frameActual();
        const i = state.capaActiva;
        if (i <= 0) return;
        [frame.capas[i], frame.capas[i-1]] = [frame.capas[i-1], frame.capas[i]];
        state.capaActiva = i - 1;
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });
    document.getElementById('btnCapaEliminar')?.addEventListener('click', () => {
        const frame = frameActual();
        if (frame.capas.length <= 1) { toast('Debe haber al menos 1 capa', 'error'); return; }
        frame.capas.splice(state.capaActiva, 1);
        state.capaActiva = Math.min(state.capaActiva, frame.capas.length - 1);
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });

    // Frames
    document.getElementById('btnFrameNuevo')?.addEventListener('click', () => {
        state.frames.push(crearFrameNuevo());
        state.frameActivo = state.frames.length - 1;
        state.capaActiva = 0;
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });
    document.getElementById('btnFrameDuplicar')?.addEventListener('click', () => {
        const frame = frameActual();
        const copia = {
            capas: frame.capas.map(c => ({
                nombre: c.nombre,
                pixeles: [...c.pixeles],
                visible: c.visible,
                opacidad: c.opacidad
            })),
            historia: [],
            historiaIdx: -1
        };
        state.frames.splice(state.frameActivo + 1, 0, copia);
        state.frameActivo++;
        state.capaActiva = 0;
        render(); renderCapas(); renderFrames(); guardarHistoria();
    });
    document.getElementById('btnFrameEliminar')?.addEventListener('click', () => {
        if (state.frames.length <= 1) { toast('Debe quedar al menos un frame', 'error'); return; }
        if (!confirm('¿Eliminar este frame?')) return;
        state.frames.splice(state.frameActivo, 1);
        state.frameActivo = Math.max(0, state.frameActivo - 1);
        state.capaActiva = 0;
        render(); renderCapas(); renderFrames(); actualizarBotonesHistorial();
    });

    // ============ MODAL NUEVO ============
    let tamañoNuevoSeleccionado = 32;
    document.querySelectorAll('.px-preset-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.px-preset-btn').forEach(x => x.classList.remove('activo'));
            b.classList.add('activo');
            tamañoNuevoSeleccionado = parseInt(b.dataset.size, 10);
            document.getElementById('customSize').value = '';
        });
    });
    document.getElementById('btnCustomSize')?.addEventListener('click', () => {
        const val = parseInt(document.getElementById('customSize').value, 10);
        if (isNaN(val) || val < 8 || val > 256) {
            toast('Usa un tamaño entre 8 y 256', 'error');
            return;
        }
        tamañoNuevoSeleccionado = val;
        document.querySelectorAll('.px-preset-btn').forEach(x => x.classList.remove('activo'));
    });
    document.getElementById('btnCancelarNuevo')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = true;
    });
    document.getElementById('btnConfirmarNuevo')?.addEventListener('click', () => {
        crearProyecto(tamañoNuevoSeleccionado);
        document.getElementById('modalNuevo').hidden = true;
        toast('Proyecto creado', 'success');
    });
    document.getElementById('modalNuevoCerrar')?.addEventListener('click', () => {
        document.getElementById('modalNuevo').hidden = true;
    });

    // ============ MODAL EXPORTAR ============
    document.querySelectorAll('.px-escala-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.px-escala-btn').forEach(x => x.classList.remove('activo'));
            b.classList.add('activo');
            state.exportEscala = parseInt(b.dataset.escala, 10);
            actualizarPreviewInfo();
        });
    });
    document.querySelectorAll('.px-modo-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.px-modo-btn').forEach(x => x.classList.remove('activo'));
            b.classList.add('activo');
            state.exportModo = b.dataset.modo;
            const grupoPad = document.getElementById('grupoPadding');
            if (grupoPad) grupoPad.hidden = state.exportModo !== 'grid';
            actualizarPreviewInfo();
        });
    });
    document.getElementById('inputPadding')?.addEventListener('input', (e) => {
        state.exportPadding = Math.max(0, parseInt(e.target.value, 10) || 0);
        actualizarPreviewInfo();
    });
    document.getElementById('btnCancelarExportar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });
    document.getElementById('modalExportarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });
    document.getElementById('btnDescargarPNG')?.addEventListener('click', () => {
        const c = generarImagenExport();
        const a = document.createElement('a');
        a.download = `pixevan_${Date.now()}.png`;
        a.href = c.toDataURL('image/png');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        document.getElementById('modalExportar').hidden = true;
        toast('PNG descargado', 'success');
    });
    document.getElementById('btnGuardarGaleria')?.addEventListener('click', () => {
        const c = generarImagenExport();
        const mini = document.getElementById('miniPreviewGaleria');
        if (mini) {
            mini.innerHTML = '';
            const preview = document.createElement('canvas');
            preview.width = c.width;
            preview.height = c.height;
            preview.getContext('2d').drawImage(c, 0, 0);
            mini.appendChild(preview);
        }
        document.getElementById('modalExportar').hidden = true;
        document.getElementById('modalGuardarGaleria').hidden = false;
        const ahora = new Date();
        const tit = document.getElementById('inputTituloObra');
        if (tit) {
            tit.value = `PixelArt ${ahora.toLocaleDateString('es-CL')} ${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
            setTimeout(() => tit.focus(), 100);
        }
        if (window.lucide) window.lucide.createIcons();
    });

    // ============ MODAL GUARDAR GALERÍA ============
    document.getElementById('btnCancelarGaleria')?.addEventListener('click', () => {
        document.getElementById('modalGuardarGaleria').hidden = true;
    });
    document.getElementById('modalGuardarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalGuardarGaleria').hidden = true;
    });
    document.getElementById('btnConfirmarGuardarGaleria')?.addEventListener('click', guardarEnGaleriaHandler);

    // ============ ESC general para modales ============
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const abiertos = ['modalNuevo','modalExportar','modalGuardarGaleria'];
        for (const id of abiertos) {
            const m = document.getElementById(id);
            if (m && !m.hidden) { m.hidden = true; return; }
        }
    });

    // Click fuera para cerrar
    ['modalNuevo','modalExportar','modalGuardarGaleria'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) m.hidden = true;
        });
    });

    window.addEventListener('resize', aplicarPanZoom);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    // Guardar silenciosamente por si el usuario cierra sin apretar Guardar
    if (usuarioActual && state.frames.length > 0) {
        guardarProyectoLocal().catch(() => {});
    }
});
