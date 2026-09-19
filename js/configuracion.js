// ============================================================
//  configuracion.js — Modal + navegación + Apps + Temas + Widgets
// ============================================================

const CONFIG_KEY = 'vicwebos_config';
const DEFAULT_CONFIG = { theme: 'light' };

function cargarConfiguracion() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (e) { console.warn(e); }
    return { ...DEFAULT_CONFIG };
}

function guardarConfiguracion(config) {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
    catch (e) { console.warn(e); }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnConfig        = document.getElementById('btnConfig');
    const configOverlay    = document.getElementById('configOverlay');
    const btnCerrarConfig  = document.getElementById('btnCerrarConfig');
    const btnGuardarConfig = document.getElementById('btnGuardarConfig');
    const appsLista        = document.getElementById('appsInstaladasLista');
    const footerMsg        = document.getElementById('configFooterMsg');

    if (!btnConfig || !configOverlay) return;

    if (typeof inicializarUICuenta === 'function') inicializarUICuenta();

    // ---------- NAVEGACIÓN ----------
    document.querySelectorAll('.config-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const seccion = btn.dataset.section;
            document.querySelectorAll('.config-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.querySelector(`.config-panel[data-panel="${seccion}"]`);
            if (panel) panel.classList.add('active');

            if (seccion === 'temas')   renderApariencia();
            if (seccion === 'widgets') renderApariencia();
            if (seccion === 'apps') {
                renderAppsInstaladas();
                renderApariencia();
            }
            if (seccion === 'bd' && typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();
        });
    });

    // ---------- RENDER: APPS ----------
    function renderAppsInstaladas() {
        if (!appsLista) return;

        if (!ConfigBD.estaConectado()) {
            appsLista.innerHTML = `
                <div class="config-empty" style="padding: 30px 12px;">
                    <div class="config-empty-icon"><i data-lucide="database"></i></div>
                    <h4>Conecta GitHub primero</h4>
                    <p>Ve a la pestaña "Comunidades" y conecta tu repositorio.</p>
                </div>`;
            lucide.createIcons();
            return;
        }
        if (!cuentaActual) {
            appsLista.innerHTML = `
                <div class="config-empty" style="padding: 30px 12px;">
                    <div class="config-empty-icon"><i data-lucide="user-circle"></i></div>
                    <h4>Necesitas una cuenta</h4>
                    <p>Crea una cuenta o entra con tu código para ver tus apps.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
        const instaladas = obtenerAppsInstaladas();

        appsLista.innerHTML = '';
        if (instaladas.length === 0) return;

        instaladas.forEach(id => {
            const app = catalogo.find(a => a.id === id);
            if (!app) return;

            const item = document.createElement('div');
            item.className = 'app-instalada-item';
            item.innerHTML = `
                <div class="app-instalada-icono"><i data-lucide="${app.icono || 'circle'}"></i></div>
                <div class="app-instalada-info">
                    <span class="app-instalada-nombre">${app.nombre}</span>
                    <span class="app-instalada-desc">${app.descripcion || ''}</span>
                </div>
                ${app.esBase
                    ? '<span class="app-base-tag">Sistema</span>'
                    : `<button class="app-desinstalar" data-id="${app.id}" title="Desinstalar">
                        <i data-lucide="trash-2"></i>
                       </button>`}`;
            appsLista.appendChild(item);
        });

        lucide.createIcons();

        appsLista.querySelectorAll('.app-desinstalar').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await desinstalarApp(btn.dataset.id);
                    renderAppsInstaladas();
                    if (typeof renderSidebar === 'function') {
                        const s = document.getElementById('searchInput');
                        renderSidebar(s ? s.value : '');
                    }
                } catch (e) { alert('❌ ' + e.message); }
            });
        });
    }

    // ---------- RENDER: TEMAS + WIDGETS + ACCESOS ----------
    function renderApariencia() {
        const temasCont   = document.getElementById('configTemasLista');
        const widgetsCont = document.getElementById('configWidgetsLista');
        const accesosCont = document.getElementById('configAccesosLista');

        if (!ConfigBD.estaConectado() || !cuentaActual) {
            const html = `
                <div class="config-empty" style="padding: 30px 12px;">
                    <div class="config-empty-icon"><i data-lucide="user-circle"></i></div>
                    <h4>Necesitas una cuenta</h4>
                    <p>Crea una cuenta o entra con tu código.</p>
                </div>`;
            if (temasCont)   temasCont.innerHTML = html;
            if (widgetsCont) widgetsCont.innerHTML = html;
            if (accesosCont) accesosCont.innerHTML = html;
            lucide.createIcons();
            return;
        }

        // --- Temas ---
        if (temasCont) {
            const catalogoTemas = typeof TEMAS_DISPONIBLES !== 'undefined' ? TEMAS_DISPONIBLES : [];
            const instalados = obtenerTemasInstalados();
            const activo = obtenerTemaActivo();

            if (instalados.length === 0) {
                temasCont.innerHTML = `<p class="config-ayuda">No tienes temas instalados. Abre Stor-He.</p>`;
            } else {
                temasCont.innerHTML = '';
                instalados.forEach(id => {
                    const tema = catalogoTemas.find(t => t.id === id);
                    if (!tema) return;
                    const c = tema.colores || {};
                    const item = document.createElement('label');
                    item.className = 'config-tema-item' + (activo === id ? ' activo' : '');
                    item.innerHTML = `
                        <input type="radio" name="temaRadio" value="${id}" ${activo === id ? 'checked' : ''}>
                        <div class="config-tema-mini" style="background:${c['--bg'] || '#fff'};">
                            <div class="config-tema-mini-sidebar" style="background:${c['--bg-alt'] || '#eee'};"></div>
                            <div class="config-tema-mini-content">
                                <span class="config-tema-mini-dot" style="background:${c['--violet-500'] || '#8B5CF6'};"></span>
                                <span class="config-tema-mini-dot" style="background:${c['--violet-300'] || '#C4B5FD'};"></span>
                            </div>
                        </div>
                        <div class="config-tema-nombre">
                            ${tema.nombre}
                            ${activo === id ? '<span class="config-tema-check"><i data-lucide="check"></i></span>' : ''}
                        </div>
                    `;
                    temasCont.appendChild(item);
                });

                lucide.createIcons();

                temasCont.querySelectorAll('input[name="temaRadio"]').forEach(radio => {
                    radio.addEventListener('change', async (e) => {
                        try {
                            await aplicarTema(e.target.value);
                            renderApariencia();
                            if (footerMsg) footerMsg.textContent = '✅ Tema por defecto actualizado';
                        } catch (err) { alert('❌ ' + err.message); }
                    });
                });
            }
        }

        // --- Widgets ---
        if (widgetsCont) {
            const catalogoW = typeof WIDGETS_DISPONIBLES !== 'undefined' ? WIDGETS_DISPONIBLES : [];
            const instaladosW = obtenerWidgetsInstalados();
            const activosW = obtenerWidgetsActivos();

            if (instaladosW.length === 0) {
                widgetsCont.innerHTML = `<p class="config-ayuda">No tienes widgets instalados. Abre Stor-He.</p>`;
            } else {
                widgetsCont.innerHTML = '';
                instaladosW.forEach(id => {
                    const w = catalogoW.find(x => x.id === id);
                    if (!w) return;
                    const activo = activosW.includes(id);
                    const item = document.createElement('div');
                    item.className = 'config-widget-item' + (activo ? ' activo' : '');
                    item.innerHTML = `
                        <div class="config-widget-icono"><i data-lucide="${w.icono || 'square'}"></i></div>
                        <div class="config-widget-info">
                            <span class="config-widget-nombre">${w.nombre}</span>
                            <span class="config-widget-desc">${w.descripcion || ''}</span>
                        </div>
                        <button class="config-widget-toggle" data-id="${id}" data-activo="${activo}" title="${activo ? 'Desactivar' : 'Activar'}">
                            <i data-lucide="${activo ? 'toggle-right' : 'toggle-left'}"></i>
                        </button>
                    `;
                    widgetsCont.appendChild(item);
                });

                lucide.createIcons();

                widgetsCont.querySelectorAll('.config-widget-toggle').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const id = btn.dataset.id;
                        const activo = btn.dataset.activo === 'true';
                        try {
                            if (activo) await desactivarWidget(id);
                            else await activarWidget(id);
                            renderApariencia();
                        } catch (err) { alert('❌ ' + err.message); }
                    });
                });
            }
        }

        // --- Accesos rápidos (Apps destacadas) ---
        if (accesosCont) {
            const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
            const instaladas = obtenerAppsInstaladas();
            const activos = obtenerAccesosRapidos();

            if (instaladas.length === 0) {
                accesosCont.innerHTML = `<p class="config-ayuda">No tienes apps instaladas. Abre Stor-He.</p>`;
            } else {
                accesosCont.innerHTML = '';

                instaladas.forEach(id => {
                    const app = catalogo.find(a => a.id === id);
                    if (!app) return;
                    const activo = activos.includes(id);

                    const label = document.createElement('label');
                    label.className = 'config-checkbox-label' + (activo ? ' activo' : '');
                    label.innerHTML = `
                        <input type="checkbox" data-id="${id}" ${activo ? 'checked' : ''}>
                        <span class="config-checkbox-icono"><i data-lucide="${app.icono || 'circle'}"></i></span>
                        <span class="config-checkbox-texto">${app.nombre}</span>
                    `;
                    accesosCont.appendChild(label);
                });

                lucide.createIcons();

                accesosCont.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.addEventListener('change', async () => {
                        const id = cb.dataset.id;
                        try {
                            if (cb.checked) {
                                await activarAccesoRapido(id);
                            } else {
                                await desactivarAccesoRapido(id);
                            }
                            if (typeof renderAccesosRapidos === 'function') renderAccesosRapidos();
                            cb.closest('.config-checkbox-label').classList.toggle('activo', cb.checked);
                            if (footerMsg) footerMsg.textContent = '✅ Apps destacadas actualizadas';
                        } catch (err) {
                            cb.checked = !cb.checked;
                            alert('❌ ' + err.message);
                        }
                    });
                });
            }
        }
    }

    // ---------- ABRIR ----------
    btnConfig.addEventListener('click', () => {
        document.querySelectorAll('.config-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.config-nav-item[data-section="cuenta"]')?.classList.add('active');
        document.querySelector('.config-panel[data-panel="cuenta"]')?.classList.add('active');

        if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();
        if (typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();

        if (footerMsg) footerMsg.textContent = '';
        configOverlay.style.display = 'flex';
        lucide.createIcons();
    });

    // ---------- CERRAR ----------
    btnCerrarConfig.addEventListener('click', () => configOverlay.style.display = 'none');
    configOverlay.addEventListener('click', (e) => {
        if (e.target === configOverlay) configOverlay.style.display = 'none';
    });

    // ---------- GUARDAR ----------
    btnGuardarConfig.addEventListener('click', async () => {
        if (footerMsg) footerMsg.textContent = '✅ Cambios guardados';
        setTimeout(() => { if (footerMsg) footerMsg.textContent = ''; }, 900);
    });

    // Exponer para que JsIndex pueda re-renderizar
    window.__renderApariencia = renderApariencia;
});

// ---------- ABRIR CONFIG DIRECTO ----------
function abrirConfigEnCuenta() {
    const btn = document.getElementById('btnConfig');
    if (btn) btn.click();
}

function abrirConfigEnBD() {
    const btn = document.getElementById('btnConfig');
    if (btn) btn.click();
    setTimeout(() => {
        document.querySelector('.config-nav-item[data-section="bd"]')?.click();
    }, 100);
}
