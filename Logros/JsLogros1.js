// ============================================================
//  JsLogros1.js — Catálogo completo de logros
//  ------------------------------------------------------------
//  Para añadir más: creá JsLogros2.js con otro array y hacé
//  window.LOGROS_REGISTRO.push(...LOGROS_2). Luego cargalo en
//  el HTML del shell después de este archivo.
//
//  Campos:
//    id          → string único
//    nombre      → visible en la card
//    descripcion → texto corto
//    icono       → nombre de ícono de Lucide
//    tipo        → 'monedas' | 'apps' | 'widgets' | 'temas' | 'dias' | 'fotos'
//    meta        → número a alcanzar
// ============================================================

// ============================================================
//  MONEDAS
// ============================================================
const LOGROS_MONEDAS = [
    { id: 'primer_billete',    nombre: 'Primer Billete',    descripcion: 'Consigue 100 monedas.',    icono: 'piggy-bank', tipo: 'monedas', meta: 100   },
    { id: 'bolsillo_contento', nombre: 'Bolsillo Contento', descripcion: 'Consigue 500 monedas.',    icono: 'coins',      tipo: 'monedas', meta: 500   },
    { id: 'milenario',         nombre: 'Milenario',         descripcion: 'Consigue 1.000 monedas.',  icono: 'gem',        tipo: 'monedas', meta: 1000  },
    { id: 'dueno_de_fundo',    nombre: 'Dueño de Fundo',    descripcion: 'Consigue 5.000 monedas.',  icono: 'crown',      tipo: 'monedas', meta: 5000  },
    { id: 'magnate',           nombre: 'Magnate',           descripcion: 'Consigue 10.000 monedas.', icono: 'trophy',     tipo: 'monedas', meta: 10000 }
];

// ============================================================
//  APPS (no base, no default)
// ============================================================
const LOGROS_APPS = [
    { id: 'apps_5',  nombre: 'Aprendiz de Apps',   descripcion: 'Ten 5 apps instaladas.',   icono: 'package',  tipo: 'apps', meta: 5  },
    { id: 'apps_10', nombre: 'Coleccionista',      descripcion: 'Ten 10 apps instaladas.',  icono: 'boxes',    tipo: 'apps', meta: 10 },
    { id: 'apps_20', nombre: 'Bibliotecario',      descripcion: 'Ten 20 apps instaladas.',  icono: 'library',  tipo: 'apps', meta: 20 },
    { id: 'apps_30', nombre: 'Curador Digital',    descripcion: 'Ten 30 apps instaladas.',  icono: 'layers',   tipo: 'apps', meta: 30 },
    { id: 'apps_40', nombre: 'Arquitecto de Apps', descripcion: 'Ten 40 apps instaladas.',  icono: 'box',      tipo: 'apps', meta: 40 },
    { id: 'apps_50', nombre: 'Señor de las Apps',  descripcion: 'Ten 50 apps instaladas.',  icono: 'grid-3x3', tipo: 'apps', meta: 50 }
];

// ============================================================
//  WIDGETS
// ============================================================
const LOGROS_WIDGETS = [
    { id: 'widgets_5',  nombre: 'Decorador',            descripcion: 'Ten 5 widgets instalados.',  icono: 'layout-grid',      tipo: 'widgets', meta: 5  },
    { id: 'widgets_10', nombre: 'Ambientador',          descripcion: 'Ten 10 widgets instalados.', icono: 'squares',          tipo: 'widgets', meta: 10 },
    { id: 'widgets_20', nombre: 'Escenógrafo',          descripcion: 'Ten 20 widgets instalados.', icono: 'layout-dashboard', tipo: 'widgets', meta: 20 },
    { id: 'widgets_30', nombre: 'Diseñador de Escritorio', descripcion: 'Ten 30 widgets instalados.', icono: 'presentation',  tipo: 'widgets', meta: 30 },
    { id: 'widgets_40', nombre: 'Arquitecto Visual',    descripcion: 'Ten 40 widgets instalados.', icono: 'blocks',           tipo: 'widgets', meta: 40 },
    { id: 'widgets_50', nombre: 'Maestro del Espacio',  descripcion: 'Ten 50 widgets instalados.', icono: 'component',        tipo: 'widgets', meta: 50 },
    { id: 'widgets_60', nombre: 'Coleccionista Serial', descripcion: 'Ten 60 widgets instalados.', icono: 'puzzle',           tipo: 'widgets', meta: 60 },
    { id: 'widgets_70', nombre: 'Señor de los Widgets', descripcion: 'Ten 70 widgets instalados.', icono: 'stickers',         tipo: 'widgets', meta: 70 }
];

// ============================================================
//  TEMAS (no base)
// ============================================================
const LOGROS_TEMAS = [
    { id: 'temas_5',  nombre: 'Vestidor',          descripcion: 'Ten 5 temas instalados.',  icono: 'palette',    tipo: 'temas', meta: 5  },
    { id: 'temas_10', nombre: 'Estilista',         descripcion: 'Ten 10 temas instalados.', icono: 'paintbrush', tipo: 'temas', meta: 10 },
    { id: 'temas_20', nombre: 'Diseñador de Moda', descripcion: 'Ten 20 temas instalados.', icono: 'brush',      tipo: 'temas', meta: 20 },
    { id: 'temas_30', nombre: 'Alta Costura',      descripcion: 'Ten 30 temas instalados.', icono: 'sparkles',   tipo: 'temas', meta: 30 }
];

// ============================================================
//  DÍAS DE USO (días distintos con sesión iniciada)
// ============================================================
const LOGROS_DIAS = [
    { id: 'dias_7',   nombre: 'Primera Semana', descripcion: 'Usá VicWebOs 7 días.',        icono: 'calendar',       tipo: 'dias', meta: 7   },
    { id: 'dias_30',  nombre: 'Un Mes en Casa', descripcion: 'Usá VicWebOs 30 días.',       icono: 'calendar-days',  tipo: 'dias', meta: 30  },
    { id: 'dias_180', nombre: 'Medio Año',      descripcion: 'Usá VicWebOs 6 meses.',       icono: 'calendar-check', tipo: 'dias', meta: 180 },
    { id: 'dias_365', nombre: 'Aniversario',    descripcion: 'Usá VicWebOs un año entero.', icono: 'award',          tipo: 'dias', meta: 365 }
];

// ============================================================
//  FOTOS (pico histórico de fotos en la Galería)
// ============================================================
const LOGROS_FOTOS = [
    { id: 'fotos_5',    nombre: 'Snapshot',              descripcion: 'Subí 5 fotos.',          icono: 'camera',   tipo: 'fotos', meta: 5    },
    { id: 'fotos_15',   nombre: 'Fotógrafo Aficionado',  descripcion: 'Subí 15 fotos.',         icono: 'image',    tipo: 'fotos', meta: 15   },
    { id: 'fotos_25',   nombre: 'Álbum Familiar',        descripcion: 'Subí 25 fotos.',         icono: 'images',   tipo: 'fotos', meta: 25   },
    { id: 'fotos_50',   nombre: 'Fotógrafo',             descripcion: 'Subí 50 fotos.',         icono: 'aperture', tipo: 'fotos', meta: 50   },
    { id: 'fotos_100',  nombre: 'Colección de Recuerdos',descripcion: 'Subí 100 fotos.',        icono: 'album',    tipo: 'fotos', meta: 100  },
    { id: 'fotos_500',  nombre: 'Archivo Visual',        descripcion: 'Subí 500 fotos.',        icono: 'archive',  tipo: 'fotos', meta: 500  },
    { id: 'fotos_1000', nombre: 'Museo Personal',        descripcion: 'Subí 1.000 fotos.',      icono: 'landmark', tipo: 'fotos', meta: 1000 }
];

// ============================================================
//  REGISTRO
// ============================================================
window.LOGROS_REGISTRO = window.LOGROS_REGISTRO || [];
window.LOGROS_REGISTRO.push(
    ...LOGROS_MONEDAS,
    ...LOGROS_APPS,
    ...LOGROS_WIDGETS,
    ...LOGROS_TEMAS,
    ...LOGROS_DIAS,
    ...LOGROS_FOTOS
);
