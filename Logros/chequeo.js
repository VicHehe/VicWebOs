// ============================================================
//  chequeo.js — Lógica de logros (vive en el shell)
//  ------------------------------------------------------------
//  Guarda el estado por usuario en app/logros/logros.json.
//
//  Estructura del JSON:
//    {
//      version: 1,
//      actualizado: ISO,
//      usuarios: {
//        [codigo]: {
//          monedasMaximas: number,
//          appsMaximas: number,
//          widgetsMaximas: number,
//          temasMaximas: number,
//          fotosMaximas: number,
//          diasMaximos: number,
//          diasUnicos: ['YYYY-MM-DD', ...],
//          logros: { [id]: ISO }
//        }
//      }
//    }
//
//  Guardamos PICOS HISTÓRICOS (nunca bajan). Así si ganás un logro
//  y luego perdés el recurso, el logro no se pierde.
//
//  Caché en memoria por usuario: 1 sola lectura por sesión.
//
//  Se auto-inicializa escuchando 'vicwebos:sesion'.
// ============================================================

(function () {
    'use strict';

    const ARCHIVO = 'app/logros/logros.json';

    let _cacheEstado = null;
    let _codigoCache = null;

    function normalizar(data) {
        if (!data || typeof data !== 'object') {
            return { version: 1, actualizado: new Date().toISOString(), usuarios: {} };
        }
        if (!data.usuarios || typeof data.usuarios !== 'object') data.usuarios = {};
        return data;
    }

    function estadoVacio() {
        return {
            monedasMaximas:  0,
            appsMaximas:     0,
            widgetsMaximas:  0,
            temasMaximas:    0,
            fotosMaximas:    0,
            diasMaximos:     0,
            diasUnicos:      [],
            logros:          {}
        };
    }

    function cuentaActiva() {
        return window.cuentaActual || null;
    }

    function resetCache() {
        _cacheEstado = null;
        _codigoCache = null;
    }

    // ------------------------------------------------------------
    //  Recolectores de valores actuales (async)
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
        const instalados = (window.configCuentaActual?.widgetsInstalados) || [];
        return instalados.length;
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

    function obtenerMonedasActuales() {
        return (typeof obtenerMonedas === 'function') ? (obtenerMonedas() || 0) : 0;
    }

    function fechaLocalHoy() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    async function recolectarValores(codigo) {
        return {
            monedas:  obtenerMonedasActuales(),
            apps:     contarAppsNoBase(),
            widgets:  contarWidgets(),
            temas:    contarTemasNoBase(),
            fotos:    await contarFotos(codigo)
        };
    }

    // ------------------------------------------------------------
    //  Obtener estado (con caché en memoria)
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
            const u = data.usuarios[codigo];
            if (u && typeof u === 'object') {
                _cacheEstado = {
                    monedasMaximas:  Number(u.monedasMaximas)  || 0,
                    appsMaximas:     Number(u.appsMaximas)     || 0,
                    widgetsMaximas:  Number(u.widgetsMaximas)  || 0,
                    temasMaximas:    Number(u.temasMaximas)    || 0,
                    fotosMaximas:    Number(u.fotosMaximas)    || 0,
                    diasMaximos:     Number(u.diasMaximos)     || 0,
                    diasUnicos:      Array.isArray(u.diasUnicos) ? u.diasUnicos : [],
                    logros:          (u.logros && typeof u.logros === 'object') ? u.logros : {}
                };
            } else {
                _cacheEstado = estadoVacio();
            }
        } catch (e) {
            _cacheEstado = estadoVacio();
        }
        _codigoCache = codigo;
        return _cacheEstado;
    }

    // ------------------------------------------------------------
    //  Valor del tipo de logro
    // ------------------------------------------------------------
    function valorDeTipo(tipo, estado) {
        switch (tipo) {
            case 'monedas': return estado.monedasMaximas  || 0;
            case 'apps':    return estado.appsMaximas     || 0;
            case 'widgets': return estado.widgetsMaximas  || 0;
            case 'temas':   return estado.temasMaximas    || 0;
            case 'fotos':   return estado.fotosMaximas    || 0;
            case 'dias':    return estado.diasMaximos     || 0;
            default:        return 0;
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

        // 1. Recolectar valores async FUERA del mutador
        const valores = await recolectarValores(codigo);
        const hoy = fechaLocalHoy();
        const recien = [];
        let estadoFinal = null;

        // 2. Mutador síncrono
        await ConfigBD.actualizarArchivo(ARCHIVO, (actual) => {
            actual = normalizar(actual);
            if (!actual.usuarios[codigo]) actual.usuarios[codigo] = estadoVacio();

            const yo = actual.usuarios[codigo];

            // Picos históricos
            yo.monedasMaximas = Math.max(Number(yo.monedasMaximas) || 0, valores.monedas);
            yo.appsMaximas    = Math.max(Number(yo.appsMaximas)    || 0, valores.apps);
            yo.widgetsMaximas = Math.max(Number(yo.widgetsMaximas) || 0, valores.widgets);
            yo.temasMaximas   = Math.max(Number(yo.temasMaximas)   || 0, valores.temas);
            yo.fotosMaximas   = Math.max(Number(yo.fotosMaximas)   || 0, valores.fotos);

            // Días únicos
            if (!Array.isArray(yo.diasUnicos)) yo.diasUnicos = [];
            if (!yo.diasUnicos.includes(hoy)) {
                yo.diasUnicos.push(hoy);
                // Límite de seguridad (2 años de uso diario)
                if (yo.diasUnicos.length > 730) {
                    yo.diasUnicos = yo.diasUnicos.slice(-730);
                }
            }
            yo.diasMaximos = yo.diasUnicos.length;

            // Logros
            if (!yo.logros || typeof yo.logros !== 'object') yo.logros = {};

            const cat = window.LOGROS_REGISTRO || [];
            for (const logro of cat) {
                if (yo.logros[logro.id]) continue;
                const valor = valorDeTipo(logro.tipo, yo);
                if (valor >= (logro.meta || 0)) {
                    yo.logros[logro.id] = new Date().toISOString();
                    recien.push(logro);
                }
            }

            actual.actualizado = new Date().toISOString();

            estadoFinal = {
                monedasMaximas:  yo.monedasMaximas,
                appsMaximas:     yo.appsMaximas,
                widgetsMaximas:  yo.widgetsMaximas,
                temasMaximas:    yo.temasMaximas,
                fotosMaximas:    yo.fotosMaximas,
                diasMaximos:     yo.diasMaximos,
                diasUnicos:      [...yo.diasUnicos],
                logros:          { ...yo.logros }
            };
            return actual;
        });

        _cacheEstado = estadoFinal || estadoVacio();
        _codigoCache = codigo;

        // Notificar los nuevos
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

        // Enriquecer con valores "vivos" por si el JSON aún no se escribió
        const valoresVivos = {
            monedasMaximas:  Math.max(estado.monedasMaximas,  obtenerMonedasActuales()),
            appsMaximas:     Math.max(estado.appsMaximas,     contarAppsNoBase()),
            widgetsMaximas:  Math.max(estado.widgetsMaximas,  contarWidgets()),
            temasMaximas:    Math.max(estado.temasMaximas,    contarTemasNoBase()),
            fotosMaximas:    estado.fotosMaximas,
            diasMaximos:     estado.diasMaximos,
            diasUnicos:      estado.diasUnicos,
            logros:          estado.logros
        };

        const desbloqueados = cat.filter(l => {
            if (estado.logros[l.id]) return true;
            return valorDeTipo(l.tipo, valoresVivos) >= (l.meta || 0);
        }).length;

        return {
            desbloqueados,
            total: cat.length,
            estado: valoresVivos,
            catalogo: cat
        };
    }

    // ------------------------------------------------------------
    //  Auto-init
    // ------------------------------------------------------------
    window.addEventListener('vicwebos:sesion', async (e) => {
        resetCache();

        if (e.detail && e.detail.activa) {
            try { await chequear(); } catch (err) { /* silencioso */ }
        }

        if (typeof window.__actualizarBannerLogros === 'function') {
            try { window.__actualizarBannerLogros(); } catch (err) { /* silencioso */ }
        }
    });

    // ------------------------------------------------------------
    //  API pública
    // ------------------------------------------------------------
    window.Logros = {
        ARCHIVO,
        chequear,
        obtenerEstado,
        obtenerProgreso,
        valorDeTipo,
        _resetCache: resetCache
    };
})();
