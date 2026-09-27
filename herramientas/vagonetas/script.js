// ============================================================
//  Vagonetas — Motor del juego
//  ------------------------------------------------------------
//  · 3 carriles, 3D con Three.js
//  · Jugador + 2 rivales CPU
//  · 550m de carrera
//  · Recompensa por posición + racha diaria
//  · BD: 1 escritura al terminar
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'vagonetas';
const ARCHIVO_BASE = 'app/vagonetas/';

// Balance
const CARRILES_X        = [-2, 0, 2];
const DISTANCIA_META    = 550;     // metros
const VELOCIDAD_BASE    = 18;      // unidades por segundo
const VELOCIDAD_RIVAL_1 = 17.4;    // un poco más lento
const VELOCIDAD_RIVAL_2 = 18.6;    // un poco más rápido
const OBSTACULOS_CADA   = 1.35;    // segundos entre spawns
const CHOQUE_PENALIZACION = 0.45;  // multiplicador al chocar
const CHOQUE_DURACION   = 1.1;     // segundos penalizado

// Recompensas
const BASE_POR_CARRERA  = 10;
const TOPE_RACHA        = 60;      // tope absoluto de monedas por carrera
const SEGUNDO_LUGAR_PCT = 0.5;     // 50% del valor del 1º

// ---------- ESTADO ----------
let estado = {
    version: 1,
    victorias: 0,
    segundos: 0,
    terceros: 0,
    rachaDias: 1,
    ultimaFechaJugada: '',
    mejorTiempoMs: 0,
    monedasGanadasTotales: 0,
    ultimaVez: new Date().toISOString()
};

let usuarioActual = null;
let inicializado = false;
let mapaActual = null;
let mapaElegido = null;
let mapaPendienteCarga = null;

// Game
let fase = 'idle';   // idle | countdown | racing | finished
let tiempoCountdown = 3.0;
let tiempoCarreraMs = 0;
let obstaculosSpawnTimer = 0;
let proximoIdObstaculo = 1;

let jugador = crearJugadorVacio();
let rivales = [];
let obstaculos = [];

let rafId = null;
let ultimoFrameMs = 0;
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  FECHA CHILE
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
//  TEMA
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
//  TOAST
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
//  JUGADOR / RIVALES
// ============================================================
function crearJugadorVacio() {
    return {
        carril: 1,
        x: 0,
        targetX: 0,
        progreso: 0,
        velocidadMult: 1,
        penalizadoMs: 0,
        terminado: false,
        tiempoFinalMs: 0
    };
}

function crearRival(idx) {
    return {
        idx,
        carril: idx === 0 ? 0 : 2,
        progreso: 0,
        velocidad: idx === 0 ? VELOCIDAD_RIVAL_1 : VELOCIDAD_RIVAL_2,
        terminado: false,
        tiempoFinalMs: 0,
        // IA
        cambioPendiente: 0
    };
}

// ============================================================
//  MAPAS
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
        el.className = 'vg-mapa-card'
            + (bloqueado ? ' bloqueado' : '')
            + (elegido ? ' elegido' : '');
        el.dataset.id = m.id;
        el.disabled = bloqueado;

        // Preview: gradiente de fondo con los colores del mapa
        const colorCielo = '#' + m.cielo.toString(16).padStart(6, '0');
        const colorRiel  = '#' + m.riel.toString(16).padStart(6, '0');

        el.innerHTML = `
            <div class="vg-mapa-preview"
                 style="background: linear-gradient(180deg, ${colorCielo} 0%, ${colorRiel} 100%);">
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
//  RACHA
// ============================================================
function actualizarRachaAlEntrar() {
    const hoy = diaChileHoy();
    const ultima = estado.ultimaFechaJugada;

    if (!ultima) {
        estado.rachaDias = 1;
    } else {
        const diff = diasEntre(ultima, hoy);
        if (diff === 0) {
            // mismo día, no cambia
        } else if (diff === 1) {
            estado.rachaDias = (estado.rachaDias || 0) + 1;
        } else {
            estado.rachaDias = 1;
        }
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

// ============================================================
//  START / RESET
// ============================================================
function iniciarCarrera() {
    if (!mapaElegido) return;
    mapaActual = MAPAS.find(m => m.id === mapaElegido);
    if (!mapaActual) return;

    // Reset estado del juego
    jugador = crearJugadorVacio();
    rivales = [crearRival(0), crearRival(1)];
    obstaculos = [];
    obstaculosSpawnTimer = 0;
    proximoIdObstaculo = 1;
    tiempoCarreraMs = 0;
    tiempoCountdown = 3.0;

    // Ocultar pantallas
    document.getElementById('vgScreenStart').hidden = true;
    document.getElementById('vgScreenFin').hidden = true;

    // Foto del jugador
    const jugadorInfo = {
        foto: usuarioActual?.foto || null,
        inicial: (usuarioActual?.nombre || '?').charAt(0).toUpperCase()
    };

    // Init escena
    const contenedor = document.getElementById('vgCanvas');
    window.VG_Escena.init(contenedor, mapaActual, jugadorInfo);

    // Mostrar posiciones live
    const posLive = document.getElementById('vgPosLive');
    if (posLive) posLive.hidden = false;

    // Fase
    fase = 'countdown';
    mostrarCountdown();
    actualizarHUD();

    ultimoFrameMs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    // Listeners de resize
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
//  INPUT
// ============================================================
function moverIzquierda() {
    if (fase !== 'racing') return;
    if (jugador.carril > 0) {
        jugador.carril--;
        jugador.targetX = CARRILES_X[jugador.carril];
    }
}

function moverDerecha() {
    if (fase !== 'racing') return;
    if (jugador.carril < 2) {
        jugador.carril++;
        jugador.targetX = CARRILES_X[jugador.carril];
    }
}

function bindControles() {
    // Tap zones
    document.querySelectorAll('.vg-tap-zone').forEach(zona => {
        zona.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (zona.dataset.dir === 'left') moverIzquierda();
            else moverDerecha();
        });
    });

    // Teclado (bonus en PC)
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
//  LOOP
// ============================================================
function loop(now) {
    if (fase === 'idle') return;
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const dt = Math.min((now - ultimoFrameMs) / 1000, 0.1);
    ultimoFrameMs = now;

    if (fase === 'countdown') {
        tickCountdown(dt);
    } else if (fase === 'racing') {
        tickCarrera(dt);
    }

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

    // Velocidad base del jugador
    let velJugador = VELOCIDAD_BASE;
    if (jugador.penalizadoMs > 0) {
        jugador.penalizadoMs -= dt * 1000;
        velJugador *= CHOQUE_PENALIZACION;
    }

    // Progreso
    jugador.progreso += velJugador * dt;
    rivales.forEach(r => {
        if (r.terminado) return;
        r.progreso += r.velocidad * dt;
    });

    // Suavizado del jugador x
    jugador.x += (jugador.targetX - jugador.x) * Math.min(dt * 12, 1);

    // Spawn de obstáculos
    obstaculosSpawnTimer -= dt;
    if (obstaculosSpawnTimer <= 0) {
        spawnObstaculo();
        obstaculosSpawnTimer = OBSTACULOS_CADA * (0.8 + Math.random() * 0.4);
    }

    // Mover obstáculos
    obstaculos.forEach(o => {
        o.z += velJugador * dt;
    });
    // Filtrar (los que ya pasaron)
    obstaculos = obstaculos.filter(o => o.z < 15);

    // Colisiones
    for (const o of obstaculos) {
        if (o.golpeado) continue;
        if (Math.abs(o.z) < 0.9 && o.carril === jugador.carril) {
            o.golpeado = true;
            jugador.penalizadoMs = CHOQUE_DURACION * 1000;
        }
    }

    // IA rivales
    rivales.forEach(r => tickRival(r, dt));

    // Update escena
    window.VG_Escena.updateEscena(
        jugador.x,
        jugador.progreso,
        rivales,
        obstaculos,
        dt
    );

    // Posición live
    actualizarPosLive();

    // HUD
    actualizarHUD();

    // ¿Terminó la carrera?
    chequearFin();
}

function tickRival(r, dt) {
    if (r.terminado) return;
    if (r.cambioPendiente > 0) {
        r.cambioPendiente -= dt;
        return;
    }

    // IA simple: mirar obstáculos cercanos en mi carril
    const miZ = -(r.progreso - jugador.progreso);
    const enRango = obstaculos.filter(o =>
        o.carril === r.carril &&
        o.z > miZ - 30 &&
        o.z < miZ + 5
    );

    if (enRango.length > 0) {
        // Intentar cambiar de carril
        const libres = [0, 1, 2].filter(c => {
            if (c === r.carril) return false;
            return !obstaculos.some(o =>
                o.carril === c &&
                o.z > miZ - 25 &&
                o.z < miZ + 5
            );
        });
        if (libres.length > 0) {
            // Elegir el más cercano
            libres.sort((a, b) => Math.abs(a - r.carril) - Math.abs(b - r.carril));
            r.carril = libres[0];
            r.cambioPendiente = 0.5;
        }
    }
}

function spawnObstaculo() {
    const carril = Math.floor(Math.random() * 3);
    // Evitar spawn sobre otro muy cercano
    const muyCerca = obstaculos.some(o => o.carril === carril && o.z < -60);
    if (muyCerca) return;

    obstaculos.push({
        id: proximoIdObstaculo++,
        carril,
        z: -180 - Math.random() * 20,
        golpeado: false
    });
}

// ============================================================
//  POSICIÓN Y HUD
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

    const nombres = [
        'Tú',
        'Rival 1',
        'Rival 2'
    ];

    // Actualizar las 3 posiciones
    for (let i = 0; i < 3; i++) {
        const item = lista[i];
        if (!item) continue;
        const elNombre = document.getElementById('vgPos' + (i + 1));
        if (elNombre) {
            if (item.tipo === 'jugador') {
                elNombre.textContent = 'Tú';
                elNombre.classList.add('tu-nombre');
            } else {
                elNombre.textContent = 'Rival ' + (item.idx + 1);
                elNombre.classList.remove('tu-nombre');
            }
        }
    }

    // Destacar el item del jugador
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
    if (elTime) {
        const s = (tiempoCarreraMs / 1000).toFixed(1);
        elTime.textContent = s + 's';
    }
}

// ============================================================
//  FIN DE CARRERA
// ============================================================
function chequearFin() {
    // ¿Alguien terminó?
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

    // Calcular posición
    const lista = calcularPosicion();
    const miPos = lista.findIndex(x => x.tipo === 'jugador') + 1;

    // Recompensa
    let monedas = 0;
    const base = calcularPremioBase();
    if (miPos === 1)      monedas = base;
    else if (miPos === 2) monedas = Math.floor(base * SEGUNDO_LUGAR_PCT);
    else                  monedas = 0;

    // Actualizar stats
    if (miPos === 1) estado.victorias++;
    else if (miPos === 2) estado.segundos++;
    else estado.terceros++;

    const tiempoMs = Math.round(tiempoCarreraMs);
    if (miPos === 1 && (estado.mejorTiempoMs === 0 || tiempoMs < estado.mejorTiempoMs)) {
        estado.mejorTiempoMs = tiempoMs;
    }
    estado.monedasGanadasTotales += monedas;

    guardarEstado();

    // UI
    setTimeout(() => {
        mostrarFinCarrera(miPos, monedas, tiempoMs);
    }, 500);

    if (monedas > 0) {
        otorgarMonedas(monedas);
    }
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
    if (window.lucide) lucide.createIcons();
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
            estado = { ...estado, ...data };
            // Normalizar
            estado.victorias           = Number.isFinite(estado.victorias) ? estado.victorias : 0;
            estado.segundos            = Number.isFinite(estado.segundos) ? estado.segundos : 0;
            estado.terceros            = Number.isFinite(estado.terceros) ? estado.terceros : 0;
            estado.rachaDias           = Number.isFinite(estado.rachaDias) ? estado.rachaDias : 1;
            estado.mejorTiempoMs       = Number.isFinite(estado.mejorTiempoMs) ? estado.mejorTiempoMs : 0;
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
//  BOTONES
// ============================================================
function bindBotones() {
    document.getElementById('vgBtnEmpezar')?.addEventListener('click', () => {
        if (!mapaElegido) return;
        iniciarCarrera();
    });

    document.getElementById('vgBtnReintentar')?.addEventListener('click', () => {
        iniciarCarrera();
    });

    document.getElementById('vgBtnCambiarMapa')?.addEventListener('click', () => {
        // Volver a la pantalla de selección
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
//  INIT
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

    // Elegir automáticamente el mapa base por defecto
    const mapaBase = MAPAS.find(m => m.esBase);
    if (mapaBase) mapaElegido = mapaBase.id;

    renderMapas();
    actualizarBotonEmpezar();
    bindControles();
    bindBotones();

    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
