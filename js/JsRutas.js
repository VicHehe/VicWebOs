// ============================================================
//  JsRutas.js — Catálogo de VicWebOs
//  RUTAS_HERRAMIENTAS → apps
//  TEMAS_DISPONIBLES  → temas de la página
//  WIDGETS_DISPONIBLES → widgets instalables
// ============================================================

// ============================================================
//  APPS
// ============================================================
const RUTAS_HERRAMIENTAS = [
    {
        id: 'stor-he',
        nombre: 'Stor-He',
        icono: 'store',
        ruta: 'herramientas/stor-he/index.html',
        descripcion: 'Tienda: descarga apps, temas y widgets.',
        categoria: 'Sistema',
        esBase: true
    }
];

// ============================================================
//  TEMAS
//  colores: se aplican como variables CSS en el padre.
//  Deben existir los mismos 8 tokens (violet-50 → violet-700)
//  + gris de acento (bg, bg-alt, border).
// ============================================================
const TEMAS_DISPONIBLES = [
    {
        id: 'violeta',
        nombre: 'Violeta Clásico',
        icono: 'palette',
        descripcion: 'El tema por defecto de VicWebOs.',
        categoria: 'Oficiales',
        esBase: true,
        colores: {
            '--violet-50':  '#F5F3FF',
            '--violet-100': '#EDE9FE',
            '--violet-200': '#DDD6FE',
            '--violet-300': '#C4B5FD',
            '--violet-400': '#A78BFA',
            '--violet-500': '#8B5CF6',
            '--violet-600': '#7C3AED',
            '--violet-700': '#6D28D9',
            '--bg':         '#FBFBFD',
            '--bg-alt':     '#F5F5F8'
        }
    },
    {
        id: 'rosa',
        nombre: 'Rosa Pastel',
        icono: 'flower-2',
        descripcion: 'Tonos rosados suaves y cálidos.',
        categoria: 'Oficiales',
        colores: {
            '--violet-50':  '#FFF1F5',
            '--violet-100': '#FFE4EC',
            '--violet-200': '#FFC9D9',
            '--violet-300': '#FFA3BC',
            '--violet-400': '#FF7BA1',
            '--violet-500': '#EC4899',
            '--violet-600': '#DB2777',
            '--violet-700': '#BE185D',
            '--bg':         '#FFFAFB',
            '--bg-alt':     '#FFF5F7'
        }
    },
    {
        id: 'oceano',
        nombre: 'Océano',
        icono: 'waves',
        descripcion: 'Azules profundos, tipo mar.',
        categoria: 'Oficiales',
        colores: {
            '--violet-50':  '#EFF6FF',
            '--violet-100': '#DBEAFE',
            '--violet-200': '#BFDBFE',
            '--violet-300': '#93C5FD',
            '--violet-400': '#60A5FA',
            '--violet-500': '#3B82F6',
            '--violet-600': '#2563EB',
            '--violet-700': '#1D4ED8',
            '--bg':         '#F8FAFC',
            '--bg-alt':     '#F1F5F9'
        }
    },
    {
        id: 'bosque',
        nombre: 'Bosque',
        icono: 'trees',
        descripcion: 'Verdes naturales y frescos.',
        categoria: 'Oficiales',
        colores: {
            '--violet-50':  '#ECFDF5',
            '--violet-100': '#D1FAE5',
            '--violet-200': '#A7F3D0',
            '--violet-300': '#6EE7B7',
            '--violet-400': '#34D399',
            '--violet-500': '#10B981',
            '--violet-600': '#059669',
            '--violet-700': '#047857',
            '--bg':         '#F8FBF9',
            '--bg-alt':     '#F0F7F3'
        }
    },
    {
        id: 'atardecer',
        nombre: 'Atardecer',
        icono: 'sunset',
        descripcion: 'Naranjas y ámbar cálidos.',
        categoria: 'Oficiales',
        colores: {
            '--violet-50':  '#FFF7ED',
            '--violet-100': '#FFEDD5',
            '--violet-200': '#FED7AA',
            '--violet-300': '#FDBA74',
            '--violet-400': '#FB923C',
            '--violet-500': '#F97316',
            '--violet-600': '#EA580C',
            '--violet-700': '#C2410C',
            '--bg':         '#FFFBF5',
            '--bg-alt':     '#FFF7ED'
        }
    },
    {
        id: 'noche',
        nombre: 'Noche Estrellada',
        icono: 'moon',
        descripcion: 'Oscuros con acentos morados.',
        categoria: 'Oficiales',
        colores: {
            '--violet-50':  '#1E1B4B',
            '--violet-100': '#312E81',
            '--violet-200': '#3730A3',
            '--violet-300': '#4C1D95',
            '--violet-400': '#6D28D9',
            '--violet-500': '#8B5CF6',
            '--violet-600': '#A78BFA',
            '--violet-700': '#C4B5FD',
            '--bg':         '#0F0F1A',
            '--bg-alt':     '#1A1A2E'
        }
    }
];

// ============================================================
//  WIDGETS
//  Por ahora solo se registran como instalados. Su render
//  real lo añadiremos luego.
// ============================================================
const WIDGETS_DISPONIBLES = [
    {
        id: 'reloj-mundial',
        nombre: 'Reloj Mundial',
        icono: 'globe-2',
        descripcion: 'Muestra la hora en varias ciudades del mundo.',
        categoria: 'Utilidades',
        esBase: false
    },
    {
        id: 'clima-extendido',
        nombre: 'Clima Extendido',
        icono: 'cloud-sun',
        descripcion: 'Pronóstico de 7 días en tu ubicación.',
        categoria: 'Información',
        esBase: false
    },
    {
        id: 'notas-rapidas',
        nombre: 'Notas Rápidas',
        icono: 'sticky-note',
        descripcion: 'Post-its para apuntar lo que sea.',
        categoria: 'Utilidades',
        esBase: false
    },
    {
        id: 'calendario-mini',
        nombre: 'Calendario Mini',
        icono: 'calendar-days',
        descripcion: 'Vista de mes compacta.',
        categoria: 'Utilidades',
        esBase: false
    },
    {
        id: 'frase-del-dia',
        nombre: 'Frase del Día',
        icono: 'quote',
        descripcion: 'Una frase distinta cada día.',
        categoria: 'Decoración',
        esBase: false
    },
    {
        id: 'contador-visitas',
        nombre: 'Contador de Visitas',
        icono: 'eye',
        descripcion: 'Cuántas veces has entrado hoy.',
        categoria: 'Información',
        esBase: false
    }
];
