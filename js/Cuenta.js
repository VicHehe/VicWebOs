// ============================================================
//  Cuenta.js — Sistema de cuentas de VicWebOs
//  - cuenta.json: array de cuentas
//  - cuentaConfig.json: { [codigo]: { appsInstaladas, ... } }
//  - Código: 4 dígitos + 1 letra (ej: 1234A), único
// ============================================================

const CUENTAS_FILE = 'cuenta.json';
const CUENTA_CONFIG_FILE = 'cuentaConfig.json';
const SESION_KEY = 'vicwebos_cuenta';

let cuentaActual = null;
let configCuentaActual = null;

// ============================================================
//  CUENTAS: leer / escribir
// ============================================================
async function cargarCuentas() {
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
    const data = await ConfigBD.leerArchivo(CUENTA_CONFIG_FILE);
    return (data && typeof data === 'object') ? data : {};
}

async function obtenerConfigCuenta(codigo) {
    const all = await leerTodasConfigCuentas();
    return all[codigo] || { appsInstaladas: ['stor-he'], theme: 'light' };
}

async function guardarConfigCuenta(codigo, config) {
    const all = await leerTodasConfigCuentas();
    all[codigo] = config;
    return await ConfigBD.escribirArchivo(CUENTA_CONFIG_FILE, all);
}

// ============================================================
//  VALIDACIÓN DE CÓDIGO
// ============================================================
function validarFormatoCodigo(codigo) {
    return /^[0-9]{4}[A-Z]$/.test(codigo);
}

// ============================================================
//  FOTO (procesamiento)
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

    // Crear config por defecto
    await guardarConfigCuenta(codigoUp, { appsInstaladas: ['stor-he'], theme: 'light' });

    // Iniciar sesión
    await iniciarSesion(codigoUp);
    return nueva;
}

async function iniciarSesion(codigo) {
    const codigoUp = codigo.toUpperCase();
    if (!validarFormatoCodigo(codigoUp)) {
        throw new Error('Formato de código inválido. Debe ser 4 dígitos + 1 letra.');
    }

    const cuentas = await cargarCuentas();
    const cuenta = cuentas.find(c => c.codigo === codigoUp);
    if (!cuenta) {
        throw new Error('Código incorrecto o cuenta no encontrada.');
    }

    cuentaActual = cuenta;
    configCuentaActual = await obtenerConfigCuenta(codigoUp);
    localStorage.setItem(SESION_KEY, codigoUp);

    actualizarAvatarHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
    return cuenta;
}

function cerrarSesion() {
    cuentaActual = null;
    configCuentaActual = null;
    localStorage.removeItem(SESION_KEY);

    actualizarAvatarHeader();
    if (typeof renderSidebar === 'function') renderSidebar();
}

async function restaurarSesion() {
    const codigo = localStorage.getItem(SESION_KEY);
    if (!codigo) return null;
    try {
        const cuentas = await cargarCuentas();
        const cuenta = cuentas.find(c => c.codigo === codigo);
        if (!cuenta) {
            localStorage.removeItem(SESION_KEY);
            return null;
        }
        cuentaActual = cuenta;
        configCuentaActual = await obtenerConfigCuenta(codigo);
        actualizarAvatarHeader();
        return cuenta;
    } catch (e) {
        console.warn('No se pudo restaurar sesión:', e);
        return null;
    }
}

// ============================================================
//  GESTIÓN DE APPS (por cuenta)
// ============================================================
function obtenerAppsInstaladas() {
    return configCuentaActual?.appsInstaladas || [];
}

function estaInstalada(id) {
    return obtenerAppsInstaladas().includes(id);
}

async function instalarApp(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta para instalar apps.');
    if (!configCuentaActual) configCuentaActual = { appsInstaladas: [], theme: 'light' };
    if (!configCuentaActual.appsInstaladas) configCuentaActual.appsInstaladas = [];
    if (!configCuentaActual.appsInstaladas.includes(id)) {
        configCuentaActual.appsInstaladas.push(id);
        await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
    }
}

async function desinstalarApp(id) {
    if (!cuentaActual) throw new Error('Necesitas una cuenta.');
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const app = catalogo.find(a => a.id === id);
    if (app && app.esBase) throw new Error('Esta app es del sistema y no se puede desinstalar.');

    configCuentaActual.appsInstaladas = (configCuentaActual.appsInstaladas || []).filter(a => a !== id);
    await guardarConfigCuenta(cuentaActual.codigo, configCuentaActual);
}

// ============================================================
//  AVATAR EN EL HEADER
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
//  UI DE LA SECCIÓN "CUENTA"
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

    let fotoTemp = null;

    // Tabs
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            tabs.forEach(x => x.classList.remove('active'));
            forms.forEach(f => f.classList.remove('active'));
            t.classList.add('active');
            const form = document.querySelector(`.cuenta-form[data-form="${t.dataset.tab}"]`);
            if (form) form.classList.add('active');
        });
    });

    // Foto
    if (fotoInput && fotoPrev) {
        fotoInput.addEventListener('change', async () => {
            const f = fotoInput.files[0];
            if (!f) return;
            try {
                fotoTemp = await procesarFoto(f);
                fotoPrev.innerHTML = `<img src="${fotoTemp}" alt="" class="cuenta-foto-img">`;
            } catch (e) {
                alert('❌ ' + e.message);
            }
        });
    }

    // Código: auto-uppercase
    [inputCod, inputLogin].forEach(inp => {
        if (!inp) return;
        inp.addEventListener('input', (e) => {
            let v = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
            e.target.value = v;
        });
    });

    // Crear cuenta
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
                // Actualizar UI tras un momento
                setTimeout(() => {
                    if (typeof renderSidebar === 'function') renderSidebar();
                }, 200);
            } catch (e) {
                setMsg('❌ ' + e.message, 'error');
            }
        });
    }

    // Entrar
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
                }, 200);
            } catch (e) {
                setMsg('❌ ' + e.message, 'error');
            }
        });
    }

    // Cerrar sesión
    if (btnSalir) {
        btnSalir.addEventListener('click', () => {
            if (!confirm('¿Cerrar sesión? Tu cuenta se queda guardada, puedes volver con tu código.')) return;
            cerrarSesion();
            mostrarSinSesion();
            setTimeout(() => {
                if (typeof renderSidebar === 'function') renderSidebar();
            }, 100);
        });
    }

    // ---- Mostrar/ocultar secciones según sesión ----
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
        if (inputLogin) inputLogin.value = '';
        if (inputNom) inputNom.value = '';
        fotoTemp = null;
        if (fotoPrev) fotoPrev.innerHTML = '<i data-lucide="camera"></i><span class="cuenta-foto-texto">Subir foto</span>';
        lucide.createIcons();
    }

    // Exponer globalmente para que configuracion.js las llame
    window.__actualizarUISesion = () => {
        if (cuentaActual) mostrarSesionActiva();
        else mostrarSinSesion();
    };
}
