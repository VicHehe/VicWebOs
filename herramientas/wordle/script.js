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
    // ================= A =================
    'ABONO','ABRIL','ABRIR','ABUSO','ACASO','ACERA','ACERO','ACIDA','ACIDO','ACOSO',
    'ACTOR','ACTOS','ADIOS','AFANO','AGUJA','AGUDO','AHORA','AIRES','AJENO','AJUSTE',
    'ALBUM','ALDEA','ALERO','ALETA','ALFIL','ALGAS','ALGUN','ALTAR','ALTOS','AMADA',
    'AMADO','AMAGO','AMBAS','AMIGO','ANCLA','ANCHO','ANDAR','ANDEN','ANEJO','ANEXO',
    'ANGEL','ANIMO','ANOTA','ANTES','ANUAL','APICE','APODO','APOYO','APTOS','ARADO',
    'ARBOL','ARDER','ARENA','AREAS','ARMAR','ARMAS','ARNES','ARPON','ARROZ','ASADO',
    'ASILO','ASTRO','ATAJO','ATADO','ATLAS','ATOMO','ATROZ','AUTOR','AVENA','AVION',
    'AVISO','AZOTE',

    // ================= B =================
    'BACHE','BAGRE','BAILE','BAJAR','BALON','BANCO','BANDA','BANDO','BANJO','BARBA',
    'BARCO','BARRA','BASTA','BATEA','BATIR','BAZAR','BEBER','BELLO','BEODO','BESAR',
    'BESOS','BICHO','BINGO','BIRRA','BIZCO','BLUSA','BOBOS','BOCAL','BODAS','BOGAR',
    'BOLSA','BOLSO','BOMBA','BONGO','BORDA','BORDE','BORLA','BOTAR','BOTAS','BOTIN',
    'BOTON','BRAVO','BRAZO','BREVE','BRISA','BROMA','BROTE','BRUJA','BRUMA','BUCLE',
    'BUCEO','BUENO','BULTO','BUQUE','BURLA','BURRO','BUSES','BUSTO',

    // ================= C =================
    'CABAL','CABER','CABRA','CABLE','CACAO','CACHO','CAFES','CAFRE','CAIDA','CAJON',
    'CALDO','CALIZ','CALMA','CALOR','CALLE','CALVO','CAMAS','CAMPO','CANAL','CANJE',
    'CANOA','CANTO','CAOBA','CAPAS','CAPAZ','CARAY','CARGA','CARGO','CARNE','CARPA',
    'CARRO','CARTA','CASAR','CASCO','CASOS','CASPA','CASTA','CASTO','CATRE','CAUCE',
    'CAUSA','CAVAR','CAZAR','CEBRA','CEDRO','CEDER','CEGAR','CEIBA','CEJAS','CELDA',
    'CELOS','CENAR','CENSO','CEPAS','CERAS','CERCA','CERCO','CERDO','CESAR','CETRO',
    'CHAPA','CHICA','CHICO','CHILE','CHINO','CHIVO','CHOZA','CHULO','CICLO','CIELO',
    'CIEGO','CIFRA','CINCO','CINTA','CIRCO','CIRIO','CISNE','CITAR','CLARA','CLARO',
    'CLASE','CLAVO','CLERO','CLIMA','COBAS','COBRA','COBRO','COCER','COCHE','CODOS',
    'COFIA','COFRE','COGER','COITO','COJIN','COLAR','COLMO','COLON','COLOR','COMBO',
    'COMER','COMUN','CONDE','CONGA','CONOS','COPIA','CORAL','CORTE','CORTO','COSER',
    'COSTA','CREER','CREMA','CREDO','CROMO','CRUCE','CRUDO','CRUEL','CUERO','CUEVA',
    'CULPA','CULTO','CUNAS','CUOTA','CUPON','CURAR','CURSO','CURVA',

    // ================= D =================
    'DANZA','DARDO','DATIL','DATOS','DEBER','DEBIL','DEBUT','DECIR','DEDOS','DEJAR',
    'DELTA','DEMAS','DESDE','DESEO','DEUDA','DICEN','DICHA','DICHO','DIETA','DINGO',
    'DIOSA','DIQUE','DISCO','DIVAN','DOBLE','DOCTO','DOGMA','DOLER','DOLOR','DOMAR',
    'DONAR','DONDE','DOPAR','DORAR','DORSO','DOSIS','DOTAR','DRAMA','DUCHA','DUDAR',
    'DUELE','DUELO','DULCE','DUPLA','DUQUE','DURAR',

    // ================= E =================
    'EBANO','ECHAR','EDITO','EJIDO','ELEVO','ELITE','ELOTE','ENANO','ENCIA','ENEMA',
    'ENERO','ENVES','ENVIO','ERRAR','ERROR','ESPIA','ESTAR','ETICA','ETNIA','EXITO',
    'EXTRA',

    // ================= F =================
    'FACIL','FAENA','FALDA','FALLO','FALSA','FALSO','FALTA','FANGO','FAROL','FARSA',
    'FASES','FATAL','FAUNA','FAVOR','FECHA','FELIZ','FEMUR','FERAZ','FERIA','FEROZ',
    'FIADO','FIBRA','FICHA','FIERA','FIJAR','FILAS','FILME','FILOS','FINAL','FINCA',
    'FINES','FIRMA','FIRME','FLACO','FLAMA','FLECO','FLEMA','FLETE','FLORA','FLOTA',
    'FLOTE','FLUIR','FOBIA','FOCAS','FOGON','FOLIO','FONDO','FORJA','FORMA','FORRO',
    'FOSIL','FRASE','FRENO','FRESA','FRITO','FRUTA','FRUTO','FUEGO','FUERA','FUMAR',
    'FUNDA','FURIA','FUROR',

    // ================= G =================
    'GAFAS','GALAN','GALGO','GALLO','GALON','GAMBA','GANAR','GANSO','GARBO','GARRA',
    'GARZA','GASTO','GEMIR','GENES','GENIO','GENTE','GESTA','GESTO','GIRAR','GLOBO',
    'GOLFO','GOLPE','GOMAS','GORDO','GORRA','GOZAR','GRADO','GRANO','GRASA','GRAVE',
    'GRIFO','GRIPE','GRITO','GRUPO','GUAPO','GUION','GUSTO',

    // ================= H =================
    'HABER','HACHA','HACER','HARTO','HASTA','HECHO','HELIO','HEROE','HIELO','HIMNO',
    'HOGAR','HOJAS','HONDO','HONGO','HONOR','HORAS','HORCA','HORNO','HOTEL','HUECO',
    'HUESO','HUEVO','HUIDA','HUMOR','HURTO',

    // ================= I =================
    'IDEAL','IDOLO','IGUAL','IMPAR','INDIO','ISLAS',

    // ================= J =================
    'JABON','JALEA','JAMON','JARRA','JASPE','JAULA','JERGA','JOVEN','JOYAS','JUDIA',
    'JUEGO','JUGAR','JULIO','JUNIO','JUNTA','JUNTO','JURAR','JUSTO',

    // ================= L =================
    'LABIO','LABOR','LACRA','LAGOS','LAMER','LANCE','LANAS','LANZA','LAPIZ','LARGA',
    'LARGO','LARVA','LASER','LATAS','LATIN','LAVAR','LECHE','LECHO','LEGAL','LEJOS',
    'LENTE','LENTO','LEONA','LEPRA','LETAL','LETRA','LEYES','LIBRA','LIBRE','LIBRO',
    'LICOR','LIDER','LIGAS','LIMBO','LIMON','LINDA','LINDO','LINEA','LIRIO','LIRON',
    'LISTA','LISTO','LITIO','LITRO','LLANO','LLAVE','LLAMA','LLENO','LOBOS','LOCOS',
    'LOGRO','LONJA','LOROS','LUCHA','LUCES','LUCIR','LUEGO','LUGAR','LUJOS','LUNAR',
    'LUNES',

    // ================= M =================
    'MACHO','MADRE','MAGIA','MAGMA','MAGRO','MANGA','MANGO','MANIA','MANOS','MANSO',
    'MANTA','MARCA','MAREA','MASAS','MATAR','MATIZ','MAYOR','MAYOS','MECHA','MEDIA',
    'MEDIO','MEDIR','MEJOR','MELON','MENOR','MENOS','MENTA','MENTE','MERMA','MESON',
    'METAL','METER','METRO','MIEDO','MILLA','MINAS','MIRAR','MISIL','MISMA','MISMO',
    'MITAD','MOJAR','MOLDE','MOMIA','MONJA','MONJE','MONTE','MORAL','MORIR','MOSCA',
    'MOTIN','MOTOR','MOVER','MUCHO','MUDAR','MUELA','MUJER','MULAS','MUNDO','MURAL',
    'MUROS','MUSEO','MUSGO','MUSLO','MUTUO',

    // ================= N =================
    'NACER','NADAR','NAIPE','NARIZ','NATAL','NAVAL','NECIO','NEGAR','NEGRO','NENAS',
    'NEVAR','NICHO','NIDOS','NIETA','NIETO','NIEVE','NIVEL','NOBLE','NOCHE','NOGAL',
    'NORTE','NOTAR','NOVIO','NUBES','NUDOS','NUERA','NUEVA','NUEVE','NUEVO','NUNCA',

    // ================= O =================
    'OBRAR','OBRAS','OBVIO','OCASO','ODIAR','OESTE','OIDOS','OJALA','OLIVO','OLLAS',
    'ONDAS','OPACO','OPERA','OPTAR','ORDEN','OREJA','ORINA','ORUGA','OTROS','OVEJA',
    'OVULO',

    // ================= P =================
    'PACTO','PADRE','PAGAR','PALMA','PALOS','PANAL','PANDA','PANEL','PANES','PANZA',
    'PAPAS','PAPEL','PARAR','PARDO','PARED','PARIR','PARRA','PARTE','PASAR','PASOS',
    'PASTA','PASTO','PATIO','PAUSA','PAVOR','PECHO','PECES','PEDAL','PEDIR','PEGAR',
    'PEINE','PELAR','PELEA','PELOS','PENAL','PERAS','PERLA','PERRO','PESCA','PESOS',
    'PIANO','PICAR','PIEZA','PILAS','PINOS','PINTA','PINZA','PIPAS','PISTA','PISOS',
    'PITAR','PLACA','PLANO','PLATA','PLAYA','PLAZA','PLENO','PLOMO','PLUMA','POBRE',
    'PODAR','PODER','PODIO','POEMA','POLEN','POLVO','POLLO','PONER','PORNO','PORTE',
    'POSTE','POTRO','POZOS','PRADO','PRESO','PRIMA','PRISA','PROSA','PUDOR','PULPO',
    'PULSO','PUNTA','PUNTO','PURAS','PUROS',

    // ================= Q =================
    'QUEJA','QUEMA','QUESO','QUIEN','QUIZA',

    // ================= R =================
    'RABIA','RADAR','RADIO','RAMAS','RAMOS','RANAS','RAPAZ','RASGO','RATAS','RATON',
    'RATOS','RAYAS','RAYOS','RAZON','RECTA','REDES','REGAR','REGIO','REGLA','REINA',
    'REJAS','RELOJ','REMAR','REMOS','RENOS','RENTA','RESTO','RETAR','RETOS','REUMA',
    'REVES','REZAR','RICOS','RIEGO','RIFAS','RIGOR','RIMAS','RISAS','RISCO','RITMO',
    'RIVAL','RIZOS','ROBAR','ROBLE','ROBOT','ROCAS','RODAR','RODEO','ROJOS','ROLLO',
    'ROMBO','RONDA','ROPAS','ROSCA','ROSAS','ROTAR','ROTOS','RUBIO','RUBOR','RUEDA',
    'RUEGO','RUIDO','RUINA','RUMBO','RUMOR','RURAL','RUTAS',

    // ================= S =================
    'SABER','SABIO','SABLE','SABOR','SACAR','SACOS','SACRO','SAETA','SALAS','SALDO',
    'SALIR','SALMO','SALON','SALSA','SALTO','SALUD','SALVA','SALVO','SANAR','SANAS',
    'SANOS','SANTO','SECAR','SEDAS','SELVA','SELLO','SENDA','SERES','SERIE','SERIO',
    'SIGLO','SIGNO','SILLA','SISMO','SITIO','SOBRE','SOCIO','SODIO','SOLAR','SOLOS',
    'SONAR','SOPAS','SOPLO','SORBO','SORDO','SUAVE','SUBIR','SUCIO','SUDAR','SUDOR',
    'SUELO','SUMAR','SUPER','SURCO','SUSTO','SUTIL',

    // ================= T =================
    'TABLA','TACOS','TACTO','TALLA','TALLE','TALLO','TALON','TAMIZ','TANGO','TAPAS',
    'TAPIA','TAPIZ','TAPON','TARDE','TAREA','TARRO','TARTA','TASAS','TAZAS','TECHO',
    'TECLA','TEJER','TELAR','TELAS','TEMAS','TEMOR','TENAZ','TENIS','TENOR','TERCO',
    'TERMO','TESIS','TESTA','TIBIO','TIENE','TIFON','TIGRE','TINTA','TIRAR','TIROS',
    'TITAN','TIZAS','TOCAR','TODOS','TOLDO','TOMAR','TONEL','TONOS','TONTO','TOQUE',
    'TORNO','TOROS','TORPE','TORRE','TORTA','TOSER','TOTAL','TRAGO','TRAJE','TRAMO',
    'TRAPO','TRATO','TRAZO','TRECE','TRIBU','TRIGO','TRINO','TRONO','TROPA','TROZO',
    'TRUCO','TUMBA','TUNEL','TURNO','TUTOR',

    // ================= U =================
    'UNICA','UNICO','UNIDO','UNTAR','URGIR','USADO','USTED',

    // ================= V =================
    'VACAS','VACIA','VACIO','VAGAR','VAGON','VAINA','VALLE','VALOR','VAMOS','VAPOR',
    'VARIA','VARIO','VARON','VASOS','VASTO','VEGAS','VELAS','VELOZ','VENDA','VENIR',
    'VENTA','VERBO','VERDE','VERSO','VIAJE','VIDAS','VIDEO','VIGAS','VIGOR','VILLA',
    'VINOS','VISTA','VISTO','VITAL','VIUDA','VIVOS','VOCAL','VOCES','VOLAR','VOTAR',
    'VOTOS','VUELO'
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
