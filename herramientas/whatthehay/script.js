// ============================================================
//  WhatTheHay — Chat interno de la comunidad
//  ------------------------------------------------------------
//  - Chats privados (1 a 1) y grupos.
//  - Cuenta auto-creada con VicWebOs.
//  - Mensajes cortos (máx 120 caracteres).
//  - Notas de voz de hasta 8 segundos.
//  - Emojis del navegador (excepción permitida: es un chat).
//  - Notificación al destinatario.
//
//  Datos:
//    app/whatthehay/whatthehay.json           → índice de chats/grupos
//    app/whatthehay/chats/{chatId}.json       → mensajes del chat
//    app/whatthehay/whatthehay(audio)/*.webm  → notas de voz
//
//  Reglas:
//    ● Privados: cualquiera puede crearlos.
//    ● Grupos: cualquiera puede crearlos. El creador controla si otros
//      pueden agregar miembros, y es el único que puede eliminarlo.
//    ● Cualquiera puede salir de un grupo (o abandonar un privado).
//    ● Mensajes: los puede borrar el emisor, o el admin del grupo.
//      El borrado es "para todos" automático.
//    ● Sin ticks de leído/no leído.
//    ● Orden de la lista: por último mensaje.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'whatthehay';
const RUTA_INDICE = 'app/whatthehay/whatthehay.json';
const RUTA_CHAT_BASE = 'app/whatthehay/chats/';

const CUENTAS_FILE = 'cuenta.json';

const MAX_CARACTERES = 120;
const MAX_MENSAJES_POR_CHAT = 200;
const MAX_DURACION_AUDIO = 8;      // segundos
const POLL_MS_CHAT = 10000;        // 10s
const POLL_MS_INDICE = 15000;      // 15s

const EMOJIS = [
    '😀','😂','😍','😎','🤔','😢','😡','👍',
    '❤️','🔥','🎉','💜','🥳','🤗','😴','🙃'
];

// ---------- ESTADO ----------
let usuarioActual = null;
let cuentaCompleta = null;
let usuariosPorCodigo = {};

let indice = { version: 1, chats: [] };       // índice de chats/grupos
let chatActivoId = null;                       // id del chat abierto
let chatActivoData = null;                     // { mensajes: [...] }
let filtroBusqueda = '';

let pollChatTimer = null;
let pollIndiceTimer = null;

// Audio
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let grabando = false;
let grabandoInicio = 0;
let grabandoTimer = null;
let audioElements = {};                        // { msgId: <audio> }

// Menú contextual
let menuContextoChatId = null;

// Modales
let grupoFotoId = null;                        // imagenId elegida para el grupo nuevo
let grupoInfoFotoId = null;                    // imagenId del grupo que se está editando
let usuariosSeleccionados = new Set();         // para nuevo grupo
let usuariosAgregarSeleccionados = new Set();  // para agregar al grupo existente

// Editor info grupo
let editandoGrupo = null;

let toastTimeout = null;
let urlAudioTemporal = null;

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
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30) return 'ahora';
    if (diff < 60) return `${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `${dias}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
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
        day: '2-digit', month: 'long', year: d.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined
    });
}

function esSoloEmoji(texto) {
    if (!texto) return false;
    // Test rápido: quitar espacios y ver si todos los code points son emoji
    const limpio = texto.replace(/\s/g, '');
    if (limpio.length === 0) return false;
    if (limpio.length > 12) return false;
    // Regex: secuencias de emoji, ZWJ, variation selectors, keycaps, etc.
    const re = /^[\p{Extended_Pictographic}\p{Emoji_Component}\u{FE0F}\u{200D}]+$/u;
    return re.test(limpio);
}

function normalizarIndice(data) {
    if (!data || typeof data !== 'object') {
        return { version: 1, chats: [] };
    }
    if (!Array.isArray(data.chats)) data.chats = [];
    return data;
}

function normalizarChat(data) {
    if (!data || typeof data !== 'object') {
        return { version: 1, mensajes: [] };
    }
    if (!Array.isArray(data.mensajes)) data.mensajes = [];
    return data;
}

function idPrivado(codA, codB) {
    const [a, b] = [codA, codB].sort();
    return `chat_${a}_${b}`;
}

function rutaChat(chatId) {
    return RUTA_CHAT_BASE + chatId + '.json';
}

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('wthToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'wth-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
async function cargarIndice(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = fresh
            ? await bd.leerArchivoFresh(RUTA_INDICE)
            : await bd.leerArchivo(RUTA_INDICE);
        indice = normalizarIndice(data);
    } catch (e) {
        indice = { version: 1, chats: [] };
    }
}

async function mutarIndice(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const resultado = await bd.actualizarArchivo(RUTA_INDICE, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, chats: [] };
        if (!Array.isArray(actual.chats)) actual.chats = [];
        actual = mutador(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    indice = normalizarIndice(resultado);
}

async function cargarChat(chatId, fresh = false) {
    const bd = BD();
    if (!bd) return null;
    try {
        const ruta = rutaChat(chatId);
        const data = fresh
            ? await bd.leerArchivoFresh(ruta)
            : await bd.leerArchivo(ruta);
        return normalizarChat(data);
    } catch (e) {
        return { version: 1, mensajes: [] };
    }
}

async function mutarChat(chatId, mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const ruta = rutaChat(chatId);
    const resultado = await bd.actualizarArchivo(ruta, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, mensajes: [] };
        if (!Array.isArray(actual.mensajes)) actual.mensajes = [];
        actual = mutador(actual);
        // Recortar mensajes viejos
        if (actual.mensajes.length > MAX_MENSAJES_POR_CHAT) {
            actual.mensajes = actual.mensajes.slice(-MAX_MENSAJES_POR_CHAT);
        }
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    return normalizarChat(resultado);
}

// ============================================================
//  CARGA DE USUARIOS
// ============================================================
async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivoFresh(CUENTAS_FILE);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
        if (usuarioActual) {
            cuentaCompleta = usuariosPorCodigo[usuarioActual.codigo] || null;
        }
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
//  LÓGICA DE CHATS
// ============================================================
function misChats() {
    return indice.chats.filter(c => Array.isArray(c.miembros) && c.miembros.includes(usuarioActual.codigo));
}

function chatsFiltrados() {
    let lista = misChats();

    if (filtroBusqueda) {
        const f = filtroBusqueda.toLowerCase();
        lista = lista.filter(c => {
            const nombre = nombreDeChat(c).toLowerCase();
            return nombre.includes(f);
        });
    }

    // Ordenar por último mensaje descendente
    lista.sort((a, b) => {
        const ta = a.ultimoMensaje?.fecha ? new Date(a.ultimoMensaje.fecha).getTime() : new Date(a.creado).getTime();
        const tb = b.ultimoMensaje?.fecha ? new Date(b.ultimoMensaje.fecha).getTime() : new Date(b.creado).getTime();
        return tb - ta;
    });

    return lista;
}

function nombreDeChat(chat) {
    if (chat.tipo === 'grupo') return chat.nombre || 'Grupo';
    // Privado: el nombre del otro
    const otro = chat.miembros.find(c => c !== usuarioActual.codigo);
    return otro ? nombreDe(otro) : 'Chat';
}

function avatarDeChat(chat) {
    if (chat.tipo === 'grupo') {
        return { tipo: 'grupo', imagenId: chat.imagenId || null, inicial: (chat.nombre || '?').charAt(0).toUpperCase() };
    }
    const otro = chat.miembros.find(c => c !== usuarioActual.codigo);
    if (otro) {
        return { tipo: 'usuario', foto: fotoDe(otro), inicial: inicialDe(otro) };
    }
    return { tipo: 'vacio', inicial: '?' };
}

function esAdminDe(chat) {
    if (chat.tipo !== 'grupo') return false;
    return chat.creador === usuarioActual.codigo;
}

// ============================================================
//  CREAR CHAT PRIVADO
// ============================================================
async function abrirChatPrivado(codigoDestino) {
    if (!codigoDestino || codigoDestino === usuarioActual.codigo) return;

    const chatId = idPrivado(usuarioActual.codigo, codigoDestino);
    let chat = indice.chats.find(c => c.id === chatId);

    if (!chat) {
        // Crear nuevo
        const nuevo = {
            id: chatId,
            tipo: 'privado',
            miembros: [usuarioActual.codigo, codigoDestino],
            creado: new Date().toISOString(),
            ultimoMensaje: null
        };
        try {
            await mutarIndice((d) => {
                d.chats.push(nuevo);
                return d;
            });
            // Crear el JSON del chat vacío
            await mutarChat(chatId, (c) => c);
            chat = nuevo;
        } catch (e) {
            toast('No se pudo crear el chat', 'error');
            return;
        }
    }

    cerrarModalPrivado();
    abrirChat(chatId);
}

// ============================================================
//  ABRIR / CERRAR CHAT
// ============================================================
async function abrirChat(chatId) {
    const chat = indice.chats.find(c => c.id === chatId);
    if (!chat) return;
    if (!chat.miembros.includes(usuarioActual.codigo)) {
        toast('No podés abrir este chat', 'error');
        return;
    }

    chatActivoId = chatId;
    chatActivoData = await cargarChat(chatId, true);

    // UI
    document.getElementById('wthEmpty').hidden = true;
    document.getElementById('wthChat').hidden = false;
    document.querySelector('.wth-app').classList.add('chat-abierto');

    // Header
    renderChatHeader();

    // Mensajes
    renderMensajes();

    // Input habilitado
    document.getElementById('wthInput').value = '';
    document.getElementById('wthBtnEnviar').disabled = true;
    document.getElementById('wthEmojis').hidden = true;

    // Marcar activo en la lista
    renderListaChats();

    // Poll del chat
    detenerPollChat();
    iniciarPollChat();

    if (window.lucide) window.lucide.createIcons();

    // Scroll al fondo
    setTimeout(scrollAlFondo, 60);
}

function cerrarChat() {
    chatActivoId = null;
    chatActivoData = null;
    detenerPollChat();
    pararTodosAudios();
    document.getElementById('wthChat').hidden = true;
    document.getElementById('wthEmpty').hidden = false;
    document.querySelector('.wth-app').classList.remove('chat-abierto');
    renderListaChats();
}

function renderChatHeader() {
    const chat = indice.chats.find(c => c.id === chatActivoId);
    if (!chat) return;

    const avatarData = avatarDeChat(chat);
    const avatarEl = document.getElementById('wthChatAvatar');

    if (avatarData.tipo === 'grupo' && avatarData.imagenId) {
        cargarImagenEnAvatar(avatarEl, avatarData.imagenId);
    } else if (avatarData.tipo === 'usuario' && avatarData.foto) {
        avatarEl.innerHTML = `<img src="${avatarData.foto}" alt="">`;
    } else {
        avatarEl.innerHTML = `<span>${escapar(avatarData.inicial || '?')}</span>`;
    }

    document.getElementById('wthChatNombre').textContent = nombreDeChat(chat);

    // Subtítulo
    const subEl = document.getElementById('wthChatSub');
    if (chat.tipo === 'grupo') {
        const n = chat.miembros.length;
        subEl.textContent = `${n} ${n === 1 ? 'miembro' : 'miembros'}`;
    } else {
        const otro = chat.miembros.find(c => c !== usuarioActual.codigo);
        subEl.textContent = otro ? `@${otro}` : '';
    }
}

async function cargarImagenEnAvatar(avatarEl, imagenId) {
    const mh = MH();
    if (!mh) return;
    try {
        const url = await mh.galeria.leerImagenURL(imagenId);
        if (url) {
            avatarEl.innerHTML = `<img src="${url}" alt="">`;
            avatarEl.querySelector('img').onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  RENDER: LISTA DE CHATS
// ============================================================
function renderListaChats() {
    const cont = document.getElementById('wthChats');
    if (!cont) return;
    cont.innerHTML = '';

    const lista = chatsFiltrados();

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="wth-chats-vacio">
                <i data-lucide="messages-square"></i>
                <p>${filtroBusqueda ? `Sin resultados para "${escapar(filtroBusqueda)}"` : 'Aún no tenés chats. Empezá uno nuevo con los botones de arriba.'}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    lista.forEach(chat => {
        const item = crearItemChat(chat);
        cont.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();
}

function crearItemChat(chat) {
    const btn = document.createElement('button');
    btn.className = 'wth-chat-item' + (chat.id === chatActivoId ? ' activo' : '');
    btn.dataset.id = chat.id;

    const avatarData = avatarDeChat(chat);
    const nombre = nombreDeChat(chat);
    const ultimo = chat.ultimoMensaje;

    let preview = 'Sin mensajes';
    let iconoPreview = '';

    if (ultimo) {
        const esMio = ultimo.autor === usuarioActual.codigo;
        const yoStr = esMio ? 'Vos: ' : '';

        if (ultimo.tipo === 'audio') {
            iconoPreview = '<i data-lucide="mic"></i>';
            preview = yoStr + 'Nota de voz';
        } else {
            // Truncar
            let txt = ultimo.texto || '';
            if (txt.length > 30) txt = txt.slice(0, 30) + '…';
            preview = yoStr + txt;
        }
    }

    const tiempo = ultimo ? tiempoRelativo(ultimo.fecha) : '';

    btn.innerHTML = `
        <div class="wth-avatar">
            ${avatarData.tipo === 'usuario' && avatarData.foto
                ? `<img src="${avatarData.foto}" alt="">`
                : avatarData.tipo === 'grupo' && avatarData.imagenId
                    ? `<i data-lucide="image"></i>`
                    : `<span>${escapar(avatarData.inicial || '?')}</span>`}
        </div>
        <div class="wth-chat-item-info">
            <div class="wth-chat-item-top">
                <div class="wth-chat-item-nombre">${escapar(nombre)}</div>
                <div class="wth-chat-item-tiempo">${tiempo}</div>
            </div>
            <div class="wth-chat-item-preview">
                ${iconoPreview}
                <span>${escapar(preview)}</span>
            </div>
        </div>
    `;

    // Cargar imagen de grupo si aplica
    if (avatarData.tipo === 'grupo' && avatarData.imagenId) {
        const avatarEl = btn.querySelector('.wth-avatar');
        cargarImagenEnAvatar(avatarEl, avatarData.imagenId);
    }

    btn.addEventListener('click', () => abrirChat(chat.id));
    return btn;
}

// ============================================================
//  RENDER: MENSAJES
// ============================================================
function renderMensajes() {
    const cont = document.getElementById('wthMensajes');
    if (!cont) return;
    cont.innerHTML = '';
    pararTodosAudios();

    if (!chatActivoData || chatActivoData.mensajes.length === 0) {
        cont.innerHTML = `
            <div class="wth-cargando" style="flex: 1; justify-content: center;">
                <i data-lucide="message-circle" style="width: 32px; height: 32px; color: var(--violet-300, #C4B5FD); stroke-width: 1.5;"></i>
                <span>Empezá la conversación</span>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const chat = indice.chats.find(c => c.id === chatActivoId);
    const esGrupo = chat?.tipo === 'grupo';

    let ultimaFechaClave = '';

    chatActivoData.mensajes.forEach((msg, idx) => {
        // Divisor de fecha
        const fechaClave = claveFecha(msg.fecha);
        if (fechaClave !== ultimaFechaClave) {
            ultimaFechaClave = fechaClave;
            const divisor = document.createElement('div');
            divisor.className = 'wth-fecha-divisor';
            divisor.innerHTML = `<span>${etiquetaFecha(msg.fecha)}</span>`;
            cont.appendChild(divisor);
        }

        cont.appendChild(crearMensajeDOM(msg, esGrupo));
    });

    if (window.lucide) window.lucide.createIcons();
}

function crearMensajeDOM(msg, esGrupo) {
    const esPropio = msg.autor === usuarioActual.codigo;
    const div = document.createElement('div');
    div.className = 'wth-msg ' + (esPropio ? 'propio' : 'ajeno') + (esGrupo ? ' grupo' : '');
    div.dataset.id = msg.id;

    // Avatar (solo ajeno)
    if (!esPropio) {
        const av = document.createElement('div');
        av.className = 'wth-msg-avatar';
        const foto = fotoDe(msg.autor);
        av.innerHTML = foto
            ? `<img src="${foto}" alt="">`
            : `<span>${escapar(inicialDe(msg.autor))}</span>`;
        div.appendChild(av);
    }

    const burbuja = document.createElement('div');
    burbuja.className = 'wth-msg-burbuja';

    // Nombre del autor (solo en grupo, solo ajeno)
    if (esGrupo && !esPropio) {
        const autorEl = document.createElement('div');
        autorEl.className = 'wth-msg-autor';
        autorEl.textContent = nombreDe(msg.autor);
        burbuja.appendChild(autorEl);
    }

    // Contenido
    if (msg.borrado) {
        div.classList.add('wth-msg-borrado');
        const c = document.createElement('div');
        c.className = 'wth-msg-contenido';
        c.textContent = 'Mensaje eliminado';
        burbuja.appendChild(c);
    } else if (msg.tipo === 'audio') {
        burbuja.appendChild(crearBurbujaAudio(msg));
    } else {
        const c = document.createElement('div');
        c.className = 'wth-msg-contenido' + (esSoloEmoji(msg.texto) ? ' solo-emoji' : '');
        c.textContent = msg.texto || '';
        c.addEventListener('click', () => mostrarMenuMensaje(msg, div));
        burbuja.appendChild(c);
    }

    // Hora
    const tiempoEl = document.createElement('div');
    tiempoEl.className = 'wth-msg-tiempo' + (msg.editado ? ' editado' : '');
    tiempoEl.textContent = horaCorta(msg.fecha) + (msg.editado ? ' · editado' : '');
    burbuja.appendChild(tiempoEl);

    div.appendChild(burbuja);

    // Long-press / click derecho para menú
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        mostrarMenuMensaje(msg, div);
    });

    return div;
}

function crearBurbujaAudio(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'wth-msg-audio';

    const btn = document.createElement('button');
    btn.className = 'wth-audio-play';
    btn.innerHTML = '<i data-lucide="play"></i>';

    const info = document.createElement('div');
    info.className = 'wth-audio-info';

    const barra = document.createElement('div');
    barra.className = 'wth-audio-barra';
    const fill = document.createElement('div');
    fill.className = 'wth-audio-barra-fill';
    barra.appendChild(fill);

    const tiempo = document.createElement('div');
    tiempo.className = 'wth-audio-tiempo';
    tiempo.textContent = formatearDuracion(msg.audioDuracion || 0);

    info.appendChild(barra);
    info.appendChild(tiempo);

    wrap.appendChild(btn);
    wrap.appendChild(info);

    btn.addEventListener('click', async () => {
        // Si ya hay un audio de este mensaje, togglear
        if (audioElements[msg.id]) {
            const a = audioElements[msg.id];
            if (a.paused) {
                a.play();
            } else {
                a.pause();
            }
            return;
        }

        // Cargar
        const mh = MH();
        if (!mh || !msg.audioNombre) {
            toast('No se pudo cargar el audio', 'error');
            return;
        }
        try {
            const ruta = mh.rutas.audio(APP_ID, msg.audioNombre);
            const url = await mh.leerAudioURL(ruta);
            if (!url) {
                toast('Audio no disponible', 'error');
                return;
            }

            const a = new Audio(url);
            audioElements[msg.id] = a;

            a.addEventListener('timeupdate', () => {
                if (a.duration > 0) {
                    fill.style.width = ((a.currentTime / a.duration) * 100) + '%';
                    tiempo.textContent = formatearDuracion(a.currentTime);
                }
            });
            a.addEventListener('ended', () => {
                btn.innerHTML = '<i data-lucide="play"></i>';
                if (window.lucide) window.lucide.createIcons();
                fill.style.width = '0%';
                tiempo.textContent = formatearDuracion(msg.audioDuracion || 0);
            });
            a.addEventListener('play', () => {
                btn.innerHTML = '<i data-lucide="pause"></i>';
                if (window.lucide) window.lucide.createIcons();
                pararOtrosAudios(msg.id);
            });
            a.addEventListener('pause', () => {
                btn.innerHTML = '<i data-lucide="play"></i>';
                if (window.lucide) window.lucide.createIcons();
            });

            a.play();
        } catch (e) {
            toast('No se pudo cargar el audio', 'error');
        }
    });

    return wrap;
}

function formatearDuracion(seg) {
    if (!isFinite(seg) || seg < 0) seg = 0;
    return `${seg.toFixed(1)}s`;
}

function pararTodosAudios() {
    Object.values(audioElements).forEach(a => {
        try { a.pause(); } catch (e) {}
    });
    audioElements = {};
}

function pararOtrosAudios(exceptId) {
    Object.entries(audioElements).forEach(([id, a]) => {
        if (id !== exceptId) {
            try { a.pause(); } catch (e) {}
        }
    });
}

function scrollAlFondo() {
    const cont = document.getElementById('wthMensajes');
    if (!cont) return;
    cont.scrollTop = cont.scrollHeight;
}

// ============================================================
//  ENVIAR MENSAJE (texto o emoji)
// ============================================================
async function enviarMensajeTexto() {
    if (!chatActivoId) return;
    const input = document.getElementById('wthInput');
    const texto = (input.value || '').trim();
    if (!texto) return;
    if (texto.length > MAX_CARACTERES) {
        toast(`Máximo ${MAX_CARACTERES} caracteres`, 'error');
        return;
    }

    input.value = '';
    document.getElementById('wthBtnEnviar').disabled = true;

    const msg = {
        id: generarId('msg'),
        autor: usuarioActual.codigo,
        tipo: 'texto',
        texto: texto,
        fecha: new Date().toISOString(),
        borrado: false,
        editado: null
    };

    await _enviarMensaje(msg);
}

async function _enviarMensaje(msg) {
    const chatId = chatActivoId;

    try {
        // 1. Agregar al chat
        await mutarChat(chatId, (c) => {
            c.mensajes.push(msg);
            return c;
        });

        // 2. Actualizar último mensaje en el índice
        await mutarIndice((d) => {
            const chat = d.chats.find(c => c.id === chatId);
            if (chat) {
                chat.ultimoMensaje = {
                    autor: msg.autor,
                    tipo: msg.tipo,
                    texto: msg.tipo === 'texto' ? (msg.texto || '').slice(0, 60) : '',
                    fecha: msg.fecha
                };
            }
            return d;
        });

        // 3. Refrescar en vivo
        chatActivoData = await cargarChat(chatId, true);
        renderMensajes();
        renderListaChats();
        scrollAlFondo();

        // 4. Notificar a los demás miembros
        _notificarMiembros(chatId, msg);
    } catch (e) {
        toast('No se pudo enviar', 'error');
    }
}

function _notificarMiembros(chatId, msg) {
    const chat = indice.chats.find(c => c.id === chatId);
    if (!chat) return;
    const api = API();
    if (!api || typeof api.enviarNotificacion !== 'function') return;

    const miNombre = usuarioActual.nombre || usuarioActual.codigo;
    const esGrupo = chat.tipo === 'grupo';
    const nombreChat = nombreDeChat(chat);

    const preview = msg.tipo === 'audio'
        ? 'te envió una nota de voz'
        : `dijo: "${(msg.texto || '').slice(0, 40)}${(msg.texto || '').length > 40 ? '…' : ''}"`;

    const texto = esGrupo
        ? `${miNombre} en "${nombreChat}" ${preview}`
        : `${miNombre} ${preview}`;

    chat.miembros.forEach(destino => {
        if (destino === usuarioActual.codigo) return;
        api.enviarNotificacion('whatthehay', texto, destino).catch(() => {});
    });
}

// ============================================================
//  BORRAR MENSAJE
// ============================================================
function mostrarMenuMensaje(msg, msgEl) {
    // Solo si no está borrado
    if (msg.borrado) return;

    const chat = indice.chats.find(c => c.id === chatActivoId);
    if (!chat) return;

    const esPropio = msg.autor === usuarioActual.codigo;
    const esAdmin = esAdminDe(chat);
    const puedeBorrar = esPropio || (chat.tipo === 'grupo' && esAdmin);

    if (!puedeBorrar) return;

    // Confirmación simple
    const quien = esPropio ? 'tu mensaje' : 'este mensaje';
    if (!confirm(`¿Eliminar ${quien} para todos?`)) return;

    _borrarMensaje(msg.id);
}

async function _borrarMensaje(msgId) {
    if (!chatActivoId) return;
    try {
        await mutarChat(chatActivoId, (c) => {
            const m = c.mensajes.find(x => x.id === msgId);
            if (m) {
                m.borrado = true;
                m.texto = '';
                m.audioNombre = null;
                m.audioDuracion = 0;
            }
            return c;
        });

        chatActivoData = await cargarChat(chatActivoId, true);
        renderMensajes();

        // Actualizar último mensaje si era el último
        await mutarIndice((d) => {
            const chat = d.chats.find(c => c.id === chatActivoId);
            if (chat && chat.ultimoMensaje) {
                const ult = chatActivoData.mensajes[chatActivoData.mensajes.length - 1];
                if (ult) {
                    chat.ultimoMensaje = {
                        autor: ult.autor,
                        tipo: ult.tipo,
                        texto: ult.borrado ? 'Mensaje eliminado' : (ult.texto || ''),
                        fecha: ult.fecha
                    };
                }
            }
            return d;
        });
        renderListaChats();
    } catch (e) {
        toast('No se pudo borrar', 'error');
    }
}

// ============================================================
//  GRABACIÓN DE AUDIO
// ============================================================
async function iniciarGrabacion() {
    if (grabando) return;
    if (!chatActivoId) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast('Tu navegador no soporta grabación', 'error');
        return;
    }

    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
        toast('No se pudo acceder al micrófono', 'error');
        return;
    }

    // Elegir mimeType soportado
    let mimeType = '';
    if (window.MediaRecorder) {
        const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
        for (const c of candidatos) {
            if (MediaRecorder.isTypeSupported(c)) {
                mimeType = c;
                break;
            }
        }
    }

    try {
        mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    } catch (e) {
        mediaRecorder = new MediaRecorder(audioStream);
    }

    audioChunks = [];

    mediaRecorder.addEventListener('dataavailable', (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
    });

    mediaRecorder.addEventListener('stop', _finalizarGrabacion);

    mediaRecorder.start();

    grabando = true;
    grabandoInicio = Date.now();

    // UI
    const btn = document.getElementById('wthBtnGrabar');
    btn.classList.add('grabando');
    document.getElementById('wthGrabando').hidden = false;
    document.getElementById('wthGrabandoTiempo').textContent = '0.0s';

    // Actualizar tiempo cada 100ms
    grabandoTimer = setInterval(() => {
        const t = (Date.now() - grabandoInicio) / 1000;
        document.getElementById('wthGrabandoTiempo').textContent = t.toFixed(1) + 's';
        if (t >= MAX_DURACION_AUDIO) {
            detenerGrabacion(true);
        }
    }, 100);
}

async function detenerGrabacion(auto = false) {
    if (!grabando || !mediaRecorder) return;

    grabando = false;
    clearInterval(grabandoTimer);
    grabandoTimer = null;

    const btn = document.getElementById('wthBtnGrabar');
    btn.classList.remove('grabando');
    document.getElementById('wthGrabando').hidden = true;

    if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        audioStream = null;
    }

    // Si fue tan corto que no cuenta, avisamos
    const duracion = (Date.now() - grabandoInicio) / 1000;
    if (duracion < 0.6) {
        toast('Grabación muy corta', 'info');
        audioChunks = [];
        mediaRecorder = null;
        return;
    }
}

async function _finalizarGrabacion() {
    if (!audioChunks.length) {
        mediaRecorder = null;
        return;
    }

    const blob = new Blob(audioChunks, { type: audioChunks[0].type || 'audio/webm' });
    const duracion = (Date.now() - grabandoInicio) / 1000;

    audioChunks = [];
    mediaRecorder = null;

    const mh = MH();
    if (!mh) {
        toast('No se pudo guardar el audio', 'error');
        return;
    }

    toast('Subiendo audio...', 'info');

    try {
        // Nombre de archivo con extensión según mimeType
        let ext = 'webm';
        if (blob.type.includes('ogg')) ext = 'ogg';
        else if (blob.type.includes('mp4')) ext = 'm4a';
        else if (blob.type.includes('mpeg')) ext = 'mp3';
        else if (blob.type.includes('wav')) ext = 'wav';

        const res = await mh.publicarAudio(APP_ID, blob, { extension: ext });

        const msg = {
            id: generarId('msg'),
            autor: usuarioActual.codigo,
            tipo: 'audio',
            audioNombre: res.nombre,
            audioDuracion: Math.min(duracion, MAX_DURACION_AUDIO),
            fecha: new Date().toISOString(),
            borrado: false
        };

        await _enviarMensaje(msg);
    } catch (e) {
        console.warn('[WhatTheHay] Error subiendo audio:', e);
        toast('No se pudo enviar el audio', 'error');
    }
}

// ============================================================
//  POLLING
// ============================================================
function iniciarPollChat() {
    detenerPollChat();
    pollChatTimer = setInterval(async () => {
        if (document.hidden || !chatActivoId) return;
        try {
            const nuevo = await cargarChat(chatActivoId, true);
            // Comparar por cantidad para no re-renderizar de más
            const cantActual = chatActivoData?.mensajes?.length || 0;
            const cantNueva = nuevo.mensajes.length;
            if (cantNueva !== cantActual || JSON.stringify(nuevo.mensajes) !== JSON.stringify(chatActivoData.mensajes)) {
                chatActivoData = nuevo;
                renderMensajes();
                scrollAlFondo();
            }
        } catch (e) { /* silencioso */ }
    }, POLL_MS_CHAT);
}

function detenerPollChat() {
    if (pollChatTimer) {
        clearInterval(pollChatTimer);
        pollChatTimer = null;
    }
}

function iniciarPollIndice() {
    detenerPollIndice();
    pollIndiceTimer = setInterval(async () => {
        if (document.hidden) return;
        try {
            const antes = JSON.stringify(indice.chats.map(c => ({ id: c.id, ult: c.ultimoMensaje })));
            await cargarIndice(true);
            const despues = JSON.stringify(indice.chats.map(c => ({ id: c.id, ult: c.ultimoMensaje })));
            if (antes !== despues) {
                renderListaChats();
            }
        } catch (e) { /* silencioso */ }
    }, POLL_MS_INDICE);
}

function detenerPollIndice() {
    if (pollIndiceTimer) {
        clearInterval(pollIndiceTimer);
        pollIndiceTimer = null;
    }
}

// ============================================================
//  MODAL: NUEVO PRIVADO
// ============================================================
function abrirModalPrivado() {
    const cont = document.getElementById('wthPrivadoUsuarios');
    cont.innerHTML = '';

    const otros = Object.keys(usuariosPorCodigo).filter(c => c !== usuarioActual.codigo);

    if (otros.length === 0) {
        cont.innerHTML = `<p class="wth-modal-desc">No hay otros usuarios en la comunidad.</p>`;
        document.getElementById('wthModalPrivado').hidden = false;
        return;
    }

    otros.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

    otros.forEach(cod => {
        const btn = document.createElement('button');
        btn.className = 'wth-usuario-item';
        const foto = fotoDe(cod);
        btn.innerHTML = `
            <div class="wth-avatar">
                ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicialDe(cod))}</span>`}
            </div>
            <div class="wth-usuario-item-info">
                <div class="wth-usuario-item-nombre">${escapar(nombreDe(cod))}</div>
                <div class="wth-usuario-item-cod">@${escapar(cod)}</div>
            </div>
        `;
        btn.addEventListener('click', () => abrirChatPrivado(cod));
        cont.appendChild(btn);
    });

    document.getElementById('wthModalPrivado').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalPrivado() {
    document.getElementById('wthModalPrivado').hidden = true;
}

// ============================================================
//  MODAL: NUEVO GRUPO
// ============================================================
function abrirModalGrupo() {
    grupoFotoId = null;
    usuariosSeleccionados = new Set();

    document.getElementById('wthGrupoNombre').value = '';
    document.getElementById('wthGrupoPermitirAgregar').checked = false;

    const fotoPreview = document.getElementById('wthGrupoFotoPreview');
    fotoPreview.classList.remove('con-imagen');
    fotoPreview.innerHTML = '<i data-lucide="image-plus"></i><span>Foto</span>';

    renderUsuariosGrupo();

    document.getElementById('wthModalGrupo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('wthGrupoNombre').focus(), 100);
}

function renderUsuariosGrupo() {
    const cont = document.getElementById('wthGrupoUsuarios');
    cont.innerHTML = '';
    const otros = Object.keys(usuariosPorCodigo).filter(c => c !== usuarioActual.codigo);
    otros.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

    otros.forEach(cod => {
        const btn = document.createElement('button');
        const sel = usuariosSeleccionados.has(cod);
        btn.className = 'wth-usuario-item' + (sel ? ' seleccionado' : '');
        const foto = fotoDe(cod);
        btn.innerHTML = `
            <div class="wth-avatar">
                ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicialDe(cod))}</span>`}
            </div>
            <div class="wth-usuario-item-info">
                <div class="wth-usuario-item-nombre">${escapar(nombreDe(cod))}</div>
                <div class="wth-usuario-item-cod">@${escapar(cod)}</div>
            </div>
            <div class="wth-usuario-check">
                <i data-lucide="check"></i>
            </div>
        `;
        btn.addEventListener('click', () => {
            if (usuariosSeleccionados.has(cod)) usuariosSeleccionados.delete(cod);
            else usuariosSeleccionados.add(cod);
            renderUsuariosGrupo();
        });
        cont.appendChild(btn);
    });

    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalGrupo() {
    document.getElementById('wthModalGrupo').hidden = true;
}

async function elegirFotoGrupo() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elegí una foto para el grupo'
        });
        if (!id) return;
        grupoFotoId = id;
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            const preview = document.getElementById('wthGrupoFotoPreview');
            preview.classList.add('con-imagen');
            preview.innerHTML = `<img src="${url}" alt="">`;
            preview.querySelector('img').onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[WhatTheHay] Error picker:', e);
    }
}

async function crearGrupo() {
    const nombre = document.getElementById('wthGrupoNombre').value.trim();
    if (!nombre) {
        toast('Ponele un nombre al grupo', 'error');
        return;
    }
    if (usuariosSeleccionados.size === 0) {
        toast('Elegí al menos un miembro', 'error');
        return;
    }

    const permitirAgregar = document.getElementById('wthGrupoPermitirAgregar').checked;

    const miembros = [usuarioActual.codigo, ...usuariosSeleccionados];
    const chatId = 'grupo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    const nuevo = {
        id: chatId,
        tipo: 'grupo',
        nombre: nombre,
        imagenId: grupoFotoId || null,
        creador: usuarioActual.codigo,
        miembros: miembros,
        permitirAgregar: permitirAgregar,
        creado: new Date().toISOString(),
        ultimoMensaje: null
    };

    const btn = document.getElementById('wthGrupoCrear');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        await mutarIndice((d) => {
            d.chats.push(nuevo);
            return d;
        });
        await mutarChat(chatId, (c) => c);

        // Notificar a los miembros
        const api = API();
        if (api && typeof api.enviarNotificacion === 'function') {
            const miNombre = usuarioActual.nombre || usuarioActual.codigo;
            miembros.forEach(cod => {
                if (cod === usuarioActual.codigo) return;
                api.enviarNotificacion(
                    'whatthehay',
                    `${miNombre} te agregó al grupo "${nombre}"`,
                    cod
                ).catch(() => {});
            });
        }

        cerrarModalGrupo();
        renderListaChats();
        abrirChat(chatId);
        toast('Grupo creado', 'success');
    } catch (e) {
        toast('No se pudo crear el grupo', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  MENÚ CONTEXTUAL DEL CHAT
// ============================================================
function abrirMenuChat(x, y) {
    const menu = document.getElementById('wthMenu');
    const overlay = document.getElementById('wthMenuOverlay');
    if (!menu || !overlay) return;

    const chat = indice.chats.find(c => c.id === chatActivoId);
    if (!chat) return;

    // Mostrar/ocultar según tipo
    const itemInfo = document.getElementById('wthMenuItemInfo');
    const itemBorrar = document.getElementById('wthMenuItemBorrar');

    // Info: solo grupos (para privados no hay mucha info)
    itemInfo.hidden = chat.tipo !== 'grupo';

    // Borrar chat: cualquiera puede abandonar un privado, admin puede borrar grupo
    if (chat.tipo === 'grupo') {
        itemBorrar.hidden = !esAdminDe(chat);
    } else {
        itemBorrar.hidden = false;
    }

    // Texto de borrar
    const txtBorrar = chat.tipo === 'grupo' ? 'Eliminar grupo' : 'Eliminar chat';
    itemBorrar.querySelector('span').textContent = txtBorrar;

    menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 120) + 'px';
    menu.hidden = false;
    overlay.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarMenuChat() {
    document.getElementById('wthMenu').hidden = true;
    document.getElementById('wthMenuOverlay').hidden = true;
}

// ============================================================
//  INFO DEL GRUPO
// ============================================================
function abrirInfoGrupo() {
    const chat = indice.chats.find(c => c.id === chatActivoId);
    if (!chat || chat.tipo !== 'grupo') return;

    editandoGrupo = chat;

    document.getElementById('wthInfoNombre').value = chat.nombre || '';
    document.getElementById('wthInfoMiembrosCount').textContent = chat.miembros.length;
    document.getElementById('wthInfoPermitir').checked = !!chat.permitirAgregar;

    // Foto
    const fotoEl = document.getElementById('wthInfoGrupoFoto');
    if (chat.imagenId) {
        fotoEl.classList.add('con-imagen');
        cargarImagenEnAvatar(fotoEl, chat.imagenId);
    } else {
        fotoEl.classList.remove('con-imagen');
        fotoEl.innerHTML = '<i data-lucide="users"></i>';
    }

    // Miembros
    renderMiembrosInfo(chat);

    // Permisos
    const esAdmin = esAdminDe(chat);
    document.getElementById('wthInfoBtnCambiarFoto').hidden = !esAdmin;
    document.getElementById('wthInfoBtnEliminar').hidden = !esAdmin;
    document.getElementById('wthInfoPermitirWrap').style.display = esAdmin ? 'flex' : 'none';
    document.getElementById('wthInfoNombre').disabled = !esAdmin;
    document.getElementById('wthInfoGuardarWrap').hidden = !esAdmin;

    document.getElementById('wthModalInfoGrupo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function renderMiembrosInfo(chat) {
    const cont = document.getElementById('wthInfoMiembros');
    cont.innerHTML = '';
    chat.miembros.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

    chat.miembros.forEach(cod => {
        const div = document.createElement('div');
        div.className = 'wth-usuario-item';
        const foto = fotoDe(cod);
        const esAdmin = cod === chat.creador;
        const esYo = cod === usuarioActual.codigo;
        div.innerHTML = `
            <div class="wth-avatar">
                ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicialDe(cod))}</span>`}
            </div>
            <div class="wth-usuario-item-info">
                <div class="wth-usuario-item-nombre">
                    ${escapar(nombreDe(cod))}${esYo ? ' (vos)' : ''}
                    ${esAdmin ? '<span class="wth-usuario-rol">Admin</span>' : ''}
                </div>
                <div class="wth-usuario-item-cod">@${escapar(cod)}</div>
            </div>
        `;
        cont.appendChild(div);
    });

    // Botón para agregar miembros (si corresponde)
    const puedeAgregar = chat.creador === usuarioActual.codigo || chat.permitirAgregar;
    if (puedeAgregar) {
        const btnAdd = document.createElement('button');
        btnAdd.className = 'wth-usuario-item';
        btnAdd.innerHTML = `
            <div class="wth-avatar" style="background: var(--violet-100, #EDE9FE); color: var(--violet-700, #6D28D9);">
                <i data-lucide="user-plus"></i>
            </div>
            <div class="wth-usuario-item-info">
                <div class="wth-usuario-item-nombre">Agregar miembros</div>
                <div class="wth-usuario-item-cod">Sumar más gente al grupo</div>
            </div>
        `;
        btnAdd.addEventListener('click', abrirModalAgregar);
        cont.appendChild(btnAdd);
    }
}

function cerrarInfoGrupo() {
    document.getElementById('wthModalInfoGrupo').hidden = true;
    editandoGrupo = null;
    grupoInfoFotoId = null;
}

async function cambiarFotoGrupoExistente() {
    const mh = MH();
    if (!mh || !editandoGrupo) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elegí una nueva foto'
        });
        if (!id) return;
        grupoInfoFotoId = id;
        const fotoEl = document.getElementById('wthInfoGrupoFoto');
        fotoEl.classList.add('con-imagen');
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            fotoEl.innerHTML = `<img src="${url}" alt="">`;
            fotoEl.querySelector('img').onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) { /* silencioso */ }
}

async function guardarCambiosGrupo() {
    if (!editandoGrupo) return;
    const chatId = editandoGrupo.id;
    const nuevoNombre = document.getElementById('wthInfoNombre').value.trim();
    const permitir = document.getElementById('wthInfoPermitir').checked;

    if (!nuevoNombre) {
        toast('Ponele un nombre', 'error');
        return;
    }

    try {
        await mutarIndice((d) => {
            const c = d.chats.find(x => x.id === chatId);
            if (c) {
                c.nombre = nuevoNombre;
                c.permitirAgregar = permitir;
                if (grupoInfoFotoId) c.imagenId = grupoInfoFotoId;
            }
            return d;
        });
        renderListaChats();
        renderChatHeader();
        cerrarInfoGrupo();
        toast('Grupo actualizado', 'success');
    } catch (e) {
        toast('No se pudo guardar', 'error');
    }
}

async function salirDelGrupo() {
    if (!editandoGrupo) return;
    const chatId = editandoGrupo.id;
    const esAdmin = editandoGrupo.creador === usuarioActual.codigo;

    if (esAdmin) {
        toast('Sos el admin. Si querés irte, primero eliminá el grupo o pasá admin (próximamente).', 'info');
        return;
    }

    if (!confirm('¿Salir del grupo? Dejarás de ver los mensajes.')) return;

    try {
        await mutarIndice((d) => {
            const c = d.chats.find(x => x.id === chatId);
            if (c) {
                c.miembros = c.miembros.filter(m => m !== usuarioActual.codigo);
            }
            return d;
        });

        // Notificar a los demás
        const api = API();
        if (api && typeof api.enviarNotificacion === 'function') {
            const miNombre = usuarioActual.nombre || usuarioActual.codigo;
            const nombreGrupo = editandoGrupo.nombre || 'el grupo';
            editandoGrupo.miembros.forEach(cod => {
                if (cod === usuarioActual.codigo) return;
                api.enviarNotificacion(
                    'whatthehay',
                    `${miNombre} salió del grupo "${nombreGrupo}"`,
                    cod
                ).catch(() => {});
            });
        }

        cerrarInfoGrupo();
        cerrarChat();
        renderListaChats();
        toast('Saliste del grupo', 'success');
    } catch (e) {
        toast('No se pudo salir', 'error');
    }
}

async function eliminarGrupo() {
    if (!editandoGrupo) return;
    if (editandoGrupo.creador !== usuarioActual.codigo) {
        toast('Solo el admin puede eliminar', 'error');
        return;
    }
    if (!confirm('¿Eliminar este grupo para todos? No se puede deshacer.')) return;

    const chatId = editandoGrupo.id;

    try {
        await mutarIndice((d) => {
            d.chats = d.chats.filter(c => c.id !== chatId);
            return d;
        });

        // Borrar el JSON de mensajes
        const bd = BD();
        if (bd) {
            try {
                await bd.eliminarArchivo(rutaChat(chatId));
            } catch (e) { /* silencioso */ }
        }

        cerrarInfoGrupo();
        cerrarChat();
        renderListaChats();
        toast('Grupo eliminado', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    }
}

// ============================================================
//  MODAL: AGREGAR MIEMBROS
// ============================================================
function abrirModalAgregar() {
    if (!editandoGrupo) return;
    usuariosAgregarSeleccionados = new Set();

    const cont = document.getElementById('wthAgregarUsuarios');
    cont.innerHTML = '';

    const candidatos = Object.keys(usuariosPorCodigo)
        .filter(c => !editandoGrupo.miembros.includes(c));

    if (candidatos.length === 0) {
        cont.innerHTML = `<p class="wth-modal-desc">No hay más usuarios para agregar.</p>`;
        document.getElementById('wthModalAgregar').hidden = false;
        return;
    }

    candidatos.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

    candidatos.forEach(cod => {
        const btn = document.createElement('button');
        btn.className = 'wth-usuario-item';
        const foto = fotoDe(cod);
        btn.innerHTML = `
            <div class="wth-avatar">
                ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar(inicialDe(cod))}</span>`}
            </div>
            <div class="wth-usuario-item-info">
                <div class="wth-usuario-item-nombre">${escapar(nombreDe(cod))}</div>
                <div class="wth-usuario-item-cod">@${escapar(cod)}</div>
            </div>
            <div class="wth-usuario-check">
                <i data-lucide="check"></i>
            </div>
        `;
        btn.addEventListener('click', () => {
            if (usuariosAgregarSeleccionados.has(cod)) {
                usuariosAgregarSeleccionados.delete(cod);
                btn.classList.remove('seleccionado');
            } else {
                usuariosAgregarSeleccionados.add(cod);
                btn.classList.add('seleccionado');
            }
        });
        cont.appendChild(btn);
    });

    document.getElementById('wthModalAgregar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarAgregarMiembros() {
    if (!editandoGrupo || usuariosAgregarSeleccionados.size === 0) return;

    const chatId = editandoGrupo.id;
    const nuevos = Array.from(usuariosAgregarSeleccionados);

    try {
        await mutarIndice((d) => {
            const c = d.chats.find(x => x.id === chatId);
            if (c) {
                nuevos.forEach(cod => {
                    if (!c.miembros.includes(cod)) c.miembros.push(cod);
                });
            }
            return d;
        });

        // Notificar
        const api = API();
        if (api && typeof api.enviarNotificacion === 'function') {
            const miNombre = usuarioActual.nombre || usuarioActual.codigo;
            nuevos.forEach(cod => {
                api.enviarNotificacion(
                    'whatthehay',
                    `${miNombre} te agregó al grupo "${editandoGrupo.nombre}"`,
                    cod
                ).catch(() => {});
            });
        }

        // Refrescar info grupo
        const grupo = indice.chats.find(c => c.id === chatId);
        if (grupo) {
            editandoGrupo = grupo;
            renderMiembrosInfo(grupo);
            document.getElementById('wthInfoMiembrosCount').textContent = grupo.miembros.length;
        }

        document.getElementById('wthModalAgregar').hidden = true;
        renderListaChats();
        toast('Miembros agregados', 'success');
    } catch (e) {
        toast('No se pudo agregar', 'error');
    }
}

// ============================================================
//  EMOJIS
// ============================================================
function renderEmojisBar() {
    const cont = document.getElementById('wthEmojis');
    if (!cont) return;
    cont.innerHTML = '';
    EMOJIS.forEach(e => {
        const btn = document.createElement('button');
        btn.className = 'wth-emoji-btn';
        btn.type = 'button';
        btn.textContent = e;
        btn.addEventListener('click', () => {
            const input = document.getElementById('wthInput');
            input.value += e;
            input.dispatchEvent(new Event('input'));
            input.focus();
        });
        cont.appendChild(btn);
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('WhatTheHay necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar WhatTheHay.');
        return;
    }

    const badge = document.getElementById('wthUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarUsuarios();
    await cargarIndice(true);

    renderListaChats();
    renderEmojisBar();

    // ===== EVENTOS =====

    // Botones de nuevo
    document.getElementById('wthBtnNuevoPrivado')?.addEventListener('click', abrirModalPrivado);
    document.getElementById('wthBtnNuevoGrupo')?.addEventListener('click', abrirModalGrupo);

    // Buscador
    const buscar = document.getElementById('wthBuscar');
    const buscarClear = document.getElementById('wthBuscarClear');
    buscar?.addEventListener('input', (e) => {
        filtroBusqueda = e.target.value.trim();
        buscarClear.hidden = !filtroBusqueda;
        renderListaChats();
    });
    buscarClear?.addEventListener('click', () => {
        buscar.value = '';
        filtroBusqueda = '';
        buscarClear.hidden = true;
        renderListaChats();
    });

    // Volver (móvil)
    document.getElementById('wthBtnVolver')?.addEventListener('click', cerrarChat);

    // Info del chat (click en el header)
    document.getElementById('wthChatInfo')?.addEventListener('click', () => {
        const chat = indice.chats.find(c => c.id === chatActivoId);
        if (!chat) return;
        if (chat.tipo === 'grupo') {
            abrirInfoGrupo();
        } else {
            // Para privados: mostrar info simple
            const otro = chat.miembros.find(c => c !== usuarioActual.codigo);
            toast(`@${otro} · ${nombreDe(otro)}`, 'info');
        }
    });

    // Menú contextual del chat
    const btnMenu = document.getElementById('wthBtnChatMenu');
    btnMenu?.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = btnMenu.getBoundingClientRect();
        abrirMenuChat(rect.right - 200, rect.bottom + 6);
    });

    document.getElementById('wthMenuOverlay')?.addEventListener('click', cerrarMenuChat);
    document.getElementById('wthMenuItemInfo')?.addEventListener('click', () => {
        cerrarMenuChat();
        abrirInfoGrupo();
    });
    document.getElementById('wthMenuItemBorrar')?.addEventListener('click', async () => {
        cerrarMenuChat();
        const chat = indice.chats.find(c => c.id === chatActivoId);
        if (!chat) return;

        if (chat.tipo === 'grupo') {
            if (esAdminDe(chat)) eliminarGrupo();
            else toast('Solo el admin puede eliminar el grupo', 'error');
        } else {
            if (!confirm('¿Eliminar este chat? Se borrarán los mensajes para vos.')) return;
            // Para privados: quitarme del chat (no borrar los mensajes del otro)
            try {
                await mutarIndice((d) => {
                    const c = d.chats.find(x => x.id === chat.id);
                    if (c) c.miembros = c.miembros.filter(m => m !== usuarioActual.codigo);
                    return d;
                });
                cerrarChat();
                renderListaChats();
                toast('Chat eliminado', 'success');
            } catch (e) {
                toast('No se pudo eliminar', 'error');
            }
        }
    });

    // Input de texto
    const input = document.getElementById('wthInput');
    const btnEnviar = document.getElementById('wthBtnEnviar');
    input?.addEventListener('input', () => {
        btnEnviar.disabled = !input.value.trim() || !chatActivoId;
    });
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            enviarMensajeTexto();
        }
    });
    btnEnviar?.addEventListener('click', enviarMensajeTexto);

    // Emojis
    document.getElementById('wthBtnEmoji')?.addEventListener('click', () => {
        const bar = document.getElementById('wthEmojis');
        bar.hidden = !bar.hidden;
    });

    // Grabación
    const btnGrabar = document.getElementById('wthBtnGrabar');
    btnGrabar?.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        iniciarGrabacion();
    });
    btnGrabar?.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (grabando) detenerGrabacion();
    });
    btnGrabar?.addEventListener('pointercancel', () => {
        if (grabando) detenerGrabacion();
    });
    btnGrabar?.addEventListener('pointerleave', () => {
        if (grabando) detenerGrabacion();
    });

    // Modal privado
    document.getElementById('wthPrivadoCerrar')?.addEventListener('click', cerrarModalPrivado);
    document.getElementById('wthModalPrivado')?.addEventListener('click', (e) => {
        if (e.target.id === 'wthModalPrivado') cerrarModalPrivado();
    });

    // Modal grupo (crear)
    document.getElementById('wthGrupoCerrar')?.addEventListener('click', cerrarModalGrupo);
    document.getElementById('wthGrupoCancelar')?.addEventListener('click', cerrarModalGrupo);
    document.getElementById('wthBtnGrupoFoto')?.addEventListener('click', elegirFotoGrupo);
    document.getElementById('wthGrupoFotoPreview')?.addEventListener('click', elegirFotoGrupo);
    document.getElementById('wthGrupoCrear')?.addEventListener('click', crearGrupo);
    document.getElementById('wthModalGrupo')?.addEventListener('click', (e) => {
        if (e.target.id === 'wthModalGrupo') cerrarModalGrupo();
    });

    // Modal info grupo
    document.getElementById('wthInfoCerrar')?.addEventListener('click', cerrarInfoGrupo);
    document.getElementById('wthInfoBtnCambiarFoto')?.addEventListener('click', cambiarFotoGrupoExistente);
    document.getElementById('wthInfoBtnSalir')?.addEventListener('click', salirDelGrupo);
    document.getElementById('wthInfoBtnEliminar')?.addEventListener('click', eliminarGrupo);
    document.getElementById('wthInfoBtnGuardar')?.addEventListener('click', guardarCambiosGrupo);
    document.getElementById('wthModalInfoGrupo')?.addEventListener('click', (e) => {
        if (e.target.id === 'wthModalInfoGrupo') cerrarInfoGrupo();
    });

    // Modal agregar miembros
    document.getElementById('wthAgregarCerrar')?.addEventListener('click', () => {
        document.getElementById('wthModalAgregar').hidden = true;
    });
    document.getElementById('wthAgregarCancelar')?.addEventListener('click', () => {
        document.getElementById('wthModalAgregar').hidden = true;
    });
    document.getElementById('wthAgregarConfirmar')?.addEventListener('click', confirmarAgregarMiembros);
    document.getElementById('wthModalAgregar')?.addEventListener('click', (e) => {
        if (e.target.id === 'wthModalAgregar') e.target.hidden = true;
    });

    // Escape global
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('wthModalPrivado').hidden) { cerrarModalPrivado(); return; }
        if (!document.getElementById('wthModalGrupo').hidden) { cerrarModalGrupo(); return; }
        if (!document.getElementById('wthModalInfoGrupo').hidden) { cerrarInfoGrupo(); return; }
        if (!document.getElementById('wthModalAgregar').hidden) {
            document.getElementById('wthModalAgregar').hidden = true; return;
        }
        if (!document.getElementById('wthMenu').hidden) { cerrarMenuChat(); return; }
    });

    // Polling del índice
    iniciarPollIndice();

    // Refresco al volver de pestaña
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            cargarIndice(true).then(() => {
                renderListaChats();
                if (chatActivoId) {
                    cargarChat(chatActivoId, true).then(data => {
                        chatActivoData = data;
                        renderMensajes();
                    });
                }
            });
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    detenerPollChat();
    detenerPollIndice();
    pararTodosAudios();
    if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
    }
});
