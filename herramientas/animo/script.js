// ============================================================
//  Ánimo — Tracker de estado de ánimo
//  ------------------------------------------------------------
//  Cada día empieza SIN ánimo predefinido.
//  Cada vez que registrás un ánimo, se guarda un cambio con
//  hora, ánimo, nota opcional y timestamp.
//  Podés registrar todos los cambios que quieras en el día.
//  Podés editar o eliminar cualquier cambio (de hoy o pasado).
//
//  Persistencia: app/animo/{codigo}animo.json
//  Estructura:
//  {
//    version: 1,
//    registros: [
//      { fecha: "YYYY-MM-DD", cambios: [
//          { id, hora: "HH:MM", animo: "<id>", nota: "", ts: ISO }
//      ] },
//      ...
//    ]
//  }
//
//  Sin emojis. Iconos Lucide con color propio por ánimo.
// ============================================================

'use strict';

// ---------- CONSTANTES ----------
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'animo';
const MAX_NOTA = 200;
const DIAS_MINI_CAL = 35; // 5 semanas

const DIAS_SEMANA_LARGOS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// Catálogo de ánimos
// - nivel: 1 (muy mal) → 5 (genial). Usado para estadísticas.
// - color: color propio del ánimo (independiente del tema, semántico).
const ANIMOS = [
    { id: 'genial',  nombre: 'Genial',  icono: 'laugh',      color: '#10B981', nivel: 5 },
    { id: 'feliz',   nombre: 'Feliz',   icono: 'smile',      color: '#22C55E', nivel: 4 },
    { id: 'neutral', nombre: 'Neutral', icono: 'meh',        color: '#F59E0B', nivel: 3 },
    { id: 'cansado', nombre: 'Cansado', icono: 'bed-double', color: '#A78BFA', nivel: 3 },
    { id: 'ansioso', nombre: 'Ansioso', icono: 'zap',        color: '#F97316', nivel: 2 },
    { id: 'triste',  nombre: 'Triste',  icono: 'frown',      color: '#3B82F6', nivel: 2 },
    { id: 'enojado', nombre: 'Enojado', icono: 'angry',      color: '#EF4444', nivel: 1 },
    { id: 'mal',     nombre: 'Mal',     icono: 'cloud-rain', color: '#1E40AF', nivel: 1 }
];

const ANIMOS_POR_ID = {};
ANIMOS.forEach(a => { ANIMOS_POR_ID[a.id] = a; });

// ---------- ESTADO ----------
let usuarioActual = null;
let datos = crearEstructuraVacia();

let animoSeleccionado = null;
let ultimoEstadoGuardado = { animo: null, nota: '' };
let idEditar = null;
let animoEditar = null;
let idPendienteEliminar = null;

let toastTimer = null;
let msgTimer = null;
let inicializado = false;

// ---------- REFERENCIAS ----------
const API = () => {
    try { return window.parent.__vicwebos || null; }
    catch (e) { return null; }
};
const MH = () => {
    try { return window.parent.MasterHad || null; }
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
//  HELPERS
// ============================================================
function crearEstructuraVacia() {
    return { version: 1, registros: [] };
}

function normalizar(d) {
    if (!d || typeof d !== 'object') return crearEstructuraVacia();
    if (!Array.isArray(d.registros)) d.registros = [];
    d.registros = d.registros
        .filter(r => r && typeof r.fecha === 'string' && Array.isArray(r.cambios))
        .map(r => ({
            fecha: r.fecha,
            cambios: r.cambios
                .filter(c => c && c.id && c.animo && ANIMOS_POR_ID[c.animo])
                .map(c => ({
                    id: c.id,
                    hora: c.hora || '00:00',
                    animo: c.animo,
                    nota: typeof c.nota === 'string' ? c.nota.slice(0, MAX_NOTA) : '',
                    ts: c.ts || new Date().toISOString()
                }))
                .sort((a, b) => a.ts.localeCompare(b.ts))
        }))
        .filter(r => r.cambios.length > 0)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return d;
}

function rutaArchivo() {
    if (!usuarioActual) return null;
    return `app/animo/${usuarioActual.codigo}animo.json`;
}

function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generarId() {
    return 'cam_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function horaActual() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fechaLegible(iso) {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('es-CL', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
}

function fechaCorta(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}

function nombreDiaDeSemana(iso) {
    const d = new Date(iso + 'T12:00:00');
    return DIAS_SEMANA_LARGOS[d.getDay()];
}

function horaRelativa(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    return new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function toast(texto, tipo = 'info') {
    const el = document.getElementById('moToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mo-toast show ' + (tipo || 'info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function setMsg(id, texto, tipo) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = texto || '';
    el.className = 'mo-form-msg ' + (tipo || '');
    if (texto) {
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => {
            el.textContent = '';
            el.className = 'mo-form-msg';
        }, 3200);
    }
}

// ============================================================
//  CARGA / GUARDADO
// ============================================================
async function cargarDatos() {
    const mh = MH();
    const ruta = rutaArchivo();
    if (!mh || !ruta) { datos = crearEstructuraVacia(); return; }
    try {
        const d = await mh.leerJSON(ruta);
        datos = normalizar(d);
    } catch (e) {
        console.warn('[Ánimo] Error cargando:', e);
        datos = crearEstructuraVacia();
    }
}

async function guardarDatos() {
    const mh = MH();
    const ruta = rutaArchivo();
    if (!mh || !ruta) throw new Error('Sin conexión al sistema.');
    await mh.escribirJSON(ruta, datos);
}

// ============================================================
//  UTILIDADES DE REGISTROS
// ============================================================
function getRegistroHoy() {
    const hoy = hoyISO();
    return datos.registros.find(r => r.fecha === hoy) || null;
}

function getUltimoCambioHoy() {
    const r = getRegistroHoy();
    if (!r || r.cambios.length === 0) return null;
    return r.cambios[r.cambios.length - 1];
}

function encontrarCambio(id) {
    for (const r of datos.registros) {
        const c = r.cambios.find(x => x.id === id);
        if (c) return { registro: r, cambio: c };
    }
    return null;
}

// ============================================================
//  ACCIONES: REGISTRAR / EDITAR / ELIMINAR
// ============================================================
async function registrarCambio() {
    if (!animoSeleccionado) {
        setMsg('moMsg', 'Elegí un ánimo antes de guardar.', 'error');
        return;
    }

    const nota = (document.getElementById('moNota').value || '').trim().slice(0, MAX_NOTA);
    const fecha = hoyISO();
    const cambio = {
        id: generarId(),
        hora: horaActual(),
        animo: animoSeleccionado,
        nota,
        ts: new Date().toISOString()
    };

    let reg = datos.registros.find(r => r.fecha === fecha);
    if (!reg) {
        reg = { fecha, cambios: [] };
        datos.registros.push(reg);
    }
    reg.cambios.push(cambio);

    try {
        await guardarDatos();
        setMsg('moMsg', 'Cambio registrado.', 'success');
        // Reset: nota vacía, mismo ánimo (probablemente sigue siendo el actual)
        document.getElementById('moNota').value = '';
        document.getElementById('moNotaContador').textContent = '0';
        ultimoEstadoGuardado = { animo: animoSeleccionado, nota: '' };
        renderTodo();
        toast('Ánimo registrado', 'success');
    } catch (e) {
        console.warn('[Ánimo] Error guardando:', e);
        setMsg('moMsg', 'No se pudo guardar. Probá de nuevo.', 'error');
    }
}

async function editarCambio() {
    if (!idEditar || !animoEditar) {
        setMsg('moEditarMsg', 'Elegí un ánimo.', 'error');
        return;
    }
    const ubic = encontrarCambio(idEditar);
    if (!ubic) return;

    const notaNueva = (document.getElementById('moNotaEditar').value || '').trim().slice(0, MAX_NOTA);

    ubic.cambio.animo = animoEditar;
    ubic.cambio.nota = notaNueva;
    // La hora y el ts se mantienen: representa el momento original del cambio

    try {
        await guardarDatos();
        cerrarModalEditar();
        renderTodo();
        toast('Cambio actualizado', 'success');
    } catch (e) {
        setMsg('moEditarMsg', 'No se pudo guardar.', 'error');
    }
}

async function eliminarCambio(id) {
    const ubic = encontrarCambio(id);
    if (!ubic) return;
    const { registro } = ubic;
    registro.cambios = registro.cambios.filter(c => c.id !== id);
    if (registro.cambios.length === 0) {
        datos.registros = datos.registros.filter(r => r.fecha !== registro.fecha);
    }
    try {
        await guardarDatos();
        renderTodo();
        toast('Cambio eliminado', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    }
}

// ============================================================
//  RENDER: SELECTOR DE ÁNIMOS
// ============================================================
function renderSelector(contenedor, seleccionActual, onSelect) {
    if (!contenedor) return;
    contenedor.innerHTML = '';
    ANIMOS.forEach(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mo-animo-btn' + (seleccionActual === a.id ? ' seleccionado' : '');
        btn.style.color = a.color;
        btn.dataset.animo = a.id;
        btn.innerHTML = `
            <span class="mo-animo-icono"><i data-lucide="${a.icono}"></i></span>
            <span class="mo-animo-nombre">${a.nombre}</span>
        `;
        btn.addEventListener('click', () => onSelect(a.id));
        contenedor.appendChild(btn);
    });
    if (window.lucide) window.lucide.createIcons();
}

function renderSelectorPrincipal() {
    renderSelector(
        document.getElementById('moGridAnimos'),
        animoSeleccionado,
        (id) => {
            animoSeleccionado = id;
            renderSelectorPrincipal();
            actualizarBotonGuardar();
        }
    );
}

function renderSelectorEditar() {
    renderSelector(
        document.getElementById('moGridAnimosEditar'),
        animoEditar,
        (id) => {
            animoEditar = id;
            renderSelectorEditar();
        }
    );
}

function actualizarBotonGuardar() {
    const btn = document.getElementById('moBtnGuardar');
    const txt = document.getElementById('moBtnGuardarTxt');
    if (!btn || !txt) return;

    const notaActual = (document.getElementById('moNota').value || '').trim();
    const hayCambio = !!animoSeleccionado &&
        (animoSeleccionado !== ultimoEstadoGuardado.animo ||
         notaActual !== ultimoEstadoGuardado.nota);

    btn.disabled = !hayCambio;

    if (ultimoEstadoGuardado.animo) {
        txt.textContent = 'Registrar cambio';
    } else {
        txt.textContent = 'Registrar ánimo';
    }
}

// ============================================================
//  RENDER: HOY
// ============================================================
function renderHoy() {
    const cuerpo = document.getElementById('moHoyCuerpo');
    if (!cuerpo) return;

    const ultimo = getUltimoCambioHoy();

    if (!ultimo) {
        cuerpo.innerHTML = `
            <div class="mo-hoy-vacio">
                <div class="mo-hoy-vacio-icon">
                    <i data-lucide="circle-dashed"></i>
                </div>
                <div class="mo-hoy-vacio-txt">
                    <h3>Sin registrar todavía</h3>
                    <p>Elegí cómo te sentís ahora y empezá el registro de hoy.</p>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const a = ANIMOS_POR_ID[ultimo.animo];
    if (!a) return;

    cuerpo.innerHTML = `
        <div class="mo-hoy-actual-icono" style="background:${a.color}; box-shadow: 0 8px 22px ${a.color}55;">
            <i data-lucide="${a.icono}"></i>
        </div>
        <div class="mo-hoy-actual-info">
            <div class="mo-hoy-actual-nombre" style="color:${a.color};">
                ${a.nombre}
            </div>
            <div class="mo-hoy-actual-tiempo">
                <i data-lucide="clock"></i>
                <span>Último cambio a las ${ultimo.hora} · ${horaRelativa(ultimo.ts)}</span>
            </div>
            ${ultimo.nota ? `
                <div class="mo-hoy-actual-nota" style="color:${a.color};">
                    ${escapar(ultimo.nota)}
                </div>
            ` : ''}
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: TIMELINE DE HOY
// ============================================================
function renderTimeline() {
    const cont = document.getElementById('moTimeline');
    const count = document.getElementById('moHoyCount');
    if (!cont) return;

    const reg = getRegistroHoy();

    if (count) count.textContent = reg ? reg.cambios.length : 0;

    if (!reg || reg.cambios.length === 0) {
        cont.innerHTML = `
            <div class="mo-timeline-vacio">
                Aún no registraste ningún cambio hoy.
            </div>
        `;
        return;
    }

    // Más reciente primero
    const cambios = reg.cambios.slice().reverse();

    cont.innerHTML = '';
    cambios.forEach(c => {
        const a = ANIMOS_POR_ID[c.animo];
        if (!a) return;
        const item = document.createElement('div');
        item.className = 'mo-timeline-item';
        item.style.color = a.color;
        item.innerHTML = `
            <span class="mo-timeline-hora">${c.hora}</span>
            <span class="mo-timeline-icono" style="background:${a.color};">
                <i data-lucide="${a.icono}"></i>
            </span>
            <span class="mo-timeline-info">
                <span class="mo-timeline-nombre" style="color:${a.color};">${a.nombre}</span>
                ${c.nota ? `<span class="mo-timeline-nota">${escapar(c.nota)}</span>` : ''}
            </span>
            <span class="mo-timeline-acciones">
                <button class="mo-timeline-btn" data-accion="editar" data-id="${c.id}" title="Editar">
                    <i data-lucide="pencil"></i>
                </button>
                <button class="mo-timeline-btn peligro" data-accion="borrar" data-id="${c.id}" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            </span>
        `;
        cont.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('[data-accion]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const accion = btn.dataset.accion;
            if (accion === 'editar') abrirModalEditar(id);
            if (accion === 'borrar') abrirModalEliminar(id);
        });
    });
}

// ============================================================
//  RENDER: ANÁLISIS
// ============================================================
function calcularEstadisticas() {
    const registros = datos.registros.slice();
    if (registros.length === 0) return null;

    // Total cambios
    let totalCambios = 0;
    registros.forEach(r => { totalCambios += r.cambios.length; });

    // Promedio diario → promedio general
    const promediosDia = registros.map(r => {
        const niveles = r.cambios.map(c => ANIMOS_POR_ID[c.animo].nivel);
        return niveles.reduce((a, b) => a + b, 0) / niveles.length;
    });
    const promedio = promediosDia.reduce((a, b) => a + b, 0) / promediosDia.length;

    // Distribución de ánimos (contando cambios, no días)
    const distribucion = {};
    ANIMOS.forEach(a => distribucion[a.id] = 0);
    registros.forEach(r => r.cambios.forEach(c => {
        if (distribucion[c.animo] !== undefined) distribucion[c.animo]++;
    }));

    // Racha: días consecutivos con al menos un cambio
    const fechas = registros.map(r => r.fecha).sort().reverse();
    let racha = 0;
    if (fechas.length > 0) {
        const hoy = hoyISO();
        const ayer = (() => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();

        if (fechas[0] === hoy || fechas[0] === ayer) {
            racha = 1;
            let cursor = new Date(fechas[0] + 'T12:00:00');
            for (let i = 1; i < fechas.length; i++) {
                const prev = new Date(cursor);
                prev.setDate(prev.getDate() - 1);
                const prevISO = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
                if (fechas[i] === prevISO) {
                    racha++;
                    cursor = prev;
                } else break;
            }
        }
    }

    // Por día de semana (promedio de niveles)
    const porDia = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    registros.forEach((r, idx) => {
        const dia = new Date(r.fecha + 'T12:00:00').getDay();
        porDia[dia].push(promediosDia[idx]);
    });
    const promDias = Object.entries(porDia)
        .map(([d, arr]) => ({
            dia: parseInt(d, 10),
            promedio: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null,
            count: arr.length
        }))
        .filter(x => x.promedio !== null);

    let mejorDia = null, peorDia = null;
    if (promDias.length > 0) {
        mejorDia = promDias.reduce((a, b) => a.promedio > b.promedio ? a : b);
        peorDia = promDias.reduce((a, b) => a.promedio < b.promedio ? a : b);
    }

    // Cambios promedio por día
    const cambiosPorDia = totalCambios / registros.length;

    // Ánimo más frecuente (por número de cambios)
    let animoTop = null;
    let maxCount = 0;
    Object.entries(distribucion).forEach(([id, n]) => {
        if (n > maxCount) { maxCount = n; animoTop = id; }
    });

    return {
        totalCambios,
        totalDias: registros.length,
        promedio,
        distribucion,
        racha,
        promDias,
        mejorDia,
        peorDia,
        cambiosPorDia,
        animoTop,
        animoTopCount: maxCount
    };
}

function renderAnalisis() {
    const vacio = document.getElementById('moVacio');
    const contenido = document.getElementById('moAnalisisContenido');

    const stats = calcularEstadisticas();

    if (!stats) {
        vacio.hidden = false;
        contenido.hidden = true;
        return;
    }

    vacio.hidden = true;
    contenido.hidden = false;

    // KPIs
    document.getElementById('moKpiPromedio').textContent = stats.promedio.toFixed(1);
    document.getElementById('moKpiDias').textContent = stats.totalDias;
    document.getElementById('moKpiCambios').textContent = stats.totalCambios;
    document.getElementById('moKpiRacha').textContent = stats.racha;

    renderDistribucion(stats);
    renderMiniCal(stats);
    renderPatrones(stats);
}

function renderDistribucion(stats) {
    const cont = document.getElementById('moDistribucion');
    if (!cont) return;

    const total = stats.totalCambios;

    cont.innerHTML = '';
    ANIMOS.forEach(a => {
        const n = stats.distribucion[a.id] || 0;
        const pct = total > 0 ? (n / total) * 100 : 0;

        const fila = document.createElement('div');
        fila.className = 'mo-dist-fila';
        fila.innerHTML = `
            <span class="mo-dist-icono" style="background:${a.color};">
                <i data-lucide="${a.icono}"></i>
            </span>
            <span class="mo-dist-nombre">${a.nombre}</span>
            <span class="mo-dist-barra-wrap">
                <span class="mo-dist-barra" style="width:${pct}%; background:${a.color};"></span>
            </span>
            <span class="mo-dist-pct">${pct.toFixed(0)}%</span>
        `;
        cont.appendChild(fila);
    });
    if (window.lucide) window.lucide.createIcons();
}

function renderMiniCal() {
    const cont = document.getElementById('moMiniCal');
    if (!cont) return;

    // Leyenda
    const mejor = ANIMOS.reduce((a, b) => a.nivel > b.nivel ? a : b);
    const peor = ANIMOS.reduce((a, b) => a.nivel < b.nivel ? a : b);
    const medio = ANIMOS.find(a => a.nivel === 3);
    document.getElementById('moLeyendaMejor').style.background = mejor.color;
    document.getElementById('moLeyendaPeor').style.background = peor.color;
    document.getElementById('moLeyendaMedio').style.background = medio ? medio.color : '#F59E0B';

    // Calcular el rango: 5 semanas alineadas a lunes
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyDow = (hoy.getDay() + 6) % 7; // 0 = lunes
    const lunesEstaSemana = new Date(hoy);
    lunesEstaSemana.setDate(hoy.getDate() - hoyDow);
    const lunesInicio = new Date(lunesEstaSemana);
    lunesInicio.setDate(lunesEstaSemana.getDate() - 28); // 4 semanas atrás

    // Mapa fecha → promedio
    const promDia = {};
    datos.registros.forEach(r => {
        const niveles = r.cambios.map(c => ANIMOS_POR_ID[c.animo].nivel);
        promDia[r.fecha] = niveles.reduce((a, b) => a + b, 0) / niveles.length;
    });

    cont.innerHTML = '';

    for (let i = 0; i < DIAS_MINI_CAL; i++) {
        const fecha = new Date(lunesInicio);
        fecha.setDate(lunesInicio.getDate() + i);
        const iso = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

        const celda = document.createElement('div');
        celda.className = 'mo-mini-cal-dia';
        celda.title = fechaLegible(iso);

        const esFuturo = fecha > hoy;
        if (esFuturo) celda.classList.add('futuro');

        if (iso === hoyISO()) celda.classList.add('hoy');

        const prom = promDia[iso];
        if (prom === undefined) {
            celda.classList.add('vacio');
        } else {
            // Interpolar entre peor y mejor
            const color = colorParaNivel(prom);
            celda.style.background = color;
            celda.title += ` · promedio ${prom.toFixed(1)}`;
        }

        cont.appendChild(celda);
    }
}

function colorParaNivel(nivel) {
    // nivel 1 (peor) → rojo oscuro
    // nivel 5 (mejor) → verde
    const stops = [
        { n: 1, c: [239, 68, 68] },    // rojo
        { n: 2, c: [249, 115, 22] },   // naranja
        { n: 3, c: [245, 158, 11] },   // ámbar
        { n: 4, c: [34, 197, 94] },    // verde
        { n: 5, c: [16, 185, 129] }    // verde esmeralda
    ];
    nivel = Math.max(1, Math.min(5, nivel));
    const lo = Math.floor(nivel);
    const hi = Math.min(5, lo + 1);
    const t = nivel - lo;
    const a = stops[lo - 1].c;
    const b = stops[hi - 1].c;
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r}, ${g}, ${bl})`;
}

function renderPatrones(stats) {
    const cont = document.getElementById('moPatrones');
    if (!cont) return;

    const filas = [];

    if (stats.animoTop) {
        const a = ANIMOS_POR_ID[stats.animoTop];
        filas.push({
            label: 'Ánimo más frecuente',
            valor: a.nombre,
            clase: ''
        });
    }

    if (stats.mejorDia) {
        filas.push({
            label: 'Mejor día de la semana',
            valor: `${DIAS_SEMANA_LARGOS[stats.mejorDia.dia]} (${stats.mejorDia.promedio.toFixed(1)})`,
            clase: 'ok'
        });
    }

    if (stats.peorDia && stats.peorDia.dia !== stats.mejorDia?.dia) {
        filas.push({
            label: 'Peor día de la semana',
            valor: `${DIAS_SEMANA_LARGOS[stats.peorDia.dia]} (${stats.peorDia.promedio.toFixed(1)})`,
            clase: 'bad'
        });
    }

    filas.push({
        label: 'Cambios promedio por día',
        valor: stats.cambiosPorDia.toFixed(1),
        clase: stats.cambiosPorDia >= 3 ? 'warn' : ''
    });

    // Clasificación general del ánimo promedio
    let nivelTxt = '';
    let claseNivel = '';
    if (stats.promedio >= 4) { nivelTxt = 'Buen ánimo general'; claseNivel = 'ok'; }
    else if (stats.promedio >= 3.2) { nivelTxt = 'Ánimo positivo'; claseNivel = 'ok'; }
    else if (stats.promedio >= 2.5) { nivelTxt = 'Ánimo neutro'; claseNivel = 'warn'; }
    else { nivelTxt = 'Ánimo bajo'; claseNivel = 'bad'; }

    filas.push({
        label: 'Estado general',
        valor: nivelTxt,
        clase: claseNivel
    });

    cont.innerHTML = filas.map(f => `
        <div class="mo-patron-item">
            <span class="mo-patron-label">${f.label}</span>
            <span class="mo-patron-valor ${f.clase}">${escapar(f.valor)}</span>
        </div>
    `).join('');
}

// ============================================================
//  MODAL EDITAR
// ============================================================
function abrirModalEditar(id) {
    const ubic = encontrarCambio(id);
    if (!ubic) return;
    idEditar = id;
    animoEditar = ubic.cambio.animo;

    document.getElementById('moNotaEditar').value = ubic.cambio.nota || '';
    renderSelectorEditar();
    setMsg('moEditarMsg', '', '');
    document.getElementById('moModalEditar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalEditar() {
    idEditar = null;
    animoEditar = null;
    document.getElementById('moModalEditar').hidden = true;
}

// ============================================================
//  MODAL ELIMINAR
// ============================================================
function abrirModalEliminar(id) {
    const ubic = encontrarCambio(id);
    if (!ubic) return;
    idPendienteEliminar = id;
    const a = ANIMOS_POR_ID[ubic.cambio.animo];
    document.getElementById('moEliminarTexto').textContent =
        `¿Eliminar el cambio de las ${ubic.cambio.hora} (${a.nombre})? Esta acción no se puede deshacer.`;
    document.getElementById('moModalEliminar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalEliminar() {
    idPendienteEliminar = null;
    document.getElementById('moModalEliminar').hidden = true;
}

// ============================================================
//  RENDER GENERAL
// ============================================================
function renderTodo() {
    renderHoy();
    renderTimeline();
    renderAnalisis();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  EVENTOS
// ============================================================
function bindEventos() {
    // Botón guardar
    document.getElementById('moBtnGuardar')?.addEventListener('click', registrarCambio);

    // Contador de nota + habilitar botón
    document.getElementById('moNota')?.addEventListener('input', (e) => {
        document.getElementById('moNotaContador').textContent = e.target.value.length;
        actualizarBotonGuardar();
    });

    // Botón "Hoy" del header
    document.getElementById('btnHoy')?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const body = document.querySelector('.mo-body');
        if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Modal editar
    document.getElementById('moEditarCerrar')?.addEventListener('click', cerrarModalEditar);
    document.getElementById('moEditarCancelar')?.addEventListener('click', cerrarModalEditar);
    document.getElementById('moEditarGuardar')?.addEventListener('click', editarCambio);
    document.getElementById('moEditarEliminar')?.addEventListener('click', () => {
        const id = idEditar;
        cerrarModalEditar();
        if (id) abrirModalEliminar(id);
    });
    document.getElementById('moModalEditar')?.addEventListener('click', (e) => {
        if (e.target.id === 'moModalEditar') cerrarModalEditar();
    });

    // Modal eliminar
    document.getElementById('moEliminarCerrar')?.addEventListener('click', cerrarModalEliminar);
    document.getElementById('moEliminarCancelar')?.addEventListener('click', cerrarModalEliminar);
    document.getElementById('moEliminarConfirmar')?.addEventListener('click', async () => {
        if (idPendienteEliminar) {
            await eliminarCambio(idPendienteEliminar);
            idPendienteEliminar = null;
        }
        cerrarModalEliminar();
    });
    document.getElementById('moModalEliminar')?.addEventListener('click', (e) => {
        if (e.target.id === 'moModalEliminar') cerrarModalEliminar();
    });

    // ESC
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('moModalEliminar').hidden) {
            cerrarModalEliminar();
            return;
        }
        if (!document.getElementById('moModalEditar').hidden) {
            cerrarModalEditar();
        }
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Ánimo necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Ánimo.'); return; }

    const badge = document.getElementById('moUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    const fechaEl = document.getElementById('moFechaHoy');
    if (fechaEl) {
        const d = new Date();
        fechaEl.textContent = d.toLocaleDateString('es-CL', {
            weekday: 'long', day: '2-digit', month: 'long'
        });
    }

    await cargarDatos();

    renderSelectorPrincipal();
    renderTodo();
    actualizarBotonGuardar();
    bindEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
