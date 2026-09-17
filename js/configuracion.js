// ============================================================
//  configuracion.js — Configuración de VicWebOs
//  Maneja: almacenamiento, GitHub API, Google Drive, etc.
// ============================================================

const CONFIG_KEY = 'vicwebos_config';

const DEFAULT_CONFIG = {
    storage: 'local',          // 'local' | 'github' | 'gdrive' | 'other'
    githubToken: '',
    githubRepo: '',
    theme: 'light',
    favoritos: []
};

// ---------- CARGAR CONFIGURACIÓN ----------
function cargarConfiguracion() {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
        }
    } catch (e) {
        console.warn('Error cargando configuración:', e);
    }
    return { ...DEFAULT_CONFIG };
}

// ---------- GUARDAR CONFIGURACIÓN ----------
function guardarConfiguracion(config) {
    try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch (e) {
        console.warn('Error guardando configuración:', e);
    }
}

// ---------- GITHUB API (guardar/leer JSON) ----------
// Requiere un token de acceso personal (PAT) con permisos de repo.
// El token se guarda en localStorage (solo para desarrollo; en producción
// usa variables de entorno o un backend mínimo).
async function guardarEnGitHub(config) {
    const { githubToken, githubRepo } = config;
    if (!githubToken || !githubRepo) {
        throw new Error('Falta token o repositorio de GitHub');
    }
    const [owner, repo] = githubRepo.split('/');
    const path = 'vicwebos-data.json';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    // Obtener SHA actual (si existe)
    let sha = null;
    try {
        const res = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${githubToken}` }
        });
        if (res.ok) {
            const data = await res.json();
            sha = data.sha;
        }
    } catch (e) { /* archivo no existe */ }

    const body = {
        message: 'Actualizar datos de VicWebOs',
        content: btoa(unescape(encodeURIComponent(JSON.stringify(config, null, 2)))),
        sha: sha
    };

    const res = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${githubToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Error al guardar en GitHub');
    }
    return await res.json();
}

// ---------- GOOGLE DRIVE (placeholder) ----------
// Requiere OAuth 2.0 con scope drive.appdata.
// Se puede usar la librería "drivestore" desde CDN para simplificar.
async function guardarEnGoogleDrive(config) {
    // TODO: implementar con Google Identity Services + drivestore
    throw new Error('Google Drive aún no implementado');
}

// ---------- INICIALIZAR UI DE CONFIGURACIÓN ----------
document.addEventListener('DOMContentLoaded', () => {
    const btnConfig = document.getElementById('btnConfig');
    const configOverlay = document.getElementById('configOverlay');
    const btnCerrarConfig = document.getElementById('btnCerrarConfig');
    const btnGuardarConfig = document.getElementById('btnGuardarConfig');
    const githubConfig = document.getElementById('githubConfig');
    const githubToken = document.getElementById('githubToken');
    const githubRepo = document.getElementById('githubRepo');

    if (!btnConfig || !configOverlay) return;

    // Abrir configuración
    btnConfig.addEventListener('click', () => {
        const config = cargarConfiguracion();
        // Marcar opción de almacenamiento actual
        document.querySelectorAll('input[name="storage"]').forEach(radio => {
            radio.checked = radio.value === config.storage;
        });
        // Mostrar/ocultar campos de GitHub
        githubConfig.style.display = config.storage === 'github' ? 'block' : 'none';
        githubToken.value = config.githubToken || '';
        githubRepo.value = config.githubRepo || '';
        configOverlay.style.display = 'flex';
    });

    // Cerrar
    btnCerrarConfig.addEventListener('click', () => {
        configOverlay.style.display = 'none';
    });
    configOverlay.addEventListener('click', (e) => {
        if (e.target === configOverlay) configOverlay.style.display = 'none';
    });

    // Cambiar opción de almacenamiento
    document.querySelectorAll('input[name="storage"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            githubConfig.style.display = e.target.value === 'github' ? 'block' : 'none';
        });
    });

    // Guardar
    btnGuardarConfig.addEventListener('click', async () => {
        const storage = document.querySelector('input[name="storage"]:checked')?.value || 'local';
        const config = cargarConfiguracion();
        config.storage = storage;
        config.githubToken = githubToken.value.trim();
        config.githubRepo = githubRepo.value.trim();

        try {
            if (storage === 'local') {
                guardarConfiguracion(config);
            } else if (storage === 'github') {
                await guardarEnGitHub(config);
                guardarConfiguracion(config);
            } else if (storage === 'gdrive') {
                await guardarEnGoogleDrive(config);
            } else {
                guardarConfiguracion(config);
            }
            alert('✅ Configuración guardada');
            configOverlay.style.display = 'none';
        } catch (err) {
            alert('❌ Error: ' + err.message);
        }
    });
});
