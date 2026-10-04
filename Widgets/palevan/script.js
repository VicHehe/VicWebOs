// ============================================================
//  Widget: Palevan
//  ------------------------------------------------------------
//  Extrae los colores dominantes de una imagen usando Canvas.
//  La imagen NO se guarda en ningún lado — solo se procesa
//  en memoria durante la sesión.
//
//  Cero persistencia. Cero red. Cero API externa.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const K_DEFAULT = 6;
const THUMB_MAX = 120;          // lado máximo del canvas de análisis
const UMBRAL_SIMILITUD = 40;    // distancia RGB mínima entre colores

let usuarioActual = null;
let inicializado = false;

// Estado volátil (todo se pierde al recargar — a propósito)
let imagenSrcActual = null;     // blob: URL a revocar
let imagenElemento = null;      // HTMLImageElement cargada
let paletaActual = null;        // [{hex, rgb, count}]
let kActual = K_DEFAULT;
let procesando = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const MH = () => {
    try { return window.parent.MasterHad || null; }
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
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function rgbAHex(r, g, b) {
    const h = (n) => n.toString(16).padStart(2, '0').toUpperCase();
    return '#' + h(r) + h(g) + h(b);
}

function distanciaRGB(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ============================================================
//  ALGORITMO DE EXTRACCIÓN
//  ------------------------------------------------------------
//  Histograma cuantizado (4 bits por canal = 4096 buckets)
//  + orden por frecuencia + filtro de similitud para evitar
//  colores casi idénticos.
//
//  Por qué no k-means: es más lento, iterativo, y para imágenes
//  fotográficas el histograma + filtro de similitud da resultados
//  igual de buenos con 1/10 del código.
// ============================================================
function extraerColores(imageData, K) {
    const data = imageData.data;
    const len = data.length;

    const map = new Map();

    for (let i = 0; i < len; i += 4) {
        const a = data[i + 3];
        if (a < 128) continue;   // ignorar transparentes

        // Cuantizar a 4 bits por canal
        const r = data[i]     >> 4;
        const g = data[i + 1] >> 4;
        const b = data[i + 2] >> 4;

        const key = (r << 8) | (g << 4) | b;
        map.set(key, (map.get(key) || 0) + 1);
    }

    // Ordenar por frecuencia descendente
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);

    // Tomar colores evitando duplicados perceptuales
    const out = [];
    for (const [key, count] of sorted) {
        // Des-cuantizar centrando en el bucket (queda más natural)
        const r = (((key >> 8) & 0xF) << 4) | 0x8;
        const g = (((key >> 4) & 0xF) << 4) | 0x8;
        const b = ((key & 0xF) << 4) | 0x8;

        let similar = false;
        for (const c of out) {
            if (distanciaRGB(c.rgb, [r, g, b]) < UMBRAL_SIMILITUD) {
                similar = true;
                break;
            }
        }
        if (similar) continue;

        out.push({
            rgb: [r, g, b],
            hex: rgbAHex(r, g, b),
            count
        });

        if (out.length >= K) break;
    }

    return out;
}

// ============================================================
//  ANÁLISIS DE IMAGEN
// ============================================================
function analizarImagen(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('Imagen inválida.');

    // Escalar para análisis rápido (máx THUMB_MAX en el lado largo)
    const escala = Math.min(1, THUMB_MAX / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * escala));
    const ch = Math.max(1, Math.round(h * escala));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
    ctx2d.drawImage(img, 0, 0, cw, ch);

    const imageData = ctx2d.getImageData(0, 0, cw, ch);
    return extraerColores(imageData, kActual);
}

// ============================================================
//  CARGA DE IMAGEN (desde File o desde blob URL)
// ============================================================
function cargarDesdeFile(file) {
    return new Promise((resolve, reject) => {
        if (!file) { reject(new Error('Sin archivo.')); return; }
        if (!file.type || !file.type.startsWith('image/')) {
            reject(new Error('El archivo no es una imagen.'));
            return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload  = () => resolve({ img, url });
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
        img.src = url;
    });
}

async function cargarDesdeGaleria() {
    const mh = MH();
    if (!mh || !mh.galeria) throw new Error('La galería no está disponible.');

    const id = await mh.galeria.abrirPicker({
        multiple: false,
        titulo: 'Elige una imagen'
    });
    if (!id) return null;   // usuario canceló

    const url = await mh.galeria.leerImagenURL(id);
    if (!url) throw new Error('No se pudo cargar la imagen.');

    return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve({ img, url });
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
        img.src = url;
    });
}

// ============================================================
//  APLICAR IMAGEN
// ============================================================
async function aplicarImagen({ img, url }) {
    // Revocar la anterior (si había)
    limpiarImagenAnterior();

    imagenElemento = img;
    imagenSrcActual = url;

    // Analizar
    paletaActual = analizarImagen(img);

    // Render
    render();
}

function limpiarImagenAnterior() {
    if (imagenSrcActual) {
        try { URL.revokeObjectURL(imagenSrcActual); } catch (e) {}
        imagenSrcActual = null;
    }
    imagenElemento = null;
    paletaActual = null;
}

function limpiarTodo() {
    limpiarImagenAnterior();
    render();
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    const zona = document.getElementById('plZona');
    const preview = document.getElementById('plPreview');
    const thumb = document.getElementById('plThumb');

    if (!zona) return;

    // Sin imagen → empty state
    if (!imagenElemento || !paletaActual) {
        if (preview) preview.hidden = true;
        zona.innerHTML = `
            <div class="pl-vacio">
                <div class="pl-vacio-icono">
                    <i data-lucide="palette"></i>
                </div>
                <p>Extraé los colores dominantes de una imagen</p>
                <button class="pl-btn-cargar" id="plBtnCargarVacio">
                    <i data-lucide="image-plus"></i>
                    Cargar imagen
                </button>
            </div>
        `;
        document.getElementById('plBtnCargarVacio')?.addEventListener('click', abrirModal);
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Con imagen → preview + swatches
    if (preview) preview.hidden = false;
    if (thumb) {
        thumb.src = imagenSrcActual;
        thumb.alt = 'Imagen cargada';
    }

    zona.innerHTML = `<div class="pl-swatches" id="plSwatches"></div>`;
    const cont = document.getElementById('plSwatches');

    paletaActual.forEach(c => {
        const sw = document.createElement('button');
        sw.className = 'pl-swatch';
        sw.type = 'button';
        sw.dataset.hex = c.hex;
        sw.innerHTML = `
            <div class="pl-swatch-color" style="background:${escapar(c.hex)};"></div>
            <div class="pl-swatch-hex">${escapar(c.hex)}</div>
        `;
        sw.title = 'Click para copiar ' + c.hex;
        sw.addEventListener('click', () => copiarHex(c.hex, sw));
        cont.appendChild(sw);
    });

    if (window.lucide) window.lucide.createIcons();
}

async function copiarHex(hex, swatchEl) {
    let ok = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(hex);
            ok = true;
        }
    } catch (e) { /* fallback */ }

    if (!ok) {
        try {
            const ta = document.createElement('textarea');
            ta.value = hex;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            ok = true;
        } catch (e) { ok = false; }
    }

    if (!ok) return;

    // Feedback visual
    const hexEl = swatchEl.querySelector('.pl-swatch-hex');
    if (!hexEl) return;
    const original = hexEl.textContent;
    hexEl.textContent = '¡Copiado!';
    swatchEl.classList.add('copiado');
    setTimeout(() => {
        hexEl.textContent = original;
        swatchEl.classList.remove('copiado');
    }, 1100);
}

// ============================================================
//  MODAL
// ============================================================
function abrirModal() {
    const modal = document.getElementById('plModal');
    if (!modal) return;
    modal.hidden = false;

    // Verificar disponibilidad de galería
    const help = document.getElementById('plGaleriaHelp');
    const btnGal = document.getElementById('plBtnGaleria');
    const mh = MH();
    const api = API();
    const tieneCuenta = !!(api && api.obtenerCuenta && api.obtenerCuenta());

    if (help && btnGal) {
        if (!mh || !mh.galeria) {
            btnGal.disabled = true;
            help.textContent = 'La galería no está disponible en este momento.';
        } else if (!tieneCuenta) {
            btnGal.disabled = true;
            help.textContent = 'Necesitás una cuenta para usar tu galería.';
        } else {
            btnGal.disabled = false;
            help.textContent = 'Elegí una imagen de tu galería de VicWebOs.';
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('plModal');
    if (modal) modal.hidden = true;
}

// ============================================================
//  PROCESO DE CARGA (con spinner + try/catch)
// ============================================================
async function procesarCarga(promesaCarga) {
    if (procesando) return;
    procesando = true;

    const zona = document.getElementById('plZona');

    // Mostrar spinner (solo si no hay imagen aún)
    if (!imagenElemento && zona) {
        zona.innerHTML = `
            <div class="pl-cargando">
                <div class="pl-spinner"></div>
                <span>Procesando imagen…</span>
            </div>
        `;
    }

    try {
        const resultado = await promesaCarga;
        if (!resultado) {
            // Cancelado por el usuario
            procesando = false;
            render();
            return;
        }
        await aplicarImagen(resultado);
        cerrarModal();
    } catch (err) {
        console.warn('[Palevan] Error:', err);
        alert(err.message || 'No se pudo procesar la imagen.');
        render();
    } finally {
        procesando = false;
    }
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    // Botón cargar (header y empty)
    document.getElementById('plBtnCargar')?.addEventListener('click', abrirModal);

    // Modal
    document.getElementById('plModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('plModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'plModal') cerrarModal();
    });

    // Tabs
    document.querySelectorAll('.pl-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.pl-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.pl-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`.pl-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
        });
    });

    // File input
    document.getElementById('plFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        procesarCarga(cargarDesdeFile(file));
    });

    // Botón galería
    document.getElementById('plBtnGaleria')?.addEventListener('click', () => {
        procesarCarga(cargarDesdeGaleria());
    });

    // Selector de K
    document.getElementById('plKSelect')?.addEventListener('change', (e) => {
        const nuevoK = parseInt(e.target.value, 10) || K_DEFAULT;
        kActual = nuevoK;
        if (imagenElemento) {
            try {
                paletaActual = analizarImagen(imagenElemento);
                render();
            } catch (err) {
                console.warn('[Palevan] Re-análisis falló:', err);
            }
        }
    });

    // Esc
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('plModal').hidden) cerrarModal();
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

    // Sincronizar el select de K con el valor por defecto
    const sel = document.getElementById('plKSelect');
    if (sel) sel.value = String(K_DEFAULT);
    kActual = K_DEFAULT;

    render();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

// Limpiar blobs al salir (por si el navegador no limpia solo)
window.addEventListener('pagehide', () => {
    limpiarImagenAnterior();
});
