// ============================================================
//  Dino — Juego runner con recompensas
//  ------------------------------------------------------------
//  Mecánica: salta cactus, gana puntos según distancia.
//  Recompensas:
//    - Cada 500 puntos: 5 monedas
//    - Cada 5.000 puntos: +25 monedas extra (bonus)
//  Las monedas se otorgan UNA VEZ al morir, no durante el juego.
//  Récord personal se guarda en app/dino/{codigo}dino.json.
// ============================================================

'use strict';

// ------------------------------------------------------------
//  Constantes del juego
// ------------------------------------------------------------
const CANVAS_W = 900;
const CANVAS_H = 260;
const SUELO_Y = 210;
const GRAVEDAD = 0.65;
const VELOCIDAD_INICIAL = 6;
const VELOCIDAD_MAX = 14;
const ACELERACION = 0.0012;
const SALTO = -13.5;
const CORTE_SALTO = 0.45;          // al soltar antes del ápice

const DINO_X = 60;
const DINO_W = 44;
const DINO_H = 47;

const CACTUS_MIN_W = 18;
const CACTUS_MAX_W = 30;
const CACTUS_H_BASE = 46;

const INTERVALO_CACTUS_MIN = 70;   // frames
const INTERVALO_CACTUS_MAX = 130;

// Recompensas
const PUNTOS_POR_HITO   = 500;
const MONEDAS_POR_HITO  = 5;
const PUNTOS_POR_BONUS  = 5000;
const MONEDAS_POR_BONUS = 25;

// Ruta de datos del récord
const ARCHIVO_BASE = 'app/dino/';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ------------------------------------------------------------
//  Estado global del juego
// ------------------------------------------------------------
let canvas, ctx;
let rafId = null;
let gameState = 'idle'; // idle | corriendo | gameover

const dino = {
    x: DINO_X,
    y: SUELO_Y - DINO_H,
    vy: 0,
    enSuelo: true,
    frame: 0,          // patas
    frameContador: 0
};

let cactus = [];
let velocidad = VELOCIDAD_INICIAL;
let proximoCactusEn = 100;
let distanciaTotal = 0;
let puntos = 0;

let recordPersonal = 0;
let codigoUsuario = null;
let partidaOtorgada = false;

let botonPresionado = false;   // para salto variable

// ------------------------------------------------------------
//  API
// ------------------------------------------------------------
const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ------------------------------------------------------------
//  Tema
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
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ------------------------------------------------------------
//  Color del canvas (lee variables CSS para pintar)
// ------------------------------------------------------------
function colorCSS(nombre, fallback) {
    try {
        const val = getComputedStyle(document.documentElement)
            .getPropertyValue(nombre).trim();
        return val || fallback;
    } catch (e) { return fallback; }
}

// ------------------------------------------------------------
//  Toast
// ------------------------------------------------------------
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('dnToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'dn-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ------------------------------------------------------------
//  Configuración del canvas (con devicePixelRatio para nitidez)
// ------------------------------------------------------------
function configurarCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ------------------------------------------------------------
//  Carga del récord personal
// ------------------------------------------------------------
function rutaRecord() {
    if (!codigoUsuario) return null;
    return ARCHIVO_BASE + codigoUsuario + 'dino.json';
}

async function cargarRecord() {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return 0;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data.record === 'number') return data.record;
    } catch (e) { /* no existe */ }
    return 0;
}

async function guardarRecord(nuevoRecord) {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            record: nuevoRecord,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Dino] No se pudo guardar el récord:', e);
    }
}

// ------------------------------------------------------------
//  Ciclo de vida de la partida
// ------------------------------------------------------------
function empezar() {
    // Reset
    dino.y = SUELO_Y - DINO_H;
    dino.vy = 0;
    dino.enSuelo = true;
    dino.frame = 0;
    dino.frameContador = 0;

    cactus = [];
    velocidad = VELOCIDAD_INICIAL;
    proximoCactusEn = 100;
    distanciaTotal = 0;
    puntos = 0;

    gameState = 'corriendo';
    partidaOtorgada = false;

    document.getElementById('dnOverlayStart').hidden = true;
    document.getElementById('dnOverlayGameOver').hidden = true;

    actualizarHUD();
    if (rafId) cancelAnimationFrame(rafId);
    loop();
}

function gameOver() {
    gameState = 'gameover';
    cancelAnimationFrame(rafId);
    rafId = null;

    // Calcular monedas ganadas
    const hitos  = Math.floor(puntos / PUNTOS_POR_HITO);
    const bonus  = Math.floor(puntos / PUNTOS_POR_BONUS);
    const monedasTotales = (hitos * MONEDAS_POR_HITO) + (bonus * MONEDAS_POR_BONUS);

    const esRecord = puntos > recordPersonal;

    // Mostrar overlay
    document.getElementById('dnGoPuntos').textContent  = puntos.toLocaleString('es-CL');
    document.getElementById('dnGoMonedas').textContent = `+${monedasTotales}`;

    const filaRecord = document.getElementById('dnGoRecordFila');
    if (esRecord) {
        document.getElementById('dnGoRecord').textContent = puntos.toLocaleString('es-CL');
        filaRecord.hidden = false;
    } else {
        filaRecord.hidden = true;
    }

    document.getElementById('dnOverlayGameOver').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    // Otorgar monedas (una sola vez)
    otorgarMonedas(monedasTotales, puntos);

    // Guardar récord si aplica
    if (esRecord) {
        recordPersonal = puntos;
        document.getElementById('dnRecordValor').textContent =
            recordPersonal.toLocaleString('es-CL');
        guardarRecord(recordPersonal);
    }
}

async function otorgarMonedas(cantidad, puntosFinales) {
    if (partidaOtorgada) return;
    partidaOtorgada = true;

    if (cantidad <= 0) {
        toast('Sin monedas esta vez', 'info');
        return;
    }

    const api = API();
    if (!api) {
        toast('Sin conexión con VicWebOs', 'error');
        return;
    }

    try {
        await api.canjear(
            'gamepad-2',
            'dino',
            `Partida: ${puntosFinales.toLocaleString('es-CL')} pts`,
            cantidad
        );
        toast(`+${cantidad} monedas`, 'success');
    } catch (e) {
        console.warn('[Dino] No se pudieron otorgar monedas:', e);
        toast(e.message || 'No se pudieron dar las monedas', 'error');
    }
}

// ------------------------------------------------------------
//  Input
// ------------------------------------------------------------
function saltar() {
    if (gameState === 'corriendo' && dino.enSuelo) {
        dino.vy = SALTO;
        dino.enSuelo = false;
    }
}

function soltar() {
    if (gameState === 'corriendo' && dino.vy < 0) {
        dino.vy *= CORTE_SALTO;
    }
}

function manejarTeclaDown(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        if (gameState === 'idle' || gameState === 'gameover') {
            empezar();
        } else {
            botonPresionado = true;
            saltar();
        }
    }
}

function manejarTeclaUp(e) {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'Enter') {
        botonPresionado = false;
        soltar();
    }
}

function manejarTouchStart(e) {
    e.preventDefault();
    if (gameState === 'idle' || gameState === 'gameover') {
        empezar();
    } else {
        botonPresionado = true;
        saltar();
    }
}

function manejarTouchEnd(e) {
    e.preventDefault();
    botonPresionado = false;
    soltar();
}

// ------------------------------------------------------------
//  Loop principal
// ------------------------------------------------------------
function loop() {
    actualizar();
    dibujar();
    if (gameState === 'corriendo') {
        rafId = requestAnimationFrame(loop);
    }
}

function actualizar() {
    if (gameState !== 'corriendo') return;

    // Acelerar progresivamente
    if (velocidad < VELOCIDAD_MAX) velocidad += ACELERACION;

    // Puntos por distancia recorrida
    distanciaTotal += velocidad * 0.05;
    puntos = Math.floor(distanciaTotal);

    // Física del dino
    dino.vy += GRAVEDAD;
    dino.y += dino.vy;
    if (dino.y >= SUELO_Y - DINO_H) {
        dino.y = SUELO_Y - DINO_H;
        dino.vy = 0;
        dino.enSuelo = true;
    }

    // Animar patas cuando está en el suelo
    if (dino.enSuelo) {
        dino.frameContador++;
        if (dino.frameContador > 4) {
            dino.frame = 1 - dino.frame;
            dino.frameContador = 0;
        }
    } else {
        dino.frame = 0;
    }

    // Generar cactus
    proximoCactusEn--;
    if (proximoCactusEn <= 0) {
        generarCactus();
        // El siguiente se programa más lejos cuanto más rápido vaya
        const min = Math.max(40, INTERVALO_CACTUS_MIN - velocidad * 2);
        const max = Math.max(80, INTERVALO_CACTUS_MAX - velocidad * 2);
        proximoCactusEn = min + Math.random() * (max - min);
    }

    // Mover cactus
    for (const c of cactus) c.x -= velocidad;
    cactus = cactus.filter(c => c.x + c.w > -10);

    // Colisiones
    for (const c of cactus) {
        if (hayColision(c)) {
            gameOver();
            return;
        }
    }

    actualizarHUD();
}

function generarCactus() {
    const w = CACTUS_MIN_W + Math.random() * (CACTUS_MAX_W - CACTUS_MIN_W);
    // A veces vienen en grupo de 2 o 3 para más variedad
    const cantidad = Math.random() < 0.25 ? (Math.random() < 0.5 ? 2 : 3) : 1;
    for (let i = 0; i < cantidad; i++) {
        cactus.push({
            x: CANVAS_W + (i * (w + 4)),
            y: SUELO_Y - CACTUS_H_BASE,
            w: w,
            h: CACTUS_H_BASE
        });
    }
}

function hayColision(c) {
    // Hitbox del dino un poco más chica para que se sienta justo
    const margenX = 6;
    const margenY = 4;
    const dx = dino.x + margenX;
    const dy = dino.y + margenY;
    const dw = DINO_W - margenX * 2;
    const dh = DINO_H - margenY * 2;

    const cx = c.x + 3;
    const cy = c.y + 3;
    const cw = c.w - 6;
    const ch = c.h - 6;

    return dx < cx + cw && dx + dw > cx && dy < cy + ch && dy + dh > cy;
}

// ------------------------------------------------------------
//  Dibujo
// ------------------------------------------------------------
function dibujar() {
    // Limpiar
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Colores del tema
    const cTexto   = colorCSS('--gray-800', '#27272A');
    const cDetalle = colorCSS('--gray-400', '#A1A1AD');
    const cSuelo   = colorCSS('--gray-500', '#71717A');
    const cPuntoOjo = colorCSS('--white', '#FFFFFF');

    // Suelo
    ctx.strokeStyle = cSuelo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, SUELO_Y);
    ctx.lineTo(CANVAS_W, SUELO_Y);
    ctx.stroke();

    // Detalles del suelo (guijarros)
    ctx.fillStyle = cDetalle;
    for (let i = 0; i < 12; i++) {
        const x = (i * 80 + (distanciaTotal * 0.5) % 80) % (CANVAS_W + 20);
        const y = SUELO_Y + 6 + ((i * 7) % 8);
        ctx.fillRect(x, y, 2, 2);
        ctx.fillRect(x + 8, y + 3, 2, 2);
    }

    // Cactus
    for (const c of cactus) dibujarCactus(c, cTexto);

    // Dino
    dibujarDino(cTexto, cPuntoOjo);
}

function dibujarDino(cuerpo, ojo) {
    const x = dino.x;
    const y = dino.y;

    ctx.fillStyle = cuerpo;

    // Cuerpo principal
    ctx.fillRect(x, y + 18, 30, 22);

    // Cuello
    ctx.fillRect(x + 22, y + 6, 12, 18);

    // Cabeza
    ctx.fillRect(x + 26, y, 18, 16);

    // Hocico
    ctx.fillRect(x + 38, y + 8, 6, 6);

    // Cola
    ctx.fillRect(x - 4, y + 20, 6, 10);

    // Ojo
    ctx.fillStyle = ojo;
    ctx.fillRect(x + 34, y + 4, 3, 3);
    ctx.fillStyle = cuerpo;
    ctx.fillRect(x + 36, y + 4, 1, 3);

    // Patas (animadas si está en suelo, fijas si salta)
    if (dino.enSuelo) {
        if (dino.frame === 0) {
            ctx.fillRect(x + 4, y + 40, 6, 7);
            ctx.fillRect(x + 18, y + 40, 6, 4);
        } else {
            ctx.fillRect(x + 4, y + 40, 6, 4);
            ctx.fillRect(x + 18, y + 40, 6, 7);
        }
    } else {
        // En el aire → patas recogidas
        ctx.fillRect(x + 4, y + 40, 6, 4);
        ctx.fillRect(x + 18, y + 40, 6, 4);
    }
}

function dibujarCactus(c, color) {
    ctx.fillStyle = color;
    const x = c.x;
    const y = c.y;
    const w = c.w;
    const h = c.h;

    const centro = x + w / 2;
    const anchoTallo = Math.max(6, w * 0.35);

    // Tallo principal
    ctx.fillRect(centro - anchoTallo / 2, y, anchoTallo, h);

    // Brazo izquierdo
    const brazoY = y + h * 0.35;
    ctx.fillRect(x, brazoY, w * 0.35, 5);
    ctx.fillRect(x, brazoY - h * 0.15, 5, h * 0.2);

    // Brazo derecho
    const brazoY2 = y + h * 0.5;
    ctx.fillRect(centro + anchoTallo / 2 - 1, brazoY2, w * 0.35, 5);
    ctx.fillRect(x + w - 5, brazoY2 - h * 0.1, 5, h * 0.15);
}

// ------------------------------------------------------------
//  HUD y barra de progreso
// ------------------------------------------------------------
function actualizarHUD() {
    // Puntos
    const elPuntos = document.getElementById('dnPuntos');
    if (elPuntos) elPuntos.textContent = puntos.toLocaleString('es-CL');

    // Monedas ganadas en esta partida (calculadas en vivo)
    const hitos = Math.floor(puntos / PUNTOS_POR_HITO);
    const bonus = Math.floor(puntos / PUNTOS_POR_BONUS);
    const monedas = (hitos * MONEDAS_POR_HITO) + (bonus * MONEDAS_POR_BONUS);

    const elMonedas = document.getElementById('dnMonedasPartida');
    if (elMonedas) elMonedas.textContent = monedas;

    // Barra de progreso: mide el ciclo actual de 5000 pts
    const progresoEnCiclo = puntos % PUNTOS_POR_BONUS;
    const porcentaje = (progresoEnCiclo / PUNTOS_POR_BONUS) * 100;

    const fill = document.getElementById('dnProgresoFill');
    if (fill) fill.style.width = porcentaje + '%';

    const meta = document.getElementById('dnProgresoMeta');
    if (meta) {
        meta.textContent = `${progresoEnCiclo.toLocaleString('es-CL')} / ${PUNTOS_POR_BONUS.toLocaleString('es-CL')}`;
    }

    // Marcar los hitos alcanzados
    const hitosEnCiclo = Math.floor(progresoEnCiclo / PUNTOS_POR_HITO);
    document.querySelectorAll('.dn-progreso-marca').forEach((m, i) => {
        m.classList.toggle('llena', i < hitosEnCiclo);
    });
}

function construirMarcasProgreso() {
    const cont = document.getElementById('dnProgresoMarcas');
    if (!cont) return;
    cont.innerHTML = '';
    // 9 marcas intermedias (cada 500 pts, sin contar el 0 ni el 5000)
    for (let i = 1; i <= 9; i++) {
        const m = document.createElement('div');
        m.className = 'dn-progreso-marca';
        m.style.left = ((i / 10) * 100) + '%';
        cont.appendChild(m);
    }
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
async function inicializar() {
    aplicarTemaDelPadre();

    canvas = document.getElementById('dnCanvas');
    if (!canvas) return;
    configurarCanvas();

    // Badge del usuario
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    codigoUsuario = cuenta?.codigo || null;

    const badge = document.getElementById('dnUserBadge');
    if (badge) badge.textContent = cuenta ? `@${cuenta.codigo} · ${cuenta.nombre}` : '—';

    // Cargar récord
    recordPersonal = await cargarRecord();
    const recEl = document.getElementById('dnRecordValor');
    if (recEl) recEl.textContent = recordPersonal.toLocaleString('es-CL');

    // Marcas de la barra
    construirMarcasProgreso();

    // Eventos
    document.addEventListener('keydown', manejarTeclaDown);
    document.addEventListener('keyup', manejarTeclaUp);

    canvas.addEventListener('touchstart', manejarTouchStart, { passive: false });
    canvas.addEventListener('touchend', manejarTouchEnd, { passive: false });

    canvas.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (gameState === 'idle' || gameState === 'gameover') empezar();
        else { botonPresionado = true; saltar(); }
    });
    document.addEventListener('mouseup', () => {
        if (botonPresionado) { botonPresionado = false; soltar(); }
    });

    document.getElementById('dnBtnEmpezar')?.addEventListener('click', empezar);
    document.getElementById('dnBtnReintentar')?.addEventListener('click', empezar);

    // Pinta el estado inicial
    dibujar();
    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
