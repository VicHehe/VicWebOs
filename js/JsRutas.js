// ============================================================
//  JsRutas.js — Catálogo de APPS
//  Cada app tiene: espacio (int) y monedas (int).
//  esBase: true    → no se puede desinstalar
//  esDefault: true → se instala automáticamente al crear cuenta
//                    o se añade a cuentas viejas que no la tengan
//
//  ESCALA DE ESPACIO (par, progresiva):
//    2  → app mínima (1 botón, canvas simple)
//    4  → herramienta estándar (DOM + lógica ligera)
//    6  → app con contenido real (grid, estado, modales)
//    8  → app compleja (polling, editor, picker, multi-vista)
//    10 → app muy compleja (WebRTC, MediaRecorder, multi-vista)
//
//  ESCALA DE PRECIO (0 a 250):
//    0     → base del SO (un SO lo trae por defecto)
//    0     → juegos gratis (excepción: son la base económica)
//    15    → entrada: app simple no-base
//    40-90 → media: herramienta útil o entretenimiento
//    100+  → alta: mucha complejidad técnica o muy pedida
//    250   → tope del catálogo
//
//  REGLA: cada app debe tener un icono ÚNICO en el catálogo.
//  Si agregás una nueva, verificá que su icono no esté ya en uso.
//
//  ORDEN:
//    1. Sistema primero (excepción a la regla alfabética).
//    2. Resto de categorías alfabéticas.
//    3. Dentro de cada categoría, precio de menor a mayor.
//       Desempate por id alfabético.
// ============================================================

const RUTAS_HERRAMIENTAS = [

    // ============================================================
    //  SISTEMA (siempre al frente)
    // ============================================================
    {
        id: 'stor-he',
        nombre: 'Stor-He',
        icono: 'store',
        ruta: 'herramientas/stor-he/index.html',
        descripcion: 'Tienda: descarga apps, temas y widgets.',
        categoria: 'Sistema',
        esBase: true,
        espacio: 0,
        monedas: 0
    },
    {
        id: 'chequera',
        nombre: 'Chequera',
        icono: 'wallet',
        ruta: 'herramientas/chequera/index.html',
        descripcion: 'Aquí ves tus monedas, ganancias y gastos.',
        categoria: 'Sistema',
        esBase: true,
        esDefault: true,
        espacio: 0,
        monedas: 0
    },
    {
        id: 'contactos',
        nombre: 'Contactos',
        icono: 'book-user',
        ruta: 'herramientas/contactos/index.html',
        descripcion: 'Directorio de la comunidad. Regala monedas a tus amigos.',
        categoria: 'Sistema',
        esBase: true,
        esDefault: true,
        espacio: 0,
        monedas: 0
    },
    {
        id: 'galeria',
        nombre: 'Galería',
        icono: 'images',
        ruta: 'herramientas/galeria/index.html',
        descripcion: 'Tus fotos en un solo lugar. Se reutilizan en cualquier app.',
        categoria: 'Sistema',
        esBase: true,
        esDefault: true,
        espacio: 0,
        monedas: 0
    },

    // ============================================================
    //  CREATIVIDAD
    // ============================================================
    {
    id: 'memevics',
    nombre: 'Meme Sculptor',
    icono: 'laugh',
    ruta: 'herramientas/memevics/index.html',
    descripcion: 'Creá memes en segundos. Elegí imagen de tu galería o subí una, escribí los textos y exportá a PNG o Galería.',
    categoria: 'Creatividad',
    esBase: false,
    espacio: 4,
    monedas: 20
},
        {
        id: 'piano',
        nombre: 'Piano Virtual',
        icono: 'piano',
        ruta: 'herramientas/piano/index.html',
        descripcion: 'Piano con teclado del PC o toque. Graba tus composiciones y descárgalas como MIDI.',
        categoria: 'Creatividad',
        esBase: false,
        espacio: 4,
        monedas: 40
    },
    {
    id: 'tillyporgrafo',
    nombre: 'TillyPorgrafo',
    icono: 'type',
    ruta: 'herramientas/tillyporgrafo/index.html',
    descripcion: 'Diseñá tu propia fuente letra por letra. Guías tipográficas, vista previa en vivo y export a TTF instalable.',
    categoria: 'Creatividad',
    esBase: false,
    espacio: 6,
    monedas: 65
},
        {
        id: 'ocs',
        nombre: 'Mis OCs',
        icono: 'sparkles',
        ruta: 'herramientas/ocs/index.html',
        descripcion: 'Creá y organizá tus personajes originales con stats, gustos e historias.',
        categoria: 'Creatividad',
        esBase: false,
        espacio: 8,
        monedas: 90
    },
    {
    id: 'flipovics',
    nombre: 'FlipoVics',
    icono: 'film',
    ruta: 'herramientas/flipovics/index.html',
    descripcion: 'Animá tus dibujos cuadro a cuadro. Onion skin para ver los frames previos, loop en vivo y export a GIF o WebM animado.',
    categoria: 'Creatividad',
    esBase: false,
    espacio: 6,
    monedas: 110
},
    {
        id: 'pixevan',
        nombre: 'PixEvan',
        icono: 'grid-2x2',                 // ← CAMBIO: era grid-3x3 (chocaba con tres-en-raya)
        ruta: 'herramientas/pixevan/index.html',
        descripcion: 'Editor de pixel art por capas y frames. Exporta spritesheets.',
        categoria: 'Creatividad',
        esBase: false,
        espacio: 8,
        monedas: 130
    },
    {
        id: 'arte-flash',
        nombre: 'Arte Flash',
        icono: 'palette',
        ruta: 'herramientas/arte-flash/index.html',
        descripcion: 'Editor de dibujo con capas, pinceles y referencias. Estilo Procreate.',
        categoria: 'Creatividad',
        esBase: false,
        espacio: 10,
        monedas: 220
    },
    {
    id: 'sill3dy',
    nombre: 'Sill3Dy',
    icono: 'box',
    ruta: 'herramientas/sill3dy/index.html',
    descripcion: 'Escultor de voxels en 3D. Modelá con cubos, pintá con paletas y exportá como OBJ o PNG.',
    categoria: 'Creatividad',
    esBase: false,
    espacio: 10,
    monedas: 240
},

    // ============================================================
    //  HERRAMIENTAS PRÁCTICAS
    // ============================================================
    {
        id: 'calculadora',
        nombre: 'Calculadora',
        icono: 'calculator',
        ruta: 'herramientas/calculadora/index.html',
        descripcion: 'Calculadora promedio + intereses, fechas y gráficos.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 0
    },
    {
        id: 'notas',
        nombre: 'Notas',
        icono: 'notebook-pen',
        ruta: 'herramientas/notas/index.html',
        descripcion: 'Bloc de notas. Guarda hasta 10 notas gratis con búsqueda y descarga premium.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 6,
        monedas: 0
    },
    {
        id: 'camara',
        nombre: 'Cámara',
        icono: 'camera',
        ruta: 'herramientas/camara/index.html',
        descripcion: 'Saca fotos con filtros y marcos. Descárgalas o mándalas a la galería.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 5
    },
    {
        id: 'lector-pdf',
        nombre: 'Lector PDF',
        icono: 'file-text',
        ruta: 'herramientas/lector-pdf/index.html',
        descripcion: 'Lee PDFs guardados localmente en tu dispositivo. Hasta 10 archivos.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 10
    },
    {
        id: 'qr',
        nombre: 'Generador QR',
        icono: 'qr-code',
        ruta: 'herramientas/qr/index.html',
        descripcion: 'Convierte texto o URLs en códigos QR descargables en PNG.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 2,
        monedas: 15
    },
        {
        id: 'ocr',
        nombre: 'Vicsion',
        icono: 'scan-text',
        ruta: 'herramientas/ocr/index.html',
        descripcion: 'Ve una imagen y te devuelve el texto. Reconoce varios idiomas, sin subir nada a internet.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 20
    },
        {
        id: 'calendario',
        nombre: 'VicsCal',
        icono: 'calendar-days',
        ruta: 'herramientas/vicscal/index.html',
        descripcion: 'Calendario con eventos personales y públicos de la comunidad. Con notificaciones del día.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 35
    },
        {
        id: 'traductor',
        nombre: 'Vicslate',
        icono: 'languages',
        ruta: 'herramientas/vicslate/index.html',
        descripcion: 'Traducí texto a más de 35 idiomas. Historial, favoritos y comparador de motores incluidos.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 2,
        monedas: 45
    },
    {
        id: 'photo-shinny',
        nombre: 'Photo Shinny',
        icono: 'wand-2',
        ruta: 'herramientas/photo-shinny/index.html',
        descripcion: 'Edita tus fotos de la galería: filtros, recortes, rotación y más.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 4,
        monedas: 70
    },
    {
        id: 'gastos',
        nombre: 'Gestor de Gastos',
        icono: 'receipt',                  // ← CAMBIO: era wallet (chocaba con chequera)
        ruta: 'herramientas/gastos/index.html',
        descripcion: 'Controlá tus ingresos, gastos y simulá escenarios antes de gastar.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 6,
        monedas: 70
    },
        {
        id: 'cv',
        nombre: 'Currículum',
        icono: 'file-user',
        ruta: 'herramientas/cv/index.html',
        descripcion: 'Creá tu CV profesional. Rellená el formulario, elegí un tema y descargalo en PDF o PNG.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 6,
        monedas: 75
    },
        {
        id: 'vicscode',
        nombre: 'VicsCode',
        icono: 'file-code',
        ruta: 'herramientas/vicscode/index.html',
        descripcion: 'Editor de código para tus repositorios de GitHub. Monaco, multi-pestaña, commit directo.',
        categoria: 'Herramientas Prácticas',
        esBase: false,
        espacio: 10,
        monedas: 250
    },

    // ============================================================
    //  JUEGOS
    // ============================================================
    {
        id: 'dino',
        nombre: 'Mezosoic Run',
        icono: 'gamepad-2',
        ruta: 'herramientas/dino/index.html',
        descripcion: 'El clásico runner. Gana monedas mientras corres.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 2,
        monedas: 0
    },
    {
        id: 'tres-en-raya',
        nombre: 'Tres en Raya',
        icono: 'grid-3x3',
        ruta: 'herramientas/tres-en-raya/index.html',
        descripcion: 'El clásico 3 en línea. La CPU se vuelve más difícil mientras acumulas victorias.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 4,
        monedas: 0
    },
    {
        id: 'whack-a-mole',
        nombre: 'Golpea el Topo',
        icono: 'hammer',
        ruta: 'herramientas/whack-a-mole/index.html',
        descripcion: 'Golpea los topos. Los topos son tu foto de perfil. 30 segundos por partida.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 2,
        monedas: 0
    },
    {
        id: 'wordle',
        nombre: 'Adivin-He',
        icono: 'type',
        ruta: 'herramientas/wordle/index.html',
        descripcion: 'Adivina la palabra de 5 letras. +25 monedas por victoria.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 4,
        monedas: 0
    },
        {
    id: 'caloluty',
    nombre: 'Caloluty',
    icono: 'crosshair',
    ruta: 'herramientas/caloluty/index.html',
    descripcion: 'Galería de tiro en 3D. 40 dianas, 60 segundos. Comprá armas y demostrá tu puntería.',
    categoria: 'Juegos',
    esBase: false,
    espacio: 6,
    monedas: 10
},
    {
    id: 'blackjack',
    nombre: 'Blackjack',
    icono: 'spade',
    ruta: 'herramientas/blackjack/index.html',
    descripcion: 'El clásico 21 contra el crupier. Apuestas monedas OS reales.',
    categoria: 'Juegos',
    esBase: false,
    espacio: 2,
    monedas: 20
},
    {
        id: 'metrorun',
        nombre: 'The MetroRun',
        icono: 'train-front',
        ruta: 'herramientas/metrorun/index.html',
        descripcion: 'Runner de 3 líneas, vista aérea. Esquivá vagones y recolectá monedas reales.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 6,
        monedas: 35
    },
        {
    id: 'minicity',
    nombre: 'MiniCity',
    icono: 'building',
    ruta: 'herramientas/minicity/index.html',
    descripcion: 'Construí tu ciudad, producí créditos y convertilos en Monedas OS reales.',
    categoria: 'Juegos',
    esBase: false,
    espacio: 10,
    monedas: 40
},


    // ============================================================
    //  SOCIAL
    // ============================================================
    {
        id: 'evmail',
        nombre: 'EVmail',
        icono: 'mail',
        ruta: 'herramientas/evmail/index.html',
        descripcion: 'Correo interno entre los usuarios del grupo.',
        categoria: 'Social',
        esBase: false,
        espacio: 8,
        monedas: 0
    },
    {
        id: 'twevan',
        nombre: 'Twevan',
        icono: 'bird',
        ruta: 'herramientas/twevan/index.html',
        descripcion: 'Mini red social. Publicá, comentá y hacete verificado con TwePlus.',
        categoria: 'Social',
        esBase: false,
        espacio: 12,
        monedas: 0
    },
    {
    id: 'delantedelmuro',
    nombre: 'Delante del muro',
    icono: 'book-user',
    ruta: 'herramientas/delantedelmuro/index.html',
    descripcion: 'Dejá un mensaje en el muro de tus amigos. Escribí, likear y comentá. Simple y directo.',
    categoria: 'Social',
    esBase: false,
    espacio: 2,
    monedas: 20
},
        {
        id: 'confesionario',
        nombre: 'El Confesionario',
        icono: 'drama',
        ruta: 'herramientas/confesionario/index.html',
        descripcion: 'Publicá confesiones 100% anónimas. Reaccioná y comentá sin que nadie sepa quién sos.',
        categoria: 'Social',
        esBase: false,
        espacio: 4,
        monedas: 45
    },
        {
        id: 'encuestas',
        nombre: 'Encuestas',
        icono: 'vote',
        ruta: 'herramientas/encuestas/index.html',
        descripcion: 'Creá encuestas con 2-6 opciones, categorías y filtros. Votos públicos o privados.',
        categoria: 'Social',
        esBase: false,
        espacio: 6,
        monedas: 60
    },
    {
        id: 'vicsgram',
        nombre: 'VicsGram',
        icono: 'aperture',                 // ← CAMBIO: era camera (chocaba con camara)
        ruta: 'herramientas/vicsgram/index.html',
        descripcion: 'Mini-Instagram de la comunidad. Compartí fotos, likes y comentarios.',
        categoria: 'Social',
        esBase: false,
        espacio: 8,
        monedas: 80
    },
    {
        id: 'whatthehay',
        nombre: 'WhatTheHay',
        icono: 'message-circle',
        ruta: 'herramientas/whatthehay/index.html',
        descripcion: 'Chat interno con privados, grupos y notas de voz cortas.',
        categoria: 'Social',
        esBase: false,
        espacio: 10,
        monedas: 160
    },
    {
        id: 'silly-calls',
        nombre: 'SillyCalls',
        icono: 'phone-call',
        ruta: 'herramientas/silly-calls/index.html',
        descripcion: 'Videollamadas en tiempo real entre usuarios de la comunidad.',
        categoria: 'Social',
        esBase: false,
        espacio: 10,
        monedas: 250
    },
    
 // ============================================================
 //  EDUCACIÓN
 // ============================================================
 {
     id: 'matequiz',
     nombre: 'MateQuiz',
     icono: 'brain',
     ruta: 'herramientas/matequiz/index.html',
     descripcion: 'Entrena tu mente con desafíos matemáticos diarios. Gana monedas y mantiene tu racha.',
     categoria: 'Educación',
     esBase: false,
     espacio: 6,
     monedas: 15
 }


    
];
