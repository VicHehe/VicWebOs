// ============================================================
//  VicsCode — Editor de código para GitHub
//  ------------------------------------------------------------
//  · Se conecta a GitHub con un token clásico (guardado en
//    IndexedDB local, aislado de la comunidad).
//  · Lee y escribe archivos vía GitHub Contents API.
//  · Monaco editor con multi-pestaña.
//  · Commit con mensaje (uno por archivo modificado).
//  · Solo texto. Imágenes y otros binarios → fuera de scope.
//  ------------------------------------------------------------
//  Datos guardados localmente:
//    IndexedDB 'VicsCodeAuth' > store 'tokens'
//    key = usuarioActual.codigo, value = { token, user }
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicsCodeAuth';
const IDB_VERSION = 1;
const IDB_STORE = 'tokens';
const MAX_FILE_SIZE = 900 * 1024; // 900 KB, límite práctico para Contents API

// Extensiones de texto soportadas
const EXT_TEXTO = new Set([
    'js','mjs','cjs','jsx','ts','tsx','html','htm','css','scss','sass',
    'json','md','markdown','txt','xml','svg','yml','yaml','py','sh','bash',
    'sql','php','rb','go','rs','java','cs','c','cpp','h','hpp','lua',
    'toml','ini','env','gitignore','lock','vue','svelte'
]);

const LANG_MAP = {
    js:'javascript', mjs:'javascript', cjs:'javascript', jsx:'javascript',
    ts:'typescript', tsx:'typescript',
    html:'html', htm:'html', vue:'html', svelte:'html',
    css:'css', scss:'scss', sass:'scss',
    json:'json', md:'markdown', markdown:'markdown',
    xml:'xml', svg:'xml', yml:'yaml', yaml:'yaml',
    py:'python', sh:'shell', bash:'shell', sql:'sql',
    php:'php', rb:'ruby', go:'go', rs:'rust',
    java:'java', cs:'csharp', c:'c', cpp:'cpp', h:'c', hpp:'cpp',
    lua:'lua', toml:'ini', ini:'ini'
};

// ---------- ESTADO ----------
let usuarioActual = null;
let token = null;
let ghUser = null;
let repos = [];
let repoActual = null;  // { owner, name, branch }
let ramaActual = null;
let rutaActual = [];
let itemsRuta = [];
let exploradorToken = 0;

let monaco = null;
let editor = null;
let pestanas = [];
let pestanaActiva = null;
let modelos = {};       // modeloId -> Monaco model

let toastTimer = null;
let buscadorRepoTexto = '';
let inicioCargaMonaco = Date.now();

const API = () => window.parent.__vicwebos || null;

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
        actualizarTemaMonaco();
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

function esTemaOscuro() {
    try {
        const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
        const hex = bg.replace('#', '');
        if (hex.length !== 6 && hex.length !== 3) return false;
        const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
        const r = parseInt(full.slice(0, 2), 16);
        const g = parseInt(full.slice(2, 4), 16);
        const b = parseInt(full.slice(4, 6), 16);
        return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
    } catch (_) { return false; }
}

function actualizarTemaMonaco() {
    if (!monaco) return;
    monaco.editor.setTheme(esTemaOscuro() ? 'vics-dark' : 'vics-light');
}

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('vcToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'vc-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function getExtension(nombre) {
    const i = nombre.lastIndexOf('.');
    return i > 0 ? nombre.slice(i + 1).toLowerCase() : '';
}

function basename(path) {
    return path.split('/').pop();
}

function dirname(path) {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
}

function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generarId() {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function esExtensionTexto(nombre) {
    const ext = getExtension(nombre);
    if (!ext) return false;
    return EXT_TEXTO.has(ext);
}

function lenguajeDeArchivo(nombre) {
    return LANG_MAP[getExtension(nombre)] || 'plaintext';
}

function iconoDeArchivo(nombre, esDir) {
    if (esDir) return 'folder';
    const ext = getExtension(nombre);
    const map = {
        js:'file-code-2', mjs:'file-code-2', cjs:'file-code-2',
        jsx:'file-code-2', ts:'file-code-2', tsx:'file-code-2',
        html:'file-code', htm:'file-code',
        css:'palette', scss:'palette', sass:'palette',
        json:'settings-2', md:'file-text', markdown:'file-text',
        txt:'file-text', xml:'file-code', svg:'image',
        yml:'settings-2', yaml:'settings-2', py:'file-code-2',
        sh:'terminal', bash:'terminal', sql:'database',
        php:'file-code-2', rb:'file-code-2', go:'file-code-2',
        rs:'file-code-2', java:'file-code-2', cs:'file-code-2',
        c:'file-code-2', cpp:'file-code-2', h:'file-code-2',
        png:'image', jpg:'image', jpeg:'image', gif:'image',
        webp:'image', bmp:'image', ico:'image',
        mp4:'video', webm:'video', mov:'video',
        mp3:'music', wav:'music', ogg:'music', flac:'music',
        pdf:'file-text', zip:'package'
    };
    return map[ext] || 'file';
}

// ============================================================
//  INDEXEDDB — Token
// ============================================================
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

async function idbGet(key) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
    });
}

async function idbSet(key, value) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

async function idbDelete(key) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

function claveToken() {
    return 'token_' + (usuarioActual?.codigo || 'anon');
}

async function cargarTokenGuardado() {
    try {
        const guardado = await idbGet(claveToken());
        if (guardado && guardado.token) {
            token = guardado.token;
            ghUser = guardado.user || null;
            return true;
        }
    } catch (e) { console.warn('[VicsCode] Error cargando token:', e); }
    return false;
}

async function guardarTokenLocal() {
    try {
        await idbSet(claveToken(), { token, user: ghUser });
    } catch (e) { console.warn('[VicsCode] Error guardando token:', e); }
}

async function olvidarTokenLocal() {
    try { await idbDelete(claveToken()); } catch (_) {}
}

// ============================================================
//  GITHUB API
// ============================================================
function ghHeaders(extra = {}) {
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...extra
    };
}

async function ghFetch(url, opciones = {}) {
    const res = await fetch(url, {
        ...opciones,
        headers: { ...ghHeaders(), ...(opciones.headers || {}) }
    });

    if (res.status === 401) {
        const err = new Error('Token inválido o sin permisos.');
        err.codigo = 401;
        throw err;
    }
    if (res.status === 403) {
        const err = new Error('Permisos insuficientes o límite alcanzado.');
        err.codigo = 403;
        throw err;
    }
    if (res.status === 404) {
        const err = new Error('No encontrado.');
        err.codigo = 404;
        throw err;
    }
    if (res.status === 409 || res.status === 422) {
        const err = new Error('El archivo cambió en GitHub. Recargá e intentá de nuevo.');
        err.codigo = res.status;
        throw err;
    }
    if (!res.ok) {
        const err = new Error(`Error de GitHub (${res.status}).`);
        err.codigo = res.status;
        throw err;
    }
    return res;
}

async function ghValidarToken() {
    const res = await ghFetch('https://api.github.com/user');
    return await res.json();
}

async function ghListarRepos() {
    const res = await ghFetch('https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
}

async function ghInfoRepo(owner, repo) {
    const res = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`);
    return await res.json();
}

async function ghListarRamas(owner, repo) {
    const res = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`);
    return await res.json();
}

async function ghListarContenido(owner, repo, path, branch) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`;
    const res = await ghFetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [data];
}

async function ghLeerArchivo(owner, repo, path, branch) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${branch}`;
    const res = await ghFetch(url);
    const data = await res.json();
    return {
        sha: data.sha,
        size: data.size,
        content: data.content,
        encoding: data.encoding
    };
}

function base64ToUtf8(b64) {
    const limpio = b64.replace(/\s/g, '');
    const bin = atob(limpio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
}

function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
}

async function ghEscribirArchivo(owner, repo, path, contenido, sha, branch, mensaje) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    const body = {
        message: mensaje,
        content: utf8ToBase64(contenido),
        branch
    };
    if (sha) body.sha = sha;
    const res = await ghFetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return await res.json();
}

async function ghEliminarArchivo(owner, repo, path, sha, branch, mensaje) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
    const res = await ghFetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: mensaje, sha, branch })
    });
    return await res.json();
}

// ============================================================
//  VISTAS
// ============================================================
function mostrarVista(id) {
    document.getElementById('viewWelcome').hidden = id !== 'welcome';
    document.getElementById('viewRepos').hidden = id !== 'repos';
    document.getElementById('viewEditor').hidden = id !== 'editor';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  WELCOME — Conectar token
// ============================================================
function setWelcomeMsg(txt, tipo = 'info') {
    const el = document.getElementById('welcomeMsg');
    el.textContent = txt || '';
    el.className = 'vc-status ' + (txt ? tipo : '');
}

async function conectar() {
    const input = document.getElementById('inputToken');
    const btn = document.getElementById('btnConectar');
    const valor = input.value.trim();

    if (!valor) {
        setWelcomeMsg('Pegá tu token de GitHub.', 'error');
        return;
    }
    if (!valor.startsWith('ghp_') && !valor.startsWith('github_pat_')) {
        setWelcomeMsg('El token debe empezar con ghp_ o github_pat_.', 'error');
        return;
    }

    if (btn.disabled) return;
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Validando...';
    if (window.lucide) window.lucide.createIcons();
    setWelcomeMsg('⏳ Verificando token con GitHub...', 'info');

    try {
        token = valor;
        ghUser = await ghValidarToken();
        await guardarTokenLocal();
        setWelcomeMsg('✅ Conectado como @' + ghUser.login, 'success');
        setTimeout(() => entrarRepos(), 400);
    } catch (e) {
        token = null;
        ghUser = null;
        setWelcomeMsg('❌ ' + (e.message || 'No se pudo conectar.'), 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  REPOS
// ============================================================
async function entrarRepos() {
    mostrarVista('repos');
    document.getElementById('headerUser').textContent = '@' + ghUser.login;

    const cont = document.getElementById('reposLista');
    cont.innerHTML = `
        <div class="vc-vacio-lista">
            <i data-lucide="loader-2" class="spin"></i>
            <span>Cargando repositorios...</span>
        </div>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        repos = await ghListarRepos();
        repos = repos.filter(r => r.permissions?.push);
        renderRepos();
    } catch (e) {
        cont.innerHTML = `
            <div class="vc-vacio-lista">
                <i data-lucide="alert-triangle"></i>
                <span>${escaparHTML(e.message || 'Error cargando repos.')}</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

function renderRepos() {
    const cont = document.getElementById('reposLista');
    const q = buscadorRepoTexto.toLowerCase().trim();

    const lista = repos.filter(r => {
        if (!q) return true;
        const nombre = r.name.toLowerCase();
        const owner = r.owner.login.toLowerCase();
        const desc = (r.description || '').toLowerCase();
        return nombre.includes(q) || owner.includes(q) || desc.includes(q);
    });

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="vc-vacio-lista">
                <i data-lucide="search-x"></i>
                <span>${q ? 'Sin resultados para "' + escaparHTML(q) + '"' : 'No tenés repos con permiso de escritura.'}</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = lista.map(r => `
        <div class="vc-repo-card" data-owner="${escaparHTML(r.owner.login)}" data-repo="${escaparHTML(r.name)}">
            <div class="vc-repo-card-top">
                <div class="vc-repo-card-icon"><i data-lucide="git-branch"></i></div>
                <div class="vc-repo-card-info">
                    <div class="vc-repo-card-nombre">${escaparHTML(r.name)}</div>
                    <div class="vc-repo-card-owner">@${escaparHTML(r.owner.login)}</div>
                </div>
                ${r.private ? '<span class="vc-repo-tag">Privado</span>' : ''}
            </div>
            ${r.description ? `<div class="vc-repo-card-desc">${escaparHTML(r.description)}</div>` : ''}
            <div class="vc-repo-card-meta">
                <span><i data-lucide="git-branch"></i>${escaparHTML(r.default_branch || 'main')}</span>
                ${r.language ? `<span><i data-lucide="code-2"></i>${escaparHTML(r.language)}</span>` : ''}
            </div>
        </div>
    `).join('');

    cont.querySelectorAll('.vc-repo-card').forEach(el => {
        el.addEventListener('click', () => {
            abrirRepo(el.dataset.owner, el.dataset.repo);
        });
    });
    if (window.lucide) window.lucide.createIcons();
}

document.getElementById('inputBuscarRepo')?.addEventListener('input', (e) => {
    buscadorRepoTexto = e.target.value;
    renderRepos();
});

// ============================================================
//  ABRIR REPO
// ============================================================
async function abrirRepo(owner, name) {
    try {
        const info = await ghInfoRepo(owner, name);
        repoActual = {
            owner: info.owner.login,
            name: info.name,
            defaultBranch: info.default_branch || 'main'
        };
        ramaActual = repoActual.defaultBranch;

        // Cerrar todo lo que hubiera
        limpiarPestanas();

        // Preparar editor
        mostrarVista('editor');
        document.getElementById('headerRepoNombre').textContent = `${repoActual.owner}/${repoActual.name}`;
        document.getElementById('statusRama').textContent = ramaActual;

        // Cargar ramas
        await cargarRamas();

        // Resetear explorador
        rutaActual = [];
        await cargarDirectorio();

        // Enfocar editor
        setTimeout(() => editor && editor.focus(), 50);
    } catch (e) {
        toast('No se pudo abrir el repo: ' + e.message, 'error');
    }
}

async function cargarRamas() {
    const sel = document.getElementById('selectRama');
    sel.innerHTML = '';
    try {
        const ramas = await ghListarRamas(repoActual.owner, repoActual.name);
        ramas.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r.name;
            opt.textContent = r.name;
            if (r.name === ramaActual) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (e) {
        const opt = document.createElement('option');
        opt.value = ramaActual;
        opt.textContent = ramaActual;
        sel.appendChild(opt);
    }
}

document.getElementById('selectRama')?.addEventListener('change', async (e) => {
    const nueva = e.target.value;
    if (nueva === ramaActual) return;
    if (hayCambiosPendientes()) {
        if (!confirm('Tenés cambios sin guardar. ¿Cambiar de rama igual?\nSe perderán los cambios locales.')) {
            e.target.value = ramaActual;
            return;
        }
    }
    ramaActual = nueva;
    document.getElementById('statusRama').textContent = ramaActual;
    limpiarPestanas();
    rutaActual = [];
    await cargarDirectorio();
    toast('Rama: ' + ramaActual, 'info');
});

// ============================================================
//  EXPLORADOR
// ============================================================
async function cargarDirectorio() {
    const miToken = ++exploradorToken;
    const cont = document.getElementById('explorador');
    const rutaEl = document.getElementById('rutaActual');
    const path = rutaActual.join('/');

    rutaEl.textContent = '/' + path;
    document.getElementById('statusRuta').textContent = '/' + path;

    cont.innerHTML = `
        <div class="vc-vacio-lista">
            <i data-lucide="loader-2" class="spin"></i>
            <span>Cargando...</span>
        </div>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        let items;
        if (path === '') {
            items = await ghListarContenido(repoActual.owner, repoActual.name, '', ramaActual);
        } else {
            items = await ghListarContenido(repoActual.owner, repoActual.name, path, ramaActual);
        }

        if (miToken !== exploradorToken) return;

        itemsRuta = items.sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
        });

        renderExplorador();
    } catch (e) {
        if (miToken !== exploradorToken) return;
        cont.innerHTML = `
            <div class="vc-vacio-lista">
                <i data-lucide="alert-triangle"></i>
                <span>${escaparHTML(e.message || 'Error cargando directorio.')}</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

function renderExplorador() {
    const cont = document.getElementById('explorador');
    cont.innerHTML = '';

    if (itemsRuta.length === 0) {
        cont.innerHTML = `
            <div class="vc-vacio-lista">
                <i data-lucide="folder-open"></i>
                <span>Carpeta vacía</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    itemsRuta.forEach(item => {
        const esDir = item.type === 'dir';
        const el = document.createElement('div');
        el.className = 'vc-item ' + (esDir ? 'carpeta' : 'archivo');
        el.dataset.path = item.path;
        el.dataset.name = item.name;

        if (!esDir && pestanaActiva?.path === item.path) {
            el.classList.add('activo');
        }
        if (!esDir && estaAbiertoDirty(item.path)) {
            el.classList.add('dirty');
        }

        const icono = iconoDeArchivo(item.name, esDir);
        el.innerHTML = `
            <span class="vc-item-icono"><i data-lucide="${icono}"></i></span>
            <span class="vc-item-nombre">${escaparHTML(item.name)}</span>
        `;

        if (esDir) {
            el.addEventListener('click', () => {
                rutaActual = item.path.split('/').filter(Boolean);
                cargarDirectorio();
            });
        } else {
            el.addEventListener('click', () => abrirArchivo(item));
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                mostrarMenuArchivo(e.clientX, e.clientY, item);
            });
        }

        cont.appendChild(el);
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MONACO
// ============================================================
async function initMonaco() {
    try {
        monaco = await window.__monacoReady;
    } catch (e) {
        throw new Error('No se pudo cargar Monaco desde el CDN.');
    }

    definirTemas();

    editor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: '',
        language: 'plaintext',
        theme: esTemaOscuro() ? 'vics-dark' : 'vics-light',
        automaticLayout: true,
        minimap: { enabled: true, maxColumn: 80 },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        lineNumbers: 'on',
        lineNumbersMinChars: 3,
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 12, bottom: 12 },
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        stickyScroll: { enabled: true },
        contextmenu: true,
        mouseWheelZoom: true,
        fontLigatures: true,
        readOnly: true,
    });

    editor.onDidChangeCursorPosition((e) => {
        document.getElementById('statusCursor').textContent =
            `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    editor.onDidChangeModelContent(() => {
        if (pestanaActiva && !pestanaActiva.esMultimedia) {
            pestanaActiva.contenidoActual = editor.getValue();
            actualizarEstadoTab(pestanaActiva);
        }
    });

    // Ctrl+S → abrir commit modal con todos los cambios
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        abrirModalCommit();
    });
}

function definirTemas() {
    monaco.editor.defineTheme('vics-light', {
        base: 'vs', inherit: true,
        rules: [
            { token: 'comment',  foreground: '9A8BA3', fontStyle: 'italic' },
            { token: 'keyword',  foreground: '7C3AED', fontStyle: 'bold' },
            { token: 'string',   foreground: '059669' },
            { token: 'number',   foreground: 'D97706' },
            { token: 'tag',      foreground: '7C3AED' },
            { token: 'attribute.name', foreground: 'D97706' },
            { token: 'attribute.value', foreground: '059669' },
            { token: 'type',     foreground: '8B5CF6' },
            { token: 'variable', foreground: '27272A' },
            { token: 'function', foreground: '2563EB' },
            { token: 'delimiter', foreground: '71717A' },
            { token: 'key',      foreground: '7C3AED' },
        ],
        colors: {
            'editor.background': '#FFFFFF',
            'editor.foreground': '#18181B',
            'editorCursor.foreground': '#8B5CF6',
            'editor.lineHighlightBackground': '#F5F3FF',
            'editorLineNumber.foreground': '#C4B5FD',
            'editorLineNumber.activeForeground': '#7C3AED',
            'editor.selectionBackground': '#EDE9FE',
            'editorIndentGuide.background1': '#F0F0F3',
            'editorIndentGuide.activeBackground1': '#C4B5FD',
            'editorGutter.background': '#FFFFFF',
            'editorWidget.background': '#FFFFFF',
            'editorWidget.border': '#DDD6FE',
            'editorSuggestWidget.background': '#FFFFFF',
            'editorSuggestWidget.selectedBackground': '#F5F3FF',
            'editorHoverWidget.background': '#FFFFFF',
            'editorHoverWidget.border': '#DDD6FE',
            'minimap.background': '#FAFAFB',
            'scrollbarSlider.background': '#E8E8EEAA',
            'scrollbarSlider.hoverBackground': '#D4D4DDAA',
            'scrollbarSlider.activeBackground': '#C4B5FDAA',
        }
    });

    monaco.editor.defineTheme('vics-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
            { token: 'comment',  foreground: '8A7A93', fontStyle: 'italic' },
            { token: 'keyword',  foreground: 'C4B5FD', fontStyle: 'bold' },
            { token: 'string',   foreground: '6EE7B7' },
            { token: 'number',   foreground: 'FCD34D' },
            { token: 'tag',      foreground: 'C4B5FD' },
            { token: 'attribute.name', foreground: 'FCD34D' },
            { token: 'attribute.value', foreground: '6EE7B7' },
            { token: 'type',     foreground: 'A78BFA' },
            { token: 'variable', foreground: 'E4E4E7' },
            { token: 'function', foreground: '93C5FD' },
            { token: 'delimiter', foreground: 'A1A1AA' },
            { token: 'key',      foreground: 'C4B5FD' },
        ],
        colors: {
            'editor.background': '#18181B',
            'editor.foreground': '#E4E4E7',
            'editorCursor.foreground': '#C4B5FD',
            'editor.lineHighlightBackground': '#27272A',
            'editorLineNumber.foreground': '#52525B',
            'editorLineNumber.activeForeground': '#C4B5FD',
            'editor.selectionBackground': '#3F3F46',
            'editorIndentGuide.background1': '#2A2A2E',
            'editorIndentGuide.activeBackground1': '#7C3AED',
            'editorGutter.background': '#18181B',
            'editorWidget.background': '#27272A',
            'editorWidget.border': '#3F3F46',
            'editorSuggestWidget.background': '#27272A',
            'editorSuggestWidget.selectedBackground': '#3F3F46',
            'editorHoverWidget.background': '#27272A',
            'editorHoverWidget.border': '#3F3F46',
            'minimap.background': '#1F1F23',
            'scrollbarSlider.background': '#3F3F46AA',
            'scrollbarSlider.hoverBackground': '#52525BAA',
            'scrollbarSlider.activeBackground': '#7C3AEDAA',
        }
    });
}

// ============================================================
//  PESTAÑAS
// ============================================================
async function abrirArchivo(item) {
    const existente = pestanas.find(p => p.path === item.path);
    if (existente) {
        activarPestana(existente);
        return;
    }

    if (!esExtensionTexto(item.name)) {
        toast('Solo archivos de texto/código son editables.', 'info');
        return;
    }

    if (item.size && item.size > MAX_FILE_SIZE) {
        toast(`Archivo demasiado grande (${(item.size/1024).toFixed(0)} KB). Máximo 900 KB.`, 'error');
        return;
    }

    try {
        const data = await ghLeerArchivo(repoActual.owner, repoActual.name, item.path, ramaActual);
        const contenido = base64ToUtf8(data.content);
        const language = lenguajeDeArchivo(item.name);

        const modeloId = 'gh:' + item.path;
        // Si el modelo ya existía (por ejemplo, después de un rename), disponerlo
        if (modelos[modeloId]) {
            modelos[modeloId].dispose();
            delete modelos[modeloId];
        }
        const model = monaco.editor.createModel(contenido, language, monaco.Uri.parse(modeloId));
        modelos[modeloId] = model;

        const p = {
            id: generarId(),
            path: item.path,
            nombre: basename(item.path),
            sha: data.sha,
            modeloId,
            contenidoOriginal: contenido,
            contenidoActual: contenido,
            esMultimedia: false
        };
        pestanas.push(p);
        activarPestana(p);
        renderExplorador();
    } catch (e) {
        toast('No se pudo abrir: ' + e.message, 'error');
    }
}

function activarPestana(p) {
    pestanaActiva = p;
    if (p.esMultimedia) return;

    const model = modelos[p.modeloId];
    if (model) {
        editor.setModel(model);
        editor.updateOptions({ readOnly: false });
    }
    document.getElementById('monacoContainer').hidden = false;
    document.getElementById('emptyEditor').hidden = true;

    document.getElementById('statusLenguaje').textContent = lenguajeDeArchivo(p.nombre);
    renderTabs();
    renderExplorador();
    actualizarBotonCommit();
}

function cerrarPestana(p) {
    const idx = pestanas.indexOf(p);
    if (idx === -1) return;

    if (estaDirty(p)) {
        if (!confirm(`"${p.nombre}" tiene cambios sin guardar. ¿Cerrar sin guardar?`)) return;
    }

    if (modelos[p.modeloId]) {
        modelos[p.modeloId].dispose();
        delete modelos[p.modeloId];
    }
    pestanas.splice(idx, 1);

    if (pestanaActiva === p) {
        const siguiente = pestanas[Math.min(idx, pestanas.length - 1)] || null;
        if (siguiente) activarPestana(siguiente);
        else mostrarEditorVacio();
    } else {
        renderTabs();
    }
    actualizarBotonCommit();
}

function mostrarEditorVacio() {
    pestanaActiva = null;
    editor.setModel(monaco.editor.createModel('', 'plaintext'));
    editor.updateOptions({ readOnly: true });
    document.getElementById('monacoContainer').hidden = true;
    document.getElementById('emptyEditor').hidden = false;
    document.getElementById('statusLenguaje').textContent = '—';
    renderTabs();
    renderExplorador();
    actualizarBotonCommit();
}

function limpiarPestanas() {
    pestanas.forEach(p => {
        if (modelos[p.modeloId]) {
            modelos[p.modeloId].dispose();
            delete modelos[p.modeloId];
        }
    });
    pestanas = [];
    pestanaActiva = null;
    if (editor) {
        editor.setModel(monaco.editor.createModel('', 'plaintext'));
        editor.updateOptions({ readOnly: true });
    }
    document.getElementById('monacoContainer').hidden = true;
    document.getElementById('emptyEditor').hidden = false;
    document.getElementById('statusLenguaje').textContent = '—';
    renderTabs();
    actualizarBotonCommit();
}

function estaDirty(p) {
    if (p.esMultimedia) return false;
    return p.contenidoActual !== p.contenidoOriginal;
}

function estaAbiertoDirty(path) {
    const p = pestanas.find(x => x.path === path);
    return p ? estaDirty(p) : false;
}

function hayCambiosPendientes() {
    return pestanas.some(estaDirty);
}

// ============================================================
//  RENDER: TABS
// ============================================================
function renderTabs() {
    const bar = document.getElementById('tabsBar');
    const cont = document.getElementById('tabsScroll');
    if (!bar || !cont) return;

    if (pestanas.length === 0) {
        bar.hidden = true;
        return;
    }
    bar.hidden = false;

    cont.innerHTML = pestanas.map(p => {
        const activo = p === pestanaActiva;
        const dirty = estaDirty(p);
        const icono = iconoDeArchivo(p.nombre, false);
        return `
            <button class="vc-tab ${activo ? 'activo' : ''} ${dirty ? 'vc-tab-dirty' : ''}" data-id="${p.id}">
                <i data-lucide="${icono}" style="width:12px;height:12px;"></i>
                <span class="vc-tab-nombre">${escaparHTML(p.nombre)}</span>
                <span class="vc-tab-cerrar" data-cerrar="${p.id}"><i data-lucide="x"></i></span>
            </button>
        `;
    }).join('');

    cont.querySelectorAll('.vc-tab').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.vc-tab-cerrar')) return;
            const p = pestanas.find(x => x.id === el.dataset.id);
            if (p) activarPestana(p);
        });
    });
    cont.querySelectorAll('.vc-tab-cerrar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const p = pestanas.find(x => x.id === btn.dataset.cerrar);
            if (p) cerrarPestana(p);
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function actualizarEstadoTab(p) {
    const el = document.querySelector(`.vc-tab[data-id="${p.id}"]`);
    if (el) el.classList.toggle('vc-tab-dirty', estaDirty(p));
    actualizarBotonCommit();
}

// ============================================================
//  COMMIT
// ============================================================
function actualizarBotonCommit() {
    const dirty = pestanas.filter(estaDirty);
    const btn = document.getElementById('btnCommit');
    const txt = document.getElementById('btnCommitTxt');
    const badge = document.getElementById('commitBadge');

    if (dirty.length === 0) {
        btn.disabled = true;
        txt.textContent = 'Commit';
        badge.hidden = true;
    } else {
        btn.disabled = false;
        txt.textContent = 'Guardar';
        badge.hidden = false;
        badge.textContent = dirty.length;
    }
}

function abrirModalCommit() {
    const dirty = pestanas.filter(estaDirty);
    if (dirty.length === 0) {
        toast('No hay cambios pendientes.', 'info');
        return;
    }

    const lista = document.getElementById('listaCommit');
    lista.innerHTML = dirty.map(p => `
        <div class="vc-commit-file">
            <i data-lucide="file-code-2"></i>
            <span>${escaparHTML(p.path)}</span>
        </div>
    `).join('');

    const msgInput = document.getElementById('inputCommitMsg');
    if (dirty.length === 1) {
        msgInput.value = `Update ${dirty[0].nombre}`;
    } else {
        msgInput.value = `Update ${dirty.length} files`;
    }

    document.getElementById('commitConfirmarTxt').textContent =
        dirty.length === 1 ? 'Guardar' : `Guardar ${dirty.length} archivos`;

    document.getElementById('modalCommit').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => msgInput.select(), 80);
}

async function confirmarCommit() {
    const btn = document.getElementById('commitConfirmar');
    const msg = document.getElementById('inputCommitMsg').value.trim();
    if (!msg) {
        toast('Escribí un mensaje de commit.', 'error');
        return;
    }

    const dirty = pestanas.filter(estaDirty);
    if (dirty.length === 0) {
        document.getElementById('modalCommit').hidden = true;
        return;
    }

    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Guardando...';
    if (window.lucide) window.lucide.createIcons();

    let exitos = 0;
    let fallos = 0;

    for (const p of dirty) {
        try {
            await ghEscribirArchivo(
                repoActual.owner,
                repoActual.name,
                p.path,
                p.contenidoActual,
                p.sha,
                ramaActual,
                msg
            );
            // Después de guardar, necesitamos el sha nuevo. Leémoslo.
            const data = await ghLeerArchivo(repoActual.owner, repoActual.name, p.path, ramaActual);
            p.sha = data.sha;
            p.contenidoOriginal = p.contenidoActual;
            exitos++;
        } catch (e) {
            console.warn('[VicsCode] Commit falló para', p.path, e);
            fallos++;
        }
    }

    btn.disabled = false;
    btn.innerHTML = original;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('modalCommit').hidden = true;
    renderTabs();
    renderExplorador();
    actualizarBotonCommit();

    if (fallos === 0) {
        toast(exitos === 1 ? 'Guardado en GitHub' : `${exitos} archivos guardados`, 'success');
    } else if (exitos > 0) {
        toast(`${exitos} guardados, ${fallos} fallaron`, 'error');
    } else {
        toast('No se pudo guardar ninguno', 'error');
    }
}

// ============================================================
//  NUEVO ARCHIVO
// ============================================================
function abrirModalNuevoArchivo() {
    document.getElementById('inputNuevoNombre').value = '';
    document.getElementById('nuevoRuta').textContent = '/' + rutaActual.join('/');
    document.getElementById('modalNuevoArchivo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('inputNuevoNombre').focus(), 80);
}

async function confirmarNuevoArchivo() {
    const nombre = document.getElementById('inputNuevoNombre').value.trim();
    if (!nombre) { toast('Escribí un nombre.', 'error'); return; }
    if (nombre.includes('/')) { toast('Sin barras. Solo el nombre.', 'error'); return; }
    if (!esExtensionTexto(nombre)) { toast('Extensión no soportada.', 'error'); return; }

    const path = [...rutaActual, nombre].join('/');

    // Plantilla según extensión
    const ext = getExtension(nombre);
    let contenido = '';
    if (ext === 'html') contenido = `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="UTF-8">\n  <title>${nombre.replace(/\.html?$/,'')}</title>\n</head>\n<body>\n  <h1>Hola</h1>\n</body>\n</html>\n`;
    else if (ext === 'css') contenido = `/* ${nombre} */\n\n`;
    else if (ext === 'js' || ext === 'mjs') contenido = `// ${nombre}\n\n`;
    else if (ext === 'json') contenido = `{\n  "ejemplo": "valor"\n}\n`;
    else if (ext === 'md') contenido = `# ${nombre.replace(/\.md$/,'')}\n\n`;
    else contenido = '';

    const btn = document.getElementById('nuevoConfirmar');
    btn.disabled = true;
    try {
        await ghEscribirArchivo(
            repoActual.owner,
            repoActual.name,
            path,
            contenido,
            null,
            ramaActual,
            `Create ${nombre}`
        );
        document.getElementById('modalNuevoArchivo').hidden = true;
        toast('Archivo creado', 'success');
        await cargarDirectorio();
    } catch (e) {
        toast('No se pudo crear: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  MENÚ CONTEXTUAL (renombrar/eliminar)
// ============================================================
let menuCtx = null;

function mostrarMenuArchivo(x, y, item) {
    cerrarMenu();
    const menu = document.createElement('div');
    menu.className = 'vc-modal';
    menu.style.cssText = `
        position: fixed; inset: auto;
        left: ${Math.min(x, window.innerWidth - 180)}px;
        top: ${Math.min(y, window.innerHeight - 100)}px;
        background: var(--white, #FFFFFF);
        border-radius: 10px;
        box-shadow: 0 12px 32px rgba(0,0,0,0.15), 0 0 0 1px var(--border, #E8E8EE);
        padding: 4px;
        z-index: 4000;
        display: flex;
        flex-direction: column;
        min-width: 160px;
        backdrop-filter: none;
        animation: none;
    `;
    menu.innerHTML = `
        <button class="vc-ctx-item" data-accion="renombrar" style="
            display: flex; align-items: center; gap: 8px;
            padding: 9px 12px; background: none; border: none;
            border-radius: 7px; font-family: inherit; font-size: 12.5px;
            font-weight: 700; color: var(--gray-700, #3F3F46);
            cursor: pointer; text-align: left;
        ">
            <i data-lucide="pencil" style="width:14px;height:14px;"></i>
            Renombrar
        </button>
        <button class="vc-ctx-item" data-accion="eliminar" style="
            display: flex; align-items: center; gap: 8px;
            padding: 9px 12px; background: none; border: none;
            border-radius: 7px; font-family: inherit; font-size: 12.5px;
            font-weight: 700; color: #991B1B;
            cursor: pointer; text-align: left;
        ">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            Eliminar
        </button>
    `;

    document.body.appendChild(menu);
    if (window.lucide) window.lucide.createIcons();
    menuCtx = menu;

    menu.querySelectorAll('.vc-ctx-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const accion = btn.dataset.accion;
            cerrarMenu();
            if (accion === 'renombrar') await renombrarArchivo(item);
            if (accion === 'eliminar') abrirModalEliminar(item);
        });
    });

    setTimeout(() => {
        document.addEventListener('click', cerrarMenu, { once: true });
    }, 10);
}

function cerrarMenu() {
    if (menuCtx) { menuCtx.remove(); menuCtx = null; }
}

async function renombrarArchivo(item) {
    const nuevo = prompt('Nuevo nombre:', item.name);
    if (!nuevo || nuevo === item.name) return;
    if (nuevo.includes('/')) { toast('Sin barras.', 'error'); return; }
    if (!esExtensionTexto(nuevo)) { toast('Extensión no soportada.', 'error'); return; }

    const dir = dirname(item.path);
    const nuevoPath = dir ? `${dir}/${nuevo}` : nuevo;

    try {
        // Leer contenido del archivo actual
        const data = await ghLeerArchivo(repoActual.owner, repoActual.name, item.path, ramaActual);
        const contenido = base64ToUtf8(data.content);

        // Crear el nuevo
        await ghEscribirArchivo(
            repoActual.owner, repoActual.name, nuevoPath,
            contenido, null, ramaActual, `Rename ${item.name} → ${nuevo}`
        );
        // Eliminar el viejo
        await ghEliminarArchivo(
            repoActual.owner, repoActual.name, item.path,
            data.sha, ramaActual, `Rename ${item.name} → ${nuevo}`
        );

        // Cerrar pestaña vieja si estaba abierta
        const p = pestanas.find(x => x.path === item.path);
        if (p) {
            if (modelos[p.modeloId]) {
                modelos[p.modeloId].dispose();
                delete modelos[p.modeloId];
            }
            pestanas = pestanas.filter(x => x.id !== p.id);
            if (pestanaActiva === p) mostrarEditorVacio();
        }

        toast('Renombrado', 'success');
        await cargarDirectorio();
    } catch (e) {
        toast('No se pudo renombrar: ' + e.message, 'error');
    }
}

function abrirModalEliminar(item) {
    document.getElementById('eliminarTexto').textContent =
        `¿Eliminar "${item.path}" del repositorio? Esta acción no se puede deshacer.`;
    document.getElementById('modalEliminar').dataset.path = item.path;
    document.getElementById('modalEliminar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarEliminar() {
    const path = document.getElementById('modalEliminar').dataset.path;
    if (!path) return;

    const btn = document.getElementById('elim
