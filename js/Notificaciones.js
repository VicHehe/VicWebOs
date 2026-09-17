// ============================================================
//  Notificaciones.js — Sistema de notificaciones globales
//  ------------------------------------------------------------
//  Cada usuario recibe sus notis en un archivo compartido:
//      CuentasNotificaciones.json
//
//  Cualquier app puede enviar:
//      const api = window.parent.__vicwebos;
//      await api.enviarNotificacion('calculadora', 'Has ganado 5 monedas', '1234A');
//      await api.enviarNotificacion('sistema', 'Bienvenido', null); // a mí mismo
//
//  Sin WebSocket: se relee cada POLL_MS con visibilitychange.
//  El badge del header se actualiza solo.
// ============================================================

(function () {
    'use strict';

    const ARCHIVO          = 'CuentasNotificaciones.json';
    const POLL_MS          = 20000;   // 20s
    const MAX_POR_USUARIO  = 100;

    let notis        = [];
    let pollTimer    = null;
    let panelAbierto = false;

    // ---------- Utilidades ----------
    function bd() {
        if (!window.ConfigBD) throw new Error('ConfigBD no disponible.');
        return window.ConfigBD;
    }

    function miCodigo() {
        return (window.cuentaActual && window.cuentaActual.codigo) || null;
    }

    function estructuraVacia() {
        return { version: 1, actualizado: new Date().toISOString(), usuarios: {} };
    }

    function normalizar(data) {
        if (!data || typeof data !== 'object') return estructuraVacia();
        if (!data.usuarios || typeof data.usuarios !== 'object') data.usuarios = {};
        return data;
    }

    function escapeHTML(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function tiempoRelativo(iso) {
        const d = new Date(iso);
        const diff = Math.floor((Date.now() - d.getTime()) / 1000);
        if (diff < 30)   return 'ahora';
        if (diff < 60)   return `hace ${diff}s`;
        const min = Math.floor(diff / 60);
        if (min < 60)    return `hace ${min}m`;
        const h = Math.floor(min / 60);
        if (h < 24)      return `hace ${h}h`;
        const dias = Math.floor(h / 24);
        if (dias < 7)    return `hace ${dias}d`;
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    }

    function iconoFuente(fuente) {
        const f = String(fuente || '').toLowerCase();
        const mapa = {
            calculadora:      'calculator',
            chequera:         'wallet',
            'stor-he':        'store',
            sistema:          'bell',
            logro:            'trophy',
            logros:           'trophy',
            dados:            'dice-5',
            'reloj-mundial':  'globe-2',
            calendario:       'calendar',
            muro:             'message-square',
            notas:            'sticky-note'
        };
        return mapa[f] || 'bell';
    }

    // ---------- Carga ----------
    async function leerTodo() {
        try {
            const raw = await bd().leerArchivo(ARCHIVO);
            return normalizar(raw);
        } catch (e) {
            return estructuraVacia();
        }
    }

    async function guardarTodo(data, intentos = 3) {
        let actual = data;
        for (let i = 0; i < intentos; i++) {
            try {
                actual.actualizado = new Date().toISOString();
                await bd().escribirArchivo(ARCHIVO, actual);
                return actual;
            } catch (e) {
                if (i === intentos - 1) throw e;
                await new Promise(r => setTimeout(r, 400 * (i + 1)));
                // Releer y reaplicar por si otro escribió
                actual = await leerTodo();
                // Reaplicar la modificación original sobre la versión fresca
                if (data.__op) {
                    // (no usamos este camino; se maneja en cada función)
                }
            }
        }
    }

    // ---------- Recargar ----------
    async function recargar() {
        const codigo = miCodigo();
        if (!codigo) {
            notis = [];
            renderBadge();
            if (panelAbierto) renderPanel();
            return;
        }
        const data = await leerTodo();
        notis = Array.isArray(data.usuarios[codigo]) ? data.usuarios[codigo] : [];
        notis.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        renderBadge();
        if (panelAbierto) renderPanel();
    }

    // ---------- Enviar ----------
    async function enviar(fuente, texto, usuarioDestino) {
        const destino = (usuarioDestino || '').toString().trim().toUpperCase() || miCodigo();
        if (!destino) throw new Error('No hay usuario destino.');
        if (!texto || !String(texto).trim()) throw new Error('El texto es obligatorio.');

        const noti = {
            id:     'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            fuente: String(fuente || 'sistema').slice(0, 40),
            texto:  String(texto).slice(0, 300),
            leida:  false,
            fecha:  new Date().toISOString()
        };

        // Reintento con relectura para evitar perder notis en concurrencia
        for (let i = 0; i < 3; i++) {
            try {
                const data = await leerTodo();
                if (!Array.isArray(data.usuarios[destino])) data.usuarios[destino] = [];
                data.usuarios[destino].unshift(noti);
                if (data.usuarios[destino].length > MAX_POR_USUARIO) {
                    data.usuarios[destino] = data.usuarios[destino].slice(0, MAX_POR_USUARIO);
                }
                await guardarTodo(data);
                if (destino === miCodigo()) await recargar();
                return noti;
            } catch (e) {
                if (i === 2) throw e;
                await new Promise(r => setTimeout(r, 400 * (i + 1)));
            }
        }
    }

    // ---------- Marcar / borrar ----------
    async function marcarLeida(id) {
        const codigo = miCodigo();
        if (!codigo) return;
        const data = await leerTodo();
        const arr = data.usuarios[codigo] || [];
        const n = arr.find(x => x.id === id);
        if (!n || n.leida) return;
        n.leida = true;
        await guardarTodo(data);
        await recargar();
    }

    async function borrar(id) {
        const codigo = miCodigo();
        if (!codigo) return;
        const data = await leerTodo();
        data.usuarios[codigo] = (data.usuarios[codigo] || []).filter(x => x.id !== id);
        await guardarTodo(data);
        await recargar();
    }

    async function borrarTodas() {
        const codigo = miCodigo();
        if (!codigo) return;
        const data = await leerTodo();
        data.usuarios[codigo] = [];
        await guardarTodo(data);
        await recargar();
    }

    async function borrarLeidas() {
        const codigo = miCodigo();
        if (!codigo) return;
        const data = await leerTodo();
        data.usuarios[codigo] = (data.usuarios[codigo] || []).filter(n => !n.leida);
        await guardarTodo(data);
        await recargar();
    }

    // ---------- Render ----------
    function renderBadge() {
        const badge = document.getElementById('notiBadge');
        const btn   = document.getElementById('btnNotificaciones');
        if (!badge || !btn) return;

        const noLeidas = notis.filter(n => !n.leida).length;
        if (noLeidas === 0) {
            badge.style.display = 'none';
            btn.classList.remove('tiene-no-leidas');
        } else {
            badge.style.display = 'flex';
            badge.textContent = noLeidas > 9 ? '9+' : String(noLeidas);
            btn.classList.add('tiene-no-leidas');
        }
    }

    function renderPanel() {
        const panel = document.getElementById('notiPanel');
        if (!panel) return;

        if (notis.length === 0) {
            panel.innerHTML = `
                <div class="noti-header">
                    <span class="noti-titulo">Notificaciones</span>
                    <button class="noti-cerrar" id="notiCerrar" title="Cerrar">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="noti-vacio">
                    <i data-lucide="bell-off"></i>
                    <p>No tienes notificaciones.</p>
                </div>
            `;
        } else {
            const hayLeidas   = notis.some(n => n.leida);
            const hayNoLeidas = notis.some(n => !n.leida);

            const lista = notis.map(n => `
                <div class="noti-item ${n.leida ? '' : 'no-leida'}" data-id="${n.id}">
                    <div class="noti-icono"><i data-lucide="${iconoFuente(n.fuente)}"></i></div>
                    <div class="noti-cuerpo">
                        <div class="noti-meta">
                            <span class="noti-fuente">${escapeHTML(n.fuente)}</span>
                            <span class="noti-tiempo">${tiempoRelativo(n.fecha)}</span>
                        </div>
                        <div class="noti-texto">${escapeHTML(n.texto)}</div>
                    </div>
                    <button class="noti-borrar" data-borrar="${n.id}" title="Borrar">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            `).join('');

            panel.innerHTML = `
                <div class="noti-header">
                    <span class="noti-titulo">Notificaciones</span>
                    <div class="noti-acciones">
                        ${hayNoLeidas ? `
                            <button class="noti-accion" id="notiMarcarTodas" title="Marcar todas como leídas">
                                <i data-lucide="check-check"></i>
                            </button>
                        ` : ''}
                        ${hayLeidas ? `
                            <button class="noti-accion" id="notiLimpiarLeidas" title="Borrar leídas">
                                <i data-lucide="eraser"></i>
                            </button>
                        ` : ''}
                        <button class="noti-accion" id="notiLimpiarTodas" title="Borrar todas">
                            <i data-lucide="trash-2"></i>
                        </button>
                        <button class="noti-cerrar" id="notiCerrar" title="Cerrar">
                            <i data-lucide="x"></i>
                        </button>
                    </div>
                </div>
                <div class="noti-lista">${lista}</div>
            `;
        }

        if (window.lucide) window.lucide.createIcons();

        // --- Eventos del panel ---
        panel.querySelector('#notiCerrar')?.addEventListener('click', cerrarPanel);

        panel.querySelector('#notiLimpiarTodas')?.addEventListener('click', async () => {
            if (confirm('¿Borrar todas las notificaciones?')) await borrarTodas();
        });

        panel.querySelector('#notiLimpiarLeidas')?.addEventListener('click', async () => {
            await borrarLeidas();
        });

        panel.querySelector('#notiMarcarTodas')?.addEventListener('click', async () => {
            const codigo = miCodigo();
            if (!codigo) return;
            const data = await leerTodo();
            (data.usuarios[codigo] || []).forEach(n => { n.leida = true; });
            await guardarTodo(data);
            await recargar();
        });

        panel.querySelectorAll('.noti-item').forEach(el => {
            el.addEventListener('click', async (e) => {
                if (e.target.closest('.noti-borrar')) return;
                const id = el.dataset.id;
                const n = notis.find(x => x.id === id);
                if (!n || n.leida) return;
                await marcarLeida(id);
            });
        });

        panel.querySelectorAll('.noti-borrar').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await borrar(btn.dataset.borrar);
            });
        });
    }

    // ---------- Panel abrir/cerrar ----------
    function ajustarTopPanel() {
        const panel  = document.getElementById('notiPanel');
        const header = document.querySelector('.app-header');
        if (!panel || !header) return;
        const h = header.getBoundingClientRect().height;
        panel.style.setProperty('--noti-top', h + 'px');
    }

    function abrirPanel() {
        const panel = document.getElementById('notiPanel');
        if (!panel) return;
        ajustarTopPanel();
        panel.classList.add('show');
        panelAbierto = true;
        renderPanel();
    }

    function cerrarPanel() {
        const panel = document.getElementById('notiPanel');
        if (!panel) return;
        panel.classList.remove('show');
        panelAbierto = false;
    }

    function togglePanel() {
        if (panelAbierto) cerrarPanel();
        else abrirPanel();
    }

    // ---------- Polling ----------
    function iniciarPolling() {
        detenerPolling();
        pollTimer = setInterval(() => {
            if (document.hidden) return;
            recargar().catch(() => {});
        }, POLL_MS);
    }

    function detenerPolling() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    // ---------- Init ----------
    function inicializar() {
        const btn   = document.getElementById('btnNotificaciones');
        const panel = document.getElementById('notiPanel');
        if (!btn || !panel) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel();
        });

        document.addEventListener('click', (e) => {
            if (!panelAbierto) return;
            if (panel.contains(e.target)) return;
            if (btn.contains(e.target)) return;
            cerrarPanel();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panelAbierto) cerrarPanel();
        });

        window.addEventListener('resize', () => {
            if (panelAbierto) ajustarTopPanel();
        });

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) recargar().catch(() => {});
        });

        recargar().catch(() => {});
        iniciarPolling();
    }

    // ---------- API pública ----------
    window.Notificaciones = {
        enviar,
        recargar,
        marcarLeida,
        borrar,
        borrarTodas,
        borrarLeidas,
        abrirPanel,
        cerrarPanel,
        togglePanel
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();
