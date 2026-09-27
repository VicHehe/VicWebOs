// ============================================================
//  Clan Torral — Catálogo de cartas
//  ------------------------------------------------------------
//  Cada carta define stats base. El motor del juego las instancia
//  como unidades sobre el grid 5x14.
//
//  ancho/alto: en casillas (2x2 = 4 casillas, tanques grandes)
//  velocidad : casillas por segundo
//  rango     : a cuántas casillas ataca (distancia entre centros)
//  objetivo  : 'torres' | 'tropas' | 'ambos'
//  unidades  : cuántas instancias aparecen al desplegar
// ============================================================

const CARTAS = [
    // ─── TANQUES (2x2) ─────────────────────────────────────
    {
        id: 'gigante',
        nombre: 'Gigante',
        icono: 'user',
        ancho: 2, alto: 2,
        hp: 800, dano: 60, rango: 1,
        velocidad: 0.55,
        coste: 5,
        unidades: 1,
        objetivo: 'torres',
        categoria: 'tanque',
        descripcion: 'Lento y brutal. Solo busca torres.'
    },
    {
        id: 'muro',
        nombre: 'Muro',
        icono: 'shield',
        ancho: 2, alto: 2,
        hp: 1400, dano: 15, rango: 1,
        velocidad: 0.35,
        coste: 4,
        unidades: 1,
        objetivo: 'tropas',
        categoria: 'tanque',
        descripcion: 'Bloquea el avance. Ignora torres.'
    },

    // ─── TROPAS (1x1) ──────────────────────────────────────
    {
        id: 'espadachin',
        nombre: 'Espadachín',
        icono: 'swords',
        ancho: 1, alto: 1,
        hp: 280, dano: 45, rango: 1,
        velocidad: 1.05,
        coste: 3,
        unidades: 1,
        objetivo: 'ambos',
        categoria: 'tropa',
        descripcion: 'Equilibrado y confiable.'
    },
    {
        id: 'caballero',
        nombre: 'Caballero',
        icono: 'shield-check',
        ancho: 1, alto: 1,
        hp: 420, dano: 38, rango: 1,
        velocidad: 0.9,
        coste: 4,
        unidades: 1,
        objetivo: 'tropas',
        categoria: 'tropa',
        descripcion: 'Aguanta y prioriza tropas.'
    },
    {
        id: 'barbaro',
        nombre: 'Bárbaro',
        icono: 'axe',
        ancho: 1, alto: 1,
        hp: 620, dano: 65, rango: 1,
        velocidad: 0.8,
        coste: 5,
        unidades: 1,
        objetivo: 'ambos',
        categoria: 'tropa',
        descripcion: 'Pesado. Un solo golpe bien puesto.'
    },

    // ─── RANGO (1x1) ───────────────────────────────────────
    {
        id: 'arquero',
        nombre: 'Arquero',
        icono: 'crosshair',
        ancho: 1, alto: 1,
        hp: 130, dano: 32, rango: 3,
        velocidad: 1.0,
        coste: 3,
        unidades: 1,
        objetivo: 'ambos',
        categoria: 'rango',
        descripcion: 'Ataca desde lejos. Frágil.'
    },
    {
        id: 'mago',
        nombre: 'Mago',
        icono: 'sparkles',
        ancho: 1, alto: 1,
        hp: 110, dano: 55, rango: 2.5,
        velocidad: 0.9,
        coste: 4,
        unidades: 1,
        objetivo: 'ambos',
        area: true,
        categoria: 'rango',
        descripcion: 'Daño en área. Mata hordas.'
    },

    // ─── HORDAS ────────────────────────────────────────────
    {
        id: 'esqueletos',
        nombre: 'Esqueletos',
        icono: 'skull',
        ancho: 1, alto: 1,
        hp: 55, dano: 18, rango: 1,
        velocidad: 1.35,
        coste: 2,
        unidades: 4,
        objetivo: 'ambos',
        categoria: 'horda',
        descripcion: 'Cuatro al precio de uno.'
    },
    {
        id: 'duendes',
        nombre: 'Duendes',
        icono: 'ghost',
        ancho: 1, alto: 1,
        hp: 110, dano: 28, rango: 1,
        velocidad: 1.15,
        coste: 3,
        unidades: 3,
        objetivo: 'ambos',
        categoria: 'horda',
        descripcion: 'Tres criaturas veloces.'
    },
    {
        id: 'jinete',
        nombre: 'Jinete',
        icono: 'wind',
        ancho: 1, alto: 1,
        hp: 340, dano: 40, rango: 1,
        velocidad: 1.35,
        coste: 3,
        unidades: 1,
        objetivo: 'ambos',
        categoria: 'tropa',
        descripcion: 'Rápido. Va directo al frente.'
    }
];

// Mazo por defecto (8 cartas, el resto queda para futuras expansiones)
const MAZO_DEFAULT = [
    'gigante', 'espadachin', 'arquero', 'esqueletos',
    'mago', 'caballero', 'duendes', 'muro'
];

// Utilidad global
function obtenerCarta(id) {
    return CARTAS.find(c => c.id === id) || null;
}

window.CARTAS = CARTAS;
window.MAZO_DEFAULT = MAZO_DEFAULT;
window.obtenerCarta = obtenerCarta;
