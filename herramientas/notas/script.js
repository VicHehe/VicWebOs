// ============================================================
//  Notas — Bloc de notas simple con funciones premium
//  ------------------------------------------------------------
//  Datos por usuario en app/notas/{codigo}notas.json
//  Estructura:
//  {
//    version: 1,
//    actualizado: ISO,
//    compras: { buscar: bool, descargar: bool },
//    expansiones: number,
//    notas: [ { id, titulo, texto, creada, actualizada } ]
//  }
//
//  Funciones premium (una vez compradas, permanentes):
//    - Buscar (5 monedas): filtra por título/contenido y resalta
//    - Descargar (5 monedas): exporta la nota como archivo
//  Ampliación: 35 monedas = +10 notas (repetible)
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_BASE = 'app/notas/';
const MAX_NOTAS_BASE = 10;
const NOTAS_POR_EXPANSION = 10;
const COSTO_EXPANSION = 35;

const PRECIOS = { buscar: 5, descargar: 5 };
const NOMBRES_FUNCION = { buscar: 'Buscar', descargar: 'Descargar' };
const DESCRIPCIONES_FUNCION = {
    buscar: 'Buscar palabras en tus notas y resaltarlas',
    descargar: 'Exportar notas como archivo a tu dispositivo'
};

// ---------- ESTADO ----------
let notas = [];
let compras = { buscar: false, descargar: false };
let expansiones = 0;
let usuarioActual = null;
let vistaActual = 'lista';
let notaEditandoId = null;
let filtroBusqueda = '';
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

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
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ntToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'nt-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HELPERS
// ============================================================
function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escaparRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generarId() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function rutaArchivo() {
    if (!usuarioActual) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'notas.json';
}

function limiteNotas() {
    return MAX_NOTAS_BASE + expansiones * NOTAS_POR_EXPANSION;
}

function formatearBytes(n) {
    const mh = MH();
    if (mh && mh.formatearBytes) return mh.formatearBytes(n);
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function pesoTexto(texto) {
    try {
        return new Blob([texto || '']).size;
    } catch (e) {
        return (texto || '').length;
    }
}

function contarPalabras(texto) {
    const t = String(texto || '').trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
}

function contarLineas(texto) {
    if (!texto) return 0;
    return String(texto).split('\n').length;
}

function formatearFecha(iso) {
    if (!iso) return '—';
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
//  CARGAR / GUARDAR
// ============================================================
async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        const data = await bd.leerArchivo(ruta);
        if (!data || typeof data !== 'object') {
            notas = [];
            compras = { buscar: false, descargar: false };
            expansiones = 0;
            return;
        }
        notas = Array.isArray(data.notas) ? data.notas : [];
        compras = {
            buscar: !!data.compras?.buscar,
            descargar: !!data.compras?.descargar
        };
        expansiones = Number.isFinite(data.expansiones) ? data.expansiones : 0;
    } catch (e) {
        console.warn('[Notas] Error cargando:', e);
        notas = [];
        compras = { buscar: false, descargar: false };
        expansiones = 0;
    }
}

async function guardarTodo() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            actualizado: new Date().toISOString(),
            compras: { ...compras },
            expansiones,
            notas
        });
    } catch (e) {
        console.warn('[Notas] No se pudo guardar:', e);
        toast('No se pudo guardar', 'error');
        throw e;
    }
}

// ============================================================
//  PREMIUM: COMPRAS
// ============================================================
function abrirModal(tipo, id) {
    const modal = document.getElementById('ntModal');
    const icono = document.getElementById('ntModalIcono');
    const titulo = document.getElementById('ntModalTitulo');
    const desc = document.getElementById('ntModalDesc');
    const precio = document.getElementById('ntModalPrecio');
    const txtOk = document.getElementById('ntModalConfirmarTxt');

    if (tipo === 'funcion') {
        titulo.textContent = `Desbloquear "${NOMBRES_FUNCION[id]}"`;
        desc.textContent = DESCRIPCIONES_FUNCION[id] || '';
        precio.textContent = PRECIOS[id];
        icono.setAttribute('data-lucide', id === 'buscar' ? 'search' : 'download');
        txtOk.textContent = 'Desbloquear';
    } else if (tipo === 'ampliar') {
        titulo.textContent = 'Ampliar notas';
        desc.textContent = `Añade ${NOTAS_POR_EXPANSION} espacios más para guardar notas.`;
        precio.textContent = COSTO_EXPANSION;
        icono.setAttribute('data-lucide', 'plus-circle');
        txtOk.textContent = 'Ampliar';
    }

    modal.dataset.tipo = tipo;
    modal.dataset.id = id || '';
    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('ntModal');
    modal.hidden = true;
    modal.dataset.tipo = '';
    modal.dataset.id = '';
}

async function confirmarModal() {
    const modal = document.getElementById('ntModal');
    const tipo = modal.dataset.tipo;
    const id = modal.dataset.id;
    const btn = document.getElementById('ntModalConfirmar');

    if (btn.disabled) return;
    btn.disabled = true;

    try {
        if (tipo === 'funcion') {
            await comprarFuncion(id);
        } else if (tipo === 'ampliar') {
            await comprarExpansion();
        }
        cerrarModal();
    } catch (e) {
        toast(e.message || 'No se pudo completar', 'error');
    } finally {
        btn.disabled = false;
    }
}

async function comprarFuncion(id) {
    const api = API();
    if (!api) throw new Error('Sin conexión con VicWebOs.');

    if (compras[id]) {
        toast('Ya tienes esta función', 'info');
        return;
    }

    const precio = PRECIOS[id] || 0;
    const nombre = NOMBRES_FUNCION[id] || id;

    await api.gastoBoleta('notebook-pen', 'notas', `Función ${nombre}`, precio);
    compras[id] = true;
    await guardarTodo();
    toast(`Función "${nombre}" desbloqueada`, 'success');
    renderTodo();
}

async function comprarExpansion() {
    const api = API();
    if (!api) throw new Error('Sin conexión con VicWebOs.');

    await api.gastoBoleta('notebook-pen', 'notas', `Ampliar +${NOTAS_POR_EXPANSION} notas`, COSTO_EXPANSION);
    expansiones += 1;
    await guardarTodo();
    toast(`+${NOTAS_POR_EXPANSION} espacios disponibles`, 'success');
    renderTodo();
}

// ============================================================
//  RENDER: PREMIUM
// ============================================================
function renderPremium() {
    const cont = document.getElementById('ntPremium');
    if (!cont) return;

    cont.innerHTML = ['buscar', 'descargar'].map(id => {
        const comprada = compras[id];
        const icono = id === 'buscar' ? 'search' : 'download';
        return `
            <button class="nt-premium-card ${comprada ? 'comprada' : ''}"
                    data-funcion="${id}" ${comprada ? 'disabled' : ''}>
                <div class="nt-premium-icono">
                    <i data-lucide="${icono}"></i>
                </div>
                <div class="nt-premium-info">
                    <div class="nt-premium-nombre">${NOMBRES_FUNCION[id]}</div>
                    <div class="nt-premium-desc">${DESCRIPCIONES_FUNCION[id]}</div>
                </div>
                <span class="nt-premium-estado">
                    ${comprada
                        ? '<i data-lucide="check"></i> Activa'
                        : `<i data-lucide="lock"></i> ${PRECIOS[id]} <i data-lucide="coins"></i>`}
                </span>
            </button>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.nt-premium-card:not(.comprada)').forEach(btn => {
        btn.addEventListener('click', () => {
            abrirModal('funcion', btn.dataset.funcion);
        });
    });
}

// ============================================================
//  RENDER: LISTA
// ============================================================
function notaFiltrada(nota) {
    if (!filtroBusqueda) return true;
    const f = filtroBusqueda.toLowerCase();
    return (nota.titulo || '').toLowerCase().includes(f) ||
           (nota.texto || '').toLowerCase().includes(f);
}

function resaltarCoincidencias(texto) {
    const safe = escaparHTML(texto);
    if (!filtroBusqueda) return safe;
    try {
        const re = new RegExp('(' + escaparRegex(filtroBusqueda) + ')', 'gi');
        return safe.replace(re, '<mark>$1</mark>');
    } catch (e) {
        return safe;
    }
}

function renderLista() {
    const cont = document.getElementById('ntLista');
    const vacio = document.getElementById('ntVacio');
    const vacioTitulo = document.getElementById('ntVacioTitulo');
    const vacioDesc = document.getElementById('ntVacioDesc');
    const contador = document.getElementById('ntContador');
    if (!cont || !vacio) return;

    // Contador
    const limite = limiteNotas();
    if (contador) contador.textContent = `${notas.length} / ${limite}`;

    // Filtrar
    const filtradas = notas.filter(notaFiltrada);

    // Estado vacío
    if (filtradas.length === 0) {
        cont.innerHTML = '';
        vacio.hidden = false;
        if (notas.length === 0) {
            vacioTitulo.textContent = 'Aún no tienes notas';
            vacioDesc.textContent = 'Pulsa "Nueva nota" para empezar a escribir.';
        } else if (filtroBusqueda) {
            vacioTitulo.textContent = 'Sin resultados';
            vacioDesc.textContent = `No hay notas que coincidan con "${filtroBusqueda}".`;
        } else {
            vacioTitulo.textContent = 'Nada por aquí';
            vacioDesc.textContent = '';
        }
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    vacio.hidden = true;

    // Ordenar por actualizada descendente
    const ordenadas = [...filtradas].sort((a, b) =>
        new Date(b.actualizada || b.creada || 0) - new Date(a.actualizada || a.creada || 0)
    );

    cont.innerHTML = ordenadas.map(nota => {
        const texto = nota.texto || '';
        const preview = texto.slice(0, 140) + (texto.length > 140 ? '…' : '');
        const palabras = contarPalabras(texto);
        const lineas = contarLineas(texto);
        const peso = formatearBytes(pesoTexto(texto));
        const tituloEsc = escaparHTML(nota.titulo || 'Sin título');
        const tituloFinal = filtroBusqueda
            ? resaltarCoincidencias(nota.titulo || 'Sin título')
            : tituloEsc;
        const previewFinal = filtroBusqueda
            ? resaltarCoincidencias(preview)
            : escaparHTML(preview);

        const descargarBtn = compras.descargar
            ? `<button class="nt-card-btn" data-accion="descargar" data-id="${nota.id}" title="Descargar">
                   <i data-lucide="download"></i>
               </button>`
            : `<button class="nt-card-btn bloqueado" data-accion="descargarBloqueado" title="Función bloqueada">
                   <i data-lucide="lock"></i>
               </button>`;

        return `
            <div class="nt-card" data-id="${nota.id}">
                <div class="nt-card-acciones">
                    ${descargarBtn}
                    <button class="nt-card-btn peligro" data-accion="borrar" data-id="${nota.id}" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
                <div class="nt-card-titulo">${tituloFinal}</div>
                <div class="nt-card-preview">${previewFinal || '<em>Sin contenido</em>'}</div>
                <div class="nt-card-meta">
                    <span class="nt-card-meta-item"><i data-lucide="type"></i>${palabras} pal.</span>
                    <span class="nt-card-meta-item"><i data-lucide="align-left"></i>${lineas} lín.</span>
                    <span class="nt-card-meta-item"><i data-lucide="hard-drive"></i>${peso}</span>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Eventos
    cont.querySelectorAll('.nt-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const accionBtn = e.target.closest('[data-accion]');
            if (accionBtn) {
                e.stopPropagation();
                const accion = accionBtn.dataset.accion;
                const id = accionBtn.dataset.id;
                if (accion === 'descargar') descargarNota(id);
                if (accion === 'descargarBloqueado') abrirModal('funcion', 'descargar');
                if (accion === 'borrar') borrarNota(id);
                return;
            }
            abrirEditor(card.dataset.id);
        });
    });
}

function renderTodo() {
    renderPremium();
    renderLista();
    actualizarVisibilidadAmpliar();
    actualizarBuscador();
    if (window.lucide) window.lucide.createIcons();
}

function actualizarVisibilidadAmpliar() {
    const btn = document.getElementById('btnAmpliar');
    if (!btn) return;
    // Siempre visible: el usuario puede ampliar aunque no esté en el tope.
    btn.hidden = false;
    btn.querySelector('span').textContent =
        `Ampliar +${NOTAS_POR_EXPANSION} notas por ${COSTO_EXPANSION} monedas`;
}

function actualizarBuscador() {
    const wrap = document.getElementById('ntBuscadorWrap');
    if (!wrap) return;
    wrap.hidden = !compras.buscar;
    if (!compras.buscar) {
        filtroBusqueda = '';
        const input = document.getElementById('ntBuscador');
        if (input) input.value = '';
    }
}

// ============================================================
//  EDITOR
// ============================================================
function abrirEditor(id) {
    const nota = notas.find(n => n.id === id);
    if (!nota) return;

    notaEditandoId = id;
    document.getElementById('ntTitulo').value = nota.titulo || '';
    document.getElementById('ntTexto').value = nota.texto || '';
    document.getElementById('btnBorrarNota').hidden = false;
    actualizarStatsEditor();

    document.getElementById('vistaLista').hidden = true;
    document.getElementById('vistaEditor').hidden = false;
    vistaActual = 'editor';

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('ntTitulo').focus(), 100);
}

function abrirEditorNueva() {
    const limite = limiteNotas();
    if (notas.length >= limite) {
        toast(`Límite alcanzado (${limite}). Amplía para crear más.`, 'error');
        return;
    }

    notaEditandoId = null;
    document.getElementById('ntTitulo').value = '';
    document.getElementById('ntTexto').value = '';
    document.getElementById('btnBorrarNota').hidden = true;
    actualizarStatsEditor();

    document.getElementById('vistaLista').hidden = true;
    document.getElementById('vistaEditor').hidden = false;
    vistaActual = 'editor';

    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('ntTitulo').focus(), 100);
}

function cerrarEditor() {
    document.getElementById('vistaEditor').hidden = true;
    document.getElementById('vistaLista').hidden = false;
    vistaActual = 'lista';
    notaEditandoId = null;
}

async function guardarNotaActual() {
    const titulo = document.getElementById('ntTitulo').value.trim() || 'Sin título';
    const texto = document.getElementById('ntTexto').value;

    if (notaEditandoId) {
        const idx = notas.findIndex(n => n.id === notaEditandoId);
        if (idx >= 0) {
            notas[idx] = {
                ...notas[idx],
                titulo,
                texto,
                actualizada: new Date().toISOString()
            };
        }
    } else {
        // Verificar límite otra vez por seguridad
        if (notas.length >= limiteNotas()) {
            toast('Límite de notas alcanzado', 'error');
            return;
        }
        const nueva = {
            id: generarId(),
            titulo,
            texto,
            creada: new Date().toISOString(),
            actualizada: new Date().toISOString()
        };
        notas.unshift(nueva);
        notaEditandoId = nueva.id;
    }

    await guardarTodo();
    toast('Nota guardada', 'success');
    cerrarEditor();
    renderTodo();
}

async function borrarNotaActual() {
    if (!notaEditandoId) return;
    if (!confirm('¿Eliminar esta nota permanentemente?')) return;

    notas = notas.filter(n => n.id !== notaEditandoId);
    await guardarTodo();
    toast('Nota eliminada', 'success');
    cerrarEditor();
    renderTodo();
}

async function borrarNota(id) {
    const nota = notas.find(n => n.id === id);
    if (!nota) return;
    if (!confirm(`¿Eliminar "${nota.titulo || 'Sin título'}" permanentemente?`)) return;

    notas = notas.filter(n => n.id !== id);
    await guardarTodo();
    toast('Nota eliminada', 'success');
    renderTodo();
}

function actualizarStatsEditor() {
    const texto = document.getElementById('ntTexto').value;
    const palabras = contarPalabras(texto);
    const lineas = contarLineas(texto);
    const el = document.getElementById('ntEditorStats');
    if (el) el.textContent = `${palabras} ${palabras === 1 ? 'palabra' : 'palabras'} · ${lineas} ${lineas === 1 ? 'línea' : 'líneas'}`;
}

// ============================================================
//  DESCARGA
// ============================================================
function descargarNota(id) {
    const nota = notas.find(n => n.id === id);
    if (!nota) return;

    if (!compras.descargar) {
        abrirModal('funcion', 'descargar');
        return;
    }

    let nombre = (nota.titulo || 'nota').trim();
    // Sanitizar caracteres problemáticos en sistemas de archivos
    nombre = nombre.replace(/[\/\\:*?"<>|]/g, '_').replace(/^\.+/, '') || 'nota';

    // Si no tiene extensión, añadir .txt. Si la tiene, respetarla.
    if (!/\.[a-z0-9]+$/i.test(nombre)) {
        nombre += '.txt';
    }

    try {
        const blob = new Blob([nota.texto || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
        toast(`Descargando "${nombre}"`, 'success');
    } catch (e) {
        console.warn('[Notas] Error descargando:', e);
        toast('No se pudo descargar', 'error');
    }
}

// ============================================================
//  INICIALIZACIÓN
// ============================================================
function inicializarEventos() {
    // Nueva nota
    document.getElementById('btnNueva')?.addEventListener('click', abrirEditorNueva);
    document.getElementById('btnNuevaEmpty')?.addEventListener('click', abrirEditorNueva);

    // Editor
    document.getElementById('btnVolver')?.addEventListener('click', () => {
        // Si hay contenido sin guardar en nota nueva, confirmar
        if (!notaEditandoId) {
            const titulo = document.getElementById('ntTitulo').value.trim();
            const texto = document.getElementById('ntTexto').value.trim();
            if (titulo || texto) {
                if (!confirm('¿Descartar esta nota sin guardar?')) return;
            }
        }
        cerrarEditor();
    });
    document.getElementById('btnGuardar')?.addEventListener('click', guardarNotaActual);
    document.getElementById('btnBorrarNota')?.addEventListener('click', borrarNotaActual);
    document.getElementById('ntTexto')?.addEventListener('input', actualizarStatsEditor);

    // Ampliar
    document.getElementById('btnAmpliar')?.addEventListener('click', () => {
        abrirModal('ampliar');
    });

    // Buscador
    const buscador = document.getElementById('ntBuscador');
    const buscadorClear = document.getElementById('ntBuscadorClear');
    buscador?.addEventListener('input', (e) => {
        filtroBusqueda = e.target.value.trim();
        buscadorClear.hidden = !filtroBusqueda;
        renderLista();
    });
    buscadorClear?.addEventListener('click', () => {
        buscador.value = '';
        filtroBusqueda = '';
        buscadorClear.hidden = true;
        renderLista();
    });

    // Modal
    document.getElementById('ntModalCancelar')?.addEventListener('click', cerrarModal);
    document.getElementById('ntModalConfirmar')?.addEventListener('click', confirmarModal);
    document.getElementById('ntModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'ntModal') cerrarModal();
    });

    // Atajos de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!document.getElementById('ntModal').hidden) {
                cerrarModal();
                return;
            }
            if (vistaActual === 'editor') {
                document.getElementById('btnVolver')?.click();
            }
        }
        // Ctrl+S para guardar en editor
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && vistaActual === 'editor') {
            e.preventDefault();
            guardarNotaActual();
        }
    });
}

async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Notas necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('ntUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar Notas.');
        return;
    }

    await cargar();
    renderTodo();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
