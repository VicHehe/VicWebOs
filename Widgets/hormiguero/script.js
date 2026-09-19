// ============================================================
//  Widget: Hormiguero — Ecosistema vivo
//  ------------------------------------------------------------
//  Empiezas con 2 hormigas, 1 espacio de tierra, 5 comida.
//  Las hormigas cavan solas, se reproducen si comen,
//  y su comportamiento depende del clima y la hora reales.
//
//  Persistencia POR USUARIO en:
//      app/hormiguero/{codigo}hormiguero.json
//
//  Clima vía Open-Meteo (con geolocation del iframe).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/hormiguero/';
const CLIMA_CACHE_MS = 30 * 60 * 1000;

// Constantes del ecosistema
const CONSUMO_POR_HORA       = 0.25;   // raciones/hora por hormiga
const HORAS_POR_REPRODUCCION = 8;      // horas de buen estado → 1 hormiga
const HORAS_POR_TUNEL        = 12;     // horas de trabajo → 1 túnel
const MAX_HORAS_SIM          = 24;     // cap simulación offline
const COMIDA_INICIAL         = 5;
const HORMIGAS_INICIALES     = 2;

const PRECIOS = {
    comida10:  15,
    tierra:    40,
    toldo:     60,
    comedero:  80,
    hoja:       8,
    piedrita:   5,
    hongo:     20
};

// ---------- ESTADO ----------
let usuarioActual = null;
let monedas = 0;

const estado = {
    hormigas: HORMIGAS_INICIALES,
    comida: COMIDA_INICIAL,
    espaciosTierra: 1,
    tunelesCavados: 0,
    progresoTunel: 0,        // 0 a 1 para el túnel en progreso
    progresoRepro: 0,        // 0 a 1 para la siguiente hormiga
    tieneToldo: false,
    tieneComedero: false,
    decoraciones: [],        // ['hoja', 'piedra', ...]
    ultimaSimulacion: new Date().toISOString()
};

let climaActual = 'nublado';   // soleado | nublado | lluvioso
let esDia = true;

// ---------- CANVAS ----------
let canvas, ctx;
let rafId = null;
let ultimoTiempo = 0;
let inicializado = false;
let comprando = false;

const hormigas = [];
let gotasLluvia = [];

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
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2400);
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

        if (Number.isFinite(data.hormigas))       estado.hormigas = Math.max(0, data.hormigas);
        if (Number.isFinite(data.comida))         estado.comida = Math.max(0, data.comida);
        if (Number.isFinite(data.espaciosTierra)) estado.espaciosTierra = Math.max(1, data.espaciosTierra);
        if (Number.isFinite(data.tunelesCavados)) estado.tunelesCavados = Math.max(0, data.tunelesCavados);
        if (Number.isFinite(data.progresoTunel))  estado.progresoTunel = data.progresoTunel;
        if (Number.isFinite(data.progresoRepro))  estado.progresoRepro = data.progresoRepro;
        if (typeof data.tieneToldo === 'boolean')    estado.tieneToldo = data.tieneToldo;
        if (typeof data.tieneComedero === 'boolean') estado.tieneComedero = data.tieneComedero;
        if (Array.isArray(data.decoraciones))        estado.decoraciones = data.decoraciones;
        if (data.ultimaSimulacion)                   estado.ultimaSimulacion = data.ultimaSimulacion;
    } catch (e) { /* no existe */ }
}

async function guardar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        estado.ultimaSimulacion = new Date().toISOString();
        await bd.escribirArchivo(ruta, {
            version: 1,
            hormigas: estado.hormigas,
            comida: estado.comida,
            espaciosTierra: estado.espaciosTierra,
            tunelesCavados: estado.tunelesCavados,
            progresoTunel: estado.progresoTunel,
            progresoRepro: estado.progresoRepro,
            tieneToldo: estado.tieneToldo,
            tieneComedero: estado.tieneComedero,
            decoraciones: estado.decoraciones,
            ultimaSimulacion: estado.ultimaSimulacion
        });
    } catch (e) {
        console.warn('[Hormiguero] No se pudo guardar:', e);
    }
}

// ============================================================
//  CLIMA (Open-Meteo + geolocation)
// ============================================================
function leerCacheClima() {
    try {
        const raw = localStorage.getItem('hg_clima_cache');
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (Date.now() - data.ts > CLIMA_CACHE_MS) return null;
        return data;
    } catch (e) { return null; }
}

function guardarCacheClima() {
    try {
        localStorage.setItem('hg_clima_cache', JSON.stringify({
            clima: climaActual,
            esDia,
            ts: Date.now()
        }));
    } catch (e) { /* silencioso */ }
}

function codigoAClima(code, isDay) {
    if (!isDay) return 'noche';
    if (code >= 51) return 'lluvioso';      // llovizna, lluvia, tormenta
    if (code >= 2 && code <= 48) return 'nublado';
    return 'soleado';
}

async function cargarClima() {
    // 1. Cache primero
    const cache = leerCacheClima();
    if (cache) {
        climaActual = cache.clima;
        esDia = cache.esDia;
        return;
    }

    // 2. Intentar geolocation + Open-Meteo
    if (!navigator.geolocation) {
        actualizarClimaHora();
        return;
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=weather_code,is_day&timezone=auto`;
                    const res = await fetch(url);
                    const data = await res.json();
                    if (data && data.current) {
                        const c = codigoAClima(data.current.weather_code, data.current.is_day);
                        climaActual = c;
                        esDia = data.current.is_day === 1;
                        guardarCacheClima();
                    } else {
                        actualizarClimaHora();
                    }
                } catch (e) {
                    actualizarClimaHora();
                }
                resolve();
            },
            () => {
                actualizarClimaHora();
                resolve();
            },
            { timeout: 5000 }
        );
    });
}

function actualizarClimaHora() {
    // Fallback: usar la hora local para día/noche, día=nublado
    const h = new Date().getHours();
    esDia = h >= 7 && h < 20;
    if (!esDia) climaActual = 'noche';
    else climaActual = 'nublado';
}

function factorClima() {
    if (!esDia) return { cavado: 0.3, repro: 0.2, recolecta: 0 };

    // Toldo reduce el impacto de la lluvia
    const lluviaSuave = estado.tieneToldo;

    if (climaActual === 'soleado')  return { cavado: 1.5, repro: 1.5, recolecta: 1.0 };
    if (climaActual === 'lluvioso') return lluviaSuave
        ? { cavado: 1.5, repro: 0.6, recolecta: 0.2 }
        : { cavado: 2.0, repro: 0.3, recolecta: 0.0 };
    return { cavado: 1.0, repro: 1.0, recolecta: 0.6 }; // nublado
}

// ============================================================
//  SIMULACIÓN
// ============================================================
function maxHormigas() {
    return 2 + estado.espaciosTierra * 3;
}

async function simularTiempoPasado() {
    const ahora = Date.now();
    const ultima = new Date(estado.ultimaSimulacion).getTime();
    let deltaMs = ahora - ultima;

    if (!isFinite(deltaMs) || deltaMs < 60000) return;   // menos de 1 min, no simular
    if (deltaMs > MAX_HORAS_SIM * 3600 * 1000) {
        deltaMs = MAX_HORAS_SIM * 3600 * 1000;
    }

    const horas = deltaMs / 3600000;
    const f = factorClima();

    // 1. Consumo de comida
    const consumo = horas * CONSUMO_POR_HORA * estado.hormigas;
    estado.comida = Math.max(0, estado.comida - consumo);

    // 2. Recolección (si es de día y no llueve mucho)
    const recoleccionBase = 0.08;   // por hora por hormiga
    const bonus = estado.tieneComedero ? 2 : 1;
    const recolectado = horas * recoleccionBase * estado.hormigas * f.recolecta * bonus;
    estado.comida += recolectado;

    // 3. Reproducción (requiere comida >= 3× hormigas y espacio)
    if (estado.comida >= estado.hormigas * 3 && estado.hormigas < maxHormigas()) {
        const progreso = horas / HORAS_POR_REPRODUCCION * f.repro;
        estado.progresoRepro += progreso;

        while (estado.progresoRepro >= 1 && estado.hormigas < maxHormigas()) {
            estado.progresoRepro -= 1;
            estado.hormigas++;
            // Cada nacimiento consume 3 raciones
            estado.comida = Math.max(0, estado.comida - 3);
        }
    } else {
        // Sin condiciones: el progreso se enfría
        estado.progresoRepro = Math.max(0, estado.progresoRepro - 0.1);
    }

    // 4. Cavado (si hay espacios sin cavar)
    if (estado.tunelesCavados < estado.espaciosTierra) {
        const progreso = horas / HORAS_POR_TUNEL * f.cavado;
        estado.progresoTunel += progreso;

        while (estado.progresoTunel >= 1 && estado.tunelesCavados < estado.espaciosTierra) {
            estado.progresoTunel -= 1;
            estado.tunelesCavados++;
        }
    } else {
        estado.progresoTunel = 0;
    }

    // 5. Actualizar timestamp
    estado.ultimaSimulacion = new Date().toISOString();
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

function anchoL() { return canvas.width / (window.devicePixelRatio || 1); }
function altoL()  { return canvas.height / (window.devicePixelRatio || 1); }

// Genera una semilla estable por usuario para las posiciones
function semillaUsuario() {
    const cod = usuarioActual?.codigo || 'invitado';
    let s = 0;
    for (let i = 0; i < cod.length; i++) s = (s * 31 + cod.charCodeAt(i)) >>> 0;
    return s;
}

function randomDeterminista(seed) {
    // Mulberry32
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = seed;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function posicionesTuneles() {
    const W = anchoL();
    const H = altoL();
    const rng = randomDeterminista(semillaUsuario());
    const posiciones = [];
    const total = Math.max(6, estado.espaciosTierra + 3);

    for (let i = 0; i < total; i++) {
        posiciones.push({
            x: 0.12 + rng() * 0.76,
            y: 0.35 + rng() * 0.55,
            r: 7 + rng() * 4
        });
    }
    return posiciones;
}

function crearHormiga() {
    const W = anchoL();
    const H = altoL();
    return {
        x: W * (0.3 + Math.random() * 0.4),
        y: H * (0.4 + Math.random() * 0.4),
        angle: Math.random() * Math.PI * 2,
        speed: 0.22 + Math.random() * 0.25,
        wiggle: Math.random() * Math.PI * 2,
        cambioTiempo: 800 + Math.random() * 1500,
        tarea: 'cavar' // 'cavar' | 'salir' | 'descansar'
    };
}

function sincronizarHormigas() {
    while (hormigas.length < estado.hormigas) hormigas.push(crearHormiga());
    while (hormigas.length > estado.hormigas) hormigas.pop();
}

function asignarTarea(h) {
    // Asignación basada en el clima
    const f = factorClima();
    const r = Math.random();

    if (!esDia) {
        h.tarea = 'descansar';
        return;
    }

    if (climaActual === 'lluvioso') {
        h.tarea = r < 0.15 ? 'salir' : 'cavar';
    } else if (climaActual === 'soleado') {
        h.tarea = r < 0.55 ? 'salir' : 'cavar';
    } else {
        h.tarea = r < 0.35 ? 'salir' : 'cavar';
    }
}

function actualizarHormiga(h, deltaMs) {
    const W = anchoL();
    const H = altoL();
    const superficieY = H * 0.18;   // línea imaginaria de superficie

    // Cambio periódico de tarea
    h.cambioTiempo -= deltaMs;
    if (h.cambioTiempo <= 0) {
        asignarTarea(h);
        h.cambioTiempo = 3000 + Math.random() * 5000;
    }

    // Movimiento según tarea
    if (h.tarea === 'descansar') {
        h.speed = 0.04;
    } else if (h.tarea === 'salir') {
        // Tienden a ir hacia arriba (superficie)
        const objetivoX = W * 0.5;
        const objetivoY = superficieY;
        const dx = objetivoX - h.x;
        const dy = objetivoY - h.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
            const ang = Math.atan2(dy, dx);
            h.angle += Math.sin(ang - h.angle) * 0.08;
        }
        h.speed = 0.28;
    } else {
        // Cavar: se mueven por la zona de abajo
        h.angle += (Math.random() - 0.5) * 0.15;
        h.speed = 0.20;
    }

    const paso = h.speed * (deltaMs / 16.67);
    h.x += Math.cos(h.angle) * paso;
    h.y += Math.sin(h.angle) * paso;

    // Rebote en paredes
    const margen = 6;
    if (h.x < margen)              { h.x = margen;   h.angle = Math.PI - h.angle; }
    if (h.x > W - margen)          { h.x = W - margen; h.angle = Math.PI - h.angle; }
    if (h.y < superficieY + margen){ h.y = superficieY + margen; h.angle = -h.angle; }
    if (h.y > H - margen)          { h.y = H - margen; h.angle = -h.angle; }

    h.wiggle += deltaMs * 0.014;
}

function dibujarFondo() {
    const W = anchoL();
    const H = altoL();
    const superficieY = H * 0.18;

    // Cielo / superficie
    let cieloTop, cieloBot;
    if (!esDia) {
        cieloTop = '#0A0A15'; cieloBot = '#1A1A2E';
    } else if (climaActual === 'soleado') {
        cieloTop = '#87CEEB'; cieloBot = '#FFE8B0';
    } else if (climaActual === 'lluvioso') {
        cieloTop = '#3A4A5E'; cieloBot = '#5A6A7E';
    } else {
        cieloTop = '#A8B4C4'; cieloBot = '#D0D8E0';
    }
    const grad1 = ctx.createLinearGradient(0, 0, 0, superficieY);
    grad1.addColorStop(0, cieloTop);
    grad1.addColorStop(1, cieloBot);
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, W, superficieY);

    // Sol / Luna
    if (esDia) {
        ctx.fillStyle = climaActual === 'soleado' ? '#FFD54A' : '#E0E4E8';
        ctx.beginPath();
        ctx.arc(W * 0.82, superficieY * 0.4, 8, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.fillStyle = '#E8E0C0';
        ctx.beginPath();
        ctx.arc(W * 0.82, superficieY * 0.4, 6, 0, Math.PI * 2);
        ctx.fill();
        // Estrella
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(W * 0.15, superficieY * 0.3, 1.5, 1.5);
        ctx.fillRect(W * 0.35, superficieY * 0.6, 1, 1);
    }

    // Tierra
    const grad2 = ctx.createLinearGradient(0, superficieY, 0, H);
    grad2.addColorStop(0, '#3E2A18');
    grad2.addColorStop(1, '#1A1008');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, superficieY, W, H - superficieY);

    // Granos de tierra
    ctx.fillStyle = 'rgba(232, 201, 155, 0.08)';
    for (let i = 0; i < 40; i++) {
        const x = (i * 73) % W;
        const y = superficieY + ((i * 47) % (H - superficieY));
        ctx.fillRect(x, y, 1.2, 1.2);
    }

    // Lluvia
    if (esDia && climaActual === 'lluvioso') {
        gotasLluvia.forEach(g => {
            ctx.fillStyle = 'rgba(180, 200, 220, 0.55)';
            ctx.fillRect(g.x, g.y, 1, g.largo);
        });
    }
}

function dibujarTuneles() {
    const W = anchoL();
    const H = altoL();
    const posiciones = posicionesTuneles();

    // Cavados completamente
    for (let i = 0; i < estado.tunelesCavados; i++) {
        const p = posiciones[i];
        if (!p) continue;
        const tx = W * p.x;
        const ty = H * p.y;

        // Hueco
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.ellipse(tx, ty, p.r, p.r * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();

        // Borde iluminado
        ctx.strokeStyle = 'rgba(232, 201, 155, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(tx, ty, p.r, p.r * 0.65, 0, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
    }

    // Túnel en progreso (parcial)
    if (estado.progresoTunel > 0 && estado.tunelesCavados < estado.espaciosTierra) {
        const p = posiciones[estado.tunelesCavados];
        if (p) {
            const tx = W * p.x;
            const ty = H * p.y;
            const r = p.r * estado.progresoTunel;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.ellipse(tx, ty, r, r * 0.65, 0, 0, Math.PI * 2);
            ctx.fill();

            // Partículas de excavación
            ctx.fillStyle = 'rgba(232, 201, 155, 0.30)';
            for (let k = 0; k < 4; k++) {
                const ang = (k / 4) * Math.PI * 2 + Date.now() * 0.001;
                ctx.fillRect(
                    tx + Math.cos(ang) * (r + 3),
                    ty + Math.sin(ang) * (r * 0.65 + 3),
                    1.2, 1.2
                );
            }
        }
    }
}

function dibujarDecoraciones() {
    const W = anchoL();
    const H = altoL();

    // Decoraciones simples: dibujamos según el array
    estado.decoraciones.forEach((deco, i) => {
        const seedRng = randomDeterminista(semillaUsuario() + i * 7);
        const x = W * (0.1 + seedRng() * 0.8);
        const y = H * (0.3 + seedRng() * 0.6);

        if (deco === 'hoja') {
            ctx.fillStyle = '#4ADE80';
            ctx.beginPath();
            ctx.ellipse(x, y, 4, 2, seedRng() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        } else if (deco === 'piedrita') {
            ctx.fillStyle = '#8E8E88';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        } else if (deco === 'hongo') {
            ctx.fillStyle = esDia ? '#A0508A' : '#C084FC';
            ctx.beginPath();
            ctx.arc(x, y, 3.5, Math.PI, 0);
            ctx.fill();
            ctx.fillStyle = '#E8E0C0';
            ctx.fillRect(x - 1, y, 2, 4);
            if (!esDia) {
                // Glow
                ctx.fillStyle = 'rgba(192, 132, 252, 0.25)';
                ctx.beginPath();
                ctx.arc(x, y - 1, 9, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    });
}

function dibujarHormiga(h) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(-0.5, 0.8, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Color: descansar es más apagado
    const color = h.tarea === 'descansar' ? '#B0A88A' : '#E8C99B';
    ctx.fillStyle = color;

    ctx.beginPath();
    ctx.ellipse(-3.5, 0, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.8, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2.8, 0, 1.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 0.55;
    const wig = Math.sin(h.wiggle) * 1.2;

    for (let i = -1; i <= 1; i++) {
        const lx = i * 1.2;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 0.8, -2.8 + wig * (i === 0 ? 1 : 0.5));
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx - 0.8, 2.8 - wig * (i === 0 ? 1 : 0.5));
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(3.5, -0.5);
    ctx.lineTo(5.5, -1.8);
    ctx.moveTo(3.5, 0.5);
    ctx.lineTo(5.5, 1.8);
    ctx.stroke();

    ctx.restore();
}

function actualizarGotas() {
    const W = anchoL();
    const H = altoL();
    if (climaActual !== 'lluvioso' || !esDia) {
        gotasLluvia = [];
        return;
    }

    // Añadir gotas
    while (gotasLluvia.length < 25) {
        gotasLluvia.push({
            x: Math.random() * W,
            y: Math.random() * H * 0.18,
            largo: 4 + Math.random() * 5,
            vel: 0.4 + Math.random() * 0.4
        });
    }

    gotasLluvia.forEach(g => {
        g.y += g.vel;
        if (g.y > H * 0.18) {
            g.y = 0;
            g.x = Math.random() * W;
        }
    });
}

function loop(now) {
    if (!ultimoTiempo) ultimoTiempo = now;
    const deltaMs = Math.min(now - ultimoTiempo, 100);
    ultimoTiempo = now;

    // Actualizar
    sincronizarHormigas();
    for (const h of hormigas) actualizarHormiga(h, deltaMs);
    actualizarGotas();

    // Dibujar
    ctx.clearRect(0, 0, anchoL(), altoL());
    dibujarFondo();
    dibujarTuneles();
    dibujarDecoraciones();
    for (const h of hormigas) dibujarHormiga(h);

    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  UI
// ============================================================
function actualizarUI() {
    const statH = document.getElementById('hgStatHormigas');
    const statC = document.getElementById('hgStatComida');
    const statT = document.getElementById('hgStatTuneles');
    const climaEl = document.getElementById('hgClima');
    const saldoEl = document.getElementById('hgSaldo');

    if (statH) statH.textContent = `${estado.hormigas} / ${maxHormigas()}`;
    if (statC) statC.textContent = Math.floor(estado.comida);
    if (statT) statT.textContent = `${estado.tunelesCavados} / ${estado.espaciosTierra}`;
    if (saldoEl) saldoEl.textContent = monedas;

    // Clima
    if (climaEl) {
        const icono = !esDia ? 'moon'
                    : climaActual === 'lluvioso' ? 'cloud-rain'
                    : climaActual === 'soleado' ? 'sun'
                    : 'cloud';
        const texto = !esDia ? 'Noche'
                    : climaActual === 'lluvioso' ? 'Lluvia'
                    : climaActual === 'soleado' ? 'Soleado'
                    : 'Nublado';
        climaEl.className = 'hg-clima ' + (esDia ? climaActual : 'noche');
        climaEl.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    }

    // Botones principales
    const btnC = document.getElementById('hgBtnComida');
    const btnT = document.getElementById('hgBtnTierra');
    if (btnC) btnC.disabled = comprando || monedas < PRECIOS.comida10;
    if (btnT) btnT.disabled = comprando || monedas < PRECIOS.tierra;

    // Items de la tienda
    document.querySelectorAll('.hg-tienda-item').forEach(item => {
        const tipo = item.dataset.compra;
        const precio = PRECIOS[tipo] || 0;

        let bloqueado = comprando || monedas < precio;

        // Compras únicas
        if (tipo === 'toldo' && estado.tieneToldo) bloqueado = true;
        if (tipo === 'comedero' && estado.tieneComedero) bloqueado = true;

        item.disabled = bloqueado;

        // Etiquetas dinámicas
        if (tipo === 'toldo') {
            const desc = item.querySelector('.hg-tienda-desc');
            if (desc) desc.textContent = estado.tieneToldo ? 'Ya comprado' : 'La lluvia afecta 50% menos';
        }
        if (tipo === 'comedero') {
            const desc = item.querySelector('.hg-tienda-desc');
            if (desc) desc.textContent = estado.tieneComedero ? 'Ya comprado' : '×2 comida al salir';
        }
    });

    if (window.lucide) window.lucide.createIcons();
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
async function comprar(tipo) {
    if (comprando) return;

    // Compras únicas
    if (tipo === 'toldo' && estado.tieneToldo) {
        toast('Ya tienes el toldo', 'info');
        return;
    }
    if (tipo === 'comedero' && estado.tieneComedero) {
        toast('Ya tienes el comedero pro', 'info');
        return;
    }

    const api = API();
    if (!api) return;
    const precio = PRECIOS[tipo];
    if (!precio) return;

    comprando = true;
    actualizarUI();

    try {
        // Etiqueta según el tipo
        let etiqueta = tipo;
        if (tipo === 'comida10')   etiqueta = '10 raciones';
        if (tipo === 'tierra')     etiqueta = 'Ampliar tierra';
        if (tipo === 'toldo')      etiqueta = 'Toldo';
        if (tipo === 'comedero')   etiqueta = 'Comedero pro';
        if (tipo === 'hoja')       etiqueta = 'Hoja';
        if (tipo === 'piedrita')   etiqueta = 'Piedrita';
        if (tipo === 'hongo')      etiqueta = 'Hongo';

        await api.gastoBoleta('bug', 'hormiguero', etiqueta, precio);

        // Aplicar el efecto
        if (tipo === 'comida10') {
            estado.comida += 10;
            toast('+10 raciones', 'success');
        } else if (tipo === 'tierra') {
            estado.espaciosTierra++;
            toast('Tierra ampliada. ¡A cavar!', 'success');
        } else if (tipo === 'toldo') {
            estado.tieneToldo = true;
            toast('Toldo instalado', 'success');
        } else if (tipo === 'comedero') {
            estado.tieneComedero = true;
            toast('Comedero pro instalado', 'success');
        } else if (tipo === 'hoja' || tipo === 'piedrita' || tipo === 'hongo') {
            estado.decoraciones.push(tipo);
            toast('Decoración añadida', 'success');
        }

        await guardar();
        refrescarMonedas();
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    } finally {
        comprando = false;
        actualizarUI();
    }
}

// ============================================================
//  MODAL
// ============================================================
function abrirModal() {
    const modal = document.getElementById('hgModal');
    if (!modal) return;
    modal.hidden = false;
    actualizarUI();
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModal() {
    const modal = document.getElementById('hgModal');
    if (modal) modal.hidden = true;
}

// ============================================================
//  EVENTOS
// ============================================================
function inicializarEventos() {
    document.getElementById('hgBtnComida')?.addEventListener('click', () => comprar('comida10'));
    document.getElementById('hgBtnTierra')?.addEventListener('click', () => comprar('tierra'));
    document.getElementById('hgBtnMas')?.addEventListener('click', abrirModal);
    document.getElementById('hgModalCerrar')?.addEventListener('click', cerrarModal);

    document.getElementById('hgModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'hgModal') cerrarModal();
    });

    document.querySelectorAll('.hg-tienda-item').forEach(item => {
        item.addEventListener('click', () => comprar(item.dataset.compra));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !document.getElementById('hgModal').hidden) cerrarModal();
    });

    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'vicwebos_chequera_cambio') refrescarMonedas();
    });

    // Refrescar clima cada 5 minutos
    setInterval(async () => {
        const previo = climaActual;
        const previoDia = esDia;
        try { localStorage.removeItem('hg_clima_cache'); } catch (e) {}
        await cargarClima();
        if (previo !== climaActual || previoDia !== esDia) actualizarUI();
    }, 5 * 60 * 1000);

    // Guardar cada 60 segundos (para no perder progreso si cierran)
    setInterval(() => { guardar(); }, 60 * 1000);
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

    // 1. Cargar estado guardado
    await cargar();

    // 2. Clima
    await cargarClima();

    // 3. Simular tiempo pasado
    await simularTiempoPasado();
    await guardar();

    // 4. Canvas
    ajustarCanvas();
    window.addEventListener('resize', () => {
        ajustarCanvas();
        sincronizarHormigas();
    });

    // 5. Refrescar monedas
    refrescarMonedas();

    // 6. Sincronizar hormigas visuales
    sincronizarHormigas();

    // 7. UI
    actualizarUI();

    // 8. Eventos
    inicializarEventos();

    // 9. Loop
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
