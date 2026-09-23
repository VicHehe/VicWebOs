// ============================================================
//  JsTemas.js — Catálogo de TEMAS
//  ------------------------------------------------------------
//  ESCALA DE ESPACIO:
//    0 → tema base del sistema
//    2 → solo variables :root (colores, sombras, radios)
//    4 → añade pseudo-elementos, SVG patterns, texturas o animaciones
//
//  ESCALA DE PRECIO (0 a 50):
//    0   → oficiales gratuitos
//    10  → recolor puro :root
//    20  → chrome reescrito (header, sidebar, tabs, botones)
//    25  → chrome + un detalle decorativo (nubes, franja)
//    30  → efecto visual claro (pattern SVG, scanlines, glitch)
//    35  → múltiples capas combinadas (patterns + hovers únicos)
//    40  → textura + animación en vivo
//    45  → artesanal (marcos, florituras, decoración por sección)
//    50  → flagship: animaciones en vivo + múltiples capas
//    18  → 🔒 EXCLUSIVO DE CONSENTIDO (referencia al 18 de septiembre)
//
//  ORGANIZACIÓN:
//    Cada categoría ordenada por PRECIO de MENOR a MAYOR.
//    Dentro del mismo precio, orden por afinidad temática.
//
//  REGLA DE ORO: cada salto de precio se tiene que VER en la pantalla.
// ============================================================

const TEMAS_DISPONIBLES = [

    // ============================================================
    //  BÁSICOS — Recolors simples, light mode
    //  Todos comparten la misma estructura :root sin efectos.
    // ============================================================
    {
        id: 'violeta',
        nombre: 'Violeta Clásico',
        icono: 'palette',
        descripcion: 'El tema por defecto. Fondo blanco, violeta clásico.',
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        categoria: 'Básicos',
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
        id: 'turquesa',
        nombre: 'Turquesa',
        icono: 'droplets',
        descripcion: 'Cian y turquesa frescos, tipo agua de mar.',
        categoria: 'Básicos',
        ruta: 'Temas/turquesa.css',
        espacio: 2,
        monedas: 0,
        colores: {
            '--violet-100': '#CFFAFE',
            '--violet-300': '#67E8F9',
            '--violet-500': '#06B6D4',
            '--bg':         '#F5FEFF',
            '--bg-alt':     '#ECFDFF',
            '--white':      '#FFFFFF'
        }
    },

    // ============================================================
    //  OSCUROS — Dark mode simple, sin decoración
    //  Base oscura, distintos acentos. Sin efectos visuales.
    // ============================================================
    {
        id: 'noche',
        nombre: 'Noche Estrellada',
        icono: 'moon',
        descripcion: 'Oscuros con acentos suaves.',
        categoria: 'Oscuros',
        ruta: 'Temas/noche.css',
        espacio: 2,
        monedas: 10,
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
        monedas: 10,
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
        id: 'pumkin',
        nombre: 'Pumkin',
        icono: 'ghost',
        descripcion: 'Naranjo calabaza y morado profundo sobre fondo oscuro.',
        categoria: 'Oscuros',
        ruta: 'Temas/pumkin.css',
        espacio: 2,
        monedas: 10,
        colores: {
            '--violet-100': '#3D1F3A',
            '--violet-300': '#A0508A',
            '--violet-500': '#FF7B1F',
            '--bg':         '#0D0610',
            '--bg-alt':     '#1A1020',
            '--white':      '#1A1020'
        }
    },
    {
        id: 'github-lover',
        nombre: 'Github Lover',
        icono: 'github',
        descripcion: 'Modo oscuro oficial de GitHub. Gris azulado, bordes #30363d y acento azul #58a6ff.',
        categoria: 'Oscuros',
        ruta: 'Temas/github-lover.css',
        espacio: 4,
        monedas: 20,
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
    //  FORMALES — Para trabajar, elegantes, OS-like
    //  Vibra profesional, limpia, sin estridencias.
    // ============================================================
    {
        id: 'oficina',
        nombre: 'Oficina',
        icono: 'briefcase',
        descripcion: 'Formal y minimalista. Gris pizarra, bordes finos. Para trabajar en serio.',
        categoria: 'Formales',
        ruta: 'Temas/oficina.css',
        espacio: 2,
        monedas: 20,
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
        id: 'oficina-dark',
        nombre: 'Oficina Dark',
        icono: 'building-2',
        descripcion: 'La versión nocturna de Oficina. Negro formal, bordes grises. Para trabajar de noche.',
        categoria: 'Formales',
        ruta: 'Temas/oficina-dark.css',
        espacio: 2,
        monedas: 20,
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
        id: 'ventanas',
        nombre: 'Ventanas',
        icono: 'app-window',
        descripcion: 'Windows de barrio. Azul Fluent, esquinas suaves y chrome de ventana.',
        categoria: 'Formales',
        ruta: 'Temas/ventanas.css',
        espacio: 4,
        monedas: 25,
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
        monedas: 25,
        colores: {
            '--violet-100': '#DDE9F2',
            '--violet-300': '#9CB8CD',
            '--violet-500': '#5E84A0',
            '--bg':         '#E7EDF3',
            '--bg-alt':     '#CADEEF',
            '--white':      '#FFFFFF'
        }
    },

    // ============================================================
    //  RETRO — Referencias a décadas pasadas
    //  Cada uno evoca una época concreta.
    // ============================================================
    {
        id: 'hacker',
        nombre: 'Hacker',
        icono: 'terminal',
        descripcion: 'Fondo negro, verde terminal. Directo al grano.',
        categoria: 'Retro',
        ruta: 'Temas/hacker.css',
        espacio: 2,
        monedas: 10,
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
        monedas: 30,
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
    //  ESPECIALES — Flagships atmosféricos
    //  Efectos visuales, texturas, animaciones. Lo premium.
    //  Ordenados por precio ascendente.
    // ============================================================
    {
        id: 'mucho-besame',
        nombre: 'Mucho Besame',
        icono: 'sun',
        descripcion: 'México en todo su esplendor. Papel picado, cempasúchil, talavera y sombrero. Para gritar ¡Viva México!',
        categoria: 'Especiales',
        ruta: 'Temas/mucho-besame.css',
        espacio: 4,
        monedas: 16,   // 🔒 precio fijo por el 15 de septiembre
        colores: {
            '--violet-100': '#DCFCE7',
            '--violet-300': '#4ADE80',
            '--violet-500': '#006847',
            '--bg':         '#FFFCF5',
            '--bg-alt':     '#FFF6E8',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'consentido',
        nombre: 'Consentido',
        icono: 'heart',
        descripcion: 'Chile en todo su esplendor. Bandera, manta de huaso, copihues y guirnaldas de fonda.',
        categoria: 'Especiales',
        ruta: 'Temas/consentido.css',
        espacio: 4,
        monedas: 18,   // 🔒 precio fijo por el 18 de septiembre
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
        descripcion: 'Fondo negro profundo con bordes arcoíris. Para soñadores.',
        categoria: 'Especiales',
        ruta: 'Temas/dreams.css',
        espacio: 4,
        monedas: 30,
        colores: {
            '--violet-100': '#2E1A44',
            '--violet-300': '#7C4DE8',
            '--violet-500': '#C084FC',
            '--bg':         '#050510',
            '--bg-alt':     '#0F0F1E',
            '--white':      '#0A0A15'
        }
    },
    // (Va justo después de "Dreams and Hopes")
    {
        id: 'cuarzo-rosado',
        nombre: 'Cuarzo Rosado',
        icono: 'gem',
        descripcion: 'Magia, diamantes y tonos pastel. Inspirado en el poder de las gemas.',
        categoria: 'Especiales',
        ruta: 'Temas/cuarzo-rosado.css',
        espacio: 4,
        monedas: 30,
        colores: {
            '--violet-100': '#FCE7F3',
            '--violet-300': '#F9A8D4',
            '--violet-500': '#EC4899',
            '--bg':         '#FFF9FB',
            '--bg-alt':     '#FEF0F5',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'acuarela',
        nombre: 'Acuarela',
        icono: 'brush',
        descripcion: 'Papel blanco con manchas suaves de acuarela. Rosa, celeste, amarillo y verde agua diluidos por el lobby.',
        categoria: 'Especiales',
        ruta: 'Temas/acuarela.css',
        espacio: 4,
        monedas: 35,
        colores: {
            '--violet-100': '#FAEBEE',
            '--violet-300': '#E9B0BD',
            '--violet-500': '#C97B84',
            '--bg':         '#FDFCFA',
            '--bg-alt':     '#F7F4F0',
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
        monedas: 35,
        colores: {
            '--violet-100': '#DCFCE7',
            '--violet-300': '#F9A8D4',
            '--violet-500': '#EC4899',
            '--bg':         '#F7FDF9',
            '--bg-alt':     '#F0F9F2',
            '--white':      '#FFFFFF'
        }
    },
    // (Va justo después de "Floral")
    {
        id: 'wuu',
        nombre: 'Wuu',
        icono: 'monitor', /* Usamos monitor para no repetir gamepad-2 de Chiptune */
        descripcion: 'Estética limpia de consola de salón. Blancos puros, grises suaves y un celeste brillante con efectos de cristal.',
        categoria: 'Especiales',
        ruta: 'Temas/wuu.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#B2EBF2',
            '--violet-300': '#4DD0E1',
            '--violet-500': '#00BCD4',
            '--bg':         '#F0F0F0',
            '--bg-alt':     '#E6E6E6',
            '--white':      '#FFFFFF'
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
        monedas: 40,
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
        id: 'cafe-latte',
        nombre: 'Café Latte',
        icono: 'coffee',
        descripcion: 'Cafetería cozy. Granos de café tenues por todo el fondo y vapor subiendo desde el header.',
        categoria: 'Especiales',
        ruta: 'Temas/cafe-latte.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#F5EBE0',
            '--violet-300': '#D9BC9E',
            '--violet-500': '#A0704A',
            '--bg':         '#FAF6F0',
            '--bg-alt':     '#F2EAE0',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'charla',
        nombre: 'Charla',
        icono: 'message-circle',
        descripcion: 'Verde mensajería y beige cálido. Los accesos rápidos se vuelven burbujas y aparecen dobles checks al pasar el mouse. En WhatTheHay brilla como en casa.',
        categoria: 'Especiales',
        ruta: 'Temas/charla.css',
        espacio: 4,
        monedas: 45,
        colores: {
            '--violet-100': '#D1FAE5',
            '--violet-300': '#6EE7B7',
            '--violet-500': '#10B981',
            '--bg':         '#EFE9E0',
            '--bg-alt':     '#F7F3ED',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'libro',
        nombre: 'Libro de Historia',
        icono: 'book-open',
        descripcion: 'Cuero, papel envejecido y lomo de encuadernación. Para los que atesoran el pasado.',
        categoria: 'Especiales',
        ruta: 'Temas/libro.css',
        espacio: 4,
        monedas: 45,
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
        id: 'friend',
        nombre: '¿¡Friend!?',
        icono: 'star',
        descripcion: 'Fondo oscuro con luces amarillas y rosas que titilan, y bordes neón brillantes.',
        categoria: 'Especiales',
        ruta: 'Temas/friend.css',
        espacio: 4,
        monedas: 45,
        colores: {
            '--violet-100': '#2A1A44',
            '--violet-300': '#E879F9',
            '--violet-500': '#EC4899',
            '--bg':         '#050310',
            '--bg-alt':     '#0A0618',
            '--white':      '#0F0820'
        }
    },
    {
        id: 'steampunk',
        nombre: 'Steampunk',
        icono: 'cog',
        descripcion: 'Taller victoriano. Papel envejecido, engranajes, remaches y bordes de cobre con doble línea dorada.',
        categoria: 'Especiales',
        ruta: 'Temas/steampunk.css',
        espacio: 4,
        monedas: 45,
        colores: {
            '--violet-100': '#EBE0CC',
            '--violet-300': '#C9A961',
            '--violet-500': '#9C5F28',
            '--bg':         '#F0E8D8',
            '--bg-alt':     '#E5D8BE',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'pop-owner',
        nombre: 'Pop Owner',
        icono: 'music-2',
        descripcion: 'Luces de escenario, rojo profundo y destellos dorados que recorren las cards. Para cuando querés que todo brille.',
        categoria: 'Especiales',
        ruta: 'Temas/pop-owner.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#3F0F0F',
            '--violet-300': '#991B1B',
            '--violet-500': '#EF4444',
            '--bg':         '#0A0A0A',
            '--bg-alt':     '#0F0F0F',
            '--white':      '#141414'
        }
    },
    {
        id: 'stream',
        nombre: 'Stream',
        icono: 'signal',
        descripcion: 'Fondo oscuro con acento morado o verde que cambia con el tiempo. Referencia suave a las plataformas de streaming.',
        categoria: 'Especiales',
        ruta: 'Temas/stream.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#241640',
            '--violet-300': '#B57EF8',
            '--violet-500': '#9B5DE5',
            '--bg':         '#0A0A10',
            '--bg-alt':     '#0E0E16',
            '--white':      '#13131E'
        }
    }
];
