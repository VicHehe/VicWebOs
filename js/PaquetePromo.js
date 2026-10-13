// ============================================================
//  PaquetePromo.js — Paquetes + Ofertas del día (PromoZione)
//  ------------------------------------------------------------
//  Se carga en el shell DESPUÉS de JsWidgets.js.
//  Desde la tienda: window.parent.PromoZione.*
//
//  Los paquetes son 100% manuales (editá PAQUETES_PROMO abajo).
//  Las ofertas del día son 3 (1 tema + 1 app + 1 widget) y se
//  generan UNA VEZ al abrir la tienda, guardándose en IndexedDB
//  hasta la próxima medianoche hora de Santiago.
//
//  ------------------------------------------------------------
//  COBERTURA — 62 paquetes
//  ------------------------------------------------------------
//  TODAS las apps, temas y widgets del catálogo (excepto los
//  base / default del sistema) aparecen al menos una vez.
//
//  Verificación de cobertura:
//    • Apps:    stor-he, chequera, contactos, galeria son base.
//               Las otras 46 apps están cubiertas.
//    • Temas:   violeta es base. Los otros 69 están cubiertos.
//    • Widgets: los 30 están cubiertos.
// ============================================================

(function () {
    'use strict';

    // ========================================================
    //  PAQUETES — EDITÁ ACÁ
    // --------------------------------------------------------
    //  id        → string único
    //  nombre    → visible en la card
    //  icono     → nombre de ícono de Lucide
    //  descripcion
    //  precio    → monedas fijas (manual)
    //  items     → 2 a 4 items, mezclando tipos
    //              { tipo: 'app'|'tema'|'widget', id: '...' }
    //
    //  Reglas que aplica el código automáticamente:
    //    - El espacio del pack = suma de espacios (NO se pone a mano).
    //    - No puede incluir apps base / default → se ignora el pack.
    //    - Un item puede repetirse en distintos packs.
    //    - Si el usuario ya tiene TODOS los items del pack, se oculta.
    // ========================================================
const PAQUETES_PROMO = [

    // ========================================================
    //  BLOQUE 1 — SISTEMA Y UTILIDADES (packs 1-20)
    // ========================================================

    // 1 — catálogo: 0 → 0
    {
        id: 'pack_inicio_gratis',
        nombre: 'Inicio Gratis',
        icono: 'gift',
        descripcion: 'Lo esencial para arrancar sin gastar nada.',
        precio: 0,
        items: [
            { tipo: 'app',    id: 'calculadora' },
            { tipo: 'app',    id: 'notas' },
            { tipo: 'widget', id: 'mi-estado' },
            { tipo: 'widget', id: 'account-info' }
        ]
    },

    // 2 — catálogo: 120 → 75 (38% off)
    {
        id: 'pack_info_tiempo',
        nombre: 'Info y Tiempo',
        icono: 'clock',
        descripcion: 'Clima, fechas y relojes para tener todo a mano.',
        precio: 75,
        items: [
            { tipo: 'widget', id: 'contador-dias' },
            { tipo: 'widget', id: 'viclima' },
            { tipo: 'widget', id: 'reloj' },
            { tipo: 'widget', id: 'reloj-mundial' }
        ]
    },

    // 3 — catálogo: 150 → 100 (33% off)
    {
        id: 'pack_productividad',
        nombre: 'Productividad',
        icono: 'target',
        descripcion: 'Pomodoro, tareas y herramientas de concentración.',
        precio: 100,
        items: [
            { tipo: 'widget', id: 'pomodoro' },
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'widget', id: 'gen-pass' },
            { tipo: 'widget', id: 'metronomo' }
        ]
    },

    // 4 — catálogo: 210 → 140 (33% off)
    {
        id: 'pack_texto',
        nombre: 'Amante del Texto',
        icono: 'book-open',
        descripcion: 'Analizá, escuchá y leé cualquier texto.',
        precio: 140,
        items: [
            { tipo: 'widget', id: 'analizador-texto' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'evanparla' },
            { tipo: 'widget', id: 'wiki_lector' }
        ]
    },

    // 5 — catálogo: 65 → 45 (31% off)
    {
        id: 'pack_azar',
        nombre: 'Pack Azar',
        icono: 'dices',
        descripcion: 'Ruleta, dados, moneda y generador de nombres.',
        precio: 45,
        items: [
            { tipo: 'widget', id: 'cara-cruz' },
            { tipo: 'widget', id: 'dados' },
            { tipo: 'widget', id: 'ruleta' },
            { tipo: 'widget', id: 'generador-nombres' }
        ]
    },

    // 6 — catálogo: 65 → 45 (31% off)
    {
        id: 'pack_foto_basica',
        nombre: 'Foto Básica',
        icono: 'image',
        descripcion: 'Cámara y widgets para mostrar tus fotos.',
        precio: 45,
        items: [
            { tipo: 'app',    id: 'camara' },
            { tipo: 'widget', id: 'bubble-image' },
            { tipo: 'widget', id: 'mini-moodboard' },
            { tipo: 'widget', id: 'diapositivas' }
        ]
    },

    // 7 — catálogo: 200 → 130 (35% off)
    {
        id: 'pack_visual_pro',
        nombre: 'Visual Pro',
        icono: 'wand-2',
        descripcion: 'Editor, extractor de colores, GIF y pizarra.',
        precio: 130,
        items: [
            { tipo: 'app',    id: 'photo-shinny' },
            { tipo: 'widget', id: 'palevan' },
            { tipo: 'widget', id: 'silly-gif' },
            { tipo: 'widget', id: 'pizarra' }
        ]
    },

    // 8 — catálogo: 205 → 135 (34% off)
    {
        id: 'pack_redes_sociales',
        nombre: 'Redes Sociales',
        icono: 'users',
        descripcion: 'Publicá, opiná y dejá mensajes en el muro.',
        precio: 135,
        items: [
            { tipo: 'app', id: 'vicsgram' },
            { tipo: 'app', id: 'encuestas' },
            { tipo: 'app', id: 'delantedelmuro' },
            { tipo: 'app', id: 'confesionario' }
        ]
    },

    // 9 — catálogo: 0 → 0
    {
        id: 'pack_arcade',
        nombre: 'Arcade Clásico',
        icono: 'gamepad-2',
        descripcion: 'Los juegos rápidos de siempre, todos gratis.',
        precio: 0,
        items: [
            { tipo: 'app', id: 'dino' },
            { tipo: 'app', id: 'whack-a-mole' },
            { tipo: 'app', id: 'tres-en-raya' },
            { tipo: 'app', id: 'wordle' }
        ]
    },

    // 10 — catálogo: 55 → 40 (27% off)
    {
        id: 'pack_casual',
        nombre: 'Juegos Casual',
        icono: 'spade',
        descripcion: 'Para partidas rápidas con amigos.',
        precio: 40,
        items: [
            { tipo: 'app', id: 'rps' },
            { tipo: 'app', id: 'blackjack' },
            { tipo: 'app', id: 'primero' },
            { tipo: 'app', id: 'caloluty' }
        ]
    },

    // 11 — catálogo: 125 → 85 (32% off)
    {
        id: 'pack_estrategia',
        nombre: 'Estrategia y Construcción',
        icono: 'blocks',
        descripcion: 'Construí ciudades, criá bichos y corré por el metro.',
        precio: 85,
        items: [
            { tipo: 'app', id: 'minicity' },
            { tipo: 'app', id: 'bugsillycity' },
            { tipo: 'app', id: 'metrorun' },
            { tipo: 'app', id: 'dibujodeldia' }
        ]
    },

    // 12 — catálogo: 460 → 300 (35% off)
    {
        id: 'pack_pixel_arte',
        nombre: 'Pixel y Arte Digital',
        icono: 'palette',
        descripcion: 'Dibujá, esculpí y creá a tus personajes.',
        precio: 300,
        items: [
            { tipo: 'app', id: 'pixevan' },
            { tipo: 'app', id: 'arte-flash' },
            { tipo: 'app', id: 'ocs' },
            { tipo: 'app', id: 'memevics' }
        ]
    },

    // 13 — catálogo: 415 → 270 (35% off)
    {
        id: 'pack_animacion',
        nombre: 'Animación',
        icono: 'film',
        descripcion: 'Animá cuadro a cuadro y diseñá tipografías.',
        precio: 270,
        items: [
            { tipo: 'app', id: 'flipovics' },
            { tipo: 'app', id: 'tillyporgrafo' },
            { tipo: 'app', id: 'sill3dy' }
        ]
    },

    // 14 — catálogo: 235 → 155 (34% off)
    {
        id: 'pack_musica_creativa',
        nombre: 'Música Creativa',
        icono: 'piano',
        descripcion: 'Piano, música y sonidos para crear.',
        precio: 155,
        items: [
            { tipo: 'app',    id: 'piano' },
            { tipo: 'widget', id: 'spotivic' },
            { tipo: 'widget', id: 'sonidos-fondo' }
        ]
    },

    // 15 — catálogo: 410 → 280 (32% off)
    {
        id: 'pack_comunicacion',
        nombre: 'Comunicación Total',
        icono: 'message-circle',
        descripcion: 'Correo, chat, publicaciones y videollamadas.',
        precio: 280,
        items: [
            { tipo: 'app', id: 'evmail' },
            { tipo: 'app', id: 'whatthehay' },
            { tipo: 'app', id: 'silly-calls' },
            { tipo: 'app', id: 'twevan' }
        ]
    },

    // 16 — catálogo: 540 → 360 (33% off)
    {
        id: 'pack_programador',
        nombre: 'Programador',
        icono: 'file-code',
        descripcion: 'Editor, SQL, JSON y conversor de proyectos.',
        precio: 360,
        items: [
            { tipo: 'app', id: 'hypertext' },
            { tipo: 'app', id: 'vicscode' },
            { tipo: 'app', id: 'silly-ql' },
            { tipo: 'app', id: 'vicsjson' }
        ]
    },

    // 17 — catálogo: 225 → 150 (33% off)
    {
        id: 'pack_bienestar',
        nombre: 'Bienestar',
        icono: 'heart',
        descripcion: 'Registrá tu sueño, tu ánimo y cuidá una mascota.',
        precio: 150,
        items: [
            { tipo: 'app',    id: 'sueno' },
            { tipo: 'app',    id: 'animo' },
            { tipo: 'widget', id: 'mascota' },
            { tipo: 'widget', id: 'ajedrez-puzzle' }
        ]
    },

    // 18 — catálogo: 190 → 125 (34% off)
    {
        id: 'pack_documentos',
        nombre: 'Documentos',
        icono: 'file-text',
        descripcion: 'PDF, CV, gastos y calendario.',
        precio: 125,
        items: [
            { tipo: 'app', id: 'lector-pdf' },
            { tipo: 'app', id: 'cv' },
            { tipo: 'app', id: 'gastos' },
            { tipo: 'app', id: 'calendario' }
        ]
    },

    // 19 — catálogo: 110 → 75 (32% off)
    {
        id: 'pack_herramientas_pro',
        nombre: 'Herramientas Pro',
        icono: 'wrench',
        descripcion: 'QR, OCR, grabación y traducción.',
        precio: 75,
        items: [
            { tipo: 'app', id: 'qr' },
            { tipo: 'app', id: 'ocr' },
            { tipo: 'app', id: 'evrec' },
            { tipo: 'app', id: 'traductor' }
        ]
    },

    // 20 — catálogo: 250 → 175 (30% off)
    {
        id: 'pack_premium_widgets',
        nombre: 'Widgets Premium',
        icono: 'link',
        descripcion: 'Atajos web y radio mundial.',
        precio: 175,
        items: [
            { tipo: 'widget', id: 'acceso-directo' },
            { tipo: 'widget', id: 'radio' }
        ]
    },

    // ========================================================
    //  BLOQUE 2 — TEMAS BÁSICOS (packs 21-24)
    // ========================================================

    // 21 — catálogo: 0 → 0
    {
        id: 'pack_colores_suaves',
        nombre: 'Colores Suaves',
        icono: 'flower-2',
        descripcion: 'Paletas pastel para cada día, todas gratis.',
        precio: 0,
        items: [
            { tipo: 'tema', id: 'rosa' },
            { tipo: 'tema', id: 'oceano' },
            { tipo: 'tema', id: 'bosque' },
            { tipo: 'tema', id: 'atardecer' }
        ]
    },

    // 22 — catálogo: 5 → 5
    {
        id: 'pack_colores_calidos',
        nombre: 'Colores Cálidos',
        icono: 'flame',
        descripcion: 'Rojos, dorados y turquesas vibrantes.',
        precio: 5,
        items: [
            { tipo: 'tema', id: 'rojizo' },
            { tipo: 'tema', id: 'golden' },
            { tipo: 'tema', id: 'turquesa' },
            { tipo: 'tema', id: 'terracota' }
        ]
    },

    // 23 — catálogo: 15 → 12 (20% off)
    {
        id: 'pack_tonos_apagados',
        nombre: 'Tonos Apagados',
        icono: 'leaf',
        descripcion: 'Paletas maduras y desaturadas.',
        precio: 12,
        items: [
            { tipo: 'tema', id: 'salvia' },
            { tipo: 'tema', id: 'rosa-polvorienta' },
            { tipo: 'tema', id: 'mostaza' }
        ]
    },

    // 24 — catálogo: 30 → 20 (33% off)
    {
        id: 'pack_dark_trio',
        nombre: 'Dark Trio',
        icono: 'moon',
        descripcion: 'Modo oscuro con tres personalidades.',
        precio: 20,
        items: [
            { tipo: 'tema', id: 'noche' },
            { tipo: 'tema', id: 'ocean' },
            { tipo: 'tema', id: 'pumkin' }
        ]
    },

    // ========================================================
    //  BLOQUE 3 — TEMAS RETRO Y COSMOS (packs 25-27)
    // ========================================================

    // 25 — catálogo: 50 → 35 (30% off)
    {
        id: 'pack_retro_oscuro',
        nombre: 'Retro Oscuro',
        icono: 'terminal',
        descripcion: 'Hacker, vaporwave, salón y GitHub oscuro.',
        precio: 35,
        items: [
            { tipo: 'tema', id: 'github-lover' },
            { tipo: 'tema', id: 'hacker' },
            { tipo: 'tema', id: 'vapor' },
            { tipo: 'tema', id: 'salon' }
        ]
    },

    // 26 — catálogo: 85 → 60 (29% off)
    {
        id: 'pack_cosmos',
        nombre: 'Cosmos',
        icono: 'sparkle',
        descripcion: 'Auroras, nebulosas, eclipses y cometas.',
        precio: 60,
        items: [
            { tipo: 'tema', id: 'aurora-boreal' },
            { tipo: 'tema', id: 'nebulosa' },
            { tipo: 'tema', id: 'eclipse-solar' },
            { tipo: 'tema', id: 'cometa-errante' }
        ]
    },

    // 27 — catálogo: 85 → 60 (29% off)
    {
        id: 'pack_liminal',
        nombre: 'Espacios Liminales',
        icono: 'door-closed',
        descripcion: 'Lugares vacíos y nostálgicos.',
        precio: 60,
        items: [
            { tipo: 'tema', id: 'piscina-vacia' },
            { tipo: 'tema', id: 'pasillo-hotel' },
            { tipo: 'tema', id: 'centro-comercial' },
            { tipo: 'tema', id: 'cuartos-traseros' }
        ]
    },

    // ========================================================
    //  BLOQUE 4 — TEMAS FESTIVOS Y FORMALES (packs 28-29)
    // ========================================================

    // 28 — catálogo: 90 → 65 (28% off)
    {
        id: 'pack_fiestas',
        nombre: 'Fiestas del Año',
        icono: 'gift',
        descripcion: 'Navidad, carnaval y fiestas patrias.',
        precio: 65,
        items: [
            { tipo: 'tema', id: 'mucho-besame' },
            { tipo: 'tema', id: 'consentido' },
            { tipo: 'tema', id: 'navidad-cozy' },
            { tipo: 'tema', id: 'carnaval-veneciano' }
        ]
    },

    // 29 — catálogo: 90 → 65 (28% off)
    {
        id: 'pack_formal',
        nombre: 'Formal',
        icono: 'briefcase',
        descripcion: 'Oficina de día y de noche, ventanas y cielo.',
        precio: 65,
        items: [
            { tipo: 'tema', id: 'oficina' },
            { tipo: 'tema', id: 'oficina-dark' },
            { tipo: 'tema', id: 'ventanas' },
            { tipo: 'tema', id: 'celeste' }
        ]
    },

    // ========================================================
    //  BLOQUE 5 — TEMAS CINE Y ATMÓSFERAS (packs 30-31)
    // ========================================================

    // 30 — catálogo: 120 → 85 (29% off)
    {
        id: 'pack_cine',
        nombre: 'Cine',
        icono: 'film',
        descripcion: 'Cuatro géneros cinematográficos.',
        precio: 85,
        items: [
            { tipo: 'tema', id: 'cine-romance-escolar' },
            { tipo: 'tema', id: 'cine-ciencia-ficcion' },
            { tipo: 'tema', id: 'cine-jazzystreet' },
            { tipo: 'tema', id: 'cine-terror' }
        ]
    },

    // 31 — catálogo: 150 → 105 (30% off)
    {
        id: 'pack_atmosferas',
        nombre: 'Atmósferas',
        icono: 'cloud',
        descripcion: 'Acuarela, café, flores y tormenta.',
        precio: 105,
        items: [
            { tipo: 'tema', id: 'acuarela' },
            { tipo: 'tema', id: 'cafe-latte' },
            { tipo: 'tema', id: 'floral' },
            { tipo: 'tema', id: 'tormenta' }
        ]
    },

    // ========================================================
    //  BLOQUE 6 — TEMAS FANTASÍA Y ESTACIONES (packs 32-33)
    // ========================================================

    // 32 — catálogo: 170 → 120 (29% off)
    {
        id: 'pack_fantasia',
        nombre: 'Fantasía',
        icono: 'book-open',
        descripcion: 'Libros antiguos, runas, desierto y vapor.',
        precio: 120,
        items: [
            { tipo: 'tema', id: 'libro' },
            { tipo: 'tema', id: 'runas' },
            { tipo: 'tema', id: 'mil-y-una-noches' },
            { tipo: 'tema', id: 'steampunk' }
        ]
    },

    // 33 — catálogo: 175 → 120 (31% off)
    {
        id: 'pack_estaciones',
        nombre: 'Cuatro Estaciones',
        icono: 'sun',
        descripcion: 'Verano, otoño, invierno y primavera.',
        precio: 120,
        items: [
            { tipo: 'tema', id: 'invierno' },
            { tipo: 'tema', id: 'primavera' },
            { tipo: 'tema', id: 'verano' },
            { tipo: 'tema', id: 'otono' }
        ]
    },

    // ========================================================
    //  BLOQUE 7 — TEMAS 3D Y CONSOLAS (packs 34-35)
    // ========================================================

    // 34 — catálogo: 200 → 140 (30% off)
    {
        id: 'pack_3d',
        nombre: 'Pack 3D',
        icono: 'box',
        descripcion: 'Arcade retro, origami, ciudad isométrica y terreno.',
        precio: 140,
        items: [
            { tipo: 'tema', id: 'retro-3d-arcade' },
            { tipo: 'tema', id: 'origami' },
            { tipo: 'tema', id: 'isometric-city' },
            { tipo: 'tema', id: 'low-poly-terrain' }
        ]
    },

    // 35 — catálogo: 100 → 70 (30% off)
    {
        id: 'pack_consolas',
        nombre: 'Consolas',
        icono: 'gamepad',
        descripcion: 'Chiptune, Switch y Wuu.',
        precio: 70,
        items: [
            { tipo: 'tema', id: 'chiptune' },
            { tipo: 'tema', id: 'switch' },
            { tipo: 'tema', id: 'wuu' }
        ]
    },

    // ========================================================
    //  BLOQUE 8 — TEMAS CULTURA POP (packs 36-38)
    // ========================================================

    // 36 — catálogo: 145 → 100 (31% off)
    {
        id: 'pack_pop_1',
        nombre: 'Pop Culture 1',
        icono: 'sparkles',
        descripcion: 'Sueños, gemas, amanecer y mensajería.',
        precio: 100,
        items: [
            { tipo: 'tema', id: 'dreams' },
            { tipo: 'tema', id: 'cuarzo-rosado' },
            { tipo: 'tema', id: 'break-of-dawn' },
            { tipo: 'tema', id: 'charla' }
        ]
    },

    // 37 — catálogo: 185 → 130 (30% off)
    {
        id: 'pack_pop_2',
        nombre: 'Pop Culture 2',
        icono: 'star',
        descripcion: 'Amigos, exploración, manga y pop.',
        precio: 130,
        items: [
            { tipo: 'tema', id: 'friend' },
            { tipo: 'tema', id: 'busca-tema-perdido' },
            { tipo: 'tema', id: 'bizzaras-desventuras' },
            { tipo: 'tema', id: 'pop-owner' }
        ]
    },

    // 38 — catálogo: 210 → 145 (31% off)
    {
        id: 'pack_pop_3',
        nombre: 'Pop Culture 3',
        icono: 'monitor',
        descripcion: 'Stream, pizzería, retro y hamsters.',
        precio: 145,
        items: [
            { tipo: 'tema', id: 'stream' },
            { tipo: 'tema', id: 'pizzeria-robotica' },
            { tipo: 'tema', id: 're-made-in' },
            { tipo: 'tema', id: 'silly-hamster' }
        ]
    },

    // ========================================================
    //  BLOQUE 9 — PACKS MIXTOS CREADOR (packs 39-40)
    // ========================================================

    // 39 — catálogo: 450 → 300 (33% off)
    {
        id: 'pack_creador_visual',
        nombre: 'Creador Visual',
        icono: 'paintbrush',
        descripcion: 'Apps y temas para artistas visuales.',
        precio: 300,
        items: [
            { tipo: 'app',  id: 'photo-shinny' },
            { tipo: 'app',  id: 'pixevan' },
            { tipo: 'app',  id: 'arte-flash' },
            { tipo: 'tema', id: 'acuarela' }
        ]
    },

    // 40 — catálogo: 335 → 230 (31% off)
    {
        id: 'pack_ciberpunk',
        nombre: 'Cyberpunk Total',
        icono: 'rocket',
        descripcion: 'Temas y apps para sentirte en el futuro.',
        precio: 230,
        items: [
            { tipo: 'tema', id: 'cine-ciencia-ficcion' },
            { tipo: 'tema', id: 'hacker' },
            { tipo: 'tema', id: 'isometric-city' },
            { tipo: 'app',  id: 'vicscode' }
        ]
    },

    // ========================================================
    //  BLOQUE 10 — PACKS COZY Y TEMÁTICOS (packs 41-44)
    // ========================================================

    // 41 — catálogo: 165 → 115 (30% off)
    {
        id: 'pack_cozy_lectura',
        nombre: 'Rincón Cozy de Lectura',
        icono: 'coffee',
        descripcion: 'Café, acuarela y todo para leer.',
        precio: 115,
        items: [
            { tipo: 'tema',   id: 'cafe-latte' },
            { tipo: 'tema',   id: 'acuarela' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'pizarra' }
        ]
    },

    // 42 — catálogo: 135 → 95 (30% off)
    {
        id: 'pack_terror_noche',
        nombre: 'Noche de Terror',
        icono: 'skull',
        descripcion: 'Terror, cuartos abandonados y tormenta.',
        precio: 95,
        items: [
            { tipo: 'tema', id: 'cine-terror' },
            { tipo: 'tema', id: 'cuartos-traseros' },
            { tipo: 'tema', id: 'pumkin' },
            { tipo: 'tema', id: 'tormenta' }
        ]
    },

    // 43 — catálogo: 155 → 110 (29% off)
    {
        id: 'pack_arcoiris',
        nombre: 'Arcoíris Pop',
        icono: 'rainbow',
        descripcion: 'Muchos colores vivos en uno.',
        precio: 110,
        items: [
            { tipo: 'tema', id: 'dreams' },
            { tipo: 'tema', id: 'cuarzo-rosado' },
            { tipo: 'tema', id: 'friend' },
            { tipo: 'tema', id: 'stream' }
        ]
    },

    // 44 — catálogo: 225 → 155 (31% off)
    {
        id: 'pack_alta_fantasia',
        nombre: 'Alta Fantasía',
        icono: 'shield',
        descripcion: 'Para los que sueñan con aventuras.',
        precio: 155,
        items: [
            { tipo: 'tema', id: 'runas' },
            { tipo: 'tema', id: 'mil-y-una-noches' },
            { tipo: 'tema', id: 'steampunk' },
            { tipo: 'app',  id: 'ocs' }
        ]
    },

    // ========================================================
    //  BLOQUE 11 — PACKS DE PRODUCTIVIDAD (packs 45-47)
    // ========================================================

    // 45 — catálogo: 155 → 105 (32% off)
    {
        id: 'pack_tiempo',
        nombre: 'Gestión del Tiempo',
        icono: 'calendar-days',
        descripcion: 'Calendario, pomodoro y contadores.',
        precio: 105,
        items: [
            { tipo: 'widget', id: 'pomodoro' },
            { tipo: 'app',    id: 'calendario' },
            { tipo: 'widget', id: 'contador-dias' },
            { tipo: 'widget', id: 'reloj' }
        ]
    },

    // 46 — catálogo: 205 → 140 (32% off)
    {
        id: 'pack_concentracion',
        nombre: 'Deep Work',
        icono: 'target',
        descripcion: 'Todo para concentrarte al máximo.',
        precio: 140,
        items: [
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'app',    id: 'notas' },
            { tipo: 'widget', id: 'pomodoro' },
            { tipo: 'widget', id: 'sonidos-fondo' }
        ]
    },

    // 47 — catálogo: 60 → 45 (25% off)
    {
        id: 'pack_nocturno',
        nombre: 'Noctámbulo',
        icono: 'moon-star',
        descripcion: 'Modo oscuro para trabajar de noche.',
        precio: 45,
        items: [
            { tipo: 'tema', id: 'oficina-dark' },
            { tipo: 'tema', id: 'noche' },
            { tipo: 'tema', id: 'ocean' },
            { tipo: 'tema', id: 'github-lover' }
        ]
    },

    // ========================================================
    //  BLOQUE 12 — PACKS DE LECTURA Y AUDIO (packs 48-49)
    // ========================================================

    // 48 — catálogo: 165 → 115 (30% off)
    {
        id: 'pack_bibliofilo',
        nombre: 'Bibliofílico',
        icono: 'library',
        descripcion: 'Para el que ama leer de todo.',
        precio: 115,
        items: [
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'wiki_lector' },
            { tipo: 'app',    id: 'lector-pdf' },
            { tipo: 'tema',   id: 'libro' }
        ]
    },

    // 49 — catálogo: 385 → 260 (32% off)
    {
        id: 'pack_audio',
        nombre: 'Amante del Audio',
        icono: 'music-3',
        descripcion: 'Radio, música, piano y sonidos.',
        precio: 260,
        items: [
            { tipo: 'widget', id: 'radio' },
            { tipo: 'widget', id: 'spotivic' },
            { tipo: 'app',    id: 'piano' },
            { tipo: 'widget', id: 'sonidos-fondo' }
        ]
    },

    // ========================================================
    //  BLOQUE 13 — PACKS DE JUEGOS (packs 50-51)
    // ========================================================

    // 50 — catálogo: 155 → 105 (32% off)
    {
        id: 'pack_noche_juegos',
        nombre: 'Noche de Juegos',
        icono: 'spade',
        descripcion: 'Cartas, apuestas y ruleta.',
        precio: 105,
        items: [
            { tipo: 'app',    id: 'blackjack' },
            { tipo: 'app',    id: 'primero' },
            { tipo: 'widget', id: 'ajedrez-puzzle' },
            { tipo: 'widget', id: 'ruleta' }
        ]
    },

    // 51 — catálogo: 85 → 60 (29% off)
    {
        id: 'pack_puzzles',
        nombre: 'Puzzles',
        icono: 'puzzle',
        descripcion: 'Palabras, ajedrez y deducción.',
        precio: 60,
        items: [
            { tipo: 'app',    id: 'wordle' },
            { tipo: 'app',    id: 'tres-en-raya' },
            { tipo: 'widget', id: 'ajedrez-puzzle' },
            { tipo: 'app',    id: 'rps' }
        ]
    },

    // ========================================================
    //  BLOQUE 14 — PACKS SOCIALES (packs 52-53)
    // ========================================================

    // 52 — catálogo: 145 → 100 (31% off)
    {
        id: 'pack_social_total',
        nombre: 'Mariposa Social',
        icono: 'users',
        descripcion: 'Todo para conectar con tu comunidad.',
        precio: 100,
        items: [
            { tipo: 'app', id: 'twevan' },
            { tipo: 'app', id: 'vicsgram' },
            { tipo: 'app', id: 'delantedelmuro' },
            { tipo: 'app', id: 'confesionario' }
        ]
    },

    // 53 — catálogo: 175 → 120 (31% off)
    {
        id: 'pack_fiesta',
        nombre: 'Modo Fiesta',
        icono: 'martini',
        descripcion: 'Encuestas, secretos y mucho color.',
        precio: 120,
        items: [
            { tipo: 'app',  id: 'encuestas' },
            { tipo: 'app',  id: 'confesionario' },
            { tipo: 'app',  id: 'delantedelmuro' },
            { tipo: 'tema', id: 'pop-owner' }
        ]
    },

    // ========================================================
    //  BLOQUE 15 — PACKS RELAX Y CREATIVOS (packs 54-55)
    // ========================================================

    // 54 — catálogo: 210 → 145 (31% off)
    {
        id: 'pack_relax',
        nombre: 'Zona Relax',
        icono: 'leaf',
        descripcion: 'Flores, acuarela y sonidos para descansar.',
        precio: 145,
        items: [
            { tipo: 'tema',   id: 'floral' },
            { tipo: 'tema',   id: 'acuarela' },
            { tipo: 'widget', id: 'sonidos-fondo' },
            { tipo: 'widget', id: 'mascota' }
        ]
    },

    // 55 — catálogo: 525 → 350 (33% off)
    {
        id: 'pack_estudio',
        nombre: 'Estudio Creativo',
        icono: 'palette',
        descripcion: 'Dibujo, pixel art, tipografía y animación.',
        precio: 350,
        items: [
            { tipo: 'app', id: 'arte-flash' },
            { tipo: 'app', id: 'pixevan' },
            { tipo: 'app', id: 'tillyporgrafo' },
            { tipo: 'app', id: 'flipovics' }
        ]
    },

    // ========================================================
    //  BLOQUE 16 — PACKS DE ESTACIÓN Y COZY (packs 56-57)
    // ========================================================

    // 56 — catálogo: 160 → 110 (31% off)
    {
        id: 'pack_primavera',
        nombre: 'Espíritu de Primavera',
        icono: 'flower-2',
        descripcion: 'Flores, color y criaturas adorables.',
        precio: 110,
        items: [
            { tipo: 'tema', id: 'primavera' },
            { tipo: 'tema', id: 'floral' },
            { tipo: 'tema', id: 'silly-hamster' },
            { tipo: 'tema', id: 'cuarzo-rosado' }
        ]
    },

    // 57 — catálogo: 130 → 90 (31% off)
    {
        id: 'pack_invierno_cozy',
        nombre: 'Invierno Cozy',
        icono: 'snowflake',
        descripcion: 'Nieve, chocolate caliente y buenos libros.',
        precio: 90,
        items: [
            { tipo: 'tema', id: 'invierno' },
            { tipo: 'tema', id: 'navidad-cozy' },
            { tipo: 'tema', id: 'cafe-latte' },
            { tipo: 'tema', id: 'libro' }
        ]
    },

    // ========================================================
    //  BLOQUE 17 — PACKS RETRO GAMER Y ESCRITORIO (packs 58-59)
    // ========================================================

    // 58 — catálogo: 115 → 80 (30% off)
    {
        id: 'pack_retro_gamer',
        nombre: 'Retro Gamer',
        icono: 'joystick',
        descripcion: 'Arcade, chiptune y consolas clásicas.',
        precio: 80,
        items: [
            { tipo: 'tema', id: 'retro-3d-arcade' },
            { tipo: 'tema', id: 'chiptune' },
            { tipo: 'tema', id: 'switch' },
            { tipo: 'app',  id: 'caloluty' }
        ]
    },

    // 59 — catálogo: 140 → 95 (32% off)
    {
        id: 'pack_escritorio',
        nombre: 'Escritorio Total',
        icono: 'monitor',
        descripcion: 'Todo para un setup completo.',
        precio: 95,
        items: [
            { tipo: 'app',    id: 'calculadora' },
            { tipo: 'app',    id: 'qr' },
            { tipo: 'widget', id: 'acceso-directo' },
            { tipo: 'tema',   id: 'ventanas' }
        ]
    },

    // ========================================================
    //  BLOQUE 18 — PACKS FINALES (packs 60-62)
    // ========================================================

    // 60 — catálogo: 50 → 35 (30% off)
    {
        id: 'pack_dark_completo',
        nombre: 'Dark Mode Completo',
        icono: 'moon',
        descripcion: 'Oscuros para todos los gustos.',
        precio: 35,
        items: [
            { tipo: 'tema', id: 'oficina-dark' },
            { tipo: 'tema', id: 'noche' },
            { tipo: 'tema', id: 'ocean' },
            { tipo: 'tema', id: 'hacker' }
        ]
    },

    // 61 — catálogo: 85 → 60 (29% off)
    {
        id: 'pack_texto_y_notas',
        nombre: 'Texto y Notas',
        icono: 'notebook-pen',
        descripcion: 'Para anotar, leer y analizar todo.',
        precio: 60,
        items: [
            { tipo: 'app',    id: 'notas' },
            { tipo: 'widget', id: 'analizador-texto' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'gen-pass' }
        ]
    },

    // 62 — catálogo: 700 → 450 (36% off) — flagship
    {
        id: 'pack_clasico_epico',
        nombre: 'Clásico Épico',
        icono: 'crown',
        descripcion: 'Lo mejor del catálogo en un solo pack. Exclusividad máxima.',
        precio: 450,
        items: [
            { tipo: 'app',    id: 'silly-calls' },
            { tipo: 'app',    id: 'vicscode' },
            { tipo: 'tema',   id: 'stream' },
            { tipo: 'widget', id: 'radio' }
        ]
    }
];
    
    // ========================================================
    //  Constantes de ofertas
    // ========================================================
    const IDB_NAME   = 'VicWebOsPromoZione';
    const IDB_STORE  = 'ofertas';
    const PESO_25    = 0.78;  // 78%
    const PESO_50    = 0.20;  // 20%
    const PESO_75    = 0.02;  // 2%

    // ========================================================
    //  Helpers de catálogo
    // ========================================================
    function _catalogoDe(tipo) {
        if (tipo === 'app')    return (typeof RUTAS_HERRAMIENTAS  !== 'undefined') ? RUTAS_HERRAMIENTAS  : [];
        if (tipo === 'tema')   return (typeof TEMAS_DISPONIBLES   !== 'undefined') ? TEMAS_DISPONIBLES   : [];
        if (tipo === 'widget') return (typeof WIDGETS_DISPONIBLES !== 'undefined') ? WIDGETS_DISPONIBLES : [];
        return [];
    }

    function _buscarItem(tipo, id) {
        return _catalogoDe(tipo).find(x => x.id === id) || null;
    }

    function _tieneItemInstalado(tipo, id) {
        if (!window.configCuentaActual) return false;
        const cfg = window.configCuentaActual;
        if (tipo === 'app')    return (cfg.appsInstaladas    || []).includes(id);
        if (tipo === 'tema')   return (cfg.temasInstalados   || []).includes(id);
        if (tipo === 'widget') return (cfg.widgetsInstalados || []).includes(id);
        return false;
    }

    // ========================================================
    //  PAQUETES — API
    // ========================================================
    function _packEsValido(pack) {
        if (!pack || !Array.isArray(pack.items)) return false;
        if (pack.items.length < 2 || pack.items.length > 4) return false;
        return pack.items.every(it => {
            const obj = _buscarItem(it.tipo, it.id);
            return obj && !obj.esBase && !obj.esDefault;
        });
    }

    function calcularEspacioPaquete(pack) {
        return (pack.items || []).reduce((acc, it) => {
            const obj = _buscarItem(it.tipo, it.id);
            if (!obj) return acc;
            return acc + (obj.espacio || 0);
        }, 0);
    }

    function calcularPrecioCatalogoPaquete(pack) {
        return (pack.items || []).reduce((acc, it) => {
            const obj = _buscarItem(it.tipo, it.id);
            if (!obj) return acc;
            return acc + (obj.monedas || 0);
        }, 0);
    }

    function tienePaqueteCompleto(pack) {
        return (pack.items || []).every(it => _tieneItemInstalado(it.tipo, it.id));
    }

    function obtenerPaquetesVisibles() {
        return PAQUETES_PROMO
            .filter(_packEsValido)
            .filter(p => !tienePaqueteCompleto(p))
            .map(p => ({
                id:          p.id,
                nombre:      p.nombre,
                icono:       p.icono || 'package',
                descripcion: p.descripcion || '',
                precio:      Number(p.precio) || 0,
                items:       p.items.map(it => {
                    const obj = _buscarItem(it.tipo, it.id);
                    return {
                        tipo:  it.tipo,
                        id:    it.id,
                        nombre: obj ? obj.nombre : it.id,
                        icono:  obj ? (obj.icono || 'circle') : 'circle',
                        yaLoTiene: _tieneItemInstalado(it.tipo, it.id)
                    };
                }),
                espacio:         calcularEspacioPaquete(p),
                precioCatalogo:  calcularPrecioCatalogoPaquete(p)
            }));
    }

    // ========================================================
    //  IndexedDB (aislada del caché del shell)
    // ========================================================
    function _abrirIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function _idbGet(key) {
        const db = await _abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const r  = tx.objectStore(IDB_STORE).get(key);
            r.onsuccess = () => res(r.result);
            r.onerror   = (e) => rej(e.target.error);
        });
    }

    async function _idbSet(key, val) {
        const db = await _abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(val, key);
            tx.oncomplete = () => res();
            tx.onerror    = (e) => rej(e.target.error);
        });
    }

    // ========================================================
    //  Fecha y hora de Chile (DST-safe con Intl)
    // ========================================================
    function fechaChileHoy() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    }

    function msHastaProximaMedianocheChile() {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).format(new Date()).split(':').map(Number);
        const transcurridos = partes[0] * 3600 + partes[1] * 60 + partes[2];
        return (86400 - transcurridos) * 1000;
    }

    // ========================================================
    //  Generación de ofertas del día
    // ========================================================
    function _elegirDescuento() {
        const r = Math.random();
        if (r < PESO_25) return 25;
        if (r < PESO_25 + PESO_50) return 50;
        return 75;
    }

    function _alAzar(lista) {
        if (!lista || !lista.length) return null;
        return lista[Math.floor(Math.random() * lista.length)];
    }

    function _generarOfertasDelDia() {
        const temas   = _catalogoDe('tema')  .filter(t => !t.esBase && (t.monedas || 0) > 0);
        const apps    = _catalogoDe('app')   .filter(a => !a.esBase && !a.esDefault && (a.monedas || 0) > 0);
        const widgets = _catalogoDe('widget').filter(w => !w.esBase && (w.monedas || 0) > 0);

        const out = [];
        const t = _alAzar(temas);
        const a = _alAzar(apps);
        const w = _alAzar(widgets);

        if (t) out.push({ tipo: 'tema',   id: t.id, descuento: _elegirDescuento() });
        if (a) out.push({ tipo: 'app',    id: a.id, descuento: _elegirDescuento() });
        if (w) out.push({ tipo: 'widget', id: w.id, descuento: _elegirDescuento() });

        return out;
    }

    function _claveOferta(codigo, fecha) {
        const com = (typeof window.obtenerComunidadActiva === 'function')
            ? window.obtenerComunidadActiva() : null;
        return `oferta_${com ? com.id : 'none'}_${codigo}_${fecha}`;
    }

    async function obtenerOfertasDelDia() {
        if (!window.cuentaActual) return [];
        const codigo = window.cuentaActual.codigo;
        const fecha  = fechaChileHoy();
        const key    = _claveOferta(codigo, fecha);

        let ofertas = null;
        try { ofertas = await _idbGet(key); } catch (e) { /* silencioso */ }

        if (!Array.isArray(ofertas)) {
            ofertas = _generarOfertasDelDia();
            try { await _idbSet(key, ofertas); } catch (e) { /* silencioso */ }
        }

        // Enriquecer + filtrar los que ya tiene
        return ofertas
            .map(o => {
                const obj = _buscarItem(o.tipo, o.id);
                if (!obj) return null;
                if (_tieneItemInstalado(o.tipo, o.id)) return null;
                const precioOriginal = obj.monedas || 0;
                const precioFinal = Math.floor(precioOriginal * (1 - o.descuento / 100));
                return {
                    tipo:           o.tipo,
                    id:             o.id,
                    descuento:      o.descuento,
                    nombre:         obj.nombre,
                    icono:          obj.icono || 'circle',
                    descripcion:    obj.descripcion || '',
                    espacio:        obj.espacio || 0,
                    precioOriginal: precioOriginal,
                    precioFinal:    precioFinal
                };
            })
            .filter(Boolean);
    }

    // ========================================================
    //  COMPRAR PAQUETE (desde el shell)
    // ========================================================
    async function comprarPaquete(packId) {
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            throw new Error('Conecta una comunidad primero.');
        }
        if (!window.cuentaActual) throw new Error('Necesitas una cuenta.');

        const pack = PAQUETES_PROMO.find(p => p.id === packId);
        if (!pack) throw new Error('Paquete no encontrado.');
        if (!_packEsValido(pack)) throw new Error('Este paquete tiene items inválidos.');

        const codigo = window.cuentaActual.codigo;

        // Refrescar config actual para no usar caché viejo
        if (typeof obtenerConfigCuenta === 'function') {
            window.configCuentaActual = await obtenerConfigCuenta(codigo);
        }

        if (tienePaqueteCompleto(pack)) {
            throw new Error('Ya tenés todos los items de este paquete.');
        }

        const espacioPack = calcularEspacioPaquete(pack);
        if (typeof calcularEspacioLibre === 'function' && calcularEspacioLibre() < espacioPack) {
            throw new Error(`Necesitás ${espacioPack} de espacio (tenés ${calcularEspacioLibre()} libres).`);
        }

        const precio = Number(pack.precio) || 0;
        if (typeof obtenerMonedas === 'function' && obtenerMonedas() < precio) {
            throw new Error(`Te faltan ${precio - obtenerMonedas()} monedas.`);
        }

        if (precio > 0) {
            await gastoBoleta('package', 'stor-he', `Paquete: ${pack.nombre}`, precio);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.appsInstaladas    = cfg.appsInstaladas    || [];
            cfg.temasInstalados   = cfg.temasInstalados   || [];
            cfg.widgetsInstalados = cfg.widgetsInstalados || [];

            for (const it of pack.items) {
                if (it.tipo === 'app'    && !cfg.appsInstaladas.includes(it.id))    cfg.appsInstaladas.push(it.id);
                if (it.tipo === 'tema'   && !cfg.temasInstalados.includes(it.id))   cfg.temasInstalados.push(it.id);
                if (it.tipo === 'widget' && !cfg.widgetsInstalados.includes(it.id)) cfg.widgetsInstalados.push(it.id);
            }
            return cfg;
        });

        window.configCuentaActual = await obtenerConfigCuenta(codigo);

        // Re-render del shell
        try {
            if (typeof renderSidebar === 'function')         renderSidebar();
            if (typeof renderAccesosRapidos === 'function')  renderAccesosRapidos();
            if (typeof renderWidgetsActivos === 'function')  renderWidgetsActivos();
            if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        } catch (e) { /* silencioso */ }

        return { ok: true };
    }

    // ========================================================
    //  COMPRAR OFERTA
    // ========================================================
    async function comprarOferta(tipo, id, descuento) {
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            throw new Error('Conecta una comunidad primero.');
        }
        if (!window.cuentaActual) throw new Error('Necesitas una cuenta.');

        const obj = _buscarItem(tipo, id);
        if (!obj) throw new Error('Item no encontrado.');

        const desc = Math.max(0, Math.min(75, Number(descuento) || 0));
        const codigo = window.cuentaActual.codigo;

        if (typeof obtenerConfigCuenta === 'function') {
            window.configCuentaActual = await obtenerConfigCuenta(codigo);
        }

        if (_tieneItemInstalado(tipo, id)) {
            throw new Error('Ya tenés este item.');
        }

        const precioOriginal = obj.monedas || 0;
        const precioFinal    = Math.floor(precioOriginal * (1 - desc / 100));

        if (typeof calcularEspacioLibre === 'function' && calcularEspacioLibre() < (obj.espacio || 0)) {
            throw new Error(`Necesitás ${obj.espacio} de espacio (tenés ${calcularEspacioLibre()} libres).`);
        }
        if (typeof obtenerMonedas === 'function' && obtenerMonedas() < precioFinal) {
            throw new Error(`Te faltan ${precioFinal - obtenerMonedas()} monedas.`);
        }

        if (precioFinal > 0) {
            await gastoBoleta(obj.icono || 'coins', 'stor-he', `Oferta: ${obj.nombre} (-${desc}%)`, precioFinal);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.appsInstaladas    = cfg.appsInstaladas    || [];
            cfg.temasInstalados   = cfg.temasInstalados   || [];
            cfg.widgetsInstalados = cfg.widgetsInstalados || [];

            if (tipo === 'app'    && !cfg.appsInstaladas.includes(id))    cfg.appsInstaladas.push(id);
            if (tipo === 'tema'   && !cfg.temasInstalados.includes(id))   cfg.temasInstalados.push(id);
            if (tipo === 'widget' && !cfg.widgetsInstalados.includes(id)) cfg.widgetsInstalados.push(id);
            return cfg;
        });

        window.configCuentaActual = await obtenerConfigCuenta(codigo);

        try {
            if (typeof renderSidebar === 'function')         renderSidebar();
            if (typeof renderAccesosRapidos === 'function')  renderAccesosRapidos();
            if (typeof renderWidgetsActivos === 'function')  renderWidgetsActivos();
            if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        } catch (e) { /* silencioso */ }

        return { ok: true };
    }

    // ========================================================
    //  API pública
    // ========================================================
    window.PromoZione = {
        PAQUETES:                    PAQUETES_PROMO,
        obtenerPaquetesVisibles,
        calcularEspacioPaquete,
        calcularPrecioCatalogoPaquete,
        tienePaqueteCompleto,
        tieneItemInstalado:          _tieneItemInstalado,
        obtenerOfertasDelDia,
        comprarPaquete,
        comprarOferta,
        fechaChileHoy,
        msHastaProximaMedianocheChile
    };
})();
