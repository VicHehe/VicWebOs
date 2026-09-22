// ============================================================
//  Cámara — Toma fotos con filtros, marcos y funciones premium
//  ------------------------------------------------------------
//  · App de instalación: 5 monedas.
//  · 10 compras internas (5 a 25 monedas) por usuario.
//  · TODO el UI respeta el tema del SO (var(--...)).
//  · Único punto oscuro: el viewfinder (porque es video).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_COMPRAS = 'app/camara/camara.json';

// ============================================================
//  Catálogo de compras
// ============================================================
const FILTROS = [
    { id: 'ninguno', nombre: 'Original', precio: 0, css: 'none',
      descripcion: 'Sin filtro, la foto tal cual sale de la cámara.' },
    { id: 'filtro_bn', nombre: 'B&N', precio: 5, css: 'grayscale(1)',
      descripcion: 'Escala de grises clásica.' },
    { id: 'filtro_sepia', nombre: 'Sepia', precio: 5, css: 'sepia(0.85)',
      descripcion: 'Tono vintage cálido, estilo foto antigua.' },
    { id: 'filtro_calido', nombre: 'Cálido', precio: 10,
      css: 'saturate(1.35) sepia(0.15) brightness(1.05)',
      descripcion: 'Tonos cálidos y luminosos, ideal para atardeceres.' },
    { id: 'filtro_frio', nombre: 'Frío', precio: 10,
      css: 'saturate(0.85) brightness(1.05) contrast(1.05)',
      descripcion: 'Tonos suaves y fríos, aspecto cinematográfico.' },
    { id: 'filtro_vineta', nombre: 'Viñeta', precio: 15, css: 'none',
      descripcion: 'Oscurece las esquinas para dar foco al centro.' }
];

const MARCOS = [
    { id: 'ninguno', nombre: 'Sin marco', precio: 0,
      descripcion: 'La foto sin decoración.' },
    { id: 'marco_polaroid', nombre: 'Polaroid', precio: 20,
      descripcion: 'Marco blanco clásico con espacio para la fecha abajo.' },
    { id: 'marco_retro', nombre: 'Retro Film', precio: 25,
      descripcion: 'Marco negro con perforaciones de película antigua.' }
];

const FUNCIONES = [
    { id: 'cuadricula', nombre: 'Cuadrícula', precio: 5, icono: 'grid-3x3',
      descripcion: 'Regla de tercios para componer mejor tus fotos.' },
    { id: 'espejo', nombre: 'Espejo', precio: 5, icono: 'flip-horizontal-2',
      descripcion: 'Voltea la imagen horizontalmente, como un espejo.' },
    { id: 'temporizador', nombre: 'Temporizador', precio: 10, icono: 'timer',
      descripcion: 'Retardo de 3, 5 o 10 segundos antes de capturar.' }
];

const ITEMS = {};
[...FILTROS, ...MARCOS, ...FUNCIONES].forEach(i => { ITEMS[i.id] = i; });

// ============================================================
//  Estado
// ============================================================
let usuarioActual = null;
let compras = {};
let stream = null;
let facingMode = 'environment';
let filtroActivo = 'ninguno';
let marcoActivo = 'ninguno';
let cuadriculaActiva = false;
let espejoActivo = false;
let temporizadorSeg = 0;
let tabActual = 'filtros';
let fotoBlob = null;
let fotoUrl = null;
let capturando = false;
let toastTimeout = null;
let modalPendiente = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  Tema heredado
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
//  Toast
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('camToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'cam-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  Compras
// ============================================================
async function cargarCompras() {
    const bd = BD();
    if (!bd || !usuarioActual) return;
    try {
        const data = await bd.leerArchivo(ARCHIVO_COMPRAS);
        if (data && data.compras && data.compras[usuarioActual.codigo]) {
            compras = data.compras[usuarioActual.codigo] || {};
        } else {
            compras = {};
        }
    } catch (e) {
        compras = {};
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

function estaDesbloqueado(id) {
    if (id === 'ninguno' || id === '') return true;
    const item = ITEMS[id];
    if (!item) return false;
    if (item.precio === 0) return true;
    return !!compras[id];
}

// ============================================================
//  Modal de compra
// ============================================================
function abrirModalCompra(tipo, id) {
    const item = ITEMS[id];
    if (!item) return;
    modalPendiente = { tipo, id };

    const iconoMap = { filtro: 'palette', marco: 'square', funcion: 'sparkles' };
    document.getElementById('camModalIcono').setAttribute('data-lucide', iconoMap[tipo] || 'lock');
    document.getElementById('camModalTitulo').textContent = `Desbloquear "${item.nombre}"`;
    document.getElementById('camModalDesc').textContent = item.descripcion || '';
    document.getElementById('camModalPrecio').textContent = item.precio;
    document.getElementById('camModal').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalCompra() {
    modalPendiente = null;
    document.getElementById('camModal').hidden = true;
}

async function confirmarCompra() {
    if (!modalPendiente) return;
    const { tipo, id } = modalPendiente;
    const item = ITEMS[id];
    if (!item) return;

    const api = API();
    if (!api) { toast('Sin conexión con VicWebOs', 'error'); return; }

    const btn = document.getElementById('camModalConfirmar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        await api.gastoBoleta('camera', 'camara', `${tipo}: ${item.nombre}`, item.precio);
        compras[id] = true;
        await guardarCompras();
        toast('Función desbloqueada', 'success');
        cerrarModalCompra();
        renderOpciones();
    } catch (e) {
        toast(e.message || 'No se pudo completar', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  Cámara
// ============================================================
async function iniciarCamara(preferencia = 'environment') {
    detenerCamara();
    const $video = document.getElementById('camVideo');
    const $mensaje = document.getElementById('camMensaje');

    try {
        let s;
        try {
            s = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: preferencia },
                audio: false
            });
        } catch (e) {
            s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        stream = s;
        $video.srcObject = s;
        $video.style.display = 'block';
        if ($mensaje) $mensaje.hidden = true;
        return true;
    } catch (e) {
        console.warn('[Cámara] Error:', e);
        $video.style.display = 'none';
        if ($mensaje) {
            $mensaje.hidden = false;
            $mensaje.innerHTML = `
                <div class="cam-mensaje-card">
                    <i data-lucide="camera-off"></i>
                    <h3>No se pudo acceder a la cámara</h3>
                    <p>${e.name === 'NotAllowedError'
                        ? 'Permiso denegado. Autoriza el acceso a la cámara para usar esta app.'
                        : 'No se encontró una cámara disponible en este dispositivo.'}</p>
                    <button class="cam-btn-pri" onclick="iniciarCamara('environment')">
                        <i data-lucide="refresh-cw"></i>
                        <span>Reintentar</span>
                    </button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
        return false;
    }
}

function detenerCamara() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
    }
}

window.iniciarCamara = iniciarCamara;

async function cambiarCamara() {
    const previo = facingMode;
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    const ok = await iniciarCamara(facingMode);
    if (!ok) facingMode = previo;
}

// ============================================================
//  Captura
// ============================================================
function obtenerFiltroCSS(id) {
    const f = FILTROS.find(x => x.id === id);
    return f ? f.css : 'none';
}

async function capturar() {
    if (capturando) return;
    capturando = true;

    const $video = document.getElementById('camVideo');
    if (!stream || !$video.videoWidth) {
        toast('La cámara no está lista', 'error');
        capturando = false;
        return;
    }

    try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}

    const viewfinder = document.getElementById('camViewfinder');
    viewfinder.classList.add('flash');
    setTimeout(() => viewfinder.classList.remove('flash'), 220);

    const rect = $video.getBoundingClientRect();
    const displayRatio = rect.width / rect.height;

    const maxDim = 1600;
    let cw, ch;
    if (displayRatio >= 1) {
        cw = maxDim;
        ch = Math.round(maxDim / displayRatio);
    } else {
        ch = maxDim;
        cw = Math.round(maxDim * displayRatio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const videoRatio = $video.videoWidth / $video.videoHeight;
    let sx, sy, sw, sh;
    if (videoRatio > displayRatio) {
        sh = $video.videoHeight;
        sw = sh * displayRatio;
        sx = ($video.videoWidth - sw) / 2;
        sy = 0;
    } else {
        sw = $video.videoWidth;
        sh = sw / displayRatio;
        sx = 0;
        sy = ($video.videoHeight - sh) / 2;
    }

    try { ctx.filter = obtenerFiltroCSS(filtroActivo); } catch (e) {}

    if (espejoActivo) {
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage($video, sx, sy, sw, sh, -cw, 0, cw, ch);
        ctx.restore();
    } else {
        ctx.drawImage($video, sx, sy, sw, sh, 0, 0, cw, ch);
    }
    ctx.filter = 'none';

    if (filtroActivo === 'filtro_vineta') aplicarVineta(ctx, cw, ch);
    if (marcoActivo !== 'ninguno') aplicarMarcoCanvas(ctx, cw, ch, marcoActivo);

    const blob = await new Promise(resolve => {
        canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92);
    });

    if (!blob) {
        toast('No se pudo procesar la foto', 'error');
        capturando = false;
        return;
    }

    fotoBlob = blob;
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    fotoUrl = URL.createObjectURL(blob);

    document.getElementById('camPreviewImg').src = fotoUrl;
    document.getElementById('camPreviewView').hidden = false;
    capturando = false;
}

function aplicarVineta(ctx, w, h) {
    const grad = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.25,
        w / 2, h / 2, Math.max(w, h) * 0.75
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
}

function aplicarMarcoCanvas(ctx, w, h, marcoId) {
    if (marcoId === 'marco_polaroid') {
        const bordeL = w * 0.045;
        const bordeS = h * 0.045;
        const bordeI = h * 0.20;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, bordeS);
        ctx.fillRect(0, h - bordeI, w, bordeI);
        ctx.fillRect(0, bordeS, bordeL, h - bordeS - bordeI);
        ctx.fillRect(w - bordeL, bordeS, bordeL, h - bordeS - bordeI);

        ctx.fillStyle = '#7A7A7A';
        ctx.font = `600 ${Math.round(h * 0.028)}px Nunito, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fecha = new Date().toLocaleDateString('es-CL', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        ctx.fillText(fecha, w / 2, h - bordeI / 2);

    } else if (marcoId === 'marco_retro') {
        const bordeL = w * 0.085;
        const bordeS = h * 0.05;
        const bordeI = h * 0.05;

        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, w, bordeS);
        ctx.fillRect(0, h - bordeI, w, bordeI);
        ctx.fillRect(0, 0, bordeL, h);
        ctx.fillRect(w - bordeL, 0, bordeL, h);

        const agujeroW = bordeL * 0.5;
        const agujeroH = agujeroW * 0.7;
        const paso = agujeroH * 2.4;
        const numAgujeros = Math.floor((h - bordeS - bordeI) / paso);
        const altoTotal = (numAgujeros - 1) * paso + agujeroH;
        const offsetY = bordeS + (h - bordeS - bordeI - altoTotal) / 2;

        ctx.fillStyle = '#FFFFFF';
        const radio = agujeroH * 0.25;
        for (let i = 0; i < numAgujeros; i++) {
            const y = offsetY + i * paso;
            roundRectFill(ctx, (bordeL - agujeroW) / 2, y, agujeroW, agujeroH, radio);
            roundRectFill(ctx, w - bordeL + (bordeL - agujeroW) / 2, y, agujeroW, agujeroH, radio);
        }
    }
}

function roundRectFill(ctx, x, y, w, h, r) {
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
    ctx.fill();
}

// ============================================================
//  Disparo (con temporizador opcional)
// ============================================================
async function disparar() {
    if (capturando) return;

    if (temporizadorSeg > 0) {
        await new Promise(resolve => {
            let seg = temporizadorSeg;
            const overlay = document.getElementById('camTimerDisplay');
            overlay.hidden = false;
            overlay.textContent = seg;

            const interval = setInterval(() => {
                seg--;
                if (seg <= 0) {
                    clearInterval(interval);
                    overlay.hidden = true;
                    resolve();
                } else {
                    overlay.textContent = seg;
                    try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
                }
            }, 1000);
        });
    }

    await capturar();
}

// ============================================================
//  Vista previa: descargar / enviar a galería
// ============================================================
function descargarFoto() {
    if (!fotoBlob) return;
    const url = URL.createObjectURL(fotoBlob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `camara_${ts}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Foto descargada', 'success');
}

async function enviarAGaleria() {
    if (!fotoBlob || !usuarioActual) return;
    const mh = MH();
    if (!mh) { toast('Sin conexión al sistema', 'error'); return; }

    const btn = document.getElementById('camBtnGaleria');
    if (btn.disabled) return;
    btn.disabled = true;

    const textoOriginal = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i><span>Enviando...</span>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const file = new File([fotoBlob], `camara_${ts}.jpg`, { type: 'image/jpeg' });
        await mh.galeria.subirImagen(file, {
            codigo: usuarioActual.codigo,
            carpeta: 'c_general'
        });
        toast('Guardado en Galería', 'success');
    } catch (e) {
        console.warn(e);
        toast(e.message || 'No se pudo enviar', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
        if (window.lucide) window.lucide.createIcons();
    }
}

function volverDePreview() {
    document.getElementById('camPreviewView').hidden = true;
    if (fotoUrl) { URL.revokeObjectURL(fotoUrl); fotoUrl = null; }
    fotoBlob = null;
    document.getElementById('camPreviewImg').removeAttribute('src');
    capturando = false;
}

// ============================================================
//  Render de chips
// ============================================================
function renderOpciones() {
    const cont = document.getElementById('camOptions');
    if (!cont) return;

    if (tabActual === 'filtros') {
        cont.innerHTML = FILTROS.map(f => {
            const bloqueado = !estaDesbloqueado(f.id);
            const activo = filtroActivo === f.id;
            const stylePreview = f.css !== 'none' ? `filter:${f.css};` : '';
            return `
                <button class="cam-chip ${activo ? 'activo' : ''} ${bloqueado ? 'bloqueado' : ''}"
                        data-tipo="filtro" data-id="${f.id}">
                    <div class="cam-chip-preview" style="${stylePreview}"></div>
                    <span class="cam-chip-nombre">${f.nombre}</span>
                    ${bloqueado ? `<span class="cam-chip-lock"><i data-lucide="lock"></i></span>` : ''}
                </button>
            `;
        }).join('');

    } else if (tabActual === 'marcos') {
        cont.innerHTML = MARCOS.map(m => {
            const bloqueado = !estaDesbloqueado(m.id);
            const activo = marcoActivo === m.id;
            const clasePreview =
                m.id === 'marco_polaroid' ? 'marco-preview-polaroid' :
                m.id === 'marco_retro' ? 'marco-preview-retro' : '';
            return `
                <button class="cam-chip ${activo ? 'activo' : ''} ${bloqueado ? 'bloqueado' : ''}"
                        data-tipo="marco" data-id="${m.id}">
                    <div class="cam-chip-preview cam-chip-preview-marco ${clasePreview}"></div>
                    <span class="cam-chip-nombre">${m.nombre}</span>
                    ${bloqueado ? `<span class="cam-chip-lock"><i data-lucide="lock"></i></span>` : ''}
                </button>
            `;
        }).join('');

    } else if (tabActual === 'funciones') {
        cont.innerHTML = FUNCIONES.map(f => {
            const bloqueado = !estaDesbloqueado(f.id);
            let activo = false;
            let estadoSecundario = '';

            if (f.id === 'cuadricula') activo = cuadriculaActiva;
            if (f.id === 'espejo')     activo = espejoActivo;
            if (f.id === 'temporizador') {
                activo = temporizadorSeg > 0;
                if (temporizadorSeg > 0) estadoSecundario = ` · ${temporizadorSeg}s`;
            }

            return `
                <button class="cam-chip ${activo ? 'activo' : ''} ${bloqueado ? 'bloqueado' : ''}"
                        data-tipo="funcion" data-id="${f.id}">
                    <div class="cam-chip-icon"><i data-lucide="${f.icono}"></i></div>
                    <span class="cam-chip-nombre">${f.nombre}${estadoSecundario}</span>
                    ${bloqueado ? `<span class="cam-chip-lock"><i data-lucide="lock"></i></span>` : ''}
                </button>
            `;
        }).join('');
    }

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.cam-chip').forEach(chip => {
        chip.addEventListener('click', () => manejarClickChip(chip.dataset.tipo, chip.dataset.id));
    });
}

function manejarClickChip(tipo, id) {
    if (!estaDesbloqueado(id)) {
        abrirModalCompra(tipo, id);
        return;
    }

    if (tipo === 'filtro') {
        filtroActivo = id;
        actualizarFiltroLive();
    } else if (tipo === 'marco') {
        marcoActivo = id;
        actualizarMarcoLive();
    } else if (tipo === 'funcion') {
        if (id === 'cuadricula') {
            cuadriculaActiva = !cuadriculaActiva;
            actualizarCuadriculaLive();
        } else if (id === 'espejo') {
            espejoActivo = !espejoActivo;
            actualizarEspejoLive();
        } else if (id === 'temporizador') {
            temporizadorSeg = temporizadorSeg === 0 ? 3
                            : temporizadorSeg === 3 ? 5
                            : temporizadorSeg === 5 ? 10 : 0;
            toast(temporizadorSeg > 0 ? `Temporizador: ${temporizadorSeg}s` : 'Temporizador desactivado', 'info');
        }
    }

    renderOpciones();
}

// ============================================================
//  Actualizaciones en vivo
// ============================================================
function actualizarFiltroLive() {
    const $video = document.getElementById('camVideo');
    const $vin = document.getElementById('camVignetteLive');

    if (filtroActivo === 'filtro_vineta') {
        $video.style.filter = '';
        if ($vin) $vin.hidden = false;
    } else {
        const css = obtenerFiltroCSS(filtroActivo);
        $video.style.filter = css === 'none' ? '' : css;
        if ($vin) $vin.hidden = true;
    }
}

function actualizarMarcoLive() {
    const $frame = document.getElementById('camFrameOverlay');
    if (!$frame) return;
    if (marcoActivo === 'ninguno') { $frame.hidden = true; return; }
    $frame.hidden = false;
    $frame.className = 'cam-frame-overlay';
    if (marcoActivo === 'marco_polaroid') $frame.classList.add('polaroid');
    if (marcoActivo === 'marco_retro')    $frame.classList.add('retro');
}

function actualizarCuadriculaLive() {
    const $grid = document.getElementById('camGridOverlay');
    if ($grid) $grid.hidden = !cuadriculaActiva;
}

function actualizarEspejoLive() {
    const $video = document.getElementById('camVideo');
    $video.style.transform = espejoActivo ? 'scaleX(-1)' : '';
}

// ============================================================
//  Tabs
// ============================================================
function cambiarTab(tab) {
    tabActual = tab;
    document.querySelectorAll('.cam-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    renderOpciones();
}

// ============================================================
//  Init
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Cámara necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('camUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar la Cámara.');
        return;
    }

    await cargarCompras();

    await iniciarCamara(facingMode);
    renderOpciones();
    actualizarCuadriculaLive();
    actualizarEspejoLive();
    actualizarMarcoLive();
    actualizarFiltroLive();

    document.querySelectorAll('.cam-tab').forEach(t => {
        t.addEventListener('click', () => cambiarTab(t.dataset.tab));
    });
    document.getElementById('camShutterBtn')?.addEventListener('click', disparar);
    document.getElementById('camCambiarCamara')?.addEventListener('click', cambiarCamara);
    document.getElementById('camPreviewVolver')?.addEventListener('click', volverDePreview);
    document.getElementById('camBtnDescargar')?.addEventListener('click', descargarFoto);
    document.getElementById('camBtnGaleria')?.addEventListener('click', enviarAGaleria);

    document.getElementById('camModalCancelar')?.addEventListener('click', cerrarModalCompra);
    document.getElementById('camModalConfirmar')?.addEventListener('click', confirmarCompra);
    document.getElementById('camModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'camModal') cerrarModalCompra();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('camModal').hidden) { cerrarModalCompra(); return; }
            if (!document.getElementById('camPreviewView').hidden) volverDePreview();
            return;
        }
        if (e.key === ' ' && document.getElementById('camPreviewView').hidden) {
            e.preventDefault();
            disparar();
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    detenerCamara();
    if (fotoUrl) URL.revokeObjectURL(fotoUrl);
});
