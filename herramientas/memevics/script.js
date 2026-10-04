// ============================================================
//  Meme Sculptor — Creador de memes
//  ------------------------------------------------------------
//  · Elegís imagen (Galería o subir) — NO se persiste
//  · Texto arriba/abajo, blanco con borde negro (editable)
//  · Export: PNG o Galería
//  · Cero librerías externas (Canvas 2D nativo)
// ============================================================

'use strict';

// ============================================================
//  CONSTANTES
// ============================================================
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MAX_LADO_IMAGEN = 1600; // cap al importar (para no reventar)
const PADDING_RELATIVO = 0.03; // 3% del ancho

// ============================================================
//  API
// ============================================================
const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  ESTADO
// ============================================================
const state = {
    imagen: null,          // HTMLImageElement
    imagenNombre: null,
    textoArriba: '',
    textoAbajo: '',
    tamano: 60,
    colorTexto: '#FFFFFF',
    colorBorde: '#000000',
    grosorBorde: 6
};

let usuarioActual = null;
let canvas = null;
let ctx = null;
let toastTimeout = null;
let urlsTemporales = [];

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
            '--shadow-glow',
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
    const el = document.getElementById('msToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ms-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    if (!ctx || !state.imagen) return;

    const W = canvas.width;
    const H = canvas.height;

    // 1. Imagen base
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(state.imagen, 0, 0, W, H);

    // 2. Configuración de texto
    const padding = Math.round(W * PADDING_RELATIVO);
    const maxWidth = W - padding * 2;
    const lineH = state.tamano * 1.08;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.miterLimit = 2;
    ctx.font = `900 ${state.tamano}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;

    // 3. Texto de arriba
    if (state.textoArriba.trim()) {
        const lineas = envolverTexto(state.textoArriba.trim(), maxWidth);
        // Auto-reduce si ocupa mucho (más de 3 líneas y más del 40% de alto)
        let tamAjustado = state.tamano;
        if (lineas.length * lineH > H * 0.45) {
            tamAjustado = Math.max(16, Math.floor(state.tamano * (H * 0.45) / (lineas.length * lineH)));
            ctx.font = `900 ${tamAjustado}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
        }
        const lh = tamAjustado * 1.08;
        let y = padding;
        for (const linea of lineas) {
            dibujarTextoConBorde(linea, W / 2, y);
            y += lh;
        }
    }

    // 4. Texto de abajo
    if (state.textoAbajo.trim()) {
        const lineas = envolverTexto(state.textoAbajo.trim(), maxWidth);
        let tamAjustado = state.tamano;
        if (lineas.length * lineH > H * 0.45) {
            tamAjustado = Math.max(16, Math.floor(state.tamano * (H * 0.45) / (lineas.length * lineH)));
            ctx.font = `900 ${tamAjustado}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
        }
        const lh = tamAjustado * 1.08;
        const alturaTotal = lineas.length * lh;
        let y = H - padding - alturaTotal + (lh - tamAjustado);
        for (const linea of lineas) {
            dibujarTextoConBorde(linea, W / 2, y);
            y += lh;
        }
    }
}

function dibujarTextoConBorde(texto, x, y) {
    if (state.grosorBorde > 0) {
        ctx.lineWidth = state.grosorBorde * 2;
        ctx.strokeStyle = state.colorBorde;
        ctx.strokeText(texto, x, y);
    }
    ctx.fillStyle = state.colorTexto;
    ctx.fillText(texto, x, y);
}

function envolverTexto(texto, maxWidth) {
    const palabras = texto.split(/\s+/);
    const lineas = [];
    let actual = '';
    for (const palabra of palabras) {
        const prueba = actual ? actual + ' ' + palabra : palabra;
        if (ctx.measureText(prueba).width <= maxWidth || !actual) {
            actual = prueba;
        } else {
            lineas.push(actual);
            actual = palabra;
        }
    }
    if (actual) lineas.push(actual);
    return lineas;
}

// ============================================================
//  CARGA DE IMAGEN
// ============================================================
function cargarImagen(img, nombre) {
    // Cap de tamaño
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const ratio = Math.min(1, MAX_LADO_IMAGEN / Math.max(w, h));
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);

    canvas.width = w;
    canvas.height = h;
    canvas.hidden = false;

    state.imagen = img;
    state.imagenNombre = nombre || 'Imagen';

    // UI: ocultar empty, mostrar canvas
    document.getElementById('msEmpty').hidden = true;
    const info = document.getElementById('msCanvasInfo');
    if (info) {
        info.hidden = false;
        const txt = document.getElementById('msCanvasInfoTxt');
        if (txt) txt.textContent = `${state.imagenNombre} · ${w}×${h}`;
    }

    // Habilitar controles
    habilitarControles(true);

    // Ajustar visual y renderizar
    ajustarCanvasAlContenedor();
    render();
}

function ajustarCanvasAlContenedor() {
    const wrap = document.getElementById('msCanvasWrap');
    if (!wrap || !state.imagen) return;
    const rect = wrap.getBoundingClientRect();
    const padding = 24;
    const availW = Math.max(50, rect.width - padding);
    const availH = Math.max(50, rect.height - padding);
    const ratio = canvas.width / canvas.height;

    let dispW, dispH;
    if (availW / availH > ratio) {
        dispH = availH;
        dispW = dispH * ratio;
    } else {
        dispW = availW;
        dispH = dispW / ratio;
    }
    canvas.style.width = dispW + 'px';
    canvas.style.height = dispH + 'px';
}

function habilitarControles(activo) {
    const ids = [
        'inputArriba','inputAbajo','sliderTamano','colorTexto','colorBorde',
        'sliderGrosor','btnDescargarPNG','btnGuardarGaleria','btnExportarHeader',
        'btnQuitarImagen'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !activo;
    });
}

function quitarImagen() {
    if (!state.imagen) return;
    if (!confirm('¿Quitar la imagen actual? Se perderán los textos escritos.')) return;

    state.imagen = null;
    state.imagenNombre = null;
    state.textoArriba = '';
    state.textoAbajo = '';

    // Resetear inputs
    const ia = document.getElementById('inputArriba');
    const ib = document.getElementById('inputAbajo');
    if (ia) ia.value = '';
    if (ib) ib.value = '';

    // UI
    canvas.hidden = true;
    document.getElementById('msEmpty').hidden = false;
    const info = document.getElementById('msCanvasInfo');
    if (info) info.hidden = true;

    habilitarControles(false);

    // Revocar URLs temporales
    liberarUrls();
}

// ============================================================
//  ELEGIR IMAGEN
// ============================================================
async function elegirDesdeGaleria() {
    const mh = MH();
    if (!mh) {
        toast('Sin conexión al sistema', 'error');
        return;
    }
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elegí una imagen para tu meme'
        });
        if (!id) return;

        const url = await mh.galeria.leerImagenURL(id);
        if (!url) {
            toast('No se pudo cargar la imagen', 'error');
            return;
        }
        urlsTemporales.push(url);

        const img = new Image();
        img.onload = () => {
            const meta = state.imagen; // guardar por si acaso
            cargarImagen(img, 'Desde Galería');
            toast('Imagen cargada', 'success');
        };
        img.onerror = () => {
            toast('No se pudo cargar la imagen', 'error');
        };
        img.src = url;
    } catch (e) {
        console.warn('[Meme Sculptor] Error en galería:', e);
        toast('No se pudo abrir la Galería', 'error');
    }
}

function elegirDesdeDispositivo() {
    const input = document.getElementById('inputFile');
    if (!input) return;
    input.value = '';
    input.click();
}

function alSeleccionarArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast('El archivo no es una imagen', 'error');
        return;
    }

    const url = URL.createObjectURL(file);
    urlsTemporales.push(url);

    const img = new Image();
    img.onload = () => {
        cargarImagen(img, file.name.replace(/\.[^.]+$/, ''));
        toast('Imagen cargada', 'success');
    };
    img.onerror = () => {
        toast('No se pudo cargar la imagen', 'error');
    };
    img.src = url;
}

function liberarUrls() {
    urlsTemporales.forEach(u => {
        try { URL.revokeObjectURL(u); } catch (err) {}
    });
    urlsTemporales = [];
}

// ============================================================
//  EXPORTAR
// ============================================================
function descargarPNG() {
    if (!state.imagen) return;
    canvas.toBlob((blob) => {
        if (!blob) {
            toast('No se pudo exportar', 'error');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meme_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Meme descargado', 'success');
    }, 'image/png');
}

async function guardarEnGaleria() {
    if (!state.imagen) return;
    const mh = MH();
    if (!mh) {
        toast('Sin conexión al sistema', 'error');
        return;
    }

    canvas.toBlob(async (blob) => {
        if (!blob) {
            toast('No se pudo exportar', 'error');
            return;
        }
        try {
            const ahora = new Date();
            const fecha = ahora.toLocaleDateString('es-CL', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });
            const nombre = `Meme ${fecha}.png`;

            await mh.galeria.subirImagen(blob, {
                codigo: usuarioActual.codigo,
                nombre,
                carpeta: 'c_general',
                comprimir: false
            });

            toast('Guardado en Galería', 'success');
        } catch (e) {
            console.warn('[Meme Sculptor] Guardar en Galería falló:', e);
            toast(e.message || 'No se pudo guardar', 'error');
        }
    }, 'image/png');
}

// ============================================================
//  WIRING DE UI
// ============================================================
function wireUI() {
    // Ayuda
    document.getElementById('btnAyuda')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('modalAyudaCerrar')?.addEventListener('click', () => {
        document.getElementById('modalAyuda').hidden = true;
    });
    document.getElementById('modalAyuda')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalAyuda') e.target.hidden = true;
    });

    // Elegir imagen
    document.getElementById('btnGaleria')?.addEventListener('click', elegirDesdeGaleria);
    document.getElementById('btnSubir')?.addEventListener('click', elegirDesdeDispositivo);
    document.getElementById('msEmptyGaleria')?.addEventListener('click', elegirDesdeGaleria);
    document.getElementById('msEmptySubir')?.addEventListener('click', elegirDesdeDispositivo);
    document.getElementById('btnQuitarImagen')?.addEventListener('click', quitarImagen);
    document.getElementById('inputFile')?.addEventListener('change', alSeleccionarArchivo);

    // Texto arriba/abajo
    document.getElementById('inputArriba')?.addEventListener('input', (e) => {
        state.textoArriba = e.target.value;
        render();
    });
    document.getElementById('inputAbajo')?.addEventListener('input', (e) => {
        state.textoAbajo = e.target.value;
        render();
    });

    // Tamaño
    const sliderTam = document.getElementById('sliderTamano');
    const tamVal = document.getElementById('tamanoValor');
    sliderTam?.addEventListener('input', (e) => {
        state.tamano = parseInt(e.target.value, 10);
        if (tamVal) tamVal.textContent = state.tamano;
        render();
    });

    // Colores
    document.getElementById('colorTexto')?.addEventListener('input', (e) => {
        state.colorTexto = e.target.value;
        render();
    });
    document.getElementById('colorBorde')?.addEventListener('input', (e) => {
        state.colorBorde = e.target.value;
        render();
    });

    // Grosor borde
    const sliderGro = document.getElementById('sliderGrosor');
    const groVal = document.getElementById('grosorValor');
    sliderGro?.addEventListener('input', (e) => {
        state.grosorBorde = parseInt(e.target.value, 10);
        if (groVal) groVal.textContent = state.grosorBorde;
        render();
    });

    // Exportar
    document.getElementById('btnDescargarPNG')?.addEventListener('click', descargarPNG);
    document.getElementById('btnGuardarGaleria')?.addEventListener('click', guardarEnGaleria);
    document.getElementById('btnExportarHeader')?.addEventListener('click', () => {
        // Scroll suave hasta la sección de exportar en el panel
        const panel = document.getElementById('msPanel');
        const exp = document.getElementById('btnDescargarPNG');
        if (panel && exp) {
            exp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });

    // Resize: ajustar canvas
    window.addEventListener('resize', () => {
        ajustarCanvasAlContenedor();
    });
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => ajustarCanvasAlContenedor());
        const wrap = document.getElementById('msCanvasWrap');
        if (wrap) ro.observe(wrap);
    }

    // ESC cierra el modal de ayuda
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const m = document.getElementById('modalAyuda');
            if (m && !m.hidden) m.hidden = true;
        }
    });
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Meme Sculptor necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Meme Sculptor.'); return; }

    const badge = document.getElementById('msUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    canvas = document.getElementById('msCanvas');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Estado inicial: controles deshabilitados hasta que haya imagen
    habilitarControles(false);

    wireUI();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    liberarUrls();
});
