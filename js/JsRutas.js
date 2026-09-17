// ============================================================
//  JsRutas.js — Catálogo de apps disponibles (tienda)
//  NOTA: esto NO se muestra en el sidebar. Solo Stor-He lo lee
//  para listar lo que se puede instalar.
//  esBase: true → no se puede desinstalar.
// ============================================================

const RUTAS_HERRAMIENTAS = [
    {
        id: 'stor-he',
        nombre: 'Stor-He',
        icono: 'store',
        ruta: 'herramientas/stor-he/index.html',
        descripcion: 'Tienda de apps. Descarga otras herramientas.',
        categoria: 'Sistema',
        esBase: true
    }
    // Aquí irán las demás cuando quieras, ejemplo:
    // {
    //     id: 'sillycalls',
    //     nombre: 'SillyCalls',
    //     icono: 'phone',
    //     ruta: 'herramientas/sillycalls/index.html',
    //     descripcion: 'Llamadas de audio y video',
    //     categoria: 'Herramientas Prácticas'
    // }
];
