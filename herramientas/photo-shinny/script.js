// ============================================================
//  Photo Shinny — Editor de imágenes
//  ------------------------------------------------------------
//  - Carga imágenes locales o de la Galería (vía picker)
//  - Filtros (brillo, contraste, saturación + presets)
//  - Transformaciones (voltear, rotar, recortar)
//  - Guarda en la Galería de VicWebOs
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ---------- ESTADO ----------
let usuarioActual = null;
let imagenOriginal = null;         // HTMLImageElement base (sin filtros)
let imagenCargada = false;
let nombreImagen = 'Imagen sin nombre';
let origenImagen = 'local';        // 'local' | 'galeria'

// Recorte
let cropActivo = false;
let cropRect = { x: 0, y: 0, w: 0, h: 0 };

// DOM
const canvas = document.getElementById('canvasPrincipal');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasStage = document.getElementById('canvasStage');
const placeholder = document.getElementById('placeholder');
const infoImagen = document.getElementById('infoImagen');
const imgNombre = document.getElementById('imgNombre');
const imgDimensiones = document.getElementById('imgDimensiones');

const cropOverlay = document.getElementById('cropOverlay');
const cropBox = document.getElementById('cropBox');

const brilloSlider = document.getElementById('brilloSlider');
const contrasteSlider = document.getElementById('contrasteSlider');
const saturacionSlider = document.getElementById('saturacionSlider');

const btnAbrirArchivo = document.getElementById('btnAbrirArchivo');
const btnAbrirGaleria = document.getElementById('btnAbrirGaleria');
const btnGuardarPNG = document.getElementById('btnGuardarPNG');
const btnGuardarGaleria = document.getElementById('btnGuardarGaleria');
const fileInput = document.getElementById('fileInput');

// API
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
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('psToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ps-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  CARGA DE IMÁGENES
// ============================================================
function cargarImagenDesdeURL(url, nombre, origen) {
    const img = new Image();
    img.onload = () => {
        imagenOriginal = img;
        imagenCargada = true;
        nombreImagen = nombre || 'Imagen sin nombre';
        origenImagen = origen || 'local';

        // Resetear sliders
        brilloSlider.value = 0;
        contrasteSlider.value = 0;
        saturacionSlider.value = 0;
        document.getElementById('brilloValor').textContent = '0';
        document.getElementById('contrasteValor').textContent = '0';
        document.getElementById('saturacionValor').textContent = '0';

        // Mostrar canvas, ocultar placeholder
        canvasStage.classList.add('visible');
        placeholder.hidden = true;
        infoImagen.hidden = false;

        // Aplicar imagen al canvas
        aplicarImagenAlCanvas(img);

        // Habilitar botones
        btnGuardarPNG.disabled = false;
        btnGuardarGaleria.disabled = false;

        // Actualizar info
        actualizarInfo();

        // Resetear recorte si estaba activo
        if (cropActivo) cancelarRecorte();

        // Si era una URL blob, la revocamos tras cargar
        if (url.startsWith('blob:')) {
            setTimeout(() => URL.revokeObjectURL(url), 500);
        }
    };
    img.onerror = () => {
        toast('No se pudo cargar la imagen', 'error');
    };
    img.src = url;
}

function aplicarImagenAlCanvas(img) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0);

    // Ajustar tamaño del stage
    // El CSS se encarga del max-width/max-height
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
}

function actualizarInfo() {
    imgNombre.textContent = nombreImagen;
    imgDimensiones.textContent = `${canvas.width} × ${canvas.height}`;
}

// ============================================================
//  CARGA LOCAL
// ============================================================
function abrirArchivoLocal() {
    fileInput.click();
}

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        toast('Solo se admiten imágenes', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
        cargarImagenDesdeURL(ev.target.result, file.name, 'local');
    };
    reader.onerror = () => toast('Error leyendo el archivo', 'error');
    reader.readAsDataURL(file);
    fileInput.value = '';
});

// ============================================================
//  CARGA DESDE GALERÍA
// ============================================================
async function abrirDesdeGaleria() {
    const mh = MH();
    if (!mh || !mh.galeria) {
        toast('Galería no disponible', 'error');
        return;
    }
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige una imagen para editar'
        });
        if (!id) return;
        const meta = await mh.galeria.obtenerImagen(id);
        const url = await mh.galeria.leerImagenURL(id);
        if (!url) {
            toast('No se pudo cargar la imagen', 'error');
            return;
        }
        cargarImagenDesdeURL(url, meta?.nombre || 'Desde galería', 'galeria');
    } catch (e) {
        console.warn('[Photo Shinny] Error picker:', e);
        toast('No se pudo abrir la galería', 'error');
    }
}

// ============================================================
//  FILTROS Y AJUSTES
// ============================================================
function aplicarAjustes() {
    if (!imagenCargada || !imagenOriginal) return;

    const w = imagenOriginal.naturalWidth;
    const h = imagenOriginal.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(imagenOriginal, 0, 0);

    const brillo = parseInt(brilloSlider.value, 10);
    const contraste = parseInt(contrasteSlider.value, 10);
    const saturacion = parseInt(saturacionSlider.value, 10);

    if (brillo !== 0 || contraste !== 0 || saturacion !== 0) {
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Brillo
            r += brillo * 2.55;
            g += brillo * 2.55;
            b += brillo * 2.55;

            // Contraste
            const factorC = (contraste + 100) / 100;
            r = ((r / 255 - 0.5) * factorC + 0.5) * 255;
            g = ((g / 255 - 0.5) * factorC + 0.5) * 255;
            b = ((b / 255 - 0.5) * factorC + 0.5) * 255;

            // Saturación
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const factorS = (saturacion + 100) / 100;
            r = gray + (r - gray) * factorS;
            g = gray + (g - gray) * factorS;
            b = gray + (b - gray) * factorS;

            data[i]     = Math.min(255, Math.max(0, r));
            data[i + 1] = Math.min(255, Math.max(0, g));
            data[i + 2] = Math.min(255, Math.max(0, b));
        }
        ctx.putImageData(imageData, 0, 0);
    }
}

// ============================================================
//  FILTROS PREDEFINIDOS
// ============================================================
function aplicarFiltroPredefinido(tipo) {
    if (!imagenCargada || !imagenOriginal) return;

    // Resetear sliders
    brilloSlider.value = 0;
    contrasteSlider.value = 0;
    saturacionSlider.value = 0;
    document.getElementById('brilloValor').textContent = '0';
    document.getElementById('contrasteValor').textContent = '0';
    document.getElementById('saturacionValor').textContent = '0';

    const w = imagenOriginal.naturalWidth;
    const h = imagenOriginal.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(imagenOriginal, 0, 0);

    if (tipo === 'reset') return;

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    switch (tipo) {
        case 'grises':
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                data[i] = data[i + 1] = data[i + 2] = gray;
            }
            break;

        case 'sepia':
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i + 1], b = data[i + 2];
                data[i]     = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
                data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
                data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
            }
            break;

        case 'negativo':
            for (let i = 0; i < data.length; i += 4) {
                data[i]     = 255 - data[i];
                data[i + 1] = 255 - data[i + 1];
                data[i + 2] = 255 - data[i + 2];
            }
            break;

        case 'desenfoque': {
            const ww = w, hh = h;
            const originalData = new Uint8ClampedArray(data);
            const kernel = [1, 1, 1, 1, 1, 1, 1, 1, 1];
            const kSum = 9;
            for (let y = 1; y < hh - 1; y++) {
                for (let x = 1; x < ww - 1; x++) {
                    let r = 0, g = 0, b = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * ww + (x + kx)) * 4;
                            const k = kernel[(ky + 1) * 3 + (kx + 1)];
                            r += originalData[idx] * k;
                            g += originalData[idx + 1] * k;
                            b += originalData[idx + 2] * k;
                        }
                    }
                    const idx = (y * ww + x) * 4;
                    data[idx]     = r / kSum;
                    data[idx + 1] = g / kSum;
                    data[idx + 2] = b / kSum;
                }
            }
            break;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    actualizarImagenBaseDesdeCanvas();
}

// ============================================================
//  ACTUALIZAR IMAGEN BASE DESDE CANVAS
//  (Cuando aplicamos transformaciones o filtros, queremos
//   que esos cambios sean la nueva "base" para siguientes
//   operaciones)
// ============================================================
function actualizarImagenBaseDesdeCanvas() {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            imagenOriginal = img;
            actualizarInfo();
            resolve();
        };
        img.src = canvas.toDataURL('image/png');
    });
}

// ============================================================
//  TRANSFORMACIONES
// ============================================================
async function voltearH() {
    if (!imagenCargada) return;
    const w = canvas.width, h = canvas.height;
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.translate(w, 0);
    tctx.scale(-1, 1);
    tctx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(temp, 0, 0);

    await actualizarImagenBaseDesdeCanvas();
}

async function voltearV() {
    if (!imagenCargada) return;
    const w = canvas.width, h = canvas.height;
    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    tctx.translate(0, h);
    tctx.scale(1, -1);
    tctx.drawImage(canvas, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(temp, 0, 0);

    await actualizarImagenBaseDesdeCanvas();
}

async function rotar90() {
    if (!imagenCargada) return;
    const w = canvas.width, h = canvas.height;
    const temp = document.createElement('canvas');
    temp.width = h;
    temp.height = w;
    const tctx = temp.getContext('2d');
    tctx.translate(h / 2, w / 2);
    tctx.rotate(Math.PI / 2);
    tctx.drawImage(canvas, -w / 2, -h / 2);

    canvas.width = h;
    canvas.height = w;
    canvas.style.width = h + 'px';
    canvas.style.height = w + 'px';
    ctx.clearRect(0, 0, h, w);
    ctx.drawImage(temp, 0, 0);

    await actualizarImagenBaseDesdeCanvas();
}

// ============================================================
//  RECORTE
// ============================================================
function iniciarRecorte() {
    if (!imagenCargada) return;
    cropActivo = true;
    cropOverlay.hidden = false;

    // Colocar el crop box en el centro con 80% del tamaño
    const stageRect = canvasStage.getBoundingClientRect();
    const boxW = stageRect.width * 0.8;
    const boxH = stageRect.height * 0.8;
    const boxX = (stageRect.width - boxW) / 2;
    const boxY = (stageRect.height - boxH) / 2;

    cropBox.style.left = boxX + 'px';
    cropBox.style.top = boxY + 'px';
    cropBox.style.width = boxW + 'px';
    cropBox.style.height = boxH + 'px';

    document.getElementById('btnRecortar').hidden = true;
    document.getElementById('btnAplicarRecorte').hidden = false;
    document.getElementById('btnCancelarRecorte').hidden = false;
}

function cancelarRecorte() {
    cropActivo = false;
    cropOverlay.hidden = true;
    document.getElementById('btnRecortar').hidden = false;
    document.getElementById('btnAplicarRecorte').hidden = true;
    document.getElementById('btnCancelarRecorte').hidden = true;
}

function aplicarRecorte() {
    if (!cropActivo) return;

    const stageRect = canvasStage.getBoundingClientRect();
    const boxRect = cropBox.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Coordenadas del crop box relativas al canvas
    const relX = boxRect.left - canvasRect.left;
    const relY = boxRect.top - canvasRect.top;

    // Escala de píxeles renderizados a píxeles reales del canvas
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;

    const cropX = Math.max(0, Math.round(relX * scaleX));
    const cropY = Math.max(0, Math.round(relY * scaleY));
    const cropW = Math.min(canvas.width - cropX, Math.round(boxRect.width * scaleX));
    const cropH = Math.min(canvas.height - cropY, Math.round(boxRect.height * scaleY));

    if (cropW <= 0 || cropH <= 0) {
        toast('Selección inválida', 'error');
        return;
    }

    // Extraer la región
    const imageData = ctx.getImageData(cropX, cropY, cropW, cropH);

    // Aplicar al canvas
    canvas.width = cropW;
    canvas.height = cropH;
    canvas.style.width = cropW + 'px';
    canvas.style.height = cropH + 'px';
    ctx.putImageData(imageData, 0, 0);

    cancelarRecorte();
    actualizarImagenBaseDesdeCanvas();
    toast('Recorte aplicado', 'success');
}

// ============================================================
//  DRAG DEL CROP BOX Y HANDLES
// ============================================================
let cropDragActivo = false;
let cropDragStart = null;

cropBox.addEventListener('pointerdown', (e) => {
    if (e.target.classList.contains('crop-handle')) return;
    e.preventDefault();
    e.stopPropagation();

    cropDragActivo = true;
    cropDragStart = {
        x: e.clientX,
        y: e.clientY,
        left: parseFloat(cropBox.style.left) || 0,
        top: parseFloat(cropBox.style.top) || 0
    };
    cropBox.setPointerCapture(e.pointerId);
});

cropBox.addEventListener('pointermove', (e) => {
    if (!cropDragActivo) return;

    const stageRect = canvasStage.getBoundingClientRect();
    const boxW = cropBox.offsetWidth;
    const boxH = cropBox.offsetHeight;

    const dx = e.clientX - cropDragStart.x;
    const dy = e.clientY - cropDragStart.y;

    let newLeft = cropDragStart.left + dx;
    let newTop = cropDragStart.top + dy;

    newLeft = Math.max(0, Math.min(stageRect.width - boxW, newLeft));
    newTop = Math.max(0, Math.min(stageRect.height - boxH, newTop));

    cropBox.style.left = newLeft + 'px';
    cropBox.style.top = newTop + 'px';
});

cropBox.addEventListener('pointerup', (e) => {
    cropDragActivo = false;
});

cropBox.addEventListener('pointercancel', () => {
    cropDragActivo = false;
});

// Handles
document.querySelectorAll('.crop-handle').forEach(handle => {
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const dir = handle.dataset.dir;
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = parseFloat(cropBox.style.left) || 0;
        const origTop = parseFloat(cropBox.style.top) || 0;
        const origW = cropBox.offsetWidth;
        const origH = cropBox.offsetHeight;
        const stageRect = canvasStage.getBoundingClientRect();
        const MIN = 30;

        handle.setPointerCapture(e.pointerId);

        const onMove = (ev) => {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let newLeft = origLeft;
            let newTop = origTop;
            let newW = origW;
            let newH = origH;

            if (dir.includes('e')) {
                newW = Math.max(MIN, origW + dx);
            }
            if (dir.includes('w')) {
                newW = Math.max(MIN, origW - dx);
                newLeft = origLeft + (origW - newW);
            }
            if (dir.includes('s')) {
                newH = Math.max(MIN, origH + dy);
            }
            if (dir.includes('n')) {
                newH = Math.max(MIN, origH - dy);
                newTop = origTop + (origH - newH);
            }

            // Clamp dentro del stage
            if (newLeft < 0) {
                newW += newLeft;
                newLeft = 0;
            }
            if (newTop < 0) {
                newH += newTop;
                newTop = 0;
            }
            if (newLeft + newW > stageRect.width) newW = stageRect.width - newLeft;
            if (newTop + newH > stageRect.height) newH = stageRect.height - newTop;
            if (newW < MIN) newW = MIN;
            if (newH < MIN) newH = MIN;

            cropBox.style.left = newLeft + 'px';
            cropBox.style.top = newTop + 'px';
            cropBox.style.width = newW + 'px';
            cropBox.style.height = newH + 'px';
        };

        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            handle.removeEventListener('pointercancel', onUp);
        };

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
        handle.addEventListener('pointercancel', onUp);
    });
});

// ============================================================
//  GUARDAR
// ============================================================
async function guardarPNG() {
    if (!imagenCargada) return;
    try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `${nombreImagen.replace(/\.[^.]+$/, '')}_editado_${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('PNG descargado', 'success');
    } catch (e) {
        console.warn('[Photo Shinny] PNG falló:', e);
        toast('No se pudo descargar', 'error');
    }
}

async function guardarEnGaleria() {
    if (!imagenCargada) return;
    const mh = MH();
    if (!mh || !mh.galeria) {
        toast('Galería no disponible', 'error');
        return;
    }

    const btn = btnGuardarGaleria;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2"></i><span>Guardando...</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const nombreLimpio = nombreImagen.replace(/\.[^.]+$/, '');
        const nombreFinal = `${nombreLimpio}_editado.png`;

        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre: nombreFinal,
            carpeta: 'c_general'
        });

        toast('Guardado en la Galería', 'success');
    } catch (e) {
        console.warn('[Photo Shinny] Guardar falló:', e);
        toast(e.message || 'No se pudo guardar', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    // Sliders
    brilloSlider.addEventListener('input', () => {
        document.getElementById('brilloValor').textContent = brilloSlider.value;
        aplicarAjustes();
    });
    contrasteSlider.addEventListener('input', () => {
        document.getElementById('contrasteValor').textContent = contrasteSlider.value;
        aplicarAjustes();
    });
    saturacionSlider.addEventListener('input', () => {
        document.getElementById('saturacionValor').textContent = saturacionSlider.value;
        aplicarAjustes();
    });

    // Filtros preset
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            aplicarFiltroPredefinido(btn.dataset.filtro);
        });
    });

    // Transformaciones
    document.getElementById('btnVoltearH').addEventListener('click', voltearH);
    document.getElementById('btnVoltearV').addEventListener('click', voltearV);
    document.getElementById('btnRotar90').addEventListener('click', rotar90);
    document.getElementById('btnRecortar').addEventListener('click', iniciarRecorte);
    document.getElementById('btnAplicarRecorte').addEventListener('click', aplicarRecorte);
    document.getElementById('btnCancelarRecorte').addEventListener('click', cancelarRecorte);

    // Acciones superiores
    btnAbrirArchivo.addEventListener('click', abrirArchivoLocal);
    btnAbrirGaleria.addEventListener('click', abrirDesdeGaleria);
    btnGuardarPNG.addEventListener('click', guardarPNG);
    btnGuardarGaleria.addEventListener('click', guardarEnGaleria);
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Photo Shinny necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar Photo Shinny.');
        return;
    }

    const badge = document.getElementById('psUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
