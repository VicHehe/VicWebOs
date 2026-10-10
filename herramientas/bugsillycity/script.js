// ============================================================
//  BugSillyCity v6 — Isométrico + tema dinámico
//  NUEVO: CREDITOS_MULTIPLICADOR = 3 (balance de créditos x3)
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'bugsillycity';
const ARCHIVO_BASE = 'app/bugsillycity/';

const DAILY_OS_LIMIT = 80;
const MAX_ACCUMULATION_HOURS = 12;
const MAX_HABITATS = 6;
const MAX_CRIATURAS = 40;
const CREDITOS_INICIALES = 500;

// ── NUEVO: multiplicador global de créditos ──
//   1 = balance original
//   2 = doble
//   3 = triple  ← actual (54 créditos en 2h con 4 criaturas base)
//   5 = x5
const CREDITOS_MULTIPLICADOR = 3;

// ==== CANVAS ====
const TILE_W = 110;
const TILE_H = 55;

const HABITAT_POSICIONES = [
    { col: 0, fila: 0 }, { col: 1, fila: 0 }, { col: 2, fila: 0 },
    { col: 0, fila: 1 }, { col: 1, fila: 1 }, { col: 2, fila: 1 }
];

function layoutSlots(nivel) {
    switch (nivel) {
        case 1: return [[-0.4, 0], [0.4, 0]];
        case 2: return [[-0.35,-0.35],[0.35,-0.35],[-0.35,0.35],[0.35,0.35]];
        case 3: return [[-0.5,-0.3],[0,-0.3],[0.5,-0.3],[-0.5,0.3],[0,0.3],[0.5,0.3]];
        case 4: return [[-0.6,-0.25],[-0.2,-0.25],[0.2,-0.25],[0.6,-0.25],
                        [-0.6,0.25],[-0.2,0.25],[0.2,0.25],[0.6,0.25]];
    }
    return [[0,0]];
}
function tamanoCriaturaNivel(nivel) {
    return { 1: 26, 2: 22, 3: 20, 4: 18 }[nivel] || 22;
}

// ==== CRIATURAS ====
const CRIATURAS = {
    escarabajo: { id:'escarabajo', nombre:'Escarabajo', icono:'bug', simbolo:'circulo',
        color:'#22C55E', colorOscuro:'#15803D', rareza:'base', tier:1,
        osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0,
        descripcion:'Un bicho robusto y confiable. Perfecto para empezar.' },
    hormiga: { id:'hormiga', nombre:'Hormiga', icono:'bug', simbolo:'triple',
        color:'#A16207', colorOscuro:'#713F12', rareza:'base', tier:1,
        osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0,
        descripcion:'Trabajadora incansable. Nunca se detiene.' },
    arana: { id:'arana', nombre:'Araña', icono:'bug', simbolo:'estrella',
        color:'#7C3AED', colorOscuro:'#5B21B6', rareza:'base', tier:1,
        osRate:3/24, creditsRate:1.5, precio:50, breedTimeMs:0, hatchTimeMs:0,
        descripcion:'Tejedora de redes. Misteriosa y elegante.' },
    luciernaga: { id:'luciernaga', nombre:'Luciérnaga', icono:'zap', simbolo:'rayo',
        color:'#FCD34D', colorOscuro:'#B45309', rareza:'intermedio', tier:2,
        osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000,
        descripcion:'Ilumina la noche. Vuela libre y brillante.' },
    mariposa: { id:'mariposa', nombre:'Mariposa', icono:'feather', simbolo:'alas',
        color:'#EC4899', colorOscuro:'#9D174D', rareza:'intermedio', tier:2,
        osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000,
        descripcion:'Delicada y colorida. Un espectáculo al volar.' },
    libelula: { id:'libelula', nombre:'Libélula', icono:'wind', simbolo:'cruz',
        color:'#06B6D4', colorOscuro:'#0E7490', rareza:'intermedio', tier:2,
        osRate:5/24, creditsRate:3, precio:0, breedTimeMs:30000, hatchTimeMs:15000,
        descripcion:'Rápida y ágil. Domina el aire.' },
    mariquita: { id:'mariquita', nombre:'Mariquita', icono:'heart', simbolo:'corazon',
        color:'#EF4444', colorOscuro:'#991B1B', rareza:'avanzado', tier:3,
        osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000,
        descripcion:'Símbolo de buena suerte. Pequeña pero poderosa.' },
    polilla: { id:'polilla', nombre:'Polilla', icono:'moon', simbolo:'luna',
        color:'#6B7280', colorOscuro:'#374151', rareza:'avanzado', tier:3,
        osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000,
        descripcion:'Atraída por la luz. Nocturna y enigmática.' },
    mantis: { id:'mantis', nombre:'Mantis', icono:'swords', simbolo:'espada',
        color:'#10B981', colorOscuro:'#047857', rareza:'avanzado', tier:3,
        osRate:8/24, creditsRate:6, precio:0, breedTimeMs:60000, hatchTimeMs:30000,
        descripcion:'Cazadora letal. Paciente y precisa.' },
    escorpion: { id:'escorpion', nombre:'Escorpión', icono:'shield', simbolo:'triangulo',
        color:'#F97316', colorOscuro:'#9A3412', rareza:'epico', tier:4,
        osRate:10/24, creditsRate:10, precio:0, breedTimeMs:120000, hatchTimeMs:60000,
        descripcion:'Su aguijón es temido por todos. Rey del desierto.' },
    ciempies: { id:'ciempies', nombre:'Ciempiés', icono:'link', simbolo:'cadena',
        color:'#84CC16', colorOscuro:'#4D7C0F', rareza:'epico', tier:4,
        osRate:10/24, creditsRate:10, precio:0, breedTimeMs:120000, hatchTimeMs:60000,
        descripcion:'Mil patas, un solo objetivo. Imparable.' },
    escarabajo_dorado: { id:'escarabajo_dorado', nombre:'Escarabajo Dorado', icono:'crown', simbolo:'corona',
        color:'#EAB308', colorOscuro:'#A16207', rareza:'legendario', tier:5,
        osRate:12/24, creditsRate:16, precio:0, breedTimeMs:300000, hatchTimeMs:120000,
        descripcion:'La criatura más rara de BugSillyCity. Solo los mejores criadores lo obtienen.' }
};

const COMBINACIONES = {
    'arana+escarabajo':'luciernaga',
    'escarabajo+hormiga':'mariposa',
    'arana+hormiga':'libelula',
    'luciernaga+mariposa':'mariquita',
    'libelula+mariposa':'polilla',
    'libelula+luciernaga':'mantis',
    'mariquita+polilla':'escorpion',
    'mantis+polilla':'ciempies',
    'ciempies+escorpion':'escarabajo_dorado'
};

const HABITAT_CONFIG = {
    nivelMax: 4,
    slotsPorNivel: { 1:2, 2:4, 3:6, 4:8 },
    costos: { 1:100, 2:300, 3:800, 4:2000 },
    nombres: { 1:'Pequeño', 2:'Mediano', 3:'Grande', 4:'Colosal' }
};

const API = () => { try { return (window.parent && window.parent.__vicwebos) || null; } catch(e) { return null; } };
const BD  = () => { try { return (window.parent && window.parent.ConfigBD) || null; } catch(e) { return null; } };

let usuarioActual = null;
let estado = null;
let inicializado = false;
let toastTimer = null;
let rafId = null;
let ultimoTick = 0;
let confirmCallback = null;

let canvas, ctx, wrapEl;
let dpr = 1, anchoCSS = 0, altoCSS = 0;
let originX = 0, originY = 0;
let criaturasDibujadas = [];
let habitatSeleccionado = null;

const colores = {
    cesped:      '#F5F5F8',
    cespedAlt:   '#FAFAFB',
    cespedBorde: '#E8E8EE',
    texto:       '#18181B'
};

const $ = (id) => document.getElementById(id);

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const sp = getComputedStyle(rootPadre);
        const vars = ['--violet-50','--violet-100','--violet-200','--violet-300','--violet-400','--violet-500','--violet-600','--violet-700','--white','--bg','--bg-alt','--gray-50','--gray-100','--gray-200','--gray-300','--gray-400','--gray-500','--gray-600','--gray-700','--gray-800','--gray-900','--border','--text','--text-2','--text-3','--accent-gradient','--accent-gradient-hover','--accent-shadow','--accent-shadow-hover','--accent-text-gradient'];
        vars.forEach(v => {
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch(e) {}
}
function leerColoresDelTema() {
    const cs = (name, fallback) => {
        try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
        catch(e) { return fallback; }
    };
    colores.cesped      = cs('--bg-alt',   '#F5F5F8');
    colores.cespedAlt   = cs('--gray-50',  '#FAFAFB');
    colores.cespedBorde = cs('--border',   '#E8E8EE');
    colores.texto       = cs('--text',     '#18181B');
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
        setTimeout(() => { leerColoresDelTema(); dibujar(); }, 60);
    }
});

// ============================================================
//  TOAST
// ============================================================
function toast(texto, tipo='info') {
    const el = $('bcToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'bc-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  UTILS
// ============================================================
function formatearTiempo(ms) {
    const s = Math.max(0, Math.floor(ms/1000));
    if (s < 60) return s + 's';
    const m = Math.floor(s/60), ss = s%60;
    if (m < 60) return m + 'm ' + ss + 's';
    const h = Math.floor(m/60), mm = m%60;
    if (h < 24) return h + 'h ' + mm + 'm';
    const d = Math.floor(h/24), hh = h%24;
    return d + 'd ' + hh + 'h';
}
function formatearNumero(n) {
    if (typeof n !== 'number' || isNaN(n)) return '0';
    return Number(n).toLocaleString('es-CL', { maximumFractionDigits: 0 });
}
function hoyLocal() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function rutaArchivo() {
    if (!usuarioActual || !usuarioActual.codigo) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'bugsillycity.json';
}
function aclarar(hex, factor) {
    const h = hex.replace('#','');
    const r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    const nr = Math.min(255, Math.round(r + (255-r)*factor));
    const ng = Math.min(255, Math.round(g + (255-g)*factor));
    const nb = Math.min(255, Math.round(b + (255-b)*factor));
    return `rgb(${nr},${ng},${nb})`;
}

// ============================================================
//  ESTADO INICIAL / CARGA / NORMALIZACIÓN
// ============================================================
function crearEstadoInicial() {
    return {
        version: 3,
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

function normalizarCriatura(c) {
    if (!c || typeof c !== 'object') return null;
    if (typeof c.id !== 'string' || !c.id) return null;
    if (typeof c.tipo !== 'string' || !CRIATURAS[c.tipo]) return null;
    const uc = (typeof c.ultimaCosecha === 'number' && isFinite(c.ultimaCosecha) && c.ultimaCosecha > 0)
        ? c.ultimaCosecha
        : Date.now();
    return {
        id: c.id,
        tipo: c.tipo,
        habitatId: typeof c.habitatId === 'string' ? c.habitatId : null,
        ultimaCosecha: uc
    };
}

function normalizarEstado() {
    if (!estado) return;

    estado.criaturas = (Array.isArray(estado.criaturas) ? estado.criaturas : [])
        .map(normalizarCriatura)
        .filter(Boolean);

    const usadosPos = new Set();
    estado.habitats = (Array.isArray(estado.habitats) ? estado.habitats : [])
        .map((h, i) => {
            if (!h || typeof h !== 'object') return null;
            if (typeof h.id !== 'string' || !h.id) return null;
            if (typeof h.nivel !== 'number' || h.nivel < 1 || h.nivel > 4) h.nivel = 1;
            if (!Array.isArray(h.slots)) h.slots = [];
            let pos = (typeof h.posIndex === 'number' && h.posIndex >= 0 && h.posIndex < HABITAT_POSICIONES.length)
                ? h.posIndex : i % HABITAT_POSICIONES.length;
            while (usadosPos.has(pos)) pos = (pos + 1) % HABITAT_POSICIONES.length;
            usadosPos.add(pos);
            h.posIndex = pos;
            const idsValidos = new Set(estado.criaturas.map(c => c.id));
            h.slots = h.slots.filter(id => idsValidos.has(id));
            return h;
        })
        .filter(Boolean);

    estado.criaturas.forEach(c => {
        const habContenedor = estado.habitats.find(h => h.slots.includes(c.id));
        if (!habContenedor) {
            const hab = estado.habitats.find(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
            if (hab) { hab.slots.push(c.id); c.habitatId = hab.id; }
            else c.habitatId = null;
        } else {
            c.habitatId = habContenedor.id;
        }
    });

    estado.huevos = (Array.isArray(estado.huevos) ? estado.huevos : [])
        .filter(h => h && typeof h.id === 'string' && typeof h.tipo === 'string'
            && CRIATURAS[h.tipo] && typeof h.finMs === 'number');

    if (estado.nido) {
        const n = estado.nido;
        const ok = n && typeof n.finMs === 'number' && typeof n.resultado === 'string'
            && CRIATURAS[n.resultado]
            && estado.criaturas.some(c => c.id === n.padre1)
            && estado.criaturas.some(c => c.id === n.padre2);
        if (!ok) estado.nido = null;
    }

    if (typeof estado.creditos !== 'number' || !isFinite(estado.creditos)) estado.creditos = CREDITOS_INICIALES;
    if (typeof estado.osCosechadasHoy !== 'number' || !isFinite(estado.osCosechadasHoy)) estado.osCosechadasHoy = 0;
    if (!estado.ultimaResetFecha) estado.ultimaResetFecha = hoyLocal();
    if (!Array.isArray(estado.descubiertas)) estado.descubiertas = [];
    estado.descubiertas = estado.descubiertas.filter(t => CRIATURAS[t]);
}

async function cargarEstado() {
    const bd = BD(), ruta = rutaArchivo();
    if (!bd || !ruta) { estado = crearEstadoInicial(); return false; }
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object' && Array.isArray(data.criaturas)) {
            estado = data;
            normalizarEstado();
            return true;
        }
    } catch(e) { console.warn('[BugSillyCity] Error cargando:', e); }
    estado = crearEstadoInicial();
    return false;
}

async function guardarEstado() {
    const bd = BD(), ruta = rutaArchivo();
    if (!bd || !ruta || !estado) return;
    try { await bd.escribirArchivo(ruta, estado); }
    catch(e) { console.warn('[BugSillyCity] Error guardando:', e); }
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
//  PRODUCCIÓN / COSECHA
// ============================================================
function criaturaPorId(id) { return estado.criaturas.find(c => c.id === id) || null; }

function calcularAcumulado(criatura, ahora) {
    const def = CRIATURAS[criatura.tipo];
    if (!def) return { os:0, creditos:0 };
    const uc = (typeof criatura.ultimaCosecha === 'number' && isFinite(criatura.ultimaCosecha))
        ? criatura.ultimaCosecha : ahora;
    let horas = (ahora - uc) / 3600000;
    if (!isFinite(horas) || horas < 0) horas = 0;
    const os = Math.min(horas, MAX_ACCUMULATION_HOURS) * (def.osRate || 0);
    // ── NUEVO: aplicar multiplicador de créditos ──
    const cred = horas * (def.creditosRate || 0) * CREDITOS_MULTIPLICADOR;
    return {
        os: isFinite(os) ? os : 0,
        creditos: isFinite(cred) ? cred : 0
    };
}
function criaturaLista(c) { return calcularAcumulado(c, Date.now()).os >= 0.5; }
function habitatTieneListos(hab) {
    return hab.slots.some(id => { const c = criaturaPorId(id); return c && criaturaLista(c); });
}

function cosecharCriatura(criaturaId) {
    const criatura = criaturaPorId(criaturaId);
    if (!criatura) return;
    const ahora = Date.now();
    const acc = calcularAcumulado(criatura, ahora);
    if (acc.os < 0.5) { toast('Aún no está lista', 'info'); return; }

    const espacio = DAILY_OS_LIMIT - estado.osCosechadasHoy;
    if (espacio <= 0) { toast('Límite diario alcanzado (80 OS). Volvé mañana.', 'error'); return; }

    const osACosechar = Math.min(acc.os, espacio);
    const osRed = Math.floor(osACosechar * 10) / 10;
    const cred = Math.floor(acc.creditos * 10) / 10;

    estado.osCosechadasHoy += osRed;
    estado.creditos += cred;
    criatura.ultimaCosecha = ahora;

    const osEnteras = Math.floor(osRed);
    if (osEnteras > 0) otorgarOS(osEnteras);

    guardarEstado();
    actualizarUI();
    let msg = '';
    if (osRed > 0) msg += '+' + osRed.toFixed(1) + ' OS ';
    if (cred > 0) msg += '+' + cred.toFixed(1) + ' créditos';
    toast(msg.trim() || 'Nada para cosechar', 'success');
}

async function otorgarOS(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try { await api.canjear('egg', APP_ID, 'Cosecha en BugSillyCity', cantidad); }
    catch(e) { console.warn('[BugSillyCity] Error OS:', e); }
}

// ============================================================
//  CRÍA
// ============================================================
function combinacionValida(id1, id2) {
    const key = [id1, id2].sort().join('+');
    return COMBINACIONES[key] || null;
}

function iniciarCria() {
    const s1 = $('bcNidoSlot1').dataset.criaturaId;
    const s2 = $('bcNidoSlot2').dataset.criaturaId;
    if (!s1 || !s2) { $('bcNidoMensaje').textContent = 'Elegí dos criaturas.'; $('bcNidoMensaje').className = 'bc-status error'; return; }
    if (s1 === s2) { $('bcNidoMensaje').textContent = 'No podés criar una criatura consigo misma.'; $('bcNidoMensaje').className = 'bc-status error'; return; }
    const c1 = criaturaPorId(s1), c2 = criaturaPorId(s2);
    if (!c1 || !c2) { $('bcNidoMensaje').textContent = 'Criatura no encontrada.'; $('bcNidoMensaje').className = 'bc-status error'; return; }
    const resultId = combinacionValida(c1.tipo, c2.tipo);
    if (!resultId) { $('bcNidoMensaje').textContent = 'Estas criaturas no son compatibles.'; $('bcNidoMensaje').className = 'bc-status error'; return; }
    const def = CRIATURAS[resultId];
    estado.nido = { padre1:s1, padre2:s2, finMs: Date.now() + def.breedTimeMs, resultado: resultId };
    guardarEstado();
    renderNido();
    toast('Cría iniciada. ' + formatearTiempo(def.breedTimeMs), 'info');
}

function recolectarHuevo() {
    if (!estado.nido) return;
    const def = CRIATURAS[estado.nido.resultado];
    if (!def) { estado.nido = null; guardarEstado(); renderNido(); return; }
    estado.huevos.push({
        id: 'egg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        tipo: estado.nido.resultado,
        inicioMs: Date.now(),
        finMs: Date.now() + def.hatchTimeMs
    });
    if (!estado.descubiertas.includes(estado.nido.resultado)) estado.descubiertas.push(estado.nido.resultado);
    estado.nido = null;
    guardarEstado();
    renderNido();
    renderGuarderia();
    toast('¡Huevo obtenido!', 'success');
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
    const hab = estado.habitats.find(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
    if (!hab) { toast('No hay hábitats con espacio. Comprá o mejorá uno.', 'error'); return; }

    const nueva = {
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        tipo: huevo.tipo,
        habitatId: hab.id,
        ultimaCosecha: Date.now()
    };
    estado.criaturas.push(nueva);
    hab.slots.push(nueva.id);
    estado.huevos.splice(idx, 1);
    guardarEstado();
    renderGuarderia();
    toast('¡' + CRIATURAS[huevo.tipo].nombre + ' eclosionó!', 'success');
}

// ============================================================
//  HÁBITATS
// ============================================================
function comprarHabitat() {
    if (estado.habitats.length >= MAX_HABITATS) { toast('Máximo de hábitats alcanzado', 'error'); return; }
    const costo = HABITAT_CONFIG.costos[1];
    if (estado.creditos < costo) { toast('Te faltan créditos', 'error'); return; }
    const usados = new Set(estado.habitats.map(h => h.posIndex));
    let posIndex = 0;
    for (let i = 0; i < HABITAT_POSICIONES.length; i++) { if (!usados.has(i)) { posIndex = i; break; } }
    estado.creditos -= costo;
    estado.habitats.push({
        id: 'hab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        nivel: 1, slots: [], posIndex
    });
    guardarEstado();
    actualizarUI();
    toast('Hábitat comprado', 'success');
}

function mejorarHabitat(habitatId) {
    const hab = estado.habitats.find(h => h.id === habitatId);
    if (!hab) return;
    if (hab.nivel >= HABITAT_CONFIG.nivelMax) { toast('Nivel máximo', 'info'); return; }
    const costo = HABITAT_CONFIG.costos[hab.nivel + 1];
    if (estado.creditos < costo) { toast('Te faltan ' + formatearNumero(costo - Math.floor(estado.creditos)) + ' créditos', 'error'); return; }
    estado.creditos -= costo;
    hab.nivel++;
    guardarEstado();
    actualizarUI();
    toast('Hábitat mejorado a nivel ' + hab.nivel, 'success');
}

// ============================================================
//  TIENDA
// ============================================================
function comprarCriaturaBase(tipoId) {
    const def = CRIATURAS[tipoId];
    if (!def || def.rareza !== 'base') return;
    if (estado.criaturas.length >= MAX_CRIATURAS) { toast('No tenés espacio', 'error'); return; }
    if (estado.creditos < def.precio) { toast('Te faltan créditos', 'error'); return; }
    const hab = estado.habitats.find(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
    if (!hab) { toast('No hay hábitats con espacio', 'error'); return; }

    estado.creditos -= def.precio;
    const nueva = {
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
        tipo: tipoId, habitatId: hab.id, ultimaCosecha: Date.now()
    };
    estado.criaturas.push(nueva);
    hab.slots.push(nueva.id);
    if (!estado.descubiertas.includes(tipoId)) estado.descubiertas.push(tipoId);
    guardarEstado();
    actualizarUI();
    renderTienda();
    toast('¡' + def.nombre + ' comprado!', 'success');
}

// ============================================================
//  CANVAS — ISOMÉTRICO
// ============================================================
function ajustarCanvas() {
    if (!canvas || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    anchoCSS = rect.width; altoCSS = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(anchoCSS * dpr);
    canvas.height = Math.round(altoCSS * dpr);
    canvas.style.width = anchoCSS + 'px';
    canvas.style.height = altoCSS + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    calcularOrigen();
    dibujar();
}
function calcularOrigen() {
    let sumX = 0, sumY = 0;
    HABITAT_POSICIONES.forEach(p => {
        sumX += (p.col - p.fila) * TILE_W / 2;
        sumY += (p.col + p.fila) * TILE_H / 2;
    });
    const cx = sumX / HABITAT_POSICIONES.length;
    const cy = sumY / HABITAT_POSICIONES.length;
    originX = anchoCSS / 2 - cx;
    originY = altoCSS / 2 - cy + 20;
}
function proyCentroCelda(col, fila) {
    return { x: originX + (col - fila) * (TILE_W / 2), y: originY + (col + fila) * (TILE_H / 2) };
}
function screenToCell(px, py) {
    const rx = px - originX, ry = py - originY;
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const c = (rx / hw + ry / hh) / 2;
    const f = (ry / hh - rx / hw) / 2;
    return { col: Math.round(c), fila: Math.round(f) };
}

function dibujar() {
    if (!ctx || !canvas || !estado) return;
    ctx.clearRect(0, 0, anchoCSS, altoCSS);
    criaturasDibujadas = [];
    HABITAT_POSICIONES.forEach(pos => dibujarSuelo(pos.col, pos.fila));
    const habsSorted = estado.habitats.slice().sort((a, b) => {
        const pa = HABITAT_POSICIONES[a.posIndex] || HABITAT_POSICIONES[0];
        const pb = HABITAT_POSICIONES[b.posIndex] || HABITAT_POSICIONES[0];
        const da = pa.col + pa.fila, db = pb.col + pb.fila;
        if (da !== db) return da - db;
        return pa.col - pb.col;
    });
    habsSorted.forEach(hab => dibujarHabitat(hab));
}

function dibujarSuelo(col, fila) {
    const { x, y } = proyCentroCelda(col, fila);
    const hw = TILE_W / 2, hh = TILE_H / 2;
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath();
    ctx.fillStyle = ((col + fila) % 2 === 0) ? colores.cesped : colores.cespedAlt;
    ctx.fill();
    ctx.strokeStyle = colores.cespedBorde;
    ctx.lineWidth = 1;
    ctx.stroke();
}

function dibujarHabitat(hab) {
    const pos = HABITAT_POSICIONES[hab.posIndex] || HABITAT_POSICIONES[0];
    const { x, y } = proyCentroCelda(pos.col, pos.fila);
    const baseW = TILE_W * 0.85, baseH = TILE_H * 0.85;
    const hw = baseW / 2, hh = baseH / 2;
    const altura = 8 + hab.nivel * 8;

    ctx.save();
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + 4, hw * 0.95, hh * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const colorPorNivel = {
        1: { base:'#A78BFA', oscuro:'#7C3AED', top:'#C4B5FD' },
        2: { base:'#60A5FA', oscuro:'#2563EB', top:'#93C5FD' },
        3: { base:'#34D399', oscuro:'#059669', top:'#6EE7B7' },
        4: { base:'#FBBF24', oscuro:'#D97706', top:'#FCD34D' }
    };
    const col = colorPorNivel[hab.nivel] || colorPorNivel[1];

    ctx.beginPath();
    ctx.moveTo(x - hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x, y + hh - altura); ctx.lineTo(x - hw, y - altura);
    ctx.closePath(); ctx.fillStyle = col.oscuro; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y + hh); ctx.lineTo(x + hw, y); ctx.lineTo(x + hw, y - altura); ctx.lineTo(x, y + hh - altura);
    ctx.closePath(); ctx.fillStyle = col.base; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y - hh - altura); ctx.lineTo(x + hw, y - altura); ctx.lineTo(x, y + hh - altura); ctx.lineTo(x - hw, y - altura);
    ctx.closePath(); ctx.fillStyle = col.top; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.2; ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(x + 8, y - altura / 2 + i * 5, 1.5, 0, Math.PI * 2); ctx.fill(); }

    const badgeY = y - altura - hh - 6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - 22, badgeY - 8, 44, 16, 8); else ctx.rect(x - 22, badgeY - 8, 44, 16);
    ctx.fill();
    ctx.fillStyle = 'white'; ctx.font = 'bold 10px Nunito, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Nv.' + hab.nivel, x, badgeY);

    const maxSlots = HABITAT_CONFIG.slotsPorNivel[hab.nivel];
    const layout = layoutSlots(hab.nivel);
    const tam = tamanoCriaturaNivel(hab.nivel);
    const topX = x, topY = y - altura;
    const topHw = hw * 0.85, topHh = hh * 0.85;

    const hayListos = habitatTieneListos(hab);
    if (hayListos) {
        const pulse = (Math.sin(performance.now() / 400) + 1) / 2;
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x, y - hh - altura); ctx.lineTo(x + hw, y - altura); ctx.lineTo(x, y + hh - altura); ctx.lineTo(x - hw, y - altura);
        ctx.closePath(); ctx.stroke();
    }

    for (let i = 0; i < maxSlots; i++) {
        const [u, v] = layout[i] || [0, 0];
        const px = topX + u * topHw;
        const py = topY + v * topHh;
        if (i < hab.slots.length) {
            const criatura = criaturaPorId(hab.slots[i]);
            if (criatura) {
                const def = CRIATURAS[criatura.tipo];
                if (!def) continue;
                const listo = criaturaLista(criatura);
                dibujarCriatura(px, py, def, listo, tam);
                criaturasDibujadas.push({ x: px, y: py - tam * 0.4, r: tam * 0.8, criaturaId: criatura.id });
            }
        } else {
            dibujarSlotVacio(px, py, tam * 0.5);
        }
    }
}

function dibujarSlotVacio(cx, cy, r) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 3, cy); ctx.lineTo(cx + 3, cy);
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 3);
    ctx.stroke();
}

function dibujarCriatura(cx, cy, def, listo, size) {
    const cw = size / 2, ch = cw / 2, cubeH = cw * 0.9;

    ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, cw * 1.05, ch * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx - cw, cy); ctx.lineTo(cx, cy + ch); ctx.lineTo(cx, cy + ch - cubeH); ctx.lineTo(cx - cw, cy - cubeH);
    ctx.closePath(); ctx.fillStyle = def.colorOscuro; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy + ch); ctx.lineTo(cx + cw, cy); ctx.lineTo(cx + cw, cy - cubeH); ctx.lineTo(cx, cy + ch - cubeH);
    ctx.closePath(); ctx.fillStyle = def.color; ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy - ch - cubeH); ctx.lineTo(cx + cw, cy - cubeH); ctx.lineTo(cx, cy + ch - cubeH); ctx.lineTo(cx - cw, cy - cubeH);
    ctx.closePath(); ctx.fillStyle = aclarar(def.color, 0.25); ctx.fill();

    ctx.strokeStyle = listo ? 'rgba(250,204,21,1)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = listo ? 2 : 1;
    ctx.stroke();

    dibujarSimbolo(def.simbolo, cx, cy - cubeH, cw * 1.3);

    if (listo) {
        const pulse = (Math.sin(performance.now() / 300) + 1) / 2;
        ctx.fillStyle = `rgba(250, 204, 21, ${0.6 + pulse * 0.4})`;
        ctx.beginPath(); ctx.arc(cx, cy - ch - cubeH - 8, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.font = 'bold 9px Nunito, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy - ch - cubeH - 8);
    }
}

function dibujarSimbolo(tipo, cx, cy, s) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    switch (tipo) {
        case 'circulo': ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.fill(); break;
        case 'triple':
            ctx.beginPath();
            ctx.arc(cx - s * 0.3, cy, s * 0.11, 0, Math.PI * 2);
            ctx.arc(cx, cy, s * 0.11, 0, Math.PI * 2);
            ctx.arc(cx + s * 0.3, cy, s * 0.11, 0, Math.PI * 2);
            ctx.fill(); break;
        case 'estrella': dibujarEstrella(cx, cy, s * 0.36, 5); break;
        case 'triangulo':
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.34); ctx.lineTo(cx + s * 0.34, cy + s * 0.24); ctx.lineTo(cx - s * 0.34, cy + s * 0.24);
            ctx.closePath(); ctx.fill(); break;
        case 'corazon':
            ctx.beginPath();
            ctx.moveTo(cx, cy + s * 0.32);
            ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.1, cx - s * 0.2, cy - s * 0.4, cx, cy - s * 0.15);
            ctx.bezierCurveTo(cx + s * 0.2, cy - s * 0.4, cx + s * 0.5, cy - s * 0.1, cx, cy + s * 0.32);
            ctx.fill(); break;
        case 'rayo':
            ctx.beginPath();
            ctx.moveTo(cx + s * 0.05, cy - s * 0.4); ctx.lineTo(cx - s * 0.2, cy + s * 0.02);
            ctx.lineTo(cx + s * 0.02, cy + s * 0.02); ctx.lineTo(cx - s * 0.08, cy + s * 0.4);
            ctx.lineTo(cx + s * 0.2, cy - s * 0.02); ctx.lineTo(cx - s * 0.02, cy - s * 0.02);
            ctx.closePath(); ctx.fill(); break;
        case 'cruz':
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.3, cy); ctx.lineTo(cx + s * 0.3, cy);
            ctx.moveTo(cx, cy - s * 0.3); ctx.lineTo(cx, cy + s * 0.3);
            ctx.stroke(); break;
        case 'luna':
            ctx.beginPath(); ctx.arc(cx - s * 0.05, cy, s * 0.32, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(cx + s * 0.13, cy - s * 0.08, s * 0.32, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over'; break;
        case 'alas':
            ctx.beginPath(); ctx.moveTo(cx - s * 0.05, cy); ctx.lineTo(cx - s * 0.4, cy - s * 0.3); ctx.lineTo(cx - s * 0.4, cy + s * 0.15); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(cx + s * 0.05, cy); ctx.lineTo(cx + s * 0.4, cy - s * 0.3); ctx.lineTo(cx + s * 0.4, cy + s * 0.15); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.08, 0, Math.PI * 2); ctx.fill(); break;
        case 'espada':
            ctx.beginPath();
            ctx.moveTo(cx, cy - s * 0.4); ctx.lineTo(cx + s * 0.15, cy + s * 0.05);
            ctx.lineTo(cx + s * 0.3, cy + s * 0.15); ctx.lineTo(cx + s * 0.15, cy + s * 0.25);
            ctx.lineTo(cx - s * 0.15, cy + s * 0.25); ctx.lineTo(cx - s * 0.3, cy + s * 0.15);
            ctx.lineTo(cx - s * 0.15, cy + s * 0.05); ctx.closePath(); ctx.fill(); break;
        case 'cadena':
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.18, s * 0.16, 0, Math.PI * 2);
            ctx.arc(cx, cy + s * 0.18, s * 0.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath();
            ctx.arc(cx, cy - s * 0.18, s * 0.07, 0, Math.PI * 2);
            ctx.arc(cx, cy + s * 0.18, s * 0.07, 0, Math.PI * 2);
            ctx.fill(); break;
        case 'corona':
            ctx.beginPath();
            ctx.moveTo(cx - s * 0.38, cy + s * 0.18);
            ctx.lineTo(cx - s * 0.38, cy - s * 0.12);
            ctx.lineTo(cx - s * 0.15, cy + s * 0.02);
            ctx.lineTo(cx, cy - s * 0.32);
            ctx.lineTo(cx + s * 0.15, cy + s * 0.02);
            ctx.lineTo(cx + s * 0.38, cy - s * 0.12);
            ctx.lineTo(cx + s * 0.38, cy + s * 0.18);
            ctx.closePath(); ctx.fill(); break;
    }
    ctx.restore();
}

function dibujarEstrella(cx, cy, r, puntas) {
    ctx.beginPath();
    for (let i = 0; i < puntas * 2; i++) {
        const rad = i % 2 === 0 ? r : r * 0.42;
        const ang = (Math.PI / puntas) * i - Math.PI / 2;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
}

// ============================================================
//  INPUT CANVAS
// ============================================================
function bindInput() {
    const manejar = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const px = clientX - rect.left, py = clientY - rect.top;
        let target = null, minDist = Infinity;
        criaturasDibujadas.forEach(c => {
            const dx = px - c.x, dy = py - c.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < c.r && dist < minDist) { target = c; minDist = dist; }
        });
        if (target) { abrirModalCriatura(target.criaturaId); return; }
        const celda = screenToCell(px, py);
        const hab = estado.habitats.find(h => {
            const p = HABITAT_POSICIONES[h.posIndex];
            return p && p.col === celda.col && p.fila === celda.fila;
        });
        if (hab) { habitatSeleccionado = hab; abrirModalHabitat(hab.id); return; }
        habitatSeleccionado = null;
        dibujar();
    };
    canvas.addEventListener('click', (e) => { e.preventDefault(); manejar(e.clientX, e.clientY); });
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) { const t = e.touches[0]; manejar(t.clientX, t.clientY); }
    }, { passive: true });
}

// ============================================================
//  MODAL DETALLE CRIATURA
// ============================================================
function abrirModalCriatura(criaturaId) {
    try {
        const criatura = criaturaPorId(criaturaId);
        if (!criatura) return;
        const def = CRIATURAS[criatura.tipo];
        if (!def) return;
        const acc = calcularAcumulado(criatura, Date.now());
        $('bcModalCriaturaNombre').textContent = def.nombre;

        const cuerpo = $('bcModalCriaturaCuerpo');
        cuerpo.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,${def.color},${def.colorOscuro});display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0;">
                        <i data-lucide="${def.icono}" style="width:28px;height:28px;"></i>
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:800;color:var(--gray-900);">${def.rareza.charAt(0).toUpperCase() + def.rareza.slice(1)} · Tier ${def.tier}</div>
                        <div style="font-size:12px;color:var(--gray-500);font-weight:600;margin-top:2px;">${def.descripcion}</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="padding:10px 12px;background:var(--gray-50);border:1px solid var(--border);border-radius:10px;">
                        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--gray-500);margin-bottom:3px;">Acumulado</div>
                        <div style="font-size:16px;font-weight:900;color:var(--violet-700);font-variant-numeric:tabular-nums;">${acc.os.toFixed(1)} OS</div>
                    </div>
                    <div style="padding:10px 12px;background:var(--gray-50);border:1px solid var(--border);border-radius:10px;">
                        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--gray-500);margin-bottom:3px;">Créditos</div>
                        <div style="font-size:16px;font-weight:900;color:#D97706;font-variant-numeric:tabular-nums;">${acc.creditos.toFixed(1)}</div>
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
    } catch (e) {
        console.error('[BugSillyCity] Error modal criatura:', e);
        $('bcModalCriatura').hidden = true;
    }
}

// ============================================================
//  MODAL HÁBITAT
// ============================================================
function abrirModalHabitat(habId) {
    try {
        const hab = estado.habitats.find(h => h.id === habId);
        if (!hab) return;
        const nombre = HABITAT_CONFIG.nombres[hab.nivel];
        const max = HABITAT_CONFIG.slotsPorNivel[hab.nivel];
        $('bcModalCriaturaNombre').textContent = 'Hábitat ' + nombre;
        const cuerpo = $('bcModalCriaturaCuerpo');
        const costoMejora = hab.nivel < HABITAT_CONFIG.nivelMax ? HABITAT_CONFIG.costos[hab.nivel + 1] : null;
        const puede = costoMejora && estado.creditos >= costoMejora;
        const listos = hab.slots.filter(id => { const c = criaturaPorId(id); return c && criaturaLista(c); }).length;

        cuerpo.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    <div style="padding:10px 12px;background:var(--gray-50);border:1px solid var(--border);border-radius:10px;">
                        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--gray-500);margin-bottom:3px;">Nivel</div>
                        <div style="font-size:16px;font-weight:900;color:var(--violet-700);">${hab.nivel} / 4</div>
                    </div>
                    <div style="padding:10px 12px;background:var(--gray-50);border:1px solid var(--border);border-radius:10px;">
                        <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--gray-500);margin-bottom:3px;">Ocupación</div>
                        <div style="font-size:16px;font-weight:900;color:var(--violet-700);font-variant-numeric:tabular-nums;">${hab.slots.length} / ${max}</div>
                    </div>
                </div>
                ${listos > 0 ? `<div style="padding:10px 12px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;font-size:12.5px;font-weight:700;color:#92400E;">¡${listos} criatura${listos>1?'s':''} lista${listos>1?'s':''} para cosechar!</div>` : ''}
                ${costoMejora ? `
                    <button class="bc-btn-primario" id="bcModalMejorar" ${puede ? '' : 'disabled'}>
                        <i data-lucide="arrow-up-circle"></i>
                        <span>Mejorar a Nv.${hab.nivel+1} · ${formatearNumero(costoMejora)} créditos</span>
                    </button>
                ` : `
                    <div style="padding:10px 12px;background:#DCFCE7;border:1px solid #BBF7D0;border-radius:10px;font-size:12.5px;font-weight:700;color:#166534;text-align:center;">Nivel máximo alcanzado</div>
                `}
            </div>
        `;
        $('bcModalCriatura').hidden = false;
        if (window.lucide) window.lucide.createIcons();
        $('bcModalMejorar')?.addEventListener('click', () => {
            mejorarHabitat(habId);
            $('bcModalCriatura').hidden = true;
        });
    } catch (e) {
        console.error('[BugSillyCity] Error modal hábitat:', e);
        $('bcModalCriatura').hidden = true;
    }
}

// ============================================================
//  MODAL SELECTOR (NIDO)
// ============================================================
function abrirSelectorCriatura(slotNum) {
    try {
        if (estado.nido) { toast('Ya hay una cría en curso', 'info'); return; }
        const lista = $('bcModalSelectorLista');
        lista.innerHTML = '';

        const criaturasValidas = estado.criaturas.filter(c => c && CRIATURAS[c.tipo]);
        if (criaturasValidas.length === 0) {
            lista.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:20px;">No tenés criaturas.</p>';
            $('bcModalSelector').hidden = false;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const otroSlot = slotNum === 1 ? 2 : 1;
        const yaElegida = $('bcNidoSlot' + otroSlot).dataset.criaturaId || '';
        let mostradas = 0;

        criaturasValidas.forEach(c => {
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
            mostradas++;
        });

        if (mostradas === 0) {
            lista.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:20px;">Ya no quedan criaturas para elegir.</p>';
        }

        $('bcModalSelector').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.error('[BugSillyCity] Error abriendo selector:', e);
        toast('Error al abrir el selector', 'error');
        $('bcModalSelector').hidden = true;
    }
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
    if (!def) return;
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
//  UI / TABS / RENDER
// ============================================================
function actualizarUI() {
    if (!estado) return;
    $('bcCreditos').textContent = formatearNumero(Math.floor(estado.creditos));
    $('bcOSHoy').textContent = Math.floor(estado.osCosechadasHoy || 0);
}

function renderNido() {
    const slot1 = $('bcNidoSlot1'), slot2 = $('bcNidoSlot2');
    const btnCriar = $('bcBtnCriar');
    const timerDiv = $('bcNidoTimer'), resultadoDiv = $('bcNidoResultado');
    if (!slot1 || !slot2) return;

    if (estado.nido && CRIATURAS[estado.nido.resultado]) {
        slot1.classList.remove('lleno'); slot2.classList.remove('lleno');
        slot1.style.background = ''; slot2.style.background = '';

        const def = CRIATURAS[estado.nido.resultado];
        const p1 = criaturaPorId(estado.nido.padre1);
        const p2 = criaturaPorId(estado.nido.padre2);
        if (p1 && CRIATURAS[p1.tipo]) { const d = CRIATURAS[p1.tipo]; slot1.classList.add('lleno'); slot1.style.background = `linear-gradient(135deg, ${d.color}, ${d.colorOscuro})`; slot1.innerHTML = `<i data-lucide="${d.icono}"></i><span>${d.nombre}</span>`; }
        if (p2 && CRIATURAS[p2.tipo]) { const d = CRIATURAS[p2.tipo]; slot2.classList.add('lleno'); slot2.style.background = `linear-gradient(135deg, ${d.color}, ${d.colorOscuro})`; slot2.innerHTML = `<i data-lucide="${d.icono}"></i><span>${d.nombre}</span>`; }
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
            const total = def.breedTimeMs || 1;
            const pct = Math.max(0, Math.min(100, (1 - restante / total) * 100));
            $('bcNidoTimerFill').style.width = pct + '%';
        }
    } else {
        if (!slot1.dataset.criaturaId) {
            slot1.classList.remove('lleno');
            slot1.style.background = '';
            slot1.innerHTML = '<i data-lucide="plus"></i><span>Elegir criatura</span>';
        }
        if (!slot2.dataset.criaturaId) {
            slot2.classList.remove('lleno');
            slot2.style.background = '';
            slot2.innerHTML = '<i data-lucide="plus"></i><span>Elegir criatura</span>';
        }

        const tieneAmbas = slot1.dataset.criaturaId && slot2.dataset.criaturaId;
        btnCriar.disabled = !tieneAmbas;
        btnCriar.innerHTML = '<i data-lucide="heart"></i><span>Empezar cría</span>';
        timerDiv.hidden = true;
        resultadoDiv.hidden = true;

        if (tieneAmbas) verificarNidoListo();
    }
    if (window.lucide) window.lucide.createIcons();
}

function renderGuarderia() {
    const cont = $('bcGuarderiaGrid');
    if (!cont) return;
    if (estado.huevos.length === 0) {
        cont.innerHTML = `<div class="bc-guarderia-vacia"><i data-lucide="egg"></i><p>No tenés huevos. Criá dos criaturas en el Nido.</p></div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }
    cont.innerHTML = '';
    estado.huevos.forEach(huevo => {
        const def = CRIATURAS[huevo.tipo];
        if (!def) return;
        const restante = huevo.finMs - Date.now();
        const listo = restante <= 0;
        const card = document.createElement('div');
        card.className = 'bc-huevo-card';
        card.innerHTML = `
            <div class="bc-huevo-icono" style="background:linear-gradient(135deg,${def.color},${def.colorOscuro})"><i data-lucide="egg"></i></div>
            <div class="bc-huevo-nombre">${def.nombre}</div>
            <div class="bc-huevo-tiempo">${listo ? '¡Listo!' : formatearTiempo(restante)}</div>
            <div class="bc-huevo-barra"><div class="bc-huevo-barra-fill" style="width:${Math.max(0,Math.min(100,(1-restante/def.hatchTimeMs)*100))}%"></div></div>
            <button class="bc-huevo-btn ${listo ? 'listo' : 'esperando'}" ${listo ? '' : 'disabled'}>
                <i data-lucide="${listo ? 'sparkles' : 'hourglass'}"></i>
                <span>${listo ? 'Eclosionar' : 'Esperando…'}</span>
            </button>
        `;
        if (listo) card.querySelector('button').addEventListener('click', () => eclosionarHuevo(huevo.id));
        cont.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
}

function renderTienda() {
    const contC = $('bcTiendaCriaturas'), contH = $('bcTiendaHabitats');
    if (!contC || !contH) return;
    contC.innerHTML = '';
    Object.values(CRIATURAS).filter(c => c.rareza === 'base').forEach(def => {
        const card = document.createElement('div');
        card.className = 'bc-tienda-card';
        const puede = estado.creditos >= def.precio && estado.habitats.some(h => h.slots.length < HABITAT_CONFIG.slotsPorNivel[h.nivel]);
        card.innerHTML = `
            <div class="bc-tienda-icono" style="background:linear-gradient(135deg,${def.color},${def.colorOscuro})"><i data-lucide="${def.icono}"></i></div>
            <div class="bc-tienda-info"><strong>${def.nombre}</strong><small>${def.descripcion}</small></div>
            <button class="bc-tienda-btn" ${puede ? '' : 'disabled'}><i data-lucide="coins"></i>${formatearNumero(def.precio)}</button>
        `;
        card.querySelector('button').addEventListener('click', () => comprarCriaturaBase(def.id));
        contC.appendChild(card);
    });
    contH.innerHTML = '';
    const puedeHab = estado.habitats.length < MAX_HABITATS && estado.creditos >= HABITAT_CONFIG.costos[1];
    const cardNew = document.createElement('div');
    cardNew.className = 'bc-tienda-card';
    cardNew.innerHTML = `
        <div class="bc-tienda-icono" style="background:linear-gradient(135deg,#8B5CF6,#6D28D9)"><i data-lucide="home"></i></div>
        <div class="bc-tienda-info"><strong>Hábitat nuevo</strong><small>Nivel 1 · 2 slots · ${estado.habitats.length}/${MAX_HABITATS} usados</small></div>
        <button class="bc-tienda-btn" ${puedeHab ? '' : 'disabled'}><i data-lucide="coins"></i>${formatearNumero(HABITAT_CONFIG.costos[1])}</button>
    `;
    cardNew.querySelector('button').addEventListener('click', comprarHabitat);
    contH.appendChild(cardNew);
    if (window.lucide) window.lucide.createIcons();
}

function cambiarTab(tabId) {
    document.querySelectorAll('.bc-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.bc-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabId));
    if (tabId === 'habitats') { setTimeout(ajustarCanvas, 50); }
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
    if (ahora - ultimoTick > 400) {
        ultimoTick = ahora;
        chequearResetDiario();
        if (estado) actualizarUI();
        const panelActivo = document.querySelector('.bc-panel.active')?.dataset.panel;
        if (panelActivo === 'habitats') {
            dibujar();
        } else if (panelActivo === 'nido' && estado.nido) {
            renderNido();
        } else if (panelActivo === 'guarderia') {
            renderGuarderia();
        }
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
    leerColoresDelTema();

    const api = API();
    if (!api) { alert('BugSillyCity necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }
    const badge = $('bcUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`;

    await cargarEstado();
    chequearResetDiario();

    if (estado.habitats.length === 0 && estado.criaturas.length === 0) {
        estado.habitats.push({ id: 'hab_inicial', nivel: 1, slots: [], posIndex: 4 });
        await guardarEstado();
        toast('¡Bienvenide! Te regalamos tu primer hábitat.', 'success');
    }

    canvas = $('bcCanvas');
    wrapEl = document.querySelector('.bc-canvas-wrap');
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', () => { ajustarCanvas(); });

    actualizarUI();
    renderNido();
    renderGuarderia();
    renderTienda();

    document.querySelectorAll('.bc-tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    const nidoSlots = $('bcNidoSlots');
    if (nidoSlots) {
        nidoSlots.addEventListener('click', (e) => {
            const slot = e.target.closest('.bc-nido-slot');
            if (!slot) return;
            if (estado.nido) return;
            const slotNum = parseInt(slot.dataset.slot, 10);
            if (slotNum === 1 || slotNum === 2) abrirSelectorCriatura(slotNum);
        });
    }

    $('bcBtnCriar').addEventListener('click', () => {
        if (estado.nido && Date.now() >= estado.nido.finMs) recolectarHuevo();
        else if (!estado.nido) iniciarCria();
    });

    $('bcModalSelectorCerrar').addEventListener('click', () => { $('bcModalSelector').hidden = true; });
    $('bcModalCriaturaCerrar').addEventListener('click', () => { $('bcModalCriatura').hidden = true; });
    $('bcConfirmNo').addEventListener('click', () => { $('bcModalConfirm').hidden = true; confirmCallback = null; });
    $('bcConfirmSi').addEventListener('click', () => { if (confirmCallback) confirmCallback(); $('bcModalConfirm').hidden = true; confirmCallback = null; });
    ['bcModalSelector','bcModalCriatura','bcModalConfirm'].forEach(id => {
        const el = $(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            if (e.target === el) { el.hidden = true; if (id === 'bcModalConfirm') confirmCallback = null; }
        });
    });

    bindInput();
    setTimeout(() => { ajustarCanvas(); }, 100);
    setTimeout(() => { ajustarCanvas(); }, 400);

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
