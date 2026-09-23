// ============================================================
//  chequeo.js — Lógica de logros (vive en el shell)
//  ------------------------------------------------------------
//  Guarda el estado por usuario en app/logros/logros.json
//
//  CLAVE: guardamos "monedasMaximas" (el pico histórico),
//  no las monedas actuales. Así si ganás un logro y luego
//  gastás, el logro no se pierde.
//
//  API:
//    window.Logros.chequear()       → desbloquea y devuelve nuevos
//    window.Logros.obtenerEstado()  → estado crudo del usuario
//    window.Logros.obtenerProgreso()→ { desbloqueados, total, estado }
// ============================================================

(function () {
    'use strict';

    const ARCHIVO = 'app/logros/logros.json';

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

    async function obtenerEstado(codigo) {
        if (!codigo) {
            const c = cuentaActiva();
            codigo = c ? c.codigo : null;
        }
        if (!codigo) return estadoVacio();
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return estadoVacio();

        try {
            const data = normalizar(await ConfigBD.leerArchivoFresh(ARCHIVO));
            const u = data.usuarios[codigo];
            if (!u || typeof u !== 'object') return estadoVacio();
            return {
                monedasMaximas: Number(u.monedasMaximas) || 0,
                logros: (u.logros && typeof u.logros === 'object') ? u.logros : {}
            };
        } catch (e) {
            return estadoVacio();
        }
    }

    async function chequear() {
        const cuenta = cuentaActiva();
        if (!cuenta) return [];
        if (!window.ConfigBD || !ConfigBD.estaConectado()) return [];

        const codigo = cuenta.codigo;
        const monedasActuales = (typeof obtenerMonedas === 'function') ? (obtenerMonedas() || 0) : 0;
        const recien = [];

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
            return actual;
        });

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

        // Avisar al banner del lobby si está escuchando
        if (typeof window.__actualizarBannerLogros === 'function') {
            try { window.__actualizarBannerLogros(); } catch (e) {}
        }

        return recien;
    }

    async function obtenerProgreso() {
        const cat = window.LOGROS_REGISTRO || [];
        const estado = await obtenerEstado();
        const desbloqueados = cat.filter(l => estado.logros[l.id]).length;
        return {
            desbloqueados,
            total: cat.length,
            estado,
            catalogo: cat
        };
    }

    window.Logros = {
        ARCHIVO,
        chequear,
        obtenerEstado,
        obtenerProgreso
    };
})();
