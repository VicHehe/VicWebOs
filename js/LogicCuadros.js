// ============================================================
//  LogicCuadros.js — Lógica de Cuadros (decoración del lobby)
//  ------------------------------------------------------------
//  Módulo AUTOCONTENIDO. No toca Cuenta.js, JsIndex.js ni
//  configuracion.js. Toda la persistencia vive en:
//      app/cuadros/{codigo}cuadros.json
//
//  API pública (para Stor-He y otros):
//    LogicCuadros.obtenerCatalogo()      → CUADROS_DISPONIBLES
//    LogicCuadros.obtenerInstalados()    → ['id', 'id', ...]
//    LogicCuadros.obtenerActivos()       → ['id', 'id', ...]
//    LogicCuadros.estaInstalado(id)      → bool
//    LogicCuadros.estaActivo(id)         → bool
//    LogicCuadros.contarActivos()        → número
//    LogicCuadros.MAX_ACTIVOS            → 10
//    LogicCuadros.comprar(id)            → Promise (cobra + instala + autoactiva)
//    LogicCuadros.desinstalar(id)        → Promise
//    LogicCuadros.activar(id)            → Promise
//    LogicCuadros.desactivar(id)         → Promise
//    LogicCuadros.recargar()             → Promise (relee estado + render)
//
//  Stor-He llama todo desde su iframe:
//    const lc = window.parent.LogicCuadros;
//    await lc.comprar('monstera');
// ============================================================

(function () {
    'use strict';

    const MAX_ACTIVOS = 10;
    const RUTA_BASE = 'app/cuadros/';

    // ------------------------------------------------------------
    //  Estado local
    // ------------------------------------------------------------
    let _state = { version: 1, instalados: [], activos: [] };
    let _inicializado = false;
    let _cargando = false;

    // ------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------
    function _bd() { return window.ConfigBD || null; }
    function _api() { return window.__vicwebos || null; }

    function _cuenta() {
        return window.cuentaActual || null;
    }

    function _ruta() {
        const c = _cuenta();
        if (!c || !c.codigo) return null;
        return RUTA_BASE + c.codigo + 'cuadros.json';
    }

    function _catalogo() {
        return Array.isArray(window.CUADROS_DISPONIBLES)
            ? window.CUADROS_DISPONIBLES
            : [];
    }

    function _buscar(id) {
        return _catalogo().find(c => c.id === id) || null;
    }

    function _normalizar(data) {
        if (!data || typeof data !== 'object') {
            return { version: 1, instalados: [], activos: [] };
        }
        if (!Array.isArray(data.instalados)) data.instalados = [];
        if (!Array.isArray(data.activos))    data.activos    = [];
        return data;
    }

    // ------------------------------------------------------------
    //  Persistencia
    // ------------------------------------------------------------
    async function _leer() {
        const bd = _bd();
        const ruta = _ruta();
        if (!bd || !bd.estaConectado() || !ruta) return null;

        try {
            const data = await bd.leerArchivoFresh(ruta);
            return _normalizar(data);
        } catch (e) {
            return { version: 1, instalados: [], activos: [] };
        }
    }

    async function _escribir(mutador) {
        const bd = _bd();
        const ruta = _ruta();
        if (!bd || !bd.estaConectado()) throw new Error('Sin conexión.');
        if (!ruta) throw new Error('Necesitás una cuenta.');

        const result = await bd.actualizarArchivo(ruta, (actual) => {
            actual = _normalizar(actual);
            actual = mutador(actual);
            if (actual.activos.length > MAX_ACTIVOS) {
                actual.activos = actual.activos.slice(0, MAX_ACTIVOS);
            }
            actual.actualizado = new Date().toISOString();
            return actual;
        });

        _state = _normalizar(result);
        return _state;
    }

    // ------------------------------------------------------------
    //  Render del lobby
    // ------------------------------------------------------------
    function _render() {
        const seccion = document.getElementById('welcomeCuadrosSection');
        const zona    = document.getElementById('cuadrosZona');
        const contador = document.getElementById('cdrContador');
        if (!seccion || !zona) return;

        if (!_cuenta() || _state.activos.length === 0) {
            seccion.style.display = 'none';
            return;
        }

        seccion.style.display = 'flex';
        if (contador) {
            contador.textContent = `${_state.activos.length} / ${MAX_ACTIVOS}`;
        }

        zona.innerHTML = '';
        _state.activos.forEach(id => {
            const cuadro = _buscar(id);
            if (!cuadro) return;

            const wrap = document.createElement('div');
            wrap.className = 'cdr-item';
            wrap.dataset.id = id;
            wrap.title = cuadro.nombre;

            const iframe = document.createElement('iframe');
            iframe.src = cuadro.ruta;
            iframe.className = 'cdr-iframe';
            iframe.loading = 'lazy';
            iframe.setAttribute('scrolling', 'no');
            iframe.setAttribute('tabindex', '-1');
            iframe.setAttribute('aria-hidden', 'true');

            wrap.appendChild(iframe);
            zona.appendChild(wrap);
        });
    }

    // ------------------------------------------------------------
    //  Recargar
    // ------------------------------------------------------------
    async function recargar() {
        if (_cargando) return _state;
        _cargando = true;
        try {
            const data = await _leer();
            if (data) _state = data;
            _render();
            return _state;
        } finally {
            _cargando = false;
        }
    }

    // ------------------------------------------------------------
    //  API pública
    // ------------------------------------------------------------
    function obtenerCatalogo() {
        return _catalogo();
    }

    function obtenerInstalados() {
        return Array.isArray(_state.instalados) ? _state.instalados.slice() : [];
    }

    function obtenerActivos() {
        return Array.isArray(_state.activos) ? _state.activos.slice() : [];
    }

    function estaInstalado(id) {
        return _state.instalados.includes(id);
    }

    function estaActivo(id) {
        return _state.activos.includes(id);
    }

    function contarActivos() {
        return _state.activos.length;
    }

    // ---------- Comprar ----------
    async function comprar(id) {
        const cuadro = _buscar(id);
        if (!cuadro) throw new Error('Cuadro no encontrado.');

        const api = _api();
        if (!api) throw new Error('API no disponible.');

        const cuenta = _cuenta();
        if (!cuenta) throw new Error('Necesitás una cuenta.');

        // Refrescar estado fresco antes de cobrar
        await recargar();

        if (estaInstalado(id)) {
            throw new Error('Ya tenés este cuadro.');
        }

        const precio = Number(cuadro.monedas) || 0;
        const monedasActuales = api.obtenerMonedas ? api.obtenerMonedas() : 0;
        if (precio > 0 && monedasActuales < precio) {
            throw new Error(`Te faltan ${precio - monedasActuales} monedas.`);
        }

        // Cobrar
        if (precio > 0) {
            await api.gastoBoleta(
                cuadro.icono || 'frame',
                'stor-he',
                `Cuadro: ${cuadro.nombre}`,
                precio
            );
        }

        // Persistir y auto-activar si hay lugar
        await _escribir((s) => {
            if (!s.instalados.includes(id)) s.instalados.push(id);
            if (s.activos.length < MAX_ACTIVOS && !s.activos.includes(id)) {
                s.activos.push(id);
            }
            return s;
        });

        _render();
        return { ok: true, activado: estaActivo(id) };
    }

    // ---------- Desinstalar ----------
    async function desinstalar(id) {
        if (!estaInstalado(id)) return { ok: true };
        await _escribir((s) => {
            s.instalados = s.instalados.filter(x => x !== id);
            s.activos    = s.activos.filter(x => x !== id);
            return s;
        });
        _render();
        return { ok: true };
    }

    // ---------- Activar ----------
    async function activar(id) {
        if (!estaInstalado(id)) throw new Error('Primero comprá el cuadro.');
        if (estaActivo(id)) return { ok: true, yaEstaba: true };
        if (_state.activos.length >= MAX_ACTIVOS) {
            throw new Error(`Máximo ${MAX_ACTIVOS} cuadros activos. Desactivá uno primero.`);
        }

        await _escribir((s) => {
            if (!s.activos.includes(id)) s.activos.push(id);
            return s;
        });
        _render();
        return { ok: true };
    }

    // ---------- Desactivar ----------
    async function desactivar(id) {
        if (!estaActivo(id)) return { ok: true };
        await _escribir((s) => {
            s.activos = s.activos.filter(x => x !== id);
            return s;
        });
        _render();
        return { ok: true };
    }

    // ------------------------------------------------------------
    //  Eventos del shell
    // ------------------------------------------------------------
    window.addEventListener('vicwebos:sesion', () => {
        _state = { version: 1, instalados: [], activos: [] };
        recargar();
    });

    window.addEventListener('vicwebos:comunidad', () => {
        _state = { version: 1, instalados: [], activos: [] };
        recargar();
    });

    // ------------------------------------------------------------
    //  Init
    // ------------------------------------------------------------
    async function inicializar() {
        if (_inicializado) return;
        _inicializado = true;
        await recargar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    // ------------------------------------------------------------
    //  Exponer API global
    // ------------------------------------------------------------
    window.LogicCuadros = {
        MAX_ACTIVOS,
        obtenerCatalogo,
        obtenerInstalados,
        obtenerActivos,
        estaInstalado,
        estaActivo,
        contarActivos,
        comprar,
        desinstalar,
        activar,
        desactivar,
        recargar
    };
})();
