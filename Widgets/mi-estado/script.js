// ============================================================
//  Widget: Mi Estado
//  ------------------------------------------------------------
//  Muestra tu perfil y te deja cambiar tu estado
//  (activo / descansando / desconectado).
//
//  Escribe en: app/contactos/presencia.json
//  No tiene datos propios.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_PRESENCIA = 'app/contactos/presencia.json';
const ESTADOS_VALIDOS = ['activo', 'descansando', 'desconectado'];

let usuarioActual = null;
let estadoActual = null;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
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
    const el = document.getElementById('meToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'me-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2200);
}

// ============================================================
//  PERFIL
// ============================================================
function renderPerfil() {
    if (!usuarioActual) return;

    const avatar = document.getElementById('meAvatar');
    const nombre = document.getElementById('meNombre');
    const codigo = document.getElementById('meCodigo');

    if (nombre) nombre.textContent = usuarioActual.nombre || 'Sin nombre';
    if (codigo) codigo.textContent = '@' + usuarioActual.codigo;

    if (avatar) {
        if (usuarioActual.foto) {
            avatar.innerHTML = `<img src="${usuarioActual.foto}" alt="">`;
        } else {
            const inicial = (usuarioActual.nombre || '?').charAt(0).toUpperCase();
            avatar.innerHTML = `<span class="me-avatar-inicial">${escapar(inicial)}</span>`;
        }
    }
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
//  CARGAR ESTADO ACTUAL
// ============================================================
async function cargarEstado() {
    const bd = BD();
    if (!bd || !usuarioActual) return;
    try {
        const data = await bd.leerArchivoFresh(ARCHIVO_PRESENCIA);
        if (data && data.usuarios && data.usuarios[usuarioActual.codigo]) {
            estadoActual = data.usuarios[usuarioActual.codigo].estado || null;
        } else {
            estadoActual = null;
        }
    } catch (e) {
        estadoActual = null;
    }
    renderEstados();
}

function renderEstados() {
    document.querySelectorAll('.me-estado-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.estado === estadoActual);
    });
}

// ============================================================
//  GUARDAR ESTADO
// ============================================================
async function cambiarEstado(nuevoEstado) {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) return;
    if (!usuarioActual) return;

    const bd = BD();
    if (!bd) {
        toast('Sin conexión', 'error');
        return;
    }

    // Bloquear botones temporalmente
    document.querySelectorAll('.me-estado-btn').forEach(b => b.disabled = true);

    try {
        const ahora = new Date().toISOString();
        await bd.actualizarArchivo(ARCHIVO_PRESENCIA, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, usuarios: {} };
            if (!actual.usuarios || typeof actual.usuarios !== 'object') actual.usuarios = {};
            actual.usuarios[usuarioActual.codigo] = {
                estado: nuevoEstado,
                desde: ahora
            };
            actual.actualizado = ahora;
            return actual;
        });

        estadoActual = nuevoEstado;
        renderEstados();

        const labels = { activo: 'Activo', descansando: 'Descansando', desconectado: 'Desconectado' };
        toast(labels[nuevoEstado], 'success');

    } catch (e) {
        toast('No se pudo guardar', 'error');
    } finally {
        document.querySelectorAll('.me-estado-btn').forEach(b => b.disabled = false);
    }
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

    renderPerfil();
    await cargarEstado();

    document.querySelectorAll('.me-estado-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nuevoEstado = btn.dataset.estado;
            if (nuevoEstado === estadoActual) return;
            cambiarEstado(nuevoEstado);
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
