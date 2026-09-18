// ============================================================
//  JsWidgets.js — Catálogo de WIDGETS
//  ------------------------------------------------------------
//  ESCALA DE ESPACIO (par, progresiva):
//    2 → widget mínimo (muestra info, 1 acción simple)
//    4 → widget interactivo (animación, modales, varios estados)
//
//  ESCALA DE PRECIO (monedas):
//    5   → mínimo simbólico (decorativo pero con trabajo detrás)
//    10  → entretenimiento puro (no resuelve problema real)
//    20  → utilidad media o complejidad alta
//    35  → el más útil del catálogo (lo usarás cada vez que abras el OS)
// ============================================================

const WIDGETS_DISPONIBLES = [
    {
        id: 'reloj-mundial',
        nombre: 'Reloj Mundial',
        icono: 'globe-2',
        ruta: 'Widgets/reloj-mundial/index.html',
        descripcion: 'Muestra la hora en varias ciudades del mundo.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 4,
        monedas: 20
    },
    {
        id: 'dados',
        nombre: 'Tirar Dados',
        icono: 'dice-5',
        ruta: 'Widgets/dados/index.html',
        descripcion: 'Tira 2 dados y suma el resultado.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 2,
        monedas: 10
    },
    {
        id: 'bubble-image',
        nombre: 'Imagen Burbuja',
        icono: 'circle',
        ruta: 'Widgets/bubble-image/index.html',
        descripcion: 'Muestra una imagen de tu galería en un círculo.',
        categoria: 'Personalización',
        esBase: false,
        espacio: 2,
        monedas: 5
    },
    {
        id: 'ruleta',
        nombre: 'Mini Ruleta',
        icono: 'circle-dot-dashed',
        ruta: 'Widgets/ruleta/index.html',
        descripcion: 'Ruleta con hasta 5 opciones. Resultado al azar.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 4,
        monedas: 20
    },
    {
        id: 'acceso-directo',
        nombre: 'Acceso Directo',
        icono: 'link',
        ruta: 'Widgets/acceso-directo/index.html',
        descripcion: '4 atajos a páginas web con icono y nombre.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 4,
        monedas: 35
    }
];
