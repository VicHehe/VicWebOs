// ============================================================
//  JsWidgets.js — Catálogo de WIDGETS
//  ------------------------------------------------------------
//  ESCALA DE ESPACIO (par, progresiva):
//    2 → widget mínimo (muestra info, 1 acción simple)
//    4 → widget interactivo (animación, modales, varios estados)
//
//  ESCALA DE PRECIO (0 a 150):
//    0     → base del sistema (info esencial)
//    5     → decorativo mínimo
//    15    → entretenimiento puro simple
//    25-40 → entretenimiento o utilidad media
//    60    → widget con estado/economía propia
//    100   → utilidad alta (lo usás seguido)
//    150   → el más útil del catálogo (tope)
// ============================================================

const WIDGETS_DISPONIBLES = [
    {
        id: 'mi-estado',
        nombre: 'Mi Estado',
        icono: 'circle-user',
        ruta: 'Widgets/mi-estado/index.html',
        descripcion: 'Muestra tu perfil y te deja cambiar tu estado (activo, descansando, desconectado).',
        categoria: 'Gratuitas',
        esBase: false,
        espacio: 2,
        monedas: 0
    },
    {
        id: 'account-info',
        nombre: 'Cuenta Info',
        icono: 'id-card',
        ruta: 'Widgets/account-info/index.html',
        descripcion: 'Resumen de tu cuenta: perfil, dinero ganado/gastado y qué tenés instalado.',
        categoria: 'Gratuitas',
        esBase: false,
        espacio: 2,
        monedas: 0
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
        id: 'dados',
        nombre: 'Tirar Dados',
        icono: 'dice-5',
        ruta: 'Widgets/dados/index.html',
        descripcion: 'Tira 2 dados y suma el resultado.',
        categoria: 'Azar',
        esBase: false,
        espacio: 2,
        monedas: 15
    },
    {
        id: 'ruleta',
        nombre: 'Mini Ruleta',
        icono: 'circle-dot-dashed',
        ruta: 'Widgets/ruleta/index.html',
        descripcion: 'Ruleta con hasta 5 opciones. Resultado al azar.',
        categoria: 'Azar',
        esBase: false,
        espacio: 4,
        monedas: 25
    },
    {
        id: 'diapositivas',
        nombre: 'Diapositivas',
        icono: 'presentation',
        ruta: 'Widgets/diapositivas/index.html',
        descripcion: 'Carrusel de hasta 4 imágenes de tu galería. Manual o automático.',
        categoria: 'Personalización',
        esBase: false,
        espacio: 4,
        monedas: 30
    },

    {
        id: 'reloj-mundial',
        nombre: 'Reloj Mundial',
        icono: 'globe-2',
        ruta: 'Widgets/reloj-mundial/index.html',
        descripcion: 'Muestra la hora en varias ciudades del mundo.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 4,
        monedas: 40
    },
    {
        id: 'lector',
        nombre: 'Lector',
        icono: 'book-open-text',
        ruta: 'Widgets/lector/index.html',
        descripcion: 'Carga una nota o un archivo .txt y tenlo siempre a la vista.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 2,
        monedas: 40
    },
    {
        id: 'mascota',
        nombre: 'Mascota',
        icono: 'paw-print',
        ruta: 'Widgets/mascota/index.html',
        descripcion: 'Cuida a tu gato o perro. Racha diaria = ingreso pasivo creciente.',
        categoria: 'Entretenimiento',
        esBase: false,
        espacio: 4,
        monedas: 60
    },
    {
    id: 'reloj',
    nombre: 'Reloj',
    icono: 'timer',
    ruta: 'Widgets/reloj/index.html',
    descripcion: 'Cronómetro con vueltas y temporizador con presets. Simple, rápido, sin guardar nada.',
    categoria: 'Utilidades',
    esBase: false,
    espacio: 2,
    monedas: 80
},
    {
        id: 'to-do-list',
        nombre: 'To-Do List',
        icono: 'list-todo',
        ruta: 'Widgets/to-do-list/index.html',
        descripcion: 'Lista de hasta 6 tareas con estados y auto-eliminación configurable. Se guarda localmente.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 4,
        monedas: 80
    },
    {
        id: 'wiki_lector',
        nombre: 'Wiki Lector',
        icono: 'book-open',
        ruta: 'Widgets/wiki/index.html',
        descripcion: 'Busca y lee resúmenes rápidos de Wikipedia directamente desde tu escritorio.',
        categoria: 'Utilidades',
        esBase: false,
        espacio: 4,
        monedas: 80
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
        monedas: 100
    },
    {
    id: 'ajedrez-puzzle',
    nombre: 'Ajedrez',
    icono: 'crown',
    ruta: 'Widgets/ajedrez-puzzle/index.html',
    descripcion: 'Juega ajedrez contra la IA. Si ganás, +65 monedas (una vez cada 24h).',
    categoria: 'Entretenimiento',
    esBase: false,
    espacio: 4,
    monedas: 85
},
    {
        id: 'radio',
        nombre: 'Radio',
        icono: 'radio',
        ruta: 'Widgets/radio/index.html',
        descripcion: 'Emisoras de internet de todo el mundo. Favoritos y última estación guardada.',
        categoria: 'Entretenimiento',
        esBase: false,
        espacio: 4,
        monedas: 150
    },
];
