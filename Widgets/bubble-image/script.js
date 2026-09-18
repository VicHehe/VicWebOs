// ============================================================
//  Widget: Imagen Burbuja
//  Muestra una imagen de la galería del usuario en un círculo.
//  Persistencia POR USUARIO en:
//      app/bubble-image/{codigo}bubble-image.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/bubble-image/';

let imagenId = null;

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
    return ARCHIVO + cuenta.codigo + 'bubble-image.json';
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
        if (data && typeof data.imagenId === 'string' && data.imagenId) {
            imagenId = data.imagenId;
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
            imagenId: imagenId,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[BubbleImage] No se pudo guardar:', e);
    }
}

// ------------------------------------------------------------
//  Acciones
// ------------------------------------------------------------
async function elegirImagen() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige una imagen para la burbuja'
        });
        if (!id) return;
        imagenId = id;
        await guardar();
        await render();
    } catch (e) {
        console.warn('[BubbleImage] Error en picker:', e);
    }
}

async function quitarImagen() {
    if (!imagenId) return;
    if (!confirm('¿Quitar la imagen de la burbuja?')) return;
    imagenId = null;
    await guardar();
    await render();
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
async function render() {
    const zona = document.getElementById('biZona');
    const acciones = document.getElementById('biAcciones');
    if (!zona) return;

    // --- Sin imagen ---
    if (!imagenId) {
        acciones.hidden = true;
        zona.innerHTML = `
            <div class="bi-empty">
                <div class="bi-empty-icon">
                    <i data-lucide="image-plus"></i>
                </div>
                <p>Elige una imagen de tu galería</p>
                <button class="bi-btn" id="biBtnElegirEmpty">
                    <i data-lucide="image-plus"></i>
                    Elegir imagen
                </button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        document.getElementById('biBtnElegirEmpty')?.addEventListener('click', elegirImagen);
        return;
    }

    // --- Con imagen ---
    acciones.hidden = false;
    zona.innerHTML = `<div class="bi-burbuja-cargando"></div>`;

    try {
        const mh = MH();
        const url = await mh.galeria.leerImagenURL(imagenId);
        if (!url) throw new Error('sin url');
        zona.innerHTML = `<img class="bi-burbuja" id="biBurbuja" alt="">`;
        const img = document.getElementById('biBurbuja');
        img.src = url;
        img.onload = () => URL.revokeObjectURL(url);
    } catch (e) {
        console.warn('[BubbleImage] No se pudo cargar la imagen:', e);
        zona.innerHTML = `
            <div class="bi-empty">
                <p>No se pudo cargar la imagen.</p>
                <button class="bi-btn" id="biBtnReintentar">
                    <i data-lucide="refresh-cw"></i>
                    Reintentar
                </button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        document.getElementById('biBtnReintentar')?.addEventListener('click', render);
    }
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    document.getElementById('biBtnCambiar')?.addEventListener('click', elegirImagen);
    document.getElementById('biBtnQuitar')?.addEventListener('click', quitarImagen);

    await cargar();
    await render();

    if (window.lucide) window.lucide.createIcons();
});
