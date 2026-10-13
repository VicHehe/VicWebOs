// ============================================================
//  Public Zone — Chat público de la comunidad
//  ------------------------------------------------------------
//  Un único chat público para todos los miembros.
//  Solo texto. Sin audios, sin privados, sin grupos.
//
//  Polling con ETag:
//    If-None-Match → GitHub devuelve 304 cuando el archivo no
//    cambió. Los 304 NO cuentan contra el rate limit, así que
//    podemos pollear cada 2s sin gastar quota real.
//
//  Datos:
//    app/public-zone/public-zone.json → { version, mensajes: [] }
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_CHAT    = 'app/public-zone/public-zone.json';
const CUENTAS_FILE = 'cuenta.json';

const MAX_CARACTERES = 120;
const MAX_MENSAJES   = 200;
const POLL_MS        = 2000;

// ---------- ESTADO ----------
let usuarioActual = null;
let usuariosPorCodigo = {};
let mensajes = [];
let pollTimer = null;
let _pollEnCurso = false;
let _etag = null;
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

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
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generarId() {
    return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function horaCorta(iso) {
    return new Date(iso).toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

function claveFecha(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function etiquetaFecha(iso) {
    const d = new Date(iso);
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(hoy.getDate() - 1);
    if (claveFecha(iso) === claveFecha(hoy.toISOString())) return 'Hoy';
    if (claveFecha(iso) === claveFecha(ayer.toISOString())) return 'Ayer';
    return d.toLocaleDateString('es-CL', {
        day: '2-digit', month: 'long',
        year: d.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined
    });
}

function normalizar(data) {
    if (!data || typeof data !== 'object') return { version: 1, mensajes: [] };
    if (!Array.isArray(data.mensajes)) data.mensajes = [];
    return data;
}

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('pzToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'pz-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  LECTURA / ESCRITURA
// ============================================================
async function cargarMensajes(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = fresh
            ? await bd.leerArchivoFresh(RUTA_CHAT)
            : await bd.leerArchivo(RUTA_CHAT);
        mensajes = normalizar(data).mensajes;
    } catch (e) {
        mensajes = [];
    }
}

async function mutarChat(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const resultado = await bd.actualizarArchivo(RUTA_CHAT, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, mensajes: [] };
        if (!Array.isArray(actual.mensajes)) actual.mensajes = [];
        actual = mutador(actual);
        if (actual.mensajes.length > MAX_MENSAJES) {
            actual.mensajes = actual.mensajes.slice(-MAX_MENSAJES);
        }
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    _etag = null;   // El archivo cambió → invalidar el ETag cacheado
    return normalizar(resultado);
}

// ============================================================
//  LECTURA CON ETAG (polling barato)
// ============================================================
async function leerConETag() {
    const bd = BD();
    if (!bd || !bd.estaConectado()) return { cambio: false };

    const com = window.parent.ConfigBD?.obtenerComunidadActiva?.();
    if (!com || !com.githubToken || !com.githubOwner || !com.githubRepo) {
        return { cambio: false };
    }

    const url = `https://api.github.com/repos/${com.githubOwner}/${com.githubRepo}/contents/${RUTA_CHAT}`;
    const headers = {
        'Authorization': `Bearer ${com.githubToken}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (_etag) headers['If-None-Match'] = _etag;

    try {
        const res = await fetch(url, { headers });

        if (res.status === 304) return { cambio: false };

        if (res.status === 404) {
            _etag = null;
            return { cambio: true, data: null };
        }

        if (!res.ok) return { cambio: false };

        const nuevoETag = res.headers.get('ETag');
        if (nuevoETag) _etag = nuevoETag;

        const json = await res.json();
        const contenido = decodeURIComponent(escape(atob(json.content)));
        return { cambio: true, data: JSON.parse(contenido) };
    } catch (e) {
        return { cambio: false };
    }
}

// ============================================================
//  USUARIOS
// ============================================================
async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivoFresh(CUENTAS_FILE);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) { /* silencioso */ }
}

function nombreDe(codigo) {
    const u = usuariosPorCodigo[codigo];
    return (u && u.nombre) || codigo;
}

function fotoDe(codigo) {
    const u = usuariosPorCodigo[codigo];
    return (u && u.foto) || null;
}

function inicialDe(codigo) {
    const n = nombreDe(codigo);
    return (n || '?').charAt(0).toUpperCase();
}

// ============================================================
//  RENDER
// ============================================================
function renderMensajes() {
    const cont = document.getElementById('pzMensajes');
    if (!cont) return;
    cont.innerHTML = '';

    if (mensajes.length === 0) {
        cont.innerHTML = `
            <div class="pz-vacio">
                <div class="pz-vacio-icon">
                    <i data-lucide="megaphone"></i>
                </div>
                <h3>Zona Pública</h3>
                <p>Sé el primero en escribir algo para toda la comunidad.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    let ultimaFechaClave = '';
    mensajes.forEach((msg) => {
        const fechaClave = claveFecha(msg.fecha);
        if (fechaClave !== ultimaFechaClave) {
            ultimaFechaClave = fechaClave;
            const divisor = document.createElement('div');
            divisor.className = 'pz-fecha-divisor';
            divisor.innerHTML = `<span>${etiquetaFecha(msg.fecha)}</span>`;
            cont.appendChild(divisor);
        }
        cont.appendChild(crearMensajeDOM(msg));
    });

    if (window.lucide) window.lucide.createIcons();
}

function crearMensajeDOM(msg) {
    const esPropio = msg.autor === usuarioActual.codigo;
    const div = document.createElement('div');
    div.className = 'pz-msg ' + (esPropio ? 'propio' : 'ajeno');

    const av = document.createElement('div');
    av.className = 'pz-msg-avatar';
    const foto = fotoDe(msg.autor);
    av.innerHTML = foto
        ? `<img src="${foto}" alt="">`
        : `<span>${escapar(inicialDe(msg.autor))}</span>`;
    div.appendChild(av);

    const burbuja = document.createElement('div');
    burbuja.className = 'pz-msg-burbuja';

    // Autor solo en ajenos (para no repetir tu propio nombre)
    if (!esPropio) {
        const autorEl = document.createElement('div');
        autorEl.className = 'pz-msg-autor';
        autorEl.textContent = nombreDe(msg.autor);
        burbuja.appendChild(autorEl);
    }

    const c = document.createElement('div');
    c.className = 'pz-msg-contenido';
    c.textContent = msg.texto || '';
    burbuja.appendChild(c);

    const tiempoEl = document.createElement('div');
    tiempoEl.className = 'pz-msg-tiempo';
    tiempoEl.textContent = horaCorta(msg.fecha);
    burbuja.appendChild(tiempoEl);

    div.appendChild(burbuja);
    return div;
}

function scrollAlFondo() {
    const cont = document.getElementById('pzMensajes');
    if (!cont) return;
    cont.scrollTop = cont.scrollHeight;
}

function estaPegadoAbajo() {
    const cont = document.getElementById('pzMensajes');
    if (!cont) return true;
    return cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
}

// ============================================================
//  ENVIAR
// ============================================================
async function enviarMensaje() {
    if (!usuarioActual) return;

    const input = document.getElementById('pzInput');
    const texto = (input.value || '').trim();
    if (!texto) return;
    if (texto.length > MAX_CARACTERES) {
        toast(`Máximo ${MAX_CARACTERES} caracteres`, 'error');
        return;
    }

    input.value = '';
    document.getElementById('pzBtnEnviar').disabled = true;

    const msg = {
        id: generarId(),
        autor: usuarioActual.codigo,
        texto: texto,
        fecha: new Date().toISOString()
    };

    try {
        await mutarChat((c) => { c.mensajes.push(msg); return c; });
        await cargarMensajes(true);
        renderMensajes();
        scrollAlFondo();
    } catch (e) {
        toast('No se pudo enviar', 'error');
    }
}

// ============================================================
//  POLLING
// ============================================================
function iniciarPoll() {
    detenerPoll();
    pollTimer = setInterval(async () => {
        if (document.hidden) return;
        if (_pollEnCurso) return;
        _pollEnCurso = true;
        try {
            const res = await leerConETag();
            if (res.cambio) {
                const nuevo = normalizar(res.data);
                const antes   = JSON.stringify(mensajes);
                const despues = JSON.stringify(nuevo.mensajes);
                if (antes !== despues) {
                    const pegadoAbajo = estaPegadoAbajo();
                    mensajes = nuevo.mensajes;
                    renderMensajes();
                    if (pegadoAbajo) scrollAlFondo();
                }
            }
        } catch (e) { /* silencioso */ }
        finally { _pollEnCurso = false; }
    }, POLL_MS);
}

function detenerPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    _pollEnCurso = false;
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif;">Public Zone necesita estar dentro de VicWebOs.</div>';
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif;">Necesitás iniciar sesión para usar Public Zone.</div>';
        return;
    }

    const badge = document.getElementById('pzUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarUsuarios();
    await cargarMensajes(true);
    renderMensajes();
    scrollAlFondo();

    const input     = document.getElementById('pzInput');
    const btnEnviar = document.getElementById('pzBtnEnviar');

    input?.addEventListener('input', () => {
        btnEnviar.disabled = !input.value.trim();
    });
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarMensaje(); }
    });
    btnEnviar?.addEventListener('click', enviarMensaje);

    iniciarPoll();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            cargarUsuarios().then(() => renderMensajes());
            cargarMensajes(true).then(() => {
                renderMensajes();
                scrollAlFondo();
            });
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => detenerPoll());
