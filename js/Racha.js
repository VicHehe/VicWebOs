// ============================================================
//  Racha.js — Regalo diario con racha
//  ------------------------------------------------------------
//  · 1 regalo por día (hora de Chile).
//  · Racha de días consecutivos.
//  · Mes 1: 10 monedas · Mes 2: 15 · ... · Mes 6+: 35 (tope).
//  · Anti doble-canje:
//      1) Lock en memoria (evita doble-click local).
//      2) lectura fresh (salta caché de 5min).
//      3) mutador atómico dentro de actualizarArchivo (merge real).
//  · Countdown hasta próxima medianoche de Chile.
// ============================================================

(function () {
    'use strict';

    const ARCHIVO_BASE   = 'app/racha/';
    const MONEDAS_BASE   = 10;
    const INCREMENTO_MES = 5;
    const MAX_MONEDAS    = 35;

    let _estadoActual = null;
    let _reclamando = false;
    let _countdownTimer = null;

    const _cuenta  = () => window.cuentaActual || null;
    const _bd      = () => window.ConfigBD || null;
    const _api     = () => window.__vicwebos || null;

    function _ruta(codigo) { return ARCHIVO_BASE + codigo + 'racha.json'; }

    // ------------------------------------------------------------
    //  Fechas
    // ------------------------------------------------------------
    function _hoyChile() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    }

    function _mesChile() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit'
        }).format(new Date());
    }

    function _mesSiguiente(mesStr) {
        const [y, m] = mesStr.split('-').map(Number);
        let ny = y, nm = m + 1;
        if (nm > 12) { nm = 1; ny++; }
        return `${ny}-${String(nm).padStart(2, '0')}`;
    }

    function _msHastaProximaMedianocheChile() {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).format(new Date()).split(':').map(Number);
        const transcurridos = partes[0] * 3600 + partes[1] * 60 + partes[2];
        return Math.max(0, (86400 - transcurridos) * 1000);
    }

    function _fmtCuenta(ms) {
        if (ms <= 0) return '00:00:00';
        const s = Math.floor(ms / 1000);
        const h  = Math.floor(s / 3600);
        const m  = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }

    // ------------------------------------------------------------
    //  Normalización / cálculo
    // ------------------------------------------------------------
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

        if (!estado.ultimoMes) {
            mesesSeguidos = 1;
        } else if (estado.ultimoMes !== mesActual) {
            if (mesActual === _mesSiguiente(estado.ultimoMes)) mesesSeguidos++;
            else mesesSeguidos = 1;
        }

        if (!estado.ultimoReclamo) {
            diasSeguidos = 1;
        } else {
            const diff = _diffDias(estado.ultimoReclamo.slice(0, 10), hoy);
            if (diff === 1) diasSeguidos++;
            else if (diff > 1) diasSeguidos = 1;
        }

        return { mesesSeguidos, diasSeguidos };
    }

    // ------------------------------------------------------------
    //  Reclamar (con doble protección)
    // ------------------------------------------------------------
    async function reclamar() {
        if (_reclamando) throw new Error('Ya se está procesando…');

        const c   = _cuenta();
        const bd  = _bd();
        const api = _api();
        if (!c || !bd || !api) throw new Error('Necesitás una cuenta.');

        _reclamando = true;

        try {
            const ruta = _ruta(c.codigo);

            // 1. Lectura FRESH (salta el caché de 5min)
            const estadoFresh = await bd.leerArchivoFresh(ruta);
            const estado = _normalizar(estadoFresh);

            if (_yaReclamoHoy(estado)) {
                _estadoActual = estado;
                _render();
                throw new Error('Ya reclamaste tu regalo hoy.');
            }

            const nuevos = _proximoEstado(estado);
            const recompensa = _recompensaPorMes(nuevos.mesesSeguidos);

            // 2. Mutador ATÓMICO: re-verifica dentro y escribe con merge real
            let muto = false;
            await bd.actualizarArchivo(ruta, (actual) => {
                actual = _normalizar(actual);
                if (_yaReclamoHoy(actual)) {
                    throw new Error('YA_RECLAMADO');
                }
                muto = true;
                return {
                    version: 1,
                    ultimoReclamo: new Date().toISOString(),
                    ultimoMes: _mesChile(),
                    mesesSeguidos: nuevos.mesesSeguidos,
                    diasSeguidos: nuevos.diasSeguidos,
                    totalReclamado: (actual.totalReclamado || 0) + recompensa
                };
            });

            if (!muto) {
                _estadoActual = await bd.leerArchivoFresh(ruta);
                _render();
                throw new Error('Ya reclamaste tu regalo hoy.');
            }

            // 3. Monedas (ya está marcado el reclamo → no hay riesgo de doble canje)
            try {
                await api.canjear(
                    'gift',
                    'racha',
                    `Regalo diario · racha ${nuevos.diasSeguidos}d · mes ${nuevos.mesesSeguidos}`,
                    recompensa
                );
            } catch (e) {
                console.warn('[Racha] No se pudieron acreditar las monedas:', e);
            }

            _estadoActual = _normalizar(await bd.leerArchivoFresh(ruta));
            _render();
            return { recompensa };

        } finally {
            _reclamando = false;
        }
    }

    // ------------------------------------------------------------
    //  Render
    // ------------------------------------------------------------
    function _detenerCountdown() {
        if (_countdownTimer) {
            clearInterval(_countdownTimer);
            _countdownTimer = null;
        }
    }

    function _arrancarCountdown() {
        _detenerCountdown();
        const el = document.getElementById('rachaCountdown');
        if (!el) return;
        const tick = () => {
            const ms = _msHastaProximaMedianocheChile();
            const elNow = document.getElementById('rachaCountdown');
            if (elNow) elNow.textContent = _fmtCuenta(ms);
            if (ms <= 1000) {
                // Cambió el día: recargar para habilitar el botón
                _detenerCountdown();
                recargar();
            }
        };
        tick();
        _countdownTimer = setInterval(tick, 1000);
    }

    function _render() {
        const seccion = document.getElementById('welcomeRachaSection');
        const card    = document.getElementById('rachaCard');
        const badge   = document.getElementById('rachaBadge');
        if (!seccion || !card) return;

        if (!_cuenta()) {
            seccion.style.display = 'none';
            _detenerCountdown();
            return;
        }

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
                ${reclamadoHoy ? `
                    <div class="racha-countdown">
                        <i data-lucide="timer"></i>
                        <span>Próximo regalo en</span>
                        <strong id="rachaCountdown">00:00:00</strong>
                    </div>
                ` : ''}
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

        if (reclamadoHoy) {
            _arrancarCountdown();
        } else {
            _detenerCountdown();
        }

        const btn = document.getElementById('rachaBtnReclamar');
        if (btn) {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                btn.disabled = true;
                const html = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Reclamando…';
                if (window.lucide) window.lucide.createIcons();
                try {
                    await reclamar();
                } catch (e) {
                    alert('❌ ' + (e.message || 'Error al reclamar'));
                    btn.disabled = false;
                    btn.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        }
    }

    async function recargar() {
        const c = _cuenta();
        const bd = _bd();
        if (!c || !bd || !bd.estaConectado()) {
            _estadoActual = null;
            _render();
            return;
        }
        try {
            const data = await bd.leerArchivoFresh(_ruta(c.codigo));
            _estadoActual = _normalizar(data);
        } catch (e) {
            _estadoActual = _normalizar(null);
        }
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
