// ============================================================
//  ciudad.js — Core de MiniCity
//  ------------------------------------------------------------
//  CAMBIOS v4:
//   · 9 tipos de edificios declarativos (antes 3 hardcodeados).
//   · Cada tipo declara sus aportes, colores, altura, detalle
//     visual y stats para el modal.
//   · calcularStats() recorre TIPOS sin if/else por tipo.
//   · Balance OS ahora premia variedad de tipos (no solo RCI).
// ============================================================

(function () {
    'use strict';

    const APP_ID = 'minicity';
    const ARCHIVO_BASE = 'app/minicity/';
    const VERSION = 3;

    const GRILLA_SIZE_INICIAL = 4;
    const GRILLA_SIZE_MAX = 8;

    const COSTOS_EXPANSION = {
        4: 5000,
        5: 20000,
        6: 60000,
        7: 200000
    };

    // ------------------------------------------------------------
    //  TIPOS DE EDIFICIOS
    //  ------------------------------------------------------------
    //  Cada tipo declara:
    //   · costos[3]         — costo de construir n1, subir a n2, subir a n3
    //   · tiemposMs[3]      — tiempo de cada nivel
    //   · aportes           — arrays por nivel de lo que aporta
    //       { poblacion, empleos, creditos, felicidad }
    //   · colores           — { base, oscuro } hex
    //   · alturaPorNivel    — { 1, 2, 3 } en px
    //   · tamano            — { w, h } factor del tile (0.3 – 0.9)
    //   · detalle           — qué dibujo extra lleva
    //   · stats             — array de { label, key, unidad } para el modal
    // ------------------------------------------------------------
    const TIPOS = {

        campo: {
            id: 'campo',
            nombre: 'Campo',
            icono: 'trees',
            descripcion: 'Verde y tranquilo. Sube la felicidad.',
            costos:    [40, 120, 320],
            tiemposMs: [20000, 200000, 1200000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [0, 0, 0],
                creditos:  [0, 0, 0],
                felicidad: [8, 14, 22]
            },
            colores: { base: '#22C55E', oscuro: '#15803D' },
            alturaPorNivel: { 1: 10, 2: 12, 3: 14 },
            tamano: { w: 0.85, h: 0.85 },
            detalle: 'arbol',
            stats: [{ label: 'Felicidad', key: 'felicidad', unidad: '' }]
        },

        residencial: {
            id: 'residencial',
            nombre: 'Residencial',
            icono: 'home',
            descripcion: 'Casas familiares. Requiere industria cerca.',
            costos:    [50, 150, 400],
            tiemposMs: [30000, 300000, 1800000],
            aportes: {
                poblacion: [3, 8, 15],
                empleos:   [0, 0, 0],
                creditos:  [0, 0, 0],
                felicidad: [0, 0, 0]
            },
            colores: { base: '#10B981', oscuro: '#047857' },
            alturaPorNivel: { 1: 22, 2: 34, 3: 48 },
            tamano: { w: 0.55, h: 0.55 },
            detalle: 'puerta',
            stats: [{ label: 'Población', key: 'poblacion', unidad: '' }]
        },

        huerto: {
            id: 'huerto',
            nombre: 'Huerto',
            icono: 'sprout',
            descripcion: 'Alimentos frescos. Empleos baratos y algo de venta.',
            costos:    [60, 180, 450],
            tiemposMs: [35000, 350000, 1500000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [2, 5, 10],
                creditos:  [0.1, 0.3, 0.7],
                felicidad: [1, 2, 4]
            },
            colores: { base: '#84CC16', oscuro: '#4D7C0F' },
            alturaPorNivel: { 1: 8, 2: 10, 3: 12 },
            tamano: { w: 0.8, h: 0.8 },
            detalle: 'plantas',
            stats: [
                { label: 'Empleos', key: 'empleos', unidad: '' },
                { label: 'Créditos', key: 'creditos', unidad: '/min' }
            ]
        },

        industrial: {
            id: 'industrial',
            nombre: 'Industrial',
            icono: 'factory',
            descripcion: 'Empleos fuertes. Baja la felicidad si hay muchos.',
            costos:    [75, 200, 500],
            tiemposMs: [45000, 450000, 2100000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [2, 6, 12],
                creditos:  [0, 0, 0],
                felicidad: [-3, -4, -5]
            },
            colores: { base: '#F59E0B', oscuro: '#B45309' },
            alturaPorNivel: { 1: 18, 2: 26, 3: 36 },
            tamano: { w: 0.6, h: 0.6 },
            detalle: 'chimenea',
            stats: [{ label: 'Empleos', key: 'empleos', unidad: '' }]
        },

        comercial: {
            id: 'comercial',
            nombre: 'Comercial',
            icono: 'store',
            descripcion: 'Tiendas. Genera créditos por minuto. Sube la felicidad.',
            costos:    [100, 250, 600],
            tiemposMs: [60000, 600000, 2400000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [0, 0, 0],
                creditos:  [1, 3, 8],
                felicidad: [4, 5, 6]
            },
            colores: { base: '#3B82F6', oscuro: '#1E40AF' },
            alturaPorNivel: { 1: 26, 2: 40, 3: 56 },
            tamano: { w: 0.55, h: 0.55 },
            detalle: 'ventanal',
            stats: [{ label: 'Créditos', key: 'creditos', unidad: '/min' }]
        },

        taller: {
            id: 'taller',
            nombre: 'Taller',
            icono: 'wrench',
            descripcion: 'Pequeña manufactura. Empleos y créditos a la vez.',
            costos:    [120, 320, 750],
            tiemposMs: [75000, 700000, 2700000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [3, 7, 14],
                creditos:  [0.2, 0.5, 1.2],
                felicidad: [-1, -1, -2]
            },
            colores: { base: '#FB923C', oscuro: '#9A3412' },
            alturaPorNivel: { 1: 16, 2: 24, 3: 32 },
            tamano: { w: 0.6, h: 0.6 },
            detalle: 'chimenea',
            stats: [
                { label: 'Empleos', key: 'empleos', unidad: '' },
                { label: 'Créditos', key: 'creditos', unidad: '/min' }
            ]
        },

        departamento: {
            id: 'departamento',
            nombre: 'Departamento',
            icono: 'building-2',
            descripcion: 'Torre de viviendas con local abajo. Población + créditos.',
            costos:    [150, 400, 900],
            tiemposMs: [90000, 900000, 3600000],
            aportes: {
                poblacion: [5, 12, 22],
                empleos:   [0, 0, 0],
                creditos:  [0.3, 0.8, 2],
                felicidad: [1, 1, 2]
            },
            colores: { base: '#8B5CF6', oscuro: '#5B21B6' },
            alturaPorNivel: { 1: 38, 2: 54, 3: 72 },
            tamano: { w: 0.5, h: 0.5 },
            detalle: 'ventanal',
            stats: [
                { label: 'Población', key: 'poblacion', unidad: '' },
                { label: 'Créditos', key: 'creditos', unidad: '/min' }
            ]
        },

        plaza: {
            id: 'plaza',
            nombre: 'Plaza',
            icono: 'flower-2',
            descripcion: 'Espacio público. Mucha felicidad y algo de turismo.',
            costos:    [200, 500, 1200],
            tiemposMs: [120000, 1200000, 4800000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [0, 0, 0],
                creditos:  [0.1, 0.3, 0.7],
                felicidad: [15, 25, 38]
            },
            colores: { base: '#EC4899', oscuro: '#9D174D' },
            alturaPorNivel: { 1: 12, 2: 14, 3: 16 },
            tamano: { w: 0.85, h: 0.85 },
            detalle: 'fuente',
            stats: [
                { label: 'Felicidad', key: 'felicidad', unidad: '' },
                { label: 'Créditos', key: 'creditos', unidad: '/min' }
            ]
        },

        banco: {
            id: 'banco',
            nombre: 'Banco',
            icono: 'landmark',
            descripcion: 'Gran generador de créditos. Caro pero muy rentable.',
            costos:    [500, 1200, 2800],
            tiemposMs: [300000, 2400000, 7200000],
            aportes: {
                poblacion: [0, 0, 0],
                empleos:   [0, 0, 0],
                creditos:  [3, 8, 18],
                felicidad: [2, 3, 4]
            },
            colores: { base: '#F59E0B', oscuro: '#78350F' },
            alturaPorNivel: { 1: 30, 2: 44, 3: 60 },
            tamano: { w: 0.7, h: 0.7 },
            detalle: 'columnas',
            stats: [{ label: 'Créditos', key: 'creditos', unidad: '/min' }]
        }
    };

    // Orden de aparición en el modal de construir (por costo n1 asc)
    const ORDEN_TIPOS = Object.keys(TIPOS).sort(
        (a, b) => TIPOS[a].costos[0] - TIPOS[b].costos[0]
    );

    const COSTO_CONSTRUCTOR_2 = 2000;
    const COSTO_CONSTRUCTOR_3 = 25;
    const MAX_CONSTRUCTORES = 3;
    const OS_MULTIPLICADOR = 8;

    let estado = null;
    let usuario = null;
    let inicializado = false;
    let guardando = false;

    const API = () => window.parent.__vicwebos || null;
    const BD  = () => window.parent.ConfigBD || null;

    function rutaArchivo() {
        if (!usuario || !usuario.codigo) return null;
        return ARCHIVO_BASE + usuario.codigo + 'city.json';
    }

    function getGrillaSize() {
        return (estado && typeof estado.grillaSize === 'number')
            ? estado.grillaSize
            : GRILLA_SIZE_INICIAL;
    }

    function crearCeldasParaSize(size) {
        const celdas = [];
        for (let f = 0; f < size; f++) {
            for (let c = 0; c < size; c++) {
                celdas.push({
                    col: c, fila: f, tipo: null, nivel: 0, finConstruccion: null
                });
            }
        }
        return celdas;
    }

    function crearEstadoInicial() {
        const size = GRILLA_SIZE_INICIAL;
        return {
            version: VERSION,
            grillaSize: size,
            creditos: 200,
            bancoOS: 0,
            monedasOSGeneradas: 0,
            constructoresComprados: 1,
            celdas: crearCeldasParaSize(size),
            ultimaProduccion: Date.now(),
            creada: new Date().toISOString()
        };
    }

    async function cargar() {
        const bd = BD();
        const ruta = rutaArchivo();
        if (!bd || !ruta) return false;
        try {
            const data = await bd.leerArchivo(ruta);
            if (data && typeof data === 'object' && Array.isArray(data.celdas)) {
                estado = data;

                if (typeof estado.grillaSize !== 'number') {
                    let maxCol = 0;
                    estado.celdas.forEach(c => { if (c.col > maxCol) maxCol = c.col; });
                    estado.grillaSize = Math.max(GRILLA_SIZE_INICIAL, maxCol + 1);
                }

                const size = estado.grillaSize;
                if (estado.celdas.length !== size * size) {
                    const mapa = {};
                    estado.celdas.forEach(c => { mapa[`${c.col}_${c.fila}`] = c; });
                    const nuevas = [];
                    for (let f = 0; f < size; f++) {
                        for (let c = 0; c < size; c++) {
                            nuevas.push(mapa[`${c}_${f}`] || {
                                col: c, fila: f, tipo: null, nivel: 0, finConstruccion: null
                            });
                        }
                    }
                    estado.celdas = nuevas;
                }

                // Limpiar tipos desconocidos (por si actualizamos el catálogo)
                estado.celdas.forEach(c => {
                    if (c.tipo && !TIPOS[c.tipo]) {
                        c.tipo = null;
                        c.nivel = 0;
                        c.finConstruccion = null;
                    }
                });

                if (typeof estado.creditos !== 'number') estado.creditos = 200;
                if (typeof estado.bancoOS !== 'number') estado.bancoOS = 0;
                if (typeof estado.constructoresComprados !== 'number') estado.constructoresComprados = 1;
                if (typeof estado.ultimaProduccion !== 'number') estado.ultimaProduccion = Date.now();
                if (typeof estado.monedasOSGeneradas !== 'number') estado.monedasOSGeneradas = 0;
                return true;
            }
        } catch (e) {
            console.warn('[MiniCity] Error cargando:', e);
        }
        estado = crearEstadoInicial();
        return false;
    }

    async function guardar() {
        if (guardando) return;
        const bd = BD();
        const ruta = rutaArchivo();
        if (!bd || !ruta || !estado) return;
        guardando = true;
        try {
            await bd.escribirArchivo(ruta, estado);
        } catch (e) {
            console.warn('[MiniCity] Error guardando:', e);
        } finally {
            guardando = false;
        }
    }

    // ------------------------------------------------------------
    //  Stats: recorre TIPOS sin if/else específicos
    // ------------------------------------------------------------
    function calcularStats() {
        const aportes = { poblacion: 0, empleos: 0, creditos: 0, felicidad: 0 };
        const tiposVistos = new Set();

        estado.celdas.forEach(c => {
            if (!c.tipo || c.finConstruccion || c.nivel === 0) return;
            const def = TIPOS[c.tipo];
            if (!def) return;
            const idx = Math.max(0, Math.min(2, c.nivel - 1));
            aportes.poblacion += def.aportes.poblacion[idx];
            aportes.empleos   += def.aportes.empleos[idx];
            aportes.creditos  += def.aportes.creditos[idx];
            aportes.felicidad += def.aportes.felicidad[idx];
            tiposVistos.add(c.tipo);
        });

        // Población efectiva: no podés tener más habitantes que empleos × 1.5
        const poblacion = Math.floor(Math.min(aportes.poblacion, aportes.empleos * 1.5));

        // Felicidad
        let felicidad = 60 + aportes.felicidad;
        if (aportes.poblacion > 0 && aportes.creditos === 0) felicidad -= 15;
        if (aportes.poblacion > 0 && aportes.empleos < aportes.poblacion * 0.5) felicidad -= 10;
        felicidad = Math.max(20, Math.min(100, felicidad));

        // Créditos/min
        const factorFelicidad = felicidad / 100;
        const creditosMinuto = aportes.creditos * factorFelicidad;

        // Monedas OS/hora
        //   - 40% población (tope 30)
        //   - 35% felicidad
        //   - 25% variedad: roles cubiertos + cantidad de tipos distintos
        const scorePob  = Math.min(poblacion / 30, 1) * 0.4;
        const scoreFel  = (felicidad / 100) * 0.35;

        const rolesCubiertos = [
            aportes.poblacion > 0,
            aportes.empleos > 0,
            aportes.creditos > 0
        ].filter(Boolean).length / 3;

        const variedadTipos = Math.min(1, tiposVistos.size / 5);
        const scoreBalance = (rolesCubiertos * 0.7 + variedadTipos * 0.3) * 0.25;

        const score = Math.max(0, scorePob + scoreFel + scoreBalance);
        const osHora = score * OS_MULTIPLICADOR;

        return {
            poblacion,
            felicidad,
            creditosMinuto,
            osHora,
            aportes,
            tiposVistos: tiposVistos.size
        };
    }

    function procesarTiempo() {
        if (!estado) return { creditosGanados: 0, osGanadas: 0, segundosTranscurridos: 0 };

        const ahora = Date.now();
        const delta = ahora - estado.ultimaProduccion;
        if (delta < 1000) return { creditosGanados: 0, osGanadas: 0, segundosTranscurridos: 0 };

        const stats = calcularStats();
        const minutos = delta / 60000;
        const horas   = delta / 3600000;

        const creditosGanados = stats.creditosMinuto * minutos;
        const osGanadas = stats.osHora * horas;

        if (creditosGanados > 0) estado.creditos += creditosGanados;
        if (osGanadas > 0) {
            estado.bancoOS += osGanadas;
            estado.monedasOSGeneradas += osGanadas;
        }

        estado.ultimaProduccion = ahora;

        return {
            creditosGanados,
            osGanadas,
            segundosTranscurridos: Math.floor(delta / 1000)
        };
    }

    function procesarTimers() {
        if (!estado) return [];
        const ahora = Date.now();
        const terminadas = [];
        estado.celdas.forEach(c => {
            if (c.finConstruccion && c.finConstruccion <= ahora) {
                c.finConstruccion = null;
                c.nivel = Math.min(3, c.nivel + 1);
                terminadas.push({ col: c.col, fila: c.fila, tipo: c.tipo, nivel: c.nivel });
            }
        });
        return terminadas;
    }

    function constructoresOcupados() {
        if (!estado) return 0;
        return estado.celdas.filter(c => c.finConstruccion).length;
    }

    function constructoresDisponibles() {
        return estado.constructoresComprados - constructoresOcupados();
    }

    function puedeConstruir(celdaIdx, tipo) {
        if (!estado) return { ok: false, motivo: 'Sin estado' };
        const c = estado.celdas[celdaIdx];
        if (!c) return { ok: false, motivo: 'Celda inválida' };
        if (c.tipo) return { ok: false, motivo: 'Celda ocupada' };
        if (constructoresDisponibles() <= 0) return { ok: false, motivo: 'Sin constructores libres' };
        const def = TIPOS[tipo];
        if (!def) return { ok: false, motivo: 'Tipo inválido' };
        if (Math.floor(estado.creditos) < def.costos[0]) {
            return { ok: false, motivo: 'Sin créditos' };
        }
        return { ok: true };
    }

    function construir(celdaIdx, tipo) {
        const check = puedeConstruir(celdaIdx, tipo);
        if (!check.ok) throw new Error(check.motivo);
        const def = TIPOS[tipo];
        const c = estado.celdas[celdaIdx];
        estado.creditos -= def.costos[0];
        c.tipo = tipo;
        c.nivel = 0;
        c.finConstruccion = Date.now() + def.tiemposMs[0];
        guardar();
        return c;
    }

    function puedeMejorar(celdaIdx) {
        if (!estado) return { ok: false, motivo: 'Sin estado' };
        const c = estado.celdas[celdaIdx];
        if (!c || !c.tipo) return { ok: false, motivo: 'No hay edificio' };
        if (c.finConstruccion) return { ok: false, motivo: 'Ya está construyéndose' };
        if (c.nivel >= 3) return { ok: false, motivo: 'Nivel máximo' };
        if (constructoresDisponibles() <= 0) return { ok: false, motivo: 'Sin constructores libres' };
        const def = TIPOS[c.tipo];
        const costo = def.costos[c.nivel];
        if (Math.floor(estado.creditos) < costo) return { ok: false, motivo: 'Sin créditos' };
        return { ok: true, costo };
    }

    function mejorar(celdaIdx) {
        const check = puedeMejorar(celdaIdx);
        if (!check.ok) throw new Error(check.motivo);
        const c = estado.celdas[celdaIdx];
        const def = TIPOS[c.tipo];
        const costo = def.costos[c.nivel];
        const tiempo = def.tiemposMs[c.nivel];
        estado.creditos -= costo;
        c.finConstruccion = Date.now() + tiempo;
        guardar();
        return c;
    }

    function costoAcelerar(celdaIdx) {
        const c = estado.celdas[celdaIdx];
        if (!c || !c.finConstruccion) return 0;
        const restanteMs = Math.max(0, c.finConstruccion - Date.now());
        return Math.max(1, Math.ceil(restanteMs / 60000));
    }

    async function acelerar(celdaIdx) {
        const c = estado.celdas[celdaIdx];
        if (!c || !c.finConstruccion) throw new Error('No hay nada que acelerar');
        const costo = costoAcelerar(celdaIdx);
        const api = API();
        if (!api || typeof api.gastoBoleta !== 'function') throw new Error('Sin conexión con el SO');
        await api.gastoBoleta('zap', APP_ID, 'Acelerar construcción', costo);
        c.finConstruccion = Date.now() - 1;
        guardar();
        return { ok: true, costo };
    }

    async function reclamar() {
        if (!estado) throw new Error('Sin estado');
        const cantidad = Math.floor(estado.bancoOS);
        if (cantidad < 1) throw new Error('Necesitás al menos 1 moneda OS para reclamar');
        const api = API();
        if (!api || typeof api.canjear !== 'function') throw new Error('Sin conexión con el SO');
        await api.canjear('landmark', APP_ID, 'Recaudación de MiniCity', cantidad);
        estado.bancoOS = Math.max(0, estado.bancoOS - cantidad);
        guardar();
        return { ok: true, cantidad };
    }

    function puedeExpandir() {
        if (!estado) return { ok: false, motivo: 'Sin estado' };
        const size = getGrillaSize();
        if (size >= GRILLA_SIZE_MAX) return { ok: false, motivo: 'Grilla máxima alcanzada' };
        const costo = COSTOS_EXPANSION[size];
        if (Math.floor(estado.creditos) < costo) {
            return { ok: false, motivo: `Faltan ${costo - Math.floor(estado.creditos)} créditos`, costo };
        }
        return { ok: true, costo, sizeActual: size, sizeNuevo: size + 1 };
    }

    function expandirGrilla() {
        const check = puedeExpandir();
        if (!check.ok) throw new Error(check.motivo);

        const sizeViejo = check.sizeActual;
        const sizeNuevo = check.sizeNuevo;

        const mapa = {};
        estado.celdas.forEach(c => { mapa[`${c.col}_${c.fila}`] = c; });

        const nuevas = [];
        for (let f = 0; f < sizeNuevo; f++) {
            for (let c = 0; c < sizeNuevo; c++) {
                nuevas.push(mapa[`${c}_${f}`] || {
                    col: c, fila: f, tipo: null, nivel: 0, finConstruccion: null
                });
            }
        }

        estado.creditos -= check.costo;
        estado.celdas = nuevas;
        estado.grillaSize = sizeNuevo;
        guardar();
        return { ok: true, sizeNuevo, sizeViejo, costo: check.costo };
    }

    async function comprarConstructor2() {
        if (estado.constructoresComprados >= 2) throw new Error('Ya lo tenés');
        if (Math.floor(estado.creditos) < COSTO_CONSTRUCTOR_2) {
            throw new Error(`Te faltan ${COSTO_CONSTRUCTOR_2 - Math.floor(estado.creditos)} créditos`);
        }
        estado.creditos -= COSTO_CONSTRUCTOR_2;
        estado.constructoresComprados = 2;
        guardar();
        return { ok: true };
    }

    async function comprarConstructor3() {
        if (estado.constructoresComprados >= 3) throw new Error('Ya lo tenés');
        if (estado.constructoresComprados < 2) {
            throw new Error('Primero necesitás el Segundo constructor (se compra con créditos)');
        }
        const api = API();
        if (!api || typeof api.gastoBoleta !== 'function') throw new Error('Sin conexión con el SO');
        await api.gastoBoleta('users', APP_ID, 'Tercer constructor', COSTO_CONSTRUCTOR_3);
        estado.constructoresComprados = 3;
        guardar();
        return { ok: true };
    }

    async function init(usuarioDatos) {
        if (inicializado) return;
        inicializado = true;
        usuario = usuarioDatos;
        await cargar();
    }

    window.MiniCity = {
        VERSION,
        GRILLA_SIZE_INICIAL,
        GRILLA_SIZE_MAX,
        COSTOS_EXPANSION,
        TIPOS,
        ORDEN_TIPOS,
        COSTO_CONSTRUCTOR_2,
        COSTO_CONSTRUCTOR_3,
        MAX_CONSTRUCTORES,
        init,
        getEstado: () => estado,
        getGrillaSize,
        calcularStats,
        procesarTiempo,
        procesarTimers,
        constructoresDisponibles,
        constructoresOcupados,
        puedeConstruir,
        construir,
        puedeMejorar,
        mejorar,
        costoAcelerar,
        acelerar,
        reclamar,
        puedeExpandir,
        expandirGrilla,
        comprarConstructor2,
        comprarConstructor3,
        guardar
    };
})();
