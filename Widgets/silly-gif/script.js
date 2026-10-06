'use strict';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/gif-decorativo/';
let gifId = null;
const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;
const BD  = () => window.parent.ConfigBD || null;

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
function rutaArchivo() {
const api = API();
if (!api) return null;
const cuenta = api.obtenerCuenta();
if (!cuenta || !cuenta.codigo) return null;
return ARCHIVO + cuenta.codigo + 'gif-decorativo.json';
}

// ------------------------------------------------------------
//  Cargar / guardar
// ------------------------------------------------------------
async function cargar() {
const bd = BD();
const ruta = rutaArchivo();
if (!bd || !ruta) return;
try {
const data = await bd.leerArchivo(ruta);
if (data && typeof data.gifId === 'string' && data.gifId) {
gifId = data.gifId;
}
} catch (e) { /* no existe */ }
}

async function guardar() {
const bd = BD();
const ruta = rutaArchivo();
if (!bd || !ruta) return;
try {
await bd.escribirArchivo(ruta, {
version: 1,
gifId: gifId,
actualizado: new Date().toISOString()
});
} catch (e) {
console.warn('[GIFDecorativo] No se pudo guardar:', e);
}
}

// ------------------------------------------------------------
//  Acciones
// ------------------------------------------------------------
async function elegirGIF() {
const mh = MH();
if (!mh) return;
try {
const id = await mh.galeria.abrirPicker({
multiple: false,
titulo: 'Elige un GIF decorativo'
});
if (!id) return;
gifId = id;
await guardar();
await render();
} catch (e) {
console.warn('[GIFDecorativo] Error en picker:', e);
}
}

async function quitarGIF() {
if (!gifId) return;
if (!confirm('¿Quitar el GIF decorativo?')) return;
gifId = null;
await guardar();
await render();
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
async function render() {
const zona = document.getElementById('gdZona');
const acciones = document.getElementById('gdAcciones');
if (!zona) return;

// --- Sin GIF ---
if (!gifId) {
acciones.hidden = true;
zona.innerHTML = `
<div class="gd-empty">
<div class="gd-empty-icon">
<i data-lucide="image-plus"></i>
</div>
<p>Elige un GIF de tu galería</p>
<button class="gd-btn" id="gdBtnElegirEmpty">
<i data-lucide="image-plus"></i>
Elegir GIF
</button>
</div>
`;
if (window.lucide) window.lucide.createIcons();
document.getElementById('gdBtnElegirEmpty')?.addEventListener('click', elegirGIF);
return;
}

// --- Con GIF ---
acciones.hidden = false;
zona.innerHTML = `<div class="gd-burbuja-cargando"></div>`;
try {
const mh = MH();
const url = await mh.galeria.leerImagenURL(gifId);
if (!url) throw new Error('sin url');
zona.innerHTML = `<img class="gd-burbuja" id="gdBurbuja" alt="">`;
const img = document.getElementById('gdBurbuja');
img.src = url;
img.onload = () => URL.revokeObjectURL(url);
} catch (e) {
console.warn('[GIFDecorativo] No se pudo cargar el GIF:', e);
zona.innerHTML = `
<div class="gd-empty">
<p>No se pudo cargar el GIF.</p>
<button class="gd-btn" id="gdBtnReintentar">
<i data-lucide="refresh-cw"></i>
Reintentar
</button>
</div>
`;
if (window.lucide) window.lucide.createIcons();
document.getElementById('gdBtnReintentar')?.addEventListener('click', render);
}
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
aplicarTemaDelPadre();
document.getElementById('gdBtnCambiar')?.addEventListener('click', elegirGIF);
document.getElementById('gdBtnQuitar')?.addEventListener('click', quitarGIF);
await cargar();
await render();
if (window.lucide) window.lucide.createIcons();
});
