// ============================================================
//  Cuenta.js — Cuentas + apps + temas + widgets + espacio/monedas
//  ------------------------------------------------------------
//  Sesiones AHORA son POR COMUNIDAD: cada comunidad tiene su
//  propio código de usuario activo guardado localmente.
//
//  Concurrencia:
//  - guardarConfigCuenta usa ConfigBD.actualizarArchivo (merge real)
//  - canjear/gastoBoleta usan actualizarArchivo para el chequero
//  - Las operaciones de compra/instalación usan un lock en memoria
//    para evitar doble-click o doble-tap.
// ============================================================

const CUENTAS_FILE = 'cuenta.json';
const CUENTA_CONFIG_FILE = 'cuentaConfig.json';
const CHEQUERA_FILE_BASE = 'app/chequera/';

// Sesiones por comunidad: { comId: codigo }
const SESIONES_KEY = 'vicwebos_sesiones';
// Últimos códigos usados por comunidad: { comId: codigo }
const ULTIMOS_CODIGOS_KEY = 'vicwebos_ultimos_codigos';

// ============================================================
//  CONSTANTES DE ESPACIO Y MONEDAS
//  Con var + window.X para que sean accesibles desde cualquier
//  script sin depender del scope léxico global.
// ============================================================
var ESPACIO_INICIAL          = 50;
var ESPACIO_POR_COMPRA       = 12;
var COSTO_COMPRA_ESPACIO     = 2500;
var MONEDAS_INICIALES        = 0;
var MAX_WIDGETS_ACTIVOS      = 3;
var MAX_MOVIMIENTOS_CHEQUERA = 500;
var MAX_ACCESOS_RAPIDOS      = 10;

window.ESPACIO_INICIAL          = ESPACIO_INICIAL;
window.ESPACIO_POR_COMPRA       = ESPACIO_POR_COMPRA;
window.COSTO_COMPRA_ESPACIO     = COSTO_COMPRA_ESPACIO;
window.MONEDAS_INICIALES        = MONEDAS_INICIALES;
window.MAX_WIDGETS_ACTIVOS      = MAX_WIDGETS_ACTIVOS;
window.MAX_MOVIMIENTOS_CHEQUERA = MAX_MOVIMIENTOS_CHEQUERA;
window.MAX_ACCESOS_RAPIDOS      = MAX_ACCESOS_RAPIDOS;

let cuentaActual = null;
let configCuentaActual = null;

// ------------------------------------------------------------
//  Lock en memoria: evita que la misma operación se dispare
//  dos veces si el usuario pulsa el botón muy rápido.
// ------------------------------------------------------------
const _locks = new Set();

async function _conLock(clave, fn) {
    if (_locks.has(clave)) {
        throw new Error('Operación en curso. Espera un momento.');
    }
    _locks.add(clave);
    try {
        return await fn();
    } finally {
        _locks.delete(clave);
    }
}

// ------------------------------------------------------------
//  Exponer como getters de window para scripts que no comparten
//  scope con este archivo.
// ------------------------------------------------------------
Object.defineProperty(window, 'cuentaActual', {
    get: () => cuentaActual,
    configurable: true
});
Object.defineProperty(window, 'configCuentaActual', {
    get: () => configCuentaActual,
    configurable: true
});

// ============================================================
//  SESIONES POR COMUNIDAD
// ============================================================
function leerSesiones() {
    try {
        const raw = localStorage.getItem(SESIONES_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch (e) { console.warn(e); }

    // Migración desde formato viejo (una sola sesión global)
    try {
        const viejo = localStorage.getItem('vicwebos_cuenta');
        if (viejo) {
            const com = (typeof window.obtenerComunidadActiva === 'function')
                ? window.obtenerComunidadActiva() : null;
            if (com) {
                const ses = { [com.id]: viejo };
                localStorage.setItem(SESIONES_KEY, JSON.stringify(ses));
                localStorage.removeItem('vicwebos_cuenta');
                return ses;
            }
        }
    } catch (e) { /* silencioso */ }

    return {};
}

function guardarSesiones(ses) {
    try {
        localStorage.setItem(SESIONES_KEY, JSON.stringify(ses || {}));
    } catch (e) { console.warn(e); }
}

function obtenerCodigoActivo() {
    const com = (typeof window.obtenerComunidadActiva === 'function')
        ? window.obtenerComunidadActiva() : null;
    if (!com) return null;
    const ses = leerSesiones();
    return ses[com.id] || null;
}

function guardarCodigoActivo(codigo) {
    const com = (typeof window.obtenerComunidadActiva === 'function')
        ? window.obtenerComunidadActiva() : null;
    if (!com) return;
    const ses = leerSesiones();
    if (codigo) ses[com.id] = codigo;
    else delete ses[com.id];
    guardarSesiones(ses);
}

// ------------------------------------------------------------
//  Último código por comunidad (para pre-rellenar el login)
// ------------------------------------------------------------
function leerUltimosCodigos() {
    try {
        const raw = localStorage.getItem(ULTIMOS_CODIGOS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch (e) { console.warn(e); }

    // Migración desde formato viejo
    try {
        const viejo = localStorage.getItem('vicwebos_ultimo_codigo');
        if (viejo) {
            const com = (typeof window.obtenerComunidadActiva === 'function')
                ? window.obtenerComunidadActiva() : null;
            if (com) {
                const map = { [com.id]: viejo };
                localStorage.setItem(ULTIMOS_CODIGOS_KEY, JSON.stringify(map));
                localStorage.removeItem('vicwebos_ultimo_codigo');
                return map;
            }
        }
    } catch (e) { /* silencioso */ }

    return {};
}

function guardarUltimosCodigos(map) {
    try {
        localStorage.setItem(ULTIMOS_CODIGOS_KEY, JSON.stringify(map || {}));
    } catch (e) { console.warn(e); }
}

function obtenerUltimoCodigo() {
    const com = (typeof window.obtenerComunidadActiva === 'function')
        ? window.obtenerComunidadActiva() : null;
    if (!com) return null;
    const map = leerUltimosCodigos();
    return map[com.id] || null;
}

function guardarUltimoCodigo(codigo) {
    const com = (typeof window.obtenerComunidadActiva === 'function')
        ? window.obtenerComunidadActiva() : null;
    if (!com) return;
    const map = leerUltimosCodigos();
    if (codigo) map[com.id] = codigo;
    else delete map[com.id];
    guardarUltimosCodigos(map);
}

// ============================================================
//  DEFAULT CONFIG
// ============================================================
const CONFIG_CUENTA_DEFAULT = {
    appsInstaladas: ['stor-he', 'chequera'],
    temasInstalados: ['violeta'],
    temaActivo: 'violeta',
    widgetsInstalados: [],
    widgetsActivos: [],
    espacioMaximo: ESPACIO_INICIAL,
    monedas: MONEDAS_INICIALES,
    accesosRapidos: ['stor-he', 'chequera']
};

function clonarConfigDefault() {
    return {
        appsInstaladas:    [...CONFIG_CUENTA_DEFAULT.appsInstaladas],
        temasInstalados:   [...CONFIG_CUENTA_DEFAULT.temasInstalados],
        temaActivo:        CONFIG_CUENTA_DEFAULT.temaActivo,
        widgetsInstalados: [...CONFIG_CUENTA_DEFAULT.widgetsInstalados],
        widgetsActivos:    [...CONFIG_CUENTA_DEFAULT.widgetsActivos],
        espacioMaximo:     CONFIG_CUENTA_DEFAULT.espacioMaximo,
        monedas:           CONFIG_CUENTA_DEFAULT.monedas,
        accesosRapidos:    [...CONFIG_CUENTA_DEFAULT.accesosRapidos]
    };
}

// ============================================================
//  CUENTAS
// ============================================================
async function cargarCuentas() {
    if (!ConfigBD.estaConectado()) return [];
    const data = await ConfigBD.leerArchivo(CUENTAS_FILE);
    return Array.isArray(data) ? data : [];
}

async function guardarCuentas(cuentas) {
    return await ConfigBD.escribirArchivo(CUENTAS_FILE, cuentas);
}

async function buscarCuentaPorCodigo(codigo) {
    const cuentas = await cargarCuentas();
    return cuentas.find(c => c.codigo === codigo.toUpperCase()) || null;
}

// ============================================================
//  CONFIG POR CUENTA
// ============================================================
async function leerTodasConfigCuentas() {
    if (!ConfigBD.estaConectado()) return {};
    const data = await ConfigBD.leerArchivo(CUENTA_CONFIG_FILE);
    return (data && typeof data === 'object') ? data : {};
}

async function leerTodasConfigCuentasFresh() {
    if (!ConfigBD.estaConectado()) return {};
    const data = await ConfigBD.leerArchivoFresh(CUENTA_CONFIG_FILE);
    return (data && typeof data === 'object') ? data : {};
}

async function obtenerConfigCuenta(codigo) {
    const all = await leerTodasConfigCuentasFresh();
    const cfg = { ...CONFIG_CUENTA_DEFAULT, ...(all[codigo] || {}) };
    if (typeof cfg.espacioMaximo !== 'number') cfg.espacioMaximo = ESPACIO_INICIAL;
    if (typeof cfg.monedas !== 'number') cfg.monedas = MONEDAS_INICIALES;
    if (!Array.isArray(cfg.accesosRapidos)) cfg.accesosRapidos = [...CONFIG_CUENTA_DEFAULT.accesosRapidos];
    return cfg;
}

async function guardarConfigCuenta(codigo, configOrMutador) {
    return await ConfigBD.actualizarArchivo(CUENTA_CONFIG_FILE, (all) => {
        if (!all || typeof all !== 'object') all = {};
        const actual = all[codigo] || {};
        let nueva;
        if (typeof configOrMutador === 'function') {
            nueva = configOrMutador({ ...actual });
            if (nueva === undefined) nueva = actual;
        } else {
            nueva = configOrMutador;
        }
        all[codigo] = nueva;
        return all;
    });
}

// ============================================================
//  MIGRACIÓN
// ============================================================
async function migrarAppsPorDefecto(codigo) {
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const requeridas = catalogo
        .filter(a => a.esBase || a.esDefault)
        .map(a => a.id);

    const instaladas = configCuentaActual.appsInstaladas || [];
    const faltantes = requeridas.filter(id => !instaladas.includes(id));
    if (faltantes.length === 0) return;

    await guardarConfigCuenta(codigo, (cfg) => {
        if (!Array.isArray(cfg.appsInstaladas)) cfg.appsInstaladas = [];
        faltantes.forEach(id => {
            if (!cfg.appsInstaladas.includes(id)) cfg.appsInstaladas.push(id);
        });
        return cfg;
    });

    configCuentaActual = await obtenerConfigCuenta(codigo);
}

// ============================================================
//  ESPACIO Y MONEDAS
// ============================================================
function obtenerEspacioMaximo() {
    return configCuentaActual?.espacioMaximo ?? ESPACIO_INICIAL;
}

function obtenerMonedas() {
    return configCuentaActual?.monedas ?? MONEDAS_INICIALES;
}

function calcularEspacioUsado() {
    if (!configCuentaActual) return 0;

    const apps    = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const temas   = typeof TEMAS_DISPONIBLES  !== 'undefined' ? TEMAS_DISPONIBLES  : [];
    const widgets = typeof WIDGETS_DISPONIBLES !== 'undefined' ? WIDGETS_DISPONIBLES : [];

    let total = 0;

    (configCuentaActual.appsInstaladas || []).forEach(id => {
        const a = apps.find(x => x.id === id);
        if (a && !a.esBase) total += (a.espacio || 0);
    });
    (configCuentaActual.temasInstalados || []).forEach(id => {
        const t = temas.find(x => x.id === id);
        if (t && !t.esBase) total += (t.espacio || 0);
    });
    (configCuentaActual.widgetsInstalados || []).forEach(id => {
        const w = widgets.find(x => x.id === id);
        if (w && !w.esBase) total += (w.espacio || 0);
    });

    return total;
}

function calcularEspacioLibre() {
    return obtenerEspacioMaximo() - calcularEspacioUsado();
}

function puedeInstalar({ espacio = 0, monedas = 0 }) {
    if (!cuentaActual) return { ok: false, motivo: 'Necesitas una cuenta.' };
    if (calcularEspacioLibre() < espacio) {
        return { ok: false, motivo: `Necesitas ${espacio} de espacio (tienes ${calcularEspacioLibre()} libres).` };
    }
    if (obtenerMonedas() < monedas) {
        return { ok: false, motivo: `Necesitas ${monedas} monedas (tienes ${obtenerMonedas()}).` };
    }
    return { ok: true };
}

// ============================================================
//  ACCESOS RÁPIDOS
// ============================================================
function obtenerAccesosRapidos() {
    if (!configCuentaActual) return [];
    if (!Array.isArray(configCuentaActual.accesosRapidos)) return [];
    return configCuentaActual.accesosRapidos;
}

async function activarAccesoRapido(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    return await _conLock(`acceso:${id}`, async () => {
        const codigo = cuentaActual.codigo;
        const cfg = await obtenerConfigCuenta(codigo);
        if (!Array.isArray(cfg.accesosRapidos)) cfg.accesosRapidos = [];
        if (cfg.accesosRapidos.includes(id)) return;
        if (cfg.accesosRapidos.length >= MAX_ACCESOS_RAPIDOS) {
            throw new Error(`Máximo ${MAX_ACCESOS_RAPIDOS} accesos rápidos. Quita uno para añadir otro.`);
        }
        cfg.accesosRapidos.push(id);
        await guardarConfigCuenta(codigo, cfg);
        configCuentaActual.accesosRapidos = cfg.accesosRapidos;
    });
}

async function desactivarAccesoRapido(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    return await _conLock(`acceso:${id}`, async () => {
        const codigo = cuentaActual.codigo;
        const cfg = await obtenerConfigCuenta(codigo);
        cfg.accesosRapidos = (cfg.accesosRapidos || []).filter(x => x !== id);
        await guardarConfigCuenta(codigo, cfg);
        configCuentaActual.accesosRapidos = cfg.accesosRapidos;
    });
}

// ============================================================
//  CHEQUERA
// ============================================================
function rutaChequera(codigo) {
    return CHEQUERA_FILE_BASE + codigo + 'chequera.json';
}

async function leerChequeraUsuario() {
    if (!cuentaActual) return { version: 1, movimientos: [] };
    try {
        const data = await ConfigBD.leerArchivoFresh(rutaChequera(cuentaActual.codigo));
        if (data && Array.isArray(data.movimientos)) return data;
    } catch (e) { /* no existe */ }
    return { version: 1, movimientos: [] };
}

function generarIdMovimiento() {
    return 'mov_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

async function _añadirMovimientoChequera(movimiento) {
    if (!cuentaActual) return;
    const ruta = rutaChequera(cuentaActual.codigo);
    await ConfigBD.actualizarArchivo(ruta, (actual) => {
        if (!actual || typeof actual !== 'object') {
            actual = { version: 1, movimientos: [] };
        }
        if (!Array.isArray(actual.movimientos)) actual.movimientos = [];
        actual.movimientos.unshift(movimiento);
        if (actual.movimientos.length > MAX_MOVIMIENTOS_CHEQUERA) {
            actual.movimientos = actual.movimientos.slice(0, MAX_MOVIMIENTOS_CHEQUERA);
        }
        actual.actualizado = new Date().toISOString();
        return actual;
    });
}

async function _notificarMovimientoMonedas(tipo, fuente, texto, cantidad) {
    try {
        if (!window.Notificaciones) return;
        if (!cuentaActual) return;
        const signo = tipo === 'canje' ? '+' : '−';
        const verbo = tipo === 'canje' ? 'Ganaste' : 'Gastaste';
        const mensaje = `${verbo} ${signo}${cantidad} monedas · ${fuente}: ${texto}`;
        await window.Notificaciones.enviar('chequera', mensaje, cuentaActual.codigo);
    } catch (e) {
        console.warn('[Cuenta] No se pudo enviar la notificación:', e);
    }
}

// ============================================================
//  CANJEAR
// ============================================================
async function canjear(icono, fuente, texto, cantidad) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser positiva.');

    const codigo = cuentaActual.codigo;

    return await _conLock(`monedas:${codigo}`, async () => {
        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.monedas = (cfg.monedas || 0) + cantidad;
            return cfg;
        });

        configCuentaActual = await obtenerConfigCuenta(codigo);

        const mov = {
            id: generarIdMovimiento(),
            tipo: 'canje',
            icono: icono || 'coins',
            fuente: fuente || 'app',
            texto: texto || 'Recompensa',
            cantidad: cantidad,
            fecha: new Date().toISOString()
        };
        try {
            await _añadirMovimientoChequera(mov);
        } catch (e) {
            console.warn('[Cuenta] No se pudo guardar en chequera:', e);
        }

        if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        if (typeof window.__notificarCambioChequera === 'function') window.__notificarCambioChequera();
        await _notificarMovimientoMonedas('canje', fuente, texto, cantidad);

        return { ok: true, monedas: configCuentaActual.monedas };
    });
}

// ============================================================
//  GASTO BOLETA
// ============================================================
async function gastoBoleta(icono, fuente, texto, cantidad) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser positiva.');

    const codigo = cuentaActual.codigo;

    return await _conLock(`monedas:${codigo}`, async () => {
        let saldoFinal = 0;
        await guardarConfigCuenta(codigo, (cfg) => {
            const actuales = cfg.monedas || 0;
            if (actuales < cantidad) {
                const e = new Error(`No tienes suficientes monedas (tienes ${actuales}, necesitas ${cantidad}).`);
                e.code = 'SIN_SALDO';
                throw e;
            }
            cfg.monedas = actuales - cantidad;
            saldoFinal = cfg.monedas;
            return cfg;
        });

        configCuentaActual = await obtenerConfigCuenta(codigo);

        const mov = {
            id: generarIdMovimiento(),
            tipo: 'gasto',
            icono: icono || 'receipt',
            fuente: fuente || 'app',
            texto: texto || 'Gasto',
            cantidad: -cantidad,
            fecha: new Date().toISOString()
        };
        try {
            await _añadirMovimientoChequera(mov);
        } catch (e) {
            console.warn('[Cuenta] No se pudo guardar en chequera:', e);
        }

        if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        if (typeof window.__notificarCambioChequera === 'function') window.__notificarCambioChequera();
        await _notificarMovimientoMonedas('gasto', fuente, texto, cantidad);

        return { ok: true, monedas: saldoFinal };
    });
}

// ============================================================
//  COMPRAR ESPACIO
// ============================================================
async function comprarEspacio() {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (obtenerMonedas() < COSTO_COMPRA_ESPACIO) {
        throw new Error(`Te faltan ${COSTO_COMPRA_ESPACIO - obtenerMonedas()} monedas.`);
    }
    const codigo = cuentaActual.codigo;

    return await _conLock(`comprarEspacio:${codigo}`, async () => {
        await gastoBoleta('hard-drive', 'stor-he', 'Ampliar espacio (+12)', COSTO_COMPRA_ESPACIO);

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.espacioMaximo = (cfg.espacioMaximo || ESPACIO_INICIAL) + ESPACIO_POR_COMPRA;
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        return { ok: true, espacioMaximo: configCuentaActual.espacioMaximo, monedas: configCuentaActual.monedas };
    });
}

// ============================================================
//  VALIDACIÓN
// ============================================================
function validarFormatoCodigo(codigo) {
    return /^[0-9]{4}[A-Z]$/.test(codigo);
}

// ============================================================
//  FOTO
// ============================================================
function procesarFoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX = 200;
                let { width, height } = img;
                if (width > height) {
                    if (width > MAX) { height = height * MAX / width; width = MAX; }
                } else {
                    if (height > MAX) { width = width * MAX / height; height = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo.'));
        reader.readAsDataURL(file);
    });
}

// ============================================================
//  CREAR / LOGIN / LOGOUT
// ============================================================
async function crearCuenta({ foto, nombre, pronombre, codigo }) {
    if (!ConfigBD.estaConectado()) {
        throw new Error('Conecta una comunidad primero desde "Comunidades".');
    }
    const codigoUp = codigo.toUpperCase();
    if (!validarFormatoCodigo(codigoUp)) {
        throw new Error('El código debe ser 4 dígitos seguidos de 1 letra (ej: 1234A).');
    }
    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre es obligatorio.');
    }

    return await _conLock('crearCuenta', async () => {
        const cuentas = await cargarCuentas();
        if (cuentas.some(c => c.codigo === codigoUp)) {
            throw new Error('Ese código ya está en uso en esta comunidad. Elige otro.');
        }
        const nueva = {
            codigo: codigoUp,
            nombre: nombre.trim(),
            pronombre: pronombre || 'el',
            foto: foto || null,
            creado: new Date().toISOString()
        };
        cuentas.push(nueva);
        await guardarCuentas(cuentas);

        await guardarConfigCuenta(codigoUp, clonarConfigDefault());

        await iniciarSesion(codigoUp);
        return nueva;
    });
}

async function iniciarSesion(codigo) {
    if (!ConfigBD.estaConectado()) {
        throw new Error('Conecta una comunidad primero.');
    }
    const codigoUp = codigo.toUpperCase();
    if (!validarFormatoCodigo(codigoUp)) {
        throw new Error('Formato de código inválido. Debe ser 4 dígitos + 1 letra.');
    }
    const cuentas = await cargarCuentas();
    const cuenta = cuentas.find(c => c.codigo === codigoUp);
    if (!cuenta) throw new Error('Código incorrecto o cuenta no encontrada en esta comunidad.');

    cuentaActual = cuenta;
    configCuentaActual = await obtenerConfigCuenta(codigoUp);

    await migrarAppsPorDefecto(codigoUp);

    guardarCodigoActivo(codigoUp);
    guardarUltimoCodigo(codigoUp);

    cargarCSSTema(obtenerTemaActivo());
    actualizarAvatarHeader();
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    if (typeof actualizarSaludo === 'function') actualizarSaludo();
    if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();

    window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
        detail: { codigo: codigoUp, activa: true }
    }));

    return cuenta;
}

function cerrarSesion() {
    cuentaActual = null;
    configCuentaActual = null;
    guardarCodigoActivo(null);

    cargarCSSTema('violeta');
    actualizarAvatarHeader();
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    if (typeof actualizarSaludo === 'function') actualizarSaludo();

    window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
        detail: { codigo: null, activa: false }
    }));
}

async function restaurarSesion() {
    if (!ConfigBD.estaConectado()) {
        window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
            detail: { codigo: null, activa: false }
        }));
        return null;
    }

    const codigo = obtenerCodigoActivo();
    if (!codigo) {
        window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
            detail: { codigo: null, activa: false }
        }));
        return null;
    }

    try {
        const cuentas = await cargarCuentas();
        const cuenta = cuentas.find(c => c.codigo === codigo);
        if (!cuenta) {
            guardarCodigoActivo(null);
            window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
                detail: { codigo: null, activa: false }
            }));
            return null;
        }
        cuentaActual = cuenta;
        configCuentaActual = await obtenerConfigCuenta(codigo);

        await migrarAppsPorDefecto(codigo);

        cargarCSSTema(obtenerTemaActivo());
        actualizarAvatarHeader();

        window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
            detail: { codigo, activa: true }
        }));

        return cuenta;
    } catch (e) {
        console.warn('No se pudo restaurar sesión:', e);
        window.dispatchEvent(new CustomEvent('vicwebos:sesion', {
            detail: { codigo: null, activa: false }
        }));
        return null;
    }
}

// ============================================================
//  CAMBIO DE COMUNIDAD
//  ------------------------------------------------------------
//  Reemplaza la "activa" en ConfigBD, resetea la sesión local y
//  restaura la que corresponda a esa comunidad. Cierra pestañas.
// ============================================================
async function cambiarComunidad(id) {
    if (!id) throw new Error('ID de comunidad requerido.');
    const com = (typeof window.obtenerComunidadPorId === 'function')
        ? window.obtenerComunidadPorId(id) : null;
    if (!com) throw new Error('Comunidad no encontrada.');

    // Cerrar todas las pestañas (una app puede no existir en la nueva comunidad)
    if (typeof window.__cerrarTodasLasPestanas === 'function') {
        window.__cerrarTodasLasPestanas();
    }

    // Activar en ConfigBD (invalida caché)
    await ConfigBD.activarComunidad(id);

    // Olvidar la rama cacheada de binarios (por si cambió el repo)
    if (typeof ConfigBD.__olvidarRamasBinarios === 'function') {
        ConfigBD.__olvidarRamasBinarios();
    }

    // Resetear estado local
    cuentaActual = null;
    configCuentaActual = null;

    // Restaurar sesión para la nueva comunidad
    await restaurarSesion();

    // Actualizar UI
    actualizarAvatarHeader();
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    if (typeof actualizarSaludo === 'function') actualizarSaludo();
    if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
    if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
    if (typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();

    window.dispatchEvent(new CustomEvent('vicwebos:comunidad', { detail: { id } }));
}

// ============================================================
//  APPS
// ============================================================
function obtenerAppsInstaladas() { return configCuentaActual?.appsInstaladas || []; }
function estaInstalada(id) { return obtenerAppsInstaladas().includes(id); }

async function instalarApp(id) {
    if (!ConfigBD.estaConectado()) throw new Error('Conecta una comunidad primero.');
    if (!cuentaActual) throw new Error('Necesitas una cuenta para instalar apps.');

    const codigo = cuentaActual.codigo;
    return await _conLock(`instalarApp:${id}`, async () => {
        const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
        const app = catalogo.find(a => a.id === id);
        if (!app) throw new Error('App no encontrada.');

        configCuentaActual = await obtenerConfigCuenta(codigo);
        if ((configCuentaActual.appsInstaladas || []).includes(id)) {
            return { ok: true, yaEstaba: true };
        }

        const check = puedeInstalar({ espacio: app.espacio || 0, monedas: app.monedas || 0 });
        if (!check.ok) throw new Error(check.motivo);

        if ((app.monedas || 0) > 0) {
            await gastoBoleta('package', 'stor-he', `App: ${app.nombre}`, app.monedas);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            if (!Array.isArray(cfg.appsInstaladas)) cfg.appsInstaladas = [];
            if (!cfg.appsInstaladas.includes(id)) cfg.appsInstaladas.push(id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        return { ok: true };
    });
}

async function desinstalarApp(id) {
    if (!ConfigBD.estaConectado()) throw new Error('Conecta una comunidad primero.');
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');

    const codigo = cuentaActual.codigo;
    return await _conLock(`desinstalarApp:${id}`, async () => {
        const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
        const app = catalogo.find(a => a.id === id);
        if (app && app.esBase) throw new Error('Esta app es del sistema y no se puede desinstalar.');

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.appsInstaladas = (cfg.appsInstaladas || []).filter(a => a !== id);
            cfg.accesosRapidos = (cfg.accesosRapidos || []).filter(a => a !== id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
    });
}

// ============================================================
//  TEMAS
// ============================================================
function obtenerTemasInstalados() { return configCuentaActual?.temasInstalados || []; }
function obtenerTemaActivo() { return configCuentaActual?.temaActivo || 'violeta'; }

async function instalarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`instalarTema:${id}`, async () => {
        const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
        const tema = catalogo.find(t => t.id === id);
        if (!tema) throw new Error('Tema no encontrado.');

        configCuentaActual = await obtenerConfigCuenta(codigo);
        if ((configCuentaActual.temasInstalados || []).includes(id)) {
            return { ok: true, yaEstaba: true };
        }

        const check = puedeInstalar({ espacio: tema.espacio || 0, monedas: tema.monedas || 0 });
        if (!check.ok) throw new Error(check.motivo);

        if ((tema.monedas || 0) > 0) {
            await gastoBoleta('palette', 'stor-he', `Tema: ${tema.nombre}`, tema.monedas);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            if (!Array.isArray(cfg.temasInstalados)) cfg.temasInstalados = [];
            if (!cfg.temasInstalados.includes(id)) cfg.temasInstalados.push(id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        return { ok: true };
    });
}

async function desinstalarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`desinstalarTema:${id}`, async () => {
        const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
        const tema = catalogo.find(t => t.id === id);
        if (tema && tema.esBase) throw new Error('Este tema es base y no se puede desinstalar.');

        let temaActivoQuedo = null;
        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.temasInstalados = (cfg.temasInstalados || []).filter(t => t !== id);
            if (cfg.temaActivo === id) {
                cfg.temaActivo = 'violeta';
                temaActivoQuedo = 'violeta';
            }
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        if (temaActivoQuedo) cargarCSSTema('violeta');
    });
}

async function aplicarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema) throw new Error('Tema no encontrado.');

    const codigo = cuentaActual.codigo;
    await guardarConfigCuenta(codigo, (cfg) => {
        cfg.temaActivo = id;
        return cfg;
    });
    configCuentaActual = await obtenerConfigCuenta(codigo);
    cargarCSSTema(id);
}

function cargarCSSTema(id) {
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema || !tema.ruta) return;

    const viejo = document.getElementById('tema-activo');
    if (viejo) viejo.remove();

    const nuevo = document.createElement('link');
    nuevo.id = 'tema-activo';
    nuevo.rel = 'stylesheet';
    nuevo.href = tema.ruta;

    let notificado = false;
    const notificar = () => {
        if (notificado) return;
        notificado = true;
        if (typeof window.__notificarCambioTema === 'function') {
            window.__notificarCambioTema();
        }
    };

    nuevo.addEventListener('load', () => {
        requestAnimationFrame(() => {
            requestAnimationFrame(notificar);
        });
    });
    setTimeout(notificar, 400);

    document.head.appendChild(nuevo);
}

// ============================================================
//  WIDGETS
// ============================================================
function obtenerWidgetsInstalados() { return configCuentaActual?.widgetsInstalados || []; }
function obtenerWidgetsActivos() { return configCuentaActual?.widgetsActivos || []; }

async function instalarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`instalarWidget:${id}`, async () => {
        const catalogo = typeof WIDGETS_DISPONIBLES !== 'undefined' ? WIDGETS_DISPONIBLES : [];
        const w = catalogo.find(x => x.id === id);
        if (!w) throw new Error('Widget no encontrado.');

        configCuentaActual = await obtenerConfigCuenta(codigo);
        if ((configCuentaActual.widgetsInstalados || []).includes(id)) {
            return { ok: true, yaEstaba: true };
        }

        const check = puedeInstalar({ espacio: w.espacio || 0, monedas: w.monedas || 0 });
        if (!check.ok) throw new Error(check.motivo);

        if ((w.monedas || 0) > 0) {
            await gastoBoleta('layout-grid', 'stor-he', `Widget: ${w.nombre}`, w.monedas);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            if (!Array.isArray(cfg.widgetsInstalados)) cfg.widgetsInstalados = [];
            if (!cfg.widgetsInstalados.includes(id)) cfg.widgetsInstalados.push(id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        return { ok: true };
    });
}

async function desinstalarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`desinstalarWidget:${id}`, async () => {
        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.widgetsInstalados = (cfg.widgetsInstalados || []).filter(w => w !== id);
            cfg.widgetsActivos = (cfg.widgetsActivos || []).filter(w => w !== id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    });
}

async function activarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`activarWidget:${id}`, async () => {
        await guardarConfigCuenta(codigo, (cfg) => {
            if (!Array.isArray(cfg.widgetsActivos)) cfg.widgetsActivos = [];
            if (cfg.widgetsActivos.includes(id)) return cfg;
            if (cfg.widgetsActivos.length >= MAX_WIDGETS_ACTIVOS) {
                throw new Error(`Máximo ${MAX_WIDGETS_ACTIVOS} widgets activos. Desactiva uno para activar otro.`);
            }
            cfg.widgetsActivos.push(id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    });
}

async function desactivarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const codigo = cuentaActual.codigo;

    return await _conLock(`desactivarWidget:${id}`, async () => {
        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.widgetsActivos = (cfg.widgetsActivos || []).filter(w => w !== id);
            return cfg;
        });
        configCuentaActual = await obtenerConfigCuenta(codigo);
        if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    });
}

// ============================================================
//  AVATAR HEADER
// ============================================================
function actualizarAvatarHeader() {
    const btn = document.getElementById('btnConfig');
    if (!btn) return;
    if (cuentaActual?.foto) {
        btn.innerHTML = `<img src="${cuentaActual.foto}" alt="" class="avatar-img">`;
    } else if (cuentaActual) {
        const inicial = (cuentaActual.nombre || '?').charAt(0).toUpperCase();
        btn.innerHTML = `<span class="avatar-inicial">${inicial}</span>`;
    } else {
        btn.innerHTML = `<i data-lucide="user" class="avatar-icon"></i>`;
        lucide.createIcons();
    }
}

// ============================================================
//  UI CUENTA
// ============================================================
function inicializarUICuenta() {
    const tabs       = document.querySelectorAll('.cuenta-tab');
    const forms      = document.querySelectorAll('.cuenta-form');
    const fotoInput  = document.getElementById('cuentaFoto');
    const fotoPrev   = document.getElementById('cuentaFotoPreview');
    const inputNom   = document.getElementById('cuentaNombre');
    const inputPro   = document.getElementById('cuentaPronombre');
    const inputCod   = document.getElementById('cuentaCodigo');
    const inputLogin = document.getElementById('loginCodigo');
    const btnCrear   = document.getElementById('btnCrearCuenta');
    const btnEntrar  = document.getElementById('btnEntrarCuenta');
    const btnSalir   = document.getElementById('btnCerrarCuenta');
    const sinSesion  = document.getElementById('cuentaSinSesion');
    const conSesion  = document.getElementById('cuentaConSesion');
    const avisoGH    = document.getElementById('cuentaRequiereGitHub');

    let fotoTemp = null;

    const ultimo = obtenerUltimoCodigo();
    if (ultimo && inputLogin) inputLogin.value = ultimo;

    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            t.classList.add('active');
            const form = document.querySelector(`.cuenta-form[data-form="${t.dataset.tab}"]`);
            if (form) form.classList.add('active');
        });
    });

    if (fotoInput && fotoPrev) {
        fotoInput.addEventListener('change', async () => {
            const f = fotoInput.files[0];
            if (!f) return;
            try {
                fotoTemp = await procesarFoto(f);
                fotoPrev.innerHTML = `<img src="${fotoTemp}" alt="" class="cuenta-foto-img">`;
            } catch (e) { alert('❌ ' + e.message); }
        });
    }

    [inputCod, inputLogin].forEach(inp => {
        if (!inp) return;
        inp.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
        });
    });

    if (btnCrear) {
        btnCrear.addEventListener('click', async () => {
            const msg = document.getElementById('cuentaMensaje');
            const setMsg = (txt, tipo) => {
                msg.textContent = txt;
                msg.className = 'config-status ' + (tipo || '');
            };
            if (btnCrear.disabled) return;
            btnCrear.disabled = true;
            const txtOriginal = btnCrear.innerHTML;
            btnCrear.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Creando...';
            lucide.createIcons();
            try {
                setMsg('⏳ Creando cuenta...', 'info');
                await crearCuenta({
                    foto: fotoTemp,
                    nombre: inputNom.value,
                    pronombre: inputPro.value,
                    codigo: inputCod.value
                });
                setMsg('✅ Cuenta creada', 'success');
                mostrarSesionActiva();
                setTimeout(() => {
                    if (typeof renderSidebar === 'function') renderSidebar();
                    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
                    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
                    if (typeof actualizarSaludo === 'function') actualizarSaludo();
                    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
                    if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
                }, 200);
            } catch (e) { setMsg('❌ ' + e.message, 'error'); }
            finally {
                btnCrear.disabled = false;
                btnCrear.innerHTML = txtOriginal;
                lucide.createIcons();
            }
        });
    }

    if (btnEntrar) {
        btnEntrar.addEventListener('click', async () => {
            const msg = document.getElementById('loginMensaje');
            const setMsg = (txt, tipo) => {
                msg.textContent = txt;
                msg.className = 'config-status ' + (tipo || '');
            };
            if (btnEntrar.disabled) return;
            btnEntrar.disabled = true;
            const txtOriginal = btnEntrar.innerHTML;
            btnEntrar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Entrando...';
            lucide.createIcons();
            try {
                setMsg('⏳ Entrando...', 'info');
                await iniciarSesion(inputLogin.value);
                setMsg('✅ Sesión iniciada', 'success');
                mostrarSesionActiva();
                setTimeout(() => {
                    if (typeof renderSidebar === 'function') renderSidebar();
                    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
                    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
                    if (typeof actualizarSaludo === 'function') actualizarSaludo();
                    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
                    if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
                }, 200);
            } catch (e) { setMsg('❌ ' + e.message, 'error'); }
            finally {
                btnEntrar.disabled = false;
                btnEntrar.innerHTML = txtOriginal;
                lucide.createIcons();
            }
        });
    }

    if (btnSalir) {
        btnSalir.addEventListener('click', () => {
            if (!confirm('¿Cerrar sesión? Tu cuenta se queda guardada, puedes volver con tu código.')) return;
            cerrarSesion();
            mostrarSinSesion();
            if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();
        });
    }

    function mostrarSesionActiva() {
        if (!sinSesion || !conSesion) return;
        sinSesion.style.display = 'none';
        conSesion.style.display = 'block';

        document.getElementById('perfilNombre').textContent = cuentaActual.nombre;
        document.getElementById('perfilPronombre').textContent = cuentaActual.pronombre;
        document.getElementById('perfilCodigo').textContent = cuentaActual.codigo;

        const perfilFoto = document.getElementById('perfilFoto');
        if (cuentaActual.foto) {
            perfilFoto.innerHTML = `<img src="${cuentaActual.foto}" alt="" class="cuenta-foto-img">`;
        } else {
            const inicial = (cuentaActual.nombre || '?').charAt(0).toUpperCase();
            perfilFoto.innerHTML = `<span class="avatar-inicial">${inicial}</span>`;
        }
    }

    function mostrarSinSesion() {
        if (!sinSesion || !conSesion) return;
        sinSesion.style.display = 'block';
        conSesion.style.display = 'none';
        if (inputCod) inputCod.value = '';
        if (inputNom) inputNom.value = '';
        const ultimo = obtenerUltimoCodigo();
        if (inputLogin) inputLogin.value = ultimo || '';
        fotoTemp = null;
        if (fotoPrev) fotoPrev.innerHTML = '<i data-lucide="camera"></i><span class="cuenta-foto-texto">Subir foto</span>';
        lucide.createIcons();
    }

    window.__actualizarUISesion = () => {
        if (avisoGH) avisoGH.style.display = ConfigBD.estaConectado() ? 'none' : 'flex';
        if (!ConfigBD.estaConectado()) {
            if (sinSesion) sinSesion.style.display = 'none';
            if (conSesion) conSesion.style.display = 'none';
            lucide.createIcons();
            return;
        }
        if (cuentaActual) mostrarSesionActiva();
        else mostrarSinSesion();
        lucide.createIcons();
    };

    window.__actualizarUISesion();
}

// Exponer globalmente
window.cambiarComunidad = cambiarComunidad;
