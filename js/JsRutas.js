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
// ============================================================

const RUTAS_HERRAMIENTAS = [
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
    id: 'qr',
    nombre: 'Generador QR',
    icono: 'qr-code',
    ruta: 'herramientas/qr/index.html',
    descripcion: 'Convierte texto o URLs en códigos QR descargables en PNG.',
    categoria: 'Herramientas Prácticas',
    esBase: false,
    espacio: 2,
    monedas: 5
},
    {
        id: 'dino',
        nombre: 'Dino',
        icono: 'gamepad-2',
        ruta: 'herramientas/dino/index.html',
        descripcion: 'El clásico runner. Gana monedas mientras corres.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 2,
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
        id: 'ajedrez',
        nombre: 'Ajedrez',
        icono: 'crown',
        ruta: 'herramientas/ajedrez/index.html',
        descripcion: 'El juego de reyes. IA en dos niveles, recompensas por capturas y victoria.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 8,
        monedas: 50
    },
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
];
