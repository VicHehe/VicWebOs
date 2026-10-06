// ============================================================
//  Widget: SillyGif
//  ------------------------------------------------------------
//  Muestra un GIF animado decorativo.
//  - Solo 1 GIF a la vez (si subes otro, se borra el anterior)
//  - Tamaño máximo: 2 MB
//  - Persistencia: binario en GitHub + metadata JSON
//
//  Rutas:
//    app/silly-gif/{codigo}silly-gif.gif    ← binario
//    app/silly-gif/{codigo}silly-gif.json   ← metadata
// ============================================================
'use strict';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_BASE = 'app/silly-gif/';
const MAX_TAMANO = 2 * 1024 * 1024; // 2 MB
let usuarioActual = null;
let urlActual = null; // blob URL activa (para revocar)
const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
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
//  RUTAS
// ============================================================
function rutaBinario() {
if (!usuarioActual) return null;
return ARCHIVO_BASE + usuarioActual.codigo + 'silly-gif.gif';
}
function rutaMetadata() {
if (!usuarioActual) return null;
return ARCHIVO_BASE + usuarioActual.codigo + 'silly-gif.json';
}
// ============================================================
//  PERSISTENCIA
// ============================================================
async function cargarMetadata() {
const bd = BD();
const ruta = rutaMetadata();
if (!bd || !ruta) return null;
try {
const data = await bd.leerArchivo(ruta);
if (data && data.nombre) return data;
} catch (e) { /* no existe */ }
return null;
}
async function guardarMetadata(meta) {
const bd = BD();
const ruta = rutaMetadata();
if (!bd || !ruta) return;
await bd.escribirArchivo(ruta, {
version: 1,
...meta,
actualizado: new Date().toISOString()
});
}
async function borrarMetadata() {
const bd = BD();
const ruta = rutaMetadata();
if (!bd || !ruta) return;
try { await bd.eliminarArchivo(ruta); } catch (e) { /* silencioso */ }
}
async function borrarBinario() {
const bd = BD();
const ruta = rutaBinario();
if (!bd || !ruta) return;
try { await bd.eliminarArchivo(ruta); } catch (e) { /* silencioso */ }
}
async function subirBinario(file) {
const bd = BD();
const ruta = rutaBinario();
if (!bd || !ruta) throw new Error('Sin conexión.');
await bd.subirArchivo(ruta, file);
}
async function leerBinarioURL() {
const bd = BD();
const ruta = rutaBinario();
if (!bd || !ruta) return null;
return await bd.leerArchivoBinarioComoURL(ruta);
}
// ============================================================
//  HELPERS
// ============================================================
function formatearTamano(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function liberarUrlAnterior() {
if (urlActual) {
try { URL.revokeObjectURL(urlActual); } catch (e) {}
urlActual = null;
}
}
// ============================================================
//  RENDER
// ============================================================
async function render() {
const zona = document.getElementById('sgZona');
const acciones = document.getElementById('sgAcciones');
const footer = document.getElementById('sgFooter');
const nombreEl = document.getElementById('sgNombre');
const tamanoEl = document.getElementById('sgTamano');
if (!zona) return;
liberarUrlAnterior();
const meta = await cargarMetadata();
// Sin GIF → empty state
if (!meta) {
// Ocultar acciones y footer cuando no hay GIF
if (acciones) acciones.hidden = true;
if (footer) footer.hidden = true;
zona.innerHTML = `
<div class="sg-empty">
<div class="sg-empty-icon">
<i data-lucide="film"></i>
</div>
<p>Sin GIF decorativo</p>
<small>Máx. 2 MB · Solo 1 a la vez</small>
<button class="sg-btn" id="sgBtnSubirEmpty">
<i data-lucide="upload"></i>
Subir GIF
</button>
</div>
`;
if (window.lucide) window.lucide.createIcons();
document.getElementById('sgBtnSubirEmpty')?.addEventListener('click', abrirSelector);
return;
}
// Con GIF → mostrar acciones
if (acciones) acciones.hidden = false;
if (footer) footer.hidden = false;
nombreEl.textContent = meta.nombre || 'GIF';
tamanoEl.textContent = formatearTamano(meta.tamano || 0);
// Mostrar spinner mientras carga
zona.innerHTML = `
<div class="sg-cargando">
<div class="sg-spinner"></div>
<span>Cargando GIF...</span>
</div>
`;
try {
const url = await leerBinarioURL();
if (!url) throw new Error('No se pudo cargar');
urlActual = url;
zona.innerHTML = `<img class="sg-gif" src="${url}" alt="GIF decorativo">`;
} catch (e) {
console.warn('[SillyGif] Error cargando:', e);
zona.innerHTML = `
<div class="sg-empty">
<p>No se pudo cargar el GIF</p>
<button class="sg-btn" id="sgBtnReintentar">
<i data-lucide="refresh-cw"></i>
Reintentar
</button>
</div>
`;
if (window.lucide) window.lucide.createIcons();
document.getElementById('sgBtnReintentar')?.addEventListener('click', render);
}
}
// ============================================================
//  SUBIR / CAMBIAR / QUITAR
// ============================================================
function abrirSelector() {
const input = document.getElementById('sgFileInput');
if (input) input.click();
}
async function procesarArchivo(file) {
if (!file) return;
// Validaciones
if (file.type !== 'image/gif') {
alert('Solo se permiten archivos GIF.');
return;
}
if (file.size > MAX_TAMANO) {
alert(`El GIF es demasiado grande (${formatearTamano(file.size)}). Máximo 2 MB.`);
return;
}
const zona = document.getElementById('sgZona');
// Mostrar cargando
zona.innerHTML = `
<div class="sg-cargando">
<div class="sg-spinner"></div>
<span>Subiendo GIF...</span>
</div>
`;
try {
// Si ya había uno, borrar el anterior
const metaAnterior = await cargarMetadata();
if (metaAnterior) {
await borrarBinario();
await borrarMetadata();
}
// Subir el nuevo
await subirBinario(file);
// Guardar metadata
await guardarMetadata({
nombre: file.name,
tamano: file.size,
tipo: file.type,
subida: new Date().toISOString()
});
await render();
} catch (e) {
console.warn('[SillyGif] Error subiendo:', e);
alert('No se pudo subir el GIF. Inténtalo de nuevo.');
await render();
}
}
async function quitarGif() {
if (!confirm('¿Quitar el GIF decorativo?')) return;
const zona = document.getElementById('sgZona');
zona.innerHTML = `
<div class="sg-cargando">
<div class="sg-spinner"></div>
<span>Quitando...</span>
</div>
`;
try {
await borrarBinario();
await borrarMetadata();
} catch (e) {
console.warn('[SillyGif] Error quitando:', e);
}
await render();
}
// ============================================================
//  INIT
// ============================================================
async function inicializar() {
aplicarTemaDelPadre();
try {
const api = API();
usuarioActual = (api && typeof api.obtenerCuenta === 'function')
? api.obtenerCuenta()
: null;
} catch (e) { usuarioActual = null; }
// Eventos
document.getElementById('sgBtnCambiar')?.addEventListener('click', abrirSelector);
document.getElementById('sgBtnQuitar')?.addEventListener('click', quitarGif);
document.getElementById('sgFileInput')?.addEventListener('change', (e) => {
const file = e.target.files[0];
if (file) procesarArchivo(file);
e.target.value = ''; // reset para permitir re-subir el mismo archivo
});
await render();
if (window.lucide) window.lucide.createIcons();
}
document.addEventListener('DOMContentLoaded', inicializar);
window.addEventListener('unload', liberarUrlAnterior);
