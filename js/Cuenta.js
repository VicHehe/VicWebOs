// ============================================================
//  Cuenta.js — Cuentas + apps + temas + widgets
// ============================================================

const CUENTAS_FILE = 'cuenta.json';
const CUENTA_CONFIG_FILE = 'cuentaConfig.json';
const SESION_KEY = 'vicwebos_cuenta';
const ULTIMO_CODIGO_KEY = 'vicwebos_ultimo_codigo';

let cuentaActual = null;
let configCuentaActual = null;

const CONFIG_CUENTA_DEFAULT = {
    appsInstaladas: ['stor-he'],
    temasInstalados: ['violeta'],
    temaActivo: 'violeta',
    widgetsInstalados: [],
    widgetsActivos: []
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
    return { ...CONFIG_CUENTA_DEFAULT, ...(all[codigo] || {}) };
}

async function guardarConfigCuenta(codigo, config) {
    const all = await leerTodasConfigCuentas();
    all[codigo] = config;
    return await ConfigBD.escribirArchivo(CUENTA_CONFIG_FILE, all);
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

    localStorage.setItem(SESION_KEY, codigoUp);
    localStorage.setItem(ULTIMO_CODIGO_KEY, codigoUp);

    cargarCSSTema(obtenerTemaActivo());
    actualizarAvatarHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    return cuenta;
}

function cerrarSesion() {
    cuentaActual = null;
    configCuentaActual = null;
    localStorage.removeItem(SESION_KEY);

    cargarCSSTema('violeta');
    actualizarAvatarHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
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
    if (!configCuentaActual.appsInstaladas) configCuentaActual.appsInstaladas = [];
    if (!configCuentaActual.appsInstaladas.includes(id)) {
        configCuentaActual.appsInstaladas.push(id);
        await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    }
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
    if (!configCuentaActual.temasInstalados) configCuentaActual.temasInstalados = [];
    if (!configCuentaActual.temasInstalados.includes(id)) {
        configCuentaActual.temasInstalados.push(id);
        await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    }
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

// ============================================================
//  APLICAR TEMA (público — guarda en cuentaConfig.json)
//  Se llama desde Stor-He y desde la pestaña Apariencia.
// ============================================================
async function aplicarTema(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema) throw new Error('Tema no encontrado.');

    configCuentaActual.temaActivo = id;
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    cargarCSSTema(id);
}

// ============================================================
//  CARGAR CSS DEL TEMA (interno — solo cambia el <link>)
//  NO toca cuentaConfig.json. Se usa al iniciar sesión,
//  al restaurar, al cerrar sesión y en desinstalarTema.
// ============================================================
function cargarCSSTema(id) {
    const catalogo = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
    const tema = catalogo.find(t => t.id === id);
    if (!tema || !tema.ruta) return;

    // Reemplazar el <link> del tema
    const viejo = document.getElementById('tema-activo');
    if (viejo) viejo.remove();

    const nuevo = document.createElement('link');
    nuevo.id = 'tema-activo';
    nuevo.rel = 'stylesheet';
    nuevo.href = tema.ruta;
    document.head.appendChild(nuevo);

    // Avisar a los widgets (Regla 6) — esperar un momento para que
    // el CSS se aplique primero
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
    if (!configCuentaActual.widgetsInstalados) configCuentaActual.widgetsInstalados = [];
    if (!configCuentaActual.widgetsInstalados.includes(id)) {
        configCuentaActual.widgetsInstalados.push(id);
        await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    }
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
    if (!configCuentaActual.widgetsActivos.includes(id)) {
        configCuentaActual.widgetsActivos.push(id);
        await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
        if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
    }
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
                    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
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
                    if (typeof renderWidgetsActivos === 'function') renderWidgetsActivos();
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
