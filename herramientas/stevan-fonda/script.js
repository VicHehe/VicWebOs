// ============================================================
//  Stevan Fonda — Núcleo
//  ------------------------------------------------------------
//  · Monedas de fonda (internas, sin cap, para upgrades)
//  · Bolsa de Producción (moneda real, con impuesto del SII)
//  · Bolsa de Hitos+Misiones (moneda real, sin impuesto)
//  · Hitos decrecientes (30 totales, suma 250)
//  · Misiones diarias (5 rotativas, 25/día)
//  · Offline al 20%
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'stevan-fonda';
const ARCHIVO_BASE = 'app/stevan-fonda/';

// ---- Balance ----
const COOK_TIME_BASE      = 30000;
const VENTA_PAUSA_MS      = 700;
const COSTO_PRESTIGIO     = 50000;

// ---- Bolsas (monedas reales VicWebOs) ----
const PROD_ACTIVO_DIA     = 125;       // tasa si el iframe está vivo
const PROD_INACTIVO_DIA   = 25;        // 20% (80% menos)
const CAP_DIARIO_PROD     = 150;       // cap absoluto por día
const CAP_ACUMULACION     = 3000;      // cap acumulado de la bolsa producción
const TRAMO_GRATIS        = 150;       // primeros X sin impuesto
const TRAMO_TAMANO        = 150;       // cada tramo de 150 después
const IMPUESTO_INICIAL    = 5;         // %
const IMPUESTO_PASO       = 5;         // +5% por tramo
const IMPUESTO_CAP        = 50;        // %

// ---- Hitos (30 finitos, suma 250) ----
const HITOS = [
    // Bloque 1 (5 × +20 = 100)
    { id: 'h1',  req: 10,   tipo: 'vendidos',   monedas: 20, texto: 'Vendé 10 productos' },
    { id: 'h2',  req: 25,   tipo: 'vendidos',   monedas: 20, texto: 'Vendé 25 productos' },
    { id: 'h3',  req: 50,   tipo: 'vendidos',   monedas: 20, texto: 'Vendé 50 productos' },
    { id: 'h4',  req: 100,  tipo: 'vendidos',   monedas: 20, texto: 'Vendé 100 productos' },
    { id: 'h5',  req: 200,  tipo: 'vendidos',   monedas: 20, texto: 'Vendé 200 productos' },
    // Bloque 2 (5 × +12 = 60)
    { id: 'h6',  req: 350,  tipo: 'vendidos',   monedas: 12, texto: 'Vendé 350 productos' },
    { id: 'h7',  req: 500,  tipo: 'vendidos',   monedas: 12, texto: 'Vendé 500 productos' },
    { id: 'h8',  req: 750,  tipo: 'vendidos',   monedas: 12, texto: 'Vendé 750 productos' },
    { id: 'h9',  req: 1000, tipo: 'vendidos',   monedas: 12, texto: 'Vendé 1.000 productos' },
    { id: 'h10', req: 1500, tipo: 'vendidos',   monedas: 12, texto: 'Vendé 1.500 productos' },
    // Bloque 3 (5 × +8 = 40)
    { id: 'h11', req: 3,    tipo: 'productos',  monedas: 8,  texto: 'Desbloqueá 3 productos' },
    { id: 'h12', req: 5,    tipo: 'productos',  monedas: 8,  texto: 'Desbloqueá 5 productos' },
    { id: 'h13', req: 8,    tipo: 'productos',  monedas: 8,  texto: 'Desbloqueá 8 productos' },
    { id: 'h14', req: 10,   tipo: 'productos',  monedas: 8,  texto: 'Desbloqueá 10 productos' },
    { id: 'h15', req: 12,   tipo: 'productos',  monedas: 8,  texto: 'Desbloqueá 12 productos' },
    // Bloque 4 (5 × +5 = 25)
    { id: 'h16', req: 3,    tipo: 'mesas',      monedas: 5,  texto: 'Tené 3 mesas' },
    { id: 'h17', req: 5,    tipo: 'mesas',      monedas: 5,  texto: 'Tené 5 mesas' },
    { id: 'h18', req: 3,    tipo: 'empleados',  monedas: 5,  texto: 'Nivel 3 de empleados' },
    { id: 'h19', req: 3,    tipo: 'velocidad',  monedas: 5,  texto: 'Nivel 3 de velocidad' },
    { id: 'h20', req: 1,    tipo: 'prestigio',  monedas: 5,  texto: 'Reabrí la fonda 1 vez' },
    // Bloque 5 (5 × +3 = 15)
    { id: 'h21', req: 5,    tipo: 'prestigio',  monedas: 3,  texto: 'Reabrí la fonda 5 veces' },
    { id: 'h22', req: 3,    tipo: 'estrellas',  monedas: 3,  texto: '3 estrellas acumuladas' },
    { id: 'h23', req: 5,    tipo: 'estrellas',  monedas: 3,  texto: '5 estrellas acumuladas' },
    { id: 'h24', req: 3000, tipo: 'vendidos',   monedas: 3,  texto: 'Vendé 3.000 productos' },
    { id: 'h25', req: 5000, tipo: 'vendidos',   monedas: 3,  texto: 'Vendé 5.000 productos' },
    // Bloque 6 (5 × +2 = 10)
    { id: 'h26', req: 6,    tipo: 'mesas',      monedas: 2,  texto: 'Tené 6 mesas' },
    { id: 'h27', req: 5,    tipo: 'empleados',  monedas: 2,  texto: 'Nivel 5 de empleados' },
    { id: 'h28', req: 5,    tipo: 'velocidad',  monedas: 2,  texto: 'Nivel 5 de velocidad' },
    { id: 'h29', req: 10,   tipo: 'estrellas',  monedas: 2,  texto: '10 estrellas acumuladas' },
    { id: 'h30', req: 10000, tipo: 'vendidos',  monedas: 2,  texto: 'Vendé 10.000 productos' }
];

// ---- Misiones diarias (pool de 10, se eligen 5 por día) ----
const MISIONES_POOL = [
    { id: 'm_servir200',  tipo: 'servirDia',    req: 200,  texto: 'Serví 200 productos hoy',           premio: 5 },
    { id: 'm_servir500',  tipo: 'servirDia',    req: 500,  texto: 'Serví 500 productos hoy',           premio: 5 },
    { id: 'm_servir1000', tipo: 'servirDia',    req: 1000, texto: 'Serví 1.000 productos hoy',         premio: 5 },
    { id: 'm_fonda500',   tipo: 'fondaDia',     req: 500,  texto: 'Ganá 500 monedas de fonda hoy',     premio: 5 },
    { id: 'm_fonda1500',  tipo: 'fondaDia',     req: 1500, texto: 'Ganá 1.500 monedas de fonda hoy',   premio: 5 },
    { id: 'm_upVel',      tipo: 'upVelocidad',  req: 1,    texto: 'Hacé un upgrade de velocidad',      premio: 5 },
    { id: 'm_upPre',      tipo: 'upPrecio',     req: 1,    texto: 'Hacé un upgrade de precio',         premio: 5 },
    { id: 'm_upMesa',     tipo: 'upMesas',      req: 1,    texto: 'Hacé un upgrade de mesas',          premio: 5 },
    { id: 'm_upEmp',      tipo: 'upEmpleados',  req: 1,    texto: 'Hacé un upgrade de empleados',      premio: 5 },
    { id: 'm_prodNuevo',  tipo: 'productoNuevo', req: 1,   texto: 'Desbloqueá un producto nuevo hoy',  premio: 5 }
];

// ---- Catálogo de productos ----
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

// ---- Catálogo de mejoras ----
const MEJORAS = [
    { id: 'velocidad',  nombre: 'Velocidad',  icono: 'zap',         base: 50,  factor: 1.6, desc: '-10% tiempo de cocción por nivel' },
    { id: 'precio',     nombre: 'Precio',     icono: 'trending-up', base: 100, factor: 1.7, desc: '+15% precio por nivel' },
    { id: 'mesas',      nombre: 'Mesas',      icono: 'utensils',    base: 200, factor: 2.2, desc: '+1 mesa por nivel' },
    { id: 'empleados',  nombre: 'Empleados',  icono: 'users',       base: 500, factor: 2.5, desc: '+5% velocidad por nivel' },
    { id: 'decoracion', nombre: 'Decoración', icono: 'brush',       base: 80,  factor: 1.6, desc: '+5% propina por nivel' }
];

// ---- Estado ----
let estado = crearEstadoInicial();
let usuarioActual = null;
let inicializado = false;
let rafId = null;
let ultimoFrameMs = 0;
let mesasActivas = [];
let productoServidoHoy = {};    // se resetea a medianoche
let fondaGanadaHoy = 0;
let upHoy = { velocidad: 0, precio: 0, mesas: 0, empleados: 0 };
let productoNuevoHoy = 0;
let ultimoTramoNotificado = 0;

const API = () => {
    try { return window.parent.__vicwebos || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

// ============================================================
//  FECHA CHILE
// ============================================================
function diaChileHoy() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

// ============================================================
//  ESTADO INICIAL
// ============================================================
function crearEstadoInicial() {
    return {
        version: 1,
        monedasFonda: 0,
        monedasFondaFloat: 0,
        totalVendidos: 0,
        productosDesbloqueados: ['italiano'],
        upgrades: { velocidad: 1, precio: 1, mesas: 1, empleados: 1, decoracion: 0 },

        bolsaProduccion: 0,
        bolsaProduccionFloat: 0,
        bolsaHitosMisiones: 0,

        diaActual: diaChileHoy(),
        produccionHoy: 0,

        hitosCompletados: [],
        misionesDelDia: [],
        misionesCompletadas: [],
        diaMisiones: diaChileHoy(),

        ultimoTramoNotificado: 0,

        estrellas: 0,
        prestigios: 0,

        ultimaVez: new Date().toISOString()
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
function cookTimeMs() { return COOK_TIME_BASE / velocidadMult(); }
function multiplicadorPrecio() { return 1 + (estado.upgrades.precio - 1) * 0.15; }
function multiplicadorDecoracion() { return 1 + estado.upgrades.decoracion * 0.05; }
function multiplicadorEstrellas() { return 1 + estado.estrellas * 0.1; }

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

function produccionFondaPorSegundo() {
    const mesas = estado.upgrades.mesas;
    const segPorVenta = cookTimeMs() / 1000;
    const ventasPorSeg = mesas / segPorVenta;
    const activos = productosActivos();
    const prom = activos.reduce((a, p) => a + precioProducto(p), 0) / Math.max(1, activos.length);
    return ventasPorSeg * prom;
}

// ============================================================
//  IMPUESTO DEL SII (por tramos)
// ============================================================
function calcularNetoProduccion(bolsa) {
    if (bolsa <= 0) return 0;
    let neto = 0;
    let restante = bolsa;

    // Tramo gratis
    const gratis = Math.min(restante, TRAMO_GRATIS);
    neto += gratis;
    restante -= gratis;

    // Resto por tramos
    let tasa = IMPUESTO_INICIAL;
    while (restante > 0) {
        const enTramo = Math.min(restante, TRAMO_TAMANO);
        const tasaAplicar = Math.min(tasa, IMPUESTO_CAP) / 100;
        neto += enTramo * (1 - tasaAplicar);
        restante -= enTramo;
        tasa += IMPUESTO_PASO;
    }
    return Math.floor(neto);
}

function calcularDesgloseImpuesto(bolsa) {
    const lineas = [];
    let restante = bolsa;

    const gratis = Math.min(restante, TRAMO_GRATIS);
    if (gratis > 0) {
        lineas.push({ label: `0 – ${TRAMO_GRATIS} (sin impuesto)`, monto: gratis, tasa: 0 });
        restante -= gratis;
    }

    let tasa = IMPUESTO_INICIAL;
    let desde = TRAMO_GRATIS;
    while (restante > 0) {
        const enTramo = Math.min(restante, TRAMO_TAMANO);
        const tasaAplicar = Math.min(tasa, IMPUESTO_CAP);
        lineas.push({
            label: `${desde} – ${desde + enTramo} (${tasaAplicar}%)`,
            monto: enTramo,
            tasa: tasaAplicar
        });
        desde += enTramo;
        restante -= enTramo;
        tasa += IMPUESTO_PASO;
    }
    return lineas;
}

function impuestoActual() {
    const b = estado.bolsaProduccion;
    if (b <= TRAMO_GRATIS) return 0;
    const tramoIndex = Math.floor((b - TRAMO_GRATIS - 1) / TRAMO_TAMANO);
    return Math.min(IMPUESTO_INICIAL + tramoIndex * IMPUESTO_PASO, IMPUESTO_CAP);
}

// ============================================================
//  MISIONES
// ============================================================
function elegirMisionesDelDia() {
    const pool = [...MISIONES_POOL];
    const elegidas = [];
    for (let i = 0; i < 5 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        elegidas.push(pool.splice(idx, 1)[0].id);
    }
    return elegidas;
}

function misionesDelDiaObjs() {
    return estado.misionesDelDia
        .map(id => MISIONES_POOL.find(m => m.id === id))
        .filter(Boolean);
}

function chequearDiaNuevo() {
    const hoy = diaChileHoy();
    if (estado.diaActual !== hoy) {
        estado.diaActual = hoy;
        estado.produccionHoy = 0;
        estado.bolsaProduccionFloat = estado.bolsaProduccion;
    }
    if (estado.diaMisiones !== hoy) {
        estado.diaMisiones = hoy;
        estado.misionesDelDia = elegirMisionesDelDia();
        estado.misionesCompletadas = [];
        productoServidoHoy = {};
        fondaGanadaHoy = 0;
        upHoy = { velocidad: 0, precio: 0, mesas: 0, empleados: 0 };
        productoNuevoHoy = 0;
    }
}

function misionCumplida(m) {
    switch (m.tipo) {
        case 'servirDia':    return estado.totalVendidos >= m.req || (productoServidoHoy.total || 0) >= m.req;
        case 'fondaDia':     return fondaGanadaHoy >= m.req;
        case 'upVelocidad':  return upHoy.velocidad >= m.req;
        case 'upPrecio':     return upHoy.precio >= m.req;
        case 'upMesas':      return upHoy.mesas >= m.req;
        case 'upEmpleados':  return upHoy.empleados >= m.req;
        case 'productoNuevo': return productoNuevoHoy >= m.req;
    }
    return false;
}

function chequearMisiones() {
    for (const m of misionesDelDiaObjs()) {
        if (estado.misionesCompletadas.includes(m.id)) continue;
        if (misionCumplida(m)) {
            estado.misionesCompletadas.push(m.id);
            estado.bolsaHitosMisiones += m.premio;
            if (typeof window.__sfToast === 'function') {
                window.__sfToast(`¡Misión cumplida! +${m.premio} monedas`, 'success');
            }
            if (typeof window.__sfRenderMisiones === 'function') window.__sfRenderMisiones();
        }
    }
}

// ============================================================
//  HITOS
// ============================================================
function hitoCumplido(h) {
    switch (h.tipo) {
        case 'vendidos':   return estado.totalVendidos >= h.req;
        case 'productos':  return estado.productosDesbloqueados.length >= h.req;
        case 'mesas':      return estado.upgrades.mesas >= h.req;
        case 'empleados':  return estado.upgrades.empleados >= h.req;
        case 'velocidad':  return estado.upgrades.velocidad >= h.req;
        case 'prestigio':  return estado.prestigios >= h.req;
        case 'estrellas':  return estado.estrellas >= h.req;
    }
    return false;
}

function chequearHitos() {
    for (const h of HITOS) {
        if (estado.hitosCompletados.includes(h.id)) continue;
        if (hitoCumplido(h)) {
            estado.hitosCompletados.push(h.id);
            estado.bolsaHitosMisiones += h.monedas;
            if (typeof window.__sfToast === 'function') {
                window.__sfToast(`¡Hito! +${h.monedas} monedas — ${h.texto}`, 'success');
            }
        }
    }
    if (typeof window.__sfRenderHitos === 'function') window.__sfRenderHitos();
}

// ============================================================
//  BOLSAS — Canje
// ============================================================
async function canjearBolsaProduccion() {
    const b = Math.floor(estado.bolsaProduccion);
    if (b <= 0) throw new Error('No hay nada para canjear.');
    const neto = calcularNetoProduccion(b);
    if (neto <= 0) throw new Error('El impuesto se comió todo.');

    const api = API();
    if (!api) throw new Error('Sin conexión con VicWebOs.');

    await api.canjear('briefcase', APP_ID, `Producción diaria (${b} brutas, -${b - neto} impuesto)`, neto);

    estado.bolsaProduccion = 0;
    estado.bolsaProduccionFloat = 0;
    estado.ultimoTramoNotificado = 0;
    await guardarEstado();
    return neto;
}

async function canjearBolsaLogros() {
    const b = Math.floor(estado.bolsaHitosMisiones);
    if (b <= 0) throw new Error('No hay nada para canjear.');

    const api = API();
    if (!api) throw new Error('Sin conexión con VicWebOs.');

    await api.canjear('trophy', APP_ID, `Hitos y misiones (${b})`, b);

    estado.bolsaHitosMisiones = 0;
    await guardarEstado();
    return b;
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
    if (ms < 60000) return 0;

    const segFuera = ms / 1000;
    const tasaPorSeg = PROD_INACTIVO_DIA / 86400;
    const ganancia = tasaPorSeg * segFuera;

    const espacioDisponible = CAP_DIARIO_PROD - estado.produccionHoy;
    const aplicar = Math.min(ganancia, Math.max(0, espacioDisponible));

    estado.bolsaProduccionFloat += aplicar;
    estado.produccionHoy += aplicar;
    estado.bolsaProduccion = Math.min(
        Math.floor(estado.bolsaProduccionFloat),
        CAP_ACUMULACION
    );

    return Math.floor(aplicar);
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
    const base = crearEstadoInicial();
    return {
        version: 1,
        monedasFonda: Number.isFinite(data.monedasFonda) ? data.monedasFonda : base.monedasFonda,
        monedasFondaFloat: Number.isFinite(data.monedasFondaFloat) ? data.monedasFondaFloat : 0,
        totalVendidos: Number.isFinite(data.totalVendidos) ? data.totalVendidos : 0,
        productosDesbloqueados: Array.isArray(data.productosDesbloqueados) && data.productosDesbloqueados.length
            ? data.productosDesbloqueados : base.productosDesbloqueados,
        upgrades: { ...base.upgrades, ...(data.upgrades || {}) },

        bolsaProduccion: Number.isFinite(data.bolsaProduccion) ? data.bolsaProduccion : 0,
        bolsaProduccionFloat: Number.isFinite(data.bolsaProduccionFloat) ? data.bolsaProduccionFloat : 0,
        bolsaHitosMisiones: Number.isFinite(data.bolsaHitosMisiones) ? data.bolsaHitosMisiones : 0,

        diaActual: data.diaActual || diaChileHoy(),
        produccionHoy: Number.isFinite(data.produccionHoy) ? data.produccionHoy : 0,

        hitosCompletados: Array.isArray(data.hitosCompletados) ? data.hitosCompletados : [],
        misionesDelDia: Array.isArray(data.misionesDelDia) ? data.misionesDelDia : [],
        misionesCompletadas: Array.isArray(data.misionesCompletadas) ? data.misionesCompletadas : [],
        diaMisiones: data.diaMisiones || diaChileHoy(),

        ultimoTramoNotificado: Number.isFinite(data.ultimoTramoNotificado) ? data.ultimoTramoNotificado : 0,

        estrellas: Number.isFinite(data.estrellas) ? data.estrellas : 0,
        prestigios: Number.isFinite(data.prestigios) ? data.prestigios : 0,

        ultimaVez: data.ultimaVez || new Date().toISOString()
    };
}

let guardandoTimeout = null;
async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;

    estado.bolsaProduccion = Math.min(Math.floor(estado.bolsaProduccionFloat), CAP_ACUMULACION);
    estado.monedasFonda = Math.floor(estado.monedasFondaFloat);
    estado.ultimaVez = new Date().toISOString();

    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[Stevan Fonda] Error guardando:', e);
    }
}
function guardarDebounce() {
    if (guardandoTimeout) clearTimeout(guardandoTimeout);
    guardandoTimeout = setTimeout(guardarEstado, 2000);
}

// ============================================================
//  MESAS
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

// ============================================================
//  LOOP
// ============================================================
let ultimoTickSeg = 0;
function loop(now) {
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const delta = Math.min(now - ultimoFrameMs, 500);
    ultimoFrameMs = now;

    // Acumular producción real de bolsa (fracción)
    const visible = document.visibilityState === 'visible';
    const tasasPorSeg = (visible ? PROD_ACTIVO_DIA : PROD_INACTIVO_DIA) / 86400;
    const segundos = delta / 1000;

    const espacioHoy = CAP_DIARIO_PROD - estado.produccionHoy;
    if (espacioHoy > 0) {
        const ganancia = Math.min(tasasPorSeg * segundos, espacioHoy);
        estado.bolsaProduccionFloat += ganancia;
        estado.produccionHoy += ganancia;
        if (estado.bolsaProduccionFloat > CAP_ACUMULACION) {
            estado.bolsaProduccionFloat = CAP_ACUMULACION;
        }
    }
    estado.bolsaProduccion = Math.floor(estado.bolsaProduccionFloat);

    // Chequeo de día nuevo cada minuto
    ultimoTickSeg += delta;
    if (ultimoTickSeg > 60000) {
        ultimoTickSeg = 0;
        chequearDiaNuevo();
        chequearMisiones();
    }

    // Loop de mesas
    tickMesas(delta);

    if (typeof window.__sfRenderMesas === 'function')   window.__sfRenderMesas();
    if (typeof window.__sfActualizarHUD === 'function') window.__sfActualizarHUD();
    if (typeof window.__sfRenderBolsas === 'function')  window.__sfRenderBolsas();

    rafId = requestAnimationFrame(loop);
}

function tickMesas(deltaMs) {
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
        if (mesa.progreso >= 1) venderMesa(mesa);
    }
}

function venderMesa(mesa) {
    const precio = precioProducto(mesa.producto);

    estado.monedasFondaFloat += precio;
    estado.monedasFonda = Math.floor(estado.monedasFondaFloat);
    estado.totalVendidos++;
    fondaGanadaHoy += precio;
    productoServidoHoy[mesa.producto.id] = (productoServidoHoy[mesa.producto.id] || 0) + 1;
    productoServidoHoy.total = (productoServidoHoy.total || 0) + 1;

    mesa.pausado = VENTA_PAUSA_MS;
    mesa.progreso = 0;

    if (typeof window.__sfMostrarPopup === 'function') window.__sfMostrarPopup(mesa.id, precio);

    chequearHitos();
    chequearMisiones();
    chequearDesbloqueosProductos();

    setTimeout(() => {
        asignarPedido(mesa);
        guardarDebounce();
    }, VENTA_PAUSA_MS);
}

function chequearDesbloqueosProductos() {
    const nuevos = [];
    for (const p of PRODUCTOS) {
        if (!estado.productosDesbloqueados.includes(p.id) && estado.totalVendidos >= p.desbloqueo) {
            estado.productosDesbloqueados.push(p.id);
            nuevos.push(p);
        }
    }
    if (nuevos.length === 0) return;
    productoNuevoHoy += nuevos.length;
    if (typeof window.__sfMostrarUnlock === 'function') {
        window.__sfMostrarUnlock(nuevos[nuevos.length - 1]);
    }
    if (typeof window.__sfRenderProductos === 'function') window.__sfRenderProductos();
    window.__sfGuardarDebounce?.();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Stevan Fonda necesita estar dentro de VicWebOs.'); return; }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión para atender tu fonda.'); return; }

    const badge = document.getElementById('sfUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarEstado();
    chequearDiaNuevo();

    // Si no hay misiones del día, generarlas
    if (estado.misionesDelDia.length === 0) {
        estado.misionesDelDia = elegirMisionesDelDia();
        estado.diaMisiones = diaChileHoy();
    }

    const gananciaOffline = aplicarOffline();

    reconstruirMesas();
    mesasActivas.forEach(m => asignarPedido(m));

    if (typeof window.__sfInitClientes === 'function') await window.__sfInitClientes();
    if (typeof window.__sfInitMejoras === 'function')  await window.__sfInitMejoras();

    if (typeof window.__sfRenderProductos === 'function') window.__sfRenderProductos();
    if (typeof window.__sfRenderMejoras === 'function')   window.__sfRenderMejoras();
    if (typeof window.__sfRenderMisiones === 'function')  window.__sfRenderMisiones();
    if (typeof window.__sfRenderBolsas === 'function')    window.__sfRenderBolsas();

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

    // Exponer
    window.__sfEstado               = () => estado;
    window.__sfMesasActivas         = () => mesasActivas;
    window.__sfProductos            = PRODUCTOS;
    window.__sfMejoras              = MEJORAS;
    window.__sfHitos                = HITOS;
    window.__sfMisionesPool         = MISIONES_POOL;
    window.__sfGuardar              = guardarEstado;
    window.__sfGuardarDebounce      = guardarDebounce;
    window.__sfPrecioProducto       = precioProducto;
    window.__sfCOSTO_PRESTIGIO      = COSTO_PRESTIGIO;
    window.__sfMisionesDelDiaObjs   = misionesDelDiaObjs;
    window.__sfCalcularNeto         = calcularNetoProduccion;
    window.__sfCalcularDesglose     = calcularDesgloseImpuesto;
    window.__sfImpuestoActual       = impuestoActual;
    window.__sfCanjearProduccion    = canjearBolsaProduccion;
    window.__sfCanjearLogros        = canjearBolsaLogros;
}

document.addEventListener('DOMContentLoaded', inicializar);
