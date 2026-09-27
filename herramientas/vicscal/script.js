// ============================================================
//  VicsCal — Calendario personal + público
//  ------------------------------------------------------------
//  · Personal: app/calendario/{codigo}.json
//  · Público:  app/calendario/publicos.json
//  · Cada evento tiene color, título, descripción y visibilidad.
//  · Notificación al abrir si hoy tiene eventos (1 vez por día).
//  ------------------------------------------------------------
//  NOTA sobre fechas: input[type="date"] no es escribible en
//  Chrome dentro de iframes anidados. Se usan 3 <select> (día,
//  mes, año). El valor se guarda igual: "YYYY-MM-DD".
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_PERSONAL_BASE = 'app/calendario/';
const RUTA_PUBLICOS = 'app/calendario/publicos.json';
const COLORES = ['#C4B5FD', '#FCA5A5', '#93C5FD', '#FCD34D', '#6EE7B7', '#F9A8D4'];
const MAX_TITULO = 80;
const MAX_DESC = 400;
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ---------- ESTADO ----------
let usuarioActual = null;
let eventosPersonales = [];
let eventosPublicos = [];
let mesActual = new Date().getMonth();
let añoActual = new Date().getFullYear();
let fechaSeleccionada = null;
let colorSeleccionado = COLORES[0];
let eventoEditando = null;
let filtroActual = 'todos';
let toastTimer = null;
let guardando = false;
let pendingBorrar = null;

const API = () => window.parent.__vicwebos || null;

// ============================================================
//  TEMA DEL SHELL
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
function toast(texto, tipo = 'info') {
    const el = document.getElementById('caToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ca-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fechaISO(yyyy, mm, dd) {
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function formatearFecha(iso) {
    const [y, m, d] = iso.split('-');
    return `${d} de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
}

function rutaPersonal() {
    if (!usuarioActual) return null;
    return RUTA_PERSONAL_BASE + usuarioActual.codigo + '.json';
}

function generarId(prefijo) {
    return (prefijo || 'ev') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function DIAS_POR_MES(mes, anio) {
    return new Date(anio, mes + 1, 0).getDate();
}

// ============================================================
//  SELECTORES DE FECHA (3 selects: día, mes, año)
// ============================================================
function inicializarSelectoresFecha() {
    const selDia  = document.getElementById('caFechaDia');
    const selMes  = document.getElementById('caFechaMes');
    const selAnio = document.getElementById('caFechaAnio');
    if (!selDia || !selMes || !selAnio) return;

    // Meses
    selMes.innerHTML = MESES.map((nombre, i) =>
        `<option value="${i}">${nombre}</option>`
    ).join('');

    // Años: rango razonable (5 atrás, 10 adelante)
    const anioActual = new Date().getFullYear();
    let htmlAnios = '';
    for (let a = anioActual - 5; a <= anioActual + 10; a++) {
        htmlAnios += `<option value="${a}">${a}</option>`;
    }
    selAnio.innerHTML = htmlAnios;

    // Cuando cambia mes o año, regenerar días
    const regenerarDias = () => {
        const mes = parseInt(selMes.value, 10);
        const anio = parseInt(selAnio.value, 10);
        const totalDias = DIAS_POR_MES(mes, anio);
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

    setSelectoresFecha(hoyISO());
}

function setSelectoresFecha(iso) {
    const selDia  = document.getElementById('caFechaDia');
    const selMes  = document.getElementById('caFechaMes');
    const selAnio = document.getElementById('caFechaAnio');
    if (!selDia || !selMes || !selAnio) return;

    const [y, m, d] = String(iso || hoyISO()).split('-').map(v => parseInt(v, 10));

    // Asegurar que el año exista como opción
    if (!selAnio.querySelector(`option[value="${y}"]`)) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        selAnio.appendChild(opt);
    }

    selAnio.value = y;
    selMes.value = (m - 1);

    // Regenerar días según mes/año
    const totalDias = DIAS_POR_MES(m - 1, y);
    let html = '';
    for (let i = 1; i <= totalDias; i++) {
        html += `<option value="${i}">${i}</option>`;
    }
    selDia.innerHTML = html;
    selDia.value = Math.min(d, totalDias);
}

function leerFechaDeSelectores() {
    const d = parseInt(document.getElementById('caFechaDia').value, 10);
    const m = parseInt(document.getElementById('caFechaMes').value, 10);
    const y = parseInt(document.getElementById('caFechaAnio').value, 10);
    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    return fechaISO(y, m + 1, d);
}

// ============================================================
//  CARGA
// ============================================================
async function cargarTodo() {
    const bd = window.parent.ConfigBD;
    if (!bd) return;

    // Personal
    try {
        const data = await bd.leerArchivo(rutaPersonal());
        eventosPersonales = Array.isArray(data?.eventos) ? data.eventos : [];
    } catch (e) {
        console.warn('[VicsCal] Error cargando personal:', e);
        eventosPersonales = [];
    }

    // Públicos
    try {
        const data = await bd.leerArchivo(RUTA_PUBLICOS);
        eventosPublicos = Array.isArray(data?.eventos) ? data.eventos : [];
    } catch (e) {
        console.warn('[VicsCal] Error cargando públicos:', e);
        eventosPublicos = [];
    }
}

async function guardarPersonal() {
    const bd = window.parent.ConfigBD;
    if (!bd) return;
    try {
        await bd.escribirArchivo(rutaPersonal(), {
            version: 1,
            actualizado: new Date().toISOString(),
            eventos: eventosPersonales
        });
    } catch (e) {
        console.warn('[VicsCal] Error guardando personal:', e);
        toast('No se pudo guardar', 'error');
        throw e;
    }
}

async function guardarPublicos() {
    const bd = window.parent.ConfigBD;
    if (!bd) return;
    try {
        await bd.actualizarArchivo(RUTA_PUBLICOS, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, eventos: [] };
            if (!Array.isArray(actual.eventos)) actual.eventos = [];
            actual.eventos = eventosPublicos;
            actual.actualizado = new Date().toISOString();
            return actual;
        });
    } catch (e) {
        console.warn('[VicsCal] Error guardando públicos:', e);
        toast('No se pudo guardar en públicos', 'error');
        throw e;
    }
}

// ============================================================
//  NOTIFICACIÓN DEL DÍA
// ============================================================
async function notificarEventosDeHoy() {
    try {
        const hoy = hoyISO();
        const clave = `vicscal_notif_${usuarioActual.codigo}_${hoy}`;
        if (localStorage.getItem(clave)) return;

        const eventosHoy = [...eventosPersonales, ...eventosPublicos]
            .filter(e => e.fecha === hoy);

        if (eventosHoy.length === 0) return;

        const notif = window.parent.Notificaciones;
        if (!notif || typeof notif.enviar !== 'function') return;

        let texto;
        if (eventosHoy.length === 1) {
            texto = `Hoy: ${eventosHoy[0].titulo}`;
        } else {
            texto = `Tenés ${eventosHoy.length} eventos hoy: ${eventosHoy.slice(0, 3).map(e => e.titulo).join(', ')}${eventosHoy.length > 3 ? '…' : ''}`;
        }

        await notif.enviar('calendario', texto, usuarioActual.codigo);
        localStorage.setItem(clave, '1');
    } catch (e) {
        console.warn('[VicsCal] No se pudo notificar:', e);
    }
}

// ============================================================
//  RENDER
// ============================================================
function eventosDelDia(iso) {
    const todos = [
        ...eventosPersonales.map(e => ({ ...e, tipo: 'personal', esMio: true })),
        ...eventosPublicos.map(e => ({ ...e, tipo: 'publico', esMio: e.autor === usuarioActual.codigo }))
    ];
    let filtrados = todos.filter(e => e.fecha === iso);

    if (filtroActual === 'mios') {
        filtrados = filtrados.filter(e => e.esMio);
    } else if (filtroActual === 'publicos') {
        filtrados = filtrados.filter(e => e.tipo === 'publico');
    }
    return filtrados;
}

function renderizarCalendario() {
    const grid = document.getElementById('caDiasGrid');
    const titulo = document.getElementById('caMesTitulo');
    titulo.textContent = `${MESES[mesActual]} ${añoActual}`;

    const primerDia = new Date(añoActual, mesActual, 1).getDay();
    const diasEnMes = new Date(añoActual, mesActual + 1, 0).getDate();
    const diasMesAnterior = new Date(añoActual, mesActual, 0).getDate();
    const offset = primerDia === 0 ? 6 : primerDia - 1;

    const hoyStr = hoyISO();
    let html = '';

    // Relleno del mes anterior
    for (let i = 0; i < offset; i++) {
        const d = diasMesAnterior - offset + 1 + i;
        html += `<div class="ca-dia vacio"><span class="ca-num">${d}</span></div>`;
    }

    // Días del mes
    for (let d = 1; d <= diasEnMes; d++) {
        const iso = fechaISO(añoActual, mesActual + 1, d);
        const evs = eventosDelDia(iso);
        const esHoy = iso === hoyStr;
        const seleccionado = iso === fechaSeleccionada;

        let minis = '';
        const maxMostrar = 3;
        evs.slice(0, maxMostrar).forEach(ev => {
            const color = ev.color || COLORES[0];
            const icono = ev.tipo === 'publico'
                ? '<span class="ca-mini-icono"><i data-lucide="globe"></i></span>'
                : '<span class="ca-mini-icono"><i data-lucide="user"></i></span>';
            minis += `
                <div class="ca-mini ${ev.tipo === 'publico' ? 'publico' : ''}"
                     style="background:${color}30; border-left-color:${color};"
                     title="${escapar(ev.titulo)}">
                    ${icono}
                    <span class="ca-mini-texto">${escapar(ev.titulo)}</span>
                </div>
            `;
        });
        if (evs.length > maxMostrar) {
            minis += `<div class="ca-mini-mas">+${evs.length - maxMostrar} más</div>`;
        }

        const clases = ['ca-dia'];
        if (esHoy) clases.push('hoy');
        if (seleccionado) clases.push('seleccionado');

        html += `<div class="${clases.join(' ')}" data-fecha="${iso}">
            <span class="ca-num">${d}</span>
            <div class="ca-mini-eventos">${minis}</div>
        </div>`;
    }

    // Relleno del mes siguiente
    const total = offset + diasEnMes;
    const sobrante = (7 - (total % 7)) % 7;
    for (let i = 1; i <= sobrante; i++) {
        html += `<div class="ca-dia vacio"><span class="ca-num">${i}</span></div>`;
    }

    grid.innerHTML = html;

    // Click en día
    grid.querySelectorAll('.ca-dia:not(.vacio)').forEach(el => {
        el.addEventListener('click', () => {
            fechaSeleccionada = el.dataset.fecha;
            renderizarCalendario();
            renderizarPanel();
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function renderizarPanel() {
    const tituloEl = document.getElementById('caPanelTitulo');
    const fechaEl = document.getElementById('caPanelFecha');
    const body = document.getElementById('caPanelBody');

    if (!fechaSeleccionada) {
        tituloEl.textContent = 'Detalle del día';
        fechaEl.textContent = '—';
        body.innerHTML = `
            <div class="ca-vacio">
                <i data-lucide="calendar-search"></i>
                <p>Elegí un día para ver sus eventos, o creá uno nuevo.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const evs = eventosDelDia(fechaSeleccionada);
    tituloEl.textContent = 'Eventos';
    fechaEl.textContent = formatearFecha(fechaSeleccionada);

    if (evs.length === 0) {
        body.innerHTML = `
            <div class="ca-vacio">
                <i data-lucide="calendar-off"></i>
                <p>Sin eventos para este día.</p>
            </div>
            <button class="ca-panel-add" data-accion="nuevo">
                <i data-lucide="plus"></i>
                <span>Agregar evento</span>
            </button>`;
    } else {
        body.innerHTML = evs.map(ev => renderEventoCard(ev)).join('') + `
            <button class="ca-panel-add" data-accion="nuevo">
                <i data-lucide="plus"></i>
                <span>Agregar otro</span>
            </button>`;
    }

    // Wiring
    body.querySelector('[data-accion="nuevo"]')?.addEventListener('click', () => {
        abrirModalNuevo(fechaSeleccionada);
    });

    body.querySelectorAll('.ca-evento-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const tipo = btn.dataset.tipo;
            const accion = btn.dataset.accion;
            if (accion === 'editar') abrirModalEditar(id, tipo);
            if (accion === 'borrar') pedirBorrar(id, tipo);
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function renderEventoCard(ev) {
    const color = ev.color || COLORES[0];
    const esPublico = ev.tipo === 'publico';
    const badgeClase = esPublico ? 'publico' : 'personal';
    const badgeTexto = esPublico ? 'Público' : 'Personal';
    const badgeIcon = esPublico ? 'globe' : 'user';

    let autorHTML = '';
    if (esPublico && !ev.esMio) {
        autorHTML = `
            <div class="ca-evento-autor">
                <i data-lucide="user"></i>
                <span>por ${escapar(ev.autorNombre || ev.autor || '—')}</span>
            </div>`;
    }

    let accionesHTML = '';
    if (ev.esMio) {
        accionesHTML = `
            <div class="ca-evento-acciones">
                <button class="ca-evento-btn" data-accion="editar" data-id="${ev.id}" data-tipo="${ev.tipo}">
                    <i data-lucide="pencil"></i>
                    <span>Editar</span>
                </button>
                <button class="ca-evento-btn peligro" data-accion="borrar" data-id="${ev.id}" data-tipo="${ev.tipo}">
                    <i data-lucide="trash-2"></i>
                    <span>Eliminar</span>
                </button>
            </div>`;
    }

    return `
        <div class="ca-evento ${!ev.esMio ? 'ajeno' : ''}">
            <div class="ca-evento-top">
                <span class="ca-evento-color" style="background:${color};"></span>
                <span class="ca-evento-titulo">${escapar(ev.titulo)}</span>
                <span class="ca-evento-badge ${badgeClase}">
                    <i data-lucide="${badgeIcon}"></i>
                    ${badgeTexto}
                </span>
            </div>
            ${ev.descripcion ? `<div class="ca-evento-desc">${escapar(ev.descripcion)}</div>` : ''}
            ${autorHTML}
            ${accionesHTML}
        </div>
    `;
}

// ============================================================
//  MODAL
// ============================================================
function abrirModalNuevo(fecha) {
    eventoEditando = null;

    document.getElementById('caModalTitulo').innerHTML = `
        <i data-lucide="calendar-plus"></i>
        <span>Nuevo evento</span>`;
    document.getElementById('caModalGuardarTxt').textContent = 'Crear';

    setSelectoresFecha(fecha || hoyISO());
    document.getElementById('caTitulo').value = '';
    document.getElementById('caDescripcion').value = '';

    document.querySelector('input[name="caVisibilidad"][value="personal"]').checked = true;

    colorSeleccionado = COLORES[0];
    renderColores();

    document.getElementById('caModalStatus').textContent = '';
    document.getElementById('caModalStatus').className = 'ca-status';
    document.getElementById('caModalEvento').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => document.getElementById('caTitulo').focus(), 80);
}

function abrirModalEditar(id, tipo) {
    const lista = tipo === 'personal' ? eventosPersonales : eventosPublicos;
    const ev = lista.find(e => e.id === id);
    if (!ev) return;

    if (tipo === 'publico' && ev.autor !== usuarioActual.codigo) {
        toast('Solo podés editar tus propios eventos', 'error');
        return;
    }

    eventoEditando = { id, tipo };

    document.getElementById('caModalTitulo').innerHTML = `
        <i data-lucide="pencil"></i>
        <span>Editar evento</span>`;
    document.getElementById('caModalGuardarTxt').textContent = 'Guardar';

    setSelectoresFecha(ev.fecha);
    document.getElementById('caTitulo').value = ev.titulo;
    document.getElementById('caDescripcion').value = ev.descripcion || '';

    document.querySelector(`input[name="caVisibilidad"][value="${tipo}"]`).checked = true;

    colorSeleccionado = ev.color || COLORES[0];
    renderColores();

    document.getElementById('caModalStatus').textContent = '';
    document.getElementById('caModalStatus').className = 'ca-status';
    document.getElementById('caModalEvento').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => document.getElementById('caTitulo').focus(), 80);
}

function cerrarModal() {
    document.getElementById('caModalEvento').hidden = true;
    eventoEditando = null;
}

function renderColores() {
    const cont = document.getElementById('caColores');
    if (!cont) return;
    cont.innerHTML = COLORES.map(c => `
        <button type="button" class="ca-color ${c === colorSeleccionado ? 'seleccionado' : ''}"
                data-color="${c}" style="background:${c};"
                title="${c}"></button>
    `).join('');
    cont.querySelectorAll('.ca-color').forEach(btn => {
        btn.addEventListener('click', () => {
            colorSeleccionado = btn.dataset.color;
            renderColores();
        });
    });
}

async function guardarEvento(e) {
    e.preventDefault();
    if (guardando) return;

    const fecha = leerFechaDeSelectores();
    const titulo = document.getElementById('caTitulo').value.trim();
    const descripcion = document.getElementById('caDescripcion').value.trim();
    const visibilidad = document.querySelector('input[name="caVisibilidad"]:checked').value;
    const status = document.getElementById('caModalStatus');
    const btn = document.getElementById('caModalGuardar');

    const setStatus = (txt, tipo) => {
        status.textContent = txt || '';
        status.className = 'ca-status ' + (tipo || '');
    };

    if (!fecha) { setStatus('Elegí una fecha válida.', 'error'); return; }
    if (!titulo) { setStatus('El título es obligatorio.', 'error'); return; }
    if (titulo.length > MAX_TITULO) { setStatus(`Máximo ${MAX_TITULO} caracteres.`, 'error'); return; }

    const evBase = {
        id: eventoEditando ? eventoEditando.id : generarId('ev'),
        fecha,
        titulo,
        descripcion,
        color: colorSeleccionado
    };

    const esPublico = visibilidad === 'publico';
    if (esPublico) {
        evBase.autor = usuarioActual.codigo;
        evBase.autorNombre = usuarioActual.nombre || usuarioActual.codigo;
    }

    guardando = true;
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Guardando...';
    if (window.lucide) window.lucide.createIcons();

    try {
        if (eventoEditando) {
            const { id, tipo } = eventoEditando;

            if (tipo === 'personal' && esPublico) {
                eventosPersonales = eventosPersonales.filter(x => x.id !== id);
                eventosPublicos.push(evBase);
                await guardarPersonal();
                await guardarPublicos();
            } else if (tipo === 'publico' && !esPublico) {
                const ev = eventosPublicos.find(x => x.id === id);
                if (!ev || ev.autor !== usuarioActual.codigo) {
                    throw new Error('No podés mover un evento ajeno.');
                }
                eventosPublicos = eventosPublicos.filter(x => x.id !== id);
                eventosPersonales.push(evBase);
                await guardarPersonal();
                await guardarPublicos();
            } else if (tipo === 'personal') {
                const idx = eventosPersonales.findIndex(x => x.id === id);
                if (idx >= 0) eventosPersonales[idx] = evBase;
                await guardarPersonal();
            } else {
                const idx = eventosPublicos.findIndex(x => x.id === id);
                if (idx >= 0) eventosPublicos[idx] = evBase;
                await guardarPublicos();
            }
            toast('Evento actualizado', 'success');
        } else {
            if (esPublico) {
                eventosPublicos.push(evBase);
                await guardarPublicos();
            } else {
                eventosPersonales.push(evBase);
                await guardarPersonal();
            }
            toast('Evento creado', 'success');
        }

        cerrarModal();
        fechaSeleccionada = fecha;
        renderizarCalendario();
        renderizarPanel();
        await notificarEventosDeHoy();
    } catch (err) {
        console.warn('[VicsCal] Error guardando:', err);
        setStatus(err.message || 'No se pudo guardar.', 'error');
    } finally {
        guardando = false;
        btn.disabled = false;
        btn.innerHTML = original;
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  ELIMINAR
// ============================================================
function pedirBorrar(id, tipo) {
    const lista = tipo === 'personal' ? eventosPersonales : eventosPublicos;
    const ev = lista.find(e => e.id === id);
    if (!ev) return;

    if (tipo === 'publico' && ev.autor !== usuarioActual.codigo) {
        toast('Solo podés eliminar tus propios eventos', 'error');
        return;
    }

    pendingBorrar = { id, tipo };
    document.getElementById('caEliminarTexto').textContent =
        `¿Eliminar "${ev.titulo}"? Esta acción no se puede deshacer.`;
    document.getElementById('caModalEliminar').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarBorrar() {
    if (!pendingBorrar) return;
    const { id, tipo } = pendingBorrar;
    pendingBorrar = null;

    try {
        if (tipo === 'personal') {
            eventosPersonales = eventosPersonales.filter(x => x.id !== id);
            await guardarPersonal();
        } else {
            const ev = eventosPublicos.find(x => x.id === id);
            if (!ev || ev.autor !== usuarioActual.codigo) {
                throw new Error('No podés eliminar un evento ajeno.');
            }
            eventosPublicos = eventosPublicos.filter(x => x.id !== id);
            await guardarPublicos();
        }
        document.getElementById('caModalEliminar').hidden = true;
        toast('Evento eliminado', 'success');
        renderizarCalendario();
        renderizarPanel();
    } catch (e) {
        toast(e.message || 'No se pudo eliminar', 'error');
    }
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function mesAnterior() {
    mesActual--;
    if (mesActual < 0) { mesActual = 11; añoActual--; }
    fechaSeleccionada = null;
    renderizarCalendario();
    renderizarPanel();
}

function mesSiguiente() {
    mesActual++;
    if (mesActual > 11) { mesActual = 0; añoActual++; }
    fechaSeleccionada = null;
    renderizarCalendario();
    renderizarPanel();
}

function irAHoy() {
    const d = new Date();
    mesActual = d.getMonth();
    añoActual = d.getFullYear();
    fechaSeleccionada = hoyISO();
    renderizarCalendario();
    renderizarPanel();
}

// ============================================================
//  EVENTOS UI
// ============================================================
function bindUI() {
    document.getElementById('btnMesAnterior')?.addEventListener('click', mesAnterior);
    document.getElementById('btnMesSiguiente')?.addEventListener('click', mesSiguiente);
    document.getElementById('btnHoy')?.addEventListener('click', irAHoy);

    document.getElementById('btnRefrescar')?.addEventListener('click', async () => {
        toast('Actualizando...', 'info');
        await cargarTodo();
        renderizarCalendario();
        renderizarPanel();
        toast('Actualizado', 'success');
    });

    document.getElementById('btnNuevoEvento')?.addEventListener('click', () => {
        abrirModalNuevo(fechaSeleccionada || hoyISO());
    });

    // Filtros
    document.querySelectorAll('.ca-filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ca-filtro').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActual = btn.dataset.filtro;
            renderizarCalendario();
            renderizarPanel();
        });
    });

    // Modal evento
    document.getElementById('caModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('caModalCancelar')?.addEventListener('click', cerrarModal);
    document.getElementById('caModalEvento')?.addEventListener('click', (e) => {
        if (e.target.id === 'caModalEvento') cerrarModal();
    });
    document.getElementById('caFormEvento')?.addEventListener('submit', guardarEvento);

    // Modal eliminar
    document.getElementById('caEliminarCerrar')?.addEventListener('click', () => {
        document.getElementById('caModalEliminar').hidden = true;
        pendingBorrar = null;
    });
    document.getElementById('caEliminarCancelar')?.addEventListener('click', () => {
        document.getElementById('caModalEliminar').hidden = true;
        pendingBorrar = null;
    });
    document.getElementById('caEliminarConfirmar')?.addEventListener('click', confirmarBorrar);
    document.getElementById('caModalEliminar')?.addEventListener('click', (e) => {
        if (e.target.id === 'caModalEliminar') {
            e.target.hidden = true;
            pendingBorrar = null;
        }
    });

    // Escape
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('caModalEvento').hidden) { cerrarModal(); return; }
        if (!document.getElementById('caModalEliminar').hidden) {
            document.getElementById('caModalEliminar').hidden = true;
            pendingBorrar = null;
        }
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('VicsCal necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar el calendario.'); return; }

    const badge = document.getElementById('caUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarTodo();

    fechaSeleccionada = hoyISO();
    renderizarCalendario();
    renderizarPanel();
    inicializarSelectoresFecha();
    renderColores();
    bindUI();

    setTimeout(() => notificarEventosDeHoy(), 800);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);