// ============================================================
//  Silly-QL — Workbench SQL
//  ------------------------------------------------------------
//  · Editor Monaco con syntax highlighting SQL
//  · Generadores: INSERT (desde CSV/TSV), Procedure, Tabla
//  · Export ZIP (JSZip)
//  · Proyectos persistidos en IndexedDB por usuario
//
//  IDB: 'SillyQLDB_{codigo}' > store 'proyectos' (keyPath: id)
//  Proyecto: { id, nombre, dialecto, sql, creado, actualizado }
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';

let usuarioActual = null;
let proyectos = [];
let proyectoActual = null;
let monaco = null;
let editor = null;
let modelo = null;
let hayCambios = false;
let toastTimer = null;
let buscadorProyectos = '';
let proyectoAEliminarId = null;
let guardarDebounce = null;
let objetosCache = [];

const API = () => window.parent.__vicwebos || null;

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
    } catch (_) {}
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
    monaco.editor.setTheme(esTemaOscuro() ? 'sq-dark' : 'sq-light');
}

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('sqToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'sq-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generarId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function slugify(s) {
    return String(s || 'proyecto').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'proyecto';
}

function formatearFecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const ahora = new Date();
    const diffMin = Math.floor((ahora - d) / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `hace ${diffD}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function nombreDialecto(d) {
    return { mysql: 'MySQL', postgres: 'PostgreSQL', sqlserver: 'SQL Server', sqlite: 'SQLite' }[d] || d;
}

// ============================================================
//  INDEXEDDB
// ============================================================
function nombreDB() {
    return 'SillyQLDB_' + (usuarioActual?.codigo || 'anon');
}

function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(nombreDB(), IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbListar() {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
    });
}

async function idbObtener(id) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(id);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
    });
}

async function idbGuardar(proyecto) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(proyecto);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

async function idbEliminar(id) {
    const db = await abrirIDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
    });
}

// ============================================================
//  VISTAS
// ============================================================
function mostrarVista(id) {
    document.getElementById('viewProjects').hidden = id !== 'projects';
    document.getElementById('viewEditor').hidden = id !== 'editor';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MONACO
// ============================================================
async function initMonaco() {
    try {
        monaco = await window.__monacoReady;
    } catch (e) {
        toast('No se pudo cargar el editor. Revisá tu conexión.', 'error');
        return;
    }

    definirTemas();
    editor = monaco.editor.create(document.getElementById('monacoContainer'), {
        value: '',
        language: 'sql',
        theme: esTemaOscuro() ? 'sq-dark' : 'sq-light',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        lineNumbers: 'on',
        renderLineHighlight: 'all',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 14, bottom: 14 },
        tabSize: 2,
        insertSpaces: true,
        wordWrap: 'on',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        contextmenu: true,
        mouseWheelZoom: true,
        fontLigatures: true,
        readOnly: false,
    });

    editor.onDidChangeCursorPosition((e) => {
        document.getElementById('statusCursor').textContent =
            `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
    });

    editor.onDidChangeModelContent(() => {
        if (!proyectoActual) return;
        marcarSucio(true);
        actualizarStats();
        clearTimeout(guardarDebounce);
        guardarDebounce = setTimeout(() => {
            if (hayCambios) guardarProyectoActual(true);
        }, 900);
        // Re-escanear objetos con debounce más largo
        clearTimeout(window.__scanTimer);
        window.__scanTimer = setTimeout(escanearObjetos, 400);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        guardarProyectoActual(false);
    });

    document.getElementById('monacoLoader').hidden = true;
}

function definirTemas() {
    monaco.editor.defineTheme('sq-light', {
        base: 'vs', inherit: true,
        rules: [
            { token: 'comment',  foreground: '9A8BA3', fontStyle: 'italic' },
            { token: 'keyword',  foreground: '7C3AED', fontStyle: 'bold' },
            { token: 'operator.sql', foreground: '7C3AED' },
            { token: 'string',   foreground: '059669' },
            { token: 'number',   foreground: 'D97706' },
            { token: 'predefined', foreground: '2563EB' },
            { token: 'identifier', foreground: '27272A' },
            { token: 'delimiter', foreground: '71717A' },
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
        }
    });

    monaco.editor.defineTheme('sq-dark', {
        base: 'vs-dark', inherit: true,
        rules: [
            { token: 'comment',  foreground: '8A7A93', fontStyle: 'italic' },
            { token: 'keyword',  foreground: 'C4B5FD', fontStyle: 'bold' },
            { token: 'operator.sql', foreground: 'C4B5FD' },
            { token: 'string',   foreground: '6EE7B7' },
            { token: 'number',   foreground: 'FCD34D' },
            { token: 'predefined', foreground: '93C5FD' },
            { token: 'identifier', foreground: 'E4E4E7' },
            { token: 'delimiter', foreground: 'A1A1AA' },
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
        }
    });
}

// ============================================================
//  LISTA DE PROYECTOS
// ============================================================
async function cargarProyectos() {
    try {
        proyectos = await idbListar();
    } catch (e) {
        proyectos = [];
    }
}

function renderProyectos() {
    const cont = document.getElementById('proyectosLista');
    const q = buscadorProyectos.toLowerCase().trim();
    const lista = proyectos
        .filter(p => !q || p.nombre.toLowerCase().includes(q) || (p.sql || '').toLowerCase().includes(q))
        .sort((a, b) => new Date(b.actualizado || b.creado || 0) - new Date(a.actualizado || a.creado || 0));

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="sq-empty">
                <div class="sq-empty-icono"><i data-lucide="database"></i></div>
                <h3>${q ? 'Sin resultados' : 'Aún no tenés proyectos'}</h3>
                <p>${q ? 'Nada coincide con tu búsqueda.' : 'Creá uno nuevo y empezá a escribir SQL. Los generadores te ayudan con INSERT, procedures y tablas.'}</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = lista.map(p => {
        const lineas = (p.sql || '').split('\n').length;
        const kb = ((new Blob([p.sql || '']).size) / 1024).toFixed(1);
        return `
            <div class="sq-proyecto-card" data-id="${p.id}">
                <div class="sq-proyecto-card-top">
                    <div class="sq-proyecto-card-icon"><i data-lucide="database"></i></div>
                    <div class="sq-proyecto-card-info">
                        <div class="sq-proyecto-card-nombre">${escaparHTML(p.nombre || 'Sin nombre')}</div>
                        <div class="sq-proyecto-card-dialecto">${escaparHTML(nombreDialecto(p.dialecto || 'mysql'))}</div>
                    </div>
                    <button class="sq-icon-btn sq-icon-btn-danger" data-del="${p.id}" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="sq-proyecto-card-meta">
                    <span><i data-lucide="clock"></i> ${formatearFecha(p.actualizado || p.creado)}</span>
                    <span><i data-lucide="align-left"></i> ${lineas} líneas</span>
                    <span><i data-lucide="hard-drive"></i> ${kb} KB</span>
                </div>
            </div>`;
    }).join('');

    cont.querySelectorAll('.sq-proyecto-card').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('[data-del]')) return;
            abrirProyecto(el.dataset.id);
        });
    });
    cont.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirModalEliminar(btn.dataset.del);
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  ABRIR / GUARDAR / CERRAR PROYECTO
// ============================================================
async function abrirProyecto(id) {
    const p = await idbObtener(id);
    if (!p) { toast('Proyecto no encontrado', 'error'); return; }

    proyectoActual = p;
    hayCambios = false;

    document.getElementById('inputNombreProyecto').value = p.nombre || '';
    document.getElementById('selectDialecto').value = p.dialecto || 'mysql';
    document.getElementById('subProyecto').textContent =
        `${nombreDialecto(p.dialecto || 'mysql')} · ${formatearFecha(p.actualizado || p.creado)}`;
    document.getElementById('statusDialecto').textContent = nombreDialecto(p.dialecto || 'mysql');

    if (monaco) {
        if (modelo) modelo.dispose();
        modelo = monaco.editor.createModel(p.sql || '', 'sql');
        editor.setModel(modelo);
    }

    marcarSucio(false);
    actualizarStats();
    escanearObjetos();
    mostrarVista('editor');
    setTimeout(() => editor && editor.focus(), 100);
}

async function guardarProyectoActual(silencioso = false) {
    if (!proyectoActual) return;

    proyectoActual.nombre = document.getElementById('inputNombreProyecto').value.trim() || 'Sin nombre';
    proyectoActual.dialecto = document.getElementById('selectDialecto').value;
    proyectoActual.sql = editor ? editor.getValue() : '';
    proyectoActual.actualizado = new Date().toISOString();

    try {
        await idbGuardar(proyectoActual);
        marcarSucio(false);
        document.getElementById('subProyecto').textContent =
            `${nombreDialecto(proyectoActual.dialecto)} · ahora`;
        if (!silencioso) toast('Guardado', 'success');
        await cargarProyectos();
    } catch (e) {
        toast('No se pudo guardar', 'error');
    }
}

function marcarSucio(v) {
    hayCambios = v;
    const btn = document.getElementById('btnGuardar');
    const badge = document.getElementById('dirtyBadge');
    btn.disabled = !v;
    badge.hidden = !v;
}

function actualizarStats() {
    if (!editor) return;
    const txt = editor.getValue();
    const lineas = txt ? txt.split('\n').length : 0;
    const kb = (new Blob([txt]).size / 1024).toFixed(1);
    document.getElementById('statusStats').textContent = `${lineas} líneas · ${kb} KB`;
}

// ============================================================
//  ESCANEO DE OBJETOS SQL
// ============================================================
const RE_OBJETOS = [
    { tipo: 'Tabla',     icono: 'table',           re: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'Procedure', icono: 'braces',          re: /CREATE\s+(?:OR\s+(?:REPLACE|ALTER)\s+)?PROCEDURE\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'Función',   icono: 'function-square', re: /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'Vista',     icono: 'eye',             re: /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'Índice',    icono: 'list-tree',       re: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'Trigger',   icono: 'zap',             re: /CREATE\s+TRIGGER\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi },
    { tipo: 'INSERT',    icono: 'arrow-down-to-line', re: /INSERT\s+INTO\s+[`"[]?([A-Za-z_][\w.]*)[`"\]]?/gi }
];

function escanearObjetos() {
    const cont = document.getElementById('objetosLista');
    if (!cont || !editor) return;

    const sql = editor.getValue();
    const objetos = [];

    RE_OBJETOS.forEach(({ tipo, icono, re }) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(sql)) !== null) {
            objetos.push({ tipo, icono, nombre: m[1] });
            if (objetos.length > 500) break;
        }
    });

    objetosCache = objetos;

    if (objetos.length === 0) {
        cont.innerHTML = `
            <div class="sq-vacio-mini">
                <i data-lucide="sparkles"></i>
                <span>Escribí SQL para ver objetos</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Agrupar por tipo
    const grupos = {};
    objetos.forEach(o => {
        (grupos[o.tipo] = grupos[o.tipo] || []).push(o);
    });

    cont.innerHTML = Object.entries(grupos).map(([tipo, arr]) => `
        <div class="sq-grupo-obj">
            <div class="sq-grupo-titulo">${tipo}s (${arr.length})</div>
            ${arr.map(o => `
                <div class="sq-obj-item" data-nombre="${escaparHTML(o.nombre)}">
                    <i data-lucide="${o.icono}"></i>
                    <span>${escaparHTML(o.nombre)}</span>
                </div>`).join('')}
        </div>
    `).join('');

    cont.querySelectorAll('.sq-obj-item').forEach(el => {
        el.addEventListener('click', () => {
            const nombre = el.dataset.nombre;
            const lineas = editor.getValue().split('\n');
            for (let i = 0; i < lineas.length; i++) {
                if (lineas[i].includes(nombre)) {
                    editor.revealLineInCenter(i + 1);
                    editor.setPosition({ lineNumber: i + 1, column: 1 });
                    editor.focus();
                    break;
                }
            }
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  GENERADOR: INSERT
// ============================================================
function detectarSeparador(linea) {
    if (linea.includes('\t')) return '\t';
    if (linea.includes('|')) return '|';
    return ',';
}

function parsearLineaCSV(linea, sep) {
    const out = [];
    let actual = '';
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (enComillas) {
            if (c === '"') {
                if (linea[i + 1] === '"') { actual += '"'; i++; }
                else enComillas = false;
            } else actual += c;
        } else {
            if (c === '"') enComillas = true;
            else if (c === sep) { out.push(actual.trim()); actual = ''; }
            else actual += c;
        }
    }
    out.push(actual.trim());
    return out;
}

function parsearDatos(texto, tieneHeader) {
    const lineas = texto.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() !== '');
    if (lineas.length === 0) return { headers: [], filas: [] };
    const sep = detectarSeparador(lineas[0]);
    const filasRaw = lineas.map(l => parsearLineaCSV(l, sep));
    if (tieneHeader) {
        return { headers: filasRaw[0], filas: filasRaw.slice(1) };
    }
    return { headers: [], filas: filasRaw };
}

function sqlIdent(nombre, dialecto) {
    const n = String(nombre).trim();
    if (!n) return '""';
    if (/^[A-Za-z_][\w]*$/.test(n)) return n; // simple, sin comillas
    if (dialecto === 'mysql') return '`' + n.replace(/`/g, '``') + '`';
    if (dialecto === 'sqlserver') return '[' + n.replace(/\]/g, ']]') + ']';
    return '"' + n.replace(/"/g, '""') + '"';
}

function sqlValor(valor, dialecto, tratarVacioNull) {
    if (valor === null || valor === undefined) return 'NULL';
    let v = String(valor).trim();
    if (v === '') return tratarVacioNull ? 'NULL' : "''";
    const upper = v.toUpperCase();
    if (upper === 'NULL') return 'NULL';
    if (upper === 'TRUE' || upper === 'FALSE') return upper;
    if (/^-?\d+(\.\d+)?$/.test(v)) return v;
    v = v.replace(/'/g, "''");
    return `'${v}'`;
}

function generarInsert() {
    const tabla = document.getElementById('genInsertTabla').value.trim();
    const dialecto = document.getElementById('genInsertDialecto').value;
    const datosTexto = document.getElementById('genInsertDatos').value;
    const tieneHeader = document.getElementById('genInsertHeader').checked;
    const multiFila = document.getElementById('genInsertMulti').checked;
    const ignorarNull = document.getElementById('genInsertIgnoreNull').checked;
    const columnasTexto = document.getElementById('genInsertColumnas').value.trim();

    if (!tabla) return '-- Completá el nombre de la tabla';
    if (!datosTexto.trim()) return '-- Pegá datos para generar los INSERT';

    const { headers, filas } = parsearDatos(datosTexto, tieneHeader);
    if (filas.length === 0) return '-- No se detectaron filas de datos';

    let columnas = [];
    if (columnasTexto) {
        columnas = columnasTexto.split(',').map(c => c.trim()).filter(Boolean);
    } else if (headers.length > 0) {
        columnas = headers;
    }

    const tablaId = sqlIdent(tabla, dialecto);
    const colStr = columnas.length > 0
        ? ` (${columnas.map(c => sqlIdent(c, dialecto)).join(', ')})`
        : '';

    const prefijo = `INSERT INTO ${tablaId}${colStr} VALUES`;

    if (multiFila) {
        const rows = filas.map(fila => {
            const vals = fila.map(v => sqlValor(v, dialecto, ignorarNull));
            return `  (${vals.join(', ')})`;
        });
        return `${prefijo}\n${rows.join(',\n')};`;
    }

    return filas.map(fila => {
        const vals = fila.map(v => sqlValor(v, dialecto, ignorarNull));
        return `${prefijo} (${vals.join(', ')});`;
    }).join('\n');
}

function actualizarPreviewInsert() {
    const preview = document.getElementById('genInsertPreview');
    if (!preview) return;
    preview.textContent = generarInsert();
}

// ============================================================
//  GENERADOR: PROCEDURE
// ============================================================
function crearFilaParam(valor = {}) {
    const row = document.createElement('div');
    row.className = 'sq-param-row';
    row.innerHTML = `
        <select class="sq-param-modo">
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
            <option value="INOUT">INOUT</option>
        </select>
        <input type="text" class="sq-param-nombre" placeholder="nombre" spellcheck="false">
        <input type="text" class="sq-param-tipo" placeholder="VARCHAR(255)" spellcheck="false">
        <button type="button" class="sq-btn-quitar" title="Quitar"><i data-lucide="x"></i></button>
    `;
    row.querySelector('.sq-param-modo').value = valor.modo || 'IN';
    row.querySelector('.sq-param-nombre').value = valor.nombre || '';
    row.querySelector('.sq-param-tipo').value = valor.tipo || '';

    row.querySelector('.sq-btn-quitar').addEventListener('click', () => {
        row.remove();
        actualizarPreviewProc();
    });
    row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', actualizarPreviewProc);
        el.addEventListener('change', actualizarPreviewProc);
    });
    return row;
}

function obtenerParams() {
    const rows = document.querySelectorAll('#genProcParams .sq-param-row');
    return Array.from(rows).map(r => ({
        modo: r.querySelector('.sq-param-modo').value,
        nombre: r.querySelector('.sq-param-nombre').value.trim(),
        tipo: r.querySelector('.sq-param-tipo').value.trim()
    })).filter(p => p.nombre);
}

function generarProcedure() {
    const nombre = document.getElementById('genProcNombre').value.trim();
    const dialecto = document.getElementById('genProcDialecto').value;
    const cuerpo = document.getElementById('genProcCuerpo').value.trim() || '-- Escribí el cuerpo del procedure';
    const params = obtenerParams();

    if (!nombre) return '-- Completá el nombre del procedure';

    const cuerpoIndentado = cuerpo.split('\n').map(l => '  ' + l).join('\n');

    if (dialecto === 'mysql') {
        const paramsStr = params.map(p => {
            const modo = p.modo === 'INOUT' ? 'INOUT' : p.modo;
            return `  ${modo} ${p.nombre} ${p.tipo}`;
        }).join(',\n');
        return `DELIMITER $$

DROP PROCEDURE IF EXISTS \`${nombre}\`$$

CREATE PROCEDURE \`${nombre}\`(${paramsStr ? '\n' + paramsStr + '\n' : ''})
BEGIN
${cuerpoIndentado}
END$$

DELIMITER ;`;
    }

    if (dialecto === 'postgres') {
        const paramsStr = params.map(p => {
            const modo = p.modo === 'IN' ? '' : (p.modo + ' ');
            return `${modo}${p.nombre} ${p.tipo}`;
        }).join(',\n  ');
        return `CREATE OR REPLACE PROCEDURE ${nombre}(
  ${paramsStr}
)
LANGUAGE plpgsql
AS $$
BEGIN
${cuerpoIndentado}
END;
$$;`;
    }

    if (dialecto === 'sqlserver') {
        const paramsStr = params.map(p => {
            const nombreClean = p.nombre.replace(/^@/, '');
            const out = (p.modo === 'OUT' || p.modo === 'INOUT') ? ' OUTPUT' : '';
            return `  @${nombreClean} ${p.tipo}${out}`;
        }).join(',\n');
        return `CREATE OR ALTER PROCEDURE [dbo].[${nombre}]
${paramsStr ? paramsStr + '\n' : ''}AS
BEGIN
  SET NOCOUNT ON;
${cuerpoIndentado}
END;
GO`;
    }

    return '-- Dialecto no soportado';
}

function actualizarPreviewProc() {
    const preview = document.getElementById('genProcPreview');
    if (!preview) return;
    preview.textContent = generarProcedure();
}

// ============================================================
//  GENERADOR: TABLA
// ============================================================
const TIPOS_SQL = [
    'INT','BIGINT','SMALLINT','TINYINT',
    'VARCHAR(255)','VARCHAR(100)','TEXT','CHAR(1)',
    'BOOLEAN','DATE','DATETIME','TIMESTAMP',
    'DECIMAL(10,2)','FLOAT','DOUBLE',
    'BLOB','JSON','UUID'
];

function crearFilaColumna(valor = {}) {
    const row = document.createElement('div');
    row.className = 'sq-col-row';
    row.innerHTML = `
        <input type="text" class="sq-col-nombre" placeholder="nombre" spellcheck="false">
        <select class="sq-col-tipo">
            ${TIPOS_SQL.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <label class="sq-col-check"><input type="checkbox" class="sq-col-pk"> PK</label>
        <label class="sq-col-check"><input type="checkbox" class="sq-col-notnull"> NOT NULL</label>
        <label class="sq-col-check"><input type="checkbox" class="sq-col-auto"> AUTO</label>
        <button type="button" class="sq-btn-quitar" title="Quitar"><i data-lucide="x"></i></button>
    `;
    row.querySelector('.sq-col-nombre').value = valor.nombre || '';
    row.querySelector('.sq-col-tipo').value = valor.tipo || 'INT';
    row.querySelector('.sq-col-pk').checked = !!valor.pk;
    row.querySelector('.sq-col-notnull').checked = !!valor.notnull;
    row.querySelector('.sq-col-auto').checked = !!valor.auto;

    row.querySelector('.sq-btn-quitar').addEventListener('click', () => {
        row.remove();
        actualizarPreviewTable();
    });
    row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', actualizarPreviewTable);
        el.addEventListener('change', actualizarPreviewTable);
    });
    return row;
}

function obtenerColumnasTabla() {
    const rows = document.querySelectorAll('#genTableColumnas .sq-col-row');
    return Array.from(rows).map(r => ({
        nombre: r.querySelector('.sq-col-nombre').value.trim(),
        tipo: r.querySelector('.sq-col-tipo').value,
        pk: r.querySelector('.sq-col-pk').checked,
        notnull: r.querySelector('.sq-col-notnull').checked,
        auto: r.querySelector('.sq-col-auto').checked
    })).filter(c => c.nombre);
}

function generarTabla() {
    const nombre = document.getElementById('genTableNombre').value.trim();
    const dialecto = document.getElementById('genTableDialecto').value;
    const ifNotExists = document.getElementById('genTableIfNotExists').checked;
    const drop = document.getElementById('genTableDrop').checked;
    const columnas = obtenerColumnasTabla();

    if (!nombre) return '-- Completá el nombre de la tabla';
    if (columnas.length === 0) return '-- Añadí al menos una columna';

    const tablaId = sqlIdent(nombre, dialecto);
    const partes = [];

    if (drop) partes.push(`DROP TABLE IF EXISTS ${tablaId};`);

    const colDefs = columnas.map(c => {
        let def = `  ${sqlIdent(c.nombre, dialecto)} `;
        if (c.auto) {
            if (dialecto === 'mysql') def += `${c.tipo} AUTO_INCREMENT`;
            else if (dialecto === 'postgres') def += 'SERIAL';
            else if (dialecto === 'sqlite') def += 'INTEGER';
            else def += c.tipo;
        } else {
            def += c.tipo;
        }
        if (!c.notnull && !c.pk) {
            // nullable por defecto
        } else if (!c.notnull && c.pk) {
            def += ' NOT NULL';
        } else if (c.notnull) {
            def += ' NOT NULL';
        }
        if (c.pk) def += ' PRIMARY KEY';
        return def;
    });

    if (dialecto === 'sqlserver' && ifNotExists) {
        partes.push(`IF OBJECT_ID(N'${nombre}', N'U') IS NULL`);
        partes.push(`BEGIN`);
        partes.push(`  CREATE TABLE ${tablaId} (\n${colDefs.join(',\n')}\n  );`);
        partes.push(`END;`);
        return partes.join('\n');
    }

    const ine = ifNotExists ? 'IF NOT EXISTS ' : '';
    partes.push(`CREATE TABLE ${ine}${tablaId} (\n${colDefs.join(',\n')}\n);`);
    return partes.join('\n');
}

function actualizarPreviewTable() {
    const preview = document.getElementById('genTablePreview');
    if (!preview) return;
    preview.textContent = generarTabla();
}

// ============================================================
//  INSERTAR EN EDITOR
// ============================================================
function insertarEnEditor(texto, dialecto) {
    if (!editor || !modelo) {
        toast('El editor no está listo', 'error');
        return;
    }
    const sel = editor.getSelection();
    const id = { major: 1, minor: 1 };
    const range = new monaco.Range(sel.startLineNumber, sel.startColumn, sel.endLineNumber, sel.endColumn);
    const op = { range, text: texto, forceMoveMarkers: true };
    editor.executeEdits('sillyql-gen', [op]);
    editor.pushUndoStop();
    editor.focus();

    // Si el dialecto del generador es distinto al del proyecto, avisar
    const proyectoDial = document.getElementById('selectDialecto').value;
    if (dialecto && dialecto !== proyectoDial) {
        toast(`Insertado (dialecto ${nombreDialecto(dialecto)})`, 'info');
    } else {
        toast('Insertado en el editor', 'success');
    }
}

// ============================================================
//  COPIAR AL PORTAPAPELES
// ============================================================
async function copiarTexto(texto) {
    try {
        await navigator.clipboard.writeText(texto);
        toast('Copiado', 'success');
    } catch (_) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); toast('Copiado', 'success'); }
        catch (e) { toast('No se pudo copiar', 'error'); }
        document.body.removeChild(ta);
    }
}

// ============================================================
//  EXPORTAR ZIP
// ============================================================
async function exportarZIP() {
    if (!proyectoActual) return;
    if (hayCambios) await guardarProyectoActual(true);

    if (typeof JSZip === 'undefined') {
        toast('JSZip no se cargó', 'error');
        return;
    }

    const zip = new JSZip();
    const slug = slugify(proyectoActual.nombre);
    const carpeta = zip.folder(slug);

    // SQL completo
    carpeta.file(`${slug}.sql`, proyectoActual.sql || '');

    // README
    const lineas = (proyectoActual.sql || '').split('\n').length;
    const objetos = objetosCache.length;
    const readme =
`# ${proyectoActual.nombre}

Generado con **Silly-QL** — Workbench SQL.

- **Dialecto:** ${nombreDialecto(proyectoActual.dialecto)}
- **Líneas:** ${lineas}
- **Objetos SQL detectados:** ${objetos}
- **Creado:** ${new Date(proyectoActual.creado).toLocaleString('es-CL')}
- **Actualizado:** ${new Date(proyectoActual.actualizado).toLocaleString('es-CL')}

## Contenido

\`${slug}.sql\` — script completo del proyecto.
`;
    carpeta.file('README.md', readme);

    try {
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${slug}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 800);
        toast('ZIP exportado', 'success');
    } catch (e) {
        toast('No se pudo exportar', 'error');
    }
}

// ============================================================
//  MODALES
// ============================================================
function abrirModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }
}
function cerrarModal(id) {
    const m = document.getElementById(id);
    if (m) m.hidden = true;
}

function abrirModalEliminar(id) {
    const p = proyectos.find(x => x.id === id);
    proyectoAEliminarId = id;
    document.getElementById('eliminarTexto').textContent =
        `¿Eliminar "${p?.nombre || 'proyecto'}"? Esta acción no se puede deshacer.`;
    abrirModal('modalEliminar');
}

async function confirmarEliminar() {
    if (!proyectoAEliminarId) return;
    try {
        await idbEliminar(proyectoAEliminarId);
        toast('Proyecto eliminado', 'success');
        await cargarProyectos();
        renderProyectos();
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    } finally {
        proyectoAEliminarId = null;
        cerrarModal('modalEliminar');
    }
}

// ============================================================
//  BIND DE UI
// ============================================================
function bindUI() {
    // Lista
    document.getElementById('inputBuscarProyecto')?.addEventListener('input', (e) => {
        buscadorProyectos = e.target.value;
        renderProyectos();
    });

    // Nuevo proyecto
    document.getElementById('btnNuevoProyecto')?.addEventListener('click', () => {
        document.getElementById('inputNuevoProyectoNombre').value = '';
        document.getElementById('selectNuevoProyectoDialecto').value = 'mysql';
        abrirModal('modalNuevoProyecto');
        setTimeout(() => document.getElementById('inputNuevoProyectoNombre').focus(), 80);
    });
    document.getElementById('nuevoProyectoCerrar')?.addEventListener('click', () => cerrarModal('modalNuevoProyecto'));
    document.getElementById('nuevoProyectoCancelar')?.addEventListener('click', () => cerrarModal('modalNuevoProyecto'));
    document.getElementById('nuevoProyectoConfirmar')?.addEventListener('click', crearProyecto);
    document.getElementById('inputNuevoProyectoNombre')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') crearProyecto();
    });

    // Eliminar proyecto
    document.getElementById('eliminarCerrar')?.addEventListener('click', () => cerrarModal('modalEliminar'));
    document.getElementById('eliminarCancelar')?.addEventListener('click', () => cerrarModal('modalEliminar'));
    document.getElementById('eliminarConfirmar')?.addEventListener('click', confirmarEliminar);

    // Editor - header
    document.getElementById('btnIrProyectos')?.addEventListener('click', async () => {
        if (hayCambios) await guardarProyectoActual(true);
        proyectoActual = null;
        if (modelo) { modelo.dispose(); modelo = null; }
        if (editor) editor.setModel(monaco.editor.createModel('', 'sql'));
        await cargarProyectos();
        renderProyectos();
        mostrarVista('projects');
    });

    document.getElementById('btnGuardar')?.addEventListener('click', () => guardarProyectoActual(false));
    document.getElementById('btnExportar')?.addEventListener('click', exportarZIP);

    // Cambios en nombre / dialecto
    document.getElementById('inputNombreProyecto')?.addEventListener('input', () => marcarSucio(true));
    document.getElementById('selectDialecto')?.addEventListener('change', (e) => {
        document.getElementById('statusDialecto').textContent = nombreDialecto(e.target.value);
        marcarSucio(true);
    });

    // Sidebar
    document.getElementById('btnReescanear')?.addEventListener('click', () => {
        escanearObjetos();
        toast('Reescaneado', 'info');
    });

    // Generadores - abrir
    document.getElementById('btnGenInsert')?.addEventListener('click', () => {
        document.getElementById('genInsertDialecto').value = proyectoActual?.dialecto || 'mysql';
        abrirModal('modalGenInsert');
        actualizarPreviewInsert();
    });
    document.getElementById('btnGenProcedure')?.addEventListener('click', () => {
        document.getElementById('genProcDialecto').value = proyectoActual?.dialecto === 'sqlite' ? 'mysql' : (proyectoActual?.dialecto || 'mysql');
        if (document.querySelectorAll('#genProcParams .sq-param-row').length === 0) {
            document.getElementById('genProcParams').appendChild(crearFilaParam());
        }
        abrirModal('modalGenProcedure');
        actualizarPreviewProc();
    });
    document.getElementById('btnGenTable')?.addEventListener('click', () => {
        document.getElementById('genTableDialecto').value = proyectoActual?.dialecto || 'mysql';
        if (document.querySelectorAll('#genTableColumnas .sq-col-row').length === 0) {
            document.getElementById('genTableColumnas').appendChild(crearFilaColumna({ nombre: 'id', tipo: 'INT', pk: true, notnull: true, auto: true }));
        }
        abrirModal('modalGenTable');
        actualizarPreviewTable();
    });

    // Generador INSERT
    ['genInsertTabla','genInsertDialecto','genInsertDatos','genInsertHeader','genInsertMulti','genInsertIgnoreNull','genInsertColumnas']
        .forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', actualizarPreviewInsert);
            el.addEventListener('change', actualizarPreviewInsert);
        });
    document.getElementById('genInsertCerrar')?.addEventListener('click', () => cerrarModal('modalGenInsert'));
    document.getElementById('genInsertCancelar')?.addEventListener('click', () => cerrarModal('modalGenInsert'));
    document.getElementById('genInsertCopiar')?.addEventListener('click', () => copiarTexto(generarInsert()));
    document.getElementById('genInsertInsertar')?.addEventListener('click', () => {
        const txt = generarInsert();
        const d = document.getElementById('genInsertDialecto').value;
        insertarEnEditor(txt, d);
        cerrarModal('modalGenInsert');
    });

    // Generador Procedure
    document.getElementById('genProcAddParam')?.addEventListener('click', () => {
        document.getElementById('genProcParams').appendChild(crearFilaParam());
        if (window.lucide) window.lucide.createIcons();
        actualizarPreviewProc();
    });
    ['genProcNombre','genProcDialecto','genProcCuerpo'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', actualizarPreviewProc);
        el.addEventListener('change', actualizarPreviewProc);
    });
    document.getElementById('genProcCerrar')?.addEventListener('click', () => cerrarModal('modalGenProcedure'));
    document.getElementById('genProcCancelar')?.addEventListener('click', () => cerrarModal('modalGenProcedure'));
    document.getElementById('genProcCopiar')?.addEventListener('click', () => copiarTexto(generarProcedure()));
    document.getElementById('genProcInsertar')?.addEventListener('click', () => {
        const txt = generarProcedure();
        const d = document.getElementById('genProcDialecto').value;
        insertarEnEditor(txt, d);
        cerrarModal('modalGenProcedure');
    });

    // Generador Tabla
    document.getElementById('genTableAddCol')?.addEventListener('click', () => {
        document.getElementById('genTableColumnas').appendChild(crearFilaColumna());
        if (window.lucide) window.lucide.createIcons();
        actualizarPreviewTable();
    });
    ['genTableNombre','genTableDialecto','genTableIfNotExists','genTableDrop'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', actualizarPreviewTable);
        el.addEventListener('change', actualizarPreviewTable);
    });
    document.getElementById('genTableCerrar')?.addEventListener('click', () => cerrarModal('modalGenTable'));
    document.getElementById('genTableCancelar')?.addEventListener('click', () => cerrarModal('modalGenTable'));
    document.getElementById('genTableCopiar')?.addEventListener('click', () => copiarTexto(generarTabla()));
    document.getElementById('genTableInsertar')?.addEventListener('click', () => {
        const txt = generarTabla();
        const d = document.getElementById('genTableDialecto').value;
        insertarEnEditor(txt, d);
        cerrarModal('modalGenTable');
    });

    // Click fuera de modal → cerrar
    ['modalNuevoProyecto','modalEliminar','modalGenInsert','modalGenProcedure','modalGenTable'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target.id === id) cerrarModal(id);
        });
    });

    // Escape global
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        ['modalNuevoProyecto','modalEliminar','modalGenInsert','modalGenProcedure','modalGenTable'].forEach(id => {
            const m = document.getElementById(id);
            if (m && !m.hidden) cerrarModal(id);
        });
    });

    // Aviso al cerrar con cambios
    window.addEventListener('beforeunload', (e) => {
        if (hayCambios) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

async function crearProyecto() {
    const nombre = document.getElementById('inputNuevoProyectoNombre').value.trim();
    if (!nombre) { toast('Poné un nombre', 'error'); return; }
    const dialecto = document.getElementById('selectNuevoProyectoDialecto').value;

    const nuevo = {
        id: generarId(),
        nombre,
        dialecto,
        sql: `-- ${nombre}\n-- Dialecto: ${nombreDialecto(dialecto)}\n\n`,
        creado: new Date().toISOString(),
        actualizado: new Date().toISOString()
    };

    try {
        await idbGuardar(nuevo);
        cerrarModal('modalNuevoProyecto');
        toast('Proyecto creado', 'success');
        await cargarProyectos();
        await abrirProyecto(nuevo.id);
    } catch (e) {
        toast('No se pudo crear', 'error');
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || { codigo: 'anon', nombre: 'Anónimo' };

    bindUI();
    mostrarVista('projects');

    await cargarProyectos();
    renderProyectos();

    await initMonaco();
    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
