// ============================================================
//  VicsGram — Mini-Instagram de la comunidad
//  ------------------------------------------------------------
//  Solo posts (imagen + descripción corta). Likes y comentarios.
//  Sin sistema de "seguir usuarios". Cuenta auto-creada con VicWebOs.
//
//  Datos en 2 JSON:
//    app/vicsgram/vicsgram.json         → índice de publicaciones
//    app/vicsgram/vicsgram-social.json  → likes + comentarios
//
//  Reglas:
//    ● 1 comentario por persona por post (se puede actualizar).
//    ● El autor puede editar y borrar sus propios posts.
//    ● Al borrar un post → se limpian sus likes y comentarios.
//    ● NOTIFICACIÓN al autor cuando alguien comenta su post.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'vicsgram';
const RUTA_POSTS  = 'app/vicsgram/vicsgram.json';
const RUTA_SOCIAL = 'app/vicsgram/vicsgram-social.json';

const MAX_DESCRIPCION = 150;
const MAX_COMENTARIO  = 200;
const POSTS_POR_PAGINA = 10;
const CUENTAS_FILE = 'cuenta.json';

// ---------- ESTADO ----------
let usuarioActual = null;
let cuentaCompleta = null;         // incluye foto, para el perfil
let usuariosPorCodigo = {};        // { codigo: { nombre, foto, ... } }

let posts = [];                    // índice de publicaciones
let social = { likes: {}, comentarios: {} };

let tabActual = 'todos';
let postsVisibles = POSTS_POR_PAGINA;
let urlsActivas = [];              // blob URLs para revocar
let urlsPerfil = [];

// Editor
let editandoPostId = null;
let imagenPendienteId = null;

// Ver post
let postViendoId = null;

// Perfil
let codigoPerfilViendo = null;

// Timeouts
let toastTimeout = null;
let msgEditorTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

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

function generarId(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function tiempoRelativo(iso) {
    const d = new Date(iso);
    const ahora = new Date();
    const diff = Math.floor((ahora - d) / 1000);
    if (diff < 30) return 'ahora';
    if (diff < 60) return `hace ${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `hace ${dias}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function limpiarUrls() {
    urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    urlsActivas = [];
}

function limpiarUrlsPerfil() {
    urlsPerfil.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    urlsPerfil = [];
}

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('vgToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'vg-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
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
        cuentas.forEach(c => {
            usuariosPorCodigo[c.codigo] = c;
        });
        // Refrescar mi propia cuenta (con foto)
        if (usuarioActual) {
            cuentaCompleta = usuariosPorCodigo[usuarioActual.codigo] || null;
        }
    } catch (e) { /* silencioso */ }
}

async function cargarPosts(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = fresh
            ? await bd.leerArchivoFresh(RUTA_POSTS)
            : await bd.leerArchivo(RUTA_POSTS);
        posts = normalizarPosts(data);
    } catch (e) {
        posts = [];
    }
}

async function cargarSocial(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = fresh
            ? await bd.leerArchivoFresh(RUTA_SOCIAL)
            : await bd.leerArchivo(RUTA_SOCIAL);
        social = normalizarSocial(data);
    } catch (e) {
        social = { likes: {}, comentarios: {} };
    }
}

function normalizarPosts(data) {
    if (!data || typeof data !== 'object') return [];
    if (!Array.isArray(data.posts)) data.posts = [];
    return data.posts
        .filter(p => p && p.id && p.autor)
        .map(p => ({
            id: p.id,
            autor: p.autor,
            autorNombre: p.autorNombre || p.autor,
            imagenId: p.imagenId || null,
            descripcion: String(p.descripcion || '').slice(0, MAX_DESCRIPCION),
            creado: p.creado || new Date().toISOString(),
            editado: p.editado || null
        }));
}

function normalizarSocial(data) {
    if (!data || typeof data !== 'object') {
        return { likes: {}, comentarios: {} };
    }
    if (!data.likes || typeof data.likes !== 'object') data.likes = {};
    if (!data.comentarios || typeof data.comentarios !== 'object') data.comentarios = {};
    return data;
}

// ============================================================
//  ACCIONES DE DATOS (escribir)
// ============================================================
async function mutarPosts(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const resultado = await bd.actualizarArchivo(RUTA_POSTS, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, posts: [] };
        if (!Array.isArray(actual.posts)) actual.posts = [];
        actual = mutador(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    posts = normalizarPosts(resultado);
}

async function mutarSocial(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const resultado = await bd.actualizarArchivo(RUTA_SOCIAL, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1 };
        if (!actual.likes || typeof actual.likes !== 'object') actual.likes = {};
        if (!actual.comentarios || typeof actual.comentarios !== 'object') actual.comentarios = {};
        actual = mutador(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    social = normalizarSocial(resultado);
}

// ============================================================
//  RENDER — FEED
// ============================================================
function postsFiltrados() {
    let lista = posts.slice();
    if (tabActual === 'mios') {
        lista = lista.filter(p => p.autor === usuarioActual.codigo);
    }
    // Más nuevos primero
    lista.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    return lista;
}

function contarLikes(postId) {
    const arr = social.likes[postId];
    return Array.isArray(arr) ? arr.length : 0;
}

function contarComentarios(postId) {
    const obj = social.comentarios[postId];
    return obj ? Object.keys(obj).length : 0;
}

function yoDiLike(postId) {
    const arr = social.likes[postId];
    return Array.isArray(arr) && arr.includes(usuarioActual.codigo);
}

function renderFeed() {
    const feed = document.getElementById('vgFeed');
    const empty = document.getElementById('vgEmpty');
    const btnCargarMas = document.getElementById('vgCargarMas');
    const emptyTitulo = document.getElementById('vgEmptyTitulo');
    const emptyDesc = document.getElementById('vgEmptyDesc');
    const emptyBtn = document.getElementById('vgEmptyBtnNuevo');
    const countMios = document.getElementById('vgCountMios');
    if (!feed) return;

    limpiarUrls();
    feed.innerHTML = '';

    // Contador de "mis posts"
    const misPosts = posts.filter(p => p.autor === usuarioActual.codigo).length;
    if (countMios) countMios.textContent = misPosts;

    const lista = postsFiltrados();

    if (lista.length === 0) {
        empty.hidden = false;
        btnCargarMas.hidden = true;

        if (tabActual === 'mios') {
            emptyTitulo.textContent = 'No tenés publicaciones';
            emptyDesc.textContent = 'Cuando subas una foto, va a aparecer acá.';
            emptyBtn.hidden = false;
        } else {
            emptyTitulo.textContent = 'Aún no hay publicaciones';
            emptyDesc.textContent = 'Sé el primero en compartir algo con la comunidad.';
            emptyBtn.hidden = false;
        }
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;

    const visibles = lista.slice(0, postsVisibles);
    visibles.forEach(post => {
        feed.appendChild(crearPostCard(post));
    });

    // Botón "cargar más"
    if (lista.length > postsVisibles) {
        btnCargarMas.hidden = false;
    } else {
        btnCargarMas.hidden = true;
    }

    if (window.lucide) window.lucide.createIcons();
}

function crearPostCard(post) {
    const wrap = document.createElement('div');
    wrap.className = 'vg-post';
    wrap.dataset.id = post.id;

    const esMio = post.autor === usuarioActual.codigo;
    const usuario = usuariosPorCodigo[post.autor] || {};
    const foto = usuario.foto || null;
    const nombre = post.autorNombre || usuario.nombre || post.autor;

    // ---- Header ----
    const header = document.createElement('div');
    header.className = 'vg-post-header';

    const autorBtn = document.createElement('div');
    autorBtn.className = 'vg-post-autor';
    autorBtn.innerHTML = `
        <div class="vg-avatar">${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}</div>
        <div class="vg-post-autor-info">
            <div class="vg-post-autor-nombre">${escapar(nombre)}</div>
            <div class="vg-post-tiempo">${tiempoRelativo(post.creado)}${post.editado ? ' · editado' : ''}</div>
        </div>
    `;
    autorBtn.addEventListener('click', () => abrirPerfil(post.autor));
    header.appendChild(autorBtn);

    if (esMio) {
        const menu = document.createElement('div');
        menu.className = 'vg-post-menu';
        menu.innerHTML = `
            <button class="vg-icon-btn" title="Editar" data-accion="editar">
                <i data-lucide="pencil"></i>
            </button>
            <button class="vg-icon-btn vg-icon-btn-peligro" title="Eliminar" data-accion="borrar">
                <i data-lucide="trash-2"></i>
            </button>
        `;
        menu.querySelector('[data-accion="editar"]').addEventListener('click', (e) => {
            e.stopPropagation();
            abrirEditor(post.id);
        });
        menu.querySelector('[data-accion="borrar"]').addEventListener('click', (e) => {
            e.stopPropagation();
            borrarPost(post.id);
        });
        header.appendChild(menu);
    }
    wrap.appendChild(header);

    // ---- Imagen ----
    const imgWrap = document.createElement('div');
    imgWrap.className = 'vg-post-imagen';
    const skeleton = document.createElement('div');
    skeleton.className = 'vg-post-imagen-skeleton';
    imgWrap.appendChild(skeleton);
    imgWrap.addEventListener('click', () => abrirVerPost(post.id));
    wrap.appendChild(imgWrap);

    // Cargar imagen de galería — FIX: usar el código del autor del post
    if (post.imagenId) {
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(post.imagenId, post.autor)  // ← FIX: autor del post
                .then(url => {
                    if (!url) return;
                    urlsActivas.push(url);
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = '';
                    img.loading = 'lazy';
                    img.onload = () => skeleton.remove();
                    imgWrap.insertBefore(img, skeleton);
                })
                .catch(() => skeleton.remove());
        }
    } else {
        skeleton.remove();
        imgWrap.style.background = 'var(--gray-100)';
        imgWrap.innerHTML = '<i data-lucide="image-off" style="width:40px;height:40px;color:var(--gray-400);"></i>';
    }

    // ---- Descripción ----
    if (post.descripcion) {
        const desc = document.createElement('div');
        desc.className = 'vg-post-descripcion';
        desc.textContent = post.descripcion;
        wrap.appendChild(desc);
    }

    // ---- Footer (acciones) ----
    const footer = document.createElement('div');
    footer.className = 'vg-post-footer';

    const likes = contarLikes(post.id);
    const comentarios = contarComentarios(post.id);
    const liked = yoDiLike(post.id);

    const btnLike = document.createElement('button');
    btnLike.className = 'vg-btn-like' + (liked ? ' liked' : '');
    btnLike.innerHTML = `
        <i data-lucide="heart"></i>
        <span>${likes > 0 ? likes : ''}</span>
    `;
    btnLike.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(post.id);
    });
    footer.appendChild(btnLike);

    const btnCom = document.createElement('button');
    btnCom.className = 'vg-btn-comentarios';
    btnCom.innerHTML = `
        <i data-lucide="message-circle"></i>
        <span>${comentarios > 0 ? comentarios : ''}</span>
    `;
    btnCom.addEventListener('click', (e) => {
        e.stopPropagation();
        abrirVerPost(post.id);
    });
    footer.appendChild(btnCom);

    wrap.appendChild(footer);

    return wrap;
}

// ============================================================
//  RENDER — MODAL VER POST
// ============================================================
async function abrirVerPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    postViendoId = postId;
    const esMio = post.autor === usuarioActual.codigo;
    const usuario = usuariosPorCodigo[post.autor] || {};
    const foto = usuario.foto || null;
    const nombre = post.autorNombre || usuario.nombre || post.autor;

    // Autor
    const avatarWrap = document.getElementById('vgVerAutorAvatar');
    avatarWrap.innerHTML = foto
        ? `<img src="${foto}" alt="">`
        : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`;
    document.getElementById('vgVerAutorNombre').textContent = nombre;
    document.getElementById('vgVerTiempo').textContent =
        tiempoRelativo(post.creado) + (post.editado ? ' · editado' : '');

    // Descripción
    const descEl = document.getElementById('vgVerDescripcion');
    descEl.textContent = post.descripcion || '';

    // Imagen
    const imgEl = document.getElementById('vgVerImagen');
    imgEl.removeAttribute('src');
    if (post.imagenId) {
        const mh = MH();
        if (mh) {
            try {
                // FIX: usar el código del autor del post
                const url = await mh.galeria.leerImagenURL(post.imagenId, post.autor);
                if (url) {
                    imgEl.src = url;
                    imgEl.onload = () => URL.revokeObjectURL(url);
                }
            } catch (e) { /* silencioso */ }
        }
    }

    // Like + comentarios contadores
    actualizarAccionesVerPost();

    // Botones de autor
    const accionesAutor = document.getElementById('vgVerAccionesAutor');
    accionesAutor.hidden = !esMio;

    // Comentarios
    renderComentariosVerPost();

    // Input de comentario
    configurarInputComentario();

    document.getElementById('vgModalVer').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function actualizarAccionesVerPost() {
    if (!postViendoId) return;
    const likes = contarLikes(postViendoId);
    const comentarios = contarComentarios(postViendoId);
    const liked = yoDiLike(postViendoId);

    const btnLike = document.getElementById('vgVerBtnLike');
    btnLike.classList.toggle('liked', liked);
    document.getElementById('vgVerLikesTexto').textContent =
        likes > 0 ? `${likes} ${likes === 1 ? 'me gusta' : 'me gusta'}` : 'Me gusta';

    document.getElementById('vgVerComentariosTexto').textContent =
        comentarios === 0 ? 'Sin comentarios'
        : comentarios === 1 ? '1 comentario'
        : `${comentarios} comentarios`;
}

function renderComentariosVerPost() {
    const cont = document.getElementById('vgVerComentarios');
    if (!cont || !postViendoId) return;
    cont.innerHTML = '';

    const comentariosPost = social.comentarios[postViendoId] || {};
    const lista = Object.entries(comentariosPost)
        .map(([codigo, data]) => ({ codigo, ...data }))
        .sort((a, b) => new Date(a.creado) - new Date(b.creado));

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="vg-ver-comentarios-vacio">
                <i data-lucide="message-circle"></i>
                <p>Sé el primero en comentar</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    lista.forEach(c => {
        const usuario = usuariosPorCodigo[c.codigo] || {};
        const foto = usuario.foto || null;
        const nombre = usuario.nombre || c.codigo;
        const esPropio = c.codigo === usuarioActual.codigo;

        const div = document.createElement('div');
        div.className = 'vg-comentario' + (esPropio ? ' propio' : '');
        div.innerHTML = `
            <div class="vg-avatar vg-comentario-avatar">
                ${foto
                    ? `<img src="${foto}" alt="">`
                    : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
            </div>
            <div class="vg-comentario-cuerpo">
                <div class="vg-comentario-autor">${escapar(nombre)}${esPropio ? ' (tú)' : ''}</div>
                <div class="vg-comentario-texto">${escapar(c.texto)}</div>
                <div class="vg-comentario-tiempo">${tiempoRelativo(c.creado)}</div>
            </div>
        `;
        cont.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
}

function configurarInputComentario() {
    const input = document.getElementById('vgVerInputComentario');
    const btn = document.getElementById('vgVerBtnEnviar');
    const aviso = document.getElementById('vgVerInputAviso');
    if (!input || !btn || !postViendoId) return;

    const comentariosPost = social.comentarios[postViendoId] || {};
    const miComentario = comentariosPost[usuarioActual.codigo];

    if (miComentario) {
        input.value = miComentario.texto || '';
        aviso.textContent = 'Ya comentaste este post. Puedes actualizar tu comentario.';
    } else {
        input.value = '';
        aviso.textContent = '';
    }

    btn.disabled = !input.value.trim();
}

// ============================================================
//  LIKE / UNLIKE
// ============================================================
async function toggleLike(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;

    const liked = yoDiLike(postId);
    const miCodigo = usuarioActual.codigo;

    try {
        await mutarSocial((s) => {
            if (!Array.isArray(s.likes[postId])) s.likes[postId] = [];
            if (liked) {
                s.likes[postId] = s.likes[postId].filter(c => c !== miCodigo);
            } else {
                if (!s.likes[postId].includes(miCodigo)) {
                    s.likes[postId].push(miCodigo);
                }
            }
            return s;
        });

        // Refrescar UI sin recargar todo
        if (postViendoId === postId) {
            actualizarAccionesVerPost();
        }
        // Refrescar el feed (por si el contador cambió)
        renderFeed();
    } catch (e) {
        toast('No se pudo guardar el like', 'error');
    }
}

// ============================================================
//  COMENTAR
// ============================================================
async function enviarComentario() {
    if (!postViendoId) return;
    const input = document.getElementById('vgVerInputComentario');
    const texto = (input.value || '').trim();
    if (!texto) return;

    const post = posts.find(p => p.id === postViendoId);
    if (!post) return;

    const miCodigo = usuarioActual.codigo;
    const miNombre = usuarioActual.nombre || miCodigo;
    const comentariosPost = social.comentarios[postViendoId] || {};
    const esNuevo = !comentariosPost[miCodigo];

    try {
        await mutarSocial((s) => {
            if (!s.comentarios[postViendoId]) s.comentarios[postViendoId] = {};
            s.comentarios[postViendoId][miCodigo] = {
                texto: texto.slice(0, MAX_COMENTARIO),
                creado: new Date().toISOString()
            };
            return s;
        });

        input.value = '';
        document.getElementById('vgVerBtnEnviar').disabled = true;
        renderComentariosVerPost();
        actualizarAccionesVerPost();
        configurarInputComentario();
        renderFeed();

        // Notificación al autor (solo si es nuevo comentario y no es mi post)
        if (esNuevo && post.autor !== miCodigo) {
            const api = API();
            if (api && typeof api.enviarNotificacion === 'function') {
                const preview = texto.length > 40 ? texto.slice(0, 40) + '…' : texto;
                api.enviarNotificacion(
                    'vicsgram',
                    `${miNombre} comentó tu publicación: "${preview}"`,
                    post.autor
                ).catch(() => {});
            }
        }

        toast(esNuevo ? 'Comentario publicado' : 'Comentario actualizado', 'success');
    } catch (e) {
        toast('No se pudo publicar el comentario', 'error');
    }
}

// ============================================================
//  EDITOR (CREAR / EDITAR POST)
// ============================================================
function abrirEditor(postId = null) {
    editandoPostId = postId;
    imagenPendienteId = null;

    const titulo = document.getElementById('vgEditorTitulo');
    const textoBtn = document.getElementById('vgEditorGuardarTexto');
    const descripcion = document.getElementById('vgEditorDescripcion');
    const contador = document.getElementById('vgEditorContador');
    const mensaje = document.getElementById('vgEditorMensaje');
    const imgWrap = document.getElementById('vgEditorImagenWrap');
    const imgPreview = document.getElementById('vgEditorImagenPreview');
    const btnCambiar = document.getElementById('vgBtnCambiarImagen');

    mensaje.textContent = '';
    mensaje.className = 'vg-modal-mensaje';

    if (postId) {
        const post = posts.find(p => p.id === postId);
        if (!post) return;
        titulo.textContent = 'Editar post';
        textoBtn.textContent = 'Guardar cambios';
        descripcion.value = post.descripcion || '';
        imagenPendienteId = post.imagenId || null;
    } else {
        titulo.textContent = 'Nuevo post';
        textoBtn.textContent = 'Publicar';
        descripcion.value = '';
    }

    contador.textContent = `${descripcion.value.length} / ${MAX_DESCRIPCION}`;

    // Reset imagen
    imgPreview.removeAttribute('src');
    imgWrap.classList.remove('con-imagen');
    btnCambiar.hidden = true;

    if (imagenPendienteId) {
        // Cargar preview
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(imagenPendienteId, usuarioActual.codigo).then(url => {
                if (!url) return;
                imgPreview.src = url;
                imgPreview.onload = () => URL.revokeObjectURL(url);
                imgWrap.classList.add('con-imagen');
                btnCambiar.hidden = false;
            }).catch(() => {});
        }
    }

    document.getElementById('vgModalEditor').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => descripcion.focus(), 100);
}

function cerrarEditor() {
    document.getElementById('vgModalEditor').hidden = true;
    editandoPostId = null;
    imagenPendienteId = null;
}

async function elegirImagenEditor() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elegí una foto para tu post'
        });
        if (!id) return;
        imagenPendienteId = id;
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            const imgPreview = document.getElementById('vgEditorImagenPreview');
            imgPreview.src = url;
            imgPreview.onload = () => URL.revokeObjectURL(url);
            document.getElementById('vgEditorImagenWrap').classList.add('con-imagen');
            document.getElementById('vgBtnCambiarImagen').hidden = false;
        }
    } catch (e) {
        console.warn('[VicsGram] Error en picker:', e);
    }
}

async function guardarPost() {
    const descripcion = document.getElementById('vgEditorDescripcion').value.trim();
    const mensaje = document.getElementById('vgEditorMensaje');

    if (!imagenPendienteId) {
        mensaje.textContent = 'Elegí una foto primero.';
        mensaje.className = 'vg-modal-mensaje error';
        return;
    }

    const btn = document.getElementById('vgEditorGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        if (editandoPostId) {
            // Editar post existente
            await mutarPosts((data) => {
                const p = data.posts.find(x => x.id === editandoPostId);
                if (!p) throw new Error('El post ya no existe.');
                if (p.autor !== usuarioActual.codigo) throw new Error('No podés editar este post.');
                p.imagenId = imagenPendienteId;
                p.descripcion = descripcion;
                p.editado = new Date().toISOString();
                return data;
            });
            toast('Post actualizado', 'success');
        } else {
            // Crear post nuevo
            const nuevo = {
                id: generarId('post'),
                autor: usuarioActual.codigo,
                autorNombre: usuarioActual.nombre || usuarioActual.codigo,
                imagenId: imagenPendienteId,
                descripcion: descripcion,
                creado: new Date().toISOString(),
                editado: null
            };
            await mutarPosts((data) => {
                data.posts.push(nuevo);
                return data;
            });
            toast('Post publicado', 'success');
        }

        cerrarEditor();
        renderFeed();

        // Si estoy viendo un post, refrescar
        if (postViendoId) {
            const post = posts.find(p => p.id === postViendoId);
            if (post) {
                abrirVerPost(postViendoId);
            } else {
                cerrarVerPost();
            }
        }
    } catch (e) {
        mensaje.textContent = e.message || 'No se pudo guardar.';
        mensaje.className = 'vg-modal-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  BORRAR POST
// ============================================================
async function borrarPost(postId) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.autor !== usuarioActual.codigo) {
        toast('Solo podés borrar tus propios posts', 'error');
        return;
    }
    if (!confirm('¿Eliminar esta publicación? También se borrarán sus likes y comentarios.')) return;

    try {
        // 1. Quitar el post del JSON principal
        await mutarPosts((data) => {
            data.posts = data.posts.filter(p => p.id !== postId);
            return data;
        });

        // 2. Limpiar likes y comentarios
        await mutarSocial((s) => {
            if (s.likes[postId]) delete s.likes[postId];
            if (s.comentarios[postId]) delete s.comentarios[postId];
            return s;
        });

        if (postViendoId === postId) cerrarVerPost();

        renderFeed();
        toast('Publicación eliminada', 'success');
    } catch (e) {
        toast(e.message || 'No se pudo eliminar', 'error');
    }
}

function cerrarVerPost() {
    document.getElementById('vgModalVer').hidden = true;
    postViendoId = null;
}

// ============================================================
//  PERFIL
// ============================================================
async function abrirPerfil(codigo) {
    codigoPerfilViendo = codigo;

    // Datos del usuario
    const usuario = usuariosPorCodigo[codigo] || {};
    const nombre = usuario.nombre || codigo;
    const foto = usuario.foto || null;

    // Avatar
    const avatarWrap = document.getElementById('vgPerfilAvatar');
    avatarWrap.innerHTML = foto
        ? `<img src="${foto}" alt="">`
        : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`;

    document.getElementById('vgPerfilNombre').textContent = nombre;
    document.getElementById('vgPerfilCodigo').textContent = '@' + codigo;

    // Posts del usuario
    const postsUsuario = posts
        .filter(p => p.autor === codigo)
        .sort((a, b) => new Date(b.creado) - new Date(a.creado));

    const stats = document.getElementById('vgPerfilStats');
    stats.textContent = postsUsuario.length === 0
        ? 'Sin publicaciones'
        : postsUsuario.length === 1
            ? '1 publicación'
            : `${postsUsuario.length} publicaciones`;

    // Grid
    limpiarUrlsPerfil();
    const grid = document.getElementById('vgPerfilGrid');
    const vacio = document.getElementById('vgPerfilVacio');
    grid.innerHTML = '';

    if (postsUsuario.length === 0) {
        grid.hidden = true;
        vacio.hidden = false;
    } else {
        grid.hidden = false;
        vacio.hidden = true;

        postsUsuario.forEach(post => {
            const item = document.createElement('div');
            item.className = 'vg-perfil-grid-item';
            const skeleton = document.createElement('div');
            skeleton.className = 'vg-perfil-grid-item-skeleton';
            item.appendChild(skeleton);

            if (post.imagenId) {
                const mh = MH();
                if (mh) {
                    // FIX: usar el código del autor (que es el perfil que estamos viendo)
                    mh.galeria.leerImagenURL(post.imagenId, codigo)
                        .then(url => {
                            if (!url) return;
                            urlsPerfil.push(url);
                            const img = document.createElement('img');
                            img.src = url;
                            img.alt = '';
                            img.loading = 'lazy';
                            img.onload = () => skeleton.classList.add('oculto');
                            item.insertBefore(img, skeleton);
                        })
                        .catch(() => skeleton.classList.add('oculto'));
                }
            } else {
                skeleton.classList.add('oculto');
            }

            item.addEventListener('click', () => {
                cerrarPerfil();
                abrirVerPost(post.id);
            });
            grid.appendChild(item);
        });
    }

    document.getElementById('vgModalPerfil').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarPerfil() {
    document.getElementById('vgModalPerfil').hidden = true;
    codigoPerfilViendo = null;
    limpiarUrlsPerfil();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('VicsGram necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar VicsGram.');
        return;
    }

    const badge = document.getElementById('vgUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    // Cargar datos
    await cargarUsuarios();
    await cargarPosts(true);
    await cargarSocial(true);

    // Render
    renderFeed();

    // ---- EVENTOS ----

    // Tabs
    document.querySelectorAll('.vg-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.vg-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            postsVisibles = POSTS_POR_PAGINA;
            renderFeed();
        });
    });

    // Botón nuevo
    document.getElementById('vgBtnNuevo')?.addEventListener('click', () => abrirEditor());
    document.getElementById('vgEmptyBtnNuevo')?.addEventListener('click', () => abrirEditor());

    // Botón cargar más
    document.getElementById('vgCargarMas')?.addEventListener('click', () => {
        postsVisibles += POSTS_POR_PAGINA;
        renderFeed();
    });

    // Editor
    document.getElementById('vgEditorCerrar')?.addEventListener('click', cerrarEditor);
    document.getElementById('vgEditorCancelar')?.addEventListener('click', cerrarEditor);
    document.getElementById('vgEditorGuardar')?.addEventListener('click', guardarPost);
    document.getElementById('vgBtnElegirImagen')?.addEventListener('click', elegirImagenEditor);
    document.getElementById('vgBtnCambiarImagen')?.addEventListener('click', elegirImagenEditor);

    document.getElementById('vgEditorDescripcion')?.addEventListener('input', (e) => {
        const len = e.target.value.length;
        document.getElementById('vgEditorContador').textContent = `${len} / ${MAX_DESCRIPCION}`;
    });

    // Ver post
    document.getElementById('vgVerCerrar')?.addEventListener('click', cerrarVerPost);
    document.getElementById('vgVerBtnEditar')?.addEventListener('click', () => {
        if (postViendoId) abrirEditor(postViendoId);
    });
    document.getElementById('vgVerBtnBorrar')?.addEventListener('click', () => {
        if (postViendoId) borrarPost(postViendoId);
    });
    document.getElementById('vgVerBtnLike')?.addEventListener('click', () => {
        if (postViendoId) toggleLike(postViendoId);
    });
    document.getElementById('vgVerAutor')?.addEventListener('click', () => {
        const post = posts.find(p => p.id === postViendoId);
        if (post) abrirPerfil(post.autor);
    });

    const inputCom = document.getElementById('vgVerInputComentario');
    const btnEnviar = document.getElementById('vgVerBtnEnviar');
    inputCom?.addEventListener('input', () => {
        btnEnviar.disabled = !inputCom.value.trim();
    });
    inputCom?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            enviarComentario();
        }
    });
    btnEnviar?.addEventListener('click', enviarComentario);

    // Perfil
    document.getElementById('vgPerfilCerrar')?.addEventListener('click', cerrarPerfil);

    // Cerrar al click fuera
    ['vgModalEditor', 'vgModalVer', 'vgModalPerfil'].forEach(id => {
        const modal = document.getElementById(id);
        modal?.addEventListener('click', (e) => {
            if (e.target.id === id) {
                if (id === 'vgModalEditor') cerrarEditor();
                if (id === 'vgModalVer') cerrarVerPost();
                if (id === 'vgModalPerfil') cerrarPerfil();
            }
        });
    });

    // Escape
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('vgModalEditor').hidden) { cerrarEditor(); return; }
        if (!document.getElementById('vgModalPerfil').hidden) { cerrarPerfil(); return; }
        if (!document.getElementById('vgModalVer').hidden) { cerrarVerPost(); return; }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    limpiarUrls();
    limpiarUrlsPerfil();
});
