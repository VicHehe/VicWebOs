// ============================================================
//  ciudad.js — Core de MiniCity
//  ------------------------------------------------------------
//  Estado, fórmulas de producción, timers, banco, persistencia.
//  Expone window.MiniCity con la API pública.
//
//  Dos economías separadas:
//   · Créditos   → solo dentro del juego (construir, mejorar)
//   · Monedas OS → solo fuera (acelerar con OS, comprar 3° cons.)
// ============================================================

(function () {
    'use strict';

    const APP_ID = 'minicity';
    const ARCHIVO_BASE = 'app/minicity/';
    const VERSION = 1;

    const GRILLA_COLS = 4;
    const GRILLA_FILAS = 4;

    // ------------------------------------------------------------
    //  Definiciones de edificios y costos
    // ------------------------------------------------------------
    const TIPOS = {
        residencial: {
            id: 'residencial',
            nombre: 'Residencial',
            icono: 'home',
            descripcion: 'Aumenta la población. Requiere industria cerca.',
            costos: [50, 150, 400],           // construir n1, subir a n2, subir a n3
            tiemposMs: [30000, 300000, 1800000],  // 30s, 5min, 30min
            aporte: [3, 8, 15]                 // capacidad de población por nivel
        },
        comercial: {
            id: 'comercial',
            nombre: 'Comercial',
            icono: 'store',
            descripcion: 'Genera créditos por hora. Sube la felicidad.',
            costos: [100, 250, 600],
            tiemposMs: [60000, 600000, 2400000],  // 1min, 10min, 40min
            aporte: [1, 3, 7]                  // créditos base por nivel
        },
        industrial: {
            id: 'industrial',
            nombre: 'Industrial',
            icono: 'factory',
            descripcion: 'Da empleos. Baja la felicidad si hay muchos.',
            costos: [75, 200, 500],
            tiemposMs: [45000, 450000, 2100000],  // 45s, 7.5min, 35min
            aporte: [2, 6, 12]                 // empleos por nivel
        }
    };

    const COSTO_CONSTRUCTOR_2 = 2000;         // en créditos
    const COSTO_CONSTRUCTOR_3 = 25;           // en Monedas OS

    const MAX_CONSTRUCTORES = 3;

    const CREDITOS_POR_OS_SEGUNDO_MINIMO = 1; // acelerar: mínimo 1 OS

    // ------------------------------------------------------------
    //  Estado interno
    // ------------------------------------------------------------
    let estado = null;
    let usuario = null;
    let inicializado = false;
    let guardando = false;

    // ------------------------------------------------------------
    //  Helpers
    // ------------------------------------------------------------
    const API = () => window.parent.__vicwebos || null;
    const BD  = () => window.parent.ConfigBD || null;

    function rutaArchivo() {
        if (!usuario || !usuario.codigo) return null;
        return ARCHIVO_BASE + usuario.codigo + 'city.json';
    }

    function crearEstadoInicial() {
        const celdas = [];
        for (let f = 0; f < GRILLA_FILAS; f++) {
            for (let c = 0; c < GRILLA_COLS; c++) {
                celdas.push({ col: c, fila: f, tipo: null, nivel: 0, finConstruccion: null });
            }
        }
        return {
            version: VERSION,
            creditos: 200,                    // arranque amable
            bancoOS: 0,                       // monedas OS acumuladas sin reclamar
            monedasOSGeneradas: 0,            // histórico
            constructoresComprados: 1,        // arranca con 1
            celdas,
            ultimaProduccion: Date.now(),     // timestamp del último tick contabilizado
            creada: new Date().toISOString()
        };
    }

    // ------------------------------------------------------------
    //  Carga / guardado
    // ------------------------------------------------------------
    async function cargar() {
        const bd = BD();
        const ruta = rutaArchivo();
        if (!bd || !ruta) return false;
        try {
            const data = await bd.leerArchivo(ruta);
            if (data && typeof data === 'object' && data.celdas) {
                estado = data;
                // Sanity: garantizar celdas mínimas
                if (!Array.isArray(estado.celdas) || estado.celdas.length !== GRILLA_COLS * GRILLA_FILAS) {
                    const inicial = crearEstadoInicial();
                    inicial.creditos = estado.creditos ?? inicial.creditos;
                    inicial.bancoOS = estado.bancoOS ?? 0;
                    inicial.constructoresComprados = estado.constructoresComprados ?? 1;
                    inicial.monedasOSGeneradas = estado.monedasOSGeneradas ?? 0;
                    estado = inicial;
                }
                if (typeof estado.creditos !== 'number') estado.creditos = 200;
                if (typeof estado.bancoOS !== 'number') estado.bancoOS = 0;
                if (typeof estado.constructoresComprados !== 'number') estado.constructoresComprados = 1;
                if (typeof estado.ultimaProduccion !== 'number') estado.ultimaProduccion = Date.now();
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
    //  Fórmulas
    // ------------------------------------------------------------
    function calcularStats() {
        let capPoblacion = 0;
        let sumaComercial = 0;
        let empleos       = 0;
        let nComerciales  = 0;
        let nIndustriales = 0;
        let nResidenciales = 0;

        estado.celdas.forEach(c => {
            if (!c.tipo || c.nivel === 0 || c.finConstruccion) return;
            const def = TIPOS[c.tipo];
            if (!def) return;
            const nivelIdx = Math.max(0, Math.min(2, c.nivel - 1));
            if (c.tipo === 'residencial') {
                capPoblacion += def.aporte[nivelIdx];
                nResidenciales++;
            } else if (c.tipo === 'comercial') {
                sumaComercial += def.aporte[nivelIdx];
                nComerciales++;
            } else if (c.tipo === 'industrial') {
                empleos += def.aporte[nivelIdx];
                nIndustriales++;
            }
        });

        // Población = min(capacidad, empleos × 1.5)
        const poblacion = Math.floor(Math.min(capPoblacion, empleos * 1.5));

        // Felicidad (20-100)
        let felicidad = 60;
        felicidad += nComerciales * 4;
        felicidad -= nIndustriales * 5;
        if (nResidenciales > 0 && nComerciales === 0) felicidad -= 20;
        if (nIndustriales > nComerciales + nResidenciales) felicidad -= 15;
        felicidad = Math.max(20, Math.min(100, felicidad));

        // Créditos / hora
        const factorFelicidad = felicidad / 100;
        const creditosHora = Math.round(sumaComercial * factorFelicidad * 10) / 10;

        // Monedas OS / hora
        // Score = 40% población (cap 30) + 35% felicidad + 25% balance RCI
        const scorePob     = Math.min(poblacion / 30, 1) * 0.4;
        const scoreFel     = (felicidad / 100) * 0.35;
        const totalEdif    = nResidenciales + nComerciales + nIndustriales;
        const scoreBalance = totalEdif > 0
            ? (1 - Math.abs(nResidenciales / totalEdif - 1 / 3)
                - Math.abs(nComerciales / totalEdif - 1 / 3)
                - Math.abs(nIndustriales / totalEdif - 1 / 3)) * 0.25
            : 0;
        const score = Math.max(0, scorePob + scoreFel + Math.max(0, scoreBalance));
        const osHora = Math.round(score * 3 * 100) / 100;  // v1: techo práctico ~3/h

        return {
            poblacion,
            felicidad,
            creditosHora,
            osHora,
            nResidenciales,
            nComerciales,
            nIndustriales,
            capPoblacion,
            empleos
        };
    }

    // ------------------------------------------------------------
    //  Producción acumulada (procesar tiempo transcurrido)
    // ------------------------------------------------------------
    function procesarTiempo() {
        if (!estado) return { creditosGanados: 0, osGanadas: 0, segundosTranscurridos: 0 };

        const ahora = Date.now();
        const delta = ahora - estado.ultimaProduccion;
        if (delta < 1000) return { creditosGanados: 0, osGanadas: 0, segundosTranscurridos: 0 };

        const stats = calcularStats();
        const horas = delta / 3600000;

        const creditosGanados = Math.round(stats.creditosHora * horas);
        const osGanadas = Math.round(stats.osHora * horas * 100) / 100;

        if (creditosGanados > 0) estado.creditos += creditosGanados;
        if (osGanadas > 0) {
            estado.bancoOS = Math.round((estado.bancoOS + osGanadas) * 100) / 100;
            estado.monedasOSGeneradas = Math.round((estado.monedasOSGeneradas + osGanadas) * 100) / 100;
        }

        estado.ultimaProduccion = ahora;

        return {
            creditosGanados,
            osGanadas,
            segundosTranscurridos: Math.floor(delta / 1000)
        };
    }

    // ------------------------------------------------------------
    //  Timers
    //  Devuelve lista de construcciones terminadas desde el último tick.
    // ------------------------------------------------------------
    function procesarTimers() {
        if (!estado) return [];
        const ahora = Date.now();
        const terminadas = [];
        estado.celdas.forEach(c => {
            if (c.finConstruccion && c.finConstruccion <= ahora) {
                c.finConstruccion = null;
                // subir nivel
                c.nivel = Math.min(3, c.nivel + 1);
                terminadas.push({ col: c.col, fila: c.fila, tipo: c.tipo, nivel: c.nivel });
            }
        });
        return terminadas;
    }

    // ------------------------------------------------------------
    //  Constructores
    // ------------------------------------------------------------
    function constructoresOcupados() {
        if (!estado) return 0;
        return estado.celdas.filter(c => c.finConstruccion).length;
    }

    function constructoresDisponibles() {
        return estado.constructoresComprados - constructoresOcupados();
    }

    // ------------------------------------------------------------
    //  Acciones públicas
    // ------------------------------------------------------------
    function puedeConstruir(celdaIdx, tipo) {
        if (!estado) return { ok: false, motivo: 'Sin estado' };
        const c = estado.celdas[celdaIdx];
        if (!c) return { ok: false, motivo: 'Celda inválida' };
        if (c.tipo) return { ok: false, motivo: 'Celda ocupada' };
        if (constructoresDisponibles() <= 0) return { ok: false, motivo: 'Sin constructores libres' };
        const def = TIPOS[tipo];
        if (!def) return { ok: false, motivo: 'Tipo inválido' };
        if (estado.creditos < def.costos[0]) return { ok: false, motivo: 'Sin créditos' };
        return { ok: true };
    }

    function construir(celdaIdx, tipo) {
        const check = puedeConstruir(celdaIdx, tipo);
        if (!check.ok) throw new Error(check.motivo);
        const def = TIPOS[tipo];
        const c = estado.celdas[celdaIdx];
        estado.creditos -= def.costos[0];
        c.tipo = tipo;
        c.nivel = 0;                // nivel 0 = construyéndose hacia nivel 1
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
        const costo = def.costos[c.nivel];   // nivel 1 → costos[1], nivel 2 → costos[2]
        if (estado.creditos < costo) return { ok: false, motivo: 'Sin créditos' };
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

    // Costo en OS para acelerar: 1 OS por cada minuto restante, mínimo 1
    function costoAcelerar(celdaIdx) {
        const c = estado.celdas[celdaIdx];
        if (!c || !c.finConstruccion) return 0;
        const restanteMs = Math.max(0, c.finConstruccion - Date.now());
        const minRestantes = restanteMs / 60000;
        return Math.max(CREDITOS_POR_OS_SEGUNDO_MINIMO, Math.ceil(minRestantes));
    }

    async function acelerar(celdaIdx) {
        const c = estado.celdas[celdaIdx];
        if (!c || !c.finConstruccion) throw new Error('No hay nada que acelerar');
        const costo = costoAcelerar(celdaIdx);
        const api = API();
        if (!api || typeof api.gastoBoleta !== 'function') throw new Error('Sin conexión con el SO');
        await api.gastoBoleta('zap', APP_ID, 'Acelerar construcción', costo);
        c.finConstruccion = Date.now() - 1;   // se procesa en el próximo tick
        guardar();
        return { ok: true, costo };
    }

    // ------------------------------------------------------------
    //  Reclamar banco al SO
    // ------------------------------------------------------------
    async function reclamar() {
        if (!estado) throw new Error('Sin estado');
        const cantidad = Math.floor(estado.bancoOS);
        if (cantidad < 1) throw new Error('Necesitás al menos 1 moneda OS para reclamar');
        const api = API();
        if (!api || typeof api.canjear !== 'function') throw new Error('Sin conexión con el SO');
        await api.canjear('landmark', APP_ID, 'Recaudación de MiniCity', cantidad);
        estado.bancoOS = Math.round((estado.bancoOS - cantidad) * 100) / 100;
        guardar();
        return { ok: true, cantidad };
    }

    // ------------------------------------------------------------
    //  Constructores: compras
    // ------------------------------------------------------------
    async function comprarConstructor2() {
        if (estado.constructoresComprados >= 2) throw new Error('Ya lo tenés');
        if (estado.creditos < COSTO_CONSTRUCTOR_2) {
            throw new Error(`Te faltan ${COSTO_CONSTRUCTOR_2 - estado.creditos} créditos`);
        }
        estado.creditos -= COSTO_CONSTRUCTOR_2;
        estado.constructoresComprados = 2;
        guardar();
        return { ok: true };
    }

    async function comprarConstructor3() {
        if (estado.constructoresComprados >= 3) throw new Error('Ya lo tenés');
        const api = API();
        if (!api || typeof api.gastoBoleta !== 'function') throw new Error('Sin conexión con el SO');
        await api.gastoBoleta('users', APP_ID, 'Tercer constructor', COSTO_CONSTRUCTOR_3);
        estado.constructoresComprados = 3;
        guardar();
        return { ok: true };
    }

    // ------------------------------------------------------------
    //  Init
    // ------------------------------------------------------------
    async function init(usuarioDatos) {
        if (inicializado) return;
        inicializado = true;
        usuario = usuarioDatos;
        await cargar();
    }

    // ------------------------------------------------------------
    //  API pública
    // ------------------------------------------------------------
    window.MiniCity = {
        VERSION,
        GRILLA_COLS,
        GRILLA_FILAS,
        TIPOS,
        COSTO_CONSTRUCTOR_2,
        COSTO_CONSTRUCTOR_3,
        MAX_CONSTRUCTORES,
        init,
        getEstado: () => estado,
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
        comprarConstructor2,
        comprarConstructor3,
        guardar
    };
})();
