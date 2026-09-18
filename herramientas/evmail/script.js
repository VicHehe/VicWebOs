// ============================================================
//  EVmail — Correo interno entre los usuarios de VicWebOs
//  ------------------------------------------------------------
//  Datos:
//    - Mensajes:  app/evmail/evmail.json        (global)
//    - Imágenes:  ya NO sube nada. Usa ids de la Galería.
//    - Usuarios:  cuenta.json (raíz del repo)
// ============================================================

'use strict';

const APP_ID = 'evmail';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const POLL_MS = 15000;
const MAX_PREVIEW = 60;

let datos = { version: 1, mensajes: [] };
let usuarioActual = null;
let tabActual = 'recibidos';
let filtroBusqueda = '';
let mensajeActualId = null;
let editandoId = null;
let listaUsuarios = [];
let imagenIdPendiente = null;   // id de la imagen elegida en la Galería
let pollTimer = null;
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;
const MH  = () => window.parent.MasterHad || null;

// ------------------------------------------------------------
//  Tema
// ------------------------------------------------------------
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300',
            '--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt',
            '--gray-50','--gray-100','--gray-200','--gray-300','--gray-400',
            '--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3',
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ------------------------------------------------------------
//  Toast
// ------------------------------------------------------------
function toast(texto, tipo = 'info') {
    const el = document.getElementById('evmailToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'evmail-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
//  Rutas
// ------------------------------------------------------------
function rutaJSON() {
    const mh = MH();
    if (mh && mh.rutas) return mh.rutas.jsonGlobal(APP_ID);
    return 'app/evmail/evmail.json';
}

// ------------------------------------------------------------
//  Cuentas
// ------------------------------------------------------------
async function obtenerCuentas() {
    const bd = BD();
    if (!bd) return [];
    try {
        const data = await bd.leerArchivo('cuenta.json');
        return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
}

// ------------------------------------------------------------
//  Cargar / normalizar mensajes
// ------------------------------------------------------------
async function cargarMensajes(desdeCache = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = desdeCache
            ? await bd.leerArchivo(rutaJSON())
            : await bd.leerArchivoFresh(rutaJSON());
        datos = normalizar(data);
    } catch (e) {
        console.warn('[EVmail] Error cargando:', e);
        datos = { version: 1, mensajes: [] };
    }
}

function normalizar(data) {
    if (!data || typeof data !== 'object') return { version: 1, mensajes: [] };
    if (!Array.isArray(data.mensajes)) data.mensajes = [];
    data.mensajes = data.mensajes.map(m => {
        if (typeof m.destinatario === 'string') {
            m.destinatarios = [m.destinatario];
            delete m.destinatario;
        } else if (Array.isArray(m.destinatario)) {
            m.destinatarios = m.destinatario;
            delete m.destinatario;
        }
        if (!Array.isArray(m.destinatarios)) m.destinatarios = [];
        m.leido = !!m.leido;
        m.editado = !!m.editado;
        if (!m.id) m.id = generarId();
        // Migración: si hay "imagen" (nombre de archivo viejo), lo descartamos
        if ('imagen' in m && !('imagenId' in m)) {
            m.imagenId = null;
            delete m.imagen;
        }
        if (!('imagenId' in m)) m.imagenId = null;
        return m;
    });
    return data;
}

function generarId() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ------------------------------------------------------------
//  Escritura segura con merge
// ------------------------------------------------------------
async function mutarMensajes(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const ruta = rutaJSON();
    const resultado = await bd.actualizarArchivo(ruta, (actual) => {
        if (!actual || typeof actual !== 'object') actual = { version: 1, mensajes: [] };
        if (!Array.isArray(actual.mensajes)) actual.mensajes = [];
        actual = mutador(actual);
        actual.actualizado = new Date().toISOString();
        return actual;
    });
    datos = normalizar(resultado);
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function renderizar() {
    const cont = document.getElementById('mensajesList');
    if (!cont || !usuarioActual) return;

    let lista = [];
    if (tabActual === 'recibidos') {
        lista = datos.mensajes.filter(m =>
            Array.isArray(m.destinatarios) && m.destinatarios.includes(usuarioActual.codigo)
        );
    } else {
        lista = datos.mensajes.filter(m => m.remitente === usuarioActual.codigo);
    }

    if (filtroBusqueda) {
        const f = filtroBusqueda.toLowerCase();
        lista = lista.filter(m => {
            const t = (m.titulo || '').toLowerCase();
            const r = (m.remitenteNombre || m.remitente || '').toLowerCase();
            return t.includes(f) || r.includes(f);
        });
    }

    lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="empty-state">
                <i data-lucide="inbox"></i>
                <span>No hay mensajes en esta bandeja</span>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        actualizarBadgeNoLeidos();
        return;
    }

    cont.innerHTML = lista.map(m => {
        const esNoLeido = tabActual === 'recibidos' && !m.leido;
        const remitente = m.remitente === usuarioActual.codigo
            ? 'Tú'
            : (m.remitenteNombre || m.remitente);
        const preview = (m.texto || '').replace(/<[^>]*>/g, '').trim().slice(0, MAX_PREVIEW);
        const previewText = preview + (preview.length >= MAX_PREVIEW ? '...' : '');
        const fecha = formatearFecha(m.fecha);
        const editadoIcon = m.editado ? '<i data-lucide="pencil"></i>' : '';
        const destinoStr = (tabActual === 'enviados' && m.destinatarios.length > 0)
            ? ` → ${m.destinatarios.join(', ')}`
            : '';

        return `
            <div class="msg-item ${esNoLeido ? 'no-leido' : ''}" data-id="${m.id}">
                <div class="msg-info">
                    <div class="msg-titulo">
                        ${escapeHTML(m.titulo || 'Sin título')}
                        ${editadoIcon}
                    </div>
                    <div class="msg-preview">
                        ${escapeHTML(previewText)}${escapeHTML(destinoStr)}
                    </div>
                </div>
                <div class="msg-meta">
                    <span>${escapeHTML(remitente)}</span>
                    <span>${fecha}</span>
                    ${esNoLeido ? '<span class="no-leido-dot"></span>' : ''}
                    ${m.leido && tabActual === 'recibidos' ? '<span class="leido-tick"><i data-lucide="check"></i></span>' : ''}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.msg-item').forEach(el => {
        el.addEventListener('click', () => verMensaje(el.dataset.id));
    });

    actualizarBadgeNoLeidos();
}

function actualizarBadgeNoLeidos() {
    const badge = document.getElementById('noLeidosBadge');
    if (!badge || !usuarioActual) return;
    const noLeidos = datos.mensajes.filter(m =>
        Array.isArray(m.destinatarios) &&
        m.destinatarios.includes(usuarioActual.codigo) &&
        !m.leido
    ).length;
    if (noLeidos > 0) {
        badge.textContent = noLeidos;
        badge.classList.add('visible');
    } else {
        badge.textContent = '';
        badge.classList.remove('visible');
    }
}

function formatearFecha(iso) {
    const d = new Date(iso);
    const ahora = new Date();
    const diff = Math.floor((ahora - d) / 1000);
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function escapeHTML(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ------------------------------------------------------------
//  Ver mensaje
// ------------------------------------------------------------
async function verMensaje(id) {
    const m = datos.mensajes.find(x => x.id === id);
    if (!m) return;
    mensajeActualId = id;

    if (tabActual === 'recibidos' && !m.leido) {
        try {
            await mutarMensajes(d => {
                const msg = d.mensajes.find(x => x.id === id);
                if (msg) msg.leido = true;
                return d;
            });
        } catch (e) {
            console.warn('[EVmail] No se pudo marcar como leído:', e);
        }
        renderizar();
    }

    document.getElementById('verTitulo').textContent = m.titulo || 'Sin título';
    document.getElementById('verRemitente').innerHTML =
        `<i data-lucide="user"></i> ${escapeHTML(m.remitenteNombre || m.remitente)}`;
    const destinos = m.destinatarios.length > 0 ? m.destinatarios.join(', ') : 'Sin destinatarios';
    document.getElementById('verDestinatarios').innerHTML =
        `<i data-lucide="users"></i> ${escapeHTML(destinos)}`;
    document.getElementById('verFecha').innerHTML =
        `<i data-lucide="clock"></i> ${new Date(m.fecha).toLocaleString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        })}`;

    const editadoSpan = document.getElementById('verEditado');
    editadoSpan.innerHTML = m.editado ? '<i data-lucide="pencil"></i> Editado' : '';

    const leidoSpan = document.getElementById('verLeido');
    leidoSpan.innerHTML = m.leido
        ? '<i data-lucide="check-check"></i> Leído'
        : '<i data-lucide="circle-dot"></i> No leído';
    leidoSpan.style.marginLeft = 'auto';

    // Imagen desde la Galería
    const wrap = document.getElementById('verImagenWrap');
    wrap.innerHTML = '';
    if (m.imagenId) {
        const img = document.createElement('img');
        img.alt = '';
        wrap.appendChild(img);
        cargarImagenGaleria(m.imagenId, img);
    }

    document.getElementById('verTexto').innerHTML = m.texto || '';

    const btnResponder = document.getElementById('btnResponder');
    const btnEditar = document.getElementById('btnEditar');
    const btnEliminar = document.getElementById('btnEliminar');
    const esMio = m.remitente === usuarioActual.codigo;

    btnEditar.hidden = !esMio;
    btnEliminar.hidden = !esMio;
    btnResponder.hidden = esMio;

    document.getElementById('modalVer').classList.add('visible');
    if (window.lucide) window.lucide.createIcons();
}

async function cargarImagenGaleria(imagenId, imgElement) {
    try {
        const mh = MH();
        if (!mh) return;
        const url = await mh.galeria.leerImagenURL(imagenId);
        if (!url) {
            imgElement.alt = 'Imagen no disponible';
            imgElement.style.display = 'none';
            return;
        }
        imgElement.src = url;
        imgElement.onload = () => URL.revokeObjectURL(url);
    } catch (e) {
        console.warn('[EVmail] No se pudo cargar la imagen:', e);
    }
}

function cerrarVer() {
    document.getElementById('modalVer').classList.remove('visible');
    mensajeActualId = null;
}

// ------------------------------------------------------------
//  Eliminar
// ------------------------------------------------------------
async function eliminarMensaje() {
    if (!mensajeActualId) return;
    const m = datos.mensajes.find(x => x.id === mensajeActualId);
    if (!m) return;
    if (m.remitente !== usuarioActual.codigo) {
        toast('Solo puedes eliminar tus propios mensajes.', 'error');
        return;
    }
    if (!confirm('¿Eliminar este mensaje permanentemente?')) return;

    // Nota: NO borramos la imagen de la Galería.
    // Puede estar en otros mensajes o el usuario querer conservarla.
    try {
        await mutarMensajes(d => {
            d.mensajes = d.mensajes.filter(x => x.id !== mensajeActualId);
            return d;
        });
        toast('Mensaje eliminado', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
        return;
    }
    cerrarVer();
    renderizar();
}

// ------------------------------------------------------------
//  Editar
// ------------------------------------------------------------
function editarMensaje() {
    const m = datos.mensajes.find(x => x.id === mensajeActualId);
    if (!m) return;
    if (m.remitente !== usuarioActual.codigo) {
        toast('Solo puedes editar tus propios mensajes.', 'error');
        return;
    }

    cerrarVer();
    editandoId = m.id;
    imagenIdPendiente = m.imagenId || null;

    document.getElementById('modalTitulo').textContent = 'Editar mensaje';
    document.getElementById('btnSubmit').innerHTML =
        '<i data-lucide="check"></i> Actualizar';
    document.getElementById('msgTitulo').value = m.titulo || '';

    const editor = document.getElementById('msgTexto');
    editor.innerHTML = m.texto || '';
    editor.classList.toggle('empty', !editor.textContent.trim());

    cargarDestinatarios(m.destinatarios || []);
    actualizarPreviewImagen();

    document.getElementById('modalNuevo').classList.add('visible');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => editor.focus(), 100);
}

// ------------------------------------------------------------
//  Nuevo
// ------------------------------------------------------------
function abrirNuevo(titulo = '', destinatarioPref = null) {
    editandoId = null;
    imagenIdPendiente = null;

    document.getElementById('modalTitulo').textContent = 'Nuevo mensaje';
    document.getElementById('btnSubmit').innerHTML =
        '<i data-lucide="send"></i> Enviar';
    document.getElementById('msgTitulo').value = titulo || '';

    const editor = document.getElementById('msgTexto');
    editor.innerHTML = '';
    editor.classList.add('empty');

    cargarDestinatarios(destinatarioPref ? [destinatarioPref] : []);
    actualizarPreviewImagen();

    document.getElementById('modalNuevo').classList.add('visible');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => editor.focus(), 100);
}

function cerrarModalNuevo() {
    document.getElementById('modalNuevo').classList.remove('visible');
    editandoId = null;
    imagenIdPendiente = null;
}

// ------------------------------------------------------------
//  Destinatarios
// ------------------------------------------------------------
async function cargarDestinatarios(seleccionados = []) {
    const cont = document.getElementById('destinatariosContainer');
    if (!cont) return;
    const cuentas = await obtenerCuentas();
    listaUsuarios = cuentas.filter(u => u.codigo !== usuarioActual.codigo);

    if (listaUsuarios.length === 0) {
        cont.innerHTML = '<span style="color:var(--ev-text-soft);font-size:12.5px;">No hay otros usuarios registrados.</span>';
        return;
    }

    cont.innerHTML = listaUsuarios.map(u => `
        <label class="destinatario-checkbox">
            <input type="checkbox" value="${escapeHTML(u.codigo)}"
                ${seleccionados.includes(u.codigo) ? 'checked' : ''}>
            ${escapeHTML(u.nombre)} (${escapeHTML(u.codigo)})
        </label>
    `).join('');
}

// ------------------------------------------------------------
//  Editor
// ------------------------------------------------------------
function inicializarEditor() {
    const editor = document.getElementById('msgTexto');
    const toolbar = document.querySelector('.editor-toolbar');
    if (!editor || !toolbar) return;

    toolbar.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        e.preventDefault();
        document.execCommand(btn.dataset.cmd, false, null);
        editor.focus();
        actualizarPlaceholderEditor();
    });

    editor.addEventListener('focus', () => editor.classList.remove('empty'));
    editor.addEventListener('blur', actualizarPlaceholderEditor);
    editor.addEventListener('input', actualizarPlaceholderEditor);
}

function actualizarPlaceholderEditor() {
    const editor = document.getElementById('msgTexto');
    if (!editor) return;
    editor.classList.toggle('empty', !editor.textContent.trim());
}

// ------------------------------------------------------------
//  Imagen: elegir desde Galería
// ------------------------------------------------------------
async function elegirImagenDeGaleria() {
    const mh = MH();
    if (!mh) {
        toast('MasterHad no disponible.', 'error');
        return;
    }
    try {
        const id = await mh.galeria.abrirPicker({
            multiple: false,
            titulo: 'Elige una imagen para tu mensaje'
        });
        if (!id) return; // cancelado
        imagenIdPendiente = id;
        actualizarPreviewImagen();
    } catch (e) {
        console.warn('[EVmail] Error en picker:', e);
        toast('No se pudo abrir la galería', 'error');
    }
}

async function actualizarPreviewImagen() {
    const wrap = document.getElementById('msgImagenPreview');
    const img = document.getElementById('msgImagenPreviewImg');
    const nombre = document.getElementById('msgImagenNombre');
    const btnQuitar = document.getElementById('btnQuitarImagen');

    if (!imagenIdPendiente) {
        wrap.hidden = true;
        btnQuitar.hidden = true;
        img.removeAttribute('src');
        nombre.textContent = '';
        return;
    }

    wrap.hidden = false;
    btnQuitar.hidden = false;

    // Cargar datos y miniatura
    try {
        const mh = MH();
        const meta = await mh.galeria.obtenerImagen(imagenIdPendiente);
        nombre.textContent = meta ? (meta.nombre || meta.archivo) : imagenIdPendiente;

        const url = await mh.galeria.leerImagenURL(imagenIdPendiente);
        if (url) {
            img.src = url;
            img.onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[EVmail] Error preview:', e);
        nombre.textContent = 'Imagen seleccionada';
    }
}

function quitarImagenSeleccionada() {
    imagenIdPendiente = null;
    actualizarPreviewImagen();
}

// ------------------------------------------------------------
//  Enviar / Actualizar
// ------------------------------------------------------------
async function enviarMensaje(e) {
    e.preventDefault();

    const titulo = document.getElementById('msgTitulo').value.trim();
    const editor = document.getElementById('msgTexto');
    const textoHTML = editor.innerHTML.trim();

    if (!titulo) { toast('Escribe un título.', 'error'); return; }
    if (!textoHTML || textoHTML === '<br>') { toast('Escribe un mensaje.', 'error'); return; }

    const checkboxes = document.querySelectorAll('#destinatariosContainer input[type="checkbox"]:checked');
    const destinatarios = Array.from(checkboxes).map(cb => cb.value);
    if (destinatarios.length === 0) { toast('Selecciona al menos un destinatario.', 'error'); return; }

    const btn = document.getElementById('btnSubmit');
    if (btn.disabled) return;
    const txtOriginal = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
    if (window.lucide) window.lucide.createIcons();

    try {
        if (editandoId) {
            await actualizarMensaje(editandoId, { titulo, textoHTML, destinatarios });
            toast('Mensaje actualizado', 'success');
        } else {
            await crearMensaje({ titulo, textoHTML, destinatarios });
            toast('Mensaje enviado', 'success');
        }
        cerrarModalNuevo();
        renderizar();
    } catch (err) {
        console.warn('[EVmail] Error al guardar:', err);
        toast(err.message || 'No se pudo guardar', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = txtOriginal;
        if (window.lucide) window.lucide.createIcons();
    }
}

async function crearMensaje({ titulo, textoHTML, destinatarios }) {
    const id = generarId();
    const nuevo = {
        id,
        remitente: usuarioActual.codigo,
        remitenteNombre: usuarioActual.nombre,
        destinatarios,
        titulo,
        texto: textoHTML,
        imagenId: imagenIdPendiente || null,
        fecha: new Date().toISOString(),
        leido: false,
        editado: false
    };

    await mutarMensajes(d => {
        d.mensajes.push(nuevo);
        return d;
    });

    // Notificar a cada destinatario
    const api = API();
    if (api && typeof api.enviarNotificacion === 'function') {
        for (const cod of destinatarios) {
            try {
                await api.enviarNotificacion(
                    'evmail',
                    `${usuarioActual.nombre}: ${titulo}`,
                    cod
                );
            } catch (e) {
                console.warn('[EVmail] No se pudo notificar a ' + cod + ':', e);
            }
        }
    }
}

async function actualizarMensaje(id, { titulo, textoHTML, destinatarios }) {
    await mutarMensajes(d => {
        const msg = d.mensajes.find(x => x.id === id);
        if (!msg) throw new Error('El mensaje ya no existe.');
        msg.titulo = titulo;
        msg.texto = textoHTML;
        msg.imagenId = imagenIdPendiente || null;
        msg.editado = true;
        msg.editadoFecha = new Date().toISOString();
        if (msg.remitente === usuarioActual.codigo) {
            msg.destinatarios = destinatarios;
        }
        return d;
    });
}

// ------------------------------------------------------------
//  Tabs, búsqueda, polling
// ------------------------------------------------------------
function inicializarTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            renderizar();
        });
    });
}

function inicializarBusqueda() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', (e) => {
        filtroBusqueda = e.target.value.trim();
        renderizar();
    });
}

function iniciarPolling() {
    detenerPolling();
    pollTimer = setInterval(() => {
        if (document.hidden) return;
        checkNuevos().catch(() => {});
    }, POLL_MS);
}

function detenerPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function checkNuevos() {
    const bd = BD();
    if (!bd || !usuarioActual) return;
    try {
        const data = await bd.leerArchivoFresh(rutaJSON());
        if (!data || !Array.isArray(data.mensajes)) return;
        const nuevo = normalizar(data);
        if (JSON.stringify(nuevo.mensajes) !== JSON.stringify(datos.mensajes)) {
            datos = nuevo;
            renderizar();
        }
    } catch (e) { /* silencioso */ }
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('EVmail necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('evmailUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar EVmail.');
        return;
    }

    await cargarMensajes(true);
    renderizar();

    inicializarTabs();
    inicializarBusqueda();
    inicializarEditor();

    document.getElementById('btnNuevoMensaje')
        ?.addEventListener('click', () => abrirNuevo());
    document.getElementById('btnCancelar')
        ?.addEventListener('click', cerrarModalNuevo);
    document.getElementById('btnCerrarVer')
        ?.addEventListener('click', cerrarVer);
    document.getElementById('btnEliminar')
        ?.addEventListener('click', eliminarMensaje);
    document.getElementById('btnEditar')
        ?.addEventListener('click', editarMensaje);
    document.getElementById('btnResponder')
        ?.addEventListener('click', () => {
            const m = datos.mensajes.find(x => x.id === mensajeActualId);
            if (!m) return;
            cerrarVer();
            abrirNuevo(`Re: ${m.titulo || ''}`, m.remitente);
        });
    document.getElementById('formMensaje')
        ?.addEventListener('submit', enviarMensaje);

    // Picker de imágenes
    document.getElementById('btnElegirImagen')
        ?.addEventListener('click', elegirImagenDeGaleria);
    document.getElementById('btnQuitarImagen')
        ?.addEventListener('click', quitarImagenSeleccionada);

    // Cerrar modales al hacer click fuera
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('visible');
                if (overlay.id === 'modalNuevo') cerrarModalNuevo();
                if (overlay.id === 'modalVer') cerrarVer();
            }
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkNuevos().catch(() => {});
    });

    iniciarPolling();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
