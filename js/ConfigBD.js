// ============================================================
//  ConfigBD.js — GitHub + Multi-Comunidad + Caché IndexedDB
//  ------------------------------------------------------------
//  CAMBIOS IMPORTANTES (multi-comunidad):
//    - Ya no hay UNA sola conexión. Hay N comunidades.
//    - Cada comunidad tiene su propio { token, owner, repo, nombre }.
//    - localStorage guarda la lista + cuál está activa.
//    - Cada comunidad tiene SU sesión (código) independiente.
//    - El caché de IndexedDB se namespacea por comunidad para no
//      mezclar datos entre comunidades.
// ============================================================

const BD_CONFIG_KEY = 'vicwebos_bd_v2';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const BD_DEFAULT = {
    comunidades: [],          // [{ id, nombre, token, owner, repo, avatarColor }]
    comunidadActiva: null     // id de la comunidad activa
};

// ============================================================
//  CONFIG (localStorage)
// ============================================================
function cargarConfigBD() {
    try {
        const raw = localStorage.getItem(BD_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Migración suave desde v1 (una sola conexión)
            if (parsed.githubToken && !parsed.comunidades) {
                return {
                    comunidades: [{
                        id: 'com_' + Date.now().toString(36),
                        nombre: parsed.githubRepo || 'Mi comunidad',
                        token: parsed.githubToken,
                        owner: parsed.githubOwner,
                        repo: parsed.githubRepo,
                        avatarColor: '#8B5CF6'
                    }],
                    comunidadActiva: 'com_' + Date.now().toString(36)
                };
            }
            return { ...BD_DEFAULT, ...parsed };
        }
    } catch (e) { console.warn(e); }
    return { ...BD_DEFAULT };
}

function guardarConfigBD(config) {
    try {
        localStorage.setItem(BD_CONFIG_KEY, JSON.stringify(config));
    } catch (e) { console.warn(e); }
}

// ---------- Helpers de comunidad ----------
function obtenerComunidadActiva() {
    const cfg = cargarConfigBD();
    if (!cfg.comunidadActiva) return null;
    return cfg.comunidades.find(c => c.id === cfg.comunidadActiva) || null;
}

function listarComunidades() {
    return cargarConfigBD().comunidades || [];
}

function guardarComunidad(comunidad) {
    const cfg = cargarConfigBD();
    const i = cfg.comunidades.findIndex(c => c.id === comunidad.id);
    if (i >= 0) cfg.comunidades[i] = comunidad;
    else cfg.comunidades.push(comunidad);
    guardarConfigBD(cfg);
    return comunidad;
}

function eliminarComunidad(id) {
    const cfg = cargarConfigBD();
    cfg.comunidades = cfg.comunidades.filter(c => c.id !== id);
    if (cfg.comunidadActiva === id) {
        cfg.comunidadActiva = cfg.comunidades[0]?.id || null;
    }
    guardarConfigBD(cfg);
}

function fijarComunidadActiva(id) {
    const cfg = cargarConfigBD();
    if (!cfg.comunidades.find(c => c.id === id)) return false;
    cfg.comunidadActiva = id;
    guardarConfigBD(cfg);
    return true;
}

// ============================================================
//  INDEXEDDB — caché namespaceada por comunidad
// ============================================================
const IDB_NAME = 'VicWebOsCache';
const IDB_VERSION = 2;             // subimos versión: nuevo store
const IDB_STORE = 'cache';

let _idbPromise = null;
function abrirIDB() {
    if (_idbPromise) return _idbPromise;
    _idbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => { _idbPromise = null; reject(e.target.error); };
    });
    return _idbPromise;
}

async function idbSet(key, value) {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbDelete(key) {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

async function idbClear() {
    const db = await abrirIDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

// Prefijo de namespace: si no hay comunidad activa, "_global_"
function prefijoCache() {
    const c = obtenerComunidadActiva();
    return c ? `com_${c.id}__` : '_global_';
}

async function leerCache(nombre) {
    try {
        const entry = await idbGet(prefijoCache() + 'cache_' + nombre);
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) return null;
        return entry.data;
    } catch (e) { return null; }
}

async function guardarCache(nombre, data) {
    try {
        await idbSet(prefijoCache() + 'cache_' + nombre, { data, ts: Date.now() });
    } catch (e) { console.warn(e); }
}

async function invalidarCache(nombre) {
    try { await idbDelete(prefijoCache() + 'cache_' + nombre); } catch (e) {}
}

// Borra SOLO el caché de la comunidad activa
async function invalidarCacheComunidadActiva() {
    const db = await abrirIDB();
    const pref = prefijoCache();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.openKeyCursor();
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (String(cursor.key).startsWith(pref)) store.delete(cursor.key);
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

async function invalidarTodoCache() {
    try { await idbClear(); } catch (e) { console.warn(e); }
}

// ============================================================
//  DETECCIÓN DE TIPO DE TOKEN
//  - ghp_, gho_, ghu_, ghs_, ghr_ → clásico
//  - github_pat_                  → fine-grained
// ============================================================
function tipoDeToken(token) {
    if (!token) return 'desconocido';
    const t = token.trim();
    if (t.startsWith('ghp_') ||
        t.startsWith('gho_') ||
        t.startsWith('ghu_') ||
        t.startsWith('ghs_') ||
        t.startsWith('ghr_')) return 'clasico';
    if (t.startsWith('github_pat_')) return 'fine-grained';
    return 'desconocido';
}

// ============================================================
//  GITHUB API
// ============================================================
const GH_HEADERS = (token) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
});

async function ghObtenerUsuario(token) {
    const res = await fetch('https://api.github.com/user', { headers: GH_HEADERS(token) });
    if (!res.ok) throw new Error('Token inválido o sin permisos.');
    return await res.json();
}

async function ghRepoExiste(token, owner, repo) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH_HEADERS(token) });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error('Error al verificar el repositorio.');
    return true;
}

// Verifica que el token pueda ESCRIBIR en el repo objetivo.
// Devuelve { puede: true, repo } o lanza Error con motivo.
async function ghVerificarPermisosEscritura(token, owner, repo) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH_HEADERS(token) });
    if (res.status === 404) {
        throw new Error(`El token no tiene acceso al repositorio "${owner}/${repo}". Verifica que sea el correcto o que el token tenga permisos sobre él.`);
    }
    if (!res.ok) throw new Error('No se pudo verificar el repositorio.');

    const data = await res.json();
    // "permissions" existe en la respuesta del repo para tokens con acceso
    const p = data.permissions || {};
    if (p.push === false && p.admin === false && p.maintain === false) {
        throw new Error(`El token NO tiene permiso de escritura sobre "${owner}/${repo}". Necesita al menos "push" (Contents: Read and write en fine-grained).`);
    }
    return data;
}

// Igual que arriba pero para creación de repo nuevo.
async function ghPuedeCrearRepo(token) {
    const u = await ghObtenerUsuario(token);
    // scopes viene en la cabecera X-OAuth-Scopes para tokens clásicos.
    // Para fine-grained no aplica igual, así que no bloqueamos.
    return u;
}

async function ghCrearRepo(token, nombre) {
    const res = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: nombre,
            private: true,
            auto_init: true,
            description: 'Datos de VicWebOs'
        })
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Error típico: token fine-grained sin permiso de crear repo.
        if (res.status === 403 || res.status === 404) {
            throw new Error(`No se pudo crear el repositorio. Si usas un token fine-grained, necesita el permiso "Administration: Read and write" en tu cuenta, o crea el repositorio manualmente en GitHub y vuelve a intentar.`);
        }
        throw new Error(err.message || 'No se pudo crear el repositorio.');
    }
    return await res.json();
}

async function ghLeerArchivo(token, owner, repo, path) {
    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers: GH_HEADERS(token) }
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Error al leer el archivo.');
    const data = await res.json();
    const contenido = decodeURIComponent(escape(atob(data.content)));
    return { contenido, sha: data.sha };
}

async function ghEscribirArchivo(token, owner, repo, path, contenido, sha = null) {
    const body = {
        message: 'Actualizar datos de VicWebOs',
        content: btoa(unescape(encodeURIComponent(contenido))),
        ...(sha ? { sha } : {})
    };
    const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
            method: 'PUT',
            headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const e = new Error(err.message || 'Error al escribir en GitHub.');
        e.status = res.status;
        throw e;
    }
    return await res.json();
}

function esConflicto(e) {
    if (!e) return false;
    if (e.status === 409 || e.status === 422) return true;
    const m = String(e.message || '').toLowerCase();
    return m.includes('conflict') ||
           m.includes('fast forward') ||
           m.includes('does not match') ||
           m.includes('sha');
}

function esperar(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================================
//  CONEXIÓN / DESCONEXIÓN DE COMUNIDADES
// ============================================================

// Crea (si hace falta) y registra una comunidad nueva.
// Devuelve la comunidad registrada (con id).
async function conectarComunidad({ token, repo, nombre }) {
    const tipo = tipoDeToken(token);
    if (tipo === 'desconocido') {
        throw new Error('El token no parece de GitHub. Debe empezar con "ghp_", "github_pat_" o similar.');
    }

    const usuario = await ghObtenerUsuario(token);
    const owner = usuario.login;

    // 1) ¿Existe el repo?
    let existe = await ghRepoExiste(token, owner, repo);
    let creadoAhora = false;

    // 2) Si NO existe y el token es clásico, intentamos crearlo.
    //    Si es fine-grained, es MUY probable que no tenga permiso
    //    de "Administration", así que pedimos crearlo manualmente.
    if (!existe) {
        if (tipo === 'fine-grained') {
            throw new Error(`El repositorio "${owner}/${repo}" no existe. Con un token fine-grained debes crear el repositorio manualmente en GitHub (privado, con un README). Luego vuelve a conectar.`);
        }
        await ghCrearRepo(token, repo);
        creadoAhora = true;
        await esperar(1200);
    }

    // 3) Verificar permisos de escritura sobre el repo
    await ghVerificarPermisosEscritura(token, owner, repo);

    // 4) Registrar/actualizar comunidad
    const cfg = cargarConfigBD();
    // ¿Existe ya una comunidad con mismo owner/repo?
    let comunidad = cfg.comunidades.find(c => c.owner === owner && c.repo === repo);
    if (comunidad) {
        comunidad.token = token;
        comunidad.nombre = nombre || comunidad.nombre || repo;
    } else {
        comunidad = {
            id: 'com_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
            nombre: nombre || repo,
            token,
            owner,
            repo,
            avatarColor: colorAleatorio()
        };
        cfg.comunidades.push(comunidad);
    }
    cfg.comunidadActiva = comunidad.id;
    guardarConfigBD(cfg);

    // 5) Limpiar caché de TODAS las comunidades (por seguridad al
    //    haber cambiado algo estructural). El namespace protege,
    //    pero queremos datos frescos de aquí en adelante.
    await invalidarTodoCache();

    return { comunidad, creado: creadoAhora, tipoToken: tipo, owner };
}

function colorAleatorio() {
    const paleta = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F97316', '#EF4444', '#14B8A6', '#A855F7'];
    return paleta[Math.floor(Math.random() * paleta.length)];
}

async function desconectarComunidadActiva() {
    const c = obtenerComunidadActiva();
    if (!c) return;
    // Solo quita el token (por seguridad), mantiene la entrada con
    // marcador para que el usuario pueda reconectar fácilmente.
    const cfg = cargarConfigBD();
    const com = cfg.comunidades.find(x => x.id === c.id);
    if (com) com.token = '';
    guardarConfigBD(cfg);
    await invalidarCacheComunidadActiva();
}

async function eliminarComunidadPorId(id) {
    eliminarComunidad(id);
    await invalidarTodoCache(); // purga total, es lo más seguro
}

async function cambiarComunidad(id) {
    if (!fijarComunidadActiva(id)) throw new Error('Comunidad no encontrada.');
    // Al cambiar de comunidad, la sesión del shell debe reiniciarse
    // (los datos son distintos). Cerramos sesión de la comunidad anterior.
    if (typeof cerrarSesion === 'function') {
        try { cerrarSesion(); } catch (e) {}
    }
    // No borramos caché global: cada comunidad tiene su namespace.
    // Solo pedimos al shell que recargue todo.
    window.dispatchEvent(new CustomEvent('vicwebos:comunidad', {
        detail: { id, comunidad: obtenerComunidadActiva() }
    }));
    return obtenerComunidadActiva();
}

// ============================================================
//  API PÚBLICA (ConfigBD)
// ============================================================
const ConfigBD = {
    // ---------- Estado ----------
    estaConectado() {
        const c = obtenerComunidadActiva();
        return !!(c && c.token && c.owner && c.repo);
    },

    obtenerInfo() {
        const c = obtenerComunidadActiva();
        if (!c) return null;
        return { owner: c.owner, repo: c.repo, nombre: c.nombre, id: c.id };
    },

    // ---------- Gestión de comunidades ----------
    listarComunidades,
    obtenerComunidadActiva,
    cambiarComunidad,
    eliminarComunidad: eliminarComunidadPorId,
    desconectarComunidadActiva,
    conectar: conectarComunidad,

    // Compat: devuelve true si la comunidad activa tiene token.
    async desconectar() {
        return await desconectarComunidadActiva();
    },

    // ---------- Lectura/escritura JSON ----------
    async leerArchivo(nombre) {
        const cache = await leerCache(nombre);
        if (cache !== null) return cache;

        if (!this.estaConectado()) return null;
        const c = obtenerComunidadActiva();
        try {
            const archivo = await ghLeerArchivo(c.token, c.owner, c.repo, nombre);
            if (!archivo) return null;
            const data = JSON.parse(archivo.contenido);
            await guardarCache(nombre, data);
            return data;
        } catch (e) {
            console.warn('Error leyendo ' + nombre + ':', e);
            return null;
        }
    },

    async leerArchivoFresh(nombre) {
        await invalidarCache(nombre);
        return await this.leerArchivo(nombre);
    },

    async escribirArchivo(nombre, datos) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        const c = obtenerComunidadActiva();

        const actual = await ghLeerArchivo(c.token, c.owner, c.repo, nombre);

        await ghEscribirArchivo(
            c.token, c.owner, c.repo,
            nombre, JSON.stringify(datos, null, 2), actual?.sha || null
        );

        await guardarCache(nombre, datos);
        return { ok: true };
    },

    async actualizarArchivo(nombre, mutador, opciones = {}) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        if (typeof mutador !== 'function') {
            throw new Error('actualizarArchivo requiere una función mutadora.');
        }
        const maxIntentos = opciones.intentos || 5;
        const c = obtenerComunidadActiva();

        for (let i = 0; i < maxIntentos; i++) {
            const archivo = await ghLeerArchivo(c.token, c.owner, c.repo, nombre);
            let actual = null;
            if (archivo && archivo.contenido) {
                try { actual = JSON.parse(archivo.contenido); }
                catch (e) { actual = null; }
            }

            let nuevo = mutador(actual);
            const final = (nuevo === undefined) ? actual : nuevo;
            if (final === null || final === undefined) {
                throw new Error('El mutador devolvió vacío; nada que escribir.');
            }

            try {
                await ghEscribirArchivo(
                    c.token, c.owner, c.repo,
                    nombre, JSON.stringify(final, null, 2), archivo?.sha || null
                );
                await guardarCache(nombre, final);
                return final;
            } catch (e) {
                if (i === maxIntentos - 1) throw e;
                if (!esConflicto(e)) throw e;
                console.warn(`[ConfigBD] Conflicto en ${nombre}, reintentando (${i + 1}/${maxIntentos - 1})...`);
                await invalidarCache(nombre);
                await esperar(300 + Math.random() * 400);
            }
        }
    },

    async invalidarCache(nombre) { return await invalidarCache(nombre); },
    async invalidarTodo()        { return await invalidarTodoCache(); },
    async invalidarComunidadActiva() { return await invalidarCacheComunidadActiva(); },

    // ---------- Utilidades de token ----------
    tipoDeToken
};

window.ConfigBD = ConfigBD;

// ============================================================
//  UI: SECCIÓN "BASE DE DATOS" — Multi-comunidad
// ============================================================
function actualizarUIBD() {
    const lista        = document.getElementById('bdListaComunidades');
    const sinConectar  = document.getElementById('bdSinConectar');
    const conectado    = document.getElementById('bdConectado');
    const repoNombre   = document.getElementById('bdRepoNombre');
    const repoOwner    = document.getElementById('bdRepoOwner');

    if (!sinConectar || !conectado) return;

    // --- Render lista de comunidades ---
    if (lista) {
        const comunidades = listarComunidades();
        const activaId = obtenerComunidadActiva()?.id;
        if (comunidades.length === 0) {
            lista.innerHTML = `<p class="config-help">Aún no tienes comunidades conectadas.</p>`;
        } else {
            lista.innerHTML = '';
            comunidades.forEach(c => {
                const item = document.createElement('div');
                const activa = c.id === activaId;
                item.className = 'bd-comunidad-item' + (activa ? ' activa' : '');
                item.dataset.id = c.id;
                item.innerHTML = `
                    <div class="bd-comunidad-avatar" style="background:${c.avatarColor || '#8B5CF6'}">
                        ${(c.nombre || c.repo || '?').charAt(0).toUpperCase()}
                    </div>
                    <div class="bd-comunidad-info">
                        <span class="bd-comunidad-nombre">${c.nombre || c.repo}</span>
                        <span class="bd-comunidad-repo">${c.owner}/${c.repo}</span>
                    </div>
                    <div class="bd-comunidad-acciones">
                        ${activa ? '<span class="bd-comunidad-badge">Activa</span>' : ''}
                        ${c.token ? '' : '<span class="bd-comunidad-badge sin-token">Sin token</span>'}
                        <button class="bd-comunidad-del" data-id="${c.id}" title="Eliminar">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                `;
                lista.appendChild(item);
            });
            lucide.createIcons();

            // Click: activar comunidad
            lista.querySelectorAll('.bd-comunidad-item').forEach(el => {
                el.addEventListener('click', async (e) => {
                    if (e.target.closest('.bd-comunidad-del')) return;
                    const id = el.dataset.id;
                    if (id === activaId) return;
                    try {
                        await ConfigBD.cambiarComunidad(id);
                        // El shell se encarga de recargar la sesión
                        // desde el listener vicwebos:comunidad.
                        actualizarUIBD();
                        if (typeof renderSidebar === 'function') renderSidebar();
                        if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
                        if (window.Notificaciones) window.Notificaciones.recargar().catch(() => {});
                    } catch (err) { alert('❌ ' + err.message); }
                });
            });

            // Click: eliminar
            lista.querySelectorAll('.bd-comunidad-del').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm('¿Eliminar esta comunidad del dispositivo? Los datos siguen a salvo en GitHub.')) return;
                    await ConfigBD.eliminarComunidad(btn.dataset.id);
                    actualizarUIBD();
                    if (typeof renderSidebar === 'function') renderSidebar();
                    if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
                });
            });
        }
    }

    // --- Mostrar conectado/sin conectar de la comunidad activa ---
    if (ConfigBD.estaConectado()) {
        const info = ConfigBD.obtenerInfo();
        sinConectar.style.display = 'none';
        conectado.style.display = 'block';
        if (repoNombre) repoNombre.textContent = info.repo;
        if (repoOwner)  repoOwner.textContent = '@' + info.owner + (info.nombre && info.nombre !== info.repo ? ` · ${info.nombre}` : '');
    } else {
        sinConectar.style.display = 'block';
        conectado.style.display = 'none';
    }
    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
    const btnConectar    = document.getElementById('btnConectarGitHub');
    const btnDesconectar = document.getElementById('btnDesconectarGitHub');
    const githubToken    = document.getElementById('githubToken');
    const githubRepo     = document.getElementById('githubRepo');
    const githubNombre   = document.getElementById('githubNombreComunidad');
    const githubTipo     = document.getElementById('githubTipoToken');
    const githubEstado   = document.getElementById('githubEstado');

    actualizarUIBD();

    // Detectar tipo de token al escribir
    if (githubToken && githubTipo) {
        githubToken.addEventListener('input', () => {
            const t = tipoDeToken(githubToken.value.trim());
            const etiquetas = {
                'clasico':      'Token clásico',
                'fine-grained': 'Token fine-grained',
                'desconocido':  'Detectando…'
            };
            const colores = {
                'clasico':      'info',
                'fine-grained': 'info',
                'desconocido':  'help'
            };
            githubTipo.textContent = etiquetas[t];
            githubTipo.className = 'bd-tipo-token ' + colores[t];
        });
    }

    // Conectar
    if (btnConectar) {
        btnConectar.addEventListener('click', async () => {
            const token  = githubToken.value.trim();
            const repo   = githubRepo.value.trim();
            const nombre = githubNombre?.value.trim() || '';

            if (!token) { mostrarEstado('❌ Introduce tu token personal.', 'error'); return; }
            if (!repo)  { mostrarEstado('❌ Introduce un nombre de repositorio.', 'error'); return; }
            if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
                mostrarEstado('❌ El nombre solo puede tener letras, números, puntos, guiones y guiones bajos.', 'error');
                return;
            }

            btnConectar.disabled = true;
            btnConectar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Conectando...';
            lucide.createIcons();
            mostrarEstado('⏳ Verificando token y repositorio...', 'info');

            try {
                const r = await ConfigBD.conectar({ token, repo, nombre });

                if (r.creado) {
                    mostrarEstado(`✅ Repositorio "${repo}" creado y comunidad "${r.comunidad.nombre}" conectada como ${r.owner}.`, 'success');
                } else {
                    mostrarEstado(`✅ Comunidad "${r.comunidad.nombre}" conectada a ${r.owner}/${repo}.`, 'success');
                }

                actualizarUIBD();
                if (typeof renderSidebar === 'function') renderSidebar();
                if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
                if (window.Notificaciones) window.Notificaciones.recargar().catch(() => {});

                githubToken.value = '';
                githubRepo.value = '';
                if (githubNombre) githubNombre.value = '';
                if (githubTipo) { githubTipo.textContent = ''; githubTipo.className = 'bd-tipo-token'; }

                setTimeout(() => { if (githubEstado) githubEstado.textContent = ''; }, 2500);
            } catch (err) {
                mostrarEstado('❌ ' + err.message, 'error');
            } finally {
                btnConectar.disabled = false;
                btnConectar.innerHTML = '<i data-lucide="link-2"></i> Conectar comunidad';
                lucide.createIcons();
            }
        });
    }

    // Desconectar (quita el token de la activa)
    if (btnDesconectar) {
        btnDesconectar.addEventListener('click', async () => {
            if (!confirm('¿Desconectar la comunidad activa? El token se borrará de este dispositivo. Los datos siguen en GitHub.')) return;
            await ConfigBD.desconectar();
            if (typeof cerrarSesion === 'function') cerrarSesion();
            actualizarUIBD();
            if (typeof renderSidebar === 'function') renderSidebar();
            if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
        });
    }

    function mostrarEstado(texto, tipo) {
        if (!githubEstado) return;
        githubEstado.textContent = texto;
        githubEstado.className = 'config-status ' + (tipo || '');
    }

    window.__actualizarUIBD = actualizarUIBD;
});
