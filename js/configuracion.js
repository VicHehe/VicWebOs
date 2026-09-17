// ============================================================
//  configuracion.js — Modal + navegación + Apps
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
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) { console.warn(e); }
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

            if (seccion === 'apps') renderAppsInstaladas();
            if (seccion === 'bd' && typeof window.__actualizarUIBD === 'function') window.__actualizarUIBD();
        });
    });

    // ---------- RENDER APPS ----------
    function renderAppsInstaladas() {
        if (!appsLista) return;

        if (!ConfigBD.estaConectado()) {
            appsLista.innerHTML = `
                <div class="config-empty" style="padding: 30px 12px;">
                    <div class="config-empty-icon"><i data-lucide="database"></i></div>
                    <h4>Conecta GitHub primero</h4>
                    <p>Ve a la pestaña "Base de datos" y conecta tu repositorio.</p>
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
                <div class="app-instalada-icono">
                    <i data-lucide="${app.icono || 'circle'}"></i>
                </div>
                <div class="app-instalada-info">
                    <span class="app-instalada-nombre">${app.nombre}</span>
                    <span class="app-instalada-desc">${app.descripcion || ''}</span>
                </div>
                ${app.esBase
                    ? '<span class="app-base-tag">Sistema</span>'
                    : `<button class="app-desinstalar" data-id="${app.id}" title="Desinstalar">
                        <i data-lucide="trash-2"></i>
                       </button>`
                }
            `;
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
                } catch (e) {
                    alert('❌ ' + e.message);
                }
            });
        });
    }

    // ---------- ABRIR ----------
    btnConfig.addEventListener('click', () => {
        // Reset a sección "cuenta"
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
        setTimeout(() => {
            if (footerMsg) footerMsg.textContent = '';
        }, 900);
    });
});

// ============================================================
//  ABRIR CONFIG DIRECTO
// ============================================================
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
