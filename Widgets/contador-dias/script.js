// ============================================================
//  Widget: Contador de Días
//  ------------------------------------------------------------
//  Elegís 2 fechas y calcula los días exactos entre ellas.
//  Ideal para aniversarios, proyectos o eventos.
//
//  Persistencia: IndexedDB (local, por usuario).
//  Sin datos propios en GitHub.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'ContadorDiasDB';
const IDB_VERSION = 1;
const IDB_STORE = 'fechas';

let usuarioActual = null;
let fechaDesde = null;   // ISO YYYY-MM-DD
let fechaHasta = null;
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
    return 'cd_' + codigo;
}

async function cargarGuardado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return null;
    if (typeof data.desde !== 'string' || typeof data.hasta !== 'string') return null;
    return { desde: data.desde, hasta: data.hasta };
}

async function guardar() {
    if (!fechaDesde || !fechaHasta) return;
    await idbSet(claveEstado(), {
        desde: fechaDesde,
        hasta: fechaHasta,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  FECHAS
// ============================================================
function hoyISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dia}`;
}

function calcularDias(iso1, iso2) {
    if (!iso1 || !iso2) return 0;
    const a = new Date(iso1 + 'T00:00:00');
    const b = new Date(iso2 + 'T00:00:00');
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    const ms = Math.abs(b.getTime() - a.getTime());
    return Math.round(ms / 86400000);
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    const numEl = document.getElementById('cdNumero');
    const uniEl = document.getElementById('cdUnidad');
    const inpDesde = document.getElementById('cdDesde');
    const inpHasta = document.getElementById('cdHasta');

    if (!numEl || !uniEl || !inpDesde || !inpHasta) return;

    // Inputs
    if (inpDesde.value !== fechaDesde) inpDesde.value = fechaDesde || '';
    if (inpHasta.value !== fechaHasta) inpHasta.value = fechaHasta || '';

    // Número
    const dias = calcularDias(fechaDesde, fechaHasta);
    numEl.textContent = String(dias);
    uniEl.textContent = dias === 1 ? 'día' : 'días';

    // Si es hoy mismo, un detalle sutil
    if (dias === 0) {
        uniEl.textContent = 'mismo día';
    }
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    const inpDesde = document.getElementById('cdDesde');
    const inpHasta = document.getElementById('cdHasta');

    inpDesde?.addEventListener('change', async (e) => {
        if (!e.target.value) return;
        fechaDesde = e.target.value;
        render();
        await guardar();
    });

    inpHasta?.addEventListener('change', async (e) => {
        if (!e.target.value) return;
        fechaHasta = e.target.value;
        render();
        await guardar();
    });

    document.getElementById('cdBtnReset')?.addEventListener('click', async () => {
        const hoy = hoyISO();
        fechaDesde = hoy;
        fechaHasta = hoy;
        render();
        await guardar();
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    const guardado = await cargarGuardado();
    if (guardado) {
        fechaDesde = guardado.desde;
        fechaHasta = guardado.hasta;
    } else {
        const hoy = hoyISO();
        fechaDesde = hoy;
        fechaHasta = hoy;
        await guardar();
    }

    render();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
