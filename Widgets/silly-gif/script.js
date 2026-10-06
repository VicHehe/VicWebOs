// ============================================================
//  Widget: SillyGif
//  Sube UN gif (máx. 2 MB) y lo reproduce.
//  Sube DIRECTO a GitHub (Contents API), sin pasar por ConfigBD.
//  1 GIF por usuario: misma ruta → subir otro lo REEMPLAZA.
//
//      app/silly-gif/{codigo}silly-gif.gif
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const CARPETA      = 'app/silly-gif/';
const MAX_BYTES    = 2 * 1024 * 1024;   // 2 MB

let urlActual    = null;    // blob URL del gif mostrado (null = no hay)
let errorCarga   = false;
let ocupado      = false;

const API = () => window.parent.__vicwebos || null;

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
//  Ruta por usuario
// ------------------------------------------------------------
function rutaGif() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return `${CARPETA}${cuenta.codigo}silly-gif.gif`;
}

// ------------------------------------------------------------
//  GitHub directo (sin ConfigBD)
//  Solo lee token/owner/repo de la comunidad activa.
// ------------------------------------------------------------
function configGitHub() {
    const fn = window.parent.cargarConfigBD;
    const c = (typeof fn === 'function') ? fn() : null;
    if (!c || !c.githubToken || !c.githubOwner || !c.githubRepo) return null;
    return c;
}

function ghUrl(c, ruta) {
    const p = ruta.split('/').map(encodeURIComponent).join('/');
    return `https://api.github.com/repos/${c.githubOwner}/${c.githubRepo}/contents/${p}`;
}

function ghHeaders(c, extra = {}) {
    return {
        'Authorization': `Bearer ${c.githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...extra
    };
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// sha actual del archivo (null si no existe). SIN caché del navegador.
// Se usa el media type "object" porque funciona también con archivos > 1 MB.
async function ghObtenerSha(c, ruta) {
    const res = await fetch(ghUrl(c, ruta), {
        headers: ghHeaders(c, { 'Accept': 'application/vnd.github.object+json' }),
        cache: 'no-store'
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`No se pudo consultar GitHub (${res.status}).`);
    const data = await res.json();
    return data.sha || null;
}

function archivoABase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(String(r.result).split(',')[1]);
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsDataURL(file);
    });
}

async function ghSubir(c, ruta, file) {
    const content = await archivoABase64(file);

    for (let intento = 1; intento <= 3; intento++) {
        const sha = await ghObtenerSha(c, ruta);   // fresco en cada intento
        const res = await fetch(ghUrl(c, ruta), {
            method: 'PUT',
            headers: ghHeaders(c, { 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                message: 'SillyGif: subir gif',
                content,
                ...(sha ? { sha } : {})
            })
        });
        if (res.ok) return;

        const err = await res.json().catch(() => ({}));
        const conflicto = res.status === 409 || res.status === 422;
        if (conflicto && intento < 3) { await esperar(400 * intento); continue; }
        throw new Error(err.message || `Error subiendo el GIF (${res.status}).`);
    }
}

async function ghLeerBlob(c, ruta) {
    const res = await fetch(ghUrl(c, ruta), {
        headers: ghHeaders(c, { 'Accept': 'application/vnd.github.raw' }),
        cache: 'no-store'
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`No se pudo leer el GIF (${res.status}).`);
    const blob = await res.blob();
    return new Blob([blob], { type: 'image/gif' });
}

async function ghBorrar(c, ruta) {
    const sha = await ghObtenerSha(c, ruta);
    if (!sha) return;   // ya no existía
    const res = await fetch(ghUrl(c, ruta), {
        method: 'DELETE',
        headers: ghHeaders(c, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: 'SillyGif: borrar gif', sha })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `No se pudo borrar el GIF (${res.status}).`);
    }
}

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

// Verifica la cabecera real (GIF87a / GIF89a), no solo la extensión
async function esGifReal(file) {
    try {
        const buf = new Uint8Array(await file.slice(0, 6).arrayBuffer());
        const cab = String.fromCharCode(...buf);
        return cab === 'GIF87a' || cab === 'GIF89a';
    } catch (e) { return false; }
}

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
//  Cargar el gif guardado (si hay)
// ------------------------------------------------------------
async function cargar() {
    errorCarga = false;
    const c = configGitHub();
    const ruta = rutaGif();
    if (!c || !ruta) return;   // sin conexión → se muestra vacío
    try {
        const blob = await ghLeerBlob(c, ruta);
        liberarURL();
        if (blob) urlActual = URL.createObjectURL(blob);
    } catch (e) {
        console.warn('[SillyGif] No se pudo cargar:', e);
        errorCarga = true;
    }
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

    const c = configGitHub();
    const ruta = rutaGif();
    if (!ruta) { mostrarError('No se pudo identificar tu cuenta.'); return; }
    if (!c)    { mostrarError('Conecta una comunidad primero.'); return; }

    ocupado = true;
    renderSubiendo();

    try {
        await ghSubir(c, ruta, file);   // misma ruta → reemplaza el anterior
        liberarURL();
        urlActual = URL.createObjectURL(file);   // sin volver a descargar
        errorCarga = false;
    } catch (e) {
        console.warn('[SillyGif] Error subiendo:', e);
        mostrarError(e && e.message ? e.message : 'No se pudo subir el GIF.');
    } finally {
        ocupado = false;
        render();
    }
}

async function borrarGif() {
    if (ocupado || !urlActual) return;
    if (!confirm('¿Borrar tu GIF?')) return;

    const c = configGitHub();
    const ruta = rutaGif();
    if (!c || !ruta) return;

    ocupado = true;
    mostrarError(null);
    try {
        await ghBorrar(c, ruta);
        liberarURL();
    } catch (e) {
        console.warn('[SillyGif] Error borrando:', e);
        mostrarError(e && e.message ? e.message : 'No se pudo borrar el GIF.');
    } finally {
        ocupado = false;
        render();
    }
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function renderSubiendo() {
    document.getElementById('sgAcciones').hidden = true;
    document.getElementById('sgZona').innerHTML = `
        <div class="sg-empty">
            <div class="sg-spinner"></div>
            <p>Subiendo GIF...</p>
        </div>
    `;
}

function renderCargando() {
    document.getElementById('sgAcciones').hidden = true;
    document.getElementById('sgZona').innerHTML = `<div class="sg-cargando"></div>`;
}

function render() {
    const zona = document.getElementById('sgZona');
    const acciones = document.getElementById('sgAcciones');
    if (!zona) return;

    // --- Error al cargar ---
    if (errorCarga) {
        acciones.hidden = true;
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
        document.getElementById('sgBtnReintentar')?.addEventListener('click', async () => {
            renderCargando();
            await cargar();
            render();
        });
        return;
    }

    // --- Sin gif ---
    if (!urlActual) {
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
    zona.innerHTML = `<img class="sg-gif" id="sgGif" alt="GIF">`;
    document.getElementById('sgGif').src = urlActual;
    // No se revoca el blob al cargar: se revoca al cambiar/borrar,
    // para que el GIF siga animándose sin problemas.
}

// ------------------------------------------------------------
//  Drag & drop
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

    renderCargando();
    await cargar();
    render();

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('beforeunload', liberarURL);
