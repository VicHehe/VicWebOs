// ============================================================
//  Racha.js — Regalo diario con racha
//  ------------------------------------------------------------
//  · 1 regalo por día (hora de Chile).
//  · Racha de días consecutivos.
//  · Mes 1: 10 monedas · Mes 2: 15 · Mes 3: 20 · ... · Mes 6+: 35 (tope).
//  · Se guarda en app/racha/{codigo}racha.json
// ============================================================

(function () {
    'use strict';

    const ARCHIVO_BASE   = 'app/racha/';
    const MONEDAS_BASE   = 10;
    const INCREMENTO_MES = 5;
    const MAX_MONEDAS    = 35;

    let _estadoActual = null;
    let _enCurso = false;

    const _cuenta  = () => window.cuentaActual || null;
    const _bd      = () => window.ConfigBD || null;
    const _api     = () => window.__vicwebos || null;

    function _ruta(codigo) { return ARCHIVO_BASE + codigo + 'racha.json'; }

    function _hoyChile() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    }

    function _mesChile(fecha) {
        const d = fecha ? new Date(fecha) : new Date();
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit'
        }).format(d);
    }

    function _mesSiguiente(mesStr) {
        const [y, m] = mesStr.split('-').map(Number);
        let ny = y, nm = m + 1;
        if (nm > 12) { nm = 1; ny++; }
        return `${ny}-${String(nm).padStart(2, '0')}`;
    }

    function _normalizar(data) {
        if (!data || typeof data !== 'object') {
            return {
                version: 1,
                ultimoReclamo: null,
                ultimoMes: null,
                mesesSeguidos: 0,
                diasSeguidos: 0,
                totalReclamado: 0
            };
        }
        return data;
    }

    function _recompensaPorMes(mesesSeguidos) {
        const n = Math.max(1, Number(mesesSeguidos) || 1);
        return Math.min(MAX_MONEDAS, MONEDAS_BASE + (n - 1) * INCREMENTO_MES);
    }

    function _yaReclamoHoy(estado) {
        if (!estado || !estado.ultimoReclamo) return false;
        return String(estado.ultimoReclamo).slice(0, 10) === _hoyChile();
    }

    function _diffDias(desde, hasta) {
        const d1 = new Date(desde + 'T00:00:00Z');
        const d2 = new Date(hasta + 'T00:00:00Z');
        return Math.round((d2 - d1) / 86400000);
    }

    function _proximoEstado(estado) {
        const hoy = _hoyChile();
        const mesActual = _mesChile();
        let mesesSeguidos = estado.mesesSeguidos || 0;
        let diasSeguidos = estado.diasSeguidos || 0;

        // Meses consecutivos
        if (!estado.ultimoMes) {
            mesesSeguidos = 1;
        } else if (estado.ultimoMes !== mesActual) {
            if (mesActual === _mesSiguiente(estado.ultimoMes)) mesesSeguidos++;
            else mesesSeguidos = 1;
        }

        // Días consecutivos
        if (!estado.ultimoReclamo) {
            diasSeguidos = 1;
        } else {
            const diff = _diffDias(estado.ultimoReclamo.slice(0, 10), hoy);
            if (diff === 1) diasSeguidos++;
            else if (diff > 1) diasSeguidos = 1;
        }

        return { mesesSeguidos, diasSeguidos };
    }

    async function _leer() {
        const c = _cuenta();
        const bd = _bd();
        if (!c || !bd || !bd.estaConectado()) return null;
        try {
            const data = await bd.leerArchivo(_ruta(c.codigo));
            return _normalizar(data);
        } catch (e) {
            return _normalizar(null);
        }
    }

    async function _escribir(estado) {
        const c = _cuenta();
        const bd = _bd();
        if (!c || !bd) throw new Error('Necesitás una cuenta.');
        await bd.escribirArchivo(_ruta(c.codigo), estado);
        _estadoActual = estado;
    }

    async function reclamar() {
        const c = _cuenta();
        const api = _api();
        if (!c || !api) throw new Error('Necesitás una cuenta.');

        const estado = await _leer();
        if (_yaReclamoHoy(estado)) throw new Error('Ya reclamaste tu regalo hoy.');

        const nuevos = _proximoEstado(estado);
        const recompensa = _recompensaPorMes(nuevos.mesesSeguidos);

        // Primero dar monedas (con chequera + notificación)
        await api.canjear(
            'gift',
            'racha',
            `Regalo diario · racha ${nuevos.diasSeguidos}d · mes ${nuevos.mesesSeguidos}`,
            recompensa
        );

        // Después persistir
        await _escribir({
            version: 1,
            ultimoReclamo: new Date().toISOString(),
            ultimoMes: _mesChile(),
            mesesSeguidos: nuevos.mesesSeguidos,
            diasSeguidos: nuevos.diasSeguidos,
            totalReclamado: (estado.totalReclamado || 0) + recompensa
        });

        return { recompensa };
    }

    // ------------------------------------------------------------
    //  Render
    // ------------------------------------------------------------
    function _render() {
        const seccion = document.getElementById('welcomeRachaSection');
        const card    = document.getElementById('rachaCard');
        const badge   = document.getElementById('rachaBadge');
        if (!seccion || !card) return;

        if (!_cuenta()) { seccion.style.display = 'none'; return; }

        const estado = _estadoActual || _normalizar(null);
        const reclamadoHoy = _yaReclamoHoy(estado);
        const mesMostrado = Math.min(6, Math.max(1, estado.mesesSeguidos || 1));
        const recompensaHoy = _recompensaPorMes(mesMostrado);
        const recompensaProx = _recompensaPorMes(mesMostrado + 1);

        if (badge) {
            badge.textContent = `${estado.diasSeguidos || 0} día${estado.diasSeguidos === 1 ? '' : 's'}`;
        }

        card.innerHTML = `
            <div class="racha-card-icono">
                <i data-lucide="${reclamadoHoy ? 'check-circle-2' : 'gift'}"></i>
            </div>
            <div class="racha-card-info">
                <div class="racha-card-titulo">
                    ${reclamadoHoy ? '¡Ya reclamaste hoy!' : 'Tenés un regalo esperando'}
                </div>
                <div class="racha-card-desc">
                    ${reclamadoHoy
                        ? `Volvé mañana. Próximo: <strong>${recompensaProx} monedas</strong>.`
                        : `Reclamá <strong>${recompensaHoy} monedas</strong> ahora.`}
                </div>
                <div class="racha-card-stats">
                    <span><i data-lucide="flame"></i> ${estado.diasSeguidos || 0}d seguidos</span>
                    <span><i data-lucide="calendar"></i> Mes ${mesMostrado}/6</span>
                    <span><i data-lucide="coins"></i> ${(estado.totalReclamado || 0).toLocaleString('es-CL')} total</span>
                </div>
            </div>
            ${!reclamadoHoy ? `
                <button class="racha-btn-reclamar" id="rachaBtnReclamar" type="button">
                    <i data-lucide="gift"></i>
                    Reclamar
                </button>
            ` : ''}
        `;

        seccion.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();

        const btn = document.getElementById('rachaBtnReclamar');
        if (btn) {
            btn.addEventListener('click', async () => {
                if (_enCurso) return;
                _enCurso = true;
                btn.disabled = true;
                const html = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> ...';
                if (window.lucide) window.lucide.createIcons();
                try {
                    await reclamar();
                    await recargar();
                } catch (e) {
                    alert('❌ ' + (e.message || 'Error al reclamar'));
                    btn.disabled = false;
                    btn.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                } finally {
                    _enCurso = false;
                }
            });
        }
    }

    async function recargar() {
        _estadoActual = await _leer();
        _render();
    }

    // ------------------------------------------------------------
    //  Eventos + Init
    // ------------------------------------------------------------
    window.addEventListener('vicwebos:sesion',    () => recargar());
    window.addEventListener('vicwebos:comunidad', () => recargar());

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(recargar, 500);
    });

    window.Racha = { recargar, reclamar };

})();
