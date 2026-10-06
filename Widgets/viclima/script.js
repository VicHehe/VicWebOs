// ============================================================
//  Widget: Viclima
//  ------------------------------------------------------------
//  Extensor de clima del header del shell. Usa la MISMA API
//  (Open-Meteo) y la misma geolocalización, pero muestra:
//    - Clima actual completo (sensación, humedad, viento, lluvia)
//    - Amanecer y anochecer de hoy
//    - Próximas 12 horas
//    - Pronóstico de 7 días con min/max y probabilidad de lluvia
//
//  NO persiste nada: el clima es tiempo-real. Se refresca solo
//  cada 15 minutos (como el header) y con el botón de actualizar.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const API_BASE     = 'https://api.open-meteo.com/v1/forecast';
const HORAS_A_MOSTRAR = 12;
const REFRESH_MS  = 15 * 60 * 1000; // igual que el header (900000)

let coords      = null;
let data        = null;
let nombreLugar = null;
let cargando    = false;
let inicializado = false;

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
//  ICONOS Y DESCRIPCIONES (mismo mapeo que el shell + extras)
// ============================================================
function iconoClima(c, isDay) {
    const d = isDay === 1;
    if (c === 0)  return d ? 'sun' : 'moon';
    if (c === 1)  return d ? 'sun' : 'moon-star';
    if (c === 2)  return d ? 'cloud-sun' : 'cloud-moon';
    if (c === 3)  return 'cloud';
    if (c === 45 || c === 48) return 'cloud-fog';
    if (c >= 51 && c <= 57) return 'cloud-drizzle';
    if (c >= 61 && c <= 67) return 'cloud-rain';
    if (c >= 71 && c <= 77) return 'snowflake';
    if (c >= 80 && c <= 82) return 'cloud-rain-wind';
    if (c === 85 || c === 86) return 'cloud-snow';
    if (c >= 95) return 'cloud-lightning';
    return d ? 'cloud-sun' : 'cloud-moon';
}

function descripcionClima(c) {
    if (c === 0)  return 'Despejado';
    if (c === 1)  return 'Mayormente despejado';
    if (c === 2)  return 'Parcialmente nublado';
    if (c === 3)  return 'Nublado';
    if (c === 45 || c === 48) return 'Niebla';
    if (c >= 51 && c <= 57) return 'Llovizna';
    if (c >= 61 && c <= 67) return 'Lluvia';
    if (c >= 71 && c <= 77) return 'Nieve';
    if (c >= 80 && c <= 82) return 'Chubascos';
    if (c === 85 || c === 86) return 'Nevadas';
    if (c >= 95) return 'Tormenta eléctrica';
    return '—';
}

// ============================================================
//  HELPERS DE FORMATO
// ============================================================
function redondear(n) { return Math.round(n); }

function horaCorta(iso) {
    // "2026-10-06T14:00" → "14:00"
    return String(iso || '').slice(11, 16);
}

function nombreDia(fechaIso, indice) {
    if (indice === 0) return 'Hoy';
    try {
        const d = new Date(fechaIso + 'T12:00:00');
        return d.toLocaleDateString('es-CL', { weekday: 'long' });
    } catch (e) { return 'Día ' + indice; }
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
//  ESTADOS
// ============================================================
function setEstado(tipo, texto = '') {
    const zona = document.getElementById('vlZona');
    if (!zona) return;

    zona.innerHTML = `
        <div class="vl-estado ${tipo === 'error' ? 'error' : ''}">
            ${tipo === 'cargando'
                ? '<div class="vl-spinner"></div>'
                : '<i data-lucide="' + (tipo === 'error' ? 'map-pin-off' : 'compass') + '"></i>'}
            <p>${escapar(texto)}</p>
            ${tipo === 'error' ? `
                <button class="vl-btn-retry" id="vlBtnRetry">
                    <i data-lucide="refresh-cw"></i>
                    Reintentar
                </button>` : ''}
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    document.getElementById('vlBtnRetry')?.addEventListener('click', () => {
        iniciarFlujo();
    });
}

function setBotonCargando(on) {
    const btn = document.getElementById('vlRefresh');
    if (!btn) return;
    btn.classList.toggle('cargando', !!on);
    btn.disabled = !!on;
}

// ============================================================
//  GEOLOCALIZACIÓN (mismo patrón que el header del shell)
// ============================================================
function geolocalizar() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Tu navegador no soporta geolocalización.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude
            }),
            () => reject(new Error('No se pudo obtener tu ubicación. Actívala para ver el clima.')),
            { timeout: 8000 }
        );
    });
}

// Nombre del lugar (best-effort; si falla, quedamos en "Tu ubicación")
async function nombreDeUbicacion(lat, lon) {
    try {
        const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`
        );
        if (!res.ok) return null;
        const d = await res.json();
        return d.city || d.locality || d.principalSubdivision || null;
    } catch (e) {
        return null;
    }
}

// ============================================================
//  API — Open-Meteo (misma que el header)
// ============================================================
async function obtenerClima(lat, lon) {
    const url = API_BASE +
        `?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,weather_code,precipitation_probability,is_day` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
        `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('No se pudo conectar con el clima.');
    const d = await res.json();
    if (!d.current || !d.daily || !d.hourly) throw new Error('Datos de clima incompletos.');
    return d;
}

// ============================================================
//  RENDER
// ============================================================
function renderActual() {
    const c = data.current;
    const daily = data.daily;

    const icono = iconoClima(c.weather_code, c.is_day);
    const desc = descripcionClima(c.weather_code);

    const sensacion = redondear(c.apparent_temperature);
    const humedad = redondear(c.relative_humidity_2m);
    const viento = redondear(c.wind_speed_10m);
    const lluviaHoy = (daily.precipitation_probability_max &&
                       Number.isFinite(daily.precipitation_probability_max[0]))
        ? redondear(daily.precipitation_probability_max[0])
        : 0;

    return `
        <div class="vl-actual">
            <div class="vl-actual-icono">
                <i data-lucide="${icono}"></i>
            </div>
            <div class="vl-actual-info">
                <div class="vl-temp">${redondear(c.temperature_2m)}<sup>°C</sup></div>
                <div class="vl-desc">${escapar(desc)} · Sensación ${sensacion}°</div>
            </div>
        </div>

        <div class="vl-meta">
            <div class="vl-chip">
                <span class="vl-chip-valor">${humedad}%</span>
                <span class="vl-chip-label"><i data-lucide="droplets"></i>Humedad</span>
            </div>
            <div class="vl-chip">
                <span class="vl-chip-valor">${viento} km/h</span>
                <span class="vl-chip-label"><i data-lucide="wind"></i>Viento</span>
            </div>
            <div class="vl-chip">
                <span class="vl-chip-valor">${lluviaHoy}%</span>
                <span class="vl-chip-label"><i data-lucide="umbrella"></i>Lluvia</span>
            </div>
            <div class="vl-chip">
                <span class="vl-chip-valor">${horaCorta(daily.sunrise && daily.sunrise[0])}</span>
                <span class="vl-chip-label"><i data-lucide="sunrise"></i>Amanece</span>
            </div>
        </div>
    `;
}

function renderHoras() {
    const h = data.hourly;
    const ahora = data.current.time; // "2026-10-06T14:15" o similar

    // Encontrar la primera hora >= ahora
    let inicio = 0;
    for (let i = 0; i < h.time.length; i++) {
        if (h.time[i] >= ahora.slice(0, 13)) { inicio = i; break; }
        inicio = i;
    }

    const chips = [];
    const limite = Math.min(inicio + HORAS_A_MOSTRAR, h.time.length);

    for (let i = inicio; i < limite; i++) {
        const esAhora = (i === inicio);
        const prob = (h.precipitation_probability &&
                      Number.isFinite(h.precipitation_probability[i]))
            ? h.precipitation_probability[i] : null;

        chips.push(`
            <div class="vl-hora ${esAhora ? 'ahora' : ''}">
                <span class="vl-hora-hr">${esAhora ? 'Ahora' : horaCorta(h.time[i])}</span>
                <i data-lucide="${iconoClima(h.weather_code[i], h.is_day[i])}"></i>
                <span class="vl-hora-temp">${redondear(h.temperature_2m[i])}°</span>
                ${(prob !== null && prob > 20)
                    ? `<span class="vl-hora-lluvia"><i data-lucide="droplet"></i>${redondear(prob)}%</span>`
                    : ''}
            </div>
        `);
    }

    return `
        <div class="vl-seccion">
            <i data-lucide="clock"></i>
            <span>Próximas horas</span>
        </div>
        <div class="vl-horas">${chips.join('')}</div>
    `;
}

function renderDias() {
    const d = data.daily;

    const minSemana = Math.min(...d.temperature_2m_min);
    const maxSemana = Math.max(...d.temperature_2m_max);
    const rango = Math.max(1, maxSemana - minSemana);

    const filas = d.time.map((fecha, i) => {
        const min = redondear(d.temperature_2m_min[i]);
        const max = redondear(d.temperature_2m_max[i]);

        const left = ((d.temperature_2m_min[i] - minSemana) / rango) * 100;
        const width = Math.max(6, ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / rango) * 100);

        const prob = (d.precipitation_probability_max &&
                      Number.isFinite(d.precipitation_probability_max[i]))
            ? redondear(d.precipitation_probability_max[i]) : null;

        return `
            <div class="vl-dia ${i === 0 ? 'hoy' : ''}">
                <span class="vl-dia-nombre">${escapar(nombreDia(fecha, i))}</span>
                <i data-lucide="${iconoClima(d.weather_code[i], 1)}"></i>
                <div class="vl-dia-barra">
                    <div class="vl-dia-fill" style="left:${left.toFixed(1)}%; width:${width.toFixed(1)}%;"></div>
                </div>
                <span class="vl-dia-lluvia ${(prob !== null && prob > 20) ? '' : 'vacia'}">${prob !== null ? prob + '%' : '0%'}</span>
                <span class="vl-dia-min">${min}°</span>
                <span class="vl-dia-max">${max}°</span>
            </div>
        `;
    }).join('');

    return `
        <div class="vl-seccion">
            <i data-lucide="calendar-days"></i>
            <span>Próximos 7 días</span>
        </div>
        <div class="vl-dias">${filas}</div>
    `;
}

function render() {
    const zona = document.getElementById('vlZona');
    const locEl = document.getElementById('vlLoc');
    if (!zona || !data) return;

    if (locEl && nombreLugar) {
        locEl.textContent = nombreLugar;
        locEl.hidden = false;
    }

    zona.innerHTML = renderActual() + renderHoras() + renderDias();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  FLUJO
// ============================================================
async function iniciarFlujo() {
    if (cargando) return;
    cargando = true;
    setBotonCargando(true);
    setEstado('cargando', 'Buscando tu ubicación...');

    try {
        coords = await geolocalizar();
        setEstado('cargando', 'Consultando el clima...');

        data = await obtenerClima(coords.lat, coords.lon);

        nombreLugar = await nombreDeUbicacion(coords.lat, coords.lon);

        render();
    } catch (e) {
        setEstado('error', e.message || 'No se pudo cargar el clima.');
    } finally {
        cargando = false;
        setBotonCargando(false);
    }
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    document.getElementById('vlRefresh')?.addEventListener('click', () => {
        if (coords && !cargando) {
            // Ya tenemos coords → solo refrescar datos
            cargando = true;
            setBotonCargando(true);
            obtenerClima(coords.lat, coords.lon)
                .then((d) => { data = d; render(); })
                .catch((e) => setEstado('error', e.message || 'No se pudo actualizar.'))
                .finally(() => { cargando = false; setBotonCargando(false); });
        } else {
            iniciarFlujo();
        }
    });

    // Auto-refresco cada 15 min (como el header), solo si la pestaña está visible
    setInterval(() => {
        if (document.hidden || !coords || cargando) return;
        obtenerClima(coords.lat, coords.lon)
            .then((d) => { data = d; if (!document.hidden) render(); })
            .catch(() => { /* silencioso */ });
    }, REFRESH_MS);

    // Al volver a la pestaña, refrescar si pasaron 15 min
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && coords && !cargando) {
            obtenerClima(coords.lat, coords.lon)
                .then((d) => { data = d; render(); })
                .catch(() => { /* silencioso */ });
        }
    });

    iniciarFlujo();

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
