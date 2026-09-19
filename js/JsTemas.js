// ============================================================
//  JsTemas.js — Catálogo de TEMAS
//  ------------------------------------------------------------
//  ESCALA DE ESPACIO:
//    0 → tema base del sistema
//    2 → solo variables :root (colores, sombras, radios)
//    4 → añade pseudo-elementos, SVG patterns, texturas o animaciones
//
//  ESCALA DE PRECIO:
//    0   → oficiales gratuitos
//    5   → entrada: recolor simple
//    10  → recolor icónico o con un detalle propio
//    15  → efecto visual claro (pattern SVG, scanlines)
//    18  → edición especial
//    20  → múltiples efectos (pseudo-elementos, bordes, animación)
//    25  → textura + efectos combinados, artesanía
//    30  → flagship: animación en vivo + múltiples capas
//
//  ORGANIZACIÓN (6 categorías, mínimo 4 temas cada una):
//    Sistema     → los 4 esenciales (violeta es el default)
//    Cálidos     → paletas cálidas (rojo, dorado, naranjo)
//    Oscuros     → dark mode sin efectos especiales
//    Retro       → estéticas de décadas pasadas
//    Formales    → OS-like, institucionales
//    Especiales  → flagships con animaciones y ediciones únicas
//
//  REGLA DE ORO: cada salto de precio se tiene que VER en la pantalla.
// ============================================================

const TEMAS_DISPONIBLES = [

    // ============================================================
    //  SISTEMA — Esenciales, base del OS
    // ============================================================
    {
        id: 'violeta',
        nombre: 'Violeta Clásico',
        icono: 'palette',
        descripcion: 'El tema por defecto. Fondo blanco, violeta clásico.',
        categoria: 'Sistema',
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
        categoria: 'Sistema',
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
        categoria: 'Sistema',
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
        categoria: 'Sistema',
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

    // ============================================================
    //  CÁLIDOS — Paletas cálidas, rojos, dorados, naranjos
    // ============================================================
    {
        id: 'atardecer',
        nombre: 'Atardecer',
        icono: 'sunset',
        descripcion: 'Naranjas y ámbar cálidos.',
        categoria: 'Cálidos',
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
        id: 'rojizo',
        nombre: 'Rojizo',
        icono: 'flame',
        descripcion: 'Rojo clásico, directo y cálido.',
        categoria: 'Cálidos',
        ruta: 'Temas/rojizo.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#FEE2E2',
            '--violet-300': '#FCA5A5',
            '--violet-500': '#EF4444',
            '--bg':         '#FFF8F8',
            '--bg-alt':     '#FFF1F1',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'golden',
        nombre: 'Golden',
        icono: 'crown',
        descripcion: 'Dorado y amarillo cálido, elegancia luminosa.',
        categoria: 'Cálidos',
        ruta: 'Temas/golden.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#FEF3C7',
            '--violet-300': '#FCD34D',
            '--violet-500': '#F59E0B',
            '--bg':         '#FFFDF5',
            '--bg-alt':     '#FFF9E6',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'pumkin',
        nombre: 'Pumkin',
        icono: 'ghost',
        descripcion: 'Naranjo calabaza y morado profundo sobre fondo oscuro.',
        categoria: 'Cálidos',
        ruta: 'Temas/pumkin.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#3D1F3A',
            '--violet-300': '#A0508A',
            '--violet-500': '#FF7B1F',
            '--bg':         '#0D0610',
            '--bg-alt':     '#1A1020',
            '--white':      '#1A1020'
        }
    },

    // ============================================================
    //  OSCUROS — Dark mode puro, sin efectos especiales
    // ============================================================
    {
        id: 'noche',
        nombre: 'Noche Estrellada',
        icono: 'moon',
        descripcion: 'Oscuros con acentos suaves.',
        categoria: 'Oscuros',
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
        categoria: 'Oscuros',
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
        id: 'oficina-dark',
        nombre: 'Oficina Dark',
        icono: 'briefcase',
        descripcion: 'La versión nocturna de Oficina. Negro formal, bordes grises. Para trabajar de noche.',
        categoria: 'Oscuros',
        ruta: 'Temas/oficina-dark.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#1F1F23',
            '--violet-300': '#3A3A40',
            '--violet-500': '#A8A8B3',
            '--bg':         '#0E0E10',
            '--bg-alt':     '#171719',
            '--white':      '#1F1F23'
        }
    },
    {
        id: 'github-lover',
        nombre: 'Github Lover',
        icono: 'github',
        descripcion: 'Modo oscuro oficial de GitHub. Gris azulado, bordes #30363d y acento azul #58a6ff.',
        categoria: 'Oscuros',
        ruta: 'Temas/github-lover.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#163d8a',
            '--violet-300': '#388bfd',
            '--violet-500': '#58a6ff',
            '--bg':         '#0d1117',
            '--bg-alt':     '#161b22',
            '--white':      '#161b22'
        }
    },

    // ============================================================
    //  RETRO — Estéticas de décadas pasadas
    // ============================================================
    {
        id: 'hacker',
        nombre: 'Hacker',
        icono: 'terminal',
        descripcion: 'Fondo negro, verde terminal. Directo al grano.',
        categoria: 'Retro',
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
        id: 'vapor',
        nombre: 'Vapor',
        icono: 'radio',
        descripcion: 'Fondo negro con paleta vaporwave. Nostalgia de los 80s.',
        categoria: 'Retro',
        ruta: 'Temas/vapor.css',
        espacio: 2,
        monedas: 10,
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
        categoria: 'Retro',
        ruta: 'Temas/salon.css',
        espacio: 2,
        monedas: 10,
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
        id: 'chiptune',
        nombre: 'Chiptune',
        icono: 'gamepad-2',
        descripcion: 'Paleta Game Boy, scanlines CRT y glitch sutil. Actitud 8-bit.',
        categoria: 'Retro',
        ruta: 'Temas/chiptune.css',
        espacio: 4,
        monedas: 15,
        colores: {
            '--violet-100': '#E0EAA0',
            '--violet-300': '#9BBC0F',
            '--violet-500': '#7A9A0F',
            '--bg':         '#DCE6B8',
            '--bg-alt':     '#D4E0A0',
            '--white':      '#E8F0C8'
        }
    },

    // ============================================================
    //  FORMALES — OS-like, institucionales, elegantes
    // ============================================================
    {
        id: 'oficina',
        nombre: 'Oficina',
        icono: 'building-2',
        descripcion: 'Formal y minimalista. Gris pizarra, bordes finos. Para trabajar en serio.',
        categoria: 'Formales',
        ruta: 'Temas/oficina.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#E4E6EA',
            '--violet-300': '#A8AEB8',
            '--violet-500': '#4A5260',
            '--bg':         '#E8E8E5',
            '--bg-alt':     '#D8D8D4',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'ventanas',
        nombre: 'Ventanas',
        icono: 'app-window',
        descripcion: 'Windows de barrio. Azul Fluent, esquinas suaves y chrome de ventana.',
        categoria: 'Formales',
        ruta: 'Temas/ventanas.css',
        espacio: 4,
        monedas: 10,
        colores: {
            '--violet-100': '#D6E8F7',
            '--violet-300': '#7FB8E6',
            '--violet-500': '#0078D4',
            '--bg':         '#F3F3F3',
            '--bg-alt':     '#EAEAEA',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'celeste',
        nombre: 'Celeste Nublado',
        icono: 'cloud',
        descripcion: 'Cielo pastel grisáceo con nubes suaves vectoriales.',
        categoria: 'Formales',
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
        id: 'libro',
        nombre: 'Libro de Historia',
        icono: 'book-open',
        descripcion: 'Cuero, papel envejecido y lomo de encuadernación. Para los que atesoran el pasado.',
        categoria: 'Formales',
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

    // ============================================================
    //  ESPECIALES — Flagships, ediciones únicas
    // ============================================================
    {
        id: 'consentido',
        nombre: 'Consentido',
        icono: 'heart',
        descripcion: 'Chile en todo su esplendor. Bandera, manta de huaso, copihues y guirnaldas de fonda.',
        categoria: 'Especiales',
        ruta: 'Temas/consentido.css',
        espacio: 4,
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
        id: 'floral',
        nombre: 'Floral',
        icono: 'flower',
        descripcion: 'Colores vivos, pétalos y verdes frescos. Para los que florecen.',
        categoria: 'Especiales',
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
        id: 'dreams',
        nombre: 'Dreams and Hopes',
        icono: 'sparkles',
        descripcion: 'Fondo negro profundo con bordes arcoíris. Para soñadores.',
        categoria: 'Especiales',
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
        id: 'break-of-dawn',
        nombre: 'Break of Dawn',
        icono: 'sunrise',
        descripcion: 'Amanecer sobre el mar. Cielo degradado y oleaje animado al fondo.',
        categoria: 'Especiales',
        ruta: 'Temas/break-of-dawn.css',
        espacio: 4,
        monedas: 30,
        colores: {
            '--violet-100': '#FFE0D1',
            '--violet-300': '#FFA07A',
            '--violet-500': '#FF7043',
            '--bg':         '#FFF8F2',
            '--bg-alt':     '#FFEFE5',
            '--white':      '#FFFDFB'
        }
    },
    {
        id: 'friend',
        nombre: '¿¡Friend!?',
        icono: 'star',
        descripcion: 'Fondo oscuro con luces amarillas y rosas que titilan, y bordes neón brillantes.',
        categoria: 'Especiales',
        ruta: 'Temas/friend.css',
        espacio: 4,
        monedas: 30,
        colores: {
            '--violet-100': '#2A1A44',
            '--violet-300': '#E879F9',
            '--violet-500': '#EC4899',
            '--bg':         '#050310',
            '--bg-alt':     '#0A0618',
            '--white':      '#0F0820'
        }
    }
];
