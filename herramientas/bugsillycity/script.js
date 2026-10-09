// ============================================================
//  BugSillyCity — Juego de cría de bichos
//  ------------------------------------------------------------
//  · 12 criaturas: 3 base + 9 por cría.
//  · Hábitats en canvas (visual).
//  · Producción: 80 OS/día total. Créditos internos.
//  · Datos en app/bugsillycity/{codigo}bugsillycity.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'bugsillycity';
const ARCHIVO_BASE = 'app/bugsillycity/';

const DAILY_OS_LIMIT = 80;
const MAX_ACCUMULATION_HOURS = 12;
const MAX_HABITATS = 6;
const MAX_CRIATURAS = 40;

const CRIATURAS = {
    escarabajo: { id:'escarabajo', nombre:'Escarabajo', icono:'bug', color:'#22C55E', colorOscuro:'#15803D', rareza:'base', tier:1, osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0, descripcion:'Un bicho robusto y confiable. Perfecto para empezar.' },
    hormiga:    { id:'hormiga',    nombre:'Hormiga',    icono:'bug', color:'#A16207', colorOscuro:'#713F12', rareza:'base', tier:1, osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0, descripcion:'Trabajadora incansable. Nunca se detiene.' },
    arana:      { id:'arana',      nombre:'Araña',      icono:'bug', color:'#7C3AED', colorOscuro:'#5B21B6', rareza:'base', tier:1, osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0, descripcion:'Tejedora de redes. Misteriosa y elegante.' },
    luciernaga: { id:'luciernaga', nombre:'Luciérnaga', icono:'zap', color:'#FCD34D', colorOscuro:'#B45309', rareza:'intermedio', tier:2, osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000, descripcion:'Ilumina la noche. Vuela libre y brillante.' },
    mariposa:   { id:'mariposa',   nombre:'Mariposa',   icono:'feather', color:'#EC4899', colorOscuro:'#9D174D', rareza:'intermedio', tier:2, osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000, descripcion:'Delicada y colorida. Un espectáculo al volar.' },
    libelula:   { id:'libelula',   nombre:'Libélula',   icono:'wind', color:'#06B6D4', colorOscuro:'#0E7490', rareza:'intermedio', tier:2, osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000, descripcion:'Rápida y ágil. Domina el aire.' },
    mariquita:  { id:'mariquita',  nombre:'Mariquita',  icono:'heart', color:'#EF4444', colorOscuro:'#991B1B', rareza:'avanzado', tier:3, osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000, descripcion:'Símbolo de buena suerte. Pequeña pero poderosa.' },
    polilla:    { id:'polilla',    nombre:'Polilla',    icono:'moon', color:'#6B7280', colorOscuro:'#374151', rareza:'avanzado', tier:3, osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000, descripcion:'Atraída por la luz. Nocturna y enigmática.' },
    mantis:     { id:'mantis',     nombre:'Mantis',     icono:'swords', color:'#10B981', colorOscuro:'#047857', rareza:'avanzado', tier:3, osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000, descripcion:'Cazadora letal. Paciente y precisa.' },
    escorpion:  { id:'escorpion',  nombre:'Escorpión',  icono:'shield', color:'#F97316', colorOscuro:'#9A3412', rareza:'epico', tier:4, osRate:10/24, creditsRate:10, precio:0, breedTimeMs:120000, hatchTimeMs:60000, descripcion:'Su aguijón es temido por todos. Rey del desierto.' },
    ciempies:   { id:'ciempies',   nombre:'Ciempiés',   icono:'link', color:'#84CC16', colorOscuro:'#4D7C0F', rareza:'epico', tier:4, osRate:10/24, creditsRate:10, precio:0, breedTimeMs:120000, hatchTimeMs:60000, descripcion:'Mil patas, un solo objetivo. Imparable.' },
    escarabajo_dorado: { id:'escarabajo_dorado', nombre:'Escarabajo Dorado', icono:'crown', color:'#EAB308', colorOscuro:'#A16207', rareza:'legendario', tier:5, osRate:12/24, creditsRate:16, precio:0, breedTimeMs:300000, hatchTimeMs:120000, descripcion:'La criatura más rara. Solo los mejores criadores lo obtienen.' }
};

const COMBINACIONES = {
    'arana+escarabajo': 'luciernaga',
    'escarabajo+hormiga': 'mariposa',
    'arana+hormiga': 'libelula',
    'luciernaga+mariposa': 'mariquita',
    'libelula+mariposa': 'polilla',
    'libelula+luciernaga': 'mantis',
    'mariquita+polilla': 'escorpion',
    'mantis+polilla': 'ciempies',
    'ciempies+escorpion': 'escarabajo_dorado'
};

const HABITAT_CONFIG = {
    nivelMax: 4,
    slotsPorNivel: { 1: 2, 2: 4, 3: 6, 4: 8 },
    costos: { 1: 100, 2: 300, 3: 800, 4: 2000 },
    nombres: { 1: 'Pequeño', 2: 'Mediano', 3: 'Grande', 4: 'Colosal' }
};

const CREDITOS_INICIALES = 500;

const API = () => { try { return (window.parent && window.parent.__vicwebos) || null; } catch(e) { return null; } };
const BD  = () => { try { return (window.parent && window.parent.ConfigBD) || null; } catch(e) { return null; } };

let usuarioActual = null;
let estado = null;
let inicializado = false;
let toastTimer = null;
let rafId = null;
let ultimoTick = 0;

const $ = (id) => document.getElementById(id);

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const sp = getComputedStyle(window.parent.document.documentElement);
        ['--violet-50','--violet-100','--violet-200','--violet-300','--violet-400','--violet-500','--violet-600','--violet-700','--white','--bg','--bg-alt','--gray-50','--gray-100','--gray-200','--gray-300','--gray-400','--gray-500','--gray-600','--gray-700','--gray-800','--gray-900','--border','--text','--text-2','--text-3','--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl','--accent-gradient','--accent-gradient-hover','--accent-shadow','--accent-shadow-hover','--accent-text-gradient','--r-sm','--r-md','--r-lg','--r-xl','--r-full'].forEach(v => {
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch(e) {}
}
window.addEventListener('message', (e) => { if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre(); });

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo = 'info') {
    const el = $('bcToast'); if (!el) return;
    el.textContent = texto;
    el.className = 'bc-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  UTILIDADES
// ============================================================
function formatearTiempo(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), ss = s % 60;
    if (m < 60) return m + 'm ' + ss + 's';
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 24) return h + 'h ' + mm + 'm';
    const d = Math.floor(h / 24), hh = h % 24;
    return d + 'd ' + hh + 'h';
}
function formatearNumero(n, dec = 0) {
    return Number(n).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function hoyLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function rutaArchivo() {
    if (!usuarioActual || !usuarioActual.codigo) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'bugsillycity.json';
}

// ============================================================
//  ESTADO
// ============================================================
function crearEstadoInicial() {
    return {
        version: 1,
        creditos: CREDITOS_INICIALES,
        criaturas: [],
        habitats: [],
        nido: null,
        huevos: [],
        osCosechadasHoy: 0,
        ultimaResetFecha: hoyLocal(),
        descubiertas: [],
        creada: new Date().toISOString()
    };
}

async function cargarEstado() {
    const bd = BD(), ruta = rutaArchivo();
    if (!bd || !ruta) return false;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object' && Array.isArray(data.criaturas)) {
            estado = data;
            if (!Array.isArray(estado.habitats)) estado.habitats = [];
            if (!Array.isArray(estado.huevos)) estado.huevos = [];
            if (typeof estado.creditos !== 'number') estado.creditos = CREDITOS_INICIALES;
            if (typeof estado.osCosechadasHoy !== 'number') estado.osCosechadasHoy = 0;
            if (!Array.isArray(estado.descubiertas)) estado.descubiertas = [];
            if (!estado.ultimaResetFecha) estado.ultimaResetFecha = hoyLocal();
            return true;
        }
    } catch (e) { console.warn('[BugSillyCity] Error cargando:', e); }
    estado = crearEstadoInicial();
    return false;
}

async function guardarEstado() {
    const bd = BD(), ruta = rutaArchivo();
    if (!bd || !ruta || !estado) return;
    try { await bd.escribirArchivo(ruta, estado); }
    catch (e) { console.warn('[BugSillyCity] Error guardando:', e); }
}

function chequearResetDiario() {
    const hoy = hoyLocal();
    if (estado.ultimaResetFecha !== hoy) {
        estado.osCosechadasHoy = 0;
        estado.ultimaResetFecha = hoy;
        guardarEstado();
        return true;
    }
    return false;
}

// ============================================================
//  PRODUCCIÓN
// ============================================================
function criaturaPorId(id) { return estado.criaturas.find(c => c.id === id) || null; }

function calcularAcumulado(criatura, ahora) {
    const def = CRIATURAS[criatura.tipo];
    if (!def) return { os: 0, creditos: 0 };
    const horas = (ahora - criatura.ultimaCosecha) / 3600000;
    const maxHoras = MAX_ACCUMULATION_HOURS;
    return {
        os: Math.min(horas, maxHoras) * def.osRate,
        creditos: horas * def.creditosRate
    };
}
function criaturaLista(criatura) { return calcularAcumulado(criatura, Date.now()).os >= 0.5; }
function habitatTieneListos(habitat) {
    return habitat.slots.some(id => { const c = criaturaPorId(id); return c && criaturaLista(c); });
}

// ============================================================
//  COSECHA
// ============================================================
function cosecharCriatura(criaturaId) {
    const criatura = criaturaPorId(criaturaId);
    if (!criatura) return;
    const ahora = Date.now();
    const acc = calcularAcumulado(criatura, ahora);
    if (acc.os < 0.5) { toast('Aún no está lista', 'info'); return; }
    const espacioDiario = DAILY_OS_LIMIT - estado.osCosechadasHoy;
    if (espacioDiario <= 0) { toast('Límite diario alcanzado (80 OS). Vuelve mañana.', 'error'); return; }
    const osACosechar = Math.min(acc.os, espacioDiario);
    const osRedondeadas = Math.floor(osACosechar * 10) / 10;
    const creditos = Math.floor(acc.creditos * 10) / 10;
    if (osRedondeadas <= 0 && creditos <= 0) { toast('Aún no hay nada que cosechar', 'info'); return; }
    estado.osCosechadasHoy += osRedondeadas;
    estado.creditos += creditos;
    criatura.ultimaCosecha = ahora;
    const osEnteras = Math.floor(osRedondeadas);
    if (osEnteras > 0) otorgarOS(osEnteras);
    guardarEstado();
    actualizarUI();
    dibujarHabitats();
    let msg = '';
    if (osRedondeadas > 0) msg += '+' + osRedondeadas.toFixed(1) + ' OS ';
    if (creditos > 0) msg += '+' + creditos.toFixed(1) + ' créditos';
    toast(msg.trim(), 'success');
}

async function otorgarOS(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try { await api.canjear('egg', APP_ID, 'Cosecha en BugSillyCity', cantidad); }
    catch (e) { console.warn('[BugSillyCity] Error otorgando OS:', e); }
}

// ============================================================
//  CRÍA
// ============================================================
function combinacionValida(id1, id2) {
    return COMBINACIONES[[id1, id2].sort().join('+')] || null;
}
function iniciarCria() {
    const s1 = $('bcNidoSlot1').dataset.criaturaId;
    const s2 = $('bcNidoSlot2').dataset.criaturaId;
    const msg = $('bcNidoMensaje');
    if (!s1 || !s2) { msg.textContent = 'Elegí dos criaturas para criar.'; msg.className = 'bc-status error'; return; }
    if (s1 === s2) { msg.textContent = 'No podés criar una criatura consigo misma.'; msg.className = 'bc-status error'; return; }
    const c1 = criaturaPorId(s1), c2 = criaturaPorId(s2);
    if (!c1 || !c2) return;
    const resultId = combinacionValida(c1.tipo, c2.tipo);
    if (!resultId) { msg.textContent = 'Estas criaturas no son compatibles.'; msg.className = 'bc-status error'; return; }
    const def = CRIATURAS[resultId];
    estado.nido = { padre1: s1, padre2: s2, finMs: Date.now() + def.breedTimeMs, resultado: resultId };
    guardarEstado();
    renderNido();
    toast('Cría iniciada. Tiempo: ' + formatearTiempo(def.breedTimeMs), 'info');
}
function recolectarHuevo() {
    if (!estado.nido) return;
    const def = CRIATURAS[estado.nido.resultado];
    estado.huevos.push({
        id: 'egg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        tipo: estado.nido.resultado,
        inicioMs: Date.now(),
        finMs: Date.now() + def.hatchTimeMs
    });
    if (!estado.descubiertas.includes(estado.nido.resultado)) estado.descubiertas.push(estado.nido.resultado);
    estado.nido = null;
    guardarEstado();
    renderNido();
    renderGuarderia();
    toast('¡Huevo obtenido! Ponelo a eclosionar.', 'success');
}

// ============================================================
//  GUARDERÍA
// ============================================================
function eclosionarHuevo(eggId) {
    const idx = estado.huevos.findIndex(h => h.id === eggId);
    if (idx === -1) return;
    const huevo = estado.huevos[idx];
    if (Date.now() < huevo.finMs) { toast('Aún no está listo', 'info'); return; }
    if (estado.criaturas.length >= MAX_CRIATURAS) { toast('No tenés espacio para más criaturas', 'error'); return; }
    const habitatConEspacio = estado.habitats.find(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
    if (!habitatConEspacio) { toast('No hay hábitats con espacio. Comprá o mejorá uno.', 'error'); return; }
    const nuevaCriatura = {
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        tipo: huevo.tipo,
        habitatId: habitatConEspacio.id,
        ultimaCosecha: Date.now()
    };
    estado.criaturas.push(nuevaCriatura);
    habitatConEspacio.slots.push(nuevaCriatura.id);
    estado.huevos.splice(idx, 1);
    guardarEstado();
    renderGuarderia();
    dibujarHabitats();
    toast('¡' + CRIATURAS[huevo.tipo].nombre + ' eclosionó!', 'success');
}

// ============================================================
//  HÁBITATS
// ============================================================
function comprarHabitat() {
    if (estado.habitats.length >= MAX_HABITATS) { toast('Máximo de hábitats alcanzado', 'error'); return; }
    const costo = HABITAT_CONFIG.costos[1];
    if (estado.creditos < costo) { toast('Te faltan créditos', 'error'); return; }
    estado.creditos -= costo;
    estado.habitats.push({
        id: 'hab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        nivel: 1, slots: []
    });
    guardarEstado();
    actualizarUI();
    configurarCanvasHab();
    dibujarHabitats();
    renderTienda();
    toast('Hábitat comprado', 'success');
}
function mejorarHabitat(habitatId) {
    const hab = estado.habitats.find(h => h.id === habitatId);
    if (!hab) return;
    if (hab.nivel >= HABITAT_CONFIG.nivelMax) { toast('Nivel máximo alcanzado', 'info'); return; }
    const nuevoNivel = hab.nivel + 1;
    const costo = HABITAT_CONFIG.costos[nuevoNivel];
    if (estado.creditos < costo) { toast('Te faltan ' + formatearNumero(costo - Math.floor(estado.creditos)) + ' créditos', 'error'); return; }
    estado.creditos -= costo;
    hab.nivel = nuevoNivel;
    guardarEstado();
    actualizarUI();
    configurarCanvasHab();
    dibujarHabitats();
    toast('Hábitat mejorado a nivel ' + nuevoNivel, 'success');
}

// ============================================================
//  TIENDA
// ============================================================
function comprarCriaturaBase(tipoId) {
    const def = CRIATURAS[tipoId];
    if (!def || def.rareza !== 'base') return;
    if (estado.criaturas.length >= MAX_CRIATURAS) { toast('No tenés espacio para más criaturas', 'error'); return; }
    if (estado.creditos < def.precio) { toast('Te faltan ' + formatearNumero(def.precio - Math.floor(estado.creditos)) + ' créditos', 'error'); return; }
    let habitatConEspacio = estado.habitats.find(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
    if (!habitatConEspacio) { toast('No hay hábitats con espacio. Comprá o mejorá uno.', 'error'); return; }
    estado.creditos -= def.precio;
    const nuevaCriatura = {
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        tipo: tipoId,
        habitatId: habitatConEspacio.id,
        ultimaCosecha: Date.now()
    };
    estado.criaturas.push(nuevaCriatura);
    habitatConEspacio.slots.push(nuevaCriatura.id);
    if (!estado.descubiertas.includes(tipoId)) estado.descubiertas.push(tipoId);
    guardarEstado();
    actualizarUI();
    dibujarHabitats();
    renderTienda();
    toast('¡' + def.nombre + ' comprado!', 'success');
}

// ============================================================
//  CANVAS DE HÁBITATS
// ============================================================
let canvasHab = null;
let ctxHab = null;

const HAB_ROW_H = 160;
const HAB_ROW_GAP = 14;
const HAB_PAD = 14;

function configurarCanvasHab() {
    canvasHab = $('bcHabitatCanvas');
    if (!canvasHab) return;
    const wrap = $('bcCanvasWrap');
    if (!wrap) return;

    const N = estado.habitats.length || 1;
    const needed = HAB_PAD * 2 + N * HAB_ROW_H + (N - 1) * HAB_ROW_GAP;
    const W = wrap.clientWidth;
    const H = Math.max(needed, wrap.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvasHab.width = W * dpr;
    canvasHab.height = H * dpr;
    canvasHab.style.width = W + 'px';
    canvasHab.style.height = H + 'px';
    ctxHab = canvasHab.getContext('2d');
    ctxHab.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function dibujarHabitats() {
    if (!ctxHab || !canvasHab || !estado) return;
    const W = parseInt(canvasHab.style.width);
    const H = parseInt(canvasHab.style.height);

    ctxHab.clearRect(0, 0, W, H);

    // Fondo general con gradiente verde suave
    const bgGrad = ctxHab.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#ECFDF5');
    bgGrad.addColorStop(1, '#D1FAE5');
    ctxHab.fillStyle = bgGrad;
    ctxHab.fillRect(0, 0, W, H);

    // Si no hay hábitats, mostramos mensaje
    if (estado.habitats.length === 0) {
        ctxHab.fillStyle = '#71717A';
        ctxHab.font = '700 14px Nunito, sans-serif';
        ctxHab.textAlign = 'center';
        ctxHab.textBaseline = 'middle';
        ctxHab.fillText('No tenés hábitats. Andá a la Tienda para comprar uno.', W / 2, H / 2);
        return;
    }

    let y = HAB_PAD;
    estado.habitats.forEach(hab => {
        dibujarPlotHab(hab, HAB_PAD, y, W - HAB_PAD * 2, HAB_ROW_H);
        y += HAB_ROW_H + HAB_ROW_GAP;
    });
}

function dibujarPlotHab(hab, x, y, w, h) {
    const maxSlots = HABITAT_CONFIG.slotsPorNivel[hab.nivel];
    const nombreNivel = HABITAT_CONFIG.nombres[hab.nivel];
    const tieneListos = habitatTieneListos(hab);

    // Sombra
    ctxHab.save();
    ctxHab.shadowColor = 'rgba(0,0,0,0.08)';
    ctxHab.shadowBlur = 12;
    ctxHab.shadowOffsetY = 4;

    // Plot background — pastizal
    roundRectPath(ctxHab, x, y, w, h, 18);
    ctxHab.fillStyle = '#FFFFFF';
    ctxHab.fill();

    // Grass area (sub-rect dentro del plot)
    const grassX = x + 10;
    const grassY = y + 44;
    const grassW = w - 20;
    const grassH = h - 44 - 42;

    roundRectPath(ctxHab, grassX, grassY, grassW, grassH, 14);
    const grassGrad = ctxHab.createLinearGradient(0, grassY, 0, grassY + grassH);
    grassGrad.addColorStop(0, '#BBF7D0');
    grassGrad.addColorStop(1, '#86EFAC');
    ctxHab.fillStyle = grassGrad;
    ctxHab.fill();

    // Restaurar sombra
    ctxHab.restore();

    // Puntos de pasto
    ctxHab.save();
    roundRectPath(ctxHab, grassX, grassY, grassW, grassH, 14);
    ctxHab.clip();
    ctxHab.fillStyle = 'rgba(21, 128, 61, 0.15)';
    for (let gy = grassY + 8; gy < grassY + grassH; gy += 14) {
        for (let gx = grassX + 8; gx < grassX + grassW; gx += 16) {
            const offset = ((gy - grassY) / 14) % 2 === 0 ? 0 : 8;
            ctxHab.beginPath();
            ctxHab.arc(gx + offset, gy, 1.5, 0, Math.PI * 2);
            ctxHab.fill();
        }
    }
    ctxHab.restore();

    // Borde del plot (cambia color si hay listos)
    roundRectPath(ctxHab, x, y, w, h, 18);
    ctxHab.strokeStyle = tieneListos ? '#F59E0B' : '#86EFAC';
    ctxHab.lineWidth = tieneListos ? 3 : 2;
    ctxHab.stroke();

    // Header: nombre del hábitat
    ctxHab.fillStyle = '#065F46';
    ctxHab.font = '900 15px Nunito, sans-serif';
    ctxHab.textAlign = 'left';
    ctxHab.textBaseline = 'middle';
    ctxHab.fillText('Hábitat ' + nombreNivel, x + 16, y + 22);

    // Badge de nivel (top-right)
    const badgeW = 78, badgeH = 24;
    const badgeX = x + w - 14 - badgeW;
    const badgeY = y + 10;
    roundRectPath(ctxHab, badgeX, badgeY, badgeW, badgeH, 12);
    const badgeGrad = ctxHab.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
    badgeGrad.addColorStop(0, '#8B5CF6');
    badgeGrad.addColorStop(1, '#6D28D9');
    ctxHab.fillStyle = badgeGrad;
    ctxHab.fill();
    ctxHab.fillStyle = '#FFFFFF';
    ctxHab.font = '800 11px Nunito, sans-serif';
    ctxHab.textAlign = 'center';
    ctxHab.textBaseline = 'middle';
    ctxHab.fillText('Nv.' + hab.nivel + ' · ' + hab.slots.length + '/' + maxSlots, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

    // Slots de criaturas
    dibujarSlotsHab(hab, grassX, grassY, grassW, grassH);

    // Footer: estado + botón mejorar
    const infoY = y + h - 21;
    ctxHab.fillStyle = tieneListos ? '#D97706' : '#71717A';
    ctxHab.font = '800 11px Nunito, sans-serif';
    ctxHab.textAlign = 'left';
    ctxHab.textBaseline = 'middle';
    ctxHab.fillText(tieneListos ? '¡Listo para cosechar!' : 'Produciendo…', x + 16, infoY);

    // Botón mejorar (guardamos su rect para el click)
    if (hab.nivel < HABITAT_CONFIG.nivelMax) {
        const costo = HABITAT_CONFIG.costos[hab.nivel + 1];
        const puede = estado.creditos >= costo;
        const btnW = 82, btnH = 26;
        const btnX = x + w - 14 - btnW;
        const btnY = y + h - 34;

        hab._btnMejorarRect = { x: btnX, y: btnY, w: btnW, h: btnH };

        roundRectPath(ctxHab, btnX, btnY, btnW, btnH, 13);
        if (puede) {
            const btnGrad = ctxHab.createLinearGradient(btnX, btnY, btnX + btnW, btnY + btnH);
            btnGrad.addColorStop(0, '#F59E0B');
            btnGrad.addColorStop(1, '#B45309');
            ctxHab.fillStyle = btnGrad;
        } else {
            ctxHab.fillStyle = '#D4D4DD';
        }
        ctxHab.fill();

        // Ícono flecha + costo
        ctxHab.fillStyle = puede ? '#FFFFFF' : '#71717A';
        ctxHab.font = '900 11.5px Nunito, sans-serif';
        ctxHab.textAlign = 'center';
        ctxHab.textBaseline = 'middle';
        ctxHab.fillText('↑ ' + formatearNumero(costo), btnX + btnW / 2, btnY + btnH / 2 + 0.5);
    } else {
        hab._btnMejorarRect = null;
    }

    // Guardar área del plot para hit-test
    hab._plotRect = { x, y, w, h };
}

function dibujarSlotsHab(hab, gx, gy, gw, gh) {
    const maxSlots = HABITAT_CONFIG.slotsPorNivel[hab.nivel];
    const slotR = 26;
    const gap = 12;

    // Calcular filas: 4 por fila máximo
    const porFila = Math.min(4, maxSlots);
    const filas = Math.ceil(maxSlots / porFila);

    const totalW = porFila * slotR * 2 + (porFila - 1) * gap;
    const totalH = filas * slotR * 2 + (filas - 1) * gap;

    const startX = gx + (gw - totalW) / 2 + slotR;
    const startY = gy + (gh - totalH) / 2 + slotR;

    hab._slotsHit = [];

    for (let i = 0; i < maxSlots; i++) {
        const fila = Math.floor(i / porFila);
        const col = i % porFila;
        const cx = startX + col * (slotR * 2 + gap);
        const cy = startY + fila * (slotR * 2 + gap);

        hab._slotsHit.push({ i, cx, cy, r: slotR });

        if (i < hab.slots.length) {
            const criatura = criaturaPorId(hab.slots[i]);
            if (criatura) {
                const def = CRIATURAS[criatura.tipo];
                const listo = criaturaLista(criatura);

                // Halo dorado si listo
                if (listo) {
                    ctxHab.beginPath();
                    ctxHab.arc(cx, cy, slotR + 5, 0, Math.PI * 2);
                    ctxHab.fillStyle = 'rgba(251, 191, 36, 0.35)';
                    ctxHab.fill();
                }

                // Cuerpo de la criatura
                const grd = ctxHab.createRadialGradient(cx - slotR * 0.35, cy - slotR * 0.35, 3, cx, cy, slotR);
                grd.addColorStop(0, def.color);
                grd.addColorStop(1, def.colorOscuro);
                ctxHab.beginPath();
                ctxHab.arc(cx, cy, slotR, 0, Math.PI * 2);
                ctxHab.fillStyle = grd;
                ctxHab.fill();

                // Borde
                ctxHab.strokeStyle = listo ? '#FBBF24' : 'rgba(255,255,255,0.9)';
                ctxHab.lineWidth = listo ? 3 : 2;
                ctxHab.stroke();

                // Borde interior oscuro para dar profundidad
                ctxHab.beginPath();
                ctxHab.arc(cx, cy, slotR - 1.5, 0, Math.PI * 2);
                ctxHab.strokeStyle = 'rgba(0,0,0,0.12)';
                ctxHab.lineWidth = 1.5;
                ctxHab.stroke();

                // Inicial de la criatura
                ctxHab.fillStyle = '#FFFFFF';
                ctxHab.font = '900 20px Nunito, sans-serif';
                ctxHab.textAlign = 'center';
                ctxHab.textBaseline = 'middle';
                ctxHab.fillText(def.nombre[0].toUpperCase(), cx, cy + 1);

                // Puntito de "listo"
                if (listo) {
                    ctxHab.beginPath();
                    ctxHab.arc(cx + slotR - 3, cy - slotR + 3, 7, 0, Math.PI * 2);
                    ctxHab.fillStyle = '#F59E0B';
                    ctxHab.fill();
                    ctxHab.strokeStyle = '#FFFFFF';
                    ctxHab.lineWidth = 2;
                    ctxHab.stroke();
                }
            }
        } else {
            // Slot vacío — círculo punteado
            ctxHab.beginPath();
            ctxHab.arc(cx, cy, slotR, 0, Math.PI * 2);
            ctxHab.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctxHab.fill();

            ctxHab.setLineDash([5, 4]);
            ctxHab.strokeStyle = 'rgba(21, 128, 61, 0.5)';
            ctxHab.lineWidth = 2;
            ctxHab.stroke();
            ctxHab.setLineDash([]);

            // Signo +
            ctxHab.strokeStyle = 'rgba(21, 128, 61, 0.6)';
            ctxHab.lineWidth = 2.5;
            ctxHab.lineCap = 'round';
            ctxHab.beginPath();
            ctxHab.moveTo(cx - 8, cy);
            ctxHab.lineTo(cx + 8, cy);
            ctxHab.moveTo(cx, cy - 8);
            ctxHab.lineTo(cx, cy + 8);
            ctxHab.stroke();
        }
    }
}

// Click en canvas
function onCanvasClick(e) {
    if (!canvasHab || !estado) return;
    const rect = canvasHab.getBoundingClientRect();
    const px = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const py = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
    if (px == null || py == null) return;

    for (const hab of estado.habitats) {
        if (!hab._plotRect) continue;
        const p = hab._plotRect;
        if (px < p.x || px > p.x + p.w || py < p.y || py > p.y + p.h) continue;

        // 1. ¿Clic en botón "mejorar"?
        if (hab._btnMejorarRect) {
            const b = hab._btnMejorarRect;
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
                const nuevoNivel = hab.nivel + 1;
                const costo = HABITAT_CONFIG.costos[nuevoNivel];
                if (estado.creditos < costo) {
                    toast('Te faltan ' + formatearNumero(costo - Math.floor(estado.creditos)) + ' créditos', 'error');
                    return;
                }
                mostrarConfirmacion(
                    'Mejorar hábitat',
                    '¿Mejorar a nivel ' + nuevoNivel + ' por ' + formatearNumero(costo) + ' créditos?',
                    () => mejorarHabitat(hab.id)
                );
                return;
            }
        }

        // 2. ¿Clic en algún slot con criatura?
        if (hab._slotsHit) {
            for (const s of hab._slotsHit) {
                const dist = Math.hypot(px - s.cx, py - s.cy);
                if (dist <= s.r) {
                    if (s.i < hab.slots.length) {
                        abrirModalCriatura(hab.slots[s.i]);
                    }
                    return;
                }
            }
        }

        return;
    }
}

// ============================================================
//  RENDER: NIDO
// ============================================================
function renderNido() {
    const slot1 = $('bcNidoSlot1'), slot2 = $('bcNidoSlot2');
    const btnCriar = $('bcBtnCriar');
    const timerDiv = $('bcNidoTimer');
    const resultadoDiv = $('bcNidoResultado');
    if (!slot1 || !slot2) return;

    slot1.classList.remove('lleno');
    slot2.classList.remove('lleno');
    slot1.style.background = '';
    slot2.style.background = '';

    if (estado.nido) {
        const def = CRIATURAS[estado.nido.resultado];
        const padre1 = criaturaPorId(estado.nido.padre1);
        const padre2 = criaturaPorId(estado.nido.padre2);
        if (padre1) {
            const d1 = CRIATURAS[padre1.tipo];
            slot1.classList.add('lleno');
            slot1.style.background = `linear-gradient(135deg, ${d1.color}, ${d1.colorOscuro})`;
            slot1.innerHTML = `<i data-lucide="${d1.icono}"></i><span>${d1.nombre}</span>`;
        }
        if (padre2) {
            const d2 = CRIATURAS[padre2.tipo];
            slot2.classList.add('lleno');
            slot2.style.background = `linear-gradient(135deg, ${d2.color}, ${d2.colorOscuro})`;
            slot2.innerHTML = `<i data-lucide="${d2.icono}"></i><span>${d2.nombre}</span>`;
        }

        btnCriar.disabled = true;
        btnCriar.innerHTML = '<i data-lucide="hourglass"></i><span>Criando…</span>';

        const restante = estado.nido.finMs - Date.now();
        if (restante <= 0) {
            timerDiv.hidden = true;
            resultadoDiv.hidden = false;
            $('bcNidoResultNombre').textContent = def.nombre;
            $('bcNidoResultTiempo').textContent = '¡Listo para recolectar!';
            $('bcNidoResultIcono').innerHTML = `<i data-lucide="${def.icono}"></i>`;
            btnCriar.disabled = false;
            btnCriar.innerHTML = '<i data-lucide="egg"></i><span>Recoger huevo</span>';
        } else {
            timerDiv.hidden = false;
            resultadoDiv.hidden = true;
            $('bcNidoTimerValor').textContent = formatearTiempo(restante);
            const pct = Math.max(0, Math.min(100, (1 - restante / def.breedTimeMs) * 100));
            $('bcNidoTimerFill').style.width = pct + '%';
        }
    } else {
        slot1.innerHTML = '<i data-lucide="plus"></i><span>Elegir criatura</span>';
        slot2.innerHTML = '<i data-lucide="plus"></i><span>Elegir criatura</span>';
        slot1.dataset.criaturaId = '';
        slot2.dataset.criaturaId = '';
        btnCriar.disabled = true;
        btnCriar.innerHTML = '<i data-lucide="heart"></i><span>Empezar cría</span>';
        timerDiv.hidden = true;
        resultadoDiv.hidden = true;
    }

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: GUARDERÍA
// ============================================================
function renderGuarderia() {
    const cont = $('bcGuarderiaGrid');
    if (!cont) return;
    if (estado.huevos.length === 0) {
        cont.innerHTML = `
            <div class="bc-guarderia-vacia">
                <i data-lucide="egg"></i>
                <p>No tenés huevos. Criá dos criaturas en el Nido para obtener uno.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }
    cont.innerHTML = '';
    estado.huevos.forEach(huevo => {
        const def = CRIATURAS[huevo.tipo];
        const restante = huevo.finMs - Date.now();
        const listo = restante <= 0;

        const card = document.createElement('div');
        card.className = 'bc-huevo-card';

        const icono = document.createElement('div');
        icono.className = 'bc-huevo-icono';
        icono.style.background = `linear-gradient(135deg, ${def.color}, ${def.colorOscuro})`;
        icono.innerHTML = '<i data-lucide="egg"></i>';
        card.appendChild(icono);

        const nombre = document.createElement('div');
        nombre.className = 'bc-huevo-nombre';
        nombre.textContent = def.nombre;
        card.appendChild(nombre);

        const tiempo = document.createElement('div');
        tiempo.className = 'bc-huevo-tiempo';
        tiempo.textContent = listo ? '¡Listo!' : formatearTiempo(restante);
        card.appendChild(tiempo);

        const barra = document.createElement('div');
        barra.className = 'bc-huevo-barra';
        const pct = Math.max(0, Math.min(100, (1 - restante / def.hatchTimeMs) * 100));
        barra.innerHTML = `<div class="bc-huevo-barra-fill" style="width:${pct}%"></div>`;
        card.appendChild(barra);

        const btn = document.createElement('button');
        btn.className = 'bc-huevo-btn ' + (listo ? 'listo' : 'esperando');
        btn.innerHTML = listo
            ? '<i data-lucide="sparkles"></i><span>Eclosionar</span>'
            : '<i data-lucide="hourglass"></i><span>Esperando…</span>';
        btn.disabled = !listo;
        if (listo) btn.addEventListener('click', () => eclosionarHuevo(huevo.id));
        card.appendChild(btn);

        cont.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: TIENDA
// ============================================================
function renderTienda() {
    const contCriaturas = $('bcTiendaCriaturas');
    const contHabitats = $('bcTiendaHabitats');
    if (!contCriaturas || !contHabitats) return;

    contCriaturas.innerHTML = '';
    Object.values(CRIATURAS).filter(c => c.rareza === 'base').forEach(def => {
        const card = document.createElement('div');
        card.className = 'bc-tienda-card';
        card.innerHTML = `
            <div class="bc-tienda-icono" style="background:linear-gradient(135deg,${def.color},${def.colorOscuro})">
                <i data-lucide="${def.icono}"></i>
            </div>
            <div class="bc-tienda-info">
                <strong>${def.nombre}</strong>
                <small>${def.descripcion}</small>
            </div>
        `;
        const btn = document.createElement('button');
        btn.className = 'bc-tienda-btn';
        const puede = estado.creditos >= def.precio && estado.habitats.length > 0;
        btn.innerHTML = `<i data-lucide="coins"></i>${formatearNumero(def.precio)}`;
        btn.disabled = !puede;
        btn.addEventListener('click', () => comprarCriaturaBase(def.id));
        card.appendChild(btn);
        contCriaturas.appendChild(card);
    });

    contHabitats.innerHTML = '';
    const puedeComprar = estado.habitats.length < MAX_HABITATS && estado.creditos >= HABITAT_CONFIG.costos[1];
    const cardNew = document.createElement('div');
    cardNew.className = 'bc-tienda-card';
    cardNew.innerHTML = `
        <div class="bc-tienda-icono" style="background:var(--accent-gradient,linear-gradient(135deg,#8B5CF6,#6D28D9))">
            <i data-lucide="home"></i>
        </div>
        <div class="bc-tienda-info">
            <strong>Hábitat nuevo</strong>
            <small>Nivel 1 · 2 slots · ${estado.habitats.length}/${MAX_HABITATS} usados</small>
        </div>
    `;
    const btnNew = document.createElement('button');
    btnNew.className = 'bc-tienda-btn';
    btnNew.innerHTML = `<i data-lucide="coins"></i>${formatearNumero(HABITAT_CONFIG.costos[1])}`;
    btnNew.disabled = !puedeComprar;
    btnNew.addEventListener('click', comprarHabitat);
    cardNew.appendChild(btnNew);
    contHabitats.appendChild(cardNew);

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL: DETALLE CRIATURA
// ============================================================
function abrirModalCriatura(criaturaId) {
    const criatura = criaturaPorId(criaturaId);
    if (!criatura) return;
    const def = CRIATURAS[criatura.tipo];
    const acc = calcularAcumulado(criatura, Date.now());
    $('bcModalCriaturaNombre').textContent = def.nombre;

    const cuerpo = $('bcModalCriaturaCuerpo');
    cuerpo.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:60px;height:60px;border-radius:15px;background:linear-gradient(135deg,${def.color},${def.colorOscuro});display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;box-shadow:0 6px 16px rgba(0,0,0,0.15);">
                    <i data-lucide="${def.icono}" style="width:30px;height:30px;"></i>
                </div>
                <div>
                    <div style="font-size:13px;font-weight:900;color:var(--gray-900);">${def.rareza.charAt(0).toUpperCase() + def.rareza.slice(1)} · Tier ${def.tier}</div>
                    <div style="font-size:12px;color:var(--gray-500);font-weight:600;margin-top:2px;line-height:1.4;">${def.descripcion}</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div style="padding:12px 14px;background:var(--violet-50);border:1.5px solid var(--violet-200);border-radius:12px;">
                    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--violet-600);margin-bottom:4px;">Acumulado</div>
                    <div style="font-size:18px;font-weight:900;color:var(--violet-700);font-variant-numeric:tabular-nums;">${acc.os.toFixed(1)} <span style="font-size:12px;">OS</span></div>
                </div>
                <div style="padding:12px 14px;background:#FEF3C7;border:1.5px solid #FDE68A;border-radius:12px;">
                    <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#92400E;margin-bottom:4px;">Créditos</div>
                    <div style="font-size:18px;font-weight:900;color:#D97706;font-variant-numeric:tabular-nums;">${acc.creditos.toFixed(1)}</div>
                </div>
            </div>
            <button class="bc-btn-primario" id="bcModalCosechar" ${acc.os < 0.5 ? 'disabled' : ''}>
                <i data-lucide="hand-coins"></i>
                <span>Cosechar ${acc.os.toFixed(1)} OS</span>
            </button>
        </div>
    `;
    $('bcModalCriatura').hidden = false;
    if (window.lucide) window.lucide.createIcons();
    $('bcModalCosechar')?.addEventListener('click', () => {
        cosecharCriatura(criaturaId);
        $('bcModalCriatura').hidden = true;
    });
}

// ============================================================
//  MODAL: SELECTOR DE CRIATURA
// ============================================================
function abrirSelectorCriatura(slotNum) {
    if (estado.nido) { toast('Ya hay una cría en curso', 'info'); return; }
    const lista = $('bcModalSelectorLista');
    lista.innerHTML = '';
    if (estado.criaturas.length === 0) {
        lista.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:20px;">No tenés criaturas.</p>';
        $('bcModalSelector').hidden = false;
        return;
    }
    const otroSlot = slotNum === 1 ? 2 : 1;
    const yaElegida = $('bcNidoSlot' + otroSlot).dataset.criaturaId;

    estado.criaturas.forEach(c => {
        if (c.id === yaElegida) return;
        const def = CRIATURAS[c.tipo];
        const item = document.createElement('button');
        item.className = 'bc-modal-lista-item';
        item.innerHTML = `
            <div class="bc-modal-lista-icono" style="background:linear-gradient(135deg,${def.color},${def.colorOscuro})">
                <i data-lucide="${def.icono}"></i>
            </div>
            <div class="bc-modal-lista-info">
                <strong>${def.nombre}</strong>
                <small>${def.rareza} · ${habitatDeCriatura(c.id)}</small>
            </div>
        `;
        item.addEventListener('click', () => {
            seleccionarParaNido(c.id, slotNum);
            $('bcModalSelector').hidden = true;
        });
        lista.appendChild(item);
    });
    $('bcModalSelector').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function habitatDeCriatura(criaturaId) {
    const hab = estado.habitats.find(h => h.slots.includes(criaturaId));
    if (!hab) return '—';
    return 'Hábitat ' + HABITAT_CONFIG.nombres[hab.nivel];
}

function seleccionarParaNido(criaturaId, slotNum) {
    const slot = $('bcNidoSlot' + slotNum);
    const criatura = criaturaPorId(criaturaId);
    if (!criatura) return;
    const def = CRIATURAS[criatura.tipo];
    slot.dataset.criaturaId = criaturaId;
    slot.classList.add('lleno');
    slot.style.background = `linear-gradient(135deg, ${def.color}, ${def.colorOscuro})`;
    slot.innerHTML = `<i data-lucide="${def.icono}"></i><span>${def.nombre}</span>`;
    if (window.lucide) window.lucide.createIcons();
    verificarNidoListo();
}

function verificarNidoListo() {
    const id1 = $('bcNidoSlot1').dataset.criaturaId;
    const id2 = $('bcNidoSlot2').dataset.criaturaId;
    const btn = $('bcBtnCriar');
    const msg = $('bcNidoMensaje');
    if (!id1 || !id2) { btn.disabled = true; return; }
    const c1 = criaturaPorId(id1), c2 = criaturaPorId(id2);
    if (!c1 || !c2) return;
    const resultId = combinacionValida(c1.tipo, c2.tipo);
    if (!resultId) {
        btn.disabled = true;
        msg.textContent = 'Estas criaturas no son compatibles.';
        msg.className = 'bc-status error';
        return;
    }
    const def = CRIATURAS[resultId];
    btn.disabled = false;
    msg.textContent = 'Resultado: ' + def.nombre + ' · ' + formatearTiempo(def.breedTimeMs);
    msg.className = 'bc-status info';

    const resDiv = $('bcNidoResultado');
    resDiv.hidden = false;
    $('bcNidoResultNombre').textContent = def.nombre;
    $('bcNidoResultTiempo').textContent = 'Tiempo de cría: ' + formatearTiempo(def.breedTimeMs);
    $('bcNidoResultIcono').innerHTML = `<i data-lucide="${def.icono}"></i>`;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  MODAL: CONFIRMACIÓN
// ============================================================
let confirmCallback = null;
function mostrarConfirmacion(titulo, texto, callback) {
    $('bcConfirmTitulo').textContent = titulo;
    $('bcConfirmTexto').textContent = texto;
    confirmCallback = callback;
    $('bcModalConfirm').hidden = false;
}

// ============================================================
//  UI GENERAL
// ============================================================
function actualizarUI() {
    if (!estado) return;
    $('bcCreditos').textContent = formatearNumero(Math.floor(estado.creditos));
    $('bcOSHoy').textContent = Math.floor(estado.osCosechadasHoy);

    // Hint contextual del canvas
    const hint = $('bcCanvasHint');
    if (hint) {
        const tieneAlgo = estado.criaturas.length > 0;
        if (!tieneAlgo) {
            hint.innerHTML = '<i data-lucide="hand-pointer"></i><span>Comprá criaturas en la Tienda y ponelas en un hábitat</span>';
        } else {
            hint.innerHTML = '';
        }
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================================================
//  TABS
// ============================================================
function cambiarTab(tabId) {
    document.querySelectorAll('.bc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.bc-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabId));

    if (tabId === 'habitats') {
        // Reajustar y dibujar cuando el canvas se hace visible
        setTimeout(() => {
            configurarCanvasHab();
            dibujarHabitats();
        }, 30);
    }
    if (tabId === 'nido') renderNido();
    if (tabId === 'guarderia') renderGuarderia();
    if (tabId === 'tienda') renderTienda();
}

// ============================================================
//  LOOP
// ============================================================
function loop() {
    const ahora = performance.now();
    if (!ultimoTick) ultimoTick = ahora;

    if (ahora - ultimoTick > 500) {
        ultimoTick = ahora;
        chequearResetDiario();

        const panelActivo = document.querySelector('.bc-panel.active')?.dataset.panel;
        if (panelActivo === 'habitats') {
            dibujarHabitats();
        } else if (panelActivo === 'nido') {
            renderNido();
        } else if (panelActivo === 'guarderia') {
            renderGuarderia();
        }
        if (estado) actualizarUI();
    }
    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;
    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('BugSillyCity necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = $('bcUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`;

    await cargarEstado();
    chequearResetDiario();

    // Primer hábitat de regalo
    if (estado.habitats.length === 0 && estado.criaturas.length === 0) {
        estado.habitats.push({ id: 'hab_inicial', nivel: 1, slots: [] });
        await guardarEstado();
        toast('¡Bienvenide! Te regalamos tu primer hábitat.', 'success');
    }

    // Primer render
    actualizarUI();
    configurarCanvasHab();
    dibujarHabitats();
    renderNido();
    renderGuarderia();
    renderTienda();

    // ===== EVENTOS =====

    // Tabs
    document.querySelectorAll('.bc-tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    // Canvas: clicks
    if (canvasHab) {
        canvasHab.addEventListener('click', onCanvasClick);
        canvasHab.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                e.preventDefault();
                onCanvasClick(e);
            }
        }, { passive: false });
    }

    // Resize canvas
    window.addEventListener('resize', () => {
        configurarCanvasHab();
        dibujarHabitats();
    });

    // Nido: slots
    $('bcNidoSlot1').addEventListener('click', () => { if (!estado.nido) abrirSelectorCriatura(1); });
    $('bcNidoSlot2').addEventListener('click', () => { if (!estado.nido) abrirSelectorCriatura(2); });

    // Nido: botón criar/recoger
    $('bcBtnCriar').addEventListener('click', () => {
        if (estado.nido && Date.now() >= estado.nido.finMs) recolectarHuevo();
        else if (!estado.nido) iniciarCria();
    });

    // Modales: cerrar
    $('bcModalSelectorCerrar').addEventListener('click', () => { $('bcModalSelector').hidden = true; });
    $('bcModalCriaturaCerrar').addEventListener('click', () => { $('bcModalCriatura').hidden = true; });
    $('bcConfirmNo').addEventListener('click', () => { $('bcModalConfirm').hidden = true; confirmCallback = null; });
    $('bcConfirmSi').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        $('bcModalConfirm').hidden = true;
        confirmCallback = null;
    });

    ['bcModalSelector', 'bcModalCriatura', 'bcModalConfirm'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                el.hidden = true;
                if (id === 'bcModalConfirm') confirmCallback = null;
            }
        });
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
