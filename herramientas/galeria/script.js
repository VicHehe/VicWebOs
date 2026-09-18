// ============================================================
//  Galería — Centro de imágenes del usuario
//  ------------------------------------------------------------
//  Estructura física:
//      Galeria{CODIGO}/img_xxx.jpg
//      Galeria{CODIGO}/galeria.json    ← índice por usuario
//      app/galeria/galeria.json        ← índice global (mirror)
//
//  Todas las operaciones de lectura/escritura las resuelve
//  MasterHad.galeria. Esta app solo pone la UI.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const POR_PAGINA = 6;
const MAX_ARCHIVO_MB = 25;

// ------------------------------------------------------------
//  Estado
// ------------------------------------------------------------
let usuarioActual = null;
let imagenes = [];
let carpetas = [];
let carpetaActual = 'todas';
let filtroBusqueda = '';
let paginaActual = 1;
let imagenSeleccionada = null;
let urlsActivas = [];
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;
const BD  = () => window.parent.ConfigBD || null;

// ------------------------------------------------------------
//  Tema
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  Toast
// ------------------------------------------------------------
function toast(texto, tipo = 'info') {
    const el = document.getElementById('gxToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'gx-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function formatearBytes(n) {
    const mh = MH();
    if (mh && mh.formatearBytes) return mh.formatearBytes(n);
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function formatearFecha(iso) {
    const d = new Date(iso);
    return d.toLocaleString('es-CL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function nombreCarpeta(id) {
    if (id === 'todas') return 'Todas';
    const c = carpetas.find(x => x.id === id);
    return c ? c.nombre : 'Sin carpeta';
}

// ------------------------------------------------------------
//  Cargar datos
// ------------------------------------------------------------
async function cargarTodo() {
    const mh = MH();
    if (!mh || !usuarioActual) return;
    try {
        imagenes = await mh.galeria.listarImagenes(usuarioActual.codigo, { fresh: true });
        carpetas = await mh.galeria.listarCarpetas(usuarioActual.codigo, { fresh: true });
        if (!carpetas.find(c => c.id === 'c_general')) {
            carpetas.unshift({ id: 'c_general', nombre: 'General', creada: null });
        }
    } catch (e) {
        console.warn('[Galería] Error cargando:', e);
        imagenes = [];
        carpetas = [];
    }
}

// ------------------------------------------------------------
//  Filtrado
// ------------------------------------------------------------
function imagenesFiltradas() {
    let lista = imagenes;
    if (carpetaActual !== 'todas') {
        lista = lista.filter(i => i.carpeta === carpetaActual);
    }
    if (filtroBusqueda) {
        const f = filtroBusqueda.toLowerCase();
        lista = lista.filter(i => (i.nombre || '').toLowerCase().includes(f));
    }
    return lista;
}

function contarPorCarpeta(carpetaId) {
    if (carpetaId === 'todas') return imagenes.length;
    return imagenes.filter(i => i.carpeta === carpetaId).length;
}

// ------------------------------------------------------------
//  Render: carpetas
// ------------------------------------------------------------
function renderCarpetas() {
    const cont = document.getElementById('gxCarpetas');
    if (!cont) return;

    const opciones = [
        { id: 'todas', nombre: 'Todas', icono: 'layout-grid' },
        ...carpetas.map(c => ({ id: c.id, nombre: c.nombre, icono: 'folder' }))
    ];

    cont.innerHTML = opciones.map(c => `
        <button class="gx-carpeta ${carpetaActual === c.id ? 'active' : ''}" data-id="${escapar(c.id)}">
            <i data-lucide="${c.icono}"></i>
            ${escapar(c.nombre)}
            <span class="gx-carpeta-count">${contarPorCarpeta(c.id)}</span>
        </button>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.gx-carpeta').forEach(btn => {
        btn.addEventListener('click', () => {
            carpetaActual = btn.dataset.id;
            paginaActual = 1;
            renderTodo();
        });
    });
}

// ------------------------------------------------------------
//  Render: grid + empty
//  Forzamos el atributo hidden + style.display.
//  IMPORTANTE: cuando hay contenido usamos display:'grid'
//  (NO 'block') para que el grid-template-columns del CSS
//  siga funcionando — el estilo inline gana sobre el CSS.
// ------------------------------------------------------------
function renderGrid() {
    const grid = document.getElementById('gxGrid');
    const empty = document.getElementById('gxEmpty');
    const footer = document.getElementById('gxFooter');
    const contador = document.getElementById('gxContador');
    const btnSubirEmpty = document.getElementById('gxEmptyBtnSubir');
    if (!grid) return;

    urlsActivas.forEach(u => URL.revokeObjectURL(u));
    urlsActivas = [];

    const lista = imagenesFiltradas();

    // Contador
    if (contador) {
        if (lista.length === 0) {
            contador.textContent = '';
        } else {
            const n = lista.length;
            const carpetaTxt = carpetaActual === 'todas'
                ? 'todas las carpetas'
                : `"${nombreCarpeta(carpetaActual)}"`;
            contador.textContent = n === 1
                ? `1 imagen en ${carpetaTxt}`
                : `${n} imágenes en ${carpetaTxt}`;
        }
    }

    // ---------- CASO VACÍO ----------
    if (lista.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        grid.style.display = 'none';

        empty.hidden = false;
        empty.style.display = 'flex';

        footer.hidden = true;
        footer.style.display = 'none';

        const titulo = document.getElementById('gxEmptyTitulo');
        const desc = document.getElementById('gxEmptyDesc');

        if (filtroBusqueda) {
            titulo.textContent = 'Sin resultados';
            desc.textContent = `No hay imágenes que coincidan con "${filtroBusqueda}".`;
            if (btnSubirEmpty) btnSubirEmpty.style.display = 'none';
        } else if (imagenes.length === 0) {
            titulo.textContent = 'Tu galería está vacía';
            desc.textContent = 'Sube tus primeras imágenes y estarán disponibles en todas las apps de VicWebOs.';
            if (btnSubirEmpty) btnSubirEmpty.style.display = 'inline-flex';
        } else if (carpetaActual !== 'todas') {
            titulo.textContent = 'Esta carpeta está vacía';
            desc.textContent = 'Sube imágenes o muévelas aquí desde otra carpeta.';
            if (btnSubirEmpty) btnSubirEmpty.style.display = 'inline-flex';
        } else {
            titulo.textContent = 'Nada que mostrar';
            desc.textContent = '';
            if (btnSubirEmpty) btnSubirEmpty.style.display = 'none';
        }
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // ---------- CASO CON CONTENIDO ----------
    grid.hidden = false;
    grid.style.display = 'grid'; // ← grid, NO block

    empty.hidden = true;
    empty.style.display = 'none';

    footer.hidden = false;
    footer.style.display = 'flex';

    // Paginación
    const totalPaginas = Math.ceil(lista.length / POR_PAGINA);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * POR_PAGINA;
    const pag = lista.slice(inicio, inicio + POR_PAGINA);

    grid.innerHTML = pag.map(img => `
        <div class="gx-item" data-id="${escapar(img.id)}">
            <div class="gx-item-skeleton"></div>
            <div class="gx-item-overlay">${escapar(img.nombre || img.archivo)}</div>
        </div>
    `).join('');

    pag.forEach(img => cargarMiniatura(img));

    document.getElementById('gxPageInfo').textContent = `${paginaActual} / ${totalPaginas}`;
    document.getElementById('btnPrev').disabled = paginaActual <= 1;
    document.getElementById('btnNext').disabled = paginaActual >= totalPaginas;

    const bytesTotal = lista.reduce((acc, i) => acc + (i.tamano || 0), 0);
    document.getElementById('gxTamanoTotal').textContent = `Total: ${formatearBytes(bytesTotal)}`;

    grid.querySelectorAll('.gx-item').forEach(el => {
        el.addEventListener('click', () => abrirPreview(el.dataset.id));
    });
}

async function cargarMiniatura(img) {
    const el = document.querySelector(`.gx-item[data-id="${img.id}"]`);
    if (!el) return;
    try {
        const mh = MH();
        if (!mh) return;
        const url = await mh.galeria.leerImagenURL(img.id);
        if (!url) throw new Error('sin url');
        urlsActivas.push(url);
        const imgEl = document.createElement('img');
        imgEl.src = url;
        imgEl.alt = img.nombre || '';
        imgEl.loading = 'lazy';
        el.insertBefore(imgEl, el.firstChild);
        const sk = el.querySelector('.gx-item-skeleton');
        if (sk) sk.classList.add('oculto');
    } catch (e) {
        console.warn('[Galería] No se pudo cargar miniatura:', e);
        const sk = el.querySelector('.gx-item-skeleton');
        if (sk) {
            sk.style.background = 'var(--gray-200)';
            sk.style.animation = 'none';
        }
    }
}

function renderTodo() {
    renderCarpetas();
    renderGrid();
    if (window.lucide) window.lucide.createIcons();
}

// ------------------------------------------------------------
//  Vista previa
// ------------------------------------------------------------
async function abrirPreview(id) {
    const mh = MH();
    if (!mh) return;

    const img = imagenes.find(i => i.id === id);
    if (!img) return;
    imagenSeleccionada = img;

    document.getElementById('previewTitulo').textContent = img.nombre || 'Imagen';
    document.getElementById('previewNombre').textContent = img.nombre || img.archivo;
    document.getElementById('previewCarpeta').textContent = nombreCarpeta(img.carpeta);
    document.getElementById('previewTamano').textContent = formatearBytes(img.tamano || 0);
    document.getElementById('previewFecha').textContent = formatearFecha(img.subida);

    const imgEl = document.getElementById('previewImg');
    imgEl.removeAttribute('src');

    document.getElementById('modalPreview').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    try {
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            imgEl.src = url;
            imgEl.onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[Galería] Preview falló:', e);
    }
}

function cerrarPreview() {
    document.getElementById('modalPreview').hidden = true;
    imagenSeleccionada = null;
    const imgEl = document.getElementById('previewImg');
    imgEl.removeAttribute('src');
}

// ------------------------------------------------------------
//  Subir imágenes
// ------------------------------------------------------------
async function subirArchivos(files) {
    if (!files || files.length === 0) return;

    const mh = MH();
    if (!mh) return;

    const validos = Array.from(files).filter(f => {
        if (!f.type.startsWith('image/')) {
            toast(`"${f.name}" no es una imagen.`, 'error');
            return false;
        }
        if (f.size > MAX_ARCHIVO_MB * 1024 * 1024) {
            toast(`"${f.name}" supera ${MAX_ARCHIVO_MB} MB.`, 'error');
            return false;
        }
        return true;
    });

    if (validos.length === 0) return;

    let carpetaDestino = 'c_general';
    if (carpetaActual !== 'todas' && carpetas.find(c => c.id === carpetaActual)) {
        carpetaDestino = carpetaActual;
    }

    const overlay = document.getElementById('overlaySubida');
    const overlayTexto = document.getElementById('overlaySubidaTexto');
    const overlayProgFill = document.getElementById('overlayProgresoFill');
    const overlayProgTexto = document.getElementById('overlayProgresoTexto');
    overlay.hidden = false;
    overlayProgFill.style.width = '0%';
    overlayProgTexto.textContent = `0 / ${validos.length}`;

    let ok = 0;
    let fallos = 0;

    for (let i = 0; i < validos.length; i++) {
        const f = validos[i];
        overlayTexto.textContent = `Subiendo "${f.name}"...`;
        try {
            await mh.galeria.subirImagen(f, {
                codigo: usuarioActual.codigo,
                carpeta: carpetaDestino
            });
            ok++;
        } catch (e) {
            console.warn('[Galería] Falló subida de', f.name, e);
            fallos++;
        }
        const pct = Math.round(((i + 1) / validos.length) * 100);
        overlayProgFill.style.width = pct + '%';
        overlayProgTexto.textContent = `${i + 1} / ${validos.length}`;
    }

    overlay.hidden = true;

    await cargarTodo();
    paginaActual = 1;
    renderTodo();

    if (ok > 0 && fallos === 0) {
        toast(ok === 1 ? 'Imagen subida' : `${ok} imágenes subidas`, 'success');
    } else if (ok > 0 && fallos > 0) {
        toast(`${ok} subidas, ${fallos} fallidas`, 'info');
    } else {
        toast('No se pudo subir ninguna imagen', 'error');
    }
}

// ------------------------------------------------------------
//  Nueva carpeta
// ------------------------------------------------------------
function abrirModalCarpeta() {
    document.getElementById('carpetaNombre').value = '';
    document.getElementById('modalCarpeta').hidden = false;
    setTimeout(() => document.getElementById('carpetaNombre').focus(), 100);
}

async function crearCarpeta() {
    const mh = MH();
    const nombre = document.getElementById('carpetaNombre').value.trim();
    if (!nombre) {
        toast('Escribe un nombre', 'error');
        return;
    }
    try {
        await mh.galeria.crearCarpeta(nombre, usuarioActual.codigo);
        document.getElementById('modalCarpeta').hidden = true;
        await cargarTodo();
        renderTodo();
        toast(`Carpeta "${nombre}" creada`, 'success');
    } catch (e) {
        toast(e.message || 'No se pudo crear', 'error');
    }
}

// ------------------------------------------------------------
//  Renombrar
// ------------------------------------------------------------
function abrirModalRenombrar() {
    if (!imagenSeleccionada) return;
    const input = document.getElementById('renombrarNombre');
    input.value = imagenSeleccionada.nombre || '';
    document.getElementById('modalRenombrar').hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 100);
}

async function guardarNombre() {
    const mh = MH();
    const nombre = document.getElementById('renombrarNombre').value.trim();
    if (!nombre) {
        toast('Escribe un nombre', 'error');
        return;
    }
    try {
        await mh.galeria.renombrarImagen(imagenSeleccionada.id, nombre, usuarioActual.codigo);
        document.getElementById('modalRenombrar').hidden = true;
        await cargarTodo();
        renderTodo();
        if (imagenSeleccionada) {
            const nueva = imagenes.find(i => i.id === imagenSeleccionada.id);
            if (nueva) {
                imagenSeleccionada = nueva;
                document.getElementById('previewTitulo').textContent = nueva.nombre;
                document.getElementById('previewNombre').textContent = nueva.nombre;
            }
        }
        toast('Nombre actualizado', 'success');
    } catch (e) {
        toast(e.message || 'No se pudo guardar', 'error');
    }
}

// ------------------------------------------------------------
//  Mover a carpeta
// ------------------------------------------------------------
function abrirModalMover() {
    if (!imagenSeleccionada) return;

    const lista = document.getElementById('moverLista');

    lista.innerHTML = carpetas.map(c => {
        const actual = c.id === imagenSeleccionada.carpeta;
        return `
            <button class="gx-mover-opcion ${actual ? 'actual' : ''}" data-id="${escapar(c.id)}" ${actual ? 'disabled' : ''}>
                <span class="gx-mover-nombre">
                    <i data-lucide="folder"></i>
                    ${escapar(c.nombre)}
                </span>
                ${actual ? '<span class="gx-mover-tag-actual">Actual</span>' : ''}
            </button>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    lista.querySelectorAll('.gx-mover-opcion:not(.actual)').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await MH().galeria.moverACarpeta(imagenSeleccionada.id, btn.dataset.id, usuarioActual.codigo);
                document.getElementById('modalMover').hidden = true;
                await cargarTodo();
                renderTodo();
                if (imagenSeleccionada) {
                    const nueva = imagenes.find(i => i.id === imagenSeleccionada.id);
                    if (nueva) {
                        imagenSeleccionada = nueva;
                        document.getElementById('previewCarpeta').textContent = nombreCarpeta(nueva.carpeta);
                    }
                }
                toast('Imagen movida', 'success');
            } catch (e) {
                toast(e.message || 'No se pudo mover', 'error');
            }
        });
    });

    document.getElementById('modalMover').hidden = false;
}

// ------------------------------------------------------------
//  Eliminar
// ------------------------------------------------------------
async function eliminarImagen() {
    if (!imagenSeleccionada) return;
    if (!confirm(`¿Eliminar "${imagenSeleccionada.nombre}" permanentemente?\n\nEsta acción no se puede deshacer. Si estaba en uso en otra app, dejará de verse allí también.`)) return;

    const id = imagenSeleccionada.id;
    const mh = MH();
    try {
        await mh.galeria.borrarImagen(id, usuarioActual.codigo);
        cerrarPreview();
        await cargarTodo();
        renderTodo();
        toast('Imagen eliminada', 'success');
    } catch (e) {
        toast(e.message || 'No se pudo eliminar', 'error');
    }
}

// ------------------------------------------------------------
//  Drag & drop
// ------------------------------------------------------------
function inicializarDragDrop() {
    const cont = document.querySelector('.gx-container');
    if (!cont) return;

    let dragContador = 0;

    ['dragenter', 'dragover'].forEach(ev => {
        document.addEventListener(ev, (e) => {
            e.preventDefault();
            if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        });
    });

    document.addEventListener('dragenter', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        dragContador++;
    });

    document.addEventListener('dragleave', () => {
        dragContador--;
        if (dragContador <= 0) dragContador = 0;
    });

    document.addEventListener('drop', (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        dragContador = 0;
        subirArchivos(e.dataTransfer.files);
    });
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Galería necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('gxUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar la Galería.');
        return;
    }

    await cargarTodo();
    renderTodo();

    const btnSubir = document.getElementById('btnSubir');
    const btnSubirEmpty = document.getElementById('gxEmptyBtnSubir');
    const input = document.getElementById('inputImagenes');

    const dispararInput = () => input?.click();

    btnSubir?.addEventListener('click', dispararInput);
    btnSubirEmpty?.addEventListener('click', dispararInput);

    input?.addEventListener('change', () => {
        if (input.files.length) {
            subirArchivos(input.files);
            input.value = '';
        }
    });

    const buscador = document.getElementById('gxBuscador');
    const buscadorClear = document.getElementById('gxBuscadorClear');
    buscador?.addEventListener('input', (e) => {
        filtroBusqueda = e.target.value.trim();
        buscadorClear.hidden = !filtroBusqueda;
        paginaActual = 1;
        renderGrid();
    });
    buscadorClear?.addEventListener('click', () => {
        buscador.value = '';
        filtroBusqueda = '';
        buscadorClear.hidden = true;
        paginaActual = 1;
        renderGrid();
    });

    document.getElementById('btnNuevaCarpeta')?.addEventListener('click', abrirModalCarpeta);
    document.getElementById('carpetaCerrar')?.addEventListener('click', () => {
        document.getElementById('modalCarpeta').hidden = true;
    });
    document.getElementById('btnCrearCarpeta')?.addEventListener('click', crearCarpeta);
    document.getElementById('carpetaNombre')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') crearCarpeta();
    });

    document.getElementById('previewCerrar')?.addEventListener('click', cerrarPreview);
    document.getElementById('modalPreview')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalPreview') cerrarPreview();
    });

    document.getElementById('btnRenombrar')?.addEventListener('click', abrirModalRenombrar);
    document.getElementById('btnMover')?.addEventListener('click', abrirModalMover);
    document.getElementById('btnEliminar')?.addEventListener('click', eliminarImagen);

    document.getElementById('renombrarCerrar')?.addEventListener('click', () => {
        document.getElementById('modalRenombrar').hidden = true;
    });
    document.getElementById('btnGuardarNombre')?.addEventListener('click', guardarNombre);
    document.getElementById('renombrarNombre')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guardarNombre();
    });

    document.getElementById('moverCerrar')?.addEventListener('click', () => {
        document.getElementById('modalMover').hidden = true;
    });

    document.getElementById('btnPrev')?.addEventListener('click', () => {
        if (paginaActual > 1) { paginaActual--; renderGrid(); }
    });
    document.getElementById('btnNext')?.addEventListener('click', () => {
        const total = Math.ceil(imagenesFiltradas().length / POR_PAGINA);
        if (paginaActual < total) { paginaActual++; renderGrid(); }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('modalPreview').hidden) { cerrarPreview(); return; }
        document.getElementById('modalCarpeta').hidden = true;
        document.getElementById('modalRenombrar').hidden = true;
        document.getElementById('modalMover').hidden = true;
    });

    inicializarDragDrop();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);

window.addEventListener('pagehide', () => {
    urlsActivas.forEach(u => URL.revokeObjectURL(u));
});
