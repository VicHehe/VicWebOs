// ============================================================
//  PiniPon — Pong clásico con multijugador PeerJS
//  (id y carpeta: voleboy)
//  ------------------------------------------------------------
//  · Dos paletas verticales. Primero en 5 puntos gana.
//  · Rebotes en techo y suelo. Pelota acelera en cada hit.
//  · Movimiento: mouse o dedo (eje Y). Flechas ↑↓ en PC.
//
//  Modos: CPU · P2P (host autoritativo)
//
//  Economía:
//    P2P: ganar +20 · perder +5
//    CPU: ganar +25 · perder 0
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID       = 'voleboy';
const RUTA_CUENTAS = 'cuenta.json';

// ---- Canvas lógico ----
const CW = 640;
const CH = 400;

// ---- Paletas ----
const PAL_W = 12;
const PAL_H = 80;
const PAL_MARGEN = 20;

// ---- Pelota ----
const BALL_R           = 8;
const BALL_SPEED_INIT  = 320;
const BALL_SPEED_INC   = 18;
const BALL_SPEED_MAX   = 800;
const BALL_ANGLE_MAX   = 0.85;

// ---- Score ----
const PUNTOS_PARA_GANAR = 5;
const PAUSA_TRAS_PUNTO  = 900;

// ---- Countdown ----
const COUNTDOWN_SEG = 3;

// ---- Economía ----
const MONEDAS_GANAR_CPU  = 45;   // antes 25
const MONEDAS_GANAR_P2P  = 60;   // antes 20
const MONEDAS_PERDER_P2P = 15;   // antes 5

// ---- Red ----
const NET_PADDLE_HZ = 30;
const NET_STATE_HZ  = 20;

// ============================================================
//  ESTADO
// ============================================================
let canvas, ctx;
let estado = 'menu';
let modo = 'cpu';

let rafId = null;
let ultimoFrameMs = 0;
let preGameTimer = 0;
let pausaTimer = 0;
let partidaTerminada = false;

const jugador = { y: CH / 2 };
const rival   = { y: CH / 2 };

// Estado interno de la CPU (para simular imperfección)
const cpu = {
    objetivoY: CH / 2,
    delayReaccion: 0,
    ultimaDireccion: 0,
    errorActual: 0
};

const pelota = {
    x: CW / 2, y: CH / 2,
    vx: 0, vy: 0,
    trail: []
};

let puntosYo = 0;
let puntosRival = 0;
let monedasPartida = 0;

let miFotoImg = null;
let miInicial = '?';
let rivalFotoImg = null;
let rivalInicial = 'C';
let rivalNombre = 'CPU';

let particulas = [];
let toastTimer = null;
let marcadorPop = null;

let mouseY = null;
let touchY = null;

// Red
let peer = null;
let conn = null;
let esHost = false;
let codigoSala = '';
let rivalPaddleY = CH / 2;
let ultimoEnvioPaddle = 0;
let ultimoEnvioEstado = 0;
let ballRedX = CW / 2, ballRedY = CH / 2, ballRedVx = 0, ballRedVy = 0;

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

    // Fondo
    const grd = ctx.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, cv('--violet-100', '#EDE9FE'));
    grd.addColorStop(0.7, cv('--violet-50', '#F5F3FF'));
    grd.addColorStop(1, cv('--white', '#FFFFFF'));
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, CW, CH);

    // Línea central dashed
    ctx.strokeStyle = cv('--violet-300', '#C4B5FD');
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(CW / 2, 12);
    ctx.lineTo(CW / 2, CH - 12);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Bordes superior e inferior
    ctx.strokeStyle = cv('--violet-200', '#DDD6FE');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 1);
    ctx.lineTo(CW, 1);
    ctx.moveTo(0, CH - 1);
    ctx.lineTo(CW, CH - 1);
    ctx.stroke();

    // Marcador grande en el canvas
    dibujarMarcadorGrande();

    dibujarPaleta(jugador.y, 'jugador');
    dibujarPaleta(rival.y, 'rival');
    dibujarTrail();
    dibujarPelota();
    dibujarParticulas();
    dibujarMarcadorPop();

    if (estado === 'countdown') {
        const n = Math.ceil(preGameTimer);
        const txt = n > 0 ? String(n) : '¡YA!';
        ctx.fillStyle = 'rgba(24,24,27,0.35)';
        ctx.fillRect(0, 0, CW, CH);
        ctx.fillStyle = cv('--violet-600', '#7C3AED');
        ctx.font = 'bold 130px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, CW / 2, CH / 2);
    }

    if (estado === 'esperando') {
        ctx.fillStyle = 'rgba(24,24,27,0.5)';
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

function dibujarMarcadorGrande() {
    if (estado === 'menu') return;
    ctx.font = 'bold 68px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = cv('--violet-600', '#7C3AED');
    ctx.fillText(String(puntosYo), CW / 2 - 80, 60);
    ctx.fillStyle = cv('--violet-800', '#5B21B6');
    ctx.fillText(String(puntosRival), CW / 2 + 80, 60);
    ctx.globalAlpha = 1;
}

function dibujarPaleta(centroY, quien) {
    const esJugador = quien === 'jugador';
    const colorBase  = esJugador ? cv('--violet-500', '#8B5CF6') : cv('--violet-700', '#6D28D9');
    const colorBorde = esJugador ? cv('--violet-700', '#6D28D9') : cv('--violet-900', '#4C1D95');

    const x = esJugador ? PAL_MARGEN : (CW - PAL_MARGEN - PAL_W);
    const y = centroY - PAL_H / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle = colorBase;
    roundRect(ctx, x, y, PAL_W, PAL_H, 6);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = colorBorde;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, PAL_W, PAL_H, 6);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    if (esJugador) {
        roundRect(ctx, x + 2, y + 2, 3, PAL_H - 4, 2);
    } else {
        roundRect(ctx, x + PAL_W - 5, y + 2, 3, PAL_H - 4, 2);
    }
    ctx.fill();
}

function dibujarTrail() {
    for (let i = 0; i < pelota.trail.length; i++) {
        const t = pelota.trail[i];
        const a = ((i + 1) / pelota.trail.length) * 0.35;
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
    if (estado === 'fin') return;

    ctx.save();
    ctx.shadowColor = cv('--violet-500', '#8B5CF6');
    ctx.shadowBlur = 18;
    ctx.fillStyle = cv('--violet-500', '#8B5CF6');
    ctx.beginPath();
    ctx.arc(pelota.x, pelota.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(pelota.x - BALL_R * 0.3, pelota.y - BALL_R * 0.3, BALL_R * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function dibujarParticulas() {
    for (const p of particulas) {
        const a = Math.max(0, p.life / p.lifeMax);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

function dibujarMarcadorPop() {
    if (!marcadorPop) return;
    const a = Math.min(1, marcadorPop.life / marcadorPop.lifeMax);
    ctx.globalAlpha = a;
    ctx.font = 'bold 72px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 6;
    ctx.strokeText(marcadorPop.texto, CW / 2, CH / 2);
    ctx.fillStyle = marcadorPop.color;
    ctx.fillText(marcadorPop.texto, CW / 2, CH / 2);
    ctx.globalAlpha = 1;
}

// ============================================================
//  INPUT
// ============================================================
function setupInput() {
    if (!canvas) return;

    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const y = (e.clientY - rect.top) / rect.height * CH;
        if (e.pointerType === 'touch') touchY = y;
        else mouseY = y;
    });

    canvas.addEventListener('pointerdown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const y = (e.clientY - rect.top) / rect.height * CH;
        if (e.pointerType === 'touch') touchY = y;
        else mouseY = y;
    });

    canvas.addEventListener('pointerleave', () => { mouseY = null; touchY = null; });
    canvas.addEventListener('pointerup', () => { touchY = null; });

    document.addEventListener('keydown', (e) => {
        if (estado !== 'jugando' && estado !== 'pausa') return;
        const paso = 40;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            mouseY = (mouseY ?? jugador.y) - paso;
            e.preventDefault();
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            mouseY = (mouseY ?? jugador.y) + paso;
            e.preventDefault();
        }
    });
}

function actualizarJugador() {
    let objetivo = jugador.y;
    if (touchY !== null) objetivo = touchY;
    else if (mouseY !== null) objetivo = mouseY;
    const minY = PAL_H / 2;
    const maxY = CH - PAL_H / 2;
    jugador.y = Math.max(minY, Math.min(maxY, objetivo));
}

// ============================================================
//  CPU — con delay de reacción, error y velocidad limitada
// ============================================================
function actualizarCpu(dt) {
    const minY = PAL_H / 2;
    const maxY = CH - PAL_H / 2;
    const palRivX = CW - PAL_MARGEN - PAL_W;

    // Detectar cambio de dirección de la pelota
    const dirActual = Math.sign(pelota.vx);
    if (dirActual !== cpu.ultimaDireccion) {
        cpu.ultimaDireccion = dirActual;
        cpu.delayReaccion = 0.15 + Math.random() * 0.15;   // 150-300ms
        cpu.errorActual = (Math.random() - 0.5) * 130;     // ±65px
    }

    // Si la pelota viene hacia la CPU
    if (pelota.vx > 0) {
        // Delay de reacción: la CPU se queda quieta mientras "piensa"
        if (cpu.delayReaccion > 0) {
            cpu.delayReaccion -= dt;
            return;
        }

        // Predicción simple SIN considerar rebotes (falla con pelotas que rebotan)
        const tiempoLlegada = (palRivX - pelota.x) / pelota.vx;
        if (tiempoLlegada > 0 && tiempoLlegada < 2) {
            cpu.objetivoY = pelota.y + pelota.vy * tiempoLlegada + cpu.errorActual;
        } else {
            cpu.objetivoY = CH / 2;
        }
    } else {
        // Pelota va al jugador → volver al centro (sin delay acumulado)
        cpu.delayReaccion = 0;
        cpu.objetivoY = CH / 2;
    }

    cpu.objetivoY = Math.max(minY, Math.min(maxY, cpu.objetivoY));

    // Velocidad máxima reducida (era 420, ahora 280)
    const v = Math.min(280, 170 + Math.abs(pelota.vx) * 0.15);
    const diff = cpu.objetivoY - rival.y;
    const move = Math.sign(diff) * Math.min(Math.abs(diff), v * dt);
    rival.y += move;

    rival.y = Math.max(minY, Math.min(maxY, rival.y));
}

// ============================================================
//  FÍSICA
// ============================================================
function resetPelota(direccion = 0) {
    pelota.x = CW / 2;
    pelota.y = CH / 2;
    pelota.trail = [];

    let dir = direccion;
    if (dir === 0) dir = Math.random() < 0.5 ? -1 : 1;

    const angulo = (Math.random() * 2 - 1) * BALL_ANGLE_MAX;
    pelota.vx = Math.cos(angulo) * BALL_SPEED_INIT * dir;
    pelota.vy = Math.sin(angulo) * BALL_SPEED_INIT;
}

function resetPartida() {
    // Reset del estado de la CPU
    cpu.objetivoY = CH / 2;
    cpu.delayReaccion = 0;
    cpu.ultimaDireccion = 0;
    cpu.errorActual = 0;

    jugador.y = CH / 2;
    rival.y = CH / 2;
    puntosYo = 0;
    puntosRival = 0;
    monedasPartida = 0;
    particulas = [];
    marcadorPop = null;
    partidaTerminada = false;
    resetPelota();
    actualizarMarcadorMini();
}

function actualizar(dt) {
    actualizarJugador();

    if (modo === 'cpu') {
        actualizarCpu(dt);
    } else if (modo === 'p2p') {
        const diff = rivalPaddleY - rival.y;
        rival.y += diff * Math.min(1, dt * 22);
    }

    pelota.x += pelota.vx * dt;
    pelota.y += pelota.vy * dt;

    pelota.trail.push({ x: pelota.x, y: pelota.y });
    if (pelota.trail.length > 10) pelota.trail.shift();

    // Rebote techo / suelo
    if (pelota.y - BALL_R < 0) {
        pelota.y = BALL_R;
        pelota.vy = Math.abs(pelota.vy);
        spawnParticulas(pelota.x, pelota.y, 4);
    } else if (pelota.y + BALL_R > CH) {
        pelota.y = CH - BALL_R;
        pelota.vy = -Math.abs(pelota.vy);
        spawnParticulas(pelota.x, pelota.y, 4);
    }

    // Colisión paleta jugador (izquierda)
    const palJugX = PAL_MARGEN + PAL_W;
    if (pelota.vx < 0 && pelota.x - BALL_R <= palJugX && pelota.x > PAL_MARGEN - BALL_R) {
        if (pelota.y + BALL_R > jugador.y - PAL_H / 2 &&
            pelota.y - BALL_R < jugador.y + PAL_H / 2) {
            pelota.x = palJugX + BALL_R;
            rebotePelota(jugador.y, +1);
            spawnParticulas(palJugX, pelota.y, 8);
        }
    }

    // Colisión paleta rival (derecha)
    const palRivX = CW - PAL_MARGEN - PAL_W;
    if (pelota.vx > 0 && pelota.x + BALL_R >= palRivX && pelota.x < CW - PAL_MARGEN + BALL_R) {
        if (pelota.y + BALL_R > rival.y - PAL_H / 2 &&
            pelota.y - BALL_R < rival.y + PAL_H / 2) {
            pelota.x = palRivX - BALL_R;
            rebotePelota(rival.y, -1);
            spawnParticulas(palRivX, pelota.y, 8);
        }
    }

    // Fuera de los límites → punto
    if (pelota.x + BALL_R < 0) {
        anotarPunto('rival');
    } else if (pelota.x - BALL_R > CW) {
        anotarPunto('jugador');
    }

    for (const p of particulas) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 400 * dt;
        p.life -= dt;
    }
    particulas = particulas.filter(p => p.life > 0);

    if (marcadorPop) {
        marcadorPop.life -= dt;
        if (marcadorPop.life <= 0) marcadorPop = null;
    }
}

function rebotePelota(centroPaletaY, direccionX) {
    const offset = (pelota.y - centroPaletaY) / (PAL_H / 2);
    const clamped = Math.max(-1, Math.min(1, offset));
    const angulo = clamped * BALL_ANGLE_MAX;

    const velActual = Math.hypot(pelota.vx, pelota.vy);
    const nuevaVel = Math.min(velActual + BALL_SPEED_INC, BALL_SPEED_MAX);

    pelota.vx = Math.cos(angulo) * nuevaVel * direccionX;
    pelota.vy = Math.sin(angulo) * nuevaVel;
}

function spawnParticulas(x, y, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        const ang = Math.random() * Math.PI * 2;
        const v = 50 + Math.random() * 120;
        particulas.push({
            x, y,
            vx: Math.cos(ang) * v,
            vy: Math.sin(ang) * v,
            size: 1.5 + Math.random() * 2.5,
            life: 0.5,
            lifeMax: 0.5,
            color: cv('--violet-400', '#A78BFA')
        });
    }
}

// ============================================================
//  PUNTOS
// ============================================================
function anotarPunto(quien) {
    if (quien === 'jugador') {
        puntosYo++;
        marcadorPop = {
            texto: '¡Punto!',
            color: cv('--violet-500', '#8B5CF6'),
            life: 0.9,
            lifeMax: 0.9
        };
    } else {
        puntosRival++;
        marcadorPop = {
            texto: '¡Punto!',
            color: cv('--violet-700', '#6D28D9'),
            life: 0.9,
            lifeMax: 0.9
        };
    }

    actualizarMarcadorMini();

    if (puntosYo >= PUNTOS_PARA_GANAR || puntosRival >= PUNTOS_PARA_GANAR) {
        terminarPartida();
        return;
    }

    estado = 'pausa';
    pausaTimer = PAUSA_TRAS_PUNTO / 1000;
    resetPelota(quien === 'jugador' ? -1 : 1);
}

function terminarPartida() {
    partidaTerminada = true;
    estado = 'fin';
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

    const yoGane = puntosYo > puntosRival;

    if (modo === 'p2p' && esHost && conn?.open) {
        try { conn.send({ t: 'fin', marcador: { yo: puntosYo, rival: puntosRival } }); } catch (e) {}
    }

    otorgarMonedas(yoGane);
    setTimeout(() => mostrarOverlayFin(yoGane), 400);
}

async function otorgarMonedas(yoGane) {
    let monto = 0;
    if (modo === 'cpu') monto = yoGane ? MONEDAS_GANAR_CPU : 0;
    else monto = yoGane ? MONEDAS_GANAR_P2P : MONEDAS_PERDER_P2P;

    monedasPartida = monto;

    if (monto <= 0) return;

    const api = API();
    if (!api?.canjear) return;
    try {
        await api.canjear(
            yoGane ? 'trophy' : 'heart-handshake',
            APP_ID,
            yoGane ? 'PiniPon: victoria' : 'PiniPon: consuelo',
            monto
        );
    } catch (e) {}
}

// ============================================================
//  OVERLAY FIN
// ============================================================
function mostrarOverlayFin(yoGane) {
    const iconoEl = document.getElementById('vbFinIcono');
    const tituloEl = document.getElementById('vbFinTitulo');
    const subEl = document.getElementById('vbFinSub');

    iconoEl.className = 'vb-overlay-icono ' + (yoGane ? 'vb-overlay-icono-ganaste' : 'vb-overlay-icono-perdiste');
    iconoEl.innerHTML = yoGane ? '<i data-lucide="trophy"></i>' : '<i data-lucide="frown"></i>';

    tituloEl.textContent = yoGane ? '¡Ganaste!' : '¡Perdiste!';
    subEl.textContent = modo === 'cpu'
        ? (yoGane ? 'Le ganaste a la CPU.' : 'La CPU te ganó esta vez.')
        : (yoGane ? 'Buena partida.' : 'Revancha cuando quieras.');

    document.getElementById('vbFinMarcador').textContent = `${puntosYo} - ${puntosRival}`;
    document.getElementById('vbFinTotal').textContent = '+' + monedasPartida;
    document.getElementById('vbBtnReintentarTxt').textContent =
        modo === 'p2p' ? 'Revancha' : 'Jugar otra vez';

    document.getElementById('vbOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function actualizarMarcadorMini() {
    const mini = document.getElementById('vbScoreMini');
    const yoEl = document.getElementById('vbScoreMiniYo');
    const rivalEl = document.getElementById('vbScoreMiniRival');
    if (!mini) return;

    const mostrar = estado !== 'menu';
    mini.hidden = !mostrar;
    if (yoEl) yoEl.textContent = puntosYo;
    if (rivalEl) rivalEl.textContent = puntosRival;
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (estado !== 'jugando' && estado !== 'countdown' && estado !== 'pausa') return;

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

    if (estado === 'pausa') {
        pausaTimer -= dt;
        actualizarJugador();
        if (modo === 'p2p') {
            const diff = rivalPaddleY - rival.y;
            rival.y += diff * Math.min(1, dt * 22);
        }
        if (marcadorPop) {
            marcadorPop.life -= dt;
            if (marcadorPop.life <= 0) marcadorPop = null;
        }
        for (const p of particulas) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 400 * dt;
            p.life -= dt;
        }
        particulas = particulas.filter(p => p.life > 0);

        dibujar();
        if (pausaTimer <= 0) {
            estado = 'jugando';
            ultimoFrameMs = 0;
        }
        rafId = requestAnimationFrame(loop);
        return;
    }

    if (esHost || modo === 'cpu') {
        actualizar(dt);
    } else {
        actualizarJugador();
        pelota.x += (ballRedX - pelota.x) * Math.min(1, dt * 22);
        pelota.y += (ballRedY - pelota.y) * Math.min(1, dt * 22);
        pelota.vx = ballRedVx;
        pelota.vy = ballRedVy;
        pelota.trail.push({ x: pelota.x, y: pelota.y });
        if (pelota.trail.length > 10) pelota.trail.shift();

        const diffR = rivalPaddleY - rival.y;
        rival.y += diffR * Math.min(1, dt * 22);

        if (marcadorPop) {
            marcadorPop.life -= dt;
            if (marcadorPop.life <= 0) marcadorPop = null;
        }
        for (const p of particulas) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 400 * dt;
            p.life -= dt;
        }
        particulas = particulas.filter(p => p.life > 0);
    }

    if (modo === 'p2p' && conn?.open) {
        const ahora = performance.now();
        if (!esHost && ahora - ultimoEnvioPaddle > 1000 / NET_PADDLE_HZ) {
            ultimoEnvioPaddle = ahora;
            try { conn.send({ t: 'paddle', y: jugador.y }); } catch (e) {}
        }
        if (esHost && ahora - ultimoEnvioEstado > 1000 / NET_STATE_HZ) {
            ultimoEnvioEstado = ahora;
            try {
                conn.send({
                    t: 'state',
                    ball: { x: pelota.x, y: pelota.y, vx: pelota.vx, vy: pelota.vy },
                    hostPaddle: jugador.y,
                    score: { yo: puntosYo, rival: puntosRival }
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
    resetPartida();
    actualizarMarcadorMini();
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
            if (['jugando','countdown','pausa','esperando'].includes(estado)) {
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
        rivalPaddleY = data.y;
        return;
    }

    if (data.t === 'state' && !esHost) {
        ballRedX = data.ball.x;
        ballRedY = data.ball.y;
        ballRedVx = data.ball.vx;
        ballRedVy = data.ball.vy;
        rivalPaddleY = data.hostPaddle;

        if (data.score) {
            if (data.score.yo !== puntosYo || data.score.rival !== puntosRival) {
                puntosYo = data.score.rival;
                puntosRival = data.score.yo;
                actualizarMarcadorMini();
            }
        }
        return;
    }

    if (data.t === 'fin') {
        if (partidaTerminada) return;
        partidaTerminada = true;
        estado = 'fin';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        puntosYo = data.marcador.rival;
        puntosRival = data.marcador.yo;
        const yoGane = puntosYo > puntosRival;
        otorgarMonedas(yoGane);
        setTimeout(() => mostrarOverlayFin(yoGane), 400);
        return;
    }
}

function iniciarCountdown() {
    estado = 'countdown';
    preGameTimer = COUNTDOWN_SEG;
    resetPartida();
    actualizarMarcadorMini();
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
    resetPartida();
    actualizarMarcadorMini();
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
    document.getElementById('vbScoreMini').hidden = true;
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
