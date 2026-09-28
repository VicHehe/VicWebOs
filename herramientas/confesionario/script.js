// ============================================================
//  El Confesionario — Mural anónimo de la comunidad
//  ------------------------------------------------------------
//  · 1 JSON global: app/confesionario/confesionario.json
//  · Cada confesión guarda autorReal (nunca mostrado) para:
//      - Marcarla como "tuya" al autor
//      - Prevenir doble-reacción por usuario
//      - Permitir borrado por el autor
//      - Enviar notificaciones internas
//  · Alias visible = 3 caracteres random generados al publicar
//  · 6 reacciones fijas con emojis
//  · Comentarios anónimos (alias propio por comentario)
//  · 3+ reportes → oculta para todos menos el autor
// ============================================================

'use strict';

const MENSAJE_TEMA   = 'vicwebos_tema_cambio';
const RUTA_DATA      = 'app/confesionario/confesionario.json';
const RUTA_CUENTAS   = 'cuenta.json';

const MAX_TEXTO      = 500;
const MAX_COMENTARIO = 200;
const UMBRAL_REPORTES = 3;

const REACCIONES = ['😱', '😂', '😢', '🤔', '🔥', '👀'];

const CATEGORIAS = {
    amor:     { nombre: 'Amor',     icono: 'heart' },
    trabajo:  { nombre: 'Trabajo',  icono: 'briefcase' },
    familia:  { nombre: 'Familia',  icono: 'home' },
    secretos: { nombre: 'Secretos', icono: 'lock' },
    random:   { nombre: 'Random',   icono: 'shuffle' }
};

// ---------- ESTADO ----------
let usuarioActual = null;
let usuariosPorCodigo = {};
let confesiones = [];

let filtroCategoria = 'todas';
let soloMias = false;

let verActualId = null;
let catNueva = 'amor';
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  TEMA
// ============================================================
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
            '--shadow-glow',
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
    if (e.data?.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  HELPERS
// ============================================================
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function generarId(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function generarAlias() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}
function tiempoRelativo(iso) {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30) return 'ahora';
    if (diff < 60) return `hace ${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `hace ${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `hace ${dias}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('cfToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'cf-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  CARGA / ESCRITURA
// ============================================================
async function cargarCuentas() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivo(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) { /* silencioso */ }
}

async function cargarConfesiones(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_DATA) : await bd.leerArchivo(RUTA_DATA);
        confesiones = normalizar(d);
    } catch (e) {
        confesiones = [];
    }
}

function normalizar(d) {
    if (!d || typeof d !== 'object') return [];
    if (!Array.isArray(d.confesiones)) return [];
    return d.confesiones
        .filter(c => c && c.id && c.texto)
        .map(c => ({
            id: c.id,
            autorReal: c.autorReal || null,
            alias: c.alias || generarAlias(),
            texto: String(c.texto || '').slice(0, MAX_TEXTO),
            categoria: CATEGORIAS[c.categoria] ? c.categoria : 'random',
            creado: c.creado || new Date().toISOString(),
            reacciones: c.reacciones && typeof c.reacciones === 'object' ? c.reacciones : {},
            comentarios: Array.isArray(c.comentarios) ? c.comentarios : [],
            reportes: Array.isArray(c.reportes) ? c.reportes : []
        }));
}

async function mutarConfesiones(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_DATA, (a) => {
        if (!a || typeof a !== 'object') a = { version: 1, confesiones: [] };
        if (!Array.isArray(a.confesiones)) a.confesiones = [];
        a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    confesiones = normalizar(r);
}

// ============================================================
//  HELPERS DE ESTADO
// ============================================================
function estaReportada(c) {
    return (c.reportes || []).length >= UMBRAL_REPORTES;
}
function esMia(c) {
    return c.autorReal === usuarioActual.codigo;
}
function esVisibleParaMi(c) {
    if (esMia(c)) return true;
    return !estaReportada(c);
}
function puedoReportar(c) {
    if (esMia(c)) return false;
    return !(c.reportes || []).includes(usuarioActual.codigo);
}
function miReaccion(c, emoji) {
    return (c.reacciones?.[emoji] || []).includes(usuarioActual.codigo);
}
function contarReaccion(c, emoji) {
    return (c.reacciones?.[emoji] || []).length;
}
function totalComentarios(c) {
    return Array.isArray(c.comentarios) ? c.comentarios.length : 0;
}

// ============================================================
//  FEED
// ============================================================
function filtrar() {
    let l = confesiones.slice();
    l = l.filter(esVisibleParaMi);

    if (soloMias) {
        l = l.filter(esMia);
    } else if (filtroCategoria !== 'todas') {
        l = l.filter(c => c.categoria === filtroCategoria);
    }

    l.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    return l;
}

function renderFeed() {
    const feed = document.getElementById('cfFeed');
    const empty = document.getElementById('cfEmpty');
    const emptyTitulo = document.getElementById('cfEmptyTitulo');
    const emptyDesc = document.getElementById('cfEmptyDesc');
    if (!feed) return;

    feed.innerHTML = '';
    const lista = filtrar();

    if (lista.length === 0) {
        empty.hidden = false;
        if (confesiones.length === 0) {
            emptyTitulo.textContent = 'Nadie se animó todavía';
            emptyDesc.textContent = 'Sé el primero en soltar algo al aire. Nadie sabrá que fuiste vos.';
        } else if (soloMias) {
            emptyTitulo.textContent = 'No tenés confesiones';
            emptyDesc.textContent = 'Cuando publiques algo, aparecerá acá.';
        } else {
            emptyTitulo.textContent = 'Nada por acá';
            emptyDesc.textContent = 'Probá con otra categoría.';
        }
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    lista.forEach(c => feed.appendChild(crearCard(c)));
    if (window.lucide) window.lucide.createIcons();
}

function crearCard(c) {
    const wrap = document.createElement('div');
    wrap.className = 'cf-card' + (esMia(c) ? ' mia' : '');
    wrap.dataset.id = c.id;

    const cat = CATEGORIAS[c.categoria];

    // HEAD
    const head = document.createElement('div');
    head.className = 'cf-card-head';

    const meta = document.createElement('div');
    meta.className = 'cf-card-meta';
    meta.innerHTML = `
        <span class="cf-badge ${c.categoria}">
            <i data-lucide="${cat.icono}"></i>
            ${cat.nombre}
        </span>
        <span class="cf-alias">Anónimo #${escapar(c.alias)}</span>
        <span class="cf-card-tiempo">${tiempoRelativo(c.creado)}</span>
    `;
    head.appendChild(meta);

    if (esMia(c)) {
        const tag = document.createElement('span');
        tag.className = 'cf-card-tag-yo';
        tag.innerHTML = '<i data-lucide="user"></i> Tuya';
        head.appendChild(tag);
    }
    wrap.appendChild(head);

    // TEXTO
    const txt = document.createElement('div');
    txt.className = 'cf-card-texto';
    txt.textContent = c.texto;
    wrap.appendChild(txt);

    // FOOT (reacciones + comentarios)
    const foot = document.createElement('div');
    foot.className = 'cf-card-foot';

    REACCIONES.forEach(emoji => {
        const count = contarReaccion(c, emoji);
        const mia = miReaccion(c, emoji);
        const btn = document.createElement('button');
        btn.className = 'cf-reaccion' + (mia ? ' mia' : '');
        btn.innerHTML = `${emoji}<span class="cf-reaccion-count">${count || ''}</span>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleReaccion(c.id, emoji);
        });
        foot.appendChild(btn);
    });

    const comentariosInfo = document.createElement('span');
    comentariosInfo.className = 'cf-card-comentarios';
    comentariosInfo.innerHTML = `<i data-lucide="message-circle"></i> ${totalComentarios(c)}`;
    foot.appendChild(comentariosInfo);

    wrap.appendChild(foot);

    // Abrir modal al hacer click (pero no en botones de reacción)
    wrap.addEventListener('click', (e) => {
        if (e.target.closest('.cf-reaccion')) return;
        abrirModalVer(c.id);
    });

    return wrap;
}

// ============================================================
//  REACCIONAR
// ============================================================
async function toggleReaccion(confId, emoji) {
    const c = confesiones.find(x => x.id === confId);
    if (!c) return;
    const yo = usuarioActual.codigo;
    const yaReaccione = miReaccion(c, emoji);

    try {
        await mutarConfesiones((a) => {
            const conf = a.confesiones.find(x => x.id === confId);
            if (!conf) return a;
            if (!conf.reacciones || typeof conf.reacciones !== 'object') conf.reacciones = {};
            if (!Array.isArray(conf.reacciones[emoji])) conf.reacciones[emoji] = [];

            if (yaReaccione) {
                conf.reacciones[emoji] = conf.reacciones[emoji].filter(cod => cod !== yo);
            } else if (!conf.reacciones[emoji].includes(yo)) {
                conf.reacciones[emoji].push(yo);
            }
            return a;
        });

        renderFeed();

        // Notificar al autor si es nuevo y no es mi propia confesión
        if (!yaReaccione && c.autorReal && c.autorReal !== yo) {
            API()?.enviarNotificacion?.(
                'confesionario',
                `Alguien reaccionó ${emoji} a tu confesión anónima`,
                c.autorReal
            ).catch(() => {});
        }
    } catch (e) {
        toast('No se pudo guardar la reacción', 'error');
    }
}

// ============================================================
//  MODAL: NUEVA CONFESIÓN
// ============================================================
function abrirModalNueva() {
    catNueva = 'amor';
    document.getElementById('cfNuevaTexto').value = '';
    document.getElementById('cfNuevaContador').textContent = '0 / ' + MAX_TEXTO;
    document.getElementById('cfNuevaMensaje').textContent = '';
    document.getElementById('cfNuevaMensaje').className = 'cf-modal-mensaje';
    actualizarCatPicker();
    document.getElementById('cfModalNueva').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('cfNuevaTexto').focus(), 100);
}
function cerrarModalNueva() {
    document.getElementById('cfModalNueva').hidden = true;
}
function actualizarCatPicker() {
    document.querySelectorAll('#cfCatPicker .cf-cat-opcion').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === catNueva);
    });
}
async function publicarConfesion() {
    const texto = document.getElementById('cfNuevaTexto').value.trim();
    const msj = document.getElementById('cfNuevaMensaje');
    msj.textContent = ''; msj.className = 'cf-modal-mensaje';

    if (!texto) {
        msj.textContent = 'Escribí algo antes de publicar.';
        msj.className = 'cf-modal-mensaje error';
        return;
    }

    const btn = document.getElementById('cfNuevaPublicar');
    if (btn.disabled) return;
    btn.disabled = true;

    const nueva = {
        id: generarId('conf'),
        autorReal: usuarioActual.codigo,
        alias: generarAlias(),
        texto: texto.slice(0, MAX_TEXTO),
        categoria: catNueva,
        creado: new Date().toISOString(),
        reacciones: {},
        comentarios: [],
        reportes: []
    };

    try {
        await mutarConfesiones((a) => {
            a.confesiones.unshift(nueva);
            return a;
        });
        cerrarModalNueva();
        renderFeed();
        toast('Confesión publicada', 'success');
    } catch (e) {
        msj.textContent = e.message || 'No se pudo publicar.';
        msj.className = 'cf-modal-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  MODAL: VER CONFESIÓN
// ============================================================
function abrirModalVer(id) {
    verActualId = id;
    renderModalVer();
    document.getElementById('cfModalVer').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}
function cerrarModalVer() {
    document.getElementById('cfModalVer').hidden = true;
    verActualId = null;
}
function renderModalVer() {
    const cont = document.getElementById('cfVerBody');
    if (!cont || !verActualId) return;
    const c = confesiones.find(x => x.id === verActualId);
    if (!c) { cerrarModalVer(); return; }

    const cat = CATEGORIAS[c.categoria];
    const mia = esMia(c);

    // Confesión (arriba)
    let html = `
        <div class="cf-ver-confesion">
            <div class="cf-card-head">
                <div class="cf-card-meta">
                    <span class="cf-badge ${c.categoria}">
                        <i data-lucide="${cat.icono}"></i>
                        ${cat.nombre}
                    </span>
                    <span class="cf-alias">Anónimo #${escapar(c.alias)}</span>
                    <span class="cf-card-tiempo">${tiempoRelativo(c.creado)}</span>
                </div>
                ${mia ? '<span class="cf-card-tag-yo"><i data-lucide="user"></i> Tuya</span>' : ''}
            </div>
            <div class="cf-ver-texto">${escapar(c.texto)}</div>
            <div class="cf-ver-reacciones" id="cfVerReacciones"></div>
        </div>
    `;

    // Comentarios
    html += `
        <div class="cf-ver-seccion-titulo">
            <i data-lucide="message-circle"></i>
            <span>Comentarios · ${totalComentarios(c)}</span>
        </div>
        <div class="cf-comentarios" id="cfVerComentarios"></div>
        <div class="cf-ver-input-wrap">
            <input type="text" id="cfVerInputComentario" maxlength="${MAX_COMENTARIO}"
                   placeholder="Escribí un comentario anónimo...">
            <button class="cf-btn-enviar" id="cfVerBtnEnviar" disabled>
                <i data-lucide="send"></i>
            </button>
        </div>
    `;

    // Footer (borrar / reportar)
    html += `<div class="cf-ver-footer" id="cfVerFooter"></div>`;

    cont.innerHTML = html;

    // Render reacciones
    const reacCont = document.getElementById('cfVerReacciones');
    REACCIONES.forEach(emoji => {
        const count = contarReaccion(c, emoji);
        const m = miReaccion(c, emoji);
        const btn = document.createElement('button');
        btn.className = 'cf-reaccion' + (m ? ' mia' : '');
        btn.innerHTML = `${emoji}<span class="cf-reaccion-count">${count || ''}</span>`;
        btn.addEventListener('click', () => {
            toggleReaccion(c.id, emoji);
            renderModalVer();
        });
        reacCont.appendChild(btn);
    });

    // Render comentarios
    const comCont = document.getElementById('cfVerComentarios');
    const comentarios = (c.comentarios || []).slice().sort((a, b) =>
        new Date(a.creado) - new Date(b.creado)
    );
    if (comentarios.length === 0) {
        comCont.innerHTML = `
            <div class="cf-comentario-vacio">
                <i data-lucide="message-circle"></i>
                <p>Sé el primero en comentar. Nadie sabrá que fuiste vos.</p>
            </div>
        `;
    } else {
        comentarios.forEach(com => {
            const esMioCom = com.autorReal === usuarioActual.codigo;
            const item = document.createElement('div');
            item.className = 'cf-comentario';
            item.innerHTML = `
                <div class="cf-comentario-body">
                    <div class="cf-comentario-head">
                        <span class="cf-alias">Anónimo #${escapar(com.alias)}</span>
                        ${esMioCom ? '<span class="cf-card-tag-yo"><i data-lucide="user"></i> Vos</span>' : ''}
                    </div>
                    <div class="cf-comentario-texto">${escapar(com.texto)}</div>
                    <div class="cf-comentario-tiempo">${tiempoRelativo(com.creado)}</div>
                </div>
                ${esMioCom ? `
                    <button class="cf-comentario-borrar" data-com-id="${com.id}" title="Borrar comentario">
                        <i data-lucide="trash-2"></i>
                    </button>` : ''}
            `;
            comCont.appendChild(item);
        });

        comCont.querySelectorAll('.cf-comentario-borrar').forEach(btn => {
            btn.addEventListener('click', () => borrarComentario(btn.dataset.comId));
        });
    }

    // Footer (borrar / reportar)
    const footer = document.getElementById('cfVerFooter');
    if (mia) {
        const btnBorrar = document.createElement('button');
        btnBorrar.className = 'cf-btn-footer peligro';
        btnBorrar.innerHTML = '<i data-lucide="trash-2"></i> Eliminar mi confesión';
        btnBorrar.addEventListener('click', () => borrarConfesion(c.id));
        footer.appendChild(btnBorrar);
    } else if (puedoReportar(c)) {
        const btnReportar = document.createElement('button');
        btnReportar.className = 'cf-btn-footer';
        btnReportar.innerHTML = '<i data-lucide="flag"></i> Reportar';
        btnReportar.addEventListener('click', () => reportar(c.id));
        footer.appendChild(btnReportar);
    } else {
        const info = document.createElement('span');
        info.style.cssText = 'font-size:11.5px;font-weight:700;color:var(--gray-500,#71717A);';
        info.textContent = 'Ya reportaste esta confesión.';
        footer.appendChild(info);
    }

    // Input de comentario
    const input = document.getElementById('cfVerInputComentario');
    const btnEnviar = document.getElementById('cfVerBtnEnviar');
    input.addEventListener('input', () => {
        btnEnviar.disabled = !input.value.trim();
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); enviarComentario(input.value); }
    });
    btnEnviar.addEventListener('click', () => enviarComentario(input.value));

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  COMENTARIOS
// ============================================================
async function enviarComentario(texto) {
    if (!verActualId) return;
    const txt = String(texto || '').trim().slice(0, MAX_COMENTARIO);
    if (!txt) return;

    const c = confesiones.find(x => x.id === verActualId);
    if (!c) return;
    const yo = usuarioActual.codigo;

    const comentario = {
        id: generarId('com'),
        autorReal: yo,
        alias: generarAlias(),
        texto: txt,
        creado: new Date().toISOString()
    };

    try {
        await mutarConfesiones((a) => {
            const conf = a.confesiones.find(x => x.id === verActualId);
            if (!conf) return a;
            if (!Array.isArray(conf.comentarios)) conf.comentarios = [];
            conf.comentarios.push(comentario);
            return a;
        });

        renderModalVer();
        renderFeed();

        // Notificar al autor
        if (c.autorReal && c.autorReal !== yo) {
            const preview = txt.length > 40 ? txt.slice(0, 40) + '…' : txt;
            API()?.enviarNotificacion?.(
                'confesionario',
                `Alguien comentó tu confesión: "${preview}"`,
                c.autorReal
            ).catch(() => {});
        }
    } catch (e) {
        toast('No se pudo publicar el comentario', 'error');
    }
}

async function borrarComentario(comId) {
    if (!verActualId) return;
    const c = confesiones.find(x => x.id === verActualId);
    if (!c) return;
    const com = (c.comentarios || []).find(x => x.id === comId);
    if (!com) return;
    if (com.autorReal !== usuarioActual.codigo) {
        toast('Solo podés borrar tus comentarios', 'error');
        return;
    }
    if (!confirm('¿Borrar este comentario?')) return;

    try {
        await mutarConfesiones((a) => {
            const conf = a.confesiones.find(x => x.id === verActualId);
            if (conf && Array.isArray(conf.comentarios)) {
                conf.comentarios = conf.comentarios.filter(x => x.id !== comId);
            }
            return a;
        });
        renderModalVer();
        renderFeed();
        toast('Comentario borrado', 'success');
    } catch (e) {
        toast('No se pudo borrar', 'error');
    }
}

// ============================================================
//  BORRAR CONFESIÓN
// ============================================================
async function borrarConfesion(id) {
    const c = confesiones.find(x => x.id === id);
    if (!c) return;
    if (!esMia(c)) { toast('Solo podés borrar tus confesiones', 'error'); return; }
    if (!confirm('¿Eliminar esta confesión? Se borrarán reacciones y comentarios.')) return;

    try {
        await mutarConfesiones((a) => {
            a.confesiones = a.confesiones.filter(x => x.id !== id);
            return a;
        });
        cerrarModalVer();
        renderFeed();
        toast('Confesión eliminada', 'success');
    } catch (e) {
        toast('No se pudo eliminar', 'error');
    }
}

// ============================================================
//  REPORTAR
// ============================================================
async function reportar(id) {
    const c = confesiones.find(x => x.id === id);
    if (!c) return;
    if (!puedoReportar(c)) return;
    if (!confirm('¿Reportar esta confesión? Si 3 personas la reportan, se ocultará.')) return;

    try {
        await mutarConfesiones((a) => {
            const conf = a.confesiones.find(x => x.id === id);
            if (!conf) return a;
            if (!Array.isArray(conf.reportes)) conf.reportes = [];
            if (!conf.reportes.includes(usuarioActual.codigo)) {
                conf.reportes.push(usuarioActual.codigo);
            }
            return a;
        });
        renderModalVer();
        renderFeed();
        toast('Gracias por avisar', 'info');
    } catch (e) {
        toast('No se pudo reportar', 'error');
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('El Confesionario necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('cfUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarCuentas();
    await cargarConfesiones(true);
    renderFeed();

    // Filtros
    document.querySelectorAll('#cfFiltros .cf-chip').forEach(chip => {
        chip.addEventListener('click', () => {
           
