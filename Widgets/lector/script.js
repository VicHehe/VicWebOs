// ============================================================
//  Widget: Lector
//  ------------------------------------------------------------
//  Muestra un texto en el widget. El usuario puede:
//    - Cargar una nota de la app Notas (lee el JSON de GitHub)
//    - Subir un archivo .txt
//    - Pegar texto manualmente
//  Persistencia: IndexedDB (local, por usuario).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'LectorWidgetDB';
const IDB_VERSION = 1;
const IDB_STORE = 'textos';

let usuarioActual = null;
let textoActual = null;   // { texto, titulo, fontSize }
let inicializado = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
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

function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'lc_' + codigo;
}

async function cargarGuardado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return null;
    if (typeof data.texto !== 'string' || !data.texto) return null;
    return {
        texto: data.texto,
        titulo: data.titulo || 'Texto',
        fontSize: data.fontSize || 'md'
    };
}

async function guardar(textoObj) {
    if (!textoObj) {
        await idbDelete(claveEstado());
        return;
    }
    await idbSet(claveEstado(), {
        texto: textoObj.texto,
        titulo: textoObj.titulo,
        fontSize: textoObj.fontSize,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    const zona = document.getElementById('lcZona');
    const tituloEl = document.getElementById('lcTituloTexto');
    const btnLimpiar = document.getElementById('lcBtnLimpiar');
    if (!zona) return;

    if (!textoActual) {
        zona.innerHTML = `
            <div class="lc-vacio">
                <div class="lc-vacio-icono">
                    <i data-lucide="book-open-text"></i>
                </div>
                <p>Sin texto cargado</p>
                <button class="lc-btn-cargar" id="lcBtnCargarVacio">
                    <i data-lucide="upload"></i>
                    Cargar texto
                </button>
            </div>
        `;
        if (tituloEl) tituloEl.hidden = true;
        if (btnLimpiar) btnLimpiar.hidden = true;

        document.getElementById('lcBtnCargarVacio')?.addEventListener('click', abrirModal);

        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Con texto
    if (tituloEl) {
        tituloEl.textContent = textoActual.titulo || 'Texto';
        tituloEl.hidden = false;
    }
    if (btnLimpiar) btnLimpiar.hidden = false;

    const sizeClass = 'size-' + (textoActual.fontSize || 'md');
    zona.innerHTML = `<div class="lc-contenido ${sizeClass}">${escapar(textoActual.texto)}</div>`;
    if (window.lucide) window.lucide.createIcons();
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
//  CARGAR TEXTO
// ============================================================
async function aplicarTexto(texto, titulo) {
    if (!texto || !texto.trim()) {
        alert('El texto está vacío.');
        return;
    }
    textoActual = {
        texto: texto,
        titulo: titulo || 'Texto',
        fontSize: textoActual?.fontSize || 'md'
    };
    await guardar(textoActual);
    render();
    cerrarModal();
}

async function aplicarNota(nota) {
    const texto = (nota.texto || '').trim();
    if (!texto) {
        alert('Esta nota está vacía.');
        return;
    }
    const titulo = (nota.titulo || 'Nota').trim();
    await aplicarTexto(texto, titulo);
}

// ============================================================
//  LEER NOTAS DE GITHUB
// ============================================================
async function cargarNotas() {
    const listaEl = document.getElementById('lcNotasLista');
    if (!listaEl) return;

    listaEl.innerHTML = `
        <div class="lc-cargando">
            <div class="lc-spinner"></div>
            <span>Cargando notas...</span>
        </div>
    `;

    const bd = BD();
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const codigo = cuenta?.codigo;

    if (!bd || !codigo) {
        listaEl.innerHTML = `
            <div class="lc-vacio-mini">
                <i data-lucide="notebook-pen"></i>
                <p>No hay notas disponibles.<br>Inicia sesión para verlas.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const ruta = `app/notas/${codigo}notas.json`;

    let data = null;
    try {
        data = await bd.leerArchivoFresh(ruta);
    } catch (e) {
        console.warn('[Lector] Error leyendo notas:', e);
    }

    const notas = (data && Array.isArray(data.notas)) ? data.notas : [];

    if (notas.length === 0) {
        listaEl.innerHTML = `
            <div class="lc-vacio-mini">
                <i data-lucide="notebook-pen"></i>
                <p>No tienes notas todavía.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Ordenar por actualizada descendente
    const ordenadas = [...notas].sort((a, b) =>
        new Date(b.actualizada || b.creada || 0) - new Date(a.actualizada || a.creada || 0)
    );

    listaEl.innerHTML = ordenadas.map((n, i) => {
        const preview = (n.texto || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        const previewText = preview + (preview.length >= 60 ? '…' : '');
        return `
            <button class="lc-nota-item" data-idx="${i}">
                <div class="lc-nota-titulo">${escapar(n.titulo || 'Sin título')}</div>
                <div class="lc-nota-preview">${escapar(previewText || 'Sin contenido')}</div>
            </button>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    listaEl.querySelectorAll('.lc-nota-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const nota = ordenadas[idx];
            if (nota) aplicarNota(nota);
        });
    });
}

// ============================================================
//  MODAL
// ============================================================
function abrirModal() {
    const modal = document.getElementById('lcModal');
    if (!modal) return;
    modal.hidden = false;
    cargarNotas();
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('lcModal');
    if (modal) modal.hidden = true;
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    document.getElementById('lcBtnConfig')?.addEventListener('click', abrirModal);
    document.getElementById('lcModalCerrar')?.addEventListener('click', cerrarModal);

    // Tabs
    document.querySelectorAll('.lc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.lc-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.lc-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`.lc-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
        });
    });

    // Subir archivo
    document.getElementById('lcFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const texto = await file.text();
            const titulo = file.name.replace(/\.[^.]+$/, '');
            await aplicarTexto(texto, titulo);
        } catch (err) {
            console.warn('[Lector] Error leyendo archivo:', err);
            alert('No se pudo leer el archivo.');
        }
        e.target.value = '';
    });

    // Pegar texto
    document.getElementById('lcBtnGuardarPegado')?.addEventListener('click', async () => {
        const area = document.getElementById('lcPegar');
        const texto = area ? area.value : '';
        await aplicarTexto(texto, 'Texto pegado');
        if (area) area.value = '';
    });

    // Font size
    document.querySelectorAll('.lc-font-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!textoActual) return;
            document.querySelectorAll('.lc-font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            textoActual.fontSize = btn.dataset.size;
            await guardar(textoActual);
            render();
        });
    });

    // Limpiar
    document.getElementById('lcBtnLimpiar')?.addEventListener('click', async () => {
        if (!confirm('¿Quitar el texto del lector?')) return;
        textoActual = null;
        await guardar(null);
        render();
        cerrarModal();
    });

    // Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('lcModal').hidden) cerrarModal();
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

    textoActual = await cargarGuardado();

    // Sincronizar botón de font size activo con el guardado
    if (textoActual) {
        const size = textoActual.fontSize || 'md';
        document.querySelectorAll('.lc-font-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.size === size);
        });
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
