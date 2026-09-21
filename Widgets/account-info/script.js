// ============================================================
//  Widget: Cuenta Info
//  ------------------------------------------------------------
//  Resumen compacto de tu cuenta:
//    - Perfil: foto, nombre, pronombre, código.
//    - Dinero: ganado, gastado, saldo actual.
//    - Contenido: apps, temas y widgets instalados.
//
//  Fuentes de datos:
//    - cuenta.json      → perfil completo (foto, pronombre)
//    - chequera.json    → para sumar ganado/gastado
//    - API __vicwebos   → saldo actual + conteo de instalados
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MENSAJE_CHEQUERA = 'vicwebos_chequera_cambio';
const ARCHIVO_CUENTAS = 'cuenta.json';

let usuarioActual = null;
let inicializado = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

const PRONOMBRES = { el: 'Él', ella: 'Ella', elle: 'Elle' };

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
    if (!e.data) return;
    if (e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
    if (e.data.type === MENSAJE_CHEQUERA) recargar();
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

// Formato corto: 1234 → "1234", 12.500 → "13K", 1.500.000 → "1.5M"
function formatearCorto(n) {
    if (!isFinite(n)) n = 0;
    const abs = Math.abs(n);
    const signo = n < 0 ? '-' : '';
    if (abs >= 1000000) {
        return signo + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (abs >= 10000) {
        return signo + Math.round(abs / 1000) + 'K';
    }
    return signo + abs.toLocaleString('es-CL');
}

// ============================================================
//  CARGA DE DATOS
// ============================================================
async function cargarPerfil() {
    const bd = BD();
    if (!bd || !usuarioActual) return null;
    try {
        const cuentas = await bd.leerArchivoFresh(ARCHIVO_CUENTAS);
        if (!Array.isArray(cuentas)) return null;
        return cuentas.find(c => c.codigo === usuarioActual.codigo) || null;
    } catch (e) {
        return null;
    }
}

async function cargarDinero() {
    const api = API();
    if (!api) return { ganado: 0, gastado: 0, actual: 0 };

    const actual = api.obtenerMonedas ? api.obtenerMonedas() : 0;

    let ganado = 0;
    let gastado = 0;

    try {
        if (typeof api.chequeraLeer === 'function') {
            const cheq = await api.chequeraLeer();
            if (cheq && Array.isArray(cheq.movimientos)) {
                cheq.movimientos.forEach(m => {
                    const c = Number(m.cantidad) || 0;
                    if (c > 0) ganado += c;
                    else gastado += Math.abs(c);
                });
            }
        }
    } catch (e) {
        // silencioso
    }

    return { ganado, gastado, actual };
}

function cargarContenido() {
    const api = API();
    if (!api) return { apps: 0, temas: 0, widgets: 0 };
    return {
        apps:    (api.obtenerInstaladas        ? api.obtenerInstaladas().length        : 0),
        temas:   (api.obtenerTemasInstalados   ? api.obtenerTemasInstalados().length   : 0),
        widgets: (api.obtenerWidgetsInstalados ? api.obtenerWidgetsInstalados().length : 0)
    };
}

// ============================================================
//  RENDER
// ============================================================
function renderPerfil(perfil) {
    const avatarEl = document.getElementById('ciAvatar');
    const nombreEl = document.getElementById('ciNombre');
    const metaEl   = document.getElementById('ciMeta');

    const codigo = (usuarioActual && usuarioActual.codigo) || '—';
    const nombre = (perfil && perfil.nombre) || (usuarioActual && usuarioActual.nombre) || 'Sin nombre';
    const pronombreKey = (perfil && perfil.pronombre) || null;
    const pronombre = pronombreKey ? (PRONOMBRES[pronombreKey] || '') : '';
    const foto = (perfil && perfil.foto) || null;

    if (nombreEl) nombreEl.textContent = nombre;

    if (metaEl) {
        metaEl.textContent = pronombre ? `@${codigo} · ${pronombre}` : `@${codigo}`;
    }

    if (avatarEl) {
        if (foto) {
            avatarEl.innerHTML = `<img src="${foto}" alt="">`;
        } else {
            const inicial = (nombre || '?').charAt(0).toUpperCase();
            avatarEl.innerHTML = `<span class="ci-avatar-inicial">${escapar(inicial)}</span>`;
        }
    }
}

function renderDinero(d) {
    const elGanado  = document.getElementById('ciGanado');
    const elGastado = document.getElementById('ciGastado');
    const elActual  = document.getElementById('ciActual');

    if (elGanado)  elGanado.textContent  = formatearCorto(d.ganado);
    if (elGastado) elGastado.textContent = formatearCorto(d.gastado);
    if (elActual)  elActual.textContent  = formatearCorto(d.actual);
}

function renderContenido(c) {
    const elApps    = document.getElementById('ciApps');
    const elTemas   = document.getElementById('ciTemas');
    const elWidgets = document.getElementById('ciWidgets');

    if (elApps)    elApps.textContent    = c.apps;
    if (elTemas)   elTemas.textContent   = c.temas;
    if (elWidgets) elWidgets.textContent = c.widgets;
}

// ============================================================
//  REFRESCO
// ============================================================
let _recargando = false;

async function recargar() {
    if (_recargando) return;
    _recargando = true;

    const btn = document.getElementById('ciBtnRefresh');
    if (btn) btn.classList.add('spin');

    try {
        const perfil = await cargarPerfil();
        renderPerfil(perfil);

        const dinero = await cargarDinero();
        renderDinero(dinero);

        renderContenido(cargarContenido());
    } catch (e) {
        // silencioso
    } finally {
        _recargando = false;
        if (btn) setTimeout(() => btn.classList.remove('spin'), 300);
    }
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

    if (!usuarioActual) {
        // Sin sesión → no hay info que mostrar
        const nombreEl = document.getElementById('ciNombre');
        if (nombreEl) nombreEl.textContent = 'Sin sesión';
        return;
    }

    await recargar();

    document.getElementById('ciBtnRefresh')?.addEventListener('click', recargar);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
