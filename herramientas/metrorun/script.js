// ============================================================
//  The MetroRun — Runner de 3 líneas con vista aérea
//  ------------------------------------------------------------
//  Mecánica:
//    - El jugador (con su foto de perfil) corre en una de 3 líneas.
//    - Debe cambiar de línea para esquivar vagones y tomar monedas.
//    - Cada moneda recolectada = 2 monedas reales de VicWebOs.
//    - Cada 5 monedas sube la dificultad (velocidad + spawn).
//    - Tope de dificultad a las 35 monedas.
//
//  Persistencia:
//    - Récord en app/metrorun/{codigo}metrorun.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'metrorun';
const ARCHIVO_RECORD_BASE = 'app/metrorun/';

// ---- Canvas ----
const CANVAS_W = 420;
const CANVAS_H = 640;

// ---- Líneas ----
const LANES = 3;
const SIDE_W = 30;
const ROAD_W = CANVAS_W - SIDE_W * 2;
const LANE_W = ROAD_W / LANES;
const LANE_CENTERS = [
    SIDE_W + LANE_W * 0.5,
    SIDE_W + LANE_W * 1.5,
    SIDE_W + LANE_W * 2.5
];

// ---- Jugador ----
const PLAYER_Y = CANVAS_H - 110;
const PLAYER_RADIUS = 22;
const PLAYER_HITBOX = 15;   // hitbox más chica = más perdón

// ---- Obstáculos ----
const OBSTACLE_W = 64;
const OBSTACLE_H = 90;
const OBSTACLE_HITBOX_W = 54;
const OBSTACLE_HITBOX_H = 78;

// ---- Monedas ----
const COIN_RADIUS = 14;
const COIN_HITBOX = 20;

// Valor de cada moneda del juego en monedas reales.
// El juego de pago debe rendir más que cualquier gratis, así que
// cada moneda del runner vale 2 monedas reales.
const MONEDAS_REALES_POR_MONEDA = 2;

// Separación mínima entre el CENTRO de una moneda y el CENTRO de un
// obstáculo, cuando ambos están cerca del spawn. Se chequea en AMBOS
// sentidos (al spawnear moneda y al spawnear obstáculo) para que
// nunca salgan pegados.
const OBSTACLE_COIN_GAP = 200;

// Separación mínima entre monedas en la misma línea (evita apilar).
const COIN_COIN_GAP = 80;

// Separación mínima entre obstáculos en la misma línea (evita apilar).
const OBSTACLE_OBSTACLE_GAP = 200;

// ---- Dificultad ----
const MONEDAS_POR_NIVEL = 5;
const NIVEL_MAX = 7;                     // 35 monedas / 5 por nivel
const VELOCIDAD_BASE = 250;              // px/s
const VELOCIDAD_MAX = 750;               // px/s
const SPAWN_BASE_MS = 900;
const SPAWN_MIN_MS = 220;
const COIN_SPAWN_FACTOR = 2.5;           // monedas un poco más lentas

// ============================================================
//  ESTADO
// ============================================================
let canvas, ctx;
let rafId = null;
let ultimoFrameMs = 0;
let gameState = 'idle';   // idle | jugando | gameover

const jugador = {
    lane: 1,
    x: LANE_CENTERS[1],
    targetX: LANE_CENTERS[1]
};

let obstaculos = [];
let monedas = [];
let particulas = [];
let popups = [];
let scrollY = 0;
let monedasRecolectadas = 0;   // collectibles (cada una vale 2 reales)
let proximoSpawnObs = 0;
let proximoSpawnMon = 0;
let recordPersonal = 0;
let nivelActual = 0;

let fotoImg = null;
let inicialUsuario = '?';
let fotoCargada = false;

let toastTimeout = null;

// Paleta leída del tema (se refresca al cambiar tema)
const colores = {
    fondo:       '#18181B',
    anden:       '#27272A',
    carretera:   '#1F1F23',
    lineaCarril: '#52525B',
    bordeAcento: '#8B5CF6',
    // Colores del vagón (todos salen del tema)
    autoCuerpo:  '#3F3F46',
    autoBorde:   '#18181B',
    autoDetalle: '#A78BFA'
};

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

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

function colorVar(name, fallback) {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    } catch (e) {
        return fallback;
    }
}

function refrescarColores() {
    colores.fondo       = colorVar('--gray-900', '#18181B');
    colores.anden       = colorVar('--gray-800', '#27272A');
    colores.carretera   = colorVar('--gray-800', '#1F1F23');
    colores.lineaCarril = colorVar('--gray-600', '#52525B');
    colores.bordeAcento = colorVar('--violet-500', '#8B5CF6');
    // Autos: cuerpo con acento oscuro del tema
    colores.autoCuerpo  = colorVar('--violet-700', '#3F3F46');
    colores.autoBorde   = colorVar('--gray-900', '#18181B');
    // Ventanas: acento claro del tema
    colores.autoDetalle = colorVar('--violet-400', '#A78BFA');
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
        setTimeout(refrescarColores, 60);
    }
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('mrToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mr-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  FOTO DE PERFIL
// ============================================================
function cargarFotoPerfil() {
    try {
        const cuenta = window.parent.cuentaActual;
        if (cuenta && cuenta.foto) {
            fotoImg = new Image();
            fotoImg.onload = () => { fotoCargada = true; };
            fotoImg.onerror = () => { fotoCargada = false; };
            fotoImg.src = cuenta.foto;
        }
        if (cuenta && cuenta.nombre) {
            inicialUsuario = cuenta.nombre.charAt(0).toUpperCase();
        }
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  RÉCORD
// ============================================================
function rutaRecord() {
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO_RECORD_BASE + cuenta.codigo + 'metrorun.json';
}

async function cargarRecord() {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return 0;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data.record === 'number') return data.record;
    } catch (e) { /* silencioso */ }
    return 0;
}

async function guardarRecord(n) {
    const bd = BD();
    const ruta = rutaRecord();
    if (!bd || !ruta) return;
    try {
        await bd.escribirArchivo(ruta, {
            version: 1,
            record: n,
            actualizado: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[MetroRun] No se pudo guardar el récord:', e);
    }
}

// ============================================================
//  CANVAS
// ============================================================
function configurarCanvas() {
    canvas = document.getElementById('mrCanvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    canvas.style.width  = '';
    canvas.style.height = '';
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

    // Fondo general
    ctx.fillStyle = colores.fondo;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Andenes laterales
    ctx.fillStyle = colores.anden;
    ctx.fillRect(0, 0, SIDE_W, CANVAS_H);
    ctx.fillRect(CANVAS_W - SIDE_W, 0, SIDE_W, CANVAS_H);

    // Borde acento de los andenes
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = colores.bordeAcento;
    ctx.fillRect(SIDE_W - 2, 0, 2, CANVAS_H);
    ctx.fillRect(CANVAS_W - SIDE_W, 0, 2, CANVAS_H);
    ctx.globalAlpha = 1;

    // Carretera
    ctx.fillStyle = colores.carretera;
    ctx.fillRect(SIDE_W, 0, ROAD_W, CANVAS_H);

    // Dashes entre carriles
    ctx.strokeStyle = colores.lineaCarril;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const dashTotal = 60;
    const dashLen   = 22;
    const offset    = scrollY % dashTotal;
    for (let i = -1; i < CANVAS_H / dashTotal + 1; i++) {
        const y = i * dashTotal + offset;
        for (let j = 1; j < LANES; j++) {
            const x = SIDE_W + LANE_W * j;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + dashLen);
            ctx.stroke();
        }
    }

    // Obstáculos
    for (const o of obstaculos) dibujarObstaculo(o);

    // Monedas
    for (const c of monedas) dibujarMoneda(c);

    // Partículas
    for (const p of particulas) {
        ctx.globalAlpha = Math.max(0, p.life / p.lifeMax);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Jugador
    dibujarJugador();

    // Popups (muestran el valor REAL de cada moneda)
    for (const cp of popups) {
        ctx.globalAlpha = Math.max(0, cp.life / cp.lifeMax);
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 22px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 3;
        const texto = '+' + MONEDAS_REALES_POR_MONEDA;
        ctx.strokeText(texto, cp.x, cp.y);
        ctx.fillText(texto, cp.x, cp.y);
    }
    ctx.globalAlpha = 1;
}

function dibujarJugador() {
    const x = jugador.x;
    const y = PLAYER_Y;
    const r = PLAYER_RADIUS;

    // Sombra
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Aro exterior (acento del tema)
    ctx.strokeStyle = colores.bordeAcento;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Foto de perfil (clip circular)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.clip();
    if (fotoCargada && fotoImg) {
        ctx.drawImage(fotoImg, x - r, y - r, r * 2, r * 2);
    } else {
        ctx.fillStyle = colorVar('--violet-600', '#7C3AED');
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 22px Nunito, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(inicialUsuario, x, y + 1);
    }
    ctx.restore();

    // Brillo interior
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.stroke();
}

function dibujarObstaculo(o) {
    const x = o.x - OBSTACLE_W / 2;
    const y = o.y - OBSTACLE_H / 2;

    // Cuerpo del vagón (color del tema)
    ctx.fillStyle = colores.autoCuerpo;
    roundRect(ctx, x, y, OBSTACLE_W, OBSTACLE_H, 8);
    ctx.fill();

    // Borde oscuro
    ctx.strokeStyle = colores.autoBorde;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, OBSTACLE_W, OBSTACLE_H, 8);
    ctx.stroke();

    // Ventanas: rejilla 2x2 con acento claro del tema
    const winW = 16;
    const winH = 14;
    const winGapX = 6;
    const winGapY = 6;
    const totalW = winW * 2 + winGapX;
    const startX = x + (OBSTACLE_W - totalW) / 2;
    const startY = y + 12;

    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
            const wx = startX + col * (winW + winGapX);
            const wy = startY + row * (winH + winGapY);

            // Cristal (acento del tema, semi-transparente)
            ctx.fillStyle = colores.autoDetalle;
            ctx.globalAlpha = 0.65;
            roundRect(ctx, wx, wy, winW, winH, 3);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Marco oscuro
            ctx.strokeStyle = colores.autoBorde;
            ctx.lineWidth = 1;
            roundRect(ctx, wx, wy, winW, winH, 3);
            ctx.stroke();
        }
    }

    // Franja de peligro (rojo, fija)
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(x + 6, y + OBSTACLE_H - 26, OBSTACLE_W - 12, 7);

    // Luces de advertencia (amarillas, fijas)
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(x + 10, y + OBSTACLE_H - 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + OBSTACLE_W - 10, y + OBSTACLE_H - 10, 3, 0, Math.PI * 2);
    ctx.fill();
}

function dibujarMoneda(c) {
    const r = COIN_RADIUS;

    // Glow dorado
    ctx.save();
    ctx.shadowColor = '#F59E0B';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Borde más oscuro
    ctx.strokeStyle = '#D97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Símbolo $
    ctx.fillStyle = '#92400E';
    ctx.font = 'bold 16px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', c.x, c.y + 1);
}

// ============================================================
//  ACTUALIZAR
// ============================================================
function nivelDesdeMonedas() {
    return Math.min(Math.floor(monedasRecolectadas / MONEDAS_POR_NIVEL), NIVEL_MAX);
}

function velocidadActual() {
    const t = nivelDesdeMonedas() / NIVEL_MAX;
    return VELOCIDAD_BASE + (VELOCIDAD_MAX - VELOCIDAD_BASE) * t;
}

function spawnMsActual() {
    const t = nivelDesdeMonedas() / NIVEL_MAX;
    return SPAWN_BASE_MS + (SPAWN_MIN_MS - SPAWN_BASE_MS) * t;
}

function actualizar(dt) {
    const vel = velocidadActual();
    const spawnMs = spawnMsActual();

    // Scroll de la carretera
    scrollY += vel * dt;

    // Suavizado del jugador
    jugador.x += (jugador.targetX - jugador.x) * Math.min(dt * 14, 1);

    // Mover obstáculos
    for (const o of obstaculos) o.y += vel * dt;
    obstaculos = obstaculos.filter(o => o.y < CANVAS_H + 100);

    // Mover monedas
    for (const c of monedas) c.y += vel * dt;
    monedas = monedas.filter(c => c.y < CANVAS_H + 50);

    // Spawn obstáculos
    proximoSpawnObs -= dt * 1000;
    if (proximoSpawnObs <= 0) {
        spawnObstaculo();
        proximoSpawnObs = spawnMs * (0.85 + Math.random() * 0.3);
    }

    // Spawn monedas
    proximoSpawnMon -= dt * 1000;
    if (proximoSpawnMon <= 0) {
        spawnMoneda();
        proximoSpawnMon = spawnMs * COIN_SPAWN_FACTOR * (0.8 + Math.random() * 0.6);
    }

    // Colisión con obstáculos
    for (const o of obstaculos) {
        if (colisionCircRect(
            jugador.x, PLAYER_Y, PLAYER_HITBOX,
            o.x - OBSTACLE_HITBOX_W / 2,
            o.y - OBSTACLE_HITBOX_H / 2,
            OBSTACLE_HITBOX_W,
            OBSTACLE_HITBOX_H
        )) {
            gameOver();
            return;
        }
    }

    // Colisión con monedas
    for (const c of monedas) {
        if (c.recolectada) continue;
        const dx = jugador.x - c.x;
        const dy = PLAYER_Y - c.y;
        if (dx * dx + dy * dy < (PLAYER_RADIUS + COIN_HITBOX) ** 2) {
            recolectarMoneda(c);
        }
    }

    // Partículas
    for (const p of particulas) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 380 * dt;
        p.life -= dt;
    }
    particulas = particulas.filter(p => p.life > 0);

    // Popups
    for (const cp of popups) {
        cp.y -= 70 * dt;
        cp.life -= dt;
    }
    popups = popups.filter(cp => cp.life > 0);

    actualizarHUD();
}

function spawnObstaculo() {
    const SPAWN_Y = -OBSTACLE_H / 2 - 10;

    // Buscar líneas libres: sin monedas cercanas y sin otros obstáculos cercanos
    const candidatos = [];
    for (let i = 0; i < LANES; i++) {
        let bloqueada = false;

        // ¿Hay una moneda muy cerca del spawn en esta línea?
        for (const c of monedas) {
            if (c.lane === i && Math.abs(c.y - SPAWN_Y) < OBSTACLE_COIN_GAP) {
                bloqueada = true;
                break;
            }
        }
        if (bloqueada) continue;

        // ¿Hay un obstáculo muy cerca del spawn en esta línea?
        for (const o of obstaculos) {
            if (o.lane === i && Math.abs(o.y - SPAWN_Y) < OBSTACLE_OBSTACLE_GAP) {
                bloqueada = true;
                break;
            }
        }
        if (bloqueada) continue;

        candidatos.push(i);
    }

    // Si no hay lugar, esperamos al próximo intento (no spawneamos nada)
    if (candidatos.length === 0) return;

    const lane = candidatos[Math.floor(Math.random() * candidatos.length)];

    obstaculos.push({
        lane,
        x: LANE_CENTERS[lane],
        y: SPAWN_Y,
        w: OBSTACLE_W,
        h: OBSTACLE_H
    });
}

function spawnMoneda() {
    const SPAWN_Y = -COIN_RADIUS - 10;

    const candidatos = [];
    for (let i = 0; i < LANES; i++) {
        let bloqueada = false;

        // ¿Hay un obstáculo muy cerca del spawn en esta línea?
        for (const o of obstaculos) {
            if (o.lane === i && Math.abs(o.y - SPAWN_Y) < OBSTACLE_COIN_GAP) {
                bloqueada = true;
                break;
            }
        }
        if (bloqueada) continue;

        // ¿Hay otra moneda muy cerca en la misma línea?
        for (const c of monedas) {
            if (c.lane === i && Math.abs(c.y - SPAWN_Y) < COIN_COIN_GAP) {
                bloqueada = true;
                break;
            }
        }
        if (bloqueada) continue;

        candidatos.push(i);
    }

    // Si no hay lugar, esperamos al próximo intento
    if (candidatos.length === 0) return;

    const lane = candidatos[Math.floor(Math.random() * candidatos.length)];

    monedas.push({
        lane,
        x: LANE_CENTERS[lane],
        y: SPAWN_Y,
        recolectada: false
    });
}

function recolectarMoneda(c) {
    c.recolectada = true;

    // Efecto: partículas doradas
    for (let i = 0; i < 8; i++) {
        const angulo = (Math.PI * 2 * i) / 8 + Math.random() * 0.5;
        particulas.push({
            x: c.x,
            y: c.y,
            vx: Math.cos(angulo) * (80 + Math.random() * 80),
            vy: Math.sin(angulo) * (80 + Math.random() * 80) - 50,
            size: 2 + Math.random() * 2.5,
            color: i % 2 === 0 ? '#FBBF24' : '#F59E0B',
            life: 0.5,
            lifeMax: 0.5
        });
    }

    // Popup +2 (valor real)
    popups.push({
        x: c.x,
        y: c.y,
        life: 0.8,
        lifeMax: 0.8
    });

    monedasRecolectadas++;

    // Quitar la moneda del array tras un frame para que no vuelva a contar
    monedas = monedas.filter(x => x !== c);
}

// ============================================================
//  COLISIONES
// ============================================================
function colisionCircRect(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
}

// ============================================================
//  CONTROL
// ============================================================
function moverIzquierda() {
    if (gameState !== 'jugando') return;
    if (jugador.lane > 0) {
        jugador.lane--;
        jugador.targetX = LANE_CENTERS[jugador.lane];
    }
}

function moverDerecha() {
    if (gameState !== 'jugando') return;
    if (jugador.lane < LANES - 1) {
        jugador.lane++;
        jugador.targetX = LANE_CENTERS[jugador.lane];
    }
}

// ============================================================
//  HUD
// ============================================================
function actualizarHUD() {
    // El HUD muestra el valor REAL (multiplicado)
    const elCoins = document.getElementById('mrCoins');
    if (elCoins) elCoins.textContent = monedasRecolectadas * MONEDAS_REALES_POR_MONEDA;

    const nivel = nivelDesdeMonedas() + 1;
    const elNivelText = document.getElementById('mrNivelText');
    if (elNivelText) elNivelText.textContent = 'Nivel ' + nivel;

    const badge = document.getElementById('mrNivelBadge');
    if (badge) {
        for (let i = 1; i <= 12; i++) badge.classList.remove('n' + i);
        badge.classList.add('n' + Math.min(nivel, 12));
    }
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (gameState !== 'jugando') return;

    if (!ultimoFrameMs) ultimoFrameMs = now;
    const deltaMs = Math.min(now - ultimoFrameMs, 50);
    ultimoFrameMs = now;

    actualizar(deltaMs / 1000);
    dibujar();

    if (gameState === 'jugando') {
        rafId = requestAnimationFrame(loop);
    }
}

// ============================================================
//  ESTADOS DE PARTIDA
// ============================================================
function empezar() {
    // Reset
    jugador.lane = 1;
    jugador.x = LANE_CENTERS[1];
    jugador.targetX = LANE_CENTERS[1];

    obstaculos = [];
    monedas = [];
    particulas = [];
    popups = [];
    scrollY = 0;
    monedasRecolectadas = 0;
    proximoSpawnObs = 600;
    proximoSpawnMon = 900;
    ultimoFrameMs = 0;
    gameState = 'jugando';

    document.getElementById('mrOverlayStart').hidden = true;
    document.getElementById('mrOverlayFin').hidden = true;

    actualizarHUD();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

function gameOver() {
    gameState = 'gameover';
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    const monedasReales = monedasRecolectadas * MONEDAS_REALES_POR_MONEDA;

    // Guardar récord (en collectibles, que es la medida del gameplay)
    const esRecord = monedasRecolectadas > recordPersonal;
    if (esRecord) {
        recordPersonal = monedasRecolectadas;
        const recEl = document.getElementById('mrRecord');
        if (recEl) recEl.textContent = recordPersonal * MONEDAS_REALES_POR_MONEDA;
        guardarRecord(recordPersonal);
    }

    // Dar monedas (valor real)
    otorgarMonedas(monedasReales);

    // Mostrar overlay
    mostrarOverlayFin(esRecord, monedasReales);
}

async function otorgarMonedas(cantidadReal) {
    if (cantidadReal <= 0) return;
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear(
            'train-front',
            APP_ID,
            `MetroRun: ${cantidadReal} monedas`,
            cantidadReal
        );
    } catch (e) {
        console.warn('[MetroRun] No se pudieron otorgar monedas:', e);
    }
}

function mostrarOverlayFin(esRecord, monedasReales) {
    const n = monedasReales;

    document.getElementById('mrFinCoins').textContent = monedasRecolectadas;
    document.getElementById('mrFinNivel').textContent = (nivelDesdeMonedas() + 1);
    document.getElementById('mrFinGanancia').textContent = '+' + n;

    const filaRecord = document.getElementById('mrFinRecordFila');
    if (esRecord) {
        document.getElementById('mrFinRecord').textContent = recordPersonal * MONEDAS_REALES_POR_MONEDA;
        filaRecord.hidden = false;
    } else {
        filaRecord.hidden = true;
    }

    document.getElementById('mrOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    if (n > 0) {
        toast(`+${n} monedas`, 'success');
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();
    refrescarColores();

    // Badge del usuario
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const badge = document.getElementById('mrUserBadge');
    if (badge) {
        badge.textContent = cuenta
            ? `@${cuenta.codigo} · ${cuenta.nombre}`
            : '—';
    }

    // Foto de perfil (para el sprite del jugador)
    cargarFotoPerfil();

    // Récord
    try {
        recordPersonal = await cargarRecord();
    } catch (e) { /* silencioso */ }
    const recEl = document.getElementById('mrRecord');
    if (recEl) recEl.textContent = recordPersonal * MONEDAS_REALES_POR_MONEDA;

    // Canvas
    configurarCanvas();
    dibujar();

    // ====== CONTROLES ======

    // Teclado
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (gameState === 'idle' || gameState === 'gameover') {
            if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                empezar();
            }
            return;
        }

        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            moverIzquierda();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            moverDerecha();
        }
    });

    // Touch: swipe o tap
    if (canvas) {
        let tStartX = 0;
        let tStartY = 0;
        let tStartTime = 0;

        canvas.addEventListener('touchstart', (e) => {
            if (gameState !== 'jugando') return;
            e.preventDefault();
            const t = e.touches[0];
            tStartX = t.clientX;
            tStartY = t.clientY;
            tStartTime = Date.now();
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (gameState !== 'jugando') return;
            e.preventDefault();
            if (!e.changedTouches || e.changedTouches.length === 0) return;

            const t = e.changedTouches[0];
            const dx = t.clientX - tStartX;
            const dy = t.clientY - tStartY;
            const dt = Date.now() - tStartTime;

            // Swipe horizontal
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) && dt < 500) {
                if (dx > 0) moverDerecha();
                else moverIzquierda();
                return;
            }

            // Tap (toque corto y sin movimiento)
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 250) {
                const rect = canvas.getBoundingClientRect();
                const tapX = t.clientX - rect.left;
                if (tapX < rect.width / 2) moverIzquierda();
                else moverDerecha();
            }
        }, { passive: false });

        // Mouse click (para probar en PC)
        canvas.addEventListener('click', (e) => {
            if (gameState !== 'jugando') return;
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX < rect.width / 2) moverIzquierda();
            else moverDerecha();
        });
    }

    // Botones
    document.getElementById('mrBtnEmpezar')?.addEventListener('click', empezar);
    document.getElementById('mrBtnReintentar')?.addEventListener('click', empezar);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
