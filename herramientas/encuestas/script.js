// ============================================================
//  Encuestas — Creador + votación con categorías
//  ------------------------------------------------------------
//  · 1 JSON global: app/encuestas/encuestas.json
//  · 3 categorías: tonteria / serio / economico
//  · Visibilidad: publico (se ve quién votó qué) / privado
//  · Alcance: todos / invitados (lista de códigos)
//  · Voto único o múltiple
//  · Justificación obligatoria: solo si visibilidad = publico
//  · Cierre: opcional (auto) o manual
//  · No se puede editar tras el primer voto
//  · Notificaciones: invitación / cierre auto / todos votaron
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_ENCUESTAS = 'app/encuestas/encuestas.json';
const RUTA_CUENTAS   = 'cuenta.json';

const MAX_PREGUNTA = 140;
const MIN_OPCIONES = 2;
const MAX_OPCIONES = 6;
const MAX_OPCION_TEXTO = 80;
const MAX_JUSTIF = 300;
const MAX_INVITADOS = 40;

// ---------- ESTADO ----------
let usuarioActual = null;
let usuariosPorCodigo = {};
let encuestas = [];

let filtroCategoria = 'todas';
let filtroEstado = 'abiertas';

// Crear
let catSeleccionada = 'tonteria';
let toggleVoto = 'unico';       // 'unico' | 'multiple'
let toggleVisibilidad = 'publico'; // 'publico' | 'privado'
let toggleAlcance = 'todos';    // 'todos' | 'invitados'
let invitadosSeleccionados = []; // códigos
let justifObligatoria = false;

// Ranking
let topCategoria = 'tonteria';

// Selección múltiple en curso
const seleccionMultiple = new Map(); // encuestaId -> Set(opciones)

// Justificación en curso
const justifPendiente = new Map();   // encuestaId -> string

// URLs
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
    } catch (e) {}
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
function tiempoRelativo(iso) {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 30) return 'ahora';
    if (diff < 60) return `${diff}s`;
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `${dias}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}
function formatearFechaCierre(iso) {
    const d = new Date(iso);
    return d.toLocaleString('es-CL', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('enToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'en-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  ESTADO DE ENCUESTA
// ============================================================
function estaCerrada(e) {
    if (e.cerrado) return true;
    if (e.cierre && new Date(e.cierre).getTime() < Date.now()) return true;
    return false;
}
function totalVotos(e) {
    return Object.keys(e.votos || {}).length;
}
function conteoPorOpcion(e) {
    const c = {};
    e.opciones.forEach(o => { c[o.id] = 0; });
    Object.values(e.votos || {}).forEach(v => {
        (v.seleccion || []).forEach(op => {
            if (c[op] !== undefined) c[op]++;
        });
    });
    return c;
}
function totalSelecciones(e) {
    return Object.values(conteoPorOpcion(e)).reduce((a, b) => a + b, 0);
}
function miVoto(e) {
    return e.votos?.[usuarioActual.codigo] || null;
}
function puedeVotar(e) {
    if (!usuarioActual) return false;
    if (estaCerrada(e)) return false;
    if (e.autor === usuarioActual.codigo) return true; // el autor puede votar su propia encuesta
    if (e.alcance === 'invitados') {
        return Array.isArray(e.invitados) && e.invitados.includes(usuarioActual.codigo);
    }
    return true;
}
function esVisibleParaMi(e) {
    if (!usuarioActual) return false;
    if (e.alcance !== 'invitados') return true;
    if (e.autor === usuarioActual.codigo) return true;
    return Array.isArray(e.invitados) && e.invitados.includes(usuarioActual.codigo);
}
function catBadgeIcono(cat) {
    return cat === 'tonteria' ? 'party-popper' :
           cat === 'serio' ? 'scale' : 'coins';
}
function catNombre(cat) {
    return cat === 'tonteria' ? 'Tontería' :
           cat === 'serio' ? 'Serio' : 'Económico';
}

// ============================================================
//  CARGA
// ============================================================
async function cargarCuentas() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivo(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) {}
}
async function cargarEncuestas(fresh = false) {
    const bd = BD();
    if (!bd) return;
    try {
        const d = fresh ? await bd.leerArchivoFresh(RUTA_ENCUESTAS) : await bd.leerArchivo(RUTA_ENCUESTAS);
        encuestas = normalizar(d);
    } catch (e) {
        encuestas = [];
    }
}
function normalizar(d) {
    if (!d || typeof d !== 'object') return [];
    if (!Array.isArray(d.encuestas)) return [];
    return d.encuestas.filter(e => e && e.id && e.autor && Array.isArray(e.opciones));
}
async function mutarEncuestas(mutador) {
    const bd = BD();
    if (!bd) throw new Error('ConfigBD no disponible.');
    const r = await bd.actualizarArchivo(RUTA_ENCUESTAS, (a) => {
        if (!a || typeof a !== 'object') a = { version: 1, encuestas: [] };
        if (!Array.isArray(a.encuestas)) a.encuestas = [];
        a = mutador(a);
        a.actualizado = new Date().toISOString();
        return a;
    });
    encuestas = normalizar(r);
}

// ============================================================
//  AUTO-CIERRE
// ============================================================
async function procesarAutocierres() {
    const ahora = Date.now();
    const vencidas = encuestas.filter(e =>
        !e.cerrado && e.cierre && new Date(e.cierre).getTime() < ahora
    );
    if (vencidas.length === 0) return;

    await mutarEncuestas((a) => {
        a.encuestas.forEach(e => {
            if (!e.cerrado && e.cierre && new Date(e.cierre).getTime() < ahora) {
                e.cerrado = true;
                e.cerradoAuto = true;
                e.cerradoFecha = new Date().toISOString();
            }
        });
        return a;
    });

    // Notificar al autor de cada encuesta auto-cerrada
    const api = API();
    if (api?.enviarNotificacion) {
        for (const e of vencidas) {
            const total = totalVotos(encuestas.find(x => x.id === e.id) || e);
            api.enviarNotificacion(
                'encuestas',
                `Tu encuesta "${e.pregunta.slice(0, 60)}" se cerró con ${total} voto${total === 1 ? '' : 's'}.`,
                e.autor
            ).catch(() => {});
        }
    }
}

// ============================================================
//  RENDER FEED
// ============================================================
function filtrar() {
    let l = encuestas.slice();
    if (filtroCategoria !== 'todas') l = l.filter(e => e.categoria === filtroCategoria);
    if (filtroEstado === 'abiertas') l = l.filter(e => !estaCerrada(e));
    else if (filtroEstado === 'cerradas') l = l.filter(e => estaCerrada(e));
    l = l.filter(esVisibleParaMi);
    // Más recientes primero
    l.sort((a, b) => new Date(b.creado) - new Date(a.creado));
    return l;
}

function renderFeed() {
    const feed = document.getElementById('enFeed');
    const empty = document.getElementById('enEmpty');
    const emptyTitulo = document.getElementById('enEmptyTitulo');
    const emptyDesc = document.getElementById('enEmptyDesc');
    const btnEmpty = document.getElementById('enEmptyBtnNuevo');
    if (!feed) return;

    feed.innerHTML = '';
    const lista = filtrar();

    if (lista.length === 0) {
        empty.hidden = false;
        if (encuestas.length === 0) {
            emptyTitulo.textContent = 'No hay encuestas todavía';
            emptyDesc.textContent = 'Creá la primera encuesta y dejá que la comunidad opine.';
        } else if (filtroEstado === 'cerradas') {
            emptyTitulo.textContent = 'Sin encuestas cerradas';
            emptyDesc.textContent = 'Todavía ninguna encuesta se cerró.';
        } else {
            emptyTitulo.textContent = 'Nada por acá';
            emptyDesc.textContent = 'Probá cambiar los filtros.';
        }
        btnEmpty.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    lista.forEach(e => feed.appendChild(crearCard(e)));
    if (window.lucide) window.lucide.createIcons();
}

function crearCard(e) {
    const wrap = document.createElement('div');
    wrap.className = 'en-card' + (estaCerrada(e) ? ' cerrada' : '');
    wrap.dataset.id = e.id;

    const cerrada = estaCerrada(e);
    const mi = miVoto(e);
    const puede = puedeVotar(e);
    const esMio = e.autor === usuarioActual.codigo;
    const usuario = usuariosPorCodigo[e.autor] || {};
    const foto = usuario.foto || null;
    const nombre = e.autorNombre || usuario.nombre || e.autor;

    // --- HEAD ---
    const head = document.createElement('div');
    head.className = 'en-card-head';

    const autor = document.createElement('div');
    autor.className = 'en-card-autor';
    autor.innerHTML = `
        <div class="en-avatar">
            ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
        </div>
        <div class="en-card-autor-info">
            <span class="en-card-autor-nombre">${escapar(nombre)}</span>
            <span class="en-card-tiempo">${tiempoRelativo(e.creado)}${e.cierre && !cerrada ? ` · cierra ${formatearFechaCierre(e.cierre)}` : ''}</span>
        </div>`;
    head.appendChild(autor);

    const badges = document.createElement('div');
    badges.className = 'en-badges';
    badges.innerHTML = `
        <span class="en-badge ${e.categoria}">
            <i data-lucide="${catBadgeIcono(e.categoria)}"></i>
            ${catNombre(e.categoria)}
        </span>
        <span class="en-badge ${e.visibilidad}">
            <i data-lucide="${e.visibilidad === 'publico' ? 'eye' : 'eye-off'}"></i>
            ${e.visibilidad === 'publico' ? 'Público' : 'Privado'}
        </span>
        ${e.alcance === 'invitados' ? `
            <span class="en-badge invitados">
                <i data-lucide="user-check"></i>
                ${e.invitados?.length || 0}
            </span>` : ''}
        ${cerrada ? `
            <span class="en-badge cerrada">
                <i data-lucide="lock"></i>
                Cerrada
            </span>` : ''}
    `;
    head.appendChild(badges);
    wrap.appendChild(head);

    // --- PREGUNTA ---
    const preg = document.createElement('div');
    preg.className = 'en-card-pregunta';
    preg.textContent = e.pregunta;
    wrap.appendChild(preg);

    // --- OPCIONES ---
    const opcionesCont = document.createElement('div');
    opcionesCont.className = 'en-opciones';
    wrap.appendChild(opcionesCont);

    const conteo = conteoPorOpcion(e);
    const totalS = totalSelecciones(e);
    const mostrarResultados = mi || cerrada || !puede;

    const seleccionActual = seleccionMultiple.get(e.id) || new Set(
        mi?.seleccion || []
    );
    if (puede && e.votoMultiple && !mi) {
        seleccionMultiple.set(e.id, seleccionActual);
    }

    e.opciones.forEach(o => {
        const btn = document.createElement('button');
        btn.className = 'en-opcion';
        if (e.votoMultiple && puede && !mi) btn.classList.add('es-checkbox');

        const esMiVoto = mi?.seleccion?.includes(o.id);
        const esSeleccionado = seleccionActual.has(o.id);
        if (esMiVoto) btn.classList.add('mi-voto');
        if (esSeleccionado && !mi) btn.classList.add('seleccionado');

        const pct = totalS > 0 ? Math.round((conteo[o.id] / totalS) * 100) : 0;

        btn.innerHTML = `
            <div class="en-opcion-barra" style="width:${mostrarResultados ? pct : 0}%;"></div>
            <div class="en-opcion-contenido">
                <span class="en-opcion-marca"><i data-lucide="check"></i></span>
                <span class="en-opcion-texto">${escapar(o.texto)}</span>
                ${mostrarResultados ? `
                    <span class="en-opcion-stats">
                        <span class="en-opcion-porcentaje">${pct}%</span>
                        <span class="en-opcion-votos">${conteo[o.id]}</span>
                    </span>` : ''}
            </div>
        `;

        if (puede && !mi) {
            btn.addEventListener('click', () => manejarClickOpcion(e, o.id));
        } else if (puede && mi && !cerrada) {
            // Puede cambiar su voto mientras esté abierta
            btn.addEventListener('click', () => manejarCambiarVoto(e, o.id));
        } else {
            btn.disabled = true;
        }

        opcionesCont.appendChild(btn);
    });

    // --- Justificación inline (si toca) ---
    const necesitaJustif = puede && e.visibilidad === 'publico' &&
        e.justificacionObligatoria && !mi && e.votoMultiple === false;
    // (el múltiple maneja su justif junto con el botón votar)

    if (necesitaJustif && justifPendiente.has(e.id)) {
        // Ya eligió opción, mostramos input
        const justifDiv = document.createElement('div');
        justifDiv.className = 'en-justif-inline';
        justifDiv.innerHTML = `
            <label><i data-lucide="message-square-quote"></i> Justificá tu voto</label>
            <textarea maxlength="${MAX_JUSTIF}" placeholder="¿Por qué elegiste esa opción?"></textarea>
        `;
        const ta = justifDiv.querySelector('textarea');
        ta.value = justifPendiente.get(e.id) || '';
        ta.addEventListener('input', () => {
            justifPendiente.set(e.id, ta.value);
        });
        const acciones = document.createElement('div');
        acciones.style.display = 'flex';
        acciones.style.gap = '6px';
        acciones.style.justifyContent = 'flex-end';
        acciones.innerHTML = `
            <button class="en-btn-sec" data-accion="cancelar" style="padding:8px 14px;font-size:12.5px;">Cancelar</button>
            <button class="en-btn-pri" data-accion="enviar" style="padding:8px 14px;font-size:12.5px;">
                <i data-lucide="check"></i>
                Enviar voto
            </button>
        `;
        acciones.querySelector('[data-accion="cancelar"]').addEventListener('click', () => {
            justifPendiente.delete(e.id);
            renderFeed();
        });
        acciones.querySelector('[data-accion="enviar"]').addEventListener('click', () => {
            const txt = (justifPendiente.get(e.id) || '').trim();
            if (!txt) { toast('Escribí una justificación', 'error'); return; }
            const opcion = justifPendiente.get(`${e.id}__op`);
            if (opcion) votar(e.id, [opcion], txt);
        });
        justifDiv.appendChild(acciones);
        wrap.appendChild(justifDiv);
        // Guardamos la opción elegida al costado
    }

    // --- FOOT ---
    const foot = document.createElement('div');
    foot.className = 'en-card-foot';

    const info = document.createElement('span');
    info.className = 'en-card-foot-info';
    const votosTxt = totalVotos(e) === 1 ? '1 voto' : `${totalVotos(e)} votos`;
    info.innerHTML = `<i data-lucide="users"></i> ${votosTxt}`;

    // Botón votar múltiple
    if (puede && e.votoMultiple && !mi) {
        const selec = seleccionMultiple.get(e.id) || new Set();
        const btnVotar = document.createElement('button');
        btnVotar.className = 'en-btn-votar-multiple';
        btnVotar.disabled = selec.size === 0;
        btnVotar.innerHTML = `<i data-lucide="check"></i> Votar${selec.size > 0 ? ` (${selec.size})` : ''}`;
        btnVotar.addEventListener('click', () => {
            const arr = [...selec];
            if (arr.length === 0) { toast('Elegí al menos una opción', 'error'); return; }
            if (e.visibilidad === 'publico' && e.justificacionObligatoria) {
                mostrarJustifParaMultiple(e, arr);
                return;
            }
            votar(e.id, arr, '');
        });
        foot.appendChild(info);
        foot.appendChild(btnVotar);
    } else {
        foot.appendChild(info);

        // Info extra: si es privada y ya votó, mostrar "votaste"
        if (mi) {
            const miInfo = document.createElement('span');
            miInfo.className = 'en-card-foot-info';
            miInfo.style.color = 'var(--violet-600, #7C3AED)';
            miInfo.innerHTML = `<i data-lucide="check-circle-2"></i> Ya votaste`;
            foot.appendChild(miInfo);
        }

        // Acciones del autor
        if (esMio) {
            const acc = document.createElement('div');
            acc.className = 'en-card-foot-acciones';
            if (!cerrada) {
                acc.innerHTML += `
                    <button class="en-icon-btn" data-accion="cerrar" title="Cerrar encuesta">
                        <i data-lucide="lock"></i>
                    </button>
                `;
            }
            acc.innerHTML += `
                <button class="en-icon-btn danger" data-accion="borrar" title="Eliminar">
                    <i data-lucide="trash-2"></i>
                </button>
            `;
            acc.querySelector('[data-accion="cerrar"]')?.addEventListener('click', () => cerrarEncuesta(e.id));
            acc.querySelector('[data-accion="borrar"]')?.addEventListener('click', () => borrarEncuesta(e.id));
            foot.appendChild(acc);
        }

        // Botón ver detalle
        const btnVer = document.createElement('button');
        btnVer.className = 'en-icon-btn';
        btnVer.title = 'Ver detalle';
        btnVer.innerHTML = `<i data-lucide="bar-chart-3"></i>`;
        btnVer.addEventListener('click', () => abrirVerDetalle(e.id));
        if (!esMio) {
            const der = document.createElement('div');
            der.className = 'en-card-foot-acciones';
            der.appendChild(btnVer);
            foot.appendChild(der);
        } else {
            const acc = foot.querySelector('.en-card-foot-acciones');
            if (acc) acc.insertBefore(btnVer, acc.firstChild);
        }
    }

    wrap.appendChild(foot);
    return wrap;
}

// ============================================================
//  INTERACCIÓN: VOTAR
// ============================================================
function manejarClickOpcion(e, opcionId) {
    // Voto único
    if (e.votoMultiple) {
        // Toggle selección (sin votar aún)
        const sel = seleccionMultiple.get(e.id) || new Set();
        if (sel.has(opcionId)) sel.delete(opcionId);
        else sel.add(opcionId);
        seleccionMultiple.set(e.id, sel);
        renderFeed();
        return;
    }
    // Único
    if (e.visibilidad === 'publico' && e.justificacionObligatoria) {
        justifPendiente.set(e.id, '');
        justifPendiente.set(`${e.id}__op`, opcionId);
        renderFeed();
        return;
    }
    votar(e.id, [opcionId], '');
}

function manejarCambiarVoto(e, opcionId) {
    // Permitimos cambiar voto mientras esté abierta
    const mi = miVoto(e);
    if (!mi) return;
    if (e.votoMultiple) {
        // Cambio toggle
        const sel = new Set(mi.seleccion);
        if (sel.has(opcionId)) sel.delete(opcionId);
        else sel.add(opcionId);
        if (sel.size === 0) { toast('Debés elegir al menos una opción', 'error'); return; }
        votar(e.id, [...sel], mi.justificacion || '');
    } else {
        if (mi.seleccion.includes(opcionId)) return; // ya tenía esa
        if (e.visibilidad === 'publico' && e.justificacionObligatoria) {
            justifPendiente.set(e.id, mi.justificacion || '');
            justifPendiente.set(`${e.id}__op`, opcionId);
            renderFeed();
            return;
        }
        votar(e.id, [opcionId], mi.justificacion || '');
    }
}

function mostrarJustifParaMultiple(e, opcionesIds) {
    justifPendiente.set(e.id, '');
    justifPendiente.set(`${e.id}__ops`, opcionesIds);
    abrirJustifMultiple(e, opcionesIds);
}

function abrirJustifMultiple(e, opcionesIds) {
    // Usamos un modal rápido para no ensuciar el feed
    const overlay = document.createElement('div');
    overlay.className = 'en-modal';
    overlay.style.zIndex = '1200';
    overlay.innerHTML = `
        <div class="en-modal-card" style="max-width:440px;">
            <div class="en-modal-header">
                <h2><i data-lucide="message-square-quote"></i><span>Justificá tu voto</span></h2>
                <button class="en-modal-cerrar" data-x="1"><i data-lucide="x"></i></button>
            </div>
            <div class="en-modal-body">
                <p style="font-size:13px;color:var(--gray-500,#71717A);font-weight:600;line-height:1.5;">
                    Elegiste ${opcionesIds.length} opción${opcionesIds.length === 1 ? '' : 'es'}. Contá por qué.
                </p>
                <textarea id="enJustifMultipleTa" maxlength="${MAX_JUSTIF}"
                    style="width:100%;min-height:100px;padding:11px 14px;border:1.5px solid var(--border,#E8E8EE);border-radius:12px;font-family:inherit;font-size:13.5px;resize:none;outline:none;background:var(--white,#FFFFFF);color:var(--gray-900,#18181B);"
                    placeholder="¿Por qué elegiste esas opciones?"></textarea>
            </div>
            <div class="en-modal-actions">
                <button class="en-btn-sec" data-x="1">Cancelar</button>
                <button class="en-btn-pri" data-enviar="1">
                    <i data-lucide="check"></i>
                    <span>Enviar voto</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons();

    overlay.querySelectorAll('[data-x="1"]').forEach(b => {
        b.addEventListener('click', () => overlay.remove());
    });
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    overlay.querySelector('[data-enviar="1"]').addEventListener('click', () => {
        const txt = overlay.querySelector('#enJustifMultipleTa').value.trim();
        if (!txt) { toast('Escribí una justificación', 'error'); return; }
        overlay.remove();
        votar(e.id, opcionesIds, txt);
    });
}

async function votar(encuestaId, opcionesIds, justificacion = '') {
    const e = encuestas.find(x => x.id === encuestaId);
    if (!e) return;
    if (estaCerrada(e)) { toast('Esta encuesta ya está cerrada', 'error'); return; }
    if (!puedeVotar(e)) { toast('No podés votar en esta encuesta', 'error'); return; }

    const yo = usuarioActual.codigo;
    const justifLimpia = String(justificacion || '').trim().slice(0, MAX_JUSTIF);

    if (e.visibilidad === 'publico' && e.justificacionObligatoria && !justifLimpia) {
        toast('Esta encuesta pide justificación', 'error');
        return;
    }

    try {
        const eraNuevo = !miVoto(e);
        await mutarEncuestas((a) => {
            const enc = a.encuestas.find(x => x.id === encuestaId);
            if (!enc) return a;
            if (!enc.votos || typeof enc.votos !== 'object') enc.votos = {};
            enc.votos[yo] = {
                seleccion: opcionesIds.slice(),
                justificacion: justifLimpia,
                fecha: new Date().toISOString(),
                actualizado: eraNuevo ? null : new Date().toISOString()
            };
            return a;
        });

        // Limpieza de estado local
        seleccionMultiple.delete(encuestaId);
        justifPendiente.delete(encuestaId);
        justifPendiente.delete(`${encuestaId}__op`);
        justifPendiente.delete(`${encuestaId}__ops`);

        toast(eraNuevo ? 'Voto registrado' : 'Voto actualizado', 'success');
        renderFeed();

        // Notificación al autor (si es nuevo voto y no es auto-voto)
        const enc = encuestas.find(x => x.id === encuestaId);
        if (enc && eraNuevo && enc.autor !== yo) {
            API()?.enviarNotificacion?.(
                'encuestas',
                `${usuarioActual.nombre} votó en "${enc.pregunta.slice(0, 50)}"`,
                enc.autor
            ).catch(() => {});
        }

        // ¿Todos los invitados votaron?
        if (enc && enc.alcance === 'invitados' && !enc.notificadoTodosVotaron && enc.autor !== yo) {
            const invitados = enc.invitados || [];
            const votaron = new Set(Object.keys(enc.votos || {}));
            const todos = invitados.every(c => votaron.has(c));
            if (todos && invitados.length > 0) {
                await mutarEncuestas((a) => {
                    const x = a.encuestas.find(z => z.id === encuestaId);
                    if (x) x.notificadoTodosVotaron = true;
                    return a;
                });
                API()?.enviarNotificacion?.(
                    'encuestas',
                    `Todos los invitados votaron en "${enc.pregunta.slice(0, 50)}"`,
                    enc.autor
                ).catch(() => {});
            }
        }
    } catch (err) {
        toast(err.message || 'No se pudo registrar el voto', 'error');
    }
}

// ============================================================
//  CERRAR / BORRAR
// ============================================================
async function cerrarEncuesta(id) {
    if (!confirm('¿Cerrar la encuesta? No se podrá votar más y no se puede reabrir.')) return;
    try {
        await mutarEncuestas((a) => {
            const e = a.encuestas.find(x => x.id === id);
            if (e) {
                e.cerrado = true;
                e.cerradoAuto = false;
                e.cerradoFecha = new Date().toISOString();
            }
            return a;
        });
        toast('Encuesta cerrada', 'success');
        renderFeed();
    } catch (e) { toast('No se pudo cerrar', 'error'); }
}

async function borrarEncuesta(id) {
    if (!confirm('¿Eliminar esta encuesta? Se borrarán todos los votos.')) return;
    try {
        await mutarEncuestas((a) => {
            a.encuestas = a.encuestas.filter(x => x.id !== id);
            return a;
        });
        toast('Encuesta eliminada', 'success');
        renderFeed();
    } catch (e) { toast('No se pudo eliminar', 'error'); }
}

// ============================================================
//  MODAL: CREAR
// ============================================================
function abrirModalCrear() {
    catSeleccionada = 'tonteria';
    toggleVoto = 'unico';
    toggleVisibilidad = 'publico';
    toggleAlcance = 'todos';
    invitadosSeleccionados = [];
    justifObligatoria = false;

    document.getElementById('enCrearPregunta').value = '';
    document.getElementById('enCrearJustifOblig').checked = false;
    document.getElementById('enCrearCierreActivo').checked = false;
    document.getElementById('enCrearCierreFecha').hidden = true;
    document.getElementById('enCrearCierreFecha').value = '';
    document.getElementById('enCrearElegirInvitados').hidden = true;
    document.getElementById('enCrearInvitadosTxt').textContent = 'Elegir invitados';
    document.getElementById('enCrearMensaje').textContent = '';
    document.getElementById('enCrearMensaje').className = 'en-modal-mensaje';

    // Opciones mínimas
    const opCont = document.getElementById('enCrearOpciones');
    opCont.innerHTML = '';
    agregarOpcion('');
    agregarOpcion('');
    actualizarHintOpciones();
    actualizarTogglesCrear();
    actualizarFieldJustificacion();

    document.getElementById('enModalCrear').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('enCrearPregunta').focus(), 100);
}

function agregarOpcion(valor = '') {
    const cont = document.getElementById('enCrearOpciones');
    const total = cont.children.length;
    if (total >= MAX_OPCIONES) return;

    const fila = document.createElement('div');
    fila.className = 'en-opcion-fila';
    fila.innerHTML = `
        <input type="text" maxlength="${MAX_OPCION_TEXTO}" placeholder="Opción ${total + 1}" value="${escapar(valor)}">
        <button class="en-btn-eliminar-opcion" title="Quitar">
            <i data-lucide="x"></i>
        </button>
    `;
    const input = fila.querySelector('input');
    const btn = fila.querySelector('.en-btn-eliminar-opcion');
    btn.addEventListener('click', () => {
        if (cont.children.length <= MIN_OPCIONES) return;
        fila.remove();
        actualizarHintOpciones();
        actualizarBotonesEliminar();
        if (window.lucide) window.lucide.createIcons();
    });
    cont.appendChild(fila);
    actualizarHintOpciones();
    actualizarBotonesEliminar();
    if (window.lucide) window.lucide.createIcons();
}

function actualizarHintOpciones() {
    const cont = document.getElementById('enCrearOpciones');
    const hint = document.getElementById('enCrearOpcionesHint');
    const btnAdd = document.getElementById('enCrearAddOpcion');
    const n = cont.children.length;
    if (hint) hint.textContent = `${n} / ${MAX_OPCIONES}`;
    if (btnAdd) btnAdd.disabled = n >= MAX_OPCIONES;
}

function actualizarBotonesEliminar() {
    const cont = document.getElementById('enCrearOpciones');
    const bloquear = cont.children.length <= MIN_OPCIONES;
    cont.querySelectorAll('.en-btn-eliminar-opcion').forEach(b => b.disabled = bloquear);
}

function actualizarTogglesCrear() {
    document.querySelectorAll('.en-cat-opcion').forEach(b => {
        b.classList.toggle('active', b.dataset.cat === catSeleccionada);
    });
    document.querySelectorAll('.en-toggle').forEach(b => {
        const t = b.dataset.toggle;
        if (t === 'voto-unico' || t === 'voto-multiple') {
            b.classList.toggle('active', (t === 'voto-unico' && toggleVoto === 'unico') || (t === 'voto-multiple' && toggleVoto === 'multiple'));
        } else if (t === 'publico' || t === 'privado') {
            b.classList.toggle('active', (t === 'publico' && toggleVisibilidad === 'publico') || (t === 'privado' && toggleVisibilidad === 'privado'));
        } else if (t === 'todos' || t === 'invitados') {
            b.classList.toggle('active', (t === 'todos' && toggleAlcance === 'todos') || (t === 'invitados' && toggleAlcance === 'invitados'));
        }
    });
}

function actualizarFieldJustificacion() {
    const field = document.getElementById('enFieldJustificacion');
    const check = document.getElementById('enCrearJustifOblig');
    const activo = toggleVisibilidad === 'publico';
    field.hidden = !activo;
    if (!activo) {
        check.checked = false;
        justifObligatoria = false;
    }
}

async function guardarEncuesta() {
    const pregunta = document.getElementById('enCrearPregunta').value.trim();
    const msj = document.getElementById('enCrearMensaje');
    msj.textContent = ''; msj.className = 'en-modal-mensaje';

    if (!pregunta) { msj.textContent = 'Escribí una pregunta.'; msj.className = 'en-modal-mensaje error'; return; }
    if (pregunta.length > MAX_PREGUNTA) { msj.textContent = 'Pregunta muy larga.'; msj.className = 'en-modal-mensaje error'; return; }

    const opInputs = [...document.querySelectorAll('#enCrearOpciones input')];
    const opciones = opInputs.map(i => i.value.trim()).filter(Boolean);
    if (opciones.length < MIN_OPCIONES) {
        msj.textContent = `Necesitás al menos ${MIN_OPCIONES} opciones.`;
        msj.className = 'en-modal-mensaje error';
        return;
    }
    // Verificar duplicados
    const setOps = new Set(opciones.map(o => o.toLowerCase()));
    if (setOps.size !== opciones.length) {
        msj.textContent = 'No puede haber opciones duplicadas.';
        msj.className = 'en-modal-mensaje error';
        return;
    }

    if (toggleAlcance === 'invitados' && invitadosSeleccionados.length === 0) {
        msj.textContent = 'Elegí al menos un invitado.';
        msj.className = 'en-modal-mensaje error';
        return;
    }

    const cierreActivo = document.getElementById('enCrearCierreActivo').checked;
    let cierreISO = null;
    if (cierreActivo) {
        const v = document.getElementById('enCrearCierreFecha').value;
        if (!v) { msj.textContent = 'Elegí la fecha de cierre.'; msj.className = 'en-modal-mensaje error'; return; }
        const d = new Date(v);
        if (isNaN(d.getTime()) || d.getTime() < Date.now() + 60000) {
            msj.textContent = 'La fecha de cierre debe ser en el futuro.';
            msj.className = 'en-modal-mensaje error';
            return;
        }
        cierreISO = d.toISOString();
    }

    const yo = usuarioActual.codigo;
    const nueva = {
        id: generarId('enc'),
        autor: yo,
        autorNombre: usuarioActual.nombre || yo,
        pregunta,
        opciones: opciones.map((txt, i) => ({ id: generarId('op'), texto: txt })),
        categoria: catSeleccionada,
        visibilidad: toggleVisibilidad,
        alcance: toggleAlcance,
        invitados: toggleAlcance === 'invitados' ? [...invitadosSeleccionados] : [],
        votoMultiple: toggleVoto === 'multiple',
        justificacionObligatoria: toggleVisibilidad === 'publico' && justifObligatoria,
        cierre: cierreISO,
        creado: new Date().toISOString(),
        cerrado: false,
        cerradoAuto: false,
        votos: {},
        notificadoTodosVotaron: false
    };

    const btn = document.getElementById('enCrearGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        await mutarEncuestas((a) => {
            a.encuestas.unshift(nueva);
            return a;
        });
        document.getElementById('enModalCrear').hidden = true;
        renderFeed();
        toast('Encuesta publicada', 'success');

        // Notificar a invitados
        if (nueva.alcance === 'invitados' && nueva.invitados.length > 0) {
            const api = API();
            if (api?.enviarNotificacion) {
                nueva.invitados.forEach(cod => {
                    api.enviarNotificacion(
                        'encuestas',
                        `Te invitaron a votar: "${nueva.pregunta.slice(0, 60)}"`,
                        cod
                    ).catch(() => {});
                });
            }
        }
    } catch (e) {
        msj.textContent = e.message || 'No se pudo crear.';
        msj.className = 'en-modal-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  MODAL: INVITADOS
// ============================================================
function abrirModalInvitados() {
    const cont = document.getElementById('enInvitadosLista');
    const buscar = document.getElementById('enInvitadosBuscar');
    buscar.value = '';
    renderListaInvitados('');
    actualizarContadorInvitados();
    document.getElementById('enModalInvitados').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function renderListaInvitados(filtro) {
    const cont = document.getElementById('enInvitadosLista');
    if (!cont) return;
    const f = filtro.toLowerCase().trim();
    const yo = usuarioActual.codigo;

    const codigos = Object.keys(usuariosPorCodigo)
        .filter(c => c !== yo)
        .sort();

    const lista = codigos.filter(c => {
        if (!f) return true;
        const u = usuariosPorCodigo[c] || {};
        return (u.nombre || '').toLowerCase().includes(f) || c.toLowerCase().includes(f);
    });

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="en-ver-vacio">
                <i data-lucide="users"></i>
                <p>${codigos.length === 0 ? 'No hay otros usuarios en la comunidad.' : 'Sin resultados.'}</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = lista.map(c => {
        const u = usuariosPorCodigo[c] || {};
        const activo = invitadosSeleccionados.includes(c);
        const foto = u.foto || null;
        return `
            <label class="en-invitado-item ${activo ? 'activo' : ''}" data-codigo="${escapar(c)}">
                <input type="checkbox" ${activo ? 'checked' : ''}>
                <span class="en-checkbox-box"><i data-lucide="check"></i></span>
                <div class="en-avatar" style="width:30px;height:30px;font-size:12px;">
                    ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((u.nombre || c).charAt(0).toUpperCase())}</span>`}
                </div>
                <div class="en-invitado-nombre">
                    <strong>${escapar(u.nombre || c)}</strong>
                    <span>@${escapar(c)}</span>
                </div>
            </label>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.en-invitado-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const cod = item.dataset.codigo;
            if (invitadosSeleccionados.includes(cod)) {
                invitadosSeleccionados = invitadosSeleccionados.filter(x => x !== cod);
            } else {
                if (invitadosSeleccionados.length >= MAX_INVITADOS) {
                    toast(`Máximo ${MAX_INVITADOS} invitados`, 'error');
                    return;
                }
                invitadosSeleccionados.push(cod);
            }
            item.classList.toggle('activo', invitadosSeleccionados.includes(cod));
            item.querySelector('input').checked = invitadosSeleccionados.includes(cod);
            actualizarContadorInvitados();
        });
    });
}

function actualizarContadorInvitados() {
    const el = document.getElementById('enInvitadosContador');
    if (!el) return;
    const n = invitadosSeleccionados.length;
    el.textContent = n === 0 ? 'Ninguno seleccionado'
        : n === 1 ? '1 seleccionado'
        : `${n} seleccionados`;
}

// ============================================================
//  MODAL: VER DETALLE
// ============================================================
function abrirVerDetalle(id) {
    const e = encuestas.find(x => x.id === id);
    if (!e) return;
    const body = document.getElementById('enVerBody');
    const cerrada = estaCerrada(e);
    const conteo = conteoPorOpcion(e);
    const totalS = totalSelecciones(e);
    const totalV = totalVotos(e);
    const esPublico = e.visibilidad === 'publico';

    // Encabezado
    let html = `
        <div class="en-ver-pregunta">${escapar(e.pregunta)}</div>
        <div class="en-ver-meta">
            <span class="en-badge ${e.categoria}">
                <i data-lucide="${catBadgeIcono(e.categoria)}"></i>
                ${catNombre(e.categoria)}
            </span>
            <span class="en-badge ${e.visibilidad}">
                <i data-lucide="${esPublico ? 'eye' : 'eye-off'}"></i>
                ${esPublico ? 'Votos públicos' : 'Votos privados'}
            </span>
            ${e.alcance === 'invitados' ? `
                <span class="en-badge invitados">
                    <i data-lucide="user-check"></i>
                    ${e.invitados.length} invitado${e.invitados.length === 1 ? '' : 's'}
                </span>` : ''}
            ${cerrada ? `
                <span class="en-badge cerrada">
                    <i data-lucide="lock"></i>
                    Cerrada
                </span>` : (e.cierre ? `
                <span class="en-badge">
                    <i data-lucide="clock"></i>
                    Cierra ${formatearFechaCierre(e.cierre)}
                </span>` : '')}
        </div>
    `;

    // Opciones con barras
    html += `<div class="en-ver-opciones">`;
    e.opciones.forEach(o => {
        const pct = totalS > 0 ? Math.round((conteo[o.id] / totalS) * 100) : 0;
        html += `
            <div class="en-ver-opcion">
                <div class="en-ver-opcion-barra" style="width:${pct}%;"></div>
                <div class="en-ver-opcion-contenido">
                    <span class="en-ver-opcion-texto">${escapar(o.texto)}</span>
                    <span class="en-ver-opcion-stat">${pct}%</span>
                    <span class="en-ver-opcion-votos">${conteo[o.id]}</span>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    // Info total
    html += `
        <div class="en-card-foot-info" style="justify-content:center;padding:8px;">
            <i data-lucide="users"></i>
            ${totalV} ${totalV === 1 ? 'persona votó' : 'personas votaron'}
        </div>
    `;

    // Votantes (solo si público)
    if (esPublico && totalV > 0) {
        html += `<div class="en-ver-seccion-titulo"><i data-lucide="list-checks"></i> Cómo votó cada persona</div>`;
        html += `<div class="en-votantes">`;

        const votantes = Object.entries(e.votos).sort((a, b) =>
            new Date(b[1].fecha) - new Date(a[1].fecha)
        );

        votantes.forEach(([cod, v]) => {
            const u = usuariosPorCodigo[cod] || {};
            const foto = u.foto || null;
            const nombre = u.nombre || cod;
            const opTexto = (v.seleccion || [])
                .map(id => e.opciones.find(o => o.id === id)?.texto || '?')
                .join(' · ');

            html += `
                <div class="en-votante">
                    <div class="en-avatar">
                        ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((nombre || '?').charAt(0).toUpperCase())}</span>`}
                    </div>
                    <div class="en-votante-body">
                        <div class="en-votante-nombre">${escapar(nombre)}${cod === usuarioActual.codigo ? ' (vos)' : ''}</div>
                        <div class="en-votante-opciones">
                            <span class="en-votante-opcion-pill">
                                <i data-lucide="check"></i>
                                ${escapar(opTexto)}
                            </span>
                        </div>
                        ${v.justificacion ? `
                            <div class="en-votante-justif-label">
                                <i data-lucide="message-square-quote"></i>
                                Justificación
                            </div>
                            <div class="en-votante-justif">${escapar(v.justificacion)}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    } else if (!esPublico && totalV > 0) {
        html += `
            <div class="en-ver-seccion-titulo"><i data-lucide="eye-off"></i> Votos privados</div>
            <div class="en-ver-vacio" style="padding:20px 12px;">
                <i data-lucide="lock"></i>
                <p>Esta encuesta tiene votos privados. Solo se muestra el total.</p>
            </div>
        `;
    } else if (totalV === 0) {
        html += `
            <div class="en-ver-vacio">
                <i data-lucide="user-x"></i>
                <p>Todavía nadie votó.</p>
            </div>
        `;
    }

    body.innerHTML = html;
    document.getElementById('enModalVer').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL: TOP / RANKING
// ============================================================
function abrirModalTop() {
    topCategoria = 'tonteria';
    document.querySelectorAll('.en-top-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.cat === topCategoria);
    });
    renderTop();
    document.getElementById('enModalTop').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function renderTop() {
    const cont = document.getElementById('enTopLista');
    if (!cont) return;

    const lista = encuestas
        .filter(e => e.categoria === topCategoria)
        .filter(esVisibleParaMi)
        .map(e => ({ e, votos: totalVotos(e) }))
        .filter(x => x.votos > 0)
        .sort((a, b) => b.votos - a.votos)
        .slice(0, 10);

    if (lista.length === 0) {
        cont.innerHTML = `
            <div class="en-ver-vacio">
                <i data-lucide="trophy"></i>
                <p>Sin encuestas votadas en esta categoría todavía.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = lista.map((x, i) => {
        const u = usuariosPorCodigo[x.e.autor] || {};
        const nombre = x.e.autorNombre || u.nombre || x.e.autor;
        const rankClase = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : '';
        return `
            <div class="en-top-item" data-id="${x.e.id}">
                <div class="en-top-rank ${rankClase}">${i + 1}</div>
                <div class="en-top-body">
                    <div class="en-top-pregunta">${escapar(x.e.pregunta)}</div>
                    <div class="en-top-info">
                        <span>por ${escapar(nombre)}</span>
                        <span class="en-top-votos">
                            <i data-lucide="users"></i>
                            ${x.votos}
                        </span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.en-top-item').forEach(el => {
        el.addEventListener('click', () => {
            document.getElementById('enModalTop').hidden = true;
            abrirVerDetalle(el.dataset.id);
        });
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Encuestas necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Encuestas.'); return; }

    const badge = document.getElementById('enUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarCuentas();
    await cargarEncuestas(true);
    await procesarAutocierres();

    renderFeed();

    // Filtros categoría
    document.querySelectorAll('#enFiltroCategoria .en-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#enFiltroCategoria .en-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtroCategoria = chip.dataset.cat;
            renderFeed();
        });
    });
    // Filtros estado
    document.querySelectorAll('#enFiltroEstado .en-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#enFiltroEstado .en-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            filtroEstado = chip.dataset.estado;
            renderFeed();
        });
    });

    // FAB / Top
    document.getElementById('enFabNuevo')?.addEventListener('click', abrirModalCrear);
    document.getElementById('enEmptyBtnNuevo')?.addEventListener('click', abrirModalCrear);
    document.getElementById('enBtnTop')?.addEventListener('click', abrirModalTop);

    // Modal crear: cerrar
    document.getElementById('enCrearCerrar')?.addEventListener('click', () => {
        document.getElementById('enModalCrear').hidden = true;
    });
    document.getElementById('enCrearCancelar')?.addEventListener('click', () => {
        document.getElementById('enModalCrear').hidden = true;
    });

    // Modal crear: categoría
    document.querySelectorAll('.en-cat-opcion').forEach(b => {
        b.addEventListener('click', () => {
            catSeleccionada = b.dataset.cat;
            actualizarTogglesCrear();
        });
    });

    // Modal crear: toggles
    document.querySelectorAll('.en-toggle').forEach(b => {
        b.addEventListener('click', () => {
            const t = b.dataset.toggle;
            if (t === 'voto-unico' || t === 'voto-multiple') {
                toggleVoto = t === 'voto-unico' ? 'unico' : 'multiple';
            } else if (t === 'publico' || t === 'privado') {
                toggleVisibilidad = t === 'publico' ? 'publico' : 'privado';
                actualizarFieldJustificacion();
            } else if (t === 'todos' || t === 'invitados') {
                toggleAlcance = t === 'todos' ? 'todos' : 'invitados';
                document.getElementById('enCrearElegirInvitados').hidden = toggleAlcance !== 'invitados';
            }
            actualizarTogglesCrear();
        });
    });

    // Modal crear: opciones
    document.getElementById('enCrearAddOpcion')?.addEventListener('click', () => agregarOpcion(''));

    // Modal crear: justificación
    document.getElementById('enCrearJustifOblig')?.addEventListener('change', (e) => {
        justifObligatoria = e.target.checked;
    });

    // Modal crear: cierre
    document.getElementById('enCrearCierreActivo')?.addEventListener('change', (e) => {
        const inp = document.getElementById('enCrearCierreFecha');
        inp.hidden = !e.target.checked;
        if (e.target.checked) {
            // default: mañana a esta hora
            const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
            d.setSeconds(0, 0);
            const iso = d.toISOString().slice(0, 16);
            inp.value = iso;
        }
    });

    // Modal crear: invitados
    document.getElementById('enCrearElegirInvitados')?.addEventListener('click', abrirModalInvitados);

    // Modal crear: guardar
    document.getElementById('enCrearGuardar')?.addEventListener('click', guardarEncuesta);

    // Modal invitados
    document.getElementById('enInvitadosCerrar')?.addEventListener('click', () => {
        document.getElementById('enModalInvitados').hidden = true;
    });
    document.getElementById('enInvitadosListo')?.addEventListener('click', () => {
        document.getElementById('enModalInvitados').hidden = true;
        const txt = document.getElementById('enCrearInvitadosTxt');
        const n = invitadosSeleccionados.length;
        txt.textContent = n === 0 ? 'Elegir invitados'
            : n === 1 ? '1 invitado'
            : `${n} invitados`;
    });
    document.getElementById('enInvitadosBuscar')?.addEventListener('input', (e) => {
        renderListaInvitados(e.target.value);
    });

    // Modal ver
    document.getElementById('enVerCerrar')?.addEventListener('click', () => {
        document.getElementById('enModalVer').hidden = true;
    });

    // Modal top
    document.getElementById('enTopCerrar')?.addEventListener('click', () => {
        document.getElementById('enModalTop').hidden = true;
    });
    document.querySelectorAll('.en-top-tab').forEach(t => {
        t.addEventListener('click', () => {
            topCategoria = t.dataset.cat;
            document.querySelectorAll('.en-top-tab').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            renderTop();
        });
    });

    // Click fuera de modales
    ['enModalCrear', 'enModalVer', 'enModalTop', 'enModalInvitados'].forEach(id => {
        const m = document.getElementById(id);
        m?.addEventListener('click', (ev) => {
            if (ev.target.id === id) m.hidden = true;
        });
    });

    // Escape
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const abiertos = ['enModalInvitados', 'enModalCrear', 'enModalVer', 'enModalTop'];
        for (const id of abiertos) {
            const m = document.getElementById(id);
            if (m && !m.hidden) { m.hidden = true; return; }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
