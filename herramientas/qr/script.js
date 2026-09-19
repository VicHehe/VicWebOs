// ============================================================
//  Generador QR — Utilidad sin persistencia
//  ------------------------------------------------------------
//  Usa QRious (CDN) para dibujar el QR en un canvas.
//  Genera en vivo con debounce al tipear.
//  No guarda nada: ni JSON, ni IndexedDB, ni localStorage.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const DEBOUNCE_MS = 250;
const COLOR_FG = '#18181B';  // negro (siempre para legibilidad)
const COLOR_BG = '#FFFFFF';  // blanco (siempre para legibilidad)

let qr = null;
let debounceTimer = null;
let ultimoContenido = '';
let ultimoTamano = 384;

const API = () => window.parent.__vicwebos || null;

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
    const el = document.getElementById('qrToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'qr-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  GENERACIÓN DEL QR
// ============================================================
function generarQR(contenido, tamano) {
    const canvas = document.getElementById('qrCanvas');
    const vacio = document.getElementById('qrVacio');
    if (!canvas) return;

    if (!contenido || !contenido.trim()) {
        vacio.hidden = false;
        canvas.style.display = 'none';
        actualizarBotones(false);
        ultimoContenido = '';
        return;
    }

    try {
        if (!qr) {
            qr = new QRious({
                element: canvas,
                value: contenido,
                size: tamano,
                background: COLOR_BG,
                foreground: COLOR_FG,
                level: 'M'
            });
        } else {
            qr.value = contenido;
            qr.size = tamano;
        }
        vacio.hidden = true;
        canvas.style.display = 'block';
        actualizarBotones(true);
        ultimoContenido = contenido;
        ultimoTamano = tamano;
    } catch (e) {
        console.warn('[QR] Error generando:', e);
        toast('No se pudo generar el código', 'error');
        vacio.hidden = false;
        canvas.style.display = 'none';
        actualizarBotones(false);
    }
}

function regenerar() {
    const contenido = document.getElementById('qrTexto').value;
    const tamano = parseInt(document.getElementById('qrTamano').value, 10) || 384;
    generarQR(contenido, tamano);
    actualizarContador(contenido);
}

// ============================================================
//  UI HELPERS
// ============================================================
function actualizarContador(texto) {
    const el = document.getElementById('qrContador');
    if (!el) return;
    const n = (texto || '').length;
    el.textContent = n === 1 ? '1 caracter' : `${n} caracteres`;
}

function actualizarBotones(hayQR) {
    const btnCopiar = document.getElementById('btnCopiar');
    const btnLimpiar = document.getElementById('btnLimpiar');
    const btnDescargar = document.getElementById('btnDescargar');
    if (btnCopiar) btnCopiar.disabled = !hayQR;
    if (btnLimpiar) btnLimpiar.disabled = !hayQR;
    if (btnDescargar) btnDescargar.disabled = !hayQR;
}

// ============================================================
//  ACCIONES
// ============================================================
async function copiarContenido() {
    const contenido = document.getElementById('qrTexto').value;
    if (!contenido) return;

    try {
        await navigator.clipboard.writeText(contenido);
        toast('Contenido copiado', 'success');
    } catch (e) {
        // Fallback para navegadores sin clipboard API
        try {
            const ta = document.createElement('textarea');
            ta.value = contenido;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            toast('Contenido copiado', 'success');
        } catch (e2) {
            toast('No se pudo copiar', 'error');
        }
    }
}

function descargarPNG() {
    const canvas = document.getElementById('qrCanvas');
    if (!canvas || !ultimoContenido) return;

    try {
        const dataURL = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;

        // Nombre de archivo: qr_TIMESTAMP.png
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `qr_${ts}.png`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('QR descargado', 'success');
    } catch (e) {
        console.warn('[QR] Error descargando:', e);
        toast('No se pudo descargar', 'error');
    }
}

function limpiar() {
    const input = document.getElementById('qrTexto');
    if (input) input.value = '';
    regenerar();
    input?.focus();
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    // Badge del usuario
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const badge = document.getElementById('qrUserBadge');
    if (badge) {
        badge.textContent = cuenta
            ? `@${cuenta.codigo} · ${cuenta.nombre}`
            : '—';
    }

    // Input: debounce para autogeneración
    const input = document.getElementById('qrTexto');
    input?.addEventListener('input', (e) => {
        actualizarContador(e.target.value);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(regenerar, DEBOUNCE_MS);
    });

    // Tamaño: regenera inmediatamente
    document.getElementById('qrTamano')?.addEventListener('change', () => {
        regenerar();
    });

    // Acciones
    document.getElementById('btnCopiar')?.addEventListener('click', copiarContenido);
    document.getElementById('btnDescargar')?.addEventListener('click', descargarPNG);
    document.getElementById('btnLimpiar')?.addEventListener('click', limpiar);

    // Atajos: Ctrl+Enter descarga, Ctrl+L limpia
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            descargarPNG();
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            limpiar();
        }
    });

    // Estado inicial
    actualizarContador('');
    actualizarBotones(false);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
