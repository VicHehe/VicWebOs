// ============================================================
//  Constructor de CV — VicWebOs
//  ------------------------------------------------------------
//  · Datos privados: app/cv/{codigo}cv.json
//  · Un CV por usuario (como Notas)
//  · Preview en vivo, tema independiente del shell
//  · Descarga como PDF (html2canvas + jsPDF) o PNG
//  · Guardado automático con debounce
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_BASE = 'app/cv/';
const AUTOSAVE_DELAY = 1200;
const MAX_HABILIDADES = 30;

const NIVELES_IDIOMA = ['Básico', 'Intermedio', 'Avanzado', 'Nativo'];

// ---------- ESTADO ----------
let usuarioActual = null;
let datos = crearDatosVacios();
let temaCVActual = 'oficina';
let temaShellActual = 'violeta';
let temasDisponibles = [];
let fotoPreviewUrl = null;
let fotoIdActual = null;
let autosaveTimer = null;
let guardando = false;
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  TEMA DEL SHELL (para la app)
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
        tema: 'oficina',
        datos: {
            nombre: '',
            titulo: '',
            email: '',
            telefono: '',
            ubicacion: '',
            web: '',
            linkedin: '',
            fotoId: null,
            resumen: ''
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
    base.tema = d.tema || 'oficina';

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

    // Normalizar items de listas
    const normalizeItem = (item, camposExtra = []) => ({
        id: item.id || generarId('x'),
        ...Object.fromEntries(camposExtra.map(c => [c, item[c] || ''])),
    });

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
//  TEMA DEL CV (independiente del shell)
// ============================================================
function cargarTemasDisponibles() {
    try {
        const temas = window.parent.TEMAS_DISPONIBLES;
        if (Array.isArray(temas)) {
            temasDisponibles = temas.slice();
        }
    } catch (e) {
        temasDisponibles = [];
    }

    if (temasDisponibles.length === 0) {
        // Fallback mínimo
        temasDisponibles = [
            { id: 'violeta', nombre: 'Violeta Clásico', colores: {
                '--violet-100': '#EDE9FE', '--violet-300': '#C4B5FD', '--violet-500': '#8B5CF6',
                '--bg': '#FFFFFF', '--text': '#18181B', '--text-2': '#52525B'
            }},
            { id: 'oficina', nombre: 'Oficina', colores: {
                '--violet-100': '#E4E6EA', '--violet-300': '#A8AEB8', '--violet-500': '#4A5260',
                '--bg': '#FFFFFF', '--text': '#18181B', '--text-2': '#52525B'
            }}
        ];
    }
}

function llenarSelectorTemas() {
    const sel = document.getElementById('cvTemaSelect');
    if (!sel) return;
    sel.innerHTML = '';
    temasDisponibles.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nombre;
        sel.appendChild(opt);
    });

    // Añadir tema "Blanco y negro" como opción sobria extra
    const opt = document.createElement('option');
    opt.value = '__bn';
    opt.textContent = 'Blanco y Negro (sobrio)';
    sel.appendChild(opt);

    sel.value = datos.tema || 'oficina';
}

function aplicarTemaCV(temaId) {
    temaCVActual = temaId;
    datos.tema = temaId;

    const preview = document.getElementById('cvPreview');
    if (!preview) return;

    // Limpiar vars previas
    const vars = [
        '--violet-100','--violet-200','--violet-300','--violet-400',
        '--violet-500','--violet-600','--violet-700',
        '--bg','--bg-alt','--white','--text','--text-2','--text-3',
        '--gray-100','--gray-200','--gray-400','--gray-500'
    ];
    vars.forEach(v => preview.style.removeProperty(v));

    if (temaId === '__bn') {
        // Tema sobrio blanco y negro
        preview.style.setProperty('--violet-100', '#F4F4F5');
        preview.style.setProperty('--violet-200', '#E4E4E7');
        preview.style.setProperty('--violet-300', '#A1A1AA');
        preview.style.setProperty('--violet-400', '#71717A');
        preview.style.setProperty('--violet-500', '#27272A');
        preview.style.setProperty('--violet-600', '#3F3F46');
        preview.style.setProperty('--violet-700', '#18181B');
        preview.style.setProperty('--bg', '#FFFFFF');
        preview.style.setProperty('--bg-alt', '#FAFAFA');
        preview.style.setProperty('--white', '#FFFFFF');
        preview.style.setProperty('--text', '#18181B');
        preview.style.setProperty('--text-2', '#52525B');
        preview.style.setProperty('--text-3', '#71717A');
    } else {
        const tema = temasDisponibles.find(t => t.id === temaId);
        if (tema && tema.colores) {
            const colores = { ...tema.colores };
            // Forzar fondo blanco y texto oscuro para que el CV sea legible/imprimible
            // salvo que el tema sea oscuro explícito Y el usuario quiera conservarlo.
            // Regla: usamos --bg del tema, pero garantizamos --white = blanco para las cards.
            Object.entries(colores).forEach(([k, v]) => {
                preview.style.setProperty(k, v);
            });
            // Garantías para legibilidad del CV
            if (!preview.style.getPropertyValue('--text')) {
                preview.style.setProperty('--text', '#18181B');
            }
            if (!preview.style.getPropertyValue('--text-2')) {
                preview.style.setProperty('--text-2', '#52525B');
            }
        }
    }
    preview.setAttribute('data-tema', temaId);
}

// ============================================================
//  RENDER DEL FORM (rellenar inputs desde `datos`)
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

    // Foto
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

    if (fotoPreviewUrl) {
        try { URL.revokeObjectURL(fotoPreviewUrl); } catch (e) {}
        fotoPreviewUrl = null;
    }

    if (fotoIdActual) {
        wrap.classList.add('con-foto');
        btnQuitar.hidden = false;
        btnTxt.textContent = 'Cambiar foto';
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(fotoIdActual).then(url => {
                if (url) {
                    fotoPreviewUrl = url;
                    img.src = url;
                }
            }).catch(() => {});
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
                    <input type="month" data-campo="inicio">
                </div>
                <div class="cv-field">
                    <label>Fin</label>
                    <input type="month" data-campo="fin" ${exp.actual ? 'disabled' : ''}>
                </div>
                <label class="cv-check-actual">
                    <input type="checkbox" data-campo="actual" ${exp.actual ? 'checked' : ''}>
                    <span>Actual</span>
                </label>
            </div>
            <div class="cv-field">
                <label>Descripción</label>
                <textarea data-campo="descripcion" rows="3" maxlength="600"
                    placeholder="Logros, responsabilidades, tecnologías..."></textarea>
            </div>
        `;

        // Rellenar valores
        el.querySelector('[data-campo="puesto"]').value = exp.puesto;
        el.querySelector('[data-campo="empresa"]').value = exp.empresa;
        el.querySelector('[data-campo="ubicacion"]').value = exp.ubicacion;
        el.querySelector('[data-campo="inicio"]').value = exp.inicio;
        el.querySelector('[data-campo="fin"]').value = exp.fin;
        el.querySelector('[data-campo="descripcion"]').value = exp.descripcion;

        // Eventos
        el.querySelectorAll('input[data-campo], textarea[data-campo]').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const campo = e.target.dataset.campo;
                if (campo === 'actual') return;
                exp[campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            });
            inp.addEventListener('change', (e) => {
                const campo = e.target.dataset.campo;
                if (campo === 'actual') return;
                exp[campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            });
        });

        // Check "actual"
        const chkActual = el.querySelector('[data-campo="actual"]');
        const inFin = el.querySelector('[data-campo="fin"]');
        chkActual.addEventListener('change', (e) => {
            exp.actual = e.target.checked;
            inFin.disabled = exp.actual;
            if (exp.actual) exp.fin = '';
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
                    <input type="month" data-campo="inicio">
                </div>
                <div class="cv-field">
                    <label>Fin</label>
                    <input type="month" data-campo="fin" ${edu.actual ? 'disabled' : ''}>
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
        el.querySelector('[data-campo="inicio"]').value = edu.inicio;
        el.querySelector('[data-campo="fin"]').value = edu.fin;
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

        const chkActual = el.querySelector('[data-campo="actual"]');
        const inFin = el.querySelector('[data-campo="fin"]');
        chkActual.addEventListener('change', (e) => {
            edu.actual = e.target.checked;
            inFin.disabled = edu.actual;
            if (edu.actual) edu.fin = '';
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
            inp.addEventListener('input', (e) => {
                idi[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            });
            inp.addEventListener('change', (e) => {
                idi[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            });
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
            <div class="cv-grid-2">
                <div class="cv-field">
                    <label>Emisor</label>
                    <input type="text" data-campo="emisor" maxlength="80" placeholder="Ej: Amazon Web Services">
                </div>
                <div class="cv-field">
                    <label>Fecha</label>
                    <input type="month" data-campo="fecha">
                </div>
            </div>
        `;
        el.querySelector('[data-campo="nombre"]').value = cer.nombre;
        el.querySelector('[data-campo="emisor"]').value = cer.emisor;
        el.querySelector('[data-campo="fecha"]').value = cer.fecha;

        el.querySelectorAll('[data-campo]').forEach(inp => {
            const handler = (e) => {
                cer[e.target.dataset.campo] = e.target.value;
                renderPreview();
                agendarGuardado();
            };
            inp.addEventListener('input', handler);
            inp.addEventListener('change', handler);
        });

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
//  RENDER: PREVIEW DEL CV
// ============================================================
function renderPreview() {
    const preview = document.getElementById('cvPreview');
    if (!preview) return;

    const d = datos.datos;
    const tieneAlgo = d.nombre || d.titulo || d.email || d.telefono || d.resumen ||
        datos.experiencia.length || datos.educacion.length ||
        datos.habilidades.length || datos.idiomas.length || datos.certificaciones.length;

    if (!tieneAlgo) {
        preview.innerHTML = `
            <div class="cv-doc-vacio">
                <i data-lucide="file-user"></i>
                <h3>Tu CV está vacío</h3>
                <p>Empezá a rellenar el formulario de la izquierda y verás tu CV aparecer acá.</p>
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

    // ---- HEADER ----
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

    // ---- RESUMEN ----
    if (d.resumen) {
        html += `
            <section class="cv-doc-seccion">
                <div class="cv-doc-seccion-titulo">Perfil profesional</div>
                <div class="cv-doc-resumen">${escapar(d.resumen)}</div>
            </section>
        `;
    }

    // ---- EXPERIENCIA ----
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

    // ---- EDUCACIÓN ----
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

    // ---- HABILIDADES ----
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

    // ---- IDIOMAS ----
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

    // ---- CERTIFICACIONES ----
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

    html += '</div>';  // .cv-doc

    preview.innerHTML = html;

    // Cargar foto real si existe
    if (d.fotoId) {
        const mh = MH();
        const fotoEl = preview.querySelector(`[data-foto-id="${d.fotoId}"]`);
        if (mh && fotoEl) {
            mh.galeria.leerImagenURL(d.fotoId).then(url => {
                if (url) {
                    fotoEl.innerHTML = `<img src="${url}" alt="">`;
                    fotoEl.querySelector('img').onload = () => URL.revokeObjectURL(url);
                }
            }).catch(() => {});
        }
    }

    if (window.lucide) window.lucide.createIcons();
    ajustarEscalaPreview();
}

// ============================================================
//  ESCALA DEL PREVIEW (para que quepa en el contenedor)
// ============================================================
function ajustarEscalaPreview() {
    const wrapper = document.querySelector('.cv-preview-wrapper');
    const preview = document.getElementById('cvPreview');
    const stage = document.getElementById('cvPreviewStage');
    if (!wrapper || !preview || !stage) return;

    // Tamaño natural del preview
    const ancho = preview.offsetWidth;
    const alto = preview.offsetHeight;

    // Espacio disponible
    const stageRect = stage.getBoundingClientRect();
    const padding = 48;  // 24 por lado
    const anchoDisp = stageRect.width - padding;
    const altoDisp = stageRect.height - padding;

    // Calcular escala
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
        ['inResumen',    'resumen']
    ];
    binds.forEach(([id, campo]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            datos.datos[campo] = e.target.value;
            if (campo === 'resumen') {
                document.getElementById('resumenCount').textContent = e.target.value.length;
            }
            renderPreview();
            agendarGuardado();
        });
    });
}

// ============================================================
//  EVENTOS: NAVEGACIÓN DEL FORM
// ============================================================
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

// ============================================================
//  EVENTOS: AÑADIR ITEMS
// ============================================================
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

// ============================================================
//  EVENTOS: HABILIDADES
// ============================================================
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

// ============================================================
//  EVENTOS: FOTO
// ============================================================
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

// ============================================================
//  EVENTOS: SELECTOR DE TEMA DEL CV
// ============================================================
function bindTemaSelect() {
    const sel = document.getElementById('cvTemaSelect');
    sel?.addEventListener('change', (e) => {
        aplicarTemaCV(e.target.value);
        renderPreview();
        agendarGuardado();
    });
}

// ============================================================
//  EVENTOS: TABS MÓVIL
// ============================================================
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
//  DESCARGA: PNG
// ============================================================
async function descargarPNG() {
    const overlay = document.getElementById('cvOverlay');
    const overlayTxt = document.getElementById('cvOverlayTxt');
    if (overlay) overlay.hidden = false;
    if (overlayTxt) overlayTxt.textContent = 'Generando PNG...';

    // Quitar transform temporalmente
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

    try {
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#FFFFFF',
            logging: false
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
        preview.style.transform = prevTransform;
        wrapper.style.width = prevWrapperW;
        wrapper.style.height = prevWrapperH;
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
    const prevTransform = preview.style.transform;
    const prevWrapperW = wrapper.style.width;
    const prevWrapperH = wrapper.style.height;

    preview.style.transform = 'none';
    wrapper.style.width = '';
    wrapper.style.height = '';

    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => setTimeout(r, 60));

    try {
        const canvas = await html2canvas(preview, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#FFFFFF',
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');

        // jsPDF en UMD: window.jspdf.jsPDF
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

        // Escalar imagen al ancho de la página
        const anchoImgMM = anchoPaginaMM - (margenMM * 2);
        const altoImgMM = (canvas.height / canvas.width) * anchoImgMM;

        if (altoImgMM <= altoPaginaMM - (margenMM * 2)) {
            // Una sola página
            pdf.addImage(imgData, 'PNG', margenMM, margenMM, anchoImgMM, altoImgMM);
        } else {
            // Multi-página: cortamos la imagen
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
        preview.style.transform = prevTransform;
        wrapper.style.width = prevWrapperW;
        wrapper.style.height = prevWrapperH;
        if (overlay) overlay.hidden = true;
    }
}

// ============================================================
//  EVENTOS: DESCARGA Y GUARDADO MANUAL
// ============================================================
function bindDescargas() {
    document.getElementById('btnDescargarPDF')?.addEventListener('click', descargarPDF);
    document.getElementById('btnDescargarPNG')?.addEventListener('click', descargarPNG);
    document.getElementById('btnGuardar')?.addEventListener('click', () => guardar(false));
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Constructor de CV necesita estar dentro de VicWebOs.'); return; }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('cvUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    cargarTemasDisponibles();
    await cargar();

    // Si el CV está vacío, pre-rellenamos el nombre con el del usuario
    if (!datos.datos.nombre && usuarioActual.nombre) {
        datos.datos.nombre = usuarioActual.nombre;
    }

    llenarSelectorTemas();
    aplicarTemaCV(datos.tema || 'oficina');
    renderForm();
    renderPreview();

    // Bindings
    bindForm();
    bindNavegacion();
    bindAddItems();
    bindHabilidades();
    bindFoto();
    bindTemaSelect();
    bindTabsMovil();
    bindDescargas();

    // Resize para reajustar la escala
    window.addEventListener('resize', () => {
        ajustarEscalaPreview();
    });

    // Guardado al cerrar
    window.addEventListener('pagehide', () => {
        clearTimeout(autosaveTimer);
        guardar(true);
    });

    if (window.lucide) window.lucide.createIcons();
    setTimeout(ajustarEscalaPreview, 100);
}

document.addEventListener('DOMContentLoaded', inicializar);
