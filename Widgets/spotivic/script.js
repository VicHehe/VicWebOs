// ============================================================
//  Widget: Spotivic
//  Mini reproductor de música: hasta 4 canciones MP3.
//  Persistencia: IndexedDB (local, por usuario). NO usa GitHub.
//  Las canciones se añaden/borran desde el modal (engranaje).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME     = 'SpotivicWidgetDB';
const IDB_VERSION  = 1;
const IDB_STORE    = 'canciones';
const MAX_PISTAS   = 4;
const MAX_BYTES    = 20 * 1024 * 1024;   // 20 MB por canción

let usuarioActual = null;
let pistas   = new Array(MAX_PISTAS).fill(null);  // {nombre, tamano, duracion, blob}
let actual   = -1;        // slot sonando / seleccionado
let urlActual = null;     // blob URL del audio cargado
let ocupado  = false;
let arrastrandoSeek = false;
let ajustes  = { volumen: 0.8, repetir: false };

const audio = new Audio();
audio.preload = 'auto';

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
        req.onerror   = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

// Las escrituras SÍ lanzan error (ej. cuota llena) para avisar al usuario
async function idbSet(key, value) {
    const db = await abrirIDB();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror    = (e) => reject(e.target.error);
        tx.onabort    = (e) => reject(e.target.error || new Error('Escritura cancelada.'));
    });
}

async function idbDelete(key) {
    const db = await abrirIDB();
    return await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror    = (e) => reject(e.target.error);
    });
}

function codigo() {
    return (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
}
const clavePista   = (slot) => `sv_${codigo()}_${slot}`;
const claveAjustes = ()     => `sv_${codigo()}_ajustes`;

async function cargarTodo() {
    for (let i = 0; i < MAX_PISTAS; i++) {
        const d = await idbGet(clavePista(i));
        if (d && d.blob) {
            pistas[i] = {
                nombre:   d.nombre || 'Canción',
                tamano:   d.tamano || d.blob.size || 0,
                duracion: d.duracion || 0,
                blob:     d.blob
            };
        }
    }
    const aj = await idbGet(claveAjustes());
    if (aj && typeof aj === 'object') {
        if (typeof aj.volumen === 'number') ajustes.volumen = Math.min(1, Math.max(0, aj.volumen));
        ajustes.repetir = !!aj.repetir;
    }
}

function guardarAjustes() {
    idbSet(claveAjustes(), { ...ajustes }).catch(() => {});
}

// ============================================================
//  UTILIDADES
// ============================================================
function escapar(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function formatearTiempo(seg) {
    if (!isFinite(seg) || seg < 0) seg = 0;
    const m = Math.floor(seg / 60);
    const s = Math.floor(seg % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatearTamano(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function nombreLimpio(nombreArchivo) {
    return nombreArchivo.replace(/\.mp3$/i, '').replace(/[_]+/g, ' ').trim() || 'Canción';
}

function mostrarMensaje(msg) {
    const el = document.getElementById('svMsg');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(mostrarMensaje._t);
    mostrarMensaje._t = setTimeout(() => { el.hidden = true; }, 5000);
}

function liberarURL() {
    if (urlActual) { URL.revokeObjectURL(urlActual); urlActual = null; }
}

function leerDuracion(blob) {
    return new Promise((resolve) => {
        const a = new Audio();
        const u = URL.createObjectURL(blob);
        const fin = (v) => { URL.revokeObjectURL(u); resolve(v); };
        a.preload = 'metadata';
        a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : 0);
        a.onerror = () => fin(null);   // null = no es un audio válido
        a.src = u;
    });
}

function validar(file) {
    if (!file) return 'No se seleccionó ningún archivo.';
    const esMp3 = /\.mp3$/i.test(file.name) || file.type === 'audio/mpeg';
    if (!esMp3) return `"${file.name}" no es un MP3.`;
    if (file.size === 0) return `"${file.name}" está vacío.`;
    if (file.size > MAX_BYTES) {
        return `"${file.name}" pesa ${formatearTamano(file.size)}. Máximo ${MAX_BYTES / 1024 / 1024} MB.`;
    }
    return null;
}

function slotsLlenos() {
    return pistas.map((p, i) => p ? i : -1).filter(i => i >= 0);
}
function slotsLibres() {
    return pistas.map((p, i) => p ? -1 : i).filter(i => i >= 0);
}

// ============================================================
//  ACCIONES: AÑADIR / BORRAR
// ============================================================
let slotPendiente = null;

function abrirSelector(slot) {
    if (ocupado) return;
    if (slotsLibres().length === 0) {
        mostrarMensaje('Ya tienes 4 canciones. Borra una para añadir otra.');
        return;
    }
    slotPendiente = (typeof slot === 'number') ? slot : null;
    const input = document.getElementById('svInput');
    input.value = '';
    input.click();
}

async function anadirArchivos(files) {
    if (ocupado || !files.length) return;
    mostrarMensaje(null);

    const libres = slotsLibres();
    if (slotPendiente !== null && libres.includes(slotPendiente)) {
        libres.splice(libres.indexOf(slotPendiente), 1);
        libres.unshift(slotPendiente);
    }
    slotPendiente = null;

    ocupado = true;
    const errores = [];
    let omitidos = 0;

    for (const file of files) {
        if (libres.length === 0) { omitidos++; continue; }

        const err = validar(file);
        if (err) { errores.push(err); continue; }

        const duracion = await leerDuracion(file);
        if (duracion === null) { errores.push(`"${file.name}" no se pudo leer como audio.`); continue; }

        const slot = libres.shift();
        const pista = {
            nombre: nombreLimpio(file.name),
            tamano: file.size,
            duracion,
            blob: file
        };
        try {
            await idbSet(clavePista(slot), { ...pista, actualizado: new Date().toISOString() });
            pistas[slot] = pista;
            render();
        } catch (e) {
            console.warn('[Spotivic] Error guardando:', e);
            libres.unshift(slot);
            errores.push(`No se pudo guardar "${file.name}" (¿sin espacio en el navegador?).`);
        }
    }

    ocupado = false;
    if (omitidos) errores.push(`Solo caben ${MAX_PISTAS} canciones; ${omitidos} no se añadieron.`);
    if (errores.length) mostrarMensaje(errores[0] + (errores.length > 1 ? ` (+${errores.length - 1} más)` : ''));
    render();
}

async function borrarPista(slot) {
    if (ocupado || !pistas[slot]) return;
    if (!confirm(`¿Borrar "${pistas[slot].nombre}"?`)) return;

    try {
        await idbDelete(clavePista(slot));
    } catch (e) {
        mostrarMensaje('No se pudo borrar la canción.');
        return;
    }
    if (slot === actual) detener();
    pistas[slot] = null;
    render();
}

// ============================================================
//  REPRODUCCIÓN
// ============================================================
function detener() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    liberarURL();
    actual = -1;
    actualizarProgreso();
}

function reproducir(slot, reiniciar = false) {
    const p = pistas[slot];
    if (!p) return;

    // Mismo tema: reiniciar (si viene de "siguiente") o alternar play/pausa
    if (slot === actual && urlActual) {
        if (reiniciar) { audio.currentTime = 0; audio.play().catch(() => {}); }
        else if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
        return;
    }

    liberarURL();
    urlActual = URL.createObjectURL(p.blob);
    audio.src = urlActual;
    actual = slot;
    audio.loop = ajustes.repetir;
    audio.play().catch((e) => {
        console.warn('[Spotivic] No se pudo reproducir:', e);
        mostrarMensaje('No se pudo reproducir esta canción.');
    });
    render();
}

function alternarPlay() {
    if (actual < 0) {
        const llenos = slotsLlenos();
        if (llenos.length) reproducir(llenos[0]);
        return;
    }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function saltar(dir) {
    const llenos = slotsLlenos();
    if (!llenos.length) return;
    const idx = llenos.indexOf(actual);
    const sig = idx < 0 ? 0 : (idx + dir + llenos.length) % llenos.length;
    reproducir(llenos[sig], true);
}

function alternarRepetir() {
    ajustes.repetir = !ajustes.repetir;
    audio.loop = ajustes.repetir;
    guardarAjustes();
    renderControles();
}

function alternarMute() {
    audio.muted = !audio.muted;
    renderControles();
}

audio.addEventListener('play',  () => { renderControles(); renderPuntos(); renderInfo(); });
audio.addEventListener('pause', () => { renderControles(); renderPuntos(); renderInfo(); });
audio.addEventListener('ended', () => { if (!ajustes.repetir) saltar(1); });
audio.addEventListener('timeupdate',     actualizarProgreso);
audio.addEventListener('loadedmetadata', actualizarProgreso);
audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    mostrarMensaje('Error al reproducir el audio.');
});

// ============================================================
//  RENDER
// ============================================================
function setIcono(btn, nombre) {
    if (!btn) return;
    btn.innerHTML = `<i data-lucide="${nombre}"></i>`;
}

function renderControles() {
    const sonando = actual >= 0 && !audio.paused;
    setIcono(document.getElementById('svBtnPlay'), sonando ? 'pause' : 'play');
    setIcono(document.getElementById('svBtnMute'),
        (audio.muted || audio.volume === 0) ? 'volume-x' : 'volume-2');
    document.getElementById('svBtnRepetir').classList.toggle('activo', ajustes.repetir);
    if (window.lucide) window.lucide.createIcons();
}

function renderInfo() {
    const nombre = document.getElementById('svNombre');
    const sub    = document.getElementById('svSub');
    const disco  = document.getElementById('svDisco');
    const p = pistas[actual];
    if (p) {
        nombre.textContent = p.nombre;
        sub.textContent = audio.paused ? 'En pausa' : 'Reproduciendo';
    } else {
        nombre.textContent = 'Nada sonando';
        sub.textContent = slotsLlenos().length ? 'Elige una canción' : 'Sube tus canciones MP3';
    }
    disco.classList.toggle('girando', !!p && !audio.paused);
}

function renderPuntos() {
    const cont = document.getElementById('svPuntos');
    const sonando = actual >= 0 && !audio.paused;
    let html = '';
    for (let i = 0; i < MAX_PISTAS; i++) {
        const p = pistas[i];
        if (!p) {
            html += `<button class="sv-punto sv-punto-vacio" data-vacio="${i}" title="Espacio libre">
                        <i data-lucide="plus"></i></button>`;
            continue;
        }
        const act = i === actual;
        const contenido = (act && sonando)
            ? `<span class="sv-eq"><i></i><i></i><i></i></span>`
            : String(i + 1);
        html += `<button class="sv-punto${act ? ' actual' : ''}" data-punto="${i}"
                    title="${escapar(p.nombre)}">${contenido}</button>`;
    }
    cont.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

// ---------- Modal "Mis canciones" ----------
function modalAbierto() {
    return !document.getElementById('svModal').hidden;
}
function abrirModal()  { document.getElementById('svModal').hidden = false; renderModal(); }
function cerrarModal() { document.getElementById('svModal').hidden = true; }

function renderModal() {
    const cont = document.getElementById('svModalLista');
    let html = '';
    for (let i = 0; i < MAX_PISTAS; i++) {
        const p = pistas[i];
        if (!p) {
            html += `
                <button class="sv-mrow sv-mrow-vacia" data-add="${i}">
                    <span class="sv-mnum"><i data-lucide="plus"></i></span>
                    <span class="sv-mtexto"><b>Espacio libre</b><small>Toca para subir un MP3</small></span>
                </button>`;
            continue;
        }
        html += `
            <div class="sv-mrow">
                <span class="sv-mnum">${i + 1}</span>
                <span class="sv-mtexto">
                    <b title="${escapar(p.nombre)}">${escapar(p.nombre)}</b>
                    <small>${formatearTiempo(p.duracion)} · ${formatearTamano(p.tamano)}</small>
                </span>
                <button class="sv-mdel" data-del="${i}" title="Borrar canción">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>`;
    }
    cont.innerHTML = html;
    const n = slotsLlenos().length;
    document.getElementById('svModalContador').textContent = `${n}/${MAX_PISTAS}`;
    document.getElementById('svBtnAnadirModal').disabled = slotsLibres().length === 0;
    if (window.lucide) window.lucide.createIcons();
}

function actualizarProgreso() {
    const seek = document.getElementById('svSeek');
    const tAct = document.getElementById('svTActual');
    const tTot = document.getElementById('svTTotal');
    if (!seek) return;

    const dur = (actual >= 0 && isFinite(audio.duration) && audio.duration > 0)
        ? audio.duration
        : (pistas[actual] ? pistas[actual].duracion : 0);
    const pos = actual >= 0 ? audio.currentTime : 0;

    tTot.textContent = formatearTiempo(dur);
    if (!arrastrandoSeek) {
        tAct.textContent = formatearTiempo(pos);
        const pct = dur > 0 ? (pos / dur) * 1000 : 0;
        seek.value = pct;
        seek.style.setProperty('--pct', (pct / 10) + '%');
    }
}

function render() {
    const n = slotsLlenos().length;
    document.getElementById('svContador').textContent = `${n}/${MAX_PISTAS}`;
    document.getElementById('svVacio').hidden  = n > 0;
    document.getElementById('svCuerpo').hidden = n === 0;
    renderInfo();
    renderPuntos();
    renderControles();
    actualizarProgreso();
    if (modalAbierto()) renderModal();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    const api = API();
    try { usuarioActual = api && api.obtenerCuenta ? api.obtenerCuenta() : null; }
    catch (e) { usuarioActual = null; }

    // Botones
    document.getElementById('svBtnConfig').addEventListener('click', abrirModal);
    document.getElementById('svModalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('svBtnAnadirModal').addEventListener('click', () => abrirSelector());
    document.getElementById('svBtnVacioAnadir').addEventListener('click', () => abrirSelector());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalAbierto()) cerrarModal(); });

    document.getElementById('svBtnPlay').addEventListener('click', alternarPlay);
    document.getElementById('svBtnPrev').addEventListener('click', () => saltar(-1));
    document.getElementById('svBtnNext').addEventListener('click', () => saltar(1));
    document.getElementById('svBtnRepetir').addEventListener('click', alternarRepetir);
    document.getElementById('svBtnMute').addEventListener('click', alternarMute);

    // Input de archivos
    document.getElementById('svInput').addEventListener('change', (e) => {
        anadirArchivos(Array.from(e.target.files || []));
    });

    // Puntos de canciones (pantalla principal)
    document.getElementById('svPuntos').addEventListener('click', (e) => {
        const pu = e.target.closest('[data-punto]');
        if (pu) { reproducir(Number(pu.dataset.punto)); return; }
        if (e.target.closest('[data-vacio]')) abrirModal();
    });

    // Lista del modal (añadir / borrar)
    document.getElementById('svModalLista').addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) { borrarPista(Number(del.dataset.del)); return; }
        const add = e.target.closest('[data-add]');
        if (add) abrirSelector(Number(add.dataset.add));
    });

    // Barra de progreso
    const seek = document.getElementById('svSeek');
    seek.addEventListener('input', () => {
        arrastrandoSeek = true;
        const dur = isFinite(audio.duration) ? audio.duration : 0;
        const t = (seek.value / 1000) * dur;
        document.getElementById('svTActual').textContent = formatearTiempo(t);
        seek.style.setProperty('--pct', (seek.value / 10) + '%');
    });
    seek.addEventListener('change', () => {
        if (actual >= 0 && isFinite(audio.duration)) {
            audio.currentTime = (seek.value / 1000) * audio.duration;
        }
        arrastrandoSeek = false;
    });

    // Volumen
    const vol = document.getElementById('svVol');
    vol.addEventListener('input', () => {
        audio.volume = vol.value / 100;
        audio.muted = false;
        ajustes.volumen = audio.volume;
        vol.style.setProperty('--pct', vol.value + '%');
        renderControles();
    });
    vol.addEventListener('change', guardarAjustes);

    await cargarTodo();

    audio.volume = ajustes.volumen;
    audio.loop = ajustes.repetir;
    vol.value = Math.round(ajustes.volumen * 100);
    vol.style.setProperty('--pct', vol.value + '%');

    render();
    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('beforeunload', () => { audio.pause(); liberarURL(); });
