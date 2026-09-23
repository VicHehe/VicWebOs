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

    // 1 — catálogo: 34 → 25 (25% off)
    {
        id: 'pack_orgullo_nacional',
        nombre: 'Orgullo Nacional',
        icono: 'flag',
        descripcion: 'Chile y México de fiesta. Los dos temas patrios en un solo combo.',
        precio: 25,
        items: [
            { tipo: 'tema', id: 'consentido' },
            { tipo: 'tema', id: 'mucho-besame' }
        ]
    },

    // 2 — catálogo: 485 → 290 (40% off)
    {
        id: 'pack_taller_creativo',
        nombre: 'Taller Creativo',
        icono: 'paintbrush',
        descripcion: 'OCs, pixel art, dibujo y un taller steampunk. Todo para crear.',
        precio: 290,
        items: [
            { tipo: 'app',  id: 'ocs' },
            { tipo: 'app',  id: 'pixevan' },
            { tipo: 'app',  id: 'arte-flash' },
            { tipo: 'tema', id: 'steampunk' }
        ]
    },

    // 3 — catálogo: 110 → 75 (30% off)
    {
        id: 'pack_visual_time',
        nombre: 'Visual Time',
        icono: 'image',
        descripcion: 'Cámara, editor y dos widgets para mostrar tus fotos.',
        precio: 75,
        items: [
            { tipo: 'app',    id: 'camara' },
            { tipo: 'app',    id: 'photo-shinny' },
            { tipo: 'widget', id: 'bubble-image' },
            { tipo: 'widget', id: 'diapositivas' }
        ]
    },

    // 4 — catálogo: 40 → 30 (25% off)
    {
        id: 'pack_azar',
        nombre: 'Pack Azar',
        icono: 'dices',
        descripcion: 'Ruleta y dados. Todo al azar en un solo pack.',
        precio: 30,
        items: [
            { tipo: 'widget', id: 'ruleta' },
            { tipo: 'widget', id: 'dados' }
        ]
    },

    // 5 — catálogo: 175 → 115 (35% off)
    {
        id: 'pack_lectura',
        nombre: 'Fan de la lectura',
        icono: 'library',
        descripcion: 'Lector, wiki, PDF y un tema de libro. Todo lo que necesitás para leer.',
        precio: 115,
        items: [
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'wiki_lector' },
            { tipo: 'app',    id: 'lector-pdf' },
            { tipo: 'tema',   id: 'libro' }
        ]
    },

    // 6 — catálogo: 210 → 135 (35% off)
    {
        id: 'pack_musica',
        nombre: 'Fan de la música',
        icono: 'music-3',
        descripcion: 'Pop Owner, Salón de Noche y radio. Para los que viven con música.',
        precio: 135,
        items: [
            { tipo: 'tema',   id: 'pop-owner' },
            { tipo: 'tema',   id: 'salon' },
            { tipo: 'widget', id: 'radio' }
        ]
    },

    // 7 — catálogo: 550 → 330 (40% off)
    {
        id: 'pack_social_club',
        nombre: 'Social Club',
        icono: 'users',
        descripcion: 'Encuestas, VicsGram, videollamadas y chat. Todo lo social en uno.',
        precio: 330,
        items: [
            { tipo: 'app', id: 'encuestas' },
            { tipo: 'app', id: 'vicsgram' },
            { tipo: 'app', id: 'silly-calls' },
            { tipo: 'app', id: 'whatthehay' }
        ]
    },

    // 8 — catálogo: 195 → 125 (35% off)
    {
        id: 'pack_gamer',
        nombre: 'Gamer',
        icono: 'joystick',
        descripcion: 'Chiptune, ajedrez, MetroRun y Wuu. Kit jugador completo.',
        precio: 125,
        items: [
            { tipo: 'tema',   id: 'chiptune' },
            { tipo: 'widget', id: 'ajedrez-puzzle' },
            { tipo: 'app',    id: 'metrorun' },
            { tipo: 'tema',   id: 'wuu' }
        ]
    },

    // 9 — catálogo: 190 → 125 (35% off)
    {
        id: 'pack_gestor_economico',
        nombre: 'Gestor Económico',
        icono: 'banknote',
        descripcion: 'Gastos, tareas y lector para tus anotaciones. Todo bajo control.',
        precio: 125,
        items: [
            { tipo: 'app',    id: 'gastos' },
            { tipo: 'widget', id: 'to-do-list' },
            { tipo: 'widget', id: 'lector' }
        ]
    },

    // 10 — catálogo: 160 → 105 (35% off)
    {
        id: 'pack_dulce_amanecer',
        nombre: 'Dulce Amanecer',
        icono: 'clock',
        descripcion: 'Reloj, reloj mundial y Break of Dawn. Empezar el día con calma.',
        precio: 105,
        items: [
            { tipo: 'widget', id: 'reloj' },
            { tipo: 'widget', id: 'reloj-mundial' },
            { tipo: 'tema',   id: 'break-of-dawn' }
        ]
    },

    // 11 — catálogo: 155 → 100 (35% off)
    {
        id: 'pack_familias',
        nombre: 'Para familias',
        icono: 'home',
        descripcion: 'Una mascota y tres temas suaves. Tierno y cálido para el hogar.',
        precio: 100,
        items: [
            { tipo: 'widget', id: 'mascota' },
            { tipo: 'tema',   id: 'acuarela' },
            { tipo: 'tema',   id: 'floral' },
            { tipo: 'tema',   id: 'cuarzo-rosado' }
        ]
    },

    // 12 — catálogo: 205 → 135 (35% off)
    {
        id: 'pack_whatthehay_gold',
        nombre: 'WhatTheHay GOLD',
        icono: 'message-square',
        descripcion: 'Chat interno con el tema Charla. Como estar en casa.',
        precio: 135,
        items: [
            { tipo: 'app',  id: 'whatthehay' },
            { tipo: 'tema', id: 'charla' }
        ]
    },

    // 13 — catálogo: 130 → 90 (30% off)
    {
        id: 'pack_hombre_negocios',
        nombre: 'Hombre de negocios',
        icono: 'tie',
        descripcion: 'Oficina día, oficina noche, PDF y tareas. Kit formal completo.',
        precio: 90,
        items: [
            { tipo: 'tema',   id: 'oficina' },
            { tipo: 'tema',   id: 'oficina-dark' },
            { tipo: 'app',    id: 'lector-pdf' },
            { tipo: 'widget', id: 'to-do-list' }
        ]
    },

    // 14 — catálogo: 300 → 180 (40% off)
    {
        id: 'pack_streamer',
        nombre: 'Streamer de profesión',
        icono: 'tv',
        descripcion: 'Videollamadas y tema Stream. Para transmitir con estilo.',
        precio: 180,
        items: [
            { tipo: 'app',  id: 'silly-calls' },
            { tipo: 'tema', id: 'stream' }
        ]
    },

    // 15 — catálogo: 150 → 100 (35% off)
    {
        id: 'pack_pc_lover',
        nombre: 'PC Lover',
        icono: 'monitor',
        descripcion: 'Hacker, QR, accesos directos y Ventanas. Todo lo de la PC en uno.',
        precio: 100,
        items: [
            { tipo: 'tema',   id: 'hacker' },
            { tipo: 'app',    id: 'qr' },
            { tipo: 'widget', id: 'acceso-directo' },
            { tipo: 'tema',   id: 'ventanas' }
        ]
    },

    // 16 — catálogo: 125 → 90 (30% off)
    {
        id: 'pack_lectura_tarde',
        nombre: 'Lectura de la tarde',
        icono: 'bookmark',
        descripcion: 'Wiki, PDF y Café Latte. Para leer con algo caliente al lado.',
        precio: 90,
        items: [
            { tipo: 'widget', id: 'wiki_lector' },
            { tipo: 'app',    id: 'lector-pdf' },
            { tipo: 'tema',   id: 'cafe-latte' }
        ]
    },

    // 17 — catálogo: 20 → 15 (25% off)
    {
        id: 'pack_first',
        nombre: 'First Pack',
        icono: 'circle-dot',
        descripcion: 'Lo más accesible de cada categoría. Ideal para arrancar.',
        precio: 15,
        items: [
            { tipo: 'app',    id: 'camara' },
            { tipo: 'widget', id: 'bubble-image' },
            { tipo: 'tema',   id: 'noche' }
        ]
    },

    // 18 — catálogo: 500 → 300 (40% off)
    {
        id: 'pack_trinidad_dorada',
        nombre: 'Trinidad Dorada',
        icono: 'trophy',
        descripcion: 'Lo más caro de cada categoría. Exclusividad máxima.',
        precio: 300,
        items: [
            { tipo: 'app',    id: 'silly-calls' },
            { tipo: 'tema',   id: 'stream' },
            { tipo: 'tema',   id: 'pop-owner' },
            { tipo: 'widget', id: 'radio' }
        ]
    }
];
    
    // ========================================================
    //  Constantes de ofertas
    // ========================================================
    const IDB_NAME   = 'VicWebOsPromoZione';
    const IDB_STORE  = 'ofertas';
    const PESO_25    = 0.78;  // 78%
    const PESO_50    = 0.20;  // 20%
    const PESO_75    = 0.02;  // 2%

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
