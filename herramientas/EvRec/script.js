// ============================================================
//  EvRec — Grabador de pantalla con modos premium
//  ------------------------------------------------------------
//  Modos:
//    · base        → pantalla + audio del sistema (gratis)
//    · streamer    → pantalla + cámara PiP + micrófono (10 monedas)
//    · transmision → pantalla + audio del sistema + micrófono (5 monedas)
//
//  El video NO se persiste. Vive en memoria como Blob URL
//  hasta que el usuario lo descarga o lo descarta.
//  Al recargar o salir se pierde automáticamente.
//
//  Compras: app/EvRec/EvRec.json (vía ConfigBD)
//  Estructura: { version, compras: { [codigo]: {streamer, transmision} }, actualizado }
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_COMPRAS = 'app/EvRec/EvRec.json';
const PRECIOS = { streamer: 10, transmision: 5 };
const NOMBRES_MODO = {
    base: 'Modo Base',
    streamer: 'Modo Streamer',
    transmision: 'Modo Transmisión'
};

// ---------- ESTADO ----------
let usuarioActual = null;
let compras = { streamer: false, transmision: false };
let modoActual = null;

let grabando = false;
let pausado = false;
let segundosGrabados = 0;
let timerInterval = null;

let mediaRecorder = null;
let chunks = [];
let streamsActivos = [];
let audioCtxActivo = null;
let drawLoopActivo = false;

let resultadoBlob = null;
let resultadoMime = '';
let resultadoUrl = null;

let toastTimer = null;

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
    } catch (_) {}
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('evToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ev-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function formatearBytes(n) {
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatearTiempo(segundos) {
    const m = Math.floor(segundos / 60);
    const s = Math.floor(segundos % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function mostrarVista(id) {
    document.getElementById('viewInicio').hidden = id !== 'inicio';
    document.getElementById('viewGrabando').hidden = id !== 'grabando';
    document.getElementById('viewResultado').hidden = id !== 'resultado';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  COMPRAS — vía ConfigBD (app/EvRec/EvRec.json)
// ============================================================
async function cargarCompras() {
    const bd = BD();
    if (!bd || !usuarioActual) return;
    try {
        const data = await bd.leerArchivo(ARCHIVO_COMPRAS);
        if (data && data.compras && data.compras[usuarioActual.codigo]) {
            const c = data.compras[usuarioActual.codigo];
            compras = {
                streamer: !!c.streamer,
                transmision: !!c.transmision
            };
        } else {
            compras = { streamer: false, transmision: false };
        }
    } catch (e) {
        compras = { streamer: false, transmision: false };
    }
}

async function guardarCompras() {
    const bd = BD();
    if (!bd || !usuarioActual) return;

    let data = null;
    try { data = await bd.leerArchivo(ARCHIVO_COMPRAS); } catch (e) { data = null; }

    if (!data || typeof data !== 'object') data = { version: 1, compras: {} };
    if (!data.compras || typeof data.compras !== 'object') data.compras = {};

    data.compras[usuarioActual.codigo] = { ...compras };
    data.actualizado = new Date().toISOString();

    await bd.escribirArchivo(ARCHIVO_COMPRAS, data);
}

async function comprarModo(id) {
    const api = API();
    if (!api) throw new Error('Sin conexión con VicWebOs.');
    if (compras[id]) return;

    const precio = PRECIOS[id];
    const nombre = NOMBRES_MODO[id];

    await api.gastoBoleta('screen-share', 'evrec', `Desbloquear ${nombre}`, precio);
    compras[id] = true;
    await guardarCompras();
    renderModos();
    toast(`${nombre} desbloqueado`, 'success');
}

// ============================================================
//  RENDER: MODOS
// ============================================================
function renderModos() {
    document.querySelectorAll('.ev-modo-card').forEach(card => {
        const modo = card.dataset.modo;
        const desbloqueado = modo === 'base' || compras[modo];
        card.classList.toggle('bloqueado', !desbloqueado);
        card.classList.toggle('desbloqueado', desbloqueado && modo !== 'base');

        const cta = card.querySelector('.ev-modo-cta');
        if (cta) {
            cta.innerHTML = desbloqueado
                ? '<i data-lucide="play"></i>'
                : '<i data-lucide="lock"></i>';
        }

        const badge = card.querySelector(`[data-badge="${modo}"]`);
        if (badge) {
            if (desbloqueado && modo !== 'base') {
                badge.classList.remove('ev-badge-precio');
                badge.classList.add('ev-badge-ok');
                badge.innerHTML = '<i data-lucide="check"></i> Desbloqueado';
            } else if (!desbloqueado) {
                badge.classList.remove('ev-badge-ok');
                badge.classList.add('ev-badge-precio');
                badge.innerHTML = `<i data-lucide="coins"></i> <span>${PRECIOS[modo]}</span>`;
            }
        }
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL COMPRA
// ============================================================
let modoAComprar = null;

function abrirModalCompra(modo) {
    modoAComprar = modo;
    document.getElementById('compraIcono').setAttribute('data-lucide', modo === 'streamer' ? 'sparkles' : 'radio');
    document.getElementById('compraTitulo').textContent = `Desbloquear ${NOMBRES_MODO[modo]}`;
    document.getElementById('compraDesc').textContent = modo === 'streamer'
        ? 'Grabá tu pantalla con tu cámara flotante en la esquina y micrófono activo.'
        : 'Grabá tu pantalla mezclando el audio del sistema con tu micrófono.';
    document.getElementById('compraPrecio').textContent = PRECIOS[modo];
    document.getElementById('modalCompra').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalCompra() {
    document.getElementById('modalCompra').hidden = true;
    modoAComprar = null;
}

async function confirmarCompra() {
    if (!modoAComprar) return;
    const btn = document.getElementById('compraConfirmar');
    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Comprando...';
    if (window.lucide) window.lucide.createIcons();

    try {
        await comprarModo(modoAComprar);
        const m = modoAComprar;
        cerrarModalCompra();
        setTimeout(() => iniciarGrabacion(m), 200);
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  MODAL ERROR
// ============================================================
function abrirModalError(titulo, desc) {
    document.getElementById('errorTitulo').textContent = titulo;
    document.getElementById('errorDesc').textContent = desc;
    document.getElementById('modalError').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalError() {
    document.getElementById('modalError').hidden = true;
}

// ============================================================
//  DETECCIÓN DE SOPORTE
// ============================================================
function comprobarSoporte() {
    if (!navigator.mediaDevices) return 'Tu navegador no soporta captura de medios.';
    if (typeof MediaRecorder === 'undefined') return 'Tu navegador no soporta MediaRecorder.';
    if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') return 'Tu navegador no soporta grabar la pantalla.';
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        return 'Se necesita HTTPS para grabar.';
    }
    return null;
}

// ============================================================
//  ELEGIR MIME
// ============================================================
function elegirMimeType() {
    const opciones = [
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1,mp4a',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];
    for (const m of opciones) {
        if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
}

// ============================================================
//  ROUNDED RECT HELPER (canvas)
// ============================================================
function roundRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ============================================================
//  MEZCLAR AUDIO (para Modo Transmisión)
//  Combina audio del sistema + micrófono en una sola pista
// ============================================================
async function mezclarAudioTracks(tracks) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const dest = ctx.createMediaStreamDestination();

    tracks.forEach(track => {
        if (!track) return;
        try {
            const src = ctx.createMediaStreamSource(new MediaStream([track]));
            src.connect(dest);
        } catch (e) {
            console.warn('[EvRec] No se pudo mezclar pista:', e);
        }
    });

    audioCtxActivo = ctx;
    return dest.stream.getAudioTracks()[0];
}

// ============================================================
//  FLUJO DE GRABACIÓN
// ============================================================
async function iniciarGrabacion(modo) {
    modoActual = modo;
    chunks = [];
    segundosGrabados = 0;
    streamsActivos = [];
    pausado = false;
    drawLoopActivo = false;

    document.getElementById('modoActualLabel').textContent = NOMBRES_MODO[modo];
    document.getElementById('timerDisplay').textContent = '00:00';
    document.getElementById('previewHint').hidden = false;
    document.getElementById('previewBadge').style.display = 'none';

    mostrarVista('grabando');

    try {
        const finalStream = await construirStream(modo);
        arrancarMediaRecorder(finalStream, modo);
    } catch (e) {
        console.error('[EvRec]', e);
        let titulo = 'No se pudo iniciar';
        let desc = e.message || 'Error desconocido.';
        if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
            titulo = 'Permiso cancelado';
            desc = 'Cancelaste el diálogo de captura o no diste permiso.';
        } else if (e.name === 'NotFoundError') {
            titulo = 'Dispositivo no encontrado';
            desc = 'No encontramos cámara ni pantalla para compartir.';
        } else if (e.name === 'NotReadableError') {
            titulo = 'Dispositivo en uso';
            desc = 'Otra app está usando la cámara o el micrófono.';
        } else if (e.name === 'OverconstrainedError') {
            titulo = 'Restricciones no soportadas';
            desc = 'La configuración pedida no está disponible en este dispositivo.';
        }
        abrirModalError(titulo, desc);
        limpiarTodo();
        mostrarVista('inicio');
    }
}

async function construirStream(modo) {
    // ----------------------------------------------------------
    //  MODO BASE: pantalla + audio del sistema
    // ----------------------------------------------------------
    if (modo === 'base') {
        const display = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: true
        });
        streamsActivos.push(display);

        if (display.getAudioTracks().length === 0) {
            setTimeout(() => {
                toast('Sin audio del sistema (tu navegador no lo permite)', 'info');
            }, 800);
        }
        return display;
    }

    // ----------------------------------------------------------
    //  MODO STREAMER: pantalla + cámara PiP + micrófono
    // ----------------------------------------------------------
    if (modo === 'streamer') {
        const display = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: false
        });
        streamsActivos.push(display);

        const cam = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: 'user' },
            audio: true
        });
        streamsActivos.push(cam);

        return await construirStreamerStream(display, cam);
    }

    // ----------------------------------------------------------
    //  MODO TRANSMISIÓN: pantalla + audio del sistema + micrófono
    // ----------------------------------------------------------
    if (modo === 'transmision') {
        const display = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: true
        });
        streamsActivos.push(display);

        const mic = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true
        });
        streamsActivos.push(mic);

        const screenAudio = display.getAudioTracks();
        const micAudio = mic.getAudioTracks();

        const mixed = new MediaStream();
        display.getVideoTracks().forEach(t => mixed.addTrack(t));

        if (screenAudio.length > 0 && micAudio.length > 0) {
            // Mezclar los dos audios
            try {
                const mixedTrack = await mezclarAudioTracks([screenAudio[0], micAudio[0]]);
                mixed.addTrack(mixedTrack);
            } catch (e) {
                console.warn('[EvRec] Fallback a solo micrófono:', e);
                micAudio.forEach(t => mixed.addTrack(t));
                toast('No se pudo mezclar el audio del sistema, solo se graba el micrófono', 'info');
            }
        } else if (screenAudio.length > 0) {
            screenAudio.forEach(t => mixed.addTrack(t));
        } else {
            micAudio.forEach(t => mixed.addTrack(t));
            setTimeout(() => {
                toast('Sin audio del sistema (tu navegador no lo permite) — solo se graba tu micrófono', 'info');
            }, 800);
        }

        return mixed;
    }

    throw new Error('Modo desconocido: ' + modo);
}

// ------------------------------------------------------------
//  Streamer: combina pantalla + cámara en canvas
// ------------------------------------------------------------
async function construirStreamerStream(displayStream, camStream) {
    const screenVideo = document.createElement('video');
    screenVideo.srcObject = displayStream;
    screenVideo.muted = true;
    screenVideo.playsInline = true;
    await screenVideo.play();

    const camVideo = document.createElement('video');
    camVideo.srcObject = camStream;
    camVideo.muted = true;
    camVideo.playsInline = true;
    await camVideo.play();

    await new Promise(resolve => {
        if (screenVideo.videoWidth > 0) return resolve();
        screenVideo.onloadedmetadata = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = screenVideo.videoWidth || 1280;
    canvas.height = screenVideo.videoHeight || 720;
    const ctx = canvas.getContext('2d');

    drawLoopActivo = true;
    const pipW = Math.max(160, Math.floor(canvas.width * 0.22));
    const pipH = Math.floor(pipW * 0.75);
    const margen = Math.max(12, Math.floor(canvas.width * 0.02));
    const pipX = canvas.width - pipW - margen;
    const pipY = canvas.height - pipH - margen;
    const radio = Math.max(8, Math.floor(pipW * 0.06));

    function dibujar() {
        if (!drawLoopActivo) return;

        if (screenVideo.videoWidth > 0) {
            ctx.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#000';
        roundRect(ctx, pipX, pipY, pipW, pipH, radio);
        ctx.fill();
        ctx.restore();

        if (camVideo.videoWidth > 0) {
            ctx.save();
            roundRect(ctx, pipX, pipY, pipW, pipH, radio);
            ctx.clip();
            const camAR = camVideo.videoWidth / camVideo.videoHeight;
            const pipAR = pipW / pipH;
            let dw = pipW, dh = pipH, dx = pipX, dy = pipY;
            if (camAR > pipAR) {
                dw = pipH * camAR;
                dx = pipX - (dw - pipW) / 2;
            } else {
                dh = pipW / camAR;
                dy = pipY - (dh - pipH) / 2;
            }
            ctx.drawImage(camVideo, dx, dy, dw, dh);
            ctx.restore();
        }

        ctx.save();
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.85)';
        ctx.lineWidth = Math.max(2, Math.floor(canvas.width * 0.0025));
        roundRect(ctx, pipX, pipY, pipW, pipH, radio);
        ctx.stroke();
        ctx.restore();

        requestAnimationFrame(dibujar);
    }
    requestAnimationFrame(dibujar);

    const canvasStream = canvas.captureStream(30);
    camStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    window.__streamerRefs = { screenVideo, camVideo, canvas };
    streamsActivos.push(canvasStream);

    return canvasStream;
}

// ------------------------------------------------------------
//  Arranca MediaRecorder sobre el stream final
// ------------------------------------------------------------
function arrancarMediaRecorder(stream, modo) {
    const mime = elegirMimeType();
    let recorder;
    try {
        recorder = mime
            ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 })
            : new MediaRecorder(stream);
    } catch (e) {
        recorder = new MediaRecorder(stream);
    }

    resultadoMime = recorder.mimeType || mime || 'video/webm';

    const video = document.getElementById('previewVideo');
    video.srcObject = stream;
    video.play().catch(() => {});

    // Si el usuario corta el share desde el navegador
    stream.getVideoTracks().forEach(t => {
        t.addEventListener('ended', () => {
            if (grabando) detenerGrabacion();
        });
    });

    recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: resultadoMime });
        finalizarGrabacion(blob);
    };

    recorder.onerror = (e) => {
        console.error('[EvRec] MediaRecorder error:', e);
        toast('Error al grabar', 'error');
    };

    recorder.start(1000);

    mediaRecorder = recorder;
    grabando = true;

    document.getElementById('previewHint').hidden = true;
    document.getElementById('previewBadge').style.display = 'flex';

    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (pausado) return;
        segundosGrabados++;
        document.getElementById('timerDisplay').textContent = formatearTiempo(segundosGrabados);
    }, 1000);

    window.addEventListener('beforeunload', antesDeCerrar);
}

function antesDeCerrar(e) {
    if (grabando) {
        e.preventDefault();
        e.returnValue = '';
    }
}

function togglePausa() {
    if (!mediaRecorder || !grabando) return;
    const txt = document.getElementById('btnPausarTxt');
    const icon = document.querySelector('#btnPausar [data-lucide]');

    if (pausado) {
        try {
            mediaRecorder.resume();
            pausado = false;
            if (txt) txt.textContent = 'Pausar';
            if (icon) icon.setAttribute('data-lucide', 'pause');
            const b = document.getElementById('previewBadge');
            b.innerHTML = '<i data-lucide="radio"></i><span>REC</span>';
            b.classList.remove('pausado');
        } catch (_) {}
    } else {
        try {
            mediaRecorder.pause();
            pausado = true;
            if (txt) txt.textContent = 'Reanudar';
            if (icon) icon.setAttribute('data-lucide', 'play');
            const b = document.getElementById('previewBadge');
            b.innerHTML = '<i data-lucide="pause"></i><span>PAUSA</span>';
            b.classList.add('pausado');
        } catch (_) {}
    }
    if (window.lucide) window.lucide.createIcons();
}

function detenerGrabacion() {
    if (!grabando || !mediaRecorder) return;
    try {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    } catch (_) {}
    grabando = false;
    clearInterval(timerInterval);
    timerInterval = null;
}

function limpiarTodo() {
    // Detener pistas
    streamsActivos.forEach(s => {
        try { s.getTracks().forEach(t => t.stop()); } catch (_) {}
    });
    streamsActivos = [];

    // Cerrar AudioContext
    if (audioCtxActivo) {
        try { audioCtxActivo.close(); } catch (_) {}
        audioCtxActivo = null;
    }

    // Limpiar canvas refs
    if (window.__streamerRefs) {
        try {
            window.__streamerRefs.screenVideo.srcObject = null;
            window.__streamerRefs.camVideo.srcObject = null;
        } catch (_) {}
        window.__streamerRefs = null;
    }
    drawLoopActivo = false;

    const video = document.getElementById('previewVideo');
    if (video) video.srcObject = null;

    mediaRecorder = null;
    grabando = false;
    pausado = false;
    window.removeEventListener('beforeunload', antesDeCerrar);
}

// ============================================================
//  RESULTADO
// ============================================================
function finalizarGrabacion(blob) {
    limpiarTodo();

    if (!blob || blob.size === 0) {
        toast('La grabación quedó vacía', 'error');
        mostrarVista('inicio');
        return;
    }

    if (resultadoUrl) URL.revokeObjectURL(resultadoUrl);

    resultadoBlob = blob;
    resultadoUrl = URL.createObjectURL(blob);

    const esMp4 = resultadoMime.includes('mp4');
    const ext = esMp4 ? 'MP4' : 'WebM';

    document.getElementById('resultDuracion').textContent = formatearTiempo(segundosGrabados);
    document.getElementById('resultPeso').textContent = formatearBytes(blob.size);
    document.getElementById('resultFormato').textContent = ext;
    document.getElementById('resultModo').textContent = NOMBRES_MODO[modoActual] || '—';

    const video = document.getElementById('resultVideo');
    video.src = resultadoUrl;

    mostrarVista('resultado');
}

function descargarResultado() {
    if (!resultadoBlob) return;

    const esMp4 = resultadoMime.includes('mp4');
    const ext = esMp4 ? 'mp4' : 'webm';

    const fecha = new Date();
    const stamp = `${fecha.getFullYear()}${String(fecha.getMonth()+1).padStart(2,'0')}${String(fecha.getDate()).padStart(2,'0')}_${String(fecha.getHours()).padStart(2,'0')}${String(fecha.getMinutes()).padStart(2,'0')}`;
    const nombre = `evrec_${modoActual}_${stamp}.${ext}`;

    try {
        const a = document.createElement('a');
        a.href = resultadoUrl;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('Descargando ' + nombre, 'success');
    } catch (e) {
        toast('No se pudo descargar', 'error');
    }
}

function descartarResultado() {
    if (!resultadoBlob) return;
    if (!confirm('¿Descartar esta grabación? No se puede recuperar.')) return;
    if (resultadoUrl) {
        URL.revokeObjectURL(resultadoUrl);
        resultadoUrl = null;
    }
    resultadoBlob = null;
    resultadoMime = '';
    const video = document.getElementById('resultVideo');
    video.src = '';
    mostrarVista('inicio');
    toast('Grabación descartada', 'info');
}

// ============================================================
//  BIND UI
// ============================================================
function bindUI() {
    document.querySelectorAll('.ev-modo-card').forEach(card => {
        card.addEventListener('click', () => {
            const modo = card.dataset.modo;
            const desbloqueado = modo === 'base' || compras[modo];

            if (!desbloqueado) {
                abrirModalCompra(modo);
                return;
            }

            const error = comprobarSoporte();
            if (error) {
                abrirModalError('Función no soportada', error);
                return;
            }

            iniciarGrabacion(modo);
        });
    });

    document.getElementById('btnPausar')?.addEventListener('click', togglePausa);
    document.getElementById('btnDetener')?.addEventListener('click', () => {
        if (confirm('¿Detener la grabación?')) detenerGrabacion();
    });

    document.getElementById('btnDescargar')?.addEventListener('click', descargarResultado);
    document.getElementById('btnDescartar')?.addEventListener('click', descartarResultado);
    document.getElementById('btnRegrabar')?.addEventListener('click', () => {
        if (resultadoBlob && !confirm('¿Descartar esta grabación y empezar de nuevo?')) return;
        if (resultadoUrl) {
            URL.revokeObjectURL(resultadoUrl);
            resultadoUrl = null;
        }
        resultadoBlob = null;
        resultadoMime = '';
        document.getElementById('resultVideo').src = '';
        mostrarVista('inicio');
    });

    document.getElementById('compraCancelar')?.addEventListener('click', cerrarModalCompra);
    document.getElementById('compraConfirmar')?.addEventListener('click', confirmarCompra);
    document.getElementById('modalCompra')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalCompra') cerrarModalCompra();
    });

    document.getElementById('errorCerrar')?.addEventListener('click', cerrarModalError);
    document.getElementById('modalError')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalError') cerrarModalError();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('modalCompra').hidden) cerrarModalCompra();
        if (!document.getElementById('modalError').hidden) cerrarModalError();
    });

    window.addEventListener('beforeunload', (e) => {
        if (grabando || resultadoBlob) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || { codigo: 'anon', nombre: 'Anónimo' };

    const badge = document.getElementById('userBadge');
    if (badge) {
        badge.textContent = usuarioActual?.codigo ? `@${usuarioActual.codigo}` : '—';
    }

    await cargarCompras();
    renderModos();
    bindUI();
    mostrarVista('inicio');

    const err = comprobarSoporte();
    if (err) {
        setTimeout(() => abrirModalError('Función no disponible', err), 400);
    }

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
