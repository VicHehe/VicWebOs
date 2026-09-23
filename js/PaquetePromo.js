// ============================================================
//  PaquetePromo.js — Paquetes + Ofertas del día (PromoZione)
//  ------------------------------------------------------------
//  Se carga en el shell DESPUÉS de JsWidgets.js.
//  Desde la tienda: window.parent.PromoZione.*
//
//  Los paquetes son 100% manuales (editá PAQUETES_PROMO abajo).
//  Las ofertas del día son 3 (1 tema + 1 app + 1 widget) y se
//  generan UNA VEZ al abrir la tienda, guardándose en IndexedDB
//  hasta la próxima medianoche hora de Santiago.
// ============================================================

(function () {
    'use strict';

    // ========================================================
    //  PAQUETES — EDITÁ ACÁ
    // --------------------------------------------------------
    //  id        → string único
    //  nombre    → visible en la card
    //  icono     → nombre de ícono de Lucide
    //  descripcion
    //  precio    → monedas fijas (manual)
    //  items     → 2 a 4 items, mezclando tipos
    //              { tipo: 'app'|'tema'|'widget', id: '...' }
    //
    //  Reglas que aplica el código automáticamente:
    //    - El espacio del pack = suma de espacios (NO se pone a mano).
    //    - No puede incluir apps base / default → se ignora el pack.
    //    - Un item puede repetirse en distintos packs.
    //    - Si el usuario ya tiene TODOS los items del pack, se oculta.
    // ========================================================
const PAQUETES_PROMO = [

    // ============================================================
    //  CULTURAL / TRADICIÓN
    // ============================================================
    {
        id: 'pack_orgullo_nacional',
        nombre: 'Orgullo Nacional',
        icono: 'heart',
        descripcion: 'Chile y México de fiesta. Los dos temas patrios en uno.',
        precio: 30,
        items: [
            { tipo: 'tema', id: 'consentido' },
            { tipo: 'tema', id: 'mucho-besame' }
        ]
    },
    {
        id: 'pack_historico',
        nombre: 'Pack Histórico',
        icono: 'book-open',
        descripcion: 'Para los que atesoran el pasado. Cuero, papel viejo, engranajes y tradición.',
        precio: 65,
        items: [
            { tipo: 'tema', id: 'libro' },
            { tipo: 'tema', id: 'steampunk' },
            { tipo: 'tema', id: 'consentido' },
            { tipo: 'tema', id: 'mucho-besame' }
        ]
    },

    // ============================================================
    //  OSCURO / NOCHE
    // ============================================================
    {
        id: 'pack_oscuro_puro',
        nombre: 'Oscuro Puro',
        icono: 'moon',
        descripcion: 'Tres formas de vestir la noche. Elegí tu mood: estrellas, mar o calabaza.',
        precio: 25,
        items: [
            { tipo: 'tema', id: 'noche' },
            { tipo: 'tema', id: 'ocean' },
            { tipo: 'tema', id: 'pumkin' }
        ]
    },
    {
        id: 'pack_dark_dev',
        nombre: 'Dark Dev',
        icono: 'github',
        descripcion: 'Modo oscuro para trabajar de noche. GitHub, tareas y lector a mano.',
        precio: 100,
        items: [
            { tipo: 'tema',   id: 'github-lover' },
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'widget', id: 'lector' }
        ]
    },
    {
        id: 'pack_luces_neon',
        nombre: 'Luces Neón',
        icono: 'sparkles',
        descripcion: 'Tres temas con luces, destellos y glow animado. Para brillar de noche.',
        precio: 120,
        items: [
            { tipo: 'tema', id: 'friend' },
            { tipo: 'tema', id: 'pop-owner' },
            { tipo: 'tema', id: 'stream' }
        ]
    },

    // ============================================================
    //  RETRO / GEEK
    // ============================================================
    {
        id: 'pack_retro_clasico',
        nombre: 'Retro Clásico',
        icono: 'gamepad-2',
        descripcion: 'Hacker, Vapor, Salón y Chiptune. Cuatro décadas distintas en cuatro capas.',
        precio: 40,
        items: [
            { tipo: 'tema', id: 'hacker' },
            { tipo: 'tema', id: 'vapor' },
            { tipo: 'tema', id: 'salon' },
            { tipo: 'tema', id: 'chiptune' }
        ]
    },
    {
        id: 'pack_pixel_world',
        nombre: 'Pixel World',
        icono: 'grid-2x2',
        descripcion: 'Editor de pixel art, tema Chiptune y MetroRun para jugar. Universo 8-bit propio.',
        precio: 160,
        items: [
            { tipo: 'app',  id: 'pixevan' },
            { tipo: 'tema', id: 'chiptune' },
            { tipo: 'app',  id: 'metrorun' }
        ]
    },

    // ============================================================
    //  CREATIVO / ARTE
    // ============================================================
    {
        id: 'pack_fotografia',
        nombre: 'Pack Fotografía',
        icono: 'camera',
        descripcion: 'Sacá, editá y mostrá. Kit completo para fotógrafes.',
        precio: 90,
        items: [
            { tipo: 'app',    id: 'camara' },
            { tipo: 'app',    id: 'photo-shinny' },
            { tipo: 'widget', id: 'diapositivas' },
            { tipo: 'widget', id: 'bubble-image' }
        ]
    },
    {
        id: 'pack_ocs_arte',
        nombre: 'OCs & Arte',
        icono: 'palette',
        descripcion: 'Los dos editores gráficos y tus personajes. Kit completo para artistas.',
        precio: 380,
        items: [
            { tipo: 'app', id: 'ocs' },
            { tipo: 'app', id: 'pixevan' },
            { tipo: 'app', id: 'arte-flash' }
        ]
    },

    // ============================================================
    //  FORMAL / PRODUCTIVO
    // ============================================================
    {
        id: 'pack_formal_work',
        nombre: 'Formal Work',
        icono: 'briefcase',
        descripcion: 'Para trabajar en serio. Tema día, tema noche y tareas.',
        precio: 95,
        items: [
            { tipo: 'tema',   id: 'oficina' },
            { tipo: 'tema',   id: 'oficina-dark' },
            { tipo: 'widget', id: 'to-do-list' }
        ]
    },
    {
        id: 'pack_finanzas',
        nombre: 'Pack Finanzas',
        icono: 'receipt',
        descripcion: 'Controlá tu plata. Gestor de gastos, tareas y lector a mano.',
        precio: 150,
        items: [
            { tipo: 'app',    id: 'gastos' },
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'widget', id: 'lector' }
        ]
    },
    {
        id: 'pack_lectura',
        nombre: 'Pack Lectura',
        icono: 'book-open-text',
        descripcion: 'Para leer sin distracciones. Tema libro, lector de notas, wiki y lector de PDF.',
        precio: 140,
        items: [
            { tipo: 'tema',   id: 'libro' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'wiki_lector' },
            { tipo: 'app',    id: 'lector-pdf' }
        ]
    },
    {
        id: 'pack_sesion_estudio',
        nombre: 'Sesión de Estudio',
        icono: 'timer',
        descripcion: 'Vibra tranquila para concentrarte. Charla, tareas, cronómetro y ruleta para los breaks.',
        precio: 180,
        items: [
            { tipo: 'tema',   id: 'charla' },
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'widget', id: 'reloj' },
            { tipo: 'widget', id: 'ruleta' }
        ]
    },

    // ============================================================
    //  AMBIENTAL / COZY
    // ============================================================
    {
        id: 'pack_pastel_dream',
        nombre: 'Pastel Dream',
        icono: 'brush',
        descripcion: 'Acuarela, Floral, Cuarzo y una mascota que cuidar. Tonos suaves para soñar.',
        precio: 120,
        items: [
            { tipo: 'tema',   id: 'acuarela' },
            { tipo: 'tema',   id: 'floral' },
            { tipo: 'tema',   id: 'cuarzo-rosado' },
            { tipo: 'widget', id: 'mascota' }
        ]
    },
    {
        id: 'pack_cafe_chill',
        nombre: 'Café & Chill',
        icono: 'coffee',
        descripcion: 'Vibra cozy para tardes tranquilas. Café, lector, wiki y hora mundial.',
        precio: 130,
        items: [
            { tipo: 'tema',   id: 'cafe-latte' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'wiki_lector' },
            { tipo: 'widget', id: 'reloj-mundial' }
        ]
    },
    {
        id: 'pack_atardecer',
        nombre: 'Atardecer',
        icono: 'sunset',
        descripcion: 'Para cerrar el día lindo. Amanecer sobre el mar, hora mundial y cronómetro.',
        precio: 130,
        items: [
            { tipo: 'tema',   id: 'break-of-dawn' },
            { tipo: 'widget', id: 'reloj-mundial' },
            { tipo: 'widget', id: 'reloj' }
        ]
    },

    // ============================================================
    //  SOCIAL
    // ============================================================
    {
        id: 'pack_social_chat',
        nombre: 'Social Chat',
        icono: 'message-circle',
        descripcion: 'Chat interno + videollamadas. Para no perder el contacto con tu grupo.',
        precio: 320,
        items: [
            { tipo: 'app', id: 'whatthehay' },
            { tipo: 'app', id: 'silly-calls' }
        ]
    },
    {
        id: 'pack_social_total',
        nombre: 'Social Total',
        icono: 'users',
        descripcion: 'Todo lo social en un solo paquete. Chat, insta, encuestas y videollamadas.',
        precio: 420,
        items: [
            { tipo: 'app', id: 'whatthehay' },
            { tipo: 'app', id: 'vicsgram' },
            { tipo: 'app', id: 'encuestas' },
            { tipo: 'app', id: 'silly-calls' }
        ]
    }
];

    // ========================================================
    //  Constantes de ofertas
    // ========================================================
    const IDB_NAME   = 'VicWebOsPromoZione';
    const IDB_STORE  = 'ofertas';
    const PESO_25    = 0.70;  // 70%
    const PESO_50    = 0.25;  // 25%
    const PESO_75    = 0.05;  // 5%

    // ========================================================
    //  Helpers de catálogo
    // ========================================================
    function _catalogoDe(tipo) {
        if (tipo === 'app')    return (typeof RUTAS_HERRAMIENTAS  !== 'undefined') ? RUTAS_HERRAMIENTAS  : [];
        if (tipo === 'tema')   return (typeof TEMAS_DISPONIBLES   !== 'undefined') ? TEMAS_DISPONIBLES   : [];
        if (tipo === 'widget') return (typeof WIDGETS_DISPONIBLES !== 'undefined') ? WIDGETS_DISPONIBLES : [];
        return [];
    }

    function _buscarItem(tipo, id) {
        return _catalogoDe(tipo).find(x => x.id === id) || null;
    }

    function _tieneItemInstalado(tipo, id) {
        if (!window.configCuentaActual) return false;
        const cfg = window.configCuentaActual;
        if (tipo === 'app')    return (cfg.appsInstaladas    || []).includes(id);
        if (tipo === 'tema')   return (cfg.temasInstalados   || []).includes(id);
        if (tipo === 'widget') return (cfg.widgetsInstalados || []).includes(id);
        return false;
    }

    // ========================================================
    //  PAQUETES — API
    // ========================================================
    function _packEsValido(pack) {
        if (!pack || !Array.isArray(pack.items)) return false;
        if (pack.items.length < 2 || pack.items.length > 4) return false;
        return pack.items.every(it => {
            const obj = _buscarItem(it.tipo, it.id);
            return obj && !obj.esBase && !obj.esDefault;
        });
    }

    function calcularEspacioPaquete(pack) {
        return (pack.items || []).reduce((acc, it) => {
            const obj = _buscarItem(it.tipo, it.id);
            if (!obj) return acc;
            return acc + (obj.espacio || 0);
        }, 0);
    }

    function calcularPrecioCatalogoPaquete(pack) {
        return (pack.items || []).reduce((acc, it) => {
            const obj = _buscarItem(it.tipo, it.id);
            if (!obj) return acc;
            return acc + (obj.monedas || 0);
        }, 0);
    }

    function tienePaqueteCompleto(pack) {
        return (pack.items || []).every(it => _tieneItemInstalado(it.tipo, it.id));
    }

    function obtenerPaquetesVisibles() {
        return PAQUETES_PROMO
            .filter(_packEsValido)
            .filter(p => !tienePaqueteCompleto(p))
            .map(p => ({
                id:          p.id,
                nombre:      p.nombre,
                icono:       p.icono || 'package',
                descripcion: p.descripcion || '',
                precio:      Number(p.precio) || 0,
                items:       p.items.map(it => {
                    const obj = _buscarItem(it.tipo, it.id);
                    return {
                        tipo:  it.tipo,
                        id:    it.id,
                        nombre: obj ? obj.nombre : it.id,
                        icono:  obj ? (obj.icono || 'circle') : 'circle',
                        yaLoTiene: _tieneItemInstalado(it.tipo, it.id)
                    };
                }),
                espacio:         calcularEspacioPaquete(p),
                precioCatalogo:  calcularPrecioCatalogoPaquete(p)
            }));
    }

    // ========================================================
    //  IndexedDB (aislada del caché del shell)
    // ========================================================
    function _abrirIDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror   = (e) => reject(e.target.error);
        });
    }

    async function _idbGet(key) {
        const db = await _abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const r  = tx.objectStore(IDB_STORE).get(key);
            r.onsuccess = () => res(r.result);
            r.onerror   = (e) => rej(e.target.error);
        });
    }

    async function _idbSet(key, val) {
        const db = await _abrirIDB();
        return new Promise((res, rej) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(val, key);
            tx.oncomplete = () => res();
            tx.onerror    = (e) => rej(e.target.error);
        });
    }

    // ========================================================
    //  Fecha y hora de Chile (DST-safe con Intl)
    // ========================================================
    function fechaChileHoy() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());
    }

    function msHastaProximaMedianocheChile() {
        const partes = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).format(new Date()).split(':').map(Number);
        const transcurridos = partes[0] * 3600 + partes[1] * 60 + partes[2];
        return (86400 - transcurridos) * 1000;
    }

    // ========================================================
    //  Generación de ofertas del día
    // ========================================================
    function _elegirDescuento() {
        const r = Math.random();
        if (r < PESO_25) return 25;
        if (r < PESO_25 + PESO_50) return 50;
        return 75;
    }

    function _alAzar(lista) {
        if (!lista || !lista.length) return null;
        return lista[Math.floor(Math.random() * lista.length)];
    }

    function _generarOfertasDelDia() {
        const temas   = _catalogoDe('tema')  .filter(t => !t.esBase && (t.monedas || 0) > 0);
        const apps    = _catalogoDe('app')   .filter(a => !a.esBase && !a.esDefault && (a.monedas || 0) > 0);
        const widgets = _catalogoDe('widget').filter(w => !w.esBase && (w.monedas || 0) > 0);

        const out = [];
        const t = _alAzar(temas);
        const a = _alAzar(apps);
        const w = _alAzar(widgets);

        if (t) out.push({ tipo: 'tema',   id: t.id, descuento: _elegirDescuento() });
        if (a) out.push({ tipo: 'app',    id: a.id, descuento: _elegirDescuento() });
        if (w) out.push({ tipo: 'widget', id: w.id, descuento: _elegirDescuento() });

        return out;
    }

    function _claveOferta(codigo, fecha) {
        const com = (typeof window.obtenerComunidadActiva === 'function')
            ? window.obtenerComunidadActiva() : null;
        return `oferta_${com ? com.id : 'none'}_${codigo}_${fecha}`;
    }

    async function obtenerOfertasDelDia() {
        if (!window.cuentaActual) return [];
        const codigo = window.cuentaActual.codigo;
        const fecha  = fechaChileHoy();
        const key    = _claveOferta(codigo, fecha);

        let ofertas = null;
        try { ofertas = await _idbGet(key); } catch (e) { /* silencioso */ }

        if (!Array.isArray(ofertas)) {
            ofertas = _generarOfertasDelDia();
            try { await _idbSet(key, ofertas); } catch (e) { /* silencioso */ }
        }

        // Enriquecer + filtrar los que ya tiene
        return ofertas
            .map(o => {
                const obj = _buscarItem(o.tipo, o.id);
                if (!obj) return null;
                if (_tieneItemInstalado(o.tipo, o.id)) return null;
                const precioOriginal = obj.monedas || 0;
                const precioFinal = Math.floor(precioOriginal * (1 - o.descuento / 100));
                return {
                    tipo:           o.tipo,
                    id:             o.id,
                    descuento:      o.descuento,
                    nombre:         obj.nombre,
                    icono:          obj.icono || 'circle',
                    descripcion:    obj.descripcion || '',
                    espacio:        obj.espacio || 0,
                    precioOriginal: precioOriginal,
                    precioFinal:    precioFinal
                };
            })
            .filter(Boolean);
    }

    // ========================================================
    //  COMPRAR PAQUETE (desde el shell)
    // ========================================================
    async function comprarPaquete(packId) {
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            throw new Error('Conecta una comunidad primero.');
        }
        if (!window.cuentaActual) throw new Error('Necesitas una cuenta.');

        const pack = PAQUETES_PROMO.find(p => p.id === packId);
        if (!pack) throw new Error('Paquete no encontrado.');
        if (!_packEsValido(pack)) throw new Error('Este paquete tiene items inválidos.');

        const codigo = window.cuentaActual.codigo;

        // Refrescar config actual para no usar caché viejo
        if (typeof obtenerConfigCuenta === 'function') {
            window.configCuentaActual = await obtenerConfigCuenta(codigo);
        }

        if (tienePaqueteCompleto(pack)) {
            throw new Error('Ya tenés todos los items de este paquete.');
        }

        const espacioPack = calcularEspacioPaquete(pack);
        if (typeof calcularEspacioLibre === 'function' && calcularEspacioLibre() < espacioPack) {
            throw new Error(`Necesitás ${espacioPack} de espacio (tenés ${calcularEspacioLibre()} libres).`);
        }

        const precio = Number(pack.precio) || 0;
        if (typeof obtenerMonedas === 'function' && obtenerMonedas() < precio) {
            throw new Error(`Te faltan ${precio - obtenerMonedas()} monedas.`);
        }

        if (precio > 0) {
            await gastoBoleta('package', 'stor-he', `Paquete: ${pack.nombre}`, precio);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.appsInstaladas    = cfg.appsInstaladas    || [];
            cfg.temasInstalados   = cfg.temasInstalados   || [];
            cfg.widgetsInstalados = cfg.widgetsInstalados || [];

            for (const it of pack.items) {
                if (it.tipo === 'app'    && !cfg.appsInstaladas.includes(it.id))    cfg.appsInstaladas.push(it.id);
                if (it.tipo === 'tema'   && !cfg.temasInstalados.includes(it.id))   cfg.temasInstalados.push(it.id);
                if (it.tipo === 'widget' && !cfg.widgetsInstalados.includes(it.id)) cfg.widgetsInstalados.push(it.id);
            }
            return cfg;
        });

        window.configCuentaActual = await obtenerConfigCuenta(codigo);

        // Re-render del shell
        try {
            if (typeof renderSidebar === 'function')         renderSidebar();
            if (typeof renderAccesosRapidos === 'function')  renderAccesosRapidos();
            if (typeof renderWidgetsActivos === 'function')  renderWidgetsActivos();
            if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        } catch (e) { /* silencioso */ }

        return { ok: true };
    }

    // ========================================================
    //  COMPRAR OFERTA
    // ========================================================
    async function comprarOferta(tipo, id, descuento) {
        if (!window.ConfigBD || !ConfigBD.estaConectado()) {
            throw new Error('Conecta una comunidad primero.');
        }
        if (!window.cuentaActual) throw new Error('Necesitas una cuenta.');

        const obj = _buscarItem(tipo, id);
        if (!obj) throw new Error('Item no encontrado.');

        const desc = Math.max(0, Math.min(75, Number(descuento) || 0));
        const codigo = window.cuentaActual.codigo;

        if (typeof obtenerConfigCuenta === 'function') {
            window.configCuentaActual = await obtenerConfigCuenta(codigo);
        }

        if (_tieneItemInstalado(tipo, id)) {
            throw new Error('Ya tenés este item.');
        }

        const precioOriginal = obj.monedas || 0;
        const precioFinal    = Math.floor(precioOriginal * (1 - desc / 100));

        if (typeof calcularEspacioLibre === 'function' && calcularEspacioLibre() < (obj.espacio || 0)) {
            throw new Error(`Necesitás ${obj.espacio} de espacio (tenés ${calcularEspacioLibre()} libres).`);
        }
        if (typeof obtenerMonedas === 'function' && obtenerMonedas() < precioFinal) {
            throw new Error(`Te faltan ${precioFinal - obtenerMonedas()} monedas.`);
        }

        if (precioFinal > 0) {
            await gastoBoleta(obj.icono || 'coins', 'stor-he', `Oferta: ${obj.nombre} (-${desc}%)`, precioFinal);
        }

        await guardarConfigCuenta(codigo, (cfg) => {
            cfg.appsInstaladas    = cfg.appsInstaladas    || [];
            cfg.temasInstalados   = cfg.temasInstalados   || [];
            cfg.widgetsInstalados = cfg.widgetsInstalados || [];

            if (tipo === 'app'    && !cfg.appsInstaladas.includes(id))    cfg.appsInstaladas.push(id);
            if (tipo === 'tema'   && !cfg.temasInstalados.includes(id))   cfg.temasInstalados.push(id);
            if (tipo === 'widget' && !cfg.widgetsInstalados.includes(id)) cfg.widgetsInstalados.push(id);
            return cfg;
        });

        window.configCuentaActual = await obtenerConfigCuenta(codigo);

        try {
            if (typeof renderSidebar === 'function')         renderSidebar();
            if (typeof renderAccesosRapidos === 'function')  renderAccesosRapidos();
            if (typeof renderWidgetsActivos === 'function')  renderWidgetsActivos();
            if (typeof actualizarMonedasHeader === 'function') actualizarMonedasHeader();
        } catch (e) { /* silencioso */ }

        return { ok: true };
    }

    // ========================================================
    //  API pública
    // ========================================================
    window.PromoZione = {
        PAQUETES:                    PAQUETES_PROMO,
        obtenerPaquetesVisibles,
        calcularEspacioPaquete,
        calcularPrecioCatalogoPaquete,
        tienePaqueteCompleto,
        tieneItemInstalado:          _tieneItemInstalado,
        obtenerOfertasDelDia,
        comprarPaquete,
        comprarOferta,
        fechaChileHoy,
        msHastaProximaMedianocheChile
    };
})();
