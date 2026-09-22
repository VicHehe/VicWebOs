// ============================================================
//  Cevann — Editor de afiches temáticos
//  ------------------------------------------------------------
//  El usuario elige entre SUS temas instalados. El CSS del
//  tema se parsea (bloque :root) y las variables se aplican
//  inline al afiche. Los elementos son HTML/CSS puro, así
//  que el tema se aplica literalmente.
//
//  Export: el afiche se serializa a <foreignObject> SVG,
//  se embeben fuentes Nunito en base64, y se convierte a PNG.
//
//  Persistencia: IndexedDB (1 proyecto activo por usuario).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const IDB_NAME = 'VicWebOsCevann';
const IDB_VERSION = 1;
const IDB_STORE = 'proyectos';
const ARCHIVO_BASE = 'app/cevann/';

// ============================================================
//  FORMATOS Y PADDINGS
// ============================================================
const FORMATOS = {
    cuadrado:   { w: 1080, h: 1080, nombre: 'Cuadrado' },
    post:       { w: 1080, h: 1350, nombre: 'Post' },
    historia:   { w: 1080, h: 1920, nombre: 'Historia' },
    horizontal: { w: 1920, h: 1080, nombre: 'Horizontal' },
    afiche:     { w: 1080, h: 1620, nombre: 'Afiche' },
    carta:      { w: 1080, h: 1400, nombre: 'Carta' }
};

const PADDINGS = {
    pequeno: 0.05,
    medio: 0.08,
    grande: 0.13
};

// ============================================================
//  VARS POR DEFECTO (fallback si el tema no define algo)
// ============================================================
const VARS_DEFAULT = {
    '--bg': '#FBFBFD',
    '--bg-alt': '#F5F5F8',
    '--white': '#FFFFFF',
    '--gray-50': '#FAFAFB',
    '--gray-100': '#F4F4F7',
    '--gray-200': '#E8E8EE',
    '--gray-300': '#D4D4DD',
    '--gray-400': '#A1A1AD',
    '--gray-500': '#71717A',
    '--gray-600': '#52525B',
    '--gray-700': '#3F3F46',
    '--gray-800': '#27272A',
    '--gray-900': '#18181B',
    '--text': '#18181B',
    '--text-2': '#52525B',
    '--text-3': '#71717A',
    '--border': '#E8E8EE',
    '--violet-50': '#F5F3FF',
    '--violet-100': '#EDE9FE',
    '--violet-200': '#DDD6FE',
    '--violet-300': '#C4B5FD',
    '--violet-400': '#A78BFA',
    '--violet-500': '#8B5CF6',
    '--violet-600': '#7C3AED',
    '--violet-700': '#6D28D9',
    '--accent-gradient': 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    '--accent-gradient-hover': 'linear-gradient(135deg, #8B5CF6, #7C3AED)'
};

// ============================================================
//  PROPS DEFAULT POR TIPO DE ELEMENTO
// ============================================================
const PROPS_DEFAULT = {
    titulo:     { texto: 'Tu título aquí', tamano: 84, alineacion: 'centro', color: null },
    subtitulo:  { texto: 'Subtítulo', tamano: 36, alineacion: 'centro', color: null },
    parrafo:    { texto: 'Escribe aquí el texto de tu párrafo. Podés usar varias líneas.', tamano: 26, alineacion: 'izq', color: null },
    imagen:     { imagenId: null, dataUrl: null, alto: 320, alineacion: 'centro', esquinas: 20 },
    avatar:     { imagenId: null, dataUrl: null, tamano: 140, alineacion: 'centro' },
    separador:  { estilo: 'linea', grosor: 3, color: null },
    badge:      { texto: 'NUEVO', tamano: 20, alineacion: 'centro', colorFondo: null, colorTexto: '#FFFFFF' },
    forma:      { tipo: 'circulo', tamano: 90, alineacion: 'centro', color: null },
    espaciador: { alto: 40 }
};

const ICONO_TIPO = {
    titulo: 'heading-1', subtitulo: 'heading-2', parrafo: 'type',
    imagen: 'image', avatar: 'user', separador: 'minus',
    badge: 'tag', forma: 'circle', espaciador: 'move-vertical'
};

const NOMBRE_TIPO = {
    titulo: 'Título', subtitulo: 'Subtítulo', parrafo: 'Párrafo',
    imagen: 'Imagen', avatar: 'Avatar', separador: 'Separador',
    badge: 'Badge', forma: 'Forma', espaciador: 'Espaciador'
};

// ============================================================
//  ESTADO
// ============================================================
let usuarioActual = null;
let state = {
    formato: 'cuadrado',
    temaId: 'violeta',
    temaVars: null,
    padding: 'medio',
    elementos: []
};

let cacheVarsTemas = new Map();   // ruta -> vars
let cacheFuentesBase64 = null;
let elementoExpandidoId = null;
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ============================================================
//  TEMA (el propio del iframe, no el que se aplica al afiche)
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
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('cvToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'cv-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HELPERS
// ============================================================
function escapeHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    return escapeHTML(s);
}

function generarId() {
    return 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const result = String(r.result || '');
            const i = result.indexOf(',');
            resolve(i >= 0 ? result.slice(i + 1) : '');
        };
        r.onerror = reject;
        r.readAsDataURL(blob);
    });
}

// ============================================================
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

async function idbDelete(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveProyecto() {
    const codigo = usuarioActual?.codigo || 'invitado';
    return 'cv_' + codigo;
}

// ============================================================
//  TEMAS
// ============================================================
function rutaTemaAbsoluta(rutaRelativa) {
    // rutaRelativa viene tipo "Temas/violeta.css" (relativa a la raíz del sitio)
    // Este iframe está en herramientas/cevann/, así que subimos dos niveles.
    if (/^https?:\/\//i.test(rutaRelativa)) return rutaRelativa;
    return '../../' + rutaRelativa;
}

async function cargarVarsTema(tema) {
    if (!tema || !tema.ruta) return null;
    if (cacheVarsTemas.has(tema.ruta)) return cacheVarsTemas.get(tema.ruta);

    try {
        const res = await fetch(rutaTemaAbsoluta(tema.ruta), { cache: 'force-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const cssText = await res.text();

        // Extraer todas las declaraciones --var: valor; de bloques :root
        const vars = {};
        const rootRegex = /:root\s*\{([^}]+)\}/g;
        let match;
        while ((match = rootRegex.exec(cssText)) !== null) {
            match[1].split(';').forEach(line => {
                const idx = line.indexOf(':');
                if (idx < 0) return;
                const k = line.slice(0, idx).trim();
                const v = line.slice(idx + 1).trim();
                if (k.startsWith('--') && v && !(k in vars)) vars[k] = v;
            });
        }

        // Merge con defaults (vars del tema ganan)
        const merged = { ...VARS_DEFAULT, ...vars };
        cacheVarsTemas.set(tema.ruta, merged);
        return merged;
    } catch (e) {
        console.warn('[Cevann] No se pudo cargar tema:', tema.ruta, e);
        return { ...VARS_DEFAULT };
    }
}

// ============================================================
//  RENDER: POSTER
// ============================================================
function varsAInline(vars) {
    return Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
}

function obtenerPaddingPx() {
    const f = FORMATOS[state.formato];
    const minDim = Math.min(f.w, f.h);
    return Math.round(minDim * PADDINGS[state.padding]);
}

function renderElementoHTML(el) {
    const p = el.props;
    const alignMap = { izq: 'flex-start', centro: 'center', der: 'flex-end' };
    const textAlignMap = { izq: 'left', centro: 'center', der: 'right' };
    const align = alignMap[p.alineacion] || 'center';
    const textAlign = textAlignMap[p.alineacion] || 'center';

    switch (el.tipo) {
        case 'titulo':
            return `<div class="cv-el cv-el-titulo" style="font-size:${p.tamano}px;font-weight:800;line-height:1.1;letter-spacing:-0.02em;text-align:${textAlign};color:${p.color || 'var(--gray-900)'};word-break:break-word;">${escapeHTML(p.texto)}</div>`;

        case 'subtitulo':
            return `<div class="cv-el cv-el-subtitulo" style="font-size:${p.tamano}px;font-weight:700;line-height:1.3;letter-spacing:-0.01em;text-align:${textAlign};color:${p.color || 'var(--gray-600)'};word-break:break-word;">${escapeHTML(p.texto)}</div>`;

        case 'parrafo':
            return `<div class="cv-el cv-el-parrafo" style="font-size:${p.tamano}px;font-weight:500;line-height:1.55;text-align:${textAlign};color:${p.color || 'var(--gray-700)'};white-space:pre-wrap;word-break:break-word;">${escapeHTML(p.texto)}</div>`;

        case 'imagen':
            return p.dataUrl
                ? `<div class="cv-el cv-el-imagen" style="display:flex;justify-content:${align};"><img src="${p.dataUrl}" style="max-width:100%;height:${p.alto}px;object-fit:cover;border-radius:${p.esquinas}px;display:block;" /></div>`
                : `<div class="cv-el cv-el-imagen" style="display:flex;justify-content:${align};"><div style="width:60%;height:${p.alto}px;background:var(--gray-100);border:2px dashed var(--border);border-radius:${p.esquinas}px;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-weight:700;font-size:14px;">Sin imagen</div></div>`;

        case 'avatar':
            return p.dataUrl
                ? `<div class="cv-el cv-el-avatar" style="display:flex;justify-content:${align};"><img src="${p.dataUrl}" style="width:${p.tamano}px;height:${p.tamano}px;border-radius:50%;object-fit:cover;display:block;box-shadow:0 6px 18px rgba(0,0,0,0.18);" /></div>`
                : `<div class="cv-el cv-el-avatar" style="display:flex;justify-content:${align};"><div style="width:${p.tamano}px;height:${p.tamano}px;border-radius:50%;background:var(--gray-100);border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-weight:700;">Sin foto</div></div>`;

        case 'separador': {
            const color = p.color || 'var(--violet-400)';
            if (p.estilo === 'punteado') {
                return `<div class="cv-el cv-el-separador" style="height:${p.grosor * 2}px;background-image:linear-gradient(90deg,${color} 50%,transparent 50%);background-size:14px ${p.grosor}px;background-repeat:repeat-x;background-position:0 center;"></div>`;
            }
            if (p.estilo === 'degradado') {
                return `<div class="cv-el cv-el-separador" style="height:${p.grosor}px;background:linear-gradient(90deg, transparent, ${color}, transparent);border-radius:999px;"></div>`;
            }
            return `<div class="cv-el cv-el-separador" style="height:${p.grosor}px;background:${color};border-radius:999px;"></div>`;
        }

        case 'badge':
            return `<div class="cv-el cv-el-badge" style="display:flex;justify-content:${align};"><span style="display:inline-block;padding:8px 20px;background:${p.colorFondo || 'var(--accent-gradient)'};color:${p.colorTexto || '#FFFFFF'};font-size:${p.tamano}px;font-weight:800;letter-spacing:0.04em;border-radius:999px;text-transform:uppercase;">${escapeHTML(p.texto)}</span></div>`;

        case 'forma': {
            const color = p.color || 'var(--violet-500)';
            const radius = p.tipo === 'circulo' ? '50%' : '20px';
            return `<div class="cv-el cv-el-forma" style="display:flex;justify-content:${align};"><div style="width:${p.tamano}px;height:${p.tamano}px;background:${color};border-radius:${radius};"></div></div>`;
        }

        case 'espaciador':
            return `<div class="cv-el cv-el-espaciador" style="height:${p.alto}px;"></div>`;

        default:
            return '';
    }
}

function renderPoster() {
    const poster = document.getElementById('cvPoster');
    if (!poster) return;

    const f = FORMATOS[state.formato];
    const paddingPx = obtenerPaddingPx();
    const varsStr = varsAInline(state.temaVars || VARS_DEFAULT);

    poster.style.width = f.w + 'px';
    poster.style.height = f.h + 'px';
    poster.style.padding = paddingPx + 'px';
    poster.style.background = 'var(--bg, #FBFBFD)';
    poster.style.color = 'var(--gray-900, #18181B)';
    poster.style.gap = '24px';
    poster.style.position = 'absolute';
    poster.style.top = '50%';
    poster.style.left = '50%';
    // Ojo: el transform lo maneja actualizarEscala()
    poster.style.setProperty('transform-origin', 'center center');
    poster.setAttribute('style',
        poster.getAttribute('style') + ';' + varsStr
    );

    const inner = state.elementos.map(renderElementoHTML).join('');
    poster.innerHTML = inner || '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--gray-400);font-weight:700;font-size:16px;">Añadí elementos con el panel →</div>';

    actualizarPreviewInfo();
}

function actualizarPreviewInfo() {
    const f = FORMATOS[state.formato];
    const info = document.getElementById('cvPreviewInfo');
    if (info) info.textContent = `${f.w} × ${f.h}`;
}

function actualizarEscala() {
    const wrap = document.getElementById('cvPreviewWrap');
    const poster = document.getElementById('cvPoster');
    if (!wrap || !poster) return;

    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) return;

    const f = FORMATOS[state.formato];
    const paddingWrap = 48;
    const availW = Math.max(50, w - paddingWrap);
    const availH = Math.max(50, h - paddingWrap);

    const scale = Math.min(availW / f.w, availH / f.h, 1);
    poster.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

// ============================================================
//  RENDER: PANEL — FORMATOS
// ============================================================
function renderFormatos() {
    const cont = document.getElementById('cvFormatos');
    if (!cont) return;

    cont.innerHTML = Object.entries(FORMATOS).map(([id, f]) => {
        const activo = state.formato === id ? ' activo' : '';
        // Icono: un div con el aspect ratio del formato
        const ratio = f.w / f.h;
        let iconStyle = 'width:22px;height:22px;';
        if (ratio > 1) {
            iconStyle = `width:24px;height:${Math.round(24 / ratio)}px;`;
        } else if (ratio < 1) {
            iconStyle = `width:${Math.round(22 * ratio)}px;height:24px;`;
        }
        return `
            <button class="cv-formato-btn${activo}" data-formato="${id}">
                <div class="cv-formato-icono" style="${iconStyle}"></div>
                <span>${f.nombre}</span>
            </button>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: PANEL — TEMAS
// ============================================================
function obtenerTemasInstalados() {
    const api = API();
    if (!api) return [];
    const catalogo = api.obtenerTemas() || [];
    const instalados = api.obtenerTemasInstalados() || [];
    return catalogo.filter(t => instalados.includes(t.id));
}

function renderTemas() {
    const cont = document.getElementById('cvTemas');
    if (!cont) return;

    const temas = obtenerTemasInstalados();

    if (temas.length === 0) {
        cont.innerHTML = `<p class="cv-help" style="grid-column:1/-1;">No tienes temas instalados. Abrí Stor-He para instalar alguno.</p>`;
        return;
    }

    cont.innerHTML = temas.map(t => {
        const c = t.colores || {};
        const c100 = c['--violet-100'] || '#EDE9FE';
        const c300 = c['--violet-300'] || '#C4B5FD';
        const c500 = c['--violet-500'] || '#8B5CF6';
        const bg = c['--bg'] || '#FBFBFD';
        const bgAlt = c['--bg-alt'] || '#F5F5F8';
        const white = c['--white'] || '#FFFFFF';
        const activo = state.temaId === t.id ? ' activo' : '';
        return `
            <button class="cv-tema-btn${activo}" data-tema="${t.id}" title="${escapeAttr(t.nombre)}">
                <div class="cv-tema-preview" style="background:${bg};">
                    <div class="cv-tema-preview-sidebar" style="background:${bgAlt};"></div>
                    <div class="cv-tema-preview-content" style="background:${white};">
                        <div class="cv-tema-preview-dot" style="background:${c500};width:80%;"></div>
                        <div class="cv-tema-preview-dot" style="background:${c300};width:60%;"></div>
                        <div class="cv-tema-preview-dot" style="background:${c100};width:40%;"></div>
                    </div>
                </div>
                <span class="cv-tema-nombre">${escapeHTML(t.nombre)}</span>
            </button>
        `;
    }).join('');
}

// ============================================================
//  RENDER: PANEL — ELEMENTOS
// ============================================================
function renderElementos() {
    const cont = document.getElementById('cvElementosLista');
    const count = document.getElementById('cvElementosCount');
    if (!cont) return;

    if (count) count.textContent = String(state.elementos.length);

    if (state.elementos.length === 0) {
        cont.innerHTML = `
            <div class="cv-empty-elementos">
                <i data-lucide="layers"></i>
                <p>No hay elementos.<br>Pulsá <strong>+</strong> para añadir un título, imagen, badge y más.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = state.elementos.map((el, i) => renderElementoCard(el, i)).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderElementoCard(el, i) {
    const expandido = el.id === elementoExpandidoId;
    const icono = ICONO_TIPO[el.tipo] || 'square';
    const nombre = NOMBRE_TIPO[el.tipo] || el.tipo;
    const primerEl = i === 0;
    const ultimoEl = i === state.elementos.length - 1;

    // Preview corto del contenido
    let preview = '';
    if (el.props.texto) {
        preview = el.props.texto.slice(0, 30) + (el.props.texto.length > 30 ? '…' : '');
    } else if (el.tipo === 'imagen' || el.tipo === 'avatar') {
        preview = el.props.dataUrl ? 'Imagen cargada' : 'Sin imagen';
    }

    return `
        <div class="cv-elemento-card${expandido ? ' expandido' : ''}" data-id="${el.id}">
            <div class="cv-elemento-header" data-toggle="${el.id}">
                <div class="cv-elemento-icono"><i data-lucide="${icono}"></i></div>
                <div class="cv-elemento-nombre">
                    ${nombre}
                    ${preview ? `<span style="font-weight:600;color:var(--gray-400);margin-left:6px;font-size:11px;">${escapeHTML(preview)}</span>` : ''}
                </div>
                <div class="cv-elemento-acciones">
                    <button class="cv-elemento-accion" data-accion="subir" data-id="${el.id}" ${primerEl ? 'disabled' : ''} title="Subir">
                        <i data-lucide="arrow-up"></i>
                    </button>
                    <button class="cv-elemento-accion" data-accion="bajar" data-id="${el.id}" ${ultimoEl ? 'disabled' : ''} title="Bajar">
                        <i data-lucide="arrow-down"></i>
                    </button>
                    <button class="cv-elemento-accion peligro" data-accion="eliminar" data-id="${el.id}" title="Eliminar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="cv-elemento-cuerpo">
                ${expandido ? renderPropsForm(el) : ''}
            </div>
        </div>
    `;
}

function renderPropsForm(el) {
    const p = el.props;
    const tipo = el.tipo;

    // Campo común: alineación (para tipos que la usan)
    const tieneAlineacion = ['titulo', 'subtitulo', 'parrafo', 'imagen', 'avatar', 'badge', 'forma'].includes(tipo);
    const alignHTML = tieneAlineacion ? `
        <div class="cv-field">
            <label>Alineación</label>
            <div class="cv-align-group">
                <button class="cv-align-btn${p.alineacion === 'izq' ? ' activo' : ''}" data-align="izq" data-id="${el.id}"><i data-lucide="align-left"></i></button>
                <button class="cv-align-btn${p.alineacion === 'centro' ? ' activo' : ''}" data-align="centro" data-id="${el.id}"><i data-lucide="align-center"></i></button>
                <button class="cv-align-btn${p.alineacion === 'der' ? ' activo' : ''}" data-align="der" data-id="${el.id}"><i data-lucide="align-right"></i></button>
            </div>
        </div>
    ` : '';

    // Campo común: color texto (título, subtítulo, párrafo)
    const tieneColorTexto = ['titulo', 'subtitulo', 'parrafo'].includes(tipo);
    const colorTextoHTML = tieneColorTexto ? `
        <div class="cv-field">
            <label>Color de texto</label>
            <div class="cv-color-row">
                <input type="color" data-prop="color" data-id="${el.id}" value="${p.color || '#18181B'}">
                <button class="cv-color-reset${!p.color ? ' activo' : ''}" data-action="color-reset" data-id="${el.id}">
                    ${!p.color ? 'Usando tema' : 'Volver al tema'}
                </button>
            </div>
        </div>
    ` : '';

    switch (tipo) {
        case 'titulo':
        case 'subtitulo':
            return `
                <div class="cv-field">
                    <label>Texto</label>
                    <input type="text" data-prop="texto" data-id="${el.id}" value="${escapeAttr(p.texto)}" maxlength="120">
                </div>
                <div class="cv-field">
                    <label>Tamaño <span class="cv-valor">${p.tamano}px</span></label>
                    <input type="range" data-prop="tamano" data-id="${el.id}" min="16" max="200" value="${p.tamano}">
                </div>
                ${alignHTML}
                ${colorTextoHTML}
            `;

        case 'parrafo':
            return `
                <div class="cv-field">
                    <label>Texto</label>
                    <textarea data-prop="texto" data-id="${el.id}" maxlength="800" rows="5">${escapeHTML(p.texto)}</textarea>
                </div>
                <div class="cv-field">
                    <label>Tamaño <span class="cv-valor">${p.tamano}px</span></label>
                    <input type="range" data-prop="tamano" data-id="${el.id}" min="14" max="60" value="${p.tamano}">
                </div>
                ${alignHTML}
                ${colorTextoHTML}
            `;

        case 'imagen':
            return `
                <div class="cv-field">
                    <label>Imagen</label>
                    <div class="cv-img-preview-mini" id="cvImgPreview_${el.id}">
                        ${p.dataUrl ? `<img src="${p.dataUrl}" alt="">` : 'Sin imagen'}
                    </div>
                    <button class="cv-btn-imagen-pick" data-action="pick-imagen" data-id="${el.id}">
                        <i data-lucide="images"></i>
                        ${p.dataUrl ? 'Cambiar imagen' : 'Elegir de Galería'}
                    </button>
                </div>
                <div class="cv-field">
                    <label>Alto <span class="cv-valor">${p.alto}px</span></label>
                    <input type="range" data-prop="alto" data-id="${el.id}" min="80" max="700" value="${p.alto}">
                </div>
                <div class="cv-field">
                    <label>Esquinas <span class="cv-valor">${p.esquinas}px</span></label>
                    <input type="range" data-prop="esquinas" data-id="${el.id}" min="0" max="80" value="${p.esquinas}">
                </div>
                ${alignHTML}
            `;

        case 'avatar':
            return `
                <div class="cv-field">
                    <label>Foto</label>
                    <div class="cv-img-preview-mini" id="cvImgPreview_${el.id}" style="border-radius:50%;width:80px;height:80px;margin:0 auto;">
                        ${p.dataUrl ? `<img src="${p.dataUrl}" style="border-radius:50%;" alt="">` : 'Sin foto'}
                    </div>
                    <button class="cv-btn-imagen-pick" data-action="pick-imagen" data-id="${el.id}">
                        <i data-lucide="images"></i>
                        ${p.dataUrl ? 'Cambiar foto' : 'Elegir de Galería'}
                    </button>
                </div>
                <div class="cv-field">
                    <label>Tamaño <span class="cv-valor">${p.tamano}px</span></label>
                    <input type="range" data-prop="tamano" data-id="${el.id}" min="60" max="400" value="${p.tamano}">
                </div>
                ${alignHTML}
            `;

        case 'separador': {
            const estiloHTML = `
                <div class="cv-field">
                    <label>Estilo</label>
                    <div class="cv-radio-row">
                        <button class="cv-radio-btn${p.estilo === 'linea' ? ' activo' : ''}" data-radio="estilo" data-value="linea" data-id="${el.id}">Línea</button>
                        <button class="cv-radio-btn${p.estilo === 'punteado' ? ' activo' : ''}" data-radio="estilo" data-value="punteado" data-id="${el.id}">Punteado</button>
                        <button class="cv-radio-btn${p.estilo === 'degradado' ? ' activo' : ''}" data-radio="estilo" data-value="degradado" data-id="${el.id}">Degradado</button>
                    </div>
                </div>
            `;
            return `
                ${estiloHTML}
                <div class="cv-field">
                    <label>Grosor <span class="cv-valor">${p.grosor}px</span></label>
                    <input type="range" data-prop="grosor" data-id="${el.id}" min="1" max="20" value="${p.grosor}">
                </div>
                <div class="cv-field">
                    <label>Color</label>
                    <div class="cv-color-row">
                        <input type="color" data-prop="color" data-id="${el.id}" value="${p.color || '#8B5CF6'}">
                        <button class="cv-color-reset${!p.color ? ' activo' : ''}" data-action="color-reset" data-id="${el.id}">
                            ${!p.color ? 'Usando tema' : 'Volver al tema'}
                        </button>
                    </div>
                </div>
            `;
        }

        case 'badge':
            return `
                <div class="cv-field">
                    <label>Texto</label>
                    <input type="text" data-prop="texto" data-id="${el.id}" value="${escapeAttr(p.texto)}" maxlength="40">
                </div>
                <div class="cv-field">
                    <label>Tamaño <span class="cv-valor">${p.tamano}px</span></label>
                    <input type="range" data-prop="tamano" data-id="${el.id}" min="12" max="60" value="${p.tamano}">
                </div>
                <div class="cv-field">
                    <label>Color de texto</label>
                    <div class="cv-color-row">
                        <input type="color" data-prop="colorTexto" data-id="${el.id}" value="${p.colorTexto}">
                    </div>
                </div>
                ${alignHTML}
            `;

        case 'forma': {
            const tipoHTML = `
                <div class="cv-field">
                    <label>Forma</label>
                    <div class="cv-radio-row">
                        <button class="cv-radio-btn${p.tipo === 'circulo' ? ' activo' : ''}" data-radio="tipo" data-value="circulo" data-id="${el.id}">Círculo</button>
                        <button class="cv-radio-btn${p.tipo === 'rectangulo' ? ' activo' : ''}" data-radio="tipo" data-value="rectangulo" data-id="${el.id}">Rectángulo</button>
                    </div>
                </div>
            `;
            return `
                ${tipoHTML}
                <div class="cv-field">
                    <label>Tamaño <span class="cv-valor">${p.tamano}px</span></label>
                    <input type="range" data-prop="tamano" data-id="${el.id}" min="20" max="500" value="${p.tamano}">
                </div>
                <div class="cv-field">
                    <label>Color</label>
                    <div class="cv-color-row">
                        <input type="color" data-prop="color" data-id="${el.id}" value="${p.color || '#8B5CF6'}">
                        <button class="cv-color-reset${!p.color ? ' activo' : ''}" data-action="color-reset" data-id="${el.id}">
                            ${!p.color ? 'Usando tema' : 'Volver al tema'}
                        </button>
                    </div>
                </div>
                ${alignHTML}
            `;
        }

        case 'espaciador':
            return `
                <div class="cv-field">
                    <label>Alto <span class="cv-valor">${p.alto}px</span></label>
                    <input type="range" data-prop="alto" data-id="${el.id}" min="10" max="400" value="${p.alto}">
                </div>
            `;

        default:
            return '';
    }
}

// ============================================================
//  ACCIONES DE ELEMENTOS
// ============================================================
function agregarElemento(tipo) {
    if (state.elementos.length >= 30) {
        toast('Máximo 30 elementos por afiche', 'error');
        return;
    }
    const props = JSON.parse(JSON.stringify(PROPS_DEFAULT[tipo] || {}));
    const el = { id: generarId(), tipo, props };
    state.elementos.push(el);
    elementoExpandidoId = el.id;
    renderElementos();
    renderPoster();
    if (window.lucide) window.lucide.createIcons();
}

function moverElemento(id, dir) {
    const i = state.elementos.findIndex(e => e.id === id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= state.elementos.length) return;
    [state.elementos[i], state.elementos[j]] = [state.elementos[j], state.elementos[i]];
    renderElementos();
    renderPoster();
    if (window.lucide) window.lucide.createIcons();
}

function eliminarElemento(id) {
    if (!confirm('¿Eliminar este elemento?')) return;
    state.elementos = state.elementos.filter(e => e.id !== id);
    if (elementoExpandidoId === id) elementoExpandidoId = null;
    renderElementos();
    renderPoster();
    if (window.lucide) window.lucide.createIcons();
}

function toggleElemento(id) {
    elementoExpandidoId = elementoExpandidoId === id ? null : id;
    renderElementos();
    if (window.lucide) window.lucide.createIcons();
}

function actualizarProp(id, prop, valor) {
    const el = state.elementos.find(e => e.id === id);
    if (!el) return;
    el.props[prop] = valor;
    renderPoster();
}

function resetColor(id, prop) {
    const el = state.elementos.find(e => e.id === id);
    if (!el) return;
    el.props[prop] = null;
    renderElementos();
    renderPoster();
    if (window.lucide) window.lucide.createIcons();
}

async function elegirImagen(id) {
    const mh = MH();
    if (!mh || !mh.galeria) {
        toast('Galería no disponible', 'error');
        return;
    }
    try {
        const imgId = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí una imagen' });
        if (!imgId) return;
        const blob = await mh.galeria.leerImagenBlob(imgId);
        if (!blob) throw new Error('No se pudo leer la imagen');
        const dataUrl = await blobToDataURL(blob);
        const el = state.elementos.find(e => e.id === id);
        if (!el) return;
        el.props.imagenId = imgId;
        el.props.dataUrl = dataUrl;
        renderElementos();
        renderPoster();
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.warn('[Cevann] Error picker:', e);
        toast('No se pudo cargar la imagen', 'error');
    }
}

// ============================================================
//  FUENTES BASE64
// ============================================================
async function obtenerFuentesBase64() {
    if (cacheFuentesBase64) return cacheFuentesBase64;

    try {
        const cssUrl = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap';
        const res = await fetch(cssUrl);
        const cssText = await res.text();

        const faces = cssText.match(/@font-face\s*\{[^}]+\}/g) || [];
        const blocks = [];

        for (const face of faces) {
            const urlMatch = face.match(/url\((https:\/\/[^)]+)\)/);
            if (!urlMatch) continue;
            const fontUrl = urlMatch[1].replace(/['"]/g, '');
            try {
                const fontRes = await fetch(fontUrl);
                const fontBlob = await fontRes.blob();
                const b64 = await blobToBase64(fontBlob);
                const isWoff2 = fontUrl.endsWith('.woff2');
                const mime = isWoff2 ? 'font/woff2' : 'font/woff';
                blocks.push(face.replace(urlMatch[1], `data:${mime};base64,${b64}`));
            } catch (e) { /* skip font */ }
        }

        cacheFuentesBase64 = blocks.join('\n');
        return cacheFuentesBase64;
    } catch (e) {
        console.warn('[Cevann] No se pudieron embeber fuentes:', e);
        cacheFuentesBase64 = '';
        return '';
    }
}

// ============================================================
//  EXPORT PNG (via foreignObject SVG)
// ============================================================
async function generarBlobPNG() {
    const f = FORMATOS[state.formato];
    const W = f.w;
    const H = f.h;
    const paddingPx = obtenerPaddingPx();
    const varsStr = varsAInline(state.temaVars || VARS_DEFAULT);

    const fontsCSS = await obtenerFuentesBase64();

    // CSS base para el export
    const baseCSS = `
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .cv-el { display: block; }
        .cv-el-titulo { font-family: 'Nunito', sans-serif; }
        .cv-el-subtitulo { font-family: 'Nunito', sans-serif; }
        .cv-el-parrafo { font-family: 'Nunito', sans-serif; }
    `;

    const contenido = state.elementos.map(renderElementoHTML).join('');

    // Construir SVG
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <foreignObject width="${W}" height="${H}">
        <div xmlns="http://www.w3.org/1999/xhtml" style="${varsStr};width:${W}px;height:${H}px;padding:${paddingPx}px;background:var(--bg,#FBFBFD);color:var(--gray-900,#18181B);display:flex;flex-direction:column;gap:24px;box-sizing:border-box;font-family:'Nunito',sans-serif;overflow:hidden;position:relative;">
            <style>${fontsCSS}${baseCSS}</style>
            ${contenido}
        </div>
    </foreignObject>
</svg>`;

    // SVG -> Blob
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    // Blob -> Image
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });

    // Image -> Canvas (2x para mejor calidad)
    const escala = 2;
    const canvas = document.createElement('canvas');
    canvas.width = W * escala;
    canvas.height = H * escala;
    const ctx = canvas.getContext('2d');
    ctx.scale(escala, escala);
    ctx.drawImage(img, 0, 0);

    URL.revokeObjectURL(url);

    // Canvas -> Blob PNG
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function descargarPNG() {
    try {
        toast('Generando PNG...', 'info');
        const blob = await generarBlobPNG();
        if (!blob) throw new Error('No se pudo generar');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `cevann_${state.formato}_${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('PNG descargado', 'success');
    } catch (e) {
        console.warn('[Cevann] Error al exportar:', e);
        toast('No se pudo exportar', 'error');
    }
}

// ============================================================
//  GUARDAR EN GALERÍA
// ============================================================
async function abrirModalGaleria() {
    try {
        // Pre-generar el PNG para el preview
        const blob = await generarBlobPNG();
        if (!blob) throw new Error('No se pudo generar');

        const url = URL.createObjectURL(blob);
        const mini = document.getElementById('cvMiniPreview');
        if (mini) {
            mini.innerHTML = `<img src="${url}" alt="">`;
        }

        // Título por defecto
        const ahora = new Date();
        const tit = document.getElementById('cvInputTitulo');
        if (tit) {
            tit.value = `Afiche ${ahora.toLocaleDateString('es-CL')} ${String(ahora.getHours()).padStart(2,'0')}:${String(ahora.getMinutes()).padStart(2,'0')}`;
        }

        document.getElementById('cvModalGaleria').hidden = false;
        if (window.lucide) window.lucide.createIcons();

        // Guardar blob para confirmar sin re-generar
        abrirModalGaleria._blobPendiente = blob;
        abrirModalGaleria._urlPendiente = url;
    } catch (e) {
        console.warn('[Cevann] Error:', e);
        toast('No se pudo generar el afiche', 'error');
    }
}

async function confirmarGuardarGaleria() {
    const blob = abrirModalGaleria._blobPendiente;
    if (!blob) {
        toast('No hay afiche generado', 'error');
        return;
    }
    const titulo = (document.getElementById('cvInputTitulo').value || '').trim() || 'Afiche Cevann';
    const mh = MH();
    if (!mh || !mh.galeria) {
        toast('Galería no disponible', 'error');
        return;
    }

    const btn = document.getElementById('cvModalGaleriaConfirm');
    if (btn) btn.disabled = true;

    try {
        await mh.galeria.subirImagen(blob, {
            codigo: usuarioActual.codigo,
            nombre: titulo + '.png',
            carpeta: 'c_general',
            comprimir: false
        });
        toast('Guardado en Galería', 'success');
        cerrarModalGaleria();
    } catch (e) {
        console.warn('[Cevann] Error al guardar:', e);
        toast('No se pudo guardar', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function cerrarModalGaleria() {
    document.getElementById('cvModalGaleria').hidden = true;
    const url = abrirModalGaleria._urlPendiente;
    if (url) {
        try { URL.revokeObjectURL(url); } catch (e) {}
    }
    abrirModalGaleria._blobPendiente = null;
    abrirModalGaleria._urlPendiente = null;
    const mini = document.getElementById('cvMiniPreview');
    if (mini) mini.innerHTML = '';
}

// ============================================================
//  PERSISTENCIA LOCAL
// ============================================================
async function guardarProyectoLocal() {
    const data = {
        version: 1,
        formato: state.formato,
        temaId: state.temaId,
        padding: state.padding,
        elementos: state.elementos,
        fecha: new Date().toISOString()
    };
    await idbSet(claveProyecto(), data);
    return data;
}

async function cargarProyectoLocal() {
    return await idbGet(claveProyecto());
}

async function borrarProyectoLocal() {
    await idbDelete(claveProyecto());
}

async function guardarProyecto() {
    try {
        await guardarProyectoLocal();
        toast('Proyecto guardado', 'success');
    } catch (e) {
        toast('No se pudo guardar', 'error');
    }
}

// ============================================================
//  NUEVO PROYECTO
// ============================================================
async function nuevoProyecto() {
    state.elementos = [];
    elementoExpandidoId = null;
    // Mantener formato/tema/padding actuales
    renderElementos();
    renderPoster();
    await borrarProyectoLocal();
    toast('Afiche limpio', 'success');
}

// ============================================================
//  CARGAR TEMA Y APLICAR
// ============================================================
async function aplicarTema(id) {
    const api = API();
    if (!api) return;
    const catalogo = api.obtenerTemas() || [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema) return;

    state.temaId = id;
    const vars = await cargarVarsTema(tema);
    state.temaVars = vars || { ...VARS_DEFAULT };
    renderTemas();
    renderPoster();
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {

    // Formatos
    document.getElementById('cvFormatos')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-formato]');
        if (!btn) return;
        state.formato = btn.dataset.formato;
        renderFormatos();
        renderPoster();
        actualizarEscala();
    });

    // Temas
    document.getElementById('cvTemas')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tema]');
        if (!btn) return;
        aplicarTema(btn.dataset.tema);
    });

    // Padding
    document.getElementById('cvPaddingGlobal')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-padding]');
        if (!btn) return;
        state.padding = btn.dataset.padding;
        document.querySelectorAll('#cvPaddingGlobal .cv-pad-btn').forEach(b => {
            b.classList.toggle('activo', b.dataset.padding === state.padding);
        });
        renderPoster();
        actualizarEscala();
    });

    // Add menu
    const addMenu = document.getElementById('cvAddMenu');
    document.getElementById('cvBtnAddElemento')?.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu.hidden = !addMenu.hidden;
    });
    addMenu?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tipo]');
        if (!btn) return;
        agregarElemento(btn.dataset.tipo);
        addMenu.hidden = true;
    });
    document.addEventListener('click', (e) => {
        if (!addMenu || addMenu.hidden) return;
        if (e.target.closest('#cvAddMenu') || e.target.closest('#cvBtnAddElemento')) return;
        addMenu.hidden = true;
    });

    // Elementos lista (delegación)
    const lista = document.getElementById('cvElementosLista');
    lista?.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-toggle]');
        if (toggle) {
            toggleElemento(toggle.dataset.toggle);
            return;
        }

        const accion = e.target.closest('[data-accion]');
        if (accion) {
            e.stopPropagation();
            const a = accion.dataset.accion;
            const id = accion.dataset.id;
            if (a === 'subir') moverElemento(id, -1);
            if (a === 'bajar') moverElemento(id, 1);
            if (a === 'eliminar') eliminarElemento(id);
            if (a === 'pick-imagen') elegirImagen(id);
            if (a === 'color-reset') {
                const prop = accion.closest('.cv-color-row')?.querySelector('input[type="color"]')?.dataset.prop;
                if (prop) resetColor(id, prop);
            }
            return;
        }

        // Alineación
        const alignBtn = e.target.closest('[data-align]');
        if (alignBtn) {
            const id = alignBtn.dataset.id;
            const align = alignBtn.dataset.align;
            const el = state.elementos.find(x => x.id === id);
            if (el) {
                el.props.alineacion = align;
                renderElementos();
                renderPoster();
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }

        // Radio buttons (estilo, tipo)
        const radioBtn = e.target.closest('[data-radio]');
        if (radioBtn) {
            const id = radioBtn.dataset.id;
            const prop = radioBtn.dataset.radio;
            const val = radioBtn.dataset.value;
            const el = state.elementos.find(x => x.id === id);
            if (el) {
                el.props[prop] = val;
                renderElementos();
                renderPoster();
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }
    });

    // Inputs (text, textarea, range, color)
    lista?.addEventListener('input', (e) => {
        const target = e.target;
        const id = target.dataset.id;
        const prop = target.dataset.prop;
        if (!id || !prop) return;

        let valor = target.value;
        if (target.type === 'range') valor = Number(valor);

        // Actualizar estado
        const el = state.elementos.find(x => x.id === id);
        if (!el) return;
        el.props[prop] = valor;

        // Actualizar label de tamaño si aplica
        if (target.type === 'range') {
            const label = target.closest('.cv-field')?.querySelector('.cv-valor');
            if (label) label.textContent = valor + 'px';
        }

        // Sólo re-render del poster (para no perder foco en el input)
        renderPoster();
    });

    // Botones header
    document.getElementById('cvBtnNuevo')?.addEventListener('click', () => {
        document.getElementById('cvModalNuevo').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    });
    document.getElementById('cvModalNuevoCancel')?.addEventListener('click', () => {
        document.getElementById('cvModalNuevo').hidden = true;
    });
    document.getElementById('cvModalNuevoCerrar')?.addEventListener('click', () => {
        document.getElementById('cvModalNuevo').hidden = true;
    });
    document.getElementById('cvModalNuevoConfirm')?.addEventListener('click', () => {
        document.getElementById('cvModalNuevo').hidden = true;
        nuevoProyecto();
    });

    document.getElementById('cvBtnGuardarProyecto')?.addEventListener('click', guardarProyecto);
    document.getElementById('cvBtnDescargar')?.addEventListener('click', descargarPNG);
    document.getElementById('cvBtnGuardarGaleria')?.addEventListener('click', abrirModalGaleria);

    // Modal galería
    document.getElementById('cvModalGaleriaCerrar')?.addEventListener('click', cerrarModalGaleria);
    document.getElementById('cvModalGaleriaCancel')?.addEventListener('click', cerrarModalGaleria);
    document.getElementById('cvModalGaleriaConfirm')?.addEventListener('click', confirmarGuardarGaleria);
    document.getElementById('cvModalGaleria')?.addEventListener('click', (e) => {
        if (e.target.id === 'cvModalGaleria') cerrarModalGaleria();
    });

    // Esc
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('cvModalGaleria').hidden) { cerrarModalGaleria(); return; }
        if (!document.getElementById('cvModalNuevo').hidden) { document.getElementById('cvModalNuevo').hidden = true; return; }
        if (addMenu && !addMenu.hidden) { addMenu.hidden = true; return; }
    });

    // Resize
    window.addEventListener('resize', actualizarEscala);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => actualizarEscala());
        const wrap = document.getElementById('cvPreviewWrap');
        if (wrap) ro.observe(wrap);
    }
}

// ============================================================
//  MODAL SESIÓN GUARDADA
// ============================================================
async function preguntarContinuarSesion(data) {
    const modal = document.getElementById('cvModalSesion');
    const fecha = document.getElementById('cvModalSesionFecha');
    if (!modal) return 'nueva';
    if (fecha) {
        const d = new Date(data.fecha);
        fecha.textContent = 'Guardado el ' + d.toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    return new Promise(resolve => {
        const cerrar = (modo) => {
            modal.hidden = true;
            resolve(modo);
        };
        document.getElementById('cvModalSesionContinuar').onclick = () => cerrar('continuar');
        document.getElementById('cvModalSesionNuevo').onclick = () => cerrar('nueva');
        document.getElementById('cvModalSesionDescartar').onclick = () => cerrar('descartar');
    });
}

async function cargarProyectoDesdeData(data) {
    state.formato = data.formato || 'cuadrado';
    state.temaId = data.temaId || 'violeta';
    state.padding = data.padding || 'medio';
    state.elementos = Array.isArray(data.elementos) ? data.elementos : [];

    // Actualizar UI
    renderFormatos();
    document.querySelectorAll('#cvPaddingGlobal .cv-pad-btn').forEach(b => {
        b.classList.toggle('activo', b.dataset.padding === state.padding);
    });
    await aplicarTema(state.temaId);
    renderElementos();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Cevann necesita estar dentro de VicWebOs.');
        return;
    }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión para usar Cevann.');
        return;
    }

    const badge = document.getElementById('cvUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    // Cargar tema inicial
    await aplicarTema('violeta');

    // Renderizar estructura
    renderFormatos();
    renderElementos();
    renderPoster();

    // Ajustar escala (post-render)
    requestAnimationFrame(actualizarEscala);
    setTimeout(actualizarEscala, 100);

    // Proyecto guardado
    let recuperado = false;
    try {
        const guardado = await cargarProyectoLocal();
        if (guardado && Array.isArray(guardado.elementos)) {
            const decision = await preguntarContinuarSesion(guardado);
            if (decision === 'continuar') {
                await cargarProyectoDesdeData(guardado);
                toast('Proyecto restaurado', 'success');
                recuperado = true;
            } else if (decision === 'descartar') {
                await borrarProyectoLocal();
            }
        }
    } catch (e) {
        console.warn('[Cevann] Error recuperando:', e);
    }

    if (!recuperado) {
        // Nada, dejar el proyecto en blanco con el tema aplicado
    }

    inicializarEventos();

    // Guardar al cerrar
    window.addEventListener('pagehide', () => {
        guardarProyectoLocal().catch(() => {});
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
