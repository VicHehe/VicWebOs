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
// ============================================================
const ESPACIO_INICIAL         = 50;
const ESPACIO_POR_COMPRA      = 12;
const COSTO_COMPRA_ESPACIO    = 2500;
const MONEDAS_INICIALES       = 0;
const MAX_WIDGETS_ACTIVOS     = 3;
const MAX_MOVIMIENTOS_CHEQUERA = 500;
const MAX_ACCESOS_RAPIDOS     = 8;

let cuentaActual = null;
let configCuentaActual = null;

// ------------------------------------------------------------
//  Lock en memoria
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
//  Getters de window
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
    // Si no hay comunidad activa, disparamos igual para que la UI se actualice
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
        window.__cerrarTodas
