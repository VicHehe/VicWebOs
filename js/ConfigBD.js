// ============================================================
//  ConfigBD.js — Multi-comunidad + GitHub + Caché IndexedDB
//  ------------------------------------------------------------
//  Soporta MÚLTIPLES comunidades (pareja, amigos, familia).
//  Cada comunidad tiene su propio token, repo y sesión.
//  Los datos de cada comunidad están TOTALMENTE aislados.
//
//  IndexedDB NO es fuente de datos, solo caché temporal.
// ============================================================

const BD_CONFIG_KEY = 'vicwebos_bd';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ============================================================
//  COMUNIDADES — almacenamiento
// ============================================================
function leerComunidades() {
    try {
        const raw = localStorage.getItem(BD_CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.githubToken !== undefined && !parsed.comunidades) {
                return migrarFormatoViejo(parsed);
            }
            return {
                comunidades: parsed.comunidades || {},
                activa: parsed.activa || null
            };
        }
    } catch (e) { console.warn(e); }
    return { comunidades: {}, activa: null };
}

function guardarComunidades(data) {
    try {
        localStorage.setItem(BD_CONFIG_KEY, JSON.stringify(data));
    } catch (e) { console.warn(e); }
}

function migrarFormatoViejo(viejo) {
    const comunidades = {};
    let activa = null;
    if (viejo.githubToken && viejo.githubRepo && viejo.githubOwner) {
        const id = 'com_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        comunidades[id] = {
            id,
            nombre: viejo.githubRepo,
            githubToken: viejo.githubToken,
            githubRepo: viejo.githubRepo,
            githubOwner: viejo.githubOwner,
            tipoToken: 'classic',
            conectado: !!viejo.githubConectado,
            creada: new Date().toISOString()
        };
        activa = id;
    }
    const nuevo = { comunidades, activa };
    try { localStorage.setItem(BD_CONFIG_KEY, JSON.stringify(nuevo)); } catch (e) {}
    return nuevo;
}

function obtenerComunidadActiva() {
    const data = leerComunidades();
    if (!data.activa) return null;
    return data.comunidades[data.activa] || null;
}

function obtenerComunidadPorId(id) {
    const data = leerComunidades();
    return data.comunidades[id] || null;
}

function cargarConfigBD() {
    const com = obtenerComunidadActiva();
    if (!com) {
        return { githubToken: '', githubRepo: '', githubOwner: '', githubConectado: false };
    }
    return {
        githubToken: com.githubToken,
        githubRepo: com.githubRepo,
        githubOwner: com.githubOwner,
        githubConectado: com.conectado
    };
}

function guardarConfigBD(config) {
    const data = leerComunidades();
    if (!data.activa) return;
    const com = data.comunidades[data.activa];
    if (!com) return;
    if (config.githubToken !== undefined)     com.githubToken = config.githubToken;
    if (config.githubRepo !== undefined)      com.githubRepo = config.githubRepo;
    if (config.githubOwner !== undefined)     com.githubOwner = config.githubOwner;
    if (config.githubConectado !== undefined) com.conectado = config.githubConectado;
    guardarComunidades(data);
}

function tipoTokenEfectivo(tipo) {
    return tipo === 'assisted' ? 'classic' : tipo;
}

// ============================================================
//  INDEXEDDB
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

function _prefijoCache() {
    const com = obtenerComunidadActiva();
    return 'cache_' + (com ? com.id : 'none') + '_';
}

async function leerCache(nombre) {
    try {
        const key = _prefijoCache() + nombre;
        const entry = await idbGet(key);
        if (!entry) return null;
        if (Date.now() - entry.ts > CACHE_TTL) return null;
        return entry.data;
    } catch (e) { return null; }
}

async function guardarCache(nombre, data) {
    try {
        const key = _prefijoCache() + nombre;
        await idbSet(key, { data, ts: Date.now() });
    } catch (e) { console.warn(e); }
}

async function invalidarCache(nombre) {
    try {
        const key = _prefijoCache() + nombre;
        await idbDelete(key);
    } catch (e) {}
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

async function conectarGitHub(token, nombreRepo, tipoToken = 'classic') {
    const tipoEfectivo = tipoTokenEfectivo(tipoToken);
    const usuario = await ghObtenerUsuario(token);
    const owner = usuario.login;
    const existe = await ghRepoExiste(token, owner, nombreRepo);

    let creadoAhora = false;

    if (!existe) {
        if (tipoEfectivo === 'fine-grained') {
            throw new Error(`Con token fine-grained el repositorio "${nombreRepo}" debe existir ya en tu cuenta. Créalo en github.com/new y vuelve a intentar.`);
        }
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
        const com = obtenerComunidadActiva();
        return !!(com && com.conectado && com.githubToken && com.githubOwner && com.githubRepo);
    },

    obtenerInfo() {
        const com = obtenerComunidadActiva();
        if (!com || !this.estaConectado()) return null;
        return { owner: com.githubOwner, repo: com.githubRepo, nombre: com.nombre, id: com.id };
    },

    listarComunidades() {
        const data = leerComunidades();
        return Object.values(data.comunidades).sort((a, b) =>
            new Date(a.creada || 0) - new Date(b.creada || 0)
        );
    },

    obtenerComunidadActiva() { return obtenerComunidadActiva(); },
    obtenerComunidadPorId(id) { return obtenerComunidadPorId(id); },
    obtenerIdComunidadActiva() { return leerComunidades().activa; },

    async crearComunidad({ nombre, token, repo, tipoToken }) {
        if (!token) throw new Error('Falta el token.');
        if (!repo)  throw new Error('Falta el nombre del repositorio.');

        const resultado = await conectarGitHub(token, repo, tipoToken || 'classic');

        const id = 'com_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        const data = leerComunidades();
        data.comunidades[id] = {
            id,
            nombre: nombre ? String(nombre).trim() : repo,
            githubToken: token,
            githubRepo: repo,
            githubOwner: resultado.owner,
            tipoToken: tipoToken || 'classic',
            conectado: true,
            creada: new Date().toISOString()
        };
        data.activa = id;
        guardarComunidades(data);
        await invalidarTodoCache();

        return { id, ...resultado };
    },

    async unirseAComunidad({ nombre, token, repo, owner, tipoToken }) {
        if (!token)         throw new Error('Falta el token.');
        if (!repo || !owner) throw new Error('Faltan datos del repositorio.');

        await ghObtenerUsuario(token);
        const tieneAcceso = await ghRepoExiste(token, owner, repo);
        if (!tieneAcceso) {
            throw new Error(`No tienes acceso al repositorio "${owner}/${repo}".`);
        }

        const id = 'com_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        const data = leerComunidades();
        data.comunidades[id] = {
            id,
            nombre: nombre ? String(nombre).trim() : repo,
            githubToken: token,
            githubRepo: repo,
            githubOwner: owner,
            tipoToken: tipoToken || 'classic',
            conectado: true,
            creada: new Date().toISOString()
        };
        data.activa = id;
        guardarComunidades(data);
        await invalidarTodoCache();

        return { id };
    },

    async actualizarComunidad(id, { nombre, token, repo, tipoToken }) {
        const data = leerComunidades();
        const com = data.comunidades[id];
        if (!com) throw new Error('Comunidad no encontrada.');

        const nuevoToken = token && token.trim() ? token.trim() : null;
        const nuevoRepo  = repo && repo.trim() ? repo.trim() : null;
        const nuevoTipo  = tipoToken || com.tipoToken;

        const cambiaConexion =
            (nuevoToken && nuevoToken !== com.githubToken) ||
            (nuevoRepo  && nuevoRepo  !== com.githubRepo)  ||
            (nuevoTipo  && nuevoTipo  !== com.tipoToken);

        if (cambiaConexion) {
            const resultado = await conectarGitHub(
                nuevoToken || com.githubToken,
                nuevoRepo || com.githubRepo,
                nuevoTipo
            );
            if (nuevoToken) com.githubToken = nuevoToken;
            if (nuevoRepo)  com.githubRepo = nuevoRepo;
            com.githubOwner = resultado.owner;
            com.tipoToken = nuevoTipo;
            com.conectado = true;
        }

        if (nombre !== undefined) {
            com.nombre = nombre ? String(nombre).trim() : com.githubRepo;
        }

        guardarComunidades(data);
        if (data.activa === id) await invalidarTodoCache();
        return com;
    },

    async activarComunidad(id) {
        const data = leerComunidades();
        if (!data.comunidades[id]) throw new Error('Comunidad no encontrada.');
        if (data.activa === id) return;
        data.activa = id;
        guardarComunidades(data);
        await invalidarTodoCache();
    },

    async eliminarComunidad(id) {
        const data = leerComunidades();
        if (!data.comunidades[id]) return;
        const eraActiva = data.activa === id;
        delete data.comunidades[id];
        if (eraActiva) {
            const restantes = Object.keys(data.comunidades);
            data.activa = restantes[0] || null;
        }
        guardarComunidades(data);
        if (eraActiva) await invalidarTodoCache();
    },

    async leerArchivo(nombre) {
        const cache = await leerCache(nombre);
        if (cache !== null) return cache;

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

        await guardarCache(nombre, datos);
        return { ok: true };
    },

    async actualizarArchivo(nombre, mutador, opciones = {}) {
        if (!this.estaConectado()) throw new Error('GitHub no está conectado.');
        if (typeof mutador !== 'function') {
            throw new Error('actualizarArchivo requiere una función mutadora.');
        }
        const maxIntentos = opciones.intentos || 5;
        const config = cargarConfigBD();

        for (let i = 0; i < maxIntentos; i++) {
            const archivo = await ghLeerArchivo(
                config.githubToken, config.githubOwner, config.githubRepo, nombre
            );
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
                    config.githubToken, config.githubOwner, config.githubRepo,
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
    async invalidarTodo() { return await invalidarTodoCache(); },

    async conectar(token, repo) {
        const activa = obtenerComunidadActiva();
        if (activa) {
            return await this.actualizarComunidad(activa.id, { token, repo });
        }
        return await this.crearComunidad({ token, repo, tipoToken: 'classic' });
    },

    async desconectar() {
        const data = leerComunidades();
        if (!data.activa) return;
        const com = data.comunidades[data.activa];
        if (!com) return;
        com.conectado = false;
        com.githubToken = '';
        guardarComunidades(data);
        await invalidarTodoCache();
    }
};

window.ConfigBD = ConfigBD;

window.leerComunidades = leerComunidades;
window.guardarComunidades = guardarComunidades;
window.obtenerComunidadActiva = obtenerComunidadActiva;
window.obtenerComunidadPorId = obtenerComunidadPorId;
window.tipoTokenEfectivo = tipoTokenEfectivo;

// ============================================================
//  UI: SECCIÓN "COMUNIDADES"
// ============================================================
function escaparHTML(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

let _editandoId = null;

function _etiquetaTipo(tipo) {
    if (tipo === 'fine-grained') return 'Fine-grained';
    if (tipo === 'assisted') return 'Asistido';
    return 'Clásico';
}

function renderComunidadesUI() {
    const cont = document.getElementById('bdListaComunidades');
    if (!cont) return;

    const lista = ConfigBD.listarComunidades();
    const idActiva = ConfigBD.obtenerIdComunidadActiva();

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="config-empty" style="padding: 30px 12px;">
                <div class="config-empty-icon"><i data-lucide="network"></i></div>
                <h4>Sin comunidades</h4>
                <p>Crea tu primera comunidad para empezar a usar VicWebOs.</p>
            </div>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    cont.innerHTML = '';
    lista.forEach(com => {
        const activa = com.id === idActiva;
        const card = document.createElement('div');
        card.className = 'bd-comunidad-card' + (activa ? ' activa' : '');
        card.innerHTML = `
            <div class="bd-comunidad-icono">
                <i data-lucide="${activa ? 'check-circle-2' : 'circle'}"></i>
            </div>
            <div class="bd-comunidad-info">
                <h4>${escaparHTML(com.nombre || com.githubRepo)}</h4>
                <p>@${escaparHTML(com.githubOwner)}/${escaparHTML(com.githubRepo)} · ${_etiquetaTipo(com.tipoToken)}</p>
            </div>
            <div class="bd-comunidad-acciones">
                ${!activa ? `<button class="bd-accion" data-accion="activar" data-id="${com.id}" title="Activar esta comunidad"><i data-lucide="power"></i></button>` : ''}
                <button class="bd-accion" data-accion="compartir" data-id="${com.id}" title="Compartir invitación"><i data-lucide="share-2"></i></button>
                <button class="bd-accion" data-accion="editar" data-id="${com.id}" title="Editar"><i data-lucide="pencil"></i></button>
                <button class="bd-accion bd-accion-peligro" data-accion="eliminar" data-id="${com.id}" title="Eliminar"><i data-lucide="trash-2"></i></button>
            </div>
        `;
        cont.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();

    cont.querySelectorAll('.bd-accion').forEach(btn => {
        btn.addEventListener('click', async () => {
            const accion = btn.dataset.accion;
            const id = btn.dataset.id;

            if (accion === 'activar') {
                try {
                    if (typeof window.cambiarComunidad === 'function') {
                        await window.cambiarComunidad(id);
                    } else {
                        await ConfigBD.activarComunidad(id);
                    }
                    renderComunidadesUI();
                    if (window.lucide) lucide.createIcons();
                } catch (e) { alert('❌ ' + e.message); }
            }

            if (accion === 'compartir') {
                if (window.Invitaciones) window.Invitaciones.mostrarModal(id);
            }

            if (accion === 'editar') abrirFormularioComunidad(id);
            if (accion === 'eliminar') eliminarComunidadUI(id);
        });
    });
}

function abrirFormularioComunidad(id = null) {
    _editandoId = id;
    const form = document.getElementById('bdFormulario');
    const titulo = document.getElementById('bdFormularioTitulo');
    const inputNombre = document.getElementById('bdNombreComunidad');
    const inputToken  = document.getElementById('bdToken');
    const inputRepo   = document.getElementById('bdRepo');
    const radios      = document.querySelectorAll('input[name="bdTipoToken"]');
    const guardarTxt  = document.getElementById('bdGuardarTexto');
    const status      = document.getElementById('bdFormStatus');
    const wizardSlot  = document.getElementById('onboardingWizardSlot');

    if (status) { status.textContent = ''; status.className = 'config-status'; }

    if (wizardSlot) {
        wizardSlot.style.display = 'none';
        if (window.OnboardingWizard) OnboardingWizard.ocultar();
    }

    if (id) {
        const com = ConfigBD.obtenerComunidadPorId(id);
        if (!com) return;
        titulo.textContent = 'Editar comunidad';
        inputNombre.value = com.nombre || '';
        inputToken.value = com.githubToken || '';
        inputRepo.value = com.githubRepo || '';
        const tipoRadio = com.tipoToken === 'assisted' ? 'classic' : (com.tipoToken || 'classic');
        radios.forEach(r => { r.checked = r.value === tipoRadio; });
        guardarTxt.textContent = 'Guardar cambios';
        if (inputToken.parentElement) inputToken.parentElement.style.display = 'block';
    } else {
        titulo.textContent = 'Nueva comunidad';
        inputNombre.value = '';
        inputToken.value = '';
        inputRepo.value = '';
        radios.forEach(r => { r.checked = r.value === 'classic'; });
        guardarTxt.textContent = 'Conectar';
        if (inputToken.parentElement) inputToken.parentElement.style.display = 'block';
    }

    actualizarAyudaToken();
    form.style.display = 'block';
    if (window.lucide) lucide.createIcons();
}

function cerrarFormularioComunidad() {
    _editandoId = null;
    const form = document.getElementById('bdFormulario');
    if (form) form.style.display = 'none';
    if (window.OnboardingWizard) OnboardingWizard.ocultar();
}

// ---------- AYUDA DE TOKEN: CREAR ----------
function actualizarAyudaToken() {
    const tipo = document.querySelector('input[name="bdTipoToken"]:checked')?.value || 'classic';
    const ayudaToken = document.getElementById('bdTokenAyuda');
    const ayudaRepo  = document.getElementById('bdRepoAyuda');
    const inputToken = document.getElementById('bdToken');
    const wizardSlot = document.getElementById('onboardingWizardSlot');

    if (!ayudaToken || !ayudaRepo) return;

    if (tipo === 'assisted') {
        if (inputToken && inputToken.parentElement) {
            inputToken.parentElement.style.display = 'none';
        }
        if (ayudaToken) ayudaToken.style.display = 'none';
        if (wizardSlot) {
            wizardSlot.style.display = 'block';
            if (window.OnboardingWizard) {
                // Modo CREAR: paso final habla de crear repositorio
                OnboardingWizard.mostrar(wizardSlot, { modo: 'crear' });
            }
        }
        if (ayudaRepo) {
            ayudaRepo.textContent = 'Si no existe, se creará automáticamente como privado.';
        }
        return;
    }

    if (wizardSlot) {
        wizardSlot.style.display = 'none';
        if (window.OnboardingWizard) OnboardingWizard.ocultar();
    }
    if (inputToken && inputToken.parentElement) {
        inputToken.parentElement.style.display = 'block';
    }
    if (ayudaToken) ayudaToken.style.display = 'block';

    if (tipo === 'classic') {
        ayudaToken.innerHTML = 'Créalo en <code>github.com/settings/tokens</code> con scope <code>repo</code>.';
        ayudaRepo.textContent = 'Si no existe, se creará automáticamente como privado.';
    } else {
        ayudaToken.innerHTML = 'Créalo en <code>github.com/settings/personal-access-tokens</code> con permisos <code>Contents: Read & Write</code>.';
        ayudaRepo.textContent = 'El repositorio debe existir YA en tu cuenta. Con fine-grained no se crean repos.';
    }
}

// ---------- AYUDA DE TOKEN: UNIRSE ----------
function actualizarAyudaTokenUnirse() {
    const tipo = document.querySelector('input[name="bdJoinTipoToken"]:checked')?.value || 'classic';
    const inputToken = document.getElementById('bdJoinToken');
    const wizardSlot = document.getElementById('onboardingWizardSlotJoin');
    const ayuda      = document.getElementById('bdJoinTokenAyuda');

    if (tipo === 'assisted') {
        if (inputToken && inputToken.parentElement) {
            inputToken.parentElement.style.display = 'none';
        }
        if (ayuda) ayuda.style.display = 'none';
        if (wizardSlot) {
            wizardSlot.style.display = 'block';
            if (window.OnboardingWizard) {
                // Modo UNIRSE: paso final habla de unirse a la comunidad
                OnboardingWizard.mostrar(wizardSlot, { modo: 'unirse' });
            }
        }
        return;
    }

    if (wizardSlot) {
        wizardSlot.style.display = 'none';
        if (window.OnboardingWizard) OnboardingWizard.ocultar();
    }
    if (inputToken && inputToken.parentElement) {
        inputToken.parentElement.style.display = 'block';
    }
    if (ayuda) {
        ayuda.style.display = 'block';
        if (tipo === 'classic') {
            ayuda.innerHTML = 'Tu token debe tener scope <code>repo</code> y acceso al repositorio de la comunidad.';
        } else {
            ayuda.innerHTML = 'Tu token fine-grained debe tener permiso <code>Contents: Read & Write</code> sobre el repositorio de la comunidad.';
        }
    }
}

async function eliminarComunidadUI(id) {
    const com = ConfigBD.obtenerComunidadPorId(id);
    if (!com) return;
    const esActiva = ConfigBD.obtenerIdComunidadActiva() === id;
    const msg = esActiva
        ? `¿Eliminar la comunidad "${com.nombre}"? Es la activa. Tus datos siguen a salvo en GitHub; solo se quita de este dispositivo.`
        : `¿Eliminar la comunidad "${com.nombre}"? Tus datos siguen a salvo en GitHub; solo se quita de este dispositivo.`;
    if (!confirm(msg)) return;

    const eraActiva = esActiva;
    await ConfigBD.eliminarComunidad(id);

    if (eraActiva && typeof window.cambiarComunidad === 'function') {
        const nuevaId = ConfigBD.obtenerIdComunidadActiva();
        if (nuevaId) {
            await window.cambiarComunidad(nuevaId);
        } else {
            if (typeof cerrarSesion === 'function') cerrarSesion();
            if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
            if (typeof renderSidebar === 'function') renderSidebar();
        }
    }

    renderComunidadesUI();
    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
    const btnNueva   = document.getElementById('btnNuevaComunidad');
    const btnGuardar = document.getElementById('bdGuardarComunidad');
    const btnCancel  = document.getElementById('bdCancelarForm');
    const btnCerrar  = document.getElementById('bdFormularioCerrar');

    const radiosCrear = document.querySelectorAll('input[name="bdTipoToken"]');
    const radiosUnir  = document.querySelectorAll('input[name="bdJoinTipoToken"]');

    if (btnNueva) {
        btnNueva.addEventListener('click', () => abrirFormularioComunidad(null));
    }
    if (btnCancel) btnCancel.addEventListener('click', cerrarFormularioComunidad);
    if (btnCerrar) btnCerrar.addEventListener('click', cerrarFormularioComunidad);

    radiosCrear.forEach(r => r.addEventListener('change', actualizarAyudaToken));
    radiosUnir.forEach(r => r.addEventListener('change', actualizarAyudaTokenUnirse));

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombre = document.getElementById('bdNombreComunidad').value.trim();
            const repo   = document.getElementById('bdRepo').value.trim();
            const tipo   = document.querySelector('input[name="bdTipoToken"]:checked')?.value || 'classic';
            const status = document.getElementById('bdFormStatus');

            const setMsg = (txt, tipoClase) => {
                status.textContent = txt;
                status.className = 'config-status ' + (tipoClase || '');
            };

            let token = '';
            if (tipo === 'assisted') {
                if (window.OnboardingWizard && OnboardingWizard.estaListo()) {
                    token = OnboardingWizard.obtenerToken();
                }
                if (!token) {
                    setMsg('❌ Completa el asistente para obtener tu token.', 'error');
                    return;
                }
            } else {
                token = document.getElementById('bdToken').value.trim();
                if (!token) {
                    setMsg('❌ Introduce tu token personal.', 'error');
                    return;
                }
            }

            if (!repo)  { setMsg('❌ Introduce un nombre de repositorio.', 'error'); return; }
            if (!/^[a-zA-Z0-9._-]+$/.test(repo)) {
                setMsg('❌ El nombre solo puede tener letras, números, puntos, guiones y guiones bajos.', 'error');
                return;
            }

            if (btnGuardar.disabled) return;
            btnGuardar.disabled = true;
            const txtOriginal = btnGuardar.innerHTML;
            btnGuardar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Conectando...';
            if (window.lucide) lucide.createIcons();
            setMsg('⏳ Verificando token y repositorio...', 'info');

            try {
                if (_editandoId) {
                    const esActiva = ConfigBD.obtenerIdComunidadActiva() === _editandoId;
                    await ConfigBD.actualizarComunidad(_editandoId, { nombre, token, repo, tipoToken: tipo });
                    setMsg('✅ Comunidad actualizada.', 'success');
                    if (esActiva && typeof window.cambiarComunidad === 'function') {
                        await window.cambiarComunidad(_editandoId);
                    }
                } else {
                    const res = await ConfigBD.crearComunidad({ nombre, token, repo, tipoToken: tipo });
                    setMsg(`✅ Comunidad conectada como ${res.owner}.`, 'success');
                    if (typeof window.cambiarComunidad === 'function') {
                        await window.cambiarComunidad(res.id);
                    }
                }

                renderComunidadesUI();
                cerrarFormularioComunidad();
                if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
            } catch (err) {
                setMsg('❌ ' + err.message, 'error');
            } finally {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = txtOriginal;
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    renderComunidadesUI();
});

window.__actualizarUIBD = function () {
    renderComunidadesUI();
    if (window.lucide) lucide.createIcons();
};
