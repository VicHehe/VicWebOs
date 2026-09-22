// ============================================================
//  Lector PDF — Biblioteca local + Visor
//  ------------------------------------------------------------
//  Los PDFs viven en IndexedDB (local). NO se sincronizan al
//  repo — así no ensuciamos el repo con archivos pesados.
//
//  Premium (40 monedas, one-time):
//    - Recordar última página leída
//    - Buscar texto dentro del PDF
//    - Exportar el PDF original
//
//  El estado premium SÍ se persiste en el repo:
//    app/lector-pdf/{codigo}lector-pdf.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsLectorPDF';
const IDB_VERSION = 1;
const IDB_STORE = 'pdfs';
const ARCHIVO_PREMIUM_BASE = 'app/lector-pdf/';

const MAX_PDFS = 10;
const MAX_TAMAÑO_PDF = 50 * 1024 * 1024; // 50MB
const COSTO_PREMIUM = 40;

// Niveles de zoom
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

// ============================================================
//  CONFIG PDF.JS
// ============================================================
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ============================================================
//  ESTADO
// ============================================================
let usuarioActual = null;
let premium = false;
let pdfs = [];                    // metadata de todos los PDFs
let pdfActual = null;             // { id, nombre, blob, pdfDoc, paginas, ultimaPagina }
let paginaActual = 1;
let zoomActual = 1;
let renderTaskActual = null;
let buscarResultados = [];
let toastTimeout = null;
let dropContador = 0;

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
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('lpToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'lp-toast show ' + tipo;
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

function formatearBytes(n) {
    const mh = MH();
    if (mh && mh.formatearBytes) return mh.formatearBytes(n);
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function generarId() {
    return 'pdf_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
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

async function idbGetAll() {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return []; }
}

async function idbGet(id) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbPut(record) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { throw e; }
}

async function idbDelete(id) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  PREMIUM — carga y guardado
// ============================================================
function rutaArchivoPremium() {
    if (!usuarioActual) return null;
    return ARCHIVO_PREMIUM_BASE + usuarioActual.codigo + 'lector-pdf.json';
}

function claveLocalPremium() {
    const com = (typeof window.parent.obtenerComunidadActiva === 'function')
        ? window.parent.obtenerComunidadActiva() : null;
    const codigo = usuarioActual?.codigo || 'inv';
    return `lp_premium_${com ? com.id : 'none'}_${codigo}`;
}

async function cargarPremium() {
    const local = localStorage.getItem(claveLocalPremium());
    if (local === '1') {
        premium = true;
        return;
    }
    const bd = BD();
    const ruta = rutaArchivoPremium();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && data.premium === true) {
            premium = true;
            localStorage.setItem(claveLocalPremium(), '1');
        }
    } catch (e) { /* silencioso */ }
}

async function guardarPremium() {
    localStorage.setItem(claveLocalPremium(), '1');
    const bd = BD();
    const ruta = rutaArchivoPremium();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            premium: true,
            compradoEn: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[LectorPDF] No se pudo guardar premium en el repo:', e);
    }
}

function actualizarUIPremium() {
    const btn = document.getElementById('lpBtnPremium');
    const txt = document.getElementById('lpPremiumTexto');
    if (!btn || !txt) return;
    if (premium) {
        btn.classList.add('activo');
        txt.textContent = 'Premium';
        btn.title = 'Premium activo';
    } else {
        btn.classList.remove('activo');
        txt.textContent = 'Premium';
        btn.title = 'Desbloquear premium (40 monedas)';
    }
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  CARGAR LIBRERÍA
// ============================================================
async function cargarBiblioteca() {
    pdfs = await idbGetAll();
    pdfs.sort((a, b) => new Date(b.creado) - new Date(a.creado));
}

// ============================================================
//  RENDER BIBLIOTECA
// ============================================================
function renderBiblioteca() {
    const lista = document.getElementById('lpLista');
    const vacio = document.getElementById('lpVacio');
    const contador = document.getElementById('lpContador');
    if (!lista || !vacio) return;

    if (contador) contador.textContent = `${pdfs.length} / ${MAX_PDFS}`;

    if (pdfs.length === 0) {
        lista.innerHTML = '';
        vacio.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    vacio.hidden = true;
    lista.innerHTML = pdfs.map(renderCardPDF).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderCardPDF(p) {
    const thumb = p.thumb
        ? `<img src="${p.thumb}" alt="" loading="lazy">`
        : `<div class="lp-card-thumb-fallback"><i data-lucide="file-text"></i></div>`;

    const marcadorHTML = (premium && p.ultimaPagina && p.ultimaPagina > 1)
        ? `<span class="lp-card-marcador"><i data-lucide="bookmark"></i> Pág. ${p.ultimaPagina}</span>`
        : '';

    const exportarBtn = premium
        ? `<button class="lp-card-btn" data-accion="exportar" data-id="${p.id}" title="Exportar">
               <i data-lucide="download"></i>
           </button>`
        : `<button class="lp-card-btn requiere-premium" data-accion="exportar-premium" data-id="${p.id}" title="Premium: exportar">
               <i data-lucide="lock"></i>
           </button>`;

    return `
        <div class="lp-card" data-id="${p.id}">
            <div class="lp-card-thumb">${thumb}</div>
            <div class="lp-card-info">
                <div class="lp-card-nombre">${escaparHTML(p.nombre)}</div>
                <div class="lp-card-meta">
                    <span class="lp-card-meta-item"><i data-lucide="file-text"></i>${p.paginas} ${p.paginas === 1 ? 'pág.' : 'págs.'}</span>
                    <span class="lp-card-meta-item"><i data-lucide="hard-drive"></i>${formatearBytes(p.tamaño)}</span>
                    ${marcadorHTML}
                </div>
            </div>
            <div class="lp-card-acciones">
                <button class="lp-card-btn" data-accion="renombrar" data-id="${p.id}" title="Renombrar">
                    <i data-lucide="pencil"></i>
                </button>
                ${exportarBtn}
                <button class="lp-card-btn peligro" data-accion="borrar" data-id="${p.id}" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `;
}

// ============================================================
//  AÑADIR PDF
// ============================================================
async function añadirPDF(file) {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
        toast('Solo se admiten archivos PDF', 'error');
        return;
    }
    if (pdfs.length >= MAX_PDFS) {
        toast(`Máximo ${MAX_PDFS} PDFs. Eliminá uno para añadir más.`, 'error');
        return;
    }
    if (file.size > MAX_TAMAÑO_PDF) {
        toast(`Archivo muy grande (máx ${formatearBytes(MAX_TAMAÑO_PDF)})`, 'error');
        return;
    }

    mostrarCargandoBiblioteca(true);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        const paginas = pdfDoc.numPages;

        let thumb = '';
        try {
            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            thumb = canvas.toDataURL('image/jpeg', 0.72);
        } catch (e) {
            console.warn('[LectorPDF] No se pudo generar thumbnail:', e);
        }

        const record = {
            id: generarId(),
            nombre: file.name.replace(/\.pdf$/i, ''),
            tamaño: file.size,
            paginas,
            blob: new Blob([bytes], { type: 'application/pdf' }),
            thumb,
            creado: new Date().toISOString(),
            ultimaPagina: 1
        };

        await idbPut(record);
        await cargarBiblioteca();
        renderBiblioteca();
        toast(`PDF añadido (${paginas} págs.)`, 'success');
    } catch (e) {
        console.warn('[LectorPDF] Error añadiendo:', e);
        toast('No se pudo procesar el PDF', 'error');
    } finally {
        mostrarCargandoBiblioteca(false);
    }
}

function mostrarCargandoBiblioteca(show) {
    const lista = document.getElementById('lpLista');
    if (!lista) return;
    if (show) {
        lista.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--gray-500);font-weight:700;font-size:13px;">
            <div class="lp-spinner" style="margin:0 auto 14px;"></div>
            Procesando PDF...
        </div>`;
    }
}

// ============================================================
//  VISOR — abrir
// ============================================================
async function abrirVisor(id) {
    const record = await idbGet(id);
    if (!record) {
        toast('PDF no encontrado', 'error');
        return;
    }

    mostrarCargandoVisor('Cargando PDF...');
    try {
        const arrayBuffer = await record.blob.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

        pdfActual = {
            id: record.id,
            nombre: record.nombre,
            blob: record.blob,
            pdfDoc,
            paginas: pdfDoc.numPages,
            ultimaPagina: record.ultimaPagina || 1
        };

        paginaActual = (premium && pdfActual.ultimaPagina > 0)
            ? Math.min(pdfActual.ultimaPagina, pdfActual.paginas)
            : 1;
        zoomActual = 1;

        document.getElementById('lpVisTitulo').textContent = pdfActual.nombre;
        document.getElementById('lpVisPagTotal').textContent = String(pdfActual.paginas);
        document.getElementById('lpVisPagActual').max = String(pdfActual.paginas);

        document.getElementById('lpVistaBiblioteca').hidden = true;
        document.getElementById('lpVistaVisor').hidden = false;

        const btnMarcador = document.getElementById('lpVisBtnMarcador');
        if (btnMarcador) {
            btnMarcador.classList.toggle('premium', !premium);
            btnMarcador.title = premium ? 'Marcar esta página' : 'Premium: marcar página';
        }

        // Esperar un frame para que el wrapper tenga tamaño
        await new Promise(r => requestAnimationFrame(r));
        await renderPagina();
        ocultarCargandoVisor();
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.warn('[LectorPDF] Error abriendo visor:', e);
        ocultarCargandoVisor();
        toast('No se pudo abrir el PDF', 'error');
    }
}

function cerrarVisor() {
    if (premium && pdfActual) {
        guardarUltimaPagina(pdfActual.id, paginaActual);
    }

    document.getElementById('lpVistaVisor').hidden = true;
    document.getElementById('lpVistaBiblioteca').hidden = false;

    if (renderTaskActual) {
        try { renderTaskActual.cancel(); } catch (e) {}
        renderTaskActual = null;
    }
    pdfActual = null;
    paginaActual = 1;
    zoomActual = 1;
    document.getElementById('lpVisBuscarPanel').hidden = true;
    document.getElementById('lpVisBuscarInput').value = '';
    document.getElementById('lpVisBuscarResultados').innerHTML = '<p class="lp-vis-buscar-ayuda">Escribí algo para buscar.</p>';

    cargarBiblioteca().then(renderBiblioteca);
}

async function guardarUltimaPagina(id, pagina) {
    const record = await idbGet(id);
    if (!record) return;
    record.ultimaPagina = pagina;
    await idbPut(record);
}

// ============================================================
//  VISOR — render página
// ============================================================
async function renderPagina() {
    if (!pdfActual) return;

    try {
        const page = await pdfActual.pdfDoc.getPage(paginaActual);

        const canvas = document.getElementById('lpVisCanvas');
        const ctx = canvas.getContext('2d');
        const wrap = document.getElementById('lpVisCanvasWrap');

        // 1. Ancho disponible del wrapper (descontando padding)
        const wrapAncho = wrap.clientWidth - 40;
        if (wrapAncho <= 0) return;

        // 2. Viewport base a escala 1
        const baseViewport = page.getViewport({ scale: 1 });

        // 3. Ancho final = ancho del wrapper × zoom
        const anchoFinal = wrapAncho * zoomActual;

        // 4. Cap de seguridad
        const capAncho = 4000;
        const escalaFinal = Math.min(anchoFinal, capAncho) / baseViewport.width;

        const viewport = page.getViewport({ scale: escalaFinal });

        // 5. DPR para nitidez
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width  = viewport.width  * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width  = viewport.width  + 'px';
        canvas.style.height = viewport.height + 'px';

        // 6. Render
        if (renderTaskActual) {
            try { renderTaskActual.cancel(); } catch (e) {}
        }
        renderTaskActual = page.render({
            canvasContext: ctx,
            viewport,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null
        });
        await renderTaskActual.promise;
        renderTaskActual = null;

        // 7. UI
        document.getElementById('lpVisPagActual').value = String(paginaActual);
        document.getElementById('lpVisZoomNivel').textContent = Math.round(zoomActual * 100) + '%';
        document.getElementById('lpVisPrev').disabled = paginaActual <= 1;
        document.getElementById('lpVisNext').disabled = paginaActual >= pdfActual.paginas;

        // 8. Reset scroll al cambiar de página
        if (wrap.scrollTop > 0 || wrap.scrollLeft > 0) {
            wrap.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        console.warn('[LectorPDF] Error render:', e);
    }
}

function cambiarPagina(nueva) {
    if (!pdfActual) return;
    nueva = Math.max(1, Math.min(nueva, pdfActual.paginas));
    if (nueva === paginaActual) return;
    paginaActual = nueva;
    renderPagina();
}

function cambiarZoom(dir) {
    const i = ZOOMS.indexOf(zoomActual);
    let nuevo = zoomActual;
    if (i === -1) {
        nuevo = ZOOMS.reduce((prev, curr) =>
            Math.abs(curr - zoomActual) < Math.abs(prev - zoomActual) ? curr : prev
        );
    } else {
        const j = Math.max(0, Math.min(ZOOMS.length - 1, i + dir));
        nuevo = ZOOMS[j];
    }
    if (nuevo === zoomActual) return;
    zoomActual = nuevo;
    renderPagina();
}

// ============================================================
//  VISOR — loading
// ============================================================
function mostrarCargandoVisor(texto) {
    const el = document.getElementById('lpVisCargando');
    const txt = document.getElementById('lpVisCargandoTxt');
    if (el) el.hidden = false;
    if (txt) txt.textContent = texto || 'Cargando...';
}

function ocultarCargandoVisor() {
    const el = document.getElementById('lpVisCargando');
    if (el) el.hidden = true;
}

// ============================================================
//  VISOR — buscar (premium)
// ============================================================
async function abrirBuscar() {
    if (!premium) {
        abrirModalPremium();
        return;
    }
    const panel = document.getElementById('lpVisBuscarPanel');
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
        setTimeout(() => document.getElementById('lpVisBuscarInput')?.focus(), 80);
    }
}

let buscarTimeout = null;

async function buscarEnPDF(query) {
    if (!pdfActual || !query) {
        buscarResultados = [];
        renderBuscarResultados();
        return;
    }

    const q = query.toLowerCase();
    mostrarCargandoVisor('Buscando...');

    buscarResultados = [];

    try {
        for (let i = 1; i <= pdfActual.paginas; i++) {
            const page = await pdfActual.pdfDoc.getPage(i);
            const textContent = await page.getTextContent();
            const texto = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ');
            const lower = texto.toLowerCase();
            let idx = 0;
            let contador = 0;
            while ((idx = lower.indexOf(q, idx)) !== -1 && contador < 3) {
                const ini = Math.max(0, idx - 30);
                const fin = Math.min(texto.length, idx + query.length + 40);
                let snippet = texto.slice(ini, fin);
                if (ini > 0) snippet = '…' + snippet;
                if (fin < texto.length) snippet = snippet + '…';
                buscarResultados.push({
                    pagina: i,
                    snippet: snippet.replace(/[<>]/g, '')
                });
                idx += q.length;
                contador++;
            }
        }
    } catch (e) {
        console.warn('[LectorPDF] Error buscando:', e);
    }

    ocultarCargandoVisor();
    renderBuscarResultados();
}

function renderBuscarResultados() {
    const cont = document.getElementById('lpVisBuscarResultados');
    if (!cont) return;

    if (buscarResultados.length === 0) {
        cont.innerHTML = '<p class="lp-vis-buscar-ayuda">Sin resultados.</p>';
        return;
    }

    cont.innerHTML = buscarResultados.map((r, i) => `
        <button class="lp-vis-buscar-item" data-pagina="${r.pagina}">
            <strong>Pág. ${r.pagina}</strong>
            ${escaparHTML(r.snippet)}
        </button>
    `).join('');

    cont.querySelectorAll('.lp-vis-buscar-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const pagina = parseInt(btn.dataset.pagina, 10);
            if (!isNaN(pagina)) cambiarPagina(pagina);
        });
    });
}

// ============================================================
//  VISOR — marcador (premium)
// ============================================================
async function marcarPagina() {
    if (!premium) {
        abrirModalPremium();
        return;
    }
    if (!pdfActual) return;
    await guardarUltimaPagina(pdfActual.id, paginaActual);
    toast(`Página ${paginaActual} guardada`, 'success');
}

// ============================================================
//  VISOR — exportar (premium)
// ============================================================
async function exportarPDF(id) {
    if (!premium) {
        abrirModalPremium();
        return;
    }
    const record = await idbGet(id);
    if (!record) return;
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = record.nombre + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('PDF exportado', 'success');
}

// ============================================================
//  BORRAR / RENOMBRAR
// ============================================================
let idParaBorrar = null;
let idParaRenombrar = null;

function abrirModalBorrar(id) {
    const p = pdfs.find(x => x.id === id);
    if (!p) return;
    idParaBorrar = id;
    document.getElementById('lpBorrarNombre').textContent = p.nombre;
    document.getElementById('lpModalBorrar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarBorrar() {
    if (!idParaBorrar) return;
    await idbDelete(idParaBorrar);
    idParaBorrar = null;
    document.getElementById('lpModalBorrar').hidden = true;
    await cargarBiblioteca();
    renderBiblioteca();
    toast('PDF eliminado', 'success');
}

function abrirModalRenombrar(id) {
    const p = pdfs.find(x => x.id === id);
    if (!p) return;
    idParaRenombrar = id;
    const input = document.getElementById('lpRenombrarInput');
    input.value = p.nombre;
    document.getElementById('lpModalRenombrar').hidden = false;
    setTimeout(() => { input.focus(); input.select(); }, 80);
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarRenombrar() {
    if (!idParaRenombrar) return;
    const input = document.getElementById('lpRenombrarInput');
    const nuevo = (input.value || '').trim();
    if (!nuevo) {
        toast('Escribí un nombre', 'error');
        return;
    }
    const record = await idbGet(idParaRenombrar);
    if (!record) return;
    record.nombre = nuevo.slice(0, 80);
    await idbPut(record);
    idParaRenombrar = null;
    document.getElementById('lpModalRenombrar').hidden = true;
    await cargarBiblioteca();
    renderBiblioteca();
    toast('Nombre actualizado', 'success');
}

// ============================================================
//  MODAL PREMIUM
// ============================================================
function abrirModalPremium() {
    if (premium) {
        toast('Ya tenés premium activo', 'info');
        return;
    }
    document.getElementById('lpModalPremium').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalPremium() {
    document.getElementById('lpModalPremium').hidden = true;
}

async function confirmarPremium() {
    const api = API();
    if (!api || typeof api.gastoBoleta !== 'function') {
        toast('Sin conexión al sistema', 'error');
        return;
    }

    const btn = document.getElementById('lpModalConfirmar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        await api.gastoBoleta('crown', 'lector-pdf', 'Lector PDF Premium', COSTO_PREMIUM);
        await guardarPremium();
        premium = true;
        actualizarUIPremium();
        cerrarModalPremium();
        toast('¡Premium desbloqueado!', 'success');
        renderBiblioteca();
    } catch (e) {
        toast(e.message || 'No se pudo completar', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {

    // Añadir PDF
    const fileInput = document.getElementById('lpFileInput');
    document.getElementById('lpBtnAñadir')?.addEventListener('click', () => fileInput.click());
    document.getElementById('lpVacioBtn')?.addEventListener('click', () => fileInput.click());
    fileInput?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        fileInput.value = '';
        if (file) await añadirPDF(file);
    });

    // Drag & drop
    const dropZona = document.getElementById('lpDropZona');
    if (dropZona) {
        dropZona.addEventListener('dragenter', (e) => {
            e.preventDefault();
            dropContador++;
            dropZona.classList.add('arrastrando');
        });
        dropZona.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        dropZona.addEventListener('dragleave', (e) => {
            dropContador = Math.max(0, dropContador - 1);
            if (dropContador === 0) dropZona.classList.remove('arrastrando');
        });
        dropZona.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropContador = 0;
            dropZona.classList.remove('arrastrando');
            const files = Array.from(e.dataTransfer.files || []);
            for (const f of files) {
                if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
                    await añadirPDF(f);
                }
            }
        });
    }

    // Lista — delegación
    document.getElementById('lpLista')?.addEventListener('click', (e) => {
        const accionBtn = e.target.closest('[data-accion]');
        if (accionBtn) {
            e.stopPropagation();
            const accion = accionBtn.dataset.accion;
            const id = accionBtn.dataset.id;
            if (accion === 'borrar') abrirModalBorrar(id);
            if (accion === 'renombrar') abrirModalRenombrar(id);
            if (accion === 'exportar') exportarPDF(id);
            if (accion === 'exportar-premium') abrirModalPremium();
            return;
        }
        const card = e.target.closest('.lp-card');
        if (card) abrirVisor(card.dataset.id);
    });

    // Visor — header
    document.getElementById('lpVisVolver')?.addEventListener('click', cerrarVisor);
    document.getElementById('lpVisBtnBuscar')?.addEventListener('click', abrirBuscar);
    document.getElementById('lpVisBtnMarcador')?.addEventListener('click', marcarPagina);
    document.getElementById('lpVisBtnExportar')?.addEventListener('click', () => {
        if (pdfActual) exportarPDF(pdfActual.id);
    });

    // Visor — navegación
    document.getElementById('lpVisPrev')?.addEventListener('click', () => cambiarPagina(paginaActual - 1));
    document.getElementById('lpVisNext')?.addEventListener('click', () => cambiarPagina(paginaActual + 1));
    document.getElementById('lpVisPagActual')?.addEventListener('change', (e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n)) cambiarPagina(n);
    });

    // Visor — zoom
    document.getElementById('lpVisZoomIn')?.addEventListener('click', () => cambiarZoom(1));
    document.getElementById('lpVisZoomOut')?.addEventListener('click', () => cambiarZoom(-1));

    // Visor — buscar
    const buscarInput = document.getElementById('lpVisBuscarInput');
    buscarInput?.addEventListener('input', (e) => {
        clearTimeout(buscarTimeout);
        const q = e.target.value.trim();
        buscarTimeout = setTimeout(() => buscarEnPDF(q), 400);
    });
    document.getElementById('lpVisBuscarCerrar')?.addEventListener('click', () => {
        document.getElementById('lpVisBuscarPanel').hidden = true;
    });

    // Modal premium
    document.getElementById('lpModalCancelar')?.addEventListener('click', cerrarModalPremium);
    document.getElementById('lpModalConfirmar')?.addEventListener('click', confirmarPremium);
    document.getElementById('lpModalPremium')?.addEventListener('click', (e) => {
        if (e.target.id === 'lpModalPremium') cerrarModalPremium();
    });
    document.getElementById('lpBtnPremium')?.addEventListener('click', () => {
        if (premium) {
            toast('Ya tenés premium activo', 'info');
        } else {
            abrirModalPremium();
        }
    });

    // Modal borrar
    document.getElementById('lpModalBorrarCancelar')?.addEventListener('click', () => {
        idParaBorrar = null;
        document.getElementById('lpModalBorrar').hidden = true;
    });
    document.getElementById('lpModalBorrarConfirmar')?.addEventListener('click', confirmarBorrar);
    document.getElementById('lpModalBorrar')?.addEventListener('click', (e) => {
        if (e.target.id === 'lpModalBorrar') {
            idParaBorrar = null;
            document.getElementById('lpModalBorrar').hidden = true;
        }
    });

    // Modal renombrar
    document.getElementById('lpModalRenombrarCancelar')?.addEventListener('click', () => {
        idParaRenombrar = null;
        document.getElementById('lpModalRenombrar').hidden = true;
    });
    document.getElementById('lpModalRenombrarConfirmar')?.addEventListener('click', confirmarRenombrar);
    document.getElementById('lpModalRenombrar')?.addEventListener('click', (e) => {
        if (e.target.id === 'lpModalRenombrar') {
            idParaRenombrar = null;
            document.getElementById('lpModalRenombrar').hidden = true;
        }
    });
    document.getElementById('lpRenombrarInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmarRenombrar();
        if (e.key === 'Escape') {
            idParaRenombrar = null;
            document.getElementById('lpModalRenombrar').hidden = true;
        }
    });

    // Atajos de teclado en el visor
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('lpVistaVisor').hidden) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') cambiarPagina(paginaActual - 1);
        if (e.key === 'ArrowRight' || e.key === 'PageDown') cambiarPagina(paginaActual + 1);
        if (e.key === '+' || e.key === '=') cambiarZoom(1);
        if (e.key === '-') cambiarZoom(-1);
        if (e.key === 'Escape') {
            if (!document.getElementById('lpVisBuscarPanel').hidden) {
                document.getElementById('lpVisBuscarPanel').hidden = true;
            } else {
                cerrarVisor();
            }
        }
    });

    // Escape en biblioteca
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('lpVistaVisor').hidden === false) return;
        if (!document.getElementById('lpModalPremium').hidden) cerrarModalPremium();
        if (!document.getElementById('lpModalBorrar').hidden) {
            idParaBorrar = null;
            document.getElementById('lpModalBorrar').hidden = true;
        }
        if (!document.getElementById('lpModalRenombrar').hidden) {
            idParaRenombrar = null;
            document.getElementById('lpModalRenombrar').hidden = true;
        }
    });

    // Resize — re-render para ajustar ancho
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (document.getElementById('lpVistaVisor').hidden) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => renderPagina(), 150);
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Lector PDF necesita estar dentro de VicWebOs.');
        return;
    }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión para usar Lector PDF.');
        return;
    }

    const badge = document.getElementById('lpUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarPremium();
    actualizarUIPremium();

    await cargarBiblioteca();
    renderBiblioteca();
    inicializarEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
