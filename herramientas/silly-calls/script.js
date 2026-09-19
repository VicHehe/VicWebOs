// ============================================================
//  SillyCalls — Videollamadas en tiempo real
//  ------------------------------------------------------------
//  Usa PeerJS (CDN) para WebRTC.
//  No guarda ningún dato: no toca ConfigBD, no usa IndexedDB.
//  Solo hereda el tema del padre y usa el nombre + foto del
//  usuario para el chat y el avatar de la sidebar.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let usuarioActual = null;

// --- DOM ---
const joinScreen        = document.getElementById('joinScreen');
const callScreen        = document.getElementById('callScreen');
const roomInput         = document.getElementById('roomInput');
const btnJoin           = document.getElementById('btnJoin');
const joinMessage       = document.getElementById('joinMessage');
const roomDisplay       = document.getElementById('roomDisplay');
const ctrlRoomLabel     = document.getElementById('ctrlRoomLabel');
const participantCount  = document.getElementById('participantCount');
const participantList   = document.getElementById('participantList');
const videosGrid        = document.getElementById('videosGrid');
const btnHangup         = document.getElementById('btnHangup');
const btnMuteAudio      = document.getElementById('btnMuteAudio');
const btnMuteVideo      = document.getElementById('btnMuteVideo');
const btnShareScreen    = document.getElementById('btnShareScreen');
const btnToggleChat     = document.getElementById('btnToggleChat');
const btnCloseChat      = document.getElementById('btnCloseChat');
const chatPanel         = document.getElementById('chatPanel');
const chatMessages      = document.getElementById('chatMessages');
const chatInput         = document.getElementById('chatInput');
const btnSendChat       = document.getElementById('btnSendChat');

// --- Estado ---
let peer             = null;
let localStream      = null;
let localPreview     = null;
let roomId           = '';
let isHost           = false;
let participants     = {};
let myPeerId         = '';
let mutedAudio       = false;
let mutedVideo       = true;
let chatVisible      = false;
let unreadMessages   = 0;
let dataConnections  = {};
let togglingCamera   = false;
let cameraTrack      = null;
let blackTrack       = null;
let screenTrack      = null;
let isSharingScreen  = false;
let participantNames = {};
let pinnedPeerId     = null;

// --- Volúmenes individuales ---
const volumes = {};
const volumeSliders = {};

// --- Fotos de perfil ---
const participantFotos = {};  // peerId -> base64
let miFoto = null;            // foto del usuario actual (base64)

// --- Audio pantalla ---
let originalAudioTrack   = null;
let screenAudioTrack     = null;
let screenAudioStreamRef = null;
let mixedAudioTrack      = null;
let audioContext         = null;
let micSourceNode        = null;
let screenSourceNode     = null;
let destinationNode      = null;

// ============================================================
//  API
// ============================================================
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
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
//  UTILIDAD: track de video negro
// ============================================================
function crearBlackTrack() {
    const canvas = document.createElement('canvas');
    canvas.width  = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setInterval(() => { ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 1, 1); }, 1000);
    const stream = canvas.captureStream(1);
    return stream.getVideoTracks()[0];
}

// ============================================================
//  VOLUMEN INDIVIDUAL
// ============================================================
function setVolumeForPeer(peerId, value) {
    const p = participants[peerId];
    if (!p) return;
    const video = p.videoElement?.querySelector('video');
    if (video) {
        const scaled = Math.min(value, 1.0);
        video.volume = scaled;
        volumes[peerId] = value;
        const label = p.videoElement?.querySelector('.volume-value');
        if (label) label.textContent = value.toFixed(2);
    }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || null;

    // Cargar mi foto de perfil desde cuenta.json
    if (usuarioActual?.codigo) {
        try {
            const bd = window.parent.ConfigBD;
            if (bd) {
                const cuentas = await bd.leerArchivoFresh('cuenta.json');
                if (Array.isArray(cuentas)) {
                    const yo = cuentas.find(c => c.codigo === usuarioActual.codigo);
                    if (yo && yo.foto) miFoto = yo.foto;
                }
            }
        } catch (e) { /* silencioso */ }
    }

    roomInput.value = usuarioActual?.codigo || 'sillyroom';

    btnJoin.addEventListener('click', iniciarLlamada);
    btnHangup.addEventListener('click', colgarLlamada);
    btnMuteAudio.addEventListener('click', toggleMuteAudio);
    btnMuteVideo.addEventListener('click', toggleMuteVideo);
    btnShareScreen.addEventListener('click', compartirPantalla);
    btnToggleChat.addEventListener('click', abrirChat);
    btnCloseChat.addEventListener('click', cerrarChat);
    btnSendChat.addEventListener('click', enviarMensajeChat);
    chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') enviarMensajeChat(); });

    if (window.lucide) window.lucide.createIcons();
});

// ============================================================
//  CHAT
// ============================================================
function abrirChat() {
    chatVisible = true;
    chatPanel.classList.remove('hidden');
    btnToggleChat.classList.add('active');
    unreadMessages = 0;
    quitarBadgeChat();
    chatInput.focus();
}
function cerrarChat() {
    chatVisible = false;
    chatPanel.classList.add('hidden');
    btnToggleChat.classList.remove('active');
}
function enviarMensajeChat() {
    const texto = chatInput.value.trim();
    if (!texto) return;
    const miNombre = usuarioActual?.nombre || myPeerId || 'Yo';
    const msg = { type: 'chat', autor: miNombre, texto, hora: horaActual() };
    agregarMensajeChat(msg, true);
    broadcastChat(msg);
    chatInput.value = '';
}
function agregarMensajeChat(msg, propio = false) {
    chatMessages.querySelector('.chat-empty')?.remove();
    const div = document.createElement('div');
    div.className = 'chat-msg' + (propio ? ' propio' : '');
    div.innerHTML = `<span class="autor">${esc(msg.autor)}</span><span class="texto">${esc(msg.texto)}</span><span class="hora">${msg.hora}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (!chatVisible && !propio) { unreadMessages++; mostrarBadgeChat(unreadMessages); }
}
function broadcastData(msg) {
    for (const id in dataConnections)
        if (dataConnections[id]?.open) try { dataConnections[id].send(msg); } catch (e) {}
}
function broadcastChat(msg) { broadcastData(msg); }
function mostrarBadgeChat(n) {
    let b = btnToggleChat.querySelector('.chat-badge');
    if (!b) { b = document.createElement('span'); b.className = 'chat-badge'; btnToggleChat.appendChild(b); }
    b.textContent = n > 9 ? '9+' : n;
}
function quitarBadgeChat() { btnToggleChat.querySelector('.chat-badge')?.remove(); }
function horaActual() {
    const d = new Date();
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ============================================================
//  SIDEBAR
// ============================================================
function actualizarSidebar() {
    participantList.innerHTML = '';
    const countEl = participantCount.querySelector('span') || participantCount;
    if (countEl.tagName === 'SPAN') countEl.textContent = Object.keys(participants).length;

    for (const id in participants) {
        const esLocal = id === myPeerId;
        const nombre  = participantNames[id] || id;
        const foto    = participantFotos[id];

        const item = document.createElement('div');
        item.className = 'participant-item';

        const avatarHTML = foto
            ? `<img src="${foto}" alt="">`
            : `<i data-lucide="user"></i>`;

        const row = document.createElement('div');
        row.className = 'participant-row';
        row.innerHTML = `
            <div class="participant-avatar">${avatarHTML}</div>
            <span class="participant-name">${esc(nombre)}${esLocal ? ' (tú)' : ''}</span>
            <span class="participant-icons">${esLocal && mutedAudio ? '<i data-lucide="mic-off"></i>' : ''}</span>
        `;
        item.appendChild(row);

        if (!esLocal && participants[id]?.videoElement) {
            const volContainer = document.createElement('div');
            volContainer.className = 'participant-volume';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = 0;
            slider.max = 1.6;
            slider.step = 0.01;
            const initial = volumes[id] !== undefined ? volumes[id] : 0.8;
            slider.value = initial;
            slider.dataset.peer = id;

            const valueLabel = document.createElement('span');
            valueLabel.className = 'volume-value';
            valueLabel.textContent = initial.toFixed(2);

            slider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                valueLabel.textContent = val.toFixed(2);
                setVolumeForPeer(id, val);
            });

            volContainer.appendChild(slider);
            volContainer.appendChild(valueLabel);
            item.appendChild(volContainer);
            volumeSliders[id] = slider;
            setVolumeForPeer(id, initial);
        }

        participantList.appendChild(item);
    }
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INICIAR LLAMADA
// ============================================================
async function iniciarLlamada() {
    roomId = roomInput.value.trim();
    if (!roomId) { mostrarMensaje('Ingresa un código de sala.', 'error'); return; }

    isHost = document.querySelector('input[name="role"]:checked').value === 'host';
    joinMessage.style.display = 'none';

    let audioStream;
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
        mostrarMensaje('No se pudo acceder al micrófono: ' + err.message, 'error');
        return;
    }

    blackTrack = crearBlackTrack();

    localStream = new MediaStream([
        ...audioStream.getAudioTracks(),
        blackTrack
    ]);

    localPreview = new MediaStream([
        ...audioStream.getAudioTracks(),
        blackTrack
    ]);

    originalAudioTrack = audioStream.getAudioTracks()[0];

    mutedVideo = true;
    btnMuteVideo.classList.add('active');

    const miNombre = usuarioActual?.nombre || 'Yo';
    myPeerId = isHost ? roomId : ('guest_' + Date.now() + '_' + Math.random().toString(36).substr(2,4));
    participantNames[myPeerId] = miNombre;
    if (miFoto) participantFotos[myPeerId] = miFoto;

    try { peer = new Peer(myPeerId, { debug: 1 }); }
    catch (err) { mostrarMensaje('Error al crear Peer: ' + err.message, 'error'); return; }

    peer.on('open', () => {
        if (isHost) {
            peer.on('connection', conn => manejarConexionEntrante(conn));
        } else {
            const conn = peer.connect(roomId);
            dataConnections[roomId] = conn;
            conn.on('open', () => {
                conn.send({ type: 'join', peerId: myPeerId, nombre: miNombre, foto: miFoto });
            });
            conn.on('data', data => manejarData(data, conn));
            conn.on('error', () => { mostrarMensaje('No se pudo conectar al anfitrión.', 'error'); colgarLlamada(); });
        }
        agregarVideoLocal();
        cambiarPantalla('call');
        roomDisplay.textContent   = `Sala: ${roomId}`;
        ctrlRoomLabel.textContent = roomId;
        actualizarSidebar();
    });

    peer.on('error', err => {
        const msg = isHost && err.type === 'unavailable-id'
            ? 'Código en uso. Elige otro o únete como invitado.'
            : 'Error: ' + (err.message || err.type);
        mostrarMensaje(msg, 'error');
        colgarLlamada();
    });

    peer.on('call', call => {
        if (participants[call.peer]) return;
        call.answer(localStream);
        call.on('stream', s => agregarVideoRemoto(call.peer, s));
        call.on('close',  () => eliminarParticipante(call.peer));
        participants[call.peer] = { call, stream: null, videoElement: null, sharingScreen: false };
    });
}

// ============================================================
//  DATA
// ============================================================
function manejarConexionEntrante(conn) {
    conn.on('open', () => { dataConnections[conn.peer] = conn; });
    conn.on('data', data => {
        if (data.type === 'join') {
            participantNames[data.peerId] = data.nombre || data.peerId;
            if (data.foto) participantFotos[data.peerId] = data.foto;

            const lista = Object.keys(participants).map(id => ({
                id: id,
                nombre: participantNames[id] || id,
                sharing: participants[id]?.sharingScreen || false,
                foto: participantFotos[id] || null
            }));
            conn.send({ type: 'participants', participants: lista });

            for (const id in dataConnections) {
                if (id !== data.peerId && dataConnections[id]?.open) {
                    try {
                        dataConnections[id].send({
                            type: 'new_participant',
                            peerId: data.peerId,
                            nombre: data.nombre || data.peerId,
                            foto: data.foto || null
                        });
                    } catch (e) {}
                }
            }
        }
        if (data.type === 'chat') {
            agregarMensajeChat(data, false);
            for (const id in dataConnections)
                if (id !== conn.peer && dataConnections[id]?.open)
                    try { dataConnections[id].send(data); } catch (e) {}
        }
        if (data.type === 'cam_state')     aplicarEstadoCamRemota(data.peerId, data.camOff);
        if (data.type === 'screen_sharing') marcarCompartirPantalla(data.peerId, data.sharing);
    });
}

function manejarData(data, conn) {
    if (data.type === 'participants') {
        data.participants.forEach(p => {
            participantNames[p.id] = p.nombre || p.id;
            if (p.foto) participantFotos[p.id] = p.foto;
            if (p.id !== myPeerId && !participants[p.id]) {
                iniciarLlamadaHacia(p.id);
                if (p.sharing) {
                    participants[p.id] = { ...participants[p.id], sharingScreen: true };
                }
            }
        });
    }
    if (data.type === 'new_participant' && data.peerId !== myPeerId && !participants[data.peerId]) {
        participantNames[data.peerId] = data.nombre || data.peerId;
        if (data.foto) participantFotos[data.peerId] = data.foto;
        iniciarLlamadaHacia(data.peerId);
    }
    if (data.type === 'chat')           agregarMensajeChat(data, false);
    if (data.type === 'cam_state')      aplicarEstadoCamRemota(data.peerId, data.camOff);
    if (data.type === 'screen_sharing') marcarCompartirPantalla(data.peerId, data.sharing);
}

function iniciarLlamadaHacia(peerId) {
    if (participants[peerId] || peerId === myPeerId) return;
    try {
        const call = peer.call(peerId, localStream);
        call.on('stream', s => agregarVideoRemoto(peerId, s));
        call.on('close',  () => eliminarParticipante(peerId));
        participants[peerId] = { call, stream: null, videoElement: null, sharingScreen: false };
    } catch (err) { console.error('Error llamando a', peerId, err); }
}

// ============================================================
//  ESTADO REMOTO
// ============================================================
function aplicarEstadoCamRemota(peerId, camOff) {
    const p = participants[peerId];
    if (!p?.videoElement) return;
    p.videoElement.classList.toggle('cam-off', camOff);
    if (camOff && pinnedPeerId === peerId && !p.videoElement.querySelector('.screen-share-badge')) {
        despinearVideo();
    }
    actualizarPinBtn(p.videoElement);
}

function marcarCompartirPantalla(peerId, sharing) {
    const p = participants[peerId];
    if (!p?.videoElement) return;
    p.sharingScreen = sharing;
    let badge = p.videoElement.querySelector('.screen-share-badge');
    if (sharing) {
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'screen-share-badge';
            badge.innerHTML = '<i data-lucide="monitor-up"></i> Compartiendo';
            p.videoElement.appendChild(badge);
            if (window.lucide) window.lucide.createIcons();
        }
        pinearVideo(peerId);
    } else {
        badge?.remove();
        if (pinnedPeerId === peerId) despinearVideo();
    }
    actualizarPinBtn(p.videoElement);
}

function actualizarPinBtn(wrapper) {
    const pinBtn = wrapper?.querySelector('.pin-btn');
    if (!pinBtn) return;
    pinBtn.style.display = puedeSerPineado(wrapper) ? '' : 'none';
}

function puedeSerPineado(wrapper) {
    const camApagada   = wrapper.classList.contains('cam-off');
    const compartiendo = !!wrapper.querySelector('.screen-share-badge');
    return !camApagada || compartiendo;
}

// ============================================================
//  GESTIÓN DE VIDEOS
// ============================================================
function crearVideoWrapper(id, stream, muted, labelText) {
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `video-${id}`;

    const video = document.createElement('video');
    video.autoplay    = true;
    video.muted       = muted;
    video.playsInline = true;
    if (stream) video.srcObject = stream;

    const camOff = document.createElement('div');
    camOff.className = 'cam-off-screen';
    camOff.innerHTML = `<i data-lucide="video-off"></i><p>Cámara apagada</p>`;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.textContent = labelText;

    const pinBtn = document.createElement('button');
    pinBtn.className     = 'pin-btn';
    pinBtn.title         = 'Fijar / Desfijar';
    pinBtn.innerHTML     = '<i data-lucide="pin"></i>';
    pinBtn.style.display = 'none';
    pinBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (!puedeSerPineado(wrapper)) return;
        pinnedPeerId === id ? despinearVideo() : pinearVideo(id);
    });

    wrapper.appendChild(video);
    wrapper.appendChild(camOff);
    wrapper.appendChild(label);
    wrapper.appendChild(pinBtn);

    if (muted) wrapper.classList.add('cam-off');
    return wrapper;
}

function agregarVideoLocal() {
    const placeholder = videosGrid.querySelector('.video-placeholder');
    if (placeholder) placeholder.remove();

    const label = `Tú (${participantNames[myPeerId] || 'Yo'})`;
    const wrapper = crearVideoWrapper('local', localPreview, true, label);
    videosGrid.prepend(wrapper);

    participants[myPeerId] = { call: null, stream: localPreview, videoElement: wrapper, sharingScreen: false };
    actualizarSidebar();
    if (window.lucide) window.lucide.createIcons();
}

function agregarVideoRemoto(peerId, stream) {
    if (participants[peerId]?.videoElement) {
        const wrapper = participants[peerId].videoElement;
        const video = wrapper.querySelector('video');
        video.srcObject = stream;
        const vol = volumes[peerId] !== undefined ? volumes[peerId] : 0.8;
        setVolumeForPeer(peerId, vol);
        if (volumeSliders[peerId]) {
            volumeSliders[peerId].value = vol;
            const label = wrapper.querySelector('.volume-value');
            if (label) label.textContent = vol.toFixed(2);
        }
        return;
    }

    const placeholder = videosGrid.querySelector('.video-placeholder');
    if (placeholder) placeholder.remove();

    const nombre = participantNames[peerId] || peerId;
    const wrapper = crearVideoWrapper(peerId, stream, false, nombre);
    videosGrid.appendChild(wrapper);

    if (!participants[peerId]) {
        participants[peerId] = { call: null, stream, videoElement: wrapper, sharingScreen: false };
    } else {
        participants[peerId].stream = stream;
        participants[peerId].videoElement = wrapper;
    }
    actualizarSidebar();
    if (window.lucide) window.lucide.createIcons();

    const initial = volumes[peerId] !== undefined ? volumes[peerId] : 0.8;
    setVolumeForPeer(peerId, initial);
    if (volumeSliders[peerId]) {
        volumeSliders[peerId].value = initial;
        const label = wrapper.querySelector('.volume-value');
        if (label) label.textContent = initial.toFixed(2);
    }
}

function eliminarParticipante(peerId) {
    if (pinnedPeerId === peerId) despinearVideo();
    participants[peerId]?.videoElement?.remove();
    delete participants[peerId];
    delete dataConnections[peerId];
    delete participantNames[peerId];
    delete volumes[peerId];
    delete volumeSliders[peerId];
    delete participantFotos[peerId];
    actualizarSidebar();

    if (videosGrid.children.length === 0) {
        videosGrid.innerHTML = `
            <div class="video-placeholder" id="remotePlaceholder">
                <i data-lucide="video-off"></i>
                <p>Esperando participantes...</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  PIN
// ============================================================
function pinearVideo(id) {
    if (pinnedPeerId) {
        const prev = document.getElementById(`video-${pinnedPeerId}`);
        prev?.classList.remove('pinned');
        prev?.querySelector('.pin-btn')?.classList.remove('active');
    }
    pinnedPeerId = id;
    const wrapper = document.getElementById(`video-${id}`);
    if (wrapper) {
        wrapper.classList.add('pinned');
        wrapper.querySelector('.pin-btn')?.classList.add('active');
        videosGrid.prepend(wrapper);
    }
    videosGrid.classList.add('has-pinned');
}

function despinearVideo() {
    if (!pinnedPeerId) return;
    const wrapper = document.getElementById(`video-${pinnedPeerId}`);
    wrapper?.classList.remove('pinned');
    wrapper?.querySelector('.pin-btn')?.classList.remove('active');
    const local = document.getElementById('video-local');
    if (local) videosGrid.prepend(local);
    pinnedPeerId = null;
    videosGrid.classList.remove('has-pinned');
}

// ============================================================
//  CONTROLES
// ============================================================
function toggleMuteAudio() {
    if (!localStream) return;
    mutedAudio = !mutedAudio;
    localStream.getAudioTracks().forEach(t => t.enabled = !mutedAudio);
    btnMuteAudio.classList.toggle('active', mutedAudio);
    actualizarSidebar();
}

async function toggleMuteVideo() {
    if (togglingCamera) return;
    togglingCamera = true;
    btnMuteVideo.disabled = true;

    try {
        if (mutedVideo) {
            const nuevoStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'user' }
            });
            cameraTrack = nuevoStream.getVideoTracks()[0];

            await reemplazarTrackEnConexiones('video', cameraTrack);

            localPreview = new MediaStream([
                ...localStream.getAudioTracks(),
                cameraTrack
            ]);
            const wLocal = document.getElementById('video-local');
            if (wLocal) {
                wLocal.querySelector('video').srcObject = localPreview;
                wLocal.classList.remove('cam-off');
                actualizarPinBtn(wLocal);
            }

            mutedVideo = false;
            btnMuteVideo.classList.remove('active');
        } else {
            await reemplazarTrackEnConexiones('video', blackTrack);

            if (cameraTrack) {
                cameraTrack.stop();
                cameraTrack = null;
            }

            localPreview = new MediaStream([
                ...localStream.getAudioTracks(),
                blackTrack
            ]);
            const wLocal = document.getElementById('video-local');
            if (wLocal) {
                wLocal.querySelector('video').srcObject = localPreview;
                wLocal.classList.add('cam-off');
                if (pinnedPeerId === 'local') despinearVideo();
                actualizarPinBtn(wLocal);
            }

            mutedVideo = true;
            btnMuteVideo.classList.add('active');
        }

        broadcastData({ type: 'cam_state', peerId: myPeerId, camOff: mutedVideo });
        actualizarSidebar();
    } catch (err) {
        console.error('Error toggling cámara:', err);
    } finally {
        togglingCamera = false;
        btnMuteVideo.disabled = false;
    }
}

async function reemplazarTrackEnConexiones(kind, newTrack) {
    const promesas = [];
    for (const id in participants) {
        const p = participants[id];
        if (p.call?.peerConnection) {
            const senders = p.call.peerConnection.getSenders();
            const sender = senders.find(s => s.track?.kind === kind);
            if (sender) promesas.push(sender.replaceTrack(newTrack));
        }
    }
    await Promise.allSettled(promesas);
}

// ============================================================
//  COMPARTIR PANTALLA CON AUDIO MEZCLADO
// ============================================================
async function compartirPantalla() {
    if (isSharingScreen) {
        await detenerCompartirPantalla();
        return;
    }

    let screenStream;
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });
    } catch (err) {
        console.warn('Pantalla compartida cancelada:', err);
        return;
    }

    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) {
        screenStream.getTracks().forEach(t => t.stop());
        return;
    }

    const screenAudioTrack = screenStream.getAudioTracks()[0] || null;
    const micTrack = originalAudioTrack;

    let newAudioTrack = micTrack;
    let audioContextToClose = null;

    if (screenAudioTrack) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            audioContextToClose = ctx;

            const micStream = new MediaStream([micTrack]);
            const micSource = ctx.createMediaStreamSource(micStream);

            const screenAudioStream = new MediaStream([screenAudioTrack]);
            const screenSource = ctx.createMediaStreamSource(screenAudioStream);

            const gainMic = ctx.createGain();
            const gainScreen = ctx.createGain();
            gainMic.gain.value = 1;
            gainScreen.gain.value = 1;

            const destination = ctx.createMediaStreamDestination();

            micSource.connect(gainMic);
            gainMic.connect(destination);
            screenSource.connect(gainScreen);
            gainScreen.connect(destination);

            const mixedTracks = destination.stream.getAudioTracks();
            if (mixedTracks.length > 0) {
                newAudioTrack = mixedTracks[0];
                mixedAudioTrack = newAudioTrack;
                audioContext = ctx;
                micSourceNode = micSource;
                screenSourceNode = screenSource;
                destinationNode = destination;
                screenAudioStreamRef = screenAudioStream;
            } else {
                newAudioTrack = micTrack;
                ctx.close();
                audioContextToClose = null;
            }
        } catch (err) {
            console.warn('No se pudo mezclar audio de pantalla, usando solo micrófono.', err);
            newAudioTrack = micTrack;
            if (audioContextToClose) {
                audioContextToClose.close();
                audioContextToClose = null;
            }
        }
    }

    screenTrack = videoTrack;
    isSharingScreen = true;
    btnShareScreen.classList.add('active');

    await reemplazarTrackEnConexiones('video', screenTrack);
    if (newAudioTrack && newAudioTrack !== micTrack) {
        await reemplazarTrackEnConexiones('audio', newAudioTrack);
    }

    const audioTracks = [newAudioTrack];
    const videoTracks = [screenTrack];
    localStream = new MediaStream([...audioTracks, ...videoTracks]);
    localPreview = new MediaStream([...audioTracks, ...videoTracks]);

    const wLocal = document.getElementById('video-local');
    if (wLocal) {
        wLocal.querySelector('video').srcObject = localPreview;
        wLocal.classList.remove('cam-off');
        actualizarPinBtn(wLocal);
    }

    broadcastData({ type: 'screen_sharing', peerId: myPeerId, sharing: true });

    screenTrack.onended = async () => {
        if (!isSharingScreen) return;
        await detenerCompartirPantalla();
    };
}

async function detenerCompartirPantalla() {
    if (!isSharingScreen) return;

    isSharingScreen = false;
    btnShareScreen.classList.remove('active');

    if (screenTrack) {
        screenTrack.onended = null;
        screenTrack.stop();
        screenTrack = null;
    }

    if (mixedAudioTrack) {
        mixedAudioTrack.stop();
        mixedAudioTrack = null;
    }
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
        micSourceNode = null;
        screenSourceNode = null;
        destinationNode = null;
    }
    if (screenAudioStreamRef) {
        screenAudioStreamRef.getTracks().forEach(t => t.stop());
        screenAudioStreamRef = null;
    }

    const micTrack = originalAudioTrack;
    if (micTrack) {
        await reemplazarTrackEnConexiones('audio', micTrack);
    }

    const videoTrackToUse = (!mutedVideo && cameraTrack) ? cameraTrack : blackTrack;
    await reemplazarTrackEnConexiones('video', videoTrackToUse);

    const audioTracks = micTrack ? [micTrack] : [];
    const videoTracks = [videoTrackToUse];
    localStream = new MediaStream([...audioTracks, ...videoTracks]);
    localPreview = new MediaStream([...audioTracks, ...videoTracks]);

    const wLocal = document.getElementById('video-local');
    if (wLocal) {
        wLocal.querySelector('video').srcObject = localPreview;
        wLocal.classList.toggle('cam-off', mutedVideo);
        actualizarPinBtn(wLocal);
    }

    broadcastData({ type: 'screen_sharing', peerId: myPeerId, sharing: false });
}

// ============================================================
//  COLGAR LLAMADA
// ============================================================
function colgarLlamada() {
    if (pinnedPeerId) despinearVideo();
    for (const id in participants) {
        try { participants[id]?.call?.close(); } catch (e) {}
        participants[id]?.videoElement?.remove();
    }
    participants     = {};
    dataConnections  = {};
    participantNames = {};

    // Limpiar fotos (mantener la mía para la próxima llamada)
    for (const k in participantFotos) delete participantFotos[k];
    if (miFoto && myPeerId) participantFotos[myPeerId] = miFoto;

    if (isSharingScreen) {
        detenerCompartirPantalla();
    }

    localStream?.getTracks().forEach(t => t.stop());
    localStream  = null;
    localPreview = null;
    if (blackTrack)  { blackTrack.stop();  blackTrack  = null; }
    if (cameraTrack) { cameraTrack.stop(); cameraTrack = null; }
    if (screenTrack) { screenTrack.stop(); screenTrack = null; }
    if (mixedAudioTrack) { mixedAudioTrack.stop(); mixedAudioTrack = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    isSharingScreen = false;
    try { peer?.destroy(); } catch (e) {}
    peer = null;

    videosGrid.innerHTML = `
        <div class="video-placeholder" id="remotePlaceholder">
            <i data-lucide="phone-off"></i>
            <p>Llamada finalizada</p>
        </div>`;
    chatMessages.innerHTML = `<div class="chat-empty">Los mensajes aparecerán aquí</div>`;
    participantList.innerHTML = '';
    const countEl = participantCount.querySelector('span') || participantCount;
    if (countEl.tagName === 'SPAN') countEl.textContent = '0';
    videosGrid.classList.remove('has-pinned');

    cerrarChat();
    quitarBadgeChat();
    cambiarPantalla('join');
    joinMessage.style.display = 'none';
    btnMuteAudio.classList.remove('active');
    btnMuteVideo.classList.remove('active');
    mutedAudio = false;
    mutedVideo = true;

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  UTILIDADES
// ============================================================
function cambiarPantalla(p) {
    joinScreen.classList.toggle('active', p === 'join');
    callScreen.classList.toggle('active', p !== 'join');
}
function mostrarMensaje(texto, tipo) {
    joinMessage.textContent = texto;
    joinMessage.className   = `message ${tipo}`;
    joinMessage.style.display = 'block';
}

window.addEventListener('beforeunload', () => colgarLlamada());
