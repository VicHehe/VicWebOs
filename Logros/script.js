// ============================================================
//  Logros — App del sistema
//  ------------------------------------------------------------
//  - Lee el catálogo desde window.LOGROS_REGISTRO (registrado
//    por JsLogros1.js, JsLogros2.js, etc.)
//  - Guarda el estado por usuario en app/logros/logros.json
//  - Desbloquea logros al abrir la app y expone chequear()
//    para que el shell lo llame después de cada canjear.
// ============================================================

'use strict';

const ARCHIVO = 'app/logros/logros.json';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let usuarioActual = null;
let logrosCatalogo = [];
let estadoUsuario = { monedasMaximas: 0, logros: {} };
let toastTimeout = null;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

// ------------------------------------------------------------
//  Tema (heredado del shell)
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
//  Toast
// ------------------------------------------------------------
function toast(texto, tipo = 'info') {
    const el = document.getElementById('lgToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'lg-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearFecha(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatearNum(n) {
    return Number(n).toLocaleString('es-CL');
}

function normalizar(data) {
    if (!data || typeof data !== 'object') {
        return { version: 1, actualizado: new Date().toISOString(), usuarios: {} };
    }
    if (!data.usuarios || typeof data.usuarios !== 'object') data.usuarios = {};
    return data;
}

function estadoVacio() {
    return { monedasMaximas: 0, logros: {} };
}

// ------------------------------------------------------------
//  Catálogo
// ------------------------------------------------------------
function cargarCatalogo() {
    logrosCatalogo = Array.isArray(window.LOGROS_REGISTRO)
        ? window.LOGROS_REGISTRO.slice()
        : [];
    logrosCatalogo.sort((a, b) => (a.meta || 0) - (b.meta || 0));
}

// ------------------------------------------------------------
//  Estado del usuario
// ------------------------------------------------------------
async function leerEstadoUsuario(codigo) {
    const bd = BD();
    if (!bd) return estadoVacio();
    try {
        const data = normalizar(await bd.leerArchivoFresh(ARCHIVO));
        const u = data.usuarios[codigo];
        if (!u || typeof u !== 'object') return estadoVacio();
        return {
            monedasMaximas: Number(u.monedasMaximas) || 0,
            logros: (u.logros && typeof u.logros === 'object') ? u.logros : {}
        };
    } catch (e) {
        return estadoVacio();
    }
}

// ------------------------------------------------------------
//  Chequeo + desbloqueo
//  Devuelve array de logros recién desbloqueados.
// ------------------------------------------------------------
async function chequear() {
    if (!usuarioActual) return [];
    const bd = BD();
    if (!bd) return [];

    const api = API();
    const monedasActuales = api ? (api.obtenerMonedas() || 0) : 0;

    const recien = [];

    await bd.actualizarArchivo(ARCHIVO, (actual) => {
        actual = normalizar(actual);
        const codigo = usuarioActual.codigo;

        if (!actual.usuarios[codigo]) {
            actual.usuarios[codigo] = estadoVacio();
        }
        const yo = actual.usuarios[codigo];
        if (!yo.logros || typeof yo.logros !== 'object') yo.logros = {};

        // Guardar el pico histórico de monedas
        const antes = Number(yo.monedasMaximas) || 0;
        yo.monedasMaximas = Math.max(antes, monedasActuales);

        // Desbloquear los que correspondan
        for (const logro of logrosCatalogo) {
            if (yo.logros[logro.id]) continue;
            if (yo.monedasMaximas >= (logro.meta || 0)) {
                yo.logros[logro.id] = new Date().toISOString();
                recien.push(logro);
            }
        }

        actual.actualizado = new Date().toISOString();
        return actual;
    });

    // Refrescar estado en memoria
    estadoUsuario = await leerEstadoUsuario(usuarioActual.codigo);

    // Notificar los nuevos
    for (const logro of recien) {
        try {
            if (api && api.enviarNotificacion) {
                await api.enviarNotificacion(
                    'logro',
                    `¡Desbloqueaste "${logro.nombre}"!`,
                    usuarioActual.codigo
                );
            }
        } catch (e) { /* silencioso */ }
    }

    return recien;
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function renderTodo() {
    const grid = document.getElementById('lgGrid');
    const empty = document.getElementById('lgEmpty');
    const contador = document.getElementById('lgContador');
    const progresoFill = document.getElementById('lgProgresoFill');
    const progresoTexto = document.getElementById('lgProgresoTexto');
    if (!grid) return;

    if (logrosCatalogo.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        empty.hidden = false;
        if (contador) contador.textContent = '0 / 0';
        if (progresoFill) progresoFill.style.width = '0%';
        if (progresoTexto) progresoTexto.textContent = '0% completado';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    grid.hidden = false;
    empty.hidden = true;

    const total = logrosCatalogo.length;
    const desbloqueados = logrosCatalogo.filter(l => estadoUsuario.logros[l.id]).length;
    const pct = total > 0 ? Math.round((desbloqueados / total) * 100) : 0;

    if (contador) contador.textContent = `${desbloqueados} / ${total}`;
    if (progresoFill) progresoFill.style.width = pct + '%';
    if (progresoTexto) progresoTexto.textContent = `${pct}% completado`;

    grid.innerHTML = logrosCatalogo.map(l => renderCard(l)).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderCard(logro) {
    const fecha = estadoUsuario.logros[logro.id];
    const desbloqueado = !!fecha;
    const progresoActual = Math.min(estadoUsuario.monedasMaximas || 0, logro.meta || 0);
    const pctLogro = logro.meta > 0
        ? Math.min(100, Math.round((progresoActual / logro.meta) * 100))
        : 0;

    const badge = desbloqueado
        ? `<div class="lg-icono-check"><i data-lucide="check"></i></div>`
        : `<div class="lg-icono-candado"><i data-lucide="lock"></i></div>`;

    const bloqueInferior = desbloqueado
        ? `<div class="lg-fecha">
                <i data-lucide="calendar-check"></i>
                ${formatearFecha(fecha)}
           </div>`
        : `<div class="lg-mini-progreso">
                <div class="lg-mini-barra">
                    <div class="lg-mini-fill" style="width:${pctLogro}%"></div>
                </div>
                <div class="lg-mini-texto">
                    ${formatearNum(progresoActual)} / ${formatearNum(logro.meta)}
                </div>
           </div>`;

    return `
        <div class="lg-card ${desbloqueado ? 'desbloqueado' : 'bloqueado'}" data-id="${escapar(logro.id)}">
            <div class="lg-icono">
                <i data-lucide="${logro.icono || 'trophy'}"></i>
                ${badge}
            </div>
            <div class="lg-info">
                <div class="lg-nombre">${escapar(logro.nombre)}</div>
                <div class="lg-desc">${escapar(logro.descripcion || '')}</div>
                ${bloqueInferior}
            </div>
        </div>
    `;
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Logros necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('lgUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para ver tus logros.');
        return;
    }

    cargarCatalogo();
    estadoUsuario = await leerEstadoUsuario(usuarioActual.codigo);
    renderTodo();

    // Chequear al abrir
    const nuevos = await chequear();
    renderTodo();

    if (nuevos.length > 0) {
        const nombres = nuevos.map(l => l.nombre).join(', ');
        toast(`¡Desbloqueaste: ${nombres}!`, 'success');
    }

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

// ------------------------------------------------------------
//  API pública para el shell
//  window.parent.Logros.chequear()
//  window.parent.Logros.recargar()
// ------------------------------------------------------------
window.Logros = {
    chequear: async () => {
        const nuevos = await chequear();
        renderTodo();
        return nuevos;
    },
    recargar: async () => {
        if (!usuarioActual) return;
        estadoUsuario = await leerEstadoUsuario(usuarioActual.codigo);
        renderTodo();
    }
};
