// ============================================================
//  configuracion.js — Modal + navegación + Apps
// ============================================================

const CONFIG_KEY = 'vicwebos_config';

const DEFAULT_CONFIG = {
    theme: 'light'
};

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

// ============================================================
//  UI
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const btnConfig        = document.getElementById('btnConfig');
    const configOverlay    = document.getElementById('configOverlay');
    const btnCerrarConfig  = document.getElementById('btnCerrarConfig');
    const btnGuardarConfig = document.getElementById('btnGuardarConfig');
    const appsLista        = document.getElementById('appsInstaladasLista');
    const footerMsg        = document.getElementById('configFooterMsg');
    const githubToken      = document.getElementById('githubToken');
    const githubRepo       = document.getElementById('githubRepo');
    const githubConfig     = document.getElementById('githubConfig');

    if (!btnConfig || !configOverlay) return;

    // Inicializar UI de cuenta
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

            // Refrescar apps al abrir ese panel
            if (seccion === 'apps') renderAppsInstaladas();
        });
    });

    // ---------- RENDER APPS ----------
    function renderAppsInstaladas() {
        if (!appsLista) return;

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

    // ---------- ABRIR CONFIG ----------
    btnConfig.addEventListener('click', () => {
        // BD
        if (typeof cargarConfigBD === 'function') {
            const bdConfig = cargarConfigBD();
            document.querySelectorAll('input[name="storage"]').forEach(r => {
                r.checked = r.value === bdConfig.tipo;
            });
            if (githubConfig) githubConfig.style.display = bdConfig.tipo === 'github' ? 'block' : 'none';
            if (githubToken) githubToken.value = bdConfig.githubToken || '';
            if (githubRepo)  githubRepo.value  = bdConfig.githubRepo  || '';
        }

        // Reset a sección "cuenta"
        document.querySelectorAll('.config-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.config-panel').forEach(p => p.classList.remove('active'));
        document.querySelector('.config-nav-item[data-section="cuenta"]')?.classList.add('active');
        document.querySelector('.config-panel[data-panel="cuenta"]')?.classList.add('active');

        // Actualizar UI de sesión
        if (typeof window.__actualizarUISesion === 'function') window.__actualizarUISesion();

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
        const storageElegido = document.querySelector('input[name="storage"]:checked')?.value || 'indexeddb';

        if (typeof cargarConfigBD === 'function') {
            const bdConfig = cargarConfigBD();
            bdConfig.tipo = storageElegido;
            guardarConfigBD(bdConfig);
        }

        if (footerMsg) footerMsg.textContent = '✅ Cambios guardados';
        setTimeout(() => {
            if (footerMsg) footerMsg.textContent = '';
        }, 900);
    });
});

// ============================================================
//  ABRIR CONFIG DIRECTO A "CUENTA"
// ============================================================
function abrirConfigEnCuenta() {
    const btn = document.getElementById('btnConfig');
    if (btn) btn.click();
}
