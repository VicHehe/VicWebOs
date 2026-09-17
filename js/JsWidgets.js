// ============================================================
//  JsWidgets.js — Catálogo de WIDGETS
//  Cada widget vive en /Widgets/{id}/ con index.html,
//  style.css y script.js (ver REGLAS_APPS.txt, Regla 5).
// ============================================================

const WIDGETS_DISPONIBLES = [
    {
        id: 'reloj-mundial',
        nombre: 'Reloj Mundial',
        icono: 'globe-2',
        ruta: 'Widgets/reloj-mundial/index.html',
        descripcion: 'Muestra la hora en varias ciudades del mundo.',
        categoria: 'Utilidades',
        esBase: false
    }
    // Cuando agregues un widget nuevo:
    // 1. Crea la carpeta Widgets/{id}/ con index.html, style.css, script.js
    // 2. Añade aquí su entrada
];
