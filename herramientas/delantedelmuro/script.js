// ============================================================
//  Delante del muro — Muro personal de la comunidad
//  ------------------------------------------------------------
//  Cada usuario tiene un muro. Cualquiera puede escribir en él.
//  Los posts tienen likes y comentarios. Nada más.
//
//  Datos:
//    app/delantedelmuro/delantedelmuro.json         → posts
//    app/delantedelmuro/delantedelmuro-social.json  → likes + comentarios
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_POSTS   = 'app/delantedelmuro/delantedelmuro.json';
const RUTA_SOCIAL  = 'app/delantedelmuro/delantedelmuro-social.json';
const CUENTAS_FILE = 'cuenta.json';

const MAX_TEXTO      = 280;
const MAX_COMENTARIO = 200;

// ------------------------------------------------------------
//  Estado
// ------------------------------------------------------------
let usuarioActual = null;
let usuariosPorCodigo = {};
let posts  = [];
let social = { likes: {}, comentarios: {} };

let tabActual = 'mi-muro';     // 'mi-muro' | 'explorar'
let muroActual = null;         // null = mi muro · código = muro ajeno
let postComentandoId = null;
let toastTimeout = null;

// ------------------------------------------------------------
//  Referencias al shell
// ------------------------------------------------------------
const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ------------------------------------------------------------
//  Tema
// ------------------------------------------------------------
function aplicarTemaDelPadre() {
    try {
        const stylePadre = getComputedStyle(window.parent.document.documentElement);
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

function generarId(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function tiempoRelativo(iso) {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30) return 'ahora';
    if (diff < 60) return `${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `${dias}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function toast(texto, tipo = 'info') {
    const el = document.getElementById('dmToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'dm-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
//  Carga
// ------------------------------------------------------------
async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivo(CUENTAS_FILE);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) { /* silencioso */ }
}

async function cargarPosts(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_POSTS) : await bd.leerArchivo(RUTA_POSTS);
        posts = normalizarPosts(d);
    } catch (e) { posts = []; }
}

async function cargarSocial(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_SOCIAL) : await bd.leerArchivo(RUTA_SOCIAL);
        social = normalizarSocial(d);
    } catch (e) { social = { likes: {}, comentarios: {} }; }
}

function normalizarPosts(d) {
    if (!d || typeof d !== 'object') return [];
    if (!Array.isArray(d.posts)) d.posts = [];
    return d.posts.filter(p => p && p.id && p.autor && p.muro);
}

function normalizarSocial(d) {
    if (!d || typeof d !== 'object') return { likes: {}, comentarios: {} };
    if (!d.likes || typeof d.likes !== 'object') d.likes = {};
    if (!d.comentarios || typeof d.comentarios !== 'object') d.comentarios = {};
    return d;
}

// ------------------------------------------------------------
//  Mutar
// ------------------------------------------------------------
async function mutarPosts(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_POSTS, (a) => {
        if (!a || typeof a !== 'object') a = { version: 1, posts: [] };
        if (!Array.isArray(a.posts)) a.posts = [];
        a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    posts = normalizarPosts(r);
}

async function mutarSocial(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_SOCIAL, (a) => {
        if (!a || typeof a !== 'object') a = { version: 1 };
        if (!a.likes || typeof a.likes !== 'object') a.likes = {};
        if (!a.comentarios || typeof a.comentarios !== 'object') a.comentarios = {};
        a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    social = normalizarSocial(r);
}

// ------------------------------------------------------------
//  Consultas
// ------------------------------------------------------------
function postsDelMuro(codigoMuro) {
    return posts
        .filter(p => p.muro === codigoMuro)
        .sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

function contarLikes(id) {
    const a = social.likes[id];
    return Array.isArray(a) ? a.length : 0;
}

function contarComentarios(id) {
    const a = social.comentarios[id];
    return Array.isArray(a) ? a.length : 0;
}

function yoDiLike(id) {
    const a = social.likes[id];
    return Array.isArray(a) && a.includes(usuarioActual.codigo);
}

// ------------------------------------------------------------
//  Render — Mi muro / muro ajeno
// ------------------------------------------------------------
function renderFeed() {
    const feed   = document.getElementById('dmFeed');
    const empty  = document.getElementById('dmEmpty');
    const header = document.getElementById('dmMuroHeader');
    const info   = document.getElementById('dmMuroInfo');
    if (!feed) return;

    feed.innerHTML = '';

    const codigoMuro = muroActual || usuarioActual.codigo;
    const esMiMuro = codigoMuro === usuarioActual.codigo;

    // Header del muro ajeno
    if (!esMiMuro) {
        header.hidden = false;
        const u = usuariosPorCodigo[codigoMuro] || {};
        const foto = u.foto || null;
        const nombre = u.nombre || codigoMuro;
        info.innerHTML = `
            <div class="dm-muro-avatar">
                ${foto
                    ? `<img src="${foto}" alt="">`
                    : `<span>${escapar(nombre.charAt(0).toUpperCase())}</span>`}
            </div>
            <div class="dm-muro-texto">
                <div class="dm-muro-nombre">${escapar(nombre)}</div>
                <div class="dm-muro-codigo">@${escapar(codigoMuro)}</div>
            </div>
        `;
    } else {
        header.hidden = true;
    }

    const lista = postsDelMuro(codigoMuro);

    if (lista.length === 0) {
        empty.hidden = false;
        document.getElementById('dmEmptyTitulo').textContent = esMiMuro
            ? 'Tu muro está vacío'
            : `El muro de ${usuariosPorCodigo[codigoMuro]?.nombre || codigoMuro} está vacío`;
        document.getElementById('dmEmptyDesc').textContent = esMiMuro
            ? 'Escribí algo para que tus amigos lo vean.'
            : 'Sé el primero en dejar un mensaje.';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    lista.forEach(p => feed.appendChild(crearPostCard(p)));

    if (window.lucide) window.lucide.createIcons();
}

function crearPostCard(post) {
    const wrap = document.createElement('div');
    wrap.className = 'dm-post';
    wrap.dataset.id = post.id;

    const autor = usuariosPorCodigo[post.autor] || {};
    const foto = autor.foto || null;
    const nombre = post.autorNombre || autor.nombre || post.autor;
    const esMio = post.autor === usuarioActual.codigo;
    const dueñoDelMuro = post.muro === usuarioActual.codigo;
    const puedoBorrar = esMio || dueñoDelMuro;

    // Header
    const header = document.createElement('div');
    header.className = 'dm-post-header';
    header.innerHTML = `
        <div class="dm-avatar">
            ${foto
                ? `<img src="${foto}" alt="">`
                : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
        </div>
        <div class="dm-post-autor-info">
            <div class="dm-post-autor-nombre">${escapar(nombre)}${esMio ? ' (vos)' : ''}</div>
            <div class="dm-post-tiempo">${tiempoRelativo(post.creado)}</div>
        </div>
    `;

    if (puedoBorrar) {
        const btnBorrar = document.createElement('button');
        btnBorrar.className = 'dm-icon-btn dm-icon-btn-danger';
        btnBorrar.title = 'Eliminar';
        btnBorrar.innerHTML = '<i data-lucide="trash-2"></i>';
        btnBorrar.addEventListener('click', (e) => {
            e.stopPropagation();
            borrarPost(post.id);
        });
        header.appendChild(btnBorrar);
    }
    wrap.appendChild(header);

    // Texto
    const texto = document.createElement('div');
    texto.className = 'dm-post-texto';
    texto.textContent = post.texto || '';
    wrap.appendChild(texto);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'dm-post-footer';

    const likes = contarLikes(post.id);
    const coms = contarComentarios(post.id);
    const liked = yoDiLike(post.id);

    const btnLike = document.createElement('button');
    btnLike.className = 'dm-btn-like' + (liked ? ' liked' : '');
    btnLike.innerHTML = `<i data-lucide="heart"></i><span>${likes > 0 ? likes : ''}</span>`;
    btnLike.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(post.id); });
    footer.appendChild(btnLike);

    const btnCom = document.createElement('button');
    btnCom.className = 'dm-btn-comentarios';
    btnCom.innerHTML = `<i data-lucide="message-circle"></i><span>${coms > 0 ? coms : ''}</span>`;
    btnCom.addEventListener('click', (e) => { e.stopPropagation(); abrirComentarios(post.id); });
    footer.appendChild(btnCom);

    wrap.appendChild(footer);
    return wrap;
}

// ------------------------------------------------------------
//  Render — Explorar
// ------------------------------------------------------------
function renderExplorar() {
    const feed = document.getElementById('dmFeed');
    const empty = document.getElementById('dmEmpty');
    const header = document.getElementById('dmMuroHeader');
    if (!feed) return;

    feed.innerHTML = '';
    header.hidden = true;

    const otros = Object.values(usuariosPorCodigo)
        .filter(u => u.codigo !== usuarioActual.codigo)
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    if (otros.length === 0) {
        empty.hidden = false;
        document.getElementById('dmEmptyTitulo').textContent = 'No hay otros usuarios';
        document.getElementById('dmEmptyDesc').textContent = 'Cuando se unan más personas, aparecerán acá.';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;

    otros.forEach(u => {
        const foto = u.foto || null;
        const nombre = u.nombre || u.codigo;
        const cantPosts = postsDelMuro(u.codigo).length;

        const card = document.createElement('div');
        card.className = 'dm-user-card';
        card.innerHTML = `
            <div class="dm-user-avatar">
                ${foto
                    ? `<img src="${foto}" alt="">`
                    : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
            </div>
            <div class="dm-user-info">
                <div class="dm-user-nombre">${escapar(nombre)}</div>
                <div class="dm-user-stats">
                    ${cantPosts} ${cantPosts === 1 ? 'mensaje' : 'mensajes'} en su muro
                </div>
            </div>
            <i data-lucide="chevron-right" class="dm-user-arrow"></i>
        `;
        card.addEventListener('click', () => {
            muroActual = u.codigo;
            tabActual = 'mi-muro';
            document.querySelectorAll('.dm-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === 'mi-muro');
            });
            renderFeed();
        });
        feed.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// ------------------------------------------------------------
//  Likes
// ------------------------------------------------------------
async function toggleLike(postId) {
    if (!posts.find(p => p.id === postId)) return;
    const liked = yoDiLike(postId);
    const yo = usuarioActual.codigo;
    try {
        await mutarSocial((s) => {
            if (!Array.isArray(s.likes[postId])) s.likes[postId] = [];
            if (liked) {
                s.likes[postId] = s.likes[postId].filter(c => c !== yo);
            } else if (!s.likes[postId].includes(yo)) {
                s.likes[postId].push(yo);
            }
            return s;
        });
        renderFeed();
        if (postComentandoId === postId) renderComentarios();
    } catch (e) {
        toast('No se pudo guardar el like', 'error');
    }
}

// ------------------------------------------------------------
//  Comentarios
// ------------------------------------------------------------
function abrirComentarios(postId) {
    postComentandoId = postId;
    renderComentarios();
    const modal = document.getElementById('dmModalComentarios');
    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('dmComentarioInput')?.focus(), 100);
}

function cerrarComentarios() {
    document.getElementById('dmModalComentarios').hidden = true;
    postComentandoId = null;
}

function renderComentarios() {
    const cont = document.getElementById('dmComentariosLista');
    if (!cont || !postComentandoId) return;
    cont.innerHTML = '';

    const lista = social.comentarios[postComentandoId] || [];

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="dm-comentarios-vacio">
                <i data-lucide="message-circle"></i>
                <p>Sé el primero en comentar</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    lista.forEach(c => {
        const u = usuariosPorCodigo[c.autor] || {};
        const foto = u.foto || null;
        const nombre = c.autorNombre || u.nombre || c.autor;
        const esMio = c.autor === usuarioActual.codigo;

        const div = document.createElement('div');
        div.className = 'dm-comentario' + (esMio ? ' propio' : '');
        div.innerHTML = `
            <div class="dm-avatar dm-avatar-sm">
                ${foto
                    ? `<img src="${foto}" alt="">`
                    : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
            </div>
            <div class="dm-comentario-cuerpo">
                <div class="dm-comentario-autor">${escapar(nombre)}${esMio ? ' (vos)' : ''}</div>
                <div class="dm-comentario-texto">${escapar(c.texto)}</div>
                <div class="dm-comentario-tiempo">${tiempoRelativo(c.creado)}</div>
            </div>
        `;
        cont.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
}

async function enviarComentario() {
    if (!postComentandoId) return;
    const input = document.getElementById('dmComentarioInput');
    const texto = (input.value || '').trim();
    if (!texto) return;

    const txt = texto.slice(0, MAX_COMENTARIO);
    const yo = usuarioActual.codigo;
    const nombre = usuarioActual.nombre || yo;
    const post = posts.find(p => p.id === postComentandoId);

    try {
        await mutarSocial((s) => {
            if (!Array.isArray(s.comentarios[postComentandoId])) {
                s.comentarios[postComentandoId] = [];
            }
            s.comentarios[postComentandoId].push({
                autor: yo,
                autorNombre: nombre,
                texto: txt,
                creado: new Date().toISOString()
            });
            return s;
        });

        input.value = '';
        document.getElementById('dmComentarioEnviar').disabled = true;
        renderComentarios();
        renderFeed();

        // Notificar al autor del post (si no es mío)
        if (post && post.autor !== yo) {
            API()?.enviarNotificacion?.(
                'delantedelmuro',
                `${nombre} comentó en tu muro`,
                post.autor
            ).catch(() => {});
        }
        toast('Comentario publicado', 'success');
    } catch (e) {
        toast('No se pudo publicar el comentario', 'error');
    }
}

// ------------------------------------------------------------
//  Publicar
// ------------------------------------------------------------
function abrirPublicar() {
    const ta = document.getElementById('dmPublicarTexto');
    ta.value = '';
    document.getElementById('dmPublicarContador').textContent = '0 / ' + MAX_TEXTO;
    document.getElementById('dmPublicarMensaje').textContent = '';
    document.getElementById('dmPublicarMensaje').className = 'dm-modal-mensaje';

    const codigoMuro = muroActual || usuarioActual.codigo;
    const esMiMuro = codigoMuro === usuarioActual.codigo;
    document.getElementById('dmPublicarTitulo').textContent = esMiMuro
        ? 'Escribir en tu muro'
        : `Escribir en el muro de ${usuariosPorCodigo[codigoMuro]?.nombre || codigoMuro}`;

    document.getElementById('dmModalPublicar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => ta.focus(), 100);
}

function cerrarPublicar() {
    document.getElementById('dmModalPublicar').hidden = true;
}

async function guardarPublicacion() {
    const texto = document.getElementById('dmPublicarTexto').value.trim();
    const msj = document.getElementById('dmPublicarMensaje');

    if (!texto) {
        msj.textContent = 'Escribí algo antes de publicar.';
        msj.className = 'dm-modal-mensaje error';
        return;
    }
    if (texto.length > MAX_TEXTO) {
        msj.textContent = `Máximo ${MAX_TEXTO} caracteres.`;
        msj.className = 'dm-modal-mensaje error';
        return;
    }

    const btn = document.getElementById('dmPublicarGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    const codigoMuro = muroActual || usuarioActual.codigo;

    const nuevo = {
        id: generarId('dm'),
        muro: codigoMuro,
        autor: usuarioActual.codigo,
        autorNombre: usuarioActual.nombre || usuarioActual.codigo,
        texto: texto,
        creado: new Date().toISOString()
    };

    try {
        await mutarPosts((d) => { d.posts.push(nuevo); return d; });
        toast('Publicado', 'success');
        cerrarPublicar();
        renderFeed();

        if (codigoMuro !== usuarioActual.codigo) {
            API()?.enviarNotificacion?.(
                'delantedelmuro',
                `${usuarioActual.nombre} escribió en tu muro`,
                codigoMuro
            ).catch(() => {});
        }
    } catch (e) {
        msj.textContent = e.message || 'No se pudo publicar.';
        msj.className = 'dm-modal-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ------------------------------------------------------------
//  Borrar post
// ------------------------------------------------------------
async function borrarPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const esMio = post.autor === usuarioActual.codigo;
    const dueñoDelMuro = post.muro === usuarioActual.codigo;
    if (!esMio && !dueñoDelMuro) {
        toast('No podés borrar este mensaje', 'error');
        return;
    }
    if (!confirm('¿Eliminar este mensaje? Se borrarán también sus likes y comentarios.')) return;

    try {
        await mutarPosts((d) => {
            d.posts = d.posts.filter(p => p.id !== postId);
            return d;
        });
        await mutarSocial((s) => {
            delete s.likes[postId];
            delete s.comentarios[postId];
            return s;
        });
        renderFeed();
        toast('Mensaje eliminado', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    }
}

// ------------------------------------------------------------
//  Tabs
// ------------------------------------------------------------
function inicializarTabs() {
    document.querySelectorAll('.dm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.dm-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            muroActual = null;
            if (tabActual === 'mi-muro') renderFeed();
            else renderExplorar();
        });
    });
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Delante del muro necesita estar dentro de VicWebOs.');
        return;
    }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión para usar Delante del muro.');
        return;
    }

    const badge = document.getElementById('dmUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarUsuarios();
    await cargarPosts(true);
    await cargarSocial(true);

    muroActual = null;
    renderFeed();
    inicializarTabs();

    document.getElementById('dmFabNuevo')?.addEventListener('click', abrirPublicar);
    document.getElementById('dmPublicarCerrar')?.addEventListener('click', cerrarPublicar);
    document.getElementById('dmPublicarCancelar')?.addEventListener('click', cerrarPublicar);
    document.getElementById('dmPublicarGuardar')?.addEventListener('click', guardarPublicacion);
    document.getElementById('dmPublicarTexto')?.addEventListener('input', (e) => {
        document.getElementById('dmPublicarContador').textContent =
            `${e.target.value.length} / ${MAX_TEXTO}`;
    });

    document.getElementById('dmBackBtn')?.addEventListener('click', () => {
        muroActual = null;
        renderFeed();
    });

    document.getElementById('dmComentariosCerrar')?.addEventListener('click', cerrarComentarios);

    const inputCom = document.getElementById('dmComentarioInput');
    const btnEnviar = document.getElementById('dmComentarioEnviar');
    inputCom?.addEventListener('input', () => {
        btnEnviar.disabled = !inputCom.value.trim();
    });
    inputCom?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarComentario(); }
    });
    btnEnviar?.addEventListener('click', enviarComentario);

    ['dmModalPublicar', 'dmModalComentarios'].forEach(id => {
        const m = document.getElementById(id);
        m?.addEventListener('click', (e) => {
            if (e.target.id === id) {
                if (id === 'dmModalPublicar') cerrarPublicar();
                if (id === 'dmModalComentarios') cerrarComentarios();
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('dmModalPublicar').hidden)    { cerrarPublicar(); return; }
        if (!document.getElementById('dmModalComentarios').hidden) { cerrarComentarios(); return; }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
