// ============================================================
//  Widget: Pizarra (Mini Canvas)
//  Lienzo interactivo. Persiste el dibujo como DataURL en JSON.
//  Ruta: app/pizarra/{codigo}pizarra.json
// ============================================================
'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/pizarra/';

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// Estado del dibujo
let drawing = false;
let lastX = 0;
let lastY = 0;
let hasDrawn = false; // Para saber si hay algo pintado

// DOM
const $ = (id) => document.getElementById(id);
const canvas = $('pzCanvas');
const ctx = canvas.getContext('2d');
const wrap = $('pzCanvasWrap');
const widget = $('pzWidget');
const btnGuardar = $('pzBtnGuardar');
const btnLimpiar = $('pzBtnLimpiar');
const btnRecargar = $('pzBtnRecargar');
const toast = $('pzToast');
const toastText = $('pzToastText');

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
        
        // Actualizar color del lápiz dinámicamente
        const colorLapiz = stylePadre.getPropertyValue('--violet-600').trim() || '#7C3AED';
        ctx.strokeStyle = colorLapiz;
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  RUTA Y PERSISTENCIA
// ============================================================
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'pizarra.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        const data = await bd.leerArchivo(ruta);
        if (data && data.dataURL) {
            dibujarDesdeDataUrl(data.dataURL);
            hasDrawn = true;
            widget.classList.add('has-drawing');
        }
    } catch (e) {
        // No existe aún, estado vacío
    }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    btnGuardar.disabled = true;
    try {
        // Generar DataURL (PNG para mantener trazos nítidos)
        const dataURL = canvas.toDataURL('image/png');
        
        await bd.escribirArchivo(ruta, {
            version: 1,
            dataURL: dataURL,
            actualizado: new Date().toISOString()
        });
        
        mostrarToast('Guardado en la nube');
    } catch (e) {
        console.warn('[Pizarra] Error al guardar:', e);
        mostrarToast('Error al guardar');
    } finally {
        btnGuardar.disabled = false;
    }
}

// ============================================================
//  CANVAS Y DIBUJO
// ============================================================
function ajustarTamanoCanvas() {
    // Guardar contenido actual
    const imageData = hasDrawn ? canvas.toDataURL() : null;
    
    // Ajustar tamaño interno al tamaño CSS
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Configurar estilo del lápiz
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    aplicarTemaDelPadre(); // Reaplicar color

    // Redibujar si había algo
    if (imageData) {
        dibujarDesdeDataUrl(imageData);
    }
}

function dibujarDesdeDataUrl(dataURL) {
    const img = new Image();
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataURL;
}

function obtenerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function iniciarDibujo(e) {
    e.preventDefault();
    drawing = true;
    const pos = obtenerPos(e);
    lastX = pos.x;
    lastY = pos.y;
    
    // Si es el primer trazo, ocultar placeholder
    if (!hasDrawn) {
        hasDrawn = true;
        widget.classList.add('has-drawing');
    }
}

function dibujar(e) {
    if (!drawing) return;
    e.preventDefault();
    
    const pos = obtenerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    lastX = pos.x;
    lastY = pos.y;
}

function terminarDibujo() {
    drawing = false;
}

function limpiarCanvas() {
    if (!hasDrawn) return;
    if (!confirm('¿Borrar el dibujo actual?')) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
    widget.classList.remove('has-drawing');
}

// ============================================================
//  UI HELPERS
// ============================================================
function mostrarToast(texto) {
    toastText.textContent = texto;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();
    
    // Ajustar tamaño inicial
    ajustarTamanoCanvas();
    
    // Observer para redimensionar
    const resizeObserver = new ResizeObserver(() => {
        ajustarTamanoCanvas();
    });
    resizeObserver.observe(wrap);

    // Eventos de mouse
    canvas.addEventListener('mousedown', iniciarDibujo);
    canvas.addEventListener('mousemove', dibujar);
    canvas.addEventListener('mouseup', terminarDibujo);
    canvas.addEventListener('mouseout', terminarDibujo);

    // Eventos táctiles
    canvas.addEventListener('touchstart', iniciarDibujo, { passive: false });
    canvas.addEventListener('touchmove', dibujar, { passive: false });
    canvas.addEventListener('touchend', terminarDibujo);
    canvas.addEventListener('touchcancel', terminarDibujo);

    // Botones
    btnGuardar.addEventListener('click', guardar);
    btnLimpiar.addEventListener('click', limpiarCanvas);
    btnRecargar.addEventListener('click', async () => {
        mostrarToast('Recargando...');
        await cargar();
    });

    // Cargar dibujo existente
    await cargar();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
