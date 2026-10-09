// ============================================================
//  BugSillyCity — Juego de cría de bichos estilo Dragon City
//  ------------------------------------------------------------
//  · 12 criaturas: 3 base (comprar) + 9 por cría.
//  · Hábitats: nivel 1 = 2 slots → nivel 4 = 8 slots.
//  · Producción: 80 OS/día TOTAL entre todas las criaturas.
//  · Créditos internos para compras.
//  · Datos en app/bugsillycity/{codigo}bugsillycity.json
//  · Reset diario según hora local del usuario.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'bugsillycity';
const ARCHIVO_BASE = 'app/bugsillycity/';

// ==== CONFIGURACIÓN ====
const DAILY_OS_LIMIT = 80;
const MAX_ACCUMULATION_HOURS = 12; // cap de acumulación por criatura
const MAX_HABITATS = 6;
const MAX_CRIATURAS = 40;

// ==== DEFINICIÓN DE CRIATURAS ====
// Cada criatura: id, nombre, icono Lucide, colores, rareza, tasas
const CRIATURAS = {
    // --- TIER 1: BASE ---
    escarabajo: {
        id: 'escarabajo', nombre: 'Escarabajo', icono: 'bug',
        color: '#22C55E', colorOscuro: '#15803D',
        rareza: 'base', tier: 1,
        osRate: 3 / 24,       // OS/hora
        creditsRate: 1.5,     // créditos/hora
        precio: 50,           // créditos para comprar
        breedTimeMs: 0, hatchTimeMs: 0,
        descripcion: 'Un bicho robusto y confiable. Perfecto para empezar.'
    },
    hormiga: {
        id: 'hormiga', nombre: 'Hormiga', icono: 'bug',
        color: '#A16207', colorOscuro: '#713F12',
        rareza: 'base', tier: 1,
        osRate: 3 / 24,
        creditsRate: 1.5,
        precio: 50,
        breedTimeMs: 0, hatchTimeMs: 0,
        descripcion: 'Trabajadora incansable. Nunca se detiene.'
    },
    arana: {
        id: 'arana', nombre: 'Araña', icono: 'bug',
        color: '#7C3AED', colorOscuro: '#5B21B6',
        rareza: 'base', tier: 1,
        osRate: 3 / 24,
        creditsRate: 1.5,
        precio: 50,
        breedTimeMs: 0, hatchTimeMs: 0,
        descripcion: 'Tejedora de redes. Misteriosa y elegante.'
    },

    // --- TIER 2: INTERMEDIOS ---
    luciernaga: {
        id: 'luciernaga', nombre: 'Luciérnaga', icono: 'zap',
        color: '#FCD34D', colorOscuro: '#B45309',
        rareza: 'intermedio', tier: 2,
        osRate: 5 / 24,
        creditsRate: 3,
        precio: 0,
        breedTimeMs: 30000, hatchTimeMs: 15000,
        descripcion: 'Ilumina la noche. Vuela libre y brillante.'
    },
    mariposa: {
        id: 'mariposa', nombre: 'Mariposa', icono: 'feather',
        color: '#EC4899', colorOscuro: '#9D174D',
        rareza: 'intermedio', tier: 2,
        osRate: 5 / 24,
        creditsRate: 3,
        precio: 0,
        breedTimeMs: 30000, hatchTimeMs: 15000,
        descripcion: 'Delicada y colorida. Un espectáculo al volar.'
    },
    libelula: {
        id: 'libelula', nombre: 'Libélula', icono: 'wind',
        color: '#06B6D4', colorOscuro: '#0E7490',
        rareza: 'intermedio', tier: 2,
        osRate: 5 / 24,
        creditsRate: 3,
        precio: 0,
        breedTimeMs: 30000, hatchTimeMs: 15000,
        descripcion: 'Rápida y ágil. Domina el aire.'
    },

    // --- TIER 3: AVANZADOS ---
    mariquita: {
        id: 'mariquita', nombre: 'Mariquita', icono: 'heart',
        color: '#EF4444', colorOscuro: '#991B1B',
        rareza: 'avanzado', tier: 3,
        osRate: 8 / 24,
        creditsRate: 6,
        precio: 0,
        breedTimeMs: 60000, hatchTimeMs: 30000,
        descripcion: 'Símbolo de buena suerte. Pequeña pero poderosa.'
    },
    polilla: {
        id: 'polilla', nombre: 'Polilla', icono: 'moon',
        color: '#6B7280', colorOscuro: '#374151',
        rareza: 'avanzado', tier: 3,
        osRate: 8 / 24,
        creditsRate: 6,
        precio: 0,
        breedTimeMs: 60000, hatchTimeMs: 30000,
        descripcion: 'Atraída por la luz. Nocturna y enigmática.'
    },
    mantis: {
        id: 'mantis', nombre: 'Mantis', icono: 'swords',
        color: '#10B981', colorOscuro: '#047857',
        rareza: 'avanzado', tier: 3,
        osRate: 8 / 24,
        creditsRate: 6,
        precio: 0,
        breedTimeMs: 60000, hatchTimeMs: 30000,
        descripcion: 'Cazadora letal. Paciente y precisa.'
    },

    // --- TIER 4: ÉPICOS ---
    escorpion: {
        id: 'escorpion', nombre: 'Escorpión', icono: 'shield',
        color: '#F97316', colorOscuro: '#9A3412',
        rareza: 'epico', tier: 4,
        osRate: 10 / 24,
        creditsRate: 10,
        precio: 0,
        breedTimeMs: 120000, hatchTimeMs: 60000,
        descripcion: 'Su aguijón es temido por todos. Rey del desierto.'
    },
    ciempies: {
        id: 'ciempies', nombre: 'Ciempiés', icono: 'link',
        color: '#84CC16', colorOscuro: '#4D7C0F',
        rareza: 'epico', tier: 4,
        osRate: 10 / 24,
        creditsRate: 10,
        precio: 0,
        breedTimeMs: 120000, hatchTimeMs: 60000,
        descripcion: 'Mil patas, un solo objetivo. Imparable.'
    },

    // --- TIER 5: LEGENDARIO ---
    escarabajo_dorado: {
        id: 'escarabajo_dorado', nombre: 'Escarabajo Dorado', icono: 'crown',
        color: '#EAB308', colorOscuro: '#A16207',
        rareza: 'legendario', tier: 5,
        osRate: 12 / 24,
        creditsRate: 16,
        precio: 0,
        breedTimeMs: 300000, hatchTimeMs: 120000,
        descripcion: 'La criatura más rara de BugSillyCity. Solo los mejores criadores lo obtienen.'
    }
};

// ==== COMBINACIONES DE CRÍA ====
// Clave: sorted([id1, id2]).join('+') → id del hijo
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

// ==== HÁBITATS ====
const HABITAT_CONFIG = {
    nivelMax: 4,
    slotsPorNivel: { 1: 2, 2: 4, 3: 6, 4: 8 },
    costos: { 1: 100, 2: 300, 3: 800, 4: 2000 },
    nombres: { 1: 'Pequeño', 2: 'Mediano', 3: 'Grande', 4: 'Colosal' }
};

// ==== CRÉDITOS POR DEFECTO ====
const CREDITOS_INICIALES = 500;

// ==== API ====
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return (window.parent && window.parent.ConfigBD) || null; }
    catch (e) { return null; }
};

// ==== ESTADO GLOBAL ====
let usuarioActual = null;
let estado = null;
let inicializado = false;
let toastTimer = null;
let rafId = null;
let ultimoTick = 0;

// ==== DOM ====
const $ = (id) => document.getElementById(id);

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
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = sp.getPropertyValue(v).trim();
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
function toast(texto, tipo = 'info') {
    const el = $('bcToast');
    if (!el) return;
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
    const m = Math.floor(s / 60);
    const ss = s % 60;
    if (m < 60) return m + 'm ' + ss + 's';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h < 24) return h + 'h ' + mm + 'm';
    const d = Math.floor(h / 24);
    const hh = h % 24;
    return d + 'd ' + hh + 'h';
}

function formatearNumero(n, dec = 0) {
    return Number(n).toLocaleString('es-CL', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec
    });
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
//  ESTADO INICIAL
// ============================================================
function crearEstadoInicial() {
    return {
        version: 1,
        creditos: CREDITOS_INICIALES,
        criaturas: [],       // { id, tipo, habitatId, ultimaCosecha }
        habitats: [],        // { id, nivel, slots: [criaturaId, ...] }
        nido: null,          // { padre1, padre2, finMs, resultado }
        huevos: [],          // { id, tipo, finMs, inicioMs }
        osCosechadasHoy: 0,
        ultimaResetFecha: hoyLocal(),
        descubiertas: [],    // IDs de criaturas descubiertas
        creada: new Date().toISOString()
    };
}

// ============================================================
//  CARGA / GUARDADO
// ============================================================
async function cargarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return false;

    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object' && Array.isArray(data.criaturas)) {
            estado = data;
            // Migraciones y valores por defecto
            if (!Array.isArray(estado.habitats)) estado.habitats = [];
            if (!Array.isArray(estado.huevos)) estado.huevos = [];
            if (typeof estado.creditos !== 'number') estado.creditos = CREDITOS_INICIALES;
            if (typeof estado.osCosechadasHoy !== 'number') estado.osCosechadasHoy = 0;
            if (!Array.isArray(estado.descubiertas)) estado.descubiertas = [];
            if (!estado.ultimaResetFecha) estado.ultimaResetFecha = hoyLocal();
            return true;
        }
    } catch (e) {
        console.warn('[BugSillyCity] Error cargando:', e);
    }

    estado = crearEstadoInicial();
    return false;
}

async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta || !estado) return;
    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[BugSillyCity] Error guardando:', e);
    }
}

// ============================================================
//  RESET DIARIO
// ============================================================
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
function criaturaPorId(id) {
    return estado.criaturas.find(c => c.id === id) || null;
}

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

function criaturaLista(criatura) {
    const acc = calcularAcumulado(criatura, Date.now());
    return acc.os >= 0.5; // al menos 0.5 OS para considerarla lista
}

function habitatTieneListos(habitat) {
    return habitat.slots.some(id => {
        const c = criaturaPorId(id);
        return c && criaturaLista(c);
    });
}

// ============================================================
//  COSECHA
// ============================================================
function cosecharCriatura(criaturaId) {
    const criatura = criaturaPorId(criaturaId);
    if (!criatura) return;

    const ahora = Date.now();
    const acc = calcularAcumulado(criatura, ahora);

    if (acc.os < 0.5) {
        toast('Aún no está lista', 'info');
        return;
    }

    const espacioDiario = DAILY_OS_LIMIT - estado.osCosechadasHoy;
    if (espacioDiario <= 0) {
        toast('Límite diario alcanzado (80 OS). Vuelve mañana.', 'error');
        return;
    }

    const osACosechar = Math.min(acc.os, espacioDiario);
    const osRedondeadas = Math.floor(osACosechar * 10) / 10; // 1 decimal
    const creditos = Math.floor(acc.creditos * 10) / 10;

    if (osRedondeadas <= 0 && creditos <= 0) {
        toast('Aún no hay nada que cosechar', 'info');
        return;
    }

    estado.osCosechadasHoy += osRedondeadas;
    estado.creditos += creditos;
    criatura.ultimaCosecha = ahora;

    // Otorgar OS al SO (solo los enteros)
    const osEnteras = Math.floor(osRedondeadas);
    if (osEnteras > 0) {
        otorgarOS(osEnteras);
    }

    guardarEstado();
    actualizarUI();
    renderHabitats();

    let msg = '';
    if (osRedondeadas > 0) msg += '+' + osRedondeadas.toFixed(1) + ' OS ';
    if (creditos > 0) msg += '+' + creditos.toFixed(1) + ' créditos';
    toast(msg.trim(), 'success');
}

async function otorgarOS(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear('egg', APP_ID, 'Cosecha en BugSillyCity', cantidad);
    } catch (e) {
        console.warn('[BugSillyCity] Error otorgando OS:', e);
    }
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

    if (!s1 || !s2) {
        $('bcNidoMensaje').textContent = 'Elegí dos criaturas para criar.';
        $('bcNidoMensaje').className = 'bc-status error';
        return;
    }
    if (s1 === s2) {
        $('bcNidoMensaje').textContent = 'No podés criar una criatura consigo misma.';
        $('bcNidoMensaje').className = 'bc-status error';
        return;
    }

    const c1 = criaturaPorId(s1);
    const c2 = criaturaPorId(s2);
    if (!c1 || !c2) return;

    const resultId = combinacionValida(c1.tipo, c2.tipo);
    if (!resultId) {
        $('bcNidoMensaje').textContent = 'Estas criaturas no son compatibles.';
        $('bcNidoMensaje').className = 'bc-status error';
        return;
    }

    const def = CRIATURAS[resultId];

    estado.nido = {
        padre1: s1,
        padre2: s2,
        finMs: Date.now() + def.breedTimeMs,
        resultado: resultId
    };

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

    // Agregar a descubiertas
    if (!estado.descubiertas.includes(estado.nido.resultado)) {
        estado.descubiertas.push(estado.nido.resultado);
    }

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
    if (Date.now() < huevo.finMs) {
        toast('Aún no está listo', 'info');
        return;
    }

    // Verificar espacio
    if (estado.criaturas.length >= MAX_CRIATURAS) {
        toast('No tenés espacio para más criaturas', 'error');
        return;
    }

    // Buscar hábitat con espacio
    const habitatConEspacio = estado.habitats.find(h => {
        const maxSlots = HABITAT_CONFIG.slotsPorNivel[h.nivel];
        return h.slots.length < maxSlots;
    });

    if (!habitatConEspacio) {
        toast('No hay hábitats con espacio. Comprá o mejorá uno.', 'error');
        return;
    }

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
    renderHabitats();
    toast('¡' + CRIATURAS[huevo.tipo].nombre + ' eclosionó!', 'success');
}

// ============================================================
//  HÁBITATS
// ============================================================
function comprarHabitat() {
    if (estado.habitats.length >= MAX_HABITATS) {
        toast('Máximo de hábitats alcanzado', 'error');
        return;
    }
    const costo = HABITAT_CONFIG.costos[1];
    if (estado.creditos < costo) {
        toast('Te faltan créditos', 'error');
        return;
    }
    estado.creditos -= costo;
    estado.habitats.push({
        id: 'hab_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        nivel: 1,
        slots: []
    });
    guardarEstado();
    actualizarUI();
    renderHabitats();
    toast('Hábitat comprado', 'success');
}

function mejorarHabitat(habitatId) {
    const hab = estado.habitats.find(h => h.id === habitatId);
    if (!hab) return;
    if (hab.nivel >= HABITAT_CONFIG.nivelMax) {
        toast('Nivel máximo alcanzado', 'info');
        return;
    }
    const nuevoNivel = hab.nivel + 1;
    const costo = HABITAT_CONFIG.costos[nuevoNivel];
    if (estado.creditos < costo) {
        toast('Te faltan ' + formatearNumero(costo - Math.floor(estado.creditos)) + ' créditos', 'error');
        return;
    }
    estado.creditos -= costo;
    hab.nivel = nuevoNivel;
    guardarEstado();
    actualizarUI();
    renderHabitats();
    toast('Hábitat mejorado a nivel ' + nuevoNivel, 'success');
}

// ============================================================
//  TIENDA
// ============================================================
function comprarCriaturaBase(tipoId) {
    const def = CRIATURAS[tipoId];
    if (!def || def.rareza !== 'base') return;

    // Verificar límite
    if (estado.criaturas.length >= MAX_CRIATURAS) {
        toast('No tenés espacio para más criaturas', 'error');
        return;
    }

    // Verificar créditos
    if (estado.creditos < def.precio) {
        toast('Te faltan ' + formatearNumero(def.precio - Math.floor(estado.creditos)) + ' créditos', 'error');
        return;
    }

    // Verificar hábitat con espacio
    let habitatConEspacio = estado.habitats.find(h => {
        const maxSlots = HABITAT_CONFIG.slotsPorNivel[h.nivel];
        return h.slots.length < maxSlots;
    });

    if (!habitatConEspacio) {
        toast('No hay hábitats con espacio. Comprá o mejorá uno.', 'error');
        return;
    }

    estado.creditos -= def.precio;

    const nuevaCriatura = {
        id: 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        tipo: tipoId,
        habitatId: habitatConEspacio.id,
        ultimaCosecha: Date.now()
    };

    estado.criaturas.push(nuevaCriatura);
    habitatConEspacio.slots.push(nuevaCriatura.id);

    if (!estado.descubiertas.includes(tipoId)) {
        estado.descubiertas.push(tipoId);
    }

    guardarEstado();
    actualizarUI();
    renderHabitats();
    renderTienda();
    toast('¡' + def.nombre + ' comprado!', 'success');
}

// ============================================================
//  RENDER: HÁBITATS
// ============================================================
function renderHabitats() {
    const cont = $('bcHabitatGrid');
    if (!cont) return;

    if (estado.habitats.length === 0) {
        cont.innerHTML = `
            <div class="bc-guarderia-vacia" style="grid-column:1/-1;">
                <i data-lucide="layout-grid"></i>
                <p>No tenés hábitats. Andá a la Tienda para comprar uno.</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    cont.innerHTML = '';

    estado.habitats.forEach(hab => {
        const maxSlots = HABITAT_CONFIG.slotsPorNivel[hab.nivel];
        const nombreNivel = HABITAT_CONFIG.nombres[hab.nivel];

        const card = document.createElement('div');
        card.className = 'bc-habitat-card';

        // Header
        const header = document.createElement('div');
        header.className = 'bc-habitat-header';
        header.innerHTML = `
            <div class="bc-habitat-nombre"><i data-lucide="home"></i> Hábitat ${nombreNivel}</div>
            <span class="bc-habitat-nivel">Nv.${hab.nivel} · ${hab.slots.length}/${maxSlots}</span>
        `;
        card.appendChild(header);

        // Slots
        const slotsDiv = document.createElement('div');
        slotsDiv.className = 'bc-habitat-slots';

        for (let i = 0; i < maxSlots; i++) {
            const slot = document.createElement('div');
            slot.className = 'bc-slot';

            if (i < hab.slots.length) {
                const criatura = criaturaPorId(hab.slots[i]);
                if (criatura) {
                    const def = CRIATURAS[criatura.tipo];
                    const listo = criaturaLista(criatura);
                    slot.classList.add('ocupado');
                    if (listo) slot.classList.add('bc-slot-listo');
                    slot.style.background = `linear-gradient(135deg, ${def.color}, ${def.colorOscuro})`;
                    slot.innerHTML = `<div class="bc-slot-icono"><i data-lucide="${def.icono}"></i></div>`;
                    slot.title = def.nombre + (listo ? ' (¡Listo para cosechar!)' : '');
                    slot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        abrirModalCriatura(criatura.id);
                    });
                }
            } else {
                slot.classList.add('vacio');
                slot.innerHTML = '<i data-lucide="plus"></i>';
                slot.title = 'Slot vacío';
            }

            slotsDiv.appendChild(slot);
        }
        card.appendChild(slotsDiv);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'bc-habitat-footer';

        const info = document.createElement('span');
        info.className = 'bc-habitat-info';
        const tieneListos = habitatTieneListos(hab);
        info.textContent = tieneListos ? '¡Listo para cosechar!' : 'Produciendo…';
        info.style.color = tieneListos ? '#D97706' : '';
        footer.appendChild(info);

        if (hab.nivel < HABITAT_CONFIG.nivelMax) {
            const btnMejorar = document.createElement('button');
            btnMejorar.className = 'bc-habitat-btn-mejorar';
            const costo = HABITAT_CONFIG.costos[hab.nivel + 1];
            const puede = estado.creditos >= costo;
            btnMejorar.innerHTML = `<i data-lucide="arrow-up-circle"></i> ${formatearNumero(costo)}`;
            btnMejorar.disabled = !puede;
            btnMejorar.title = puede ? 'Mejorar hábitat' : 'Créditos insuficientes';
            btnMejorar.addEventListener('click', (e) => {
                e.stopPropagation();
                mostrarConfirmacion(
                    'Mejorar hábitat',
                    `¿Mejorar a nivel ${hab.nivel + 1} por ${formatearNumero(costo)} créditos?`,
                    () => mejorarHabitat(hab.id)
                );
            });
            footer.appendChild(btnMejorar);
        }

        card.appendChild(footer);
        cont.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: NIDO
// ============================================================
function renderNido() {
    const slot1 = $('bcNidoSlot1');
    const slot2 = $('bcNidoSlot2');
    const btnCriar = $('bcBtnCriar');
    const timerDiv = $('bcNidoTimer');
    const resultadoDiv = $('bcNidoResultado');

    if (!slot1 || !slot2) return;

    // Reset
    slot1.classList.remove('lleno');
    slot2.classList.remove('lleno');
    slot1.style.background = '';
    slot2.style.background = '';

    if (estado.nido) {
        // Hay cría en curso
        const def = CRIATURAS[estado.nido.resultado];

        // Mostrar padres en slots
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
            // Listo para recolectar
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
            const total = def.breedTimeMs;
            const pct = Math.max(0, Math.min(100, (1 - restante / total) * 100));
            $('bcNidoTimerFill').style.width = pct + '%';
        }
    } else {
        // Sin cría
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
        icono.innerHTML = `<i data-lucide="egg"></i>`;
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
        const total = def.hatchTimeMs;
        const pct = Math.max(0, Math.min(100, (1 - restante / total) * 100));
        barra.innerHTML = `<div class="bc-huevo-barra-fill" style="width:${pct}%"></div>`;
        card.appendChild(barra);

        const btn = document.createElement('button');
        btn.className = 'bc-huevo-btn ' + (listo ? 'listo' : 'esperando');
        btn.innerHTML = listo
            ? '<i data-lucide="sparkles"></i><span>Eclosionar</span>'
            : '<i data-lucide="hourglass"></i><span>Esperando…</span>';
        btn.disabled = !listo;
        if (listo) {
            btn.addEventListener('click', () => eclosionarHuevo(huevo.id));
        }
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

    // Criaturas base
    contCriaturas.innerHTML = '';
    Object.values(CRIATURAS).filter(c => c.rareza === 'base').forEach(def => {
        const card = document.createElement('div');
        card.className = 'bc-tienda-card';

        const icono = document.createElement('div');
        icono.className = 'bc-tienda-icono';
        icono.style.background = `linear-gradient(135deg, ${def.color}, ${def.colorOscuro})`;
        icono.innerHTML = `<i data-lucide="${def.icono}"></i>`;
        card.appendChild(icono);

        const info = document.createElement('div');
        info.className = 'bc-tienda-info';
        info.innerHTML = `
            <strong>${def.nombre}</strong>
            <small>${def.descripcion}</small>
        `;
        card.appendChild(info);

        const btn = document.createElement('button');
        btn.className = 'bc-tienda-btn';
        const puede = estado.creditos >= def.precio && estado.habitats.length > 0;
        btn.innerHTML = `<i data-lucide="coins"></i>${formatearNumero(def.precio)}`;
        btn.disabled = !puede;
        btn.title = puede ? 'Comprar' : (estado.habitats.length === 0 ? 'Necesitás un hábitat primero' : 'Créditos insuficientes');
        btn.addEventListener('click', () => comprarCriaturaBase(def.id));
        card.appendChild(btn);

        contCriaturas.appendChild(card);
    });

    // Hábitats
    contHabitats.innerHTML = '';

    // Hábitat nuevo
    const puedeComprar = estado.habitats.length < MAX_HABITATS && estado.creditos >= HABITAT_CONFIG.costos[1];
    const cardNew = document.createElement('div');
    cardNew.className = 'bc-tienda-card';
    cardNew.innerHTML = `
        <div class="bc-tienda-icono" style="background:var(--accent-gradient,linear-gradient(135deg,#8B5CF6,#6D28D9))"><i data-lucide="home"></i></div>
        <div class="bc-tienda-info">
            <strong>Hábitat nuevo</strong>
            <small>Nivel 1 · 2 slots · ${estado.habitats.length}/${MAX_HABITATS} usados</small>
        </div>
    `;
    const btnNew = document.createElement('button');
    btnNew.className = 'bc-tienda-btn';
    btnNew.innerHTML = `<i data-lucide="coins"></i>${formatearNumero(HABITAT_CONFIG.costos[1])}`;
    btnNew.disabled = !puedeComprar;
    btnNew.title = puedeComprar ? 'Comprar hábitat' : (estado.habitats.length >= MAX_HABITATS ? 'Máximo alcanzado' : 'Créditos insuficientes');
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
}

// ============================================================
//  MODAL: SELECTOR DE CRIATURA (para el nido)
// ============================================================
function abrirSelectorCriatura(slotNum) {
    if (estado.nido) {
        toast('Ya hay una cría en curso', 'info');
        return;
    }

    const lista = $('bcModalSelectorLista');
    lista.innerHTML = '';

    // Criaturas adultas (todas las que tenés)
    if (estado.criaturas.length === 0) {
        lista.innerHTML = '<p style="text-align:center;color:var(--gray-500);padding:20px;">No tenés criaturas.</p>';
        $('bcModalSelector').hidden = false;
        return;
    }

    // Excluir la ya elegida en el otro slot
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

    if (!id1 || !id2) {
        btn.disabled = true;
        return;
    }

    const c1 = criaturaPorId(id1);
    const c2 = criaturaPorId(id2);
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

    // Mostrar resultado previsto
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
}

// ============================================================
//  TABS
// ============================================================
function cambiarTab(tabId) {
    document.querySelectorAll('.bc-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabId);
    });
    document.querySelectorAll('.bc-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.panel === tabId);
    });

    if (tabId === 'habitats') renderHabitats();
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

    // Cada 500ms actualizamos timers
    if (ahora - ultimoTick > 500) {
        ultimoTick = ahora;

        // Reset diario
        chequearResetDiario();

        // Actualizar UI de hábitats si hay criaturas listas
        const panelActivo = document.querySelector('.bc-panel.active')?.dataset.panel;
        if (panelActivo === 'habitats') {
            renderHabitats();
        } else if (panelActivo === 'nido') {
            renderNido();
        } else if (panelActivo === 'guarderia') {
            renderGuarderia();
        }

        // Actualizar contadores del header
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
    if (!api) {
        alert('BugSillyCity necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión.');
        return;
    }

    const badge = $('bcUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`;

    await cargarEstado();
    chequearResetDiario();

    // Si es la primera vez, dar un hábitat gratis
    if (estado.habitats.length === 0 && estado.criaturas.length === 0) {
        estado.habitats.push({
            id: 'hab_inicial',
            nivel: 1,
            slots: []
        });
        await guardarEstado();
        toast('¡Bienvenide! Te regalamos tu primer hábitat.', 'success');
    }

    actualizarUI();
    renderHabitats();
    renderNido();
    renderGuarderia();
    renderTienda();

    // ==== EVENTOS ====

    // Tabs
    document.querySelectorAll('.bc-tab').forEach(tab => {
        tab.addEventListener('click', () => cambiarTab(tab.dataset.tab));
    });

    // Nido: slots
    $('bcNidoSlot1').addEventListener('click', () => {
        if (!estado.nido) abrirSelectorCriatura(1);
    });
    $('bcNidoSlot2').addEventListener('click', () => {
        if (!estado.nido) abrirSelectorCriatura(2);
    });

    // Nido: botón criar/recoger
    $('bcBtnCriar').addEventListener('click', () => {
        if (estado.nido && Date.now() >= estado.nido.finMs) {
            recolectarHuevo();
        } else if (!estado.nido) {
            iniciarCria();
        }
    });

    // Modal selector
    $('bcModalSelectorCerrar').addEventListener('click', () => {
        $('bcModalSelector').hidden = true;
    });

    // Modal criatura
    $('bcModalCriaturaCerrar').addEventListener('click', () => {
        $('bcModalCriatura').hidden = true;
    });

    // Modal confirmación
    $('bcConfirmNo').addEventListener('click', () => {
        $('bcModalConfirm').hidden = true;
        confirmCallback = null;
    });
    $('bcConfirmSi').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        $('bcModalConfirm').hidden = true;
        confirmCallback = null;
    });

    // Cerrar modales al click fuera
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

// ============================================================
//  ARRANQUE
// ============================================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
