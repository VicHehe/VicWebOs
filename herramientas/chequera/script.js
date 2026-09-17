// ============================================================
//  Chequera — Lee las monedas del usuario y muestra su historial
//  de movimientos. Los movimientos se generan desde el shell
//  cuando cualquier app llama a __vicwebos.canjear() o
//  __vicwebos.gastoBoleta().
// ============================================================

const MENSAJE_CHEQUERA = 'vicwebos_chequera_cambio';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let filtroActual = 'todos';
let movimientos = [];

const API = () => window.parent.__vicwebos || null;

// ============================================================
//  TEMA: heredar variables CSS del padre
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
    if (!e.data) return;
    if (e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
    if (e.data.type === MENSAJE_CHEQUERA) {
        refrescar();
    }
});

// ============================================================
//  CARGA DE DATOS
// ============================================================
async function refrescar() {
    const api = API();
    if (!api) return;

    // 1) Saldo desde el shell
    const monedas = api.obtenerMonedas ? api.obtenerMonedas() : 0;
    const saldoEl = document.getElementById('chqSaldo');
    if (saldoEl) saldoEl.textContent = monedas;

    // 2) Badge del usuario
    const badge = document.getElementById('chqUserBadge');
    const cuenta = api.obtenerCuenta ? api.obtenerCuenta() : null;
    if (badge) badge.textContent = cuenta ? `@${cuenta.codigo} · ${cuenta.nombre}` : '—';

    // 3) Historial desde el shell
    let data = null;
    try {
        if (api.chequeraLeer) data = await api.chequeraLeer();
    } catch (e) {
        console.warn('Error leyendo chequera:', e);
    }
    movimientos = (data && Array.isArray(data.movimientos)) ? data.movimientos : [];

    render();
}

// ============================================================
//  RENDER
// ============================================================
function formatearCantidad(n) {
    const abs = Math.abs(n);
    const signo = n > 0 ? '+' : (n < 0 ? '−' : '');
    return `${signo}${abs}`;
}

function fechaBonita(iso) {
    const d = new Date(iso);
    const ahora = new Date();
    const diffMs = ahora - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `hace ${diffD}d`;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

function render() {
    const lista = document.getElementById('chqLista');
    const empty = document.getElementById('chqEmpty');
    if (!lista || !empty) return;

    // Totales
    let ganado = 0, gastado = 0;
    movimientos.forEach(m => {
        if (m.cantidad > 0) ganado += m.cantidad;
        else gastado += Math.abs(m.cantidad);
    });
    const tGanado = document.getElementById('chqTotalGanado');
    const tGastado = document.getElementById('chqTotalGastado');
    if (tGanado) tGanado.textContent = '+' + ganado;
    if (tGastado) tGastado.textContent = '−' + gastado;

    // Filtrar
    let listaFiltrada = movimientos;
    if (filtroActual === 'canje') listaFiltrada = movimientos.filter(m => m.cantidad > 0);
    if (filtroActual === 'gasto') listaFiltrada = movimientos.filter(m => m.cantidad < 0);

    if (listaFiltrada.length === 0) {
        lista.innerHTML = '';
        lista.style.display = 'none';
        empty.style.display = 'flex';

        const h3 = empty.querySelector('h3');
        const p = empty.querySelector('p');
        if (h3 && p) {
            if (movimientos.length === 0) {
                h3.textContent = 'Aún no hay movimientos';
                p.textContent = 'Cuando ganes o gastes monedas, aparecerán aquí.';
            } else if (filtroActual === 'canje') {
                h3.textContent = 'Sin ganancias todavía';
                p.textContent = 'Aquí verás las monedas que ganes.';
            } else if (filtroActual === 'gasto') {
                h3.textContent = 'Sin gastos todavía';
                p.textContent = 'Aquí verás en qué has gastado monedas.';
            } else {
                h3.textContent = 'Nada que mostrar';
                p.textContent = '';
            }
        }
        lucide.createIcons();
        return;
    }

    lista.style.display = 'flex';
    empty.style.display = 'none';

    lista.innerHTML = listaFiltrada.map(m => {
        const tipo = m.cantidad > 0 ? 'canje' : 'gasto';
        return `
            <div class="chq-mov ${tipo}">
                <div class="chq-mov-icono">${m.icono || (tipo === 'canje' ? '💰' : '🧾')}</div>
                <div class="chq-mov-info">
                    <div class="chq-mov-texto">${escapeHTML(m.texto || 'Movimiento')}</div>
                    <div class="chq-mov-meta">
                        <span class="chq-mov-fuente">${escapeHTML(m.fuente || 'app')}</span>
                        <span>${fechaBonita(m.fecha)}</span>
                    </div>
                </div>
                <div class="chq-mov-cantidad">${formatearCantidad(m.cantidad)} 💎</div>
            </div>
        `;
    }).join('');
}

function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
//  FILTROS
// ============================================================
function inicializarFiltros() {
    document.querySelectorAll('.chq-filtro').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chq-filtro').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActual = btn.dataset.filtro || 'todos';
            render();
        });
    });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();
    inicializarFiltros();
    await refrescar();
});
