// ============================================================
//  Contactos — Directorio + regalos + estado + temas
//  ------------------------------------------------------------
//  3 CATEGORÍAS DE REGALO (1 por categoría al día por usuario):
//    · monedas  → 25 / 50 / 100
//    · webdrop  → 135 monedas → 1 widget o cuadro aleatorio
//    · espacio  → 175 monedas → +5 espacio permanente
//
//  Cada tarjeta se tinta con el TEMA ACTIVO del usuario.
//  Los colores se obtienen haciendo fetch del CSS de
//  Temas/{id}.css y parseando el :root.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'contactos';
const ARCHIVO_PRESENCIA = 'app/contactos/presencia.json';
const ARCHIVO_REGALOS   = 'app/contactos/regalos.json';
const CUENTAS_FILE      = 'cuenta.json';
const CONFIG_FILE       = 'cuentaConfig.json';
const MAX_MOVIMIENTOS_CHEQUERA = 500;
const ESTADOS_VALIDOS = ['activo', 'descansando', 'desconectado'];
const TEMA_POR_DEFECTO = 'violeta';

// -------- Categorías y precios --------
const CATEGORIAS_REGALO = ['monedas', 'webdrop', 'espacio'];
const MONTOS_MONEDAS    = [25, 50, 100];
const PRECIO_WEBDROP    = 135;
const PRECIO_ESPACIO    = 175;
const ESPACIO_POR_REGALO = 5;

// -------- Estado global --------
let usuarioActual = null;
let usuarios = [];
let presencia = {};
let regalos = [];
let configsGlobales = {};
let monedasPropias = 0;
let miEstado = null;

let destinatarioRegalo = null;
let _catRegaloActual = 'monedas';
let montoSeleccionado = null;
let perfilAbierto = null;
let histTab = 'dados';
let histFiltroCat = 'todos';

const _temasCache = new Map();

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};
const LC = () => {
    try { return window.parent.LogicCuadros || null; }
    catch (e) { return null; }
};

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
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ctToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'ct-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function estadoInfo(estado) {
    if (estado === 'activo')       return { label: 'Activo',       icono: 'circle-dot',    clase: 'estado-activo' };
    if (estado === 'descansando')  return { label: 'Descansando',  icono: 'coffee',        clase: 'estado-descanso' };
    if (estado === 'desconectado') return { label: 'Desconectado', icono: 'circle-off',    clase: 'estado-off' };
    return { label: 'Sin estado', icono: 'circle-dashed', clase: 'estado-sin' };
}

function categoriaInfo(cat) {
    if (cat === 'monedas') return { label: 'Monedas',  icono: 'coins',         color: 'cat-monedas' };
    if (cat === 'webdrop') return { label: 'WebDrop',  icono: 'package-plus',  color: 'cat-webdrop' };
    if (cat === 'espacio') return { label: 'Espacio',  icono: 'hard-drive',    color: 'cat-espacio' };
    return { label: 'Regalo', icono: 'gift', color: '' };
}

function tiempoRelativo(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30)   return 'ahora';
    if (diff < 60)   return `hace ${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60)    return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24)      return `hace ${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7)    return `hace ${dias}d`;
    if (dias < 30)   return `hace ${Math.floor(dias / 7)}sem`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function formatearFechaLarga(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ============================================================
//  CARGA DE DATOS
// ============================================================
async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return [];
    try {
        const data = await bd.leerArchivoFresh(CUENTAS_FILE);
        return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
}

async function cargarPresencia() {
    const bd = BD();
    if (!bd) return {};
    try {
        const data = await bd.leerArchivoFresh(ARCHIVO_PRESENCIA);
        if (data && data.usuarios && typeof data.usuarios === 'object') return data.usuarios;
    } catch (e) { /* no existe */ }
    return {};
}

async function cargarRegalos() {
    const bd = BD();
    if (!bd) return [];
    try {
        const data = await bd.leerArchivoFresh(ARCHIVO_REGALOS);
        if (data && Array.isArray(data.regalos)) return data.regalos;
    } catch (e) { /* no existe */ }
    return [];
}

async function cargarConfigs() {
    const bd = BD();
    if (!bd) return {};
    try {
        const data = await bd.leerArchivoFresh(CONFIG_FILE);
        if (data && typeof data === 'object') return data;
    } catch (e) { /* no existe */ }
    return {};
}

// ============================================================
//  TEMAS — parsear CSS del tema y aplicar variables
// ============================================================
function parsearRootVariables(css) {
    const vars = {};
    const re = /:root\s*\{([^}]*)\}/g;
    let match;
    while ((match = re.exec(css)) !== null) {
        const body = match[1];
        const varRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
        let m;
        while ((m = varRe.exec(body)) !== null) {
            vars[m[1]] = m[2].trim();
        }
    }
    return vars;
}

async function obtenerVariablesTema(temaId) {
    if (!temaId) return null;
    if (_temasCache.has(temaId)) return _temasCache.get(temaId);

    _temasCache.set(temaId, null);

    try {
        let base = window.location.href;
        try { base = window.parent.location.href; } catch (e) { /* fallback */ }
        const url = new URL('Temas/' + temaId + '.css', base).href;
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return null;
        const css = await res.text();
        const vars = parsearRootVariables(css);
        if (Object.keys(vars).length === 0) return null;
        _temasCache.set(temaId, vars);
        return vars;
    } catch (e) {
        return null;
    }
}

function aplicarTemaATarjeta(el, vars) {
    if (!el || !vars) return;
    for (const [key, value] of Object.entries(vars)) {
        try { el.style.setProperty(key, value); } catch (e) { /* ignorar */ }
    }
}

async function precargarTemasDeUsuarios() {
    const usados = new Set([TEMA_POR_DEFECTO]);
    for (const u of usuarios) {
        const cfg = configsGlobales[u.codigo];
        const t = (cfg && cfg.temaActivo) ? cfg.temaActivo : TEMA_POR_DEFECTO;
        usados.add(t);
    }
    await Promise.all([...usados].map(id => obtenerVariablesTema(id)));
}

// ============================================================
//  VALIDACIÓN DIARIA POR CATEGORÍA
// ============================================================
function yaRegaleCategoriaHoy(codigoDestino, categoria) {
    const hoy = new Date().toDateString();
    return regalos.some(r =>
        r.de === usuarioActual.codigo &&
        r.para === codigoDestino &&
        (r.categoria || 'monedas') === categoria &&
        new Date(r.fecha).toDateString() === hoy
    );
}

function categoriasDisponiblesHoy(codigoDestino) {
    return CATEGORIAS_REGALO.filter(c => !yaRegaleCategoriaHoy(codigoDestino, c));
}

// ============================================================
//  MI BLOQUE
// ============================================================
function renderMiBloque() {
    const avatarEl = document.getElementById('ctYoAvatar');
    const nombreEl = document.getElementById('ctYoNombre');

    if (nombreEl) nombreEl.textContent = usuarioActual.nombre || 'Sin nombre';

    if (avatarEl) {
        const yo = usuarios.find(u => u.codigo === usuarioActual.codigo);
        if (yo && yo.foto) {
            avatarEl.innerHTML = `<img src="${yo.foto}" alt="">`;
        } else {
            const inicial = (usuarioActual.nombre || '?').charAt(0).toUpperCase();
            avatarEl.innerHTML = `<span class="ct-yo-avatar-inicial">${escapar(inicial)}</span>`;
        }
    }

    document.querySelectorAll('.ct-yo-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.estado === miEstado);
    });
}

async function cambiarMiEstado(nuevoEstado) {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) return;
    if (nuevoEstado === miEstado) return;

    const bd = BD();
    if (!bd) { toast('Sin conexión', 'error'); return; }

    document.querySelectorAll('.ct-yo-btn').forEach(b => b.disabled = true);

    try {
        const ahora = new Date().toISOString();
        await bd.actualizarArchivo(ARCHIVO_PRESENCIA, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, usuarios: {} };
            if (!actual.usuarios || typeof actual.usuarios !== 'object') actual.usuarios = {};
            actual.usuarios[usuarioActual.codigo] = {
                estado: nuevoEstado,
                desde: ahora
            };
            actual.actualizado = ahora;
            return actual;
        });

        miEstado = nuevoEstado;
        presencia[usuarioActual.codigo] = { estado: nuevoEstado, desde: ahora };
        renderMiBloque();
        render();

        const labels = { activo: 'Activo', descansando: 'Descansando', desconectado: 'Desconectado' };
        toast(labels[nuevoEstado], 'success');
    } catch (e) {
        toast('No se pudo guardar', 'error');
    } finally {
        document.querySelectorAll('.ct-yo-btn').forEach(b => b.disabled = false);
    }
}

// ============================================================
//  RENDER LISTA
// ============================================================
function render() {
    const grid = document.getElementById('ctGrid');
    const empty = document.getElementById('ctEmpty');
    const totalEl = document.getElementById('ctTotalUsuarios');
    const activosEl = document.getElementById('ctActivos');
    if (!grid) return;

    const otros = usuarios.filter(u => u.codigo !== usuarioActual.codigo);

    if (totalEl) {
        totalEl.textContent = `${otros.length} ${otros.length === 1 ? 'usuario' : 'usuarios'}`;
    }
    const activos = otros.filter(u => presencia[u.codigo]?.estado === 'activo').length;
    if (activosEl) {
        activosEl.textContent = `${activos} ${activos === 1 ? 'activo' : 'activos'}`;
    }

    if (otros.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        empty.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    grid.hidden = false;
    empty.hidden = true;

    const orden = { activo: 0, descansando: 1, desconectado: 2 };
    const ordenados = [...otros].sort((a, b) => {
        const ea = presencia[a.codigo]?.estado || 'sin';
        const eb = presencia[b.codigo]?.estado || 'sin';
        const oa = orden[ea] ?? 3;
        const ob = orden[eb] ?? 3;
        if (oa !== ob) return oa - ob;
        return (a.nombre || '').localeCompare(b.nombre || '');
    });

    grid.innerHTML = ordenados.map(u => renderTarjeta(u)).join('');
    if (window.lucide) window.lucide.createIcons();

    grid.querySelectorAll('.ct-card').forEach(card => {
        const codigo = card.dataset.codigo;
        if (!codigo) return;
        const cfg = configsGlobales[codigo];
        const temaId = (cfg && cfg.temaActivo) ? cfg.temaActivo : TEMA_POR_DEFECTO;
        const vars = _temasCache.get(temaId);
        if (vars) aplicarTemaATarjeta(card, vars);
    });

    // Cablear clicks
    grid.querySelectorAll('.ct-card').forEach(card => {
        const codigo = card.dataset.codigo;

        // 3 botones de regalo (uno por categoría)
        card.querySelectorAll('.ct-btn-regalar[data-cat]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (e.currentTarget.disabled) return;
                abrirModalRegalo(codigo, e.currentTarget.dataset.cat);
            });
        });

        card.addEventListener('click', () => abrirPerfil(codigo));
    });
}

function renderTarjeta(u) {
    const estado = presencia[u.codigo];
    const info = estadoInfo(estado?.estado);
    const avatar = renderAvatar(u);

    const yaM = yaRegaleCategoriaHoy(u.codigo, 'monedas');
    const yaW = yaRegaleCategoriaHoy(u.codigo, 'webdrop');
    const yaE = yaRegaleCategoriaHoy(u.codigo, 'espacio');
    const todoRegalado = yaM && yaW && yaE;

    const cuando = estado?.desde ? tiempoRelativo(estado.desde) : '';
    const lineaTiempo = cuando && estado?.estado
        ? `<span class="ct-estado-tiempo">· ${cuando}</span>`
        : '';

    const boton = (cat, yaRegalado, icono, title) => `
        <button class="ct-btn-regalar ct-btn-regalar-${cat} ${yaRegalado ? 'bloqueado' : ''}"
                data-cat="${cat}"
                ${yaRegalado ? 'disabled' : ''}
                title="${yaRegalado ? 'Ya regalaste hoy' : title}">
            <i data-lucide="${yaRegalado ? 'check' : icono}"></i>
        </button>`;

    return `
        <div class="ct-card" data-codigo="${escapar(u.codigo)}">
            <div class="ct-avatar-wrap">
                <div class="ct-avatar">${avatar}</div>
                <span class="ct-estado-dot ${info.clase}" title="${info.label}">
                    <i data-lucide="${info.icono}"></i>
                </span>
            </div>
            <div class="ct-info">
                <div class="ct-nombre">${escapar(u.nombre || 'Sin nombre')}</div>
                <div class="ct-codigo">@${escapar(u.codigo)}</div>
                <div class="ct-estado-label ${info.clase}">
                    <i data-lucide="${info.icono}"></i>
                    <span>${info.label}</span>
                    ${lineaTiempo}
                </div>
            </div>
            <div class="ct-regalar-botones ${todoRegalado ? 'completo' : ''}">
                ${boton('monedas', yaM, 'coins',        'Regalar monedas')}
                ${boton('webdrop', yaW, 'package-plus', 'Regalar WebDrop')}
                ${boton('espacio', yaE, 'hard-drive',   'Regalar espacio')}
            </div>
        </div>
    `;
}

function renderAvatar(u) {
    if (u.foto) return `<img src="${u.foto}" alt="">`;
    const inicial = (u.nombre || '?').charAt(0).toUpperCase();
    return `<span class="ct-avatar-inicial">${escapar(inicial)}</span>`;
}

// ============================================================
//  PERFIL EXTENDIDO
// ============================================================
function abrirPerfil(codigo) {
    const u = usuarios.find(x => x.codigo === codigo);
    if (!u || codigo === usuarioActual.codigo) return;

    perfilAbierto = codigo;

    const estado = presencia[codigo];
    const info = estadoInfo(estado?.estado);
    const cuando = estado?.desde ? tiempoRelativo(estado.desde) : '';

    const avatarEl = document.getElementById('ctPerfilAvatar');
    if (u.foto) {
        avatarEl.innerHTML = `<img src="${u.foto}" alt="">`;
    } else {
        const inicial = (u.nombre || '?').charAt(0).toUpperCase();
        avatarEl.innerHTML = `<span class="ct-perfil-avatar-inicial">${escapar(inicial)}</span>`;
    }

    document.getElementById('ctPerfilNombre').textContent = u.nombre || 'Sin nombre';
    document.getElementById('ctPerfilCodigo').textContent = `@${u.codigo}`;

    const estadoEl = document.getElementById('ctPerfilEstado');
    const dot = estadoEl.querySelector('.ct-estado-dot-mini');
    dot.className = 'ct-estado-dot-mini ' + info.clase;
    const textoTiempo = cuando && estado?.estado ? ` · ${cuando}` : '';
    document.getElementById('ctPerfilEstadoTxt').textContent = info.label + textoTiempo;

    document.getElementById('ctPerfilCreado').textContent = formatearFechaLarga(u.creado);

    // Stats por categoría
    document.getElementById('ctPerfilRecibidosMonedas').textContent =
        regalos.filter(r => r.para === codigo && (r.categoria || 'monedas') === 'monedas').length;
    document.getElementById('ctPerfilRecibidosWebDrops').textContent =
        regalos.filter(r => r.para === codigo && r.categoria === 'webdrop').length;
    document.getElementById('ctPerfilRecibidosEspacios').textContent =
        regalos.filter(r => r.para === codigo && r.categoria === 'espacio').length;

    document.getElementById('ctPerfilDadosMonedas').textContent =
        regalos.filter(r => r.de === codigo && (r.categoria || 'monedas') === 'monedas').length;
    document.getElementById('ctPerfilDadosWebDrops').textContent =
        regalos.filter(r => r.de === codigo && r.categoria === 'webdrop').length;
    document.getElementById('ctPerfilDadosEspacios').textContent =
        regalos.filter(r => r.de === codigo && r.categoria === 'espacio').length;

    // Botón regalar
    const btnRegalar = document.getElementById('ctPerfilRegalar');
    const txtRegalar = document.getElementById('ctPerfilRegalarTxt');
    const disponibles = categoriasDisponiblesHoy(codigo);
    if (disponibles.length === 0) {
        btnRegalar.disabled = true;
        txtRegalar.textContent = 'Ya le regalaste todo hoy';
    } else {
        btnRegalar.disabled = false;
        txtRegalar.textContent = `Regalar (${disponibles.length} disponibles)`;
    }

    // Aplicar tema del usuario al modal
    const card = document.getElementById('ctPerfilCard');
    card.removeAttribute('style');
    const cfg = configsGlobales[codigo];
    const temaId = (cfg && cfg.temaActivo) ? cfg.temaActivo : TEMA_POR_DEFECTO;
    const vars = _temasCache.get(temaId);
    if (vars) aplicarTemaATarjeta(card, vars);

    document.getElementById('ctModalPerfil').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarPerfil() {
    document.getElementById('ctModalPerfil').hidden = true;
    perfilAbierto = null;
}

// ============================================================
//  HISTORIAL DE REGALOS (con filtros)
// ============================================================
function abrirHistorial() {
    histTab = 'dados';
    histFiltroCat = 'todos';
    document.querySelectorAll('.ct-hist-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'dados');
    });
    document.querySelectorAll('.ct-hist-filtro').forEach(t => {
        t.classList.toggle('active', t.dataset.cat === 'todos');
    });
    renderHistorial();
    document.getElementById('ctModalHistorial').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarHistorial() {
    document.getElementById('ctModalHistorial').hidden = true;
}

function renderHistorial() {
    const lista = document.getElementById('ctHistLista');
    if (!lista) return;

    const filtroDireccion = histTab === 'dados'
        ? (r => r.de === usuarioActual.codigo)
        : (r => r.para === usuarioActual.codigo);

    const filtroCat = histFiltroCat === 'todos'
        ? (() => true)
        : (r => (r.categoria || 'monedas') === histFiltroCat);

    const items = regalos
        .filter(r => filtroDireccion(r) && filtroCat(r))
        .slice()
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 40);

    if (items.length === 0) {
        const titulo = histTab === 'dados' ? 'Todavía no regalaste nada' : 'Todavía no recibiste regalos';
        const desc = histTab === 'dados'
            ? 'Cuando le regales algo a alguien, aparecerá acá.'
            : 'Cuando alguien te regale algo, aparecerá acá.';
        lista.innerHTML = `
            <div class="ct-hist-vacio-card">
                <i data-lucide="${histTab === 'dados' ? 'gift' : 'inbox'}"></i>
                <h4>${titulo}</h4>
                <p>${desc}</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    lista.innerHTML = items.map(r => renderHistItem(r)).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderHistItem(r) {
    const cat = r.categoria || 'monedas';
    const info = categoriaInfo(cat);

    const otroCodigo = histTab === 'dados' ? r.para : r.de;
    const otro = usuarios.find(u => u.codigo === otroCodigo);
    const nombreOtro = otro ? (otro.nombre || otroCodigo) : otroCodigo;
    const prefijo = histTab === 'dados' ? 'Para' : 'De';

    let montoTxt = '';
    let detalleTxt = '';

    if (cat === 'monedas') {
        const signo = histTab === 'dados' ? '−' : '+';
        const claseMonto = histTab === 'dados' ? 'negativo' : 'positivo';
        montoTxt = `<span class="ct-hist-monto ${claseMonto}">${signo}${r.monto} <i data-lucide="coins"></i></span>`;
    } else if (cat === 'webdrop') {
        const drop = r.drop || {};
        const itemTipo = drop.tipo === 'cuadro' ? 'Cuadro' : 'Widget';
        detalleTxt = drop.itemNombre
            ? `<span class="ct-hist-badge ct-hist-badge-${cat}">
                   <i data-lucide="${drop.itemIcono || 'package-plus'}"></i>
                   ${escapar(drop.itemNombre)} · ${itemTipo}
               </span>`
            : '';
        montoTxt = `<span class="ct-hist-monto negativo">−${r.monto} <i data-lucide="coins"></i></span>`;
    } else if (cat === 'espacio') {
        detalleTxt = `<span class="ct-hist-badge ct-hist-badge-${cat}">
                        <i data-lucide="hard-drive"></i>
                        +${r.espacio || ESPACIO_POR_REGALO} espacio
                      </span>`;
        montoTxt = `<span class="ct-hist-monto negativo">−${r.monto} <i data-lucide="coins"></i></span>`;
    }

    return `
        <div class="ct-hist-item ct-hist-item-${cat}">
            <div class="ct-hist-icono ct-hist-icono-${cat}">
                <i data-lucide="${info.icono}"></i>
            </div>
            <div class="ct-hist-info">
                <div class="ct-hist-nombre">
                    ${prefijo} ${escapar(nombreOtro)}
                    <span class="ct-hist-cat-label">${info.label}</span>
                </div>
                <div class="ct-hist-meta">
                    <span>@${escapar(otroCodigo)}</span>
                    <span>·</span>
                    <span>${tiempoRelativo(r.fecha)}</span>
                </div>
                ${detalleTxt}
            </div>
            ${montoTxt}
        </div>`;
}

// ============================================================
//  MODAL DE REGALO — 3 categorías
// ============================================================
function abrirModalRegalo(codigo, categoriaInicial) {
    const u = usuarios.find(x => x.codigo === codigo);
    if (!u) return;

    // Si la categoría inicial ya está bloqueada, ofrecer la primera disponible
    const disponibles = categoriasDisponiblesHoy(codigo);
    let cat = categoriaInicial;
    if (!disponibles.includes(cat)) {
        cat = disponibles[0] || categoriaInicial;
    }

    destinatarioRegalo = u;
    montoSeleccionado = null;
    _catRegaloActual = cat;

    document.getElementById('ctRegaloTitulo').textContent = `Regalar a ${u.nombre || u.codigo}`;
    document.getElementById('ctMiSaldo').textContent = monedasPropias;

    // Tabs
    document.querySelectorAll('.ct-cat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.cat === cat);
        tab.classList.toggle('bloqueada', yaRegaleCategoriaHoy(codigo, tab.dataset.cat));
    });
    document.querySelectorAll('.ct-cat-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.catPanel === cat);
    });

    refrescarBotonesRegalo();
    document.getElementById('ctModalRegalo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalRegalo() {
    document.getElementById('ctModalRegalo').hidden = true;
    destinatarioRegalo = null;
    montoSeleccionado = null;
    _catRegaloActual = 'monedas';
}

function seleccionarCategoriaRegalo(cat) {
    if (!CATEGORIAS_REGALO.includes(cat)) return;
    _catRegaloActual = cat;
    montoSeleccionado = null;

    document.querySelectorAll('.ct-cat-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.cat === cat);
    });
    document.querySelectorAll('.ct-cat-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.catPanel === cat);
    });

    refrescarBotonesRegalo();
}

function seleccionarMonto(monto) {
    montoSeleccionado = monto;
    document.querySelectorAll('.ct-monto').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.monto, 10) === monto);
    });
    refrescarBotonesRegalo();
}

// Actualiza disponibilidad de los montos + botón Enviar + avisos
function refrescarBotonesRegalo() {
    if (!destinatarioRegalo) return;
    const codigo = destinatarioRegalo.codigo;
    const cat = _catRegaloActual;
    const yaRegalado = yaRegaleCategoriaHoy(codigo, cat);

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    const txtEnviar = document.getElementById('ctRegaloEnviarTxt');
    const aviso = document.getElementById('ctCatAviso');

    // ---- Bloqueo global por categoría ya regalada hoy ----
    if (yaRegalado) {
        if (aviso) {
            aviso.hidden = false;
            aviso.className = 'ct-cat-aviso ct-cat-aviso-bloqueado';
            aviso.innerHTML = `<i data-lucide="info"></i>
                <span>Ya le regalaste <strong>${categoriaInfo(cat).label}</strong> hoy a <strong>@${escapar(codigo)}</strong>. Podés regalarle otra categoría.</span>`;
        }
        btnEnviar.disabled = true;
        txtEnviar.textContent = 'Ya regalado hoy';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // ---- Costos por categoría ----
    let costo = 0;
    if (cat === 'monedas') costo = montoSeleccionado || 0;
    if (cat === 'webdrop') costo = PRECIO_WEBDROP;
    if (cat === 'espacio') costo = PRECIO_ESPACIO;

    // ---- Habilitar montos según saldo ----
    if (cat === 'monedas') {
        document.querySelectorAll('.ct-monto').forEach(btn => {
            const m = parseInt(btn.dataset.monto, 10);
            btn.disabled = monedasPropias < m;
        });
    }

    // ---- Validación saldo ----
    if (costo > monedasPropias) {
        if (aviso) {
            aviso.hidden = false;
            aviso.className = 'ct-cat-aviso ct-cat-aviso-error';
            aviso.innerHTML = `<i data-lucide="alert-circle"></i>
                <span>Te faltan <strong>${costo - monedasPropias}</strong> monedas para esta categoría.</span>`;
        }
        btnEnviar.disabled = true;
        txtEnviar.textContent = 'Sin saldo';
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // ---- Caso especial: WebDrop sin pool disponible ----
    if (cat === 'webdrop') {
        const pool = calcularPoolWebDrop(codigo);
        if (!pool || pool.length === 0) {
            if (aviso) {
                aviso.hidden = false;
                aviso.className = 'ct-cat-aviso ct-cat-aviso-error';
                aviso.innerHTML = `<i data-lucide="package-x"></i>
                    <span>@${escapar(codigo)} ya tiene <strong>todos los widgets y cuadros</strong>. No hay nada que el WebDrop pueda darle.</span>`;
            }
            btnEnviar.disabled = true;
            txtEnviar.textContent = 'Sin pool';
            if (window.lucide) window.lucide.createIcons();
            return;
        }
        // Mostrar cuántos candidatos hay
        if (aviso) {
            aviso.hidden = false;
            aviso.className = 'ct-cat-aviso ct-cat-aviso-info';
            aviso.innerHTML = `<i data-lucide="sparkles"></i>
                <span>Hay <strong>${pool.length}</strong> ${pool.length === 1 ? 'item' : 'items'} posibles para regalar. Se elegirá al azar.</span>`;
        }
    } else {
        if (aviso) aviso.hidden = true;
    }

    // ---- Habilitar botón ----
    const necesitaMonto = (cat === 'monedas');
    const habilitado = necesitaMonto ? !!montoSeleccionado : true;
    btnEnviar.disabled = !habilitado;

    if (cat === 'monedas') {
        txtEnviar.textContent = montoSeleccionado ? `Enviar ${montoSeleccionado}` : 'Elegí un monto';
    } else if (cat === 'webdrop') {
        txtEnviar.textContent = `Enviar WebDrop`;
    } else if (cat === 'espacio') {
        txtEnviar.textContent = `Enviar +5 espacio`;
    }

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  WEBDROP — pool aleatorio
// ============================================================
//  Combina widgets y cuadros del catálogo del shell, excluyendo
//  los que el receptor ya tenga instalados.
// ============================================================
function calcularPoolWebDrop(receptorCodigo) {
    const api = API();
    const lc = LC();
    if (!api) return [];

    const cfgReceptor = configsGlobales[receptorCodigo] || {};
    const widgetsYa = Array.isArray(cfgReceptor.widgetsInstalados) ? cfgReceptor.widgetsInstalados : [];
    const cuadrosYa = Array.isArray(cfgReceptor.cuadrosInstalados) ? cfgReceptor.cuadrosInstalados : [];

    let widgetsCatalogo = [];
    let cuadrosCatalogo = [];

    try { widgetsCatalogo = api.obtenerWidgets?.() || []; } catch (e) { widgetsCatalogo = []; }
    if (lc) {
        try { cuadrosCatalogo = lc.obtenerCatalogo?.() || []; } catch (e) { cuadrosCatalogo = []; }
    }

    const pool = [];

    widgetsCatalogo.forEach(w => {
        if (!w || !w.id) return;
        if (widgetsYa.includes(w.id)) return;
        pool.push({
            tipo: 'widget',
            itemId: w.id,
            itemNombre: w.nombre || w.id,
            itemIcono: w.icono || 'square'
        });
    });

    cuadrosCatalogo.forEach(c => {
        if (!c || !c.id) return;
        if (cuadrosYa.includes(c.id)) return;
        pool.push({
            tipo: 'cuadro',
            itemId: c.id,
            itemNombre: c.nombre || c.id,
            itemIcono: c.icono || 'frame'
        });
    });

    return pool;
}

function elegirWebDropAleatorio(receptorCodigo) {
    const pool = calcularPoolWebDrop(receptorCodigo);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================
//  REGISTRO DE REGALO (helper común)
// ============================================================
async function registrarRegalo(datos) {
    const bd = BD();
    if (!bd) throw new Error('Sin BD');
    const ahora = new Date().toISOString();
    const id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    await bd.actualizarArchivo(ARCHIVO_REGALOS, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 2, regalos: [] };
        if (!Array.isArray(actual.regalos)) actual.regalos = [];
        actual.regalos.unshift({
            id,
            de: usuarioActual.codigo,
            para: datos.para,
            categoria: datos.categoria,
            monto: datos.monto,
            ...(datos.extra || {}),
            fecha: ahora
        });
        if (actual.regalos.length > 500) actual.regalos = actual.regalos.slice(0, 500);
        actual.version = 2;
        actual.actualizado = ahora;
        return actual;
    });

    return id;
}

// ============================================================
//  ENVÍO DE REGALO — switch por categoría
// ============================================================
async function enviarRegalo() {
    if (!destinatarioRegalo) return;
    if (_catRegaloActual === 'monedas') return enviarRegaloMonedas();
    if (_catRegaloActual === 'webdrop') return enviarRegaloWebDrop();
    if (_catRegaloActual === 'espacio') return enviarRegaloEspacio();
}

// -------- MONEDAS --------
async function enviarRegaloMonedas() {
    if (!montoSeleccionado || !MONTOS_MONEDAS.includes(montoSeleccionado)) return;
    const monto = montoSeleccionado;
    const receptor = destinatarioRegalo;
    const emisor = usuarioActual;

    const api = API();
    const bd = BD();
    if (!api || !bd) { toast('Sin conexión al sistema', 'error'); return; }

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    if (btnEnviar.disabled) return;
    _setBotonCargando(btnEnviar, 'Enviando...');

    try {
        await api.gastoBoleta('gift', 'contactos', `Regalo a @${receptor.codigo}`, monto);

        // Sumar monedas al receptor
        await bd.actualizarArchivo(CONFIG_FILE, (all) => {
            if (!all || typeof all !== 'object') all = {};
            if (!all[receptor.codigo]) all[receptor.codigo] = {};
            all[receptor.codigo].monedas = (all[receptor.codigo].monedas || 0) + monto;
            return all;
        });

        // Chequera del receptor
        await escribirChequeraReceptor(receptor.codigo, emisor.codigo, 'gift', monto, `Regalo de @${emisor.codigo}`);

        // Registro global
        await registrarRegalo({
            para: receptor.codigo,
            categoria: 'monedas',
            monto
        });

        await notificar(receptor.codigo, `${emisor.nombre}: te regaló ${monto} monedas`);

        _postEnvioExitoso(receptor, `Regalo enviado a ${receptor.nombre}`);
    } catch (e) {
        _postEnvioError(btnEnviar, e);
    }
}

// -------- WEBDROP --------
async function enviarRegaloWebDrop() {
    const receptor = destinatarioRegalo;
    const emisor = usuarioActual;

    const api = API();
    const bd = BD();
    if (!api || !bd) { toast('Sin conexión al sistema', 'error'); return; }

    // Elegir ANTES de gastar (para no gastar si no hay pool)
    const drop = elegirWebDropAleatorio(receptor.codigo);
    if (!drop) {
        toast('No hay widgets/cuadros que el receptor no tenga', 'error');
        return;
    }

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    if (btnEnviar.disabled) return;
    _setBotonCargando(btnEnviar, 'Enviando...');

    try {
        // 1. Gasto al emisor
        await api.gastoBoleta(
            'gift',
            'contactos',
            `WebDrop a @${receptor.codigo} (${drop.itemNombre})`,
            PRECIO_WEBDROP
        );

        // 2. Instalar el item al receptor (escribe en su config)
        await aplicarWebDropAlReceptor(receptor.codigo, drop);

        // 3. Chequera del receptor (registro del obsequio en especie)
        await escribirChequeraReceptor(
            receptor.codigo,
            emisor.codigo,
            'gift',
            PRECIO_WEBDROP,
            `WebDrop de @${emisor.codigo}: ${drop.itemNombre} (${drop.tipo})`
        );

        // 4. Registro global
        await registrarRegalo({
            para: receptor.codigo,
            categoria: 'webdrop',
            monto: PRECIO_WEBDROP,
            extra: {
                drop: {
                    tipo: drop.tipo,
                    itemId: drop.itemId,
                    itemNombre: drop.itemNombre,
                    itemIcono: drop.itemIcono
                }
            }
        });

        const tipoLabel = drop.tipo === 'cuadro' ? 'cuadro' : 'widget';
        await notificar(
            receptor.codigo,
            `${emisor.nombre}: te regaló un WebDrop — ¡${drop.itemNombre} (${tipoLabel})!`
        );

        _postEnvioExitoso(receptor, `WebDrop enviado: ${drop.itemNombre}`);
    } catch (e) {
        _postEnvioError(btnEnviar, e);
    }
}

// -------- ESPACIO --------
async function enviarRegaloEspacio() {
    const receptor = destinatarioRegalo;
    const emisor = usuarioActual;

    const api = API();
    const bd = BD();
    if (!api || !bd) { toast('Sin conexión al sistema', 'error'); return; }

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    if (btnEnviar.disabled) return;
    _setBotonCargando(btnEnviar, 'Enviando...');

    try {
        await api.gastoBoleta(
            'gift',
            'contactos',
            `+5 espacio a @${receptor.codigo}`,
            PRECIO_ESPACIO
        );

        // Sumar espacio al receptor
        await aplicarEspacioAlReceptor(receptor.codigo, ESPACIO_POR_REGALO);

        // Chequera del receptor
        await escribirChequeraReceptor(
            receptor.codigo,
            emisor.codigo,
            'canje',
            PRECIO_ESPACIO,
            `+${ESPACIO_POR_REGALO} espacio de @${emisor.codigo}`
        );

        await registrarRegalo({
            para: receptor.codigo,
            categoria: 'espacio',
            monto: PRECIO_ESPACIO,
            extra: { espacio: ESPACIO_POR_REGALO }
        });

        await notificar(
            receptor.codigo,
            `${emisor.nombre}: te regaló +${ESPACIO_POR_REGALO} de espacio`
        );

        _postEnvioExitoso(receptor, `+${ESPACIO_POR_REGALO} espacio enviado a ${receptor.nombre}`);
    } catch (e) {
        _postEnvioError(btnEnviar, e);
    }
}

// ============================================================
//  APLICAR WEBDROP AL RECEPTOR
//  ------------------------------------------------------------
//  Escribe en cuentaConfig.json del receptor, agregando el
//  item a su lista de instalados.
//  ⚠️ AJUSTAR los nombres de campos si tu shell usa otros.
// ============================================================
async function aplicarWebDropAlReceptor(receptorCodigo, drop) {
    const bd = BD();
    await bd.actualizarArchivo(CONFIG_FILE, (all) => {
        if (!all || typeof all !== 'object') all = {};
        if (!all[receptorCodigo]) all[receptorCodigo] = {};
        const cfg = all[receptorCodigo];

        if (drop.tipo === 'widget') {
            if (!Array.isArray(cfg.widgetsInstalados)) cfg.widgetsInstalados = [];
            if (!cfg.widgetsInstalados.includes(drop.itemId)) {
                cfg.widgetsInstalados.push(drop.itemId);
            }
        } else if (drop.tipo === 'cuadro') {
            if (!Array.isArray(cfg.cuadrosInstalados)) cfg.cuadrosInstalados = [];
            if (!cfg.cuadrosInstalados.includes(drop.itemId)) {
                cfg.cuadrosInstalados.push(drop.itemId);
            }
        }
        return all;
    });
}

// ============================================================
//  APLICAR ESPACIO AL RECEPTOR
//  ⚠️ AJUSTAR el nombre del campo (espacioMaximo) si tu shell
//     usa otro (ej: "espacioTotal", "spaceMax", etc.).
// ============================================================
async function aplicarEspacioAlReceptor(receptorCodigo, cantidad) {
    const bd = BD();
    await bd.actualizarArchivo(CONFIG_FILE, (all) => {
        if (!all || typeof all !== 'object') all = {};
        if (!all[receptorCodigo]) all[receptorCodigo] = {};
        const cfg = all[receptorCodigo];
        const actual = Number(cfg.espacioMaximo) || 50;
        cfg.espacioMaximo = actual + cantidad;
        return all;
    });
}

// ============================================================
//  HELPERS DE ENVÍO
// ============================================================
async function escribirChequeraReceptor(receptorCodigo, emisorCodigo, tipo, cantidad, texto) {
    const bd = BD();
    const ahora = new Date().toISOString();
    const movId = 'mov_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    try {
        await bd.actualizarArchivo(`app/chequera/${receptorCodigo}chequera.json`, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, movimientos: [] };
            if (!Array.isArray(actual.movimientos)) actual.movimientos = [];
            actual.movimientos.unshift({
                id: movId,
                tipo,
                icono: 'gift',
                fuente: 'contactos',
                texto,
                cantidad,
                fecha: ahora
            });
            if (actual.movimientos.length > MAX_MOVIMIENTOS_CHEQUERA) {
                actual.movimientos = actual.movimientos.slice(0, MAX_MOVIMIENTOS_CHEQUERA);
            }
            actual.actualizado = ahora;
            return actual;
        });
    } catch (e) {
        console.warn('[Contactos] No se pudo escribir chequera del receptor:', e);
    }
}

async function notificar(receptorCodigo, mensaje) {
    const api = API();
    if (!api) return;
    try {
        await api.enviarNotificacion('contactos', mensaje, receptorCodigo);
    } catch (e) {
        console.warn('[Contactos] No se pudo notificar:', e);
    }
}

function _setBotonCargando(btn, texto) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> <span>${texto}</span>`;
    if (window.lucide) window.lucide.createIcons();
}

function _postEnvioExitoso(receptor, mensaje) {
    const api = API();
    try { monedasPropias = api.obtenerMonedas(); } catch (e) { /* silencioso */ }
    cargarRegalos().then(lista => {
        regalos = lista;
        toast(mensaje, 'success');
        cerrarModalRegalo();
        render();
        if (perfilAbierto === receptor.codigo) abrirPerfil(receptor.codigo);
    });
}

function _postEnvioError(btnEnviar, error) {
    toast(error.message || 'No se pudo enviar el regalo', 'error');
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = `<i data-lucide="send"></i> <span id="ctRegaloEnviarTxt">Enviar</span>`;
    if (window.lucide) window.lucide.createIcons();
    refrescarBotonesRegalo();
}

// ============================================================
//  REFRESH
// ============================================================
async function refrescar() {
    const btn = document.getElementById('ctBtnRefresh');
    if (btn) btn.classList.add('spin');

    try {
        usuarios = await cargarUsuarios();
        presencia = await cargarPresencia();
        regalos = await cargarRegalos();
        configsGlobales = await cargarConfigs();
        miEstado = presencia[usuarioActual.codigo]?.estado || null;

        const api = API();
        if (api) {
            try { monedasPropias = api.obtenerMonedas() || 0; } catch (e) { monedasPropias = 0; }
        }

        await precargarTemasDeUsuarios();
        renderMiBloque();
        render();
    } finally {
        if (btn) setTimeout(() => btn.classList.remove('spin'), 400);
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Contactos necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar Contactos.');
        return;
    }

    const badge = document.getElementById('ctUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await refrescar();

    // Header
    document.getElementById('ctBtnRefresh')?.addEventListener('click', refrescar);
    document.getElementById('ctBtnRegalos')?.addEventListener('click', abrirHistorial);

    // Modal regalo
    document.getElementById('ctRegaloCerrar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloCancelar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloEnviar')?.addEventListener('click', enviarRegalo);

    // Tabs de categoría
    document.querySelectorAll('.ct-cat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('bloqueada')) {
                const cat = tab.dataset.cat;
                toast(`Ya le regalaste ${categoriaInfo(cat).label} hoy`, 'info');
                return;
            }
            seleccionarCategoriaRegalo(tab.dataset.cat);
        });
    });

    // Montos
    document.querySelectorAll('.ct-monto').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            seleccionarMonto(parseInt(btn.dataset.monto, 10));
        });
    });

    // Perfil
    document.getElementById('ctPerfilCerrar')?.addEventListener('click', cerrarPerfil);
    document.getElementById('ctPerfilRegalar')?.addEventListener('click', () => {
        if (!perfilAbierto) return;
        const codigo = perfilAbierto;
        const disponibles = categoriasDisponiblesHoy(codigo);
        if (disponibles.length === 0) {
            toast('Ya le regalaste todo hoy', 'info');
            return;
        }
        cerrarPerfil();
        abrirModalRegalo(codigo, disponibles[0]);
    });

    // Historial
    document.getElementById('ctHistorialCerrar')?.addEventListener('click', cerrarHistorial);
    document.querySelectorAll('.ct-hist-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            histTab = tab.dataset.tab;
            document.querySelectorAll('.ct-hist-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderHistorial();
        });
    });
    document.querySelectorAll('.ct-hist-filtro').forEach(fil => {
        fil.addEventListener('click', () => {
            histFiltroCat = fil.dataset.cat;
            document.querySelectorAll('.ct-hist-filtro').forEach(f => f.classList.remove('active'));
            fil.classList.add('active');
            renderHistorial();
        });
    });

    // Mi estado
    document.querySelectorAll('.ct-yo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            cambiarMiEstado(btn.dataset.estado);
        });
    });

    // Click fuera de modales
    ['ctModalRegalo', 'ctModalPerfil', 'ctModalHistorial'].forEach(id => {
        const m = document.getElementById(id);
        if (!m) return;
        m.addEventListener('click', (e) => {
            if (e.target.id !== id) return;
            if (id === 'ctModalRegalo') cerrarModalRegalo();
            if (id === 'ctModalPerfil') cerrarPerfil();
            if (id === 'ctModalHistorial') cerrarHistorial();
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('ctModalRegalo').hidden) { cerrarModalRegalo(); return; }
        if (!document.getElementById('ctModalPerfil').hidden) { cerrarPerfil(); return; }
        if (!document.getElementById('ctModalHistorial').hidden) { cerrarHistorial(); return; }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
