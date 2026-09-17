// ============================================================
//  JsIndex.js — Pestañas + sidebar (solo instaladas) + API
//  Clima con iconos Lucide (sin emojis)
// ============================================================

const MAX_TABS = 10;
let tabs = [];
let activeTabId = null;

const sidebarNav     = document.getElementById('sidebarNav');
const searchInput    = document.getElementById('searchInput');
const tabBar         = document.getElementById('tabBar');
const panelContainer = document.getElementById('panelContainer');
const welcomeScreen  = document.getElementById('welcomeScreen');
const btnVerTodas    = document.getElementById('btnVerTodas');

// ============================================================
//  SIDEBAR: SOLO APPS INSTALADAS
// ============================================================
function renderSidebar(filtro = '') {
    if (!sidebarNav) return;
    sidebarNav.innerHTML = '';

    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const instaladas = obtenerAppsInstaladas();
    let lista = catalogo.filter(h => instaladas.includes(h.id));

    if (lista.length === 0) {
        sidebarNav.innerHTML = `
            <div class="sidebar-empty">
                <i data-lucide="package-open"></i>
                <span>No tienes apps instaladas. Abre <strong>Stor-He</strong> para descargar.</span>
            </div>`;
        lucide.createIcons();
        return;
    }

    if (filtro) {
        const f = filtro.toLowerCase();
        lista = lista.filter(h =>
            h.nombre.toLowerCase().includes(f) ||
            (h.descripcion || '').toLowerCase().includes(f)
        );
    }

    if (lista.length === 0) {
        sidebarNav.innerHTML = `
            <div class="sidebar-empty">
                <i data-lucide="search-x"></i>
                <span>Sin resultados para "${filtro}"</span>
            </div>`;
        lucide.createIcons();
        return;
    }

    lista.forEach(h => {
        const btn = document.createElement('button');
        btn.className = 'nav-item';
        btn.dataset.id = h.id;
        btn.innerHTML = `
            <i data-lucide="${h.icono || 'circle'}" class="nav-icon"></i>
            ${h.nombre}
        `;
        btn.addEventListener('click', () => abrirHerramienta(h.id));
        sidebarNav.appendChild(btn);
    });

    lucide.createIcons();
    actualizarNavActivo();
}

function actualizarNavActivo() {
    if (!sidebarNav) return;
    sidebarNav.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === activeTabId);
    });
}

// ============================================================
//  PESTAÑAS
// ============================================================
function abrirHerramienta(id) {
    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const herramienta = catalogo.find(h => h.id === id);
    if (!herramienta) return;

    const existente = tabs.find(t => t.id === id);
    if (existente) { activarPestania(id); return; }

    if (tabs.length >= MAX_TABS) {
        alert(`Solo puedes tener ${MAX_TABS} pestañas abiertas.`);
        return;
    }

    const iframe = document.createElement('iframe');
    iframe.src = herramienta.ruta;
    iframe.dataset.id = id;
    iframe.style.display = 'none';
    iframe.className = 'tool-iframe';
    panelContainer.appendChild(iframe);

    tabs.push({
        id, nombre: herramienta.nombre,
        icono: herramienta.icono || 'circle',
        iframe
    });

    renderTabs();
    activarPestania(id);
}

function activarPestania(id) {
    activeTabId = id;
    panelContainer.querySelectorAll('iframe').forEach(f => {
        f.style.display = 'none';
        f.classList.remove('active');
    });
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    const tab = tabs.find(t => t.id === id);
    if (tab) {
        tab.iframe.style.display = 'block';
        tab.iframe.classList.add('active');
    }
    renderTabs();
    actualizarNavActivo();
}

function cerrarPestania(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = tabs[index];
    if (tab.iframe && tab.iframe.parentNode) tab.iframe.parentNode.removeChild(tab.iframe);
    tabs.splice(index, 1);

    if (activeTabId === id) {
        if (tabs.length > 0) activarPestania(tabs[tabs.length - 1].id);
        else { activeTabId = null; mostrarBienvenida(); }
    }
    renderTabs();
    actualizarNavActivo();
}

function renderTabs() {
    if (!tabBar) return;

    if (tabs.length === 0) {
        tabBar.innerHTML = `
            <span class="tab-empty-hint">
                <i data-lucide="hexagon"></i>
                Abre una app del menú
            </span>`;
        lucide.createIcons();
        return;
    }

    tabBar.innerHTML = tabs.map(t => `
        <div class="tab-item ${t.id === activeTabId ? 'active' : ''}" data-id="${t.id}">
            <i data-lucide="${t.icono}"></i>
            <span>${t.nombre}</span>
            <button class="tab-close" data-id="${t.id}"><i data-lucide="x"></i></button>
        </div>
    `).join('');

    lucide.createIcons();

    tabBar.querySelectorAll('.tab-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) return;
            activarPestania(el.dataset.id);
        });
    });
    tabBar.querySelectorAll('.tab-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            cerrarPestania(btn.dataset.id);
        });
    });
}

function mostrarBienvenida() {
    panelContainer.querySelectorAll('iframe').forEach(f => {
        f.style.display = 'none';
        f.classList.remove('active');
    });
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    activeTabId = null;
    renderTabs();
    actualizarNavActivo();
}

// ============================================================
//  MODAL "VER TODAS"
// ============================================================
function abrirModalTodas() {
    const modal = document.getElementById('modalTodas');
    const body  = document.getElementById('modalTodasBody');
    if (!modal || !body) return;

    const catalogo = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];
    const instaladas = obtenerAppsInstaladas();
    const lista = catalogo.filter(h => instaladas.includes(h.id));

    if (lista.length === 0) {
        body.innerHTML = `
            <div class="sidebar-empty" style="padding: 40px 12px;">
                <i data-lucide="package-open"></i>
                <span>Aún no tienes apps instaladas. Abre Stor-He.</span>
            </div>`;
        lucide.createIcons();
        modal.style.display = 'flex';
        return;
    }

    const cats = {};
    lista.forEach(h => {
        const c = h.categoria || 'Sin categoría';
        (cats[c] = cats[c] || []).push(h);
    });

    let html = '';
    for (const [cat, arr] of Object.entries(cats)) {
        html += `<div class="modal-categoria"><h3>${cat}</h3><div class="modal-categoria-grid">`;
        arr.forEach(h => {
            html += `
                <div class="modal-herramienta-item" data-id="${h.id}">
                    <div class="item-superior">
                        <i data-lucide="${h.icono || 'circle'}"></i>
                        <span class="item-nombre">${h.nombre}</span>
                    </div>
                    <small>${h.descripcion || ''}</small>
                </div>`;
        });
        html += `</div></div>`;
    }
    body.innerHTML = html;
    lucide.createIcons();

    body.querySelectorAll('.modal-herramienta-item').forEach(el => {
        el.addEventListener('click', () => {
            cerrarModalTodas();
            abrirHerramienta(el.dataset.id);
        });
    });
    modal.style.display = 'flex';
}

function cerrarModalTodas() {
    const modal = document.getElementById('modalTodas');
    if (modal) modal.style.display = 'none';
}

// ============================================================
//  CLIMA (con iconos Lucide) + RELOJ
// ============================================================

// Devuelve el nombre del icono Lucide según el código WMO
function iconoClima(c, isDay) {
    const d = isDay === 1;
    if (c === 0) return d ? 'sun' : 'moon';
    if (c === 1) return d ? 'sun' : 'moon-star';
    if (c === 2) return d ? 'cloud-sun' : 'cloud-moon';
    if (c === 3) return 'cloud';
    if (c === 45 || c === 48) return 'cloud-fog';
    if (c >= 51 && c <= 57) return 'cloud-drizzle';
    if (c >= 61 && c <= 67) return 'cloud-rain';
    if (c >= 71 && c <= 77) return 'snowflake';
    if (c >= 80 && c <= 82) return 'cloud-rain-wind';
    if (c === 85 || c === 86) return 'cloud-snow';
    if (c >= 95) return 'cloud-lightning';
    return d ? 'cloud-sun' : 'cloud-moon';
}

async function obtenerClima(lat, lon) {
    try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`);
        if (!r.ok) return null;
        const d = await r.json();
        if (!d.current) return null;
        return {
            temp: Math.round(d.current.temperature_2m),
            icono: iconoClima(d.current.weather_code, d.current.is_day)
        };
    } catch (e) {
        return null;
    }
}

function iniciarRelojLocal() {
    const el = document.getElementById('horaLocal');
    if (!el) return;
    const act = () => {
        el.textContent = new Date().toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    };
    act();
    setInterval(act, 1000);
}

function pintarClima(icono, temp) {
    const el = document.getElementById('climaLocal');
    if (!el) return;
    el.innerHTML = `
        <i data-lucide="${icono}" class="clima-icon"></i>
        <span class="temp-texto">${temp}°C</span>
    `;
    lucide.createIcons();
}

function iniciarClimaLocal() {
    const el = document.getElementById('climaLocal');
    if (!el) return;

    if (!navigator.geolocation) {
        pintarClima('cloud-sun', '--');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const c = await obtenerClima(pos.coords.latitude, pos.coords.longitude);
            if (c) pintarClima(c.icono, c.temp);
            else pintarClima('cloud-sun', '--');

            // Actualizar cada 15 min
            setInterval(async () => {
                const c2 = await obtenerClima(pos.coords.latitude, pos.coords.longitude);
                if (c2) pintarClima(c2.icono, c2.temp);
            }, 900000);
        },
        () => pintarClima('cloud-sun', '--'),
        { timeout: 8000 }
    );
}

// ============================================================
//  API PARA IFRAMES (Stor-He y otras apps)
// ============================================================
window.__vicwebos = {
    obtenerCatalogo: () => (typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : []),
    obtenerInstaladas: () => obtenerAppsInstaladas(),
    estaInstalada: (id) => estaInstalada(id),
    instalar: (id) => {
        instalarApp(id);
        renderSidebar(searchInput ? searchInput.value : '');
    },
    desinstalar: (id) => {
        desinstalarApp(id);
        if (tabs.find(t => t.id === id)) cerrarPestania(id);
        renderSidebar(searchInput ? searchInput.value : '');
    },
    abrirApp: (id) => {
        if (estaInstalada(id)) {
            abrirHerramienta(id);
            return true;
        }
        return false;
    }
};

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();
    renderTabs();
    iniciarRelojLocal();
    iniciarClimaLocal();

    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderSidebar(e.target.value));
    }

    if (btnVerTodas) {
        btnVerTodas.addEventListener('click', abrirModalTodas);
    }

    const cerrar = document.getElementById('modalTodasCerrar');
    if (cerrar) cerrar.addEventListener('click', cerrarModalTodas);

    const m = document.getElementById('modalTodas');
    if (m) {
        m.addEventListener('click', (e) => {
            if (e.target === m) cerrarModalTodas();
        });
    }
});
