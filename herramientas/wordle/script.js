// ============================================================
//  Wordle — Adivina la palabra de 5 letras
//  ------------------------------------------------------------
//  - 6 intentos por palabra.
//  - Se puede jugar cuantas veces se quiera.
//  - +25 monedas por cada palabra descubierta.
//  - Estadísticas (ganadas + racha) persisten por usuario
//    en IndexedDB.
//  - Diccionario propio en español (sin tildes ni Ñ).
//  - SOLO palabras de 5 letras (verificado con regex).
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
//  ~500 palabras comunes de 5 letras en español.
//  Todas sin tildes ni Ñ, en mayúsculas.
// ============================================================
const PALABRAS_BRUTAS = [
    // A
    'ABONO','ABRIR','ABUSO','ACASO','ACERO','ACIDO','ACOSO','ADIOS','AGUJA','AHORA',
    'AJENO','ALBUM','ALDEA','ALEJA','ALETA','ALGUN','ALTAR','AMBAS','AMIGO','ANCHO',
    'ANDAR','ANGEL','ANEXO','ANIMO','APODO','APOYO','ARBOL','ARDER','ARENA','ARMAR',
    'ARROZ','ASADO','ASILO','ASTRO','ATOMO','ATLAS','AUTOR','AVISO','AZOTE',
    // B
    'BACHE','BAGRE','BAJAR','BANCO','BANDO','BARBA','BARCO','BASTA','BATEA','BAZAR',
    'BEBER','BELLO','BEODO','BESAR','BICHO','BINGO','BIRRA','BIZCO','BLUSA','BOCAL',
    'BODAS','BOGAR','BOLSA','BOLSO','BOMBA','BONGO','BORDE','BOTAR','BOTON','BRAZO',
    'BREVE','BRISA','BRUJA','BRUMA','BUCLE','BUENO','BULTO','BUQUE','BURLA','BURRO',
    // C
    'CABRA','CABLE','CACAO','CACHO','CAFRE','CAIDA','CAJON','CALMA','CALOR','CALLE',
    'CALVO','CAMPO','CANAL','CANOA','CANTO','CAPAZ','CARGA','CARGO','CARNE','CARPA',
    'CARRO','CARTA','CASCO','CASPA','CASTA','CAUSA','CAVAR','CAZAR','CEBRA','CEDER',
    'CEJAS','CELDA','CENAR','CEPAS','CERCA','CERDO','CESAR','CHAPA','CHICA','CHICO',
    'CHILE','CHINO','CHIVO','CHOZA','CHULO','CICLO','CIELO','CIEGO','CIFRA','CINCO',
    'CIRCO','CIRIO','CLARO','CLASE','CLERO','CLIMA','COBAS','COBRA','COBRO','COCER',
    'COCHE','COFIA','COFRE','COGER','COITO','COLAR','COLMO','COLOR','COMBO','COMER',
    'COMUN','CONDE','CONGA','COPIA','CORAL','CORTE','CORTO','COSER','COSTA','CREER',
    'CREMA','CREDO','CROMO','CRUCE','CRUDO','CRUEL','CUERO','CULPA','CUNAS','CUOTA',
    'CURAR','CURVA',
    // D
    'DANZA','DARDO','DATIL','DATOS','DEBER','DEBUT','DECIR','DEDOS','DEJAR','DELTA',
    'DESDE','DESEO','DEUDA','DICHA','DICHO','DIETA','DINGO','DIOSA','DISCO','DIVAN',
    'DOBLE','DOGMA','DOLER','DOLOR','DOMAR','DONAR','DONDE','DOPAR','DORAR','DORSO',
    'DOSIS','DOTAR','DRAMA','DUCHA','DUDAR','DUELO','DULCE','DUPLA','DUQUE','DURAR',
    // E
    'ECHAR','EDITO','EJIDO','ELEVO','ENANO','ENCIA','ENEMA','ENERO','ENVES','ENVIO',
    'ERRAR','ERROR','ESPIA','ESTAR','ETICA','EXITO','EXTRA',
    // F
    'FACIL','FAENA','FALDA','FALSA','FALSO','FALTA','FANGO','FAROL','FATAL','FAUNA',
    'FAVOR','FECHA','FELIZ','FEMUR','FERIA','FEROZ','FIBRA','FICHA','FIERA','FIJAR',
    'FINAL','FINCA','FIRMA','FIRME','FLACO','FLAMA','FLECO','FLEMA','FLETE','FLORA',
    'FLOTA','FLOTE','FLUIR','FOBIA','FOCAS','FOLIO','FONDO','FORJA','FORMA','FORRO',
    'FOSIL','FRASE','FRENO','FRESA','FRITO','FRUTA','FRUTO','FUEGO','FUERA','FUMAR',
    'FURIA','FUROR',
    // G
    'GAFAS','GALAN','GALLO','GAMBA','GANAR','GANSO','GARBO','GARRA','GARZA','GASTO',
    'GEMIR','GENIO','GENTE','GESTA','GESTO','GIRAR','GLOBO','GOLPE','GORDO','GORRA',
    'GOZAR','GRADO','GRANO','GRASA','GRAVE','GRIFO','GRITO','GRUPO','GUAPO','GUION',
    'GUSTO',
    // H
    'HABER','HACHA','HACER','HARTO','HASTA','HECHO','HELIO','HEROE','HIELO','HIMNO',
    'HOGAR','HONDO','HONGO','HONOR','HORCA','HORNO','HOTEL','HUECO','HUESO','HUEVO',
    'HUIDA','HUMOR','HURTO',
    // I
    'IDEAL','IDOLO','IGUAL','IMPAR','INDIO',
    // J
    'JABON','JAMON','JARRA','JASPE','JAULA','JERGA','JOVEN','JUDIA','JUGAR','JUNIO',
    'JUNTA','JUNTO','JURAR','JUSTO',
    // L
    'LABIO','LABOR','LACRA','LAMER','LANCE','LANZA','LAPIZ','LARGO','LARVA','LASER',
    'LAVAR','LECHE','LECHO','LEGAL','LEJOS','LENTE','LENTO','LEPRA','LETAL','LETRA',
    'LIBRA','LIBRE','LIBRO','LICOR','LIDER','LIMBO','LIMON','LINDO','LINEA','LIRIO',
    'LIRON','LISTA','LISTO','LITIO','LITRO','LLAVE','LLAMA','LLENO','LOBOS','LOGRO',
    'LONJA','LUCHA','LUCIR','LUEGO','LUGAR','LUNES',
    // M
    'MACHO','MADRE','MAGIA','MAGMA','MANGO','MANIA','MANSO','MANTA','MARCA','MAREA',
    'MAYOR','MECHA','MEDIA','MEDIO','MEJOR','MELON','MENOR','MENOS','MENTA','MENTE',
    'MERMA','MESON','METAL','METER','MIEDO','MILLA','MIRAR','MISIL','MISMA','MISMO',
    'MITAD','MOLDE','MOMIA','MONJA','MONJE','MONTE','MORAL','MORIR','MOSCA','MOTIN',
    'MOTOR','MOVER','MUCHO','MUELA','MUJER','MUNDO','MUSEO','MUSGO','MUSLO','MUTUO',
    // N
    'NACER','NADAR','NAIPE','NARIZ','NATAL','NAVAL','NEGAR','NEGRO','NEVAR','NIETO',
    'NIEVE','NIVEL','NOBLE','NOCHE','NORTE','NOTAR','NOVIO','NUEVE','NUEVO','NUNCA',
    // O
    'OBVIO','OCASO','OESTE','OJALA','OLIVO','OPACO','OPERA','OPTAR','ORDEN','OREJA',
    'ORINA','ORUGA','OVEJA','OVULO',
    // P
    'PADRE','PAGAR','PALMA','PANAL','PANDA','PANEL','PANZA','PAPEL','PARAR','PARED',
    'PARIR','PARRA','PARTE','PASAR','PASTA','PASTO','PATIO','PAUSA','PECHO','PEDIR',
    'PEGAR','PEINE','PERLA','PERRO','PESCA','PIANO','PICAR','PIEZA','PINTA','PINZA',
    'PISTA','PITAR','PLACA','PLANO','PLATA','PLAYA','PLAZA','PLENO','PLOMO','PLUMA',
    'POBRE','PODER','PODIO','POEMA','POLEN','POLVO','POLLO','PONER','PORNO','PORTE',
    'POSTE','PRESO','PRIMA','PRISA','PROSA','PULPO','PULSO','PUNTA','PUNTO',
    // Q
    'QUEJA','QUEMA','QUESO','QUIEN',
    // R
    'RADAR','RADIO','RAPAZ','RASGO','RATON','RAZON','RECTA','REGAR','REGIO','REINA',
    'RELOJ','REMAR','RENTA','RESTO','RETAR','REVES','REZAR','RIEGO','RISCO','RITMO',
    'RIVAL','ROBAR','ROBLE','ROBOT','RODAR','RODEO','ROLLO','ROMBO','RONDA','ROSCA',
    'ROTAR','RUBIO','RUEDA','RUEGO','RUIDO','RUINA','RUMBO','RUMOR',
    // S
    'SABER','SABIO','SABLE','SABOR','SACAR','SACRO','SAETA','SALIR','SALON','SALSA',
    'SALTO','SALUD','SANAR','SANTO','SECAR','SELVA','SELLO','SENDA','SERIE','SERIO',
    'SIGLO','SIGNO','SILLA','SITIO','SOBRE','SOCIO','SOLAR','SONAR','SORDO','SUAVE',
    'SUBIR','SUCIO','SUDAR','SUDOR','SUELO','SUMAR','SUPER','SUSTO','SUTIL',
    // T
    'TABLA','TALLA','TALLE','TALLO','TALON','TAMIZ','TAPIA','TAPIZ','TARDE','TARRO',
    'TARTA','TECHO','TECLA','TEJER','TELAR','TEMOR','TENAZ','TENIS','TERCO','TERMO',
    'TESIS','TESTA','TIBIO','TIENE','TIGRE','TINTA','TIRAR','TITAN','TOCAR','TOLDO',
    'TOMAR','TONTO','TOQUE','TORPE','TORRE','TORTA','TOSER','TOTAL','TRAGO','TRAJE',
    'TRAPO','TRATO','TRECE','TRIBU','TRIGO','TRINO','TRONO','TROPA','TROZO','TRUCO',
    'TUMBA','TUNEL','TURNO','TUTOR',
    // U
    'UNICO','USADO',
    // V
    'VACIO','VAGAR','VAINA','VALLE','VALOR','VAPOR','VARON','VASTO','VELOZ','VENDA',
    'VENIR','VENTA','VERBO','VERDE','VERSO','VIAJE','VIGOR','VILLA','VIUDA','VISTA',
    'VISTO','VITAL','VOCAL','VOLAR','VOTAR','VUELO'
];

// ------------------------------------------------------------
//  FILTRO DE SEGURIDAD
//  Descarta cualquier palabra que no tenga EXACTAMENTE 5 letras
//  de la A a la Z (sin tildes, sin Ñ, sin espacios).
// ------------------------------------------------------------
const PALABRAS = PALABRAS_BRUTAS.filter(p =>
    typeof p === 'string' && /^[A-Z]{5}$/.test(p)
);

// Set para validación rápida
const SET_PALABRAS = new Set(PALABRAS);

// Sanity check en consola
console.log(`[Wordle] Diccionario cargado: ${PALABRAS.length} palabras válidas de 5 letras.`);

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
    // Doble verificación: la palabra secreta SIEMPRE debe tener 5 letras A-Z
    let intentosSeguridad = 0;
    let p;
    do {
        p = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
        intentosSeguridad++;
        if (intentosSeguridad > 50) return 'AMIGO'; // fallback imposible de fallar
    } while (!p || p.length !== LARGO || !/^[A-Z]+$/.test(p));
    return p;
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

    const overlay = document.getElementById('wdOverlayFin');
    if (overlay) overlay.hidden = true;

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

    // Validación extra: la palabra debe tener 5 letras y estar en el diccionario
    if (palabra.length !== LARGO || !/^[A-Z]{5}$/.test(palabra) || !SET_PALABRAS.has(palabra)) {
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
    if (icono) {
        icono.className = 'wd-overlay-icono';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
    }
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
    if (icono) {
        icono.className = 'wd-overlay-icono perdiste';
        icono.innerHTML = '<i data-lucide="x"></i>';
    }
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
