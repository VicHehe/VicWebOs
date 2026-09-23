// ============================================================
//  Logros — Vista (dentro del iframe del modal)
//  ------------------------------------------------------------
//  Solo pinta. El chequeo y el estado viven en el shell
//  (window.parent.Logros).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

const LogrosPadre = () => {
    try { return window.parent.Logros || null; }
    catch (e) { return null; }
};

// ------------------------------------------------------------
//  Tema (heredado del shell)
// ------------------------------------------------------------
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
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------
function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatearFecha(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatearNum(n) {
    return Number(n).toLocaleString('es-CL');
}

// ------------------------------------------------------------
//  Render
// ------------------------------------------------------------
function render(progreso) {
    const grid = document.getElementById('lgGrid');
    const empty = document.getElementById('lgEmpty');
    const fill = document.getElementById('lgProgresoFill');
    const texto = document.getElementById('lgProgresoTexto');
    if (!grid) return;

    const { desbloqueados, total, estado, catalogo } = progreso;
    const pct = total > 0 ? Math.round((desbloqueados / total) * 100) : 0;

    if (fill) fill.style.width = pct + '%';
    if (texto) texto.textContent = `${pct}% completado · ${desbloqueados} / ${total}`;

    if (!catalogo || catalogo.length === 0) {
        grid.innerHTML = '';
        grid.hidden = true;
        empty.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    grid.hidden = false;
    empty.hidden = true;

    grid.innerHTML = catalogo.map(l => renderCard(l, estado)).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderCard(logro, estado) {
    const fecha = estado.logros[logro.id];
    const desbloqueado = !!fecha;
    const monedasMax = estado.monedasMaximas || 0;
    const progresoActual = Math.min(monedasMax, logro.meta || 0);
    const pctLogro = logro.meta > 0
        ? Math.min(100, Math.round((progresoActual / logro.meta) * 100))
        : 0;

    const badge = desbloqueado
        ? `<div class="lg-icono-check"><i data-lucide="check"></i></div>`
        : `<div class="lg-icono-candado"><i data-lucide="lock"></i></div>`;

    const bloqueInferior = desbloqueado
        ? `<div class="lg-fecha">
                <i data-lucide="calendar-check"></i>
                ${formatearFecha(fecha)}
           </div>`
        : `<div class="lg-mini-progreso">
                <div class="lg-mini-barra">
                    <div class="lg-mini-fill" style="width:${pctLogro}%"></div>
                </div>
                <div class="lg-mini-texto">
                    ${formatearNum(progresoActual)} / ${formatearNum(logro.meta)}
                </div>
           </div>`;

    return `
        <div class="lg-card ${desbloqueado ? 'desbloqueado' : 'bloqueado'}">
            <div class="lg-icono">
                <i data-lucide="${logro.icono || 'trophy'}"></i>
                ${badge}
            </div>
            <div class="lg-info">
                <div class="lg-nombre">${escapar(logro.nombre)}</div>
                <div class="lg-desc">${escapar(logro.descripcion || '')}</div>
                ${bloqueInferior}
            </div>
        </div>
    `;
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    const lg = LogrosPadre();
    if (!lg) {
        document.getElementById('lgGrid').innerHTML = `
            <div class="lg-empty">
                <div class="lg-empty-icon"><i data-lucide="alert-triangle"></i></div>
                <h3>Logros no disponible</h3>
                <p>Falta cargar <code>Logros/chequeo.js</code> en el shell.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    try {
        const progreso = await lg.obtenerProgreso();
        render(progreso);
    } catch (e) {
        console.warn('[Logros] Error cargando:', e);
    }
}

document.addEventListener('DOMContentLoaded', inicializar);

// Recargar cuando el shell lo pida (al abrir el modal)
window.addEventListener('message', async (e) => {
    if (!e.data || e.data.type !== 'logros:recargar') return;
    const lg = LogrosPadre();
    if (!lg) return;
    try {
        const progreso = await lg.obtenerProgreso();
        render(progreso);
    } catch (err) { /* silencioso */ }
});
