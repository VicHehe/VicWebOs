// ============================================================
//  chequeo.js — Lógica de logros (vive en el shell)
//  ------------------------------------------------------------
//  Guarda el estado por usuario en app/logros/logros.json.
//
//  CLAVE: guardamos "monedasMaximas" (el pico histórico),
//  no las monedas actuales. Así si ganás un logro y luego
//  gastás, el logro no se pierde.
//
//  Caché en memoria del estado por usuario: solo 1 lectura
//  al archivo por sesión. Después, todo desde memoria.
//
//  Se auto-inicializa escuchando 'vicwebos:sesion' (disparado
//  por Cuenta.js al iniciar/cerrar sesión). Así no hay que tocar
//  JsIndex ni ningún otro archivo.
//
//  API:
//    window.Logros.chequear()        → escribe, desbloquea, devuelve nuevos
//    window.Logros.obtenerEstado()   → estado crudo del usuario
//    window.Logros.obtenerProgreso() → { desbloqueados, total, estado, catalogo }
// ============================================================

(function () {
    'use strict';

    const ARCHIVO = 'app/logros/logros.json';

    // Caché en memoria del estado del usuario actual
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
        return { monedasMaximas: 0, logros: {} };
    }

    function cuentaActiva() {
        return window.cuentaActual || null;
    }

    function resetCache() {
        _cacheEstado = null;
        _codigoCache = null;
    }

    async function obtenerEstado() {
        const cuenta = cuentaActiva();
        if (!cuenta) return estadoVacio();
        const codigo = cuenta.codigo;

        // Caché válida solo si es del mismo usuario
        if (_cacheEstado && _codigoCache === codigo) {
            return _cacheEstado;
        }

        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            _cacheEstado = estadoVacio();
            _codigoCache = codigo;
            return _cacheEstado;
        }

        try {
            // Usamos leerArchivo (no Fresh) para aprovechar la caché
            // de 5 min de ConfigBD y no spamear peticiones.
            const data = normalizar(await ConfigBD.leerArchivo(ARCHIVO));
            const u = data.usuarios[codigo];
            _cacheEstado = (u && typeof u === 'object') ? {
                monedasMaximas: Number(u.monedasMaximas) || 0,
                logros: (u.logros && typeof u.logros === 'object') ? u.logros : {}
            } : estadoVacio();
        } catch (e) {
            _cacheEstado = estadoVacio();
        }
        _codigoCache = codigo;
        return _cacheEstado;
    }

    async function chequear() {
        const cuenta = cuentaActiva();
        if (!cuenta) return [];
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return [];

        const codigo = cuenta.codigo;
        const monedasActuales = (typeof obtenerMonedas === 'function') ? (obtenerMonedas() || 0) : 0;
        const recien = [];
        let estadoFinal = null;

        await ConfigBD.actualizarArchivo(ARCHIVO, (actual) => {
            actual = normalizar(actual);
            if (!actual.usuarios[codigo]) actual.usuarios[codigo] = estadoVacio();

            const yo = actual.usuarios[codigo];
            if (!yo.logros || typeof yo.logros !== 'object') yo.logros = {};

            // Guardar el pico histórico de monedas
            const antes = Number(yo.monedasMaximas) || 0;
            yo.monedasMaximas = Math.max(antes, monedasActuales);

            // Desbloquear los que correspondan
            const cat = window.LOGROS_REGISTRO || [];
            for (const logro of cat) {
                if (yo.logros[logro.id]) continue;
                if (yo.monedasMaximas >= (logro.meta || 0)) {
                    yo.logros[logro.id] = new Date().toISOString();
                    recien.push(logro);
                }
            }

            actual.actualizado = new Date().toISOString();

            // Snapshot para la caché
            estadoFinal = {
                monedasMaximas: yo.monedasMaximas,
                logros: { ...yo.logros }
            };
            return actual;
        });

        // Actualizar caché en memoria
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

        // Avisar al banner del lobby
        if (typeof window.__actualizarBannerLogros === 'function') {
            try { window.__actualizarBannerLogros(); } catch (e) { /* silencioso */ }
        }

        return recien;
    }

    async function obtenerProgreso() {
        const cat = window.LOGROS_REGISTRO || [];
        const estado = await obtenerEstado();

        // "Monedas vivas" = máximo entre lo guardado y las monedas actuales.
        // Esto hace que el banner muestre progreso en vivo aunque el
        // archivo de logros todavía no se haya escrito.
        const monedasActuales = (typeof obtenerMonedas === 'function') ? (obtenerMonedas() || 0) : 0;
        const monedasVivas = Math.max(estado.monedasMaximas, monedasActuales);

        const desbloqueados = cat.filter(l => {
            if (estado.logros[l.id]) return true;
            return monedasVivas >= (l.meta || 0);
        }).length;

        return {
            desbloqueados,
            total: cat.length,
            estado: {
                monedasMaximas: monedasVivas,
                logros: estado.logros
            },
            catalogo: cat
        };
    }

    // ------------------------------------------------------------
    //  Auto-init al iniciar/cerrar sesión
    // ------------------------------------------------------------
    window.addEventListener('vicwebos:sesion', async (e) => {
        resetCache();

        if (e.detail && e.detail.activa) {
            // Chequear al iniciar sesión (crea el archivo si no existe
            // y desbloquea todo lo que corresponda de una vez)
            try { await chequear(); } catch (err) { /* silencioso */ }
        }

        // Refrescar el banner con el nuevo estado
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
        _resetCache: resetCache
    };
})();
