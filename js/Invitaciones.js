// ============================================================
//  Invitaciones.js — Compartir y unirse a comunidades
//  ------------------------------------------------------------
//  Código de invitación autocontenido (base64url de un JSON).
//
//  Puede llevar DOS variantes:
//    - Solo metadata (nombre, owner, repo)
//      → el invitado aporta su propio token
//    - Metadata + token del dueño embebido
//      → el invitado se une con UN SOLO PEGADO
//
//  El token va codificado en base64url (mismo tratamiento que el
//  resto del payload). El dueño decide si lo incluye o no.
//
//  API pública:
//    Invitaciones.generar(comId, { incluirToken })
//    Invitaciones.decodificar(codigo) → { nombre, owner, repo, token?, modo }
//    Invitaciones.mostrarModal(comId)
//    Invitaciones.ocultarModal()
//    Invitaciones.unirse()
// ============================================================

(function () {
    'use strict';

    const PREFIJO = 'VWO1.';
    const VERSION = 1;

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
    //  Generar código
    // ------------------------------------------------------------
    function generar(comId, opciones = {}) {
        const com = ConfigBD.obtenerComunidadPorId(comId);
        if (!com) throw new Error('Comunidad no encontrada.');

        const payload = {
            v: VERSION,
            n: com.nombre || com.githubRepo,
            o: com.githubOwner,
            r: com.githubRepo
        };

        if (opciones.incluirToken === true && com.githubToken) {
            payload.t = com.githubToken;
        }

        return PREFIJO + _b64urlEncode(JSON.stringify(payload));
    }

    // ------------------------------------------------------------
    //  Decodificar código
    // ------------------------------------------------------------
    function decodificar(codigo) {
        const limpio = String(codigo || '').trim();

        if (!limpio) throw new Error('El código está vacío.');
        if (!limpio.startsWith(PREFIJO)) {
            throw new Error('El código no es válido (falta el prefijo VWO1).');
        }

        const b64 = limpio.slice(PREFIJO.length);

        let json;
        try { json = _b64urlDecode(b64); }
        catch (e) { throw new Error('El código está corrupto o mal copiado.'); }

        let data;
        try { data = JSON.parse(json); }
        catch (e) { throw new Error('El código está corrupto o mal copiado.'); }

        if (!data || typeof data !== 'object') {
            throw new Error('El código no contiene datos válidos.');
        }
        if (data.v !== VERSION) {
            throw new Error(`Versión de código no soportada (v${data.v}).`);
        }
        if (!data.o || !data.r) {
            throw new Error('El código está incompleto.');
        }

        const token = (typeof data.t === 'string' && data.t.trim()) ? data.t.trim() : null;

        return {
            version: data.v,
            nombre:  data.n || data.r,
            owner:   data.o,
            repo:    data.r,
            token:   token,
            modo:    token ? 'shared' : 'own-token'
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
        const checkbox = document.getElementById('compartirIncluirToken');

        if (nombreEl) nombreEl.textContent = com.nombre || com.githubRepo;
        if (checkbox) checkbox.checked = true;

        _actualizarCodigoCompartir();
        _actualizarHintCompartir();

        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    }

    function _actualizarCodigoCompartir() {
        if (!_comIdCompartiendo) return;

        const ta = document.getElementById('compartirCodigo');
        const checkbox = document.getElementById('compartirIncluirToken');
        if (!ta || !checkbox) return;

        try {
            ta.value = generar(_comIdCompartiendo, {
                incluirToken: checkbox.checked
            });
        } catch (e) {
            ta.value = '';
        }
    }

    function _actualizarHintCompartir() {
        const checkbox = document.getElementById('compartirIncluirToken');
        const hint     = document.getElementById('compartirHint');
        if (!hint) return;

        if (checkbox && checkbox.checked) {
            hint.className = 'compartir-hint compartir-hint-alerta';
            hint.innerHTML = `
                <i data-lucide="alert-triangle"></i>
                <span>
                    El código lleva tu token. Cualquiera que lo vea podrá escribir en el repo <strong>como vos</strong>.
                    Enviálo solo por chat privado. Si se filtra, <strong>revocá tu token</strong> en GitHub y regenerálo.
                </span>
            `;
        } else {
            hint.className = 'compartir-hint';
            hint.innerHTML = `
                <i data-lucide="shield-check"></i>
                <span>El código no contiene tu token. El invitado tendrá que aportar el suyo.</span>
            `;
        }

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
        } catch (e) { /* fallback */ }

        if (!exito) {
            try {
                ta.select();
                ta.setSelectionRange(0, 99999);
                document.execCommand('copy');
                window.getSelection()?.removeAllRanges();
                exito = true;
            } catch (e) { exito = false; }
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
    //  Preview del código en "Unirme"
    // ------------------------------------------------------------
    function _renderPreview(codigoRaw) {
        const preview = document.getElementById('bdJoinPreview');
        const paso2   = document.getElementById('bdJoinPaso2');
        const paso3   = document.getElementById('bdJoinPaso3');

        if (!preview) return false;

        const val = String(codigoRaw || '').trim();

        if (!val) {
            preview.style.display = 'none';
            preview.innerHTML = '';
            if (paso2) paso2.style.display = 'none';
            if (paso3) paso3.style.display = 'none';
            return false;
        }

        try {
            const info = decodificar(val);

            if (info.modo === 'shared') {
                preview.className = 'bd-join-preview valido';
                preview.innerHTML = `
                    <div class="bd-join-preview-icono">
                        <i data-lucide="package-check"></i>
                    </div>
                    <div class="bd-join-preview-info">
                        <strong>${_escapar(info.nombre)}</strong>
                        <span>@${_escapar(info.owner)}/${_escapar(info.repo)}</span>
                        <em class="bd-join-preview-tag">
                            <i data-lucide="check"></i>
                            Listo para unirte
                        </em>
                    </div>
                `;

                if (paso2) paso2.style.display = 'none';
                if (paso3) paso3.style.display = 'block';

            } else {
                preview.className = 'bd-join-preview valido';
                preview.innerHTML = `
                    <div class="bd-join-preview-icono">
                        <i data-lucide="package-check"></i>
                    </div>
                    <div class="bd-join-preview-info">
                        <strong>${_escapar(info.nombre)}</strong>
                        <span>@${_escapar(info.owner)}/${_escapar(info.repo)}</span>
                        <em class="bd-join-preview-tag bd-join-preview-tag-neutro">
                            Necesitarás tu propio token
                        </em>
                    </div>
                `;

                if (paso2) paso2.style.display = 'block';
                if (paso3) paso3.style.display = 'block';
            }

            preview.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
            return true;

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

            if (paso2) paso2.style.display = 'none';
            if (paso3) paso3.style.display = 'none';

            if (window.lucide) lucide.createIcons();
            return false;
        }
    }

    // ------------------------------------------------------------
    //  Unirse
    // ------------------------------------------------------------
    async function unirse() {
        const taCodigo   = document.getElementById('bdJoinCodigo');
        const inputToken = document.getElementById('bdJoinToken');
        const status     = document.getElementById('bdJoinStatus');
        const btn        = document.getElementById('btnUnirseComunidad');

        const setMsg = (txt, tipo) => {
            if (!status) return;
            status.textContent = txt;
            status.className = 'config-status ' + (tipo || '');
        };

        const codigoRaw = taCodigo ? taCodigo.value.trim() : '';
        if (!codigoRaw) {
            setMsg('❌ Pega el código de invitación.', 'error');
            return;
        }

        let info;
        try { info = decodificar(codigoRaw); }
        catch (e) {
            setMsg('❌ ' + e.message, 'error');
            return;
        }

        let token = '';

        if (info.modo === 'shared' && info.token) {
            token = info.token;
        } else {
            if (window.OnboardingWizard && OnboardingWizard.estaListo()) {
                token = OnboardingWizard.obtenerToken();
            }
            if (!token) {
                token = inputToken ? inputToken.value.trim() : '';
            }
            if (!token) {
                setMsg('❌ Introduce tu token personal de GitHub.', 'error');
                return;
            }
        }

        const yaExiste = ConfigBD.listarComunidades().some(c =>
            c.githubOwner === info.owner && c.githubRepo === info.repo
        );
        if (yaExiste) {
            setMsg('❌ Ya tienes esta comunidad añadida.', 'error');
            return;
        }

        if (!btn) return;

        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Uniéndome...';
        if (window.lucide) lucide.createIcons();
        setMsg('⏳ Verificando acceso al repositorio...', 'info');

        try {
            await ghObtenerUsuario(token);

            const tieneAcceso = await ghRepoExiste(token, info.owner, info.repo);
            if (!tieneAcceso) {
                throw new Error(
                    `No tienes acceso a "${info.owner}/${info.repo}". ` +
                    (info.modo === 'shared'
                        ? 'El token del código no es válido o fue revocado. Pídele al dueño que genere uno nuevo.'
                        : 'Pídele al dueño que te agregue como colaborador en GitHub (Settings → Collaborators) y vuelve a intentar.')
                );
            }

            const res = await ConfigBD.unirseAComunidad({
                nombre:    info.nombre,
                token,
                repo:      info.repo,
                owner:     info.owner,
                tipoToken: 'classic'
            });

            setMsg('✅ ¡Te uniste a la comunidad!', 'success');

            if (typeof window.cambiarComunidad === 'function' && res && res.id) {
                await window.cambiarComunidad(res.id);
            }

            if (typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();
            if (typeof window.__renderSidebarComunidad === 'function') window.__renderSidebarComunidad();

            setTimeout(() => {
                const tabMias = document.querySelector('[data-bdtab="mias"]');
                if (tabMias) tabMias.click();
            }, 1400);

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

    // ------------------------------------------------------------
    //  Wiring
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

                if (window.OnboardingWizard) {
                    OnboardingWizard.ocultar();
                }

                if (target === 'mias') {
                    const form = document.getElementById('bdFormulario');
                    if (form) form.style.display = 'none';
                }

                if (target === 'unirme') {
                    const paso2 = document.getElementById('bdJoinPaso2');
                    const paso3 = document.getElementById('bdJoinPaso3');
                    const preview = document.getElementById('bdJoinPreview');
                    const ta = document.getElementById('bdJoinCodigo');
                    if (paso2) paso2.style.display = 'none';
                    if (paso3) paso3.style.display = 'none';
                    if (preview) preview.style.display = 'none';
                    if (ta) ta.value = '';
                }

                if (window.lucide) lucide.createIcons();
            });
        });
    }

    function _inicializarModal() {
        const modal    = document.getElementById('modalCompartir');
        const btnCerrar = document.getElementById('compartirCerrar');
        const btnCopiar = document.getElementById('compartirCopiar');
        const checkbox  = document.getElementById('compartirIncluirToken');
        const btnAbrirWizard = document.getElementById('bdJoinAbrirWizard');

        if (btnCerrar && !btnCerrar.dataset.wired) {
            btnCerrar.dataset.wired = '1';
            btnCerrar.addEventListener('click', ocultarModal);
        }
        if (btnCopiar && !btnCopiar.dataset.wired) {
            btnCopiar.dataset.wired = '1';
            btnCopiar.addEventListener('click', copiarCodigo);
        }
        if (checkbox && !checkbox.dataset.wired) {
            checkbox.dataset.wired = '1';
            checkbox.addEventListener('change', () => {
                _actualizarCodigoCompartir();
                _actualizarHintCompartir();
            });
        }
        if (modal && !modal.dataset.wired) {
            modal.dataset.wired = '1';
            modal.addEventListener('click', (e) => {
                if (e.target === modal) ocultarModal();
            });
        }

        if (btnAbrirWizard && !btnAbrirWizard.dataset.wired) {
            btnAbrirWizard.dataset.wired = '1';
            btnAbrirWizard.addEventListener('click', () => {
                const slot = document.getElementById('onboardingWizardSlotJoin');
                if (!slot || !window.OnboardingWizard) return;

                slot.style.display = 'block';
                OnboardingWizard.mostrar(slot, { modo: 'unirse' });
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
