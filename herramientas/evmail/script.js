// ============================================================
//  EVmail — Correo interno entre los usuarios de VicWebOs
//  ------------------------------------------------------------
//  Datos:
//    - Mensajes:  app/evmail/evmail.json          (global)
//    - Imágenes:  app/evmail/evmail(imagen)/      (binarios)
//    - Usuarios:  cuenta.json                     (raíz del repo)
// ============================================================

'use strict';

const APP_ID = 'evmail';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const POLL_MS = 15000;
const MAX_TITULO = 120;
const MAX_PREVIEW = 60;

// ------------------------------------------------------------
//  Estado en memoria
// ------------------------------------------------------------
let datos = { version: 1, mensajes: [] };
let usuarioActual = null;
let tabActual = 'recibidos';
let filtroBusqueda = '';
let mensajeActualId = null;
let editandoId = null;
let listaUsuarios = [];
let archivoImagenPendiente = null;   // File si el usuario eligió uno nuevo
let quitarImagenEnEdicion = false;   // flag para cuando edita y quiere borrar
let pollTimer = null;
let toastTimeout = null;

// ------------------------------------------------------------
//  Acceso al shell
// ------------------------------------------------------------
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

function rutaImagen(nombre) {
    const mh = MH();
    if (mh && mh.rutas) return mh.rutas.imagen(APP_ID, nombre);
    return 'app/evmail/evmail(imagen)/' + nombre;
}

// ------------------------------------------------------------
//  Obtener cuentas registradas
// ------------------------------------------------------------
async function obtenerCuentas() {
    const bd = BD();
    if (!bd) return [];
    try {
        const data = await bd.leerArchivo('cuenta.json');
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

// ------------------------------------------------------------
//  Cargar mensajes
// ------------------------------------------------------------
async function cargarMensajes(desdeCache = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const data = desdeCache
            ? await bd.leerArchivo(rutaJSON())
            : await bd.leerArchivoFresh(rutaJSON());
        if (data && Array.isArray(data.mensajes)) {
            datos = normalizar(data);
        } else {
            datos = { version: 1, mensajes: [] };
        }
    } catch (e) {
        console.warn('[EVmail] No se pudieron cargar los mensajes:', e);
        datos = { version: 1, mensajes: [] };
    }
}

function normalizar(data) {
    if (!data || typeof data !== 'object') return { version: 1, mensajes: [] };
    if (!Array.isArray(data.mensajes)) data.mensajes = [];
    // Migración: si algún mensaje tiene "destinatario" string, lo pasamos a array
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
        return m;
    });
    return data;
}

function generarId() {
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// ------------------------------------------------------------
//  Escribir cambios de forma segura
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
//  Imágenes
// ------------------------------------------------------------
async function subirImagen(file, id) {
    const mh = MH();
    if (!mh) throw new Error('MasterHad no disponible.');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const nombre = 'ev_' + id + '.' + ext;
    const res = await mh.publicarImagen(APP_ID, file, { nombre });
    return res.nombre;
}

async function cargarImagen(nombre, imgElement) {
    try {
        const mh = MH();
        if (!mh) return;
        const url = await mh.leerImagenURL(rutaImagen(nombre));
        if (url) {
            imgElement.src = url;
            imgElement.onload = () => URL.revokeObjectURL(url);
        }
    } catch (e) {
        console.warn('[EVmail] No se pudo cargar la imagen:', e);
    }
}

async function borrarImagen(nombre) {
    if (!nombre) return;
    try {
        const mh = MH();
        if (!mh) return;
        await mh.borrarImagen(rutaImagen(nombre));
    } catch (e) {
        console.warn('[EVmail] No se pudo borrar la imagen:', e);
    }
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
    return String(str)
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

    // Marcar como leído si corresponde
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

    // Rellenar modal
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

    // Imagen
    const wrap = document.getElementById('verImagenWrap');
    wrap.innerHTML = '';
    if (m.imagen) {
        const img = document.createElement('img');
        wrap.appendChild(img);
        cargarImagen(m.imagen, img);
    }

    // Texto
    document.getElementById('verTexto').innerHTML = m.texto || '';

    // Botones según quién soy
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

function cerrarVer() {
    document.getElementById('modalVer').classList.remove('visible');
    mensajeActualId = null;
}

// ------------------------------------------------------------
//  Eliminar mensaje
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

    // Si tiene imagen, la borramos del repo
    if (m.imagen) {
        await borrarImagen(m.imagen);
    }
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
//  Editar mensaje
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
    archivoImagenPendiente = null;
    quitarImagenEnEdicion = false;

    document.getElementById('modalTitulo').textContent = 'Editar mensaje';
    document.getElementById('btnSubmit').innerHTML =
        '<i data-lucide="check"></i> Actualizar';
    document.getElementById('msgTitulo').value = m.titulo || '';

    const editor = document.getElementById('msgTexto');
    editor.innerHTML = m.texto || '';
    editor.classList.toggle('empty', !editor.textContent.trim());

    cargarDestinatarios(m.destinatarios || []);

    // Imagen actual
    const preview = document.getElementById('msgImagenPreview');
    const quitarBtn = document.getElementById('btnQuitarImagen');
    const nombreSpan = document.getElementById('msgImagenNombre');
    preview.innerHTML = '';
    preview.dataset.visible = 'false';

    if (m.imagen) {
        const img = document.createElement('img');
        preview.appendChild(img);
        preview.dataset.visible = 'true';
        preview.dataset.imagenActual = m.imagen;
        cargarImagen(m.imagen, img);
        quitarBtn.hidden = false;
        nombreSpan.textContent = 'Imagen actual';
    } else {
        quitarBtn.hidden = true;
        nombreSpan.textContent = 'Ningún archivo';
        delete preview.dataset.imagenActual;
    }

    document.getElementById('msgImagen').value = '';
    document.getElementById('modalNuevo').classList.add('visible');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => editor.focus(), 100);
}

// ------------------------------------------------------------
//  Nuevo mensaje
// ------------------------------------------------------------
function abrirNuevo(titulo = '', destinatarioPref = null) {
    editandoId = null;
    archivoImagenPendiente = null;
    quitarImagenEnEdicion = false;

    document.getElementById('modalTitulo').textContent = 'Nuevo mensaje';
    document.getElementById('btnSubmit').innerHTML =
        '<i data-lucide="send"></i> Enviar';
    document.getElementById('msgTitulo').value = titulo || '';

    const editor = document.getElementById('msgTexto');
    editor.innerHTML = '';
    editor.classList.add('empty');

    document.getElementById('msgImagen').value = '';
    document.getElementById('msgImagenNombre').textContent = 'Ningún archivo';
    const preview = document.getElementById('msgImagenPreview');
    preview.innerHTML = '';
    preview.dataset.visible = 'false';
    delete preview.dataset.imagenActual;
    document.getElementById('btnQuitarImagen').hidden = true;

    cargarDestinatarios(destinatarioPref ? [destinatarioPref] : []);

    document.getElementById('modalNuevo').classList.add('visible');
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => editor.focus(), 100);
}

function cerrarModalNuevo() {
    document.getElementById('modalNuevo').classList.remove('visible');
    editandoId = null;
    archivoImagenPendiente = null;
    quitarImagenEnEdicion = false;
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
//  Editor visual
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

    editor.addEventListener('focus', () => {
        editor.classList.remove('empty');
    });
    editor.addEventListener('blur', actualizarPlaceholderEditor);

    // Refrescar el placeholder tras cualquier input
    editor.addEventListener('input', actualizarPlaceholderEditor);
}

function actualizarPlaceholderEditor() {
    const editor = document.getElementById('msgTexto');
    if (!editor) return;
    const vacio = !editor.textContent.trim();
    editor.classList.toggle('empty', vacio);
}

// ------------------------------------------------------------
//  Previsualización de imagen
// ------------------------------------------------------------
function inicializarInputImagen() {
    const input = document.getElementById('msgImagen');
    if (!input) return;

    input.addEventListener('change', function () {
        const file = this.files[0];
        const nombreSpan = document.getElementById('msgImagenNombre');
        const preview = document.getElementById('msgImagenPreview');
        const quitarBtn = document.getElementById('btnQuitarImagen');

        preview.innerHTML = '';
        preview.dataset.visible = 'false';

        if (!file) {
            nombreSpan.textContent = 'Ningún archivo';
            quitarBtn.hidden = true;
            archivoImagenPendiente = null;
            return;
        }

        archivoImagenPendiente = file;
        nombreSpan.textContent = file.name;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.createElement('img');
            img.src = ev.target.result;
            preview.appendChild(img);
            preview.dataset.visible = 'true';
            quitarBtn.hidden = false;
        };
        reader.readAsDataURL(file);
    });
}

function inicializarBotonQuitarImagen() {
    const btn = document.getElementById('btnQuitarImagen');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const preview = document.getElementById('msgImagenPreview');
        const input = document.getElementById('msgImagen');
        const nombreSpan = document.getElementById('msgImagenNombre');

        preview.innerHTML = '';
        preview.dataset.visible = 'false';
        input.value = '';
        archivoImagenPendiente = null;
        nombreSpan.textContent = 'Ningún archivo';
        btn.hidden = true;

        if (editandoId && preview.dataset.imagenActual) {
            quitarImagenEnEdicion = true;
        }
    });
}

// ------------------------------------------------------------
//  Enviar / Actualizar
// ------------------------------------------------------------
async function enviarMensaje(e) {
    e.preventDefault();

    const titulo = document.getElementById('msgTitulo').value.trim();
    const editor = document.getElementById('msgTexto');
    const textoHTML = editor.innerHTML.trim();

    if (!titulo) {
        toast('Escribe un título.', 'error');
        return;
    }
    if (!textoHTML || textoHTML === '<br>') {
        toast('Escribe un mensaje.', 'error');
        return;
    }

    const checkboxes = document.querySelectorAll('#destinatariosContainer input[type="checkbox"]:checked');
    const destinatarios = Array.from(checkboxes).map(cb => cb.value);
    if (destinatarios.length === 0) {
        toast('Selecciona al menos un destinatario.', 'error');
        return;
    }

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
    let imagenNombre = null;
    if (archivoImagenPendiente) {
        imagenNombre = await subirImagen(archivoImagenPendiente, id);
    }

    const nuevo = {
        id,
        remitente: usuarioActual.codigo,
        remitenteNombre: usuarioActual.nombre,
        destinatarios,
        titulo,
        texto: textoHTML,
        imagen: imagenNombre,
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
    const m = datos.mensajes.find(x => x.id === id);
    if (!m) throw new Error('El mensaje ya no existe.');

    // Imagen: puede cambiar, quedar igual o eliminarse
    let imagenFinal = m.imagen;

    // 1) Si el usuario eligió una imagen nueva, borramos la vieja y subimos la nueva
    if (archivoImagenPendiente) {
        if (m.imagen) await borrarImagen(m.imagen);
        imagenFinal = await subirImagen(archivoImagenPendiente, id);
    }
    // 2) Si marcó quitar imagen y no subió otra, borramos la vieja
    else if (quitarImagenEnEdicion && m.imagen) {
        await borrarImagen(m.imagen);
        imagenFinal = null;
    }

    await mutarMensajes(d => {
        const msg = d.mensajes.find(x => x.id === id);
        if (!msg) return d;
        msg.titulo = titulo;
        msg.texto = textoHTML;
        if (msg.remitente === usuarioActual.codigo) {
            msg.destinatarios = destinatarios;
        }
        msg.imagen = imagenFinal;
        msg.editado = true;
        msg.editadoFecha = new Date().toISOString();
        return d;
    });
}

// ------------------------------------------------------------
//  Tabs y búsqueda
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

// ------------------------------------------------------------
//  Polling
// ------------------------------------------------------------
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
        // Solo re-renderizamos si cambió algo
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

    // Cargar mensajes
    await cargarMensajes(true);
    renderizar();

    // Eventos
    inicializarTabs();
    inicializarBusqueda();
    inicializarEditor();
    inicializarInputImagen();
    inicializarBotonQuitarImagen();

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
