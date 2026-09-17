// ============================================================
//  Widget: Reloj Mundial
//  - Hasta 4 zonas horarias configurables por el usuario
//  - Lista curada de países (con bandera), agrupada por continente
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
//  PAÍSES CURADOS — agrupados por continente
// ============================================================
const PAISES = {
    '🌎 América': [
        { bandera: '🇦🇷', nombre: 'Argentina',        zona: 'America/Argentina/Buenos_Aires' },
        { bandera: '🇧🇴', nombre: 'Bolivia',          zona: 'America/La_Paz' },
        { bandera: '🇧🇷', nombre: 'Brasil (São Paulo)', zona: 'America/Sao_Paulo' },
        { bandera: '🇨🇦', nombre: 'Canadá (Toronto)', zona: 'America/Toronto' },
        { bandera: '🇨🇱', nombre: 'Chile',            zona: 'America/Santiago' },
        { bandera: '🇨🇴', nombre: 'Colombia',         zona: 'America/Bogota' },
        { bandera: '🇨🇷', nombre: 'Costa Rica',       zona: 'America/Costa_Rica' },
        { bandera: '🇨🇺', nombre: 'Cuba',             zona: 'America/Havana' },
        { bandera: '🇪🇨', nombre: 'Ecuador',          zona: 'America/Guayaquil' },
        { bandera: '🇺🇸', nombre: 'EE.UU. (Nueva York)', zona: 'America/New_York' },
        { bandera: '🇺🇸', nombre: 'EE.UU. (Los Ángeles)', zona: 'America/Los_Angeles' },
        { bandera: '🇺🇸', nombre: 'EE.UU. (Chicago)', zona: 'America/Chicago' },
        { bandera: '🇬🇹', nombre: 'Guatemala',        zona: 'America/Guatemala' },
        { bandera: '🇭🇳', nombre: 'Honduras',         zona: 'America/Tegucigalpa' },
        { bandera: '🇲🇽', nombre: 'México (CDMX)',    zona: 'America/Mexico_City' },
        { bandera: '🇲🇽', nombre: 'México (Tijuana)', zona: 'America/Tijuana' },
        { bandera: '🇳🇮', nombre: 'Nicaragua',        zona: 'America/Managua' },
        { bandera: '🇵🇦', nombre: 'Panamá',           zona: 'America/Panama' },
        { bandera: '🇵🇾', nombre: 'Paraguay',         zona: 'America/Asuncion' },
        { bandera: '🇵🇪', nombre: 'Perú',             zona: 'America/Lima' },
        { bandera: '🇵🇷', nombre: 'Puerto Rico',      zona: 'America/Puerto_Rico' },
        { bandera: '🇩🇴', nombre: 'Rep. Dominicana',  zona: 'America/Santo_Domingo' },
        { bandera: '🇸🇻', nombre: 'El Salvador',      zona: 'America/El_Salvador' },
        { bandera: '🇺🇾', nombre: 'Uruguay',          zona: 'America/Montevideo' },
        { bandera: '🇻🇪', nombre: 'Venezuela',        zona: 'America/Caracas' }
    ],
    '🌍 Europa': [
        { bandera: '🇩🇪', nombre: 'Alemania',         zona: 'Europe/Berlin' },
        { bandera: '🇦🇹', nombre: 'Austria',          zona: 'Europe/Vienna' },
        { bandera: '🇧🇪', nombre: 'Bélgica',          zona: 'Europe/Brussels' },
        { bandera: '🇩🇰', nombre: 'Dinamarca',        zona: 'Europe/Copenhagen' },
        { bandera: '🇪🇸', nombre: 'España',           zona: 'Europe/Madrid' },
        { bandera: '🇫🇮', nombre: 'Finlandia',        zona: 'Europe/Helsinki' },
        { bandera: '🇫🇷', nombre: 'Francia',          zona: 'Europe/Paris' },
        { bandera: '🇬🇷', nombre: 'Grecia',           zona: 'Europe/Athens' },
        { bandera: '🇮🇪', nombre: 'Irlanda',          zona: 'Europe/Dublin' },
        { bandera: '🇮🇹', nombre: 'Italia',           zona: 'Europe/Rome' },
        { bandera: '🇳🇱', nombre: 'Países Bajos',     zona: 'Europe/Amsterdam' },
        { bandera: '🇵🇱', nombre: 'Polonia',          zona: 'Europe/Warsaw' },
        { bandera: '🇵🇹', nombre: 'Portugal',         zona: 'Europe/Lisbon' },
        { bandera: '🇬🇧', nombre: 'Reino Unido',      zona: 'Europe/London' },
        { bandera: '🇨🇿', nombre: 'Rep. Checa',       zona: 'Europe/Prague' },
        { bandera: '🇷🇺', nombre: 'Rusia (Moscú)',    zona: 'Europe/Moscow' },
        { bandera: '🇸🇪', nombre: 'Suecia',           zona: 'Europe/Stockholm' },
        { bandera: '🇨🇭', nombre: 'Suiza',            zona: 'Europe/Zurich' },
        { bandera: '🇺🇦', nombre: 'Ucrania',          zona: 'Europe/Kyiv' }
    ],
    '🌏 Asia': [
        { bandera: '🇸🇦', nombre: 'Arabia Saudita',   zona: 'Asia/Riyadh' },
        { bandera: '🇨🇳', nombre: 'China',            zona: 'Asia/Shanghai' },
        { bandera: '🇰🇷', nombre: 'Corea del Sur',    zona: 'Asia/Seoul' },
        { bandera: '🇦🇪', nombre: 'Emiratos Árabes',  zona: 'Asia/Dubai' },
        { bandera: '🇮🇳', nombre: 'India',            zona: 'Asia/Kolkata' },
        { bandera: '🇮🇩', nombre: 'Indonesia',        zona: 'Asia/Jakarta' },
        { bandera: '🇮🇱', nombre: 'Israel',           zona: 'Asia/Jerusalem' },
        { bandera: '🇯🇵', nombre: 'Japón',            zona: 'Asia/Tokyo' },
        { bandera: '🇲🇾', nombre: 'Malasia',          zona: 'Asia/Kuala_Lumpur' },
        { bandera: '🇵🇭', nombre: 'Filipinas',        zona: 'Asia/Manila' },
        { bandera: '🇸🇬', nombre: 'Singapur',         zona: 'Asia/Singapore' },
        { bandera: '🇹🇭', nombre: 'Tailandia',        zona: 'Asia/Bangkok' },
        { bandera: '🇹🇷', nombre: 'Turquía',          zona: 'Europe/Istanbul' },
        { bandera: '🇻🇳', nombre: 'Vietnam',          zona: 'Asia/Ho_Chi_Minh' }
    ],
    '🌍 África': [
        { bandera: '🇿🇦', nombre: 'Sudáfrica',        zona: 'Africa/Johannesburg' },
        { bandera: '🇪🇬', nombre: 'Egipto',           zona: 'Africa/Cairo' },
        { bandera: '🇰🇪', nombre: 'Kenia',            zona: 'Africa/Nairobi' },
        { bandera: '🇲🇦', nombre: 'Marruecos',        zona: 'Africa/Casablanca' },
        { bandera: '🇳🇬', nombre: 'Nigeria',          zona: 'Africa/Lagos' }
    ],
    '🌏 Oceanía': [
        { bandera: '🇦🇺', nombre: 'Australia (Sídney)', zona: 'Australia/Sydney' },
        { bandera: '🇦🇺', nombre: 'Australia (Perth)',  zona: 'Australia/Perth' },
        { bandera: '🇳🇿', nombre: 'Nueva Zelanda',    zona: 'Pacific/Auckland' }
    ]
};

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

// Nombre amigable a partir de la zona IANA (fallback si no está en PAISES)
function nombreBonito(zona) {
    const partes = zona.split('/');
    return partes[partes.length - 1].replace(/_/g, ' ');
}

// Busca un país por zona para mostrar la bandera
function buscarPaisPorZona(zona) {
    for (const lista of Object.values(PAISES)) {
        const p = lista.find(x => x.zona === zona);
        if (p) return p;
    }
    return null;
}

// Devuelve la etiqueta bonita: "🇨🇱 Chile" o fallback "Santiago"
function etiquetaZona(zona) {
    const p = buscarPaisPorZona(zona);
    if (p) return `${p.bandera} ${p.nombre}`;
    return nombreBonito(zona);
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
                <span class="rm-ciudad">${etiquetaZona(z)}</span>
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
//  MODAL: añadir zona (agrupado por continente)
// ============================================================
function poblarSelect() {
    const sel = document.getElementById('rmZonaSelect');
    if (!sel) return;

    let html = '';
    for (const [continente, lista] of Object.entries(PAISES)) {
        const disponibles = lista.filter(p => !zonas.includes(p.zona));
        if (disponibles.length === 0) continue;

        html += `<optgroup label="${continente}">`;
        disponibles.forEach(p => {
            html += `<option value="${p.zona}">${p.bandera} ${p.nombre}</option>`;
        });
        html += `</optgroup>`;
    }

    if (!html) {
        html = `<option value="">No hay más zonas disponibles</option>`;
    }

    sel.innerHTML = html;
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
