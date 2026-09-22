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
    //  TEMÁTICOS / CULTURALES
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
        id: 'pack_reyes_musicales',
        nombre: 'Reyes Musicales',
        icono: 'music-2',
        descripcion: 'Tres temas con alma musical y la radio para acompañar.',
        precio: 225,
        items: [
            { tipo: 'tema',   id: 'pop-owner' },
            { tipo: 'tema',   id: 'break-of-dawn' },
            { tipo: 'tema',   id: 'salon' },
            { tipo: 'widget', id: 'radio' }
        ]
    },
    {
        id: 'pack_historico',
        nombre: 'Pack Histórico',
        icono: 'book-open',
        descripcion: 'Pasado, raíces y tradición. Para los que atesoran la memoria.',
        precio: 65,
        items: [
            { tipo: 'tema', id: 'libro' },
            { tipo: 'tema', id: 'consentido' },
            { tipo: 'tema', id: 'mucho-besame' }
        ]
    },

    // ============================================================
    //  OSCUROS / NOCTURNOS
    // ============================================================
    {
        id: 'pack_noche',
        nombre: 'Pack Noche',
        icono: 'moon',
        descripcion: 'Tres formas de vestir la oscuridad. Elegí tu mood nocturno.',
        precio: 25,
        items: [
            { tipo: 'tema', id: 'noche' },
            { tipo: 'tema', id: 'ocean' },
            { tipo: 'tema', id: 'pumkin' }
        ]
    },
    {
        id: 'pack_streaming',
        nombre: 'Pack Streaming',
        icono: 'signal',
        descripcion: 'Para maratones. Tema animado, dreams y radio de fondo.',
        precio: 200,
        items: [
            { tipo: 'tema',   id: 'stream' },
            { tipo: 'tema',   id: 'dreams' },
            { tipo: 'widget', id: 'radio' }
        ]
    },
    {
        id: 'pack_lofi',
        nombre: 'Pack Lo-Fi',
        icono: 'radio',
        descripcion: 'Charla, ruleta y radio. Vibra tranqui para estudiar o trabajar.',
        precio: 185,
        items: [
            { tipo: 'tema',   id: 'charla' },
            { tipo: 'widget', id: 'ruleta' },
            { tipo: 'widget', id: 'radio' }
        ]
    },

    // ============================================================
    //  CREATIVIDAD / ARTE
    // ============================================================
    {
        id: 'pack_creativo',
        nombre: 'Pack Creativo',
        icono: 'palette',
        descripcion: 'Tus dos editores gráficos a precio combo. Para artistas.',
        precio: 300,
        items: [
            { tipo: 'app', id: 'pixevan' },
            { tipo: 'app', id: 'arte-flash' }
        ]
    },
    {
        id: 'pack_expresion',
        nombre: 'Pack Expresión',
        icono: 'wand-2',
        descripcion: 'Edición, pixel art y acceso directo. Kit completo para crear.',
        precio: 380,
        items: [
            { tipo: 'app',    id: 'arte-flash' },
            { tipo: 'app',    id: 'pixevan' },
            { tipo: 'widget', id: 'acceso-directo' }
        ]
    },
    {
        id: 'pack_fotos',
        nombre: 'Pack Fotos',
        icono: 'images',
        descripcion: 'Editá, mostrá y disfrutá tus imágenes. Tres piezas visuales.',
        precio: 90,
        items: [
            { tipo: 'app',    id: 'photo-shinny' },
            { tipo: 'widget', id: 'diapositivas' },
            { tipo: 'widget', id: 'bubble-image' }
        ]
    },

    // ============================================================
    //  FORMALES / PRODUCTIVIDAD
    // ============================================================
    {
        id: 'pack_oficina',
        nombre: 'Pack Oficina',
        icono: 'briefcase',
        descripcion: 'Para trabajar en serio. Tema día, tema noche, notas y tareas.',
        precio: 85,
        items: [
            { tipo: 'tema',   id: 'oficina' },
            { tipo: 'tema',   id: 'oficina-dark' },
            { tipo: 'app',    id: 'notas' },
            { tipo: 'widget', id: 'to-do-list' }
        ]
    },
    {
        id: 'pack_utilidades',
        nombre: 'Pack Utilidades',
        icono: 'wrench',
        descripcion: 'Herramientas del día a día. Calculadora, QR y reloj mundial.',
        precio: 45,
        items: [
            { tipo: 'app',    id: 'calculadora' },
            { tipo: 'app',    id: 'qr' },
            { tipo: 'widget', id: 'reloj-mundial' }
        ]
    },
    {
        id: 'pack_lectura',
        nombre: 'Pack Lectura',
        icono: 'book-open-text',
        descripcion: 'Para leer sin distracciones. Lector, wiki y tema libro.',
        precio: 140,
        items: [
            { tipo: 'tema',   id: 'libro' },
            { tipo: 'widget', id: 'lector' },
            { tipo: 'widget', id: 'wiki_lector' }
        ]
    },
    {
        id: 'pack_tranquilo',
        nombre: 'Pack Tranquilo',
        icono: 'leaf',
        descripcion: 'Bosque, reloj mundial y lector. Calma visual para concentrarte.',
        precio: 68,
        items: [
            { tipo: 'tema',   id: 'bosque' },
            { tipo: 'widget', id: 'reloj-mundial' },
            { tipo: 'widget', id: 'lector' }
        ]
    },

    // ============================================================
    //  RETRO / GEEK
    // ============================================================
    {
        id: 'pack_retro',
        nombre: 'Pack Retro',
        icono: 'gamepad-2',
        descripcion: 'Hacker, Vapor y Chiptune. Nostalgia en tres capas.',
        precio: 40,
        items: [
            { tipo: 'tema', id: 'hacker' },
            { tipo: 'tema', id: 'vapor' },
            { tipo: 'tema', id: 'chiptune' }
        ]
    },
    {
        id: 'pack_geek',
        nombre: 'Pack Geek',
        icono: 'terminal',
        descripcion: 'Para devs y curiosos. Hacker, GitHub Lover y atajos directos.',
        precio: 110,
        items: [
            { tipo: 'tema',   id: 'hacker' },
            { tipo: 'tema',   id: 'github-lover' },
            { tipo: 'widget', id: 'acceso-directo' }
        ]
    },

    // ============================================================
    //  JUEGOS
    // ============================================================
    {
        id: 'pack_gamer',
        nombre: 'Pack Gamer',
        icono: 'gamepad',
        descripcion: 'Chiptune, MetroRun, ajedrez y adivinanzas. Kit jugador.',
        precio: 60,
        items: [
            { tipo: 'tema',   id: 'chiptune' },
            { tipo: 'app',    id: 'metrorun' },
            { tipo: 'widget', id: 'ajedrez-puzzle' },
            { tipo: 'app',    id: 'wordle' }
        ]
    },
    {
        id: 'pack_mini_juegos',
        nombre: 'Pack Mini Juegos',
        icono: 'dice-5',
        descripcion: 'Clásicos rápidos para ratos libres. Tres en raya, topo y dados.',
        precio: 10,
        items: [
            { tipo: 'app',    id: 'tres-en-raya' },
            { tipo: 'app',    id: 'whack-a-mole' },
            { tipo: 'widget', id: 'dados' }
        ]
    },
    {
        id: 'pack_runner',
        nombre: 'Pack Runner',
        icono: 'train-front',
        descripcion: 'Mezosoic Run, The MetroRun y Chiptune. Para correr sin parar.',
        precio: 55,
        items: [
            { tipo: 'tema', id: 'chiptune' },
            { tipo: 'app',  id: 'dino' },
            { tipo: 'app',  id: 'metrorun' }
        ]
    },

    // ============================================================
    //  SOCIAL
    // ============================================================
    {
        id: 'pack_social',
        nombre: 'Pack Social',
        icono: 'message-circle',
        descripcion: 'WhatsApp y Instagram de barrio, versión VicWebOs.',
        precio: 210,
        items: [
            { tipo: 'app', id: 'whatthehay' },
            { tipo: 'app', id: 'vicsgram' }
        ]
    },
    {
        id: 'pack_completo_social',
        nombre: 'Pack Social Completo',
        icono: 'users',
        descripcion: 'Todo lo social en un solo paquete. Correo, red, chat e insta.',
        precio: 200,
        items: [
            { tipo: 'app', id: 'twevan' },
            { tipo: 'app', id: 'evmail' },
            { tipo: 'app', id: 'whatthehay' },
            { tipo: 'app', id: 'vicsgram' }
        ]
    },
    {
        id: 'pack_videollamadas',
        nombre: 'Pack Videollamadas',
        icono: 'phone-call',
        descripcion: 'Chat + video en tiempo real. Para no perder contacto.',
        precio: 360,
        items: [
            { tipo: 'app', id: 'silly-calls' },
            { tipo: 'app', id: 'whatthehay' }
        ]
    },

    // ============================================================
    //  ESTÉTICOS / COLOR
    // ============================================================
    {
        id: 'pack_colorido',
        nombre: 'Pack Colorido',
        icono: 'rainbow',
        descripcion: 'Rosa, Floral, Cuarzo y diapositivas. Viví a todo color.',
        precio: 80,
        items: [
            { tipo: 'tema',   id: 'rosa' },
            { tipo: 'tema',   id: 'floral' },
            { tipo: 'tema',   id: 'cuarzo-rosado' },
            { tipo: 'widget', id: 'diapositivas' }
        ]
    },
    {
        id: 'pack_familiar',
        nombre: 'Pack Familiar',
        icono: 'paw-print',
        descripcion: 'Floral, Cuarzo y una mascota que cuidar. Tierno y cálido.',
        precio: 105,
        items: [
            { tipo: 'tema',   id: 'floral' },
            { tipo: 'tema',   id: 'cuarzo-rosado' },
            { tipo: 'widget', id: 'mascota' }
        ]
    },
    {
        id: 'pack_amanecer',
        nombre: 'Pack Amanecer',
        icono: 'sunrise',
        descripcion: 'Break of Dawn, Wuu y tu estado personal. Empezar el día lindo.',
        precio: 65,
        items: [
            { tipo: 'tema',   id: 'break-of-dawn' },
            { tipo: 'tema',   id: 'wuu' },
            { tipo: 'widget', id: 'mi-estado' }
        ]
    },
    {
        id: 'pack_elegante',
        nombre: 'Pack Elegante',
        icono: 'crown',
        descripcion: 'Golden, Salón de Noche y Ventanas. Sofisticación sin esfuerzo.',
        precio: 28,
        items: [
            { tipo: 'tema', id: 'golden' },
            { tipo: 'tema', id: 'salon' },
            { tipo: 'tema', id: 'ventanas' }
        ]
    },
    {
        id: 'pack_fiesta',
        nombre: 'Pack Fiesta',
        icono: 'sparkles',
        descripcion: 'Friend, Pop Owner y Ruleta. Para cuando hay que brillar.',
        precio: 100,
        items: [
            { tipo: 'tema',   id: 'friend' },
            { tipo: 'tema',   id: 'pop-owner' },
            { tipo: 'widget', id: 'ruleta' }
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
