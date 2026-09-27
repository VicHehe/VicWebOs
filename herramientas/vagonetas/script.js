// ============================================================
//  Vagonetas — Motor del juego
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'vagonetas';
const ARCHIVO_BASE = 'app/vagonetas/';

const CARRILES_X = [-4, -2, 0, 2, 4];
const TOTAL_CARRILES = 5;

const DISTANCIA_META = 500;
const VEL_INICIAL = 23;         // ← sube: arranca fuerte
const VEL_FINAL   = 28;

// Rivales: ambos MÁS LENTOS que el jugador promedio
const RIVALES_CFG = [
    { nombre: 'Rival Rojo',  velocidad: 22.5, agilidad: 0.95 },
    { nombre: 'Rival Verde', velocidad: 23.2, agilidad: 0.55 }
];

// Ritmo de obstáculos: constante, sin pausas largas
const INTERVALO_PATRON_BASE = 1100;   // ← era 1400
const INTERVALO_PATRON_MIN  = 750;

const CHOQUE_PENALIZACION = 0.45;
const CHOQUE_DURACION = 1.05;

const BASE_POR_CARRERA = 10;
const TOPE_RACHA = 60;
const SEGUNDO_LUGAR_PCT = 0.5;

// ---------- ESTADO ----------
let estado = {
    version: 1,
    victorias: 0, segundos: 0, terceros: 0,
    rachaDias: 1, ultimaFechaJugada: '',
    mejorTiempoMs: 0, monedasGanadasTotales: 0,
    ultimaVez: new Date().toISOString()
};

let usuarioActual = null;
let inicializado = false;
let mapaActual = null;
let mapaElegido = null;

let fase = 'idle';
let tiempoCountdown = 3.0;
let tiempoCarreraMs = 0;
let proximoPatronMs = 0;
let proximoIdObstaculo = 1;

let jugador = crearJugadorVacio();
let rivales = [];
let obstaculos = [];

let rafId = null;
let ultimoFrameMs = 0;
let toastTimer = null;
let shakeMs = 0;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
function diaChileHoy() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}
function diasEntre(aISO, bISO) {
    const a = new Date(aISO + 'T12:00:00');
    const b = new Date(bISO + 'T12:00:00');
    return Math.round((b - a) / 86400000);
}

// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const sp = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300',
            '--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt',
            '--gray-50','--gray-100','--gray-200','--gray-300','--gray-400',
            '--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient'
        ];
        vars.forEach(v => {
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {}
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
function toast(txt, tipo = 'info') {
    const el = document.getElementById('vgToast');
    if (!el) return;
    el.textContent = txt;
    el.className = 'vg-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ============================================================
function crearJugadorVacio() {
    return { carril: 2, progreso: 0, penalizadoMs: 0, terminado: false, tiempoFinalMs: 0 };
}

function crearRival(idx) {
    const cfg = RIVALES_CFG[idx];
    return {
        idx, carril: idx === 0 ? 1 : 3,
        progreso: 0,
        velocidad: cfg.velocidad,
        agilidad: cfg.agilidad,
        nombre: cfg.nombre,
        penalizadoMs: 0,
        terminado: false, tiempoFinalMs: 0,
        cambioPendiente: 0
    };
}

// ============================================================
function obtenerTemasInstalados() {
    const api = API();
    try {
        const t = api?.obtenerTemasInstalados?.();
        return Array.isArray(t) ? t : [];
    } catch (e) { return []; }
}

function renderMapas() {
    const cont = document.getElementById('vgMapasGrid');
    if (!cont) return;
    const temas = obtenerTemasInstalados();
    cont.innerHTML = '';

    MAPAS.forEach(m => {
        const tiene = m.esBase || temas.includes(m.requiereTema);
        const bloqueado = !tiene;
        const elegido = mapaElegido === m.id;

        const el = document.createElement('button');
        el.className = 'vg-mapa-card' + (bloqueado ? ' bloqueado' : '') + (elegido ? ' elegido' : '');
        el.disabled = bloqueado;

        const colorCielo = '#' + m.cielo.toString(16).padStart(6, '0');
        const colorRiel  = '#' + m.riel.toString(16).padStart(6, '0');

        el.innerHTML = `
            <div class="vg-mapa-preview" style="background: linear-gradient(180deg, ${colorCielo} 0%, ${colorRiel} 100%);">
                <div class="vg-mapa-preview-linea" style="background:${colorRiel};"></div>
                <div class="vg-mapa-preview-linea" style="background:${colorRiel};"></div>
                ${bloqueado ? '<div class="vg-mapa-lock"><i data-lucide="lock"></i></div>' : ''}
            </div>
            <div class="vg-mapa-info">
                <div class="vg-mapa-nombre">${m.nombre}</div>
                <div class="vg-mapa-desc">${bloqueado ? `Necesitás el tema "${m.requiereTema}"` : m.descripcion}</div>
            </div>
        `;

        el.addEventListener('click', () => {
            if (bloqueado) return;
            mapaElegido = m.id;
            renderMapas();
            actualizarBotonEmpezar();
        });

        cont.appendChild(el);
    });

    if (window.lucide) lucide.createIcons();
}

function actualizarBotonEmpezar() {
    const btn = document.getElementById('vgBtnEmpezar');
    if (!btn) return;
    if (mapaElegido) {
        btn.disabled = false;
        const m = MAPAS.find(x => x.id === mapaElegido);
        btn.querySelector('span').textContent = `Jugar en ${m.nombre}`;
    } else {
        btn.disabled = true;
        btn.querySelector('span').textContent = 'Elegí un circuito';
    }
}

// ============================================================
function actualizarRachaAlEntrar() {
    const hoy = diaChileHoy();
    const ultima = estado.ultimaFechaJugada;
    if (!ultima) estado.rachaDias = 1;
    else {
        const diff = diasEntre(ultima, hoy);
        if (diff === 1) estado.rachaDias = (estado.rachaDias || 0) + 1;
        else if (diff > 1) estado.rachaDias = 1;
    }
    estado.ultimaFechaJugada = hoy;
    renderRacha();
}

function renderRacha() {
    const el = document.getElementById('vgRacha');
    if (el) el.textContent = estado.rachaDias;
    const info = document.getElementById('vgRachaInfo');
    if (info) {
        const premio = calcularPremioBase();
        info.textContent = `Racha: ${estado.rachaDias} día${estado.rachaDias === 1 ? '' : 's'} · 1º lugar = ${premio} monedas`;
    }
}

function calcularPremioBase() {
    const valor = BASE_POR_CARRERA + Math.max(0, estado.rachaDias - 1);
    return Math.min(valor, TOPE_RACHA);
}

function velocidadJugadorBase() {
    const t = Math.min(jugador.progreso / DISTANCIA_META, 1);
    return VEL_INICIAL + (VEL_FINAL - VEL_INICIAL) * t;
}

// ============================================================
function iniciarCarrera() {
    if (!mapaElegido) return;
    mapaActual = MAPAS.find(m => m.id === mapaElegido);
    if (!mapaActual) return;

    jugador = crearJugadorVacio();
    rivales = [crearRival(0), crearRival(1)];
    obstaculos = [];
    proximoPatronMs = 600;
    proximoIdObstaculo = 1;
    tiempoCarreraMs = 0;
    tiempoCountdown = 3.0;
    shakeMs = 0;

    document.getElementById('vgScreenStart').hidden = true;
    document.getElementById('vgScreenFin').hidden = true;

    const jugadorInfo = {
        foto: usuarioActual?.foto || null,
        inicial: (usuarioActual?.nombre || '?').charAt(0).toUpperCase()
    };

    const contenedor = document.getElementById('vgCanvas');
    window.VG_Escena.init(contenedor, mapaActual, jugadorInfo);

    const posLive = document.getElementById('vgPosLive');
    if (posLive) posLive.hidden = false;

    fase = 'countdown';
    mostrarCountdown();
    actualizarHUD();

    ultimoFrameMs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    window.addEventListener('resize', onResize);
}

function mostrarCountdown() {
    const c = document.getElementById('vgCountdown');
    const n = document.getElementById('vgCountdownNum');
    if (!c || !n) return;
    c.hidden = false;
    n.textContent = '3';
    n.classList.remove('pop');
    void n.offsetWidth;
    n.classList.add('pop');
}

// ============================================================
function moverIzquierda() {
    if (fase !== 'racing') return;
    if (jugador.carril > 0) jugador.carril--;
}
function moverDerecha() {
    if (fase !== 'racing') return;
    if (jugador.carril < TOTAL_CARRILES - 1) jugador.carril++;
}

function bindControles() {
    document.querySelectorAll('.vg-tap-zone').forEach(zona => {
        zona.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (zona.dataset.dir === 'left') moverIzquierda();
            else moverDerecha();
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
            e.preventDefault(); moverIzquierda();
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
            e.preventDefault(); moverDerecha();
        }
    });
}

function onResize() {
    if (window.VG_Escena) window.VG_Escena.onResize();
}

// ============================================================
function loop(now) {
    if (fase === 'idle') return;
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const dt = Math.min((now - ultimoFrameMs) / 1000, 0.1);
    ultimoFrameMs = now;

    if (fase === 'countdown') tickCountdown(dt);
    else if (fase === 'racing') tickCarrera(dt);

    rafId = requestAnimationFrame(loop);
}

function tickCountdown(dt) {
    const prev = Math.ceil(tiempoCountdown);
    tiempoCountdown -= dt;
    if (tiempoCountdown <= 0) {
        document.getElementById('vgCountdown').hidden = true;
        fase = 'racing';
        return;
    }
    const actual = Math.ceil(tiempoCountdown);
    if (actual !== prev) {
        const n = document.getElementById('vgCountdownNum');
        if (n) {
            n.textContent = actual === 0 ? '¡YA!' : actual;
            n.classList.remove('pop');
            void n.offsetWidth;
            n.classList.add('pop');
        }
    }
}

function tickCarrera(dt) {
    tiempoCarreraMs += dt * 1000;

    let velJugador = velocidadJugadorBase();
    if (jugador.penalizadoMs > 0) {
        jugador.penalizadoMs -= dt * 1000;
        velJugador *= CHOQUE_PENALIZACION;
    }

    jugador.progreso += velJugador * dt;

    rivales.forEach(r => {
        if (r.terminado) return;
        let v = r.velocidad;
        if (r.penalizadoMs > 0) {
            r.penalizadoMs -= dt * 1000;
            v *= CHOQUE_PENALIZACION;
        }
        r.progreso += v * dt;
    });

    proximoPatronMs -= dt * 1000;
    if (proximoPatronMs <= 0) {
        spawnPatron();
        proximoPatronMs = intervaloPatronMs();
    }

    obstaculos.forEach(o => { o.z += velJugador * dt; });
    obstaculos = obstaculos.filter(o => o.z < 15);

    // Colisiones jugador
    for (const o of obstaculos) {
        if (o.golpeadoPor.jugador) continue;
        if (Math.abs(o.z) < 0.9 && o.carril === jugador.carril) {
            o.golpeadoPor.jugador = true;
            jugador.penalizadoMs = CHOQUE_DURACION * 1000;
            shakeMs = 350;
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }

    // Colisiones rivales
    for (const o of obstaculos) {
        rivales.forEach((r, i) => {
            const key = 'r' + i;
            if (o.golpeadoPor[key]) return;
            if (r.penalizadoMs > 0) return;
            const zRel = o.z + (r.progreso - jugador.progreso);
            if (Math.abs(zRel) < 0.9 && o.carril === r.carril) {
                o.golpeadoPor[key] = true;
                r.penalizadoMs = CHOQUE_DURACION * 1000;
            }
        });
    }

    rivales.forEach(r => tickRival(r, dt));

    if (shakeMs > 0) shakeMs -= dt * 1000;
    if (shakeMs < 0) shakeMs = 0;

    window.VG_Escena.updateEscena(jugador, rivales, obstaculos, dt, shakeMs);

    actualizarPosLive();
    actualizarHUD();
    chequearFin();
}

// ============================================================
function intervaloPatronMs() {
    const t = Math.min(jugador.progreso / DISTANCIA_META, 1);
    const base = INTERVALO_PATRON_BASE + (INTERVALO_PATRON_MIN - INTERVALO_PATRON_BASE) * t;
    return base * (0.9 + Math.random() * 0.2);
}

function spawnPatron() {
    const activos = obstaculos.filter(o => o.z < -80).length;
    if (activos >= 6) return;

    const ocupados = new Set();
    obstaculos.forEach(o => {
        if (o.z > -260 && o.z < -140) ocupados.add(o.carril);
    });

    const libres = [];
    for (let i = 0; i < TOTAL_CARRILES; i++) {
        if (!ocupados.has(i)) libres.push(i);
    }
    if (libres.length < 2) return;

    const r = Math.random();
    const zBase = -180 - Math.random() * 20;

    if (r < 0.70) {
        // SINGLE
        const c = libres[Math.floor(Math.random() * libres.length)];
        crearObstaculo(c, zBase);
    } else if (r < 0.95) {
        // DOBLE
        const sh = shuffle([...libres]);
        crearObstaculo(sh[0], zBase);
        crearObstaculo(sh[1], zBase);
    } else {
        // ZIGZAG (raro)
        if (libres.length < 3) return;
        const sh = shuffle([...libres]);
        crearObstaculo(sh[0], zBase);
        crearObstaculo(sh[1], zBase - 14);
        crearObstaculo(sh[2], zBase - 28);
    }
}

function crearObstaculo(carril, z) {
    obstaculos.push({
        id: proximoIdObstaculo++,
        carril, z,
        golpeadoPor: { jugador: false, r0: false, r1: false }
    });
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================================
function tickRival(r, dt) {
    if (r.terminado) return;
    if (r.cambioPendiente > 0) {
        r.cambioPendiente -= dt;
        return;
    }

    const miZ = -(r.progreso - jugador.progreso);
    const ojoAdelante = 32 * r.agilidad;

    const ocupado = obstaculos.some(o =>
        o.carril === r.carril && o.z > miZ - ojoAdelante && o.z < miZ + 3
    );
    if (!ocupado) return;

    const candidatos = [...Array(TOTAL_CARRILES).keys()]
        .filter(c => c !== r.carril)
        .sort((a, b) => Math.abs(a - r.carril) - Math.abs(b - r.carril));

    for (const c of candidatos) {
        const libre = !obstaculos.some(o =>
            o.carril === c && o.z > miZ - ojoAdelante * 0.8 && o.z < miZ + 3
        );
        if (libre) {
            r.carril = c;
            r.cambioPendiente = 0.28;
            return;
        }
    }
}

// ============================================================
function calcularPosicion() {
    const lista = [
        { tipo: 'jugador', prog: jugador.progreso },
        ...rivales.map((r, i) => ({ tipo: 'rival', idx: i, prog: r.progreso }))
    ];
    lista.sort((a, b) => b.prog - a.prog);
    return lista;
}

function actualizarPosLive() {
    const lista = calcularPosicion();
    for (let i = 0; i < 3; i++) {
        const item = lista[i];
        if (!item) continue;
        const el = document.getElementById('vgPos' + (i + 1));
        if (el) {
            if (item.tipo === 'jugador') {
                el.textContent = 'Tú';
                el.classList.add('tu-nombre');
            } else {
                el.textContent = RIVALES_CFG[item.idx].nombre;
                el.classList.remove('tu-nombre');
            }
        }
    }
    const miPos = lista.findIndex(x => x.tipo === 'jugador') + 1;
    document.querySelectorAll('.vg-pos-item').forEach(el => {
        el.classList.toggle('yo', parseInt(el.dataset.pos) === miPos);
    });
}

function actualizarHUD() {
    const pos = calcularPosicion();
    const miPos = pos.findIndex(x => x.tipo === 'jugador') + 1;
    const elPos = document.getElementById('vgHudPosNum');
    if (elPos) elPos.textContent = miPos;

    const elDist = document.getElementById('vgHudDist');
    if (elDist) {
        const d = Math.min(DISTANCIA_META, Math.floor(jugador.progreso));
        elDist.textContent = `${d} / ${DISTANCIA_META}m`;
    }
    const elTime = document.getElementById('vgHudTime');
    if (elTime) elTime.textContent = (tiempoCarreraMs / 1000).toFixed(1) + 's';
}

// ============================================================
function chequearFin() {
    if (jugador.progreso >= DISTANCIA_META && !jugador.terminado) {
        jugador.terminado = true;
        jugador.tiempoFinalMs = tiempoCarreraMs;
        finDeCarrera();
        return;
    }
    rivales.forEach(r => {
        if (r.progreso >= DISTANCIA_META && !r.terminado) {
            r.terminado = true;
            r.tiempoFinalMs = tiempoCarreraMs;
        }
    });
}

function finDeCarrera() {
    if (fase === 'finished') return;
    fase = 'finished';
    if (rafId) cancelAnimationFrame(rafId);

    const lista = calcularPosicion();
    const miPos = lista.findIndex(x => x.tipo === 'jugador') + 1;

    let monedas = 0;
    const base = calcularPremioBase();
    if (miPos === 1) monedas = base;
    else if (miPos === 2) monedas = Math.floor(base * SEGUNDO_LUGAR_PCT);

    if (miPos === 1) estado.victorias++;
    else if (miPos === 2) estado.segundos++;
    else estado.terceros++;

    const tiempoMs = Math.round(tiempoCarreraMs);
    if (miPos === 1 && (estado.mejorTiempoMs === 0 || tiempoMs < estado.mejorTiempoMs)) {
        estado.mejorTiempoMs = tiempoMs;
    }
    estado.monedasGanadasTotales += monedas;

    guardarEstado();
    setTimeout(() => mostrarFinCarrera(miPos, monedas, tiempoMs), 400);
    if (monedas > 0) otorgarMonedas(monedas);
}

async function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear('flag', APP_ID, 'Carrera en Vagonetas', cantidad);
    } catch (e) {
        console.warn('[Vagonetas] No se pudo otorgar:', e);
    }
}

function mostrarFinCarrera(pos, monedas, tiempoMs) {
    const icono   = document.getElementById('vgFinIcono');
    const titulo  = document.getElementById('vgFinTitulo');
    const sub     = document.getElementById('vgFinSubtitulo');
    const elPos   = document.getElementById('vgFinPos');
    const elTime  = document.getElementById('vgFinTiempo');
    const elMapa  = document.getElementById('vgFinMapa');
    const elRacha = document.getElementById('vgFinRacha');
    const elMon   = document.getElementById('vgFinMonedas');

    const ords = ['1º', '2º', '3º'];
    elPos.textContent = ords[pos - 1] || '—';
    elTime.textContent = (tiempoMs / 1000).toFixed(1) + 's';
    elMapa.textContent = mapaActual?.nombre || '—';
    elRacha.textContent = estado.rachaDias + ' día' + (estado.rachaDias === 1 ? '' : 's');
    elMon.textContent = '+' + monedas;

    if (pos === 1) {
        icono.className = 'vg-screen-icono ganaste';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Primer lugar!';
        sub.textContent = 'Cruzaste la meta primero.';
    } else if (pos === 2) {
        icono.className = 'vg-screen-icono segundo';
        icono.innerHTML = '<i data-lucide="award"></i>';
        titulo.textContent = '¡Segundo lugar!';
        sub.textContent = 'Casi lo tenés. Una más y ganás.';
    } else {
        icono.className = 'vg-screen-icono tercero';
        icono.innerHTML = '<i data-lucide="x"></i>';
        titulo.textContent = 'Tercer lugar';
        sub.textContent = 'Los rivales fueron más rápidos esta vez.';
    }
    document.getElementById('vgScreenFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

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
            estado = { ...estado, ...data };
            estado.victorias = Number.isFinite(estado.victorias) ? estado.victorias : 0;
            estado.segundos  = Number.isFinite(estado.segundos) ? estado.segundos : 0;
            estado.terceros  = Number.isFinite(estado.terceros) ? estado.terceros : 0;
            estado.rachaDias = Number.isFinite(estado.rachaDias) ? estado.rachaDias : 1;
            estado.mejorTiempoMs = Number.isFinite(estado.mejorTiempoMs) ? estado.mejorTiempoMs : 0;
            estado.monedasGanadasTotales = Number.isFinite(estado.monedasGanadasTotales) ? estado.monedasGanadasTotales : 0;
        }
    } catch (e) {
        console.warn('[Vagonetas] Error cargando:', e);
    }
}

async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    estado.ultimaVez = new Date().toISOString();
    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[Vagonetas] Error guardando:', e);
    }
}

// ============================================================
function bindBotones() {
    document.getElementById('vgBtnEmpezar')?.addEventListener('click', () => {
        if (!mapaElegido) return;
        iniciarCarrera();
    });
    document.getElementById('vgBtnReintentar')?.addEventListener('click', () => iniciarCarrera());
    document.getElementById('vgBtnCambiarMapa')?.addEventListener('click', () => {
        document.getElementById('vgScreenFin').hidden = true;
        document.getElementById('vgScreenStart').hidden = false;
        window.VG_Escena.limpiarEscena();
        fase = 'idle';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        actualizarBotonEmpezar();
        renderMapas();
    });
}

// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Vagonetas necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('vgUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarEstado();
    actualizarRachaAlEntrar();

    const mapaBase = MAPAS.find(m => m.esBase);
    if (mapaBase) mapaElegido = mapaBase.id;

    renderMapas();
    actualizarBotonEmpezar();
    bindControles();
    bindBotones();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
