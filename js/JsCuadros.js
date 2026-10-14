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
//    5   → estático+  (imagen con 1 animación sutil)
//    10  → básico     (2-3 animaciones simples)
//    15  → estándar   (varias animaciones medias)
//    20  → bonito     (muchos detalles + 4-5 animaciones)
//    25  → premium    (múltiples capas animadas sincronizadas)
//    30  → raro       (animaciones + script interactivo)
//
//  IMPORTANTE: se declara con `var` (no `const`) para que
//  quede expuesto como window.CUADROS_DISPONIBLES, que es
//  lo que consulta LogicCuadros.
// ============================================================

var CUADROS_DISPONIBLES = [
    // ─── Nivel 5: estático+ ───────────────────────────────────
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
        id: 'fresitas',
        nombre: 'Fresitas',
        icono: 'cherry',
        ruta: 'Cuadros/fresitas/index.html',
        descripcion: 'Una frutilla con hojitas verdes y semillitas doradas.',
        categoria: 'Frutas',
        monedas: 5
    },
    {
        id: 'manzanitas',
        nombre: 'Manzanitas',
        icono: 'apple',
        ruta: 'Cuadros/manzanitas/index.html',
        descripcion: 'Una manzana roja con hojita y un brillo apetitoso.',
        categoria: 'Frutas',
        monedas: 5
    },
    {
        id: 'suculenta',
        nombre: 'Suculenta Roseta',
        icono: 'shrub',
        ruta: 'Cuadros/suculenta/index.html',
        descripcion: 'Una suculenta en maceta que se mece con brillos en sus hojas.',
        categoria: 'Plantas',
        monedas: 5
    },

    // ─── Nivel 10: básico ─────────────────────────────────────
    {
        id: 'perrito',
        nombre: 'Perrito',
        icono: 'dog',
        ruta: 'Cuadros/perrito/index.html',
        descripcion: 'Un perrito alegre que mueve la cola sin parar.',
        categoria: 'Animales',
        monedas: 10
    },
    {
        id: 'estrellitas',
        nombre: 'Estrellitas',
        icono: 'star',
        ruta: 'Cuadros/estrellitas/index.html',
        descripcion: 'Un cielo nocturno con luna, estrellas y una fugaz.',
        categoria: 'Paisajes',
        monedas: 10
    },
    {
        id: 'cactus',
        nombre: 'Cactus Sonriente',
        icono: 'sprout',
        ruta: 'Cuadros/cactus/index.html',
        descripcion: 'Un cactus contento con flor rosada y dunas al sol.',
        categoria: 'Plantas',
        monedas: 10
    },
    {
        id: 'sandia',
        nombre: 'Sandía',
        icono: 'cherry',
        ruta: 'Cuadros/sandia/index.html',
        descripcion: 'Una rodaja de sandía con semillas brillantes y gotitas de jugo.',
        categoria: 'Frutas',
        monedas: 10
    },

    // ─── Nivel 15: estándar ───────────────────────────────────
    {
        id: 'girasol',
        nombre: 'Girasol',
        icono: 'sun',
        ruta: 'Cuadros/girasol/index.html',
        descripcion: 'Un girasol que se mece al viento y gira despacio.',
        categoria: 'Plantas',
        monedas: 15
    },

    // ─── Nivel 20: bonito ─────────────────────────────────────
    {
        id: 'gatito-bebe',
        nombre: 'Gatito Bebé',
        icono: 'cat',
        ruta: 'Cuadros/gatito-bebe/index.html',
        descripcion: 'Un gatito cabezón de grandes ojos con mariposa.',
        categoria: 'Animales',
        monedas: 20
    },
    {
        id: 'helecho',
        nombre: 'Helecho Arqueado',
        icono: 'leaf',
        ruta: 'Cuadros/helecho/index.html',
        descripcion: 'Un helecho en maceta cuyas frondas se mecen con la brisa.',
        categoria: 'Plantas',
        monedas: 20
    },
    {
        id: 'zorro-nocturno',
        nombre: 'Zorro Nocturno',
        icono: 'paw-print',
        ruta: 'Cuadros/zorro-nocturno/index.html',
        descripcion: 'Un zorro que vela la noche bajo la luna, con cola y orejas en movimiento.',
        categoria: 'Animales',
        monedas: 20
    },

    // ─── Nivel 25: premium ────────────────────────────────────
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
    {
        id: 'espirales',
        nombre: 'Espirales',
        icono: 'tornado',
        ruta: 'Cuadros/espirales/index.html',
        descripcion: 'Una espiral hipnótica de 6 capas girando en sentidos opuestos.',
        categoria: 'Horror',
        monedas: 25
    },
    {
        id: 'bonsai-sakura',
        nombre: 'Bonsái de Sakura',
        icono: 'tree-deciduous',
        ruta: 'Cuadros/bonsai-sakura/index.html',
        descripcion: 'Un bonsái en flor con pétalos que caen sin parar.',
        categoria: 'Plantas',
        monedas: 25
    },
    {
        id: 'el-ojo',
        nombre: 'El Ojo',
        icono: 'eye',
        ruta: 'Cuadros/el-ojo/index.html',
        descripcion: 'Un ojo que te sigue con la mirada desde la oscuridad.',
        categoria: 'Horror',
        monedas: 25
    },

    // ─── Nivel 30: raro (script) ──────────────────────────────
    {
        id: 'fantasmia',
        nombre: 'Fantasmia',
        icono: 'ghost',
        ruta: 'Cuadros/fantasmia/index.html',
        descripcion: 'Un fantasmita tierno que aparece, desaparece y llena el aire de magia.',
        categoria: 'Horror',
        monedas: 30
    },

    // ─── Bichos (última categoría, siempre al final) ──────────
    {
        id: 'escarabajo',
        nombre: 'Escarabajo Joya',
        icono: 'bug',
        ruta: 'Cuadros/escarabajo/index.html',
        descripcion: 'Un escarabajo iridiscente que flota entre las hojas.',
        categoria: 'Bichos',
        monedas: 15
    },
    {
        id: 'hormiga',
        nombre: 'Hormiga',
        icono: 'worm',
        ruta: 'Cuadros/hormiga/index.html',
        descripcion: 'Una fila de hormigas marchando en busca de miguitas.',
        categoria: 'Bichos',
        monedas: 15
    },
];
