// ============================================================
//  Sueño — Análisis de sueño
//  ------------------------------------------------------------
//  Registrás cada noche: hora de dormir + hora de despertar.
//  La app calcula horas dormidas, consistencia, patrones por
//  día de la semana, racha y cuánto te falta para tu objetivo.
//
//  Persistencia: app/sueno/{codigo}sueno.json
//  Estructura:
//  {
//    version: 1,
//    objetivoHoras: 8,
//    registros: [
//      {
//        id, fecha (YYYY-MM-DD, día en que despertaste),
//        dormir (HH:MM), despertar (HH:MM),
//        calidad (1-5 o null), nota (string),
//        creado (ISO)
//      }
//    ]
//  }
//
//  Sin recordatorios. Sin notificaciones programadas.
//  Solo análisis sobre lo que el usuario registra.
// ============================================================

'use strict';

// ---------- CONSTANTES ----------
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'sueno';
const OBJETIVO_DEFAULT = 8;
const MAX_NOTA = 200;
const DIAS_GRAFICO = 14;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ---------- ESTADO ----------
let usuarioActual = null;
let datos = crearEstructuraVacia();

let calidadSeleccionada = null;
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
    return {
        version: 1,
        objetivoHoras: OBJETIVO_DEFAULT,
        registros: []
    };
}

function normalizar(d) {
    if (!d || typeof d !== 'object') return crearEstructuraVacia();
    if (!Array.isArray(d.registros)) d.registros = [];
    if (typeof d.objetivoHoras !== 'number' ||
        d.objetivoHoras < 4 || d.objetivoHoras > 12) {
        d.objetivoHoras = OBJETIVO_DEFAULT;
    }
    d.registros = d.registros.filter(r => r && r.id && r.fecha && r.dormir && r.despertar);
    return d;
}

function rutaArchivo() {
    if (!usuarioActual) return null;
    return `app/sueno/${usuarioActual.codigo}sueno.json`;
}

function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaISO(yyyy, mm, dd) {
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function generarId() {
    return 'reg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toast(texto, tipo = 'info') {
    const el = document.getElementById('suToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'su-toast show ' + (tipo || 'info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function setFormMsg(texto, tipo) {
    const el = document.getElementById('suFormMsg');
    if (!el) return;
    el.textContent = texto || '';
    el.className = 'su-form-msg ' + (tipo || '');
    clearTimeout(msgTimer);
    if (texto) {
        msgTimer = setTimeout(() => {
            el.textContent = '';
            el.className = 'su-form-msg';
        }, 3200);
    }
}

// ============================================================
//  CÁLCULO DE HORAS
//  ------------------------------------------------------------
//  Si despertar > dormir → diferencia normal.
//  Si despertar <= dormir → cruzó medianoche → +24h.
//  Devuelve horas en float (ej: 7.5).
// ============================================================
function calcularHoras(dormirHHMM, despertarHHMM) {
    const [hD, mD] = String(dormirHHMM).split(':').map(Number);
    const [hW, mW] = String(despertarHHMM).split(':').map(Number);
    if ([hD, mD, hW, mW].some(n => !Number.isFinite(n))) return 0;
    let minutos = (hW * 60 + mW) - (hD * 60 + mD);
    if (minutos <= 0) minutos += 24 * 60;
    return minutos / 60;
}

function horasAHHMM(horas) {
    if (!Number.isFinite(horas) || horas < 0) return '—';
    const totalMin = Math.round(horas * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
}

function formatoNumero(n, dec = 1) {
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(dec);
}

function esHoy(iso) {
    return iso === hoyISO();
}

function nombreDiaDeSemana(iso) {
    const d = new Date(iso + 'T12:00:00');
    return DIAS_SEMANA[d.getDay()];
}

function formatearFechaCorta(iso) {
    const [y, m, dd] = iso.split('-');
    return `${dd}/${m}`;
}

// ============================================================
//  SELECTORES DE FECHA Y HORA
// ============================================================
function llenarSelectoresFecha() {
    const selDia  = document.getElementById('suFechaDia');
    const selMes  = document.getElementById('suFechaMes');
    const selAnio = document.getElementById('suFechaAnio');
    if (!selDia || !selMes || !selAnio) return;

    // Meses
    selMes.innerHTML = MESES.map((nombre, i) =>
        `<option value="${i}">${nombre}</option>`
    ).join('');

    // Años (últimos 2 + actual + 1 futuro por si acaso)
    const anioActual = new Date().getFullYear();
    let htmlAnios = '';
    for (let a = anioActual - 2; a <= anioActual + 1; a++) {
        htmlAnios += `<option value="${a}">${a}</option>`;
    }
    selAnio.innerHTML = htmlAnios;

    // Días: se regeneran según mes/año
    const regenerarDias = () => {
        const mes = parseInt(selMes.value, 10);
        const anio = parseInt(selAnio.value, 10);
        const totalDias = new Date(anio, mes + 1, 0).getDate();
        const diaActual = parseInt(selDia.value, 10) || 1;
        const nuevoDia = Math.min(diaActual, totalDias);

        let html = '';
        for (let d = 1; d <= totalDias; d++) {
            html += `<option value="${d}">${d}</option>`;
        }
        selDia.innerHTML = html;
        selDia.value = nuevoDia;
    };

    selMes.addEventListener('change', regenerarDias);
    selAnio.addEventListener('change', regenerarDias);

    // Poner la fecha de hoy por defecto
    const hoy = new Date();
    selAnio.value = hoy.getFullYear();
    selMes.value = hoy.getMonth();
    regenerarDias();
    selDia.value = hoy.getDate();
}

function llenarSelectoresHora() {
    const hD = document.getElementById('suDormirH');
    const mD = document.getElementById('suDormirM');
    const hW = document.getElementById('suDespertarH');
    const mW = document.getElementById('suDespertarM');
    if (!hD || !mD || !hW || !mW) return;

    // Horas: 00 - 23
    let htmlH = '';
    for (let i = 0; i < 24; i++) {
        const v = String(i).padStart(2, '0');
        htmlH += `<option value="${v}">${v}</option>`;
    }
    hD.innerHTML = htmlH;
    hW.innerHTML = htmlH;

    // Minutos: paso de 5
    let htmlM = '';
    for (let i = 0; i < 60; i += 5) {
        const v = String(i).padStart(2, '0');
        htmlM += `<option value="${v}">${v}</option>`;
    }
    mD.innerHTML = htmlM;
    mW.innerHTML = htmlM;

    // Defaults razonables
    hD.value = '23'; mD.value = '00';
    hW.value = '07'; mW.value = '00';
}

function leerFechaDeSelectores() {
    const d = parseInt(document.getElementById('suFechaDia').value, 10);
    const m = parseInt(document.getElementById('suFechaMes').value, 10);
    const y = parseInt(document.getElementById('suFechaAnio').value, 10);
    if (![d, m, y].every(Number.isFinite)) return null;
    return fechaISO(y, m + 1, d);
}

function leerHoraDeSelectores(hId, mId) {
    const h = document.getElementById(hId).value;
    const m = document.getElementById(mId).value;
    if (!h || !m) return null;
    return `${h}:${m}`;
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
        console.warn('[Sueño] Error cargando:', e);
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
//  GUARDAR / ELIMINAR REGISTRO
// ============================================================
async function guardarRegistro() {
    const fecha = leerFechaDeSelectores();
    const dormir = leerHoraDeSelectores('suDormirH', 'suDormirM');
    const despertar = leerHoraDeSelectores('suDespertarH', 'suDespertarM');
    const nota = (document.getElementById('suNota').value || '').trim().slice(0, MAX_NOTA);

    if (!fecha || !dormir || !despertar) {
        setFormMsg('Completá la fecha y las dos horas.', 'error');
        return;
    }

    if (dormir === despertar) {
        setFormMsg('La hora de dormir y despertar no pueden ser iguales.', 'error');
        return;
    }

    const horas = calcularHoras(dormir, despertar);
    if (horas <= 0 || horas > 24) {
        setFormMsg('Rango de horas inválido.', 'error');
        return;
    }

    // Si ya existe un registro para esa fecha, lo reemplazamos
    const existente = datos.registros.find(r => r.fecha === fecha);

    const registro = {
        id: existente ? existente.id : generarId(),
        fecha,
        dormir,
        despertar,
        calidad: calidadSeleccionada,
        nota,
        creado: existente ? existente.creado : new Date().toISOString(),
        actualizado: existente ? new Date().toISOString() : null
    };

    if (existente) {
        datos.registros = datos.registros.map(r => r.id === existente.id ? registro : r);
    } else {
        datos.registros.push(registro);
    }

    try {
        await guardarDatos();
        setFormMsg(
            existente ? 'Registro actualizado.' : 'Registro guardado.',
            'success'
        );
        resetFormulario();
        renderTodo();
        toast(existente ? 'Registro actualizado' : 'Registro guardado', 'success');
    } catch (e) {
        console.warn('[Sueño] Error guardando:', e);
        setFormMsg('No se pudo guardar. Probá de nuevo.', 'error');
    }
}

function resetFormulario() {
    calidadSeleccionada = null;
    document.querySelectorAll('.su-cal-btn').forEach(b => b.classList.remove('activo'));
    const notaEl = document.getElementById('suNota');
    if (notaEl) notaEl.value = '';

    // Reset fecha a hoy
    const hoy = new Date();
    const selAnio = document.getElementById('suFechaAnio');
    const selMes = document.getElementById('suFechaMes');
    const selDia = document.getElementById('suFechaDia');
    if (selAnio) selAnio.value = hoy.getFullYear();
    if (selMes) selMes.value = hoy.getMonth();
    if (selDia) selDia.value = hoy.getDate();

    // Reset horas a defaults
    const hD = document.getElementById('suDormirH');
    const mD = document.getElementById('suDormirM');
    const hW = document.getElementById('suDespertarH');
    const mW = document.getElementById('suDespertarM');
    if (hD) hD.value = '23';
    if (mD) mD.value = '00';
    if (hW) hW.value = '07';
    if (mW) mW.value = '00';
}

async function eliminarRegistro(id) {
    datos.registros = datos.registros.filter(r => r.id !== id);
    try {
        await guardarDatos();
        renderTodo();
        toast('Registro eliminado', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    }
}

// ============================================================
//  RENDER PRINCIPAL
// ============================================================
function renderTodo() {
    renderObjetivo();
    renderAnalisis();
    if (window.lucide) window.lucide.createIcons();
}

function renderObjetivo() {
    const el = document.getElementById('suObjetivoHoras');
    if (el) el.textContent = datos.objetivoHoras;
}

// ============================================================
//  ANÁLISIS
// ============================================================
function registrosOrdenados() {
    return datos.registros.slice().sort((a, b) =>
        a.fecha.localeCompare(b.fecha)
    );
}

function calcularEstadisticas() {
    const regs = registrosOrdenados();
    if (regs.length === 0) return null;

    const conHoras = regs.map(r => ({
        ...r,
        horas: calcularHoras(r.dormir, r.despertar)
    }));

    const horasArray = conHoras.map(r => r.horas);
    const total = horasArray.reduce((a, b) => a + b, 0);
    const promedio = total / horasArray.length;
    const min = Math.min(...horasArray);
    const max = Math.max(...horasArray);

    // Desviación estándar (consistencia)
    const varianza = horasArray.reduce((a, h) =>
        a + Math.pow(h - promedio, 2), 0
    ) / horasArray.length;
    const desviacion = Math.sqrt(varianza);

    // Últimos 7 registros (por orden cronológico, no por días calendario)
    const ultimos7 = conHoras.slice(-7);
    const promedio7 = ultimos7.length
        ? ultimos7.reduce((a, r) => a + r.horas, 0) / ultimos7.length
        : 0;

    // Noches que cumplen objetivo
    const cumplen = conHoras.filter(r => r.horas >= datos.objetivoHoras);
    const pctCumplen = (cumplen.length / conHoras.length) * 100;

    // Racha: últimas noches consecutivas cumpliendo objetivo
    // Recorremos desde el final del array (más reciente primero)
    let racha = 0;
    for (let i = conHoras.length - 1; i >= 0; i--) {
        if (conHoras[i].horas >= datos.objetivoHoras) racha++;
        else break;
    }

    // Por día de la semana
    const porDia = {};
    for (let i = 0; i < 7; i++) porDia[i] = [];
    conHoras.forEach(r => {
        const d = new Date(r.fecha + 'T12:00:00').getDay();
        porDia[d].push(r.horas);
    });
    const promediosDia = Object.entries(porDia).map(([d, arr]) => ({
        dia: parseInt(d, 10),
        promedio: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null,
        count: arr.length
    })).filter(x => x.promedio !== null);

    let mejorDia = null, peorDia = null;
    if (promediosDia.length > 0) {
        mejorDia = promediosDia.reduce((a, b) => a.promedio > b.promedio ? a : b);
        peorDia = promediosDia.reduce((a, b) => a.promedio < b.promedio ? a : b);
    }

    // Hora de dormir / despertar más común y rango
    // Usamos "minutos desde las 18:00" para manejar bien la medianoche
    function normalizarHora(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        let min = h * 60 + m;
        if (min < 18 * 60) min += 24 * 60; // madrugada → sumamos un día
        return min;
    }
    function desnormalizarHora(min) {
        min = min % (24 * 60);
        const h = Math.floor(min / 60);
        const m = min % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    const dormirMins = conHoras.map(r => normalizarHora(r.dormir));
    const despertarMins = conHoras.map(r => normalizarHora(r.despertar));

    const dormirProm = dormirMins.reduce((a, b) => a + b, 0) / dormirMins.length;
    const despertarProm = despertarMins.reduce((a, b) => a + b, 0) / despertarMins.length;
    const dormirMin = Math.min(...dormirMins);
    const dormirMax = Math.max(...dormirMins);
    const despertarMin = Math.min(...despertarMins);
    const despertarMax = Math.max(...despertarMins);

    const dispersionDormir = (dormirMax - dormirMin) / 60; // horas de rango
    const dispersionDespertar = (despertarMax - despertarMin) / 60;

    // Calidad promedio (si hay)
    const conCalidad = conHoras.filter(r => r.calidad);
    const calidadProm = conCalidad.length
        ? conCalidad.reduce((a, r) => a + r.calidad, 0) / conCalidad.length
        : null;

    // Mejor y peor registro por horas
    let mejorReg = conHoras[0], peorReg = conHoras[0];
    conHoras.forEach(r => {
        if (r.horas > mejorReg.horas) mejorReg = r;
        if (r.horas < peorReg.horas) peorReg = r;
    });

    return {
        total: conHoras.length,
        promedio,
        min, max, desviacion,
        promedio7,
        cumplen: cumplen.length,
        pctCumplen,
        racha,
        porDia: promediosDia,
        mejorDia, peorDia,
        dormirProm, despertarProm,
        dispersionDormir, dispersionDespertar,
        calidadProm, conCalidad: conCalidad.length,
        mejorReg, peorReg,
        conHoras
    };
}

function renderAnalisis() {
    const vacio = document.getElementById('suVacio');
    const contenido = document.getElementById('suAnalisisContenido');

    const stats = calcularEstadisticas();

    if (!stats) {
        vacio.hidden = false;
        contenido.hidden = true;
        return;
    }
    vacio.hidden = true;
    contenido.hidden = false;

    renderFalta(stats);
    renderKpis(stats);
    renderGrafico(stats);
    renderPatrones(stats);
    renderHistorial(stats);
}

function renderFalta(stats) {
    const el = document.getElementById('suFalta');
    const icono = document.getElementById('suFaltaIcono');
    const titulo = document.getElementById('suFaltaTitulo');
    const desc = document.getElementById('suFaltaDesc');
    if (!el) return;

    const obj = datos.objetivoHoras;
    const prom = stats.promedio;
    const falta = obj - prom;

    el.classList.remove('ok', 'falta', 'grave');

    if (falta <= 0.25) {
        // Cumple o supera
        el.classList.add('ok');
        icono.innerHTML = '<i data-lucide="check"></i>';
        titulo.textContent = 'Estás durmiendo lo suficiente';
        const exceso = Math.abs(falta);
        if (exceso < 0.25) {
            desc.textContent = `Tu promedio (${formatoNumero(prom)}h) coincide con tu objetivo de ${obj}h. Sostenelo.`;
        } else {
            desc.textContent = `Dormís en promedio ${formatoNumero(prom)}h, ${formatoNumero(exceso)}h por encima de tu objetivo de ${obj}h.`;
        }
    } else if (falta <= 1.5) {
        el.classList.add('falta');
        icono.innerHTML = '<i data-lucide="alert-circle"></i>';
        titulo.textContent = `Te faltan ${formatoNumero(falta)}h por noche`;
        const acumulado7 = falta * 7;
        desc.textContent = `Promediás ${formatoNumero(prom)}h y tu objetivo es ${obj}h. Si lo mantenés, en una semana acumulás ${formatoNumero(acumulado7)}h de sueño menos.`;
    } else {
        el.classList.add('grave');
        icono.innerHTML = '<i data-lucide="alert-triangle"></i>';
        titulo.textContent = `Déficit importante: ${formatoNumero(falta)}h por noche`;
        const acumulado7 = falta * 7;
        desc.textContent = `Promediás ${formatoNumero(prom)}h contra un objetivo de ${obj}h. Es casi ${formatoNumero(falta)}h menos cada noche, ${formatoNumero(acumulado7)}h en una semana.`;
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderKpis(stats) {
    const elProm = document.getElementById('suKpiPromedio');
    const elSem = document.getElementById('suKpiSemana');
    const elSemSub = document.getElementById('suKpiSemanaSub');
    const elRacha = document.getElementById('suKpiRacha');
    const elTotal = document.getElementById('suKpiTotal');
    if (!elProm) return;

    elProm.textContent = formatoNumero(stats.promedio);

    // Comparativa con la semana anterior
    const conHoras = stats.conHoras;
    const ult7 = conHoras.slice(-7);
    const ant7 = conHoras.slice(-14, -7);

    if (ult7.length === 0) {
        elSem.textContent = '—';
        elSemSub.textContent = 'sin datos';
    } else {
        const promUlt7 = ult7.reduce((a, r) => a + r.horas, 0) / ult7.length;
        elSem.textContent = formatoNumero(promUlt7);

        if (ant7.length === 0) {
            elSemSub.textContent = 'sin comparativa';
        } else {
            const promAnt7 = ant7.reduce((a, r) => a + r.horas, 0) / ant7.length;
            const diff = promUlt7 - promAnt7;
            if (Math.abs(diff) < 0.15) {
                elSemSub.textContent = 'igual que antes';
            } else if (diff > 0) {
                elSemSub.textContent = `+${formatoNumero(diff)}h vs antes`;
            } else {
                elSemSub.textContent = `${formatoNumero(diff)}h vs antes`;
            }
        }
    }

    elRacha.textContent = stats.racha;
    elTotal.textContent = stats.total;
}

function renderGrafico(stats) {
    const cont = document.getElementById('suGrafico');
    if (!cont) return;

    const conHoras = stats.conHoras;
    const ult = conHoras.slice(-DIAS_GRAFICO);

    // Eje máximo: el mayor entre objetivo*1.3 y el máximo real
    const maxHoras = Math.max(datos.objetivoHoras * 1.3, ...ult.map(r => r.horas), 10);

    cont.innerHTML = '';

    if (ult.length === 0) {
        cont.innerHTML = '<div style="flex:1;text-align:center;color:var(--gray-400);font-size:12px;padding-top:40px;">Sin datos</div>';
        return;
    }

    // Offset del objetivo respecto al alto total
    const objPct = (datos.objetivoHoras / maxHoras) * 100;

    // Línea del objetivo
    const linea = document.createElement('div');
    linea.className = 'su-objetivo-linea';
    linea.style.bottom = objPct + '%';
    linea.innerHTML = `<span class="su-objetivo-linea-label">${datos.objetivoHoras}h</span>`;
    cont.appendChild(linea);

    ult.forEach(reg => {
        const barra = document.createElement('div');
        barra.className = 'su-barra';
        if (reg.horas < datos.objetivoHoras * 0.7) barra.classList.add('muy-bajo');
        else if (reg.horas < datos.objetivoHoras) barra.classList.add('bajo');

        const pct = Math.min(100, (reg.horas / maxHoras) * 100);
        const fill = document.createElement('div');
        fill.className = 'su-barra-fill';
        fill.style.height = pct + '%';
        fill.title = `${reg.fecha}: ${formatoNumero(reg.horas)}h`;
        barra.appendChild(fill);

        const label = document.createElement('div');
        label.className = 'su-barra-label';
        label.textContent = formatearFechaCorta(reg.fecha);
        barra.appendChild(label);

        cont.appendChild(barra);
    });
}

function renderPatrones(stats) {
    // Días de la semana
    const contDias = document.getElementById('suPatronDias');
    if (contDias) {
        contDias.innerHTML = '';
        if (stats.mejorDia) {
            contDias.innerHTML += `
                <div class="su-patron-item">
                    <span class="su-patron-label">Mejor día</span>
                    <span class="su-patron-valor ok">${DIAS_SEMANA[stats.mejorDia.dia]}</span>
                </div>
                <div class="su-patron-item">
                    <span class="su-patron-label">Prom. mejor día</span>
                    <span class="su-patron-valor ok">${formatoNumero(stats.mejorDia.promedio)}h</span>
                </div>
            `;
        }
        if (stats.peorDia && (!stats.mejorDia || stats.peorDia.dia !== stats.mejorDia.dia)) {
            contDias.innerHTML += `
                <div class="su-patron-item">
                    <span class="su-patron-label">Peor día</span>
                    <span class="su-patron-valor bad">${DIAS_SEMANA[stats.peorDia.dia]}</span>
                </div>
                <div class="su-patron-item">
                    <span class="su-patron-label">Prom. peor día</span>
                    <span class="su-patron-valor bad">${formatoNumero(stats.peorDia.promedio)}h</span>
                </div>
            `;
        }
    }

    // Horarios
    const contHor = document.getElementById('suPatronHorarios');
    if (contHor) {
        // Convertir a formato HH:MM
        function minAHHMM(min) {
            min = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
            const h = Math.floor(min / 60);
            const m = min % 60;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        contHor.innerHTML = `
            <div class="su-patron-item">
                <span class="su-patron-label">Te dormís en promedio</span>
                <span class="su-patron-valor">${minAHHMM(stats.dormirProm)}</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Despertás en promedio</span>
                <span class="su-patron-valor">${minAHHMM(stats.despertarProm)}</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Rango de dormir</span>
                <span class="su-patron-valor">${formatoNumero(stats.dispersionDormir)}h</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Rango de despertar</span>
                <span class="su-patron-valor">${formatoNumero(stats.dispersionDespertar)}h</span>
            </div>
        `;
    }

    // Consistencia
    const contCons = document.getElementById('suPatronConsistencia');
    if (contCons) {
        const desv = stats.desviacion;
        let etiqueta, clase;
        if (desv < 0.5) {
            etiqueta = 'Muy consistente';
            clase = 'ok';
        } else if (desv < 1) {
            etiqueta = 'Consistente';
            clase = 'ok';
        } else if (desv < 1.5) {
            etiqueta = 'Irregular';
            clase = 'warn';
        } else {
            etiqueta = 'Muy irregular';
            clase = 'bad';
        }

        const pctCumple = stats.pctCumplen;
        const claseCumple = pctCumple >= 70 ? 'ok' : (pctCumple >= 40 ? 'warn' : 'bad');

        contCons.innerHTML = `
            <div class="su-patron-item">
                <span class="su-patron-label">Variabilidad</span>
                <span class="su-patron-valor ${clase}">${formatoNumero(desv)}h · ${etiqueta}</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Cumplís el objetivo</span>
                <span class="su-patron-valor ${claseCumple}">${formatoNumero(pctCumple, 0)}%</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Mejor noche</span>
                <span class="su-patron-valor ok">${formatoNumero(stats.mejorReg.horas)}h (${formatearFechaCorta(stats.mejorReg.fecha)})</span>
            </div>
            <div class="su-patron-item">
                <span class="su-patron-label">Peor noche</span>
                <span class="su-patron-valor bad">${formatoNumero(stats.peorReg.horas)}h (${formatearFechaCorta(stats.peorReg.fecha)})</span>
            </div>
        `;
    }

    // Calidad
    const contCal = document.getElementById('suPatronCalidad');
    const wrapCal = document.getElementById('suPatronCalidadWrap');
    if (contCal && wrapCal) {
        if (stats.conCalidad === 0) {
            wrapCal.hidden = true;
        } else {
            wrapCal.hidden = false;
            const prom = stats.calidadProm;
            let clase = prom >= 4 ? 'ok' : (prom >= 3 ? 'warn' : 'bad');
            const nivel = prom >= 4 ? 'Buena' : (prom >= 3 ? 'Aceptable' : 'Mala');

            // Correlación calidad vs horas
            const conAmbos = stats.conHoras.filter(r => r.calidad);
            const alta = conAmbos.filter(r => r.calidad >= 4);
            const baja = conAmbos.filter(r => r.calidad <= 2);
            const promAlta = alta.length ? alta.reduce((a, r) => a + r.horas, 0) / alta.length : null;
            const promBaja = baja.length ? baja.reduce((a, r) => a + r.horas, 0) / baja.length : null;

            let html = `
                <div class="su-patron-item">
                    <span class="su-patron-label">Calidad promedio</span>
                    <span class="su-patron-valor ${clase}">${formatoNumero(prom)} / 5 · ${nivel}</span>
                </div>
                <div class="su-patron-item">
                    <span class="su-patron-label">Noches con calidad</span>
                    <span class="su-patron-valor">${stats.conCalidad} de ${stats.total}</span>
                </div>
            `;
            if (promAlta !== null && promBaja !== null) {
                const dif = promAlta - promBaja;
                if (Math.abs(dif) >= 0.3) {
                    html += `
                        <div class="su-patron-item">
                            <span class="su-patron-label">Cuando dormís bien (4-5)</span>
                            <span class="su-patron-valor ok">${formatoNumero(promAlta)}h</span>
                        </div>
                        <div class="su-patron-item">
                            <span class="su-patron-label">Cuando dormís mal (1-2)</span>
                            <span class="su-patron-valor bad">${formatoNumero(promBaja)}h</span>
                        </div>
                    `;
                }
            }
            contCal.innerHTML = html;
        }
    }
}

function renderHistorial(stats) {
    const cont = document.getElementById('suHistorial');
    if (!cont) return;

    const conHoras = stats.conHoras.slice().reverse(); // más reciente arriba
    const ult = conHoras.slice(0, 30); // máximo 30 en el historial

    cont.innerHTML = '';

    if (ult.length === 0) {
        cont.innerHTML = '<p style="color:var(--gray-500);font-size:13px;text-align:center;padding:20px;">Sin registros.</p>';
        return;
    }

    ult.forEach(reg => {
        const item = document.createElement('div');
        item.className = 'su-hist-item';

        const [y, m, dd] = reg.fecha.split('-');
        const nombreDia = nombreDiaDeSemana(reg.fecha).slice(0, 3);

        let calDots = '';
        if (reg.calidad) {
            calDots = '<div class="su-hist-cal">';
            for (let i = 1; i <= 5; i++) {
                calDots += `<span class="su-hist-cal-dot ${i <= reg.calidad ? 'lleno' : ''}"></span>`;
            }
            calDots += '</div>';
        }

        item.innerHTML = `
            <div class="su-hist-fecha">
                <span class="su-hist-dia">${dd}/${m}</span>
                <span class="su-hist-nombre-dia">${nombreDia}</span>
            </div>
            <div class="su-hist-info">
                <span class="su-hist-horas">${formatoNumero(reg.horas)}h</span>
                <span class="su-hist-horario">${reg.dormir} → ${reg.despertar}</span>
                ${reg.nota ? `<span class="su-hist-nota">${escapar(reg.nota)}</span>` : ''}
            </div>
            ${calDots}
            <button class="su-hist-borrar" data-id="${reg.id}" title="Eliminar">
                <i data-lucide="trash-2"></i>
            </button>
        `;

        cont.appendChild(item);
    });

    cont.querySelectorAll('.su-hist-borrar').forEach(btn => {
        btn.addEventListener('click', () => {
            idPendienteEliminar = btn.dataset.id;
            const reg = datos.registros.find(r => r.id === idPendienteEliminar);
            const [y, m, dd] = reg.fecha.split('-');
            document.getElementById('suEliminarTexto').textContent =
                `¿Eliminar el registro del ${dd}/${m}/${y}? Esta acción no se puede deshacer.`;
            document.getElementById('suModalEliminar').hidden = false;
            if (window.lucide) window.lucide.createIcons();
        });
    });
}

// ============================================================
//  MODAL OBJETIVO
// ============================================================
function abrirModalObjetivo() {
    const slider = document.getElementById('suObjetivoSlider');
    const valor = document.getElementById('suObjetivoSliderValor');
    if (slider) slider.value = datos.objetivoHoras;
    if (valor) valor.textContent = datos.objetivoHoras;
    document.getElementById('suModalObjetivo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalObjetivo() {
    document.getElementById('suModalObjetivo').hidden = true;
}

async function guardarObjetivo() {
    const slider = document.getElementById('suObjetivoSlider');
    const nuevo = parseFloat(slider.value);
    if (!Number.isFinite(nuevo) || nuevo < 4 || nuevo > 12) return;
    datos.objetivoHoras = nuevo;
    try {
        await guardarDatos();
        cerrarModalObjetivo();
        renderTodo();
        toast('Objetivo actualizado', 'success');
    } catch (e) {
        toast('No se pudo guardar', 'error');
    }
}

// ============================================================
//  EVENTOS
// ============================================================
function bindEventos() {
    // Calidad
    document.querySelectorAll('.su-cal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val, 10);
            if (calidadSeleccionada === val) {
                calidadSeleccionada = null;
                btn.classList.remove('activo');
            } else {
                calidadSeleccionada = val;
                document.querySelectorAll('.su-cal-btn').forEach(b => b.classList.remove('activo'));
                btn.classList.add('activo');
            }
        });
    });

    // Guardar registro
    document.getElementById('btnGuardar')?.addEventListener('click', guardarRegistro);

    // Modal objetivo
    document.getElementById('btnConfig')?.addEventListener('click', abrirModalObjetivo);
    document.getElementById('btnEditarObjetivo')?.addEventListener('click', abrirModalObjetivo);
    document.getElementById('suObjetivoCerrar')?.addEventListener('click', cerrarModalObjetivo);
    document.getElementById('suObjetivoCancelar')?.addEventListener('click', cerrarModalObjetivo);
    document.getElementById('suObjetivoGuardar')?.addEventListener('click', guardarObjetivo);
    document.getElementById('suObjetivoSlider')?.addEventListener('input', (e) => {
        document.getElementById('suObjetivoSliderValor').textContent = e.target.value;
    });
    document.getElementById('suModalObjetivo')?.addEventListener('click', (e) => {
        if (e.target.id === 'suModalObjetivo') cerrarModalObjetivo();
    });

    // Modal eliminar
    document.getElementById('suEliminarCerrar')?.addEventListener('click', () => {
        document.getElementById('suModalEliminar').hidden = true;
        idPendienteEliminar = null;
    });
    document.getElementById('suEliminarCancelar')?.addEventListener('click', () => {
        document.getElementById('suModalEliminar').hidden = true;
        idPendienteEliminar = null;
    });
    document.getElementById('suEliminarConfirmar')?.addEventListener('click', async () => {
        if (idPendienteEliminar) {
            await eliminarRegistro(idPendienteEliminar);
            idPendienteEliminar = null;
        }
        document.getElementById('suModalEliminar').hidden = true;
    });
    document.getElementById('suModalEliminar')?.addEventListener('click', (e) => {
        if (e.target.id === 'suModalEliminar') {
            e.target.hidden = true;
            idPendienteEliminar = null;
        }
    });

    // ESC
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('suModalEliminar').hidden) {
            document.getElementById('suModalEliminar').hidden = true;
            idPendienteEliminar = null;
            return;
        }
        if (!document.getElementById('suModalObjetivo').hidden) {
            cerrarModalObjetivo();
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
    if (!api) { alert('Sueño necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Sueño.'); return; }

    const badge = document.getElementById('suUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    // Selectores de fecha/hora primero
    llenarSelectoresFecha();
    llenarSelectoresHora();

    // Cargar datos
    await cargarDatos();

    // Render
    renderTodo();

    // Eventos
    bindEventos();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
