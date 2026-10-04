// ============================================================
//  TillyPorgrafo — Diseñador de fuentes TTF
//  ------------------------------------------------------------
//  · Canvas 100×100 por glyph, pixel art con guides
//  · Trazado de contornos (contour tracing) para convertir
//    el bitmap a curvas vectoriales que el TTF pueda usar
//  · Export a TTF real vía opentype.js
//  · Persistencia: IndexedDB por usuario
// ============================================================

'use strict';

// ============================================================
//  CONSTANTES
// ============================================================
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsTillyPorgrafo';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';

const GRID_W = 100;
const GRID_H = 100;
const CELL_SIZE = 10;      // unidades de fuente por celda (em=1000)
const BASELINE_ROW = 80;   // fila (grid) donde se apoyan las letras

// Filas de las guías (en grid)
const GUIAS = {
    ascender:  5,     // fontY = (80-5)*10  = 750
    capHeight: 15,    // fontY = (80-15)*10 = 650
    xHeight:   30,    // fontY = (80-30)*10 = 500
    baseline:  80,    // fontY = 0
    descender: 98     // fontY = (80-98)*10 = -180
};

const MAX_UNDO = 30;

// Rangos de glyphs soportados
const CHARS_MAYUS  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CHARS_MINUS  = 'abcdefghijklmnopqrstuvwxyz';
const CHARS_NUMS   = '0123456789';
const CHARS_SIGNOS = ' .,!?\'"-:;()';
const TOTAL_CHARS  = CHARS_MAYUS.length + CHARS_MINUS.length + CHARS_NUMS.length + CHARS_SIGNOS.length;

// ============================================================
//  API
// ============================================================
const API = () => window.parent.__vicwebos || null;

// ============================================================
//  ESTADO
// ============================================================
const state = {
    // Glyphs: { codepoint: Uint8Array(GRID_W * GRID_H) }
    glyphs: {},
    codepointActual: 'A'.charCodeAt(0),

    herramienta: 'lapiz',
    tamano: 1,

    mostrarGuias: true,
    mostrarCuadricula: true,

    fontName: 'MiFuente',

    undoStack: [],
    redoStack: [],

    dibujando: false,
    formaStart: null,
    formaSnapshot: null,
    ultimoPunto: null
};

let usuarioActual = null;
let canvas = null;
let ctx = null;
let cellSize = 6; // se recalcula en resize
let offsetX = 0;
let offsetY = 0;
let toastTimeout = null;
let lastPreviewUrl = null;
let previewDebounce = null;

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
        render();
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('tpToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'tp-toast show ' + tipo;
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
    return 'tp_' + (usuarioActual?.codigo || 'invitado');
}

// ============================================================
//  GLYPH MANAGEMENT
// ============================================================
function glyphVacio() {
    return new Uint8Array(GRID_W * GRID_H);
}

function obtenerGlyph(cp) {
    const k = String(cp);
    if (!state.glyphs[k]) state.glyphs[k] = glyphVacio();
    return state.glyphs[k];
}

function glyphTieneContenido(cp) {
    const k = String(cp);
    const g = state.glyphs[k];
    if (!g) return false;
    for (let i = 0; i < g.length; i++) if (g[i]) return true;
    return false;
}

function contarDibujadas() {
    let n = 0;
    for (const k of Object.keys(state.glyphs)) {
        if (glyphTieneContenido(Number(k))) n++;
    }
    return n;
}

function cambiarGlyph(cp) {
    if (cp === state.codepointActual) return;
    state.codepointActual = cp;
    state.undoStack = [];
    state.redoStack = [];
    state.dibujando = false;
    state.formaStart = null;
    state.formaSnapshot = null;
    state.ultimoPunto = null;

    // Actualizar UI
    document.querySelectorAll('.tp-letra-btn').forEach(b => {
        b.classList.toggle('activo', Number(b.dataset.cp) === cp);
    });

    const label = document.getElementById('tpCanvasLabel');
    if (label) {
        const ch = String.fromCharCode(cp);
        label.textContent = ch === ' ' ? '(espacio)' : ch;
    }

    render();
    actualizarBotonesUndoRedo();
}

// ============================================================
//  CONVERSIÓN DE COORDENADAS
// ============================================================
function gridToCanvasX(gx) { return offsetX + gx * cellSize; }
function gridToCanvasY(gy) { return offsetY + gy * cellSize; }

function canvasToGrid(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - offsetX) / cellSize;
    const y = (clientY - rect.top - offsetY) / cellSize;
    return { x: Math.floor(x), y: Math.floor(y) };
}

function gridToFontX(gx) { return gx * CELL_SIZE; }
function gridToFontY(gy) { return (BASELINE_ROW - gy) * CELL_SIZE; }

// ============================================================
//  RENDER DEL CANVAS
// ============================================================
function calcularTamano() {
    const wrap = document.getElementById('tpCanvasWrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const size = Math.max(200, Math.min(rect.width, rect.height));
    cellSize = Math.max(2, Math.floor(size / GRID_W));
    const cw = cellSize * GRID_W;
    const ch = cellSize * GRID_H;
    canvas.width = cw;
    canvas.height = ch;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    offsetX = 0;
    offsetY = 0;
}

function render() {
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    // 1. Fondo
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // 2. Cuadrícula
    if (state.mostrarCuadricula) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= GRID_W; x++) {
            ctx.beginPath();
            ctx.moveTo(Math.round(gridToCanvasX(x)) + 0.5, 0);
            ctx.lineTo(Math.round(gridToCanvasX(x)) + 0.5, H);
            ctx.stroke();
        }
        for (let y = 0; y <= GRID_H; y++) {
            ctx.beginPath();
            ctx.moveTo(0, Math.round(gridToCanvasY(y)) + 0.5);
            ctx.lineTo(W, Math.round(gridToCanvasY(y)) + 0.5);
            ctx.stroke();
        }
    }

    // 3. Píxeles dibujados
    const glyph = obtenerGlyph(state.codepointActual);
    ctx.fillStyle = '#000000';
    for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
            if (!glyph[y * GRID_W + x]) continue;
            ctx.fillRect(
                gridToCanvasX(x),
                gridToCanvasY(y),
                cellSize,
                cellSize
            );
        }
    }

    // 4. Guías
    if (state.mostrarGuias) {
        dibujarGuia(GUIAS.ascender,  '#A78BFA', 'Ascendente');
        dibujarGuia(GUIAS.capHeight, '#8B5CF6', 'Mayúscula');
        dibujarGuia(GUIAS.xHeight,   '#C4B5FD', 'x-height');
        dibujarGuia(GUIAS.baseline,  '#EF4444', 'Base');
        dibujarGuia(GUIAS.descender, '#F97316', 'Descendente');
    }

    // 5. Centro vertical (opcional)
    // nada por ahora
}

function dibujarGuia(row, color, label) {
    const y = Math.round(gridToCanvasY(row)) + 0.5;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// ============================================================
//  DIBUJO — operaciones
// ============================================================
function setPixel(x, y, val) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    const glyph = obtenerGlyph(state.codepointActual);
    const i = y * GRID_W + x;
    if (glyph[i] === val) return false;
    glyph[i] = val;
    return true;
}

function pintarPincel(cx, cy, val) {
    const s = state.tamano;
    const off = Math.floor((s - 1) / 2);
    let cambio = false;
    for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
            if (setPixel(cx + dx - off, cy + dy - off, val)) cambio = true;
        }
    }
    return cambio;
}

function lineaBresenham(x0, y0, x1, y1, val) {
    x0 = Math.floor(x0); y0 = Math.floor(y0);
    x1 = Math.floor(x1); y1 = Math.floor(y1);

    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let cambio = false;

    while (true) {
        if (pintarPincel(x0, y0, val)) cambio = true;
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return cambio;
}

function dibujarRect(x0, y0, x1, y1, val) {
    const xmin = Math.min(x0, x1), xmax = Math.max(x0, x1);
    const ymin = Math.min(y0, y1), ymax = Math.max(y0, y1);
    let cambio = false;
    for (let x = xmin; x <= xmax; x++) {
        if (pintarPincel(x, ymin, val)) cambio = true;
        if (pintarPincel(x, ymax, val)) cambio = true;
    }
    for (let y = ymin; y <= ymax; y++) {
        if (pintarPincel(xmin, y, val)) cambio = true;
        if (pintarPincel(xmax, y, val)) cambio = true;
    }
    return cambio;
}

function floodFill(x0, y0, val) {
    if (x0 < 0 || y0 < 0 || x0 >= GRID_W || y0 >= GRID_H) return false;
    const glyph = obtenerGlyph(state.codepointActual);
    const i0 = y0 * GRID_W + x0;
    const oldVal = glyph[i0];
    if (oldVal === val) return false;

    const stack = [[x0, y0]];
    const visited = new Uint8Array(GRID_W * GRID_H);
    let cambio = false;

    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
        const i = y * GRID_W + x;
        if (visited[i]) continue;
        visited[i] = 1;
        if (glyph[i] !== oldVal) continue;
        glyph[i] = val;
        cambio = true;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return cambio;
}

// ============================================================
//  UNDO / REDO
// ============================================================
function snapshotGlyph() {
    return new Uint8Array(obtenerGlyph(state.codepointActual));
}

function pushUndo() {
    state.undoStack.push(snapshotGlyph());
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
    actualizarBotonesUndoRedo();
}

function deshacer() {
    if (state.undoStack.length === 0) return;
    const actual = snapshotGlyph();
    state.redoStack.push(actual);
    const prev = state.undoStack.pop();
    state.glyphs[String(state.codepointActual)] = prev;
    render();
    actualizarBotonesUndoRedo();
    actualizarLetrasGrid();
}

function rehacer() {
    if (state.redoStack.length === 0) return;
    const actual = snapshotGlyph();
    state.undoStack.push(actual);
    const next = state.redoStack.pop();
    state.glyphs[String(state.codepointActual)] = next;
    render();
    actualizarBotonesUndoRedo();
    actualizarLetrasGrid();
}

function actualizarBotonesUndoRedo() {
    const d = document.getElementById('btnDeshacerMobile');
    const r = document.getElementById('btnRehacerMobile');
    if (d) d.disabled = state.undoStack.length === 0;
    if (r) r.disabled = state.redoStack.length === 0;
}

// ============================================================
//  POINTER EVENTS
// ============================================================
function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    const { x, y } = canvasToGrid(e.clientX, e.clientY);

    if (state.herramienta === 'fill') {
        pushUndo();
        if (floodFill(x, y, 1)) {
            render();
            actualizarLetrasGrid();
            schedulePreviewUpdate();
        }
        return;
    }

    if (state.herramienta === 'linea' || state.herramienta === 'rect') {
        pushUndo();
        state.formaStart = { x, y };
        state.formaSnapshot = snapshotGlyph();
        state.dibujando = true;
        return;
    }

    // Lápiz / Borrador
    pushUndo();
    state.dibujando = true;
    state.ultimoPunto = { x, y };
    const val = state.herramienta === 'borrador' ? 0 : 1;
    pintarPincel(x, y, val);
    render();
}

function onPointerMove(e) {
    if (!state.dibujando) return;
    e.preventDefault();

    const { x, y } = canvasToGrid(e.clientX, e.clientY);
    const val = state.herramienta === 'borrador' ? 0 : 1;

    if (state.herramienta === 'linea' || state.herramienta === 'rect') {
        // Restaurar snapshot y dibujar preview
        const glyph = obtenerGlyph(state.codepointActual);
        glyph.set(state.formaSnapshot);
        const s = state.formaStart;
        if (state.herramienta === 'linea') {
            lineaBresenham(s.x, s.y, x, y, 1);
        } else {
            dibujarRect(s.x, s.y, x, y, 1);
        }
        render();
        return;
    }

    // Lápiz / Borrador
    let eventos = [e];
    if (e.getCoalescedEvents) {
        const co = e.getCoalescedEvents();
        if (co.length > 0) eventos = co;
    }
    let cambio = false;
    eventos.forEach(ev => {
        const p = canvasToGrid(ev.clientX, ev.clientY);
        if (state.ultimoPunto) {
            if (lineaBresenham(state.ultimoPunto.x, state.ultimoPunto.y, p.x, p.y, val)) cambio = true;
        } else {
            if (pintarPincel(p.x, p.y, val)) cambio = true;
        }
        state.ultimoPunto = p;
    });
    if (cambio) render();
}

function onPointerUp() {
    if (!state.dibujando) return;
    state.dibujando = false;
    state.ultimoPunto = null;
    state.formaStart = null;
    state.formaSnapshot = null;
    render();
    actualizarBotonesUndoRedo();
    actualizarLetrasGrid();
    schedulePreviewUpdate();
}

// ============================================================
//  CAMBIAR HERRAMIENTA / TAMAÑO
// ============================================================
function activarHerramienta(t) {
    state.herramienta = t;
    document.querySelectorAll('.tp-tool-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.tool === t);
    });
    document.querySelectorAll('.tp-tool-nav').forEach(b => {
        if (['lapiz','borrador','fill'].includes(b.dataset.accion)) {
            b.classList.toggle('activo', b.dataset.accion === t);
        }
    });
}

function setTamano(s) {
    state.tamano = s;
    document.querySelectorAll('.tp-size-btn').forEach(b => {
        b.classList.toggle('activo', parseInt(b.dataset.size, 10) === s);
    });
}

function limpiarLetra() {
    if (!glyphTieneContenido(state.codepointActual)) {
        toast('Esta letra ya está vacía', 'info');
        return;
    }
    if (!confirm(`¿Limpiar el dibujo de "${String.fromCharCode(state.codepointActual)}"?`)) return;
    pushUndo();
    state.glyphs[String(state.codepointActual)] = glyphVacio();
    render();
    actualizarLetrasGrid();
    schedulePreviewUpdate();
}

// ============================================================
//  GRID DE LETRAS (selector)
// ============================================================
function crearBotonLetra(ch) {
    const btn = document.createElement('button');
    btn.className = 'tp-letra-btn';
    btn.dataset.cp = String(ch.charCodeAt(0));
    btn.textContent = ch === ' ' ? '␣' : ch;
    btn.title = ch === ' ' ? 'Espacio' : ch;
    btn.addEventListener('click', () => cambiarGlyph(ch.charCodeAt(0)));
    if (ch.charCodeAt(0) === state.codepointActual) btn.classList.add('activo');
    if (glyphTieneContenido(ch.charCodeAt(0))) btn.classList.add('dibujada');
    return btn;
}

function construirLetrasGrids() {
    const contMayus = document.getElementById('tpGridMayus');
    const contMinus = document.getElementById('tpGridMinus');
    const contNums  = document.getElementById('tpGridNums');
    const contSignos = document.getElementById('tpGridSignos');

    contMayus.innerHTML = '';
    contMinus.innerHTML = '';
    contNums.innerHTML = '';
    contSignos.innerHTML = '';

    for (const c of CHARS_MAYUS)  contMayus.appendChild(crearBotonLetra(c));
    for (const c of CHARS_MINUS)  contMinus.appendChild(crearBotonLetra(c));
    for (const c of CHARS_NUMS)   contNums.appendChild(crearBotonLetra(c));
    for (const c of CHARS_SIGNOS) contSignos.appendChild(crearBotonLetra(c));
}

function actualizarLetrasGrid() {
    document.querySelectorAll('.tp-letra-btn').forEach(b => {
        const cp = Number(b.dataset.cp);
        b.classList.toggle('dibujada', glyphTieneContenido(cp));
        b.classList.toggle('activo', cp === state.codepointActual);
    });

    const contador = document.getElementById('tpContadorLetras');
    if (contador) {
        contador.textContent = `${contarDibujadas()} / ${TOTAL_CHARS}`;
    }
}

// ============================================================
//  CONTOUR TRACING — bitmap → contornos vectoriales
//  ------------------------------------------------------------
//  Extrae los bordes de la región rellena y los encadena en
//  polígonos cerrados. Regla de preferencia: giro a la derecha
//  para "abrazar" la región. Los huecos quedan con orientación
//  opuesta, respetando la convención de non-zero winding de TTF.
// ============================================================
function trazarContornos(bitmap, w, h) {
    const key = (x, y) => x + ',' + y;
    const parseKey = (k) => {
        const i = k.indexOf(',');
        return [parseInt(k.slice(0, i), 10), parseInt(k.slice(i + 1), 10)];
    };

    // edges: Map<fromKey, Array<toKey>>
    const edges = new Map();
    const addEdge = (fx, fy, tx, ty) => {
        const k = key(fx, fy);
        let arr = edges.get(k);
        if (!arr) { arr = []; edges.set(k, arr); }
        arr.push(key(tx, ty));
    };

    for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
            if (!bitmap[py * w + px]) continue;
            // Top: si arriba está vacío
            if (py === 0 || !bitmap[(py - 1) * w + px]) {
                addEdge(px, py, px + 1, py);
            }
            // Right
            if (px === w - 1 || !bitmap[py * w + (px + 1)]) {
                addEdge(px + 1, py, px + 1, py + 1);
            }
            // Bottom
            if (py === h - 1 || !bitmap[(py + 1) * w + px]) {
                addEdge(px + 1, py + 1, px, py + 1);
            }
            // Left
            if (px === 0 || !bitmap[py * w + (px - 1)]) {
                addEdge(px, py + 1, px, py);
            }
        }
    }

    const used = new Map(); // fromKey -> Set<toKey>
    const isUsed = (fk, tk) => used.has(fk) && used.get(fk).has(tk);
    const markUsed = (fk, tk) => {
        if (!used.has(fk)) used.set(fk, new Set());
        used.get(fk).add(tk);
    };

    const contours = [];

    for (const [startKey, tos] of edges) {
        for (const firstTo of tos) {
            if (isUsed(startKey, firstTo)) continue;

            const contour = [];
            let curFrom = startKey;
            let curTo = firstTo;
            let safety = 0;

            while (safety++ < 100000) {
                markUsed(curFrom, curTo);
                const [fx, fy] = parseKey(curFrom);
                contour.push([fx, fy]);

                if (curTo === startKey) break;

                const nextOuts = edges.get(curTo);
                if (!nextOuts || nextOuts.length === 0) break;

                const [tx, ty] = parseKey(curTo);
                const dx = tx - fx;
                const dy = ty - fy;

                // En Y-down: right(dx,dy) = (-dy, dx), left = (dy, -dx)
                const prefOrder = [
                    [-dy, dx],   // right
                    [dx, dy],    // straight
                    [dy, -dx]    // left
                ];

                let chosen = null;
                for (const [pdx, pdy] of prefOrder) {
                    const targetKey = key(tx + pdx, ty + pdy);
                    if (nextOuts.includes(targetKey) && !isUsed(curTo, targetKey)) {
                        chosen = targetKey;
                        break;
                    }
                }

                if (!chosen) break;
                curFrom = curTo;
                curTo = chosen;
            }

            if (contour.length >= 4) {
                contours.push(simplificarContorno(contour));
            }
        }
    }

    return contours;
}

function simplificarContorno(contour) {
    const n = contour.length;
    if (n < 4) return contour;
    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = contour[(i - 1 + n) % n];
        const cur = contour[i];
        const next = contour[(i + 1) % n];
        const dx1 = cur[0] - prev[0];
        const dy1 = cur[1] - prev[1];
        const dx2 = next[0] - cur[0];
        const dy2 = next[1] - cur[1];
        // No colineal?
        if (dx1 * dy2 - dy1 * dx2 !== 0) out.push(cur);
    }
    return out;
}

// ============================================================
//  CONSTRUCCIÓN DEL TTF
// ============================================================
function nombreGlyph(cp) {
    return 'uni' + cp.toString(16).toUpperCase().padStart(4, '0');
}

function construirFuente() {
    if (typeof opentype === 'undefined') {
        throw new Error('opentype.js no está disponible.');
    }

    const glyphs = [];

    // .notdef
    const notdefPath = new opentype.Path();
    notdefPath.moveTo(50, -50);
    notdefPath.lineTo(500, -50);
    notdefPath.lineTo(500, 700);
    notdefPath.lineTo(50, 700);
    notdefPath.close();
    glyphs.push(new opentype.Glyph({
        name: '.notdef',
        unicode: 0,
        advanceWidth: 550,
        path: notdefPath
    }));

    // space
    glyphs.push(new opentype.Glyph({
        name: 'space',
        unicode: 32,
        advanceWidth: 400,
        path: new opentype.Path()
    }));

    // Glyphs dibujados
    const cps = Object.keys(state.glyphs).map(Number).sort((a, b) => a - b);
    for (const cp of cps) {
        if (cp === 32) continue;
        if (!glyphTieneContenido(cp)) continue;

        const bitmap = state.glyphs[String(cp)];
        const contours = trazarContornos(bitmap, GRID_W, GRID_H);
        if (contours.length === 0) continue;

        const path = new opentype.Path();
        let minX = Infinity, maxX = -Infinity;

        for (const c of contours) {
            if (c.length < 3) continue;
            const [x0, y0] = c[0];
            path.moveTo(gridToFontX(x0), gridToFontY(y0));
            if (x0 < minX) minX = x0;
            if (x0 > maxX) maxX = x0;
            for (let i = 1; i < c.length; i++) {
                const [x, y] = c[i];
                path.lineTo(gridToFontX(x), gridToFontY(y));
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
            }
            path.close();
        }

        const advance = (maxX >= 0)
            ? Math.max(300, Math.min(1100, (maxX + 4) * CELL_SIZE))
            : 600;

        glyphs.push(new opentype.Glyph({
            name: nombreGlyph(cp),
            unicode: cp,
            advanceWidth: advance,
            path: path
        }));
    }

    const familyName = (state.fontName || 'MiFuente').trim().slice(0, 40) || 'MiFuente';

    return new opentype.Font({
        familyName: familyName,
        styleName: 'Regular',
        unitsPerEm: 1000,
        ascender: 750,
        descender: -200,
        glyphs: glyphs
    });
}

function descargarTTF() {
    try {
        const font = construirFuente();
        const buffer = font.toArrayBuffer();
        const blob = new Blob([buffer], { type: 'font/ttf' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safe = (state.fontName || 'mifuente').replace(/[^a-z0-9_-]/gi, '_');
        a.href = url;
        a.download = safe + '.ttf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        toast('Fuente descargada', 'success');
        document.getElementById('modalExportar').hidden = true;
    } catch (e) {
        console.warn('[TillyPorgrafo] Error exportando:', e);
        toast(e.message || 'No se pudo exportar la fuente', 'error');
    }
}

// ============================================================
//  PREVIEW
// ============================================================
function schedulePreviewUpdate() {
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(actualizarPreview, 600);
}

async function actualizarPreview() {
    const el = document.getElementById('tpPreviewRender');
    if (!el) return;

    const texto = (document.getElementById('tpPreviewText')?.value || 'Hola').slice(0, 80);
    el.textContent = texto || 'Escribí algo...';

    // Si no hay glyphs dibujados, no intentes cargar la fuente
    if (contarDibujadas() === 0) {
        el.style.fontFamily = "'Nunito', sans-serif";
        el.style.opacity = '0.5';
        return;
    }
    el.style.opacity = '1';

    try {
        const font = construirFuente();
        const buffer = font.toArrayBuffer();
        const blob = new Blob([buffer], { type: 'font/ttf' });
        const url = URL.createObjectURL(blob);

        const familyName = 'TP_Preview_' + Date.now();
        const face = new FontFace(familyName, `url(${url})`);
        await face.load();
        document.fonts.add(face);

        el.style.fontFamily = `'${familyName}', monospace`;

        if (lastPreviewUrl) {
            try { URL.revokeObjectURL(lastPreviewUrl); } catch (e) {}
        }
        lastPreviewUrl = url;
    } catch (e) {
        console.warn('[TillyPorgrafo] Preview error:', e);
    }
}

// ============================================================
//  GUARDAR / CARGAR
// ============================================================
async function guardarProyectoHandler() {
    try {
        const glyphsSerial = {};
        for (const k of Object.keys(state.glyphs)) {
            const g = state.glyphs[k];
            if (!g) continue;
            // Solo guardar si tiene contenido
            let has = false;
            for (let i = 0; i < g.length; i++) { if (g[i]) { has = true; break; } }
            if (has) glyphsSerial[k] = Array.from(g);
        }

        await idbSet(claveProyecto(), {
            version: 1,
            gridW: GRID_W,
            gridH: GRID_H,
            fontName: state.fontName,
            glyphs: glyphsSerial,
            fecha: new Date().toISOString()
        });

        toast('Proyecto guardado', 'success');
    } catch (e) {
        console.warn('[TillyPorgrafo] Guardar falló:', e);
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
    state.glyphs = {};
    if (data.glyphs) {
        for (const k of Object.keys(data.glyphs)) {
            const arr = data.glyphs[k];
            if (Array.isArray(arr)) {
                state.glyphs[k] = new Uint8Array(arr);
            }
        }
    }
    if (data.fontName) {
        state.fontName = data.fontName;
        const nameInput = document.getElementById('tpFontName');
        const expInput = document.getElementById('tpExportName');
        if (nameInput) nameInput.value = data.fontName;
        if (expInput) expInput.value = data.fontName;
    }
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
//  UI MÓVIL — panel deslizable + toolbar
// ============================================================
function inicializarUIMovil() {
    const panel = document.getElementById('tpPanel');
    const titulo = document.getElementById('tpPanelTitulo');
    const toolbar = document.getElementById('tpToolbar');
    if (!panel || !toolbar) return;

    const titulos = {
        herramientas: { icono: 'pencil', texto: 'Herramientas' },
        letras: { icono: 'type', texto: 'Letras' },
        ajustes: { icono: 'settings-2', texto: 'Ajustes' }
    };

    function abrirPanel(tab) {
        panel.querySelectorAll('.tp-panel-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tab);
        });
        panel.querySelectorAll('.tp-seccion').forEach(s => {
            s.classList.toggle('activa', s.dataset.seccion === tab);
        });
        const info = titulos[tab] || titulos.herramientas;
        if (titulo) {
            titulo.innerHTML = `<i data-lucide="${info.icono}"></i><span>${info.texto}</span>`;
            if (window.lucide) window.lucide.createIcons();
        }
        panel.classList.add('abierto');
    }

    function cerrarPanel() { panel.classList.remove('abierto'); }

    panel.querySelectorAll('.tp-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => abrirPanel(tab.dataset.tab));
    });

    document.getElementById('tpPanelCerrar')?.addEventListener('click', cerrarPanel);
    panel.addEventListener('click', (e) => {
        if (e.target === panel) cerrarPanel();
    });

    toolbar.querySelectorAll('.tp-tool-nav').forEach(btn => {
        btn.addEventListener('click', () => {
            const a = btn.dataset.accion;
            if (['lapiz','borrador','fill'].includes(a)) {
                activarHerramienta(a);
                return;
            }
            if (a === 'deshacer') { deshacer(); return; }
            if (a === 'rehacer') { rehacer(); return; }
            if (a === 'limpiar') { limpiarLetra(); return; }
            if (a === 'letras' || a === 'ajustes') abrirPanel(a);
        });
    });
}

// ============================================================
//  WIRING DE UI
// ============================================================
function wireUI() {
    document.getElementById('btnAyuda')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('btnGuardar')?.addEventListener('click', guardarProyectoHandler);

    document.getElementById('btnExportar')?.addEventListener('click', () => {
        const n = contarDibujadas();
        const el = document.getElementById('tpExportDibujadas');
        const warn = document.getElementById('tpExportWarning');
        const warnTxt = document.getElementById('tpExportWarningTxt');
        const exp = document.getElementById('tpExportName');
        if (el) el.textContent = n;
        if (exp) exp.value = state.fontName || 'MiFuente';
        if (warn && warnTxt) {
            if (n === 0) {
                warn.hidden = false;
                warnTxt.textContent = 'Dibujá al menos una letra antes de exportar.';
            } else {
                warn.hidden = true;
            }
        }
        document.getElementById('modalExportar').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });

    // Tabs del panel (desktop)
    document.querySelectorAll('.tp-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tp-panel-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.tp-seccion').forEach(s => {
                s.classList.toggle('activa', s.dataset.seccion === tab.dataset.tab);
            });
        });
    });

    // Tools
    document.querySelectorAll('.tp-tool-btn').forEach(b => {
        b.addEventListener('click', () => activarHerramienta(b.dataset.tool));
    });

    // Sizes
    document.querySelectorAll('.tp-size-btn').forEach(b => {
        b.addEventListener('click', () => setTamano(parseInt(b.dataset.size, 10)));
    });

    // Limpiar letra
    document.getElementById('btnLimpiarLetra')?.addEventListener('click', limpiarLetra);

    // Guías / cuadrícula
    document.getElementById('toggleGuias')?.addEventListener('change', (e) => {
        state.mostrarGuias = e.target.checked;
        render();
    });
    document.getElementById('toggleCuadricula')?.addEventListener('change', (e) => {
        state.mostrarCuadricula = e.target.checked;
        render();
    });

    // Nombre de la fuente
    document.getElementById('tpFontName')?.addEventListener('input', (e) => {
        state.fontName = e.target.value;
    });

    // Preview
    document.getElementById('tpPreviewText')?.addEventListener('input', () => {
        schedulePreviewUpdate();
    });
    document.getElementById('btnRefrescarPreview')?.addEventListener('click', () => {
        actualizarPreview();
        toast('Vista previa actualizada', 'info');
    });

    // Export modal
    document.getElementById('modalExportarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });
    document.getElementById('btnCancelarExport')?.addEventListener('click', () => {
        document.getElementById('modalExportar').hidden = true;
    });
    document.getElementById('btnConfirmarExport')?.addEventListener('click', () => {
        if (contarDibujadas() === 0) {
            toast('Dibujá al menos una letra', 'error');
            return;
        }
        const nameInput = document.getElementById('tpExportName');
        if (nameInput) state.fontName = (nameInput.value || 'MiFuente').trim() || 'MiFuente';
        descargarTTF();
    });

    // Ayuda modal
    document.getElementById('modalAyudaCerrar')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = true;
    });

    // Click fuera para cerrar modales
    ['modalSesion', 'modalAyuda', 'modalExportar'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target === m) m.hidden = true;
        });
    });

    // Pointer events en el canvas
    canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', () => {
        if (state.dibujando) onPointerUp();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Resize
    window.addEventListener('resize', () => {
        calcularTamano();
        render();
    });
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            calcularTamano();
            render();
        });
        const wrap = document.getElementById('tpCanvasWrap');
        if (wrap) ro.observe(wrap);
    }
}

// ============================================================
//  TECLADO
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
    const shortcuts = { b: 'lapiz', e: 'borrador', l: 'linea', r: 'rect', g: 'fill' };
    if (shortcuts[k]) { activarHerramienta(shortcuts[k]); return; }
    if (k === '1') { setTamano(1); return; }
    if (k === '2') { setTamano(2); return; }
    if (k === '3') { setTamano(3); return; }
    if (k === '4') { setTamano(4); return; }
});

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    if (typeof opentype === 'undefined') {
        console.warn('[TillyPorgrafo] opentype.js no se cargó. La exportación no funcionará.');
    }

    const api = API();
    if (!api) { alert('TillyPorgrafo necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar TillyPorgrafo.'); return; }

    const badge = document.getElementById('tpUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    canvas = document.getElementById('tpCanvas');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    calcularTamano();

    // Cargar proyecto
    let proyectoCargado = false;
    try {
        const guardado = await cargarProyectoLocal();
        if (guardado && guardado.glyphs) {
            const decision = await preguntarContinuarSesion(guardado);
            if (decision === 'continuar') {
                cargarProyectoDesdeData(guardado);
                toast('Proyecto restaurado', 'success');
                proyectoCargado = true;
            } else if (decision === 'descartar') {
                await borrarProyectoLocal();
            }
        }
    } catch (e) { console.warn(e); }

    if (!proyectoCargado) {
        state.glyphs = {};
    }

    // UI
    construirLetrasGrids();
    inicializarUIMovil();
    wireUI();

    // Establecer glyph actual
    cambiarGlyph('A'.charCodeAt(0));
    actualizarLetrasGrid();

    // Init tool activo
    activarHerramienta('lapiz');
    setTamano(1);

    render();
    actualizarBotonesUndoRedo();

    // Preview inicial
    setTimeout(actualizarPreview, 400);

    // Guardar al salir
    window.addEventListener('pagehide', () => {
        if (!usuarioActual) return;
        const glyphsSerial = {};
        for (const k of Object.keys(state.glyphs)) {
            const g = state.glyphs[k];
            if (!g) continue;
            let has = false;
            for (let i = 0; i < g.length; i++) { if (g[i]) { has = true; break; } }
            if (has) glyphsSerial[k] = Array.from(g);
        }
        idbSet(claveProyecto(), {
            version: 1,
            gridW: GRID_W,
            gridH: GRID_H,
            fontName: state.fontName,
            glyphs: glyphsSerial,
            fecha: new Date().toISOString()
        }).catch(() => {});
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
