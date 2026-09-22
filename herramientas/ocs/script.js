// ============================================================
//  Mis OCs — Personajes originales (COMPARTIDO)
//  ------------------------------------------------------------
//  · Datos: app/ocs/ocs.json  (todos ven todos los OCs)
//  · Cada OC guarda creador + creadorNombre
//  · Solo el creador puede editar / borrar su OC
//  · Filtro: Todos / Solo míos
//  · Imágenes: Galería (MasterHad.galeria)
//  · Sin emojis: todo Lucide
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const RUTA_ARCHIVO = 'app/ocs/ocs.json';
const ITEMS_POR_PAGINA = 18;
const MAX_PUNTOS_STATS = 50;
const MAX_GUSTOS = 20;
const MAX_DISGUSTOS = 20;

const STATS_CATEGORIAS = [
    { id: 'fisico', nombre: 'Físico', icono: 'dumbbell', stats: [
        { id: 'fuerza',      nombre: 'Fuerza',      icono: 'dumbbell' },
        { id: 'agilidad',    nombre: 'Agilidad',    icono: 'wind' },
        { id: 'resistencia', nombre: 'Resistencia', icono: 'shield' },
        { id: 'valentia',    nombre: 'Valentía',    icono: 'flame' }
    ]},
    { id: 'mental', nombre: 'Mental', icono: 'brain', stats: [
        { id: 'inteligencia',  nombre: 'Inteligencia',  icono: 'brain' },
        { id: 'carisma',       nombre: 'Carisma',       icono: 'sparkles' },
        { id: 'concentracion', nombre: 'Concentración', icono: 'target' },
        { id: 'humor',         nombre: 'Humor',         icono: 'smile' }
    ]},
    { id: 'social', nombre: 'Social', icono: 'users', stats: [
        { id: 'comunicacion', nombre: 'Comunicación', icono: 'message-circle' },
        { id: 'empatia',      nombre: 'Empatía',      icono: 'heart-handshake' },
        { id: 'seduccion',    nombre: 'Seducción',    icono: 'heart' },
        { id: 'suerte',       nombre: 'Suerte',       icono: 'clover' }
    ]},
    { id: 'especial', nombre: 'Especial', icono: 'sparkles', stats: [
        { id: 'poder_stat',   nombre: 'Poder',       icono: 'wand-2' },
        { id: 'reservado',    nombre: 'Reservado',   icono: 'eye-off' },
        { id: 'creatividad',  nombre: 'Creatividad', icono: 'palette' }
    ]}
];

const STATS_DEFAULT = {};
STATS_CATEGORIAS.forEach(c => c.stats.forEach(s => { STATS_DEFAULT[s.id] = 0; }));

// ---------- ESTADO ----------
let usuarioActual = null;
let usuariosPorCodigo = {};
let ocs = [];
let ocEditandoId = null;
let ocViendoId = null;
let statsEditando = { ...STATS_DEFAULT };
let fotoEditandoId = null;
let extraEditandoIndex = null;
let extraFotoId = null;

let filtroNombre = '';
let soloMios = false;
let paginaActual = 1;
let urlsActivas = [];
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const MH  = () => window.parent.MasterHad || null;
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
//  Helpers
// ============================================================
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function generarId(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function limpiarUrls() {
    urlsActivas.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    urlsActivas = [];
}
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ocToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'oc-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function totalPuntos(stats) {
    return Object.values(stats || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

// ============================================================
//  Persistencia
// ============================================================
async function cargarOCs() {
    const bd = BD();
    if (!bd) { ocs = []; return; }
    try {
        const data = await bd.leerArchivo(RUTA_ARCHIVO);
        if (data && Array.isArray(data.ocs)) {
            ocs = data.ocs.filter(o => o && o.id && o.nombre);
            ocs.forEach(o => {
                if (!o.stats || typeof o.stats !== 'object') o.stats = { ...STATS_DEFAULT };
                else Object.keys(STATS_DEFAULT).forEach(k => { o.stats[k] = Number(o.stats[k]) || 0; });
                if (!Array.isArray(o.gustos)) o.gustos = [];
                if (!Array.isArray(o.disgustos)) o.disgustos = [];
                if (!Array.isArray(o.extras)) o.extras = [];
            });
        } else ocs = [];
    } catch (e) {
        console.warn('[OCs] Error cargando:', e);
        ocs = [];
    }
}

async function guardarOCs() {
    const bd = BD();
    if (!bd) return;
    try {
        await bd.escribirArchivo(RUTA_ARCHIVO, {
            version: 1,
            actualizado: new Date().toISOString(),
            ocs
        });
    } catch (e) {
        console.warn('[OCs] Error guardando:', e);
        toast('No se pudo guardar', 'error');
        throw e;
    }
}

async function cargarUsuarios() {
    const bd = BD();
    if (!bd) return;
    try {
        const cuentas = await bd.leerArchivo('cuenta.json');
        if (!Array.isArray(cuentas)) return;
        usuariosPorCodigo = {};
        cuentas.forEach(c => { usuariosPorCodigo[c.codigo] = c; });
    } catch (e) {}
}

// ============================================================
//  Filtro + Render
// ============================================================
function filtrados() {
    let lista = ocs.slice();
    if (soloMios && usuarioActual) lista = lista.filter(o => o.creador === usuarioActual.codigo);
    if (filtroNombre) {
        const q = filtroNombre.toLowerCase().trim();
        lista = lista.filter(o => (o.nombre || '').toLowerCase().includes(q));
    }
    lista.sort((a, b) => new Date(b.creado || 0) - new Date(a.creado || 0));
    return lista;
}

function renderGrid() {
    const grid = document.getElementById('ocGrid');
    const empty = document.getElementById('ocEmpty');
    const emptyTitulo = document.getElementById('ocEmptyTitulo');
    const emptyDesc = document.getElementById('ocEmptyDesc');
    const btnEmptyNuevo = document.getElementById('ocEmptyBtnNuevo');
    const contador = document.getElementById('ocContador');
    const paginacion = document.getElementById('ocPagination');
    if (!grid) return;

    limpiarUrls();
    const lista = filtrados();

    if (contador) {
        if (lista.length === 0) contador.textContent = '';
        else if (filtroNombre) contador.textContent = `${lista.length} resultado${lista.length === 1 ? '' : 's'}`;
        else if (soloMios) contador.textContent = `${lista.length} OC${lista.length === 1 ? '' : 's'} tuyo${lista.length === 1 ? '' : 's'}`;
        else contador.textContent = `${lista.length} OC${lista.length === 1 ? '' : 's'} de la comunidad`;
    }

    if (lista.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        empty.hidden = false;
        paginacion.innerHTML = '';
        if (filtroNombre) {
            emptyTitulo.textContent = 'Sin resultados';
            emptyDesc.textContent = `No hay OCs que coincidan con "${filtroNombre}".`;
            btnEmptyNuevo.hidden = true;
        } else if (soloMios) {
            emptyTitulo.textContent = 'No tenés OCs propios';
            emptyDesc.textContent = 'Creá tu primer personaje original.';
            btnEmptyNuevo.hidden = false;
        } else {
            emptyTitulo.textContent = 'Todavía no hay OCs';
            emptyDesc.textContent = 'Sé el primero en crear un personaje para la comunidad.';
            btnEmptyNuevo.hidden = false;
        }
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    empty.hidden = true;
    grid.hidden = false;

    const totalPaginas = Math.ceil(lista.length / ITEMS_POR_PAGINA);
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;
    if (paginaActual < 1) paginaActual = 1;

    const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
    const pagina = lista.slice(inicio, inicio + ITEMS_POR_PAGINA);

    grid.innerHTML = pagina.map(oc => {
        const u = usuariosPorCodigo[oc.creador] || {};
        const foto = u.foto || null;
        const esMio = oc.creador === usuarioActual.codigo;
        return `
            <div class="oc-card" data-id="${escapar(oc.id)}">
                <div class="oc-card-foto-wrap">
                    ${oc.imagenId
                        ? `<img data-imagen="${escapar(oc.imagenId)}" alt="">`
                        : `<i data-lucide="user"></i>`}
                </div>
                <div class="oc-card-nombre">${escapar(oc.nombre)}</div>
                <div class="oc-card-info">${escapar([
                    oc.edad, oc.profesion
                ].filter(Boolean).join(' · ') || 'Sin datos')}</div>
                ${!esMio ? `
                    <div class="oc-card-creador">
                        <span class="oc-card-creador-avatar">
                            ${foto ? `<img src="${foto}" alt="">` : `<span>${escapar((oc.creadorNombre || oc.creador || '?').charAt(0).toUpperCase())}</span>`}
                        </span>
                        <span class="oc-card-creador-nombre">${escapar(oc.creadorNombre || oc.creador || 'Anónimo')}</span>
                    </div>` : ''}
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    const mh = MH();
    if (mh) {
        grid.querySelectorAll('img[data-imagen]').forEach(img => {
            mh.galeria.leerImagenURL(img.dataset.imagen).then(url => {
                if (!url) return;
                urlsActivas.push(url);
                img.src = url;
            }).catch(() => {});
        });
    }

    grid.querySelectorAll('.oc-card').forEach(card => {
        card.addEventListener('click', () => abrirDetalle(card.dataset.id));
    });

    renderPaginacion(totalPaginas);
}

function renderPaginacion(totalPaginas) {
    const cont = document.getElementById('ocPagination');
    if (!cont) return;
    if (totalPaginas <= 1) { cont.innerHTML = ''; return; }

    let html = `<div class="oc-pagination-buttons">`;
    html += `<button class="oc-page-btn" data-page="${paginaActual - 1}" ${paginaActual === 1 ? 'disabled' : ''}>‹</button>`;

    let inicio = Math.max(1, paginaActual - 2);
    let fin = Math.min(totalPaginas, paginaActual + 2);
    if (fin - inicio < 4) {
        if (inicio === 1) fin = Math.min(totalPaginas, inicio + 4);
        else if (fin === totalPaginas) inicio = Math.max(1, fin - 4);
    }

    if (inicio > 1) {
        html += `<button class="oc-page-btn" data-page="1">1</button>`;
        if (inicio > 2) html += `<span class="oc-page-ellipsis">…</span>`;
    }

    for (let p = inicio; p <= fin; p++) {
        html += `<button class="oc-page-btn ${p === paginaActual ? 'active' : ''}" data-page="${p}">${p}</button>`;
    }

    if (fin < totalPaginas) {
        if (fin < totalPaginas - 1) html += `<span class="oc-page-ellipsis">…</span>`;
        html += `<button class="oc-page-btn" data-page="${totalPaginas}">${totalPaginas}</button>`;
    }

    html += `<button class="oc-page-btn" data-page="${paginaActual + 1}" ${paginaActual === totalPaginas ? 'disabled' : ''}>›</button>`;
    html += `</div>`;
    cont.innerHTML = html;

    cont.querySelectorAll('.oc-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page, 10);
            if (!isNaN(page) && page >= 1 && page <= totalPaginas && page !== paginaActual) {
                paginaActual = page;
                renderGrid();
                document.querySelector('.oc-main')?.scrollTo(0, 0);
            }
        });
    });
}

// ============================================================
//  Stats editor
// ============================================================
function renderStatsEditor() {
    const cont = document.getElementById('ocStatsGrid');
    if (!cont) return;

    cont.innerHTML = STATS_CATEGORIAS.map(cat => `
        <div class="oc-stat-categoria">
            <div class="oc-stat-categoria-titulo">
                <i data-lucide="${cat.icono}"></i>
                <span>${cat.nombre}</span>
            </div>
            ${cat.stats.map(s => `
                <div class="oc-stat-row">
                    <span class="oc-stat-nombre">
                        <i data-lucide="${s.icono}"></i>
                        ${s.nombre}
                    </span>
                    <div class="oc-stat-estrellas" data-stat="${s.id}"></div>
                </div>
            `).join('')}
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.oc-stat-estrellas').forEach(wrap => {
        const statId = wrap.dataset.stat;
        wrap.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'estrella';
            btn.dataset.valor = i;
            btn.innerHTML = `<i data-lucide="star"></i>`;
            btn.addEventListener('click', () => setStat(statId, i));
            wrap.appendChild(btn);
        }
    });

    if (window.lucide) window.lucide.createIcons();
    refrescarEstrellas();
    actualizarContadorPuntos();
}

function setStat(statId, valor) {
    const actual = statsEditando[statId] || 0;
    const nuevo = (actual === valor) ? 0 : valor;
    const otros = totalPuntos(statsEditando) - actual;
    if (otros + nuevo > MAX_PUNTOS_STATS) {
        toast(`Solo quedan ${MAX_PUNTOS_STATS - otros} puntos disponibles`, 'error');
        return;
    }
    statsEditando[statId] = nuevo;
    refrescarEstrellas();
    actualizarContadorPuntos();
}

function refrescarEstrellas() {
    document.querySelectorAll('.oc-stat-estrellas').forEach(wrap => {
        const statId = wrap.dataset.stat;
        const val = statsEditando[statId] || 0;
        wrap.querySelectorAll('.estrella').forEach(e => {
            e.classList.toggle('activa', Number(e.dataset.valor) <= val);
        });
    });
}

function actualizarContadorPuntos() {
    const total = totalPuntos(statsEditando);
    const el = document.getElementById('ocPuntos');
    if (!el) return;
    el.textContent = `${total} / ${MAX_PUNTOS_STATS}`;
    el.classList.toggle('limite', total >= MAX_PUNTOS_STATS);
}

// ============================================================
//  Editor
// ============================================================
function abrirEditor(ocId = null) {
    ocEditandoId = ocId;
    fotoEditandoId = null;

    const titulo = document.getElementById('ocEditorTitulo');
    const inputNombre = document.getElementById('ocInputNombre');
    const inputEdad = document.getElementById('ocInputEdad');
    const inputSexo = document.getElementById('ocInputSexo');
    const inputNacionalidad = document.getElementById('ocInputNacionalidad');
    const inputPoder = document.getElementById('ocInputPoder');
    const inputProfesion = document.getElementById('ocInputProfesion');
    const mensaje = document.getElementById('ocEditorMensaje');
    const fotoPreview = document.getElementById('ocFotoPreview');
    const fotoImg = document.getElementById('ocFotoImg');
    const btnQuitarFoto = document.getElementById('ocBtnQuitarFoto');
    const fotoBtnTxt = document.getElementById('ocFotoBtnTxt');

    mensaje.textContent = '';
    mensaje.className = 'oc-mensaje';

    if (ocId) {
        const oc = ocs.find(o => o.id === ocId);
        if (!oc) return;
        titulo.textContent = 'Editar OC';
        inputNombre.value = oc.nombre || '';
        inputEdad.value = oc.edad || '';
        inputSexo.value = oc.sexo || '';
        inputNacionalidad.value = oc.nacionalidad || '';
        inputPoder.value = oc.poder || '';
        inputProfesion.value = oc.profesion || '';
        statsEditando = { ...STATS_DEFAULT, ...(oc.stats || {}) };
        fotoEditandoId = oc.imagenId || null;
        fotoBtnTxt.textContent = 'Cambiar foto';
    } else {
        titulo.textContent = 'Nuevo OC';
        inputNombre.value = '';
        inputEdad.value = '';
        inputSexo.value = '';
        inputNacionalidad.value = '';
        inputPoder.value = '';
        inputProfesion.value = '';
        statsEditando = { ...STATS_DEFAULT };
        fotoEditandoId = null;
        fotoBtnTxt.textContent = 'Elegir foto';
    }

    fotoImg.removeAttribute('src');
    fotoPreview.classList.remove('con-foto');
    btnQuitarFoto.hidden = true;

    if (fotoEditandoId) {
        fotoPreview.classList.add('con-foto');
        btnQuitarFoto.hidden = false;
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(fotoEditandoId).then(url => {
                if (url) {
                    fotoImg.src = url;
                    fotoImg.onload = () => URL.revokeObjectURL(url);
                }
            }).catch(() => {});
        }
    }

    renderStatsEditor();
    document.getElementById('ocModalEditor').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => inputNombre.focus(), 100);
}

function cerrarEditor() {
    document.getElementById('ocModalEditor').hidden = true;
    ocEditandoId = null;
    fotoEditandoId = null;
}

async function elegirFotoEditor() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí una foto para tu OC' });
        if (!id) return;
        fotoEditandoId = id;
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            const img = document.getElementById('ocFotoImg');
            img.src = url;
            img.onload = () => URL.revokeObjectURL(url);
            document.getElementById('ocFotoPreview').classList.add('con-foto');
            document.getElementById('ocBtnQuitarFoto').hidden = false;
            document.getElementById('ocFotoBtnTxt').textContent = 'Cambiar foto';
        }
    } catch (e) {
        console.warn('[OCs] Error picker:', e);
    }
}

function quitarFotoEditor() {
    fotoEditandoId = null;
    document.getElementById('ocFotoImg').removeAttribute('src');
    document.getElementById('ocFotoPreview').classList.remove('con-foto');
    document.getElementById('ocBtnQuitarFoto').hidden = true;
    document.getElementById('ocFotoBtnTxt').textContent = 'Elegir foto';
}

async function guardarOC() {
    const nombre = document.getElementById('ocInputNombre').value.trim();
    const msj = document.getElementById('ocEditorMensaje');
    msj.textContent = '';
    msj.className = 'oc-mensaje';

    if (!nombre) {
        msj.textContent = 'El nombre es obligatorio.';
        msj.className = 'oc-mensaje error';
        return;
    }

    const btn = document.getElementById('ocEditorGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        const stats = {};
        Object.keys(STATS_DEFAULT).forEach(k => { stats[k] = statsEditando[k] || 0; });

        const datosBase = {
            nombre,
            edad: document.getElementById('ocInputEdad').value.trim(),
            sexo: document.getElementById('ocInputSexo').value,
            nacionalidad: document.getElementById('ocInputNacionalidad').value.trim(),
            poder: document.getElementById('ocInputPoder').value.trim(),
            profesion: document.getElementById('ocInputProfesion').value.trim(),
            stats,
            imagenId: fotoEditandoId,
            actualizado: new Date().toISOString()
        };

        const esEdicion = !!ocEditandoId;

        if (esEdicion) {
            const idx = ocs.findIndex(o => o.id === ocEditandoId);
            if (idx >= 0) {
                if (ocs[idx].creador !== usuarioActual.codigo) {
                    throw new Error('Solo el creador puede editar este OC.');
                }
                ocs[idx] = { ...ocs[idx], ...datosBase };
            }
        } else {
            ocs.push({
                id: generarId('oc'),
                ...datosBase,
                gustos: [],
                disgustos: [],
                extras: [],
                creado: new Date().toISOString(),
                creador: usuarioActual.codigo,
                creadorNombre: usuarioActual.nombre || usuarioActual.codigo
            });
        }

        await guardarOCs();
        cerrarEditor();
        paginaActual = 1;
        renderGrid();
        toast(esEdicion ? 'OC actualizado' : 'OC creado', 'success');
    } catch (e) {
        msj.textContent = e.message || 'No se pudo guardar.';
        msj.className = 'oc-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  Detalle
// ============================================================
function abrirDetalle(id) {
    const oc = ocs.find(o => o.id === id);
    if (!oc) return;
    ocViendoId = id;
    renderDetalle(oc);
    document.getElementById('ocModalDetalle').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function cerrarDetalle() {
    document.getElementById('ocModalDetalle').hidden = true;
    ocViendoId = null;
}

function renderDetalle(oc) {
    const body = document.getElementById('ocDetalleBody');
    if (!body) return;

    const titulo = document.getElementById('ocDetalleTitulo');
    if (titulo) titulo.textContent = oc.nombre || 'Detalle';

    const esCreador = usuarioActual && oc.creador === usuarioActual.codigo;
    const totalPts = totalPuntos(oc.stats);
    const u = usuariosPorCodigo[oc.creador] || {};
    const fotoCreador = u.foto || null;
    const nombreCreador = oc.creadorNombre || u.nombre || oc.creador || 'Anónimo';

    let html = `
        <div class="oc-detalle-header">
            <div class="oc-detalle-foto">
                ${oc.imagenId
                    ? `<img data-imagen="${escapar(oc.imagenId)}" alt="">`
                    : `<i data-lucide="user"></i>`}
            </div>
            <div class="oc-detalle-meta">
                <h2>${escapar(oc.nombre)}</h2>
                <p>${escapar([
                    oc.edad, oc.sexo, oc.nacionalidad, oc.profesion, oc.poder
                ].filter(Boolean).join(' · ') || 'Sin datos')}</p>
                <div class="oc-detalle-subinfo">
                    <span class="oc-detalle-puntos">${totalPts} / ${MAX_PUNTOS_STATS} pts</span>
                    <span class="oc-detalle-creador">
                        <span class="oc-detalle-creador-avatar">
                            ${fotoCreador ? `<img src="${fotoCreador}" alt="">` : `<span>${escapar((nombreCreador || '?').charAt(0).toUpperCase())}</span>`}
                        </span>
                        por ${escapar(nombreCreador)}
                    </span>
                </div>
            </div>
        </div>
    `;

    html += `<div class="oc-detalle-stats-grid">`;
    STATS_CATEGORIAS.forEach(cat => {
        html += `
            <div class="oc-detalle-stat-bloque">
                <div class="oc-detalle-stat-bloque-titulo">
                    <i data-lucide="${cat.icono}"></i>
                    <span>${cat.nombre}</span>
                </div>
                ${cat.stats.map(s => {
                    const val = oc.stats?.[s.id] || 0;
                    const estrellas = Array.from({ length: 5 }, (_, i) =>
                        `<i data-lucide="star" class="${i < val ? 'llena' : ''}"></i>`
                    ).join('');
                    return `
                        <div class="oc-detalle-stat-linea">
                            <span class="nombre">
                                <i data-lucide="${s.icono}"></i>
                                ${s.nombre}
                            </span>
                            <span class="estrellas">${estrellas}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    });
    html += `</div>`;

    html += `
        <div class="oc-gustos-seccion">
            <div class="oc-gusto-col">
                <div class="oc-gusto-titulo gustos">
                    <i data-lucide="heart"></i>
                    <span>Gustos</span>
                </div>
                <div class="oc-gustos-lista" id="ocGustosLista"></div>
                ${esCreador ? `
                    <div class="oc-gusto-input-wrap">
                        <input type="text" id="ocInputGusto" maxlength="20" placeholder="Ej: Pizza">
                        <button type="button" id="ocBtnAgregarGusto" title="Añadir gusto">
                            <i data-lucide="plus"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="oc-gusto-col">
                <div class="oc-gusto-titulo disgustos">
                    <i data-lucide="heart-crack"></i>
                    <span>Disgustos</span>
                </div>
                <div class="oc-gustos-lista" id="ocDisgustosLista"></div>
                ${esCreador ? `
                    <div class="oc-gusto-input-wrap">
                        <input type="text" id="ocInputDisgusto" maxlength="20" placeholder="Ej: Mentiras">
                        <button type="button" id="ocBtnAgregarDisgusto" title="Añadir disgusto">
                            <i data-lucide="plus"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    if (oc.extras && oc.extras.length > 0) {
        html += `<div class="oc-extras-seccion">`;
        html += `<div class="oc-extras-titulo"><i data-lucide="paperclip"></i><span>Información extra</span></div>`;
        oc.extras.forEach((ex, i) => {
            html += `
                <div class="oc-extra-bloque">
                    <div class="oc-extra-bloque-header">
                        <div class="oc-extra-bloque-titulo">${escapar(ex.titulo || 'Sin título')}</div>
                        ${esCreador ? `
                            <div class="oc-extra-bloque-acciones">
                                <button class="oc-extra-bloque-btn" data-extra-editar="${i}" title="Editar">
                                    <i data-lucide="pencil"></i>
                                </button>
                                <button class="oc-extra-bloque-btn danger" data-extra-borrar="${i}" title="Eliminar">
                                    <i data-lucide="trash-2"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    ${ex.imagenId ? `<div class="oc-extra-bloque-imagen"><img data-imagen="${escapar(ex.imagenId)}" alt=""></div>` : ''}
                    <p class="oc-extra-bloque-texto">${escapar(ex.texto || '')}</p>
                </div>
            `;
        });
        html += `</div>`;
    }

    body.innerHTML = html;

    if (window.lucide) window.lucide.createIcons();

    const mh = MH();
    if (mh) {
        body.querySelectorAll('img[data-imagen]').forEach(img => {
            mh.galeria.leerImagenURL(img.dataset.imagen).then(url => {
                if (!url) return;
                urlsActivas.push(url);
                img.src = url;
            }).catch(() => {});
        });
    }

    renderGustos(oc);
    if (esCreador) bindGustosEventos(oc);
    bindExtrasEventos(oc);

    document.getElementById('ocDetalleEditar').hidden = !esCreador;
    document.getElementById('ocDetalleBorrar').hidden = !esCreador;
    document.getElementById('ocDetalleAgregarExtra').hidden = !esCreador;
}

function renderGustos(oc) {
    const gl = document.getElementById('ocGustosLista');
    const dl = document.getElementById('ocDisgustosLista');
    const esCreador = usuarioActual && oc.creador === usuarioActual.codigo;

    if (gl) {
        if (!oc.gustos || oc.gustos.length === 0) {
            gl.innerHTML = `<span class="oc-gustos-vacio">Sin gustos registrados</span>`;
        } else {
            gl.innerHTML = oc.gustos.map((g, i) => `
                <span class="oc-gusto-item gusto">
                    <span class="texto">${escapar(g)}</span>
                    ${esCreador ? `
                        <button class="btn-x" data-tipo="gusto" data-index="${i}" title="Eliminar">
                            <i data-lucide="x"></i>
                        </button>
                    ` : ''}
                </span>
            `).join('');
        }
    }

    if (dl) {
        if (!oc.disgustos || oc.disgustos.length === 0) {
            dl.innerHTML = `<span class="oc-gustos-vacio">Sin disgustos registrados</span>`;
        } else {
            dl.innerHTML = oc.disgustos.map((g, i) => `
                <span class="oc-gusto-item disgusto">
                    <span class="texto">${escapar(g)}</span>
                    ${esCreador ? `
                        <button class="btn-x" data-tipo="disgusto" data-index="${i}" title="Eliminar">
                            <i data-lucide="x"></i>
                        </button>
                    ` : ''}
                </span>
            `).join('');
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

function bindGustosEventos(oc) {
    document.querySelectorAll('.oc-gusto-item .btn-x').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.tipo;
            const idx = parseInt(btn.dataset.index, 10);
            eliminarGustoDisgusto(tipo, idx);
        });
    });

    const inputG = document.getElementById('ocInputGusto');
    const inputD = document.getElementById('ocInputDisgusto');
    const btnG = document.getElementById('ocBtnAgregarGusto');
    const btnD = document.getElementById('ocBtnAgregarDisgusto');

    btnG?.addEventListener('click', () => agregarGustoDisgusto('gusto'));
    btnD?.addEventListener('click', () => agregarGustoDisgusto('disgusto'));

    inputG?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); agregarGustoDisgusto('gusto'); }
    });
    inputD?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); agregarGustoDisgusto('disgusto'); }
    });
}

async function agregarGustoDisgusto(tipo) {
    const oc = ocs.find(o => o.id === ocViendoId);
    if (!oc) return;
    if (oc.creador !== usuarioActual.codigo) return;

    const inputId = tipo === 'gusto' ? 'ocInputGusto' : 'ocInputDisgusto';
    const input = document.getElementById(inputId);
    const texto = (input?.value || '').trim().slice(0, 20);
    if (!texto) return;

    const lista = tipo === 'gusto' ? oc.gustos : oc.disgustos;
    const max = tipo === 'gusto' ? MAX_GUSTOS : MAX_DISGUSTOS;
    if (lista.length >= max) {
        toast(`Máximo ${max} ${tipo === 'gusto' ? 'gustos' : 'disgustos'}`, 'error');
        return;
    }

    lista.push(texto);
    await guardarOCs();
    renderGustos(oc);
    bindGustosEventos(oc);
    if (input) input.value = '';
}

async function eliminarGustoDisgusto(tipo, index) {
    const oc = ocs.find(o => o.id === ocViendoId);
    if (!oc) return;
    if (oc.creador !== usuarioActual.codigo) return;
    const lista = tipo === 'gusto' ? oc.gustos : oc.disgustos;
    lista.splice(index, 1);
    await guardarOCs();
    renderGustos(oc);
    bindGustosEventos(oc);
}

function bindExtrasEventos(oc) {
    document.querySelectorAll('[data-extra-editar]').forEach(btn => {
        btn.addEventListener('click', () => abrirEditorExtra(parseInt(btn.dataset.extraEditar, 10)));
    });
    document.querySelectorAll('[data-extra-borrar]').forEach(btn => {
        btn.addEventListener('click', () => borrarExtra(parseInt(btn.dataset.extraBorrar, 10)));
    });
}

async function borrarExtra(index) {
    if (!confirm('¿Eliminar esta información extra?')) return;
    const oc = ocs.find(o => o.id === ocViendoId);
    if (!oc) return;
    if (oc.creador !== usuarioActual.codigo) return;
    oc.extras.splice(index, 1);
    await guardarOCs();
    renderDetalle(oc);
    toast('Información eliminada', 'success');
}

// ============================================================
//  Modal Extra
// ============================================================
function abrirEditorExtra(index = null) {
    const oc = ocs.find(o => o.id === ocViendoId);
    if (!oc) return;
    if (oc.creador !== usuarioActual.codigo) return;

    extraEditandoIndex = index;
    extraFotoId = null;

    const titulo = document.getElementById('ocExtraTitulo');
    const inputTitulo = document.getElementById('ocExtraTituloInput');
    const inputTexto = document.getElementById('ocExtraTexto');
    const mensaje = document.getElementById('ocExtraMensaje');
    const fotoWrap = document.getElementById('ocExtraFotoWrap');
    const fotoImg = document.getElementById('ocExtraFotoImg');
    const btnQuitarFoto = document.getElementById('ocExtraBtnQuitarFoto');
    const fotoBtnTxt = document.getElementById('ocExtraFotoBtnTxt');

    mensaje.textContent = '';
    mensaje.className = 'oc-mensaje';

    if (index !== null) {
        const extra = oc.extras[index];
        if (!extra) return;
        titulo.textContent = 'Editar información';
        inputTitulo.value = extra.titulo || '';
        inputTexto.value = extra.texto || '';
        extraFotoId = extra.imagenId || null;
        fotoBtnTxt.textContent = extraFotoId ? 'Cambiar imagen' : 'Elegir imagen';
    } else {
        titulo.textContent = 'Añadir información';
        inputTitulo.value = '';
        inputTexto.value = '';
        extraFotoId = null;
        fotoBtnTxt.textContent = 'Elegir imagen';
    }

    fotoImg.removeAttribute('src');
    fotoWrap.classList.remove('con-foto');
    btnQuitarFoto.hidden = true;

    if (extraFotoId) {
        fotoWrap.classList.add('con-foto');
        btnQuitarFoto.hidden = false;
        const mh = MH();
        if (mh) {
            mh.galeria.leerImagenURL(extraFotoId).then(url => {
                if (url) {
                    fotoImg.src = url;
                    fotoImg.onload = () => URL.revokeObjectURL(url);
                }
            }).catch(() => {});
        }
    }

    document.getElementById('ocModalExtra').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => inputTitulo.focus(), 100);
}

function cerrarEditorExtra() {
    document.getElementById('ocModalExtra').hidden = true;
    extraEditandoIndex = null;
    extraFotoId = null;
}

async function elegirFotoExtra() {
    const mh = MH();
    if (!mh) return;
    try {
        const id = await mh.galeria.abrirPicker({ multiple: false, titulo: 'Elegí una imagen para la info extra' });
        if (!id) return;
        extraFotoId = id;
        const url = await mh.galeria.leerImagenURL(id);
        if (url) {
            const img = document.getElementById('ocExtraFotoImg');
            img.src = url;
            img.onload = () => URL.revokeObjectURL(url);
            document.getElementById('ocExtraFotoWrap').classList.add('con-foto');
            document.getElementById('ocExtraBtnQuitarFoto').hidden = false;
            document.getElementById('ocExtraFotoBtnTxt').textContent = 'Cambiar imagen';
        }
    } catch (e) {
        console.warn('[OCs] Error picker extra:', e);
    }
}

function quitarFotoExtra() {
    extraFotoId = null;
    document.getElementById('ocExtraFotoImg').removeAttribute('src');
    document.getElementById('ocExtraFotoWrap').classList.remove('con-foto');
    document.getElementById('ocExtraBtnQuitarFoto').hidden = true;
    document.getElementById('ocExtraFotoBtnTxt').textContent = 'Elegir imagen';
}

async function guardarExtra() {
    const oc = ocs.find(o => o.id === ocViendoId);
    if (!oc) return;
    if (oc.creador !== usuarioActual.codigo) return;

    const titulo = document.getElementById('ocExtraTituloInput').value.trim();
    const texto = document.getElementById('ocExtraTexto').value.trim();
    const msj = document.getElementById('ocExtraMensaje');
    msj.textContent = '';
    msj.className = 'oc-mensaje';

    if (!titulo) { msj.textContent = 'Escribí un título.'; msj.className = 'oc-mensaje error'; return; }
    if (!texto) { msj.textContent = 'Escribí el texto.'; msj.className = 'oc-mensaje error'; return; }

    const btn = document.getElementById('ocExtraGuardar');
    if (btn.disabled) return;
    btn.disabled = true;

    try {
        const nuevo = { titulo, texto, imagenId: extraFotoId };
        const esEdicion = extraEditandoIndex !== null;

        if (esEdicion) oc.extras[extraEditandoIndex] = nuevo;
        else oc.extras.push(nuevo);

        await guardarOCs();
        cerrarEditorExtra();
        renderDetalle(oc);
        toast(esEdicion ? 'Actualizado' : 'Añadido', 'success');
    } catch (e) {
        msj.textContent = e.message || 'No se pudo guardar.';
        msj.className = 'oc-mensaje error';
    } finally {
        btn.disabled = false;
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Mis OCs necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para usar Mis OCs.'); return; }

    const badge = document.getElementById('ocUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarUsuarios();
    await cargarOCs();
    renderGrid();

    // Búsqueda
    const search = document.getElementById('ocSearch');
    const searchClear = document.getElementById('ocSearchClear');
    search?.addEventListener('input', (e) => {
        filtroNombre = e.target.value;
        paginaActual = 1;
        searchClear.hidden = !filtroNombre;
        renderGrid();
    });
    searchClear?.addEventListener('click', () => {
        search.value = '';
        filtroNombre = '';
        searchClear.hidden = true;
        paginaActual = 1;
        renderGrid();
    });

    // Filtro Todos / Míos
    document.querySelectorAll('.oc-filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.oc-filtro-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            soloMios = btn.dataset.filtro === 'mios';
            paginaActual = 1;
            renderGrid();
        });
    });

    // Abrir editor
    document.getElementById('ocBtnNuevo')?.addEventListener('click', () => abrirEditor());
    document.getElementById('ocFabNuevo')?.addEventListener('click', () => abrirEditor());
    document.getElementById('ocEmptyBtnNuevo')?.addEventListener('click', () => abrirEditor());

    // Editor
    document.getElementById('ocEditorCerrar')?.addEventListener('click', cerrarEditor);
    document.getElementById('ocEditorCancelar')?.addEventListener('click', cerrarEditor);
    document.getElementById('ocEditorGuardar')?.addEventListener('click', guardarOC);
    document.getElementById('ocBtnElegirFoto')?.addEventListener('click', elegirFotoEditor);
    document.getElementById('ocBtnQuitarFoto')?.addEventListener('click', quitarFotoEditor);

    // Detalle
    document.getElementById('ocDetalleCerrar')?.addEventListener('click', cerrarDetalle);
    document.getElementById('ocDetalleEditar')?.addEventListener('click', () => {
        if (!ocViendoId) return;
        const id = ocViendoId;
        cerrarDetalle();
        abrirEditor(id);
    });
    document.getElementById('ocDetalleBorrar')?.addEventListener('click', async () => {
        if (!ocViendoId) return;
        const oc = ocs.find(o => o.id === ocViendoId);
        if (!oc) return;
        if (oc.creador !== usuarioActual.codigo) {
            toast('Solo el creador puede borrar este OC', 'error');
            return;
        }
        if (!confirm(`¿Eliminar "${oc.nombre}"? Esta acción no se puede deshacer.`)) return;
        ocs = ocs.filter(o => o.id !== ocViendoId);
        await guardarOCs();
        cerrarDetalle();
        renderGrid();
        toast('OC eliminado', 'success');
    });
    document.getElementById('ocDetalleAgregarExtra')?.addEventListener('click', () => abrirEditorExtra(null));

    // Extra
    document.getElementById('ocExtraCerrar')?.addEventListener('click', cerrarEditorExtra);
    document.getElementById('ocExtraCancelar')?.addEventListener('click', cerrarEditorExtra);
    document.getElementById('ocExtraGuardar')?.addEventListener('click', guardarExtra);
    document.getElementById('ocExtraBtnElegirFoto')?.addEventListener('click', elegirFotoExtra);
    document.getElementById('ocExtraBtnQuitarFoto')?.addEventListener('click', quitarFotoExtra);

    // Click fuera de modales
    ['ocModalEditor', 'ocModalDetalle', 'ocModalExtra'].forEach(id => {
        const m = document.getElementById(id);
        m?.addEventListener('click', (ev) => { if (ev.target.id === id) m.hidden = true; });
    });

    // Escape
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const abiertos = ['ocModalExtra', 'ocModalEditor', 'ocModalDetalle'];
        for (const id of abiertos) {
            const m = document.getElementById(id);
            if (m && !m.hidden) { m.hidden = true; return; }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
window.addEventListener('pagehide', () => limpiarUrls());
