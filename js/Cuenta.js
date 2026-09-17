// ============================================================
//  Cuenta.js — Cuentas + apps + temas + widgets + espacio/monedas
//  Incluye funciones globales de chequera (canjear / gastoBoleta)
// ============================================================

const CUENTAS_FILE = 'cuenta.json';
const CUENTA_CONFIG_FILE = 'cuentaConfig.json';
const CHEQUERA_FILE_BASE = 'app/chequera/';
const SESION_KEY = 'vicwebos_cuenta';
const ULTIMO_CODIGO_KEY = 'vicwebos_ultimo_codigo';

// ============================================================
//  CONSTANTES DE ESPACIO Y MONEDAS
// ============================================================
const ESPACIO_INICIAL         = 50;
const ESPACIO_POR_COMPRA      = 12;
const COSTO_COMPRA_ESPACIO    = 2500;
const MONEDAS_INICIALES       = 0;
const MAX_WIDGETS_ACTIVOS     = 3;
const MAX_MOVIMIENTOS_CHEQUERA = 500;

let cuentaActual = null;
let configCuentaActual = null;

const CONFIG_CUENTA_DEFAULT = {
    appsInstaladas: ['stor-he', 'chequera'],
    temasInstalados: ['violeta'],
    temaActivo: 'violeta',
    widgetsInstalados: [],
    widgetsActivos: [],
    espacioMaximo: ESPACIO_INICIAL,
    monedas: MONEDAS_INICIALES
};

// ---------- CUENTAS ----------
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

// ---------- CONFIG POR CUENTA ----------
async function leerTodasConfigCuentas() {
    if (!ConfigBD.estaConectado()) return {};
    const data = await ConfigBD.leerArchivo(CUENTA_CONFIG_FILE);
    return (data && typeof data === 'object') ? data : {};
}

async function obtenerConfigCuenta(codigo) {
    const all = await leerTodasConfigCuentas();
    const cfg = { ...CONFIG_CUENTA_DEFAULT, ...(all[codigo] || {}) };
    if (typeof cfg.espacioMaximo !== 'number') cfg.espacioMaximo = ESPACIO_INICIAL;
    if (typeof cfg.monedas !== 'number') cfg.monedas = MONEDAS_INICIALES;
    return cfg;
}

async function guardarConfigCuenta(codigo, config) {
    const all = await leerTodasConfigCuentas();
    all[codigo] = config;
    return await ConfigBD.escribirArchivo(CUENTA_CONFIG_FILE, all);
}

// ============================================================
//  MIGRACIÓN: garantiza que las apps por defecto estén presentes
// ============================================================
async function migrarAppsPorDefecto(codigo) {
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const requeridas = catalogo
        .filter(a => a.esBase || a.esDefault)
        .map(a => a.id);

    let huboCambios = false;

    if (!configCuentaActual.appsInstaladas) configCuentaActual.appsInstaladas = [];
    requeridas.forEach(id => {
        if (!configCuentaActual.appsInstaladas.includes(id)) {
            configCuentaActual.appsInstaladas.push(id);
            huboCambios = true;
        }
    });

    if (huboCambios) {
        await guardarConfigCuenta(codigo, configCuentaActual);
    }
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

async function comprarEspacio() {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (obtenerMonedas() < COSTO_COMPRA_ESPACIO) {
        throw new Error(`Te faltan ${COSTO_COMPRA_ESPACIO - obtenerMonedas()} monedas.`);
    }
    configCuentaActual.monedas -= COSTO_COMPRA_ESPACIO;
    configCuentaActual.espacioMaximo += ESPACIO_POR_COMPRA;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    return { ok: true, espacioMaximo: configCuentaActual.espacioMaximo, monedas: configCuentaActual.monedas };
}

// ============================================================
//  CHEQUERA — historial de movimientos (por usuario)
// ============================================================
function rutaChequera(codigo) {
    return CHEQUERA_FILE_BASE + codigo + 'chequera.json';
}

async function leerChequeraUsuario() {
    if (!cuentaActual) return { version: 1, movimientos: [] };
    try {
        const data = await ConfigBD.leerArchivo(rutaChequera(cuentaActual.codigo));
        if (data && Array.isArray(data.movimientos)) return data;
    } catch (e) { /* no existe */ }
    return { version: 1, movimientos: [] };
}

async function guardarChequeraUsuario(data) {
    if (!cuentaActual) return;
    await ConfigBD.escribirArchivo(rutaChequera(cuentaActual.codigo), data);
}

function generarIdMovimiento() {
    return 'mov_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ============================================================
//  CANJEAR: gana monedas (llamable desde cualquier app)
//  Firma: canjear(icono, fuente, texto, cantidad)
// ============================================================
async function canjear(icono, fuente, texto, cantidad) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser positiva.');

    // 1) Sumar monedas al usuario
    configCuentaActual.monedas = (configCuentaActual.monedas || 0) + cantidad;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);

    // 2) Añadir entrada al historial de la chequera
    const cheq = await leerChequeraUsuario();
    cheq.movimientos.unshift({
        id: generarIdMovimiento(),
        tipo: 'canje',
        icono: icono || '💰',
        fuente: fuente || 'app',
        texto: texto || 'Recompensa',
        cantidad: cantidad,
        fecha: new Date().toISOString()
    });
    if (cheq.movimientos.length > MAX_MOVIMIENTOS_CHEQUERA) {
        cheq.movimientos = cheq.movimientos.slice(0, MAX_MOVIMIENTOS_CHEQUERA);
    }
    cheq.actualizado = new Date().toISOString();
    await guardarChequeraUsuario(cheq);

    // 3) Refrescar UI global
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof window.__notificarCambioChequera === 'function') window.__notificarCambioChequera();

    return { ok: true, monedas: configCuentaActual.monedas };
}

// ============================================================
//  GASTO BOLETA: pierde monedas (llamable desde cualquier app)
//  Firma: gastoBoleta(icono, fuente, texto, cantidad)
// ============================================================
async function gastoBoleta(icono, fuente, texto, cantidad) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (!cantidad || cantidad <= 0) throw new Error('La cantidad debe ser positiva.');
    if ((configCuentaActual.monedas || 0) < cantidad) {
        throw new Error(`No tienes suficientes monedas (tienes ${configCuentaActual.monedas || 0}, necesitas ${cantidad}).`);
    }

    // 1) Restar monedas al usuario
    configCuentaActual.monedas = (configCuentaActual.monedas || 0) - cantidad;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);

    // 2) Añadir entrada al historial de la chequera
    const cheq = await leerChequeraUsuario();
    cheq.movimientos.unshift({
        id: generarIdMovimiento(),
        tipo: 'gasto',
        icono: icono || '🧾',
        fuente: fuente || 'app',
        texto: texto || 'Gasto',
        cantidad: -cantidad,
        fecha: new Date().toISOString()
    });
    if (cheq.movimientos.length > MAX_MOVIMIENTOS_CHEQUERA) {
        cheq.movimientos = cheq.movimientos.slice(0, MAX_MOVIMIENTOS_CHEQUERA);
    }
    cheq.actualizado = new Date().toISOString();
    await guardarChequeraUsuario(cheq);

    // 3) Refrescar UI global
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof window.__notificarCambioChequera === 'function') window.__notificarCambioChequera();

    return { ok: true, monedas: configCuentaActual.monedas };
}

// ---------- VALIDACIÓN ----------
function validarFormatoCodigo(codigo) {
    return /^[0-9]{4}[A-Z]$/.test(codigo);
}

// ---------- FOTO ----------
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

// ---------- CREAR / LOGIN / LOGOUT ----------
async function crearCuenta({ foto, nombre, pronombre, codigo }) {
    if (!ConfigBD.estaConectado()) {
        throw new Error('Conecta GitHub primero desde "Base de datos".');
    }
    const codigoUp = codigo.toUpperCase();
    if (!validarFormatoCodigo(codigoUp)) {
        throw new Error('El código debe ser 4 dígitos seguidos de 1 letra (ej: 1234A).');
    }
    if (!nombre || !nombre.trim()) {
        throw new Error('El nombre es obligatorio.');
    }
    const cuentas = await cargarCuentas();
    if (cuentas.some(c => c.codigo === codigoUp)) {
        throw new Error('Ese código ya está en uso. Elige otro.');
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
    await guardarConfigCuenta(codigoUp, { ...CONFIG_CUENTA_DEFAULT });

    await iniciarSesion(codigoUp);
    return nueva;
}

async function iniciarSesion(codigo) {
    if (!ConfigBD.estaConectado()) {
        throw new Error('Conecta GitHub primero desde "Base de datos".');
    }
    const codigoUp = codigo.toUpperCase();
    if (!validarFormatoCodigo(codigoUp)) {
        throw new Error('Formato de código inválido. Debe ser 4 dígitos + 1 letra.');
    }
    const cuentas = await cargarCuentas();
    const cuenta = cuentas.find(c => c.codigo === codigoUp);
    if (!cuenta) throw new Error('Código incorrecto o cuenta no encontrada.');

    cuentaActual = cuenta;
    configCuentaActual = await obtenerConfigCuenta(codigoUp);

    await migrarAppsPorDefecto(codigoUp);

    localStorage.setItem(SESION_KEY, codigoUp);
    localStorage.setItem(ULTIMO_CODIGO_KEY, codigoUp);

    cargarCSSTema(obtenerTemaActivo());
    actualizarAvatarHeader();
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    if (typeof actualizarSaludo === 'function') actualizarSaludo();
    return cuenta;
}

function cerrarSesion() {
    cuentaActual = null;
    configCuentaActual = null;
    localStorage.removeItem(SESION_KEY);

    cargarCSSTema('violeta');
    actualizarAvatarHeader();
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    if (typeof actualizarSaludo === 'function') actualizarSaludo();
}

async function restaurarSesion() {
    if (!ConfigBD.estaConectado()) return null;
    const codigo = localStorage.getItem(SESION_KEY);
    if (!codigo) return null;
    try {
        const cuentas = await cargarCuentas();
        const cuenta = cuentas.find(c => c.codigo === codigo);
        if (!cuenta) { localStorage.removeItem(SESION_KEY); return null; }
        cuentaActual = cuenta;
        configCuentaActual = await obtenerConfigCuenta(codigo);

        await migrarAppsPorDefecto(codigo);

        cargarCSSTema(obtenerTemaActivo());
        actualizarAvatarHeader();
        return cuenta;
    } catch (e) {
        console.warn('No se pudo restaurar sesión:', e);
        return null;
    }
}

// ---------- APPS ----------
function obtenerAppsInstaladas() { return configCuentaActual?.appsInstaladas || []; }
function estaInstalada(id) { return obtenerAppsInstaladas().includes(id); }

async function instalarApp(id) {
    if (!ConfigBD.estaConectado()) throw new Error('Conecta GitHub primero.');
    if (!cuentaActual) throw new Error('Necesitas una cuenta para instalar apps.');

    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const app = catalogo.find(a => a.id === id);
    if (!app) throw new Error('App no encontrada.');
    if (estaInstalada(id)) return;

    const check = puedeInstalar({ espacio: app.espacio || 0, monedas: app.monedas || 0 });
    if (!check.ok) throw new Error(check.motivo);

    if (!configCuentaActual.appsInstaladas) configCuentaActual.appsInstaladas = [];
    configCuentaActual.appsInstaladas.push(id);
    if ((app.monedas || 0) > 0) configCuentaActual.monedas -= app.monedas;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
}

async function desinstalarApp(id) {
    if (!ConfigBD.estaConectado()) throw new Error('Conecta GitHub primero.');
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const app = catalogo.find(a => a.id === id);
    if (app && app.esBase) throw new Error('Esta app es del sistema y no se puede desinstalar.');
    configCuentaActual.appsInstaladas = (configCuentaActual.appsInstaladas || []).filter(a => a !== id);
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
}

// ---------- TEMAS ----------
function obtenerTemasInstalados() { return configCuentaActual?.temasInstalados || []; }
function obtenerTemaActivo() { return configCuentaActual?.temaActivo || 'violeta'; }

async function instalarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');

    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema) throw new Error('Tema no encontrado.');
    if ((configCuentaActual.temasInstalados || []).includes(id)) return;

    const check = puedeInstalar({ espacio: tema.espacio || 0, monedas: tema.monedas || 0 });
    if (!check.ok) throw new Error(check.motivo);

    if (!configCuentaActual.temasInstalados) configCuentaActual.temasInstalados = [];
    configCuentaActual.temasInstalados.push(id);
    if ((tema.monedas || 0) > 0) configCuentaActual.monedas -= tema.monedas;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
}

async function desinstalarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (tema && tema.esBase) throw new Error('Este tema es base y no se puede desinstalar.');
    configCuentaActual.temasInstalados = (configCuentaActual.temasInstalados || []).filter(t => t !== id);
    if (configCuentaActual.temaActivo === id) {
        configCuentaActual.temaActivo = 'violeta';
        cargarCSSTema('violeta');
    }
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
}

async function aplicarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema) throw new Error('Tema no encontrado.');

    configCuentaActual.temaActivo = id;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
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
    document.head.appendChild(nuevo);

    setTimeout(() => {
        if (typeof window.__notificarCambioTema === 'function') {
            window.__notificarCambioTema();
        }
    }, 150);
}

// ---------- WIDGETS ----------
function obtenerWidgetsInstalados() { return configCuentaActual?.widgetsInstalados || []; }
function obtenerWidgetsActivos() { return configCuentaActual?.widgetsActivos || []; }

async function instalarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');

    const catalogo = typeof WIDGETS_DISPONIBLES !== 'undefined' ? WIDGETS_DISPONIBLES : [];
    const w = catalogo.find(x => x.id === id);
    if (!w) throw new Error('Widget no encontrado.');
    if ((configCuentaActual.widgetsInstalados || []).includes(id)) return;

    const check = puedeInstalar({ espacio: w.espacio || 0, monedas: w.monedas || 0 });
    if (!check.ok) throw new Error(check.motivo);

    if (!configCuentaActual.widgetsInstalados) configCuentaActual.widgetsInstalados = [];
    configCuentaActual.widgetsInstalados.push(id);
    if ((w.monedas || 0) > 0) configCuentaActual.monedas -= w.monedas;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
}

async function desinstalarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    configCuentaActual.widgetsInstalados = (configCuentaActual.widgetsInstalados || []).filter(w => w !== id);
    configCuentaActual.widgetsActivos = (configCuentaActual.widgetsActivos || []).filter(w => w !== id);
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
}

async function activarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    if (!configCuentaActual.widgetsActivos) configCuentaActual.widgetsActivos = [];
    if (configCuentaActual.widgetsActivos.includes(id)) return;

    if (configCuentaActual.widgetsActivos.length >= MAX_WIDGETS_ACTIVOS) {
        throw new Error(`Máximo ${MAX_WIDGETS_ACTIVOS} widgets activos. Desactiva uno para activar otro.`);
    }

    configCuentaActual.widgetsActivos.push(id);
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
}

async function desactivarWidget(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    configCuentaActual.widgetsActivos = (configCuentaActual.widgetsActivos || []).filter(w => w !== id);
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
}

// ---------- AVATAR HEADER ----------
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

// ---------- UI CUENTA ----------
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

    const ultimo = localStorage.getItem(ULTIMO_CODIGO_KEY);
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
                }, 200);
            } catch (e) { setMsg('❌ ' + e.message, 'error'); }
        });
    }

    if (btnEntrar) {
        btnEntrar.addEventListener('click', async () => {
            const msg = document.getElementById('loginMensaje');
            const setMsg = (txt, tipo) => {
                msg.textContent = txt;
                msg.className = 'config-status ' + (tipo || '');
            };
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
                }, 200);
            } catch (e) { setMsg('❌ ' + e.message, 'error'); }
        });
    }

    if (btnSalir) {
        btnSalir.addEventListener('click', () => {
            if (!confirm('¿Cerrar sesión? Tu cuenta se queda guardada, puedes volver con tu código.')) return;
            cerrarSesion();
            mostrarSinSesion();
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
        const ultimo = localStorage.getItem(ULTIMO_CODIGO_KEY);
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
