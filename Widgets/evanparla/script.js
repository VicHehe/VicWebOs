// ============================================================
//  Widget: EvanParla
//  ------------------------------------------------------------
//  Lee texto en voz alta con Web Speech API.
//  Ideal para escuchar recetas, artículos, notas.
//
//  Persistencia: IndexedDB (local, por usuario).
//  Guarda: último texto + preferencias de voz.
//
//  Notas técnicas:
//  - Chrome corta la síntesis a los ~15s. Para evitarlo,
//    partimos el texto en chunks cortos y los encadenamos.
//  - getVoices() es asíncrono en Chrome; esperamos el evento
//    'voiceschanged'.
//  - Usamos un contador de "sesión" para que los callbacks
//    de utterances viejas no pisen a los nuevos.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'EvanParlaDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';

const CHUNK_MAX = 200;   // caracteres por utterance

let usuarioActual = null;
let inicializado = false;

// Preferencias
let vozURI = '';
let rate = 1;
let pitch = 1;
let vol = 1;
let ultimoTexto = '';

// Estado de reproducción
let voces = [];
let chunks = [];
let chunkActual = 0;
let reproduciendo = false;
let pausado = false;
let sesion = 0;          // contador anti-callbacks-obsoletos

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

const soportaTTS = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

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
    return 'ep_' + codigo;
}

async function cargarGuardado() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return null;
    return {
        texto: typeof data.texto === 'string' ? data.texto : '',
        vozURI: typeof data.vozURI === 'string' ? data.vozURI : '',
        rate:  typeof data.rate  === 'number' ? data.rate  : 1,
        pitch: typeof data.pitch === 'number' ? data.pitch : 1,
        vol:   typeof data.vol   === 'number' ? data.vol   : 1
    };
}

async function guardar() {
    await idbSet(claveEstado(), {
        texto: ultimoTexto,
        vozURI: vozURI,
        rate: rate,
        pitch: pitch,
        vol: vol,
        actualizado: new Date().toISOString()
    });
}

let guardarTimer = null;
function guardarDebounced() {
    clearTimeout(guardarTimer);
    guardarTimer = setTimeout(guardar, 500);
}

// ============================================================
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escaparAttr(s) {
    return escapar(s);
}

// ============================================================
//  VOCES
// ============================================================
function cargarVoces() {
    if (!soportaTTS()) return;
    try {
        voces = window.speechSynthesis.getVoices() || [];
    } catch (e) { voces = []; }
}

function poblarSelectorVoces() {
    const sel = document.getElementById('epVoz');
    const help = document.getElementById('epVozHelp');
    if (!sel) return;

    if (voces.length === 0) {
        sel.innerHTML = '<option value="">Sin voces disponibles</option>';
        sel.disabled = true;
        if (help) help.textContent = 'Tu navegador no tiene voces instaladas o aún no cargaron.';
        return;
    }

    sel.disabled = false;

    const orden = [...voces].sort((a, b) => {
        const ea = (a.lang || '').toLowerCase().startsWith('es');
        const eb = (b.lang || '').toLowerCase().startsWith('es');
        if (ea !== eb) return ea ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    // Si no hay voz elegida aún, tomar default o primera en español
    if (!vozURI) {
        const def = voces.find(v => v.default) || orden[0];
        if (def) vozURI = def.voiceURI;
    }

    sel.innerHTML = orden.map(v => {
        const label = `${v.name} · ${v.lang}${v.default ? ' · por defecto' : ''}`;
        const sel_ = (v.voiceURI === vozURI) ? ' selected' : '';
        return `<option value="${escaparAttr(v.voiceURI)}"${sel_}>${escapar(label)}</option>`;
    }).join('');

    if (help) {
        const v = voces.find(x => x.voiceURI === vozURI);
        const enEs = voces.filter(x => (x.lang || '').toLowerCase().startsWith('es')).length;
        help.textContent = v
            ? `${voces.length} voces · ${enEs} en español · usando ${v.lang}`
            : `${voces.length} voces disponibles`;
    }
}

function obtenerVozActual() {
    if (!voces.length) return null;
    return voces.find(v => v.voiceURI === vozURI)
        || voces.find(v => v.default)
        || voces[0];
}

// ============================================================
//  CHUNKING DEL TEXTO
// ============================================================
function dividirEnChunks(texto) {
    const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!limpio) return [];

    // Cortar por frases
    const frases = limpio.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [limpio];
    const out = [];
    let buf = '';

    for (const f of frases) {
        const t = f.trim();
        if (!t) continue;

        if ((buf + ' ' + t).trim().length <= CHUNK_MAX) {
            buf = (buf ? buf + ' ' : '') + t;
        } else {
            if (buf) out.push(buf);

            if (t.length > CHUNK_MAX) {
                // Frase gigante sin puntuación: cortar por palabras
                let pb = '';
                for (const p of t.split(' ')) {
                    if ((pb + ' ' + p).trim().length <= CHUNK_MAX) {
                        pb = (pb ? pb + ' ' : '') + p;
                    } else {
                        if (pb) out.push(pb);
                        pb = p;
                    }
                }
                buf = pb;
            } else {
                buf = t;
            }
        }
    }
    if (buf) out.push(buf);

    return out;
}

// ============================================================
//  REPRODUCCIÓN
// ============================================================
function limpiarCola() {
    if (!soportaTTS()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}
}

function hablarChunk(i, miSesion) {
    if (miSesion !== sesion) return;   // obsoleto

    if (i >= chunks.length) {
        reproduciendo = false;
        pausado = false;
        chunkActual = 0;
        actualizarUI();
        return;
    }

    chunkActual = i;
    actualizarUI();

    const u = new SpeechSynthesisUtterance(chunks[i]);
    const v = obtenerVozActual();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'es-ES';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = vol;

    u.onend = () => {
        if (miSesion !== sesion) return;
        if (pausado) return;   // se pausó durante el chunk
        hablarChunk(i + 1, miSesion);
    };

    u.onerror = (e) => {
        if (miSesion !== sesion) return;
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        console.warn('[EvanParla] Error TTS:', e.error);
        reproduciendo = false;
        pausado = false;
        actualizarUI();
    };

    try {
        window.speechSynthesis.speak(u);
    } catch (e) {
        console.warn('[EvanParla] speak() falló:', e);
        reproduciendo = false;
        actualizarUI();
    }
}

function reproducir() {
    if (!soportaTTS()) {
        alert('Tu navegador no soporta lectura en voz alta.');
        return;
    }

    const textarea = document.getElementById('epTexto');
    const texto = textarea ? textarea.value : '';
    if (!texto.trim()) {
        alert('Escribí o pegá algún texto primero.');
        return;
    }

    limpiarCola();
    sesion++;
    const miSesion = sesion;

    chunks = dividirEnChunks(texto);
    if (chunks.length === 0) return;

    reproduciendo = true;
    pausado = false;
    chunkActual = 0;
    actualizarUI();
    hablarChunk(0, miSesion);

    ultimoTexto = texto;
    guardarDebounced();
}

function pausar() {
    if (!soportaTTS() || !reproduciendo || pausado) return;
    try {
        window.speechSynthesis.pause();
        pausado = true;
        actualizarUI();
    } catch (e) {}
}

function reanudar() {
    if (!soportaTTS() || !pausado) return;
    try {
        window.speechSynthesis.resume();
        pausado = false;
        actualizarUI();
    } catch (e) {}
}

function detener() {
    if (!soportaTTS()) return;
    sesion++;
    limpiarCola();
    reproduciendo = false;
    pausado = false;
    chunkActual = 0;
    actualizarUI();
}

// ============================================================
//  UI
// ============================================================
function actualizarUI() {
    const btnPlay   = document.getElementById('epBtnPlay');
    const btnPause  = document.getElementById('epBtnPause');
    const btnStop   = document.getElementById('epBtnStop');
    const cont      = document.getElementById('epContador');
    const status    = document.getElementById('epStatus');
    const statusTxt = status ? status.querySelector('.ep-status-txt') : null;

    const hayTexto = (document.getElementById('epTexto')?.value || '').trim().length > 0;
    const puede = soportaTTS() && hayTexto;

    if (btnPlay) {
        const enReproduccion = reproduciendo && !pausado;
        btnPlay.disabled = !puede || enReproduccion;
        btnPlay.title = (reproduciendo && pausado) ? 'Reanudar' : 'Reproducir';
    }

    if (btnPause) {
        btnPause.disabled = !(reproduciendo && !pausado);
    }

    if (btnStop) {
        btnStop.disabled = !reproduciendo;
    }

    if (cont) {
        if (reproduciendo && chunks.length > 0) {
            cont.textContent = `${chunkActual + 1} / ${chunks.length}`;
        } else {
            cont.textContent = '—';
        }
    }

    if (status && statusTxt) {
        if (reproduciendo) {
            status.hidden = false;
            status.classList.toggle('thinking', !pausado);
            statusTxt.textContent = pausado ? 'Pausado' : 'Leyendo…';
        } else {
            status.hidden = true;
            status.classList.remove('thinking');
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL
// ============================================================
function abrirModal() {
    const modal = document.getElementById('epModal');
    if (!modal) return;
    modal.hidden = false;

    // Sincronizar controles
    const rateInput  = document.getElementById('epRate');
    const pitchInput = document.getElementById('epPitch');
    const volInput   = document.getElementById('epVol');
    const rateVal    = document.getElementById('epRateVal');
    const pitchVal   = document.getElementById('epPitchVal');
    const volVal     = document.getElementById('epVolVal');

    if (rateInput)  rateInput.value  = String(rate);
    if (pitchInput) pitchInput.value = String(pitch);
    if (volInput)   volInput.value   = String(vol);
    if (rateVal)    rateVal.textContent  = rate.toFixed(1)  + '×';
    if (pitchVal)   pitchVal.textContent = pitch.toFixed(1);
    if (volVal)     volVal.textContent   = Math.round(vol * 100) + '%';

    cargarVoces();
    poblarSelectorVoces();

    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('epModal');
    if (modal) modal.hidden = true;
    if (soportaTTS()) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
}

function probarVoz() {
    if (!soportaTTS()) return;
    try { window.speechSynthesis.cancel(); } catch (e) {}

    const u = new SpeechSynthesisUtterance('Hola, soy tu lector de voz. Así suena mi voz.');
    const v = obtenerVozActual();
    if (v) u.voice = v;
    u.lang = v ? v.lang : 'es-ES';
    u.rate = rate;
    u.pitch = pitch;
    u.volume = vol;

    try { window.speechSynthesis.speak(u); } catch (e) {}
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    const textarea = document.getElementById('epTexto');

    // Guardar texto (debounced) y refrescar botones
    textarea?.addEventListener('input', () => {
        ultimoTexto = textarea.value;
        guardarDebounced();
        actualizarUI();
    });

    // Botones de control
    document.getElementById('epBtnPlay')?.addEventListener('click', () => {
        if (reproduciendo && pausado) reanudar();
        else reproducir();
    });
    document.getElementById('epBtnPause')?.addEventListener('click', pausar);
    document.getElementById('epBtnStop')?.addEventListener('click', detener);

    // Modal
    document.getElementById('epBtnConfig')?.addEventListener('click', abrirModal);
    document.getElementById('epModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('epBtnTest')?.addEventListener('click', probarVoz);

    // Selector de voz
    document.getElementById('epVoz')?.addEventListener('change', (e) => {
        vozURI = e.target.value;
        poblarSelectorVoces();
        guardarDebounced();
    });

    // Sliders
    const rateInput  = document.getElementById('epRate');
    const pitchInput = document.getElementById('epPitch');
    const volInput   = document.getElementById('epVol');
    const rateVal    = document.getElementById('epRateVal');
    const pitchVal   = document.getElementById('epPitchVal');
    const volVal     = document.getElementById('epVolVal');

    rateInput?.addEventListener('input', (e) => {
        rate = parseFloat(e.target.value);
        if (rateVal) rateVal.textContent = rate.toFixed(1) + '×';
        guardarDebounced();
    });
    pitchInput?.addEventListener('input', (e) => {
        pitch = parseFloat(e.target.value);
        if (pitchVal) pitchVal.textContent = pitch.toFixed(1);
        guardarDebounced();
    });
    volInput?.addEventListener('input', (e) => {
        vol = parseFloat(e.target.value);
        if (volVal) volVal.textContent = Math.round(vol * 100) + '%';
        guardarDebounced();
    });

    // Esc cierra modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('epModal').hidden) {
            cerrarModal();
        }
    });
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
        ultimoTexto = guardado.texto;
        vozURI      = guardado.vozURI;
        rate        = guardado.rate;
        pitch       = guardado.pitch;
        vol         = guardado.vol;
    }

    const textarea = document.getElementById('epTexto');
    if (textarea && ultimoTexto) textarea.value = ultimoTexto;

    // Cargar voces (async en Chrome)
    if (soportaTTS()) {
        cargarVoces();
        if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = () => {
                cargarVoces();
                poblarSelectorVoces();
            };
        }
    }

    actualizarUI();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

// Al cerrar el widget, callar cualquier lectura pendiente
window.addEventListener('pagehide', () => {
    if (soportaTTS()) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
    }
});
