// ============================================================
//  Widget: Radio
//  ------------------------------------------------------------
//  Reproductor de emisoras de internet usando la API pública
//  de Radio Browser (radio-browser.info). Sin API key, sin
//  registro, CORS abierto.
//
//  Persistencia POR USUARIO en:
//      app/radio/{codigo}radio.json
//  Guarda: favoritos, última emisora, volumen.
//
//  Los streams son siempre URLs externas — no alojamos audio.
//
//  ⚠️ IMPORTANTE: NO agregar presets hardcodeados de emisoras
//  específicas (SomaFM, etc.). Muchas prohíben la incrustación
//  sin permiso escrito. Solo consumir emisoras vía la API de
//  Radio Browser, que ya filtra streams públicos y funcionales.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/radio/';
const API_BASE = 'https://all.api.radio-browser.info/json';
const LIMITE_BUSQUEDA = 40;

// ---------- ESTADO ----------
let usuarioActual = null;
let favoritos = [];
let ultimaEstacion = null;
let volumen = 0.7;
let sonando = false;
let estacionActual = null;
let audio = null;
let cargandoEstaciones = false;
let busquedaTimer = null;
let urlsActivas = [];

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
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'radio.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (!data || typeof data !== 'object') return;
        if (Array.isArray(data.favoritos)) favoritos = data.favoritos.slice(0, 30);
        if (data.ultima && data.ultima.url_resolved) ultimaEstacion = data.ultima;
        if (typeof data.volumen === 'number') {
            volumen = Math.max(0, Math.min(1, data.volumen));
        }
    } catch (e) { /* no existe */ }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            favoritos: favoritos,
            ultima: ultimaEstacion,
            volumen: volumen,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Radio] No se pudo guardar:', e);
    }
}

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

function esUrlValidaHttps(url) {
    return typeof url === 'string' && /^https:\/\//i.test(url);
}

function normalizarEstacion(s) {
    if (!s) return null;
    const url = s.url_resolved || s.url || '';
    if (!esUrlValidaHttps(url)) return null;
    return {
        stationuuid: s.stationuuid || ('s_' + Math.random().toString(36).slice(2, 8)),
        name: String(s.name || 'Sin nombre').trim().slice(0, 80),
        url_resolved: url,
        favicon: s.favicon && /^https:\/\//i.test(s.favicon) ? s.favicon : '',
        country: s.country || '',
        countrycode: s.countrycode || '',
        bitrate: Number(s.bitrate) || 0
    };
}

function metaEstacion(s) {
    const partes = [];
    if (s.country) partes.push(s.country);
    if (s.bitrate) partes.push(`${s.bitrate} kbps`);
    return partes.join(' · ') || 'Emisora de internet';
}

function estaEnFavoritos(uuid) {
    return favoritos.some(f => f.stationuuid === uuid);
}

// ============================================================
//  API: BUSCAR
// ============================================================
async function buscarEmisoras(texto, codigoPais) {
    const params = new URLSearchParams();
    params.set('limit', String(LIMITE_BUSQUEDA));
    params.set('hidebroken', 'true');
    params.set('order', 'votes');
    params.set('reverse', 'true');
    if (texto) params.set('name', texto);
    if (codigoPais) params.set('countrycode', codigoPais);

    const url = `${API_BASE}/stations/search?${params.toString()}`;

    try {
        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        return data
            .map(normalizarEstacion)
            .filter(Boolean);
    } catch (e) {
        console.warn('[Radio] Error buscando:', e);
        return [];
    }
}

// ============================================================
//  REPRODUCCIÓN
// ============================================================
async function reproducir(estacion) {
    if (!audio || !estacion) return;

    if (estacionActual && estacionActual.stationuuid === estacion.stationuuid && sonando) {
        pausar();
        return;
    }

    estacionActual = estacion;
    renderWidget();
    mostrarOverlayCarga();

    audio.src = estacion.url_resolved;
    audio.volume = volumen;

    try {
        await audio.play();
        sonando = true;
        ultimaEstacion = estacion;
        await guardar();
        renderWidget();
    } catch (e) {
        console.warn('[Radio] Error al reproducir:', e);
        sonando = false;
        renderWidget();
        alert('No se pudo reproducir esta emisora. Prueba con otra.');
    }
}

function pausar() {
    if (!audio) return;
    audio.pause();
    audio.src = '';
    sonando = false;
    renderWidget();
}

function togglePlay() {
    if (!estacionActual) return;
    if (sonando) pausar();
    else reproducir(estacionActual);
}

function cambiarVolumen(v) {
    volumen = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = volumen;
    actualizarIconoVolumen();
}

function actualizarIconoVolumen() {
    const icon = document.getElementById('rdVolIcon');
    if (!icon) return;
    const i = volumen === 0 ? 'volume-x'
        : volumen < 0.5 ? 'volume-1'
        : 'volume-2';
    icon.innerHTML = `<i data-lucide="${i}"></i>`;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER WIDGET
// ============================================================
function renderWidget() {
    const portada = document.getElementById('rdPortada');
    const live = document.getElementById('rdLive');
    const nombreEl = document.getElementById('rdNombre');
    const subEl = document.getElementById('rdSub');
    const btnPlay = document.getElementById('rdBtnPlay');

    if (!portada || !nombreEl || !subEl || !btnPlay) return;

    if (!estacionActual) {
        portada.innerHTML = '<i data-lucide="radio"></i>';
        portada.classList.remove('reproduciendo');
        if (live) live.hidden = true;
        nombreEl.textContent = 'Sin emisora';
        subEl.textContent = 'Sintoniza una emisora';
        btnPlay.disabled = true;
        btnPlay.classList.remove('reproduciendo');
        btnPlay.innerHTML = '<i data-lucide="play"></i><span>Reproducir</span>';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Con emisora
    if (estacionActual.favicon) {
        portada.innerHTML = `<img src="${estacionActual.favicon}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='<i data-lucide=&quot;radio&quot;></i>';if(window.lucide)window.lucide.createIcons();">`;
    } else {
        portada.innerHTML = '<i data-lucide="radio"></i>';
    }

    nombreEl.textContent = estacionActual.name;
    subEl.textContent = metaEstacion(estacionActual);

    portada.classList.toggle('reproduciendo', sonando);
    if (live) live.hidden = !sonando;

    btnPlay.disabled = false;
    btnPlay.classList.toggle('reproduciendo', sonando);
    btnPlay.innerHTML = sonando
        ? '<i data-lucide="pause"></i><span>Pausar</span>'
        : '<i data-lucide="play"></i><span>Reproducir</span>';

    if (window.lucide) window.lucide.createIcons();
}

function mostrarOverlayCarga() {
    const portada = document.getElementById('rdPortada');
    if (portada) {
        portada.innerHTML = '<div class="rd-spinner" style="width:20px;height:20px;border-width:2px;"></div>';
    }
}

// ============================================================
//  RENDER LISTA DE EMISORAS
// ============================================================
function renderListaEstaciones(cont, estaciones, vacioTexto = 'Sin resultados') {
    if (!cont) return;

    if (!estaciones || estaciones.length === 0) {
        cont.innerHTML = `
            <div class="rd-vacio">
                <i data-lucide="radio"></i>
                <p>${escapar(vacioTexto)}</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = estaciones.map(s => {
        const esActual = estacionActual && estacionActual.stationuuid === s.stationuuid;
        const esFav = estaEnFavoritos(s.stationuuid);
        const logo = s.favicon
            ? `<img src="${s.favicon}" alt="" onerror="this.style.display='none';this.parentElement.innerHTML='<i data-lucide=&quot;radio&quot;></i>';if(window.lucide)window.lucide.createIcons();">`
            : `<i data-lucide="radio"></i>`;
        return `
            <div class="rd-station ${esActual ? 'actual' : ''}" data-uuid="${escapar(s.stationuuid)}">
                <div class="rd-station-logo">${logo}</div>
                <div class="rd-station-info">
                    <div class="rd-station-nombre">${escapar(s.name)}</div>
                    <div class="rd-station-meta">${escapar(metaEstacion(s))}</div>
                </div>
                <button class="rd-station-fav ${esFav ? 'activo' : ''}" data-uuid="${escapar(s.stationuuid)}" title="${esFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">
                    <i data-lucide="heart"></i>
                </button>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.rd-station').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.rd-station-fav')) return;
            const uuid = el.dataset.uuid;
            const s = estaciones.find(x => x.stationuuid === uuid);
            if (s) {
                reproducir(s);
                cerrarModal();
            }
        });
    });

    cont.querySelectorAll('.rd-station-fav').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const uuid = btn.dataset.uuid;
            const s = estaciones.find(x => x.stationuuid === uuid);
            if (!s) return;
            await toggleFavorito(s);
        });
    });
}

async function toggleFavorito(s) {
    if (estaEnFavoritos(s.stationuuid)) {
        favoritos = favoritos.filter(f => f.stationuuid !== s.stationuuid);
    } else {
        if (favoritos.length >= 30) {
            alert('Máximo 30 emisoras en favoritos.');
            return;
        }
        favoritos.push(s);
    }
    await guardar();
    actualizarContadorFav();

    const buscarTab = document.querySelector('.rd-tab[data-tab="buscar"]');
    if (buscarTab && buscarTab.classList.contains('active')) {
        const cont = document.getElementById('rdListaBuscar');
        if (cont && cont._estaciones) {
            renderListaEstaciones(cont, cont._estaciones);
        }
    } else {
        renderFavoritos();
    }
}

function actualizarContadorFav() {
    const el = document.getElementById('rdFavCount');
    if (el) el.textContent = favoritos.length;
}

// ============================================================
//  RENDER FAVORITOS
// ============================================================
function renderFavoritos() {
    const cont = document.getElementById('rdListaFavoritos');
    if (!cont) return;
    renderListaEstaciones(cont, favoritos, 'Sin emisoras favoritas. Pulsa el corazón en cualquier emisora para guardarla.');
}

// ============================================================
//  MODAL
// ============================================================
function abrirModal() {
    const modal = document.getElementById('rdModal');
    if (!modal) return;
    modal.hidden = false;
    actualizarContadorFav();
    renderFavoritos();

    const cont = document.getElementById('rdListaBuscar');
    if (cont && !cont._estaciones) {
        cont.innerHTML = `
            <div class="rd-vacio">
                <i data-lucide="search"></i>
                <p>Escribe un nombre o elige un país para buscar emisoras</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('rdModal');
    if (modal) modal.hidden = true;
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    document.getElementById('rdBtnPlay')?.addEventListener('click', togglePlay);

    document.getElementById('rdVolumen')?.addEventListener('input', (e) => {
        cambiarVolumen(parseFloat(e.target.value));
    });

    document.getElementById('rdVolIcon')?.addEventListener('click', () => {
        const antes = volumen;
        const nuevo = volumen > 0 ? 0 : (antes || 0.7);
        cambiarVolumen(nuevo);
        const slider = document.getElementById('rdVolumen');
        if (slider) slider.value = nuevo;
    });

    document.getElementById('rdBtnSintonizar')?.addEventListener('click', abrirModal);
    document.getElementById('rdModalCerrar')?.addEventListener('click', cerrarModal);

    document.getElementById('rdModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'rdModal') cerrarModal();
    });

    document.querySelectorAll('.rd-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.rd-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.rd-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`.rd-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
            if (tab.dataset.tab === 'favoritos') renderFavoritos();
        });
    });

    const buscar = document.getElementById('rdBuscar');
    const buscarClear = document.getElementById('rdBuscarClear');
    const paisSelect = document.getElementById('rdPaisSelect');

    buscar?.addEventListener('input', () => {
        buscarClear.hidden = !buscar.value;
        clearTimeout(busquedaTimer);
        busquedaTimer = setTimeout(realizarBusqueda, 350);
    });

    buscarClear?.addEventListener('click', () => {
        buscar.value = '';
        buscarClear.hidden = true;
        realizarBusqueda();
    });

    paisSelect?.addEventListener('change', realizarBusqueda);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('rdModal').hidden) cerrarModal();
    });
}

async function realizarBusqueda() {
    const cont = document.getElementById('rdListaBuscar');
    if (!cont) return;

    const texto = (document.getElementById('rdBuscar').value || '').trim();
    const pais = document.getElementById('rdPaisSelect').value || '';

    if (!texto && !pais) {
        cont._estaciones = null;
        cont.innerHTML = `
            <div class="rd-vacio">
                <i data-lucide="search"></i>
                <p>Escribe un nombre o elige un país para buscar emisoras</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = `
        <div class="rd-cargando">
            <div class="rd-spinner"></div>
            <span>Buscando emisoras...</span>
        </div>
    `;

    const estaciones = await buscarEmisoras(texto, pais);
    cont._estaciones = estaciones;

    const vacioTexto = 'Sin resultados. Prueba con otro término o país.';
    renderListaEstaciones(cont, estaciones, vacioTexto);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    audio = document.getElementById('rdAudio');
    if (audio) {
        audio.volume = volumen;
        audio.addEventListener('playing', () => {
            sonando = true;
            renderWidget();
        });
        audio.addEventListener('pause', () => {
            sonando = false;
            renderWidget();
        });
        audio.addEventListener('error', (e) => {
            console.warn('[Radio] Error de audio:', e);
            sonando = false;
            renderWidget();
        });
        audio.addEventListener('waiting', () => {
            mostrarOverlayCarga();
        });
        audio.addEventListener('canplay', () => {
            renderWidget();
        });
    }

    await cargar();

    const slider = document.getElementById('rdVolumen');
    if (slider) slider.value = volumen;
    actualizarIconoVolumen();

    if (ultimaEstacion) {
        estacionActual = ultimaEstacion;
    }

    renderWidget();
    actualizarContadorFav();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('unload', () => {
    urlsActivas.forEach(u => URL.revokeObjectURL(u));
});
