// ============================================================
//  Cevann — Editor de afiches temáticos
//  ------------------------------------------------------------
//  El usuario elige entre SUS temas instalados. El CSS del
//  tema se parsea (bloque :root) y las variables se aplican
//  inline al afiche. Los elementos son HTML/CSS puro, así
//  que el tema se aplica literalmente.
//
//  Export: el afiche se serializa a <foreignObject> SVG,
//  se embeben fuentes Nunito en base64, y se convierte a PNG.
//
//  Persistencia: IndexedDB (1 proyecto activo por usuario).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsCevann';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';
const ARCHIVO_BASE = 'app/cevann/';

// ============================================================
//  FORMATOS Y PADDINGS
// ============================================================
const FORMATOS = {
    cuadrado:   { w: 1080, h: 1080, nombre: 'Cuadrado' },
    post:       { w: 1080, h: 1350, nombre: 'Post' },
    historia:   { w: 1080, h: 1920, nombre: 'Historia' },
    horizontal: { w: 1920, h: 1080, nombre: 'Horizontal' },
    afiche:     { w: 1080, h: 1620, nombre: 'Afiche' },
    carta:      { w: 1080, h: 1400, nombre: 'Carta' }
};

const PADDINGS = {
    pequeno: 0.05,
    medio: 0.08,
    grande: 0.13
};

// ============================================================
//  VARS POR DEFECTO (fallback si el tema no define algo)
// ============================================================
const VARS_DEFAULT = {
    '--bg': '#FBFBFD',
    '--bg-alt': '#F5F5F8',
    '--white': '#FFFFFF',
    '--gray-50': '#FAFAFB',
    '--gray-100': '#F4F4F7',
    '--gray-200': '#E8E8EE',
    '--gray-300': '#D4D4DD',
    '--gray-400': '#A1A1AD',
    '--gray-500': '#71717A',
    '--gray-600': '#52525B',
    '--gray-700': '#3F3F46',
    '--gray-800': '#27272A',
    '--gray-900': '#18181B',
    '--text': '#18181B',
    '--text-2': '#52525B',
    '--text-3': '#71717A',
    '--border': '#E8E8EE',
    '--violet-50': '#F5F3FF',
    '--violet-100': '#EDE9FE',
    '--violet-200': '#DDD6FE',
    '--violet-300': '#C4B5FD',
    '--violet-400': '#A78BFA',
    '--violet-500': '#8B5CF6',
    '--violet-600': '#7C3AED',
    '--violet-700': '#6D28D9',
    '--accent-gradient': 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    '--accent-gradient-hover': 'linear-gradient(135deg, #8B5CF6, #7C3AED)'
};

// ============================================================
//  PROPS DEFAULT POR TIPO DE ELEMENTO
// ============================================================
const PROPS_DEFAULT = {
    titulo:     { texto: 'Tu título aquí', tamano: 84, alineacion: 'centro', color: null },
    subtitulo:  { texto: 'Subtítulo', tamano: 36, alineacion: 'centro', color: null },
    parrafo:    { texto: 'Escribe aquí el texto de tu párrafo. Podés usar varias líneas.', tamano: 26, alineacion: 'izq', color: null },
    imagen:     { imagenId: null, dataUrl: null, alto: 320, alineacion: 'centro', esquinas: 20 },
    avatar:     { imagenId: null, dataUrl: null, tamano: 140, alineacion: 'centro' },
    separador:  { estilo: 'linea', grosor: 3, color: null },
    badge:      { texto: 'NUEVO', tamano: 20, alineacion: 'centro', colorFondo: null, colorTexto: '#FFFFFF' },
    forma:      { tipo: 'circulo', tamano: 90, alineacion: 'centro', color: null },
    espaciador: { alto: 40 }
};

const ICONO_TIPO = {
    titulo: 'heading-1', subtitulo: 'heading-2', parrafo: 'type',
    imagen: 'image', avatar: 'user', separador: 'minus',
    badge: 'tag', forma: 'circle', espaciador: 'move-vertical'
};

const NOMBRE_TIPO = {
    titulo: 'Título', subtitulo: 'Subtítulo', parrafo: 'Párrafo',
    imagen: 'Imagen', avatar: 'Avatar', separador: 'Separador',
    badge: 'Badge', forma: 'Forma', espaciador: 'Espaciador'
};

// ============================================================
//  ESTADO
// ============================================================
let usuarioActual = null;
let state = {
    formato: 'cuadrado',
    temaId: 'violeta',
    temaVars: null,
    padding: 'medio',
    elementos: []
};

let cacheVarsTemas = new Map();   // ruta -> vars
let cacheFuentesBase64 = null;
let elementoExpandidoId = null;
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  TEMA (el propio del iframe, no el que se aplica al afiche)
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
    const el = document.getElementById('cvToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'cv-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HELPERS
// ============================================================
function escapeHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHTML(s);
}

function generarId() {
    return 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const result = String(r.result || '');
            const i = result.indexOf(',');
            resolve(i >= 0 ? result.slice(i + 1) : '');
        };
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
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
    return 'cv_' + codigo;
}

// ============================================================
//  TEMAS
// ============================================================
function rutaTemaAbsoluta(rutaRelativa) {
    // rutaRelativa viene tipo "Temas/violeta.css" (relativa a la raíz del sitio)
    // Este iframe está en herramientas/cevann/, así que subimos dos niveles.
    if (/^https?:\/\//i.test(rutaRelativa)) return rutaRelativa;
    return '../../' + rutaRelativa;
}

async function cargarVarsTema(tema) {
    if (!tema || !tema.ruta) return null;
    if (cacheVarsTemas.has(tema.ruta)) return cacheVarsTemas.get(tema.ruta);

    try {
        const res = await fetch(rutaTemaAbsoluta(tema.ruta), { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const cssText = await res.text();

        // Extraer todas las declaraciones --var: valor; de bloques :root
        const vars = {};
        const rootRegex = /:root\s*\{([^}]+)\}/g;
        let match;
        while ((match = rootRegex.exec(cssText)) !== null) {
            match[1].split(';').forEach(line => {
                const idx = line.indexOf(':');
                if (idx < 0) return;
                const k = line.slice(0, idx).trim();
                const v = line.slice(idx + 1).trim();
                if (k.startsWith('--') && v && !(k in vars)) vars[k] = v;
            });
        }

        // Merge con defaults (vars del tema ganan)
        const merged = { ...VARS_DEFAULT, ...vars };
        cacheVarsTemas.set(tema.ruta, merged);
        return merged;
    } catch (e) {
        console.warn('[Cevann] No se pudo cargar tema:', tema.ruta, e);
        return { ...VARS_DEFAULT };
    }
}

// ============================================================
//  RENDER: POSTER
// ============================================================
function varsAInline(vars) {
    return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

function obtenerPaddingPx() {
    const f = FORMATOS[state.formato];
    const minDim = Math.min(f.w, f.h);
    return Math.round(minDim * PADDINGS[state.padding]);
}

function renderElementoHTML(el) {
    const p = el.props;
    const alignMap = { izq: 'flex-start', centro: 'center', der: 'flex-end' };
    const
