// ============================================================
//  PublicZone.js — Public Mini Zone (chat portátil del lobby)
//  ------------------------------------------------------------
//  Versión mini del chat público global (Public Zone).
//  Muestra los ÚLTIMOS 8 mensajes y permite enviar.
//
//  Comparte el mismo archivo que la app completa:
//      app/public-zone/public-zone.json
//
//  Polling con ETag:
//    If-None-Match → GitHub devuelve 304 cuando el archivo no
//    cambió. Los 304 NO cuentan contra el rate limit, así que
//    podemos pollear sin gastar quota real.
//
//  Se oculta si:
//    • No hay comunidad conectada.
//    • No hay sesión activa.
//    • El lobby no está visible (pestaña abierta en otra app).
// ============================================================

(function () {
    'use strict';

    const RUTA          = 'app/public-zone/public-zone.json';
    const CUENTAS_FILE  = 'cuenta.json';
    const MAX_VISIBLES  = 8;
    const MAX_CARACTERES = 120;
    const POLL_MS       = 4000;

    let _etag = null;
    let _pollTimer = null;
    let _enCurso = false;
    let _mensajes = [];
    let _usuarios = {};
    let _usuariosCargados = false;

    // ------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------
    function $(id) { return document.getElementById(id); }

    function escapar(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function generarId() {
        return 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    function horaCorta(iso) {
        return new Date(iso).toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    }

    function claveFecha(iso) {
        const d = new Date(iso);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    function etiquetaFecha(iso) {
        const d = new Date(iso);
        const hoy = new Date();
        const ayer = new Date();
        ayer.setDate(hoy.getDate() - 1);
        if (claveFecha(iso) === claveFecha(hoy.toISOString())) return 'Hoy';
        if (claveFecha(iso) === claveFecha(ayer.toISOString())) return 'Ayer';
        return d.toLocaleDateString('es-CL', {
            day: '2-digit', month: 'short'
        });
    }

    function normalizar(data) {
        if (!data || typeof data !== 'object') return { version: 1, mensajes: [] };
        if (!Array.isArray(data.mensajes)) data.mensajes = [];
        return data;
    }

    // ------------------------------------------------------------
    //  Estado de sesión / comunidad
    // ------------------------------------------------------------
    function estaListo() {
        const bd = window.ConfigBD;
        if (!bd || !bd.estaConectado()) return false;
        if (!window.cuentaActual) return false;
        return true;
    }

    function obtenerUsuarioActual() {
        return window.cuentaActual || null;
    }

    // ------------------------------------------------------------
    //  Usuarios (para avatar + nombre)
    // ------------------------------------------------------------
    async function cargarUsuarios(force) {
        if (_usuariosCargados && !force) return;
        const bd = window.ConfigBD;
        if (!bd) return;
        try {
            const cuentas = force
                ? await bd.leerArchivoFresh(CUENTAS_FILE)
                : await bd.leerArchivo(CUENTAS_FILE);
            if (!Array.isArray(cuentas)) return;
            _usuarios = {};
            cuentas.forEach(c => { _usuarios[c.codigo] = c; });
            _usuariosCargados = true;
        } catch (e) { /* silencioso */ }
    }

    function nombreDe(codigo) {
        const u = _usuarios[codigo];
        return (u && u.nombre) || codigo;
    }

    function fotoDe(codigo) {
        const u = _usuarios[codigo];
        return (u && u.foto) || null;
    }

    function inicialDe(codigo) {
        const n = nombreDe(codigo);
        return (n || '?').charAt(0).toUpperCase();
    }

    // ------------------------------------------------------------
    //  Lectura con ETag (polling barato)
    // ------------------------------------------------------------
    async function leerConETag() {
        const bd = window.ConfigBD;
        if (!bd || !bd.estaConectado()) return { cambio: false };

        const com = (typeof window.obtenerComunidadActiva === 'function')
            ? window.obtenerComunidadActiva() : null;
        if (!com || !com.githubToken || !com.githubOwner || !com.githubRepo) {
            return { cambio: false };
        }

        const url = `https://api.github.com/repos/${com.githubOwner}/${com.githubRepo}/contents/${RUTA}`;
        const headers = {
            'Authorization': `Bearer ${com.githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (_etag) headers['If-None-Match'] = _etag;

        try {
            const res = await fetch(url, { headers });

            if (res.status === 304) return { cambio: false };

            if (res.status === 404) {
                _etag = null;
                return { cambio: true, data: null };
            }

            if (!res.ok) return { cambio: false };

            const nuevoETag = res.headers.get('ETag');
            if (nuevoETag) _etag = nuevoETag;

            const json = await res.json();
            const contenido = decodeURIComponent(escape(atob(json.content)));
            return { cambio: true, data: JSON.parse(contenido) };
        } catch (e) {
            return { cambio: false };
        }
    }

    // ------------------------------------------------------------
    //  Render
    // ------------------------------------------------------------
    function render() {
        const cont = $('pmzMensajes');
        if (!cont) return;

        const usuario = obtenerUsuarioActual();
        if (!usuario) {
            cont.innerHTML = `
                <div class="pmz-vacio">
                    <i data-lucide="user-circle"></i>
                    <span>Necesitás una cuenta para ver la zona pública</span>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Últimos N mensajes
        const visibles = _mensajes.slice(-MAX_VISIBLES);

        if (visibles.length === 0) {
            cont.innerHTML = `
                <div class="pmz-vacio">
                    <i data-lucide="megaphone"></i>
                    <span>Sé el primero en escribirle a la comunidad</span>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        cont.innerHTML = '';
        let ultimaFecha = '';

        visibles.forEach((msg) => {
            const fechaClave = claveFecha(msg.fecha);
            if (fechaClave !== ultimaFecha) {
                ultimaFecha = fechaClave;
                const sep = document.createElement('div');
                sep.className = 'pmz-hora-sep';
                sep.textContent = etiquetaFecha(msg.fecha);
                cont.appendChild(sep);
            }
            cont.appendChild(crearMensajeDOM(msg, usuario));
        });

        if (window.lucide) window.lucide.createIcons();

        // Auto-scroll al fondo
        cont.scrollTop = cont.scrollHeight;
    }

    function crearMensajeDOM(msg, usuario) {
        const esPropio = msg.autor === usuario.codigo;
        const div = document.createElement('div');
        div.className = 'pmz-item ' + (esPropio ? 'propio' : 'ajeno');

        // Avatar solo en ajenos
        if (!esPropio) {
            const av = document.createElement('div');
            av.className = 'pmz-avatar';
            const foto = fotoDe(msg.autor);
            av.innerHTML = foto
                ? `<img src="${foto}" alt="">`
                : `<span>${escapar(inicialDe(msg.autor))}</span>`;
            div.appendChild(av);
        }

        const burbuja = document.createElement('div');
        burbuja.className = 'pmz-burbuja';

        if (!esPropio) {
            const autor = document.createElement('div');
            autor.className = 'pmz-autor';
            autor.textContent = nombreDe(msg.autor);
            burbuja.appendChild(autor);
        }

        const txt = document.createElement('div');
        txt.className = 'pmz-texto';
        txt.textContent = msg.texto || '';
        burbuja.appendChild(txt);

        const hora = document.createElement('div');
        hora.className = 'pmz-hora';
        hora.textContent = horaCorta(msg.fecha);
        burbuja.appendChild(hora);

        div.appendChild(burbuja);
        return div;
    }

    // ------------------------------------------------------------
    //  Recargar
    // ------------------------------------------------------------
    async function recargar(fresh) {
        const bd = window.ConfigBD;
        if (!bd || !bd.estaConectado()) {
            _mensajes = [];
            render();
            return;
        }
        try {
            const data = fresh
                ? await bd.leerArchivoFresh(RUTA)
                : await bd.leerArchivo(RUTA);
            _mensajes = normalizar(data).mensajes;
            render();
        } catch (e) {
            // silencioso
        }
    }

    // ------------------------------------------------------------
    //  Enviar
    // ------------------------------------------------------------
    async function enviar() {
        const usuario = obtenerUsuarioActual();
        const input = $('pmzInput');
        const btn = $('pmzBtnEnviar');
        if (!usuario || !input) return;

        const texto = input.value.trim();
        if (!texto) return;
        if (texto.length > MAX_CARACTERES) return;

        input.value = '';
        if (btn) btn.disabled = true;

        const msg = {
            id: generarId(),
            autor: usuario.codigo,
            texto: texto,
            fecha: new Date().toISOString()
        };

        try {
            await window.ConfigBD.actualizarArchivo(RUTA, (actual) => {
                if (!actual || typeof actual !== 'object') actual = { version: 1, mensajes: [] };
                if (!Array.isArray(actual.mensajes)) actual.mensajes = [];
                actual.mensajes.push(msg);
                if (actual.mensajes.length > 200) {
                    actual.mensajes = actual.mensajes.slice(-200);
                }
                actual.actualizado = new Date().toISOString();
                return actual;
            });
            _etag = null;   // invalidar ETag tras escribir
            await recargar(true);
        } catch (e) {
            // restaurar texto si falla
            input.value = texto;
            if (btn) btn.disabled = false;
            console.warn('[PublicMiniZone] No se pudo enviar:', e);
        }
    }

    // ------------------------------------------------------------
    //  Polling
    // ------------------------------------------------------------
    function iniciarPoll() {
        detenerPoll();
        _pollTimer = setInterval(async () => {
            if (document.hidden) return;
            if (!estaListo()) return;
            const seccion = $('welcomePublicZoneSection');
            if (!seccion || seccion.style.display === 'none') return;
            if (_enCurso) return;

            _enCurso = true;
            try {
                const res = await leerConETag();
                if (res.cambio) {
                    const nuevo = normalizar(res.data);
                    const antes = JSON.stringify(_mensajes);
                    const despues = JSON.stringify(nuevo.mensajes);
                    if (antes !== despues) {
                        _mensajes = nuevo.mensajes;
                        render();
                    }
                }
            } catch (e) {
                // silencioso
            } finally {
                _enCurso = false;
            }
        }, POLL_MS);
    }

    function detenerPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        _enCurso = false;
    }

    // ------------------------------------------------------------
    //  Visibilidad de la sección
    // ------------------------------------------------------------
    async function actualizarVisibilidad() {
        const seccion = $('welcomePublicZoneSection');
        if (!seccion) return;

        const listo = estaListo();
        seccion.style.display = listo ? 'flex' : 'none';

        if (!listo) return;

        // Cargar usuarios y mensajes
        await cargarUsuarios(true);
        await recargar(true);
    }

    // ------------------------------------------------------------
    //  Wiring
    // ------------------------------------------------------------
    function conectarEventos() {
        const input = $('pmzInput');
        const btn = $('pmzBtnEnviar');
        const btnAbrir = $('btnAbrirPublicZone');

        if (input) {
            input.addEventListener('input', () => {
                if (btn) btn.disabled = !input.value.trim();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    enviar();
                }
            });
        }

        if (btn) btn.addEventListener('click', enviar);

        if (btnAbrir) {
            btnAbrir.addEventListener('click', () => {
                if (typeof window.abrirHerramienta === 'function') {
                    window.abrirHerramienta('public-zone');
                }
            });
        }
    }

    // ------------------------------------------------------------
    //  Init
    // ------------------------------------------------------------
    async function inicializar() {
        if (!$('welcomePublicZoneSection')) return;
        conectarEventos();
        iniciarPoll();
        await actualizarVisibilidad();
    }

    // Eventos del shell
    window.addEventListener('vicwebos:sesion', () => {
        _usuariosCargados = false;
        _etag = null;
        actualizarVisibilidad();
    });

    window.addEventListener('vicwebos:comunidad', () => {
        _usuariosCargados = false;
        _etag = null;
        actualizarVisibilidad();
    });

    // Cuando se muestra el lobby, refrescar
    // (JsIndex dispara mostrarBienvenida() al pulsar Inicio)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) actualizarVisibilidad();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    // Exponer API por si se necesita refrescar manualmente
    window.PublicMiniZone = {
        recargar: () => recargar(true),
        actualizarVisibilidad
    };

})();
