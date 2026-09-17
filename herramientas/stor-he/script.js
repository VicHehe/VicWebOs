// ============================================================
//  Stor-He — Lógica
//  Instalar/desinstalar apps, temas y widgets.
//  (Tema activo y widgets activos se controlan en Config)
// ============================================================

const API = () => window.parent.__vicwebos || null;

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

// ============================================================
//  TAB: APPS
// ============================================================
function renderApps() {
    const api = API();
    const cont = document.getElementById('appsContenido');
    if (!cont) return;

    if (!api) {
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOs.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo = api.obtenerCatalogo() || [];
    const instaladas = api.obtenerInstaladas() || [];
    document.getElementById('countApps').textContent = catalogo.length;

    renderGrid(cont, catalogo, (app) => {
        const instalada = instaladas.includes(app.id);
        const esBase = !!app.esBase;

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
                             <button class="sh-btn sh-btn-instalar" data-accion="instalar" data-id="${app.id}">
                                <i data-lucide="plus-circle"></i> Agregar al sidebar
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
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOs.</p></div>`;
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
                             <button class="sh-btn sh-btn-instalar" data-accion="instalarTema" data-id="${tema.id}">
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
        cont.innerHTML = `<div class="sh-empty"><i data-lucide="alert-triangle"></i><h3>Error de conexión</h3><p>No se pudo conectar con VicWebOs.</p></div>`;
        lucide.createIcons();
        return;
    }

    const catalogo = api.obtenerWidgets() || [];
    const instalados = api.obtenerWidgetsInstalados() || [];

    document.getElementById('countWidgets').textContent = catalogo.length;

    renderGrid(cont, catalogo, (widget) => {
        const instalado = instalados.includes(widget.id);
        const esBase = !!widget.esBase;

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
                             <button class="sh-btn sh-btn-instalar" data-accion="instalarWidget" data-id="${widget.id}">
                                <i data-lucide="download"></i> Instalar
                             </button>
                           </div>`}
                </div>
            </div>`;
    });
}

// ============================================================
//  ACCIONES
// ============================================================
async function manejarAccion(accion, id) {
    const api = API();
    if (!api) return;

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
        }
        refrescarTodo();
    } catch (e) {
        toast(e.message || 'Error', 'error');
    }
}

function refrescarTodo() {
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
    inicializarTabs();

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-accion]');
        if (!btn) return;
        e.preventDefault();
        manejarAccion(btn.dataset.accion, btn.dataset.id);
    });

    setTimeout(refrescarTodo, 100);
});
