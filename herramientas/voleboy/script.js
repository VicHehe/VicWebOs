// ============================================================
//  Voleboy — Pong vertical con spin
//  ------------------------------------------------------------
//  Modos:  CPU  ·  P2P (PeerJS)
//  Economía:
//    · Atrapadas         → 0 monedas (son parte del gameplay)
//    · Aguantar 30s       → +5 (P2P, repetible)
//    · Ganar (P2P)        → +20
//    · Perder (P2P)       → +5
//    · Ganar vs CPU       → +25
//    · Perder vs CPU      → 0
//
//  P2P: host autoritativo. Guest envía su paleta a ~30Hz. Host envía
//  estado de bola + su paleta a ~20Hz. Protocolo en data channel.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID       = 'voleboy';
const RUTA_CUENTAS = 'cuenta.json';

// ---- Canvas lógico (CSS lo escala) ----
const CW = 400;
const CH = 600;

// ---- Paletas ----
const PADDLE_W = 90;
const PADDLE_H = 18;
const PADDLE_Y_JUGADOR = CH - 30;   // centro de la paleta inferior
const PADDLE_Y_CPU     = 30;        // centro de la paleta superior

// ---- Bola ----
const BALL_R             = 11;
const BALL_SPEED_INICIAL = 200;     // px/s
const BALL_SPEED_MAX     = 720;     // px/s
const BALL_ACCEL_POR_GOLPE = 1.06;  // +6% por hit
const SPIN_FUERZA        = 320;     // aceleración lateral por spin
const SPIN_DAMPING       = 0.985;
const SPIN_MAX           = 1.0;
const TRAIL_MAX          = 10;

// ---- Tiempos ----
const COUNTDOWN_SEG      = 3;
const AGUANTE_SEG        = 30;      // cada 30s
const AGUANTE_MONEDAS    = 5;

// ---- Economía (P2P) ----
const MONEDAS_GANAR_P2P  = 20;
const MONEDAS_PERDER_P2P = 5;

// ---- Economía (CPU) ----
const MONEDAS_GANAR_CPU  = 25;

// ---- Red ----
const NET_PADDLE_HZ   = 30;
const NET_STATE_HZ    = 20;

// ============================================================
//  ESTADO
// ============================================================
let canvas, ctx;
let estado = 'menu';                 // menu | esperando | countdown | jugando | fin
let modo = 'cpu';                    // cpu | p2p

let rafId = null;
let ultimoFrameMs = 0;
let preGameTimer = 0;                // countdown

const bola = { x: CW / 2, y: CH / 2, vx: 0, vy: 0, spin: 0, trail: [] };
const p1 = { x: CW / 2, w: PADDLE_W };   // jugador (abajo)
const p2 = { x: CW / 2, w: PADDLE_W };   // rival/CPU (arriba)

let sobrevividos = 0;                // segundos de bola viva
let aguantesCobrados = 0;
let monedasPartida = 0;
let ultimoAguanteSeg = 0;

let miFotoImg = null;
let rivalFotoImg = null;
let miInicial = '?';
let rivalInicial = '?';
let rivalNombre = 'Rival';

let popups = [];
let particulas = [];

let toastTimer = null;

// Red
let peer = null;
let conn = null;
let esHost = false;
let codigoSala = '';
let rivalPaddleX = CW / 2;           // última x recibida del rival
let ultimoEnvioPaddle = 0;
let ultimoEnvioEstado = 0;

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
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data?.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
        dibujar();
    }
});

function cv(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) { return fallback; }
}

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('vbToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'vb-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================================
//  FOTO DE PERFIL
// ============================================================
async function cargarMiFoto() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    if (!cuenta) return;
    miInicial = (cuenta.nombre || '?').charAt(0).toUpperCase();
    try {
        const bd = BD();
        if (!bd) return;
        const cuentas = await bd.leerArchivoFresh(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return;
        const yo = cuentas.find(c => c.codigo === cuenta.codigo);
        if (yo && yo.foto) {
            miFotoImg = new Image();
            miFotoImg.onload = () => dibujar();
            miFotoImg.src = yo.foto;
        }
    } catch (e) {}
}

function cargarFotoRival(base64) {
    if (!base64) return;
    rivalFotoImg = new Image();
    rivalFotoImg.onload = () => dibujar();
    rivalFotoImg.src = base64;
}

// ============================================================
//  CANVAS
// ============================================================
function configurarCanvas() {
    canvas = document.getElementById('vbCanvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = CW * dpr;
    canvas.height = CH * dpr;
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ============================================================
//  DIBUJADO
// ============================================================
function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.lineTo(x + w - rr, y);
    c.quadraticCurveTo(x + w, y, x + w, y + rr);
    c.lineTo(x + w, y + h - rr);
    c.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    c.lineTo(x + rr, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - rr);
    c.lineTo(x, y + rr);
    c.quadraticCurveTo(x, y, x + rr, y);
    c.closePath();
}

function dibujar() {
    if (!ctx) return;

    // Fondo
    ctx.fillStyle = cv('--gray-900', '#18181B');
    ctx.fillRect(0, 0, CW, CH);

    // Vignette superior e inferior sutiles
    const grd1 = ctx.createLinearGradient(0, 0, 0, 80);
    grd1.addColorStop(0, 'rgba(255,255,255,0.03)');
    grd1.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd1;
    ctx.fillRect(0, 0, CW, 80);

    const grd2 = ctx.createLinearGradient(0, CH - 80, 0, CH);
    grd2.addColorStop(0, 'rgba(255,255,255,0)');
    grd2.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = grd2;
    ctx.fillRect(0, CH - 80, CW, 80);

    // Línea central dashed
    ctx.strokeStyle = cv('--gray-600', '#52525B');
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.setLineDash([8, 12]);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(12, CH / 2);
    ctx.lineTo(CW - 12, CH / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Trail de la bola
    dibujarTrail();

    // Bola
    dibujarBola();

    // Popups (+5)
    dibujarPopups();

    // Paletas
    dibujarPaleta(p2.x, PADDLE_Y_CPU,     rivalFotoImg, rivalInicial, cv('--violet-600', '#7C3AED'));
    dibujarPaleta(p1.x, PADDLE_Y_JUGADOR, miFotoImg,    miInicial,    cv('--violet-500', '#8B5CF6'));

    // Countdown
    if (estado === 'countdown') {
        const txt = preGameTimer > 0.6
            ? String(Math.ceil(preGameTimer))
            : '¡YA!';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = cv('--violet-400', '#A78BFA');
        ctx.font = 'bold 110px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, CW / 2, CH / 2);
    }

    // Mensaje de espera (P2P host)
    if (estado === 'esperando') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = cv('--gray-300', '#D4D4DD');
        ctx.font = 'bold 22px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Esperando rival…', CW / 2, CH / 2 - 20);
        ctx.font = '600 14px Nunito, sans-serif';
        ctx.fillStyle = cv('--gray-500', '#71717A');
        ctx.fillText('Sala: ' + codigoSala, CW / 2, CH / 2 + 20);
    }
}

function dibujarTrail() {
    for (let i = 0; i < bola.trail.length; i++) {
        const t = bola.trail[i];
        const alpha = (i + 1) / bola.trail.length * 0.35;
        const r = BALL_R * (0.5 + i / bola.trail.length * 0.5);
        ctx.fillStyle = cv('--violet-500', '#8B5CF6');
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function dibujarBola() {
    const colorAcento = cv('--violet-500', '#8B5CF6');
    const colorGlow   = cv('--violet-400', '#A78BFA');

    // Glow
    ctx.save();
    ctx.shadowColor = colorGlow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = colorAcento;
    ctx.beginPath();
    ctx.arc(bola.x, bola.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Núcleo brillante
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(bola.x - BALL_R * 0.35, bola.y - BALL_R * 0.35, BALL_R * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function dibujarPaleta(cx, cy, foto, inicial, colorBorde) {
    const x = cx - PADDLE_W / 2;
    const y = cy - PADDLE_H / 2;

    // Sombra
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    // Base redondeada
    roundRect(ctx, x, y, PADDLE_W, PADDLE_H, 9);
    ctx.fillStyle = cv('--gray-800', '#27272A');
    ctx.fill();
    ctx.restore();

    // Recorte de la paleta para meter la foto
    ctx.save();
    roundRect(ctx, x, y, PADDLE_W, PADDLE_H, 9);
    ctx.clip();

    if (foto && foto.complete && foto.naturalWidth > 0) {
        // Cover: escalar la foto para cubrir toda la paleta
        const fw = foto.naturalWidth;
        const fh = foto.naturalHeight;
        const scale = Math.max(PADDLE_W / fw, PADDLE_H / fh);
        const w = fw * scale;
        const h = fh * scale;
        ctx.drawImage(foto, x + (PADDLE_W - w) / 2, y + (PADDLE_H - h) / 2, w, h);
        // Tinte suave para integrarlo al tema
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
    } else {
        // Fallback: color de acento + inicial
        ctx.fillStyle = colorBorde;
        ctx.fillRect(x, y, PADDLE_W, PADDLE_H);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 13px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, cx, cy + 1);
    }
    ctx.restore();

    // Borde de acento por encima
    ctx.strokeStyle = colorBorde;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, PADDLE_W, PADDLE_H, 9);
    ctx.stroke();

    // Brillo interno superior
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1, y + 1, PADDLE_W - 2, PADDLE_H - 2, 8);
    ctx.stroke();
}

function dibujarPopups() {
    for (const p of popups) {
        const alpha = Math.min(1, p.life / p.lifeMax);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 26px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 4;
        ctx.strokeText(p.texto, p.x, p.y);
        ctx.fillText(p.texto, p.x, p.y);
    }
    ctx.globalAlpha = 1;
}

// ============================================================
//  INPUT — Paleta del jugador sigue mouse/dedo
// ============================================================
function actualizarPaletaJugador() {
    let centro = p1.x;

    // Mouse
    if (mouseCanvasX !== null) centro = mouseCanvasX;
    // Touch
    if (touchCanvasX !== null) centro = touchCanvasX;

    // Aplicar con clamp
    const half = PADDLE_W / 2;
    p1.x = Math.max(half, Math.min(CW - half, centro));
}

let mouseCanvasX = null;
let touchCanvasX = null;

function setupInput() {
    if (!canvas) return;

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * CW;
        if (e.pointerType === 'touch') touchCanvasX = x;
        else mouseCanvasX = x;
    });

    canvas.addEventListener('pointerleave', () => {
        mouseCanvasX = null;
        touchCanvasX = null;
    });

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * CW;
        if (e.pointerType === 'touch') touchCanvasX = x;
        else mouseCanvasX = x;
    });

    canvas.addEventListener('pointerup', () => {
        touchCanvasX = null;
    });

    // Teclado (bonus para PC)
    document.addEventListener('keydown', (e) => {
        if (estado !== 'jugando') return;
        const paso = 40;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            mouseCanvasX = (mouseCanvasX ?? p1.x) - paso;
            e.preventDefault();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            mouseCanvasX = (mouseCanvasX ?? p1.x) + paso;
            e.preventDefault();
        }
    });
}

// ============================================================
//  CPU
// ============================================================
function actualizarCpu(dt) {
    const objetivoY = PADDLE_Y_CPU;

    // Predicción simple: dónde estará la bola cuando llegue al paddle superior
    let objetivoX = bola.x;
    if (bola.vy < 0) {
        const tLlegada = (objetivoY - bola.y) / bola.vy;
        if (tLlegada > 0 && tLlegada < 2.5) {
            const t = tLlegada;
            objetivoX = bola.x + bola.vx * t + 0.5 * bola.spin * SPIN_FUERZA * t * t;
            // Clamp a los bordes
            objetivoX = Math.max(BALL_R, Math.min(CW - BALL_R, objetivoX));
        }
    }

    // Error humano: ±22px
    objetivoX += (Math.random() - 0.5) * 44;

    // Velocidad adaptativa: sube con la bola pero con tope
    const velCpu = Math.min(600, 300 + Math.hypot(bola.vx, bola.vy) * 0.35);

    const diff = objetivoX - p2.x;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), velCpu * dt);
    p2.x += move;

    const half = PADDLE_W / 2;
    p2.x = Math.max(half, Math.min(CW - half, p2.x));
}

// ============================================================
//  FÍSICA
// ============================================================
function resetBola() {
    bola.x = CW / 2;
    bola.y = CH / 2;
    bola.vx = 0;
    bola.vy = -BALL_SPEED_INICIAL;
    bola.spin = 0;
    bola.trail = [];
}

function resetPartida() {
    resetBola();
    p1.x = CW / 2;
    p2.x = CW / 2;
    sobrevividos = 0;
    aguantesCobrados = 0;
    monedasPartida = 0;
    popups = [];
    particulas = [];
    ultimoAguanteSeg = 0;
    actualizarHUD();
}

function actualizar(dt) {
    // Paleta del jugador siempre sigue al input
    actualizarPaletaJugador();

    // Paleta rival
    if (modo === 'cpu') {
        actualizarCpu(dt);
    } else if (modo === 'p2p') {
        if (esHost) {
            // Host: p2 se mueve hacia rivalPaddleX (que llega del guest)
            const diff = rivalPaddleX - p2.x;
            p2.x += diff * Math.min(1, dt * 25);
        } else {
            // Guest: p2 es el host, viene por red
            const diff = rivalPaddleX - p2.x;
            p2.x += diff * Math.min(1, dt * 25);
        }
    }

    // ---- Física de la bola ----
    bola.vx += bola.spin * SPIN_FUERZA * dt;
    bola.vx *= Math.pow(SPIN_DAMPING, dt * 60);
    bola.x += bola.vx * dt;
    bola.y += bola.vy * dt;

    // Trail
    bola.trail.push({ x: bola.x, y: bola.y });
    if (bola.trail.length > TRAIL_MAX) bola.trail.shift();

    // Paredes laterales
    if (bola.x - BALL_R < 0) {
        bola.x = BALL_R;
        bola.vx = -bola.vx * 0.9;
        bola.spin *= -0.5;
        spawnParticulas(bola.x, bola.y);
    } else if (bola.x + BALL_R > CW) {
        bola.x = CW - BALL_R;
        bola.vx = -bola.vx * 0.9;
        bola.spin *= -0.5;
        spawnParticulas(bola.x, bola.y);
    }

    // Colisión con paleta superior
    if (bola.vy < 0 && colisionCircRect(bola.x, bola.y, BALL_R, p2.x, PADDLE_Y_CPU, PADDLE_W, PADDLE_H)) {
        bola.y = PADDLE_Y_CPU + PADDLE_H / 2 + BALL_R;
        bola.vy = Math.abs(bola.vy) * BALL_ACCEL_POR_GOLPE;
        bola.vy = Math.min(bola.vy, BALL_SPEED_MAX);
        const hit = (bola.x - p2.x) / (PADDLE_W / 2);
        bola.spin = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, hit * 0.9));
        bola.vx += hit * 60;
        spawnParticulas(bola.x, bola.y);
    }

    // Colisión con paleta inferior
    if (bola.vy > 0 && colisionCircRect(bola.x, bola.y, BALL_R, p1.x, PADDLE_Y_JUGADOR, PADDLE_W, PADDLE_H)) {
        bola.y = PADDLE_Y_JUGADOR - PADDLE_H / 2 - BALL_R;
        bola.vy = -Math.abs(bola.vy) * BALL_ACCEL_POR_GOLPE;
        bola.vy = Math.max(bola.vy, -BALL_SPEED_MAX);
        const hit = (bola.x - p1.x) / (PADDLE_W / 2);
        bola.spin = Math.max(-SPIN_MAX, Math.min(SPIN_MAX, hit * 0.9));
        bola.vx += hit * 60;
        spawnParticulas(bola.x, bola.y);
    }

    // Fuera de límites → fin de partida
    if (bola.y < -BALL_R * 3) {
        // Pasó la CPU/arriba → ganó el jugador (abajo)
        terminarPartida('jugador');
        return;
    }
    if (bola.y > CH + BALL_R * 3) {
        // Pasó el jugador → ganó la CPU/rival
        terminarPartida('rival');
        return;
    }

    // Aguantar (solo P2P)
    if (modo === 'p2p') {
        sobrevividos += dt;
        const bloqueActual = Math.floor(sobrevividos / AGUANTE_SEG);
        if (bloqueActual > ultimoAguanteSeg) {
            ultimoAguanteSeg = bloqueActual;
            otorgarAguante();
        }
        actualizarHUDTimer();
    }

    // Partículas
    for (const p of particulas) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt;
        p.life -= dt;
    }
    particulas = particulas.filter(p => p.life > 0);

    // Popups
    for (const p of popups) {
        p.y -= 60 * dt;
        p.life -= dt;
    }
    popups = popups.filter(p => p.life > 0);
}

function colisionCircRect(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx - rw / 2, Math.min(cx, rx + rw / 2));
    const closestY = Math.max(ry - rh / 2, Math.min(cy, ry + rh / 2));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
}

function spawnParticulas(x, y) {
    for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const vel = 60 + Math.random() * 100;
        particulas.push({
            x, y,
            vx: Math.cos(ang) * vel,
            vy: Math.sin(ang) * vel,
            life: 0.45,
            lifeMax: 0.45,
            color: cv('--violet-400', '#A78BFA')
        });
    }
}

// ============================================================
//  ECONOMÍA
// ============================================================
async function otorgarAguante() {
    aguantesCobrados++;
    monedasPartida += AGUANTE_MONEDAS;

    // Popup
    popups.push({
        texto: '+' + AGUANTE_MONEDAS,
        x: CW / 2,
        y: CH / 2 - 60,
        life: 1.5,
        lifeMax: 1.5
    });

    actualizarHUD();

    const api = API();
    if (!api?.canjear) return;
    try {
        await api.canjear('timer', APP_ID, `Voleboy: aguante 30s`, AGUANTE_MONEDAS);
    } catch (e) {
        console.warn('[Voleboy] No se pudo otorgar aguante:', e);
    }

    // Si es P2P y soy host, avisar al guest
    if (modo === 'p2p' && esHost && conn?.open) {
        try { conn.send({ t: 'aguantar' }); } catch (e) {}
    }
}

async function otorgarVictoria() {
    let monto = 0;
    if (modo === 'cpu') monto = MONEDAS_GANAR_CPU;
    else monto = MONEDAS_GANAR_P2P;
    monedasPartida += monto;
    actualizarHUD();
    const api = API();
    if (api?.canjear) {
        try {
            await api.canjear('trophy', APP_ID, `Voleboy: victoria`, monto);
        } catch (e) {}
    }
}

async function otorgarDerrota() {
    if (modo === 'cpu') return;      // CPU: perder = 0
    monedasPartida += MONEDAS_PERDER_P2P;
    actualizarHUD();
    const api = API();
    if (api?.canjear) {
        try {
            await api.canjear('heart-handshake', APP_ID, `Voleboy: consuelo`, MONEDAS_PERDER_P2P);
        } catch (e) {}
    }
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
let partidaTerminada = false;

function terminarPartida(ganador) {
    if (partidaTerminada) return;
    partidaTerminada = true;
    estado = 'fin';

    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const yoGane = ganador === 'jugador';

    // Avisar al rival por red
    if (modo === 'p2p' && esHost && conn?.open) {
        try { conn.send({ t: 'fin', ganador }); } catch (e) {}
    }

    // Otorgar monedas
    if (yoGane) otorgarVictoria();
    else        otorgarDerrota();

    // Mostrar overlay
    setTimeout(() => mostrarOverlayFin(yoGane, ganador), 300);
}

function mostrarOverlayFin(yoGane, ganador) {
    const iconoEl = document.getElementById('vbFinIcono');
    const tituloEl = document.getElementById('vbFinTitulo');
    const subEl = document.getElementById('vbFinSub');
    const tiempoEl = document.getElementById('vbFinTiempo');
    const bonusEl = document.getElementById('vbFinBonus');
    const totalEl = document.getElementById('vbFinTotal');
    const btnReintentarTxt = document.getElementById('vbBtnReintentarTxt');

    iconoEl.className = 'vb-overlay-icono ' + (yoGane ? 'vb-overlay-icono-ganaste' : 'vb-overlay-icono-perdiste');
    iconoEl.innerHTML = yoGane
        ? '<i data-lucide="trophy"></i>'
        : '<i data-lucide="frown"></i>';

    tituloEl.textContent = yoGane ? '¡Ganaste!' : '¡Perdiste!';
    subEl.textContent = modo === 'cpu'
        ? (yoGane ? 'Le ganaste a la CPU.' : 'La CPU te ganó esta vez.')
        : (yoGane ? 'Buena partida.' : 'Revancha cuando quieras.');

    tiempoEl.textContent = Math.floor(sobrevividos) + 's';
    bonusEl.textContent  = '+' + (aguantesCobrados * AGUANTE_MONEDAS);
    totalEl.textContent  = '+' + monedasPartida;

    // En P2P permitir reintentar; en CPU también
    btnReintentarTxt.textContent = modo === 'p2p' ? 'Revancha' : 'Jugar otra vez';

    document.getElementById('vbOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  HUD
// ============================================================
function actualizarHUD() {
    const elMonedas = document.getElementById('vbMonedas');
    if (elMonedas) elMonedas.textContent = '+' + monedasPartida;
}

function actualizarHUDTimer() {
    const elTimer = document.getElementById('vbTimer');
    if (!elTimer) return;
    const dentroBloque = Math.floor(sobrevividos % AGUANTE_SEG);
    elTimer.textContent = dentroBloque;
}

function mostrarHUD(mostrar) {
    const hud = document.getElementById('vbHud');
    if (hud) hud.hidden = !mostrar;
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (estado !== 'jugando' && estado !== 'countdown') return;

    if (!ultimoFrameMs) ultimoFrameMs = now;
    const dtMs = Math.min(now - ultimoFrameMs, 50);
    ultimoFrameMs = now;
    const dt = dtMs / 1000;

    if (estado === 'countdown') {
        preGameTimer -= dt;
        if (preGameTimer <= 0) {
            estado = 'jugando';
            ultimoFrameMs = 0;
        }
        dibujar();
        rafId = requestAnimationFrame(loop);
        return;
    }

    // Estado jugando
    if (esHost || modo === 'cpu') {
        actualizar(dt);
    } else {
        // Guest: solo actualiza su paleta local, la bola viene por red
        actualizarPaletaJugador();
        // Suavizado de la bola hacia el estado remoto
        bola.x += (bolaRedX - bola.x) * Math.min(1, dt * 20);
        bola.y += (bolaRedY - bola.y) * Math.min(1, dt * 20);
        bola.vx = bolaRedVx;
        bola.vy = bolaRedVy;
        bola.spin = bolaRedSpin;
        bola.trail.push({ x: bola.x, y: bola.y });
        if (bola.trail.length > TRAIL_MAX) bola.trail.shift();

        // Paleta del rival (host)
        const diff = rivalPaddleX - p2.x;
        p2.x += diff * Math.min(1, dt * 25);
    }

    // Envío de red
    if (modo === 'p2p' && conn?.open) {
        const ahora = performance.now();
        // Guest → host: mi paleta
        if (!esHost && ahora - ultimoEnvioPaddle > 1000 / NET_PADDLE_HZ) {
            ultimoEnvioPaddle = ahora;
            try { conn.send({ t: 'paddle', x: p1.x }); } catch (e) {}
        }
        // Host → guest: estado completo
        if (esHost && ahora - ultimoEnvioEstado > 1000 / NET_STATE_HZ) {
            ultimoEnvioEstado = ahora;
            try {
                conn.send({
                    t: 'state',
                    ball: { x: bola.x, y: bola.y, vx: bola.vx, vy: bola.vy, spin: bola.spin },
                    hostPaddle: p1.x
                });
            } catch (e) {}
        }
    }

    dibujar();
    rafId = requestAnimationFrame(loop);
}

// Variables para guest
let bolaRedX = CW / 2, bolaRedY = CH / 2, bolaRedVx = 0, bolaRedVy = -BALL_SPEED_INICIAL, bolaRedSpin = 0;

// ============================================================
//  P2P
// ============================================================
function iniciarP2P() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const codigo = document.getElementById('vbInputSala').value.trim().toUpperCase();
    if (!codigo) { mostrarInfo('Escribe un código de sala.', 'error'); return; }

    codigoSala = codigo;
    modo = 'p2p';
    esHost = document.querySelector('input[name="vbRol"]:checked').value === 'host';

    mostrarInfo(esHost ? 'Creando sala…' : 'Conectando…', 'info');
    estado = 'esperando';
    ocultarMenu();
    mostrarHUD(true);
    resetPartida();
    dibujar();
    rafId = requestAnimationFrame(loop);

    const miNombre = cuenta?.nombre || 'Yo';
    const miFotoBase64 = awaitObtenerMiFotoBase64();

    try {
        peer = esHost ? new Peer(codigo, { debug: 1 }) : new Peer(undefined, { debug: 1 });
    } catch (e) {
        mostrarInfo('Error al iniciar Peer: ' + e.message, 'error');
        volverAlMenu();
        return;
    }

    peer.on('open', (id) => {
        if (esHost) {
            mostrarInfo('Sala lista. Esperando invitado…', 'info');
        } else {
            mostrarInfo('Conectando a ' + codigo + '…', 'info');
            const c = peer.connect(codigo, { reliable: true });
            conectarData(c);
        }
    });

    peer.on('connection', (c) => {
        if (!esHost) return;
        if (conn) { try { c.close(); } catch (e) {} return; }
        conectarData(c);
    });

    peer.on('error', (err) => {
        let msg = err.message || err.type || 'Error de red.';
        if (err.type === 'unavailable-id') msg = 'Ese código ya está en uso. Prueba otro.';
        if (err.type === 'peer-unavailable') msg = 'No se encontró la sala. Revisa el código.';
        mostrarInfo(msg, 'error');
        volverAlMenu();
    });

    async function conectarData(c) {
        conn = c;
        conn.on('open', async () => {
            // Handshake: intercambiar nombre y foto
            const miFoto = await miFotoBase64;
            try { conn.send({ t: 'hello', nombre: miNombre, foto: miFoto }); } catch (e) {}
            mostrarInfo('Conectado. Empezando…', 'success');
        });
        conn.on('data', (data) => manejarData(data));
        conn.on('close', () => {
            if (estado === 'jugando' || estado === 'countdown' || estado === 'esperando') {
                toast('El rival se desconectó', 'error');
                volverAlMenu();
            }
        });
    }
}

async function awaitObtenerMiFotoBase64() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    if (!cuenta) return null;
    try {
        const bd = BD();
        if (!bd) return null;
        const cuentas = await bd.leerArchivoFresh(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return null;
        const yo = cuentas.find(c => c.codigo === cuenta.codigo);
        return yo?.foto || null;
    } catch (e) { return null; }
}

function manejarData(data) {
    if (!data || typeof data !== 'object') return;

    if (data.t === 'hello') {
        rivalNombre = data.nombre || 'Rival';
        rivalInicial = (rivalNombre || '?').charAt(0).toUpperCase();
        cargarFotoRival(data.foto);
        // Arrancar partida cuando ambos están listos
        if (estado === 'esperando') {
            iniciarCountdown();
        }
        return;
    }

    if (data.t === 'paddle') {
        rivalPaddleX = data.x;
        return;
    }

    if (data.t === 'state' && !esHost) {
        bolaRedX = data.ball.x;
        bolaRedY = data.ball.y;
        bolaRedVx = data.ball.vx;
        bolaRedVy = data.ball.vy;
        bolaRedSpin = data.ball.spin;
        rivalPaddleX = data.hostPaddle;
        return;
    }

    if (data.t === 'aguantar') {
        // Guest recibe aviso del host: cobrar +5
        monedasPartida += AGUANTE_MONEDAS;
        aguantesCobrados++;
        popups.push({
            texto: '+' + AGUANTE_MONEDAS,
            x: CW / 2,
            y: CH / 2 - 60,
            life: 1.5,
            lifeMax: 1.5
        });
        actualizarHUD();
        const api = API();
        if (api?.canjear) api.canjear('timer', APP_ID, 'Voleboy: aguante 30s', AGUANTE_MONEDAS).catch(() => {});
        return;
    }

    if (data.t === 'fin') {
        // El guest recibe el resultado del host
        if (partidaTerminada) return;
        partidaTerminada = true;
        estado = 'fin';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        const yoGane = data.ganador === 'guest';   // Desde la perspectiva del guest
        if (yoGane) otorgarVictoria();
        else        otorgarDerrota();
        setTimeout(() => mostrarOverlayFin(yoGane, data.ganador), 300);
        return;
    }
}

function iniciarCountdown() {
    estado = 'countdown';
    preGameTimer = COUNTDOWN_SEG;
    resetPartida();
    ultimoFrameMs = 0;
}

// ============================================================
//  MODOS
// ============================================================
function iniciarCpu() {
    modo = 'cpu';
    estado = 'countdown';
    preGameTimer = COUNTDOWN_SEG;
    rivalNombre = 'CPU';
    rivalInicial = 'C';
    rivalFotoImg = null;
    ocultarMenu();
    mostrarHUD(true);
    resetPartida();
    partidaTerminada = false;
    ultimoFrameMs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

function volverAlMenu() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    estado = 'menu';
    modo = 'cpu';
    esHost = false;
    partidaTerminada = false;
    mostrarMenu();
    mostrarHUD(false);
    document.getElementById('vbOverlayFin').hidden = true;
    resetPartida();
    dibujar();
}

// ============================================================
//  UI
// ============================================================
function mostrarMenu() {
    const m = document.getElementById('vbMenu');
    if (m) m.hidden = false;
}
function ocultarMenu() {
    const m = document.getElementById('vbMenu');
    if (m) m.hidden = true;
}
function mostrarInfo(texto, tipo) {
    const el = document.getElementById('vbInfo');
    if (!el) return;
    el.textContent = texto;
    el.className = 'vb-info ' + (tipo || '');
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const badge = document.getElementById('vbUserBadge');
    if (badge) {
        badge.textContent = cuenta
            ? `@${cuenta.codigo} · ${cuenta.nombre}`
            : '—';
    }

    // Código de sala por defecto: el código del usuario
    const inputSala = document.getElementById('vbInputSala');
    if (inputSala && cuenta?.codigo) inputSala.value = cuenta.codigo;

    await cargarMiFoto();

    configurarCanvas();
    setupInput();
    dibujar();

    document.getElementById('vbBtnCpu')?.addEventListener('click', iniciarCpu);
    document.getElementById('vbBtnP2P')?.addEventListener('click', iniciarP2P);
    document.getElementById('vbBtnMenu')?.addEventListener('click', volverAlMenu);
    document.getElementById('vbBtnReintentar')?.addEventListener('click', () => {
        document.getElementById('vbOverlayFin').hidden = true;
        partidaTerminada = false;
        if (modo === 'p2p') {
            // Revancha: reusar la conexión
            iniciarCountdown();
            if (rafId) cancelAnimationFrame(rafId);
            ultimoFrameMs = 0;
            rafId = requestAnimationFrame(loop);
        } else {
            iniciarCpu();
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
window.addEventListener('pagehide', () => {
    if (conn) { try { conn.close(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
});
