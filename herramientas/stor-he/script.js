// ============================================================
//  Stor-He — Lógica
//  Instalar/desinstalar apps, temas y widgets.
//  Incluye validaciones de espacio y monedas + compra de espacio.
//  Compatible con TODOS los temas (hereda variables CSS del padre).
//
//  Anti doble-click: mientras una acción está en curso, el botón
//  se deshabilita y se bloquea una segunda ejecución.
// ============================================================

const API = () => window.parent.__vicwebos || null;
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// Set de acciones en vuelo: "instalar:calculadora", "instalarTema:vapor", ...
const _accionesEnVuelo = new Set();

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
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ---------- TOAST ----------
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('shToast');
    if (!el) return;
    const icono = tipo === 'success' ? 'check-circle-2'
                : tipo === 'error'   ? 'alert-circle'
                : 'info';
    el.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    el.className = 'sh-toast show ' + tipo;
    lucide.createIcons();
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- RECURSOS ----------
function actualizarRecursos() {
    const api = API();
    if (!api) return;

    const espacioMax = api.obtenerEspacioMaximo() ?? 50;
    const espacioUsado = api.obtenerEspacioUsado() ?? 0;
    const monedas = api.obtenerMonedas() ?? 0;

    const elEsp = document.getElementById('shEspacio');
    const elMon = document.getElementById('shMonedas');
    if (elEsp) elEsp.textContent = `${espacioUsado} / ${espacioMax}`;
    if (elMon) elMon.textContent = monedas;
}

// ---------- RENDER: AMPLIACIÓN ----------
function renderAmpliacion() {
    const cont = document.getElementById('shAmpliacion');
    const api = API();
    if (!cont || !api) return;

    const max = api.obtenerEspacioMaximo() ?? 50;
    const monedas = api.obtenerMonedas() ?? 0;
    const costo = api.COSTO_COMPRA_ESPACIO ?? 2500;
    const sumar = api.ESPACIO_POR_COMPRA ?? 12;
    const puede = monedas >= costo;

    cont.innerHTML = `
        <div class="sh-ampliacion-card">
            <div class="sh-ampliacion-icono"><i data-lucide="hard-drive"></i></div>
            <div class="sh-ampliacion-info">
                <div class="sh-ampliacion-titulo">Ampliar espacio</div>
                <div class="sh-ampliacion-desc">
                    Añade <strong>+${sumar} espacio</strong> a tu VicWebOs.
                    Actualmente tienes <strong>${max}</strong>.
                </div>
            </div>
            <button class="sh-btn ${puede ? 'sh-btn-instalar' : 'sh-btn-aplicar'}"
                    data-accion="comprarEspacio"
                    ${puede ? '' : 'disabled title="Te faltan monedas"'}>
                <i data-lucide="coins"></i>
                ${costo} monedas
            </button>
        </div>
    `;
    lucide.createIcons();
}

// ---------- RENDER GENÉRICO ----------
function agruparPorCategoria(lista) {
    const cats = {};
    lista.forEach(item => {
        const c = item.categoria || 'General';
        (cats[c] = cats[c] || []).push(item);
    });
    return cats;
}

function renderGrid(contenedor, lista, renderCard) {
    if (!contenedor) return;

    if (lista.length === 0) {
        contenedor.innerHTML = `
            <div class="sh-empty">
                <i data-lucide="package-open"></i>
                <h3>No hay nada por aquí</h3>
                <p>El catálogo está vacío o no se pudo cargar.</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const cats = agruparPorCategoria(lista);
    let html = '';
    for (const [cat, items] of Object.entries(cats)) {
        html += `<div class="sh-categoria">`;
        html += `<div class="sh-categoria-titulo">${cat}</div>`;
        html += `<div class="sh-grid">`;
        items.forEach(item => { html += renderCard(item); });
        html += `</div></div>`;
    }
    contenedor.innerHTML = html;
    lucide.createIcons();
}

// ---------- ETIQUETA DE COSTO ----------
function etiquetaCosto(item) {
    const partes = [];
    if ((item.espacio || 0) > 0) {
        partes.push(`<span class="sh-coste sh-coste-esp"><i data-lucide="hard-drive"></i> ${item.espacio}</span>`);
    }
    if ((item.monedas || 0) > 0) {
        partes.push(`<span class="sh-coste sh-coste-mon"><i data-lucide="coins"></i> ${item.monedas}</span>`);
    }
    if (partes.length === 0) return '';
    return `<div class="sh-costes">${partes.join('')}</div>`;
}

// ============================================================
//  TAB: APPS
// ============================================================
function renderApps() {
    const api = API();
    const cont = document.getElementById('appsContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo = api.obtenerCatalogo() || [];
    const instaladas = api.obtenerInstaladas() || [];
    document.getElementById('countApps').textContent = catalogo.length;

    renderGrid(cont, catalogo, (app) => {
        const instalada = instaladas.includes(app.id);
        const esBase = !!app.esBase;
        const check = api.puedeInstalar({ espacio: app.espacio || 0, monedas: app.monedas || 0 });
        const bloqueado = !instalada && !check.ok;

        return `
            <div class="sh-card ${instalada ? 'instalada' : ''}" data-id="${app.id}">
                <div class="sh-card-header">
                    <div class="sh-card-icono"><i data-lucide="${app.icono || 'circle'}"></i></div>
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${app.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Sistema</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${app.descripcion || ''}</div>
                        ${etiquetaCosto(app)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalada
                        ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Activa</span>
                           <div class="sh-acciones">
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalar" data-id="${app.id}" title="Quitar del sidebar">
                                    <i data-lucide="minus-circle"></i>
                                </button>`}
                             <button class="sh-btn sh-btn-abrir" data-accion="abrir" data-id="${app.id}">
                                <i data-lucide="external-link"></i> Abrir
                             </button>
                           </div>`
                        : `<div class="sh-acciones">
                             <button class="sh-btn ${bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar'}"
                                     data-accion="instalar" data-id="${app.id}"
                                     ${bloqueado ? `disabled title="${check.motivo}"` : ''}>
                                <i data-lucide="plus-circle"></i> Agregar
                             </button>
                           </div>`}
                </div>
            </div>`;
    });
}

// ============================================================
//  TAB: TEMAS
// ============================================================
function renderTemaPreview(colores) {
    const c100 = colores['--violet-100'] || '#EDE9FE';
    const c300 = colores['--violet-300'] || '#C4B5FD';
    const c500 = colores['--violet-500'] || '#8B5CF6';
    const bg   = colores['--bg']         || '#FBFBFD';
    const bgAlt= colores['--bg-alt']     || '#F5F5F8';
    const white= colores['--white']      || '#FFFFFF';

    return `
        <div class="sh-tema-preview" style="background:${bg};">
            <div class="sh-tema-preview-header" style="background:${white};">
                <div class="sh-tema-preview-header-dot" style="background:${c500};"></div>
                <div class="sh-tema-preview-header-dot" style="background:${c300};"></div>
                <div class="sh-tema-preview-header-dot" style="background:${c100};"></div>
            </div>
            <div class="sh-tema-preview-body">
                <div class="sh-tema-preview-sidebar" style="background:${bgAlt};"></div>
                <div class="sh-tema-preview-content" style="background:${white};">
                    <div class="sh-tema-preview-line w80" style="background:${c500};"></div>
                    <div class="sh-tema-preview-line w60" style="background:${c300};"></div>
                    <div class="sh-tema-preview-line w40" style="background:${c100};"></div>
                </div>
            </div>
        </div>`;
}

function renderTemas() {
    const api = API();
    const cont = document.getElementById('temasContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo = api.obtenerTemas() || [];
    const instalados = api.obtenerTemasInstalados() || [];
    const activo = api.obtenerTemaActivo();

    document.getElementById('countTemas').textContent = catalogo.length;

    renderGrid(cont, catalogo, (tema) => {
        const instalado = instalados.includes(tema.id);
        const esBase = !!tema.esBase;
        const esActivo = activo === tema.id;
        const check = api.puedeInstalar({ espacio: tema.espacio || 0, monedas: tema.monedas || 0 });
        const bloqueado = !instalado && !check.ok;

        return `
            <div class="sh-card ${instalado ? 'instalada' : ''}" data-id="${tema.id}">
                ${renderTemaPreview(tema.colores || {})}
                <div class="sh-card-header">
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${tema.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Base</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${tema.descripcion || ''}</div>
                        ${etiquetaCosto(tema)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalado
                        ? `${esActivo
                             ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Aplicado</span>`
                             : `<button class="sh-btn sh-btn-aplicar" data-accion="aplicarTema" data-id="${tema.id}">
                                    <i data-lucide="play"></i> Aplicar
                                </button>`}
                           <div class="sh-acciones">
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalarTema" data-id="${tema.id}" title="Desinstalar">
                                    <i data-lucide="trash-2"></i>
                                </button>`}
                           </div>`
                        : `<div class="sh-acciones">
                             <button class="sh-btn ${bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar'}"
                                     data-accion="instalarTema" data-id="${tema.id}"
                                     ${bloqueado ? `disabled title="${check.motivo}"` : ''}>
                                <i data-lucide="download"></i> Instalar
                             </button>
                           </div>`}
                </div>
            </div>`;
    });
}

// ============================================================
//  TAB: WIDGETS
// ============================================================
function renderWidgets() {
    const api = API();
    const cont = document.getElementById('widgetsContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOS.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo = api.obtenerWidgets() || [];
    const instalados = api.obtenerWidgetsInstalados() || [];

    document.getElementById('countWidgets').textContent = catalogo.length;

    renderGrid(cont, catalogo, (widget) => {
        const instalado = instalados.includes(widget.id);
        const esBase = !!widget.esBase;
        const check = api.puedeInstalar({ espacio: widget.espacio || 0, monedas: widget.monedas || 0 });
        const bloqueado = !instalado && !check.ok;

        return `
            <div class="sh-card ${instalado ? 'instalada' : ''}" data-id="${widget.id}">
                <div class="sh-card-header">
                    <div class="sh-card-icono"><i data-lucide="${widget.icono || 'square'}"></i></div>
                    <div class="sh-card-info">
                        <div class="sh-card-nombre">
                            ${widget.nombre}
                            ${esBase ? '<span class="sh-badge sh-badge-base">Sistema</span>' : ''}
                        </div>
                        <div class="sh-card-desc">${widget.descripcion || ''}</div>
                        ${etiquetaCosto(widget)}
                    </div>
                </div>
                <div class="sh-card-footer">
                    ${instalado
                        ? `<span class="sh-badge sh-badge-instalada"><i data-lucide="check"></i> Instalado</span>
                           <div class="sh-acciones">
                             <small style="font-size:11px;color:var(--gray-500);margin-right:6px;">
                                Actívalo en Configuración
                             </small>
                             ${esBase ? '' : `
                                <button class="sh-btn sh-btn-icono" data-accion="desinstalarWidget" data-id="${widget.id}" title="Desinstalar">
                                    <i data-lucide="trash-2"></i>
                                </button>`}
                           </div>`
                        : `<div class="sh-acciones">
                             <button class="sh-btn ${bloqueado ? 'sh-btn-aplicar' : 'sh-btn-instalar'}"
                                     data-accion="instalarWidget" data-id="${widget.id}"
                                     ${bloqueado ? `disabled title="${check.motivo}"` : ''}>
                                <i data-lucide="download"></i> Instalar
                             </button>
                           </div>`}
                </div>
            </div>`;
    });
}

// ============================================================
//  ACCIONES (con lock anti doble-click)
// ============================================================
async function manejarAccion(accion, id, btnOrigen) {
    const api = API();
    if (!api) return;

    // Lock por acción + id (permite dos apps distintas a la vez, pero no la misma dos veces)
    const clave = `${accion}:${id || 'x'}`;
    if (_accionesEnVuelo.has(clave)) {
        return;
    }
    _accionesEnVuelo.add(clave);

    // Deshabilitar botón mientras dura
    let txtOriginal = '';
    if (btnOrigen) {
        btnOrigen.disabled = true;
        txtOriginal = btnOrigen.innerHTML;
        btnOrigen.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
        lucide.createIcons();
    }

    try {
        switch (accion) {
            case 'instalar':
                await api.instalar(id);
                toast('App agregada a tu sidebar', 'success');
                break;
            case 'desinstalar':
                await api.desinstalar(id);
                toast('App quitada de tu sidebar', 'success');
                break;
            case 'abrir':
                if (!api.estaInstalada(id)) await api.instalar(id);
                api.abrirApp(id);
                toast('Abriendo app...', 'info');
                break;
            case 'instalarTema':
                await api.instalarTema(id);
                toast('Tema instalado', 'success');
                break;
            case 'desinstalarTema':
                await api.desinstalarTema(id);
                toast('Tema desinstalado', 'success');
                break;
            case 'aplicarTema':
                await api.aplicarTema(id);
                toast('Tema por defecto actualizado', 'success');
                break;
            case 'instalarWidget':
                await api.instalarWidget(id);
                toast('Widget instalado', 'success');
                break;
            case 'desinstalarWidget':
                await api.desinstalarWidget(id);
                toast('Widget desinstalado', 'success');
                break;
            case 'comprarEspacio':
                await api.comprarEspacio();
                toast('¡Espacio ampliado!', 'success');
                break;
        }
        refrescarTodo();
    } catch (e) {
        toast(e.message || 'Error', 'error');
    } finally {
        _accionesEnVuelo.delete(clave);
        if (btnOrigen && document.body.contains(btnOrigen)) {
            // El botón puede haber sido reemplazado por refrescarTodo();
            // si sigue existiendo, restaurar.
            btnOrigen.disabled = false;
            btnOrigen.innerHTML = txtOriginal;
            lucide.createIcons();
        }
    }
}

function refrescarTodo() {
    actualizarRecursos();
    renderAmpliacion();
    renderApps();
    renderTemas();
    renderWidgets();
}

// ---------- TABS ----------
function inicializarTabs() {
    document.querySelectorAll('.sh-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sh-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.sh-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`.sh-panel[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
        });
    });
}

// ---------- INIT ----------
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    inicializarTabs();

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        e.preventDefault();
        if (btn.disabled) return;
        manejarAccion(btn.dataset.accion, btn.dataset.id, btn);
    });

    setTimeout(refrescarTodo, 100);
});
