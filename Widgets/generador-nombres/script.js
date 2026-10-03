// ============================================================
//  Widget: Generador de Nombres
//  ------------------------------------------------------------
//  Genera nombres SINTETIZADOS por sílabas (onset + vocal + coda),
//  no de una lista predefinida. Cuatro estilos fonéticos y tres
//  sesgos de género opcionales.
//
//  Filtros fonotácticos:
//    - "qu" solo puede ir con "e"/"i"
//    - Se rechazan: 3+ vocales iguales, 4+ vocales seguidas,
//      4+ consonantes seguidas, "quu", "guu", sílabas repetidas.
//    - Después de sílaba terminada en vocal, la siguiente empieza
//      con consonante (separación silábica real).
//    - Anti-repetición del mismo onset en sílabas consecutivas.
//
//  SIN persistencia: cada carga arranca en Latino/Ambos.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  BANCOS DE SÍLABAS POR ESTILO
// ============================================================
const ESTILOS = {
    latino: {
        onsets: [
            'b','c','d','f','g','j','l','m','n','p','qu','r','s','t','v','y','z',
            'bl','br','cl','cr','dr','fl','fr','gl','gr','pl','pr','tr'
        ],
        vowels: ['a','e','i','o','u','ia','ie','io','ua','ue'],
        codas:  ['', '', '', 'n', 'r', 's', 'l', 'd'],
        silabas: [2, 2, 3, 3, 3, 4],
        pInicioVocal: 0.22
    },
    japones: {
        onsets: [
            'k','s','t','n','h','m','y','r','w',
            'sh','ch','ts','j','d','b','p','g','z',
            'ky','gy','ny','hy','my','ry','by','py'
        ],
        vowels: ['a','i','u','e','o'],
        codas:  ['', '', '', '', '', 'n'],
        silabas: [1, 2, 2, 2, 3, 3, 3],
        pInicioVocal: 0.30
    },
    anglo: {
        onsets: [
            'b','c','d','f','g','h','j','k','l','m','n',
            'p','r','s','t','v','w','y',
            'ch','sh','th','br','cr','dr','fr','gr','pr','tr',
            'cl','fl','gl','pl','sl'
        ],
        vowels: ['a','e','i','o','u','ay','ee','oo','ie','ai','ea'],
        codas:  [
            '', 'b', 'd', 'f', 'g', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'x', 'y',
            'ck', 'll', 'ss', 'tt', 'nn', 'mm'
        ],
        silabas: [1, 2, 2, 2, 3],
        pInicioVocal: 0.08
    },
    fantasia: {
        onsets: [
            'b','d','f','g','h','k','l','m','n','p','r','s','t','v','z',
            'th','sh','kh','ph','vr','dr','br','kr','gl','vl','zh','ss'
        ],
        vowels: ['a','e','i','o','u','ae','ei','ou','ia','ua','ao'],
        codas:  ['', 'n', 'r', 'l', 's', 'th', 'sh', 'x', 'k', 'nd', 'rt', 'st', 'ld'],
        silabas: [2, 2, 2, 3, 3, 3],
        pInicioVocal: 0.18
    }
};

// ============================================================
//  RESTRICCIONES ONSET → VOWEL
//  "qu" en español siempre va seguido de "e" o "i" (la u es muda).
//  Sin esta regla se generan cosas como "quue" que se ven feas.
// ============================================================
const ONSETS_RESTRINGEN = {
    'qu': ['e', 'i']
};

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
//  HELPERS
// ============================================================
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function elegirVocalFinal(vowels, genero) {
    if (genero === 'ambos') return pick(vowels);
    const mascPref = vowels.filter(v => /^[ou]/.test(v));
    const femPref  = vowels.filter(v => /^[ai]/.test(v) && !/^[ou]/.test(v));
    if (genero === 'masc' && mascPref.length && Math.random() < 0.75) return pick(mascPref);
    if (genero === 'fem'  && femPref.length  && Math.random() < 0.75) return pick(femPref);
    return pick(vowels);
}

/**
 * Elige la vocal de una sílaba considerando la restricción del onset.
 */
function elegirVocalParaOnset(onsetLower, vowels, genero, esUltima) {
    const restriccion = ONSETS_RESTRINGEN[onsetLower];

    if (restriccion) {
        const pool = vowels.filter(v => restriccion.some(r => v === r || v.startsWith(r)));
        const usable = pool.length ? pool : restriccion;

        if (esUltima && genero !== 'ambos') {
            const mascPref = usable.filter(v => /^[ou]/.test(v));
            const femPref  = usable.filter(v => /^[ai]/.test(v) && !/^[ou]/.test(v));
            if (genero === 'masc' && mascPref.length && Math.random() < 0.75) return pick(mascPref);
            if (genero === 'fem'  && femPref.length  && Math.random() < 0.75) return pick(femPref);
        }
        return pick(usable);
    }

    if (esUltima) return elegirVocalFinal(vowels, genero);
    return pick(vowels);
}

/**
 * Detecta nombres visualmente feos o difíciles de leer.
 */
function esNombreFeo(nombre) {
    const n = String(nombre).toLowerCase();

    // 3+ vocales iguales seguidas: "aaa", "eee"
    if (/([aeiou])\1{2,}/.test(n)) return true;

    // "quu" o "guu" — imposibles en español
    if (/quu|guu/.test(n)) return true;

    // 4+ vocales seguidas (aunque sean distintas)
    if (/[aeiou]{4,}/.test(n)) return true;

    // 4+ consonantes seguidas
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(n)) return true;

    // Misma sílaba repetida 3 veces: "mamama", "papapa"
    if (/(.{2,3})\1{2,}/.test(n)) return true;

    return false;
}

// ============================================================
//  GENERADOR PRINCIPAL
// ============================================================
function generarNombre(estiloId, genero, intento = 0) {
    if (intento > 15) return 'Nicol'; // fallback imposible

    const estilo = ESTILOS[estiloId] || ESTILOS.latino;
    const nSilabas = pick(estilo.silabas);

    let partes = [];
    let tieneConsonante = false;
    let ultimoOnset = '';

    for (let i = 0; i < nSilabas; i++) {
        const esUltima = (i === nSilabas - 1);
        const silabaAnterior = partes.length ? partes[partes.length - 1] : '';
        const anteriorTerminaVocal = /[aeiou]$/.test(silabaAnterior);

        // -------- Onset --------
        let onset;
        const forzarConsonante = (i > 0) && anteriorTerminaVocal;

        if (i === 0 && Math.random() < estilo.pInicioVocal) {
            onset = '';
        } else {
            // Si la sílaba anterior terminó en vocal, forzamos consonante
            // para que se lean dos sílabas separadas.
            onset = pick(estilo.onsets);
        }

        // Evitar repetir el mismo onset en sílabas consecutivas
        if (i > 0 && onset && onset === ultimoOnset && Math.random() < 0.6) {
            let intentosOnset = 0;
            while (onset === ultimoOnset && intentosOnset < 4) {
                onset = pick(estilo.onsets);
                intentosOnset++;
            }
        }
        ultimoOnset = onset;

        // -------- Vowel (con restricción del onset) --------
        const vowel = elegirVocalParaOnset(
            onset.toLowerCase(),
            estilo.vowels,
            genero,
            esUltima
        );

        // -------- Coda --------
        let coda = '';
        if (!esUltima) {
            if (Math.random() < 0.15) coda = pick(estilo.codas);
        } else {
            if (Math.random() < 0.35) coda = pick(estilo.codas);
        }

        if (onset) tieneConsonante = true;
        if (coda)  tieneConsonante = true;

        partes.push(onset + vowel + coda);
    }

    let nombre = partes.join('');

    // -------- Validaciones --------
    if (nombre.length < 3)   return generarNombre(estiloId, genero, intento + 1);
    if (!tieneConsonante)    return generarNombre(estiloId, genero, intento + 1);
    if (esNombreFeo(nombre)) return generarNombre(estiloId, genero, intento + 1);

    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
}

// ============================================================
//  UI
// ============================================================
function nuevoNombre() {
    const el = document.getElementById('ngNombre');
    if (!el) return;
    const nombre = generarNombre(estiloActual, generoActual);
    el.textContent = nombre;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
}

function seleccionarEstilo(id) {
    if (!ESTILOS[id]) return;
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
