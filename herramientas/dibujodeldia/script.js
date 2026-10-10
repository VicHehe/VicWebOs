// ============================================================
//  Dibujo del día — Concurso diario de dibujo
//  ------------------------------------------------------------
//  · Un dibujo por usuario por día
//  · Cada uno vota a los demás (1-10). No podés votar el tuyo.
//  · El día cierra a las 00:00 (hora Santiago de Chile, oculto).
//  · Top 3 del día: 25 / 15 / 5 monedas. Mínimo 3 participantes.
//  · Desempate: mediana → promedio → quién subió primero.
//  · Los puntajes NO se ven hasta el día siguiente.
//  · Usa el picker de temas comprados (mismo sistema que CV).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_DIBUJOS = 'app/dibujodeldia/dibujos.json';
const RUTA_VOTOS   = 'app/dibujodeldia/votos.json';
const CUENTAS_FILE = 'cuenta.json';

const CANVAS_SIZE = 400;             // px
const JPEG_QUALITY = 0.7;            // punto de partida
const JPEG_QUALITY_MIN = 0.35;       // piso si el archivo queda muy grande
const MAX_BYTES = 50000;             // 50 KB hard cap
const MAX_DIBUJOS_POR_DIA = 40;
const PREMIOS = [25, 15, 5];         // 1°, 2°, 3°
const MIN_PARTICIPANTES = 3;
const HISTORIAL_MAX = 60;            // días a mostrar

// ------------------------------------------------------------
//  Estado
// ------------------------------------------------------------
let usuarioActual = null;
let usuariosPorCodigo = {};

let dibujos = { version: 1, porFecha: {} };
let votos   = { version: 1, porFecha: {} };

let tabActual = 'hoy';
let fechaHoy = null;

// Editor de dibujo
let editando = false;
let dibujando = false;
let historialDibujo = [];    // stack de ImageData para deshacer
let colorActivo = '#000000';
let tamanioPincel = 6;
let temaDibujo = null;
let temasDisponibles = [];
let cacheVarsTemas = {};
let paletaActual = [];

// Modales
let dibujoVotandoId = null;

// Timers
let toastTimer = null;
let tickTimer = null;

// Canvas refs (se asignan en init)
let canvas = null;
let ctx = null;

// ------------------------------------------------------------
//  API del shell
// ------------------------------------------------------------
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

// ============================================================
//  TEMA DEL SHELL
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const sp = getComputedStyle(rootPadre);
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
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}
window.addEventListener('message', e => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ddToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'dd-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ============================================================
//  HELPERS
// ============================================================
const $ = id => document.getElementById(id);

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generarId(p) {
    return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  FECHAS (huso Santiago de Chile, oculto al jugador)
// ============================================================
function fechaSantiagoHoy() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

function msHastaMedianocheSantiago() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    const h = parseInt(partes.find(p => p.type === 'hour').value, 10);
    const m = parseInt(partes.find(p => p.type === 'minute').value, 10);
    const s = parseInt(partes.find(p => p.type === 'second').value, 10);
    const totalSeg = h * 3600 + m * 60 + s;
    return (86400 - totalSeg) * 1000;
}

function formatearCuentaAtras(ms) {
    if (ms <= 0) return '0m';
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h >= 1) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatearFechaBonita(iso) {
    const [y, m, d] = iso.split('-');
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]}`;
}

// ============================================================
//  CARGA / GUARDADO
// ============================================================
async function cargarDatos() {
    const bd = BD();
    if (!bd) return;
    try {
        const d = await bd.leerArchivoFresh(RUTA_DIBUJOS);
        if (d && typeof d === 'object' && d.porFecha) dibujos = d;
    } catch (e) { /* no existe */ }
    try {
        const v = await bd.leerArchivoFresh(RUTA_VOTOS);
        if (v && typeof v === 'object' && v.porFecha) votos = v;
    } catch (e) { /* no existe */ }
}

async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return;
    try {
        const data = await bd.leerArchivoFresh(CUENTAS_FILE);
        if (!Array.isArray(data)) return;
        usuariosPorCodigo = {};
        data.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) { /* silencioso */ }
}

async function mutarDibujos(fn) {
    const bd = BD();
    if (!bd) throw new Error('Sin conexión');
    const r = await bd.actualizarArchivo(RUTA_DIBUJOS, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, porFecha: {} };
        if (!actual.porFecha || typeof actual.porFecha !== 'object') actual.porFecha = {};
        actual = fn(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    dibujos = r;
}

async function mutarVotos(fn) {
    const bd = BD();
    if (!bd) throw new Error('Sin conexión');
    const r = await bd.actualizarArchivo(RUTA_VOTOS, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, porFecha: {} };
        if (!actual.porFecha || typeof actual.porFecha !== 'object') actual.porFecha = {};
        actual = fn(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    votos = r;
}

// ============================================================
//  TEMAS (sistema CV)
// ============================================================
function cargarTemasDisponibles() {
    const api = API();
    if (!api) { temasDisponibles = []; return; }

    let todos = [];
    let instalados = [];
    try { todos = api.obtenerTemas?.() || []; } catch (e) {}
    try { instalados = api.obtenerTemasInstalados?.() || []; } catch (e) {}

    if (!Array.isArray(instalados) || instalados.length === 0) {
        instalados = todos.filter(t => t.esBase).map(t => t.id);
        if (instalados.length === 0 && todos.length > 0) instalados = [todos[0].id];
    }

    temasDisponibles = todos
        .filter(t => instalados.includes(t.id))
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
}

async function obtenerColoresDelTema(temaId) {
    if (cacheVarsTemas[temaId]) return cacheVarsTemas[temaId];

    const tema = temasDisponibles.find(t => t.id === temaId);
    if (!tema) return null;

    const colores = new Set();

    // Colores declarados en el tema (objeto plano)
    if (tema.colores && typeof tema.colores === 'object') {
        Object.values(tema.colores).forEach(v => {
            if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim())) {
                colores.add(v.trim());
            }
        });
    }

    // Además, leer el CSS del tema y extraer colores
    if (tema.ruta) {
        try {
            const url = '../../' + tema.ruta;
            const res = await fetch(url);
            if (res.ok) {
                const css = await res.text();
                const matches = css.match(/#[0-9a-fA-F]{3,8}/g) || [];
                matches.forEach(c => colores.add(c));
            }
        } catch (e) { /* silencioso */ }
    }

    // Base siempre disponible
    colores.add('#000000');
    colores.add('#FFFFFF');

    const lista = [...colores].slice(0, 28);
    cacheVarsTemas[temaId] = lista;
    return lista;
}

function llenarSelectorTemas() {
    const sel = $('ddTemaSelect');
    if (!sel) return;
    sel.innerHTML = '';
    if (temasDisponibles.length === 0) {
        sel.innerHTML = '<option value="">Sin temas</option>';
        return;
    }
    temasDisponibles.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nombre || t.id;
        sel.appendChild(opt);
    });
    if (temasDisponibles[0]) sel.value = temasDisponibles[0].id;
    temaDibujo = sel.value;
}

async function aplicarTemaAlDibujo() {
    const sel = $('ddTemaSelect');
    if (!sel) return;
    temaDibujo = sel.value;
    const colores = await obtenerColoresDelTema(temaDibujo) || ['#000000', '#FFFFFF'];
    paletaActual = colores;
    renderPaleta();
    if (!paletaActual.includes(colorActivo)) {
        colorActivo = paletaActual[0] || '#000000';
        renderPaleta();
    }
}

function renderPaleta() {
    const cont = $('ddPaleta');
    if (!cont) return;
    cont.innerHTML = '';
    paletaActual.forEach(c => {
        const b = document.createElement('button');
        b.className = 'dd-color-swatch' + (c === colorActivo ? ' seleccionado' : '');
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => {
            colorActivo = c;
            renderPaleta();
        });
        cont.appendChild(b);
    });
}

// ============================================================
//  CANVAS — dibujo
// ============================================================
function initCanvas() {
    canvas = $('ddCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    limpiarCanvas(false);

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
}

function limpiarCanvas(guardar = true) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (guardar) guardarSnapshot();
}

function guardarSnapshot() {
    try {
        historialDibujo.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
        if (historialDibujo.length > 15) historialDibujo.shift();
    } catch (e) { /* silencioso */ }
}

function deshacer() {
    if (historialDibujo.length <= 1) {
        toast('Nada para deshacer', 'info');
        return;
    }
    historialDibujo.pop();
    const prev = historialDibujo[historialDibujo.length - 1];
    ctx.putImageData(prev, 0, 0);
}

function posicionCanvas(e) {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * (CANVAS_SIZE / r.width);
    const y = (e.clientY - r.top) * (CANVAS_SIZE / r.height);
    return { x, y };
}

let ultimoPunto = null;

function onDown(e) {
    e.preventDefault();
    if (!editando) return;
    dibujando = true;
    ultimoPunto = posicionCanvas(e);
    // Punto inicial
    ctx.fillStyle = colorActivo;
    ctx.beginPath();
    ctx.arc(ultimoPunto.x, ultimoPunto.y, tamanioPincel / 2, 0, Math.PI * 2);
    ctx.fill();
    canvas.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
    if (!dibujando) return;
    e.preventDefault();
    const p = posicionCanvas(e);
    ctx.strokeStyle = colorActivo;
    ctx.lineWidth = tamanioPincel;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ultimoPunto.x, ultimoPunto.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimoPunto = p;
}

function onUp() {
    if (!dibujando) return;
    dibujando = false;
    ultimoPunto = null;
    guardarSnapshot();
}

// ============================================================
//  EXPORTAR CON COMPRESIÓN
// ============================================================
function exportarDataURL() {
    // Aseguramos fondo blanco (por si algún navegador devolvió transparencia)
    let quality = JPEG_QUALITY;
    let dataURL = canvas.toDataURL('image/jpeg', quality);
    while (dataURL.length > MAX_BYTES && quality > JPEG_QUALITY_MIN) {
        quality -= 0.05;
        dataURL = canvas.toDataURL('image/jpeg', quality);
    }
    return dataURL;
}

// ============================================================
//  MODAL DIBUJAR
// ============================================================
async function abrirModalDibujar() {
    if (fechaHoy !== fechaSantiagoHoy()) {
        toast('El día ya cerró. Esperá un momento.', 'error');
        return;
    }
    if (miDibujoDelDia()) {
        toast('Ya subiste tu dibujo de hoy', 'info');
        return;
    }

    editando = true;
    historialDibujo = [];
    llenarSelectorTemas();
    await aplicarTemaAlDibujo();
    limpiarCanvas(false);
    guardarSnapshot();
    $('ddModalDibujar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalDibujar() {
    editando = false;
    $('ddModalDibujar').hidden = true;
}

async function subirDibujo() {
    const btn = $('ddDibujarGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        // Verificar que el día sigue activo
        const fechaAhora = fechaSantiagoHoy();
        if (fechaAhora !== fechaHoy) {
            toast('El día cerró mientras dibujabas', 'error');
            cerrarModalDibujar();
            location.reload();
            return;
        }

        const dataURL = exportarDataURL();
        const pesoKB = Math.round(dataURL.length / 1024 * 0.75); // aprox bytes reales del base64
        if (pesoKB > 55) {
            // Forzamos un poco más agresivo
            toast('Comprimiendo más...', 'info');
        }

        const nuevo = {
            id: generarId('d'),
            autor: usuarioActual.codigo,
            autorNombre: usuarioActual.nombre || usuarioActual.codigo,
            temaId: temaDibujo,
            dataURL,
            subido: new Date().toISOString()
        };

        await mutarDibujos(data => {
            if (!data.porFecha[fechaHoy]) {
                data.porFecha[fechaHoy] = {
                    fecha: fechaHoy,
                    dibujos: [],
                    ganadores: null,
                    cerrado: false
                };
            }
            const dia = data.porFecha[fechaHoy];
            if (dia.cerrado) throw new Error('El día ya cerró');
            if (dia.dibujos.length >= MAX_DIBUJOS_POR_DIA) {
                throw new Error('Límite de dibujos alcanzado');
            }
            // Si ya subió, no permitir
            if (dia.dibujos.some(d => d.autor === usuarioActual.codigo)) {
                throw new Error('Ya subiste un dibujo hoy');
            }
            dia.dibujos.push(nuevo);
            return data;
        });

        cerrarModalDibujar();
        renderTodo();
        toast(`Dibujo subido (${pesoKB} KB)`, 'success');
    } catch (e) {
        console.warn(e);
        toast(e.message || 'No se pudo subir', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  CONSULTAS
// ============================================================
function miDibujoDelDia(fecha = fechaHoy) {
    const dia = dibujos.porFecha[fecha];
    if (!dia || !Array.isArray(dia.dibujos)) return null;
    return dia.dibujos.find(d => d.autor === usuarioActual.codigo) || null;
}

function dibujosDelDia(fecha = fechaHoy) {
    const dia = dibujos.porFecha[fecha];
    return dia && Array.isArray(dia.dibujos) ? dia.dibujos : [];
}

function votosDelDia(fecha = fechaHoy) {
    const v = votos.porFecha[fecha];
    return (v && typeof v === 'object') ? v : {};
}

function miVotoHoy(dibujoId) {
    const v = votosDelDia();
    const misVotos = v[usuarioActual.codigo] || {};
    return misVotos[dibujoId];
}

// ============================================================
//  RENDER — CONTADOR
// ============================================================
function renderContador() {
    const ms = msHastaMedianocheSantiago();
    const pct = Math.max(0, Math.min(100, (ms / 86400000) * 100));

    const tiempoEl = $('ddTiempoRestante');
    const fechaEl = $('ddFechaHoy');
    const barraEl = $('ddBarraFill');

    if (tiempoEl) tiempoEl.textContent = formatearCuentaAtras(ms);
    if (fechaEl) fechaEl.textContent = formatearFechaBonita(fechaHoy);
    if (barraEl) barraEl.style.width = pct + '%';
}

// ============================================================
//  RENDER — MI DIBUJO
// ============================================================
function renderMiDibujo() {
    const cont = $('ddMiDibujo');
    if (!cont) return;
    cont.innerHTML = '';

    const miDibujo = miDibujoDelDia();

    if (miDibujo) {
        const cantidadVotosRecibidos = contarVotosRecibidos(miDibujo.id);
        const tema = temasDisponibles.find(t => t.id === miDibujo.temaId);
        const nombreTema = tema ? tema.nombre : miDibujo.temaId;

        cont.classList.add('con-dibujo');
        cont.innerHTML = `
            <div class="dd-mi-dibujo-thumb">
                <img src="${miDibujo.dataURL}" alt="">
            </div>
            <div class="dd-mi-dibujo-info">
                <strong>¡Ya estás participando!</strong>
                <small>Recibiste ${cantidadVotosRecibidos} ${cantidadVotosRecibidos === 1 ? 'voto' : 'votos'}. Los puntajes se revelan mañana.</small>
                <span class="dd-tema-chip">
                    <i data-lucide="palette"></i>
                    ${escapar(nombreTema)}
                </span>
                <button class="dd-btn-borrar-mi" id="ddBtnBorrarMiDibujo">
                    <i data-lucide="trash-2"></i>
                    Borrar y volver a dibujar
                </button>
            </div>
        `;
        cont.querySelector('#ddBtnBorrarMiDibujo')?.addEventListener('click', borrarMiDibujo);
    } else {
        cont.classList.remove('con-dibujo');
        cont.innerHTML = `
            <button class="dd-btn-dibujar" id="ddBtnDibujar">
                <i data-lucide="pencil-line"></i>
                <span>Dibujar ahora</span>
            </button>
        `;
        cont.querySelector('#ddBtnDibujar')?.addEventListener('click', abrirModalDibujar);
    }
    if (window.lucide) window.lucide.createIcons();
}

function contarVotosRecibidos(dibujoId) {
    const v = votosDelDia();
    let n = 0;
    Object.values(v).forEach(votosDeVotante => {
        if (votosDeVotante[dibujoId] !== undefined) n++;
    });
    return n;
}

async function borrarMiDibujo() {
    const miDibujo = miDibujoDelDia();
    if (!miDibujo) return;
    if (!confirm('¿Borrar tu dibujo de hoy? Se perderán también los votos recibidos.')) return;

    try {
        await mutarDibujos(data => {
            const dia = data.porFecha[fechaHoy];
            if (dia) dia.dibujos = dia.dibujos.filter(d => d.id !== miDibujo.id);
            return data;
        });
        await mutarVotos(data => {
            const v = data.porFecha[fechaHoy];
            if (v) {
                Object.keys(v).forEach(votante => {
                    if (v[votante] && v[votante][miDibujo.id] !== undefined) {
                        delete v[votante][miDibujo.id];
                    }
                });
            }
            return data;
        });
        renderTodo();
        toast('Dibujo borrado', 'success');
    } catch (e) {
        toast('No se pudo borrar', 'error');
    }
}

// ============================================================
//  RENDER — DIBUJOS DEL DÍA (VOTAR)
// ============================================================
function renderDibujosHoy() {
    const cont = $('ddDibujosHoy');
    const meta = $('ddContadorVotos');
    if (!cont) return;
    cont.innerHTML = '';

    const todos = dibujosDelDia();
    const ajenos = todos.filter(d => d.autor !== usuarioActual.codigo);

    if (meta) {
        const misVotosCant = ajenos.filter(d => miVotoHoy(d.id) !== undefined).length;
        meta.textContent = `${misVotosCant} / ${ajenos.length} votados`;
    }

    if (ajenos.length === 0) {
        const div = document.createElement('div');
        div.className = 'dd-empty-mini';
        div.innerHTML = `
            <i data-lucide="users"></i>
            <p>Sé el primero. Cuando otros suban sus dibujos, vas a poder votarlos.</p>
        `;
        cont.appendChild(div);
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    ajenos.forEach(d => {
        const card = document.createElement('div');
        card.className = 'dd-dibujo-card';
        const miVoto = miVotoHoy(d.id);
        if (miVoto !== undefined) card.classList.add('votado');

        card.innerHTML = `
            <img class="dd-dibujo-img" src="${d.dataURL}" alt="">
            <div class="dd-dibujo-info">
                <span class="dd-dibujo-autor">${escapar(d.autorNombre || d.autor)}</span>
                <span class="dd-dibujo-voto ${miVoto !== undefined ? 'puesto' : ''}">
                    <i data-lucide="${miVoto !== undefined ? 'star' : 'circle-dashed'}"></i>
                    ${miVoto !== undefined ? 'Tu voto: ' + miVoto : 'Sin votar'}
                </span>
            </div>
        `;
        card.addEventListener('click', () => abrirModalVotar(d.id));
        cont.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL VOTAR
// ============================================================
function abrirModalVotar(dibujoId) {
    const d = dibujosDelDia().find(x => x.id === dibujoId);
    if (!d) return;
    if (d.autor === usuarioActual.codigo) {
        toast('No podés votar tu propio dibujo', 'error');
        return;
    }

    dibujoVotandoId = dibujoId;

    $('ddVotarImg').src = d.dataURL;
    $('ddVotarAutorNombre').textContent = d.autorNombre || d.autor;

    const avatarEl = $('ddVotarAvatar');
    const u = usuariosPorCodigo[d.autor];
    if (u && u.foto) {
        avatarEl.innerHTML = `<img src="${u.foto}" alt="">`;
    } else {
        const inicial = (d.autorNombre || d.autor || '?').charAt(0).toUpperCase();
        avatarEl.innerHTML = `<span style="font-weight:800;">${escapar(inicial)}</span>`;
    }

    renderBotonesVotar();

    $('ddModalVotar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function renderBotonesVotar() {
    const cont = $('ddVotarPuntajes');
    if (!cont) return;
    cont.innerHTML = '';

    const miVoto = miVotoHoy(dibujoVotandoId);
    const hint = $('ddVotarHint');

    for (let n = 1; n <= 10; n++) {
        const b = document.createElement('button');
        b.className = 'dd-votar-btn' + (miVoto === n ? ' seleccionado' : '');
        b.textContent = n;
        b.addEventListener('click', () => votar(dibujoVotandoId, n));
        cont.appendChild(b);
    }

    if (miVoto !== undefined) {
        hint.textContent = `Votaste ${miVoto}. Podés cambiar tu voto hasta que cierre el día.`;
    } else {
        hint.textContent = 'Elegí un puntaje del 1 al 10.';
    }
}

function cerrarModalVotar() {
    $('ddModalVotar').hidden = true;
    dibujoVotandoId = null;
}

async function votar(dibujoId, puntaje) {
    if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 10) return;
    const d = dibujosDelDia().find(x => x.id === dibujoId);
    if (!d || d.autor === usuarioActual.codigo) return;

    try {
        await mutarVotos(data => {
            if (!data.porFecha[fechaHoy]) data.porFecha[fechaHoy] = {};
            const v = data.porFecha[fechaHoy];
            if (!v[usuarioActual.codigo]) v[usuarioActual.codigo] = {};
            v[usuarioActual.codigo][dibujoId] = puntaje;
            return data;
        });
        renderBotonesVotar();
        renderDibujosHoy();
        toast(`Voto: ${puntaje}`, 'success');
    } catch (e) {
        toast('No se pudo guardar el voto', 'error');
    }
}

// ============================================================
//  CÁLCULO DE GANADORES + CIERRE DE DÍA
// ============================================================
function calcularStats(votosArray) {
    const n = votosArray.length;
    if (n === 0) return { votos: 0, mediana: 0, promedio: 0 };
    const sorted = [...votosArray].sort((a, b) => a - b);
    const mediana = n % 2 === 0
        ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
        : sorted[Math.floor(n / 2)];
    const promedio = votosArray.reduce((a, b) => a + b, 0) / n;
    return { votos: n, mediana, promedio };
}

function votosDeDibujo(dibujoId, votosFecha) {
    const arr = [];
    Object.values(votosFecha).forEach(votosDeVotante => {
        if (votosDeVotante[dibujoId] !== undefined) {
            arr.push(votosDeVotante[dibujoId]);
        }
    });
    return arr;
}

async function procesarDiasPendientes() {
    const hoyStr = fechaSantiagoHoy();
    const pendientes = Object.keys(dibujos.porFecha)
        .filter(f => f < hoyStr && !dibujos.porFecha[f].cerrado)
        .sort();

    for (const fecha of pendientes) {
        await cerrarDia(fecha);
    }
}

async function cerrarDia(fecha) {
    const dia = dibujos.porFecha[fecha];
    if (!dia || dia.cerrado) return;

    const votosFecha = votosDelDia(fecha);
    const dibujosDelDiaArr = dia.dibujos || [];

    // Stats por dibujo
    const lista = dibujosDelDiaArr.map(d => {
        const votosArr = votosDeDibujo(d.id, votosFecha);
        return { dibujo: d, ...calcularStats(votosArr) };
    });

    // Ordenar por mediana ↓, promedio ↓, subido ↑
    lista.sort((a, b) => {
        if (b.mediana !== a.mediana) return b.mediana - a.mediana;
        if (b.promedio !== a.promedio) return b.promedio - a.promedio;
        return new Date(a.dibujo.subido) - new Date(b.dibujo.subido);
    });

    // Premios solo si hay >= MIN_PARTICIPANTES
    let ganadores = [];
    if (dibujosDelDiaArr.length >= MIN_PARTICIPANTES) {
        ganadores = lista.slice(0, 3).map((s, i) => ({
            autor: s.dibujo.autor,
            autorNombre: s.dibujo.autorNombre,
            dibujoId: s.dibujo.id,
            posicion: i + 1,
            premio: PREMIOS[i],
            mediana: s.mediana,
            promedio: s.promedio,
            votos: s.votos,
            otorgado: false
        }));
    }

    await mutarDibujos(data => {
        if (!data.porFecha[fecha]) return data;
        data.porFecha[fecha].ganadores = ganadores;
        data.porFecha[fecha].cerrado = true;
        data.porFecha[fecha].cerradoEn = new Date().toISOString();
        return data;
    });

    // Si yo gané, cobrar
    const miGanancia = ganadores.find(g => g.autor === usuarioActual.codigo && !g.otorgado);
    if (miGanancia) {
        await cobrarPremio(fecha, miGanancia);
    }
}

async function cobrarPremio(fecha, ganancia) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;

    try {
        await api.canjear(
            'pencil',
            'dibujodeldia',
            `Ganaste el ${fecha} (${ganancia.posicion}° lugar)`,
            ganancia.premio
        );
        await mutarDibujos(data => {
            const g = data.porFecha[fecha]?.ganadores?.find(
                x => x.autor === usuarioActual.codigo && x.posicion === ganancia.posicion && !x.otorgado
            );
            if (g) g.otorgado = true;
            return data;
        });
        const emoji = ganancia.posicion === 1 ? '🥇' : ganancia.posicion === 2 ? '🥈' : '🥉';
        toast(`${emoji} Ganaste ${ganancia.premio} monedas (${ganancia.posicion}° lugar del ${fecha})`, 'success');
    } catch (e) {
        console.warn('No se pudo cobrar:', e);
    }
}

// ============================================================
//  RENDER — HISTORIAL
// ============================================================
function renderHistorial() {
    const cont = $('ddHistorial');
    const vacio = $('ddHistorialVacio');
    if (!cont) return;
    cont.innerHTML = '';

    const hoyStr = fechaSantiagoHoy();
    const fechas = Object.keys(dibujos.porFecha)
        .filter(f => f < hoyStr)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, HISTORIAL_MAX);

    if (fechas.length === 0) {
        cont.hidden = true;
        vacio.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.hidden = false;
    vacio.hidden = true;

    fechas.forEach(fecha => {
        const dia = dibujos.porFecha[fecha];
        const total = (dia.dibujos || []).length;
        if (total === 0) return;

        const miDibujo = (dia.dibujos || []).find(d => d.autor === usuarioActual.codigo);
        const ganadores = Array.isArray(dia.ganadores) ? dia.ganadores : [];
        const miPosicion = miDibujo
            ? ganadores.findIndex(g => g.autor === usuarioActual.codigo) + 1
            : 0;

        let badge = '';
        if (miPosicion === 1) badge = '<span class="dd-hist-badge pos-1">🥇 1°</span>';
        else if (miPosicion === 2) badge = '<span class="dd-hist-badge pos-2">🥈 2°</span>';
        else if (miPosicion === 3) badge = '<span class="dd-hist-badge pos-3">🥉 3°</span>';
        else if (miDibujo) badge = '<span class="dd-hist-badge participo">Participaste</span>';
        else badge = '<span class="dd-hist-badge no-part">No participaste</span>';

        const [y, m, d] = fecha.split('-');

        const card = document.createElement('div');
        card.className = 'dd-hist-card';
        card.innerHTML = `
            <div class="dd-hist-fecha">
                <div class="dd-hist-dia">${parseInt(d, 10)}</div>
                <div class="dd-hist-mes">${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(m,10)-1]}</div>
            </div>
            <div class="dd-hist-info">
                <div class="dd-hist-titulo">${total} ${total === 1 ? 'dibujo' : 'dibujos'}</div>
                <div class="dd-hist-meta">${ganadores.length > 0 ? `Ganó ${escapar(ganadores[0].autorNombre || ganadores[0].autor)}` : 'Sin premios (menos de 3 participantes)'}</div>
            </div>
            ${badge}
        `;
        card.addEventListener('click', () => abrirModalDia(fecha));
        cont.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL DÍA HISTÓRICO
// ============================================================
function abrirModalDia(fecha) {
    const dia = dibujos.porFecha[fecha];
    if (!dia) return;

    const titulo = $('ddDiaTitulo');
    if (titulo) {
        titulo.innerHTML = `<i data-lucide="calendar"></i> <span>${formatearFechaBonita(fecha)}</span>`;
    }

    const body = $('ddDiaBody');
    body.innerHTML = '';

    const ganadores = Array.isArray(dia.ganadores) ? dia.ganadores : [];

    if (ganadores.length === 0) {
        const div = document.createElement('div');
        div.className = 'dd-dia-sin-ganadores';
        div.innerHTML = `
            <i data-lucide="info" style="width:16px;height:16px;display:inline;vertical-align:middle;margin-right:4px;"></i>
            No hubo premios este día (menos de ${MIN_PARTICIPANTES} participantes).
        `;
        body.appendChild(div);
    }

    // Podio
    const podio = document.createElement('div');
    podio.className = 'dd-dia-podio';
    const dibujosPorId = {};
    (dia.dibujos || []).forEach(d => { dibujosPorId[d.id] = d; });

    ganadores.forEach(g => {
        const d = dibujosPorId[g.dibujoId];
        if (!d) return;
        const esYo = g.autor === usuarioActual.codigo;
        const item = document.createElement('div');
        item.className = `dd-dia-podio-item pos-${g.posicion}` + (esYo ? ' tu' : '');
        item.innerHTML = `
            <div class="dd-dia-pos">${g.posicion}°</div>
            <div class="dd-dia-thumb"><img src="${d.dataURL}" alt=""></div>
            <div class="dd-dia-info">
                <div class="dd-dia-nombre">${escapar(g.autorNombre || g.autor)}${esYo ? ' (vos)' : ''}</div>
                <div class="dd-dia-stats">mediana ${g.mediana.toFixed(1)} · promedio ${g.promedio.toFixed(2)} · ${g.votos} votos</div>
            </div>
            <div class="dd-dia-premio">+${g.premio}</div>
        `;
        podio.appendChild(item);
    });
    body.appendChild(podio);

    // Si participaste pero no estás en el podio
    const miDibujo = (dia.dibujos || []).find(d => d.autor === usuarioActual.codigo);
    if (miDibujo && ganadores.length > 0 && !ganadores.find(g => g.autor === usuarioActual.codigo)) {
        const mis = calcularStats(votosDeDibujo(miDibujo.id, votosDelDia(fecha)));
        const div = document.createElement('div');
        div.className = 'dd-dia-sin-ganadores';
        div.style.textAlign = 'left';
        div.innerHTML = `
            <strong>Tu dibujo ese día:</strong><br>
            mediana ${mis.mediana.toFixed(1)} · promedio ${mis.promedio.toFixed(2)} · ${mis.votos} votos
        `;
        body.appendChild(div);
    }

    $('ddModalDia').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalDia() {
    $('ddModalDia').hidden = true;
}

// ============================================================
//  RENDER GENERAL
// ============================================================
function renderTodo() {
    renderContador();
    renderMiDibujo();
    renderDibujosHoy();
    renderHistorial();
    renderAvisoPremios();
}

function renderAvisoPremios() {
    const aviso = $('ddAvisoPremios');
    const txt = $('ddAvisoPremiosTxt');
    if (!aviso) return;

    const hoyStr = fechaSantiagoHoy();
    // Buscar un día reciente donde yo haya ganado y no lo haya visto aún
    // Por simplicidad: mostrar si el día ANTERIOR existió y gané
    const fechas = Object.keys(dibujos.porFecha)
        .filter(f => f < hoyStr)
        .sort((a, b) => b.localeCompare(a));

    if (fechas.length === 0) { aviso.hidden = true; return; }

    const ultima = fechas[0];
    const dia = dibujos.porFecha[ultima];
    const ganadores = Array.isArray(dia.ganadores) ? dia.ganadores : [];
    const miPremio = ganadores.find(g => g.autor === usuarioActual.codigo);

    if (miPremio && miPremio.posicion <= 3) {
        aviso.hidden = false;
        const emoji = miPremio.posicion === 1 ? '🥇' : miPremio.posicion === 2 ? '🥈' : '🥉';
        txt.textContent = `${emoji} Ganaste el ${formatearFechaBonita(ultima)} (${miPremio.posicion}° lugar). +${miPremio.premio} monedas acreditadas.`;
    } else {
        aviso.hidden = true;
    }
}

// ============================================================
//  TABS
// ============================================================
function initTabs() {
    document.querySelectorAll('.dd-tab').forEach(t => {
        t.addEventListener('click', () => {
            document.querySelectorAll('.dd-tab').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.dd-vista').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            tabActual = t.dataset.tab;
            const vista = document.querySelector(`.dd-vista[data-vista="${tabActual}"]`);
            if (vista) vista.classList.add('active');
        });
    });
}

// ============================================================
//  CICLO — chequeo de cambio de día
// ============================================================
function iniciarTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(async () => {
        const hoyAhora = fechaSantiagoHoy();
        if (hoyAhora !== fechaHoy) {
            fechaHoy = hoyAhora;
            await cargarDatos();
            await procesarDiasPendientes();
            renderTodo();
        } else {
            renderContador();
        }
    }, 15000);
    renderContador();
    // Actualizar cada segundo para suavizar el contador
    setInterval(() => {
        const hoyAhora = fechaSantiagoHoy();
        if (hoyAhora === fechaHoy) renderContador();
    }, 1000);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Dibujo del día necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = $('ddUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`;

    fechaHoy = fechaSantiagoHoy();

    cargarTemasDisponibles();
    await cargarUsuarios();
    await cargarDatos();
    await procesarDiasPendientes();

    initCanvas();
    initTabs();
    renderTodo();
    iniciarTick();

    // Eventos modal dibujar
    $('ddDibujarCerrar')?.addEventListener('click', cerrarModalDibujar);
    $('ddDibujarGuardar')?.addEventListener('click', subirDibujo);
    $('ddDibujarBorrar')?.addEventListener('click', () => {
        if (!confirm('¿Borrar todo el dibujo?')) return;
        limpiarCanvas(false);
        historialDibujo = [];
        guardarSnapshot();
    });
    $('ddDibujarDeshacer')?.addEventListener('click', deshacer);
    $('ddTamanio')?.addEventListener('input', e => {
        tamanioPincel = parseInt(e.target.value, 10);
    });
    $('ddTemaSelect')?.addEventListener('change', aplicarTemaAlDibujo);

    // Eventos modal votar
    $('ddVotarCerrar')?.addEventListener('click', cerrarModalVotar);
    $('ddDiaCerrar')?.addEventListener('click', cerrarModalDia);

    // Cerrar al click fuera
    ['ddModalDibujar', 'ddModalVotar', 'ddModalDia'].forEach(id => {
        const m = $(id);
        if (!m) return;
        m.addEventListener('click', e => {
            if (e.target.id === id) {
                if (id === 'ddModalDibujar') cerrarModalDibujar();
                if (id === 'ddModalVotar') cerrarModalVotar();
                if (id === 'ddModalDia') cerrarModalDia();
            }
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!$('ddModalDibujar').hidden) { cerrarModalDibujar(); return; }
        if (!$('ddModalVotar').hidden) { cerrarModalVotar(); return; }
        if (!$('ddModalDia').hidden) { cerrarModalDia(); return; }
    });

    window.addEventListener('pagehide', () => {
        if (tickTimer) clearInterval(tickTimer);
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
