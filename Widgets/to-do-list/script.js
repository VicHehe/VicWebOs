// ============================================================
//  Widget: To-Do List
//  ------------------------------------------------------------
//  Lista de máximo 6 tareas.
//  Estados: Pendiente -> En Proceso -> Hecha.
//  Persistencia exclusiva local mediante IndexedDB.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'TodoListWidgetDB';
const IDB_VERSION = 1;
const IDB_STORE = 'todos';
const MAX_TAREAS = 6;

let usuarioActual = null;
let tareas = [];
let config = { autoDelete: 'nunca' }; // 'nunca', '0', '5000', '60000'
let inicializado = false;
let timeoutDeletes = new Map(); // Para cancelar la eliminación si se arrepiente

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
//  INDEXEDDB (Local Exclusivo)
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

function claveData() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'td_data_' + codigo;
}

async function cargarDatos() {
    const data = await idbGet(claveData());
    if (data && typeof data === 'object') {
        if (Array.isArray(data.tareas)) tareas = data.tareas;
        if (data.config) config = { ...config, ...data.config };
    }
}

async function guardarDatos() {
    await idbSet(claveData(), {
        tareas: tareas,
        config: config,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  LÓGICA DE TAREAS
// ============================================================
function generarId() {
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function agregarTarea(texto) {
    texto = texto.trim();
    if (!texto) return;
    if (tareas.length >= MAX_TAREAS) {
        alert(`Límite de ${MAX_TAREAS} tareas alcanzado.`);
        return;
    }
    
    tareas.push({
        id: generarId(),
        texto: texto,
        estado: 'pendiente' // pendiente, proceso, hecha
    });
    
    await guardarDatos();
    render();
}

async function eliminarTarea(id) {
    if (timeoutDeletes.has(id)) {
        clearTimeout(timeoutDeletes.get(id));
        timeoutDeletes.delete(id);
    }
    tareas = tareas.filter(t => t.id !== id);
    await guardarDatos();
    render();
}

async function cambiarEstado(id) {
    const tarea = tareas.find(t => t.id === id);
    if (!tarea) return;

    // Lógica de ciclo de estados
    if (tarea.estado === 'pendiente') {
        tarea.estado = 'proceso';
    } else if (tarea.estado === 'proceso') {
        tarea.estado = 'hecha';
    } else {
        tarea.estado = 'pendiente';
    }

    // Cancelar cualquier timeout previo de borrado si se arrepintió
    if (timeoutDeletes.has(id)) {
        clearTimeout(timeoutDeletes.get(id));
        timeoutDeletes.delete(id);
    }

    // Si pasó a hecha, aplicar lógica de autoDelete
    if (tarea.estado === 'hecha' && config.autoDelete !== 'nunca') {
        const ms = parseInt(config.autoDelete, 10);
        if (ms === 0) {
            eliminarTarea(id); // Guarda y renderea interno
            return;
        } else {
            const timer = setTimeout(() => {
                eliminarTarea(id);
            }, ms);
            timeoutDeletes.set(id, timer);
        }
    }

    await guardarDatos();
    render();
}

// ============================================================
//  RENDER
// ============================================================
function obtenerIconoEstado(estado) {
    if (estado === 'proceso') return 'circle-dashed';
    if (estado === 'hecha') return 'check-circle-2';
    return 'circle'; // pendiente
}

function render() {
    const zona = document.getElementById('tdZona');
    const input = document.getElementById('tdInput');
    const btnAdd = document.getElementById('tdBtnAdd');
    const contador = document.getElementById('tdContador');

    // Actualizar límite
    const limitAlcanzado = tareas.length >= MAX_TAREAS;
    input.disabled = limitAlcanzado;
    btnAdd.disabled = limitAlcanzado;
    contador.textContent = `${tareas.length}/${MAX_TAREAS}`;
    contador.className = `td-contador ${limitAlcanzado ? 'lleno' : ''}`;

    if (tareas.length === 0) {
        zona.innerHTML = `
            <div class="td-vacio">
                <i data-lucide="check-square"></i>
                <p>Todo listo por ahora.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    zona.innerHTML = tareas.map(t => `
        <div class="td-item ${t.estado}">
            <button class="td-item-estado" data-id="${t.id}" title="Cambiar estado">
                <i data-lucide="${obtenerIconoEstado(t.estado)}"></i>
            </button>
            <span class="td-item-texto">${escapar(t.texto)}</span>
            <button class="td-item-borrar" data-id="${t.id}" title="Eliminar">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    // Eventos lista
    zona.querySelectorAll('.td-item-estado').forEach(btn => {
        btn.addEventListener('click', () => cambiarEstado(btn.dataset.id));
    });
    zona.querySelectorAll('.td-item-borrar').forEach(btn => {
        btn.addEventListener('click', () => eliminarTarea(btn.dataset.id));
    });
}

// ============================================================
//  MODAL CONFIG
// ============================================================
function abrirModal() {
    const modal = document.getElementById('tdModal');
    if (!modal) return;
    
    // Setear el radio button correcto
    document.querySelectorAll('input[name="tdAutoDelete"]').forEach(r => {
        r.checked = (r.value === config.autoDelete);
    });

    modal.hidden = false;
}

function cerrarModal() {
    const modal = document.getElementById('tdModal');
    if (modal) modal.hidden = true;
}

async function guardarConfig() {
    const radios = document.querySelectorAll('input[name="tdAutoDelete"]');
    for (let r of radios) {
        if (r.checked) {
            config.autoDelete = r.value;
            break;
        }
    }
    await guardarDatos();
    cerrarModal();
}

// ============================================================
//  INIT
// ============================================================
function inicializarEventos() {
    const input = document.getElementById('tdInput');
    const btnAdd = document.getElementById('tdBtnAdd');

    // Añadir tarea
    const addAction = async () => {
        if (input.value.trim()) {
            await agregarTarea(input.value);
            input.value = '';
            input.focus();
        }
    };
    btnAdd.addEventListener('click', addAction);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addAction();
    });

    // Configuración
    document.getElementById('tdBtnConfig').addEventListener('click', abrirModal);
    document.getElementById('tdModalCerrar').addEventListener('click', cerrarModal);
    document.getElementById('tdBtnGuardarConfig').addEventListener('click', guardarConfig);

    // Escape para cerrar modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('tdModal').hidden) cerrarModal();
    });
}

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

    await cargarDatos();
    render();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
