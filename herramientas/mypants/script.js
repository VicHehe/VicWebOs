// ============================================================
//  MyPants — Videos cortos de la comunidad
//  ------------------------------------------------------------
//  ● Feed inmersivo tipo TikTok con scroll-snap.
//  ● Máximo 25 videos por usuario, 2 MB cada uno.
//  ● Al llegar al límite: modo auto (borra el más viejo) o
//    modo manual (el usuario borra).
//  ● Likes + comentarios (1 por usuario, editable).
//  ● Perfil público para cada miembro de la comunidad.
//  ● Notificación al autor cuando alguien comenta.
//
//  Datos:
//    app/mypants/mypants.json         → índice de clips
//    app/mypants/mypants-social.json  → likes + comentarios
//    app/mypants/mypants(video)/*.mp4 → archivos
//    cuenta.json                       → fotos/nombres de usuario
//
//  Rendimiento:
//    ● Cache LRU de 6 blob URLs de video (evita refetch).
//    ● Carga diferida con IntersectionObserver (rootMargin 300px).
//    ● Autoplay mudo; botón global de sonido.
// ============================================================

'use strict';

const APP_ID = 'mypants';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const CUENTAS_FILE = 'cuenta.json';

const MAX_VIDEOS_USER = 25;
const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const RUTA_POSTS  = `app/${APP_ID}/${APP_ID}.json`;
const RUTA_SOCIAL = `app/${APP_ID}/${APP_ID}-social.json`;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ---------- ESTADO ----------
let usuarioActual = null;
let usuariosPorCodigo = {};
let videos = [];
let social = { likes: {}, comentarios: {} };

let filePendiente = null;
let previewUrlActiva = null;

let videoViendoId = null;
let codigoPerfilViendo = null;

let toastTimeout = null;

// Cache LRU de videos
const videoCache = new Map();
const MAX_VIDEO_CACHE = 6;

// Observers
let feedObserver = null;
let preloadObserver = null;

// Sonido
let sonidoActivo = false;

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300','--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt','--gray-50','--gray-100','--gray-200','--gray-300','--gray-400','--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3','--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl','--shadow-glow',
            '--accent-gradient','--accent-gradient-hover','--accent-shadow','--accent-shadow-hover','--accent-text-gradient',
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
    const el = document.getElementById('mpToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mp-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

function generarId() {
    return 'mp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function nombreDe(codigo) {
    const u = usuariosPorCodigo[codigo];
    return (u && u.nombre) || codigo;
}

function fotoDe(codigo) {
    const u = usuariosPorCodigo[codigo];
    return (u && u.foto) || null;
}

function inicialDe(codigo) {
    return (nombreDe(codigo) || '?').charAt(0).toUpperCase();
}

// ============================================================
//  CARGA DE DATOS
// ============================================================
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

async function cargarDatos() {
    const bd = BD();
    if (!bd) return;
    try {
        const dPosts = await bd.leerArchivoFresh(RUTA_POSTS);
        videos = Array.isArray(dPosts?.posts) ? dPosts.posts.slice() : [];
        videos.sort((a, b) => new Date(b.creado) - new Date(a.creado));

        const dSocial = await bd.leerArchivoFresh(RUTA_SOCIAL);
        social = {
            likes: (dSocial && dSocial.likes) || {},
            comentarios: (dSocial && dSocial.comentarios) || {}
        };
    } catch (e) {
        videos = [];
        social = { likes: {}, comentarios: {} };
    }
}

// ============================================================
//  CACHE LRU DE VIDEOS
// ============================================================
async function obtenerVideoURL(post) {
    if (!post) return null;

    if (videoCache.has(post.id)) {
        const entry = videoCache.get(post.id);
        entry.lastUsed = Date.now();
        return entry.url;
    }

    if (videoCache.size >= MAX_VIDEO_CACHE) {
        let oldestId = null, oldestTime = Infinity;
        for (const [id, entry] of videoCache.entries()) {
            if (entry.lastUsed < oldestTime) {
                oldestTime = entry.lastUsed;
                oldestId = id;
            }
        }
        if (oldestId) {
            const e = videoCache.get(oldestId);
            try { URL.revokeObjectURL(e.url); } catch (err) {}
            videoCache.delete(oldestId);
        }
    }

    try {
        const mh = MH();
        if (!mh || !post.videoRuta) return null;
        const url = await mh.leerVideoURL(post.videoRuta);
        if (!url) return null;
        videoCache.set(post.id, { url, lastUsed: Date.now() });
        return url;
    } catch (e) {
        return null;
    }
}

function limpiarCacheVideos() {
    for (const entry of videoCache.values()) {
        try { URL.revokeObjectURL(entry.url); } catch (e) {}
    }
    videoCache.clear();
}

function quitarDeCache(postId) {
    if (!videoCache.has(postId)) return;
    const e = videoCache.get(postId);
    try { URL.revokeObjectURL(e.url); } catch (err) {}
    videoCache.delete(postId);
}

// ============================================================
//  RENDER FEED
// ============================================================
function renderFeed() {
    const feed = document.getElementById('mpFeed');
    const empty = document.getElementById('mpEmpty');
    const header = document.getElementById('mpHeader');
    if (!feed) return;

    if (feedObserver) { feedObserver.disconnect(); feedObserver = null; }
    if (preloadObserver) { preloadObserver.disconnect(); preloadObserver = null; }

    feed.innerHTML = '';

    if (videos.length === 0) {
        empty.hidden = false;
        feed.hidden = true;
        header.hidden = true;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    feed.hidden = false;
    header.hidden = false;

    const fragment = document.createDocumentFragment();
    videos.forEach(post => fragment.appendChild(crearCardVideo(post)));
    feed.appendChild(fragment);

    if (window.lucide) window.lucide.createIcons();

    preloadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) cargarVideoEnElemento(entry.target);
        });
    }, { root: feed, rootMargin: '300px 0px', threshold: 0 });

    feedObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const vid = entry.target;
            if (entry.intersectionRatio >= 0.6) {
                vid.play().catch(() => {});
            } else {
                vid.pause();
            }
        });
    }, { root: feed, threshold: [0, 0.6, 1] });

    feed.querySelectorAll('.mp-clip video').forEach(v => {
        preloadObserver.observe(v);
        feedObserver.observe(v);
    });
}

function crearCardVideo(post) {
    const likes = Array.isArray(social.likes[post.id]) ? social.likes[post.id] : [];
    const isLiked = likes.includes(usuarioActual.codigo);
    const coms = social.comentarios[post.id] || {};
    const numComs = Object.keys(coms).length;

    const foto = fotoDe(post.autor);
    const inicial = (post.autorNombre || nombreDe(post.autor) || '?').charAt(0).toUpperCase();

    const card = document.createElement('div');
    card.className = 'mp-clip';
    card.dataset.id = post.id;

    card.innerHTML = `
        <video loop playsinline muted preload="none" data-id="${post.id}"></video>

        <div class="mp-clip-loader">
            <div class="mp-loader-spinner"></div>
        </div>

        <div class="mp-overlay-right">
            <button class="mp-action mp-btn-like ${isLiked ? 'liked' : ''}" data-id="${post.id}" title="Me gusta">
                <div class="mp-action-circle"><i data-lucide="heart"></i></div>
                <span class="mp-action-count">${likes.length || ''}</span>
            </button>
            <button class="mp-action mp-btn-comentar" data-id="${post.id}" title="Comentarios">
                <div class="mp-action-circle"><i data-lucide="message-circle"></i></div>
                <span class="mp-action-count">${numComs || ''}</span>
            </button>
        </div>

        <div class="mp-overlay-bottom">
            <div class="mp-clip-autor" data-accion="perfil" data-codigo="${escapar(post.autor)}">
                <div class="mp-clip-autor-avatar">
                    ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicial)}</span>`}
                </div>
                <span class="mp-clip-autor-nombre">@${escapar(post.autorNombre || post.autor)}</span>
            </div>
            <div class="mp-clip-desc">
                ${post.descripcion ? escapar(post.descripcion) : '<span class="mp-sin-desc">Sin descripción</span>'}
            </div>
            <div class="mp-clip-tiempo">
                <i data-lucide="clock"></i>
                ${tiempoRelativo(post.creado)}
            </div>
        </div>
    `;

    const vid = card.querySelector('video');
    vid.addEventListener('click', () => {
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
    });

    card.querySelector('.mp-btn-like').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(post.id, e.currentTarget);
    });
    card.querySelector('.mp-btn-comentar').addEventListener('click', (e) => {
        e.stopPropagation();
        abrirComentarios(post.id);
    });
    card.querySelector('[data-accion="perfil"]').addEventListener('click', (e) => {
        e.stopPropagation();
        abrirPerfil(post.autor);
    });

    return card;
}

async function cargarVideoEnElemento(vidEl) {
    if (vidEl.dataset.cargado === '1') return;
    const id = vidEl.dataset.id;
    const post = videos.find(v => v.id === id);
    if (!post) return;

    vidEl.dataset.cargado = '1';
    const card = vidEl.closest('.mp-clip');
    const loader = card?.querySelector('.mp-clip-loader');

    const url = await obtenerVideoURL(post);
    if (!url) {
        if (loader) loader.hidden = true;
        return;
    }
    vidEl.src = url;

    const playCuandoListo = () => {
        if (loader) loader.hidden = true;
        vidEl.play().then(() => {
            vidEl.muted = !sonidoActivo;
        }).catch(() => {});
    };

    if (vidEl.readyState >= 2) playCuandoListo();
    else vidEl.addEventListener('loadeddata', playCuandoListo, { once: true });
}

// ============================================================
//  SUBIR VIDEO
// ============================================================
function abrirSubir() {
    resetSubir();
    document.getElementById('mpModalSubir').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function resetSubir() {
    filePendiente = null;
    if (previewUrlActiva) {
        try { URL.revokeObjectURL(previewUrlActiva); } catch (e) {}
        previewUrlActiva = null;
    }
    const input = document.getElementById('mpInputFile');
    if (input) input.value = '';
    const desc = document.getElementById('mpInputDesc');
    if (desc) desc.value = '';
    document.getElementById('mpFileDrop').hidden = false;
    document.getElementById('mpPreviewWrap').hidden = true;
    document.getElementById('mpSubirGuardar').disabled = true;
    const vp = document.getElementById('mpVideoPreview');
    if (vp) {
        vp.pause();
        vp.removeAttribute('src');
        vp.load();
    }
}

function initUploadEventos() {
    const inputFile = document.getElementById('mpInputFile');
    const fileDrop = document.getElementById('mpFileDrop');

    fileDrop?.addEventListener('click', () => inputFile.click());

    inputFile?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('video/')) {
            toast('El archivo debe ser un video.', 'error');
            e.target.value = '';
            return;
        }
        if (file.size > MAX_BYTES) {
            const mb = (file.size / 1024 / 1024).toFixed(1);
            toast(`El video pesa ${mb} MB. Máximo ${MAX_MB} MB.`, 'error');
            e.target.value = '';
            return;
        }

        filePendiente = file;
        if (previewUrlActiva) {
            try { URL.revokeObjectURL(previewUrlActiva); } catch (err) {}
        }
        previewUrlActiva = URL.createObjectURL(file);

        fileDrop.hidden = true;
        document.getElementById('mpPreviewWrap').hidden = false;
        document.getElementById('mpSubirGuardar').disabled = false;

        const vp = document.getElementById('mpVideoPreview');
        vp.src = previewUrlActiva;
        vp.play().catch(() => {});
    });

    document.getElementById('mpBtnCambiarVideo')?.addEventListener('click', resetSubir);
}

async function intentarSubir() {
    if (!filePendiente) return;

    const misVideos = videos.filter(v => v.autor === usuarioActual.codigo);

    if (misVideos.length >= MAX_VIDEOS_USER) {
        document.getElementById('mpModalLimite').hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    await _hacerSubida(false);
}

async function _hacerSubida(modoAuto) {
    const btn = document.getElementById('mpSubirGuardar');
    if (!btn || !filePendiente) return;

    const misVideos = videos.filter(v => v.autor === usuarioActual.codigo);
    let masAntiguo = null;

    if (modoAuto && misVideos.length >= MAX_VIDEOS_USER) {
        masAntiguo = misVideos
            .slice()
            .sort((a, b) => new Date(a.creado) - new Date(b.creado))[0];
    }

    btn.disabled = true;
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Subiendo...';
    if (window.lucide) window.lucide.createIcons();

    try {
        const uploaded = await MH().publicarVideo(APP_ID, filePendiente, {});

        const nuevo = {
            id: generarId(),
            autor: usuarioActual.codigo,
            autorNombre: usuarioActual.nombre || usuarioActual.codigo,
            videoRuta: uploaded.ruta,
            descripcion: document.getElementById('mpInputDesc').value.trim(),
            creado: new Date().toISOString()
        };

        await BD().actualizarArchivo(RUTA_POSTS, (data) => {
            if (!data || typeof data !== 'object') data = { version: 1, posts: [] };
            if (!Array.isArray(data.posts)) data.posts = [];
            data.posts.push(nuevo);
            if (masAntiguo) {
                data.posts = data.posts.filter(p => p.id !== masAntiguo.id);
            }
            data.actualizado = new Date().toISOString();
            return data;
        });

        if (masAntiguo) {
            quitarDeCache(masAntiguo.id);
            MH().borrarVideo(masAntiguo.videoRuta).catch(() => {});
            toast('¡Subido! Se borró el más antiguo.', 'success');
        } else {
            toast('¡Pantalón subido!', 'success');
        }

        document.getElementById('mpModalSubir').hidden = true;
        document.getElementById('mpModalLimite').hidden = true;
        resetSubir();
        await cargarDatos();
        renderFeed();
    } catch (e) {
        console.warn('[MyPants] Error subiendo:', e);
        toast(e.message || 'No se pudo subir el video.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOriginal;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  LIKES
// ============================================================
async function toggleLike(postId, btnEl) {
    const miCodigo = usuarioActual.codigo;
    let fueLiked = false;

    try {
        const updated = await BD().actualizarArchivo(RUTA_SOCIAL, (data) => {
            if (!data || typeof data !== 'object') data = {};
            if (!data.likes) data.likes = {};
            if (!Array.isArray(data.likes[postId])) data.likes[postId] = [];

            const idx = data.likes[postId].indexOf(miCodigo);
            if (idx >= 0) {
                data.likes[postId].splice(idx, 1);
                fueLiked = false;
            } else {
                data.likes[postId].push(miCodigo);
                fueLiked = true;
            }
            data.actualizado = new Date().toISOString();
            return data;
        });

        social.likes = updated.likes || social.likes;
        social.comentarios = updated.comentarios || social.comentarios;

        btnEl.classList.toggle('liked', fueLiked);
        const countEl = btnEl.querySelector('.mp-action-count');
        const total = (social.likes[postId] || []).length;
        if (countEl) countEl.textContent = total > 0 ? total : '';
    } catch (e) {
        console.warn('[MyPants] Error like:', e);
        toast('No se pudo guardar el like.', 'error');
    }
}

// ============================================================
//  COMENTARIOS
// ============================================================
function abrirComentarios(postId) {
    videoViendoId = postId;
    const input = document.getElementById('mpInputComentario');
    if (input) input.value = '';
    const btn = document.getElementById('mpBtnEnviarCom');
    if (btn) btn.disabled = true;
    document.getElementById('mpModalComentarios').hidden = false;
    renderComentarios();
    if (window.lucide) window.lucide.createIcons();
}

function renderComentarios() {
    const lista = document.getElementById('mpComLista');
    if (!lista || !videoViendoId) return;
    lista.innerHTML = '';

    const coms = social.comentarios[videoViendoId] || {};
    const arr = Object.entries(coms)
        .map(([cod, data]) => ({ cod, ...data }))
        .sort((a, b) => new Date(a.creado) - new Date(b.creado));

    if (arr.length === 0) {
        lista.innerHTML = `
            <div class="mp-com-vacio">
                <i data-lucide="message-circle"></i>
                <p>Sé el primero en comentar</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    arr.forEach(c => {
        const foto = fotoDe(c.cod);
        const inicial = inicialDe(c.cod);
        const esPropio = c.cod === usuarioActual.codigo;

        const div = document.createElement('div');
        div.className = 'mp-com' + (esPropio ? ' propio' : '');
        div.innerHTML = `
            <div class="mp-com-avatar">
                ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicial)}</span>`}
            </div>
            <div class="mp-com-body">
                <div class="mp-com-top">
                    <span class="mp-com-autor">${escapar(nombreDe(c.cod))}${esPropio ? ' (tú)' : ''}</span>
                    <span class="mp-com-tiempo">${tiempoRelativo(c.creado)}</span>
                </div>
                <div class="mp-com-texto">${escapar(c.texto)}</div>
            </div>
        `;
        lista.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
    lista.scrollTop = lista.scrollHeight;
}

async function enviarComentario() {
    if (!videoViendoId) return;
    const input = document.getElementById('mpInputComentario');
    const texto = (input.value || '').trim();
    if (!texto) return;

    const miCodigo = usuarioActual.codigo;
    const post = videos.find(v => v.id === videoViendoId);
    const esNuevo = !social.comentarios[videoViendoId]?.[miCodigo];

    try {
        const updated = await BD().actualizarArchivo(RUTA_SOCIAL, (data) => {
            if (!data || typeof data !== 'object') data = {};
            if (!data.comentarios) data.comentarios = {};
            if (!data.comentarios[videoViendoId]) data.comentarios[videoViendoId] = {};
            data.comentarios[videoViendoId][miCodigo] = {
                texto: texto.slice(0, 150),
                creado: new Date().toISOString()
            };
            data.actualizado = new Date().toISOString();
            return data;
        });

        social.likes = updated.likes || social.likes;
        social.comentarios = updated.comentarios || social.comentarios;

        input.value = '';
        document.getElementById('mpBtnEnviarCom').disabled = true;
        renderComentarios();

        const countEl = document.querySelector(`.mp-btn-comentar[data-id="${videoViendoId}"] .mp-action-count`);
        if (countEl) {
            const total = Object.keys(social.comentarios[videoViendoId] || {}).length;
            countEl.textContent = total > 0 ? total : '';
        }

        if (esNuevo && post && post.autor !== miCodigo) {
            const api = API();
            if (api && typeof api.enviarNotificacion === 'function') {
                const preview = texto.length > 40 ? texto.slice(0, 40) + '…' : texto;
                api.enviarNotificacion(
                    APP_ID,
                    `${nombreDe(miCodigo)} comentó tu pantalón: "${preview}"`,
                    post.autor
                ).catch(() => {});
            }
        }

        toast(esNuevo ? 'Comentario publicado' : 'Comentario actualizado', 'success');
    } catch (e) {
        console.warn('[MyPants] Error comentando:', e);
        toast('No se pudo publicar el comentario.', 'error');
    }
}

// ============================================================
//  PERFIL
// ============================================================
function abrirPerfil(codigo = null) {
    codigoPerfilViendo = codigo || usuarioActual.codigo;
    const esPropio = codigoPerfilViendo === usuarioActual.codigo;

    const usuario = usuariosPorCodigo[codigoPerfilViendo] || {};
    const nombre = usuario.nombre ||
        (esPropio ? usuarioActual.nombre : codigoPerfilViendo) ||
        codigoPerfilViendo;
    const foto = usuario.foto || null;
    const inicial = (nombre || '?').charAt(0).toUpperCase();

    document.getElementById('mpPerfilTitulo').textContent =
        esPropio ? 'Mi Armario' : 'Armario';

    const avatarEl = document.getElementById('mpPerfilAvatar');
    avatarEl.innerHTML = foto
        ? `<img src="${foto}" alt="">`
        : `<span>${escapar(inicial)}</span>`;

    document.getElementById('mpPerfilNombre').textContent = nombre;
    document.getElementById('mpPerfilCodigo').textContent = '@' + codigoPerfilViendo;

    const misVideos = videos
        .filter(v => v.autor === codigoPerfilViendo)
        .sort((a, b) => new Date(b.creado) - new Date(a.creado));

    const statsEl = document.getElementById('mpPerfilStats');
    if (esPropio) {
        statsEl.textContent = `${misVideos.length} / ${MAX_VIDEOS_USER} pantalones`;
    } else {
        statsEl.textContent = misVideos.length === 1
            ? '1 pantalón'
            : `${misVideos.length} pantalones`;
    }

    const grid = document.getElementById('mpPerfilGrid');
    const vacio = document.getElementById('mpPerfilVacio');
    grid.innerHTML = '';

    if (misVideos.length === 0) {
        grid.hidden = true;
        vacio.hidden = false;
    } else {
        grid.hidden = false;
        vacio.hidden = true;

        misVideos.forEach(v => {
            const el = document.createElement('div');
            el.className = 'mp-mini-vid';
            el.dataset.id = v.id;

            el.innerHTML = `
                <div class="mp-mini-placeholder">
                    <i data-lucide="video"></i>
                </div>
                ${esPropio ? `<button class="mp-mini-trash" data-id="${v.id}" title="Borrar"><i data-lucide="trash-2"></i></button>` : ''}
            `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.mp-mini-trash')) return;
                scrollToVideoEnFeed(v.id);
            });

            grid.appendChild(el);
            cargarThumbnailPerfil(v, el);
        });

        if (esPropio) {
            grid.querySelectorAll('.mp-mini-trash').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const v = misVideos.find(x => x.id === id);
                    if (v) borrarVideo(v.id, v.videoRuta);
                });
            });
        }
    }

    document.getElementById('mpModalPerfil').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function cargarThumbnailPerfil(video, el) {
    try {
        const url = await obtenerVideoURL(video);
        if (!url) {
            el.querySelector('.mp-mini-placeholder')?.remove();
            el.classList.add('mp-mini-error');
            return;
        }
        const v = document.createElement('video');
        v.src = url;
        v.muted = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.className = 'mp-mini-video';
        el.insertBefore(v, el.firstChild);
        el.querySelector('.mp-mini-placeholder')?.remove();
    } catch (e) { /* silencioso */ }
}

function cerrarPerfil() {
    document.getElementById('mpModalPerfil').hidden = true;
    codigoPerfilViendo = null;
}

function scrollToVideoEnFeed(postId) {
    cerrarPerfil();
    setTimeout(() => {
        const el = document.querySelector(`.mp-clip[data-id="${postId}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
}

async function borrarVideo(id, ruta) {
    if (!confirm('¿Eliminar este pantalón para siempre?')) return;

    try {
        if (ruta) {
            try { await MH().borrarVideo(ruta); } catch (e) {}
        }

        await BD().actualizarArchivo(RUTA_POSTS, data => {
            if (!data || !Array.isArray(data.posts)) return data;
            data.posts = data.posts.filter(p => p.id !== id);
            data.actualizado = new Date().toISOString();
            return data;
        });

        quitarDeCache(id);

        await cargarDatos();
        abrirPerfil(codigoPerfilViendo);
        renderFeed();
        toast('Pantalón eliminado', 'success');
    } catch (e) {
        console.warn('[MyPants] Error borrando:', e);
        toast('No se pudo eliminar.', 'error');
    }
}

// ============================================================
//  SONIDO
// ============================================================
function toggleSonido() {
    sonidoActivo = !sonidoActivo;
    const btn = document.getElementById('mpBtnSonido');
    if (btn) {
        btn.innerHTML = sonidoActivo
            ? '<i data-lucide="volume-2"></i>'
            : '<i data-lucide="volume-x"></i>';
        btn.title = sonidoActivo ? 'Silenciar' : 'Activar sonido';
        if (window.lucide) window.lucide.createIcons();
    }
    document.querySelectorAll('.mp-clip video').forEach(v => {
        v.muted = !sonidoActivo;
    });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('MyPants necesita estar dentro de VicWebOs.'); return; }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar MyPants.');
        return;
    }

    await cargarUsuarios();
    await cargarDatos();
    renderFeed();

    // Header
    document.getElementById('mpBtnNuevo')?.addEventListener('click', abrirSubir);
    document.getElementById('mpEmptyBtn')?.addEventListener('click', abrirSubir);
    document.getElementById('mpBtnPerfil')?.addEventListener('click', () => abrirPerfil());
    document.getElementById('mpBtnSonido')?.addEventListener('click', toggleSonido);

    // Modal subir
    document.getElementById('mpSubirCerrar')?.addEventListener('click', () => {
        document.getElementById('mpModalSubir').hidden = true;
        resetSubir();
    });
    document.getElementById('mpSubirCancelar')?.addEventListener('click', () => {
        document.getElementById('mpModalSubir').hidden = true;
        resetSubir();
    });
    document.getElementById('mpSubirGuardar')?.addEventListener('click', intentarSubir);

    // Modal límite
    document.getElementById('mpLimiteCerrar')?.addEventListener('click', () => {
        document.getElementById('mpModalLimite').hidden = true;
    });
    document.getElementById('mpLimiteAuto')?.addEventListener('click', async () => {
        document.getElementById('mpModalLimite').hidden = true;
        await _hacerSubida(true);
    });
    document.getElementById('mpLimiteManual')?.addEventListener('click', () => {
        document.getElementById('mpModalLimite').hidden = true;
        document.getElementById('mpModalSubir').hidden = true;
        resetSubir();
        abrirPerfil();
        toast('Elegí un pantalón para borrar y volvé a intentar.', 'info');
    });

    // Modal comentarios
    document.getElementById('mpComCerrar')?.addEventListener('click', () => {
        document.getElementById('mpModalComentarios').hidden = true;
        videoViendoId = null;
    });
    document.getElementById('mpBtnEnviarCom')?.addEventListener('click', enviarComentario);

    const inputCom = document.getElementById('mpInputComentario');
    inputCom?.addEventListener('input', () => {
        const btn = document.getElementById('mpBtnEnviarCom');
        if (btn) btn.disabled = !inputCom.value.trim();
    });
    inputCom?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarComentario(); }
    });

    // Modal perfil
    document.getElementById('mpPerfilCerrar')?.addEventListener('click', cerrarPerfil);

    // Click fuera de modales
    document.querySelectorAll('.mp-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            const id = modal.id;
            if (id === 'mpModalSubir') { modal.hidden = true; resetSubir(); }
            if (id === 'mpModalLimite') { modal.hidden = true; }
            if (id === 'mpModalComentarios') { modal.hidden = true; videoViendoId = null; }
            if (id === 'mpModalPerfil') { cerrarPerfil(); }
        });
    });

    // ESC
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('mpModalComentarios').hidden) {
            document.getElementById('mpModalComentarios').hidden = true;
            videoViendoId = null; return;
        }
        if (!document.getElementById('mpModalPerfil').hidden) { cerrarPerfil(); return; }
        if (!document.getElementById('mpModalLimite').hidden) {
            document.getElementById('mpModalLimite').hidden = true; return;
        }
        if (!document.getElementById('mpModalSubir').hidden) {
            document.getElementById('mpModalSubir').hidden = true; resetSubir(); return;
        }
    });

    // Pausar todo al cambiar de pestaña
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            document.querySelectorAll('.mp-clip video').forEach(v => v.pause());
        }
    });

    initUploadEventos();

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('pagehide', () => {
    limpiarCacheVideos();
    if (previewUrlActiva) {
        try { URL.revokeObjectURL(previewUrlActiva); } catch (e) {}
    }
    if (feedObserver) feedObserver.disconnect();
    if (preloadObserver) preloadObserver.disconnect();
});
