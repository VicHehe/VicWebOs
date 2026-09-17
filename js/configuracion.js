// ============================================================
//  configuracion.js — Config + gestión de apps instaladas
// ============================================================

const CONFIG_KEY = 'vicwebos_config';

const DEFAULT_CONFIG = {
    storage: 'local',
    githubToken: '',
    githubRepo: '',
    theme: 'light',
    appsInstaladas: ['stor-he']   // por defecto solo Stor-He
};

// ---------- CARGAR / GUARDAR ----------
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

// ---------- GESTIÓN DE APPS ----------
function obtenerAppsInstaladas() {
    const config = cargarConfiguracion();
    return config.appsInstaladas || [];
}

function estaInstalada(id) {
    return obtenerAppsInstaladas().includes(id);
}

function instalarApp(id) {
    const config = cargarConfiguracion();
    if (!config.appsInstaladas.includes(id)) {
        config.appsInstaladas.push(id);
        guardarConfiguracion(config);
    }
}

function desinstalarApp(id) {
    // No se puede desinstalar una app base
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const app = catalogo.find(a => a.id === id);
    if (app && app.esBase) {
        throw new Error('Esta app es del sistema y no se puede desinstalar.');
    }

    const config = cargarConfiguracion();
    config.appsInstaladas = config.appsInstaladas.filter(a => a !== id);
    guardarConfiguracion(config);
}

// ---------- GITHUB API ----------
async function guardarEnGitHub(config) {
    const { githubToken, githubRepo } = config;
    if (!githubToken || !githubRepo) throw new Error('Falta token o repo');

    const [owner, repo] = githubRepo.split('/');
    const path = 'vicwebos-data.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    let sha = null;
    try {
        const res = await fetch(apiUrl, { headers: { Authorization: `Bearer ${githubToken}` } });
        if (res.ok) sha = (await res.json()).sha;
    } catch (e) {}

    const body = {
        message: 'Actualizar datos de VicWebOs',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2)))),
        sha
    };

    const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${githubToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error((await res.json()).message || 'Error GitHub');
    return await res.json();
}

async function guardarEnGoogleDrive() {
    throw new Error('Google Drive aún no implementado');
}

// ---------- UI DE CONFIGURACIÓN ----------
document.addEventListener('DOMContentLoaded', () => {
    const btnConfig       = document.getElementById('btnConfig');
    const configOverlay   = document.getElementById('configOverlay');
    const btnCerrarConfig = document.getElementById('btnCerrarConfig');
    const btnGuardarConfig= document.getElementById('btnGuardarConfig');
    const githubConfig    = document.getElementById('githubConfig');
    const githubToken     = document.getElementById('githubToken');
    const githubRepo      = document.getElementById('githubRepo');
    const appsLista       = document.getElementById('appsInstaladasLista');

    if (!btnConfig || !configOverlay) return;

    function renderAppsInstaladas() {
        if (!appsLista) return;
        const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
        const instaladas = obtenerAppsInstaladas();

        if (instaladas.length === 0) {
            appsLista.innerHTML = `<p class="config-ayuda">No tienes apps instaladas.</p>`;
            return;
        }

        appsLista.innerHTML = '';
        instaladas.forEach(id => {
            const app = catalogo.find(a => a.id === id);
            if (!app) return;

            const item = document.createElement('div');
            item.className = 'app-instalada-item';
            item.innerHTML = `
                <div class="app-instalada-info">
                    <i data-lucide="${app.icono || 'circle'}"></i>
                    <div>
                        <span class="app-instalada-nombre">${app.nombre}</span>
                        <span class="app-instalada-desc">${app.descripcion || ''}</span>
                    </div>
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
            btn.addEventListener('click', () => {
                try {
                    desinstalarApp(btn.dataset.id);
                    renderAppsInstaladas();
                    // Refrescar sidebar si está disponible
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

    btnConfig.addEventListener('click', () => {
        const config = cargarConfiguracion();
        document.querySelectorAll('input[name="storage"]').forEach(r => {
            r.checked = r.value === config.storage;
        });
        githubConfig.style.display = config.storage === 'github' ? 'block' : 'none';
        githubToken.value = config.githubToken || '';
        githubRepo.value = config.githubRepo || '';
        renderAppsInstaladas();
        configOverlay.style.display = 'flex';
        lucide.createIcons();
    });

    btnCerrarConfig.addEventListener('click', () => configOverlay.style.display = 'none');
    configOverlay.addEventListener('click', (e) => {
        if (e.target === configOverlay) configOverlay.style.display = 'none';
    });

    document.querySelectorAll('input[name="storage"]').forEach(r => {
        r.addEventListener('change', (e) => {
            githubConfig.style.display = e.target.value === 'github' ? 'block' : 'none';
        });
    });

    btnGuardarConfig.addEventListener('click', async () => {
        const storage = document.querySelector('input[name="storage"]:checked')?.value || 'local';
        const config = cargarConfiguracion();
        config.storage = storage;
        config.githubToken = githubToken.value.trim();
        config.githubRepo = githubRepo.value.trim();

        try {
            if (storage === 'github') {
                await guardarEnGitHub(config);
            } else if (storage === 'gdrive') {
                await guardarEnGoogleDrive(config);
            }
            guardarConfiguracion(config);
            alert('✅ Configuración guardada');
            configOverlay.style.display = 'none';
        } catch (err) {
            alert('❌ Error: ' + err.message);
        }
    });
});
