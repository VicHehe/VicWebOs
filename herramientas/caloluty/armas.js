// ============================================================
//  Caloluty — Catálogo de armas
// ============================================================

const ARMAS = [
    {
        id: 'pistola',
        nombre: 'Pistola',
        descripcion: 'Equilibrada. Cadencia rápida, precisión media.',
        icono: 'crosshair',
        precio: 0,
        monedasPorAcierto: 1,
        cadenciaMs: 220,
        tipo: 'punto',
        radioAOE: 0,
        claseColor: 'pistola'
    },
    {
        id: 'escopeta',
        nombre: 'Escopeta',
        descripcion: 'Área amplia. Fácil de acertar, cadencia lenta.',
        icono: 'shell',
        precio: 15,
        monedasPorAcierto: 1,
        cadenciaMs: 900,
        tipo: 'area',
        radioAOE: 85,
        claseColor: 'escopeta'
    },
    {
        id: 'rifle',
        nombre: 'Rifle',
        descripcion: 'Doble recompensa. Cadencia media.',
        icono: 'swords',
        precio: 30,
        monedasPorAcierto: 2,
        cadenciaMs: 550,
        tipo: 'punto',
        radioAOE: 0,
        claseColor: 'rifle'
    },
    {
        id: 'sniper',
        nombre: 'Sniper',
        descripcion: 'Un disparo cada 1.8s. Triple recompensa.',
        icono: 'crosshair',
        precio: 60,
        monedasPorAcierto: 3,
        cadenciaMs: 1800,
        tipo: 'punto',
        radioAOE: 0,
        claseColor: 'sniper'
    }
];

const ARMA_BASE = 'pistola';
const DURACION_MS = 60000;
const TOTAL_ROJOS = 40;
const TOTAL_AZULES = 35;
const PENALIZACION_AZUL_MS = 2000;

function obtenerArma(id) {
    return ARMAS.find(a => a.id === id) || null;
}

window.ARMAS = ARMAS;
window.ARMA_BASE = ARMA_BASE;
window.DURACION_MS = DURACION_MS;
window.TOTAL_ROJOS = TOTAL_ROJOS;
window.TOTAL_AZULES = TOTAL_AZULES;
window.PENALIZACION_AZUL_MS = PENALIZACION_AZUL_MS;
window.obtenerArma = obtenerArma;
