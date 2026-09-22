// ============================================================
//  Voleboy — Pong plataformero con red central
//  ------------------------------------------------------------
//  Vista lateral. Jugador izquierda, rival derecha. Red vertical
//  al medio. Pelota con gravedad, spin y dirección garantizada:
//  al ser golpeada, SIEMPRE cruza la red hacia el otro lado.
//  Se pierde si la pelota toca el suelo de tu lado.
//
//  Modos: CPU · P2P (PeerJS, host autoritativo)
//
//  Economía:
//    P2P: ganar +20 · perder +5 · aguantar 30s +5 (repetible)
//    CPU: ganar +25 · perder 0
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID       = 'voleboy';
const RUTA_CUENTAS = 'cuenta.json';

// ---- Canvas lógico ----
const CW = 720;
const CH = 420;

// ---- Suelo y red ----
const SUELO_Y  = 360;
const RED_X    = CW / 2;
const RED_W    = 6;
const RED_TOPE = 180;

// ---- Jugador (paleta con foto) ----
const PAL_W       = 74;
const PAL_H       = 14;
const FOTO_R      = 26;
const FOTO_OFFSET = 30;
const JUGADOR_X_MIN = 30;
const JUGADOR_X_MAX = RED_X - 40;
const RIVAL_X_MIN   = RED_X + 40;
const RIVAL_X_MAX   = CW - 30;

// ---- Pelota ----
const BALL_R        = 13;
const GRAVEDAD      = 950;
const SPIN_FUERZA   = 200;
const SPIN_DAMPING  = 0.994;
const SPIN_MAX      = 1.0;
const VEL_MAX_X     = 620;
const VEL_MAX_Y     = 900;
const TRAIL_MAX     = 12;

// Velocidad base tras un golpe de paleta (px/s)
const VEL_GOLPE_BASE   = 240;
const VEL_GOLPE_OFFSET = 180;   // extra según posición sobre la paleta
const VEL_Y_MIN_GOLPE  = 420;   // mínimo de velocidad vertical al golpear

// ---- Countdown ----
const COUNTDOWN_SEG = 3;

// ---- Aguante ----
const AGUANTE_SEG     = 30;
const AGUANTE_MONEDAS = 5;

// ---- Economía ----
const MONEDAS_GANAR_P2P  = 20;
const MONEDAS_PERDER_P2P = 5;
const MONEDAS_GANAR_CPU  = 25;

// ---- Red (Hz) ----
const NET_PADDLE_HZ = 30;
const NET_STATE_HZ  = 20;

// ============================================================
//  ESTADO
// ============================================================
let canvas, ctx;
let estado = 'menu';   // menu | esperando | countdown | jugando | fin
let modo = 'cpu';

let rafId = null;
let ultimoFrameMs = 0;
let preGameTimer = 0;
let partidaTerminada = false;

const pelota = {
    x: CW / 2, y: 140,
    vx: 180, vy: 0,
    spin: 0,
    trail: []
};

const jugador = { x: (JUGADOR_X_MIN + JUGADOR_X_MAX) / 2 };
const rival   = { x: (RIVAL_X_MIN + RIVAL_X_MAX) / 2 };

let sobrevividos = 0;
let aguantesCobrados = 0;
let monedasPartida = 0;
let ultimoBloqueAguante = 0;

let miFotoImg = null;
let miInicial = '?';
let rivalFotoImg = null;
let rivalInicial = 'C';
let rivalNombre = 'CPU';

let popups = [];
let particulas = [];
let toastTimer = null;

let mouseX = null;
let touchX = null;

// Red
let peer = null;
let conn = null;
let esHost = false;
let codigoSala = '';
let rivalPaddleX = RIVAL_X_MIN;
let ultimoEnvioPaddle = 0;
let ultimoEnvioEstado = 0;
let ballRedX = CW / 2, ballRedY = 140, ballRedVx = 180, ballRedVy = 0, ballRedSpin = 0;

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
        if (yo?.foto) {
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

// ============================================================
//  DIBUJADO
// ============================================================
function dibujar() {
    if (!ctx) return;

    const grd = ctx.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, cv('--violet-100', '#EDE9FE'));
    grd.addColorStop(0.65, cv('--violet-50', '#F5F3FF'));
    grd.addColorStop(1, cv('--white', '#FFFFFF'));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CW, CH);

    dibujarNubes();
    dibujarRed();
    dibujarSuelo();
    dibujarTrail();
    dibujarPelota();
    dibujarJugador(jugador.x, 'jugador');
    dibujarJugador(rival.x,   'rival');
    dibujarEfectos();

    if (estado === 'countdown') {
        const n = Math.ceil(preGameTimer);
        const txt = n > 0 ? String(n) : '¡YA!';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = cv('--violet-600', '#7C3AED');
        ctx.font = 'bold 130px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, CW / 2, CH / 2);
    }

    if (estado === 'esperando') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = cv('--white', '#FFFFFF');
        ctx.font = 'bold 26px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Esperando rival…', CW / 2, CH / 2 - 20);
        ctx.font = '600 16px Nunito, sans-serif';
        ctx.fillStyle = cv('--violet-300', '#C4B5FD');
        ctx.fillText('Sala: ' + codigoSala, CW / 2, CH / 2 + 22);
    }
}

function dibujarNubes() {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    const base = pelota.x * 0.03;
    for (let i = 0; i < 4; i++) {
        const x = ((i * 220) - base) % (CW + 200) - 100;
        const y = 40 + i * 18;
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.arc(x + 26, y + 3, 18, 0, Math.PI * 2);
        ctx.arc(x + 50, y, 22, 0, Math.PI * 2);
        ctx.fill();
    }
}

function dibujarRed() {
    const colorRed = cv('--gray-700', '#3F3F46');
    const colorTop = cv('--violet-500', '#8B5CF6');

    ctx.fillStyle = colorRed;
    ctx.fillRect(RED_X - RED_W / 2, RED_TOPE, RED_W, SUELO_Y - RED_TOPE);

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let y = RED_TOPE + 8; y < SUELO_Y; y += 12) {
        ctx.beginPath();
        ctx.moveTo(RED_X - RED_W / 2, y);
        ctx.lineTo(RED_X + RED_W / 2, y);
        ctx.stroke();
    }

    ctx.fillStyle = colorTop;
    roundRect(ctx, RED_X - RED_W / 2 - 3, RED_TOPE - 6, RED_W + 6, 8, 3);
    ctx.fill();
}

function dibujarSuelo() {
    const cSuelo = cv('--violet-600', '#7C3AED');
    const cTapa  = cv('--violet-400', '#A78BFA');
    const cBorde = cv('--violet-700', '#6D28D9');

    // Suelo continuo
    ctx.fillStyle = cSuelo;
    roundRect(ctx, 0, SUELO_Y, CW, CH - SUELO_Y, 10);
    ctx.fill();

    // Tapa superior clara
    ctx.fillStyle = cTapa;
    roundRect(ctx, 0, SUELO_Y, CW, 8, 8);
    ctx.fill();

    // Borde
    ctx.strokeStyle = cBorde;
    ctx.lineWidth = 2;
    roundRect(ctx, 0, SUELO_Y, CW, CH - SUELO_Y, 10);
    ctx.stroke();
}

function dibujarTrail() {
    for (let i = 0; i < pelota.trail.length; i++) {
        const t = pelota.trail[i];
        const a = ((i + 1) / pelota.trail.length) * 0.4;
        const r = BALL_R * (0.35 + (i / pelota.trail.length) * 0.65);
        ctx.fillStyle = cv('--violet-400', '#A78BFA');
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function dibujarPelota() {
    ctx.save();
    ctx.shadowColor = cv('--violet-500', '#8B5CF6');
    ctx.shadowBlur = 20;
    ctx.fillStyle = cv('--violet-500', '#8B5CF6');
    ctx.beginPath();
    ctx.arc(pelota.x, pelota.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(pelota.x - BALL_R * 0.32, pelota.y - BALL_R * 0.32, BALL_R * 0.42, 0, Math.PI * 2);
    ctx.fill();
}

function dibujarJugador(centroX, quien) {
    const esJugador = quien === 'jugador';
    const colorBase = esJugador ? cv('--violet-500', '#8B5CF6') : cv('--violet-700', '#6D28D9');
    const colorBorde = esJugador ? cv('--violet-700', '#6D28D9') : cv('--violet-900', '#4C1D95');
    const foto = esJugador ? miFotoImg : rivalFotoImg;
    const inicial = esJugador ? miInicial : rivalInicial;

    const palX = centroX - PAL_W / 2;
    const palY = SUELO_Y - PAL_H;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = colorBase;
    roundRect(ctx, palX, palY, PAL_W, PAL_H, 6);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = colorBorde;
    ctx.lineWidth = 2;
    roundRect(ctx, palX, palY, PAL_W, PAL_H, 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    roundRect(ctx, palX + 2, palY + 2, PAL_W - 4, 3, 2);
    ctx.fill();

    const fotoCx = centroX;
    const fotoCy = palY - FOTO_OFFSET + FOTO_R;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.arc(fotoCx, fotoCy, FOTO_R, 0, Math.PI * 2);
    ctx.fillStyle = cv('--white', '#FFFFFF');
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(fotoCx, fotoCy, FOTO_R - 2, 0, Math.PI * 2);
    ctx.clip();

    if (foto && foto.complete && foto.naturalWidth > 0) {
        const fw = foto.naturalWidth;
        const fh = foto.naturalHeight;
        const size = (FOTO_R - 2) * 2;
        const scale = Math.max(size / fw, size / fh);
        const w = fw * scale;
        const h = fh * scale;
        ctx.drawImage(foto, fotoCx - w / 2, fotoCy - h / 2, w, h);
    } else {
        ctx.fillStyle = colorBase;
        ctx.fillRect(fotoCx - FOTO_R, fotoCy - FOTO_R, FOTO_R * 2, FOTO_R * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 26px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicial, fotoCx, fotoCy + 1);
    }
    ctx.restore();

    ctx.strokeStyle = colorBorde;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(fotoCx, fotoCy, FOTO_R - 1, 0, Math.PI * 2);
    ctx.stroke();
}

function dibujarEfectos() {
    for (const p of particulas) {
        const a = Math.max(0, p.life / p.lifeMax);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of popups) {
        const a = Math.min(1, p.life / p.lifeMax);
        ctx.globalAlpha = a;
        ctx.font = 'bold 30px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 4;
        ctx.strokeText(p.texto, p.x, p.y);
        ctx.fillStyle = cv('--violet-500', '#8B5CF6');
        ctx.fillText(p.texto, p.x, p.y);
    }
    ctx.globalAlpha = 1;
}

// ============================================================
//  INPUT
// ============================================================
function setupInput() {
    if (!canvas) return;

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * CW;
        if (e.pointerType === 'touch') touchX = x;
        else mouseX = x;
    });

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width * CW;
        if (e.pointerType === 'touch') touchX = x;
        else mouseX = x;
    });

    canvas.addEventListener('pointerleave', () => { mouseX = null; touchX = null; });
    canvas.addEventListener('pointerup', () => { touchX = null; });

    document.addEventListener('keydown', (e) => {
        if (estado !== 'jugando') return;
        const paso = 40;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            mouseX = (mouseX ?? jugador.x) - paso;
            e.preventDefault();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            mouseX = (mouseX ?? jugador.x) + paso;
            e.preventDefault();
        }
    });
}

function actualizarJugador() {
    let objetivo = jugador.x;
    if (touchX !== null) objetivo = touchX;
    else if (mouseX !== null) objetivo = mouseX;
    // Clamp al lado izquierdo (hasta la red)
    jugador.x = Math.max(JUGADOR_X_MIN, Math.min(JUGADOR_X_MAX, objetivo));
}

// ============================================================
//  CPU
// ============================================================
function actualizarCpu(dt) {
    let objetivoX = rival.x;

    if (pelota.x > RED_X) {
        // Pelota en su lado → perseguir
        objetivoX = pelota.x;
    } else {
        // Pelota en lado jugador → volver al centro-derecha
        objetivoX = (RIVAL_X_MIN + RIVAL_X_MAX) / 2;
    }

    // Error humano
    objetivoX += (Math.random() - 0.5) * 55;

    const v = Math.min(560, 260 + Math.hypot(pelota.vx, pelota.vy) * 0.3);
    const diff = objetivoX - rival.x;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), v * dt);
    rival.x += move;

    rival.x = Math.max(RIVAL_X_MIN, Math.min(RIVAL_X_MAX, rival.x));
}

// ============================================================
//  FÍSICA
// ============================================================
function resetPelota() {
    pelota.x = CW / 2;
    pelota.y = 140;
    // Arranca yendo al lado random
    const dir = Math.random() < 0.5 ? -1 : 1;
    pelota.vx = dir * 220;
    pelota.vy = -60;
    pelota.spin = 0;
    pelota.trail = [];
}

function resetPartida() {
    resetPelota();
    jugador.x = (JUGADOR_X_MIN + JUGADOR_X_MAX) / 2;
    rival.x   = (RIVAL_X_MIN + RIVAL_X_MAX) / 2;
    sobrevividos = 0;
    aguantesCobrados = 0;
    monedasPartida = 0;
    ultimoBloqueAguante = 0;
    popups = [];
    particulas = [];
    partidaTerminada = false;
    actualizarHUD();
}

function actualizar(dt) {
    actualizarJugador();

    if (modo === 'cpu') {
        actualizarCpu(dt);
    } else if (modo === 'p2p') {
        const diff = rivalPaddleX - rival.x;
        rival.x += diff * Math.min(1, dt * 20);
    }

    // ---- Física ----
    pelota.vy += GRAVEDAD * dt;
    pelota.vx += pelota.spin * SPIN_FUERZA * dt;
    pelota.vx *= Math.pow(SPIN_DAMPING, dt * 60);

    pelota.vx = Math.max(-VEL_MAX_X, Math.min(VEL_MAX_X, pelota.vx));
    pelota.vy = Math.max(-VEL_MAX_Y, Math.min(VEL_MAX_Y, pelota.vy));

    pelota.x += pelota.vx * dt;
    pelota.y += pelota.vy * dt;

    pelota.trail.push({ x: pelota.x, y: pelota.y });
    if (pelota.trail.length > TRAIL_MAX) pelota.trail.shift();

    // ---- Paredes laterales ----
    // Rebotan pero SIEMPRE mantienen una dirección que cruza la red
    if (pelota.x - BALL_R < 0) {
        pelota.x = BALL_R;
        // Si va a la izquierda, la empujamos hacia la derecha (al rival)
        pelota.vx = Math.abs(pelota.vx) * 0.85;
        if (pelota.vx < 120) pelota.vx = 200;
        spawnParticulas(pelota.x, pelota.y, 6);
    } else if (pelota.x + BALL_R > CW) {
        pelota.x = CW - BALL_R;
        // Si va a la derecha, la empujamos hacia la izquierda (al jugador)
        pelota.vx = -Math.abs(pelota.vx) * 0.85;
        if (Math.abs(pelota.vx) < 120) pelota.vx = -200;
        spawnParticulas(pelota.x, pelota.y, 6);
    }

    // ---- Techo ----
    if (pelota.y - BALL_R < 0) {
        pelota.y = BALL_R;
        pelota.vy = Math.abs(pelota.vy) * 0.85;
    }

    // ---- Colisión con paletas ----
    if (colisionPelotaPaleta(pelota, jugador.x, 'izq')) {
        golpePaleta('izq');
    }
    if (colisionPelotaPaleta(pelota, rival.x, 'der')) {
        golpePaleta('der');
    }

    // ---- Fin por caída al suelo ----
    if (pelota.y + BALL_R >= SUELO_Y) {
        if (pelota.x < RED_X) {
            // Cayó en el lado izquierdo → ganó el rival (derecho)
            if (esHost || modo === 'cpu') terminarPartida('rival');
        } else {
            // Cayó en el lado derecho → ganó el jugador (izquierdo)
            if (esHost || modo === 'cpu') terminarPartida('jugador');
        }
    }

    // ---- Aguante P2P ----
    if (modo === 'p2p' && estado === 'jugando') {
        sobrevividos += dt;
        const bloque = Math.floor(sobrevividos / AGUANTE_SEG);
        if (bloque > ultimoBloqueAguante) {
            ultimoBloqueAguante = bloque;
            otorgarAguante();
        }
        actualizarHUDTimer();
    }

    // ---- Efectos ----
    for (const p of particulas) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt;
        p.life -= dt;
    }
    particulas = particulas.filter(p => p.life > 0);

    for (const p of popups) {
        p.y -= 60 * dt;
        p.life -= dt;
    }
    popups = popups.filter(p => p.life > 0);
}

function colisionPelotaPaleta(b, centroX, lado) {
    const x1 = centroX - PAL_W / 2;
    const x2 = centroX + PAL_W / 2;
    const y1 = SUELO_Y - PAL_H - FOTO_OFFSET * 2;
    const y2 = SUELO_Y;

    // Solo cuando la pelota está cayendo
    if (b.vy < 0) return false;

    const closestX = Math.max(x1, Math.min(b.x, x2));
    const closestY = Math.max(y1, Math.min(b.y, y2));
    const dx = b.x - closestX;
    const dy = b.y - closestY;
    return dx * dx + dy * dy < BALL_R * BALL_R;
}

/**
 * Golpe de paleta:
 *  · La pelota SIEMPRE cruza la red hacia el lado contrario.
 *  · El offset sobre la paleta ajusta el ángulo (más cerca del borde,
 *    más lateral). Eso hace que aterrice en distintos lugares.
 *  · Velocidad vertical forzada hacia arriba.
 */
function golpePaleta(lado) {
    const centroPaleta = lado === 'izq' ? jugador.x : rival.x;
    const offset = (pelota.x - centroPaleta) / (PAL_W / 2);
    const clampedOffset = Math.max(-1, Math.min(1, offset));

    // Dirección GARANTIZADA al lado contrario
    const direccion = lado === 'izq' ? 1 : -1;
    const velBase = VEL_GOLPE_BASE + Math.abs(clampedOffset) * VEL_GOLPE_OFFSET;

    pelota.vx = direccion * velBase;
    pelota.vy = -Math.max(VEL_Y_MIN_GOLPE, Math.abs(pelota.vy) * 1.05);

    // Ajuste de posición para que quede sobre la paleta
    pelota.y = SUELO_Y - PAL_H - FOTO_OFFSET * 2 - BALL_R - 2;

    // El spin afecta la trayectoria para que la caída sea variada
    pelota.spin = clampedOffset * 0.6;

    // Partículas
    spawnParticulas(pelota.x, pelota.y + BALL_R, 8);
}

function spawnParticulas(x, y, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        const ang = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 140;
        particulas.push({
            x, y,
            vx: Math.cos(ang) * v,
            vy: Math.sin(ang) * v - 40,
            size: 2 + Math.random() * 2.5,
            life: 0.5,
            lifeMax: 0.5,
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

    popups.push({
        texto: '+' + AGUANTE_MONEDAS,
        x: CW / 2,
        y: CH / 2 - 40,
        life: 1.6,
        lifeMax: 1.6
    });

    actualizarHUD();

    const api = API();
    if (api?.canjear) {
        try { await api.canjear('timer', APP_ID, 'Voleboy: aguante 30s', AGUANTE_MONEDAS); }
        catch (e) {}
    }

    if (modo === 'p2p' && esHost && conn?.open) {
        try { conn.send({ t: 'aguantar' }); } catch (e) {}
    }
}

async function otorgarVictoria() {
    const monto = modo === 'cpu' ? MONEDAS_GANAR_CPU : MONEDAS_GANAR_P2P;
    monedasPartida += monto;
    actualizarHUD();
    const api = API();
    if (api?.canjear) {
        try { await api.canjear('trophy', APP_ID, 'Voleboy: victoria', monto); }
        catch (e) {}
    }
}

async function otorgarDerrota() {
    if (modo === 'cpu') return;
    monedasPartida += MONEDAS_PERDER_P2P;
    actualizarHUD();
    const api = API();
    if (api?.canjear) {
        try { await api.canjear('heart-handshake', APP_ID, 'Voleboy: consuelo', MONEDAS_PERDER_P2P); }
        catch (e) {}
    }
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function terminarPartida(ganador) {
    if (partidaTerminada) return;
    partidaTerminada = true;
    estado = 'fin';

    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const yoGane = ganador === 'jugador';

    if (modo === 'p2p' && esHost && conn?.open) {
        try { conn.send({ t: 'fin', ganador }); } catch (e) {}
    }

    if (yoGane) otorgarVictoria();
    else        otorgarDerrota();

    setTimeout(() => mostrarOverlayFin(yoGane), 350);
}

function mostrarOverlayFin(yoGane) {
    const iconoEl = document.getElementById('vbFinIcono');
    const tituloEl = document.getElementById('vbFinTitulo');
    const subEl = document.getElementById('vbFinSub');
    const filaTiempo = document.getElementById('vbFinFilaTiempo');
    const filaBonus = document.getElementById('vbFinFilaBonus');

    iconoEl.className = 'vb-overlay-icono ' + (yoGane ? 'vb-overlay-icono-ganaste' : 'vb-overlay-icono-perdiste');
    iconoEl.innerHTML = yoGane ? '<i data-lucide="trophy"></i>' : '<i data-lucide="frown"></i>';

    tituloEl.textContent = yoGane ? '¡Ganaste!' : '¡Perdiste!';
    subEl.textContent = modo === 'cpu'
        ? (yoGane ? 'Le ganaste a la CPU.' : 'La CPU te ganó esta vez.')
        : (yoGane ? 'Buena partida.' : 'Revancha cuando quieras.');

    // En CPU no mostramos tiempo ni bonus (no aplican)
    if (modo === 'cpu') {
        filaTiempo.hidden = true;
        filaBonus.hidden = true;
    } else {
        filaTiempo.hidden = false;
        filaBonus.hidden = false;
        document.getElementById('vbFinTiempo').textContent = Math.floor(sobrevividos) + 's';
        document.getElementById('vbFinBonus').textContent = '+' + (aguantesCobrados * AGUANTE_MONEDAS);
    }

    document.getElementById('vbFinTotal').textContent = '+' + monedasPartida;
    document.getElementById('vbBtnReintentarTxt').textContent =
        modo === 'p2p' ? 'Revancha' : 'Jugar otra vez';

    document.getElementById('vbOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  HUD
// ============================================================
function actualizarHUD() {
    const elM = document.getElementById('vbMonedas');
    if (elM) elM.textContent = '+' + monedasPartida;
}

function actualizarHUDTimer() {
    const el = document.getElementById('vbTimer');
    if (!el) return;
    el.textContent = Math.floor(sobrevividos % AGUANTE_SEG);
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

    if (esHost || modo === 'cpu') {
        actualizar(dt);
    } else {
        // Guest: solo su paleta; la pelota viene por red
        actualizarJugador();
        pelota.x += (ballRedX - pelota.x) * Math.min(1, dt * 18);
        pelota.y += (ballRedY - pelota.y) * Math.min(1, dt * 18);
        pelota.vx = ballRedVx;
        pelota.vy = ballRedVy;
        pelota.spin = ballRedSpin;
        pelota.trail.push({ x: pelota.x, y: pelota.y });
        if (pelota.trail.length > TRAIL_MAX) pelota.trail.shift();

        const diffR = rivalPaddleX - rival.x;
        rival.x += diffR * Math.min(1, dt * 20);
    }

    if (modo === 'p2p' && conn?.open) {
        const ahora = performance.now();
        if (!esHost && ahora - ultimoEnvioPaddle > 1000 / NET_PADDLE_HZ) {
            ultimoEnvioPaddle = ahora;
            try { conn.send({ t: 'paddle', x: jugador.x }); } catch (e) {}
        }
        if (esHost && ahora - ultimoEnvioEstado > 1000 / NET_STATE_HZ) {
            ultimoEnvioEstado = ahora;
            try {
                conn.send({
                    t: 'state',
                    ball: { x: pelota.x, y: pelota.y, vx: pelota.vx, vy: pelota.vy, spin: pelota.spin },
                    hostPaddle: jugador.x
                });
            } catch (e) {}
        }
    }

    dibujar();
    rafId = requestAnimationFrame(loop);
}

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
    const promesaFoto = obtenerMiFotoBase64();

    try {
        peer = esHost ? new Peer(codigo, { debug: 1 }) : new Peer(undefined, { debug: 1 });
    } catch (e) {
        mostrarInfo('Error al iniciar Peer: ' + e.message, 'error');
        volverAlMenu();
        return;
    }

    peer.on('open', () => {
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
        if (err.type === 'unavailable-id')   msg = 'Ese código ya está en uso. Prueba otro.';
        if (err.type === 'peer-unavailable') msg = 'No se encontró la sala. Revisa el código.';
        mostrarInfo(msg, 'error');
        volverAlMenu();
    });

    async function conectarData(c) {
        conn = c;
        conn.on('open', async () => {
            const foto = await promesaFoto;
            try { conn.send({ t: 'hello', nombre: miNombre, foto }); } catch (e) {}
            mostrarInfo('Conectado. Empezando…', 'success');
        });
        conn.on('data', (d) => manejarData(d));
        conn.on('close', () => {
            if (['jugando','countdown','esperando'].includes(estado)) {
                toast('El rival se desconectó', 'error');
                volverAlMenu();
            }
        });
    }
}

async function obtenerMiFotoBase64() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    if (!cuenta) return null;
    try {
        const bd = BD();
        if (!bd) return null;
        const cuentas = await bd.leerArchivoFresh(RUTA_CUENTAS);
        if (!Array.isArray(cuentas)) return null;
        return cuentas.find(c => c.codigo === cuenta.codigo)?.foto || null;
    } catch (e) { return null; }
}

function manejarData(data) {
    if (!data || typeof data !== 'object') return;

    if (data.t === 'hello') {
        rivalNombre = data.nombre || 'Rival';
        rivalInicial = (rivalNombre || '?').charAt(0).toUpperCase();
        cargarFotoRival(data.foto);
        if (estado === 'esperando') iniciarCountdown();
        return;
    }

    if (data.t === 'paddle') {
        rivalPaddleX = data.x;
        return;
    }

    if (data.t === 'state' && !esHost) {
        ballRedX = data.ball.x;
        ballRedY = data.ball.y;
        ballRedVx = data.ball.vx;
        ballRedVy = data.ball.vy;
        ballRedSpin = data.ball.spin;
        rivalPaddleX = data.hostPaddle;
        return;
    }

    if (data.t === 'aguantar') {
        monedasPartida += AGUANTE_MONEDAS;
        aguantesCobrados++;
        popups.push({ texto: '+' + AGUANTE_MONEDAS, x: CW / 2, y: CH / 2 - 40, life: 1.6, lifeMax: 1.6 });
        actualizarHUD();
        const api = API();
        if (api?.canjear) api.canjear('timer', APP_ID, 'Voleboy: aguante 30s', AGUANTE_MONEDAS).catch(() => {});
        return;
    }

    if (data.t === 'fin') {
        if (partidaTerminada) return;
        partidaTerminada = true;
        estado = 'fin';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        const yoGane = data.ganador === 'guest';
        if (yoGane) otorgarVictoria();
        else        otorgarDerrota();
        setTimeout(() => mostrarOverlayFin(yoGane), 350);
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
    document.getElementById('vbOverlayMenu').hidden = false;
    document.getElementById('vbOverlayFin').hidden = true;
    mostrarHUD(false);
    resetPartida();
    dibujar();
}

// ============================================================
//  UI
// ============================================================
function ocultarMenu() {
    const m = document.getElementById('vbOverlayMenu');
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
    if (badge) badge.textContent = cuenta ? `@${cuenta.codigo} · ${cuenta.nombre}` : '—';

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
        if (modo === 'p2p') {
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
