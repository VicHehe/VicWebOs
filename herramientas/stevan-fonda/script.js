// ============================================================
//  Stevan Fonda — Núcleo: estado, loop, offline, BD
//  ------------------------------------------------------------
//  Carga PRIMERO. Expone window.__sfEstado, __sfMesasActivas,
//  y los hooks que consumen script-clientes.js y script-mejoras.js.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'stevan-fonda';
const ARCHIVO_BASE = 'app/stevan-fonda/';

// Tiempos y constantes de balance
const COOK_TIME_BASE       = 30000;   // 30s por venta a nivel 1
const VENTA_PAUSA_MS       = 700;     // pausa visual tras vender
const OFFLINE_CAP_HORAS    = 8;
const OFFLINE_EFICIENCIA   = 0.5;     // 50% mientras no estás
const COSTO_PRESTIGIO      = 50000;
const MIN_MS_PARA_OFFLINE  = 60000;   // menos de 1 min → ignorar

// Catálogo de productos (orden por desbloqueo)
const PRODUCTOS = [
    { id: 'italiano',   nombre: 'Completo Italiano',   icono: 'sandwich',   precioBase: 3,  desbloqueo: 0   },
    { id: 'dinamico',   nombre: 'Completo Dinámico',   icono: 'sandwich',   precioBase: 5,  desbloqueo: 10  },
    { id: 'alopobre',   nombre: 'Completo A lo Pobre', icono: 'sandwich',   precioBase: 7,  desbloqueo: 25  },
    { id: 'sopaipilla', nombre: 'Sopaipillas',         icono: 'cookie',     precioBase: 4,  desbloqueo: 50  },
    { id: 'pasadas',    nombre: 'Sopaipillas Pasadas', icono: 'cookie',     precioBase: 6,  desbloqueo: 100 },
    { id: 'papas',      nombre: 'Papas Fritas',        icono: 'utensils',   precioBase: 5,  desbloqueo: 150 },
    { id: 'terremoto',  nombre: 'Terremoto',           icono: 'wine',       precioBase: 8,  desbloqueo: 200 },
    { id: 'terremotin', nombre: 'Terremotín',          icono: 'cup-soda',   precioBase: 6,  desbloqueo: 220 },
    { id: 'anticuchos', nombre: 'Anticuchos',          icono: 'beef',       precioBase: 10, desbloqueo: 300 },
    { id: 'empanada',   nombre: 'Empanada de Pino',    icono: 'pie-chart',  precioBase: 9,  desbloqueo: 400 },
    { id: 'as',         nombre: 'As Italiano',         icono: 'sandwich',   precioBase: 12, desbloqueo: 500 },
    { id: 'sopleto',    nombre: 'Sopaipleto',          icono: 'cookie',     precioBase: 11, desbloqueo: 600 },
    { id: 'choripan',   nombre: 'Choripán',            icono: 'sandwich',   precioBase: 8,  desbloqueo: 700 },
    { id: 'pastel',     nombre: 'Pastel de Choclo',    icono: 'soup',       precioBase: 15, desbloqueo: 800 }
];

// Catálogo de mejoras
const MEJORAS = [
    { id: 'velocidad',  nombre: 'Velocidad',  icono: 'zap',         base: 50,  factor: 1.6, desc: '-10% tiempo de cocción por nivel' },
    { id: 'precio',     nombre: 'Precio',     icono: 'trending-up', base: 100, factor: 1.7, desc: '+15% precio por nivel' },
    { id: 'mesas',      nombre: 'Mesas',      icono: 'utensils',    base: 200, factor: 2.2, desc: '+1 mesa por nivel' },
    { id: 'empleados',  nombre: 'Empleados',  icono: 'users',       base: 500, factor: 2.5, desc: '+5% velocidad por nivel' },
    { id: 'decoracion', nombre: 'Decoración', icono: 'brush',       base: 80,  factor: 1.6, desc: '+5% propina por nivel' }
];

// ---------- ESTADO ----------
let estado = crearEstadoInicial();
let usuarioActual = null;
let inicializado = false;
let rafId = null;
let ultimoFrameMs = 0;
let mesasActivas = [];

const API = () => {
    try { return window.parent.__vicwebos || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

// ============================================================
//  ESTADO INICIAL
// ============================================================
function crearEstadoInicial() {
    return {
        version: 1,
        monedasFonda: 0,
        totalVendidos: 0,
        productosDesbloqueados: ['italiano'],
        upgrades: {
            velocidad: 1,
            precio: 1,
            mesas: 1,
            empleados: 1,
            decoracion: 0
        },
        hitosCompletados: [],
        ultimaVez: new Date().toISOString(),
        estrellas: 0,
        prestigios: 0
    };
}

// ============================================================
//  TEMA
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
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  CÁLCULOS
// ============================================================
function velocidadMult() {
    const v = 1 + (estado.upgrades.velocidad - 1) * 0.1;
    const e = 1 + (estado.upgrades.empleados - 1) * 0.05;
    return v * e;
}

function cookTimeMs() {
    return COOK_TIME_BASE / velocidadMult();
}

function multiplicadorPrecio() {
    return 1 + (estado.upgrades.precio - 1) * 0.15;
}

function multiplicadorDecoracion() {
    return 1 + estado.upgrades.decoracion * 0.05;
}

function multiplicadorEstrellas() {
    return 1 + estado.estrellas * 0.1;
}

function precioProducto(prod) {
    const base = prod.precioBase
        * multiplicadorPrecio()
        * multiplicadorDecoracion()
        * multiplicadorEstrellas();
    return Math.max(1, Math.round(base));
}

function productosActivos() {
    return PRODUCTOS.filter(p => estado.productosDesbloqueados.includes(p.id));
}

function produccionPorSegundo() {
    const mesas = estado.upgrades.mesas;
    const segPorVenta = cookTimeMs() / 1000;
    const ventasPorSeg = mesas / segPorVenta;
    const activos = productosActivos();
    const prom = activos.reduce((a, p) => a + precioProducto(p), 0) / Math.max(1, activos.length);
    return ventasPorSeg * prom;
}

// ============================================================
//  OFFLINE
// ============================================================
function aplicarOffline() {
    if (!estado.ultimaVez) {
        estado.ultimaVez = new Date().toISOString();
        return 0;
    }
    const ms = Date.now() - new Date(estado.ultimaVez).getTime();
    if (ms < MIN_MS_PARA_OFFLINE) return 0;
    const segFuera = ms / 1000;
    const segEfectivos = Math.min(segFuera, OFFLINE_CAP_HORAS * 3600);
    const ganancia = Math.floor(produccionPorSegundo() * segEfectivos * OFFLINE_EFICIENCIA);
    if (ganancia > 0) estado.monedasFonda += ganancia;
    return ganancia;
}

// ============================================================
//  BD
// ============================================================
function rutaArchivo() {
    if (!usuarioActual) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + '.json';
}

async function cargarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object') {
            estado = normalizarEstado(data);
        }
    } catch (e) {
        console.warn('[Stevan Fonda] Error cargando:', e);
    }
}

function normalizarEstado(data) {
    return {
        version: 1,
        monedasFonda: Number.isFinite(data.monedasFonda) ? data.monedasFonda : 0,
        totalVendidos: Number.isFinite(data.totalVendidos) ? data.totalVendidos : 0,
        productosDesbloqueados: Array.isArray(data.productosDesbloqueados) && data.productosDesbloqueados.length
            ? data.productosDesbloqueados
            : ['italiano'],
        upgrades: {
            velocidad: data.upgrades?.velocidad || 1,
            precio: data.upgrades?.precio || 1,
            mesas: data.upgrades?.mesas || 1,
            empleados: data.upgrades?.empleados || 1,
            decoracion: data.upgrades?.decoracion || 0
        },
        hitosCompletados: Array.isArray(data.hitosCompletados) ? data.hitosCompletados : [],
        ultimaVez: data.ultimaVez || new Date().toISOString(),
        estrellas: Number.isFinite(data.estrellas) ? data.estrellas : 0,
        prestigios: Number.isFinite(data.prestigios) ? data.prestigios : 0
    };
}

let guardandoTimeout = null;
async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    estado.ultimaVez = new Date().toISOString();
    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[Stevan Fonda] Error guardando:', e);
    }
}

function guardarDebounce() {
    if (guardandoTimeout) clearTimeout(guardandoTimeout);
    guardandoTimeout = setTimeout(guardarEstado, 1500);
}

// ============================================================
//  MESAS / LOOP
// ============================================================
function reconstruirMesas() {
    const total = estado.upgrades.mesas;
    while (mesasActivas.length < total) {
        mesasActivas.push({ id: mesasActivas.length, cliente: null, producto: null, progreso: 0, pausado: 0 });
    }
    while (mesasActivas.length > total) {
        mesasActivas.pop();
    }
}

function asignarPedido(mesa) {
    const prods = productosActivos();
    if (!prods.length) return;
    mesa.producto = prods[Math.floor(Math.random() * prods.length)];
    mesa.progreso = 0;
    mesa.pausado = 0;
    if (typeof window.__sfAsignarCliente === 'function') {
        mesa.cliente = window.__sfAsignarCliente();
    }
}

function tick(deltaMs) {
    const total = estado.upgrades.mesas;
    if (mesasActivas.length !== total) reconstruirMesas();

    const cook = cookTimeMs();

    for (const mesa of mesasActivas) {
        if (!mesa.producto) asignarPedido(mesa);
        if (mesa.pausado > 0) {
            mesa.pausado -= deltaMs;
            continue;
        }
        mesa.progreso += deltaMs / cook;
        if (mesa.progreso >= 1) {
            venderMesa(mesa);
        }
    }
}

function venderMesa(mesa) {
    const precio = precioProducto(mesa.producto);
    estado.monedasFonda += precio;
    estado.totalVendidos++;

    mesa.pausado = VENTA_PAUSA_MS;
    mesa.progreso = 0;

    if (typeof window.__sfMostrarPopup === 'function') {
        window.__sfMostrarPopup(mesa.id, precio);
    }
    if (typeof window.__sfCheckDesbloqueos === 'function') {
        window.__sfCheckDesbloqueos();
    }
    if (typeof window.__sfCheckHitos === 'function') {
        window.__sfCheckHitos();
    }

    // Reasignar tras la pausa
    setTimeout(() => {
        asignarPedido(mesa);
        guardarDebounce();
    }, VENTA_PAUSA_MS);
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const delta = Math.min(now - ultimoFrameMs, 500);
    ultimoFrameMs = now;

    tick(delta);

    if (typeof window.__sfRenderMesas === 'function')    window.__sfRenderMesas();
    if (typeof window.__sfActualizarHUD === 'function')  window.__sfActualizarHUD();

    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) {
        alert('Stevan Fonda necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión para atender tu fonda.');
        return;
    }

    const badge = document.getElementById('sfUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarEstado();

    const gananciaOffline = aplicarOffline();

    reconstruirMesas();
    mesasActivas.forEach(m => asignarPedido(m));

    if (typeof window.__sfInitClientes === 'function') await window.__sfInitClientes();
    if (typeof window.__sfInitMejoras === 'function')  await window.__sfInitMejoras();

    if (typeof window.__sfRenderProductos === 'function') window.__sfRenderProductos();
    if (typeof window.__sfRenderMejoras === 'function')   window.__sfRenderMejoras();

    if (window.lucide) window.lucide.createIcons();

    if (gananciaOffline > 0 && typeof window.__sfMostrarOffline === 'function') {
        window.__sfMostrarOffline(gananciaOffline);
    }

    window.addEventListener('beforeunload', () => { guardarEstado(); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            guardarEstado();
        } else {
            ultimoFrameMs = 0;
        }
    });

    rafId = requestAnimationFrame(loop);
    setInterval(guardarEstado, 30000);

    // Exponer al resto
    window.__sfEstado        = () => estado;
    window.__sfMesasActivas  = () => mesasActivas;
    window.__sfProductos     = PRODUCTOS;
    window.__sfMejoras       = MEJORAS;
    window.__sfGuardar       = guardarEstado;
    window.__sfGuardarDebounce = guardarDebounce;
    window.__sfPrecioProducto  = precioProducto;
    window.__sfCOSTO_PRESTIGIO = COSTO_PRESTIGIO;
}

document.addEventListener('DOMContentLoaded', inicializar);
