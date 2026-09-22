'use strict';

const APP_ID = 'mypants';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MAX_VIDEOS_USER = 25;
const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;

const RUTA_POSTS = `app/${APP_ID}/${APP_ID}.json`;
const RUTA_SOCIAL = `app/${APP_ID}/${APP_ID}-social.json`;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

let usuarioActual = null;
let videos = [];
let social = { likes: {}, comentarios: {} };
let filePendiente = null;
let urlsActivas = [];
let videoViendoId = null;

// ==========================================
// TEMA
// ==========================================
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
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ==========================================
// HELPERS
// ==========================================
let toastTimeout;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('mpToast');
    el.textContent = texto; el.className = 'mp-toast show ' + tipo;
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

function generarId() { return 'mp_' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function limpiarUrls() { urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} }); urlsActivas = []; }

// ==========================================
// DATOS
// ==========================================
async function cargarDatos() {
    const bd = BD(); if (!bd) return;
    try {
        const dPosts = await bd.leerArchivoFresh(RUTA_POSTS);
        videos = (dPosts?.posts || []).sort((a,b) => new Date(b.creado) - new Date(a.creado));
        
        const dSocial = await bd.leerArchivoFresh(RUTA_SOCIAL);
        social.likes = dSocial?.likes || {};
        social.comentarios = dSocial?.comentarios || {};
    } catch(e) {}
}

// ==========================================
// RENDER FEED & OBSERVER
// ==========================================
const feedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const vid = entry.target;
        if (entry.isIntersecting) {
            vid.play().catch(()=>{});
        } else {
            vid.pause();
            vid.currentTime = 0;
        }
    });
}, { threshold: 0.6 });

async function renderFeed() {
    const feed = document.getElementById('mpFeed');
    const empty = document.getElementById('mpEmpty');
    feed.innerHTML = ''; limpiarUrls();
    
    if (videos.length === 0) {
        empty.hidden = false; feed.hidden = true;
        return;
    }
    empty.hidden = true; feed.hidden = false;

    for (const post of videos) {
        const url = await MH().leerVideoURL(post.videoRuta);
        if(!url) continue;
        urlsActivas.push(url);

        const likes = social.likes[post.id] || [];
        const isLiked = likes.includes(usuarioActual.codigo);
        const comentarios = Object.keys(social.comentarios[post.id] || {}).length;

        const card = document.createElement('div');
        card.className = 'mp-clip';
        card.innerHTML = `
            <video src="${url}" loop playsinline preload="auto" data-id="${post.id}"></video>
            
            <div class="mp-overlay-right">
                <button class="mp-action mp-btn-like ${isLiked ? 'liked' : ''}" data-id="${post.id}">
                    <div class="mp-action-circle"><i data-lucide="heart"></i></div>
                    <span>${likes.length || ''}</span>
                </button>
                <button class="mp-action mp-btn-comentar" data-id="${post.id}">
                    <div class="mp-action-circle"><i data-lucide="message-circle"></i></div>
                    <span>${comentarios || ''}</span>
                </button>
            </div>
            
            <div class="mp-overlay-bottom">
                <div class="mp-clip-autor">@${post.autorNombre || post.autor}</div>
                <div class="mp-clip-desc">${post.descripcion}</div>
            </div>
        `;
        feed.appendChild(card);
        
        const vidEl = card.querySelector('video');
        feedObserver.observe(vidEl);

        // Play/Pause al clickear
        vidEl.addEventListener('click', () => {
            if(vidEl.paused) vidEl.play(); else vidEl.pause();
        });

        // Eventos
        card.querySelector('.mp-btn-like').addEventListener('click', (e) => toggleLike(post.id, e.currentTarget));
        card.querySelector('.mp-btn-comentar').addEventListener('click', () => abrirComentarios(post.id));
    }
    lucide.createIcons();
}

// ==========================================
// SUBIDA DE VIDEO (Control estricto)
// ==========================================
function abrirSubir() {
    const misVideos = videos.filter(v => v.autor === usuarioActual.codigo);
    const form = document.getElementById('mpFormSubir');
    const alerta = document.getElementById('mpAlertaLimite');
    const actions = document.getElementById('mpSubirActions');

    if (misVideos.length >= MAX_VIDEOS_USER) {
        alerta.hidden = false; form.hidden = true; actions.hidden = true;
    } else {
        alerta.hidden = true; form.hidden = false; actions.hidden = false;
        resetSubir();
    }
    document.getElementById('mpModalSubir').hidden = false;
}

function resetSubir() {
    filePendiente = null;
    document.getElementById('mpInputFile').value = '';
    document.getElementById('mpInputDesc').value = '';
    document.getElementById('mpFileDrop').hidden = false;
    document.getElementById('mpPreviewWrap').hidden = true;
    document.getElementById('mpSubirGuardar').disabled = true;
    const vp = document.getElementById('mpVideoPreview');
    vp.pause(); vp.removeAttribute('src');
}

document.getElementById('mpInputFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    
    if(file.size > MAX_BYTES) {
        toast(`El video supera los ${MAX_MB}MB.`, 'error');
        e.target.value = '';
        return;
    }

    filePendiente = file;
    document.getElementById('mpFileDrop').hidden = true;
    document.getElementById('mpPreviewWrap').hidden = false;
    document.getElementById('mpSubirGuardar').disabled = false;
    
    const vp = document.getElementById('mpVideoPreview');
    vp.src = URL.createObjectURL(file);
    vp.play().catch(()=>{});
});

document.getElementById('mpBtnCambiarVideo').addEventListener('click', resetSubir);

document.getElementById('mpSubirGuardar').addEventListener('click', async () => {
    if(!filePendiente) return;
    const btn = document.getElementById('mpSubirGuardar');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Subiendo...';
    lucide.createIcons();

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
            if(!data || !data.posts) data = { posts: [] };
            data.posts.push(nuevo);
            return data;
        });

        toast('¡Pantalón subido con éxito!');
        document.getElementById('mpModalSubir').hidden = true;
        await cargarDatos();
        renderFeed();
    } catch(e) {
        toast('Error al subir', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="upload-cloud"></i> Subir';
        lucide.createIcons();
    }
});

// ==========================================
// SOCIAL (Likes y Comentarios)
// ==========================================
async function toggleLike(postId, btnEl) {
    const miCodigo = usuarioActual.codigo;
    let fueLiked = false;

    await BD().actualizarArchivo(RUTA_SOCIAL, (data) => {
        if(!data.likes) data.likes = {};
        if(!data.likes[postId]) data.likes[postId] = [];
        
        if (data.likes[postId].includes(miCodigo)) {
            data.likes[postId] = data.likes[postId].filter(c => c !== miCodigo);
        } else {
            data.likes[postId].push(miCodigo);
            fueLiked = true;
        }
        return data;
    });
    
    // UI Local
    btnEl.classList.toggle('liked', fueLiked);
    const span = btnEl.querySelector('span');
    const actual = parseInt(span.textContent || '0');
    span.textContent = fueLiked ? actual + 1 : (actual - 1 > 0 ? actual - 1 : '');
}

function abrirComentarios(postId) {
    videoViendoId = postId;
    document.getElementById('mpModalComentarios').hidden = false;
    renderComentarios();
}

function renderComentarios() {
    const lista = document.getElementById('mpComLista');
    lista.innerHTML = '';
    const coms = social.comentarios[videoViendoId] || {};
    
    const arr = Object.entries(coms).sort((a,b) => new Date(a[1].creado) - new Date(b[1].creado));
    if(arr.length === 0) {
        lista.innerHTML = '<div style="text-align:center;color:var(--gray-500);padding:20px;font-weight:700;">Sé el primero en comentar.</div>';
        return;
    }

    arr.forEach(([cod, data]) => {
        const div = document.createElement('div'); div.className = 'mp-com';
        div.innerHTML = `
            <div class="mp-com-avatar">${cod.charAt(0)}</div>
            <div class="mp-com-body">
                <div class="mp-com-autor">@${cod}</div>
                <div class="mp-com-texto">${data.texto}</div>
            </div>
        `;
        lista.appendChild(div);
    });
    lista.scrollTop = lista.scrollHeight;
}

document.getElementById('mpBtnEnviarCom').addEventListener('click', async () => {
    const input = document.getElementById('mpInputComentario');
    const texto = input.value.trim();
    if(!texto || !videoViendoId) return;

    const miCodigo = usuarioActual.codigo;
    const post = videos.find(v => v.id === videoViendoId);

    await BD().actualizarArchivo(RUTA_SOCIAL, (data) => {
        if(!data.comentarios) data.comentarios = {};
        if(!data.comentarios[videoViendoId]) data.comentarios[videoViendoId] = {};
        data.comentarios[videoViendoId][miCodigo] = { texto, creado: new Date().toISOString() };
        return data;
    });

    input.value = '';
    
    // Si no es mío, notifico
    if(post && post.autor !== miCodigo) {
        API().enviarNotificacion(APP_ID, `@${miCodigo} comentó tu pantalón`, post.autor).catch(()=>{});
    }

    await cargarDatos();
    renderComentarios();
    
    // Refrescar counter en UI principal
    const btnCom = document.querySelector(`.mp-btn-comentar[data-id="${videoViendoId}"] span`);
    if(btnCom) {
        const qty = Object.keys(social.comentarios[videoViendoId] || {}).length;
        btnCom.textContent = qty;
    }
});

// ==========================================
// PERFIL (Borrar videos)
// ==========================================
async function abrirPerfil() {
    const misVideos = videos.filter(v => v.autor === usuarioActual.codigo).sort((a,b)=> new Date(b.creado)-new Date(a.creado));
    document.getElementById('mpPerfilConteo').textContent = `${misVideos.length} / ${MAX_VIDEOS_USER} Pantalones usados`;
    
    const grid = document.getElementById('mpPerfilGrid');
    grid.innerHTML = '';

    for (const v of misVideos) {
        const url = await MH().leerVideoURL(v.videoRuta);
        if(!url) continue;

        const el = document.createElement('div');
        el.className = 'mp-mini-vid';
        el.innerHTML = `
            <video src="${url}" muted preload="metadata"></video>
            <button class="mp-mini-trash" title="Borrar"><i data-lucide="trash-2"></i></button>
        `;
        el.querySelector('.mp-mini-trash').addEventListener('click', () => borrarVideo(v.id, v.videoRuta));
        grid.appendChild(el);
    }
    
    document.getElementById('mpModalPerfil').hidden = false;
    lucide.createIcons();
}

async function borrarVideo(id, ruta) {
    if(!confirm('¿Eliminar este clip para siempre?')) return;
    
    try {
        await MH().borrarVideo(ruta); // Borra binario
        await BD().actualizarArchivo(RUTA_POSTS, data => {
            data.posts = data.posts.filter(p => p.id !== id);
            return data;
        });
        await cargarDatos();
        abrirPerfil(); // refresca grid
        renderFeed();  // refresca home
        toast('Pantalón borrado.');
    } catch(e) { toast('Error al borrar', 'error'); }
}

// ==========================================
// INIT & EVENTOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    usuarioActual = API()?.obtenerCuenta();
    if(!usuarioActual) return;

    await cargarDatos();
    await renderFeed();

    // Eventos UI
    document.getElementById('mpBtnNuevo').addEventListener('click', abrirSubir);
    document.getElementById('mpEmptyBtn').addEventListener('click', abrirSubir);
    document.getElementById('mpBtnPerfil').addEventListener('click', abrirPerfil);
    
    // Cerrar Modales
    document.getElementById('mpSubirCerrar').addEventListener('click', () => document.getElementById('mpModalSubir').hidden = true);
    document.getElementById('mpSubirCancelar').addEventListener('click', () => document.getElementById('mpModalSubir').hidden = true);
    document.getElementById('mpComCerrar').addEventListener('click', () => { document.getElementById('mpModalComentarios').hidden = true; videoViendoId = null; });
    document.getElementById('mpPerfilCerrar').addEventListener('click', () => document.getElementById('mpModalPerfil').hidden = true);
});

window.addEventListener('pagehide', limpiarUrls);
