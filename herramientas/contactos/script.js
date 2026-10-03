// ============================================================
//  Contactos — Directorio + regalos + estado + temas
//  ------------------------------------------------------------
//  Cada tarjeta se tinta con el TEMA ACTIVO del usuario.
//  Los colores se obtienen haciendo fetch del CSS de
//  Temas/{id}.css y parseando el :root (funciona aunque
//  JsTemas.js no exponga TEMAS_DISPONIBLES en window).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'contactos';
const ARCHIVO_PRESENCIA = 'app/contactos/presencia.json';
const ARCHIVO_REGALOS = 'app/contactos/regalos.json';
const CUENTAS_FILE = 'cuenta.json';
const CONFIG_FILE = 'cuentaConfig.json';
const MAX_MOVIMIENTOS_CHEQUERA = 500;
const MONTOS_VALIDOS = [5, 25, 50];
const ESTADOS_VALIDOS = ['activo', 'descansando', 'desconectado'];
const TEMA_POR_DEFECTO = 'violeta';

let usuarioActual = null;
let usuarios = [];
let presencia = {};
let regalos = [];
let configsGlobales = {};
let monedasPropias = 0;
let miEstado = null;

let destinatarioRegalo = null;
let montoSeleccionado = null;
let perfilAbierto = null;
let histTab = 'dados';

// Cache de temas: { 'violeta': { '--violet-500': '#...', ... } | null }
const _temasCache = new Map();

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
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
//  ------------------------------------------------------------
//  Rutas conocidas: Temas/{id}.css  (relativas al shell)
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

    // Reservar el slot ANTES del fetch para evitar carreras
    _temasCache.set(temaId, null);

    try {
        // Construir URL absoluta desde el shell (evita problemas de CORS)
        let base = window.location.href;
        try { base = window.parent.location.href; } catch (e) { /* fallback */ }

        const url = new URL('Temas/' + temaId + '.css', base).href;

        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) {
            console.warn('[Contactos] Tema no encontrado: ' + temaId + ' (' + res.status + ')');
            return null;
        }
        const css = await res.text();
        const vars = parsearRootVariables(css);

        if (Object.keys(vars).length === 0) {
            console.warn('[Contactos] Tema ' + temaId + ' sin variables :root');
            return null;
        }

        _temasCache.set(temaId, vars);
        return vars;
    } catch (e) {
        console.warn('[Contactos] Error cargando tema ' + temaId + ':', e);
        return null;
    }
}

function aplicarTemaATarjeta(el, vars) {
    if (!el || !vars) return;
    for (const [key, value] of Object.entries(vars)) {
        try { el.style.setProperty(key, value); } catch (e) { /* ignorar */ }
    }
}

// Precargar los temas que necesita la comunidad ANTES de renderizar
async function precargarTemasDeUsuarios() {
    const usados = new Set([TEMA_POR_DEFECTO]); // siempre violeta por si acaso
    for (const u of usuarios) {
        const cfg = configsGlobales[u.codigo];
        const t = (cfg && cfg.temaActivo) ? cfg.temaActivo : TEMA_POR_DEFECTO;
        usados.add(t);
    }
    await Promise.all([...usados].map(id => obtenerVariablesTema(id)));
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

    // Aplicar tema a cada tarjeta (ya está cacheado)
    grid.querySelectorAll('.ct-card').forEach(card => {
        const codigo = card.dataset.codigo;
        if (!codigo) return;

        const cfg = configsGlobales[codigo];
        const temaId = (cfg && cfg.temaActivo) ? cfg.temaActivo : TEMA_POR_DEFECTO;
        const vars = _temasCache.get(temaId);

        if (vars) {
            aplicarTemaATarjeta(card, vars);
        } else {
            console.warn('[Contactos] Sin vars para @' + codigo + ' (tema: ' + temaId + ')');
        }
    });

    // Cablear clicks
    grid.querySelectorAll('.ct-card').forEach(card => {
        const codigo = card.dataset.codigo;

        card.querySelector('.ct-btn-regalar')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.currentTarget.disabled) return;
            abrirModalRegalo(codigo);
        });

        card.addEventListener('click', () => {
            abrirPerfil(codigo);
        });
    });
}

function renderTarjeta(u) {
    const estado = presencia[u.codigo];
    const info = estadoInfo(estado?.estado);
    const avatar = renderAvatar(u);
    const regaladoHoy = yaRegaleHoy(u.codigo);
    const cuando = estado?.desde ? tiempoRelativo(estado.desde) : '';

    const lineaTiempo = cuando && estado?.estado
        ? `<span class="ct-estado-tiempo">· ${cuando}</span>`
        : '';

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
            <button class="ct-btn-regalar ${regaladoHoy ? 'bloqueado' : ''}"
                    ${regaladoHoy ? 'disabled' : ''}
                    title="${regaladoHoy ? 'Ya le regalaste hoy' : 'Regalar monedas'}">
                <i data-lucide="${regaladoHoy ? 'check' : 'gift'}"></i>
                ${regaladoHoy ? 'Enviado hoy' : 'Regalar'}
            </button>
        </div>
    `;
}

function renderAvatar(u) {
    if (u.foto) return `<img src="${u.foto}" alt="">`;
    const inicial = (u.nombre || '?').charAt(0).toUpperCase();
    return `<span class="ct-avatar-inicial">${escapar(inicial)}</span>`;
}

function yaRegaleHoy(codigoDestino) {
    const hoy = new Date().toDateString();
    return regalos.some(r =>
        r.de === usuarioActual.codigo &&
        r.para === codigoDestino &&
        new Date(r.fecha).toDateString() === hoy
    );
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

    const dados = regalos.filter(r => r.de === codigo).length;
    const recibidos = regalos.filter(r => r.para === codigo).length;
    document.getElementById('ctPerfilRegalosDados').textContent = dados;
    document.getElementById('ctPerfilRegalosRecibidos').textContent = recibidos;

    const btnRegalar = document.getElementById('ctPerfilRegalar');
    const txtRegalar = document.getElementById('ctPerfilRegalarTxt');
    const regaladoHoy = yaRegaleHoy(codigo);
    if (regaladoHoy) {
        btnRegalar.disabled = true;
        txtRegalar.textContent = 'Ya le regalaste hoy';
    } else {
        btnRegalar.disabled = false;
        txtRegalar.textContent = 'Regalar monedas';
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
//  HISTORIAL DE REGALOS
// ============================================================
function abrirHistorial() {
    histTab = 'dados';
    document.querySelectorAll('.ct-hist-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'dados');
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

    const filtro = histTab === 'dados'
        ? (r => r.de === usuarioActual.codigo)
        : (r => r.para === usuarioActual.codigo);

    const items = regalos.filter(filtro)
        .slice()
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 30);

    if (items.length === 0) {
        const titulo = histTab === 'dados' ? 'Todavía no regalaste nada' : 'Todavía no recibiste regalos';
        const desc = histTab === 'dados'
            ? 'Cuando le regales monedas a alguien, aparecerá acá.'
            : 'Cuando alguien te regale monedas, aparecerá acá.';
        lista.innerHTML = `
            <div class="ct-hist-vacio-card">
                <i data-lucide="${histTab === 'dados' ? 'gift' : 'inbox'}"></i>
                <h4>${titulo}</h4>
                <p>${desc}</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    lista.innerHTML = items.map(r => {
        const otroCodigo = histTab === 'dados' ? r.para : r.de;
        const otro = usuarios.find(u => u.codigo === otroCodigo);
        const nombreOtro = otro ? (otro.nombre || otroCodigo) : otroCodigo;
        const signo = histTab === 'dados' ? '−' : '+';
        const claseMonto = histTab === 'dados' ? 'negativo' : 'positivo';
        const prefijo = histTab === 'dados' ? 'Para' : 'De';

        return `
            <div class="ct-hist-item">
                <div class="ct-hist-icono">
                    <i data-lucide="gift"></i>
                </div>
                <div class="ct-hist-info">
                    <div class="ct-hist-nombre">${prefijo} ${escapar(nombreOtro)}</div>
                    <div class="ct-hist-meta">
                        <span>@${escapar(otroCodigo)}</span>
                        <span>·</span>
                        <span>${tiempoRelativo(r.fecha)}</span>
                    </div>
                </div>
                <div class="ct-hist-monto ${claseMonto}">
                    ${signo}${r.monto} 💎
                </div>
            </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL DE REGALO
// ============================================================
function abrirModalRegalo(codigo) {
    const u = usuarios.find(x => x.codigo === codigo);
    if (!u) return;

    destinatarioRegalo = u;
    montoSeleccionado = null;

    document.getElementById('ctRegaloTitulo').textContent = `Regalar a ${u.nombre || u.codigo}`;
    document.getElementById('ctMiSaldo').textContent = monedasPropias;

    document.querySelectorAll('.ct-monto').forEach(btn => {
        btn.classList.remove('selected');
        const m = parseInt(btn.dataset.monto, 10);
        btn.disabled = monedasPropias < m;
    });

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i data-lucide="send"></i> Enviar';

    document.getElementById('ctModalRegalo').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalRegalo() {
    document.getElementById('ctModalRegalo').hidden = true;
    destinatarioRegalo = null;
    montoSeleccionado = null;
}

function seleccionarMonto(monto) {
    montoSeleccionado = monto;
    document.querySelectorAll('.ct-monto').forEach(b => {
        b.classList.toggle('selected', parseInt(b.dataset.monto, 10) === monto);
    });
    const btn = document.getElementById('ctRegaloEnviar');
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="send"></i> Enviar ${monto}`;
    if (window.lucide) window.lucide.createIcons();
}

async function enviarRegalo() {
    if (!destinatarioRegalo || !montoSeleccionado) return;
    if (!MONTOS_VALIDOS.includes(montoSeleccionado)) return;

    const api = API();
    const bd = BD();
    if (!api || !bd) { toast('Sin conexión al sistema', 'error'); return; }

    const monto = montoSeleccionado;
    const receptor = destinatarioRegalo;
    const emisor = usuarioActual;

    const btnEnviar = document.getElementById('ctRegaloEnviar');
    if (btnEnviar.disabled) return;
    btnEnviar.disabled = true;
    const txtOriginal = btnEnviar.innerHTML;
    btnEnviar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Enviando...';
    if (window.lucide) window.lucide.createIcons();

    try {
        await api.gastoBoleta('gift', 'contactos', `Regalo a @${receptor.codigo}`, monto);

        await bd.actualizarArchivo(CONFIG_FILE, (all) => {
            if (!all || typeof all !== 'object') all = {};
            if (!all[receptor.codigo]) all[receptor.codigo] = {};
            all[receptor.codigo].monedas = (all[receptor.codigo].monedas || 0) + monto;
            return all;
        });

        const ahora = new Date().toISOString();
        const movId = 'mov_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
        try {
            await bd.actualizarArchivo(`app/chequera/${receptor.codigo}chequera.json`, (actual) => {
                if (!actual || typeof actual !== 'object') actual = { version: 1, movimientos: [] };
                if (!Array.isArray(actual.movimientos)) actual.movimientos = [];
                actual.movimientos.unshift({
                    id: movId,
                    tipo: 'canje',
                    icono: 'gift',
                    fuente: 'contactos',
                    texto: `Regalo de @${emisor.codigo}`,
                    cantidad: monto,
                    fecha: ahora
                });
                if (actual.movimientos.length > MAX_MOVIMIENTOS_CHEQUERA) {
                    actual.movimientos = actual.movimientos.slice(0, MAX_MOVIMIENTOS_CHEQUERA);
                }
                actual.actualizado = ahora;
                return actual;
            });
        } catch (e) {
            console.warn('[Contactos] No se pudo escribir en chequera del receptor:', e);
        }

        await bd.actualizarArchivo(ARCHIVO_REGALOS, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, regalos: [] };
            if (!Array.isArray(actual.regalos)) actual.regalos = [];
            actual.regalos.unshift({
                id: 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
                de: emisor.codigo,
                para: receptor.codigo,
                monto: monto,
                fecha: ahora
            });
            if (actual.regalos.length > 500) actual.regalos = actual.regalos.slice(0, 500);
            actual.actualizado = ahora;
            return actual;
        });

        try {
            await api.enviarNotificacion(
                'contactos',
                `${emisor.nombre}: te regaló ${monto} monedas`,
                receptor.codigo
            );
        } catch (e) {
            console.warn('[Contactos] No se pudo notificar:', e);
        }

        try { monedasPropias = api.obtenerMonedas(); } catch (e) { /* silencioso */ }
        regalos = await cargarRegalos();

        toast(`Regalo enviado a ${receptor.nombre}`, 'success');
        cerrarModalRegalo();
        render();
        if (perfilAbierto === receptor.codigo) {
            abrirPerfil(receptor.codigo);
        }
    } catch (e) {
        toast(e.message || 'No se pudo enviar el regalo', 'error');
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = txtOriginal;
        if (window.lucide) window.lucide.createIcons();
    }
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

        // Precargar temas ANTES de renderizar
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

    document.getElementById('ctBtnRefresh')?.addEventListener('click', refrescar);
    document.getElementById('ctBtnRegalos')?.addEventListener('click', abrirHistorial);

    document.getElementById('ctRegaloCerrar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloCancelar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloEnviar')?.addEventListener('click', enviarRegalo);

    document.querySelectorAll('.ct-monto').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            seleccionarMonto(parseInt(btn.dataset.monto, 10));
        });
    });

    document.getElementById('ctPerfilCerrar')?.addEventListener('click', cerrarPerfil);
    document.getElementById('ctPerfilRegalar')?.addEventListener('click', () => {
        if (!perfilAbierto) return;
        const codigo = perfilAbierto;
        cerrarPerfil();
        abrirModalRegalo(codigo);
    });

    document.getElementById('ctHistorialCerrar')?.addEventListener('click', cerrarHistorial);
    document.querySelectorAll('.ct-hist-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            histTab = tab.dataset.tab;
            document.querySelectorAll('.ct-hist-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderHistorial();
        });
    });

    document.querySelectorAll('.ct-yo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            cambiarMiEstado(btn.dataset.estado);
        });
    });

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
