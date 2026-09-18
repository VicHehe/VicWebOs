// ============================================================
//  JsRutas.js — Catálogo de APPS
//  Cada app tiene: espacio (int) y monedas (int).
//  esBase: true    → no se puede desinstalar
//  esDefault: true → se instala automáticamente al crear cuenta
//                    o se añade a cuentas viejas que no la tengan
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
        espacio: 6,
        monedas: 0
    },
    {
        id: 'dino',
        nombre: 'Dino',
        icono: 'gamepad-2',
        ruta: 'herramientas/dino/index.html',
        descripcion: 'El clásico runner. Gana monedas mientras corres.',
        categoria: 'Juegos',
        esBase: false,
        espacio: 6,
        monedas: 0
    },
    {
        id: 'evmail',
        nombre: 'EVmail',
        icono: 'mail',
        ruta: 'herramientas/evmail/index.html',
        descripcion: 'Correo interno entre los usuarios del grupo.',
        categoria: 'Social',
        esBase: false,
        espacio: 6,
        monedas: 0
    }
