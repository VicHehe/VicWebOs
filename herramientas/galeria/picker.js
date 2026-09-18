// ============================================================
//  Galería — Picker
//  Muestra las imágenes del usuario actual con paginación
//  (6 por página) y devuelve los ids seleccionados al padre
//  por postMessage.
//
//  Se abre desde MasterHad.galeria.abrirPicker().
// ============================================================

'use strict';

const POR_PAGINA = 6;
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let imagenes = [];
let paginaActual = 1;
let seleccionados = new Set();
let multiple = false;
let titulo = 'Elige una imagen';
let urlsActivas = [];

const MH = () => window.parent.MasterHad || null;

// ------------------------------------------------------------
//  Tema: heredar variables CSS del shell
// ------------------------------------------------------------
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
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ------------------------------------------------------------
//  Obtener código del usuario (vive en el shell)
// ------------------------------------------------------------
function codigoActual() {
    try {
        const api = window.parent.__vicwebos;
        if (api && typeof api.obtenerCuenta === 'function') {
            const c = api.obtenerCuenta();
            return c && c.codigo ? c.codigo : null;
        }
    } catch (e) { /* silencioso */ }
    return null;
}

// ------------------------------------------------------------
//  Leer opciones del iframe padre
// ------------------------------------------------------------
function leerOpciones() {
    try {
        const frame = window.frameElement;
        if (frame) {
            const t = frame.getAttribute('data-titulo');
            const m = frame.getAttribute('data-multiple');
            if (t) titulo = t;
            if (m === '1') multiple = true;
        }
    } catch (e) { /* silencioso */ }
}

// ------------------------------------------------------------
//  Cargar imágenes
// ------------------------------------------------------------
async function cargarImagenes() {
    const mh = MH();
    if (!mh) {
        mostrarError('MasterHad no disponible.');
        return;
    }
    const cod = codigoActual();
    if (!cod) {
        mostrarError('Necesitas iniciar sesión para usar la galería.');
        return;
    }
    try {
        imagenes = await mh.galeria.listarImagenes(cod, { fresh: true });
    } catch (e) {
        console.warn('[picker] Error listando:', e);
        imagenes = [];
    }
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function render() {
    const grid = document.getElementById('pickerGrid');
    const info = document.getElementById('pickerPageInfo');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnOk = document.getElementById('btnSeleccionar');

    urlsActivas.forEach(u => URL.revokeObjectURL(u));
    urlsActivas = [];

    if (imagenes.length === 0) {
        grid.innerHTML = `
            <div class="picker-vacio">
                <i data-lucide="image-off"></i>
                <p>No tienes imágenes todavía.<br>Sube algunas desde la app Galería.</p>
            </div>`;
        info.textContent = '0 / 0';
        btnPrev.disabled = true;
        btnNext.disabled = true;
        btnOk.disabled = true;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const totalPaginas = Math.ceil(imagenes.length / POR_PAGINA);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * POR_PAGINA;
    const pagina = imagenes.slice(inicio, inicio + POR_PAGINA);

    grid.innerHTML = pagina.map(img => `
        <div class="picker-item" data-id="${img.id}">
            <div class="picker-item-cargando" style="width:100%;height:100%;position:absolute;inset:0;"></div>
            <div class="picker-item-check">
                <i data-lucide="check"></i>
            </div>
            <div class="picker-item-nombre">${escapeHTML(img.nombre || img.archivo)}</div>
        </div>
    `).join('');

    pagina.forEach((img) => {
        const el = grid.querySelector(`.picker-item[data-id="${img.id}"]`);
        if (el) cargarMiniatura(img, el);
    });

    info.textContent = `${paginaActual} / ${totalPaginas}`;
    btnPrev.disabled = paginaActual <= 1;
    btnNext.disabled = paginaActual >= totalPaginas;

    actualizarBotonOK();

    seleccionados.forEach(id => {
        const el = grid.querySelector(`.picker-item[data-id="${id}"]`);
        if (el) el.classList.add('seleccionada');
    });

    if (window.lucide) window.lucide.createIcons();
}

async function cargarMiniatura(img, el) {
    try {
        const mh = MH();
        if (!mh) return;
        const url = await mh.galeria.leerImagenURL(img.id);
        if (!url) return;
        urlsActivas.push(url);
        const imagenEl = document.createElement('img');
        imagenEl.src = url;
        imagenEl.alt = img.nombre || '';
        imagenEl.loading = 'lazy';
        el.insertBefore(imagenEl, el.firstChild);
        const skeleton = el.querySelector('.picker-item-cargando');
        if (skeleton) skeleton.remove();
    } catch (e) {
        console.warn('[picker] No se pudo cargar miniatura:', e);
        const skeleton = el.querySelector('.picker-item-cargando');
        if (skeleton) {
            skeleton.style.background = 'var(--gray-200, #E8E8EE)';
            skeleton.style.animation = 'none';
        }
    }
}

function actualizarBotonOK() {
    const btnOk = document.getElementById('btnSeleccionar');
    const btnOkTxt = document.getElementById('btnSeleccionarTxt');
    if (!btnOk) return;

    if (multiple) {
        const n = seleccionados.size;
        btnOk.disabled = n === 0;
        btnOkTxt.textContent = n === 0 ? 'Seleccionar' : `Seleccionar (${n})`;
    } else {
        btnOk.disabled = seleccionados.size === 0;
        btnOkTxt.textContent = 'Seleccionar';
    }
}

// ------------------------------------------------------------
//  Click en una imagen
// ------------------------------------------------------------
function seleccionarItem(id) {
    if (multiple) {
        if (seleccionados.has(id)) seleccionados.delete(id);
        else seleccionados.add(id);
    } else {
        seleccionados.clear();
        seleccionados.add(id);
    }
    document.querySelectorAll('.picker-item').forEach(el => {
        el.classList.toggle('seleccionada', seleccionados.has(el.dataset.id));
    });
    actualizarBotonOK();
}

// ------------------------------------------------------------
//  Paginación
// ------------------------------------------------------------
function irPagina(delta) {
    const totalPaginas = Math.ceil(imagenes.length / POR_PAGINA);
    const nueva = paginaActual + delta;
    if (nueva < 1 || nueva > totalPaginas) return;
    paginaActual = nueva;
    render();
}

// ------------------------------------------------------------
//  Resultado
// ------------------------------------------------------------
function confirmar() {
    if (seleccionados.size === 0) return;
    const ids = Array.from(seleccionados);
    window.parent.postMessage({
        type: 'galeria:pick',
        ids: multiple ? ids : [ids[0]]
    }, '*');
}

function cancelar() {
    window.parent.postMessage({ type: 'galeria:cancel' }, '*');
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function mostrarError(msg) {
    const grid = document.getElementById('pickerGrid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="picker-vacio">
            <i data-lucide="alert-triangle"></i>
            <p>${escapeHTML(msg)}</p>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    leerOpciones();
    document.getElementById('pickerTitulo').textContent = titulo;

    document.getElementById('btnCancelar').addEventListener('click', cancelar);
    document.getElementById('btnCancelarHeader').addEventListener('click', cancelar);
    document.getElementById('btnSeleccionar').addEventListener('click', confirmar);
    document.getElementById('btnPrev').addEventListener('click', () => irPagina(-1));
    document.getElementById('btnNext').addEventListener('click', () => irPagina(1));

    document.getElementById('pickerGrid').addEventListener('click', (e) => {
        const item = e.target.closest('.picker-item');
        if (item) seleccionarItem(item.dataset.id);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') cancelar();
        if (e.key === 'Enter' && seleccionados.size > 0) confirmar();
    });

    await cargarImagenes();
    render();

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('unload', () => {
    urlsActivas.forEach(u => URL.revokeObjectURL(u));
});
