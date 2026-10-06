// ============================================================
//  Widget: SillyGif
//  Sube UN gif (máx. 2 MB) directamente en el widget y lo reproduce.
//  Solo 1 GIF por usuario: subir uno nuevo REEMPLAZA al anterior
//  (misma ruta), así la BD nunca acumula gifs.
//
//  Persistencia POR USUARIO en (BD GitHub vía ConfigBD):
//      app/silly-gif/{codigo}silly-gif.gif   ← el archivo
//      app/silly-gif/{codigo}silly-gif.json  ← metadatos
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const CARPETA      = 'app/silly-gif/';
const MAX_BYTES    = 2 * 1024 * 1024;   // 2 MB

let gifMeta   = null;   // { nombre, tamano, actualizado } o null
let urlActual = null;   // blob URL mostrándose ahora
let ocupado   = false;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD   || null;

// ------------------------------------------------------------
//  Tema
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
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ------------------------------------------------------------
//  Rutas por usuario
// ------------------------------------------------------------
function codigoUsuario() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    return (cuenta && cuenta.codigo) ? cuenta.codigo : null;
}
function rutaGif()  { const c = codigoUsuario(); return c ? `${CARPETA}${c}silly-gif.gif`  : null; }
function rutaMeta() { const c = codigoUsuario(); return c ? `${CARPETA}${c}silly-gif.json` : null; }

// ------------------------------------------------------------
//  Utilidades
// ------------------------------------------------------------
function formatearTamano(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function mostrarError(msg) {
    const el = document.getElementById('sgError');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(mostrarError._t);
    mostrarError._t = setTimeout(() => { el.hidden = true; }, 5000);
}

function liberarURL() {
    if (urlActual) { URL.revokeObjectURL(urlActual); urlActual = null; }
}

// Verifica que realmente sea un GIF (cabecera GIF87a / GIF89a),
// no solo que la extensión diga .gif
async function esGifReal(file) {
    try {
        const buf = new Uint8Array(await file.slice(0, 6).arrayBuffer());
        const cab = String.fromCharCode(...buf);
        return cab === 'GIF87a' || cab === 'GIF89a';
    } catch (e) { return false; }
}

// Devuelve un mensaje de error o null si el archivo es válido
async function validar(file) {
    if (!file) return 'No se seleccionó ningún archivo.';
    if (file.size === 0) return 'El archivo está vacío.';
    if (file.size > MAX_BYTES) {
        return `El GIF pesa ${formatearTamano(file.size)}. Máximo 2 MB.`;
    }
    if (!(await esGifReal(file))) return 'Solo se permiten archivos GIF.';
    return null;
}

// ------------------------------------------------------------
//  Cargar metadatos
// ------------------------------------------------------------
async function cargar() {
    const bd = BD();
    const ruta = rutaMeta();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        gifMeta = (data && data.tiene) ? data : null;
    } catch (e) { gifMeta = null; }
}

async function guardarMeta(meta) {
    const bd = BD();
    const ruta = rutaMeta();
    if (!bd || !ruta) throw new Error('Sin conexión con la base de datos.');
    await bd.escribirArchivo(ruta, {
        version: 1,
        tiene: !!meta,
        nombre: meta ? meta.nombre : null,
        tamano: meta ? meta.tamano : null,
        actualizado: new Date().toISOString()
    });
}

// ------------------------------------------------------------
//  Acciones
// ------------------------------------------------------------
function abrirSelector() {
    if (ocupado) return;
    const input = document.getElementById('sgInput');
    input.value = '';
    input.click();
}

async function subirGif(file) {
    if (ocupado) return;
    mostrarError(null);

    const error = await validar(file);
    if (error) { mostrarError(error); return; }

    const bd = BD();
    const ruta = rutaGif();
    if (!bd || !ruta) { mostrarError('No se pudo conectar con tu cuenta.'); return; }
    if (typeof bd.estaConectado === 'function' && !bd.estaConectado()) {
        mostrarError('Conecta una comunidad primero.');
        return;
    }

    ocupado = true;
    renderSubiendo();

    try {
        // Misma ruta SIEMPRE → reemplaza el gif anterior (1 por usuario)
        await bd.subirArchivo(ruta, file);

        const meta = { nombre: file.name, tamano: file.size };
        await guardarMeta(meta);
        gifMeta = meta;

        // Mostramos el archivo local: ahorra volver a descargarlo
        liberarURL();
        urlActual = URL.createObjectURL(file);
    } catch (e) {
        console.warn('[SillyGif] Error subiendo:', e);
        mostrarError(e && e.message ? e.message : 'No se pudo subir el GIF.');
    } finally {
        ocupado = false;
        await render();
    }
}

async function borrarGif() {
    if (ocupado || !gifMeta) return;
    if (!confirm('¿Borrar tu GIF?')) return;

    const bd = BD();
    const ruta = rutaGif();
    if (!bd || !ruta) return;

    ocupado = true;
    mostrarError(null);
    try {
        await bd.eliminarArchivo(ruta);
        await guardarMeta(null);
        gifMeta = null;
        liberarURL();
    } catch (e) {
        console.warn('[SillyGif] Error borrando:', e);
        mostrarError(e && e.message ? e.message : 'No se pudo borrar el GIF.');
    } finally {
        ocupado = false;
        await render();
    }
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function renderSubiendo() {
    const zona = document.getElementById('sgZona');
    document.getElementById('sgAcciones').hidden = true;
    zona.innerHTML = `
        <div class="sg-empty">
            <div class="sg-spinner"></div>
            <p>Subiendo GIF...</p>
        </div>
    `;
}

async function render() {
    const zona = document.getElementById('sgZona');
    const acciones = document.getElementById('sgAcciones');
    if (!zona) return;

    // --- Sin gif ---
    if (!gifMeta) {
        acciones.hidden = true;
        zona.innerHTML = `
            <div class="sg-empty sg-drop" id="sgDrop">
                <div class="sg-empty-icon">
                    <i data-lucide="film"></i>
                </div>
                <p>Sube un GIF o arrástralo aquí</p>
                <button class="sg-btn" id="sgBtnSubir">
                    <i data-lucide="upload"></i>
                    Subir GIF
                </button>
                <small>Máx. 2 MB · 1 GIF por cuenta</small>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        document.getElementById('sgBtnSubir')?.addEventListener('click', abrirSelector);
        return;
    }

    // --- Con gif ---
    acciones.hidden = false;

    // Si no tenemos la URL en memoria (ej. recarga), descargarlo de la BD
    if (!urlActual) {
        zona.innerHTML = `<div class="sg-cargando"></div>`;
        try {
            const bd = BD();
            const url = await bd.leerArchivoBinarioComoURL(rutaGif());
            if (!url) throw new Error('sin url');
            urlActual = url;
        } catch (e) {
            console.warn('[SillyGif] No se pudo cargar el gif:', e);
            zona.innerHTML = `
                <div class="sg-empty">
                    <p>No se pudo cargar el GIF.</p>
                    <button class="sg-btn" id="sgBtnReintentar">
                        <i data-lucide="refresh-cw"></i>
                        Reintentar
                    </button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            document.getElementById('sgBtnReintentar')?.addEventListener('click', render);
            return;
        }
    }

    zona.innerHTML = `<img class="sg-gif" id="sgGif" alt="GIF">`;
    document.getElementById('sgGif').src = urlActual;
    // OJO: no revocamos el blob al cargar (se revoca al cambiar/borrar),
    // para que el GIF siga animándose sin problemas.
}

// ------------------------------------------------------------
//  Drag & drop (solo cuando no hay gif)
// ------------------------------------------------------------
function iniciarDragDrop() {
    const zona = document.getElementById('sgZona');
    ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, (e) => {
        e.preventDefault();
        if (!ocupado) zona.classList.add('sg-arrastrando');
    }));
    ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, (e) => {
        e.preventDefault();
        zona.classList.remove('sg-arrastrando');
    }));
    zona.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) subirGif(file);
    });
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    document.getElementById('sgBtnCambiar')?.addEventListener('click', abrirSelector);
    document.getElementById('sgBtnQuitar')?.addEventListener('click', borrarGif);
    document.getElementById('sgInput')?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) subirGif(file);
    });
    iniciarDragDrop();

    await cargar();
    await render();

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('beforeunload', liberarURL);
