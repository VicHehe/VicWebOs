// ============================================================
//  Gestor de Gastos — Control personal de dinero
//  ------------------------------------------------------------
//  · 1 JSON por usuario: app/gastos/{codigo}gastos.json
//  · 2 secciones: Movimientos (reales) y Situaciones (simulaciones)
//  · Moneda elegible al iniciar (configurable solo vía reset)
//  · Todo el UI respeta el tema del SO
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  Catálogo de monedas
// ============================================================
const MONEDAS = [
    { codigo: 'CLP', nombre: 'Peso Chileno',         simbolo: '$',   decimales: 0 },
    { codigo: 'ARS', nombre: 'Peso Argentino',       simbolo: '$',   decimales: 2 },
    { codigo: 'MXN', nombre: 'Peso Mexicano',        simbolo: '$',   decimales: 2 },
    { codigo: 'COP', nombre: 'Peso Colombiano',      simbolo: '$',   decimales: 0 },
    { codigo: 'PEN', nombre: 'Sol Peruano',          simbolo: 'S/',  decimales: 2 },
    { codigo: 'UYU', nombre: 'Peso Uruguayo',        simbolo: '$U',  decimales: 2 },
    { codigo: 'BRL', nombre: 'Real Brasileño',       simbolo: 'R$',  decimales: 2 },
    { codigo: 'USD', nombre: 'Dólar Estadounidense', simbolo: 'US$', decimales: 2 },
    { codigo: 'EUR', nombre: 'Euro',                 simbolo: '€',   decimales: 2 },
    { codigo: 'VES', nombre: 'Bolívar Venezolano',   simbolo: 'Bs.', decimales: 2 }
];

// ============================================================
//  Estado
// ============================================================
let usuarioActual = null;
let estado = {
    configurado: false,
    moneda: 'CLP',
    saldoInicial: 0,
    movimientos: [],
    situaciones: []
};
let tabActual = 'movimientos';
let tipoMovActual = 'gasto';
let toastTimeout = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  Tema heredado
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
            '--shadow-glow',
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

// ============================================================
//  Toast
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('ggToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'gg-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  Helpers
// ============================================================
function monedaActual() {
    return MONEDAS.find(m => m.codigo === estado.moneda) || MONEDAS[0];
}

function formatearMonto(n) {
    const m = monedaActual();
    const signo = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const num = abs.toLocaleString('es-CL', {
        minimumFractionDigits: m.decimales,
        maximumFractionDigits: m.decimales
    });
    return `${signo}${m.simbolo}${num}`;
}

function formatearMontoConSigno(n, tipo) {
    const base = formatearMonto(Math.abs(n));
    return tipo === 'ingreso' ? `+${base}` : `-${base}`;
}

function formatearFecha(iso) {
    const d = new Date(iso);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(d);
    fecha.setHours(0, 0, 0, 0);
    const diff = Math.round((hoy - fecha) / 86400000);

    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    if (diff > 1 && diff < 7) return `Hace ${diff} días`;
    if (diff === -1) return 'Mañana';
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapar(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generarId(prefijo) {
    return prefijo + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function hoyISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

// ============================================================
//  JSON persistencia
// ============================================================
function rutaArchivo() {
    if (!usuarioActual) return null;
    return `app/gastos/${usuarioActual.codigo}gastos.json`;
}

async function cargarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object' && data.configurado) {
            estado = {
                configurado: true,
                moneda: data.moneda || 'CLP',
                saldoInicial: Number(data.saldoInicial) || 0,
                movimientos: Array.isArray(data.movimientos) ? data.movimientos : [],
                situaciones: Array.isArray(data.situaciones) ? data.situaciones : []
            };
        }
    } catch (e) {
        console.warn('[Gestor] Error cargando:', e);
    }
}

async function guardarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            actualizado: new Date().toISOString(),
            configurado: estado.configurado,
            moneda: estado.moneda,
            saldoInicial: estado.saldoInicial,
            movimientos: estado.movimientos,
            situaciones: estado.situaciones
        });
    } catch (e) {
        console.warn('[Gestor] Error guardando:', e);
        toast('No se pudo guardar', 'error');
    }
}

// ============================================================
//  Cálculos
// ============================================================
function calcularTotales() {
    let ingresos = 0;
    let gastos = 0;
    estado.movimientos.forEach(m => {
        if (m.tipo === 'ingreso') ingresos += Number(m.monto) || 0;
        else gastos += Number(m.monto) || 0;
    });
    const saldo = estado.saldoInicial + ingresos - gastos;
    return { ingresos, gastos, saldo };
}

function totalSituaciones() {
    return estado.situaciones.reduce((a, s) => a + (Number(s.monto) || 0), 0);
}

// ============================================================
//  Render: resumen
// ============================================================
function renderResumen() {
    const { ingresos, gastos, saldo } = calcularTotales();

    const $saldo = document.getElementById('ggSaldo');
    const $ingresos = document.getElementById('ggIngresos');
    const $gastos = document.getElementById('ggGastos');
    const $sub = document.getElementById('ggSaldoSub');

    if ($saldo) $saldo.textContent = formatearMonto(saldo);
    if ($ingresos) $ingresos.textContent = formatearMonto(ingresos);
    if ($gastos) $gastos.textContent = formatearMonto(gastos);

    const numMovs = estado.movimientos.length;
    if ($sub) {
        $sub.textContent = numMovs === 0
            ? 'Sin movimientos'
            : numMovs === 1
                ? '1 movimiento'
                : `${numMovs} movimientos`;
    }

    // Contadores en tabs
    const $cMov = document.getElementById('ggCountMov');
    const $cSit = document.getElementById('ggCountSit');
    if ($cMov) $cMov.textContent = numMovs;
    if ($cSit) $cSit.textContent = estado.situaciones.length;
}

// ============================================================
//  Render: movimientos
// ============================================================
function renderMovimientos() {
    const cont = document.getElementById('ggListaMov');
    const vacio = document.getElementById('ggVacioMov');
    if (!cont || !vacio) return;

    if (estado.movimientos.length === 0) {
        cont.innerHTML = '';
        vacio.hidden = false;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    vacio.hidden = true;

    // Ordenar: más nuevos primero (por fecha, luego por creado)
    const ordenados = [...estado.movimientos].sort((a, b) => {
        const fd = new Date(b.fecha) - new Date(a.fecha);
        if (fd !== 0) return fd;
        return new Date(b.creado) - new Date(a.creado);
    });

    cont.innerHTML = ordenados.map(m => `
        <div class="gg-item" data-id="${m.id}">
            <div class="gg-item-icono ${m.tipo}">
                <i data-lucide="${m.tipo === 'ingreso' ? 'trending-up' : 'trending-down'}"></i>
            </div>
            <div class="gg-item-body">
                <span class="gg-item-titulo">${escapar(m.titulo)}</span>
                <span class="gg-item-fecha">${formatearFecha(m.fecha)}</span>
            </div>
            <span class="gg-item-monto ${m.tipo}">
                ${formatearMontoConSigno(m.monto, m.tipo)}
            </span>
            <button class="gg-item-borrar" data-borrar="${m.id}" title="Eliminar">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.gg-item-borrar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            borrarMovimiento(btn.dataset.borrar);
        });
    });
}

async function borrarMovimiento(id) {
    const mov = estado.movimientos.find(m => m.id === id);
    if (!mov) return;
    if (!confirm(`¿Eliminar "${mov.titulo}"?`)) return;

    estado.movimientos = estado.movimientos.filter(m => m.id !== id);
    await guardarDatos();
    renderTodo();
    toast('Movimiento eliminado', 'success');
}

// ============================================================
//  Render: situaciones
// ============================================================
function renderSituaciones() {
    const cont = document.getElementById('ggListaSit');
    const vacio = document.getElementById('ggVacioSit');
    const resultado = document.getElementById('ggResultadoSim');
    if (!cont || !vacio || !resultado) return;

    if (estado.situaciones.length === 0) {
        cont.innerHTML = '';
        vacio.hidden = false;
        resultado.hidden = true;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    vacio.hidden = true;

    cont.innerHTML = estado.situaciones.map(s => `
        <div class="gg-item" data-id="${s.id}">
            <div class="gg-item-icono gasto">
                <i data-lucide="shopping-bag"></i>
            </div>
            <div class="gg-item-body">
                <span class="gg-item-titulo">${escapar(s.nombre)}</span>
                <span class="gg-item-fecha">Hipotético</span>
            </div>
            <span class="gg-item-monto gasto">-${formatearMonto(s.monto)}</span>
            <button class="gg-item-borrar" data-borrar="${s.id}" title="Quitar">
                <i data-lucide="trash-2"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();

    cont.querySelectorAll('.gg-item-borrar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            borrarSituacion(btn.dataset.borrar);
        });
    });

    // Calcular resultado
    const { saldo } = calcularTotales();
    const total = totalSituaciones();
    const resto = saldo - total;

    document.getElementById('ggSimSaldo').textContent = formatearMonto(saldo);
    document.getElementById('ggSimTotal').textContent = `-${formatearMonto(total)}`;

    const $resto = document.getElementById('ggSimResto');
    const $aviso = document.getElementById('ggSimAviso');

    $resto.textContent = formatearMonto(resto);
    $resto.className = 'gg-resultado-valor ' + (resto >= 0 ? 'positivo' : 'negativo');

    if (resto < 0) {
        $aviso.textContent = `⚠️ Te faltarían ${formatearMonto(Math.abs(resto))}. No alcanza con tu saldo.`;
        $aviso.className = 'gg-resultado-aviso alert';
    } else if (resto === 0) {
        $aviso.textContent = 'Quedarías exactamente en cero.';
        $aviso.className = 'gg-resultado-aviso alert';
    } else if (total === 0) {
        $aviso.textContent = '';
        $aviso.className = 'gg-resultado-aviso';
    } else {
        const pct = saldo > 0 ? Math.round((total / saldo) * 100) : 0;
        $aviso.textContent = `✅ Es viable. Usarías el ${pct}% de tu saldo.`;
        $aviso.className = 'gg-resultado-aviso ok';
    }

    resultado.hidden = false;
}

async function borrarSituacion(id) {
    estado.situaciones = estado.situaciones.filter(s => s.id !== id);
    await guardarDatos();
    renderTodo();
}

// ============================================================
//  Render general
// ============================================================
function renderTodo() {
    renderResumen();
    renderMovimientos();
    renderSituaciones();
}

// ============================================================
//  Tabs
// ============================================================
function cambiarTab(tab) {
    tabActual = tab;
    document.querySelectorAll('.gg-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.gg-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.panel === tab);
    });
}

// ============================================================
//  FAB
// ============================================================
function clickFab() {
    if (tabActual === 'movimientos') abrirModalMovimiento();
    else abrirModalSituacion();
}

// ============================================================
//  Modal: movimiento
// ============================================================
function abrirModalMovimiento() {
    tipoMovActual = 'gasto';
    document.getElementById('ggMovTitulo').value = '';
    document.getElementById('ggMovMonto').value = '';
    document.getElementById('ggMovFecha').value = hoyISO();

    actualizarTipoToggle();

    document.getElementById('ggModalMov').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('ggMovTitulo').focus(), 100);
}

function cerrarModalMovimiento() {
    document.getElementById('ggModalMov').hidden = true;
}

function actualizarTipoToggle() {
    document.querySelectorAll('.gg-tipo-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tipo === tipoMovActual);
    });
}

async function guardarMovimiento() {
    const titulo = document.getElementById('ggMovTitulo').value.trim();
    const monto = parseFloat(document.getElementById('ggMovMonto').value);
    const fecha = document.getElementById('ggMovFecha').value || hoyISO();

    if (!titulo) { toast('Escribí un título', 'error'); return; }
    if (!isFinite(monto) || monto <= 0) { toast('El monto debe ser mayor a 0', 'error'); return; }

    const nuevo = {
        id: generarId('mov'),
        tipo: tipoMovActual,
        titulo: titulo.slice(0, 60),
        monto: monto,
        fecha: new Date(fecha + 'T12:00:00').toISOString(),
        creado: new Date().toISOString()
    };

    estado.movimientos.unshift(nuevo);
    await guardarDatos();
    cerrarModalMovimiento();
    renderTodo();
    toast(tipoMovActual === 'ingreso' ? 'Ingreso registrado' : 'Gasto registrado', 'success');
}

// ============================================================
//  Modal: situación
// ============================================================
function abrirModalSituacion() {
    document.getElementById('ggSitNombre').value = '';
    document.getElementById('ggSitMonto').value = '';
    document.getElementById('ggModalSit').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => document.getElementById('ggSitNombre').focus(), 100);
}

function cerrarModalSituacion() {
    document.getElementById('ggModalSit').hidden = true;
}

async function guardarSituacion() {
    const nombre = document.getElementById('ggSitNombre').value.trim();
    const monto = parseFloat(document.getElementById('ggSitMonto').value);

    if (!nombre) { toast('Escribí en qué gastarías', 'error'); return; }
    if (!isFinite(monto) || monto <= 0) { toast('El monto debe ser mayor a 0', 'error'); return; }

    const nueva = {
        id: generarId('sit'),
        nombre: nombre.slice(0, 60),
        monto: monto,
        creado: new Date().toISOString()
    };

    estado.situaciones.push(nueva);
    await guardarDatos();
    cerrarModalSituacion();
    renderTodo();
    toast('Situación añadida', 'success');
}

// ============================================================
//  Reset
// ============================================================
async function resetear() {
    if (!confirm('¿Reiniciar todo? Se borrarán tus movimientos, situaciones y configuración. Esta acción no se puede deshacer.')) return;
    if (!confirm('Última confirmación: ¿estás segura/o?')) return;

    estado = {
        configurado: false,
        moneda: 'CLP',
        saldoInicial: 0,
        movimientos: [],
        situaciones: []
    };
    await guardarDatos();
    mostrarSetup('configurar');
}

// ============================================================
//  Setup
// ============================================================
function llenarSelectMonedas() {
    const sel = document.getElementById('ggSetupMoneda');
    if (!sel) return;
    sel.innerHTML = MONEDAS.map(m =>
        `<option value="${m.codigo}">${m.nombre} (${m.simbolo})</option>`
    ).join('');
}

function mostrarSetup() {
    document.getElementById('ggSetup').hidden = false;
    document.getElementById('ggApp').hidden = true;
    document.getElementById('ggSetupMoneda').value = estado.moneda || 'CLP';
    document.getElementById('ggSetupSaldo').value = estado.saldoInicial || '';
    if (window.lucide) window.lucide.createIcons();
}

async function confirmarSetup() {
    const moneda = document.getElementById('ggSetupMoneda').value;
    const saldoStr = document.getElementById('ggSetupSaldo').value;
    const saldo = parseFloat(saldoStr);

    if (!moneda) { toast('Elegí una moneda', 'error'); return; }
    if (!isFinite(saldo)) { toast('Ingresá un saldo válido', 'error'); return; }

    estado.moneda = moneda;
    estado.saldoInicial = saldo;
    estado.configurado = true;

    await guardarDatos();

    document.getElementById('ggSetup').hidden = true;
    document.getElementById('ggApp').hidden = false;
    renderTodo();
    if (window.lucide) window.lucide.createIcons();
    toast('¡Listo! Ya podés registrar movimientos', 'success');
}

// ============================================================
//  Init
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Gestor de Gastos necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    const badge = document.getElementById('ggUserBadge');
    if (badge) {
        badge.textContent = usuarioActual
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre}`
            : '—';
    }
    if (!usuarioActual) {
        alert('Necesitas iniciar sesión para usar el Gestor de Gastos.');
        return;
    }

    llenarSelectMonedas();
    await cargarDatos();

    // Eventos: setup
    document.getElementById('ggSetupConfirmar')?.addEventListener('click', confirmarSetup);
    document.getElementById('ggSetupSaldo')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmarSetup();
    });

    // Eventos: tabs
    document.querySelectorAll('.gg-tab').forEach(t => {
        t.addEventListener('click', () => cambiarTab(t.dataset.tab));
    });

    // Eventos: FAB
    document.getElementById('ggFab')?.addEventListener('click', clickFab);

    // Eventos: modal movimiento
    document.getElementById('ggMovCerrar')?.addEventListener('click', cerrarModalMovimiento);
    document.getElementById('ggMovCancelar')?.addEventListener('click', cerrarModalMovimiento);
    document.getElementById('ggMovGuardar')?.addEventListener('click', guardarMovimiento);
    document.getElementById('ggModalMov')?.addEventListener('click', (e) => {
        if (e.target.id === 'ggModalMov') cerrarModalMovimiento();
    });
    document.querySelectorAll('.gg-tipo-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tipoMovActual = btn.dataset.tipo;
            actualizarTipoToggle();
        });
    });
    document.getElementById('ggMovMonto')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guardarMovimiento();
    });

    // Eventos: modal situación
    document.getElementById('ggSitCerrar')?.addEventListener('click', cerrarModalSituacion);
    document.getElementById('ggSitCancelar')?.addEventListener('click', cerrarModalSituacion);
    document.getElementById('ggSitGuardar')?.addEventListener('click', guardarSituacion);
    document.getElementById('ggModalSit')?.addEventListener('click', (e) => {
        if (e.target.id === 'ggModalSit') cerrarModalSituacion();
    });
    document.getElementById('ggSitMonto')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') guardarSituacion();
    });

    // Eventos: reset
    document.getElementById('ggBtnReset')?.addEventListener('click', resetear);

    // Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            cerrarModalMovimiento();
            cerrarModalSituacion();
        }
    });

    // Mostrar setup o app
    if (estado.configurado) {
        document.getElementById('ggApp').hidden = false;
        renderTodo();
    } else {
        mostrarSetup();
    }

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
