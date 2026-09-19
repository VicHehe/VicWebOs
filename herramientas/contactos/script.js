// ============================================================
//  Contactos — Directorio de la comunidad + regalos + estado
//  ------------------------------------------------------------
//  Muestra todos los usuarios de la comunidad con su estado
//  (activo / descansando / desconectado), permite regalar
//  monedas (5, 25 o 50) una vez al día por persona, y permite
//  cambiar TU PROPIO estado sin necesidad del widget.
//
//  Datos:
//    app/contactos/presencia.json
//    app/contactos/regalos.json
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

let usuarioActual = null;
let usuarios = [];
let presencia = {};
let regalos = [];
let monedasPropias = 0;
let miEstado = null;

// Modal
let destinatarioRegalo = null;
let montoSeleccionado = null;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
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

// ============================================================
//  CARGA DE DATOS
// ============================================================
async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return [];
    try {
        const data = await bd.leerArchivoFresh(CUENTAS_FILE);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
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

// ============================================================
//  MI BLOQUE (perfil propio + estado)
// ============================================================
function renderMiBloque() {
    const avatarEl = document.getElementById('ctYoAvatar');
    const nombreEl = document.getElementById('ctYoNombre');

    if (nombreEl) nombreEl.textContent = usuarioActual.nombre || 'Sin nombre';

    if (avatarEl) {
        // Buscar mi entrada en la lista de usuarios para obtener la foto real
        const yo = usuarios.find(u => u.codigo === usuarioActual.codigo);
        if (yo && yo.foto) {
            avatarEl.innerHTML = `<img src="${yo.foto}" alt="">`;
        } else {
            const inicial = (usuarioActual.nombre || '?').charAt(0).toUpperCase();
            avatarEl.innerHTML = `<span class="ct-yo-avatar-inicial">${escapar(inicial)}</span>`;
        }
    }

    // Resaltar el botón del estado actual
    document.querySelectorAll('.ct-yo-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.estado === miEstado);
    });
}

async function cambiarMiEstado(nuevoEstado) {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) return;
    if (nuevoEstado === miEstado) return;

    const bd = BD();
    if (!bd) {
        toast('Sin conexión', 'error');
        return;
    }

    // Deshabilitar botones temporalmente
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
        render(); // Refrescar la lista (por si el orden cambia por estados)

        const labels = { activo: 'Activo', descansando: 'Descansando', desconectado: 'Desconectado' };
        toast(labels[nuevoEstado], 'success');

    } catch (e) {
        toast('No se pudo guardar', 'error');
    } finally {
        document.querySelectorAll('.ct-yo-btn').forEach(b => b.disabled = false);
    }
}

// ============================================================
//  RENDER LISTA DE OTROS
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

    // Ordenar: activos primero, luego descansando, luego desconectado, luego sin estado
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

    // Cablear botones
    grid.querySelectorAll('.ct-card').forEach(card => {
        const codigo = card.dataset.codigo;
        card.querySelector('.ct-btn-regalar')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (e.currentTarget.disabled) return;
            abrirModalRegalo(codigo);
        });
    });
}

function renderTarjeta(u) {
    const miEstado = presencia[u.codigo];
    const info = estadoInfo(miEstado?.estado);
    const avatar = renderAvatar(u);
    const regaladoHoy = yaRegaleHoy(u.codigo);

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
//  MODAL DE REGALO
// ============================================================
function abrirModalRegalo(codigo) {
    const u = usuarios.find(x => x.codigo === codigo);
    if (!u) return;

    destinatarioRegalo = u;
    montoSeleccionado = null;

    document.getElementById('ctRegaloTitulo').textContent = `Regalar a ${u.nombre || u.codigo}`;
    document.getElementById('ctMiSaldo').textContent = monedasPropias;

    // Resetear montos
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

// ============================================================
//  ENVIAR REGALO
// ============================================================
async function enviarRegalo() {
    if (!destinatarioRegalo || !montoSeleccionado) return;
    if (!MONTOS_VALIDOS.includes(montoSeleccionado)) return;

    const api = API();
    const bd = BD();
    if (!api || !bd) {
        toast('Sin conexión al sistema', 'error');
        return;
    }

    const monto = montoSeleccionado;
    const receptor = destinatarioRegalo;
    const emisor = usuarioActual;

    // Bloquear botón
    const btnEnviar = document.getElementById('ctRegaloEnviar');
    if (btnEnviar.disabled) return;
    btnEnviar.disabled = true;
    const txtOriginal = btnEnviar.innerHTML;
    btnEnviar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Enviando...';
    if (window.lucide) window.lucide.createIcons();

    try {
        // 1. Cobrar al emisor (actualiza configCuentaActual + monedas header + chequera)
        await api.gastoBoleta('gift', 'contactos', `Regalo a @${receptor.codigo}`, monto);

        // 2. Darle al receptor (raw, porque canjear solo afecta al usuario actual)
        await bd.actualizarArchivo(CONFIG_FILE, (all) => {
            if (!all || typeof all !== 'object') all = {};
            if (!all[receptor.codigo]) all[receptor.codigo] = {};
            all[receptor.codigo].monedas = (all[receptor.codigo].monedas || 0) + monto;
            return all;
        });

        // 3. Movimiento en la chequera del receptor (best effort)
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

        // 4. Registrar el regalo
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

        // 5. Notificar al receptor
        try {
            await api.enviarNotificacion(
                'contactos',
                `${emisor.nombre}: te regaló ${monto} monedas`,
                receptor.codigo
            );
        } catch (e) {
            console.warn('[Contactos] No se pudo notificar:', e);
        }

        // 6. Refrescar estado local
        try {
            monedasPropias = api.obtenerMonedas();
        } catch (e) { /* silencioso */ }
        regalos = await cargarRegalos();

        toast(`Regalo enviado a ${receptor.nombre}`, 'success');
        cerrarModalRegalo();
        render();

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
        miEstado = presencia[usuarioActual.codigo]?.estado || null;

        const api = API();
        if (api) {
            try { monedasPropias = api.obtenerMonedas() || 0; }
            catch (e) { monedasPropias = 0; }
        }

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

    // Eventos
    document.getElementById('ctBtnRefresh')?.addEventListener('click', refrescar);
    document.getElementById('ctRegaloCerrar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloCancelar')?.addEventListener('click', cerrarModalRegalo);
    document.getElementById('ctRegaloEnviar')?.addEventListener('click', enviarRegalo);

    document.querySelectorAll('.ct-monto').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            seleccionarMonto(parseInt(btn.dataset.monto, 10));
        });
    });

    // Selector de MI estado
    document.querySelectorAll('.ct-yo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            cambiarMiEstado(btn.dataset.estado);
        });
    });

    // Click fuera del modal
    document.getElementById('ctModalRegalo')?.addEventListener('click', (e) => {
        if (e.target.id === 'ctModalRegalo') cerrarModalRegalo();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('ctModalRegalo').hidden) {
            cerrarModalRegalo();
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
