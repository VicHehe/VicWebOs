// ============================================================
//  OnboardingWizard.js — Asistente para crear token de GitHub
//  ------------------------------------------------------------
//  Módulo autocontenido que guía al usuario paso a paso para
//  obtener un Personal Access Token (PAT) de GitHub y validarlo.
//
//  IMPORTANTE: el wizard SOLO genera tokens clásicos SIN
//  EXPIRACIÓN (expires_in=0). Esto es intencional:
//    - El usuario objetivo no sabe de GitHub.
//    - Un token que expira se rompe solo y el usuario no sabe
//      por qué. Mejor uno que dure para siempre.
//    - Si alguien quiere fine-grained (que en GitHub NO puede
//      ser sin expiración), lo hace manual.
//
//  MODOS:
//    - 'crear'  → el usuario está creando una comunidad nueva.
//                 El paso final habla de crear repositorio.
//    - 'unirse' → el usuario se está uniendo a una existente.
//                 El paso final habla de conectarse a la comunidad.
//
//  API pública:
//    OnboardingWizard.mostrar(contenedor, opciones)
//      opciones.modo = 'crear' | 'unirse'   (default: 'crear')
//    OnboardingWizard.ocultar()
//    OnboardingWizard.obtenerToken()       → token validado o null
//    OnboardingWizard.estaListo()          → bool
//    OnboardingWizard.reset()
//
//  Depende de: ConfigBD.js (GH_HEADERS)
//  Si ConfigBD no existe, el wizard igual muestra la UI.
// ============================================================

(function () {
    'use strict';

    // ------------------------------------------------------------
    //  Constantes
    // ------------------------------------------------------------
    const PASOS = {
        BIENVENIDA: 'bienvenida',
        GENERAR: 'generar',
        PEGAR: 'pegar',
        VALIDAR: 'validar'
    };

    const MODOS = {
        CREAR: 'crear',
        UNIRSE: 'unirse'
    };

    const URL_TOKEN =
        'https://github.com/settings/tokens/new' +
        '?scopes=repo,read:user' +
        '&description=VicWebOs+%E2%80%94+Token+personal' +
        '&expires_in=0';

    // ------------------------------------------------------------
    //  Estado interno
    // ------------------------------------------------------------
    let _contenedor = null;
    let _pasoActual = PASOS.BIENVENIDA;
    let _token = null;
    let _tokenValidado = false;
    let _usuarioGitHub = null;
    let _modo = MODOS.CREAR;

    // ------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------
    function _qs(sel, root = document) { return root.querySelector(sel); }

    function _limpiarContenedor() {
        if (_contenedor) _contenedor.innerHTML = '';
    }

    function _renderPaso() {
        if (!_contenedor) return;
        _limpiarContenedor();

        const wrapper = document.createElement('div');
        wrapper.className = 'ow-wrapper';
        wrapper.setAttribute('data-paso', _pasoActual);
        wrapper.setAttribute('data-modo', _modo);

        switch (_pasoActual) {
            case PASOS.BIENVENIDA:
                wrapper.innerHTML = _htmlBienvenida();
                break;
            case PASOS.GENERAR:
                wrapper.innerHTML = _htmlGenerar();
                break;
            case PASOS.PEGAR:
                wrapper.innerHTML = _htmlPegar();
                break;
            case PASOS.VALIDAR:
                wrapper.innerHTML = _htmlValidar();
                break;
        }

        _contenedor.appendChild(wrapper);
        _bindEventosPaso();

        if (window.lucide) lucide.createIcons();
    }

    // ------------------------------------------------------------
    //  PASO 1 — Bienvenida
    // ------------------------------------------------------------
    function _htmlBienvenida() {
        const intro = _modo === MODOS.UNIRSE
            ? 'Te guiaremos para crear un <strong>token de GitHub</strong> y usarlo para conectarte a tu comunidad. Son solo 3 pasos y no necesitas saber programar.'
            : 'Te guiaremos para crear un <strong>token de GitHub</strong> y conectarlo a tu comunidad. Son solo 3 pasos y no necesitas saber programar.';

        const paso3 = _modo === MODOS.UNIRSE
            ? 'Lo validamos y listo. Te unirás a la comunidad.'
            : 'Lo validamos y listo. Tu comunidad queda conectada.';

        return `
            <div class="ow-card ow-card-bienvenida">
                <div class="ow-icono-hero">
                    <i data-lucide="wand-2"></i>
                </div>
                <h3 class="ow-titulo">Vamos paso a paso</h3>
                <p class="ow-desc">
                    ${intro}
                </p>

                <div class="ow-pasos-lista">
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">1</span>
                        <div class="ow-paso-texto">
                            <strong>Abrir GitHub</strong>
                            <span>Te llevamos directo al formulario correcto.</span>
                        </div>
                    </div>
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">2</span>
                        <div class="ow-paso-texto">
                            <strong>Generar el token</strong>
                            <span>Solo un clic. Ya viene con los permisos justos.</span>
                        </div>
                    </div>
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">3</span>
                        <div class="ow-paso-texto">
                            <strong>Pegarlo aquí</strong>
                            <span>${paso3}</span>
                        </div>
                    </div>
                </div>

                <button class="ow-btn-primario" data-ow-accion="empezar">
                    <i data-lucide="arrow-right"></i>
                    Empezar
                </button>

                <p class="ow-nota">
                    <i data-lucide="shield-check"></i>
                    Tu token se guarda solo en tu navegador. Nunca lo compartimos con nadie.
                </p>
            </div>
        `;
    }

    // ------------------------------------------------------------
    //  PASO 2 — Generar token
    // ------------------------------------------------------------
    function _htmlGenerar() {
        return `
            <div class="ow-card">
                <div class="ow-header-paso">
                    <span class="ow-paso-indicador">Paso 2 de 3</span>
                    <h3 class="ow-titulo">Genera tu token</h3>
                </div>

                <p class="ow-desc">
                    Hemos preparado el enlace con los permisos exactos que VicWebOs necesita.
                    Solo tienes que abrirlo, hacer clic en <strong>"Generate token"</strong>
                    y copiar el código que aparece.
                </p>

                <a href="${URL_TOKEN}" target="_blank" rel="noopener noreferrer"
                   class="ow-btn-primario ow-btn-link" data-ow-accion="abrir-github">
                    <i data-lucide="external-link"></i>
                    Abrir GitHub y generar token
                </a>

                <div class="ow-pasos-lista ow-pasos-compacta">
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">1</span>
                        <div class="ow-paso-texto">
                            <strong>Se abrirá una pestaña nueva</strong>
                            <span>Inicia sesión si no lo has hecho.</span>
                        </div>
                    </div>
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">2</span>
                        <div class="ow-paso-texto">
                            <strong>Baja hasta el final del formulario</strong>
                            <span>Ya viene todo configurado. Solo toca "Generate token".</span>
                        </div>
                    </div>
                    <div class="ow-paso-item">
                        <span class="ow-paso-num">3</span>
                        <div class="ow-paso-texto">
                            <strong>Copia el código que aparece</strong>
                            <span>Empieza con <code>ghp_</code>. Guárdalo un momento, lo pegarás aquí.</span>
                        </div>
                    </div>
                </div>

                <div class="ow-acciones-nav">
                    <button class="ow-btn-secundario" data-ow-accion="volver">
                        <i data-lucide="arrow-left"></i>
                        Volver
                    </button>
                    <button class="ow-btn-primario" data-ow-accion="ya-lo-tengo">
                        Ya lo tengo
                        <i data-lucide="arrow-right"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------
    //  PASO 3 — Pegar token
    // ------------------------------------------------------------
    function _htmlPegar() {
        return `
            <div class="ow-card">
                <div class="ow-header-paso">
                    <span class="ow-paso-indicador">Paso 3 de 3</span>
                    <h3 class="ow-titulo">Pega tu token</h3>
                </div>

                <p class="ow-desc">
                    Copia el token que acabas de generar y pégalo aquí.
                    Lo verificaremos al instante para asegurarnos de que funciona.
                </p>

                <div class="ow-input-wrapper">
                    <textarea class="ow-input-token"
                              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                              rows="3"
                              spellcheck="false"
                              autocomplete="off"></textarea>
                </div>

                <div class="ow-error-msg" id="owErrorToken" style="display:none;"></div>
                <div class="ow-exito-msg" id="owExitoToken" style="display:none;"></div>

                <div class="ow-acciones-nav">
                    <button class="ow-btn-secundario" data-ow-accion="volver">
                        <i data-lucide="arrow-left"></i>
                        Volver
                    </button>
                    <button class="ow-btn-primario" data-ow-accion="validar">
                        <i data-lucide="shield-check"></i>
                        Validar token
                    </button>
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------
    //  PASO 4 — Validación exitosa
    // ------------------------------------------------------------
    function _htmlValidar() {
        const nombre = _usuarioGitHub?.login || 'tu cuenta';

        const textoFinal = _modo === MODOS.UNIRSE
            ? 'Tu token funciona. Ahora vuelve al formulario y pulsa <strong>"Unirme a esta comunidad"</strong>.'
            : 'Tu token funciona. Ahora ponle un nombre a tu comunidad y pulsa <strong>"Conectar"</strong>.';

        return `
            <div class="ow-card ow-card-exito">
                <div class="ow-icono-exito">
                    <i data-lucide="check-circle-2"></i>
                </div>
                <h3 class="ow-titulo">¡Token válido!</h3>
                <p class="ow-desc">
                    Conectado como <strong>@${_escapar(nombre)}</strong>.
                    ${textoFinal}
                </p>

                <div class="ow-resumen">
                    <div class="ow-resumen-item">
                        <span class="ow-resumen-label">Usuario</span>
                        <span class="ow-resumen-valor">@${_escapar(nombre)}</span>
                    </div>
                    <div class="ow-resumen-item">
                        <span class="ow-resumen-label">Tipo</span>
                        <span class="ow-resumen-valor">Clásico</span>
                    </div>
                </div>

                <div class="ow-acciones-nav">
                    <button class="ow-btn-secundario" data-ow-accion="volver">
                        <i data-lucide="arrow-left"></i>
                        Cambiar token
                    </button>
                    <button class="ow-btn-primario" data-ow-accion="finalizar">
                        <i data-lucide="check"></i>
                        Continuar
                    </button>
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------
    //  Eventos por paso
    // ------------------------------------------------------------
    function _bindEventosPaso() {
        if (!_contenedor) return;

        _contenedor.querySelectorAll('[data-ow-accion]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const accion = btn.dataset.owAccion;

                if (accion === 'abrir-github') {
                    return;
                }

                e.preventDefault();

                switch (accion) {
                    case 'empezar':
                        _pasoActual = PASOS.GENERAR;
                        _renderPaso();
                        break;

                    case 'volver':
                        _irAtras();
                        break;

                    case 'ya-lo-tengo':
                        _pasoActual = PASOS.PEGAR;
                        _renderPaso();
                        break;

                    case 'validar':
                        await _validarToken();
                        break;

                    case 'finalizar':
                        _finalizar();
                        break;
                }
            });
        });

        const textarea = _qs('.ow-input-token', _contenedor);
        if (textarea) {
            textarea.addEventListener('input', () => {
                _ocultarMensajes();
            });
        }
    }

    function _irAtras() {
        switch (_pasoActual) {
            case PASOS.GENERAR:
                _pasoActual = PASOS.BIENVENIDA;
                break;
            case PASOS.PEGAR:
                _pasoActual = PASOS.GENERAR;
                break;
            case PASOS.VALIDAR:
                _pasoActual = PASOS.PEGAR;
                _tokenValidado = false;
                break;
        }
        _renderPaso();
    }

    function _ocultarMensajes() {
        const err = _qs('#owErrorToken');
        const exito = _qs('#owExitoToken');
        if (err) err.style.display = 'none';
        if (exito) exito.style.display = 'none';
    }

    // ------------------------------------------------------------
    //  Validar token
    // ------------------------------------------------------------
    async function _validarToken() {
        const textarea = _qs('.ow-input-token', _contenedor);
        if (!textarea) return;

        const token = textarea.value.trim();

        if (!token) {
            _mostrarError('Por favor, pega el token que generaste.');
            return;
        }

        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            _mostrarError('El token no parece válido. Debe empezar con "ghp_" o "github_pat_".');
            return;
        }

        const btnValidar = _qs('[data-ow-accion="validar"]', _contenedor);
        if (btnValidar) {
            btnValidar.disabled = true;
            btnValidar.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Validando...';
            if (window.lucide) lucide.createIcons();
        }

        _ocultarMensajes();

        try {
            if (typeof GH_HEADERS === 'function' && typeof fetch === 'function') {
                const res = await fetch('https://api.github.com/user', {
                    headers: GH_HEADERS(token)
                });

                if (!res.ok) {
                    if (res.status === 401) {
                        throw new Error('El token no es válido o ha expirado. Genera uno nuevo.');
                    }
                    if (res.status === 403) {
                        throw new Error('El token no tiene los permisos necesarios. Asegúrate de marcar "repo" y "read:user".');
                    }
                    throw new Error(`Error ${res.status}: no se pudo validar el token.`);
                }

                const usuario = await res.json();
                _usuarioGitHub = usuario;
                _token = token;
                _tokenValidado = true;

                _mostrarExito(`✅ Conectado como @${usuario.login}`);

                setTimeout(() => {
                    _pasoActual = PASOS.VALIDAR;
                    _renderPaso();
                }, 800);

            } else {
                _token = token;
                _usuarioGitHub = { login: 'usuario-desconocido' };
                _tokenValidado = true;
                _mostrarExito('✅ Token guardado (validación pendiente al conectar).');
                setTimeout(() => {
                    _pasoActual = PASOS.VALIDAR;
                    _renderPaso();
                }, 800);
            }

        } catch (err) {
            _mostrarError(err.message || 'No se pudo validar el token. Inténtalo de nuevo.');
            _tokenValidado = false;
        } finally {
            if (btnValidar) {
                btnValidar.disabled = false;
                btnValidar.innerHTML = '<i data-lucide="shield-check"></i> Validar token';
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    function _mostrarError(msg) {
        const err = _qs('#owErrorToken');
        const exito = _qs('#owExitoToken');
        if (exito) exito.style.display = 'none';
        if (err) {
            err.innerHTML = `<i data-lucide="alert-circle"></i> ${_escapar(msg)}`;
            err.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        }
    }

    function _mostrarExito(msg) {
        const err = _qs('#owErrorToken');
        const exito = _qs('#owExitoToken');
        if (err) err.style.display = 'none';
        if (exito) {
            exito.innerHTML = `<i data-lucide="check-circle-2"></i> ${_escapar(msg)}`;
            exito.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        }
    }

    function _escapar(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ------------------------------------------------------------
    //  Finalizar
    // ------------------------------------------------------------
    function _finalizar() {
        if (!_tokenValidado || !_token) {
            _mostrarError('Primero debes validar el token.');
            return;
        }

        window.dispatchEvent(new CustomEvent('vicwebos:onboarding-completo', {
            detail: {
                token: _token,
                usuario: _usuarioGitHub,
                tipo: 'classic',
                modo: _modo
            }
        }));

        window.__vicwebos_onboarding_token = _token;
        window.__vicwebos_onboarding_usuario = _usuarioGitHub;
        window.__vicwebos_onboarding_tipo = 'classic';
        window.__vicwebos_onboarding_modo = _modo;

        _contenedor.style.display = 'none';
    }

    // ------------------------------------------------------------
    //  API pública
    // ------------------------------------------------------------
    const OnboardingWizard = {
        mostrar(contenedor, opciones = {}) {
            if (typeof contenedor === 'string') {
                _contenedor = document.querySelector(contenedor);
            } else if (contenedor instanceof HTMLElement) {
                _contenedor = contenedor;
            }

            if (!_contenedor) {
                console.warn('[OnboardingWizard] Contenedor no encontrado.');
                return;
            }

            _modo = (opciones.modo === MODOS.UNIRSE) ? MODOS.UNIRSE : MODOS.CREAR;

            _contenedor.style.display = 'block';
            _pasoActual = PASOS.BIENVENIDA;
            _token = null;
            _tokenValidado = false;
            _usuarioGitHub = null;

            _renderPaso();
        },

        ocultar() {
            if (_contenedor) {
                _contenedor.innerHTML = '';
                _contenedor.style.display = 'none';
            }
        },

        obtenerToken() {
            return _tokenValidado ? _token : null;
        },

        estaListo() {
            return _tokenValidado && !!_token;
        },

        obtenerUsuario() {
            return _usuarioGitHub;
        },

        obtenerTipo() {
            return 'classic';
        },

        obtenerModo() {
            return _modo;
        },

        reset() {
            _pasoActual = PASOS.BIENVENIDA;
            _token = null;
            _tokenValidado = false;
            _usuarioGitHub = null;
            _renderPaso();
        }
    };

    window.OnboardingWizard = OnboardingWizard;

    window.addEventListener('vicwebos:onboarding-reset', () => {
        OnboardingWizard.reset();
    });

})();
