// ============================================================
//  JsIndex.js — Sistema de pestañas + sidebar + buscador
//  + modal "ver todas" + reloj/clima local
//  Sin login, sin noticias, sin estados de ánimo.
// ============================================================

// -------- ESTADO GLOBAL --------
const MAX_TABS = 5;          // máximo de pestañas simultáneas
let tabs = [];                // { id, nombre, emoji, iframe }
let activeTabId = null;

// -------- ELEMENTOS DOM --------
const sidebarNav      = document.getElementById('sidebarNav');
const searchInput     = document.getElementById('searchInput');
const tabBar          = document.getElementById('tabBar');
const panelContainer  = document.getElementById('panelContainer');
const welcomeScreen   = document.getElementById('welcomeScreen');
const btnVerTodas     = document.getElementById('btnVerTodas');

// -------- RENDER DEL SIDEBAR DESDE JsRutas --------
function renderSidebar(filtro = '') {
    if (!sidebarNav) return;
    sidebarNav.innerHTML = '';

    // RUTAS_HERRAMIENTAS puede estar vacío por ahora
    const todas = typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [];

    if (todas.length === 0) {
        sidebarNav.innerHTML = `
            <div class="sidebar-empty">
                <i data-lucide="inbox"></i>
                <span>No hay herramientas disponibles</span>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    let lista = todas;
    if (filtro) {
        const f = filtro.toLowerCase();
        lista = todas.filter(h =>
            h.nombre.toLowerCase().includes(f) ||
            (h.descripcion || '').toLowerCase().includes(f)
        );
    }

    if (lista.length === 0) {
        sidebarNav.innerHTML = `
            <div class="sidebar-empty">
                <i data-lucide="search-x"></i>
                <span>Sin resultados para "${filtro}"</span>
            </div>
        `;
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

// -------- MARCAR ITEM ACTIVO EN EL SIDEBAR --------
function actualizarNavActivo() {
    if (!sidebarNav) return;
    sidebarNav.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.id === activeTabId);
    });
}

// -------- ABRIR HERRAMIENTA (crear o activar pestaña) --------
function abrirHerramienta(id) {
    const herramienta = (typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : [])
        .find(h => h.id === id);
    if (!herramienta) return;

    // Si ya está abierta, activarla
    const existente = tabs.find(t => t.id === id);
    if (existente) {
        activarPestania(id);
        return;
    }

    // Límite de pestañas
    if (tabs.length >= MAX_TABS) {
        alert(`Solo puedes tener ${MAX_TABS} pestañas abiertas. Cierra una para abrir otra.`);
        return;
    }

    // Crear iframe
    const iframe = document.createElement('iframe');
    iframe.src = herramienta.ruta;
    iframe.dataset.id = id;
    iframe.style.display = 'none';
    iframe.className = 'tool-iframe';
    panelContainer.appendChild(iframe);

    tabs.push({
        id: id,
        nombre: herramienta.nombre,
        icono: herramienta.icono || 'circle',
        iframe: iframe
    });

    renderTabs();
    activarPestania(id);
}

// -------- ACTIVAR PESTAÑA --------
function activarPestania(id) {
    activeTabId = id;

    // Ocultar todos los iframes
    panelContainer.querySelectorAll('iframe').forEach(f => {
        f.style.display = 'none';
        f.classList.remove('active');
    });

    // Ocultar bienvenida
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    // Mostrar el iframe correspondiente
    const tab = tabs.find(t => t.id === id);
    if (tab) {
        tab.iframe.style.display = 'block';
        tab.iframe.classList.add('active');
    }

    renderTabs();
    actualizarNavActivo();
}

// -------- CERRAR PESTAÑA --------
function cerrarPestania(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    const tab = tabs[index];
    if (tab.iframe && tab.iframe.parentNode) {
        tab.iframe.parentNode.removeChild(tab.iframe);
    }
    tabs.splice(index, 1);

    if (activeTabId === id) {
        if (tabs.length > 0) {
            activarPestania(tabs[tabs.length - 1].id);
        } else {
            activeTabId = null;
            mostrarBienvenida();
        }
    }
    renderTabs();
    actualizarNavActivo();
}

// -------- RENDER DE LA BARRA DE PESTAÑAS --------
function renderTabs() {
    if (!tabBar) return;

    if (tabs.length === 0) {
        tabBar.innerHTML = `
            <span class="tab-empty-hint">
                <i data-lucide="hexagon"></i>
                Abre una herramienta del menú
            </span>
        `;
        lucide.createIcons();
        return;
    }

    tabBar.innerHTML = tabs.map(t => `
        <div class="tab-item ${t.id === activeTabId ? 'active' : ''}" data-id="${t.id}">
            <i data-lucide="${t.icono}"></i>
            <span>${t.nombre}</span>
            <button class="tab-close" data-id="${t.id}" title="Cerrar pestaña">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();

    // Clic en pestaña → activar
    tabBar.querySelectorAll('.tab-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.tab-close')) return;
            activarPestania(el.dataset.id);
        });
    });

    // Clic en cerrar
    tabBar.querySelectorAll('.tab-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            cerrarPestania(btn.dataset.id);
        });
    });
}

// -------- MOSTRAR BIENVENIDA --------
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

// -------- MODAL "VER TODAS" --------
function abrirModalTodas() {
    const modal = document.getElementById('modalTodas');
    const body  = document.getElementById('modalTodasBody');
    if (!modal || !body) return;

    const todas = (typeof RUTAS_HERRAMIENTAS !== 'undefined' ? RUTAS_HERRAMIENTAS : []);

    if (todas.length === 0) {
        body.innerHTML = `
            <div class="sidebar-empty" style="padding: 40px 12px;">
                <i data-lucide="inbox"></i>
                <span>Aún no hay herramientas registradas en JsRutas.js</span>
            </div>
        `;
        lucide.createIcons();
        modal.style.display = 'flex';
        return;
    }

    // Agrupar por categoría
    const categorias = {};
    todas.forEach(h => {
        const cat = h.categoria || 'Sin categoría';
        if (!categorias[cat]) categorias[cat] = [];
        categorias[cat].push(h);
    });

    let html = '';
    for (const [cat, herramientas] of Object.entries(categorias)) {
        html += `<div class="modal-categoria"><h3>${cat}</h3><div class="modal-categoria-grid">`;
        herramientas.forEach(h => {
            html += `
                <div class="modal-herramienta-item" data-id="${h.id}">
                    <div class="item-superior">
                        <i data-lucide="${h.icono || 'circle'}"></i>
                        <span class="item-nombre">${h.nombre}</span>
                    </div>
                    <small>${h.descripcion || ''}</small>
                </div>
            `;
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

// -------- RELOJ Y CLIMA LOCAL --------
async function obtenerClima(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const data = await resp.json();
        const cur = data.current;
        if (!cur) return null;
        return {
            temp: Math.round(cur.temperature_2m),
            emoji: getWeatherEmojiOpenMeteo(cur.weather_code, cur.is_day)
        };
    } catch (e) {
        console.warn('Error clima:', e);
        return null;
    }
}

function getWeatherEmojiOpenMeteo(code, isDay) {
    const dia = isDay === 1;
    if (code === 0) return dia ? '☀️' : '🌙';
    if (code === 1) return dia ? '🌤️' : '🌙';
    if (code === 2) return dia ? '⛅' : '☁️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌧️';
    if (code === 85 || code === 86) return '🌨️';
    if (code === 95 || code === 96 || code === 99) return '⛈️';
    return dia ? '🌤️' : '🌙';
}

function iniciarRelojLocal() {
    const el = document.getElementById('horaLocal');
    if (!el) return;
    const actualizar = () => {
        el.textContent = new Date().toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        });
    };
    actualizar();
    setInterval(actualizar, 1000);
}

function iniciarClimaLocal() {
    const el = document.getElementById('climaLocal');
    if (!el) return;

    if (!navigator.geolocation) {
        el.textContent = '--°C';
        return;
    }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const clima = await obtenerClima(latitude, longitude);
            if (clima) {
                el.textContent = `${clima.emoji} ${clima.temp}°C`;
            } else {
                el.textContent = '🌤️ --°C';
            }
            // Actualizar cada 15 min
            setInterval(async () => {
                const c = await obtenerClima(latitude, longitude);
                if (c) el.textContent = `${c.emoji} ${c.temp}°C`;
            }, 900000);
        },
        (err) => {
            console.warn('Geolocalización rechazada:', err);
            el.textContent = '🌤️ --°C';
        },
        { timeout: 8000 }
    );
}

// -------- INICIALIZACIÓN --------
document.addEventListener('DOMContentLoaded', () => {
    renderSidebar();
    renderTabs();
    iniciarRelojLocal();
    iniciarClimaLocal();

    // Buscador
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderSidebar(e.target.value));
    }

    // Botón "Ver todas"
    if (btnVerTodas) {
        btnVerTodas.addEventListener('click', abrirModalTodas);
    }

    // Cerrar modal
    const modalTodasCerrar = document.getElementById('modalTodasCerrar');
    if (modalTodasCerrar) modalTodasCerrar.addEventListener('click', cerrarModalTodas);

    const modalTodas = document.getElementById('modalTodas');
    if (modalTodas) {
        modalTodas.addEventListener('click', (e) => {
            if (e.target === modalTodas) cerrarModalTodas();
        });
    }
});
