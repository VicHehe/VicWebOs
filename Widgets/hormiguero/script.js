// ============================================================
//  Widget: Hormiguero
//  ------------------------------------------------------------
//  Mini colonia de hormigas. Cada compra añade un elemento:
//    - Hormiga (15 monedas) → +1 hormiga caminando (máx 20)
//    - Túnel (25 monedas) → +1 entrada de túnel (máx 5)
//
//  Persistencia POR USUARIO en:
//      app/hormiguero/{codigo}hormiguero.json
//
//  Estado inicial: 3 hormigas, 0 túneles.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/hormiguero/';

const COSTO_HORMIGA = 15;
const COSTO_TUNEL = 25;
const MAX_HORMIGAS = 20;
const MAX_TUNELES = 5;

// Posiciones fijas de los túneles (fracciones del canvas)
const POSICIONES_TUNELES = [
    { x: 0.15, y: 0.55 },
    { x: 0.82, y: 0.35 },
    { x: 0.50, y: 0.78 },
    { x: 0.30, y: 0.22 },
    { x: 0.68, y: 0.62 }
];

// ---------- ESTADO ----------
let usuarioActual = null;
let colonia = { hormigas: 3, tuneles: 0 };
let monedas = 0;
let ants = [];
let canvas, ctx;
let rafId = null;
let ultimoTiempo = 0;
let inicializado = false;
let comprando = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

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
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('hgToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'hg-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2200);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'hormiguero.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (!data || typeof data !== 'object') return;
        if (Number.isFinite(data.hormigas)) {
            colonia.hormigas = Math.max(3, Math.min(MAX_HORMIGAS, data.hormigas));
        }
        if (Number.isFinite(data.tuneles)) {
            colonia.tuneles = Math.max(0, Math.min(MAX_TUNELES, data.tuneles));
        }
    } catch (e) { /* no existe */ }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            hormigas: colonia.hormigas,
            tuneles: colonia.tuneles,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Hormiguero] No se pudo guardar:', e);
    }
}

// ============================================================
//  CANVAS
// ============================================================
function ajustarCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function anchoLogico() { return canvas.width / (window.devicePixelRatio || 1); }
function altoLogico()  { return canvas.height / (window.devicePixelRatio || 1); }

// ============================================================
//  HORMIGAS
// ============================================================
function nuevaHormiga() {
    const W = anchoLogico();
    const H = altoLogico();
    return {
        x: W * 0.2 + Math.random() * W * 0.6,
        y: H * 0.2 + Math.random() * H * 0.6,
        angle: Math.random() * Math.PI * 2,
        speed: 0.22 + Math.random() * 0.28,
        wiggle: Math.random() * Math.PI * 2,
        cambioTiempo: 800 + Math.random() * 1500
    };
}

function asegurarCantidad(n) {
    while (ants.length < n) ants.push(nuevaHormiga());
    while (ants.length > n) ants.pop();
}

function actualizarHormiga(a, deltaMs) {
    const W = anchoLogico();
    const H = altoLogico();

    // Cambio gradual de dirección
    a.cambioTiempo -= deltaMs;
    if (a.cambioTiempo <= 0) {
        a.angle += (Math.random() - 0.5) * 1.8;
        a.cambioTiempo = 800 + Math.random() * 1500;
    }

    // Movimiento
    const paso = a.speed * (deltaMs / 16.67);
    a.x += Math.cos(a.angle) * paso;
    a.y += Math.sin(a.angle) * paso;

    // Rebote en paredes
    const margen = 6;
    if (a.x < margen) { a.x = margen; a.angle = Math.PI - a.angle; a.cambioTiempo = 500; }
    if (a.x > W - margen) { a.x = W - margen; a.angle = Math.PI - a.angle; a.cambioTiempo = 500; }
    if (a.y < margen) { a.y = margen; a.angle = -a.angle; a.cambioTiempo = 500; }
    if (a.y > H - margen) { a.y = H - margen; a.angle = -a.angle; a.cambioTiempo = 500; }

    // Wiggle continuo
    a.wiggle += deltaMs * 0.014;
}

function dibujarHormiga(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.angle);

    // Sombra sutil
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-0.5, 0.8, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#E8C99B';

    // Cuerpo: 3 elipses (abdomen, tórax, cabeza)
    ctx.beginPath();
    ctx.ellipse(-3.5, 0, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 0, 1.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(2.8, 0, 1.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Patas (3 pares)
    ctx.strokeStyle = '#E8C99B';
    ctx.lineWidth = 0.55;
    const wiggleOff = Math.sin(a.wiggle) * 1.2;

    for (let i = -1; i <= 1; i++) {
        const lx = i * 1.2;
        // Pata de arriba
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 0.8, -2.8 + wiggleOff * (i === 0 ? 1 : 0.5));
        ctx.stroke();
        // Pata de abajo
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 0.8, 2.8 - wiggleOff * (i === 0 ? 1 : 0.5));
        ctx.stroke();
    }

    // Antenas
    ctx.beginPath();
    ctx.moveTo(3.5, -0.5);
    ctx.lineTo(5.5, -1.8);
    ctx.moveTo(3.5, 0.5);
    ctx.lineTo(5.5, 1.8);
    ctx.stroke();

    ctx.restore();
}

function dibujarTuneles() {
    const W = anchoLogico();
    const H = altoLogico();

    for (let i = 0; i < colonia.tuneles; i++) {
        const pos = POSICIONES_TUNELES[i];
        if (!pos) continue;
        const tx = W * pos.x;
        const ty = H * pos.y;
        const r = 8 + (i % 2);

        // Sombra del hueco
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.ellipse(tx, ty, r, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Borde iluminado
        ctx.strokeStyle = 'rgba(232, 201, 155, 0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(tx, ty, r, r * 0.7, 0, -Math.PI * 0.9, -Math.PI * 0.1);
        ctx.stroke();

        // Partículas de tierra alrededor
        ctx.fillStyle = 'rgba(232, 201, 155, 0.20)';
        for (let k = 0; k < 4; k++) {
            const ang = (k / 4) * Math.PI * 2 + i;
            const px = tx + Math.cos(ang) * (r + 3);
            const py = ty + Math.sin(ang) * (r * 0.7 + 3);
            ctx.fillRect(px - 0.5, py - 0.5, 1.2, 1.2);
        }
    }
}

function dibujarFondo() {
    const W = anchoLogico();
    const H = altoLogico();

    // Degradado tierra
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#2E2216');
    grad.addColorStop(1, '#1A1008');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Granos de tierra (estáticos en su mayoría)
    ctx.fillStyle = 'rgba(232, 201, 155, 0.08)';
    for (let i = 0; i < 40; i++) {
        const x = (i * 73) % W;
        const y = (i * 47) % H;
        ctx.fillRect(x, y, 1.2, 1.2);
    }
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (!ultimoTiempo) ultimoTiempo = now;
    const deltaMs = Math.min(now - ultimoTiempo, 100);
    ultimoTiempo = now;

    // Actualizar
    for (const a of ants) actualizarHormiga(a, deltaMs);

    // Dibujar
    ctx.clearRect(0, 0, anchoLogico(), altoLogico());
    dibujarFondo();
    dibujarTuneles();
    for (const a of ants) dibujarHormiga(a);

    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  UI
// ============================================================
function actualizarUI() {
    const statsEl = document.getElementById('hgStats');
    if (statsEl) {
        statsEl.textContent = `${colonia.hormigas} hormigas · ${colonia.tuneles} túneles`;
    }

    const btnH = document.getElementById('hgBtnHormiga');
    const btnT = document.getElementById('hgBtnTunel');

    if (btnH) {
        const lleno = colonia.hormigas >= MAX_HORMIGAS;
        btnH.disabled = comprando || monedas < COSTO_HORMIGA || lleno;
        btnH.title = lleno ? 'Colonia al máximo' : '';
    }
    if (btnT) {
        const lleno = colonia.tuneles >= MAX_TUNELES;
        btnT.disabled = comprando || monedas < COSTO_TUNEL || lleno;
        btnT.title = lleno ? 'Túneles al máximo' : '';
    }
}

function refrescarMonedas() {
    const api = API();
    if (!api) return;
    try {
        monedas = api.obtenerMonedas ? api.obtenerMonedas() : 0;
    } catch (e) { monedas = 0; }
    actualizarUI();
}

// ============================================================
//  COMPRAS
// ============================================================
async function comprarHormiga() {
    if (comprando) return;
    if (colonia.hormigas >= MAX_HORMIGAS) {
        toast('Colonia al máximo', 'info');
        return;
    }
    const api = API();
    if (!api) return;

    comprando = true;
    actualizarUI();

    try {
        await api.gastoBoleta('bug', 'hormiguero', `Hormiga ${colonia.hormigas + 1}`, COSTO_HORMIGA);
        colonia.hormigas++;
        await guardar();
        asegurarCantidad(colonia.hormigas);
        refrescarMonedas();
        toast(`¡Ahora tienes ${colonia.hormigas} hormigas!`, 'success');
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    } finally {
        comprando = false;
        actualizarUI();
    }
}

async function comprarTunel() {
    if (comprando) return;
    if (colonia.tuneles >= MAX_TUNELES) {
        toast('Túneles al máximo', 'info');
        return;
    }
    const api = API();
    if (!api) return;

    comprando = true;
    actualizarUI();

    try {
        await api.gastoBoleta('route', 'hormiguero', `Túnel ${colonia.tuneles + 1}`, COSTO_TUNEL);
        colonia.tuneles++;
        await guardar();
        refrescarMonedas();
        toast(`¡Nuevo túnel excavado!`, 'success');
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    } finally {
        comprando = false;
        actualizarUI();
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    canvas = document.getElementById('hgCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    await cargar();
    refrescarMonedas();

    // Ajustar canvas tras el primer layout
    ajustarCanvas();
    window.addEventListener('resize', () => {
        ajustarCanvas();
        asegurarCantidad(colonia.hormigas);
    });

    // Iniciar ants
    asegurarCantidad(colonia.hormigas);

    actualizarUI();

    // Eventos
    document.getElementById('hgBtnHormiga')?.addEventListener('click', comprarHormiga);
    document.getElementById('hgBtnTunel')?.addEventListener('click', comprarTunel);

    // Escuchar cambios de monedas (por si otro lado gasta/muestra)
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'vicwebos_chequera_cambio') {
            refrescarMonedas();
        }
    });

    // Loop
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
