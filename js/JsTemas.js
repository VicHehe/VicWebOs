// ============================================================
//  JsTemas.js — Catálogo de TEMAS
//  ------------------------------------------------------------
//  ESCALA DE ESPACIO:
//    0 → base del sistema (violeta)
//    2 → solo redefine variables :root
//    4 → añade pseudo-elementos, mask, SVG patterns o texturas
//
//  ESCALA DE PRECIO (monedas):
//    0   → oficiales (siempre disponibles)
//    5   → variante simple (solo colores, paleta distintiva)
//    10  → colores + 1-2 detalles propios
//    15  → efecto visual único (SVG pattern, patrón)
//    20  → múltiples efectos (mask, pseudo-elementos)
//    25  → tema muy elaborado (textura + efectos combinados)
// ============================================================

const TEMAS_DISPONIBLES = [
    // ============================================================
    //  OFICIALES (gratuitos)
    // ============================================================
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
        id: 'ocean',
        nombre: 'Deep Blue Ocean',
        icono: 'droplet',
        descripcion: 'Modo oscuro con azules marinos profundos y destellos teal.',
        categoria: 'Oficiales',
        ruta: 'Temas/ocean.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#13294B',
            '--violet-300': '#17879B',
            '--violet-500': '#1DAEC4',
            '--bg':         '#050E1C',
            '--bg-alt':     '#0A1628',
            '--white':      '#0A1628'
        }
    },
    {
        id: 'oficina',
        nombre: 'Oficina',
        icono: 'briefcase',
        descripcion: 'Formal y minimalista. Gris pizarra, bordes finos. Para trabajar en serio.',
        categoria: 'Oficiales',
        ruta: 'Temas/oficina.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#E4E6EA',
            '--violet-300': '#A8AEB8',
            '--violet-500': '#4A5260',
            '--bg':         '#FAFAF8',
            '--bg-alt':     '#F2F1EE',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'github-lover',
        nombre: 'Github Lover',
        icono: 'github',
        descripcion: 'Paleta oficial de GitHub. Una carta de amor al octocat.',
        categoria: 'Oficiales',
        ruta: 'Temas/github-lover.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#DDF4FF',
            '--violet-300': '#80CCFF',
            '--violet-500': '#0969DA',
            '--bg':         '#FFFFFF',
            '--bg-alt':     '#F6F8FA',
            '--white':      '#FFFFFF'
        }
    },

    // ============================================================
    //  COMPRABLES
    // ============================================================
    {
        id: 'vapor',
        nombre: 'Vapor',
        icono: 'sunset',
        descripcion: 'Fondo negro con paleta vaporwave. Nostalgia de los 80s.',
        categoria: 'Comprables',
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
        id: 'salon',
        nombre: 'Salón de Noche',
        icono: 'martini',
        descripcion: 'Rojo profundo y dorado. Inspirado en los salones de baile de los 40 y 50.',
        categoria: 'Comprables',
        ruta: 'Temas/salon.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#5C0A0A',
            '--violet-300': '#B8860B',
            '--violet-500': '#F5C518',
            '--bg':         '#2A0404',
            '--bg-alt':     '#3A0606',
            '--white':      '#3A0606'
        }
    },
    {
        id: 'hacker',
        nombre: 'Hacker',
        icono: 'terminal',
        descripcion: 'Fondo negro, verde terminal. Directo al grano.',
        categoria: 'Comprables',
        ruta: 'Temas/hacker.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#0F2F0F',
            '--violet-300': '#1F6F1F',
            '--violet-500': '#00FF41',
            '--bg':         '#000000',
            '--bg-alt':     '#0A0E0A',
            '--white':      '#0A0E0A'
        }
    },
    {
        id: 'consentido',
        nombre: 'Consentido',
        icono: 'heart',
        descripcion: 'Colores chilenos cálidos. Para los que se consienten.',
        categoria: 'Comprables',
        ruta: 'Temas/consentido.css',
        espacio: 2,
        monedas: 10,
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
    id: 'ventanas',
    nombre: 'Ventanas',
    icono: 'app-window',
    descripcion: 'Windows de barrio. Azul Fluent, esquinas suaves y chrome de ventana.',
    categoria: 'Comprables',
    ruta: 'Temas/ventanas.css',
    espacio: 4,
    monedas: 15,
    colores: {
        '--violet-100': '#D6E8F7',
        '--violet-300': '#7FB8E6',
        '--violet-500': '#0078D4',
        '--bg':         '#F3F3F3',
        '--bg-alt':     '#EAEAEA',
        '--white':      '#FFFFFF'
    }
}
    {
        id: 'celeste',
        nombre: 'Celeste Nublado',
        icono: 'cloud',
        descripcion: 'Cielo pastel grisáceo con nubes suaves vectoriales.',
        categoria: 'Comprables',
        ruta: 'Temas/celeste.css',
        espacio: 4,
        monedas: 15,
        colores: {
            '--violet-100': '#DDE9F2',
            '--violet-300': '#9CB8CD',
            '--violet-500': '#5E84A0',
            '--bg':         '#E7EDF3',
            '--bg-alt':     '#CADEEF',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'dreams',
        nombre: 'Dreams and Hopes',
        icono: 'sparkles',
        descripcion: 'Fondo negro profundo con bordes arcoíris. Para soñadores.',
        categoria: 'Comprables',
        ruta: 'Temas/dreams.css',
        espacio: 4,
        monedas: 20,
        colores: {
            '--violet-100': '#2E1A44',
            '--violet-300': '#7C4DE8',
            '--violet-500': '#C084FC',
            '--bg':         '#050510',
            '--bg-alt':     '#0F0F1E',
            '--white':      '#0A0A15'
        }
    },
    {
        id: 'floral',
        nombre: 'Floral',
        icono: 'flower',
        descripcion: 'Colores vivos, pétalos y verdes frescos. Para los que florecen.',
        categoria: 'Comprables',
        ruta: 'Temas/floral.css',
        espacio: 4,
        monedas: 20,
        colores: {
            '--violet-100': '#DCFCE7',
            '--violet-300': '#F9A8D4',
            '--violet-500': '#EC4899',
            '--bg':         '#F7FDF9',
            '--bg-alt':     '#F0F9F2',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'chiptune',
        nombre: 'Chiptune',
        icono: 'gamepad',
        descripcion: 'Paleta Game Boy y glitch sutil. Actitud 8-bit en toda la interfaz.',
        categoria: 'Comprables',
        ruta: 'Temas/chiptune.css',
        espacio: 4,
        monedas: 20,
        colores: {
            '--violet-100': '#E0EAA0',
            '--violet-300': '#9BBC0F',
            '--violet-500': '#7A9A0F',
            '--bg':         '#DCE6B8',
            '--bg-alt':     '#D4E0A0',
            '--white':      '#E8F0C8'
        }
    },
    {
        id: 'libro',
        nombre: 'Libro de Historia',
        icono: 'book-open',
        descripcion: 'Cuero, papel viejo y texturas desgastadas. Para los que atesoran el pasado.',
        categoria: 'Comprables',
        ruta: 'Temas/libro.css',
        espacio: 4,
        monedas: 25,
        colores: {
            '--violet-100': '#3E2C1C',
            '--violet-300': '#8B6B4A',
            '--violet-500': '#C49A6C',
            '--bg':         '#1A120A',
            '--bg-alt':     '#2A1F16',
            '--white':      '#2A1F16'
        }
    },
    {
        id: 'break-of-dawn',
        nombre: 'Break of Dawn',
        icono: 'sunrise',
        descripcion: 'Amanecer sobre el mar. Cielo degradado y oleaje animado al fondo.',
        categoria: 'Comprables',
        ruta: 'Temas/break-of-dawn.css',
        espacio: 4,
        monedas: 25,
        colores: {
            '--violet-100': '#FFE0D1',
            '--violet-300': '#FFA07A',
            '--violet-500': '#FF7043',
            '--bg':         '#FFF8F2',
            '--bg-alt':     '#FFEFE5',
            '--white':      '#FFFDFB'
        }
    }
];
