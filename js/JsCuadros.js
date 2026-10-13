// ============================================================
//  JsCuadros.js — Catálogo de CUADROS (decoración pura)
//  ------------------------------------------------------------
//  • No consumen espacio.
//  • No generan monedas.
//  • Solo se compran (5 a 25 monedas).
//  • Máximo 10 activos en el lobby a la vez.
//  • Cada cuadro es HTML puro (sin script, sin lógica).
//
//  ESCALA DE PRECIO:
//    5   → común     (forma simple, sin detalle)
//    10  → estándar  (algo de textura o color)
//    15  → bonito    (bien elaborado)
//    20  → premium   (con animación CSS)
//    25  → raro      (artesanal, destacable)
//
//  REGLA: cada cuadro debe tener un icono ÚNICO en el catálogo
//  (los iconos solo se usan en la card de la tienda y el modal).
// ============================================================

const CUADROS_DISPONIBLES = [
// ============================================================
//  JsCuadros.js — Catálogo de CUADROS (decoración pura)
//  ------------------------------------------------------------
//  • No consumen espacio.
//  • No generan monedas.
//  • Solo se compran (5 a 25 monedas).
//  • Máximo 10 activos en el lobby a la vez.
//  • Cada cuadro es HTML puro (con SVG inline).
//
//  ESCALA DE PRECIO:
//    5   → común     (forma simple)
//    10  → estándar  (algo de detalle)
//    15  → bonito    (bien elaborado)
//    20  → premium   (con animación CSS)
//    25  → raro      (arte detallado + animación)
// ============================================================

const CUADROS_DISPONIBLES = [
  
    {
        id: 'rosa-querida',
        nombre: 'Rosa Querida',
        icono: 'flower-2',
        ruta: 'Cuadros/rosa-querida/index.html',
        descripcion: 'Una rosa simple y bonita, meciéndose suavemente.',
        categoria: 'Plantas',
        monedas: 5
    },
  
    {
        id: 'my-bod',
        nombre: 'My B.O.D',
        icono: 'sunset',
        ruta: 'Cuadros/my-bod/index.html',
        descripcion: 'Un atardecer precioso en la playa, con el mar en movimiento.',
        categoria: 'Paisajes',
        monedas: 25
    }
];
  
];
