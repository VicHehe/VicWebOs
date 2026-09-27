// ============================================================
//  Constructor de CV — VicWebOs
//  ------------------------------------------------------------
//  · Datos privados: app/cv/{codigo}cv.json
//  · Un CV por usuario
//  · Preview en vivo, tema INDEPENDIENTE del shell
//  · Temas disponibles = solo los que el usuario tiene instalados
//  · Descarga PDF (html2canvas + jsPDF) y PNG
//  · Fuente del CV: Inter (profesional)
//  · Guardado automático con debounce
//  ------------------------------------------------------------
//  NOTA sobre fechas: input[type="month"] no es escribible en
//  Chrome y no funciona bien en Firefox dentro de iframes.
//  Se usan dos <select> (mes + año) para máxima compatibilidad.
//  El valor se guarda igual: "YYYY-MM".
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_BASE = 'app/cv/';
const AUTOSAVE_DELAY = 1200;
const MAX_HABILIDADES = 30;
const TEMA_BN = '__bn';

const NIVELES_IDIOMA = ['Básico', 'Intermedio', 'Avanzado', 'Nativo'];

const MESES = [
    { v: '01', n: 'Enero' },
    { v: '02', n: 'Febrero' },
    { v: '03', n: 'Marzo' },
    { v: '04', n: 'Abril' },
    { v: '05', n: 'Mayo' },
    { v: '06', n: 'Junio' },
    { v: '07', n: 'Julio' },
    { v: '08', n: 'Agosto' },
    { v: '09', n: 'Septiembre' },
    { v: '10', n: 'Octubre' },
    { v: '11', n: 'Noviembre' },
    { v: '12', n: 'Diciembre' }
];

const ANIO_ACTUAL = new Date().getFullYear();
const ANIO_MIN = 1970;
const ANIO_MAX = ANIO_ACTUAL + 10;

// ---------- ESTADO ----------
let usuarioActual = null;
let datos = crearDatosVacios();
let temaCVActual = null;
let temasDisponibles = [];
let cacheVarsTemas = {};
let fotoIdActual = null;
let autosaveTimer = null;
let guardando = false;
let toastTimer = null;
let inicializado = false;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

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
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function generarId(p) {
    return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('cvToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'cv-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function rutaArchivo() {
    if (!usuarioActual) return null;
    return RUTA_BASE + usuarioActual.codigo + 'cv.json';
}

function formatearFecha(yyyymm) {
    if (!yyyymm) return '';
    const [y, m] = yyyymm.split('-');
    if (!y || !m) return yyyymm;
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const idx = parseInt(m, 10) - 1;
    return `${meses[idx] || m} ${y}`;
}

function rangoFechas(item) {
    const ini = formatearFecha(item.inicio);
    const fin = item.actual ? 'Actual' : formatearFecha(item.fin);
    if (!ini && !fin) return '';
    if (!ini) return fin;
    if (!fin) return ini;
    return `${ini} — ${fin}`;
}

// ============================================================
//  ESTRUCTURA DE DATOS
// ============================================================
function crearDatosVacios() {
    return {
        version: 1,
        actualizado: null,
        tema: null,
        datos: {
            nombre: '',
            titulo: '',
            email: '',
            telefono: '',
            ubicacion: '',
            web: '',
            linkedin: '',
            fotoId: null,
            resumen: '',
            objetivo: ''
        },
        experiencia: [],
        educacion: [],
        habilidades: [],
        idiomas: [],
        certificaciones: []
    };
}

function normalizarDatos(d) {
    const base = crearDatosVacios();
    if (!d || typeof d !== 'object') return base;

    base.version = 1;
    base.actualizado = d.actualizado || null;
    base.tema = d.tema || null;

    if (d.datos && typeof d.datos === 'object') {
        Object.keys(base.datos).forEach(k => {
            if (d.datos[k] !== undefined) base.datos[k] = d.datos[k];
        });
    }
    if (Array.isArray(d.experiencia))     base.experiencia = d.experiencia;
    if (Array.isArray(d.educacion))       base.educacion = d.educacion;
    if (Array.isArray(d.habilidades))     base.habilidades = d.habilidades.filter(h => typeof h === 'string');
    if (Array.isArray(d.idiomas))         base.idiomas = d.idiomas;
    if (Array.isArray(d.certificaciones)) base.certificaciones = d.certificaciones;

    base.experiencia = base.experiencia.map(e => ({
        id: e.id || generarId('exp'),
        puesto: e.puesto || '',
        empresa: e.empresa || '',
        ubicacion: e.ubicacion || '',
        inicio: e.inicio || '',
        fin: e.fin || '',
        actual: !!e.actual,
        descripcion: e.descripcion || ''
    }));
    base.educacion = base.educacion.map(e => ({
        id: e.id || generarId('edu'),
        titulo: e.titulo || '',
        institucion: e.institucion || '',
        ubicacion: e.ubicacion || '',
        inicio: e.inicio || '',
        fin: e.fin || '',
        actual: !!e.actual,
        descripcion: e.descripcion || ''
    }));
    base.idiomas = base.idiomas.map(i => ({
        id: i.id || generarId('idi'),
        idioma: i.idioma || '',
        nivel: NIVELES_IDIOMA.includes(i.nivel) ? i.nivel : 'Intermedio'
    }));
    base.certificaciones = base.certificaciones.map(c => ({
        id: c.id || generarId('cer'),
        nombre: c.nombre || '',
        emisor: c.emisor || '',
        fecha: c.fecha || ''
    }));

    return base;
}

// ============================================================
//  HELPERS DE FECHAS (dos selects: mes + año)
// ============================================================
function opcionesMeses(valor) {
    return MESES.map(m =>
        `<option value="${m.v}" ${valor === m.v ? 'selected' : ''}>${m.n}</option>`
    ).join('');
}

function opcionesAnios(valor) {
    let html = `<option value="">Año</option>`;
    for (let a = ANIO_MAX; a >= ANIO_MIN; a--) {
        html += `<option value="${a}" ${String(valor) === String(a) ? 'selected' : ''}>${a}</option>`;
    }
    return html;
}

function parsearFecha(yyyymm) {
    if (!yyyymm || typeof yyyymm !== 'string') return { mes: '', anio: '' };
    const [y, m] = yyyymm.split('-');
    return { mes: m || '', anio: y || '' };
}

function componerFecha(mes, anio) {
    if (!mes || !anio) return '';
    return `${anio}-${mes}`;
}

// ============================================================
//  CARGA / GUARDA
// ============================================================
async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        datos = normalizarDatos(data);
    } catch (e) {
        console.warn('[CV] Error cargando:', e);
        datos = crearDatosVacios();
    }
}

async function guardar(silencioso = true) {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    if (guardando) return;
    guardando = true;
    try {
        datos.actualizado = new Date().toISOString();
        await bd.escribirArchivo(ruta, datos);
        if (!silencioso) toast('CV guardado', 'success');
    } catch (e) {
        console.warn('[CV] No se pudo guardar:', e);
        toast('No se pudo guardar', 'error');
    } finally {
        guardando = false;
    }
}

function agendarGuardado() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => guardar(true), AUTOSAVE_DELAY);
}

// ============================================================
//  TEMAS DEL CV
// ============================================================
const VARS_UTILES = new Set([
    '--violet-50','--violet-100','--violet-200','--violet-300',
    '--violet-400','--violet-500','--violet-600','--violet-700',
    '--bg','--bg-alt','--white',
    '--text','--text-2','--text-3',
    '--gray-100','--gray-200','--gray-300','--gray-400','--gray-500'
]);

const VARS_BN = {
    '--violet-50':  '#F4F4F5',
    '--violet-100': '#F4F4F5',
    '--violet-200': '#E4E4E7',
    '--violet-300': '#A1A1AA',
    '--violet-400': '#71717A',
    '--violet-500': '#27272A',
    '--violet-600': '#3F3F46',
    '--violet-700': '#18181B',
    '--bg':         '#FFFFFF',
    '--bg-alt':     '#FAFAFA',
    '--white':      '#FFFFFF',
    '--text':       '#18181B',
    '--text-2':     '#52525B',
    '--text-3':     '#71717A',
    '--gray-100':   '#F4F4F7',
    '--gray-200':   '#E8E8EE',
    '--gray-300':   '#D4D4DD',
    '--gray-400':   '#A1A1AD',
    '--gray-500':   '#71717A'
};

function cargarTemasDisponibles() {
    const api = API();

    if (!api) {
        temasDisponibles = [crearTemaBN()];
        return;
    }

    let todos = [];
    let instalados = [];
    try { todos = api.obtenerTemas?.() || []; }
    catch (e) { todos = []; }
    try { instalados = api.obtenerTemasInstalados?.() || []; }
    catch (e) { instalados = []; }

    if (!Array.isArray(instalados) || instalados.length === 0) {
        instalados = todos.filter(t => t.esBase).map(t => t.id);
        if (instalados.length === 0 && todos.length > 0) {
            instalados = [todos[0].id];
        }
    }

    const filtrados = todos
        .filter(t => instalados.includes(t.id))
        .sort((a, b) => {
            const catA = a.categoria || '';
            const catB = b.categoria || '';
            if (catA !== catB) return catA.localeCompare(catB);
            return (a.nombre || '').localeCompare(b.nombre || '');
        });

    temasDisponibles = filtrados;
    temasDisponibles.push(crearTemaBN());
}

function crearTemaBN() {
    return {
        id: TEMA_BN,
        nombre: 'Blanco y Negro',
        categoria: 'Sobrios',
        colores: { ...VARS_BN },
        ruta: null,
        _interno: true
    };
}

async function obtenerVarsTema(temaId) {
    if (cacheVarsTemas[temaId]) return cacheVarsTemas[temaId];

    const tema = temasDisponibles.find(t => t.id === temaId);
    if (!tema) return {};

    if (tema.id === TEMA_BN) {
        cacheVarsTemas[temaId] = { ...VARS_BN };
        return cacheVarsTemas[temaId];
    }

    let vars = { ...(tema.colores || {}) };

    if (tema.ruta) {
        try {
            const url = '../../' + tema.ruta;
            const res = await fetch(url);
            if (res.ok) {
                const css = await res.text();
                const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
                if (rootMatch) {
                    const bloque = rootMatch[1];
                    const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
                    let m;
                    while ((m = varRegex.exec(bloque)) !== null) {
                        const nombre = m[1].trim();
                        const valor  = m[2].trim();
                        if (VARS_UTILES.has(nombre)) {
                            vars[nombre] = valor;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[CV] No se pudo leer CSS del tema', temaId, e);
        }
    }

    if (!vars['--bg'])     vars['--bg']     = '#FFFFFF';
    if (!vars['--text'])   vars['--text']   = '#18181B';
    if (!vars['--text-2']) vars['--text-2'] = '#52525B';
    if (!vars['--white'])  vars['--white']  = '#FFFFFF';

    cacheVarsTemas[temaId] = vars;
    return vars;
}

async function aplicarTemaCV(temaId) {
    temaCVActual = temaId;
    datos.tema = temaId;

    const preview = document.getElementById('cvPreview');
    if (!preview) return;

    const limpiar = [
        '--violet-50','--violet-100','--violet-200','--violet-300',
        '--violet-400','--violet-500','--violet-600','--violet-700',
        '--bg','--bg-alt','--white',
        '--text','--text-2','--text-3',
        '--gray-100','--gray-200','--gray-300','--gray-400','--gray-500'
    ];
    limpiar.forEach(v => preview.style.removeProperty(v));

    const vars = await obtenerVarsTema(temaId);
    Object.entries(vars).forEach(([k, v]) => {
        if (VARS_UTILES.has(k)) {
            preview.style.setProperty(k, v);
        }
    });

    preview.setAttribute('data-tema', temaId);
}

function llenarSelectorTemas() {
    const sel = document.getElementById('cvTemaSelect');
    if (!sel) return;
    sel.innerHTML = '';

    if (temasDisponibles.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Sin temas disponibles';
        opt.disabled = true;
        sel.appendChild(opt);
        return;
    }

    temasDisponibles.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        const prefijo = t.categoria ? `${t.categoria} · ` : '';
        opt.textContent = prefijo + t.nombre;
        sel.appendChild(opt);
    });

    sel.value = temaCVActual || '';
}

// ============================================================
//  RENDER DEL FORM
// ============================================================
function renderForm() {
    document.getElementById('inNombre').value = datos.datos.nombre;
    document.getElementById('inTitulo').value = datos.datos.titulo;
    document.getElementById('inEmail').value = datos.datos.email;
    document.getElementById('inTelefono').value = datos.datos.telefono;
    document.getElementById('inUbicacion').value = datos.datos.ubicacion;
    document.getElementById('inWeb').value = datos.datos.web;
    document.getElementById('inLinkedin').value = datos.datos.linkedin;
    document.getElementById('inResumen').value = datos.datos.resumen;
    document.getElementById('resumenCount').textContent = datos.datos.resumen.length;
    document.getElementById('inObjetivo').value = datos.datos.objetivo;
    document.getElementById('objetivoCount').textContent = datos.datos.objetivo.length;

    fotoIdActual = datos.datos.fotoId;
    actualizarFotoPreview();

    renderListaExperiencia();
    renderListaEducacion();
    renderListaHabilidades();
    renderListaIdiomas();
    renderListaCertificaciones();
}

function actualizarFotoPreview() {
    const wrap = document.getElementById('cvFotoPreview');
    const img = document.getElementById('cvFotoImg');
    const btnQuitar = document.getElementById('btnQuitarFoto');
    const btnTxt = document.getElementById('cvFotoBtnTxt');

    if (fotoIdActual) {
        wrap.classList.add('con-foto');
        btnQuitar.hidden = false;
        btnTxt.textContent = 'Cambiar foto';
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenBlob(fotoIdActual).then(blob => {
                if (!blob) return;
                const r = new FileReader();
                r.onload = () => { img.src = r.result; };
                r.readAsDataURL(blob);
            }).catch(() => {
                mh.galeria.leerImagenURL(fotoIdActual).then(url => {
                    if (url) img.src = url;
                }).catch(() => {});
            });
        }
    } else {
        wrap.classList.remove('con-foto');
        img.removeAttribute('src');
        btnQuitar.hidden = true;
        btnTxt.textContent = 'Elegir foto';
    }
}

// ============================================================
//  RENDER: LISTA EXPERIENCIA
// ============================================================
function renderListaExperiencia() {
    const cont = document.getElementById('listaExperiencia');
    if (!cont) return;
    cont.innerHTML = '';
    datos.experiencia.forEach((exp, i) => {
        const el = document.createElement('div');
        el.className = 'cv-card-item';
        el.dataset.id = exp.id;

        const fIni = parsearFecha(exp.inicio);
        const fFin = parsearFecha(exp.fin);

        el.innerHTML = `
            <div class="cv-card-item-header">
                <span class="cv-card-item-titulo">Experiencia ${i + 1}</span>
                <div class="cv-card-item-acciones">
                    <button class="cv-item-btn cv-item-btn-danger" data-accion="eliminar" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="cv-field">
                <label>Puesto *</label>
                <input type="text" data-campo="puesto" maxlength="80" placeholder="Ej: Desarrollador Full-Stack">
            </div>
            <div class="cv-field">
                <label>Empresa *</label>
                <input type="text" data-campo="empresa" maxlength="80" placeholder="Ej: Acme Corp">
            </div>
            <div class="cv-field">
                <label>Ubicación</label>
                <input type="text" data-campo="ubicacion" maxlength="80" placeholder="Ej: Santiago, Chile (o Remoto)">
            </div>
            <div class="cv-fechas">
                <div class="cv-field">
                    <label>Inicio</label>
                    <div class="cv-fecha-par">
                        <select data-fecha="inicio-mes">${opcionesMeses(fIni.mes)}</select>
                        <select data-fecha="inicio-anio">${opcionesAnios(fIni.anio)}</select>
                    </div>
                </div>
                <div class="cv-field">
                    <label>Fin</label>
                    <div class="cv-fecha-par">
                        <select data-fecha="fin-mes" ${exp.actual ? 'disabled' : ''}>${opcionesMeses(fFin.mes)}</select>
                        <select data-fecha="fin-anio" ${exp.actual ? 'disabled' : ''}>${opcionesAnios(fFin.anio)}</select>
                    </div>
                </div>
                <label class="cv-check-actual">
                    <input type="checkbox" data-campo="actual" ${exp.actual ? 'checked' : ''}>
                    <span>Trabajo actual</span>
                </label>
            </div>
            <div class="cv-field">
                <label>Descripción</label>
                <textarea data-campo="descripcion" rows="3" maxlength="600"
                    placeholder="Logros, responsabilidades, tecnologías..."></textarea>
            </div>
        `;

        el.querySelector('[data-campo="puesto"]').value = exp.puesto;
        el.querySelector('[data-campo="empresa"]').value = exp.empresa;
        el.querySelector('[data-campo="ubicacion"]').value = exp.ubicacion;
        el.querySelector('[data-campo="descripcion"]').value = exp.descripcion;

        el.querySelectorAll('input[data-campo]:not([type="checkbox"]), textarea[data-campo]').forEach(inp => {
            const handler = (e) => {
                exp[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        const selIniMes  = el.querySelector('[data-fecha="inicio-mes"]');
        const selIniAnio = el.querySelector('[data-fecha="inicio-anio"]');
        const selFinMes  = el.querySelector('[data-fecha="fin-mes"]');
        const selFinAnio = el.querySelector('[data-fecha="fin-anio"]');

        const actualizarInicio = () => {
            exp.inicio = componerFecha(selIniMes.value, selIniAnio.value);
            renderPreview();
            agendarGuardado();
        };
        const actualizarFin = () => {
            exp.fin = componerFecha(selFinMes.value, selFinAnio.value);
            renderPreview();
            agendarGuardado();
        };
        selIniMes.addEventListener('change', actualizarInicio);
        selIniAnio.addEventListener('change', actualizarInicio);
        selFinMes.addEventListener('change', actualizarFin);
        selFinAnio.addEventListener('change', actualizarFin);

        const chkActual = el.querySelector('[data-campo="actual"]');
        chkActual.addEventListener('change', (e) => {
            exp.actual = e.target.checked;
            selFinMes.disabled = exp.actual;
            selFinAnio.disabled = exp.actual;
            if (exp.actual) {
                exp.fin = '';
                selFinMes.value = '';
                selFinAnio.value = '';
            }
            renderPreview();
            agendarGuardado();
        });

        el.querySelector('[data-accion="eliminar"]').addEventListener('click', () => {
            if (!confirm('¿Eliminar esta experiencia?')) return;
            datos.experiencia = datos.experiencia.filter(x => x.id !== exp.id);
            renderListaExperiencia();
            renderPreview();
            agendarGuardado();
        });

        cont.appendChild(el);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: LISTA EDUCACIÓN
// ============================================================
function renderListaEducacion() {
    const cont = document.getElementById('listaEducacion');
    if (!cont) return;
    cont.innerHTML = '';
    datos.educacion.forEach((edu, i) => {
        const el = document.createElement('div');
        el.className = 'cv-card-item';

        const fIni = parsearFecha(edu.inicio);
        const fFin = parsearFecha(edu.fin);

        el.innerHTML = `
            <div class="cv-card-item-header">
                <span class="cv-card-item-titulo">Educación ${i + 1}</span>
                <div class="cv-card-item-acciones">
                    <button class="cv-item-btn cv-item-btn-danger" data-accion="eliminar" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="cv-field">
                <label>Título *</label>
                <input type="text" data-campo="titulo" maxlength="80" placeholder="Ej: Ingeniería Civil Informática">
            </div>
            <div class="cv-field">
                <label>Institución *</label>
                <input type="text" data-campo="institucion" maxlength="80" placeholder="Ej: Universidad de Chile">
            </div>
            <div class="cv-field">
                <label>Ubicación</label>
                <input type="text" data-campo="ubicacion" maxlength="80" placeholder="Ej: Santiago, Chile">
            </div>
            <div class="cv-fechas">
                <div class="cv-field">
                    <label>Inicio</label>
                    <div class="cv-fecha-par">
                        <select data-fecha="inicio-mes">${opcionesMeses(fIni.mes)}</select>
                        <select data-fecha="inicio-anio">${opcionesAnios(fIni.anio)}</select>
                    </div>
                </div>
                <div class="cv-field">
                    <label>Fin</label>
                    <div class="cv-fecha-par">
                        <select data-fecha="fin-mes" ${edu.actual ? 'disabled' : ''}>${opcionesMeses(fFin.mes)}</select>
                        <select data-fecha="fin-anio" ${edu.actual ? 'disabled' : ''}>${opcionesAnios(fFin.anio)}</select>
                    </div>
                </div>
                <label class="cv-check-actual">
                    <input type="checkbox" data-campo="actual" ${edu.actual ? 'checked' : ''}>
                    <span>En curso</span>
                </label>
            </div>
            <div class="cv-field">
                <label>Descripción (opcional)</label>
                <textarea data-campo="descripcion" rows="2" maxlength="400"
                    placeholder="Mención, promedio, logros..."></textarea>
            </div>
        `;

        el.querySelector('[data-campo="titulo"]').value = edu.titulo;
        el.querySelector('[data-campo="institucion"]').value = edu.institucion;
        el.querySelector('[data-campo="ubicacion"]').value = edu.ubicacion;
        el.querySelector('[data-campo="descripcion"]').value = edu.descripcion;

        el.querySelectorAll('input[data-campo]:not([type="checkbox"]), textarea[data-campo]').forEach(inp => {
            const handler = (e) => {
                edu[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        const selIniMes  = el.querySelector('[data-fecha="inicio-mes"]');
        const selIniAnio = el.querySelector('[data-fecha="inicio-anio"]');
        const selFinMes  = el.querySelector('[data-fecha="fin-mes"]');
        const selFinAnio = el.querySelector('[data-fecha="fin-anio"]');

        const actualizarInicio = () => {
            edu.inicio = componerFecha(selIniMes.value, selIniAnio.value);
            renderPreview();
            agendarGuardado();
        };
        const actualizarFin = () => {
            edu.fin = componerFecha(selFinMes.value, selFinAnio.value);
            renderPreview();
            agendarGuardado();
        };
        selIniMes.addEventListener('change', actualizarInicio);
        selIniAnio.addEventListener('change', actualizarInicio);
        selFinMes.addEventListener('change', actualizarFin);
        selFinAnio.addEventListener('change', actualizarFin);

        const chkActual = el.querySelector('[data-campo="actual"]');
        chkActual.addEventListener('change', (e) => {
            edu.actual = e.target.checked;
            selFinMes.disabled = edu.actual;
            selFinAnio.disabled = edu.actual;
            if (edu.actual) {
                edu.fin = '';
                selFinMes.value = '';
                selFinAnio.value = '';
            }
            renderPreview();
            agendarGuardado();
        });

        el.querySelector('[data-accion="eliminar"]').addEventListener('click', () => {
            if (!confirm('¿Eliminar esta educación?')) return;
            datos.educacion = datos.educacion.filter(x => x.id !== edu.id);
            renderListaEducacion();
            renderPreview();
            agendarGuardado();
        });

        cont.appendChild(el);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: HABILIDADES
// ============================================================
function renderListaHabilidades() {
    const cont = document.getElementById('listaHabilidades');
    if (!cont) return;
    cont.innerHTML = '';
    datos.habilidades.forEach((hab, i) => {
        const el = document.createElement('span');
        el.className = 'cv-chip';
        el.innerHTML = `
            <span>${escapar(hab)}</span>
            <button class="cv-chip-btn" title="Eliminar">
                <i data-lucide="x"></i>
            </button>
        `;
        el.querySelector('.cv-chip-btn').addEventListener('click', () => {
            datos.habilidades.splice(i, 1);
            renderListaHabilidades();
            renderPreview();
            agendarGuardado();
        });
        cont.appendChild(el);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: IDIOMAS
// ============================================================
function renderListaIdiomas() {
    const cont = document.getElementById('listaIdiomas');
    if (!cont) return;
    cont.innerHTML = '';
    datos.idiomas.forEach((idi, i) => {
        const el = document.createElement('div');
        el.className = 'cv-card-item';
        el.innerHTML = `
            <div class="cv-card-item-header">
                <span class="cv-card-item-titulo">Idioma ${i + 1}</span>
                <div class="cv-card-item-acciones">
                    <button class="cv-item-btn cv-item-btn-danger" data-accion="eliminar" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="cv-grid-2">
                <div class="cv-field">
                    <label>Idioma</label>
                    <input type="text" data-campo="idioma" maxlength="40" placeholder="Ej: Español">
                </div>
                <div class="cv-field">
                    <label>Nivel</label>
                    <select data-campo="nivel">
                        ${NIVELES_IDIOMA.map(n => `<option value="${n}">${n}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;
        el.querySelector('[data-campo="idioma"]').value = idi.idioma;
        el.querySelector('[data-campo="nivel"]').value = idi.nivel;

        el.querySelectorAll('[data-campo]').forEach(inp => {
            const handler = (e) => {
                idi[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        el.querySelector('[data-accion="eliminar"]').addEventListener('click', () => {
            datos.idiomas = datos.idiomas.filter(x => x.id !== idi.id);
            renderListaIdiomas();
            renderPreview();
            agendarGuardado();
        });

        cont.appendChild(el);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: CERTIFICACIONES
// ============================================================
function renderListaCertificaciones() {
    const cont = document.getElementById('listaCertificaciones');
    if (!cont) return;
    cont.innerHTML = '';
    datos.certificaciones.forEach((cer, i) => {
        const el = document.createElement('div');
        el.className = 'cv-card-item';

        const fFecha = parsearFecha(cer.fecha);

        el.innerHTML = `
            <div class="cv-card-item-header">
                <span class="cv-card-item-titulo">Certificación ${i + 1}</span>
                <div class="cv-card-item-acciones">
                    <button class="cv-item-btn cv-item-btn-danger" data-accion="eliminar" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="cv-field">
                <label>Nombre</label>
                <input type="text" data-campo="nombre" maxlength="80" placeholder="Ej: AWS Certified Solutions Architect">
            </div>
            <div class="cv-field">
                <label>Emisor</label>
                <input type="text" data-campo="emisor" maxlength="80" placeholder="Ej: Amazon Web Services">
            </div>
            <div class="cv-field">
                <label>Fecha</label>
                <div class="cv-fecha-par">
                    <select data-fecha="fecha-mes">${opcionesMeses(fFecha.mes)}</select>
                    <select data-fecha="fecha-anio">${opcionesAnios(fFecha.anio)}</select>
                </div>
            </div>
        `;

        el.querySelector('[data-campo="nombre"]').value = cer.nombre;
        el.querySelector('[data-campo="emisor"]').value = cer.emisor;

        el.querySelectorAll('input[data-campo]').forEach(inp => {
            const handler = (e) => {
                cer[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

        const selMes  = el.querySelector('[data-fecha="fecha-mes"]');
        const selAnio = el.querySelector('[data-fecha="fecha-anio"]');
        const actualizarFecha = () => {
            cer.fecha = componerFecha(selMes.value, selAnio.value);
            renderPreview();
            agendarGuardado();
        };
        selMes.addEventListener('change', actualizarFecha);
        selAnio.addEventListener('change', actualizarFecha);

        el.querySelector('[data-accion="eliminar"]').addEventListener('click', () => {
            datos.certificaciones = datos.certificaciones.filter(x => x.id !== cer.id);
            renderListaCertificaciones();
            renderPreview();
            agendarGuardado();
        });

        cont.appendChild(el);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: PREVIEW
// ============================================================
function renderPreview() {
    const preview = document.getElementById('cvPreview');
    if (!preview) return;

    const d = datos.datos;
    const tieneAlgo = d.nombre || d.titulo || d.email || d.telefono || d.resumen || d.objetivo ||
        datos.experiencia.length || datos.educacion.length ||
        datos.habilidades.length || datos.idiomas.length || datos.certificaciones.length;

    if (!tieneAlgo) {
        preview.innerHTML = `
            <div class="cv-doc-vacio">
                <i data-lucide="file-user"></i>
                <h3>Tu CV está vacío</h3>
                <p>Empezá a rellenar el formulario y verás tu CV aparecer acá.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        ajustarEscalaPreview();
        return;
    }

    const contacto = [];
    if (d.email)     contacto.push({ icono: 'mail',     txt: d.email });
    if (d.telefono)  contacto.push({ icono: 'phone',    txt: d.telefono });
    if (d.ubicacion) contacto.push({ icono: 'map-pin',  txt: d.ubicacion });
    if (d.web)       contacto.push({ icono: 'globe',    txt: d.web });
    if (d.linkedin)  contacto.push({ icono: 'linkedin', txt: d.linkedin });

    let html = '<div class="cv-doc">';

    html += '<div class="cv-doc-header">';
    if (d.fotoId) {
        html += `<div class="cv-doc-foto" data-foto-id="${escapar(d.fotoId)}"><i data-lucide="user"></i></div>`;
    }
    html += '<div class="cv-doc-header-info">';
    html += `<h1 class="cv-doc-nombre">${escapar(d.nombre || 'Tu Nombre')}</h1>`;
    if (d.titulo) html += `<p class="cv-doc-titulo">${escapar(d.titulo)}</p>`;
    if (contacto.length > 0) {
        html += '<div class="cv-doc-contacto">';
        contacto.forEach(c => {
            html += `
                <div class="cv-doc-contacto-linea">
                    <i data-lucide="${c.icono}"></i>
                    <span>${escapar(c.txt)}</span>
                </div>
            `;
        });
        html += '</div>';
    }
    html += '</div></div>';

    if (d.resumen) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Perfil profesional</div>
                <div class="cv-doc-resumen">${escapar(d.resumen)}</div>
            </section>
        `;
    }

    if (d.objetivo) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Objetivo</div>
                <div class="cv-doc-objetivo">${escapar(d.objetivo)}</div>
            </section>
        `;
    }

    if (datos.experiencia.length > 0) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Experiencia laboral</div>
        `;
        datos.experiencia.forEach(exp => {
            const sub = [exp.empresa, exp.ubicacion].filter(Boolean).join(' · ');
            html += `
                <div class="cv-doc-item">
                    <div class="cv-doc-item-header">
                        <div class="cv-doc-item-titulo">${escapar(exp.puesto || 'Puesto')}</div>
                        ${rangoFechas(exp) ? `<span class="cv-doc-item-fecha">${escapar(rangoFechas(exp))}</span>` : ''}
                    </div>
                    ${sub ? `<div class="cv-doc-item-sub">${escapar(sub)}</div>` : ''}
                    ${exp.descripcion ? `<div class="cv-doc-item-desc">${escapar(exp.descripcion)}</div>` : ''}
                </div>
            `;
        });
        html += '</section>';
    }

    if (datos.educacion.length > 0) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Educación</div>
        `;
        datos.educacion.forEach(edu => {
            const sub = [edu.institucion, edu.ubicacion].filter(Boolean).join(' · ');
            html += `
                <div class="cv-doc-item">
                    <div class="cv-doc-item-header">
                        <div class="cv-doc-item-titulo">${escapar(edu.titulo || 'Título')}</div>
                        ${rangoFechas(edu) ? `<span class="cv-doc-item-fecha">${escapar(rangoFechas(edu))}</span>` : ''}
                    </div>
                    ${sub ? `<div class="cv-doc-item-sub">${escapar(sub)}</div>` : ''}
                    ${edu.descripcion ? `<div class="cv-doc-item-desc">${escapar(edu.descripcion)}</div>` : ''}
                </div>
            `;
        });
        html += '</section>';
    }

    if (datos.habilidades.length > 0) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Habilidades</div>
                <div class="cv-doc-habilidades">
                    ${datos.habilidades.map(h => `<span class="cv-doc-habilidad">${escapar(h)}</span>`).join('')}
                </div>
            </section>
        `;
    }

    if (datos.idiomas.length > 0) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Idiomas</div>
                <div class="cv-doc-idiomas">
                    ${datos.idiomas.map(i => `
                        <div class="cv-doc-idioma">
                            <span class="cv-doc-idioma-nombre">${escapar(i.idioma)}</span>
                            <span class="cv-doc-idioma-nivel">${escapar(i.nivel)}</span>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }

    if (datos.certificaciones.length > 0) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Certificaciones</div>
        `;
        datos.certificaciones.forEach(cer => {
            const sub = [cer.emisor, formatearFecha(cer.fecha)].filter(Boolean).join(' · ');
            html += `
                <div class="cv-doc-item">
                    <div class="cv-doc-item-titulo">${escapar(cer.nombre || 'Certificación')}</div>
                    ${sub ? `<div class="cv-doc-item-sub">${escapar(sub)}</div>` : ''}
                </div>
            `;
        });
        html += '</section>';
    }

    html += '</div>';

    preview.innerHTML = html;

    if (d.fotoId) {
        const mh = MH();
        const fotoEl = preview.querySelector(`[data-foto-id="${d.fotoId}"]`);
        if (mh && fotoEl) {
            mh.galeria.leerImagenBlob(d.fotoId).then(blob => {
                if (!blob) return;
                const r = new FileReader();
                r.onload = () => {
                    fotoEl.innerHTML = `<img src="${r.result}" alt="">`;
                };
                r.readAsDataURL(blob);
            }).catch(() => {
                mh.galeria.leerImagenURL(d.fotoId).then(url => {
                    if (url) fotoEl.innerHTML = `<img src="${url}" alt="">`;
                }).catch(() => {});
            });
        }
    }

    if (window.lucide) window.lucide.createIcons();
    ajustarEscalaPreview();
}

// ============================================================
//  ESCALA DEL PREVIEW
// ============================================================
function ajustarEscalaPreview() {
    const wrapper = document.querySelector('.cv-preview-wrapper');
    const preview = document.getElementById('cvPreview');
    const stage = document.getElementById('cvPreviewStage');
    if (!wrapper || !preview || !stage) return;

    const ancho = preview.offsetWidth;
    const alto = preview.offsetHeight;

    const stageRect = stage.getBoundingClientRect();
    const padding = 48;
    const anchoDisp = stageRect.width - padding;
    const altoDisp = stageRect.height - padding;

    const escala = Math.min(1, anchoDisp / ancho, altoDisp / alto);

    preview.style.transform = `scale(${escala})`;
    wrapper.style.width = (ancho * escala) + 'px';
    wrapper.style.height = (alto * escala) + 'px';
}

// ============================================================
//  EVENTOS: FORM
// ============================================================
function bindForm() {
    const binds = [
        ['inNombre',     'nombre'],
        ['inTitulo',     'titulo'],
        ['inEmail',      'email'],
        ['inTelefono',   'telefono'],
        ['inUbicacion',  'ubicacion'],
        ['inWeb',        'web'],
        ['inLinkedin',   'linkedin'],
        ['inResumen',    'resumen'],
        ['inObjetivo',   'objetivo']
    ];
    binds.forEach(([id, campo]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            datos.datos[campo] = e.target.value;
            if (campo === 'resumen') {
                document.getElementById('resumenCount').textContent = e.target.value.length;
            }
            if (campo === 'objetivo') {
                document.getElementById('objetivoCount').textContent = e.target.value.length;
            }
            renderPreview();
            agendarGuardado();
        });
    });
}

function bindNavegacion() {
    document.querySelectorAll('.cv-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.cv-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.cv-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.querySelector(`.cv-panel[data-panel="${btn.dataset.seccion}"]`);
            if (panel) panel.classList.add('active');
        });
    });
}

function bindAddItems() {
    document.querySelectorAll('[data-add]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.add;
            if (tipo === 'experiencia') {
                datos.experiencia.push({
                    id: generarId('exp'),
                    puesto: '', empresa: '', ubicacion: '',
                    inicio: '', fin: '', actual: false, descripcion: ''
                });
                renderListaExperiencia();
            }
            if (tipo === 'educacion') {
                datos.educacion.push({
                    id: generarId('edu'),
                    titulo: '', institucion: '', ubicacion: '',
                    inicio: '', fin: '', actual: false, descripcion: ''
                });
                renderListaEducacion();
            }
            if (tipo === 'idiomas') {
                datos.idiomas.push({
                    id: generarId('idi'), idioma: '', nivel: 'Intermedio'
                });
                renderListaIdiomas();
            }
            if (tipo === 'certificaciones') {
                datos.certificaciones.push({
                    id: generarId('cer'), nombre: '', emisor: '', fecha: ''
                });
                renderListaCertificaciones();
            }
            renderPreview();
            agendarGuardado();
        });
    });
}

function bindHabilidades() {
    const input = document.getElementById('inHabilidad');
    const btn = document.getElementById('btnAddHabilidad');
    const add = () => {
        const txt = (input.value || '').trim().slice(0, 40);
        if (!txt) return;
        if (datos.habilidades.length >= MAX_HABILIDADES) {
            toast(`Máximo ${MAX_HABILIDADES} habilidades`, 'error');
            return;
        }
        if (datos.habilidades.includes(txt)) {
            toast('Ya está en la lista', 'info');
            return;
        }
        datos.habilidades.push(txt);
        input.value = '';
        renderListaHabilidades();
        renderPreview();
        agendarGuardado();
    };
    btn?.addEventListener('click', add);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); add(); }
    });
}

function bindFoto() {
    document.getElementById('btnElegirFoto')?.addEventListener('click', async () => {
        const mh = MH();
        if (!mh) return;
        try {
            const id = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí tu foto de perfil' });
            if (!id) return;
            fotoIdActual = id;
            datos.datos.fotoId = id;
            actualizarFotoPreview();
            renderPreview();
            agendarGuardado();
        } catch (e) {
            console.warn('[CV] Error picker:', e);
        }
    });

    document.getElementById('btnQuitarFoto')?.addEventListener('click', () => {
        fotoIdActual = null;
        datos.datos.fotoId = null;
        actualizarFotoPreview();
        renderPreview();
        agendarGuardado();
    });
}

function bindTemaSelect() {
    const sel = document.getElementById('cvTemaSelect');
    sel?.addEventListener('change', async (e) => {
        if (!e.target.value) return;
        await aplicarTemaCV(e.target.value);
        renderPreview();
        agendarGuardado();
    });
}

function bindTabsMovil() {
    const app = document.querySelector('.cv-app');
    document.querySelectorAll('.cv-tab-movil').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cv-tab-movil').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const vista = tab.dataset.vista;
            app.dataset.vista = vista;
            if (vista === 'preview') {
                setTimeout(ajustarEscalaPreview, 60);
            }
        });
    });
    app.dataset.vista = 'editar';
}

// ============================================================
//  ESPERAS PARA EXPORT
// ============================================================
async function esperarFuentes() {
    if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (e) {}
    }
}

async function esperarImagenes(preview) {
    const imgs = Array.from(preview.querySelectorAll('img'));
    if (imgs.length === 0) return;
    await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            const done = () => resolve();
            img.addEventListener('load',  done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 3000);
        });
    }));
}

async function prepararCaptura() {
    const preview = document.getElementById('cvPreview');
    const wrapper = document.querySelector('.cv-preview-wrapper');

    const prevTransform = preview.style.transform;
    const prevWrapperW = wrapper.style.width;
    const prevWrapperH = wrapper.style.height;

    preview.style.transform = 'none';
    wrapper.style.width = '';
    wrapper.style.height = '';

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 60));

    await esperarFuentes();
    await esperarImagenes(preview);

    return { prevTransform, prevWrapperW, prevWrapperH };
}

function restaurarCaptura(preview, wrapper, prev) {
    preview.style.transform = prev.prevTransform;
    wrapper.style.width = prev.prevWrapperW;
    wrapper.style.height = prev.prevWrapperH;
}

// ============================================================
//  DESCARGA: PNG
// ============================================================
async function descargarPNG() {
    const overlay = document.getElementById('cvOverlay');
    const overlayTxt = document.getElementById('cvOverlayTxt');
    if (overlay) overlay.hidden = false;
    if (overlayTxt) overlayTxt.textContent = 'Generando PNG...';

    const preview = document.getElementById('cvPreview');
    const wrapper = document.querySelector('.cv-preview-wrapper');

    const prev = await prepararCaptura();

    try {
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#FFFFFF',
            logging: false,
            imageTimeout: 5000
        });
        const nombre = (datos.datos.nombre || 'CV').replace(/[^a-z0-9]/gi, '_');
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `CV_${nombre}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('PNG descargado', 'success');
    } catch (e) {
        console.warn('[CV] Error PNG:', e);
        toast('No se pudo generar el PNG', 'error');
    } finally {
        restaurarCaptura(preview, wrapper, prev);
        if (overlay) overlay.hidden = true;
    }
}

// ============================================================
//  DESCARGA: PDF
// ============================================================
async function descargarPDF() {
    const overlay = document.getElementById('cvOverlay');
    const overlayTxt = document.getElementById('cvOverlayTxt');
    if (overlay) overlay.hidden = false;
    if (overlayTxt) overlayTxt.textContent = 'Generando PDF...';

    const preview = document.getElementById('cvPreview');
    const wrapper = document.querySelector('.cv-preview-wrapper');

    const prev = await prepararCaptura();

    try {
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            allowTaint: false,
            backgroundColor: '#FFFFFF',
            logging: false,
            imageTimeout: 5000
        });
        const imgData = canvas.toDataURL('image/png');

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });

        const anchoPaginaMM = 210;
        const altoPaginaMM = 297;
        const margenMM = 0;

        const anchoImgMM = anchoPaginaMM - (margenMM * 2);
        const altoImgMM = (canvas.height / canvas.width) * anchoImgMM;

        if (altoImgMM <= altoPaginaMM - (margenMM * 2)) {
            pdf.addImage(imgData, 'PNG', margenMM, margenMM, anchoImgMM, altoImgMM);
        } else {
            const altoDisponible = altoPaginaMM - (margenMM * 2);
            const cantidadPaginas = Math.ceil(altoImgMM / altoDisponible);
            for (let i = 0; i < cantidadPaginas; i++) {
                if (i > 0) pdf.addPage();
                const offsetMM = -i * altoDisponible;
                pdf.addImage(imgData, 'PNG', margenMM, margenMM + offsetMM, anchoImgMM, altoImgMM);
            }
        }

        const nombre = (datos.datos.nombre || 'CV').replace(/[^a-z0-9]/gi, '_');
        pdf.save(`CV_${nombre}.pdf`);
        toast('PDF descargado', 'success');
    } catch (e) {
        console.warn('[CV] Error PDF:', e);
        toast('No se pudo generar el PDF', 'error');
    } finally {
        restaurarCaptura(preview, wrapper, prev);
        if (overlay) overlay.hidden = true;
    }
}

function bindDescargas() {
    document.getElementById('btnDescargarPDF')?.addEventListener('click', descargarPDF);
    document.getElementById('btnDescargarPNG')?.addEventListener('click', descargarPNG);
    document.getElementById('btnGuardar')?.addEventListener('click', () => guardar(false));
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Constructor de CV necesita estar dentro de VicWebOs.'); return; }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('cvUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    cargarTemasDisponibles();
    await cargar();

    if (!datos.tema || !temasDisponibles.find(t => t.id === datos.tema)) {
        datos.tema = temasDisponibles[0]?.id || TEMA_BN;
    }
    temaCVActual = datos.tema;

    if (!datos.datos.nombre && usuarioActual.nombre) {
        datos.datos.nombre = usuarioActual.nombre;
    }

    llenarSelectorTemas();
    await aplicarTemaCV(datos.tema);
    renderForm();
    renderPreview();

    bindForm();
    bindNavegacion();
    bindAddItems();
    bindHabilidades();
    bindFoto();
    bindTemaSelect();
    bindTabsMovil();
    bindDescargas();

    window.addEventListener('resize', ajustarEscalaPreview);

    window.addEventListener('pagehide', () => {
        clearTimeout(autosaveTimer);
        guardar(true);
    });

    if (window.lucide) window.lucide.createIcons();
    setTimeout(ajustarEscalaPreview, 100);
}

document.addEventListener('DOMContentLoaded', inicializar);
