// ============================================================
//  ConfigBD.js — Base de datos (IndexedDB + GitHub)
//  - IndexedDB: almacenamiento local en el navegador
//  - GitHub: sincronización con un repositorio privado
// ============================================================

const BD_CONFIG_KEY = 'vicwebos_bd';

const BD_DEFAULT = {
    tipo: 'indexeddb',      // 'indexeddb' | 'github'
    githubToken: '',
    githubRepo: '',
    githubOwner: '',
    githubConectado: false
};

// ---------- CONFIG BD (localStorage para saber dónde guardar) ----------
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
//  INDEXEDDB
// ============================================================
const IDB_NAME = 'VicWebOsDB';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';

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

// ============================================================
//  GITHUB API (classic token)
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
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: GH_HEADERS(token)
    });
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
    if (!res.ok) throw new Error('Error al leer el archivo de GitHub.');
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

// ============================================================
//  CONECTAR CON GITHUB (crea el repo si no existe, si existe lo usa)
// ============================================================
async function conectarGitHub(token, nombreRepo) {
    // 1. Obtener usuario
    const usuario = await ghObtenerUsuario(token);
    const owner = usuario.login;

    // 2. Verificar si existe
    const existe = await ghRepoExiste(token, owner, nombreRepo);

    let creadoAhora = false;
    if (!existe) {
        await ghCrearRepo(token, nombreRepo);
        creadoAhora = true;
        // Esperar un momento a que GitHub inicialice el repo
        await new Promise(r => setTimeout(r, 1200));
    }

    return {
        owner,
        repo: nombreRepo,
        creado: creadoAhora,
        existe: true
    };
}

// ============================================================
//  API PÚBLICA DE ALMACENAMIENTO
// ============================================================
const DATA_FILE = 'vicwebos-data.json';

const ConfigBD = {
    // -------- Guardar (según config actual) --------
    async guardar(datos) {
        const config = cargarConfigBD();

        if (config.tipo === 'github') {
            if (!config.githubToken || !config.githubOwner || !config.githubRepo) {
                throw new Error('GitHub no está conectado.');
            }
            const path = DATA_FILE;
            const actual = await ghLeerArchivo(
                config.githubToken, config.githubOwner, config.githubRepo, path
            );
            await ghEscribirArchivo(
                config.githubToken, config.githubOwner, config.githubRepo,
                path, JSON.stringify(datos, null, 2), actual?.sha || null
            );
            return { ok: true, destino: 'github' };
        }

        // Por defecto: IndexedDB
        await idbSet('vicwebos_data', datos);
        return { ok: true, destino: 'indexeddb' };
    },

    // -------- Cargar --------
    async cargar() {
        const config = cargarConfigBD();

        if (config.tipo === 'github') {
            if (!config.githubToken || !config.githubOwner || !config.githubRepo) return null;
            try {
                const archivo = await ghLeerArchivo(
                    config.githubToken, config.githubOwner, config.githubRepo, DATA_FILE
                );
                if (!archivo) return null;
                return JSON.parse(archivo.contenido);
            } catch (e) {
                console.warn('Error cargando de GitHub:', e);
                return null;
            }
        }

        return await idbGet('vicwebos_data');
    },

    // -------- Probar conexión --------
    async probarConexion(token, repo) {
        return await conectarGitHub(token, repo);
    }
};

// Exponer globalmente
window.ConfigBD = ConfigBD;

// ============================================================
//  UI: SECCIÓN "BASE DE DATOS"
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const githubConfig  = document.getElementById('githubConfig');
    const githubToken   = document.getElementById('githubToken');
    const githubRepo    = document.getElementById('githubRepo');
    const btnConectar   = document.getElementById('btnConectarGitHub');
    const githubEstado  = document.getElementById('githubEstado');

    // -------- Cambio de opción storage --------
    document.querySelectorAll('input[name="storage"]').forEach(r => {
        r.addEventListener('change', (e) => {
            githubConfig.style.display = e.target.value === 'github' ? 'block' : 'none';
        });
    });

    // -------- Conectar con GitHub --------
    if (btnConectar) {
        btnConectar.addEventListener('click', async () => {
            const token = githubToken.value.trim();
            const repo  = githubRepo.value.trim();

            if (!token) {
                mostrarEstado('❌ Introduce tu token personal.', 'error');
                return;
            }
            if (!repo) {
                mostrarEstado('❌ Introduce un nombre de repositorio.', 'error');
                return;
            }
            if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
                mostrarEstado('❌ El nombre solo puede tener letras, números, puntos, guiones y guiones bajos.', 'error');
                return;
            }

            btnConectar.disabled = true;
            btnConectar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Conectando...';
            lucide.createIcons();
            mostrarEstado('⏳ Verificando token y repositorio...', 'info');

            try {
                const resultado = await conectarGitHub(token, repo);
                const config = cargarConfigBD();
                config.tipo = 'github';
                config.githubToken = token;
                config.githubRepo = repo;
                config.githubOwner = resultado.owner;
                config.githubConectado = true;
                guardarConfigBD(config);

                if (resultado.creado) {
                    mostrarEstado(`✅ Repositorio "${repo}" creado y conectado como ${resultado.owner}.`, 'success');
                } else {
                    mostrarEstado(`✅ Conectado al repositorio "${resultado.owner}/${repo}".`, 'success');
                }
            } catch (err) {
                mostrarEstado('❌ ' + err.message, 'error');
            } finally {
                btnConectar.disabled = false;
                btnConectar.innerHTML = '<i data-lucide="link-2"></i> Conectar con GitHub';
                lucide.createIcons();
            }
        });
    }

    function mostrarEstado(texto, tipo) {
        if (!githubEstado) return;
        githubEstado.textContent = texto;
        githubEstado.className = 'config-status ' + (tipo || '');
    }
});
