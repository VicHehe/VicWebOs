// ============================================================
//  Widget: Reloj Mundial
//  - Hasta 4 zonas horarias configurables por el usuario
//  - Compatible con todos los temas (lee variables del padre)
//  - Datos por usuario en:
//      vicwebos-data/app/reloj-mundial/{codigo}reloj-mundial.json
// ============================================================

const MAX_ZONAS = 4;
const ARCHIVO = 'app/reloj-mundial/';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let zonas = [];

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  TEMA: heredar variables CSS del padre (Regla 6)
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
            '--accent-shadow','--accent-shadow-hover',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {
        // iframe cross-origin o padre aún no listo → usar fallbacks del CSS
    }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  HORA
// ============================================================
function formatearHora(zona) {
    try {
        return new Date().toLocaleTimeString('es-CL', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: zona
        });
    } catch (e) {
        return '--:--';
    }
}

function nombreBonito(zona) {
    // 'America/Santiago'             → 'Santiago'
    // 'America/Argentina/Buenos_Aires' → 'Buenos Aires'
    const partes = zona.split('/');
    return partes[partes.length - 1].replace(/_/g, ' ');
}

// ============================================================
//  DATOS (por usuario)
// ============================================================
function rutaArchivoUsuario() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'reloj-mundial.json';
}

async function cargarZonas() {
    const bd = BD();
    const ruta = rutaArchivoUsuario();
    if (!bd || !ruta) return [];

    try {
        const data = await bd.leerArchivo(ruta);
        if (data && Array.isArray(data.zonas)) {
            return data.zonas.slice(0, MAX_ZONAS);
        }
    } catch (e) {
        console.warn('No se pudieron leer las zonas:', e);
    }
    return [];
}

async function guardarZonas() {
    const bd = BD();
    const ruta = rutaArchivoUsuario();
    if (!bd || !ruta) return;

    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            actualizado: new Date().toISOString(),
            zonas: zonas
        });
    } catch (e) {
        console.warn('No se pudieron guardar las zonas:', e);
    }
}

// ============================================================
//  RENDER
// ============================================================
function render() {
    const cont = document.getElementById('rmLista');
    const btnAdd = document.getElementById('rmAddBtn');
    if (!cont) return;

    if (zonas.length === 0) {
        cont.innerHTML = `
            <div class="rm-vacio">
                <i data-lucide="globe-2"></i>
                <p>Sin zonas. Pulsa <strong>+</strong> para añadir.</p>
            </div>`;
    } else {
        cont.innerHTML = zonas.map(z => `
            <div class="rm-item" data-zona="${z}">
                <span class="rm-ciudad">${nombreBonito(z)}</span>
                <div class="rm-acciones">
                    <span class="rm-hora" data-zona="${z}">${formatearHora(z)}</span>
                    <button class="rm-remove" data-zona="${z}" title="Quitar">
                        <i data-lucide="x"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    if (btnAdd) {
        btnAdd.disabled = zonas.length >= MAX_ZONAS;
        btnAdd.title = zonas.length >= MAX_ZONAS
            ? 'Máximo ' + MAX_ZONAS + ' zonas'
            : 'Añadir zona horaria';
    }

    lucide.createIcons();
}

function tick() {
    document.querySelectorAll('.rm-hora').forEach(el => {
        const zona = el.dataset.zona;
        if (zona) el.textContent = formatearHora(zona);
    });
}

// ============================================================
//  MODAL: añadir zona
// ============================================================
function poblarSelect() {
    const sel = document.getElementById('rmZonaSelect');
    if (!sel) return;

    let disponibles = [];
    try {
        disponibles = Intl.supportedValuesOf('timeZone');
    } catch (e) {
        disponibles = [
            'America/Santiago', 'America/Tijuana', 'America/New_York',
            'America/Los_Angeles', 'America/Mexico_City', 'America/Sao_Paulo',
            'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'Europe/Moscow',
            'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata',
            'Australia/Sydney', 'Pacific/Auckland', 'Africa/Cairo'
        ];
    }

    disponibles = disponibles
        .filter(z => !zonas.includes(z))
        .sort((a, b) => nombreBonito(a).localeCompare(nombreBonito(b)));

    sel.innerHTML = disponibles.map(z => `
        <option value="${z}">${nombreBonito(z)} — ${z.split('/')[0]}</option>
    `).join('');
}

function abrirModal() {
    if (zonas.length >= MAX_ZONAS) return;
    poblarSelect();
    const modal = document.getElementById('rmModal');
    if (modal) modal.hidden = false;
}

function cerrarModal() {
    const modal = document.getElementById('rmModal');
    if (modal) modal.hidden = true;
}

async function confirmarZona() {
    const sel = document.getElementById('rmZonaSelect');
    if (!sel || !sel.value) { cerrarModal(); return; }
    if (zonas.includes(sel.value)) { cerrarModal(); return; }
    if (zonas.length >= MAX_ZONAS) { cerrarModal(); return; }

    zonas.push(sel.value);
    cerrarModal();
    render();
    await guardarZonas();
}

async function quitarZona(zona) {
    zonas = zonas.filter(z => z !== zona);
    render();
    await guardarZonas();
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    zonas = await cargarZonas();
    render();

    document.getElementById('rmAddBtn')?.addEventListener('click', abrirModal);
    document.getElementById('rmCancelar')?.addEventListener('click', cerrarModal);
    document.getElementById('rmConfirmar')?.addEventListener('click', confirmarZona);

    document.getElementById('rmModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'rmModal') cerrarModal();
    });

    document.getElementById('rmLista')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.rm-remove');
        if (btn) quitarZona(btn.dataset.zona);
    });

    setInterval(tick, 1000);
});
