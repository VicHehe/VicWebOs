// ============================================================
//  chequeo.js — Lógica de logros (vive en el shell)
//  ------------------------------------------------------------
//  Guarda el estado por usuario en app/logros/logros.json.
//
//  ESTRATEGIA DE DETECCIÓN:
//  El chequeo corre en 3 momentos:
//    1. Al iniciar sesión (evento 'vicwebos:sesion').
//    2. Después de cada canjear() (hook en Cuenta.js).
//    3. Cada POLL_MS con el mismo patrón de WhatTheHay:
//       - Lee cuentaConfig.json, CuentasNotificaciones.json y
//         Galeria{codigo}/galeria.json con If-None-Match.
//       - GitHub devuelve 304 si no cambiaron → gratis (no
//         cuenta contra el rate limit de 5000 req/h).
//       - Si alguno cambió → chequear() (el usuario instaló,
//         subió fotos, recibió notis, activó widgets, etc.).
//       - Los flags por hora (Noctámbulo, Madrugador, Búho) se
//         re-chequean cuando la hora del sistema cambia.
//
//  Así los logros se desbloquean en ~15s tras la acción, sin
//  gastar cuota real de GitHub.
//
//  Caché en memoria del estado por usuario: 1 lectura por sesión.
// ============================================================

(function () {
    'use strict';

    const ARCHIVO        = 'app/logros/logros.json';
    const ARCHIVO_CONFIG = 'cuentaConfig.json';
    const ARCHIVO_NOTIS  = 'CuentasNotificaciones.json';

    // Cada cuánto chequear por cambios en los archivos del usuario.
    // 15s = 240 ticks/hora × 3 archivos = 720 req/h. Los 304 NO
    // cuentan contra el rate limit, así que en la práctica son ~0.
    const POLL_MS = 15000;

    let _cacheEstado = null;
    let _codigoCache = null;
    let _hookBuscadorListo = false;
    let _pollTimer = null;
    let _pollEnCurso = false;
    let _ultimaHoraChequeada = -1;

    // ETags por ruta (para los 304 gratis)
    const _etagsArchivos = new Map();

    // ------------------------------------------------------------
    //  Helpers de estado
    // ------------------------------------------------------------
    function normalizar(data) {
        if (!data || typeof data !== 'object') {
            return { version: 1, actualizado: new Date().toISOString(), usuarios: {} };
        }
        if (!data.usuarios || typeof data.usuarios !== 'object') data.usuarios = {};
        return data;
    }

    function estadoVacio() {
        return {
            monedasMaximas:      0,
            appsMaximas:         0,
            widgetsMaximas:      0,
            temasMaximas:        0,
            fotosMaximas:        0,
            diasMaximos:         0,
            diasUnicos:          [],
            widgetsActivosMax:   0,
            accesosMax:          0,
            notificacionesMax:   0,
            flags:               {},
            logros:              {}
        };
    }

    function cuentaActiva() {
        return window.cuentaActual || null;
    }

    function resetCache() {
        _cacheEstado = null;
        _codigoCache = null;
    }

    function normalizarEstadoUsuario(u) {
        if (!u || typeof u !== 'object') return estadoVacio();
        return {
            monedasMaximas:    Number(u.monedasMaximas)    || 0,
            appsMaximas:       Number(u.appsMaximas)       || 0,
            widgetsMaximas:    Number(u.widgetsMaximas)    || 0,
            temasMaximas:      Number(u.temasMaximas)      || 0,
            fotosMaximas:      Number(u.fotosMaximas)      || 0,
            diasMaximos:       Number(u.diasMaximos)       || 0,
            diasUnicos:        Array.isArray(u.diasUnicos) ? u.diasUnicos : [],
            widgetsActivosMax: Number(u.widgetsActivosMax) || 0,
            accesosMax:        Number(u.accesosMax)        || 0,
            notificacionesMax: Number(u.notificacionesMax) || 0,
            flags:             (u.flags && typeof u.flags === 'object') ? { ...u.flags } : {},
            logros:            (u.logros && typeof u.logros === 'object') ? { ...u.logros } : {}
        };
    }

    // ------------------------------------------------------------
    //  Recolectores de valores actuales
    // ------------------------------------------------------------
    function contarAppsNoBase() {
        const catalogo = window.RUTAS_HERRAMIENTAS || [];
        const instaladas = (window.configCuentaActual?.appsInstaladas) || [];
        let count = 0;
        for (const id of instaladas) {
            const app = catalogo.find(a => a.id === id);
            if (app && !app.esBase && !app.esDefault) count++;
        }
        return count;
    }

    function contarTemasNoBase() {
        const catalogo = window.TEMAS_DISPONIBLES || [];
        const instalados = (window.configCuentaActual?.temasInstalados) || [];
        let count = 0;
        for (const id of instalados) {
            const t = catalogo.find(x => x.id === id);
            if (t && !t.esBase) count++;
        }
        return count;
    }

    function contarWidgets() {
        return (window.configCuentaActual?.widgetsInstalados || []).length;
    }

    function contarWidgetsActivos() {
        return (window.configCuentaActual?.widgetsActivos || []).length;
    }

    function contarAccesos() {
        return (window.configCuentaActual?.accesosRapidos || []).length;
    }

    function obtenerMonedasActuales() {
        return (typeof obtenerMonedas === 'function') ? (obtenerMonedas() || 0) : 0;
    }

    async function contarFotos(codigo) {
        try {
            if (!window.ConfigBD || !ConfigBD.estaConectado()) return 0;
            const data = await ConfigBD.leerArchivo(`Galeria${codigo}/galeria.json`);
            if (!data || !Array.isArray(data.imagenes)) return 0;
            return data.imagenes.length;
        } catch (e) {
            return 0;
        }
    }

    async function contarNotificaciones(codigo) {
        try {
            if (!window.ConfigBD || !ConfigBD.estaConectado()) return 0;
            const data = await ConfigBD.leerArchivo(ARCHIVO_NOTIS);
            if (!data || !data.usuarios || !Array.isArray(data.usuarios[codigo])) return 0;
            return data.usuarios[codigo].length;
        } catch (e) {
            return 0;
        }
    }

    function fechaLocalHoy() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function flagsPorHoraActual() {
        const h = new Date().getHours();
        const flags = {};
        if (h >= 0 && h < 5)    flags.hora_noctambulo = true;
        if (h >= 5 && h < 8)    flags.hora_madrugador = true;
        if (h >= 22 && h <= 23) flags.hora_buho       = true;
        return flags;
    }

    // ------------------------------------------------------------
    //  Estado (con caché en memoria)
    // ------------------------------------------------------------
    async function obtenerEstado() {
        const cuenta = cuentaActiva();
        if (!cuenta) return estadoVacio();
        const codigo = cuenta.codigo;

        if (_cacheEstado && _codigoCache === codigo) return _cacheEstado;

        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            _cacheEstado = estadoVacio();
            _codigoCache = codigo;
            return _cacheEstado;
        }

        try {
            const data = normalizar(await ConfigBD.leerArchivo(ARCHIVO));
            _cacheEstado = normalizarEstadoUsuario(data.usuarios[codigo]);
        } catch (e) {
            _cacheEstado = estadoVacio();
        }
        _codigoCache = codigo;
        return _cacheEstado;
    }

    // ------------------------------------------------------------
    //  Valor de un tipo de logro
    // ------------------------------------------------------------
    function valorDeTipo(tipo, estado) {
        switch (tipo) {
            case 'monedas':        return estado.monedasMaximas      || 0;
            case 'apps':           return estado.appsMaximas         || 0;
            case 'widgets':        return estado.widgetsMaximas      || 0;
            case 'temas':          return estado.temasMaximas        || 0;
            case 'fotos':          return estado.fotosMaximas        || 0;
            case 'dias':           return estado.diasMaximos         || 0;
            case 'widgetsActivos': return estado.widgetsActivosMax   || 0;
            case 'accesos':        return estado.accesosMax          || 0;
            case 'notificaciones': return estado.notificacionesMax   || 0;
            default:               return 0;
        }
    }

    // ------------------------------------------------------------
    //  Chequeo principal
    // ------------------------------------------------------------
    async function chequear() {
        const cuenta = cuentaActiva();
        if (!cuenta) return [];
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return [];

        const codigo = cuenta.codigo;

        const [fotos, notificaciones] = await Promise.all([
            contarFotos(codigo),
            contarNotificaciones(codigo)
        ]);

        const valores = {
            monedas:        obtenerMonedasActuales(),
            apps:           contarAppsNoBase(),
            widgets:        contarWidgets(),
            temas:          contarTemasNoBase(),
            fotos,
            notificaciones,
            widgetsActivos: contarWidgetsActivos(),
            accesos:        contarAccesos()
        };
        const hoy = fechaLocalHoy();
        const flagsHora = flagsPorHoraActual();

        const recien = [];
        let estadoFinal = null;

        await ConfigBD.actualizarArchivo(ARCHIVO, (actual) => {
            actual = normalizar(actual);
            if (!actual.usuarios[codigo]) actual.usuarios[codigo] = estadoVacio();

            const yo = actual.usuarios[codigo];

            yo.monedasMaximas    = Math.max(Number(yo.monedasMaximas)    || 0, valores.monedas);
            yo.appsMaximas       = Math.max(Number(yo.appsMaximas)       || 0, valores.apps);
            yo.widgetsMaximas    = Math.max(Number(yo.widgetsMaximas)    || 0, valores.widgets);
            yo.temasMaximas      = Math.max(Number(yo.temasMaximas)      || 0, valores.temas);
            yo.fotosMaximas      = Math.max(Number(yo.fotosMaximas)      || 0, valores.fotos);
            yo.widgetsActivosMax = Math.max(Number(yo.widgetsActivosMax) || 0, valores.widgetsActivos);
            yo.accesosMax        = Math.max(Number(yo.accesosMax)        || 0, valores.accesos);
            yo.notificacionesMax = Math.max(Number(yo.notificacionesMax) || 0, valores.notificaciones);

            if (!Array.isArray(yo.diasUnicos)) yo.diasUnicos = [];
            if (!yo.diasUnicos.includes(hoy)) {
                yo.diasUnicos.push(hoy);
                if (yo.diasUnicos.length > 730) yo.diasUnicos = yo.diasUnicos.slice(-730);
            }
            yo.diasMaximos = yo.diasUnicos.length;

            if (!yo.flags || typeof yo.flags !== 'object') yo.flags = {};
            for (const k of Object.keys(flagsHora)) {
                if (flagsHora[k]) yo.flags[k] = true;
            }

            if (!yo.logros || typeof yo.logros !== 'object') yo.logros = {};

            const cat = window.LOGROS_REGISTRO || [];
            for (const logro of cat) {
                if (yo.logros[logro.id]) continue;

                let desbloqueado = false;
                if (logro.tipo === 'flag') {
                    desbloqueado = yo.flags[logro.id] === true;
                } else {
                    const valor = valorDeTipo(logro.tipo, yo);
                    desbloqueado = valor >= (logro.meta || 0);
                }

                if (desbloqueado) {
                    yo.logros[logro.id] = new Date().toISOString();
                    recien.push(logro);
                }
            }

            actual.actualizado = new Date().toISOString();
            estadoFinal = normalizarEstadoUsuario(yo);
            return actual;
        });

        _cacheEstado = estadoFinal || estadoVacio();
        _codigoCache = codigo;

        for (const logro of recien) {
            try {
                if (window.Notificaciones && Notificaciones.enviar) {
                    await Notificaciones.enviar(
                        'logro',
                        `¡Desbloqueaste "${logro.nombre}"!`,
                        codigo
                    );
                }
            } catch (e) { /* silencioso */ }
        }

        if (typeof window.__actualizarBannerLogros === 'function') {
            try { window.__actualizarBannerLogros(); } catch (e) { /* silencioso */ }
        }

        return recien;
    }

    // ------------------------------------------------------------
    //  Progreso (para el banner y el panel)
    // ------------------------------------------------------------
    async function obtenerProgreso() {
        const cat = window.LOGROS_REGISTRO || [];
        const estado = await obtenerEstado();

        const valoresVivos = {
            ...estado,
            monedasMaximas:    Math.max(estado.monedasMaximas,    obtenerMonedasActuales()),
            appsMaximas:       Math.max(estado.appsMaximas,       contarAppsNoBase()),
            widgetsMaximas:    Math.max(estado.widgetsMaximas,    contarWidgets()),
            temasMaximas:      Math.max(estado.temasMaximas,      contarTemasNoBase()),
            widgetsActivosMax: Math.max(estado.widgetsActivosMax, contarWidgetsActivos()),
            accesosMax:        Math.max(estado.accesosMax,        contarAccesos())
        };

        const desbloqueados = cat.filter(l => {
            if (estado.logros[l.id]) return true;
            if (l.tipo === 'flag') return estado.flags[l.id] === true;
            return valorDeTipo(l.tipo, valoresVivos) >= (l.meta || 0);
        }).length;

        return {
            desbloqueados,
            total: cat.length,
            estado: valoresVivos,
            catalogo: cat
        };
    }

    // ============================================================
    //  POLLING CON ETAG (patrón WhatTheHay)
    //  ------------------------------------------------------------
    //  Lee cada archivo con If-None-Match. Si nada cambió → 304
    //  (gratis, no cuenta contra el rate limit). Si algo cambió →
    //  200 y disparamos chequear().
    // ============================================================
    async function leerConETag(ruta) {
        const bd = window.ConfigBD;
        if (!bd || !bd.estaConectado()) return { cambio: false };

        const com = bd.obtenerComunidadActiva?.();
        if (!com || !com.githubToken || !com.githubOwner || !com.githubRepo) {
            return { cambio: false };
        }

        const url = `https://api.github.com/repos/${com.githubOwner}/${com.githubRepo}/contents/${ruta}`;
        const headers = {
            'Authorization': `Bearer ${com.githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };

        const etagGuardado = _etagsArchivos.get(ruta);
        if (etagGuardado) headers['If-None-Match'] = etagGuardado;

        try {
            const res = await fetch(url, { headers });

            if (res.status === 304) return { cambio: false };

            if (res.status === 404) {
                _etagsArchivos.delete(ruta);
                return { cambio: true, data: null };
            }

            if (!res.ok) return { cambio: false };

            const nuevoETag = res.headers.get('ETag');
            if (nuevoETag) _etagsArchivos.set(ruta, nuevoETag);

            return { cambio: true };
        } catch (e) {
            return { cambio: false };
        }
    }

    function iniciarPolling() {
        detenerPolling();
        // Primer tick inmediato (marca ETags iniciales sin disparar chequeo
        // porque los ETags no existían antes, pero igual está bien).
        setTimeout(_tickPolling, 1500);
        _pollTimer = setInterval(_tickPolling, POLL_MS);
    }

    function detenerPolling() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        _pollEnCurso = false;
    }

    async function _tickPolling() {
        if (_pollEnCurso) return;
        if (document.hidden) return;

        const cuenta = cuentaActiva();
        if (!cuenta) return;
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return;

        _pollEnCurso = true;
        try {
            const codigo = cuenta.codigo;

            const rutas = [
                ARCHIVO_CONFIG,
                ARCHIVO_NOTIS,
                `Galeria${codigo}/galeria.json`
            ];

            let huboCambio = false;
            for (const ruta of rutas) {
                const res = await leerConETag(ruta);
                if (res.cambio) huboCambio = true;
            }

            // Los flags por hora se re-chequean cuando la hora cambia
            const horaActual = new Date().getHours();
            const cambioDeHora = horaActual !== _ultimaHoraChequeada;
            if (cambioDeHora) _ultimaHoraChequeada = horaActual;

            if (huboCambio || cambioDeHora) {
                await chequear();
            }
        } catch (e) {
            // silencioso
        } finally {
            _pollEnCurso = false;
        }
    }

    // ============================================================
    //  Hook al buscador del header (easter egg "Logros")
    // ============================================================
    function marcarFlagBuscador() {
        const cuenta = cuentaActiva();
        if (!cuenta) return;
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return;

        const codigo = cuenta.codigo;

        ConfigBD.actualizarArchivo(ARCHIVO, (actual) => {
            actual = normalizar(actual);
            if (!actual.usuarios[codigo]) actual.usuarios[codigo] = estadoVacio();
            const yo = actual.usuarios[codigo];
            if (!yo.flags || typeof yo.flags !== 'object') yo.flags = {};
            yo.flags.busqueda_logros = true;
            actual.actualizado = new Date().toISOString();
            return actual;
        }).then(() => {
            resetCache();
            chequear().catch(() => {});
        }).catch(() => {});
    }

    function hookearBuscador() {
        if (_hookBuscadorListo) return;
        const input = document.getElementById('searchInput');
        if (!input) return;

        _hookBuscadorListo = true;

        input.addEventListener('input', (e) => {
            const valor = String(e.target.value || '')
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');

            if (valor === 'logros' || valor === 'logro') {
                marcarFlagBuscador();
            }
        });
    }

    // ============================================================
    //  Auto-init
    // ============================================================
    window.addEventListener('vicwebos:sesion', async (e) => {
        resetCache();
        _ultimaHoraChequeada = -1;
        _etagsArchivos.clear();

        if (e.detail && e.detail.activa) {
            try { await chequear(); } catch (err) { /* silencioso */ }
            iniciarPolling();
        } else {
            detenerPolling();
        }

        if (typeof window.__actualizarBannerLogros === 'function') {
            try { window.__actualizarBannerLogros(); } catch (err) { /* silencioso */ }
        }
    });

    // Tick inmediato al volver a la pestaña (por si algo cambió mientras
    // estaba en background).
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && cuentaActiva()) {
            _tickPolling();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hookearBuscador);
    } else {
        hookearBuscador();
    }

    // API pública
    window.Logros = {
        ARCHIVO,
        POLL_MS,
        chequear,
        obtenerEstado,
        obtenerProgreso,
        valorDeTipo,
        _resetCache: resetCache
    };
})();
