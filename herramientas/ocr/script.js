// ============================================================
//  Lector OCR — VicWebOs
//  ------------------------------------------------------------
//  · Extrae texto de imágenes usando Tesseract.js (CDN, WASM).
//  · Todo el procesamiento ocurre en el dispositivo.
//  · Carga imágenes desde: archivo local, drag & drop, o Galería.
//  · Idiomas: español, inglés, y varios más.
//  · Resultado editable, copiable y descargable como .txt.
//  · Sin persistencia en la BD: cada sesión arranca limpia.
//  ------------------------------------------------------------
//  Tesseract.js se carga desde CDN (tesseract.min.js) y baja
//  el modelo de idioma la primera vez que se usa (queda cacheado
//  por el navegador).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let usuarioActual = null;
let imagenActualBlob = null;   // Blob de la imagen cargada
let imagenActualURL = null;    // ObjectURL para el preview
let procesando = false;
let ultimaPagina = null;       // { ancho, alto } de la última imagen procesada
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  TEMA DEL SHELL
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
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ocrToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ocr-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function liberarImagenActual() {
    if (imagenActualURL) {
        try { URL.revokeObjectURL(imagenActualURL); } catch (e) {}
        imagenActualURL = null;
    }
}

function formatearBytes(n) {
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function contarPalabras(texto) {
    const t = String(texto || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
}

function contarCaracteres(texto) {
    return String(texto || '').length;
}

// ============================================================
//  VISTAS
// ============================================================
function mostrarVista(id) {
    document.getElementById('vistaSubir').hidden = id !== 'subir';
    document.getElementById('vistaProcesar').hidden = id !== 'procesar';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  CARGAR IMAGEN
// ============================================================
async function cargarImagenDesdeBlob(blob, nombre) {
    if (!blob) return;
    if (!blob.type.startsWith('image/')) {
        toast('El archivo no es una imagen', 'error');
        return;
    }

    liberarImagenActual();
    imagenActualBlob = blob;
    imagenActualURL = URL.createObjectURL(blob);

    // Preview
    const img = document.getElementById('ocrImagenPreview');
    img.src = imagenActualURL;

    // Resetear UI de proceso
    resetearResultado();
    mostrarVista('procesar');
}

async function cargarImagenDesdeArchivo(file) {
    return await cargarImagenDesdeBlob(file, file.name);
}

async function elegirDesdeGaleria() {
    const mh = MH();
    if (!mh) {
        toast('Galería no disponible', 'error');
        return;
    }
    try {
        const id = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí una imagen' });
        if (!id) return;

        const blob = await mh.galeria.leerImagenBlob(id);
        if (!blob) {
            toast('No se pudo cargar la imagen', 'error');
            return;
        }
        await cargarImagenDesdeBlob(blob, 'galeria.png');
    } catch (e) {
        console.warn('[OCR] Error picker:', e);
        toast('No se pudo abrir la Galería', 'error');
    }
}

// ============================================================
//  RESETEAR
// ============================================================
function resetearResultado() {
    document.getElementById('ocrProcesando').hidden = true;
    document.getElementById('ocrResultado').hidden = true;
    document.getElementById('ocrVacio').hidden = false;
    document.getElementById('ocrTexto').value = '';
    document.getElementById('ocrStats').textContent = '—';
    document.getElementById('ocrProgresoFill').style.width = '0%';
    document.getElementById('ocrProgresoPct').textContent = '0%';
    document.getElementById('ocrProgresoEstado').textContent = 'Iniciando...';
    document.getElementById('btnExtraerTxt').textContent = 'Extraer texto';
    document.getElementById('btnExtraer').disabled = false;
}

function resetearTodo() {
    if (procesando) {
        toast('Esperá a que termine el proceso actual', 'info');
        return;
    }
    liberarImagenActual();
    imagenActualBlob = null;
    document.getElementById('ocrImagenPreview').removeAttribute('src');
    resetearResultado();
    mostrarVista('subir');
}

// ============================================================
//  EXTRAER TEXTO (Tesseract.js)
// ============================================================
async function extraerTexto() {
    if (procesando) return;
    if (!imagenActualBlob) {
        toast('Cargá una imagen primero', 'error');
        return;
    }
    if (typeof Tesseract === 'undefined') {
        toast('La librería OCR no se cargó. Revisá tu conexión.', 'error');
        return;
    }

    procesando = true;
    const btn = document.getElementById('btnExtraer');
    const btnTxt = document.getElementById('btnExtraerTxt');
    btn.disabled = true;
    btnTxt.textContent = 'Procesando...';

    document.getElementById('ocrVacio').hidden = true;
    document.getElementById('ocrResultado').hidden = true;
    document.getElementById('ocrProcesando').hidden = false;
    document.getElementById('ocrProgresoFill').style.width = '0%';
    document.getElementById('ocrProgresoPct').textContent = '0%';
    document.getElementById('ocrProgresoEstado').textContent = 'Iniciando...';

    const idioma = document.getElementById('ocrIdioma').value || 'spa+eng';

    const actualizarProgreso = (m) => {
        if (!m) return;
        const pct = Math.max(0, Math.min(100, Math.round((m.progress || 0) * 100)));
        document.getElementById('ocrProgresoFill').style.width = pct + '%';
        document.getElementById('ocrProgresoPct').textContent = pct + '%';

        let estado = 'Procesando...';
        switch (m.status) {
            case 'loading tesseract core':
                estado = 'Cargando motor OCR...'; break;
            case 'initializing tesseract':
                estado = 'Iniciando motor OCR...'; break;
            case 'loading language traineddata':
                estado = 'Descargando idioma (solo la primera vez)...'; break;
            case 'initializing api':
                estado = 'Inicializando...'; break;
            case 'recognizing text':
                estado = 'Reconociendo texto...'; break;
            case 'done':
                estado = 'Listo'; break;
        }
        document.getElementById('ocrProgresoEstado').textContent = estado;
    };

    try {
        const resultado = await Tesseract.recognize(
            imagenActualBlob,
            idioma,
            { logger: actualizarProgreso }
        );

        const texto = (resultado && resultado.data && resultado.data.text) || '';
        const textoLimpio = texto.trim();

        document.getElementById('ocrTexto').value = textoLimpio;

        const chars = contarCaracteres(textoLimpio);
        const palabras = contarPalabras(textoLimpio);
        document.getElementById('ocrStats').textContent =
            `${palabras} ${palabras === 1 ? 'palabra' : 'palabras'} · ${chars} car.`;

        document.getElementById('ocrProcesando').hidden = true;
        document.getElementById('ocrResultado').hidden = false;

        if (!textoLimpio) {
            toast('No se detectó texto en la imagen', 'info');
        } else {
            toast('Texto extraído', 'success');
        }

        // Log interno, sin exponer confianza al usuario salvo que la pida
        if (resultado && resultado.data && typeof resultado.data.confidence === 'number') {
            console.info('[OCR] Confianza media:', resultado.data.confidence.toFixed(1) + '%');
        }

    } catch (e) {
        console.warn('[OCR] Error:', e);
        toast('No se pudo procesar la imagen', 'error');
        document.getElementById('ocrProcesando').hidden = true;
        document.getElementById('ocrVacio').hidden = false;
    } finally {
        procesando = false;
        btn.disabled = false;
        btnTxt.textContent = 'Extraer texto';
    }
}

// ============================================================
//  ACCIONES DEL RESULTADO
// ============================================================
async function copiarTexto() {
    const txt = document.getElementById('ocrTexto').value;
    if (!txt.trim()) {
        toast('No hay texto para copiar', 'info');
        return;
    }

    let exito = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(txt);
            exito = true;
        }
    } catch (e) { /* fallback */ }

    if (!exito) {
        try {
            const ta = document.getElementById('ocrTexto');
            ta.select();
            ta.setSelectionRange(0, 99999);
            document.execCommand('copy');
            window.getSelection()?.removeAllRanges();
            exito = true;
        } catch (e) { exito = false; }
    }

    if (exito) toast('Texto copiado', 'success');
    else toast('No se pudo copiar', 'error');
}

function descargarTxt() {
    const txt = document.getElementById('ocrTexto').value;
    if (!txt.trim()) {
        toast('No hay texto para descargar', 'info');
        return;
    }

    const ahora = new Date();
    const y = ahora.getFullYear();
    const m = String(ahora.getMonth() + 1).padStart(2, '0');
    const d = String(ahora.getDate()).padStart(2, '0');
    const hh = String(ahora.getHours()).padStart(2, '0');
    const mm = String(ahora.getMinutes()).padStart(2, '0');
    const nombre = `ocr_${y}${m}${d}_${hh}${mm}.txt`;

    try {
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 800);
        toast('Descargado', 'success');
    } catch (e) {
        console.warn('[OCR] Error descargando:', e);
        toast('No se pudo descargar', 'error');
    }
}

// ============================================================
//  DRAG & DROP
// ============================================================
function inicializarDragDrop() {
    const drop = document.getElementById('ocrDrop');
    if (!drop) return;

    let contador = 0;

    ['dragenter', 'dragover'].forEach(ev => {
        drop.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
            if (ev === 'dragenter') contador++;
            drop.classList.add('arrastrando');
        });
    });

    drop.addEventListener('dragleave', (e) => {
        e.preventDefault();
        contador--;
        if (contador <= 0) {
            contador = 0;
            drop.classList.remove('arrastrando');
        }
    });

    drop.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        contador = 0;
        drop.classList.remove('arrastrando');

        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            toast('Solo se aceptan imágenes', 'error');
            return;
        }
        await cargarImagenDesdeArchivo(file);
    });

    // Evitar navegación al soltar fuera de la drop zone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Lector OCR necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('ocrUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    // Input archivo
    const input = document.getElementById('inputArchivo');
    document.getElementById('btnSubirArchivo')?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (f) await cargarImagenDesdeArchivo(f);
        input.value = '';
    });

    // Galería
    document.getElementById('btnElegirGaleria')?.addEventListener('click', elegirDesdeGaleria);

    // Cambiar imagen
    document.getElementById('btnCambiarImagen')?.addEventListener('click', () => {
        resetearTodo();
    });

    // Botón reset del header
    document.getElementById('btnReset')?.addEventListener('click', resetearTodo);

    // Extraer texto
    document.getElementById('btnExtraer')?.addEventListener('click', extraerTexto);

    // Resultado
    document.getElementById('btnCopiar')?.addEventListener('click', copiarTexto);
    document.getElementById('btnDescargarTxt')?.addEventListener('click', descargarTxt);

    // Drag & drop
    inicializarDragDrop();

    // Limpieza al cerrar
    window.addEventListener('pagehide', () => {
        liberarImagenActual();
    });

    mostrarVista('subir');
    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
