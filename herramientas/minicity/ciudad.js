// ============================================================
//  ciudad.js — Core de MiniCity
//  ------------------------------------------------------------
//  Dos economías separadas:
//   · Créditos   → dentro del juego (construir, mejorar, expandir)
//   · Monedas OS → fuera (acelerar, 3° constructor)
//
//  CAMBIOS v2:
//   · Comercial produce POR MINUTO (antes /h). Aporte [1,3,8].
//   · procesarTiempo acumula fracciones (ya no redondea).
//   · Expansión de grilla: 4x4 → 5x5 → 6x6 → 7x7 → 8x8.
//   · OS multiplier 3 → 8 (techo 8 OS/h en endgame).
// ============================================================

(function () {
    'use strict';

    const APP_ID = 'minicity';
    const ARCHIVO_BASE = 'app/minicity/';
    const VERSION = 2;

    const GRILLA_SIZE_INICIAL = 4;
    const GRILLA_SIZE_MAX = 8;

    // Costo de expandir de NxN → (N+1)x(N+1), en créditos
    const COSTOS_EXPANSION = {
        4: 5000,
        5: 20000,
        6: 60000,
        7: 200000
    };

    // ------------------------------------------------------------
    //  Definiciones de edificios
    //  aporte comercial = CRÉDITOS POR MINUTO (se multiplica por felicidad/100)
    // ------------------------------------------------------------
    const TIPOS = {
        residencial: {
            id: 'residencial',
            nombre: 'Residencial',
            icono: 'home',
            descripcion: 'Aumenta la población. Requiere industria cerca.',
            costos: [50, 150, 400],
            tiemposMs: [30000, 300000, 1800000],
            aporte: [3, 8, 15]                 // población por nivel
        },
        comercial: {
            id: 'comercial',
            nombre: 'Comercial',
            icono: 'store',
            descripcion: 'Genera créditos por minuto. Sube la felicidad.',
            costos: [100, 250, 600],
            tiemposMs: [60000, 600000, 2400000],
            aporte: [1, 3, 8]                  // CRÉDITOS POR MINUTO por nivel
        },
        industrial: {
            id: 'industrial',
            nombre: 'Industrial',
            icono: 'factory',
            descripcion: 'Da empleos. Baja la felicidad si hay muchos.',
            costos: [75, 200, 500],
            tiemposMs: [45000, 450000, 2100000],
            aporte: [2, 6, 12]                 // empleos por nivel
        }
    };

    const COSTO_CONSTRUCTOR_2 = 2000;         // en créditos
    const COSTO_CONSTRUCTOR_3 = 25;           // en Monedas OS
    const MAX_CONSTRUCTORES = 3;
    const OS_MULTIPLICADOR = 8;               // techo práctico 8 OS/h en endgame

    // ------------------------------------------------------------
    //  Estado interno
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    //  Carga / guardado
    // ------------------------------------------------------------
    async function cargar() {
        const bd = BD();
        const ruta = rutaArchivo();
        if (!bd || !ruta) return false;
        try {
            const data = await bd.leerArchivo(ruta);
            if (data && typeof data === 'object' && Array.isArray(data.celdas)) {
                estado = data;

                // grillaSize: inferir si no existe
                if (typeof estado.grillaSize !== 'number') {
                    let maxCol = 0;
                    estado.celdas.forEach(c => { if (c.col > maxCol) maxCol = c.col; });
                    estado.grillaSize = Math.max(GRILLA_SIZE_INICIAL, maxCol + 1);
                }

                // Asegurar que celdas coincidan con el size
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

                // Sanity de campos numéricos
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
            if (!c.tipo || c.finConstruccion) return;
            if (c.nivel === 0) return;
            const def = TIPOS[c.tipo];
            if (!def) return;
            const idx = Math.max(0, Math.min(2, c.nivel - 1));
            if (c.tipo === 'residencial') {
                capPoblacion += def.aporte[idx];
                nResidenciales++;
            } else if (c.tipo === 'comercial') {
                sumaComercial += def.aporte[idx];
                nComerciales++;
            } else if (c.tipo === 'industrial') {
                empleos += def.aporte[idx];
                nIndustriales++;
            }
        });

        // Población = min(capacidad, empleos × 1.5)
        const poblacion = Math.floor(Math.min(capPoblacion, empleos * 1.5));

        // Felicidad
        let felicidad = 60;
        felicidad += nComerciales * 4;
        felicidad -= nIndustriales * 5;
        if (nResidenciales > 0 && nComerciales === 0) felicidad -= 20;
        if (nIndustriales > nComerciales + nResidenciales) felicidad -= 15;
        felicidad = Math.max(20, Math.min(100, felicidad));

        // Créditos por minuto
        const factorFelicidad = felicidad / 100;
        const creditosMinuto = sumaComercial * factorFelicidad;

        // Monedas OS por hora
        const scorePob     = Math.min(poblacion / 30, 1) * 0.4;
        const scoreFel     = (felicidad / 100) * 0.35;
        const totalEdif    = nResidenciales + nComerciales + nIndustriales;
        const scoreBalance = totalEdif > 0
            ? (1 - Math.abs(nResidenciales / totalEdif - 1 / 3)
                 - Math.abs(nComerciales / totalEdif - 1 / 3)
                 - Math.abs(nIndustriales / totalEdif - 1 / 3)) * 0.25
            : 0;
        const score = Math.max(0, scorePob + scoreFel + Math.max(0, scoreBalance));
        const osHora = score * OS_MULTIPLICADOR;

        return {
            poblacion,
            felicidad,
            creditosMinuto,
            osHora,
            nResidenciales,
            nComerciales,
            nIndustriales,
            capPoblacion,
            empleos
        };
    }

    // ------------------------------------------------------------
    //  Producción acumulada (NO redondea, acumula fracciones)
    // ------------------------------------------------------------
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
            estado.bancoOS = estado.bancoOS + osGanadas;
            estado.monedasOSGeneradas = estado.monedasOSGeneradas + osGanadas;
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
    // ------------------------------------------------------------
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
    //  Acciones
    // ------------------------------------------------------------
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
        const minRestantes = restanteMs / 60000;
        return Math.max(1, Math.ceil(minRestantes));
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

    // ------------------------------------------------------------
    //  Expansión de grilla
    // ------------------------------------------------------------
    function puedeExpandir() {
        if (!estado) return { ok: false, motivo: 'Sin estado' };
        const size = getGrillaSize();
        if (size >= GRILLA_SIZE_MAX) {
            return { ok: false, motivo: 'Grilla máxima alcanzada' };
        }
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

        // Preservar celdas existentes por su (col, fila)
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

    // ------------------------------------------------------------
    //  Constructores: compras
    // ------------------------------------------------------------
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
        GRILLA_SIZE_INICIAL,
        GRILLA_SIZE_MAX,
        COSTOS_EXPANSION,
        TIPOS,
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
