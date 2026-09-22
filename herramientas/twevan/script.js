// ============================================================
//  Twevan — Mini-Twitter de la comunidad
//  ------------------------------------------------------------
//  3 JSONs:
//    app/twevan/twevan.json        → perfiles + posts
//    app/twevan/twevan-social.json → likes + comentarios
//    app/twevan/twevan-plus.json   → TwePlus + cobros (banco)
//
//  Banco de recompensas:
//    - Cálculo ON-DEMAND (0 escrituras al ver el pendiente).
//    - Cobro manual cuando el usuario quiera.
//    - Fórmula por post:
//        likesNuevos ≥ 90% de otros   → 6 monedas
//        likesNuevos ≥ 50%            → 3 monedas
//        likesNuevos > 0              → 1 moneda
//        + 1 moneda por comentario nuevo
//    - Snapshot al activar TwePlus (primera vez o tras expirar)
//      para evitar acumulación gratuita.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_DATA    = 'app/twevan/twevan.json';
const RUTA_SOCIAL  = 'app/twevan/twevan-social.json';
const RUTA_PLUS    = 'app/twevan/twevan-plus.json';
const RUTA_CUENTAS = 'cuenta.json';

const MAX_TEXTO         = 280;
const MAX_COMENTARIO    = 200;
const MAX_RESPUESTA     = 200;
const TWEETS_POR_PAGINA = 10;
const COSTO_TWEPLUS     = 100;
const DIAS_TWEPLUS      = 30;
const MAX_HISTORIAL     = 20;

let usuarioActual = null;
let miPerfil = null;
let cuentaCompleta = null;
let usuariosPorCodigo = {};
let totalMiembros = 0;

let data   = { version: 1, perfiles: {}, posts: [] };
let social = { version: 1, likes: {}, comentarios: {} };
let plus   = { version: 1, tweplus: {}, cobros: {} };

let tabActual = 'inicio';
let tweetsVisibles = TWEETS_POR_PAGINA;
let editandoPostId = null;
let imagenPendienteId = null;
let postViendoId = null;
let urlsActivas = [];
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;
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
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data?.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
function limpiarUrls() {
    urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    urlsActivas = [];
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('tvToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'tv-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  CARGA
// ============================================================
async function cargarCuentas() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivo(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
        totalMiembros = cuentas.length;
        if (usuarioActual) cuentaCompleta = usuariosPorCodigo[usuarioActual.codigo] || null;
    } catch (e) {}
}
async function cargarData(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_DATA) : await bd.leerArchivo(RUTA_DATA);
        data = normalizarData(d);
    } catch (e) { data = normalizarData(null); }
}
async function cargarSocial(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_SOCIAL) : await bd.leerArchivo(RUTA_SOCIAL);
        social = normalizarSocial(d);
    } catch (e) { social = normalizarSocial(null); }
}
async function cargarPlus(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_PLUS) : await bd.leerArchivo(RUTA_PLUS);
        plus = normalizarPlus(d);
    } catch (e) { plus = normalizarPlus(null); }
}

function normalizarData(d) {
    if (!d || typeof d !== 'object') d = {};
    if (!d.perfiles || typeof d.perfiles !== 'object') d.perfiles = {};
    if (!Array.isArray(d.posts)) d.posts = [];
    return { version: 1, perfiles: d.perfiles, posts: d.posts };
}
function normalizarSocial(d) {
    if (!d || typeof d !== 'object') d = {};
    if (!d.likes || typeof d.likes !== 'object') d.likes = {};
    if (!d.comentarios || typeof d.comentarios !== 'object') d.comentarios = {};
    return { version: 1, likes: d.likes, comentarios: d.comentarios };
}
function normalizarPlus(d) {
    if (!d || typeof d !== 'object') d = {};
    if (!d.tweplus || typeof d.tweplus !== 'object') d.tweplus = {};
    if (!d.cobros || typeof d.cobros !== 'object') d.cobros = {};
    return { version: 1, tweplus: d.tweplus, cobros: d.cobros };
}

// ============================================================
//  MUTAR
// ============================================================
async function mutarData(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_DATA, (a) => {
        a = normalizarData(a); a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    data = normalizarData(r);
}
async function mutarSocial(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_SOCIAL, (a) => {
        a = normalizarSocial(a); a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    social = normalizarSocial(r);
}
async function mutarPlus(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_PLUS, (a) => {
        a = normalizarPlus(a); a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    plus = normalizarPlus(r);
}

// ============================================================
//  PERFIL
// ============================================================
function generarUsuario(codigo, nombre) {
    const base = (nombre || 'user').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 10) || 'user';
    return base + codigo.slice(-2).toLowerCase();
}

async function asegurarPerfil() {
    if (!usuarioActual) return null;
    const codigo = usuarioActual.codigo;
    if (data.perfiles[codigo]) { miPerfil = data.perfiles[codigo]; return miPerfil; }

    const nuevo = {
        codigo,
        usuario: generarUsuario(codigo, usuarioActual.nombre),
        nombre: usuarioActual.nombre || codigo,
        bio: '',
        creado: new Date().toISOString()
    };
    await mutarData((d) => {
        if (!d.perfiles[codigo]) d.perfiles[codigo] = nuevo;
        return d;
    });
    miPerfil = data.perfiles[codigo];
    return miPerfil;
}

function tieneTwePlus(codigo) {
    const t = plus.tweplus[codigo];
    if (!t || !t.activo) return false;
    if (t.vence && new Date(t.vence).getTime() < Date.now()) return false;
    return true;
}

// ============================================================
//  RENDER FEED
// ============================================================
function postsFiltrados() {
    let l = data.posts.slice();
    if (tabActual === 'mios') l = l.filter(p => p.autor === usuarioActual.codigo);
    l.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    return l;
}
function contarLikes(id) {
    const a = social.likes[id];
    return Array.isArray(a) ? a.length : 0;
}
function contarComentarios(id) {
    const o = social.comentarios[id];
    return o ? Object.keys(o).length : 0;
}
function yoDiLike(id) {
    const a = social.likes[id];
    return Array.isArray(a) && a.includes(usuarioActual.codigo);
}

function renderFeed() {
    const feed = document.getElementById('tvFeed');
    const empty = document.getElementById('tvEmpty');
    const btnMas = document.getElementById('tvCargarMas');
    const emptyTitulo = document.getElementById('tvEmptyTitulo');
    const emptyDesc = document.getElementById('tvEmptyDesc');
    const btnEmpty = document.getElementById('tvEmptyBtnNuevo');
    const countMios = document.getElementById('tvCountMios');
    if (!feed) return;

    limpiarUrls();
    feed.innerHTML = '';

    const misTweets = data.posts.filter(p => p.autor === usuarioActual.codigo).length;
    if (countMios) countMios.textContent = misTweets;

    const lista = postsFiltrados();

    if (lista.length === 0) {
        empty.hidden = false;
        btnMas.hidden = true;
        emptyTitulo.textContent = tabActual === 'mios' ? 'No tenés tweets' : 'Aún no hay tweets';
        emptyDesc.textContent = tabActual === 'mios' ? 'Cuando publiques algo, aparecerá acá.' : 'Sé el primero en decir algo.';
        btnEmpty.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    const visibles = lista.slice(0, tweetsVisibles);
    visibles.forEach(p => feed.appendChild(crearTweetCard(p)));
    btnMas.hidden = lista.length <= tweetsVisibles;
    if (window.lucide) window.lucide.createIcons();
}

function crearTweetCard(post) {
    const wrap = document.createElement('div');
    wrap.className = 'tv-tweet';
    wrap.dataset.id = post.id;

    const esMio = post.autor === usuarioActual.codigo;
    const usuario = usuariosPorCodigo[post.autor] || {};
    const foto = usuario.foto || null;
    const perfil = data.perfiles[post.autor] || {};
    const nombre = post.autorNombre || perfil.nombre || usuario.nombre || post.autor;
    const handle = '@' + (perfil.usuario || post.autor.toLowerCase());
    const verificado = tieneTwePlus(post.autor);

    const header = document.createElement('div');
    header.className = 'tv-tweet-header';
    const autorBtn = document.createElement('div');
    autorBtn.className = 'tv-tweet-autor';
    autorBtn.innerHTML = `
        <div class="tv-avatar">
            ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
        </div>
        <div class="tv-tweet-autor-info">
            <div class="tv-tweet-autor-nombre">
                ${escapar(nombre)}
                ${verificado ? '<i data-lucide="badge-check" class="tv-verif"></i>' : ''}
                <span class="tv-tweet-handle">${escapar(handle)}</span>
            </div>
            <div class="tv-tweet-tiempo">${tiempoRelativo(post.creado)}${post.editado ? ' · editado' : ''}</div>
        </div>`;
    header.appendChild(autorBtn);

    if (esMio) {
        const menu = document.createElement('div');
        menu.className = 'tv-tweet-menu';
        menu.innerHTML = `
            <button class="tv-icon-btn" title="Editar" data-accion="editar"><i data-lucide="pencil"></i></button>
            <button class="tv-icon-btn tv-icon-btn-danger" title="Eliminar" data-accion="borrar"><i data-lucide="trash-2"></i></button>`;
        menu.querySelector('[data-accion="editar"]').addEventListener('click', (e) => { e.stopPropagation(); abrirEditor(post.id); });
        menu.querySelector('[data-accion="borrar"]').addEventListener('click', (e) => { e.stopPropagation(); borrarPost(post.id); });
        header.appendChild(menu);
    }
    wrap.appendChild(header);

    if (post.texto) {
        const t = document.createElement('div');
        t.className = 'tv-tweet-texto';
        t.textContent = post.texto;
        t.addEventListener('click', () => abrirVerPost(post.id));
        wrap.appendChild(t);
    }

    if (post.imagenId) {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'tv-tweet-imagen';
        const sk = document.createElement('div');
        sk.className = 'tv-skeleton';
        imgWrap.appendChild(sk);
        imgWrap.addEventListener('click', () => abrirVerPost(post.id));
        wrap.appendChild(imgWrap);

        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(post.imagenId).then(url => {
                if (!url) return;
                urlsActivas.push(url);
                const img = document.createElement('img');
                img.src = url; img.alt = ''; img.loading = 'lazy';
                img.onload = () => sk.remove();
                imgWrap.insertBefore(img, sk);
            }).catch(() => sk.remove());
        }
    }

    const footer = document.createElement('div');
    footer.className = 'tv-tweet-footer';

    const likes = contarLikes(post.id);
    const coms = contarComentarios(post.id);
    const liked = yoDiLike(post.id);

    const btnLike = document.createElement('button');
    btnLike.className = 'tv-btn-like' + (liked ? ' liked' : '');
    btnLike.innerHTML = `<i data-lucide="heart"></i><span>${likes > 0 ? likes : ''}</span>`;
    btnLike.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(post.id); });
    footer.appendChild(btnLike);

    const btnCom = document.createElement('button');
    btnCom.className = 'tv-btn-comentarios';
    btnCom.innerHTML = `<i data-lucide="message-circle"></i><span>${coms > 0 ? coms : ''}</span>`;
    btnCom.addEventListener('click', (e) => { e.stopPropagation(); abrirVerPost(post.id); });
    footer.appendChild(btnCom);

    wrap.appendChild(footer);
    return wrap;
}

// ============================================================
//  LIKE
// ============================================================
async function toggleLike(postId) {
    if (!data.posts.find(p => p.id === postId)) return;
    const liked = yoDiLike(postId);
    const yo = usuarioActual.codigo;
    try {
        await mutarSocial((s) => {
            if (!Array.isArray(s.likes[postId])) s.likes[postId] = [];
            if (liked) s.likes[postId] = s.likes[postId].filter(c => c !== yo);
            else if (!s.likes[postId].includes(yo)) s.likes[postId].push(yo);
            return s;
        });
        renderFeed();
        renderBanco();
        if (postViendoId === postId) renderVerPost();
    } catch (e) { toast('No se pudo guardar el like', 'error'); }
}

// ============================================================
//  COMENTAR / RESPONDER
// ============================================================
async function enviarComentario(postId, texto) {
    const txt = String(texto || '').trim().slice(0, MAX_COMENTARIO);
    if (!txt) return;
    const post = data.posts.find(p => p.id === postId);
    if (!post) return;
    const yo = usuarioActual.codigo;
    const existente = social.comentarios[postId]?.[yo];
    const esNuevo = !existente;

    try {
        await mutarSocial((s) => {
            if (!s.comentarios[postId]) s.comentarios[postId] = {};
            s.comentarios[postId][yo] = {
                texto: txt,
                creado: new Date().toISOString(),
                respuesta: s.comentarios[postId][yo]?.respuesta || null
            };
            return s;
        });
        if (esNuevo && post.autor !== yo) {
            API()?.enviarNotificacion?.('twevan', `${usuarioActual.nombre} comentó tu tweet`, post.autor).catch(() => {});
        }
        renderFeed(); renderBanco();
        if (postViendoId === postId) renderVerPost();
        toast(esNuevo ? 'Comentario publicado' : 'Comentario actualizado', 'success');
    } catch (e) { toast('No se pudo publicar', 'error'); }
}

async function enviarRespuesta(postId, comentarioCodigo, texto) {
    const txt = String(texto || '').trim().slice(0, MAX_RESPUESTA);
    if (!txt) return;
    const c = social.comentarios[postId]?.[comentarioCodigo];
    if (!c) return;
    if (c.respuesta) { toast('Este comentario ya tiene una respuesta', 'error'); return; }

    const yo = usuarioActual.codigo;
    const post = data.posts.find(p => p.id === postId);
    try {
        await mutarSocial((s) => {
            const cc = s.comentarios[postId]?.[comentarioCodigo];
            if (!cc || cc.respuesta) return s;
            cc.respuesta = { autor: yo, texto: txt, creado: new Date().toISOString() };
            return s;
        });
        if (comentarioCodigo !== yo) {
            API()?.enviarNotificacion?.('twevan', `${usuarioActual.nombre} respondió tu comentario`, comentarioCodigo).catch(() => {});
        }
        if (post && post.autor !== yo && post.autor !== comentarioCodigo) {
            API()?.enviarNotificacion?.('twevan', `${usuarioActual.nombre} respondió un comentario en tu tweet`, post.autor).catch(() => {});
        }
        renderFeed(); renderBanco();
        if (postViendoId === postId) renderVerPost();
        toast('Respuesta publicada', 'success');
    } catch (e) { toast('No se pudo publicar', 'error'); }
}

// ============================================================
//  MODAL VER
// ============================================================
function abrirVerPost(postId) {
    postViendoId = postId;
    renderVerPost();
    document.getElementById('tvModalVer').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}
function cerrarVerPost() {
    document.getElementById('tvModalVer').hidden = true;
    postViendoId = null;
}

function renderVerPost() {
    const cont = document.getElementById('tvVerBody');
    if (!cont || !postViendoId) return;
    const post = data.posts.find(p => p.id === postViendoId);
    if (!post) { cerrarVerPost(); return; }

    const usuario = usuariosPorCodigo[post.autor] || {};
    const perfil = data.perfiles[post.autor] || {};
    const foto = usuario.foto || null;
    const nombre = post.autorNombre || perfil.nombre || usuario.nombre || post.autor;
    const handle = '@' + (perfil.usuario || post.autor.toLowerCase());
    const verif = tieneTwePlus(post.autor);
    const likes = contarLikes(postId);
    const liked = yoDiLike(postId);
    const comPost = social.comentarios[postId] || {};
    const comLista = Object.entries(comPost).map(([c, d]) => ({ codigo: c, ...d }))
        .sort((a, b) => new Date(a.creado) - new Date(b.creado));
    const miComentario = comPost[usuarioActual.codigo];
    const esMio = post.autor === usuarioActual.codigo;

    cont.innerHTML = `
        <div class="tv-ver-tweet">
            <div class="tv-ver-autor">
                <div class="tv-avatar">
                    ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
                </div>
                <div class="tv-ver-autor-info">
                    <div class="tv-ver-autor-nombre">
                        ${escapar(nombre)}
                        ${verif ? '<i data-lucide="badge-check" class="tv-verif"></i>' : ''}
                    </div>
                    <div class="tv-ver-autor-handle">${escapar(handle)}</div>
                </div>
            </div>
            <div class="tv-ver-texto">${escapar(post.texto || '')}</div>
            <div class="tv-ver-imagen" id="tvVerImagen"></div>
            <div class="tv-ver-meta">${tiempoRelativo(post.creado)}${post.editado ? ' · editado' : ''}</div>
            <div class="tv-ver-acciones">
                <button class="tv-btn-like ${liked ? 'liked' : ''}" id="tvVerBtnLike">
                    <i data-lucide="heart"></i><span>${likes}</span>
                </button>
                <span class="tv-ver-comentarios-meta">
                    <i data-lucide="message-circle"></i>
                    <span>${comLista.length} ${comLista.length === 1 ? 'comentario' : 'comentarios'}</span>
                </span>
                ${esMio ? `
                    <div class="tv-ver-acciones-der">
                        <button class="tv-icon-btn" id="tvVerBtnEditar" title="Editar"><i data-lucide="pencil"></i></button>
                        <button class="tv-icon-btn tv-icon-btn-danger" id="tvVerBtnBorrar" title="Eliminar"><i data-lucide="trash-2"></i></button>
                    </div>` : ''}
            </div>
        </div>
        <div class="tv-ver-comentarios">
            ${comLista.length === 0 ? `
                <div class="tv-comentarios-vacio">
                    <i data-lucide="message-circle"></i>
                    <p>Sé el primero en comentar</p>
                </div>` : comLista.map(c => {
                    const u = usuariosPorCodigo[c.codigo] || {};
                    const p = data.perfiles[c.codigo] || {};
                    const n = p.nombre || u.nombre || c.codigo;
                    const f = u.foto || null;
                    const vf = tieneTwePlus(c.codigo);
                    const propio = c.codigo === usuarioActual.codigo;
                    let respHTML = '';
                    if (c.respuesta) {
                        const ur = usuariosPorCodigo[c.respuesta.autor] || {};
                        const pr = data.perfiles[c.respuesta.autor] || {};
                        const nr = pr.nombre || ur.nombre || c.respuesta.autor;
                        const fr = ur.foto || null;
                        const vfr = tieneTwePlus(c.respuesta.autor);
                        respHTML = `
                            <div class="tv-respuesta">
                                <div class="tv-avatar tv-avatar-sm">
                                    ${fr ? `<img src="${fr}" alt="">` : `<span>${escapar((nr || '?').charAt(0).toUpperCase())}</span>`}
                                </div>
                                <div class="tv-respuesta-cuerpo">
                                    <div class="tv-comentario-autor">
                                        ${escapar(nr)}
                                        ${vfr ? '<i data-lucide="badge-check" class="tv-verif"></i>' : ''}
                                    </div>
                                    <div class="tv-comentario-texto">${escapar(c.respuesta.texto)}</div>
                                    <div class="tv-comentario-tiempo">${tiempoRelativo(c.respuesta.creado)}</div>
                                </div>
                            </div>`;
                    } else {
                        respHTML = `
                            <button class="tv-btn-responder" data-comentario="${escapar(c.codigo)}">
                                <i data-lucide="corner-down-right"></i> Responder
                            </button>`;
                    }
                    return `
                        <div class="tv-comentario ${propio ? 'propio' : ''}">
                            <div class="tv-avatar tv-avatar-sm">
                                ${f ? `<img src="${f}" alt="">` : `<span>${escapar((n || '?').charAt(0).toUpperCase())}</span>`}
                            </div>
                            <div class="tv-comentario-cuerpo">
                                <div class="tv-comentario-autor">
                                    ${escapar(n)}${propio ? ' (vos)' : ''}
                                    ${vf ? '<i data-lucide="badge-check" class="tv-verif"></i>' : ''}
                                </div>
                                <div class="tv-comentario-texto">${escapar(c.texto)}</div>
                                <div class="tv-comentario-tiempo">${tiempoRelativo(c.creado)}</div>
                                ${respHTML}
                            </div>
                        </div>`;
                }).join('')}
        </div>
        <div class="tv-ver-input-wrap">
            <input type="text" id="tvVerInputComentario"
                   maxlength="${MAX_COMENTARIO}"
                   placeholder="${miComentario ? 'Actualizá tu comentario...' : 'Escribí un comentario...'}"
                   value="${escapar(miComentario?.texto || '')}">
            <button class="tv-btn-enviar" id="tvVerBtnEnviar"><i data-lucide="send"></i></button>
        </div>
        ${miComentario ? `<div class="tv-ver-input-aviso">Ya comentaste. Podés actualizar tu comentario.</div>` : ''}
    `;

    if (post.imagenId) {
        MH()?.galeria.leerImagenURL(post.imagenId).then(url => {
            if (!url) return;
            const el = document.getElementById('tvVerImagen');
            if (el) {
                el.innerHTML = `<img src="${url}" alt="">`;
                el.querySelector('img').onload = () => URL.revokeObjectURL(url);
            }
        });
    } else {
        document.getElementById('tvVerImagen')?.remove();
    }

    if (window.lucide) window.lucide.createIcons();

    document.getElementById('tvVerBtnLike')?.addEventListener('click', () => toggleLike(postId));
    document.getElementById('tvVerBtnEditar')?.addEventListener('click', () => { cerrarVerPost(); abrirEditor(postId); });
    document.getElementById('tvVerBtnBorrar')?.addEventListener('click', () => borrarPost(postId));

    const input = document.getElementById('tvVerInputComentario');
    const btn = document.getElementById('tvVerBtnEnviar');
    const actualizar = () => { if (btn) btn.disabled = !input.value.trim(); };
    input?.addEventListener('input', actualizar);
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviarComentario(postId, input.value); } });
    btn?.addEventListener('click', () => enviarComentario(postId, input.value));
    actualizar();

    cont.querySelectorAll('.tv-btn-responder').forEach(b => {
        b.addEventListener('click', () => abrirInputRespuesta(postId, b.dataset.comentario, b));
    });
}

function abrirInputRespuesta(postId, comentarioCodigo, btn) {
    if (btn.dataset.activo === '1') return;
    btn.dataset.activo = '1';
    const wrap = document.createElement('div');
    wrap.className = 'tv-input-respuesta';
    wrap.innerHTML = `
        <input type="text" maxlength="${MAX_RESPUESTA}" placeholder="Escribí una respuesta...">
        <button class="tv-btn-enviar tv-btn-enviar-sm"><i data-lucide="send"></i></button>`;
    btn.replaceWith(wrap);
    const input = wrap.querySelector('input');
    const btnEnviar = wrap.querySelector('button');
    input.focus();
    const enviar = async () => {
        const txt = input.value.trim();
        if (!txt) return;
        await enviarRespuesta(postId, comentarioCodigo, txt);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
    btnEnviar.addEventListener('click', enviar);
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  EDITOR
// ============================================================
function abrirEditor(postId = null) {
    editandoPostId = postId;
    imagenPendienteId = null;
    const titulo = document.getElementById('tvEditorTitulo');
    const ta = document.getElementById('tvEditorTexto');
    const wrap = document.getElementById('tvEditorImagenWrap');
    const prev = document.getElementById('tvEditorImagenPreview');
    const msj = document.getElementById('tvEditorMensaje');
    const txtBtn = document.getElementById('tvEditorGuardarTexto');

    msj.textContent = ''; msj.className = 'tv-modal-mensaje';
    wrap.hidden = true;

    if (postId) {
        const post = data.posts.find(p => p.id === postId);
        if (!post) return;
        titulo.textContent = 'Editar tweet';
        txtBtn.textContent = 'Guardar';
        ta.value = post.texto || '';
        imagenPendienteId = post.imagenId || null;
        if (imagenPendienteId) {
            MH()?.galeria.leerImagenURL(imagenPendienteId).then(url => {
                if (!url) return;
                prev.src = url; prev.onload = () => URL.revokeObjectURL(url);
                wrap.hidden = false;
            });
        }
    } else {
        titulo.textContent = 'Nuevo tweet';
        txtBtn.textContent = 'Publicar';
        ta.value = '';
    }
    actualizarContador();
    document.getElementById('tvModalEditor').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => ta.focus(), 100);
}
function cerrarEditor() {
    document.getElementById('tvModalEditor').hidden = true;
    editandoPostId = null;
    imagenPendienteId = null;
}
function actualizarContador() {
    const t = document.getElementById('tvEditorTexto');
    const c = document.getElementById('tvEditorContador');
    if (!t || !c) return;
    const n = t.value.length;
    c.textContent = `${n} / ${MAX_TEXTO}`;
    c.classList.toggle('warn', n > MAX_TEXTO * 0.9);
}
async function elegirImagenEditor() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí una imagen' });
        if (!id) return;
        imagenPendienteId = id;
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            const prev = document.getElementById('tvEditorImagenPreview');
            prev.src = url; prev.onload = () => URL.revokeObjectURL(url);
            document.getElementById('tvEditorImagenWrap').hidden = false;
        }
    } catch (e) {}
}
async function guardarTweet() {
    const texto = document.getElementById('tvEditorTexto').value.trim();
    const msj = document.getElementById('tvEditorMensaje');
    const btn = document.getElementById('tvEditorGuardar');

    if (!texto && !imagenPendienteId) {
        msj.textContent = 'Escribí algo o añadí una imagen.';
        msj.className = 'tv-modal-mensaje error'; return;
    }
    if (texto.length > MAX_TEXTO) {
        msj.textContent = `Máximo ${MAX_TEXTO} caracteres.`;
        msj.className = 'tv-modal-mensaje error'; return;
    }
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        if (editandoPostId) {
            await mutarData((d) => {
                const p = d.posts.find(x => x.id === editandoPostId);
                if (!p) throw new Error('El tweet ya no existe.');
                if (p.autor !== usuarioActual.codigo) throw new Error('No podés editar este tweet.');
                p.texto = texto; p.imagenId = imagenPendienteId;
                p.editado = new Date().toISOString();
                return d;
            });
            toast('Tweet actualizado', 'success');
        } else {
            const nuevo = {
                id: generarId('tw'),
                autor: usuarioActual.codigo,
                autorNombre: usuarioActual.nombre || usuarioActual.codigo,
                texto, imagenId: imagenPendienteId,
                creado: new Date().toISOString(), editado: null
            };
            await mutarData((d) => { d.posts.push(nuevo); return d; });
            toast('Tweet publicado', 'success');
        }
        cerrarEditor(); renderFeed(); renderBanco();
        if (postViendoId) {
            if (data.posts.find(x => x.id === postViendoId)) renderVerPost();
            else cerrarVerPost();
        }
    } catch (e) {
        msj.textContent = e.message || 'No se pudo guardar.';
        msj.className = 'tv-modal-mensaje error';
    } finally { btn.disabled = false; }
}

// ============================================================
//  BORRAR
// ============================================================
async function borrarPost(postId) {
    const post = data.posts.find(p => p.id === postId);
    if (!post) return;
    if (post.autor !== usuarioActual.codigo) { toast('Solo podés borrar tus tweets', 'error'); return; }
    if (!confirm('¿Eliminar este tweet? Se borrarán likes, comentarios y pendientes.')) return;
    try {
        await mutarData((d) => { d.posts = d.posts.filter(p => p.id !== postId); return d; });
        await mutarSocial((s) => { delete s.likes[postId]; delete s.comentarios[postId]; return s; });
        await mutarPlus((p) => { delete p.cobros[postId]; return p; });
        if (postViendoId === postId) cerrarVerPost();
        renderFeed(); renderBanco();
        toast('Tweet eliminado', 'success');
    } catch (e) { toast('No se pudo eliminar', 'error'); }
}

// ============================================================
//  BANCO DE RECOMPENSAS
// ============================================================
function calcularPendiente() {
    const res = { total: 0, porPost: {} };
    if (!usuarioActual) return res;
    if (!tieneTwePlus(usuarioActual.codigo)) return res;

    const otros = Math.max(1, totalMiembros - 1);
    const yo = usuarioActual.codigo;

    data.posts.forEach(post => {
        if (post.autor !== yo) return;

        const cobro = plus.cobros[post.id] || {};
        const likesSnap = new Set(cobro.likesSnapshot || []);
        const comSnap = new Set(cobro.comentariosSnapshot || []);

        const likesActuales = new Set(social.likes[post.id] || []);
        likesActuales.delete(yo); // no me cuento a mí mismo

        const comActuales = new Set(Object.keys(social.comentarios[post.id] || {}));

        const likesNuevos = [...likesActuales].filter(c => !likesSnap.has(c));
        const comNuevos = [...comActuales].filter(c => !comSnap.has(c));

        if (likesNuevos.length === 0 && comNuevos.length === 0) return;

        const ratio = Math.min(1, likesNuevos.length / otros);
        let base = 0;
        if (ratio >= 0.9) base = 6;
        else if (ratio >= 0.5) base = 3;
        else if (likesNuevos.length > 0) base = 1;

        const pendiente = base + comNuevos.length;
        if (pendiente > 0) {
            res.porPost[post.id] = {
                pendiente,
                base,
                comNuevos: comNuevos.length,
                likesNuevos: likesNuevos.length,
                ratio
            };
            res.total += pendiente;
        }
    });

    return res;
}

function renderBanco() {
    const el = document.getElementById('tvBanco');
    if (!el || !usuarioActual) return;

    const activo = tieneTwePlus(usuarioActual.codigo);

    if (!activo) {
        el.hidden = false;
        el.className = 'tv-banco tv-banco-lock';
        el.innerHTML = `
            <div class="tv-banco-icono"><i data-lucide="lock"></i></div>
            <div class="tv-banco-info">
                <div class="tv-banco-titulo">Activá TwePlus para generar</div>
                <div class="tv-banco-desc">Con TwePlus acumulás recompensas por la repercusión de tus tweets.</div>
            </div>
            <button class="tv-banco-btn tv-banco-btn-sec" id="tvBancoBtnPlus">Ver TwePlus</button>`;
        if (window.lucide) window.lucide.createIcons();
        document.getElementById('tvBancoBtnPlus')?.addEventListener('click', abrirModalTwePlus);
        return;
    }

    const pend = calcularPendiente();

    if (pend.total <= 0) {
        el.hidden = false;
        el.className = 'tv-banco tv-banco-vacio';
        el.innerHTML = `
            <div class="tv-banco-icono"><i data-lucide="sparkles"></i></div>
            <div class="tv-banco-info">
                <div class="tv-banco-titulo">Sin recompensas pendientes</div>
                <div class="tv-banco-desc">Cuando alguien interactúe con tus tweets, se acumula acá.</div>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const postsGenerando = Object.keys(pend.porPost).length;
    el.hidden = false;
    el.className = 'tv-banco tv-banco-lleno';
    el.innerHTML = `
        <div class="tv-banco-icono"><i data-lucide="coins"></i></div>
        <div class="tv-banco-info">
            <div class="tv-banco-titulo">${pend.total} ${pend.total === 1 ? 'moneda pendiente' : 'monedas pendientes'}</div>
            <div class="tv-banco-desc">${postsGenerando} ${postsGenerando === 1 ? 'tweet generando' : 'tweets generando'}</div>
        </div>
        <button class="tv-banco-btn tv-banco-btn-pri" id="tvBancoBtnCobrar">
            <i data-lucide="hand-coins"></i>
            Cobrar ${pend.total}
        </button>`;
    if (window.lucide) window.lucide.createIcons();
    document.getElementById('tvBancoBtnCobrar')?.addEventListener('click', cobrarBanco);
}

async function cobrarBanco() {
    const pend = calcularPendiente();
    if (pend.total <= 0) { toast('No hay nada para cobrar', 'info'); return; }

    const btn = document.getElementById('tvBancoBtnCobrar');
    if (btn) btn.disabled = true;

    try {
        const api = API();
        if (!api) throw new Error('Sin conexión.');

        // 1) Acreditar monedas
        await api.canjear('twitter', 'twevan', `Banco Twevan (${pend.total} monedas)`, pend.total);

        // 2) Actualizar snapshots + historial
        const yo = usuarioActual.codigo;
        await mutarPlus((p) => {
            data.posts.forEach(post => {
                if (post.autor !== yo) return;

                const likesAct = (social.likes[post.id] || []).filter(c => c !== yo);
                const comAct = Object.keys(social.comentarios[post.id] || {});

                const cobro = p.cobros[post.id] || { historial: [], totalCobrado: 0 };
                const pendPost = pend.porPost[post.id];

                if (pendPost) {
                    cobro.historial = [
                        {
                            fecha: new Date().toISOString(),
                            monedas: pendPost.pendiente,
                            detalle: {
                                base: pendPost.base,
                                comentariosNuevos: pendPost.comNuevos,
                                likesNuevos: pendPost.likesNuevos,
                                ratio: pendPost.ratio
                            }
                        },
                        ...(cobro.historial || [])
                    ].slice(0, MAX_HISTORIAL);
                    cobro.totalCobrado = (cobro.totalCobrado || 0) + pendPost.pendiente;
                }

                // Snapshot siempre al día (post sin pendiente también)
                cobro.likesSnapshot = likesAct;
                cobro.comentariosSnapshot = comAct;
                cobro.ultimoCobro = new Date().toISOString();
                p.cobros[post.id] = cobro;
            });
            return p;
        });

        toast(`+${pend.total} ${pend.total === 1 ? 'moneda' : 'monedas'}`, 'success');
        renderBanco();
        renderFeed();
    } catch (e) {
        toast(e.message || 'No se pudo cobrar', 'error');
        if (btn) btn.disabled = false;
    }
}

/**
 * Snapshot base: marca todos los likes/comentarios actuales como "ya contados"
 * SIN cobrar nada. Se usa al activar TwePlus por primera vez o tras expiración
 * para que el pendiente arranque en 0 y no se pueda acumular retroactivamente.
 */
async function resetSnapshotsBase() {
    const yo = usuarioActual.codigo;
    await mutarPlus((p) => {
        data.posts.forEach(post => {
            if (post.autor !== yo) return;
            const cobro = p.cobros[post.id] || { historial: [], totalCobrado: 0 };
            cobro.likesSnapshot = (social.likes[post.id] || []).filter(c => c !== yo);
            cobro.comentariosSnapshot = Object.keys(social.comentarios[post.id] || {});
            cobro.ultimoCobro = new Date().toISOString();
            p.cobros[post.id] = cobro;
        });
        return p;
    });
}

// ============================================================
//  TWEPLUS
// ============================================================
function abrirModalTwePlus() {
    const activo = tieneTwePlus(usuarioActual.codigo);
    const estado = document.getElementById('tvTwePlusEstado');
    const btn = document.getElementById('tvBtnComprarTwePlus');
    const txt = document.getElementById('tvBtnComprarTexto');
    const msj = document.getElementById('tvTwePlusMensaje');
    msj.textContent = ''; msj.className = 'tv-modal-mensaje';

    if (activo) {
        const vence = new Date(plus.tweplus[usuarioActual.codigo].vence);
        const dias = Math.max(0, Math.ceil((vence - Date.now()) / (1000 * 60 * 60 * 24)));
        estado.innerHTML = `
            <div class="tv-tweplus-activo">
                <i data-lucide="badge-check"></i>
                <div>
                    <strong>Estás verificado</strong>
                    <span>Vence en ${dias} ${dias === 1 ? 'día' : 'días'}</span>
                </div>
            </div>`;
        txt.textContent = 'Renovar (+30 días)';
        btn.disabled = false;
    } else {
        estado.innerHTML = '';
        txt.textContent = 'Comprar (100 monedas)';
        const monedas = API()?.obtenerMonedas?.() ?? 0;
        btn.disabled = monedas < COSTO_TWEPLUS;
        if (monedas < COSTO_TWEPLUS) {
            msj.textContent = `Te faltan ${COSTO_TWEPLUS - monedas} monedas.`;
            msj.className = 'tv-modal-mensaje error';
        }
    }
    document.getElementById('tvModalTwePlus').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}
function cerrarModalTwePlus() {
    document.getElementById('tvModalTwePlus').hidden = true;
}

async function comprarTwePlus() {
    const api = API();
    if (!api) return;
    const btn = document.getElementById('tvBtnComprarTwePlus');
    const msj = document.getElementById('tvTwePlusMensaje');
    if (btn.disabled) return;
    btn.disabled = true;

    const yo = usuarioActual.codigo;
    const estabaActivo = tieneTwePlus(yo);

    try {
        await api.gastoBoleta('badge-check', 'twevan', 'TwePlus (30 días)', COSTO_TWEPLUS);

        const ahora = Date.now();
        const actualVence = plus.tweplus[yo]?.vence ? new Date(plus.tweplus[yo].vence).getTime() : 0;
        const base = actualVence > ahora ? actualVence : ahora;
        const nuevoVence = new Date(base + DIAS_TWEPLUS * 24 * 60 * 60 * 1000).toISOString();

        await mutarPlus((p) => {
            p.tweplus[yo] = { activo: true, vence: nuevoVence };
            return p;
        });

        // Si NO estaba activo antes (primera compra o tras expirar) → snapshot base
        if (!estabaActivo) {
            await resetSnapshotsBase();
        }

        toast('¡TwePlus activado!', 'success');
        cerrarModalTwePlus();
        actualizarHeaderTwePlus();
        renderFeed();
        renderBanco();
    } catch (e) {
        msj.textContent = e.message || 'No se pudo activar TwePlus.';
        msj.className = 'tv-modal-mensaje error';
        btn.disabled = false;
    }
}

function actualizarHeaderTwePlus() {
    const btn = document.getElementById('tvBtnTwePlus');
    if (!btn) return;
    if (tieneTwePlus(usuarioActual.codigo)) btn.classList.add('activo');
    else btn.classList.remove('activo');
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();
    const api = API();
    if (!api) { alert('Twevan necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('tvUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarCuentas();
    await cargarData(true);
    await cargarSocial(true);
    await cargarPlus(true);
    await asegurarPerfil();

    actualizarHeaderTwePlus();
    renderFeed();
    renderBanco();

    document.querySelectorAll('.tv-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tv-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            tweetsVisibles = TWEETS_POR_PAGINA;
            renderFeed();
        });
    });

    const abrirNuevo = () => abrirEditor();
    document.getElementById('tvFabNuevo')?.addEventListener('click', abrirNuevo);
    document.getElementById('tvEmptyBtnNuevo')?.addEventListener('click', abrirNuevo);
    document.getElementById('tvBtnTwePlus')?.addEventListener('click', abrirModalTwePlus);
    document.getElementById('tvCargarMas')?.addEventListener('click', () => {
        tweetsVisibles += TWEETS_POR_PAGINA; renderFeed();
    });

    document.getElementById('tvEditorCerrar')?.addEventListener('click', cerrarEditor);
    document.getElementById('tvEditorCancelar')?.addEventListener('click', cerrarEditor);
    document.getElementById('tvEditorGuardar')?.addEventListener('click', guardarTweet);
    document.getElementById('tvBtnAddImagen')?.addEventListener('click', elegirImagenEditor);
    document.getElementById('tvBtnQuitarImagen')?.addEventListener('click', () => {
        imagenPendienteId = null;
        document.getElementById('tvEditorImagenWrap').hidden = true;
    });
    document.getElementById('tvEditorTexto')?.addEventListener('input', actualizarContador);

    document.getElementById('tvVerCerrar')?.addEventListener('click', cerrarVerPost);

    document.getElementById('tvTwePlusCerrar')?.addEventListener('click', cerrarModalTwePlus);
    document.getElementById('tvTwePlusCancelar')?.addEventListener('click', cerrarModalTwePlus);
    document.getElementById('tvBtnComprarTwePlus')?.addEventListener('click', comprarTwePlus);

    ['tvModalEditor', 'tvModalVer', 'tvModalTwePlus'].forEach(id => {
        const m = document.getElementById(id);
        m?.addEventListener('click', (e) => {
            if (e.target.id === id) {
                if (id === 'tvModalEditor') cerrarEditor();
                if (id === 'tvModalVer') cerrarVerPost();
                if (id === 'tvModalTwePlus') cerrarModalTwePlus();
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('tvModalEditor').hidden) { cerrarEditor(); return; }
        if (!document.getElementById('tvModalTwePlus').hidden) { cerrarModalTwePlus(); return; }
        if (!document.getElementById('tvModalVer').hidden) { cerrarVerPost(); return; }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
window.addEventListener('pagehide', () => limpiarUrls());
