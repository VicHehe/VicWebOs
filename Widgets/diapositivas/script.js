// ============================================================
//  Widget: Diapositivas
//  ------------------------------------------------------------
//  Muestra hasta 4 imágenes de la galería en formato carrusel.
//  Navegación manual (flechas/swipe) o auto-play configurable.
//
//  Datos: app/diapositivas/{codigo}diapositivas.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_BASE = 'app/diapositivas/';
const MAX_IMAGENES = 4;
const INTERVALOS_VALIDOS = [3, 5, 10, 15, 30, 60];

let usuarioActual = null;
let imagenes = [];        // array de ids (máx 4)
let autoplay = false;
let intervalo = 5;        // segundos
let indiceActual = 0;
let timerAutoplay = null;
let urlActual = null;     // blob URL activa
let urlsModal = [];       // blob URLs del modal

// Swipe
let swipeStartX = 0;
let swipeStartY = 0;
let swipeActivo = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
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
    const el = document.getElementById('dpToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'dp-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2200);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    if (!usuarioActual?.codigo) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'diapositivas.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivoFresh(ruta);
        if (data && typeof data === 'object') {
            if (Array.isArray(data.imagenes)) {
                imagenes = data.imagenes
                    .filter(x => typeof x === 'string' && x)
                    .slice(0, MAX_IMAGENES);
            }
            autoplay = data.autoplay === true;
            if (INTERVALOS_VALIDOS.includes(Number(data.intervalo))) {
                intervalo = Number(data.intervalo);
            }
        }
    } catch (e) { /* no existe */ }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        await bd.actualizarArchivo(ruta, () => ({
            version: 1,
            imagenes: imagenes.slice(),
            autoplay,
            intervalo,
            actualizado: new Date().toISOString()
        }));
    } catch (e) {
        console.warn('[Diapositivas] No se pudo guardar:', e);
    }
}

// ============================================================
//  RENDER PRINCIPAL
// ============================================================
function render() {
    const empty = document.getElementById('dpEmpty');
    const wrap = document.getElementById('dpImagenWrap');
    const prev = document.getElementById('dpPrev');
    const next = document.getElementById('dpNext');
    const dots = document.getElementById('dpDots');
    const btnPlay = document.getElementById('dpBtnPlay');

    // Liberar URL anterior
    if (urlActual) {
        URL.revokeObjectURL(urlActual);
        urlActual = null;
    }

    // Sin imágenes
    if (imagenes.length === 0) {
        empty.hidden = false;
        wrap.hidden = true;
        prev.hidden = true;
        next.hidden = true;
        dots.hidden = true;
        btnPlay.hidden = true;
        detenerAutoplay();
        return;
    }

    // Con imágenes
    empty.hidden = true;
    wrap.hidden = false;

    // Flechas (solo si hay más de 1)
    const hayVarias = imagenes.length > 1;
    prev.hidden = !hayVarias;
    next.hidden = !hayVarias;

    // Botón play (solo si hay más de 1)
    btnPlay.hidden = !hayVarias;
    actualizarBotonPlay();

    // Ajustar índice
    if (indiceActual >= imagenes.length) indiceActual = 0;
    if (indiceActual < 0) indiceActual = imagenes.length - 1;

    // Cargar imagen actual
    cargarImagenActual();

    // Dots
    dots.hidden = !hayVarias;
    renderDots();
}

async function cargarImagenActual() {
    const img = document.getElementById('dpImagen');
    const mh = MH();
    if (!mh || imagenes.length === 0) return;
    const id = imagenes[indiceActual];
    if (!id) return;

    // Placeholder mientras carga
    img.removeAttribute('src');
    img.style.opacity = '0.5';

    try {
        const url = await mh.galeria.leerImagenURL(id);
        if (!url) {
            img.alt = 'No disponible';
            return;
        }
        urlActual = url;
        img.src = url;
        img.style.opacity = '1';
    } catch (e) {
        console.warn('[Diapositivas] Error cargando imagen:', e);
    }
}

function renderDots() {
    const cont = document.getElementById('dpDots');
    if (!cont) return;
    cont.innerHTML = '';
    imagenes.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'dp-dot' + (i === indiceActual ? ' activo' : '');
        dot.addEventListener('click', () => {
            indiceActual = i;
            render();
        });
        cont.appendChild(dot);
    });
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function siguiente() {
    if (imagenes.length < 2) return;
    indiceActual = (indiceActual + 1) % imagenes.length;
    render();
}

function anterior() {
    if (imagenes.length < 2) return;
    indiceActual = (indiceActual - 1 + imagenes.length) % imagenes.length;
    render();
}

// ============================================================
//  AUTOPLAY
// ============================================================
function iniciarAutoplay() {
    detenerAutoplay();
    if (imagenes.length < 2) return;
    timerAutoplay = setInterval(() => {
        siguiente();
    }, intervalo * 1000);
}

function detenerAutoplay() {
    if (timerAutoplay) {
        clearInterval(timerAutoplay);
        timerAutoplay = null;
    }
}

function toggleAutoplay() {
    autoplay = !autoplay;
    actualizarBotonPlay();
    guardar();
    if (autoplay) {
        iniciarAutoplay();
    } else {
        detenerAutoplay();
    }
}

function actualizarBotonPlay() {
    const btn = document.getElementById('dpBtnPlay');
    if (!btn) return;
    btn.classList.toggle('activo', autoplay);
    btn.innerHTML = autoplay
        ? '<i data-lucide="pause"></i>'
        : '<i data-lucide="play"></i>';
    btn.title = autoplay ? 'Pausar' : 'Reproducir';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  SWIPE
// ============================================================
function inicializarSwipe() {
    const stage = document.getElementById('dpStage');
    if (!stage) return;

    stage.addEventListener('pointerdown', (e) => {
        if (imagenes.length < 2) return;
        if (e.target.closest('.dp-flecha')) return;
        if (e.target.closest('.dp-empty-btn')) return;

        swipeActivo = true;
        swipeStartX = e.clientX;
        swipeStartY = e.clientY;
    });

    stage.addEventListener('pointermove', (e) => {
        if (!swipeActivo) return;
    });

    stage.addEventListener('pointerup', (e) => {
        if (!swipeActivo) return;
        swipeActivo = false;

        const dx = e.clientX - swipeStartX;
        const dy = e.clientY - swipeStartY;

        // Solo cuenta si el gesto es mayormente horizontal
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            if (dx < 0) siguiente();
            else anterior();
        }
    });

    stage.addEventListener('pointercancel', () => {
        swipeActivo = false;
    });
}

// ============================================================
//  MODAL DE EDICIÓN
// ============================================================
function abrirModal() {
    detenerAutoplay();
    document.getElementById('dpModal').hidden = false;
    renderModal();
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    document.getElementById('dpModal').hidden = true;
    limpiarUrlsModal();
    // Al cerrar, si autoplay estaba activo, lo reanudamos
    if (autoplay) iniciarAutoplay();
}

function limpiarUrlsModal() {
    urlsModal.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    urlsModal = [];
}

function renderModal() {
    const cont = document.getElementById('dpSlots');
    if (!cont) return;

    limpiarUrlsModal();
    cont.innerHTML = '';

    // Los 4 slots (o más si la lista es menor y hay que rellenar)
    const totalSlots = Math.max(MAX_IMAGENES, imagenes.length);
    for (let i = 0; i < MAX_IMAGENES; i++) {
        const id = imagenes[i] || null;
        const slot = document.createElement('div');
        slot.className = 'dp-slot' + (id ? ' lleno' : '');
        slot.dataset.idx = String(i);

        const num = document.createElement('div');
        num.className = 'dp-slot-num';
        num.textContent = String(i + 1);

        if (id) {
            slot.appendChild(num);

            const img = document.createElement('img');
            img.alt = '';
            slot.appendChild(img);

            // Cargar miniatura
            (async () => {
                const mh = MH();
                if (!mh) return;
                try {
                    const url = await mh.galeria.leerImagenURL(id);
                    if (url) {
                        urlsModal.push(url);
                        img.src = url;
                    }
                } catch (e) {}
            })();

            const quitar = document.createElement('button');
            quitar.className = 'dp-slot-quitar';
            quitar.title = 'Quitar';
            quitar.innerHTML = '<i data-lucide="x"></i>';
            quitar.addEventListener('click', (e) => {
                e.stopPropagation();
                quitarImagen(i);
            });
            slot.appendChild(quitar);

            slot.addEventListener('click', (e) => {
                if (e.target.closest('.dp-slot-quitar')) return;
                elegirImagen(i);
            });
        } else {
            const plus = document.createElement('div');
            plus.className = 'dp-slot-plus';
            plus.innerHTML = '<i data-lucide="plus"></i><span>Añadir</span>';
            slot.appendChild(plus);

            slot.addEventListener('click', () => elegirImagen(i));
        }

        cont.appendChild(slot);
    }

    // Autoplay y intervalo
    const toggle = document.getElementById('dpAutoToggle');
    const wrapIntervalo = document.getElementById('dpIntervaloWrap');
    const selectIntervalo = document.getElementById('dpIntervalo');

    if (toggle) toggle.checked = autoplay;
    if (wrapIntervalo) wrapIntervalo.hidden = !autoplay;
    if (selectIntervalo) selectIntervalo.value = String(intervalo);

    if (window.lucide) window.lucide.createIcons();
}

async function elegirImagen(slotIdx) {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige una imagen'
        });
        if (!id) return;

        // Si ya estaba en otro slot, quitarla de ahí primero
        const idxExistente = imagenes.indexOf(id);
        if (idxExistente !== -1 && idxExistente !== slotIdx) {
            // Intercambio simple: la imagen vieja del slot actual va donde estaba la nueva
            const antes = imagenes[slotIdx];
            imagenes[idxExistente] = antes;
        }

        // Rellenar huecos si hace falta
        while (imagenes.length <= slotIdx) imagenes.push(null);
        imagenes[slotIdx] = id;

        // Compactar: quitar nulls intermedios pero preservando orden
        // En realidad queremos que "null" sea hueco vacío (reordenamos solo al inicio)
        // Mejor: dejamos nulls y compactamos al mostrar
        compactarImagenes();

        await guardar();
        renderModal();
        render();
    } catch (e) {
        console.warn('[Diapositivas] Error picker:', e);
    }
}

async function quitarImagen(slotIdx) {
    if (!imagenes[slotIdx]) return;
    imagenes.splice(slotIdx, 1);
    // Resetear índice si quedó fuera de rango
    if (indiceActual >= imagenes.length) indiceActual = 0;
    await guardar();
    renderModal();
    render();
}

function compactarImagenes() {
    imagenes = imagenes.filter(x => typeof x === 'string' && x);
}

async function limpiarTodo() {
    if (imagenes.length === 0) return;
    if (!confirm('¿Quitar todas las imágenes?')) return;
    imagenes = [];
    indiceActual = 0;
    autoplay = false;
    await guardar();
    renderModal();
    render();
    toast('Diapositivas limpiadas', 'success');
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) return;
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) return;

    await cargar();
    render();

    // Si autoplay estaba activo en la sesión anterior
    if (autoplay && imagenes.length > 1) {
        iniciarAutoplay();
    }

    // Eventos
    document.getElementById('dpPrev')?.addEventListener('click', anterior);
    document.getElementById('dpNext')?.addEventListener('click', siguiente);
    document.getElementById('dpBtnPlay')?.addEventListener('click', toggleAutoplay);
    document.getElementById('dpBtnEditar')?.addEventListener('click', abrirModal);
    document.getElementById('dpBtnAddEmpty')?.addEventListener('click', abrirModal);
    document.getElementById('dpModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('dpBtnListo')?.addEventListener('click', cerrarModal);
    document.getElementById('dpBtnLimpiar')?.addEventListener('click', limpiarTodo);

    document.getElementById('dpAutoToggle')?.addEventListener('change', (e) => {
        autoplay = e.target.checked;
        const wrapIntervalo = document.getElementById('dpIntervaloWrap');
        if (wrapIntervalo) wrapIntervalo.hidden = !autoplay;
        guardar();
        actualizarBotonPlay();
    });

    document.getElementById('dpIntervalo')?.addEventListener('change', (e) => {
        const val = parseInt(e.target.value, 10);
        if (INTERVALOS_VALIDOS.includes(val)) {
            intervalo = val;
            guardar();
            // Reiniciar autoplay con el nuevo intervalo si estaba activo
            if (autoplay) iniciarAutoplay();
        }
    });

    inicializarSwipe();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    if (urlActual) { try { URL.revokeObjectURL(urlActual); } catch (e) {} }
    limpiarUrlsModal();
    detenerAutoplay();
});
