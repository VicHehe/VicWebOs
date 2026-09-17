// ============================================================
//  JsTemas.js — Catálogo de TEMAS
// ============================================================

const TEMAS_DISPONIBLES = [
    {
        id: 'violeta',
        nombre: 'Violeta Clásico',
        icono: 'palette',
        descripcion: 'El tema por defecto. Fondo blanco, violeta clásico.',
        categoria: 'Oficiales',
        esBase: true,
        ruta: 'Temas/violeta.css',
        espacio: 0,
        monedas: 0,
        colores: {
            '--violet-100': '#EDE9FE',
            '--violet-300': '#C4B5FD',
            '--violet-500': '#8B5CF6',
            '--bg':         '#FBFBFD',
            '--bg-alt':     '#F5F5F8',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'rosa',
        nombre: 'Rosa Pastel',
        icono: 'flower-2',
        descripcion: 'Tonos rosados suaves y cálidos.',
        categoria: 'Oficiales',
        ruta: 'Temas/rosa.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#FFE4EC',
            '--violet-300': '#FFA3BC',
            '--violet-500': '#EC4899',
            '--bg':         '#FFFAFB',
            '--bg-alt':     '#FFF5F7',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'oceano',
        nombre: 'Océano',
        icono: 'waves',
        descripcion: 'Azules profundos, tipo mar.',
        categoria: 'Oficiales',
        ruta: 'Temas/oceano.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#DBEAFE',
            '--violet-300': '#93C5FD',
            '--violet-500': '#3B82F6',
            '--bg':         '#F8FAFC',
            '--bg-alt':     '#F1F5F9',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'bosque',
        nombre: 'Bosque',
        icono: 'trees',
        descripcion: 'Verdes naturales y frescos.',
        categoria: 'Oficiales',
        ruta: 'Temas/bosque.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#D1FAE5',
            '--violet-300': '#6EE7B7',
            '--violet-500': '#10B981',
            '--bg':         '#F8FBF9',
            '--bg-alt':     '#F0F7F3',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'atardecer',
        nombre: 'Atardecer',
        icono: 'sunset',
        descripcion: 'Naranjas y ámbar cálidos.',
        categoria: 'Oficiales',
        ruta: 'Temas/atardecer.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#FFEDD5',
            '--violet-300': '#FDBA74',
            '--violet-500': '#F97316',
            '--bg':         '#FFFBF5',
            '--bg-alt':     '#FFF7ED',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'noche',
        nombre: 'Noche Estrellada',
        icono: 'moon',
        descripcion: 'Oscuros con acentos suaves.',
        categoria: 'Oficiales',
        ruta: 'Temas/noche.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#312E81',
            '--violet-300': '#4C1D95',
            '--violet-500': '#8B5CF6',
            '--bg':         '#0F0F1A',
            '--bg-alt':     '#1A1A2E',
            '--white':      '#1A1A2E'
        }
    },
    {
        id: 'vapor',
        nombre: 'Vapor',
        icono: 'sunset',
        descripcion: 'Fondo negro con paleta vaporwave. Nostalgia de los 80s.',
        categoria: 'Especiales',
        ruta: 'Temas/vapor.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#2A1A44',
            '--violet-300': '#C084FC',
            '--violet-500': '#F472B6',
            '--bg':         '#0A0510',
            '--bg-alt':     '#150A22',
            '--white':      '#0F0818'
        }
    },
    {
        id: 'consentido',
        nombre: 'Consentido',
        icono: 'heart',
        descripcion: 'Colores chilenos cálidos. Para los que se consienten.',
        categoria: 'Especiales',
        ruta: 'Temas/consentido.css',
        espacio: 2,
        monedas: 18,
        colores: {
            '--violet-100': '#FFE4E4',
            '--violet-300': '#FCA5A5',
            '--violet-500': '#D52B1E',
            '--bg':         '#FFFBF7',
            '--bg-alt':     '#FFF5EE',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'dreams',
        nombre: 'Dreams and Hopes',
        icono: 'sparkles',
        descripcion: 'Fondo negro profundo con acentos arcoíris. Para soñadores.',
        categoria: 'Especiales',
        ruta: 'Temas/dreams.css',
        espacio: 2,
        monedas: 30,
        colores: {
            '--violet-100': '#2E1A44',
            '--violet-300': '#7C4DE8',
            '--violet-500': '#C084FC',
            '--bg':         '#050510',
            '--bg-alt':     '#0F0F1E',
            '--white':      '#0A0A15'
        }
    }
];
