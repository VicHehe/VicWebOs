// ============================================================
//  Widget: Generador de Nombres v2
//  ------------------------------------------------------------
//  Motor híbrido:
//    1. Banco de sílabas reales extraídas de nombres hispanos.
//    2. Cadenas de Markov (bigramas) entrenadas con esos nombres.
//    3. Reglas fonotácticas estrictas de español.
//
//  Esto produce nombres como "Nicolás", "Amaro", "Cassie" o
//  "Haruko" con naturalidad, no cosas como "Bliadrolie".
//
//  SIN persistencia.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  BANCO DE NOMBRES DE ENTRENAMIENTO
//  ------------------------------------------------------------
//  Nombres reales (hispanos + algunos anglo/japoneses comunes)
//  que el motor usa para aprender transiciones de sílabas.
//  Cuantos más nombres, mejor la calidad de salida.
// ============================================================
const NOMBRES_ENTRENAMIENTO = {
    latino: [
        'nicolas','nicol','nicolas','amaro','antonio','jose','juan','manuel',
        'francisco','luis','javier','miguel','angel','carlos','jesus','david',
        'pedro','alejandro','fernando','sergio','ricardo','eduardo','roberto',
        'daniel','pablo','andres','adrian','diego','rafael','gonzalo','tomas',
        'martin','agustin','felipe','ignacio','matias','sebastian','cristobal',
        'valentina','camila','isidora','josefa','florencia','martina','catalina',
        'antonia','javiera','emilia','sofia','lucia','maria','carmen','paula',
        'andrea','daniela','gabriela','valeria','fernanda','constanza','trinidad',
        'magdalena','rosario','esperanza','soledad','amparo','dolores','pilar',
        'ramiro','gonzalo','mauricio','rodrigo','fabricio','leonardo','marcelo',
        'octavio','tomas','santiago','benjamin','joaquin','maximiliano','lucas',
        'mateo','tomas','vicente','renato','bruno','alonso','bastian'
    ],
    japones: [
        'haruko','kasumi','tomoe','ryu','ryuu','haruki','takeshi','kenta',
        'yuki','sakura','aiko','kenji','hiroshi','takumi','daisuke','yumi',
        'akira','naomi','keiko','michiko','yoko','hana','ren','sora','hikari',
        'kaito','riku','sota','yuto','daiki','ryota','kazuya','shinji',
        'asuka','mio','saki','mei','yuna','hina','rin','kaede','tsubaki',
        'ayame','fuyuko','hotaru','kaoru','midori','natsuki','sakiko'
    ],
    anglo: [
        'jimmy','tommy','andy','charlie','bobby','danny','eddie','freddy',
        'harry','jack','jake','james','john','kevin','luke','mark','mike',
        'nick','paul','peter','rick','rob','sam','steve','tim','tom','will',
        'cassie','rosie','maggie','ellie','katie','lily','lucy','molly',
        'nancy','penny','polly','sally','sophie','annie','betty','daisy',
        'emily','grace','hannah','isabel','jane','kelly','laura','megan'
    ],
    fantasia: [
        'aelin','aelric','bran','cass','dorian','elara','fen','garrick',
        'hale','iris','jax','kael','lyra','mira','nox','orion','pax',
        'quinn','raven','sable','thane','ulric','vesper','wren','xander',
        'yara','zephyr','alric','briar','cedric','draven','elara','faelan',
        'gideon','harlow','imre','jarek','kiran','lorcan','maeve','niamh',
        'orla','peregrine','rowan','seraphina','tarian','ulric','vanya'
    ]
};

// ============================================================
//  REGLAS FONOTÁCTICAS DEL ESPAÑOL
//  ------------------------------------------------------------
//  Restricciones basadas en la estructura silábica real:
//    - CV 51.2%, CVC 20.6%, V 9.5%, VC 5.8%, CCV 4.6%[reference:2]
//  Los clusters "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl",
//  "gr", "pl", "pr", "tr" existen pero son infrecuentes.
// ============================================================

// Onsets simples (más frecuentes)
const ONSETS_SIMPLES = ['b','c','d','f','g','j','l','m','n','p','r','s','t','v','y','z'];

// Onsets compuestos válidos en español (plosiva/f + líquida)
const ONSETS_COMPUESTOS = ['bl','br','cl','cr','dr','fl','fr','gl','gr','pl','pr','tr'];

// Vocales simples
const VOCALES = ['a','e','i','o','u'];

// Diptongos comunes
const DIPTONGOS = ['ia','ie','io','ua','ue','ai','ei','oi','au','eu','ou','iu','ui'];

// Codas frecuentes en nombres (mucho más restrictivo que antes)
const CODAS = ['', '', '', 'n', 'r', 's', 'l', 'd'];

// Terminaciones muy comunes en nombres hispanos
const TERMINACIONES_MASC = ['o', 'el', 'in', 'on', 'an', 'io', 'iel', 'er'];
const TERMINACIONES_FEM  = ['a', 'ia', 'ina', 'ela', 'ita', 'ora', 'ana', 'ia'];

// ============================================================
//  MOTOR DE CADENAS DE MARKOV
//  ------------------------------------------------------------
//  Aprende las transiciones entre sílabas a partir de los
//  nombres de entrenamiento.
// ============================================================
let modeloMarkov = {};

function construirModeloMarkov(nombres) {
    const modelo = {};
    for (const nombre of nombres) {
        const silabas = silabificar(nombre);
        for (let i = 0; i < silabas.length; i++) {
            const actual = silabas[i];
            const siguiente = silabas[i + 1] || '__FIN__';
            if (!modelo[actual]) modelo[actual] = {};
            modelo[actual][siguiente] = (modelo[actual][siguiente] || 0) + 1;
        }
        // También registrar el inicio
        const inicio = silabas[0];
        if (!modelo['__INICIO__']) modelo['__INICIO__'] = {};
        modelo['__INICIO__'][inicio] = (modelo['__INICIO__'][inicio] || 0) + 1;
    }
    return modelo;
}

// Silabificador simple (no perfecto, pero suficiente para el modelo)
function silabificar(palabra) {
    const silabas = [];
    let actual = '';
    const vocales = 'aeiouáéíóúü';
    const palabraLower = palabra.toLowerCase();

    for (let i = 0; i < palabraLower.length; i++) {
        const c = palabraLower[i];
        actual += c;
        const esVocal = vocales.includes(c);
        const sigEsConsonante = i + 1 < palabraLower.length && !vocales.includes(palabraLower[i + 1]);
        const sigEsVocal = i + 1 < palabraLower.length && vocales.includes(palabraLower[i + 1]);

        // Regla simple: cortar después de una vocal si la siguiente es consonante
        if (esVocal && (sigEsConsonante || i === palabraLower.length - 1)) {
            // No cortar si es un diptongo
            if (i + 1 < palabraLower.length && vocales.includes(palabraLower[i + 1])) {
                continue;
            }
            silabas.push(actual);
            actual = '';
        }
    }
    if (actual) silabas.push(actual);
    return silabas.length ? silabas : [palabraLower];
}

// Elegir la siguiente sílaba según el modelo de Markov
function elegirSiguienteMarkov(silabaActual, modelo) {
    const opciones = modelo[silabaActual];
    if (!opciones) return null;
    const total = Object.values(opciones).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [sig, peso] of Object.entries(opciones)) {
        r -= peso;
        if (r <= 0) return sig;
    }
    return Object.keys(opciones)[0];
}

// ============================================================
//  GENERADOR HÍBRIDO
//  ------------------------------------------------------------
//  Estrategia:
//    1. Elegir un inicio con Markov (transiciones aprendidas).
//    2. Seguir generando sílabas con Markov hasta llegar a FIN.
//    3. Validar fonotácticamente y regenerar si es feo.
//    4. Ajustar la terminación según el género elegido.
// ============================================================
function generarNombreMarkov(estiloId, genero, intento = 0) {
    if (intento > 20) return generarNombreFallback(genero);

    const nombres = NOMBRES_ENTRENAMIENTO[estiloId] || NOMBRES_ENTRENAMIENTO.latino;
    const modelo = construirModeloMarkov(nombres);

    // Construir nombre sílaba a sílaba con Markov
    let silabas = [];
    let actual = '__INICIO__';
    const maxSilabas = 4;

    for (let i = 0; i < maxSilabas; i++) {
        const sig = elegirSiguienteMarkov(actual, modelo);
        if (!sig || sig === '__FIN__') break;
        silabas.push(sig);
        actual = sig;
    }

    if (silabas.length === 0) return generarNombreMarkov(estiloId, genero, intento + 1);

    // Ajustar terminación según género
    if (genero === 'masc') {
        const ultima = silabas[silabas.length - 1];
        // Reemplazar terminación femenina por masculina común
        if (/a$/.test(ultima) && silabas.length > 1) {
            silabas[silabas.length - 1] = ultima.slice(0, -1) + 'o';
        }
    } else if (genero === 'fem') {
        const ultima = silabas[silabas.length - 1];
        if (/o$/.test(ultima) && silabas.length > 1) {
            silabas[silabas.length - 1] = ultima.slice(0, -1) + 'a';
        }
    }

    let nombre = silabas.join('');

    // Validaciones
    if (nombre.length < 3) return generarNombreMarkov(estiloId, genero, intento + 1);
    if (esNombreFeo(nombre)) return generarNombreMarkov(estiloId, genero, intento + 1);

    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// Fallback si Markov falla muchas veces
function generarNombreFallback(genero) {
    const onsets = ONSETS_SIMPLES;
    const terminaciones = genero === 'fem' ? TERMINACIONES_FEM : TERMINACIONES_MASC;
    const onset = pick(onsets);
    const vocal = pick(VOCALES);
    const coda = pick(['n', 'r', 's', 'l']);
    const term = pick(terminaciones);
    let nombre = onset + vocal + coda + term;
    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// ============================================================
//  VALIDACIÓN FONOTÁCTICA
//  ------------------------------------------------------------
//  Detecta nombres visual o fonéticamente feos:
//    - 3+ vocales iguales seguidas
//    - "quu", "guu" (imposibles)
//    - 4+ vocales seguidas
//    - 4+ consonantes seguidas
//    - Clusters imposibles (bl+dr, etc.)
//    - Sílabas repetidas
// ============================================================
function esNombreFeo(nombre) {
    const n = String(nombre).toLowerCase();

    if (/([aeiou])\1{2,}/.test(n)) return true;        // aaa, eee
    if (/quu|guu/.test(n)) return true;
    if (/[aeiou]{4,}/.test(n)) return true;            // 4+ vocales
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(n)) return true;  // 4+ consonantes

    // Clusters consonánticos imposibles en español
    if (/(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr){2,}/.test(n)) return true;

    // Sílabas repetidas 3 veces
    if (/(.{2,3})\1{2,}/.test(n)) return true;

    return false;
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
//  ESTADO
// ============================================================
let estiloActual = 'latino';
let generoActual = 'ambos';

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
//  UI
// ============================================================
function nuevoNombre() {
    const el = document.getElementById('ngNombre');
    if (!el) return;
    const nombre = generarNombreMarkov(estiloActual, generoActual);
    el.textContent = nombre;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

function seleccionarEstilo(id) {
    if (!NOMBRES_ENTRENAMIENTO[id]) return;
    estiloActual = id;
    document.querySelectorAll('#ngEstilos .ng-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.estilo === id);
    });
    nuevoNombre();
}

function seleccionarGenero(id) {
    if (!['masc','fem','ambos'].includes(id)) return;
    generoActual = id;
    document.querySelectorAll('#ngGeneros .ng-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.genero === id);
    });
    nuevoNombre();
}

// ============================================================
//  COPIAR
// ============================================================
async function copiarNombre() {
    const el = document.getElementById('ngNombre');
    const btn = document.getElementById('ngCopyBtn');
    if (!el || !btn) return;
    const texto = el.textContent.trim();
    if (!texto || texto === '—') return;

    let exito = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
            exito = true;
        }
    } catch (e) { /* fallback */ }

    if (!exito) {
        try {
            const ta = document.createElement('textarea');
            ta.value = texto;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            exito = true;
        } catch (e) { exito = false; }
    }

    if (exito) {
        btn.classList.add('ok');
        btn.innerHTML = '<i data-lucide="check"></i>';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => {
            btn.classList.remove('ok');
            btn.innerHTML = '<i data-lucide="copy"></i>';
            if (window.lucide) window.lucide.createIcons();
        }, 1400);
    }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    document.querySelectorAll('#ngEstilos .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarEstilo(btn.dataset.estilo));
    });
    document.querySelectorAll('#ngGeneros .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarGenero(btn.dataset.genero));
    });
    document.getElementById('ngBtnGenerar')?.addEventListener('click', nuevoNombre);
    document.getElementById('ngCopyBtn')?.addEventListener('click', copiarNombre);
    nuevoNombre();
    if (window.lucide) window.lucide.createIcons();
});
