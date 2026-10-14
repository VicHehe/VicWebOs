// ============================================================
//  PubliCall.js — Teléfono público con PeerJS
//  ------------------------------------------------------------
//  · Llamadas PÚBLICAS. Cualquiera de la comunidad puede unirse.
//  · Máx. 4 participantes por llamada.
//  · Se paga por adelantado: 15m = 10min, +15m = +5min.
//  · NO reemplaza a SillyCalls (que es privado y con video).
//  · Solo audio. Sin chat. Sin transferir llamada.
//  · Múltiples llamadas simultáneas (cada una con su propio id).
//
//  Archivo compartido:
//      app/publi-call/llamadas.json
// ============================================================

(function () {
    'use strict';

    const ARCHIVO = 'app/publi-call/llamadas.json';
    const MAX_PARTICIPANTES = 4;
    const POLL_MS = 3000;

    // 15m = 10min · 30m = 15min · 45m = 20min
    // 60m = 25min · 75m = 30min · 90m = 35min
    const DURACIONES = [
        { monedas: 15, minutos: 10 },
        { monedas: 30, minutos: 15 },
        { monedas: 45, minutos: 20 },
        { monedas: 60, minutos: 25 },
        { monedas: 75, minutos: 30 },
        { monedas: 90, minutos: 35 }
    ];

    let _llamadas = [];
    let _pollTimer = null;
    let _timerTimer = null;
    let _enCurso = false;
    let _etag = null;

    let _sesion = null;
    // { callId, peer, localStream, remotos: Map<codigo, {call, audio}>, mutado: bool }

    const _cuenta = () => window.cuentaActual || null;
    const _bd     = () => window.ConfigBD || null;
    const _api    = () => window.__vicwebos || null;

    // ------------------------------------------------------------
    //  Utilidades
    // ------------------------------------------------------------
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _id(prefix) {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    }

    function _peerId(callId, codigo) {
        return `vwopc-${callId}-${codigo}`.toLowerCase();
    }

    function _fmtTiempo(seg) {
        if (!isFinite(seg) || seg < 0) seg = 0;
        const m = Math.floor(seg / 60);
        const s = Math.floor(seg % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function _normalizar(data) {
        if (!data || typeof data !== 'object') return { version: 1, llamadas: [] };
        if (!Array.isArray(data.llamadas)) data.llamadas = [];
        return data;
    }

    // ------------------------------------------------------------
    //  Lectura con ETag (para polling barato)
    // ------------------------------------------------------------
    async function _leerConETag() {
        const com = (typeof window.obtenerComunidadActiva === 'function')
            ? window.obtenerComunidadActiva() : null;
        if (!com || !com.githubToken || !com.githubOwner || !com.githubRepo) {
            return { cambio: false };
        }
        const url = `https://api.github.com/repos/${com.githubOwner}/${com.githubRepo}/contents/${ARCHIVO}`;
        const headers = {
            'Authorization': `Bearer ${com.githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (_etag) headers['If-None-Match'] = _etag;

        try {
            const res = await fetch(url, { headers });
            if (res.status === 304) return { cambio: false };
            if (res.status === 404) { _etag = null; return { cambio: true, data: null }; }
            if (!res.ok) return { cambio: false };

            const nuevoEtag = res.headers.get('ETag');
            if (nuevoEtag) _etag = nuevoEtag;

            const json = await res.json();
            const txt = decodeURIComponent(escape(atob(json.content)));
            return { cambio: true, data: JSON.parse(txt) };
        } catch (e) {
            return { cambio: false };
        }
    }

    async function _leerLlamadas(fresh) {
        const bd = _bd();
        if (!bd || !bd.estaConectado()) return [];
        try {
            const data = fresh
                ? await bd.leerArchivoFresh(ARCHIVO)
                : await bd.leerArchivo(ARCHIVO);
            return _normalizar(data).llamadas;
        } catch (e) { return []; }
    }

    async function _mutar(mutador) {
        const bd = _bd();
        if (!bd) throw new Error('ConfigBD no disponible.');
        const res = await bd.actualizarArchivo(ARCHIVO, (actual) => {
            if (!actual || typeof actual !== 'object') actual = { version: 1, llamadas: [] };
            if (!Array.isArray(actual.llamadas)) actual.llamadas = [];
            actual = mutador(actual);
            actual.actualizado = new Date().toISOString();
            return actual;
        });
        _etag = null;
        return res.llamadas || [];
    }

    // ------------------------------------------------------------
    //  Limpieza de llamadas caducadas / vacías
    // ------------------------------------------------------------
    function _limpiar(actuales) {
        const ahora = Date.now();
        return (actuales || []).filter(ll => {
            if (!ll) return false;
            const exp = new Date(ll.expira).getTime();
            if (!isFinite(exp) || exp <= ahora) return false;
            const activos = (ll.participantes || []).filter(p => p && p.codigo);
            return activos.length > 0;
        });
    }

    async function _purgarVencidas() {
        if (!_bd() || !_bd().estaConectado()) return;
        const actuales = await _leerLlamadas(false);
        const limpias = _limpiar(actuales);
        if (limpias.length !== actuales.length) {
            try {
                await _mutar((d) => {
                    d.llamadas = limpias;
                    return d;
                });
            } catch (e) { /* silencioso */ }
        }
    }

    // ------------------------------------------------------------
    //  Crear llamada
    // ------------------------------------------------------------
    async function _crearYUnirme(duracion) {
        const c = _cuenta();
        const api = _api();
        if (!c || !api) throw new Error('Necesitás una cuenta.');

        const monedas = api.obtenerMonedas ? api.obtenerMonedas() : 0;
        if (monedas < duracion.monedas) {
            throw new Error(`Te faltan ${duracion.monedas - monedas} monedas.`);
        }

        const callId = _id('call');
        const expira = new Date(Date.now() + duracion.minutos * 60000).toISOString();
        const miCodigo = c.codigo;
        const miNombre = c.nombre || miCodigo;

        // Cobrar
        await api.gastoBoleta(
            'phone-call',
            'publi-call',
            `Llamada pública de ${duracion.minutos} min`,
            duracion.monedas
        );

        // Registrar la llamada
        const nueva = {
            id: callId,
            titulo: `Llamada de ${miNombre}`,
            creador: miCodigo,
            creado: new Date().toISOString(),
            expira: expira,
            duracionMin: duracion.minutos,
            participantes: []
        };

        try {
            await _mutar((d) => {
                d.llamadas.push(nueva);
                return d;
            });
        } catch (e) {
            throw new Error('No se pudo registrar la llamada en el servidor.');
        }

        return callId;
    }

    // ------------------------------------------------------------
    //  Unirse a llamada
    // ------------------------------------------------------------
    async function _registrarme(callId) {
        const c = _cuenta();
        if (!c) throw new Error('Necesitás una cuenta.');

        await _mutar((d) => {
            const ll = d.llamadas.find(x => x.id === callId);
            if (!ll) throw new Error('Llamada no encontrada.');
            if (!Array.isArray(ll.participantes)) ll.participantes = [];

            const yaEsta = ll.participantes.find(p => p.codigo === c.codigo);
            if (yaEsta) return d;

            if (ll.participantes.length >= MAX_PARTICIPANTES) {
                throw new Error('La llamada está llena (máx 4).');
            }

            ll.participantes.push({
                codigo: c.codigo,
                nombre: c.nombre || c.codigo,
                unido: new Date().toISOString()
            });
            return d;
        });
    }

    async function _desregistrarme(callId) {
        const c = _cuenta();
        if (!c) return;
        try {
            await _mutar((d) => {
                const ll = d.llamadas.find(x => x.id === callId);
                if (!ll) return d;
                ll.participantes = (ll.participantes || []).filter(p => p.codigo !== c.codigo);
                if (ll.participantes.length === 0) {
                    d.llamadas = d.llamadas.filter(x => x.id !== callId);
                }
                return d;
            });
        } catch (e) { /* silencioso */ }
    }

    // ------------------------------------------------------------
    //  Sesión PeerJS (mesh)
    // ------------------------------------------------------------
    async function _iniciarSesionPeer(callId) {
        const c = _cuenta();
        if (!c) throw new Error('Necesitás una cuenta.');
        if (!window.Peer) throw new Error('PeerJS no está cargado.');

        // Pedir micrófono
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (e) {
            throw new Error('No se pudo acceder al micrófono. Revisá los permisos.');
        }

        const myPeerId = _peerId(callId, c.codigo);
        const peer = new Peer(myPeerId, { debug: 0 });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                try { peer.destroy(); } catch (e) {}
                stream.getTracks().forEach(t => t.stop());
                reject(new Error('PeerJS tardó demasiado en conectar.'));
            }, 12000);

            peer.on('open', () => {
                clearTimeout(timeout);
                _sesion = {
                    callId,
                    peer,
                    localStream: stream,
                    remotos: new Map(),
                    mutado: false,
                    miCodigo: c.codigo
                };
                _configurarPeer();
                resolve(_sesion);
            });

            peer.on('error', (err) => {
                console.warn('[PubliCall] PeerJS error:', err);
                clearTimeout(timeout);
                if (!_sesion) {
                    try { peer.destroy(); } catch (e) {}
                    stream.getTracks().forEach(t => t.stop());
                    reject(new Error(err.message || 'Error de conexión P2P.'));
                }
            });
        });
    }

    function _configurarPeer() {
        if (!_sesion) return;
        const { peer, localStream } = _sesion;

        peer.on('call', (call) => {
            // Alguien nos llama. Contestamos con nuestro micrófono.
            try {
                call.answer(localStream);
            } catch (e) {
                console.warn('[PubliCall] Error al contestar:', e);
                return;
            }
            const codigoRemoto = _codigoDesdePeerId(call.peer);
            if (codigoRemoto) _agregarRemoto(codigoRemoto, call);
        });
    }

    function _codigoDesdePeerId(peerId) {
        if (!_sesion) return null;
        const prefijo = `vwopc-${_sesion.callId}-`;
        if (!peerId.startsWith(prefijo)) return null;
        return peerId.slice(prefijo.length).toUpperCase();
    }

    function _agregarRemoto(codigo, call) {
        if (!_sesion) return;
        if (_sesion.remotos.has(codigo)) return;

        // Crear Audio element para reproducir
        const audio = new Audio();
        audio.autoplay = true;

        call.on('stream', (remoteStream) => {
            audio.srcObject = remoteStream;
        });

        call.on('close', () => {
            audio.srcObject = null;
            _sesion.remotos.delete(codigo);
            _renderParticipantes();
        });

        call.on('error', () => {
            _sesion.remotos.delete(codigo);
            _renderParticipantes();
        });

        _sesion.remotos.set(codigo, { call, audio });
        _renderParticipantes();
    }

    async function _conectarCon(codigoRemoto) {
        if (!_sesion) return;
        if (codigoRemoto === _sesion.miCodigo) return;
        if (_sesion.remotos.has(codigoRemoto)) return;

        // Regla anti-duplicado: solo el código MENOR inicia la llamada.
        if (_sesion.miCodigo > codigoRemoto) return;

        const peerIdRemoto = _peerId(_sesion.callId, codigoRemoto);
        try {
            const call = _sesion.peer.call(peerIdRemoto, _sesion.localStream);
            if (call) _agregarRemoto(codigoRemoto, call);
        } catch (e) {
            console.warn('[PubliCall] No se pudo llamar a', codigoRemoto, e);
        }
    }

    // ------------------------------------------------------------
    //  Sincronización de participantes
    // ------------------------------------------------------------
    async function _sincronizarParticipantes() {
        if (!_sesion) return;
        const callId = _sesion.callId;

        const todas = await _leerLlamadas(true);
        const ll = todas.find(x => x.id === callId);
        if (!ll) {
            // La llamada desapareció (todos salieron o venció)
            _colgar(true);
            return;
        }

        const partes = ll.participantes || [];
        for (const p of partes) {
            if (p.codigo === _sesion.miCodigo) continue;
            if (!_sesion.remotos.has(p.codigo)) {
                await _conectarCon(p.codigo);
            }
        }
    }

    // ------------------------------------------------------------
    //  Unirse / salir
    // ------------------------------------------------------------
    async function unirseALlamada(callId) {
        if (_sesion) throw new Error('Ya estás en una llamada. Colgá primero.');
        const c = _cuenta();
        if (!c) throw new Error('Necesitás una cuenta.');

        // ¿Existe y tiene lugar?
        const todas = await _leerLlamadas(true);
        const ll = todas.find(x => x.id === callId);
        if (!ll) throw new Error('Esta llamada ya no existe.');
        if (new Date(ll.expira).getTime() <= Date.now()) throw new Error('Esta llamada ya venció.');
        const partes = ll.participantes || [];
        if (partes.length >= MAX_PARTICIPANTES) throw new Error('La llamada está llena (máx 4).');

        // Registrar
        await _registrarme(callId);

        // Iniciar peer
        try {
            await _iniciarSesionPeer(callId);
        } catch (e) {
            await _desregistrarme(callId);
            throw e;
        }

        // Descubrir a los demás y conectar
        await _sincronizarParticipantes();

        _mostrarOverlay(ll);
        _arrancarPolling();
        _arrancarTimer(ll.expira);
    }

    async function crearLlamada(duracion) {
        if (_sesion) throw new Error('Ya estás en una llamada. Colgá primero.');
        const callId = await _crearYUnirme(duracion);
        await _registrarme(callId);
        try {
            await _iniciarSesionPeer(callId);
        } catch (e) {
            await _desregistrarme(callId);
            throw e;
        }
        await _sincronizarParticipantes();
        const todas = await _leerLlamadas(true);
        const ll = todas.find(x => x.id === callId);
        if (ll) {
            _mostrarOverlay(ll);
            _arrancarPolling();
            _arrancarTimer(ll.expira);
        }
    }

    async function _colgar(auto) {
        const ses = _sesion;
        _sesion = null;
        _detenerPolling();
        _detenerTimer();

        // Ocultar overlay
        const ov = document.getElementById('pcallOverlay');
        if (ov) ov.style.display = 'none';

        if (!ses) { _render(); return; }

        // Desregistrar en el JSON
        if (!auto) await _desregistrarme(ses.callId);

        // Cerrar remotos
        ses.remotos.forEach(({ call, audio }) => {
            try { call.close(); } catch (e) {}
            try { audio.srcObject = null; audio.pause(); } catch (e) {}
        });

        // Cerrar peer y stream
        try { ses.peer.destroy(); } catch (e) {}
        if (ses.localStream) {
            ses.localStream.getTracks().forEach(t => t.stop());
        }

        _render();
    }

    // ------------------------------------------------------------
    //  Polling de participantes (solo mientras estoy en llamada)
    // ------------------------------------------------------------
    function _arrancarPolling() {
        _detenerPolling();
        _pollTimer = setInterval(async () => {
            if (document.hidden || !_sesion) return;
            if (_enCurso) return;
            _enCurso = true;
            try {
                await _sincronizarParticipantes();
            } catch (e) { /* silencioso */ }
            finally { _enCurso = false; }
        }, POLL_MS);
    }

    function _detenerPolling() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
        _enCurso = false;
    }

    // ------------------------------------------------------------
    //  Timer de vencimiento
    // ------------------------------------------------------------
    function _arrancarTimer(expiraISO) {
        _detenerTimer();
        const exp = new Date(expiraISO).getTime();
        const tick = () => {
            const restante = exp - Date.now();
            const el = document.getElementById('pcallOverlayTiempo');
            if (el) el.textContent = _fmtTiempo(Math.max(0, restante / 1000));
            if (restante <= 0) {
                _detenerTimer();
                if (_sesion) {
                    alert('⏰ Se acabó el tiempo de la llamada.');
                    _colgar(true);
                }
            }
        };
        tick();
        _timerTimer = setInterval(tick, 1000);
    }

    function _detenerTimer() {
        if (_timerTimer) { clearInterval(_timerTimer); _timerTimer = null; }
    }

    // ------------------------------------------------------------
    //  Overlay de llamada
    // ------------------------------------------------------------
    function _mostrarOverlay(ll) {
        const ov = document.getElementById('pcallOverlay');
        const tit = document.getElementById('pcallOverlayTitulo');
        const sub = document.getElementById('pcallOverlaySub');
        if (!ov) return;

        if (tit) tit.textContent = ll.titulo || 'Llamada pública';
        if (sub) sub.textContent = `${ll.participantes.length}/${MAX_PARTICIPANTES} participantes`;

        ov.style.display = 'flex';
        _renderParticipantes();
        if (window.lucide) window.lucide.createIcons();
    }

    async function _renderParticipantes() {
        const cont = document.getElementById('pcallParticipantes');
        if (!cont || !_sesion) return;

        const c = _cuenta();
        if (!c) return;

        const todas = await _leerLlamadas(false);
        const ll = todas.find(x => x.id === _sesion.callId);
        const partes = ll ? (ll.participantes || []) : [];

        // Asegurar que yo estoy listado
        if (!partes.some(p => p.codigo === c.codigo)) {
            partes.push({ codigo: c.codigo, nombre: c.nombre || c.codigo });
        }

        cont.innerHTML = partes.map(p => {
            const propio = p.codigo === c.codigo;
            const conectado = propio || _sesion.remotos.has(p.codigo);
            return `
                <div class="pcall-participante ${propio ? 'propio' : ''}">
                    <div class="pcall-participante-avatar">
                        ${_escapar((p.nombre || p.codigo).charAt(0).toUpperCase())}
                    </div>
                    <div class="pcall-participante-nombre">
                        ${_escapar(p.nombre || p.codigo)}${propio ? ' (vos)' : ''}
                    </div>
                    <div class="pcall-participante-estado">
                        <i data-lucide="${conectado ? 'wifi' : 'loader-2'}"></i>
                        ${conectado ? 'Conectado' : 'Conectando…'}
                    </div>
                </div>
            `;
        }).join('');

        // Subtítulo actualizado
        const sub = document.getElementById('pcallOverlaySub');
        if (sub) sub.textContent = `${partes.length}/${MAX_PARTICIPANTES} participantes`;

        if (window.lucide) window.lucide.createIcons();
    }

    function _toggleMute() {
        if (!_sesion) return;
        _sesion.mutado = !_sesion.mutado;
        _sesion.localStream.getAudioTracks().forEach(t => { t.enabled = !_sesion.mutado; });

        const btn = document.getElementById('pcallBtnMute');
        if (btn) {
            btn.classList.toggle('muteado', _sesion.mutado);
            btn.innerHTML = `
                <i data-lucide="${_sesion.mutado ? 'mic-off' : 'mic'}"></i>
                <span>${_sesion.mutado ? 'Activar mic' : 'Mutear'}</span>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // ------------------------------------------------------------
    //  Render del lobby
    // ------------------------------------------------------------
    async function _render() {
        const seccion = document.getElementById('welcomePubliCallSection');
        const cont = document.getElementById('pcallLista');
        if (!seccion || !cont) return;

        if (!_cuenta()) { seccion.style.display = 'none'; return; }
        seccion.style.display = 'flex';

        // Purga vencidas (una vez por render, de forma silenciosa)
        _purgarVencidas().catch(() => {});

        const todas = await _leerLlamadas(false);
        const vivas = _limpiar(todas);

        const c = _cuenta();
        const yaEstoy = !!_sesion;

        if (vivas.length === 0) {
            cont.innerHTML = `
                <div class="pcall-vacio">
                    <i data-lucide="phone-off"></i>
                    <span>No hay llamadas activas. ¡Sé el primero en alzar el tubo!</span>
                </div>`;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        cont.innerHTML = vivas.map(ll => {
            const partes = ll.participantes || [];
            const llena = partes.length >= MAX_PARTICIPANTES;
            const yaDentro = partes.some(p => p.codigo === c.codigo);

            let btnHTML;
            if (yaDentro) {
                btnHTML = `<button class="pcall-btn-unirse" disabled title="Ya estás en esta llamada">
                    <i data-lucide="check"></i> Dentro
                </button>`;
            } else if (yaEstoy) {
                btnHTML = `<button class="pcall-btn-unirse" disabled title="Ya estás en otra llamada">
                    <i data-lucide="lock"></i> Ocupado
                </button>`;
            } else if (llena) {
                btnHTML = `<button class="pcall-btn-unirse" disabled title="Llamada llena">
                    <i data-lucide="lock"></i> Llena
                </button>`;
            } else {
                btnHTML = `<button class="pcall-btn-unirse" data-callid="${_escapar(ll.id)}">
                    <i data-lucide="phone"></i> Unirse
                </button>`;
            }

            return `
                <div class="pcall-card">
                    <div class="pcall-icono"><i data-lucide="phone-call"></i></div>
                    <div class="pcall-info">
                        <div class="pcall-titulo">${_escapar(ll.titulo || 'Llamada pública')}</div>
                        <div class="pcall-meta">
                            <span><i data-lucide="users"></i> ${partes.length}/${MAX_PARTICIPANTES}</span>
                            <span><i data-lucide="clock"></i> ${ll.duracionMin}min</span>
                        </div>
                    </div>
                    ${btnHTML}
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        cont.querySelectorAll('.pcall-btn-unirse[data-callid]').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                const html = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
                if (window.lucide) window.lucide.createIcons();
                try {
                    await unirseALlamada(btn.dataset.callid);
                } catch (e) {
                    alert('❌ ' + (e.message || 'No se pudo unir a la llamada'));
                    btn.disabled = false;
                    btn.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        });
    }

    // ------------------------------------------------------------
    //  Modal de creación
    // ------------------------------------------------------------
    function _abrirModalNueva() {
        const modal = document.getElementById('pcallModalNueva');
        const grid = document.getElementById('pcallDuraciones');
        if (!modal || !grid) return;

        const api = _api();
        const monedas = api && api.obtenerMonedas ? api.obtenerMonedas() : 0;

        grid.innerHTML = DURACIONES.map(d => {
            const puede = monedas >= d.monedas;
            return `
                <button class="pcall-duracion" data-monedas="${d.monedas}" data-minutos="${d.minutos}"
                        ${puede ? '' : 'disabled title="Te faltan ' + (d.monedas - monedas) + ' monedas"'}>
                    <div class="pcall-duracion-tiempo">${d.minutos} min</div>
                    <div class="pcall-duracion-costo">
                        <i data-lucide="coins"></i> ${d.monedas}
                    </div>
                </button>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        let elegida = null;
        grid.querySelectorAll('.pcall-duracion:not(:disabled)').forEach(b => {
            b.addEventListener('click', () => {
                grid.querySelectorAll('.pcall-duracion').forEach(x => x.classList.remove('elegida'));
                b.classList.add('elegida');
                elegida = {
                    monedas: Number(b.dataset.monedas),
                    minutos: Number(b.dataset.minutos)
                };
            });
        });

        modal.style.display = 'flex';

        // Confirmación implícita: doble click sobre uno
        grid.querySelectorAll('.pcall-duracion:not(:disabled)').forEach(b => {
            b.addEventListener('dblclick', () => b.click());
        });

        // Auto-confirmar al elegir (más simple)
        grid.querySelectorAll('.pcall-duracion:not(:disabled)').forEach(b => {
            b.addEventListener('click', async () => {
                if (!elegida) return;
                // Si ya estaba elegido este mismo, crear
                if (b.classList.contains('elegida')) {
                    // Esperar un tick por si es doble click
                    if (b.dataset._confirm === '1') return;
                    b.dataset._confirm = '1';
                    try {
                        modal.style.display = 'none';
                        await crearLlamada({
                            monedas: Number(b.dataset.monedas),
                            minutos: Number(b.dataset.minutos)
                        });
                    } catch (e) {
                        alert('❌ ' + (e.message || 'No se pudo crear'));
                        b.dataset._confirm = '0';
                    }
                }
            });
        });

        // Botón: crear directamente al elegir (un solo click)
        // Lo dejamos así: click selecciona, y si ya está seleccionado, crea.
        // Pero mejor UX: un segundo click en el mismo botón.
    }

    // ------------------------------------------------------------
    //  Wiring + Init
    // ------------------------------------------------------------
    function _conectarEventos() {
        const btnNueva = document.getElementById('btnNuevaLlamada');
        const modal = document.getElementById('pcallModalNueva');
        const btnCerrar = document.getElementById('pcallNuevaCerrar');
        const btnCancel = document.getElementById('pcallNuevaCancelar');

        if (btnNueva) {
            btnNueva.addEventListener('click', () => {
                if (_sesion) {
                    alert('Ya estás en una llamada. Colgá primero.');
                    return;
                }
                _abrirModalNueva();
            });
        }
        if (btnCerrar) btnCerrar.addEventListener('click', () => { modal.style.display = 'none'; });
        if (btnCancel) btnCancel.addEventListener('click', () => { modal.style.display = 'none'; });
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }

        const btnMute = document.getElementById('pcallBtnMute');
        const btnColgar = document.getElementById('pcallBtnColgar');
        if (btnMute) btnMute.addEventListener('click', _toggleMute);
        if (btnColgar) btnColgar.addEventListener('click', () => _colgar(false));
    }

    // Polling global (no de participantes): refresca la LISTA de llamadas
    function _arrancarPollLista() {
        setInterval(async () => {
            if (document.hidden) return;
            const seccion = document.getElementById('welcomePubliCallSection');
            if (!seccion || seccion.style.display === 'none') return;
            if (_sesion) return;   // Si estoy en llamada, no refresco la lista
            try {
                const res = await _leerConETag();
                if (res.cambio) {
                    _llamadas = _normalizar(res.data).llamadas;
                    _render();
                }
            } catch (e) { /* silencioso */ }
        }, POLL_MS);
    }

    window.addEventListener('vicwebos:sesion', () => {
        if (_sesion) _colgar(true);
        _etag = null;
        _render();
    });
    window.addEventListener('vicwebos:comunidad', () => {
        if (_sesion) _colgar(true);
        _etag = null;
        _render();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && !_sesion) _render();
    });

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            _conectarEventos();
            _render();
            _arrancarPollLista();
        }, 600);
    });

    window.PubliCall = {
        recargar: _render,
        crearLlamada,
        unirseALlamada
    };

})();
