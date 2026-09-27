// ============================================================
//  Piano Virtual — VicWebOs
//  ------------------------------------------------------------
//  · Web Audio API (sin dependencias externas para sonido)
//  · Síntesis tipo piano: fundamental + 3 armónicos + lowpass
//    + envolvente ADSR (ataque corto, decay, sustain, release).
//  · Grabación de notas con timestamps (JSON por usuario).
//  · Reproducción con setTimeout encadenado.
//  · Exportación a MIDI (Standard MIDI File, formato 0).
//  · Persistencia: app/piano/{codigo}piano.json
//  ------------------------------------------------------------
//  Datos guardados por grabación:
//    { id, nombre, duracion, creada, eventos: [
//        { tipo:'on'|'off', nota:midi(0-127), vel:0-127, t:seg }
//    ]}
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_BASE = 'app/piano/';
const MAX_GRABACIONES = 20;
const MAX_DURACION_GRAB = 300; // 5 minutos
const AUTOSAVE_DELAY = 900;

// Rango por defecto: C4 (MIDI 60) a B5 (MIDI 83) = 2 octavas
const OCTAVA_MIN = 0;   // C0 (MIDI 12)
const OCTAVA_MAX = 7;   // C7 (MIDI 96)
const NOTAS_BLANCAS = [0, 2, 4, 5, 7, 9, 11]; // semitonos dentro de la octava
const NOMBRES_NOTA = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Mapa de teclado PC → offset desde la nota base (0 = C de la octava actual)
const MAPA_TECLADO = {
    // Blancas
    'a': 0,   // C
    's': 2,   // D
    'd': 4,   // E
    'f': 5,   // F
    'g': 7,   // G
    'h': 9,   // A
    'j': 11,  // B
    'k': 12,  // C (siguiente octava)
    'l': 14,  // D
    'ñ': 16,  // E
    ';': 16,  // E (fallback teclado US)
    // Negras
    'w': 1,   // C#
    'e': 3,   // D#
    't': 6,   // F#
    'y': 8,   // G#
    'u': 10,  // A#
    'o': 13,  // C#
    'p': 15   // D#
};

// ---------- ESTADO ----------
let usuarioActual = null;
let datos = { version: 1, grabaciones: [] };
let audioCtx = null;
let masterGain = null;
let vocesActivas = new Map(); // midi → { osciladores, gain }

let octavaBase = 4;           // C4 = MIDI 60
let teclasPulsadas = new Set(); // teclas PC ya pulsadas (evitar repeat)
let notasActivasPorPuntero = new Map(); // pointerId → midi

// Grabación
let grabando = false;
let grabacionActual = null;   // { inicio: ms, eventos: [] }
let timerGrabacion = null;
let grabacionPendienteGuardar = null;

// Reproducción
let reproduciendo = false;
let grabacionReproduciendo = null;
let timeoutsReproduccion = [];
let notasReproduccionActivas = new Set();

// Volumen
let volumenActual = 0.7;

// UI
let toastTimer = null;
let autosaveTimer = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  TEMA DEL SHELL
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
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function generarId(p) {
    return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('pnToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'pn-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function rutaArchivo() {
    if (!usuarioActual) return null;
    return RUTA_BASE + usuarioActual.codigo + 'piano.json';
}
function midiANombre(midi) {
    const octava = Math.floor(midi / 12) - 1;
    const nota = NOMBRES_NOTA[midi % 12];
    return nota + octava;
}
function formatearDuracion(seg) {
    seg = Math.max(0, seg);
    const m = Math.floor(seg / 60);
    const s = seg - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
function formatearFecha(iso) {
    const d = new Date(iso);
    const ahora = new Date();
    const diffMs = ahora - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `hace ${diffD}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

// ============================================================
//  AUDIO ENGINE
// ============================================================
function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = volumenActual;
        masterGain.connect(audioCtx.destination);
    } catch (e) {
        console.error('[Piano] No se pudo iniciar AudioContext:', e);
        toast('Tu navegador no soporta Web Audio', 'error');
    }
}

function setVolumen(v) {
    volumenActual = Math.max(0, Math.min(1, v));
    if (masterGain) {
        const t = audioCtx.currentTime;
        masterGain.gain.cancelScheduledValues(t);
        masterGain.gain.linearRampToValueAtTime(volumenActual, t + 0.05);
    }
}

function midiAFrec(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Crea una voz (grupo de osciladores + envolvente) y la dispara.
 * Sonido tipo piano: fundamental fuerte + armónicos decrecientes.
 */
function crearVoz(midi, velocity = 1) {
    if (!audioCtx) return null;
    const t = audioCtx.currentTime;
    const freq = midiAFrec(midi);
    const vol = Math.max(0.01, Math.min(1, velocity));

    // ---- Nodo de salida con envolvente ----
    const gain = audioCtx.createGain();
    const pico = 0.22 * vol;

    const ataque = 0.008;
    const decay = 0.35;
    const sustain = 0.32;
    const release = 0.7;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(pico, t + ataque);
    gain.gain.exponentialRampToValueAtTime(pico * sustain + 0.0001, t + ataque + decay);

    // ---- Filtro lowpass dinámico según la nota ----
    const filtro = audioCtx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = Math.min(freq * 8, 9000);
    filtro.Q.value = 0.7;

    // ---- Osciladores (fundamental + armónicos) ----
    // 1: triángulo (cuerpo principal)
    // 2: senoidal x2 (brillo)
    // 3: senoidal x3 (carácter)
    // 4: senoidal x4 (aire sutil)
    const config = [
        { tipo: 'triangle', mult: 1, amp: 1.0 },
        { tipo: 'sine',     mult: 2, amp: 0.35 },
        { tipo: 'sine',     mult: 3, amp: 0.16 },
        { tipo: 'sine',     mult: 4, amp: 0.07 }
    ];

    const osciladores = [];
    config.forEach(cfg => {
        const osc = audioCtx.createOscillator();
        osc.type = cfg.tipo;
        osc.frequency.value = freq * cfg.mult;
        // Ligero detune para naturalidad
        osc.detune.value = (Math.random() - 0.5) * 6;
        const g = audioCtx.createGain();
        g.gain.value = cfg.amp;
        osc.connect(g);
        g.connect(filtro);
        osc.start(t);
        osciladores.push(osc);
    });

    filtro.connect(gain);
    gain.connect(masterGain);

    // ---- Función para detener la voz con release ----
    const detener = () => {
        if (!audioCtx) return;
        const ahora = audioCtx.currentTime;
        gain.gain.cancelScheduledValues(ahora);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ahora);
        gain.gain.exponentialRampToValueAtTime(0.0001, ahora + release);
        osciladores.forEach(o => {
            try { o.stop(ahora + release + 0.1); } catch (e) {}
        });
    };

    return { osciladores, gain, filtro, detener };
}

/**
 * Nota ON. Si la misma nota ya estaba sonando, detiene la voz previa.
 */
function noteOn(midi, velocity = 1, registrar = true) {
    initAudio();
    if (!audioCtx) return;

    // Detener voz previa de la misma nota (por si se toca dos veces)
    if (vocesActivas.has(midi)) {
        try { vocesActivas.get(midi).detener(); } catch (e) {}
        vocesActivas.delete(midi);
    }

    const voz = crearVoz(midi, velocity);
    if (!voz) return;
    vocesActivas.set(midi, voz);

    marcarTeclaActiva(midi, true);

    if (registrar && grabando && grabacionActual) {
        grabacionActual.eventos.push({
            tipo: 'on',
            nota: midi,
            vel: Math.round(Math.max(1, Math.min(127, velocity * 127))),
            t: (performance.now() - grabacionActual.inicio) / 1000
        });
    }
}

function noteOff(midi, registrar = true) {
    const voz = vocesActivas.get(midi);
    if (voz) {
        try { voz.detener(); } catch (e) {}
        vocesActivas.delete(midi);
    }
    marcarTeclaActiva(midi, false);

    if (registrar && grabando && grabacionActual) {
        grabacionActual.eventos.push({
            tipo: 'off',
            nota: midi,
            vel: 0,
            t: (performance.now() - grabacionActual.inicio) / 1000
        });
    }
}

function marcarTeclaActiva(midi, activa) {
    const el = document.querySelector(`.pn-tecla[data-nota="${midi}"]`);
    if (el) el.classList.toggle('activa', activa);
}

// ============================================================
//  CONSTRUCCIÓN DEL PIANO
// ============================================================
function construirPiano() {
    const piano = document.getElementById('pnPiano');
    if (!piano) return;
    piano.innerHTML = '';

    // 2 octavas a partir de octavaBase
    for (let i = 0; i < 2; i++) {
        const octava = octavaBase + i;
        const cont = document.createElement('div');
        cont.className = 'pn-octava';

        // MIDI base de la octava: C de esta octava
        const midiBase = (octava + 1) * 12;

        // Teclas blancas
        NOTAS_BLANCAS.forEach(sem => {
            const midi = midiBase + sem;
            const tecla = document.createElement('div');
            tecla.className = 'pn-tecla pn-tecla-blanca';
            tecla.dataset.nota = midi;
            tecla.innerHTML = `<span class="pn-nota-label">${midiANombre(midi)}</span>`;
            adjuntarEventosTecla(tecla, midi);
            cont.appendChild(tecla);
        });

        // Teclas negras (posiciones específicas)
        // posiciones dentro de la octava: después de C(0), D(1), F(3), G(4), A(5)
        const negrasPos = [
            { pos: 1, sem: 1 },  // C#
            { pos: 2, sem: 3 },  // D#
            { pos: 4, sem: 6 },  // F#
            { pos: 5, sem: 8 },  // G#
            { pos: 6, sem: 10 }  // A#
        ];
        negrasPos.forEach(({ pos, sem }) => {
            const midi = midiBase + sem;
            const tecla = document.createElement('div');
            tecla.className = 'pn-tecla pn-tecla-negra';
            tecla.dataset.nota = midi;
            tecla.dataset.pos = pos;
            adjuntarEventosTecla(tecla, midi);
            cont.appendChild(tecla);
        });

        piano.appendChild(cont);
    }

    // Etiqueta del rango actual
    const midiInicio = (octavaBase + 1) * 12;
    const midiFin = ((octavaBase + 2) + 1) * 12 - 1; // B de la 2da octava
    document.getElementById('pnOctLabel').textContent =
        `${midiANombre(midiInicio)} — ${midiANombre(midiFin)}`;
}

function adjuntarEventosTecla(el, midi) {
    // Pointer events (mouse + touch + stylus, unificados)
    el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        // Registrar el pointer → nota
        notasActivasPorPuntero.set(e.pointerId, midi);
        noteOn(midi, 1);
    });

    const soltar = (e) => {
        if (notasActivasPorPuntero.get(e.pointerId) !== midi) return;
        notasActivasPorPuntero.delete(e.pointerId);
        noteOff(midi);
    };

    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
    el.addEventListener('lostpointercapture', soltar);

    // Bloquear context menu (por si acaso)
    el.addEventListener('contextmenu', e => e.preventDefault());
}

// ============================================================
//  TECLADO PC
// ============================================================
document.addEventListener('keydown', (e) => {
    // Ignorar si hay un input/textarea enfocado
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;

    const k = e.key.toLowerCase();

    // Grabar / detener
    if (k === ' ' && !e.repeat) {
        e.preventDefault();
        toggleGrabacion();
        return;
    }

    // Octavas con Z/X
    if ((k === 'z' || k === 'x') && !e.repeat) {
        e.preventDefault();
        cambiarOctava(k === 'z' ? -1 : 1);
        return;
    }

    // Ignorar repetición para notas
    if (e.repeat) return;
    if (!(k in MAPA_TECLADO)) return;
    if (teclasPulsadas.has(k)) return;

    e.preventDefault();
    teclasPulsadas.add(k);
    const offset = MAPA_TECLADO[k];
    const midiBase = (octavaBase + 1) * 12;
    const midi = midiBase + offset;
    if (midi < 0 || midi > 127) return;
    noteOn(midi, 1);
});

document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!(k in MAPA_TECLADO)) return;
    if (!teclasPulsadas.has(k)) return;
    e.preventDefault();
    teclasPulsadas.delete(k);
    const offset = MAPA_TECLADO[k];
    const midiBase = (octavaBase + 1) * 12;
    const midi = midiBase + offset;
    noteOff(midi);
});

// Al perder foco, liberar todas las teclas
window.addEventListener('blur', () => {
    teclasPulsadas.forEach(k => {
        const offset = MAPA_TECLADO[k];
        const midi = (octavaBase + 1) * 12 + offset;
        noteOff(midi);
    });
    teclasPulsadas.clear();
});

// ============================================================
//  CAMBIAR OCTAVA
// ============================================================
function cambiarOctava(delta) {
    const nueva = Math.max(OCTAVA_MIN, Math.min(OCTAVA_MAX, octavaBase + delta));
    if (nueva === octavaBase) return;

    // Liberar todas las voces activas antes de cambiar
    vocesActivas.forEach((voz, midi) => {
        try { voz.detener(); } catch (e) {}
    });
    vocesActivas.clear();
    notasActivasPorPuntero.clear();

    octavaBase = nueva;
    construirPiano();
}

// ============================================================
//  GRABACIÓN
// ============================================================
function toggleGrabacion() {
    if (grabando) {
        detenerGrabacion();
    } else {
        iniciarGrabacion();
    }
}

function iniciarGrabacion() {
    if (reproduciendo) detenerReproduccion();

    initAudio();
    grabando = true;
    grabacionActual = {
        inicio: performance.now(),
        eventos: []
    };

    // UI
    const btn = document.getElementById('btnGrabar');
    btn.classList.add('grabando');
    document.getElementById('btnGrabarTxt').textContent = 'Parar';
    document.getElementById('pnIndicador').hidden = false;
    document.getElementById('btnDetener').disabled = false;

    // Timer visual
    clearInterval(timerGrabacion);
    timerGrabacion = setInterval(actualizarTiempo, 100);
    actualizarTiempo();

    // Auto-stop a los 5 min
    setTimeout(() => {
        if (grabando && grabacionActual &&
            (performance.now() - grabacionActual.inicio) / 1000 >= MAX_DURACION_GRAB) {
            detenerGrabacion();
        }
    }, (MAX_DURACION_GRAB + 1) * 1000);
}

function detenerGrabacion() {
    if (!grabando || !grabacionActual) return;

    grabando = false;
    clearInterval(timerGrabacion);
    timerGrabacion = null;

    const duracion = (performance.now() - grabacionActual.inicio) / 1000;
    const eventos = grabacionActual.eventos.slice();
    grabacionActual = null;

    // UI
    const btn = document.getElementById('btnGrabar');
    btn.classList.remove('grabando');
    document.getElementById('btnGrabarTxt').textContent = 'Grabar';
    document.getElementById('pnIndicador').hidden = true;
    document.getElementById('btnDetener').disabled = true;
    actualizarTiempo(0);

    if (eventos.length === 0) {
        toast('No grabaste ninguna nota', 'info');
        return;
    }

    // Abrir modal para ponerle nombre
    grabacionPendienteGuardar = {
        id: generarId('grab'),
        nombre: '',
        duracion,
        creada: new Date().toISOString(),
        eventos
    };

    document.getElementById('pnNombreInput').value = `Melodía ${datos.grabaciones.length + 1}`;
    document.getElementById('pnModalInfo').textContent =
        `Duración: ${formatearDuracion(duracion)} · ${eventos.length} eventos`;
    document.getElementById('pnModalNombre').hidden = false;

    setTimeout(() => {
        const inp = document.getElementById('pnNombreInput');
        inp.focus();
        inp.select();
    }, 80);
}

function actualizarTiempo(override) {
    const el = document.getElementById('pnTiempo');
    if (!el) return;
    if (typeof override === 'number') {
        el.textContent = formatearDuracion(override);
        return;
    }
    if (grabando && grabacionActual) {
        const t = (performance.now() - grabacionActual.inicio) / 1000;
        el.textContent = formatearDuracion(t);
    } else {
        el.textContent = '0:00.0';
    }
}

// ============================================================
//  GUARDAR / CARGAR GRABACIONES
// ============================================================
async function cargarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        const raw = await bd.leerArchivo(ruta);
        if (raw && typeof raw === 'object' && Array.isArray(raw.grabaciones)) {
            datos = {
                version: 1,
                grabaciones: raw.grabaciones.filter(g =>
                    g && g.id && Array.isArray(g.eventos)
                ).map(g => ({
                    id: g.id,
                    nombre: String(g.nombre || 'Sin nombre').slice(0, 50),
                    duracion: Number(g.duracion) || 0,
                    creada: g.creada || new Date().toISOString(),
                    eventos: g.eventos.map(ev => ({
                        tipo: ev.tipo === 'off' ? 'off' : 'on',
                        nota: Math.max(0, Math.min(127, Number(ev.nota) || 60)),
                        vel: Math.max(0, Math.min(127, Number(ev.vel) || 100)),
                        t: Math.max(0, Number(ev.t) || 0)
                    }))
                }))
            };
        } else {
            datos = { version: 1, grabaciones: [] };
        }
    } catch (e) {
        console.warn('[Piano] Error cargando:', e);
        datos = { version: 1, grabaciones: [] };
    }
}

async function guardarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        await bd.escribirArchivo(ruta, datos);
    } catch (e) {
        console.warn('[Piano] Error guardando:', e);
        toast('No se pudo guardar', 'error');
    }
}

function agendarGuardado() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => guardarDatos(), AUTOSAVE_DELAY);
}

// ============================================================
//  RENDER LISTA DE GRABACIONES
// ============================================================
function renderGrabaciones() {
    const cont = document.getElementById('pnGrabLista');
    const count = document.getElementById('pnGrabCount');
    if (!cont) return;

    if (count) count.textContent = datos.grabaciones.length;

    if (datos.grabaciones.length === 0) {
        cont.innerHTML = `
            <div class="pn-grab-vacio">
                <i data-lucide="music"></i>
                <span>Todavía no guardaste ninguna grabación</span>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Orden: más reciente primero
    const ordenadas = [...datos.grabaciones].sort((a, b) =>
        new Date(b.creada) - new Date(a.creada)
    );

    cont.innerHTML = ordenadas.map(g => {
        const esActiva = reproduciendo && grabacionReproduciendo?.id === g.id;
        return `
            <div class="pn-grab-item ${esActiva ? 'reproduciendo' : ''}" data-id="${escapar(g.id)}">
                <div class="pn-grab-info">
                    <div class="pn-grab-nombre">${escapar(g.nombre)}</div>
                    <div class="pn-grab-meta">
                        <span>
                            <i data-lucide="clock"></i>
                            ${formatearDuracion(g.duracion)}
                        </span>
                        <span>
                            <i data-lucide="calendar"></i>
                            ${formatearFecha(g.creada)}
                        </span>
                        <span>
                            <i data-lucide="music-2"></i>
                            ${g.eventos.filter(e => e.tipo === 'on').length} notas
                        </span>
                    </div>
                </div>
                <div class="pn-grab-acciones">
                    <button class="pn-grab-btn ${esActiva ? 'reproduciendo' : ''}"
                            data-accion="reproducir" data-id="${escapar(g.id)}"
                            title="${esActiva ? 'Detener' : 'Reproducir'}">
                        <i data-lucide="${esActiva ? 'square' : 'play'}"></i>
                    </button>
                    <button class="pn-grab-btn"
                            data-accion="midi" data-id="${escapar(g.id)}"
                            title="Descargar MIDI">
                        <i data-lucide="download"></i>
                    </button>
                    <button class="pn-grab-btn"
                            data-accion="renombrar" data-id="${escapar(g.id)}"
                            title="Renombrar">
                        <i data-lucide="pencil"></i>
                    </button>
                    <button class="pn-grab-btn pn-grab-btn-danger"
                            data-accion="borrar" data-id="${escapar(g.id)}"
                            title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  REPRODUCCIÓN
// ============================================================
function reproducirGrabacion(grab) {
    if (reproduciendo) detenerReproduccion();
    if (!grab || grab.eventos.length === 0) return;

    initAudio();
    reproduciendo = true;
    grabacionReproduciendo = grab;

    const inicio = performance.now();

    // Programar cada evento
    grab.eventos.forEach(ev => {
        const delay = ev.t * 1000;
        const timeout = setTimeout(() => {
            if (!reproduciendo) return;
            if (ev.tipo === 'on') {
                const vel = (ev.vel || 100) / 127;
                noteOn(ev.nota, vel, false);
                notasReproduccionActivas.add(ev.nota);
            } else {
                noteOff(ev.nota, false);
                notasReproduccionActivas.delete(ev.nota);
            }
        }, delay);
        timeoutsReproduccion.push(timeout);
    });

    // Timeout de fin
    const finMs = (grab.duracion + 0.8) * 1000;
    const timeoutFin = setTimeout(() => {
        if (reproduciendo && grabacionReproduciendo?.id === grab.id) {
            finalizarReproduccion();
        }
    }, finMs);
    timeoutsReproduccion.push(timeoutFin);

    renderGrabaciones();
}

function detenerReproduccion() {
    if (!reproduciendo) return;

    timeoutsReproduccion.forEach(t => clearTimeout(t));
    timeoutsReproduccion = [];

    // Soltar notas que quedaron activas
    notasReproduccionActivas.forEach(midi => {
        noteOff(midi, false);
    });
    notasReproduccionActivas.clear();

    reproduciendo = false;
    grabacionReproduciendo = null;
    renderGrabaciones();
}

function finalizarReproduccion() {
    reproduciendo = false;
    grabacionReproduciendo = null;
    renderGrabaciones();
}

// ============================================================
//  EXPORTAR MIDI
// ============================================================
function encodeVarLen(value) {
    const bytes = [value & 0x7F];
    value >>= 7;
    while (value > 0) {
        bytes.unshift((value & 0x7F) | 0x80);
        value >>= 7;
    }
    return bytes;
}

function exportarMIDI(grab) {
    if (!grab || grab.eventos.length === 0) {
        toast('Esta grabación está vacía', 'error');
        return;
    }

    const DIVISION = 480;
    const TEMPO_US = 500000; // 120 BPM
    const TICKS_POR_SEG = DIVISION * (1000000 / TEMPO_US); // 960

    // Ordenar eventos cronológicamente
    const eventos = [...grab.eventos].sort((a, b) => a.t - b.t);

    // Construir el track
    const track = [];

    // Meta: tempo
    track.push(...encodeVarLen(0));
    track.push(0xFF, 0x51, 0x03);
    track.push((TEMPO_US >> 16) & 0xFF, (TEMPO_US >> 8) & 0xFF, TEMPO_US & 0xFF);

    // Meta: nombre de pista
    const nombreBytes = [...grab.nombre].map(c => c.charCodeAt(0) & 0x7F);
    track.push(...encodeVarLen(0));
    track.push(0xFF, 0x03, ...encodeVarLen(nombreBytes.length), ...nombreBytes);

    // Eventos de nota
    let tickAnterior = 0;
    eventos.forEach(ev => {
        const tick = Math.round(ev.t * TICKS_POR_SEG);
        const delta = Math.max(0, tick - tickAnterior);
        tickAnterior = tick;

        track.push(...encodeVarLen(delta));
        if (ev.tipo === 'on') {
            track.push(0x90, ev.nota & 0x7F, Math.max(1, Math.min(127, ev.vel || 100)));
        } else {
            track.push(0x80, ev.nota & 0x7F, 0);
        }
    });

    // Meta: end of track
    track.push(...encodeVarLen(0));
    track.push(0xFF, 0x2F, 0x00);

    // Header
    const header = [
        0x4D, 0x54, 0x68, 0x64, // "MThd"
        0x00, 0x00, 0x00, 0x06, // length = 6
        0x00, 0x00,             // format = 0
        0x00, 0x01,             // 1 track
        (DIVISION >> 8) & 0xFF, DIVISION & 0xFF
    ];

    // Track chunk header
    const trackHeader = [
        0x4D, 0x54, 0x72, 0x6B, // "MTrk"
        (track.length >> 24) & 0xFF,
        (track.length >> 16) & 0xFF,
        (track.length >> 8) & 0xFF,
        track.length & 0xFF
    ];

    const bytes = new Uint8Array([...header, ...trackHeader, ...track]);

    const blob = new Blob([bytes], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nombreSeguro = (grab.nombre || 'grabacion').replace(/[^a-z0-9\-_]/gi, '_');
    a.download = `${nombreSeguro}.mid`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast('MIDI descargado', 'success');
}

// ============================================================
//  ACCIONES DE GRABACIÓN
// ============================================================
async function confirmarGuardado() {
    if (!grabacionPendienteGuardar) return;

    const nombre = document.getElementById('pnNombreInput').value.trim().slice(0, 50) || 'Sin nombre';
    grabacionPendienteGuardar.nombre = nombre;

    // Verificar límite
    if (datos.grabaciones.length >= MAX_GRABACIONES) {
        toast(`Máximo ${MAX_GRABACIONES} grabaciones`, 'error');
        return;
    }

    datos.grabaciones.push(grabacionPendienteGuardar);
    grabacionPendienteGuardar = null;
    document.getElementById('pnModalNombre').hidden = true;

    await guardarDatos();
    renderGrabaciones();
    toast('Grabación guardada', 'success');
}

function cancelarGuardado() {
    grabacionPendienteGuardar = null;
    document.getElementById('pnModalNombre').hidden = true;
}

function pedirBorrar(id) {
    const grab = datos.grabaciones.find(g => g.id === id);
    if (!grab) return;
    document.getElementById('pnBorrarTexto').textContent =
        `¿Eliminar "${grab.nombre}"? No se puede deshacer.`;
    document.getElementById('pnModalBorrar').dataset.id = id;
    document.getElementById('pnModalBorrar').hidden = false;
}

async function confirmarBorrar() {
    const id = document.getElementById('pnModalBorrar').dataset.id;
    if (!id) return;

    // Si se está reproduciendo, detener
    if (grabacionReproduciendo?.id === id) detenerReproduccion();

    datos.grabaciones = datos.grabaciones.filter(g => g.id !== id);
    document.getElementById('pnModalBorrar').hidden = true;
    await guardarDatos();
    renderGrabaciones();
    toast('Grabación eliminada', 'success');
}

async function renombrarGrabacion(id) {
    const grab = datos.grabaciones.find(g => g.id === id);
    if (!grab) return;
    const nuevo = prompt('Nuevo nombre:', grab.nombre);
    if (nuevo === null) return;
    const limpio = String(nuevo).trim().slice(0, 50);
    if (!limpio) return;
    grab.nombre = limpio;
    await guardarDatos();
    renderGrabaciones();
    toast('Renombrada', 'success');
}

// ============================================================
//  EVENTOS UI
// ============================================================
function bindUI() {
    document.getElementById('btnGrabar')?.addEventListener('click', toggleGrabacion);
    document.getElementById('btnDetener')?.addEventListener('click', () => {
        if (grabando) detenerGrabacion();
        if (reproduciendo) detenerReproduccion();
    });
    document.getElementById('btnLimpiarPista')?.addEventListener('click', () => {
        if (grabando) {
            if (!confirm('¿Detener la grabación actual y descartarla?')) return;
            grabando = false;
            grabacionActual = null;
            clearInterval(timerGrabacion);
            timerGrabacion = null;
            document.getElementById('btnGrabar').classList.remove('grabando');
            document.getElementById('btnGrabarTxt').textContent = 'Grabar';
            document.getElementById('pnIndicador').hidden = true;
            document.getElementById('btnDetener').disabled = true;
            actualizarTiempo(0);
            toast('Grabación descartada', 'info');
        }
    });

    // Octavas
    document.getElementById('btnOctDown')?.addEventListener('click', () => cambiarOctava(-1));
    document.getElementById('btnOctUp')?.addEventListener('click', () => cambiarOctava(1));

    // Volumen
    const btnVol = document.getElementById('btnVolumen');
    const panelVol = document.getElementById('pnVolumenPanel');
    const sliderVol = document.getElementById('pnVolumenSlider');

    btnVol?.addEventListener('click', () => {
        panelVol.hidden = !panelVol.hidden;
    });
    sliderVol?.addEventListener('input', (e) => {
        setVolumen(parseInt(e.target.value, 10) / 100);
    });

    // Modal nombre
    document.getElementById('btnCancelarGuardar')?.addEventListener('click', cancelarGuardado);
    document.getElementById('btnConfirmarGuardar')?.addEventListener('click', confirmarGuardado);
    document.getElementById('pnModalNombre')?.addEventListener('click', (e) => {
        if (e.target.id === 'pnModalNombre') cancelarGuardado();
    });
    document.getElementById('pnNombreInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); confirmarGuardado(); }
        if (e.key === 'Escape') cancelarGuardado();
    });

    // Modal borrar
    document.getElementById('btnCancelarBorrar')?.addEventListener('click', () => {
        document.getElementById('pnModalBorrar').hidden = true;
    });
    document.getElementById('btnConfirmarBorrar')?.addEventListener('click', confirmarBorrar);
    document.getElementById('pnModalBorrar')?.addEventListener('click', (e) => {
        if (e.target.id === 'pnModalBorrar') e.target.hidden = true;
    });

    // Delegación: acciones de la lista de grabaciones
    document.getElementById('pnGrabLista')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        const accion = btn.dataset.accion;
        const id = btn.dataset.id;
        const grab = datos.grabaciones.find(g => g.id === id);
        if (!grab) return;

        if (accion === 'reproducir') {
            if (reproduciendo && grabacionReproduciendo?.id === id) detenerReproduccion();
            else reproducirGrabacion(grab);
        }
        if (accion === 'midi')      exportarMIDI(grab);
        if (accion === 'renombrar') renombrarGrabacion(id);
        if (accion === 'borrar')    pedirBorrar(id);
    });

    // Escape global
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalNombre = document.getElementById('pnModalNombre');
            const modalBorrar = document.getElementById('pnModalBorrar');
            if (!modalNombre.hidden) { cancelarGuardado(); return; }
            if (!modalBorrar.hidden) { modalBorrar.hidden = true; return; }
        }
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Piano Virtual necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar el Piano.'); return; }

    const badge = document.getElementById('pnUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    construirPiano();
    await cargarDatos();
    renderGrabaciones();
    bindUI();

    // Inicializar audio en el primer gesto del usuario
    const initOnce = () => {
        initAudio();
        window.removeEventListener('pointerdown', initOnce);
        window.removeEventListener('keydown', initOnce);
    };
    window.addEventListener('pointerdown', initOnce, { once: false });
    window.addEventListener('keydown', initOnce, { once: false });

    // Guardar al cerrar
    window.addEventListener('pagehide', () => {
        clearTimeout(autosaveTimer);
        guardarDatos();
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
