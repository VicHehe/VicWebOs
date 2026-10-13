// ============================================================
//  ModifyAcount.js — Edición y eliminación de cuenta
//  ------------------------------------------------------------
//  Permite al usuario, desde Configuración → Cuenta:
//    • Editar su nombre, pronombre y foto.
//    • El CÓDIGO no se puede cambiar (es la llave de la cuenta).
//    • Eliminar por completo su cuenta de la comunidad actual:
//        - cuenta.json        (perfil)
//        - cuentaConfig.json  (apps, temas, widgets, monedas, espacio)
//        - chequera.json      (movimientos)
//        - CuentasNotificaciones.json (bandeja de notis)
//
//  Las imágenes de la galería se dejan intactas en el repo
//  para que el usuario pueda recuperarlas manualmente.
//
//  Requiere (cargados antes):
//    - ConfigBD.js  → leerArchivo, actualizarArchivo, eliminarArchivo
//    - Cuenta.js    → cargarCuentas, guardarCuentas, procesarFoto,
//                     cerrarSesion, actualizarAvatarHeader,
//                     __actualizarUISesion
// ============================================================

(function () {
    'use strict';

    let _fotoTemp = null;   // null = no cambiar | string = nueva foto (dataURL)

    // ------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------
    function _qs(sel) { return document.querySelector(sel); }

    function _setMsg(el, txt, tipo) {
        if (!el) return;
        el.textContent = txt || '';
        el.className = 'config-status ' + (tipo || '');
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
    //  Foto preview
    // ------------------------------------------------------------
    function _pintarFotoPreview(dataURL) {
        const prev = _qs('#editCuentaFotoPreview');
        if (!prev) return;

        const cuenta = window.cuentaActual;

        if (dataURL) {
            prev.innerHTML = `<img src="${dataURL}" alt="" class="cuenta-foto-img">`;
        } else if (cuenta && cuenta.foto) {
            prev.innerHTML = `<img src="${cuenta.foto}" alt="" class="cuenta-foto-img">`;
        } else if (cuenta) {
            const inicial = (cuenta.nombre || '?').charAt(0).toUpperCase();
            prev.innerHTML = `<span class="avatar-inicial">${_escapar(inicial)}</span>`;
        } else {
            prev.innerHTML = '<i data-lucide="camera"></i><span class="cuenta-foto-texto">Cambiar foto</span>';
        }

        if (window.lucide) lucide.createIcons();
    }

    // ------------------------------------------------------------
    //  Visibilidad de bloques
    // ------------------------------------------------------------
    function _toggleBloques(editando) {
        const perfil   = _qs('#cuentaConSesion .cuenta-perfil');
        const acciones = _qs('#cuentaConSesion .cuenta-acciones');
        const peligro  = _qs('#cuentaConSesion .cuenta-peligro');

        const visible = editando ? 'none' : '';

        if (perfil)   perfil.style.display   = visible;
        if (acciones) acciones.style.display = visible;
        if (peligro)  peligro.style.display  = visible;
    }

    // ------------------------------------------------------------
    //  Abrir editor
    // ------------------------------------------------------------
    function abrirEditor() {
        if (!window.cuentaActual) return;

        _fotoTemp = null;

        const form       = _qs('#cuentaEditarForm');
        const inputNom   = _qs('#editCuentaNombre');
        const inputPro   = _qs('#editCuentaPronombre');
        const codEl      = _qs('#editCodigoMostrado');
        const msg        = _qs('#editCuentaMensaje');

        if (inputNom) inputNom.value = window.cuentaActual.nombre || '';
        if (inputPro) inputPro.value = window.cuentaActual.pronombre || 'el';
        if (codEl)    codEl.textContent = window.cuentaActual.codigo || '—';

        _pintarFotoPreview(null);
        _setMsg(msg, '', '');

        _toggleBloques(true);
        if (form) form.style.display = 'block';

        if (window.lucide) lucide.createIcons();
    }

    function cerrarEditor() {
        _fotoTemp = null;

        const form = _qs('#cuentaEditarForm');
        if (form) form.style.display = 'none';

        _toggleBloques(false);
        _setMsg(_qs('#editCuentaMensaje'), '', '');

        if (window.lucide) lucide.createIcons();
    }

    // ------------------------------------------------------------
    //  Guardar cambios (nombre, pronombre, foto)
    // ------------------------------------------------------------
    async function guardarCambios() {
        const btn = _qs('#btnGuardarEdicionCuenta');
        const msg = _qs('#editCuentaMensaje');

        if (!window.cuentaActual) {
            _setMsg(msg, '❌ No hay sesión activa.', 'error');
            return;
        }
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            _setMsg(msg, '❌ La comunidad no está conectada.', 'error');
            return;
        }

        const inputNom = _qs('#editCuentaNombre');
        const inputPro = _qs('#editCuentaPronombre');

        const nombre     = (inputNom?.value || '').trim();
        const pronombre  = inputPro?.value || 'el';

        if (!nombre) {
            _setMsg(msg, '❌ El nombre no puede estar vacío.', 'error');
            return;
        }
        if (nombre.length > 40) {
            _setMsg(msg, '❌ El nombre no puede pasar de 40 caracteres.', 'error');
            return;
        }

        if (btn && btn.disabled) return;

        if (btn) {
            btn.disabled = true;
            var _originalHTML = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Guardando...';
            if (window.lucide) lucide.createIcons();
        }

        _setMsg(msg, '⏳ Guardando cambios...', 'info');

        try {
            const cuentas = await window.cargarCuentas();
            const idx = cuentas.findIndex(c => c.codigo === window.cuentaActual.codigo);
            if (idx === -1) {
                throw new Error('Tu cuenta ya no existe en esta comunidad.');
            }

            cuentas[idx].nombre    = nombre;
            cuentas[idx].pronombre = pronombre;
            if (_fotoTemp !== null) {
                cuentas[idx].foto = _fotoTemp || null;
            }

            await window.guardarCuentas(cuentas);

            // Actualizar estado local
            window.cuentaActual = cuentas[idx];

            // Refrescar UI del shell
            if (typeof window.actualizarAvatarHeader === 'function') window.actualizarAvatarHeader();
            if (typeof window.actualizarSaludo     === 'function') window.actualizarSaludo();

            _setMsg(msg, '✅ Cuenta actualizada.', 'success');

            setTimeout(() => {
                cerrarEditor();
                if (typeof window.__actualizarUISesion === 'function') {
                    window.__actualizarUISesion();
                }
            }, 900);

        } catch (e) {
            _setMsg(msg, '❌ ' + (e.message || 'Error al guardar.'), 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = _originalHTML;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ------------------------------------------------------------
    //  Eliminar cuenta
    // ------------------------------------------------------------
    async function eliminarCuenta() {
        if (!window.cuentaActual) return;
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            alert('❌ La comunidad no está conectada.');
            return;
        }

        const codigo = window.cuentaActual.codigo;
        const nombre = window.cuentaActual.nombre || codigo;

        // --- Doble confirmación ---
        const ok1 = confirm(
            `¿Eliminar tu cuenta "${nombre}"?\n\n` +
            `Se borrarán tu perfil, apps, temas, widgets, monedas y chequera.\n` +
            `Esta acción NO se puede deshacer.`
        );
        if (!ok1) return;

        const texto = prompt(
            `Última confirmación.\n\n` +
            `Escribí tu código "${codigo}" para eliminar la cuenta:`
        );
        if (texto === null) return;   // canceló
        if (String(texto).trim().toUpperCase() !== codigo) {
            alert('❌ El código no coincide. Eliminación cancelada.');
            return;
        }

        const btn = _qs('#btnEliminarCuenta');
        if (btn) {
            btn.disabled = true;
            var _orig = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Eliminando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            // 1. Quitar de cuenta.json
            const cuentas = await window.cargarCuentas();
            const restantes = cuentas.filter(c => c.codigo !== codigo);
            await window.guardarCuentas(restantes);

            // 2. Quitar de cuentaConfig.json
            try {
                await ConfigBD.actualizarArchivo('cuentaConfig.json', (all) => {
                    if (all && typeof all === 'object' && all[codigo]) {
                        delete all[codigo];
                    }
                    return all || {};
                });
            } catch (e) {
                console.warn('[ModifyAcount] cuentaConfig:', e);
            }

            // 3. Borrar chequera
            try {
                const rutaCheq = `app/chequera/${codigo}chequera.json`;
                if (typeof ConfigBD.eliminarArchivo === 'function') {
                    await ConfigBD.eliminarArchivo(rutaCheq);
                }
            } catch (e) {
                console.warn('[ModifyAcount] chequera:', e);
            }

            // 4. Quitar de CuentasNotificaciones.json
            try {
                await ConfigBD.actualizarArchivo('CuentasNotificaciones.json', (all) => {
                    if (all && all.usuarios && all.usuarios[codigo]) {
                        delete all.usuarios[codigo];
                    }
                    return all || {};
                });
            } catch (e) {
                console.warn('[ModifyAcount] notificaciones:', e);
            }

            // 5. Cerrar sesión
            if (typeof window.cerrarSesion === 'function') window.cerrarSesion();

            // 6. Refrescar UI
            cerrarEditor();
            if (typeof window.__actualizarUISesion      === 'function') window.__actualizarUISesion();
            if (typeof window.renderSidebar             === 'function') window.renderSidebar();
            if (typeof window.__renderSidebarComunidad  === 'function') window.__renderSidebarComunidad();

            alert('✅ Tu cuenta fue eliminada.');

        } catch (e) {
            alert('❌ No se pudo eliminar la cuenta: ' + (e.message || 'Error desconocido.'));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = _orig;
                if (window.lucide) lucide.createIcons();
            }
        }
    }

    // ------------------------------------------------------------
    //  Wiring
    // ------------------------------------------------------------
    function inicializar() {
        const btnEditar     = _qs('#btnEditarCuenta');
        const btnCerrarEdit = _qs('#btnCancelarEdicionCuenta');
        const btnGuardar    = _qs('#btnGuardarEdicionCuenta');
        const btnEliminar   = _qs('#btnEliminarCuenta');
        const inputFoto     = _qs('#editCuentaFoto');
        const inputNombre   = _qs('#editCuentaNombre');

        if (btnEditar)     btnEditar.addEventListener('click', abrirEditor);
        if (btnCerrarEdit) btnCerrarEdit.addEventListener('click', cerrarEditor);
        if (btnGuardar)    btnGuardar.addEventListener('click', guardarCambios);
        if (btnEliminar)   btnEliminar.addEventListener('click', eliminarCuenta);

        if (inputFoto) {
            inputFoto.addEventListener('change', async () => {
                const f = inputFoto.files[0];
                if (!f) return;
                try {
                    if (typeof window.procesarFoto !== 'function') {
                        throw new Error('procesarFoto no está disponible.');
                    }
                    _fotoTemp = await window.procesarFoto(f);
                    _pintarFotoPreview(_fotoTemp);
                } catch (e) {
                    alert('❌ ' + (e.message || 'No se pudo leer la imagen.'));
                }
            });
        }

        if (inputNombre) {
            inputNombre.addEventListener('input', (e) => {
                if (e.target.value.length > 40) {
                    e.target.value = e.target.value.slice(0, 40);
                }
            });
        }

        // Reset al cerrar el modal de config
        const btnCerrarConfig = _qs('#btnCerrarConfig');
        if (btnCerrarConfig) {
            btnCerrarConfig.addEventListener('click', () => {
                if (_qs('#cuentaEditarForm')?.style.display !== 'none') cerrarEditor();
            });
        }
    }

    // API pública
    window.ModifyAcount = {
        abrirEditor,
        cerrarEditor,
        guardarCambios,
        eliminarCuenta
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }
})();
