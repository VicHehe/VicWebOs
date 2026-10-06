// ============================================================
//  Widget: Mini Moodboard
//  Collage 2x2 con 4 imágenes de la galería.
//  Persistencia POR USUARIO en:
//      app/mini-moodboard/{codigo}mini-moodboard.json
// ============================================================
'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/mini-moodboard/';
const MAX_SLOTS = 4;

let slots = [null, null, null, null]; // cada slot: imagenId o null
let urlsActivas = [];

const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;
const BD  = () => window.parent.ConfigBD || null;

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
//  RUTA Y PERSISTENCIA
// ============================================================
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'mini-moodboard.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && Array.isArray(data.slots)) {
            for (let i = 0; i < MAX_SLOTS; i++) {
                slots[i] = data.slots[i] || null;
            }
        }
    } catch (e) { /* no existe */ }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            slots: slots,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[MiniMoodboard] No se pudo guardar:', e);
    }
}

// ============================================================
//  RENDER DEL GRID
// ============================================================
async function render() {
    const grid = document.getElementById('mbGrid');
    if (!grid) return;

    // Limpiar URLs antiguas
    urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
    urlsActivas = [];
    grid.innerHTML = '';

    for (let i = 0; i < MAX_SLOTS; i++) {
        const slot = slots[i];
        const div = document.createElement('div');
        div.className = 'mb-slot' + (slot ? '' : ' vacio');
        div.dataset.idx = String(i);

        if (slot) {
            div.innerHTML = '<div class="mb-slot-cargando"></div>';
            grid.appendChild(div);
            await cargarImagen(i, div);
        } else {
            div.innerHTML = `
                <i data-lucide="plus"></i>
                <span>Añadir</span>
            `;
            grid.appendChild(div);
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

async function cargarImagen(idx, container) {
    const imagenId = slots[idx];
    if (!imagenId) return;

    try {
        const mh = MH();
        const url = await mh.galeria.leerImagenURL(imagenId);
        if (!url) {
            container.classList.add('vacio');
            container.innerHTML = `
                <i data-lucide="image-off"></i>
                <span>Error</span>
            `;
            return;
        }
        urlsActivas.push(url);
        container.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
        container.querySelector('img').onload = () => {
            try { URL.revokeObjectURL(url); } catch(e){}
        };
    } catch (e) {
        console.warn('[MiniMoodboard] Error cargando imagen:', e);
        container.classList.add('vacio');
        container.innerHTML = `
            <i data-lucide="image-off"></i>
            <span>Error</span>
        `;
    }
}

// ============================================================
//  MODAL DE EDICIÓN
// ============================================================
function abrirModal() {
    const modal = document.getElementById('mbModal');
    const body = document.getElementById('mbModalBody');
    if (!modal || !body) return;

    body.innerHTML = '';

    for (let i = 0; i < MAX_SLOTS; i++) {
        const slot = slots[i];
        const row = document.createElement('div');
        row.className = 'mb-slot-row';
        row.dataset.idx = String(i);

        const previewHTML = slot
            ? '<div class="mb-slot-preview" data-preview="' + i + '"><i data-lucide="image"></i></div>'
            : '<div class="mb-slot-preview"><i data-lucide="image"></i></div>';

        const infoHTML = `
            <div class="mb-slot-info">
                <strong>Slot ${i + 1}</strong>
                <small>${slot ? 'Imagen asignada' : 'Vacío'}</small>
            </div>
        `;

        let accionesHTML = '';
        if (slot) {
            accionesHTML = `
                <div class="mb-slot-acciones">
                    <button class="mb-btn-mini mb-btn-mini-sec" data-action="cambiar" data-idx="${i}">
                        <i data-lucide="refresh-cw"></i>
                        Cambiar
                    </button>
                    <button class="mb-btn-mini mb-btn-mini-peligro" data-action="quitar" data-idx="${i}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `;
        } else {
            accionesHTML = `
                <div class="mb-slot-acciones">
                    <button class="mb-btn-mini mb-btn-mini-pri" data-action="elegir" data-idx="${i}">
                        <i data-lucide="plus"></i>
                        Elegir
                    </button>
                </div>
            `;
        }

        row.innerHTML = previewHTML + infoHTML + accionesHTML;
        body.appendChild(row);

        // Cargar preview si tiene imagen
        if (slot) {
            cargarPreview(i);
        }
    }

    // Wire up botones
    body.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const action = btn.dataset.action;
            const idx = parseInt(btn.dataset.idx, 10);
            await handleAccion(action, idx);
        });
    });

    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function cargarPreview(idx) {
    const imagenId = slots[idx];
    if (!imagenId) return;
    const preview = document.querySelector(`[data-preview="${idx}"]`);
    if (!preview) return;

    try {
        const mh = MH();
        const url = await mh.galeria.leerImagenURL(imagenId);
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="">`;
            preview.querySelector('img').onload = () => {
                try { URL.revokeObjectURL(url); } catch(e){}
            };
        }
    } catch (e) { /* silencioso */ }
}

async function handleAccion(action, idx) {
    const mh = MH();
    if (!mh) return;

    if (action === 'elegir' || action === 'cambiar') {
        try {
            const id = await mh.galeria.abrirPicker({
                multiple: false,
                titulo: `Elige imagen para Slot ${idx + 1}`
            });
            if (id) {
                slots[idx] = id;
                await guardar();
                abrirModal(); // Refrescar modal
                await render(); // Refrescar grid
            }
        } catch (e) {
            console.warn('[MiniMoodboard] Error picker:', e);
        }
    } else if (action === 'quitar') {
        if (!confirm(`¿Quitar la imagen del Slot ${idx + 1}?`)) return;
        slots[idx] = null;
        await guardar();
        abrirModal();
        await render();
    }
}

function cerrarModal() {
    const modal = document.getElementById('mbModal');
    if (modal) modal.hidden = true;
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    document.getElementById('mbBtnEditar')?.addEventListener('click', abrirModal);
    document.getElementById('mbModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('mbModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'mbModal') cerrarModal();
    });

    await cargar();
    await render();

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('unload', () => {
    urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch(e){} });
});
