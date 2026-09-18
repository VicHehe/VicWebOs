// ============================================================
//  Widget: Acceso Directo
//  4 slots con icono, nombre y URL.
//  Persistencia POR USUARIO en:
//      app/acceso-directo/{codigo}acceso-directo.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/acceso-directo/';
const MAX_SLOTS = 4;

let slots = [null, null, null, null];   // cada slot: { nombre, url, imagenId } o null
let slotEditando = null;                // índice 0-3
let imagenIdPendiente = null;
let urlsActivas = [];

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
//  Ruta por usuario
// ------------------------------------------------------------
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'acceso-directo.json';
}

// ------------------------------------------------------------
//  Cargar / guardar
// ------------------------------------------------------------
async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && Array.isArray(data.slots)) {
            for (let i = 0; i < MAX_SLOTS; i++) {
                const s = data.slots[i];
                if (s && s.nombre && s.url) {
                    slots[i] = {
                        nombre: String(s.nombre).slice(0, 40),
                        url: String(s.url),
                        imagenId: s.imagenId || null
                    };
                } else {
                    slots[i] = null;
                }
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
        console.warn('[AccesoDirecto] No se pudo guardar:', e);
    }
}

// ------------------------------------------------------------
//  Normalizar URL
// ------------------------------------------------------------
function normalizarUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return 'https://' + u;
}

// ------------------------------------------------------------
//  Render de la grid
// ------------------------------------------------------------
function render() {
    const grid = document.getElementById('adGrid');
    if (!grid) return;

    urlsActivas.forEach(u => URL.revokeObjectURL(u));
    urlsActivas = [];

    grid.innerHTML = '';

    slots.forEach((slot, idx) => {
        const div = document.createElement('div');
        div.className = 'ad-slot' + (slot ? '' : ' vacio');
        div.dataset.idx = String(idx);

        if (slot) {
            div.innerHTML = `
                <div class="ad-slot-icono" data-icono-idx="${idx}">
                    <i data-lucide="link"></i>
                </div>
                <span class="ad-slot-nombre">${escapar(slot.nombre)}</span>
                <button class="ad-slot-edit" title="Editar"><i data-lucide="pencil"></i></button>
            `;
        } else {
            div.innerHTML = `
                <div class="ad-slot-icono"><i data-lucide="plus"></i></div>
                <span class="ad-slot-nombre">Añadir</span>
            `;
        }

        grid.appendChild(div);

        // Click en el slot
        div.addEventListener('click', (e) => {
            // Si el click fue en el botón editar → editar
            if (e.target.closest('.ad-slot-edit')) {
                e.stopPropagation();
                abrirModal(idx);
                return;
            }
            // Si está vacío → abrir modal
            if (!slot) {
                abrirModal(idx);
                return;
            }
            // Si tiene datos → abrir URL
            try {
                window.open(slot.url, '_blank', 'noopener,noreferrer');
            } catch (e) {
                console.warn('[AccesoDirecto] No se pudo abrir:', e);
            }
        });

        // Cargar imagen si tiene
        if (slot && slot.imagenId) {
            cargarIcono(idx);
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

async function cargarIcono(idx) {
    const slot = slots[idx];
    if (!slot || !slot.imagenId) return;
    const cont = document.querySelector(`.ad-slot-icono[data-icono-idx="${idx}"]`);
    if (!cont) return;

    try {
        const mh = MH();
        const url = await mh.galeria.leerImagenURL(slot.imagenId);
        if (!url) return;
        urlsActivas.push(url);
        cont.innerHTML = `<img src="${url}" alt="">`;
    } catch (e) {
        console.warn('[AccesoDirecto] No se pudo cargar icono:', e);
    }
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------
//  Modal de edición
// ------------------------------------------------------------
function abrirModal(idx) {
    slotEditando = idx;
    const slot = slots[idx];

    document.getElementById('adModalTitulo').textContent = slot
        ? 'Editar acceso'
        : 'Nuevo acceso';

    document.getElementById('adNombre').value = slot ? slot.nombre : '';
    document.getElementById('adUrl').value = slot ? slot.url : '';
    imagenIdPendiente = slot ? (slot.imagenId || null) : null;

    const btnEliminar = document.getElementById('adBtnEliminar');
    if (btnEliminar) btnEliminar.hidden = !slot;

    actualizarPreviewIcono();
    document.getElementById('adModal').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('adNombre').focus(), 100);
}

function cerrarModal() {
    document.getElementById('adModal').hidden = true;
    slotEditando = null;
    imagenIdPendiente = null;
}

async function actualizarPreviewIcono() {
    const preview = document.getElementById('adIconPreview');
    const btnQuitar = document.getElementById('adBtnQuitarIcono');
    if (!preview) return;

    if (!imagenIdPendiente) {
        preview.innerHTML = '<i data-lucide="image"></i>';
        if (btnQuitar) btnQuitar.hidden = true;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    if (btnQuitar) btnQuitar.hidden = false;
    preview.innerHTML = '<i data-lucide="image"></i>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const mh = MH();
        const url = await mh.galeria.leerImagenURL(imagenIdPendiente);
        if (url) {
            preview.innerHTML = `<img src="${url}" alt="">`;
            preview.querySelector('img').onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[AccesoDirecto] Preview falló:', e);
    }
}

async function elegirIcono() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige un icono'
        });
        if (!id) return;
        imagenIdPendiente = id;
        actualizarPreviewIcono();
    } catch (e) {
        console.warn('[AccesoDirecto] Error picker:', e);
    }
}

async function guardarSlot() {
    if (slotEditando === null) return;

    const nombre = document.getElementById('adNombre').value.trim();
    const urlRaw = document.getElementById('adUrl').value.trim();

    if (!nombre) {
        alert('Escribe un nombre.');
        return;
    }
    if (!urlRaw) {
        alert('Escribe una URL.');
        return;
    }

    const url = normalizarUrl(urlRaw);

    slots[slotEditando] = {
        nombre,
        url,
        imagenId: imagenIdPendiente || null
    };

    await guardar();
    cerrarModal();
    render();
}

async function eliminarSlot() {
    if (slotEditando === null) return;
    if (!confirm('¿Eliminar este acceso directo?')) return;
    slots[slotEditando] = null;
    await guardar();
    cerrarModal();
    render();
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    await cargar();
    render();

    document.getElementById('adModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('adBtnCancelar')?.addEventListener('click', cerrarModal);
    document.getElementById('adBtnGuardar')?.addEventListener('click', guardarSlot);
    document.getElementById('adBtnEliminar')?.addEventListener('click', eliminarSlot);
    document.getElementById('adBtnElegirIcono')?.addEventListener('click', elegirIcono);
    document.getElementById('adBtnQuitarIcono')?.addEventListener('click', () => {
        imagenIdPendiente = null;
        actualizarPreviewIcono();
    });

    document.getElementById('adModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'adModal') cerrarModal();
    });

    document.getElementById('adUrl')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guardarSlot();
    });

    if (window.lucide) window.lucide.createIcons();
});

window.addEventListener('unload', () => {
    urlsActivas.forEach(u => URL.revokeObjectURL(u));
});
