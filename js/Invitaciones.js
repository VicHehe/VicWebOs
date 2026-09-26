// ============================================================
//  Invitaciones.js — Compartir y unirse a comunidades
//  ------------------------------------------------------------
//  Genera códigos de invitación autocontenidos (base64) que
//  contienen SOLO metadata (nombre, owner, repo). NUNCA el token.
//
//  API pública:
//    Invitaciones.generar(comId)     → string "VWO1.xxxxx"
//    Invitaciones.decodificar(codigo) → { nombre, owner, repo } o error
//    Invitaciones.mostrarModal(comId) → abre modal de compartir
//    Invitaciones.ocultarModal()
//    Invitaciones.unirse()            → lee el form y une
//
//  Depende de: ConfigBD.js, OnboardingWizard.js (opcional)
// ============================================================

(function () {
    'use strict';

    const PREFIJO = 'VWO1.';
    const VERSION = 1;

    // ------------------------------------------------------------
    //  Helpers base64 URL-safe
    // ------------------------------------------------------------
    function _b64urlEncode(str) {
        return btoa(unescape(encodeURIComponent(str)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function _b64urlDecode(str) {
        let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        return decodeURIComponent(escape(atob(s)));
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
    //  Generar código de invitación
    // ------------------------------------------------------------
    function generar(comId) {
        const com = ConfigBD.obtenerComunidadPorId(comId);
        if (!com) throw new Error('Comunidad no encontrada.');

        const payload = {
            v: VERSION,
            n: com.nombre || com.githubRepo,
            o: com.githubOwner,
            r: com.githubRepo
        };

        return PREFIJO + _b64urlEncode(JSON.stringify(payload));
    }

    // ------------------------------------------------------------
    //  Decodificar código
    // ------------------------------------------------------------
    function decodificar(codigo) {
        const limpio = String(codigo || '').trim();

        if (!limpio) {
            throw new Error('El código está vacío.');
        }
        if (!limpio.startsWith(PREFIJO)) {
            throw new Error('El código no es válido (falta el prefijo VWO1).');
        }

        const b64 = limpio.slice(PREFIJO.length);

        let json;
        try {
            json = _b64urlDecode(b64);
        } catch (e) {
            throw new Error('El código está corrupto o mal copiado.');
        }

        let data;
        try {
            data = JSON.parse(json);
        } catch (e) {
            throw new Error('El código está corrupto o mal copiado.');
        }

        if (!data || typeof data !== 'object') {
            throw new Error('El código no contiene datos válidos.');
        }
        if (data.v !== VERSION) {
            throw new Error(`Versión de código no soportada (v${data.v}). Actualiza VicWebOs.`);
        }
        if (!data.o || !data.r) {
            throw new Error('El código está incompleto.');
        }

        return {
            version: data.v,
            nombre:  data.n || data.r,
            owner:   data.o,
            repo:    data.r
        };
    }

    // ------------------------------------------------------------
    //  Modal de compartir
    // ------------------------------------------------------------
    let _comIdCompartiendo = null;

    function mostrarModal(comId) {
        const com = ConfigBD.obtenerComunidadPorId(comId);
        if (!com) return;

        const modal = document.getElementById('modalCompartir');
        if (!modal) return;

        _comIdCompartiendo = comId;

        const nombreEl = document.getElementById('compartirNombre');
        const ta = document.getElementById('compartirCodigo');

        if (nombreEl) nombreEl.textContent = com.nombre || com.githubRepo;
        if (ta) ta.value = generar(comId);

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }

    function ocultarModal() {
        const modal = document.getElementById('modalCompartir');
        if (modal) modal.style.display = 'none';
        _comIdCompartiendo = null;
    }

    async function copiarCodigo() {
        const ta = document.getElementById('compartirCodigo');
        if (!ta) return;

        let exito = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(ta.value);
                exito = true;
            }
        } catch (e) {
            // fallback
        }

        if (!exito) {
            try {
                ta.select();
                ta.setSelectionRange(0, 99999);
                document.execCommand('copy');
                window.getSelection()?.removeAllRanges();
                exito = true;
            } catch (e) {
                exito = false;
            }
        }

        _feedbackCopiar(exito);
    }

    function _feedbackCopiar(ok) {
        const btn = document.getElementById('compartirCopiar');
        if (!btn) return;

        const original = btn.innerHTML;
        btn.innerHTML = ok
            ? '<i data-lucide="check"></i> ¡Copiado!'
            : '<i data-lucide="x"></i> Selecciona y copia';
        btn.classList.toggle('ok', ok);
        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            btn.innerHTML = original;
            btn.classList.remove('ok');
            if (window.lucide) lucide.createIcons();
        }, 1800);
    }

    // ------------------------------------------------------------
    //  Preview del código en el flujo "Unirme"
    // ------------------------------------------------------------
    function _renderPreview(codigoRaw) {
        const preview = document.getElementById('bdJoinPreview');
        if (!preview) return;

        const val = String(codigoRaw || '').trim();

        if (!val) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            return;
        }

        try {
            const info = decodificar(val);
            preview.className = 'bd-join-preview valido';
            preview.innerHTML = `
                <div class="bd-join-preview-icono">
                    <i data-lucide="package-check"></i>
                </div>
                <div class="bd-join-preview-info">
                    <strong>${_escapar(info.nombre)}</strong>
                    <span>@${_escapar(info.owner)}/${_escapar(info.repo)}</span>
                </div>
            `;
            preview.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        } catch (err) {
            preview.className = 'bd-join-preview invalido';
            preview.innerHTML = `
                <div class="bd-join-preview-icono">
                    <i data-lucide="alert-circle"></i>
                </div>
                <div class="bd-join-preview-info">
                    <strong>${_escapar(err.message)}</strong>
                </div>
            `;
            preview.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
        }
    }

    // ------------------------------------------------------------
    //  Unirse a una comunidad
    // ------------------------------------------------------------
    async function unirse() {
        const taCodigo    = document.getElementById('bdJoinCodigo');
        const inputToken  = document.getElementById('bdJoinToken');
        const status      = document.getElementById('bdJoinStatus');
        const btn         = document.getElementById('btnUnirseComunidad');

        const setMsg = (txt, tipo) => {
            if (!status) return;
            status.textContent = txt;
            status.className = 'config-status ' + (tipo || '');
        };

        // --- 1) Leer y validar el código ---
        const codigoRaw = taCodigo ? taCodigo.value.trim() : '';
        if (!codigoRaw) {
            setMsg('❌ Pega el código de invitación.', 'error');
            return;
        }

        let info;
        try {
            info = decodificar(codigoRaw);
        } catch (e) {
            setMsg('❌ ' + e.message, 'error');
            return;
        }

        // --- 2) Leer el token según el tipo elegido ---
        const tipo = document.querySelector('input[name="bdJoinTipoToken"]:checked')?.value || 'classic';
        let token = '';

        if (tipo === 'assisted') {
            if (window.OnboardingWizard && OnboardingWizard.estaListo()) {
                token = OnboardingWizard.obtenerToken();
            }
            if (!token) {
                setMsg('❌ Completa el asistente para obtener tu token.', 'error');
                return;
            }
        } else {
            token = inputToken ? inputToken.value.trim() : '';
            if (!token) {
                setMsg('❌ Introduce tu token personal de GitHub.', 'error');
                return;
            }
        }

        // --- 3) Verificar duplicados ---
        const yaExiste = ConfigBD.listarComunidades().some(c =>
            c.githubOwner === info.owner && c.githubRepo === info.repo
        );
        if (yaExiste) {
            setMsg('❌ Ya tienes esta comunidad añadida.', 'error');
            return;
        }

        // --- 4) Ejecutar ---
        if (btn) {
            btn.disabled = true;
            const original = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Uniéndome...';
            if (window.lucide) lucide.createIcons();
            setMsg('⏳ Verificando acceso al repositorio...', 'info');

            try {
                // Validar token
                await ghObtenerUsuario(token);

                // Verificar acceso al repo
                const tieneAcceso = await ghRepoExiste(token, info.owner, info.repo);
                if (!tieneAcceso) {
                    throw new Error(
                        `No tienes acceso a "${info.owner}/${info.repo}". ` +
                        `Pídele al dueño que te agregue como colaborador en GitHub ` +
                        `(Settings → Collaborators) y vuelve a intentar.`
                    );
                }

                // Crear la comunidad localmente
                const res = await ConfigBD.unirseAComunidad({
                    nombre:    info.nombre,
                    token,
                    repo:      info.repo,
                    owner:     info.owner,
                    tipoToken: tipo
                });

                setMsg('✅ ¡Te uniste a la comunidad!', 'success');

                // Cambiar a la comunidad nueva
                if (typeof window.cambiarComunidad === 'function' && res && res.id) {
                    await window.cambiarComunidad(res.id);
                }

                // Refrescar UI
                if (typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();
                if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();

                // Volver a "Mis comunidades" tras un momento
                setTimeout(() => {
                    const tabMias = document.querySelector('[data-bdtab="mias"]');
                    if (tabMias) tabMias.click();
                }, 1400);

                // Limpiar el form
                if (taCodigo) taCodigo.value = '';
                if (inputToken) inputToken.value = '';
                _renderPreview('');

            } catch (err) {
                setMsg('❌ ' + (err.message || 'Error al unirse.'), 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = original;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ------------------------------------------------------------
    //  Wiring de la UI
    // ------------------------------------------------------------
    function _inicializarSubtabs() {
        document.querySelectorAll('.bd-subtab').forEach(tab => {
            if (tab.dataset.wired) return;
            tab.dataset.wired = '1';

            tab.addEventListener('click', () => {
                const target = tab.dataset.bdtab;

                document.querySelectorAll('.bd-subtab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.bd-vista').forEach(v => v.classList.remove('active'));
                const vista = document.querySelector(`.bd-vista[data-bdvista="${target}"]`);
                if (vista) vista.classList.add('active');

                // Resetear wizard al cambiar de vista (evita conflictos de estado)
                if (window.OnboardingWizard) {
                    OnboardingWizard.ocultar();
                    OnboardingWizard.reset();
                }

                // Al volver a "mias", asegurar que el formulario de crear esté cerrado
                if (target === 'mias') {
                    const form = document.getElementById('bdFormulario');
                    if (form) form.style.display = 'none';
                }

                if (window.lucide) lucide.createIcons();
            });
        });
    }

    function _inicializarModal() {
        const modal = document.getElementById('modalCompartir');
        const btnCerrar = document.getElementById('compartirCerrar');
        const btnCopiar = document.getElementById('compartirCopiar');

        if (btnCerrar && !btnCerrar.dataset.wired) {
            btnCerrar.dataset.wired = '1';
            btnCerrar.addEventListener('click', ocultarModal);
        }
        if (btnCopiar && !btnCopiar.dataset.wired) {
            btnCopiar.dataset.wired = '1';
            btnCopiar.addEventListener('click', copiarCodigo);
        }
        if (modal && !modal.dataset.wired) {
            modal.dataset.wired = '1';
            modal.addEventListener('click', (e) => {
                if (e.target === modal) ocultarModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
                ocultarModal();
            }
        });
    }

    function _inicializarFlujoUnirse() {
        const ta = document.getElementById('bdJoinCodigo');
        const btn = document.getElementById('btnUnirseComunidad');

        if (ta && !ta.dataset.wired) {
            ta.dataset.wired = '1';
            ta.addEventListener('input', () => {
                _renderPreview(ta.value);
            });
            ta.addEventListener('paste', () => {
                // Pequeño delay para que el paste se complete antes de leer el valor
                setTimeout(() => _renderPreview(ta.value), 30);
            });
        }

        if (btn && !btn.dataset.wired) {
            btn.dataset.wired = '1';
            btn.addEventListener('click', unirse);
        }
    }

    function inicializar() {
        _inicializarSubtabs();
        _inicializarModal();
        _inicializarFlujoUnirse();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    // ------------------------------------------------------------
    //  API pública
    // ------------------------------------------------------------
    window.Invitaciones = {
        PREFIJO,
        VERSION,
        generar,
        decodificar,
        mostrarModal,
        ocultarModal,
        copiarCodigo,
        unirse,
        _renderPreview
    };

})();
