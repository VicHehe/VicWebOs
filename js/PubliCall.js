// ============================================================
//  PubliCall.js — Teléfono público con PeerJS (v2 simplificado)
//  ------------------------------------------------------------
//  · Cada llamada = una entrada en llamadas.json.
//  · El HOST paga por adelantado y usa su CÓDIGO DE USUARIO como
//    peer ID (con prefijo del repo para evitar colisiones).
//  · Los GUESTS no pagan: clickean "Unirse" y listo, sin escribir
//    nada. PeerJS usa el código del host para conectarse.
//  · Máx 4 participantes.
//  · Solo audio. Sin chat. Sin transferencia. Sin video.
//  · Múltiples llamadas simultáneas: cada host tiene su propio ID.
//
//  Estructura de llamadas.json:
//    {
//      version: 1,
//      actualizado: ISO,
//      llamadas: [
//        {
//          hostCodigo: "0308V",
//          hostNombre: "VicHe",
//          iniciada: "ISO",
//          expira: "ISO",
//          duracionMin: 10,
//          participantes: [
//            { codigo: "0308V", nombre: "VicHe", unido: "ISO" }
//          ]
//        }
//      ]
//    }
// ============================================================

(function () {
    'use strict';

    const ARCHIVO = 'app/publi-call/llamadas.json';
    const MAX_PARTICIPANTES = 4;
    const POLL_MS = 3000;

    // Escala: cada +15 monedas sumás +5 minutos.
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
    let _heartbeatTimer = null;
    let _enCurso = false;
    let _etag = null;

    // Sesión activa (yo en llamada)
    let _sesion = null;
    // {
    //   rol: 'host' | 'guest',
    //   hostCodigo,
    //   peer,
    //   localStream,
    //   dataConns: Map<codigo, DataConnection>,
    //   remotos: Map<codigo, { call, audio }>,
    //   mutado: bool,
    //   miCodigo,
    //   expira
    // }

    const _cuenta = () => window.cuentaActual || null;
    const _bd     = () => window.ConfigBD || null;
    const _api    = () => window.__vicwebos || null;

    // ------------------------------------------------------------
    //  Prefijo del peer ID (comunidad + código)
    // ------------------------------------------------------------
    function _slugRepo() {
        try {
            const com = window.obtenerComunidadActiva ? window.obtenerComunidadActiva() : null;
            if (com && com.githubRepo) {
                return String(com.githubRepo).toLowerCase().replace(/[^a-z0-9]/g, '-');
            }
        } catch (e) { /* silencioso */ }
        return 'x';
    }

    function _peerIdDe(codigo) {
        return `vwopc-${_slugRepo()}-${String(codigo).toLowerCase()}`;
    }

    // ------------------------------------------------------------
    //  Utilidades
    // ------------------------------------------------------------
    function _esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    function _viva(ll, ahora) {
        if (!ll || !ll.expira) return false;
        const exp = new Date(ll.expira).getTime();
        if (!isFinite(exp) || exp <= (ahora || Date.now())) return false;
        if (!Array.isArray(ll.participantes) || ll.participantes.length === 0) return false;
        return true;
    }

    function _limpiar(lista) {
        const ahora = Date.now();
        return (lista || []).filter(ll => _viva(ll, ahora));
    }

    // ------------------------------------------------------------
    //  Lectura/escritura del archivo compartido
    // ------------------------------------------------------------
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
        return _normalizar(res).llamadas;
    }

    // ------------------------------------------------------------
    //  Sesión PeerJS
    // ------------------------------------------------------------
    async function _abrirPeer() {
        if (!window.Peer) throw new Error('PeerJS no está cargado.');

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (e) {
            throw new Error('No se pudo acceder al micrófono. Revisá los permisos.');
        }

        const c = _cuenta();
        if (!c) throw new Error('Necesitás una cuenta.');

        const myPeerId = _peerIdDe(c.codigo);

        return new Promise((resolve, reject) => {
            const peer = new Peer(myPeerId, { debug: 0 });
            const timeout = setTimeout(() => {
                try { peer.destroy(); } catch (e) {}
                stream.getTracks().forEach(t => t.stop());
                reject(new Error('PeerJS tardó demasiado en conectar.'));
            }, 12000);

            peer.on('open', () => {
                clearTimeout(timeout);
                resolve({ peer, stream, myPeerId });
            });

            peer.on('error', (err) => {
                clearTimeout(timeout);
                if (err && err.type === 'unavailable-id') {
                    try { peer.destroy(); } catch (e) {}
                    stream.getTracks().forEach(t => t.stop());
                    reject(new Error('Ya hay una sesión tuya abierta. Cerrá la otra pestaña.'));
                    return;
                }
                if (!_sesion) {
                    try { peer.destroy(); } catch (e) {}
                    stream.getTracks().forEach(t => t.stop());
                    reject(new Error(err && err.message ? err.message : 'Error de conexión P2P.'));
                }
            });
        });
    }

    function _configurarPeer() {
        if (!_sesion) return;
        const { peer, localStream } = _sesion;

        // Cuando alguien me llama (media)
        peer.on('call', (call) => {
            try {
                call.answer(localStream);
            } catch (e) {
                return;
            }
            const codigoRemoto = _codigoDesdePeerId(call.peer);
            if (codigoRemoto) _agregarRemoto(codigoRemoto, call);
        });

        // Cuando alguien me abre un data channel
        peer.on('connection', (conn) => {
            _manejarDataEntrante(conn);
        });
    }

    function _codigoDesdePeerId(peerId) {
        const prefijo = `vwopc-${_slugRepo()}-`;
        if (!peerId.startsWith(prefijo)) return null;
        return peerId.slice(prefijo.length).toUpperCase();
    }

    function _manejarDataEntrante(conn) {
        if (!_sesion) return;

        conn.on('open', () => {
            const codigoRemoto = _codigoDesdePeerId(conn.peer);
            if (!codigoRemoto) return;
            if (!_sesion.dataConns.has(codigoRemoto)) {
                _sesion.dataConns.set(codigoRemoto, conn);
            }

            // Si soy host, le paso la lista de participantes
            if (_sesion.rol === 'host') {
                const llamada = _llamadas.find(l => l.hostCodigo === _sesion.miCodigo);
                const partes = llamada ? llamada.participantes.map(p => p.codigo) : [];
                try {
                    conn.send({ type: 'participantes', codigos: partes });
                } catch (e) { /* silencioso */ }
            }
        });

        conn.on('data', (msg) => _manejarData(msg, conn));
        conn.on('close', () => {
            const codigoRemoto = _codigoDesdePeerId(conn.peer);
            if (codigoRemoto) {
                _sesion.dataConns.delete(codigoRemoto);
            }
        });
        conn.on('error', () => {
            const codigoRemoto = _codigoDesdePeerId(conn.peer);
            if (codigoRemoto) _sesion.dataConns.delete(codigoRemoto);
        });
    }

    async function _manejarData(msg, conn) {
        if (!_sesion || !msg) return;

        if (msg.type === 'participantes' && Array.isArray(msg.codigos)) {
            // El host me dijo quiénes están. Me conecto con todos.
            for (const cod of msg.codigos) {
                if (cod === _sesion.miCodigo) continue;
                await _conectarCon(cod);
            }
        }

        if (msg.type === 'nuevo_participante' && msg.codigo) {
            // El host me avisa que llegó alguien nuevo
            if (msg.codigo !== _sesion.miCodigo) {
                await _conectarCon(msg.codigo);
            }
        }

        if (msg.type === 'host_se_va') {
            _colgarLocal(true);
        }
    }

    function _agregarRemoto(codigo, call) {
        if (!_sesion) return;
        if (_sesion.remotos.has(codigo)) return;

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

        // Regla anti-duplicado: solo el de código MENOR inicia la media call.
        if (_sesion.miCodigo > codigoRemoto) return;

        const peerIdRemoto = _peerIdDe(codigoRemoto);
        try {
            const call = _sesion.peer.call(peerIdRemoto, _sesion.localStream);
            if (call) _agregarRemoto(codigoRemoto, call);
        } catch (e) {
            console.warn('[PubliCall] No se pudo llamar a', codigoRemoto, e);
        }
    }

    // ------------------------------------------------------------
    //  FLUJO: CREAR (host)
    // ------------------------------------------------------------
    async function crearLlamada(duracion) {
        if (_sesion) throw new Error('Ya estás en una llamada. Colgá primero.');

        const c = _cuenta();
        const api = _api();
        if (!c || !api) throw new Error('Necesitás una cuenta.');

        // Validar que no haya una llamada con mi código ya activa
        const actuales = await _leerLlamadas(true);
        const existente = actuales.find(l => l.hostCodigo === c.codigo && _viva(l));
        if (existente) throw new Error('Ya tenés una llamada activa.');

        const monedas = api.obtenerMonedas ? api.obtenerMonedas() : 0;
        if (monedas < duracion.monedas) {
            throw new Error(`Te faltan ${duracion.monedas - monedas} monedas.`);
        }

        // Cobrar
        await api.gastoBoleta(
            'phone-call',
            'publi-call',
            `Llamada pública de ${duracion.minutos} min`,
            duracion.monedas
        );

        const expira = new Date(Date.now() + duracion.minutos * 60000).toISOString();

        // Abrir PeerJS
        let peerInfo;
        try {
            peerInfo = await _abrirPeer();
        } catch (e) {
            // Devolver monedas si falla
            try {
                await api.canjear('phone-call', 'publi-call', 'Reembolso: no se pudo abrir la llamada', duracion.monedas);
            } catch (_) { /* silencioso */ }
            throw e;
        }

        _sesion = {
            rol: 'host',
            hostCodigo: c.codigo,
            peer: peerInfo.peer,
            localStream: peerInfo.stream,
            dataConns: new Map(),
            remotos: new Map(),
            mutado: false,
            miCodigo: c.codigo,
            expira: expira
        };

        _configurarPeer();

        // Escribir la llamada en el archivo
        await _mutar((d) => {
            d.llamadas = _limpiar(d.llamadas);
            d.llamadas.push({
                hostCodigo: c.codigo,
                hostNombre: c.nombre || c.codigo,
                iniciada: new Date().toISOString(),
                expira: expira,
                duracionMin: duracion.minutos,
                participantes: [
                    { codigo: c.codigo, nombre: c.nombre || c.codigo, unido: new Date().toISOString() }
                ]
            });
            return d;
        });

        _llamadas = await _leerLlamadas(true);

        _mostrarOverlay(_llamadas.find(l => l.hostCodigo === c.codigo));
        _arrancarTimers(expira);
        _render();
    }

    // ------------------------------------------------------------
    //  FLUJO: UNIRSE (guest)
    // ------------------------------------------------------------
    async function unirseALlamada(hostCodigo) {
        if (_sesion) throw new Error('Ya estás en una llamada. Colgá primero.');

        const c = _cuenta();
        if (!c) throw new Error('Necesitás una cuenta.');

        const actuales = await _leerLlamadas(true);
        const ll = actuales.find(l => l.hostCodigo === hostCodigo && _viva(l));
        if (!ll) throw new Error('Esta llamada ya no existe.');
        if (ll.participantes.length >= MAX_PARTICIPANTES) throw new Error('La llamada está llena (máx 4).');
        if (ll.participantes.some(p => p.codigo === c.codigo)) throw new Error('Ya estás en esta llamada.');

        // Abrir PeerJS
        const peerInfo = await _abrirPeer();

        _sesion = {
            rol: 'guest',
            hostCodigo: hostCodigo,
            peer: peerInfo.peer,
            localStream: peerInfo.stream,
            dataConns: new Map(),
            remotos: new Map(),
            mutado: false,
            miCodigo: c.codigo,
            expira: ll.expira
        };

        _configurarPeer();

        // Registrarme en el archivo
        try {
            await _mutar((d) => {
                const t = d.llamadas.find(x => x.hostCodigo === hostCodigo);
                if (!t) throw new Error('La llamada ya no existe.');
                if (t.participantes.length >= MAX_PARTICIPANTES) throw new Error('La llamada se llenó.');
                if (t.participantes.some(p => p.codigo === c.codigo)) return d;
                t.participantes.push({
                    codigo: c.codigo,
                    nombre: c.nombre || c.codigo,
                    unido: new Date().toISOString()
                });
                return d;
            });
        } catch (e) {
            _colgarLocal(false);
            throw e;
        }

        // Conectar al host por DataConnection
        try {
            const hostPeerId = _peerIdDe(hostCodigo);
            const conn = _sesion.peer.connect(hostPeerId, { reliable: true });
            _sesion.dataConns.set(hostCodigo, conn);

            conn.on('open', () => {
                // El host ya me va a mandar la lista por _manejarDataEntrante
            });
            conn.on('data', (msg) => _manejarData(msg, conn));
            conn.on('close', () => {
                // Si el host se va, salgo
                if (_sesion && _sesion.rol === 'guest') _colgarLocal(true);
            });
        } catch (e) {
            await _salirDelArchivo();
            _colgarLocal(false);
            throw new Error('No se pudo contactar al host.');
        }

        _llamadas = await _leerLlamadas(true);

        _mostrarOverlay(_llamadas.find(l => l.hostCodigo === hostCodigo));
        _arrancarTimers(ll.expira);
        _render();
    }

    // ------------------------------------------------------------
    //  SALIR
    // ------------------------------------------------------------
    async function _salirDelArchivo() {
        if (!_sesion) return;
        const c = _cuenta();
        if (!c) return;
        const hostCodigo = _sesion.hostCodigo;

        try {
            await _mutar((d) => {
                const t = d.llamadas.find(x => x.hostCodigo === hostCodigo);
                if (!t) return d;
                t.participantes = t.participantes.filter(p => p.codigo !== c.codigo);
                if (t.participantes.length === 0) {
                    d.llamadas = d.llamadas.filter(x => x.hostCodigo !== hostCodigo);
                }
                return d;
            });
        } catch (e) { /* silencioso */ }
    }

    function _colgarLocal(silencioso) {
        const ses = _sesion;
        _sesion = null;
        _detenerTimers();

        const ov = document.getElementById('pcallOverlay');
        if (ov) ov.style.display = 'none';

        if (!ses) { _render(); return; }

        // Avisar a todos por data
        if (ses.rol === 'host') {
            ses.dataConns.forEach(conn => {
                try { conn.send({ type: 'host_se_va' }); } catch (e) {}
            });
        }

        // Cerrar remotos
        ses.remotos.forEach(({ call, audio }) => {
            try { call.close(); } catch (e) {}
            try { audio.srcObject = null; audio.pause(); } catch (e) {}
        });

        // Cerrar data
        ses.dataConns.forEach(conn => {
            try { conn.close(); } catch (e) {}
        });

        try { ses.peer.destroy(); } catch (e) {}
        if (ses.localStream) ses.localStream.getTracks().forEach(t => t.stop());

        if (!silencioso) {
            // Aviso asíncrono al archivo
            Promise.resolve().then(() => _salirDelArchivoCon(ses.hostCodigo, ses.miCodigo));
        }

        _render();
    }

    async function _salirDelArchivoCon(hostCodigo, codigo) {
        try {
            await _mutar((d) => {
                const t = d.llamadas.find(x => x.hostCodigo === hostCodigo);
                if (!t) return d;
                t.participantes = t.participantes.filter(p => p.codigo !== codigo);
                if (t.participantes.length === 0) {
                    d.llamadas = d.llamadas.filter(x => x.hostCodigo !== hostCodigo);
                }
                return d;
            });
            _llamadas = await _leerLlamadas(true);
            _render(_llamadas);
        } catch (e) { /* silencioso */ }
    }

    // ------------------------------------------------------------
    //  TIMERS (expiración + heartbeat + polling)
    // ------------------------------------------------------------
    function _arrancarTimers(expiraISO) {
        _detenerTimers();
        const exp = new Date(expiraISO).getTime();

        const tick = () => {
            const restante = exp - Date.now();
            const el = document.getElementById('pcallOverlayTiempo');
            if (el) el.textContent = _fmtTiempo(Math.max(0, restante / 1000));
            if (restante <= 0) {
                _detenerTimers();
                if (_sesion) {
                    alert('⏰ Se acabó el tiempo de la llamada.');
                    _colgarLocal(false);
                }
            }
        };
        tick();
        _timerTimer = setInterval(tick, 1000);

        // Polling del archivo (solo si soy host o guest, para reaccionar a cambios)
        _pollTimer = setInterval(async () => {
            if (document.hidden || !_sesion) return;
            if (_enCurso) return;
            _enCurso = true;
            try {
                const res = await _leerConETag();
                if (res.cambio) {
                    _llamadas = _normalizar(res.data).llamadas;
                    const mia = _llamadas.find(l => l.hostCodigo === _sesion.hostCodigo);
                    if (!mia || !_viva(mia)) {
                        alert('La llamada se cerró.');
                        _colgarLocal(true);
                    } else {
                        _renderParticipantes();
                    }
                }
            } catch (e) { /* silencioso */ }
            finally { _enCurso = false; }
        }, POLL_MS);
    }

    function _detenerTimers() {
        if (_pollTimer)  { clearInterval(_pollTimer);  _pollTimer = null; }
        if (_timerTimer) { clearInterval(_timerTimer); _timerTimer = null; }
        if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
        _enCurso = false;
    }

    // ------------------------------------------------------------
    //  RENDER: overlay de llamada
    // ------------------------------------------------------------
    function _mostrarOverlay(ll) {
        const ov = document.getElementById('pcallOverlay');
        const tit = document.getElementById('pcallOverlayTitulo');
        const sub = document.getElementById('pcallOverlaySub');
        if (!ov) return;

        if (tit) tit.textContent = `Llamada de ${ll ? (ll.hostNombre || ll.hostCodigo) : '…'}`;
        if (sub) sub.textContent = `${ll ? ll.participantes.length : 0}/${MAX_PARTICIPANTES} participantes`;

        ov.style.display = 'flex';
        _renderParticipantes();
        if (window.lucide) window.lucide.createIcons();
    }

    function _renderParticipantes() {
        const cont = document.getElementById('pcallParticipantes');
        if (!cont || !_sesion) return;

        const c = _cuenta();
        if (!c) return;

        const ll = _llamadas.find(x => x.hostCodigo === _sesion.hostCodigo);
        const partes = ll ? (ll.participantes || []) : [];

        if (!partes.some(p => p.codigo === c.codigo)) {
            partes.push({ codigo: c.codigo, nombre: c.nombre || c.codigo });
        }

        cont.innerHTML = partes.map(p => {
            const propio = p.codigo === c.codigo;
            const conectado = propio || _sesion.remotos.has(p.codigo);
            return `
                <div class="pcall-participante ${propio ? 'propio' : ''}">
                    <div class="pcall-participante-avatar">
                        ${_esc((p.nombre || p.codigo).charAt(0).toUpperCase())}
                    </div>
                    <div class="pcall-participante-nombre">
                        ${_esc(p.nombre || p.codigo)}${propio ? ' (vos)' : ''}
                    </div>
                    <div class="pcall-participante-estado">
                        <i data-lucide="${conectado ? 'wifi' : 'loader-2'}"></i>
                        ${conectado ? 'Conectado' : 'Conectando…'}
                    </div>
                </div>
            `;
        }).join('');

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
    //  RENDER: lobby
    // ------------------------------------------------------------
    async function _render(dataPrecargada) {
        const seccion = document.getElementById('welcomePubliCallSection');
        const cont = document.getElementById('pcallLista');
        if (!seccion || !cont) return;

        if (!_cuenta()) { seccion.style.display = 'none'; return; }
        seccion.style.display = 'flex';

        // Purgar vencidas (silencioso)
        _purgarVencidas().catch(() => {});

        const todas = dataPrecargada || await _leerLlamadas(true);
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
            const soyHost = ll.hostCodigo === c.codigo;

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
                btnHTML = `<button class="pcall-btn-unirse" data-host="${_esc(ll.hostCodigo)}">
                    <i data-lucide="phone"></i> Unirse
                </button>`;
            }

            return `
                <div class="pcall-card">
                    <div class="pcall-icono"><i data-lucide="phone-call"></i></div>
                    <div class="pcall-info">
                        <div class="pcall-titulo">Llamada de ${_esc(ll.hostNombre || ll.hostCodigo)}</div>
                        <div class="pcall-meta">
                            <span><i data-lucide="users"></i> ${partes.length}/${MAX_PARTICIPANTES}</span>
                            <span><i data-lucide="clock"></i> ${ll.duracionMin}min</span>
                            <span><i data-lucide="at-sign"></i> ${_esc(ll.hostCodigo)}</span>
                        </div>
                    </div>
                    ${btnHTML}
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        cont.querySelectorAll('.pcall-btn-unirse[data-host]').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.disabled = true;
                const html = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
                if (window.lucide) window.lucide.createIcons();
                try {
                    await unirseALlamada(btn.dataset.host);
                } catch (e) {
                    alert('❌ ' + (e.message || 'No se pudo unir a la llamada'));
                    btn.disabled = false;
                    btn.innerHTML = html;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        });
    }

    async function _purgarVencidas() {
        const bd = _bd();
        if (!bd || !bd.estaConectado()) return;
        const actuales = await _leerLlamadas(false);
        const limpias = _limpiar(actuales);
        if (limpias.length !== actuales.length) {
            try {
                await _mutar((d) => { d.llamadas = limpias; return d; });
            } catch (e) { /* silencioso */ }
        }
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

        grid.querySelectorAll('.pcall-duracion:not(:disabled)').forEach(b => {
            b.addEventListener('click', async () => {
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
            });
        });

        modal.style.display = 'flex';
    }

    // ------------------------------------------------------------
    //  Polling del lobby (lista de llamadas)
    // ------------------------------------------------------------
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
                    _render(_llamadas);
                }
            } catch (e) { /* silencioso */ }
        }, POLL_MS);
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
                if (_sesion) { alert('Ya estás en una llamada. Colgá primero.'); return; }
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
        if (btnColgar) btnColgar.addEventListener('click', () => _colgarLocal(false));
    }

    window.addEventListener('vicwebos:sesion', () => {
        if (_sesion) _colgarLocal(true);
        _etag = null;
        _render();
    });
    window.addEventListener('vicwebos:comunidad', () => {
        if (_sesion) _colgarLocal(true);
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
