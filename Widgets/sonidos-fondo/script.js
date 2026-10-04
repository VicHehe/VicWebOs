// ============================================================
//  Widget: Sonidos de Fondo
//  ------------------------------------------------------------
//  Genera lluvia, olas y tormenta 100% sintéticos con Web
//  Audio API. Cero archivos, cero API externa.
//
//  Persistencia: IndexedDB (local, por usuario).
//  Guarda: preset elegido + volumen.
//
//  Notas técnicas:
//  - Los buffers de ruido (blanco/rosa/marrón) se generan una
//    vez al primer play y se reutilizan. Duración: 6s.
//  - El fade-in/out evita clicks. Nunca cambiamos gains a pelo.
//  - El crossfade entre presets dura 0.8s por lado.
//  - ctx.suspend() cuando pausamos para no consumir CPU.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'SonidosFondoDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';
const BUFFER_DURACION = 6;   // segundos de ruido por buffer

const PRESETS_VALIDOS = ['lluvia', 'olas', 'tormenta'];
const LABELS_PRESET = { lluvia: 'Lluvia', olas: 'Olas', tormenta: 'Tormenta' };

let usuarioActual = null;
let inicializado = false;

// ---------- AUDIO ----------
let ctx = null;
let masterGain = null;
let buffers = null;
let presetActual = 'lluvia';
let nodosActivos = null;         // { gain, sources }
let playing = false;
let iniciando = false;
let pausandoTimer = null;
let volumen = 0.6;
let volumenAntesDeSilenciar = 0.6;

// ---------- HELPERS ----------
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

const soportaWebAudio = () => !!(window.AudioContext || window.webkitAudioContext);

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
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'sf_' + codigo;
}

async function cargarGuardado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return null;
    return {
        preset: PRESETS_VALIDOS.includes(data.preset) ? data.preset : 'lluvia',
        volumen: typeof data.volumen === 'number'
            ? Math.max(0, Math.min(1, data.volumen))
            : 0.6
    };
}

async function guardar() {
    await idbSet(claveEstado(), {
        preset: presetActual,
        volumen: volumen,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  GENERACIÓN DE BUFFERS DE RUIDO
//  ------------------------------------------------------------
//  Se generan UNA VEZ y se reutilizan para todas las voces.
//  Cada buffer es estéreo con canales independientes → sensación
//  de espacialidad (no es mono disfrazado).
// ============================================================
function crearBufferRuido(tipo) {
    const sr = ctx.sampleRate;
    const len = sr * BUFFER_DURACION;
    const buf = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);

        if (tipo === 'white') {
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        } else if (tipo === 'pink') {
            // Paul Kellet — pink noise aproximado (filtro IIR de 7 polos)
            let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
            for (let i = 0; i < len; i++) {
                const w = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + w * 0.0555179;
                b1 = 0.99332 * b1 + w * 0.0750759;
                b2 = 0.96900 * b2 + w * 0.1538520;
                b3 = 0.86650 * b3 + w * 0.3104856;
                b4 = 0.55000 * b4 + w * 0.5329522;
                b5 = -0.7616 * b5 - w * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
                b6 = w * 0.115926;
            }

        } else if (tipo === 'brown') {
            // Integración de ruido blanco con fuga
            let last = 0;
            for (let i = 0; i < len; i++) {
                const w = Math.random() * 2 - 1;
                last = (last + 0.02 * w) / 1.02;
                data[i] = last * 3.5;
            }
        }
    }
    return buf;
}

function crearBuffers() {
    if (buffers) return;
    buffers = {
        white: crearBufferRuido('white'),
        pink:  crearBufferRuido('pink'),
        brown: crearBufferRuido('brown')
    };
}

function crearContexto() {
    if (ctx) return;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = volumen;
    masterGain.connect(ctx.destination);
    crearBuffers();
}

// ============================================================
//  HELPERS DE AUDIO
// ============================================================
function nuevoSource(buffer) {
    const s = ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    return s;
}

function nuevoFiltro(tipo, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = freq;
    if (typeof q === 'number') f.Q.value = q;
    return f;
}

function nuevoGain(valor) {
    const g = ctx.createGain();
    g.gain.value = valor;
    return g;
}

function nuevoLFO(freq, amplitud, target) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = amplitud;
    osc.connect(g).connect(target);
    osc.start();
    return osc;
}

// ============================================================
//  PRESETS
// ============================================================

// LLUVIA — Ruido blanco filtrado + capa de gotas moduladas
function construirLluvia() {
    const out = nuevoGain(0);
    out.connect(masterGain);
    const sources = [];

    // Capa 1: base de lluvia
    const base = nuevoSource(buffers.white);
    const hp = nuevoFiltro('highpass', 800, 0.7);
    const lp = nuevoFiltro('lowpass', 7000);
    const gBase = nuevoGain(0.7);
    base.connect(hp).connect(lp).connect(gBase).connect(out);
    base.start();
    sources.push(base);

    // Capa 2: gotas — banda alta con modulación orgánica
    const drops = nuevoSource(buffers.white);
    const bp = nuevoFiltro('bandpass', 4500, 1.2);
    const gDrops = nuevoGain(0.35);
    drops.connect(bp).connect(gDrops).connect(out);
    drops.start();
    sources.push(drops);

    // LFO rápido (0.7 Hz) modula las gotas
    const lfo = nuevoLFO(0.7, 0.15, gDrops.gain);
    sources.push(lfo);

    return { gain: out, sources };
}

// OLAS — Ruido marrón + capas de espuma con swell oceánico lento
function construirOlas() {
    const out = nuevoGain(0);
    out.connect(masterGain);
    const sources = [];

    // Capa 1: base grave del mar
    const base = nuevoSource(buffers.brown);
    const lp1 = nuevoFiltro('lowpass', 500);
    const gBase = nuevoGain(0.5);
    base.connect(lp1).connect(gBase).connect(out);
    base.start();
    sources.push(base);

    // Capa 2: espuma media con swell
    const espuma = nuevoSource(buffers.pink);
    const bp2 = nuevoFiltro('bandpass', 1200, 0.8);
    const gEspuma = nuevoGain(0.25);
    espuma.connect(bp2).connect(gEspuma).connect(out);
    espuma.start();
    sources.push(espuma);

    // LFO muy lento (0.07 Hz ≈ 14s por ciclo) → oleaje principal
    const lfoSwell = nuevoLFO(0.07, 0.25, gEspuma.gain);
    sources.push(lfoSwell);

    // Segundo LFO desfasado (0.11 Hz ≈ 9s) → variación en la base
    const lfoVar = nuevoLFO(0.11, 0.15, gBase.gain);
    sources.push(lfoVar);

    return { gain: out, sources };
}

// TORMENTA — Lluvia pesada + viento + retumbar grave con swell lento
function construirTormenta() {
    const out = nuevoGain(0);
    out.connect(masterGain);
    const sources = [];

    // 1. Lluvia pesada
    const rain = nuevoSource(buffers.white);
    const rhp = nuevoFiltro('highpass', 500, 0.7);
    const rlp = nuevoFiltro('lowpass', 6000);
    const gRain = nuevoGain(0.55);
    rain.connect(rhp).connect(rlp).connect(gRain).connect(out);
    rain.start();
    sources.push(rain);

    // 2. Viento — banda media con swell
    const wind = nuevoSource(buffers.pink);
    const wbp = nuevoFiltro('bandpass', 600, 0.5);
    const gWind = nuevoGain(0.3);
    wind.connect(wbp).connect(gWind).connect(out);
    wind.start();
    sources.push(wind);

    const lfoWind = nuevoLFO(0.08, 0.2, gWind.gain);
    sources.push(lfoWind);

    // 3. Retumbar grave — simula truenos lejanos
    const rumble = nuevoSource(buffers.brown);
    const rlp2 = nuevoFiltro('lowpass', 180);
    const gRumble = nuevoGain(0.35);
    rumble.connect(rlp2).connect(gRumble).connect(out);
    rumble.start();
    sources.push(rumble);

    // LFO muy lento (0.05 Hz = 20s) → "oleadas" de trueno lejano
    const lfoRumble = nuevoLFO(0.05, 0.25, gRumble.gain);
    sources.push(lfoRumble);

    return { gain: out, sources };
}

const CONSTRUCTORES = {
    lluvia:   construirLluvia,
    olas:     construirOlas,
    tormenta: construirTormenta
};

function construirPreset(nombre) {
    const fn = CONSTRUCTORES[nombre] || CONSTRUCTORES.lluvia;
    return fn();
}

function destruirNodos(nodos) {
    if (!nodos) return;
    nodos.sources.forEach(s => {
        try { s.stop(); } catch (e) {}
        try { s.disconnect(); } catch (e) {}
    });
    try { nodos.gain.disconnect(); } catch (e) {}
}

// ============================================================
//  CONTROL DE REPRODUCCIÓN
// ============================================================
async function reproducir() {
    if (iniciando || playing) return;
    if (!soportaWebAudio()) {
        alert('Tu navegador no soporta Web Audio API.');
        return;
    }

    iniciando = true;
    clearTimeout(pausandoTimer);

    try {
        crearContexto();

        // Resume por si estaba suspendido
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }

        // Si no hay nodos o hay que rehacerlos, construimos
        if (!nodosActivos) {
            nodosActivos = construirPreset(presetActual);
        }

        // Fade-in
        const now = ctx.currentTime;
        const g = nodosActivos.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(1, now + 1.2);

        playing = true;
        actualizarUI();
        guardar();

    } catch (e) {
        console.warn('[Sonidos] No se pudo iniciar:', e);
        alert('No se pudo iniciar el audio. Verificá los permisos del navegador.');
    } finally {
        iniciando = false;
    }
}

function pausar() {
    if (!playing || !nodosActivos) return;

    const now = ctx.currentTime;
    const g = nodosActivos.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.5);

    playing = false;
    actualizarUI();

    clearTimeout(pausandoTimer);
    pausandoTimer = setTimeout(() => {
        if (!playing && ctx && ctx.state === 'running') {
            try { ctx.suspend(); } catch (e) {}
        }
    }, 600);

    guardar();
}

async function cambiarPreset(nuevo) {
    if (!PRESETS_VALIDOS.includes(nuevo)) return;
    if (nuevo === presetActual) return;

    const anterior = presetActual;
    presetActual = nuevo;

    // Actualizar pills
    document.querySelectorAll('.sf-preset').forEach(p => {
        p.classList.toggle('active', p.dataset.preset === nuevo);
    });

    actualizarUI();
    guardar();

    if (!playing || !nodosActivos) return;

    // Crossfade
    const oldNodos = nodosActivos;
    const newNodos = construirPreset(nuevo);
    newNodos.gain.gain.setValueAtTime(0, ctx.currentTime);

    const now = ctx.currentTime;
    // Fade out viejo
    const og = oldNodos.gain.gain;
    og.cancelScheduledValues(now);
    og.setValueAtTime(og.value, now);
    og.linearRampToValueAtTime(0, now + 0.8);
    // Fade in nuevo
    const ng = newNodos.gain.gain;
    ng.cancelScheduledValues(now);
    ng.setValueAtTime(0, now);
    ng.linearRampToValueAtTime(1, now + 0.8);

    nodosActivos = newNodos;

    // Destruir viejo después del fade
    setTimeout(() => destruirNodos(oldNodos), 900);
}

function setVolumen(v) {
    volumen = Math.max(0, Math.min(1, v));
    if (ctx && masterGain) {
        const now = ctx.currentTime;
        const g = masterGain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(g.value, now);
        g.linearRampToValueAtTime(volumen, now + 0.05);
    }
    actualizarIconoVolumen();
    guardar();
}

function toggleMute() {
    if (volumen > 0) {
        volumenAntesDeSilenciar = volumen;
        setVolumen(0);
    } else {
        setVolumen(volumenAntesDeSilenciar || 0.6);
    }
    const slider = document.getElementById('sfVol');
    if (slider) slider.value = String(volumen);
}

// ============================================================
//  UI
// ============================================================
function actualizarUI() {
    const btn = document.getElementById('sfBtnPlay');
    const status = document.getElementById('sfStatus');
    const widget = document.getElementById('sfWidget');

    if (btn) {
        btn.classList.toggle('reproduciendo', playing);
        btn.innerHTML = playing
            ? '<i data-lucide="pause"></i>'
            : '<i data-lucide="play"></i>';
        btn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    }

    if (widget) {
        widget.classList.toggle('reproduciendo', playing);
    }

    if (status) {
        if (playing) {
            status.textContent = LABELS_PRESET[presetActual] || presetActual;
        } else if (ctx) {
            status.textContent = 'En pausa';
        } else {
            status.textContent = 'Tocá para empezar';
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

function actualizarIconoVolumen() {
    const icon = document.getElementById('sfVolIcon');
    if (!icon) return;
    const i = volumen === 0 ? 'volume-x'
        : volumen < 0.5 ? 'volume-1'
        : 'volume-2';
    icon.innerHTML = `<i data-lucide="${i}"></i>`;
    icon.title = volumen === 0 ? 'Activar sonido' : 'Silenciar';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    document.getElementById('sfBtnPlay')?.addEventListener('click', () => {
        if (playing) pausar();
        else reproducir();
    });

    document.querySelectorAll('.sf-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            cambiarPreset(btn.dataset.preset);
        });
    });

    document.getElementById('sfVol')?.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        setVolumen(v);
    });

    document.getElementById('sfVolIcon')?.addEventListener('click', toggleMute);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    // Cargar estado guardado
    const guardado = await cargarGuardado();
    if (guardado) {
        presetActual = guardado.preset;
        volumen = guardado.volumen;
    }

    // Aplicar preset guardado a las pills
    document.querySelectorAll('.sf-preset').forEach(p => {
        p.classList.toggle('active', p.dataset.preset === presetActual);
    });

    // Aplicar volumen al slider
    const slider = document.getElementById('sfVol');
    if (slider) slider.value = String(volumen);

    // Actualizar icono de volumen
    actualizarIconoVolumen();

    // Estado inicial
    actualizarUI();

    // Event listeners
    inicializarEventos();

    // Si no soporta Web Audio, mostrar aviso
    if (!soportaWebAudio()) {
        const status = document.getElementById('sfStatus');
        if (status) status.textContent = 'Navegador no compatible';
        const btn = document.getElementById('sfBtnPlay');
        if (btn) btn.disabled = true;
    }

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

// Cerrar el contexto al salir del widget (evita audio fantasma)
window.addEventListener('pagehide', () => {
    if (ctx && ctx.state !== 'closed') {
        try { ctx.close(); } catch (e) {}
    }
});
