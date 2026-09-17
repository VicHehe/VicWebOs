// ============================================================
//  ConfigBD.js — Solo GitHub + Caché IndexedDB transparente
//  IndexedDB NO es fuente de datos, solo caché temporal.
// ============================================================

const BD_CONFIG_KEY = 'vicwebos_bd';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

const BD_DEFAULT = {
    githubToken: '',
    githubRepo: '',
    githubOwner: '',
    githubConectado: false
};

// ============================================================
//  CONFIG (localStorage) — solo conexión, NUNCA datos
// ============================================================
function cargarConfigBD() {
    try {
        const raw = localStorage.getItem(BD_CONFIG_KEY);
        if (raw) return { ...BD_DEFAULT, ...JSON.parse(raw) };
    } catch (e) { console.warn(e); }
    return { ...BD_DEFAULT };
}

function guardarConfigBD(config) {
    try {
        localStorage.setItem(BD_CONFIG_KEY, JSON.stringify(config));
    } catch (e) { console.warn(e); }
}

// ============================================================
//  INDEXEDDB — solo caché
// ============================================================
const IDB_NAME = 'VicWebOsCache';
const IDB_VERSION = 1;
const IDB_STORE = 'cache';

function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
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

// ============================================================
//  CACHÉ con TTL
// ============================================================
async function leerCache(nombre) {
    try {
        const entry = await idbGet('cache_' + nombre);
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) return null; // expirado
        return entry.data;
    } catch (e) { return null; }
}

async function guardarCache(nombre, data) {
    try {
        await idbSet('cache_' + nombre, { data, ts: Date.now() });
    } catch (e) { console.warn(e); }
}

async function invalidarCache(nombre) {
    try { await idbDelete('cache_' + nombre); } catch (e) {}
}

async function invalidarTodoCache() {
    try { await idbClear(); } catch (e) { console.warn(e); }
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
        throw new Error(err.message || 'Error al escribir en GitHub.');
    }
    return await res.json();
}

async function conectarGitHub(token, nombreRepo) {
    const usuario = await ghObtenerUsuario(token);
    const owner = usuario.login;
    const existe = await ghRepoExiste(token, owner, nombreRepo);

    let creadoAhora = false;
    if (!existe) {
        await ghCrearRepo(token, nombreRepo);
        creadoAhora = true;
        await new Promise(r => setTimeout(r, 1200));
    }

    return { owner, repo: nombreRepo, creado: creadoAhora, existe: true };
}

// ============================================================
//  API PÚBLICA
// ============================================================
const ConfigBD = {
    estaConectado() {
        const c = cargarConfigBD();
        return !!(c.githubConectado && c.githubToken && c.githubOwner && c.githubRepo);
    },

    obtenerInfo() {
        const c = cargarConfigBD();
        if (!this.estaConectado()) return null;
        return { owner: c.githubOwner, repo: c.githubRepo };
    },

    async leerArchivo(nombre) {
        // 1) Caché (rápido)
        const cache = await leerCache(nombre);
        if (cache !== null) return cache;

        // 2) GitHub (fuente de verdad)
        if (!this.estaConectado()) return null;
        const config = cargarConfigBD();
        try {
            const archivo = await ghLeerArchivo(
                config.githubToken, config.githubOwner, config.githubRepo, nombre
            );
            if (!archivo) return null;
            const data = JSON.parse(archivo.contenido);
            await guardarCache(nombre, data);
            return data;
        } catch (e) {
            console.warn('Error leyendo ' + nombre + ':', e);
            return null;
        }
    },

    // Lee SIEMPRE desde GitHub, ignorando el caché.
    // Útil para polling (notificaciones, mensajes, etc.).
    async leerArchivoFresh(nombre) {
        await invalidarCache(nombre);
        return await this.leerArchivo(nombre);
    },

    async escribirArchivo(nombre, datos) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        const config = cargarConfigBD();

        const actual = await ghLeerArchivo(
            config.githubToken, config.githubOwner, config.githubRepo, nombre
        );

        await ghEscribirArchivo(
            config.githubToken, config.githubOwner, config.githubRepo,
            nombre, JSON.stringify(datos, null, 2), actual?.sha || null
        );

        // Actualizar caché para la próxima lectura
        await guardarCache(nombre, datos);
        return { ok: true };
    },

    // Invalida el caché de un archivo concreto (fuerza releer de GitHub).
    async invalidarCache(nombre) {
        return await invalidarCache(nombre);
    },

    // Invalida TODO el caché local.
    async invalidarTodo() {
        return await invalidarTodoCache();
    },

    async conectar(token, repo) {
        const resultado = await conectarGitHub(token, repo);

        // Al cambiar de repo → invalidar todo el caché
        await invalidarTodoCache();

        const config = cargarConfigBD();
        config.githubToken = token;
        config.githubRepo = repo;
        config.githubOwner = resultado.owner;
        config.githubConectado = true;
        guardarConfigBD(config);

        return resultado;
    },

    async desconectar() {
        const config = cargarConfigBD();
        config.githubToken = '';
        config.githubRepo = '';
        config.githubOwner = '';
        config.githubConectado = false;
        guardarConfigBD(config);
        await invalidarTodoCache();
    }
};

window.ConfigBD = ConfigBD;

// ============================================================
//  UI: SECCIÓN "BASE DE DATOS"
// ============================================================
function actualizarUIBD() {
    const sinConectar = document.getElementById('bdSinConectar');
    const conectado   = document.getElementById('bdConectado');
    const repoNombre  = document.getElementById('bdRepoNombre');
    const repoOwner   = document.getElementById('bdRepoOwner');

    if (!sinConectar || !conectado) return;

    if (ConfigBD.estaConectado()) {
        const info = ConfigBD.obtenerInfo();
        sinConectar.style.display = 'none';
        conectado.style.display = 'block';
        if (repoNombre) repoNombre.textContent = info.repo;
        if (repoOwner)  repoOwner.textContent = '@' + info.owner;
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
    const githubEstado   = document.getElementById('githubEstado');

    // Estado inicial
    actualizarUIBD();

    // Pre-rellenar si ya hay datos
    const config = cargarConfigBD();
    if (githubToken && config.githubToken) githubToken.value = config.githubToken;
    if (githubRepo && config.githubRepo) githubRepo.value = config.githubRepo;

    // -------- Conectar --------
    if (btnConectar) {
        btnConectar.addEventListener('click', async () => {
            const token = githubToken.value.trim();
            const repo  = githubRepo.value.trim();

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
                const resultado = await ConfigBD.conectar(token, repo);

                if (resultado.creado) {
                    mostrarEstado(`✅ Repositorio "${repo}" creado y conectado como ${resultado.owner}.`, 'success');
                } else {
                    mostrarEstado(`✅ Conectado al repositorio "${resultado.owner}/${repo}".`, 'success');
                }

                // Refrescar UI global
                actualizarUIBD();
                if (typeof renderSidebar === 'function') renderSidebar();
                if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();

                setTimeout(() => {
                    if (githubEstado) githubEstado.textContent = '';
                }, 2500);
            } catch (err) {
                mostrarEstado('❌ ' + err.message, 'error');
            } finally {
                btnConectar.disabled = false;
                btnConectar.innerHTML = '<i data-lucide="link-2"></i> Conectar con GitHub';
                lucide.createIcons();
            }
        });
    }

    // -------- Desconectar --------
    if (btnDesconectar) {
        btnDesconectar.addEventListener('click', async () => {
            if (!confirm('¿Desconectar el repositorio? Los datos siguen a salvo en GitHub, pero se borrará el caché local.')) return;
            await ConfigBD.desconectar();

            // Cerrar sesión local
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

    // Exponer globalmente para cuando se abra el modal
    window.__actualizarUIBD = actualizarUIBD;
});
