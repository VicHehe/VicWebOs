// ============================================================
//  JsCuadros.js — Catálogo de CUADROS (decoración pura)
//  ------------------------------------------------------------
//  • No consumen espacio.
//  • No generan monedas.
//  • Solo se compran (5 a 30 monedas).
//  • Máximo 10 activos en el lobby a la vez.
//  • Se COMPRAN en Stor-He, se ACTIVAN en Configuración.
//
//  ESCALA DE PRECIO:
//    5   → común     (imagen estática)
//    10  → básico+   (una o dos animaciones simples)
//    15  → estándar  (varias animaciones medias)
//    20  → bonito    (muchos detalles + animaciones)
//    25  → premium   (múltiples capas animadas)
//    30  → raro      (animaciones + script integrado)
//
//  IMPORTANTE: se declara con `var` (no `const`) para que
//  quede expuesto como window.CUADROS_DISPONIBLES, que es
//  lo que consulta LogicCuadros.
// ============================================================

var CUADROS_DISPONIBLES = [
    // ─── Decoración básica ────────────────────────────────────
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
        id: 'perrito',
        nombre: 'Perrito',
        icono: 'dog',
        ruta: 'Cuadros/perrito/index.html',
        descripcion: 'Un perrito alegre que mueve la cola sin parar.',
        categoria: 'Animales',
        monedas: 10
    },

    // ─── Nivel medio ──────────────────────────────────────────
    {
        id: 'escarabajo',
        nombre: 'Escarabajo Joya',
        icono: 'bug',
        ruta: 'Cuadros/escarabajo/index.html',
        descripcion: 'Un escarabajo iridiscente que flota entre las hojas.',
        categoria: 'Insectos',
        monedas: 15
    },
    {
        id: 'gatito-bebe',
        nombre: 'Gatito Bebé',
        icono: 'cat',
        ruta: 'Cuadros/gatito-bebe/index.html',
        descripcion: 'Un gatito cabezón de grandes ojos que parpadea.',
        categoria: 'Animales',
        monedas: 20
    },
    {
        id: 'my-bod',
        nombre: 'My B.O.D',
        icono: 'sunset',
        ruta: 'Cuadros/my-bod/index.html',
        descripcion: 'Un atardecer precioso en la playa, con el mar en movimiento.',
        categoria: 'Paisajes',
        monedas: 25
    },
    {
        id: 'campo-flores',
        nombre: 'Campo de Flores',
        icono: 'flower',
        ruta: 'Cuadros/campo-flores/index.html',
        descripcion: 'Un campo lleno de flores que se mecen con el viento.',
        categoria: 'Paisajes',
        monedas: 25
    },

    // ─── Nivel avanzado ───────────────────────────────────────
    {
        id: 'fantasmia',
        nombre: 'Fantasmia',
        icono: 'ghost',
        ruta: 'Cuadros/fantasmia/index.html',
        descripcion: 'Un fantasmita tierno que aparece, desaparece y llena el aire de magia.',
        categoria: 'Horror',
        monedas: 30
    }
];
