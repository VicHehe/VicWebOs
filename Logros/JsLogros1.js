// ============================================================
//  JsLogros1.js — Primer lote de logros
//  ------------------------------------------------------------
//  Para añadir más, creá JsLogros2.js con otro array y hacé
//  window.LOGROS_REGISTRO.push(...LOGROS_2). Luego cargalo en
//  el HTML después de este archivo.
//
//  Campos:
//    id          → string único (no puede repetirse entre archivos)
//    nombre      → visible en la card
//    descripcion → texto corto
//    icono       → nombre de ícono de Lucide (puede repetirse)
//    meta        → número a alcanzar (para este lote: monedas)
// ============================================================

const LOGROS_1 = [
    {
        id: 'primer_billete',
        nombre: 'Primer Billete',
        descripcion: 'Consigue 100 monedas.',
        icono: 'piggy-bank',
        meta: 100
    },
    {
        id: 'bolsillo_contento',
        nombre: 'Bolsillo Contento',
        descripcion: 'Consigue 500 monedas.',
        icono: 'coins',
        meta: 500
    },
    {
        id: 'milenario',
        nombre: 'Milenario',
        descripcion: 'Consigue 1.000 monedas.',
        icono: 'gem',
        meta: 1000
    },
    {
        id: 'dueno_de_fundo',
        nombre: 'Dueño de Fundo',
        descripcion: 'Consigue 5.000 monedas.',
        icono: 'crown',
        meta: 5000
    },
    {
        id: 'magnate',
        nombre: 'Magnate',
        descripcion: 'Consigue 10.000 monedas.',
        icono: 'trophy',
        meta: 10000
    }
];

window.LOGROS_REGISTRO = window.LOGROS_REGISTRO || [];
window.LOGROS_REGISTRO.push(...LOGROS_1);
