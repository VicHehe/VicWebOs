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
//    5  → recolor puro :root
//    15  → paleta curada, sin decoración
//    20  → chrome reescrito (header, sidebar, tabs, botones)
//    25  → chrome + un detalle decorativo (nubes, franja)
//    30  → efecto visual claro (pattern SVG, scanlines, glitch)
//    35  → múltiples capas combinadas (patterns + hovers únicos)
//    40  → textura + animación en vivo
//    45  → artesanal (marcos, florituras, decoración por sección)
//    50  → flagship: animaciones en vivo + múltiples capas
//    16  → 🔒 EXCLUSIVO DE MÉXICO (referencia al 15 de septiembre)
//    18  → 🔒 EXCLUSIVO DE CHILE (referencia al 18 de septiembre)
//
//  ORGANIZACIÓN:
//    Las CATEGORÍAS están ordenadas por COSTO TOTAL ASCENDENTE
//    (suma de los precios de todos los temas que la componen).
//    Dentro de cada categoría, los temas van de MENOR a MAYOR precio.
//
//  CATEGORÍAS (por costo total):
//    Básicos            → 0
//    Simples            → 20
//    Oscuros            → 50
//    Retro              → 60
//    Cosmos             → 85
//    Espacios Liminales → 85
//    Festivos           → 90
//    Formales           → 90
//    Cine               → 120
//    Atmósferas         → 150
//    Fantasía           → 170
//    3D                 → 200
//    Cultura Pop        → 335
//
//  REGLA DE ORO: cada salto de precio se tiene que VER en la pantalla.
// ============================================================

const TEMAS_DISPONIBLES = [

    // ============================================================
    //  BÁSICOS — Recolors simples, light mode
    //  Costo total de la categoría: 0
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
    //  SIMPLES — Recolors con alma, sin decoración compleja.
    //  Costo total de la categoría: 20
    //  Paletas con temperatura propia (neutros tintados + un
    //  acento protagonista). Espacio 2 (solo :root).
    // ============================================================
    {
        id: 'terracota',
        nombre: 'Terracota',
        icono: 'amphora',
        descripcion: 'Barro cocido y atardecer mediterráneo. Neutros cálidos con tinte rojizo y acento terracota.',
        categoria: 'Simples',
        ruta: 'Temas/terracota.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#F9E8DE',
            '--violet-300': '#E0B098',
            '--violet-500': '#C56A3C',
            '--bg':         '#FDF9F5',
            '--bg-alt':     '#F7EFE7',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'salvia',
        nombre: 'Salvia',
        icono: 'leaf',
        descripcion: 'Verde eucalipto y calma natural. Fondos verde-crema, acento salvia desaturado.',
        categoria: 'Simples',
        ruta: 'Temas/salvia.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#E2EDE0',
            '--violet-300': '#A8C8A0',
            '--violet-500': '#5A9680',
            '--bg':         '#F7FAF6',
            '--bg-alt':     '#EEF4EC',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'rosa-polvorienta',
        nombre: 'Rosa Polvorienta',
        icono: 'heart-handshake',
        descripcion: 'Rosa antiguo y nostalgia elegante. Neutros rosados apagados, sin cursilería.',
        categoria: 'Simples',
        ruta: 'Temas/rosa-polvorienta.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#F7EBEE',
            '--violet-300': '#DDB8C2',
            '--violet-500': '#B87D8E',
            '--bg':         '#FDFAFA',
            '--bg-alt':     '#F8F0F1',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'mostaza',
        nombre: 'Mostaza',
        icono: 'wheat',
        descripcion: 'Mostaza vintage y cuaderno de campo. Neutros amarillos cálidos y apagados.',
        categoria: 'Simples',
        ruta: 'Temas/mostaza.css',
        espacio: 2,
        monedas: 5,
        colores: {
            '--violet-100': '#F7F0D8',
            '--violet-300': '#DCCA80',
            '--violet-500': '#B08A20',
            '--bg':         '#FDFBF5',
            '--bg-alt':     '#F8F2E0',
            '--white':      '#FFFFFF'
        }
    },

    // ============================================================
    //  OSCUROS — Dark mode simple, sin decoración
    //  Costo total de la categoría: 50
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
    //  RETRO — Referencias a décadas pasadas
    //  Costo total de la categoría: 60
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
    //  COSMOS — Cielo profundo, cuerpos celestes, atmósfera
    //  espacial. Paletas nocturnas ricas, oscuras, contemplativas.
    //  Costo total de la categoría: 85
    //  Progresión interna por color dominante:
    //    verde → magenta → naranja → cyan (flagship).
    // ============================================================
    {
        id: 'aurora-boreal',
        nombre: 'Aurora Boreal',
        icono: 'sparkle',
        descripcion: 'Verde esmeralda sobre azul noche profundo, con acento violeta. Paleta fría, luminosa y calma.',
        categoria: 'Cosmos',
        ruta: 'Temas/aurora-boreal.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#0E2A22',
            '--violet-300': '#34D399',
            '--violet-500': '#8B5CF6',
            '--bg':         '#071820',
            '--bg-alt':     '#0A2028',
            '--white':      '#0F2A35'
        }
    },
    {
        id: 'nebulosa',
        nombre: 'Nebulosa',
        icono: 'orbit',
        descripcion: 'Magenta estelar y cyan sobre púrpura profundo. Saturación alta y contraste nocturno.',
        categoria: 'Cosmos',
        ruta: 'Temas/nebulosa.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#240E38',
            '--violet-300': '#F0ABFC',
            '--violet-500': '#E879F9',
            '--bg':         '#080318',
            '--bg-alt':     '#0F0722',
            '--white':      '#140A2E'
        }
    },
    {
        id: 'eclipse-solar',
        nombre: 'Eclipse Solar',
        icono: 'sun-moon',
        descripcion: 'Casi negro con acento naranja-dorado. Alto contraste cálido sobre oscuridad densa.',
        categoria: 'Cosmos',
        ruta: 'Temas/eclipse-solar.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#241508',
            '--violet-300': '#FBBF24',
            '--violet-500': '#F59E0B',
            '--bg':         '#0A0705',
            '--bg-alt':     '#120D08',
            '--white':      '#18120C'
        }
    },
    {
        id: 'cometa-errante',
        nombre: 'Cometa Errante',
        icono: 'shooting-star',
        descripcion: 'Un cometa cruza el lobby dejando estela luminosa. Estrellas titilando y nebulosa que respira al fondo.',
        categoria: 'Cosmos',
        ruta: 'Temas/cometa-errante.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#10202E',
            '--violet-300': '#38BDF8',
            '--violet-500': '#22D3EE',
            '--bg':         '#05080F',
            '--bg-alt':     '#0A1420',
            '--white':      '#0A1220'
        }
    },

    // ============================================================
    //  ESPACIOS LIMINALES — Lugares vacíos, nostálgicos,
    //  ligeramente inquietantes. Luz artificial, arquitectura
    //  reconocible, silencio.
    //  Costo total de la categoría: 85
    //  Progresión interna por temperatura:
    //    frío agua → cálido interior → beige mall → mostaza flagship.
    // ============================================================
    {
        id: 'piscina-vacia',
        nombre: 'Piscina Vacía',
        icono: 'bath',
        descripcion: 'Celeste pálido, blanco limpio y gris suave. Paleta fresca y desaturada.',
        categoria: 'Espacios Liminales',
        ruta: 'Temas/piscina-vacia.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#D5E9F0',
            '--violet-300': '#78B8CC',
            '--violet-500': '#2E8898',
            '--bg':         '#E8F3F7',
            '--bg-alt':     '#D5E9F0',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'pasillo-hotel',
        nombre: 'Pasillo de Hotel',
        icono: 'door-closed',
        descripcion: 'Vino profundo, crema cálida y marrón madera. Neutros cálidos con un acento vino intenso.',
        categoria: 'Espacios Liminales',
        ruta: 'Temas/pasillo-hotel.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#EBD5D5',
            '--violet-300': '#A84E5A',
            '--violet-500': '#721D2A',
            '--bg':         '#F5EBDC',
            '--bg-alt':     '#EBD9C2',
            '--white':      '#FFFCF7'
        }
    },
    {
        id: 'centro-comercial',
        nombre: 'Centro Comercial',
        icono: 'shopping-bag',
        descripcion: 'Beige cálido y verde medio, con acento cyan frío. Paleta terrosa con contrapunto vivo.',
        categoria: 'Espacios Liminales',
        ruta: 'Temas/centro-comercial.css',
        espacio: 2,
        monedas: 15,
        colores: {
            '--violet-100': '#D5E5CC',
            '--violet-300': '#7CB342',
            '--violet-500': '#4A8C2E',
            '--bg':         '#F0EBE3',
            '--bg-alt':     '#E3DBD0',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'cuartos-traseros',
        nombre: 'Cuartos Traseros',
        icono: 'door-open',
        descripcion: 'Habitación infinita. Amarillo mostaza, alfombra húmeda, papel tapiz sutil y luces fluorescentes que parpadean. No deberías estar acá.',
        categoria: 'Espacios Liminales',
        ruta: 'Temas/cuartos-traseros.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#3A3015',
            '--violet-300': '#B8A040',
            '--violet-500': '#E8C840',
            '--bg':         '#14120C',
            '--bg-alt':     '#1A180F',
            '--white':      '#1E1C14'
        }
    },

    // ============================================================
    //  FESTIVOS — Celebraciones patrias y culturales
    //  Costo total de la categoría: 90
    //  Referencias a fiestas nacionales, con decoración viva
    //  y precios fijos por la fecha que celebran.
    // ============================================================
    {
        id: 'mucho-besame',
        nombre: 'Mucho Besame',
        icono: 'sun',
        descripcion: 'México en todo su esplendor. Papel picado, cempasúchil, talavera y sombrero. Para gritar ¡Viva México!',
        categoria: 'Festivos',
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
        categoria: 'Festivos',
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
        id: 'navidad-cozy',
        nombre: 'Navidad Cozy',
        icono: 'gift',
        descripcion: 'Chimenea, calcetines y luces de colores titilando. Navidad sin estridencia, en clave hygge. Verde pino, rojo profundo y dorado sobre crema.',
        categoria: 'Festivos',
        ruta: 'Temas/navidad-cozy.css',
        espacio: 4,
        monedas: 25,
        colores: {
            '--violet-100': '#E8F0DC',
            '--violet-300': '#A8BE88',
            '--violet-500': '#4A7040',
            '--bg':         '#FAF6EE',
            '--bg-alt':     '#F0E8DC',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'carnaval-veneciano',
        nombre: 'Carnaval Veneciano',
        icono: 'theater',
        descripcion: 'Terciopelo vino, damasco barroco y máscaras doradas. El carnaval de Venecia con candelabros, plumas de pavo real y velas titilando.',
        categoria: 'Festivos',
        ruta: 'Temas/carnaval-veneciano.css',
        espacio: 4,
        monedas: 31,
        colores: {
            '--violet-100': '#2A1018',
            '--violet-300': '#8B6A3A',
            '--violet-500': '#D4AF37',
            '--bg':         '#0F0608',
            '--bg-alt':     '#1A0A10',
            '--white':      '#1F0E14'
        }
    },

    // ============================================================
    //  FORMALES — Para trabajar, elegantes, OS-like
    //  Costo total de la categoría: 90
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
    //  CINE — Géneros cinematográficos
    //  Costo total de la categoría: 120
    //  Cada tema evoca la gramática visual de un género de cine,
    //  sin nombres de películas ni franquicias específicas.
    //  Progresión interna: Romance (25) → Sci-fi (25) → Jazz (35)
    //  → Terror (35).
    // ============================================================
    {
        id: 'cine-romance-escolar',
        nombre: 'Cine Romance Escolar',
        icono: 'graduation-cap',
        descripcion: 'Comedia romántica de secundaria. Cuaderno rayado, corazón y luz cálida de tarde noventera.',
        categoria: 'Cine',
        ruta: 'Temas/cine-romance-escolar.css',
        espacio: 4,
        monedas: 25,
        colores: {
            '--violet-100': '#FFE4DE',
            '--violet-300': '#E8A0A0',
            '--violet-500': '#C25E5E',
            '--bg':         '#FFF8F2',
            '--bg-alt':     '#FCEFE4',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'cine-ciencia-ficcion',
        nombre: 'Cine Ciencia Ficción',
        icono: 'rocket',
        descripcion: 'Nave espacial, hologramas y grid de perspectiva cyberpunk. Sci-fi clásico y moderno.',
        categoria: 'Cine',
        ruta: 'Temas/cine-ciencia-ficcion.css',
        espacio: 4,
        monedas: 25,
        colores: {
            '--violet-100': '#0F1E38',
            '--violet-300': '#00D9FF',
            '--violet-500': '#00B8E0',
            '--bg':         '#050810',
            '--bg-alt':     '#0A1424',
            '--white':      '#0C1828'
        }
    },
    {
        id: 'cine-jazzystreet',
        nombre: 'Cine JazzyStreet',
        icono: 'music-4',
        descripcion: 'Bar speakeasy de los años 50. Cobre y ladrillo, luz cálida de farol, sol art déco y notas al pasar.',
        categoria: 'Cine',
        ruta: 'Temas/cine-jazzystreet.css',
        espacio: 4,
        monedas: 35,
        colores: {
            '--violet-100': '#2C1810',
            '--violet-300': '#D97A54',
            '--violet-500': '#C4562E',
            '--bg':         '#100806',
            '--bg-alt':     '#1A0D08',
            '--white':      '#1A0F0A'
        }
    },
    {
        id: 'cine-terror',
        nombre: 'Cine de Terror',
        icono: 'skull',
        descripcion: 'Sangre, sombras, grano de película vieja y un parpadeo que nunca está quieto.',
        categoria: 'Cine',
        ruta: 'Temas/cine-terror.css',
        espacio: 4,
        monedas: 35,
        colores: {
            '--violet-100': '#2A0608',
            '--violet-300': '#B91C1C',
            '--violet-500': '#991B1B',
            '--bg':         '#050303',
            '--bg-alt':     '#0A0505',
            '--white':      '#0D0808'
        }
    },

    // ============================================================
    //  ATMÓSFERAS — Moods, ambientes, sensaciones cozy
    //  Costo total de la categoría: 150
    //  No representan un objeto: evocan un estado de ánimo,
    //  un momento del día, o una sensación táctil/visual.
    // ============================================================
    {
        id: 'acuarela',
        nombre: 'Acuarela',
        icono: 'brush',
        descripcion: 'Papel blanco con manchas de acuarela que respiran y gotas cayendo lentamente. Rosa, celeste, amarillo y verde agua diluidos.',
        categoria: 'Atmósferas',
        ruta: 'Temas/acuarela.css',
        espacio: 4,
        monedas: 30,
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
        id: 'cafe-latte',
        nombre: 'Café Latte',
        icono: 'coffee',
        descripcion: 'Cafetería cozy. Granos de café tenues por todo el fondo y vapor subiendo desde el header.',
        categoria: 'Atmósferas',
        ruta: 'Temas/cafe-latte.css',
        espacio: 4,
        monedas: 35,
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
        id: 'floral',
        nombre: 'Floral',
        icono: 'flower',
        descripcion: 'Colores vivos, pétalos y verdes frescos. Para los que florecen.',
        categoria: 'Atmósferas',
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
    {
        id: 'tormenta',
        nombre: 'Tormenta',
        icono: 'cloud-lightning',
        descripcion: 'Tormenta eléctrica sobre el mar. Rayos reales iluminan todo el sistema, lluvia en diagonal y cielo de acero frío.',
        categoria: 'Atmósferas',
        ruta: 'Temas/tormenta.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#131A2A',
            '--violet-300': '#5A7A9E',
            '--violet-500': '#94B0D0',
            '--bg':         '#070A12',
            '--bg-alt':     '#0C1120',
            '--white':      '#121828'
        }
    },

    // ============================================================
    //  FANTASÍA — Narrativa, aventura, retro-futurista
    //  Costo total de la categoría: 170
    //  Cuentan una historia con su estética.
    // ============================================================
    {
        id: 'libro',
        nombre: 'Libro de Historia',
        icono: 'book-open',
        descripcion: 'Cuero, papel envejecido y lomo de encuadernación. Para los que atesoran el pasado.',
        categoria: 'Fantasía',
        ruta: 'Temas/libro.css',
        espacio: 4,
        monedas: 35,
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
        id: 'runas',
        nombre: 'Runas',
        icono: 'shield',
        descripcion: 'Mitología nórdica. Piedras con runas grabadas que laten con luz azul fría, escarcha en las esquinas y niebla subiendo desde el suelo.',
        categoria: 'Fantasía',
        ruta: 'Temas/runas.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#16252F',
            '--violet-300': '#4A8DB0',
            '--violet-500': '#7DD3FC',
            '--bg':         '#0C1418',
            '--bg-alt':     '#101A20',
            '--white':      '#162027'
        }
    },
    {
        id: 'mil-y-una-noches',
        nombre: 'Mil y Una Noches',
        icono: 'moon-star',
        descripcion: 'Desierto nocturno de Bagdad. Dunas animadas, media luna que respira, geometría islámica de 8 puntas y arena dorada sobre azul noche.',
        categoria: 'Fantasía',
        ruta: 'Temas/mil-y-una-noches.css',
        espacio: 4,
        monedas: 45,
        colores: {
            '--violet-100': '#243258',
            '--violet-300': '#C9A961',
            '--violet-500': '#E8B54B',
            '--bg':         '#0A1428',
            '--bg-alt':     '#101A38',
            '--white':      '#141E3A'
        }
    },
    {
        id: 'steampunk',
        nombre: 'Steampunk',
        icono: 'cog',
        descripcion: 'Taller victoriano con vida. Engranajes que giran, vapor subiendo, péndulo oscilando y reloj de bolsillo meciéndose.',
        categoria: 'Fantasía',
        ruta: 'Temas/steampunk.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#EBE0CC',
            '--violet-300': '#C9A961',
            '--violet-500': '#9C5F28',
            '--bg':         '#F0E8D8',
            '--bg-alt':     '#E5D8BE',
            '--white':      '#FFFFFF'
        }
    },

    // ============================================================
    //  ESTACIONES — Primavera, Verano, Otoño e Invierno
    //  Costo total de la categoría: 158
    //  Las cuatro caras del año: cada una con patrón SVG,
    //  animaciones en vivo y decoración por sección.
    // ============================================================
        {
        id: 'invierno',
        nombre: 'Invierno',
        icono: 'snowflake',
        descripcion: 'Noche de nieve con ventana empañada y chimenea encendida: copos en parallax de 2 capas, escarcha trepando por el header y @property animado que hace latir toda la interfaz como una fogonera real.',
        categoria: 'Estaciones',
        ruta: 'Temas/invierno.css',
        espacio: 4,
        monedas: 35,
        colores: {
            '--violet-100': '#DBEAFE',
            '--violet-300': '#93C5FD',
            '--violet-500': '#3B82F6',
            '--bg':         '#F4F8FD',
            '--bg-alt':     '#E8F0F9',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'primavera',
        nombre: 'Primavera',
        icono: 'flower-2',
        descripcion: 'Todo lo que crece en un mismo lugar: pétalos que eclosionan en el hero, hojas brotando del header, campo de flores en el lobby y mariposas cruzando la pantalla.',
        categoria: 'Estaciones',
        ruta: 'Temas/primavera.css',
        espacio: 4,
        monedas: 40,
        colores: {
            '--violet-100': '#DCFCE7',
            '--violet-300': '#86EFAC',
            '--violet-500': '#22C55E',
            '--bg':         '#FAFEF8',
            '--bg-alt':     '#F1FAEC',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'verano',
        nombre: 'Verano',
        icono: 'sun',
        descripcion: 'Playa al mediodía: sol que respira, palmeras meciéndose con la brisa, olas animadas bajo el header y arena salpicada de conchitas.',
        categoria: 'Estaciones',
        ruta: 'Temas/verano.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#FEF3C7',
            '--violet-300': '#FCD34D',
            '--violet-500': '#F59E0B',
            '--bg':         '#FFFCF4',
            '--bg-alt':     '#FFF6E3',
            '--white':      '#FFFFFF'
        }
    },
    {
        id: 'otono',
        nombre: 'Otoño',
        icono: 'leaf',
        descripcion: 'Cae la tarde entre hojas que giran: arces cayendo con rotación real sobre el lobby, brasas de fogón respirando al fondo y cielo ámbar-terracota sobre madera.',
        categoria: 'Estaciones',
        ruta: 'Temas/otono.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#FAECD4',
            '--violet-300': '#E8B87A',
            '--violet-500': '#C96A2B',
            '--bg':         '#FBF4E9',
            '--bg-alt':     '#F4E8D6',
            '--white':      '#FFFDFA'
        }
    },

    
    // ============================================================
    //  3D — Efectos de perspectiva y profundidad real
    //  Costo total de la categoría: 200
    //  Uso de transform-style: preserve-3d, perspective() y
    //  rotateX/rotateY en hover. Flat shading (color plano, sin
    //  texture mapping) + sombras duras apiladas + biseles.
    //  Todos con espacio 4 (implican patrones + pseudo-elementos
    //  + transforms animados).
    //  Progresión interna por tipo de escena:
    //    arcade → papel → ciudad → paisaje.
    // ============================================================
    {
        id: 'retro-3d-arcade',
        nombre: 'Retro-3D Arcade',
        icono: 'joystick',
        descripcion: 'Flat-shaded polygons estilo Sega Model 1. Las cards se inclinan en 3D al pasar el mouse, con sombras duras y grid de perspectiva.',
        categoria: '3D',
        ruta: 'Temas/retro-3d-arcade.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#101828',
            '--violet-300': '#00D9FF',
            '--violet-500': '#FF3DB0',
            '--bg':         '#060810',
            '--bg-alt':     '#0A0E1A',
            '--white':      '#0C1020'
        }
    },
    {
        id: 'origami',
        nombre: 'Origami',
        icono: 'layers',
        descripcion: 'Papel washi japonés con fibra real. Esquinas dobladas, capas apiladas y pliegues que se sienten físicos. Índigo, crema y bermellón.',
        categoria: '3D',
        ruta: 'Temas/origami.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#E8DFD0',
            '--violet-300': '#4A6B8A',
            '--violet-500': '#2C3E50',
            '--bg':         '#F5F0E8',
            '--bg-alt':     '#EDE4D3',
            '--white':      '#FDFAF3'
        }
    },
    {
        id: 'isometric-city',
        nombre: 'Isometric City',
        icono: 'blocks',
        descripcion: 'Vista isométrica de una ciudad bloque. Cubos con ventanas iluminadas, sombras duras apiladas y proyección paralela. Estilo SimCity clásico.',
        categoria: '3D',
        ruta: 'Temas/isometric-city.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#121F33',
            '--violet-300': '#345675',
            '--violet-500': '#FB923C',
            '--bg':         '#0A1525',
            '--bg-alt':     '#121F33',
            '--white':      '#141F30'
        }
    },
    {
        id: 'low-poly-terrain',
        nombre: 'Low Poly Terrain',
        icono: 'mountain-snow',
        descripcion: 'Paisaje low-poly con facetas triangulares, montañas geométricas y un sol facetado gigante. Estilo Monument Valley. Luz dura desde la izquierda.',
        categoria: '3D',
        ruta: 'Temas/low-poly-terrain.css',
        espacio: 4,
        monedas: 50,
        colores: {
            '--violet-100': '#3A2858',
            '--violet-300': '#7A5A8C',
            '--violet-500': '#F5A66B',
            '--bg':         '#150A28',
            '--bg-alt':     '#1A1030',
            '--white':      '#1F1535'
        }
    },

    // ============================================================
    //  CULTURA POP — Juegos, música, redes, streaming, magia pop
    //  Costo total de la categoría: 335
    //  Referencias a la cultura contemporánea: entretenimiento,
    //  plataformas digitales, íconos pop y estéticas virales.
    // ============================================================
    {
        id: 'dreams',
        nombre: 'Dreams and Hopes',
        icono: 'sparkles',
        descripcion: 'Fondo negro profundo con bordes arcoíris. Para soñadores.',
        categoria: 'Cultura Pop',
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
    {
        id: 'cuarzo-rosado',
        nombre: 'Cuarzo Rosado',
        icono: 'gem',
        descripcion: 'Magia, diamantes y tonos pastel. Inspirado en el poder de las gemas.',
        categoria: 'Cultura Pop',
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
        id: 'break-of-dawn',
        nombre: 'Break of Dawn',
        icono: 'sunrise',
        descripcion: 'Amanecer sobre el mar. Cielo degradado y oleaje animado al fondo.',
        categoria: 'Cultura Pop',
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
        id: 'charla',
        nombre: 'Charla',
        icono: 'message-circle',
        descripcion: 'Verde mensajería y beige cálido. Los accesos rápidos se vuelven burbujas y aparecen dobles checks al pasar el mouse. En WhatTheHay brilla como en casa.',
        categoria: 'Cultura Pop',
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
        id: 'friend',
        nombre: '¿¡Friend!?',
        icono: 'star',
        descripcion: 'Fondo oscuro con luces amarillas y rosas que titilan, y bordes neón brillantes.',
        categoria: 'Cultura Pop',
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
        id: 'wuu',
        nombre: 'Wuu',
        icono: 'monitor',
        descripcion: 'Estética limpia de consola de salón. Blancos puros, grises suaves y un celeste brillante con efectos de cristal.',
        categoria: 'Cultura Pop',
        ruta: 'Temas/wuu.css',
        espacio: 4,
        monedas: 45,
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
        id: 'pop-owner',
        nombre: 'Pop Owner',
        icono: 'music-2',
        descripcion: 'Luces de escenario, rojo profundo y destellos dorados que recorren las cards. Para cuando querés que todo brille.',
        categoria: 'Cultura Pop',
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
        categoria: 'Cultura Pop',
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
