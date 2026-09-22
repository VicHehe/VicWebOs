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
        id: 'pixevan',
        nombre: 'PixEvan',
        icono: 'grid-3x3',
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
        id: 'vicsgram',
        nombre: 'VicsGram',
        icono: 'camera',
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

];
