// ============================================================
//  Wordle — Adivina la palabra de 5 letras
//  ------------------------------------------------------------
//  - 6 intentos por palabra.
//  - Se puede jugar cuantas veces se quiera.
//  - +25 monedas por cada palabra descubierta.
//  - Estadísticas (ganadas + racha) persisten por usuario
//    en IndexedDB.
//  - Diccionario propio en español (sin tildes ni Ñ).
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'wordle';
const IDB_NAME = 'WordleDB';
const IDB_VERSION = 1;
const IDB_STORE = 'estado';

const LARGO = 5;
const MAX_INTENTOS = 6;
const MONEDAS_VICTORIA = 25;

// ============================================================
//  DICCIONARIO
//  ~350 palabras comunes de 5 letras en español.
//  Todas sin tildes ni Ñ, en mayúsculas.
// ============================================================
const PALABRAS = [
    'ABRIR','ACASO','ACERO','ACIDO','AGUJA','AJENO','ALBUM','ALDEA','ALTAR','AMIGO',
    'ANDAR','ANGEL','ANIMO','ANCHO','APOYO','ARBOL','ARDER','ARENA','ARMAR','ARROZ',
    'ASADO','ASTRO','ATOMO','AUTOR','AVISO','BANCO','BANDO','BARCO','BAJAR','BAZAR',
    'BELLO','BESAR','BICHO','BINGO','BLUSA','BOLSA','BOMBA','BORDE','BOTON','BRAZO',
    'BREVE','BRISA','BUENO','BULTO','BURRO','CABRA','CAIDA','CAJON','CALMA','CALOR',
    'CALLE','CAMPO','CANAL','CANTO','CARGA','CARNE','CARRO','CARTA','CASCO','CAUSA',
    'CAZAR','CEBRA','CEDER','CELDA','CENAR','CERCA','CERDO','CESAR','CHICO','CHILE',
    'CHINO','CICLO','CIELO','CIEGO','CINCO','CIRCO','CLARO','CLASE','CLIMA','COBRA',
    'COCER','COCHE','COFRE','COGER','COLAR','COLOR','COMER','CONDE','COPIA','CORAL',
    'CORTO','COSER','COSTA','CREER','CRUDO','CRUEL','CUBO','CUERO','CULPA','CUOTA',
    'DARDO','DATOS','DEBER','DECIR','DEDOS','DEJAR','DESEO','DEUDA','DICHO','DIETA',
    'DISCO','DIVAN','DOLOR','DONDE','DORSO','DOSIS','DUCHA','DUELO','DULCE','DUQUE',
    'DURAR','ECHAR','EDAD','EDITO','ELEVO','ENANO','ENCIA','ENERO','ENVIO','ERROR',
    'ESPIA','ESPOSO','ESTAR','ETICA','EXITO','EXTRA','FACIL','FAENA','FALDA','FALSO',
    'FALTA','FANGO','FECHA','FELIZ','FERIA','FEROZ','FIBRA','FIERA','FIJAR','FINAL',
    'FIRMA','FIRME','FLACO','FLEMA','FLOR','FLOTA','FOCO','FONDO','FORMA','FORRO',
    'FRASE','FRENO','FRIO','FRUTA','FUEGO','FUERA','FUMAR','FURIA','GALLO','GANAR',
    'GANSO','GARRA','GASTO','GENTE','GESTO','GIRAR','GLOBO','GOLPE','GORDO','GORRA',
    'GOTA','GOZAR','GRADO','GRANO','GRASA','GRAVE','GRITO','GRUPO','GUAPO','GUIA',
    'GUSTO','HABER','HACHA','HACER','HARTO','HASTA','HECHO','HELIO','HERIDA','HIELO',
    'HIJO','HILO','HOGAR','HOJA','HONDO','HONGO','HONOR','HORNO','HOTEL','HUECO',
    'HUESO','HUEVO','HUIR','HUMOR','IDEAL','IGUAL','IMAN','IMPAR','INDIO','ISLA',
    'JABON','JAMON','JARRA','JAULA','JEFE','JOVEN','JOYA','JUEZ','JUGAR','JUNIO',
    'JUNTO','JURAR','JUSTO','LABIO','LADO','LAGO','LANA','LANCE','LARGO','LARVA',
    'LATA','LAVAR','LAZO','LECHE','LECHO','LEGAL','LEJOS','LENTO','LEON','LETRA',
    'LIBRE','LIBRO','LIDER','LIGA','LIMON','LINDO','LINEA','LIRIO','LISTA','LISTO',
    'LITRO','LLAVE','LLENO','LOBO','LODO','LOGRO','LOMA','LORO','LUCHA','LUEGO',
    'LUGAR','LUJO','LUNA','MACHO','MADRE','MAGIA','MAGO','MAIZ','MANGO','MANSO',
    'MANTA','MAPA','MARCA','MAREA','MAYOR','MECHA','MEDIA','MEDIO','MEJOR','MELON',
    'MENOR','MENOS','MENTE','MESA','META','METAL','MIEDO','MIEL','MILLA','MINA',
    'MIRAR','MISIL','MISMA','MISMO','MITAD','MITO','MODO','MOLDE','MONJE','MONTE',
    'MORAL','MORIR','MOSCA','MOTOR','MOVER','MUCHO','MUJER','MUNDO','MURO','MUSEO',
    'MUSLO','MUTUO','NACER','NADAR','NAIPE','NARIZ','NAVAL','NAVE','NEGAR','NEGRO',
    'NENE','NEVAR','NIDO','NIETO','NIEVE','NIVEL','NOBLE','NOCHE','NORTE','NOTAR',
    'NOVIO','NUBE','NUEVE','NUEVO','NUNCA','OBRA','OBVIO','OCIO','OESTE','OIDO',
    'OLIVO','OLOR','ONDA','OPACO','OPERA','OPTAR','ORDEN','OREJA','ORINA','ORUGA',
    'OVEJA','PADRE','PAGAR','PAJARO','PALMA','PALO','PANAL','PANDA','PANEL','PANZA',
    'PAPEL','PARAR','PARED','PARIR','PARRA','PARTE','PASAR','PASTA','PASTO','PATIO',
    'PECHO','PEDIR','PEGAR','PEINE','PELO','PEOR','PERA','PERLA','PERRO','PESCA',
    'PESO','PIANO','PICAR','PICO','PIEDRA','PIEL','PIEZA','PILA','PINO','PINTA',
    'PINTAR','PINTOR','PINZA','PISO','PISTA','PITAR','PLACA','PLANO','PLANTA','PLATA',
    'PLAYA','PLAZA','PLENO','PLOMO','PLUMA','POBRE','PODER','PODIO','POEMA','POLEN',
    'POLVO','POLLO','PONER','PORTE','POSTE','POZO','PRECIO','PRESO','PRIMA','PRISA',
    'PROSA','PRUEBA','PUEBLO','PUENTE','PUERTA','PULPO','PULSO','PUNTA','PUNTO','QUEDAR',
    'QUEJA','QUEMA','QUESO','QUIEN','QUINCE','QUINTO','RADAR','RADIO','RAMA','RAMO',
    'RANA','RAPAZ','RASGO','RATA','RATO','RATON','RAYA','RAYO','RAZON','REAL',
    'REINA','REIR','REJA','RELOJ','REMAR','REMO','RENO','RENTA','RESTO','RETAR',
    'REVES','REY','REZAR','RICO','RIEGO','RIMA','RISCO','RITMO','RIVAL','ROBAR',
    'ROBLE','ROBOT','ROCA','RODAR','RODEO','ROJO','ROLLO','ROMBO','RONDA','ROSA',
    'ROSCA','ROTO','RUBIO','RUEDA','RUEGO','RUIDO','RUINA','RUMBO','RUMOR','RUTA',
    'SABER','SABIO','SABLE','SABOR','SACAR','SACO','SALIR','SALSA','SALTO','SALUD',
    'SALVAR','SANAR','SANTO','SECAR','SEGUIR','SEGURO','SELVA','SELLO','SERIE','SERIO',
    'SESION','SETA','SEXO','SIGLO','SIGNO','SILLA','SILBAR','SIMPLE','SIRENA','SITIO',
    'SOBRE','SOCIO','SOLAR','SOLTAR','SONAR','SONIDO','SOPA','SORDO','SUAVE','SUBIR',
    'SUCIO','SUDAR','SUDOR','SUELO','SUERTE','SUFRIR','SUMAR','SUSTO','SUTIL','TABLA',
    'TACO','TALLA','TALLE','TALLO','TALON','TANQUE','TAPA','TAPIZ','TARDE','TARRO',
    'TARTA','TAZA','TECHO','TECLA','TEJER','TELA','TELAR','TEMA','TEMOR','TENIS',
    'TERCO','TERMO','TERROR','TESTA','TIBIO','TIEMPO','TIENDA','TIENE','TIGRE','TINTA',
    'TIPO','TIRAR','TIRO','TITAN','TIZA','TOCAR','TODO','TOLDO','TOMAR','TONO',
    'TONTO','TOPE','TOPO','TOQUE','TORO','TORPE','TORRE','TORTA','TOSER','TRAGO',
    'TRAJE','TRAMPA','TRAPO','TRATO','TRECE','TREN','TRIBU','TRIGO','TRINO','TROPA',
    'TROZO','TRUCO','TUMBA','TURNO','TUTOR','UNICO','UNIDAD','UNIR','USADO','USAR',
    'UTIL','VACA','VACIO','VAGAR','VALLE','VALOR','VAPOR','VARA','VASO','VASTO',
    'VELA','VELOZ','VENDA','VENDER','VENIR','VENTA','VERBO','VERDE','VERSO','VIAJE',
    'VIDRIO','VIGOR','VILLA','VINO','VIRGEN','VISTA','VISTO','VITAL','VOCAL','VOLAR',
    'VOTAR','VOTO','VUELO','VULGAR'
];

// Set para validación rápida
const SET_PALABRAS = new Set(PALABRAS);

// ============================================================
//  ESTADO
// ============================================================
let usuarioActual = null;
let palabraSecreta = '';
let intentos = [];              // strings ya enviados
let filaActual = 0;
let columnaActual = 0;
let juegoTerminado = false;
let letrasEstado = {};          // { A: 'correcta'|'presente'|'ausente' }
let estadisticas = { ganadas: 0, racha: 0 };
let msgTimeout = null;
let inicializado = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

// ============================================================
//  TEMA
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = [
            '--violet-50','--violet-100','--violet-200','--violet-300',
            '--violet-400','--violet-500','--violet-600','--violet-700',
            '--white','--bg','--bg-alt',
            '--gray-50','--gray-100','--gray-200','--gray-300','--gray-400',
            '--gray-500','--gray-600','--gray-700','--gray-800','--gray-900',
            '--border','--text','--text-2','--text-3',
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  INDEXEDDB
// ============================================================
function abrirIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

async function idbGet(key) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { return null; }
}

async function idbSet(key, value) {
    try {
        const db = await abrirIDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (e) { /* silencioso */ }
}

function claveEstado() {
    const codigo = (usuarioActual && usuarioActual.codigo) ? usuarioActual.codigo : 'invitado';
    return 'wd_' + codigo;
}

async function cargarEstadisticas() {
    const data = await idbGet(claveEstado());
    if (!data || typeof data !== 'object') return;
    estadisticas.ganadas = Number.isFinite(data.ganadas) ? data.ganadas : 0;
    estadisticas.racha   = Number.isFinite(data.racha)   ? data.racha   : 0;
}

function guardarEstadisticas() {
    idbSet(claveEstado(), {
        ganadas: estadisticas.ganadas,
        racha: estadisticas.racha,
        actualizado: new Date().toISOString()
    });
}

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('wdToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'wd-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2400);
}

function mostrarMensaje(texto, duracion = 1600) {
    const el = document.getElementById('wdMsg');
    if (!el) return;
    el.textContent = texto;
    el.classList.add('show');
    clearTimeout(msgTimeout);
    msgTimeout = setTimeout(() => el.classList.remove('show'), duracion);
}

// ============================================================
//  GRID
// ============================================================
function construirGrid() {
    const grid = document.getElementById('wdGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < LARGO * MAX_INTENTOS; i++) {
        const celda = document.createElement('div');
        celda.className = 'wd-celda';
        celda.dataset.idx = i;
        grid.appendChild(celda);
    }
}

function celdaDe(fila, col) {
    return document.querySelector(`.wd-celda[data-idx="${fila * LARGO + col}"]`);
}

function pintarCelda(fila, col, letra) {
    const c = celdaDe(fila, col);
    if (!c) return;
    if (letra) {
        c.textContent = letra;
        c.classList.add('llena');
        c.classList.remove('escribiendo');
        void c.offsetWidth;
        c.classList.add('escribiendo');
    } else {
        c.textContent = '';
        c.classList.remove('llena');
    }
}

// ============================================================
//  TECLADO
// ============================================================
const FILAS_TECLADO = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['ENTER','Z','X','C','V','B','N','M','BACK']
];

function construirTeclado() {
    const cont = document.getElementById('wdTeclado');
    if (!cont) return;
    cont.innerHTML = '';

    FILAS_TECLADO.forEach(fila => {
        const div = document.createElement('div');
        div.className = 'wd-teclado-fila';
        fila.forEach(k => {
            const btn = document.createElement('button');
            btn.className = 'wd-tecla';
            btn.dataset.tecla = k;
            if (k === 'ENTER' || k === 'BACK') {
                btn.classList.add('especial');
                if (k === 'ENTER') {
                    btn.innerHTML = '<span>ENVIAR</span>';
                } else {
                    btn.innerHTML = '<i data-lucide="delete"></i>';
                }
            } else {
                btn.textContent = k;
            }
            btn.addEventListener('click', () => manejarTecla(k));
            div.appendChild(btn);
        });
        cont.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
}

function actualizarTecla(letra, estado) {
    // Solo actualiza si el nuevo estado es mejor que el actual
    const orden = { correcta: 3, presente: 2, ausente: 1, '': 0 };
    const actual = letrasEstado[letra] || '';
    if (orden[estado] > orden[actual]) {
        letrasEstado[letra] = estado;
    }
    const btn = document.querySelector(`.wd-tecla[data-tecla="${letra}"]`);
    if (!btn) return;
    btn.classList.remove('correcta', 'presente', 'ausente');
    const estadoFinal = letrasEstado[letra];
    if (estadoFinal) btn.classList.add(estadoFinal);
}

// ============================================================
//  LÓGICA DEL JUEGO
// ============================================================
function elegirPalabra() {
    return PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
}

function nuevaPartida() {
    palabraSecreta = elegirPalabra();
    intentos = [];
    filaActual = 0;
    columnaActual = 0;
    juegoTerminado = false;
    letrasEstado = {};
    msgTimeout && clearTimeout(msgTimeout);

    // Limpiar grid
    document.querySelectorAll('.wd-celda').forEach(c => {
        c.className = 'wd-celda';
        c.textContent = '';
    });

    // Limpiar teclado
    document.querySelectorAll('.wd-tecla').forEach(b => {
        b.classList.remove('correcta', 'presente', 'ausente');
    });

    document.getElementById('wdOverlayFin').hidden = true;

    // Debug: descomenta para ver la palabra en consola
    // console.log('[Wordle] Palabra secreta:', palabraSecreta);
}

function manejarTecla(k) {
    if (juegoTerminado) return;

    if (k === 'ENTER') { enviarIntento(); return; }
    if (k === 'BACK')  { borrarLetra();   return; }
    if (/^[A-Z]$/.test(k)) escribirLetra(k);
}

function escribirLetra(letra) {
    if (columnaActual >= LARGO) return;
    pintarCelda(filaActual, columnaActual, letra);
    columnaActual++;
}

function borrarLetra() {
    if (columnaActual <= 0) return;
    columnaActual--;
    pintarCelda(filaActual, columnaActual, '');
}

function enviarIntento() {
    if (columnaActual < LARGO) {
        mostrarMensaje('Faltan letras');
        sacudirGrid();
        return;
    }

    // Armar la palabra
    let palabra = '';
    for (let i = 0; i < LARGO; i++) {
        const c = celdaDe(filaActual, i);
        palabra += (c.textContent || '').toUpperCase();
    }

    if (!SET_PALABRAS.has(palabra)) {
        mostrarMensaje('Palabra no válida');
        sacudirGrid();
        return;
    }

    intentos.push(palabra);
    colorearFila(filaActual, palabra);
    filaActual++;
    columnaActual = 0;

    // ¿Ganó?
    if (palabra === palabraSecreta) {
        juegoTerminado = true;
        setTimeout(() => alGanar(), 600);
        return;
    }

    // ¿Perdió?
    if (filaActual >= MAX_INTENTOS) {
        juegoTerminado = true;
        setTimeout(() => alPerder(), 600);
    }
}

function sacudirGrid() {
    const grid = document.getElementById('wdGrid');
    if (!grid) return;
    grid.classList.remove('shake');
    void grid.offsetWidth;
    grid.classList.add('shake');
}

function colorearFila(fila, palabra) {
    // Algoritmo de dos pasadas para letras repetidas
    const secreta = palabraSecreta.split('');
    const intento = palabra.split('');
    const resultado = new Array(LARGO).fill('ausente');
    const secretaUsada = new Array(LARGO).fill(false);

    // 1ª pasada: verdes
    for (let i = 0; i < LARGO; i++) {
        if (intento[i] === secreta[i]) {
            resultado[i] = 'correcta';
            secretaUsada[i] = true;
        }
    }
    // 2ª pasada: amarillos
    for (let i = 0; i < LARGO; i++) {
        if (resultado[i] === 'correcta') continue;
        for (let j = 0; j < LARGO; j++) {
            if (secretaUsada[j]) continue;
            if (intento[i] === secreta[j]) {
                resultado[i] = 'presente';
                secretaUsada[j] = true;
                break;
            }
        }
    }

    // Aplicar con animación flip escalonada
    for (let i = 0; i < LARGO; i++) {
        const c = celdaDe(fila, i);
        if (!c) continue;
        const estado = resultado[i];
        const letra = intento[i];
        setTimeout(() => {
            c.classList.add('revelando');
            setTimeout(() => {
                c.classList.remove('llena', 'escribiendo');
                c.classList.add(estado);
                actualizarTecla(letra, estado);
            }, 250);
            setTimeout(() => c.classList.remove('revelando'), 500);
        }, i * 120);
    }
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function alGanar() {
    // Animar celdas
    for (let i = 0; i < LARGO; i++) {
        const c = celdaDe(filaActual - 1, i);
        if (c) {
            setTimeout(() => c.classList.add('ganadora'), i * 90);
        }
    }

    // Actualizar stats
    estadisticas.ganadas++;
    estadisticas.racha++;
    guardarEstadisticas();
    renderStats();

    // Monedas
    otorgarMonedas();

    // Overlay
    const icono = document.getElementById('wdFinIcono');
    icono.className = 'wd-overlay-icono';
    icono.innerHTML = '<i data-lucide="trophy"></i>';
    document.getElementById('wdFinTitulo').textContent = '¡Ganaste!';
    document.getElementById('wdFinSubtitulo').textContent = mensajeVictoria(filaActual);
    document.getElementById('wdFinPalabra').textContent = palabraSecreta;
    document.getElementById('wdFinIntentos').textContent = `${filaActual}/${MAX_INTENTOS}`;
    document.getElementById('wdFinMonedasFila').hidden = false;
    document.getElementById('wdFinMonedas').textContent = `+${MONEDAS_VICTORIA}`;

    document.getElementById('wdOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    toast(`+${MONEDAS_VICTORIA} monedas`, 'success');
}

function alPerder() {
    estadisticas.racha = 0;
    guardarEstadisticas();
    renderStats();

    const icono = document.getElementById('wdFinIcono');
    icono.className = 'wd-overlay-icono perdiste';
    icono.innerHTML = '<i data-lucide="x"></i>';
    document.getElementById('wdFinTitulo').textContent = '¡Perdiste!';
    document.getElementById('wdFinSubtitulo').textContent = 'Vuelve a intentarlo con otra palabra.';
    document.getElementById('wdFinPalabra').textContent = palabraSecreta;
    document.getElementById('wdFinIntentos').textContent = `${MAX_INTENTOS}/${MAX_INTENTOS}`;
    document.getElementById('wdFinMonedasFila').hidden = true;

    document.getElementById('wdOverlayFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function mensajeVictoria(intentos) {
    if (intentos === 1) return '¡Increíble! A la primera.';
    if (intentos === 2) return '¡Brillante! Muy rápido.';
    if (intentos === 3) return '¡Excelente trabajo!';
    if (intentos === 4) return '¡Bien hecho!';
    if (intentos === 5) return '¡Casi! Lo lograste.';
    return '¡Salvado por poco!';
}

function otorgarMonedas() {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    Promise.resolve(api.canjear('type', APP_ID, 'Palabra adivinada', MONEDAS_VICTORIA))
        .catch(e => console.warn('[Wordle] No se pudieron dar monedas:', e));
}

// ============================================================
//  STATS
// ============================================================
function renderStats() {
    const g = document.getElementById('wdStatGanadas');
    const r = document.getElementById('wdStatRacha');
    if (g) g.textContent = estadisticas.ganadas;
    if (r) r.textContent = estadisticas.racha;
}

// ============================================================
//  INPUT FÍSICO
// ============================================================
function manejarKeydown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        manejarTecla('ENTER');
        return;
    }
    if (e.key === 'Backspace') {
        e.preventDefault();
        manejarTecla('BACK');
        return;
    }
    const k = e.key.toUpperCase();
    if (/^[A-Z]$/.test(k)) {
        e.preventDefault();
        manejarTecla(k);
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    // Usuario
    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    const badge = document.getElementById('wdUserBadge');
    if (badge) {
        badge.textContent = usuarioActual && usuarioActual.codigo
            ? `@${usuarioActual.codigo} · ${usuarioActual.nombre || ''}`
            : 'Invitado';
    }

    // Stats
    try { await cargarEstadisticas(); } catch (e) { /* silencioso */ }
    renderStats();

    // Estructura
    construirGrid();
    construirTeclado();

    // Eventos
    document.addEventListener('keydown', manejarKeydown);
    document.getElementById('wdBtnNueva')?.addEventListener('click', () => {
        if (!juegoTerminado && filaActual > 0) {
            if (!confirm('¿Empezar con otra palabra? Se pierde el progreso actual.')) return;
        }
        nuevaPartida();
    });
    document.getElementById('wdBtnJugarOtra')?.addEventListener('click', nuevaPartida);

    // Empezar
    nuevaPartida();

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
