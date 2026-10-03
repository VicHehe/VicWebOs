// ============================================================
//  Widget: Generador de Nombres
//  ------------------------------------------------------------
//  Genera nombres SINTETIZADOS por sílabas (onset + vocal + coda),
//  no de una lista predefinida. Cuatro estilos fonéticos y tres
//  sesgos de género opcionales.
//
//  SIN persistencia: cada carga arranca en Latino/Ambos.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  BANCOS DE SÍLABAS POR ESTILO
//  ------------------------------------------------------------
//  onsets   → consonantes / grupos iniciales
//  vowels   → núcleos vocálicos (pueden ser dígrafos)
//  codas    → terminaciones consonánticas (a veces vacío)
//  silabas  → número de sílabas (con peso por repetición)
//  pInicioVocal → probabilidad de empezar con vocal
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

/**
 * Elige la vocal de la ÚLTIMA sílaba aplicando el sesgo de género.
 *  - masc  → prefiere -o / -u
 *  - fem   → prefiere -a / -i / -e
 *  - ambos → sin sesgo
 * La probabilidad de sesgo es 0.75; el resto del tiempo elige al azar
 * del pool completo, lo que mantiene variedad.
 */
function elegirVocalFinal(vowels, genero) {
    if (genero === 'ambos') return pick(vowels);

    const mascPref = vowels.filter(v => /^[ou]/.test(v));
    const femPref  = vowels.filter(v => /^[ai]/.test(v) && !/^[ou]/.test(v));

    if (genero === 'masc' && mascPref.length && Math.random() < 0.75) {
        return pick(mascPref);
    }
    if (genero === 'fem' && femPref.length && Math.random() < 0.75) {
        return pick(femPref);
    }
    return pick(vowels);
}

/**
 * Cuenta las vocales consecutivas máximas. Sirve para rechazar
 * combinaciones como "aeaoo" que se ven feas.
 */
function vocalesConsecutivas(s) {
    const m = String(s).toLowerCase().match(/[aeiou]+/g) || [];
    return m.reduce((max, grupo) => Math.max(max, grupo.length), 0);
}

// ============================================================
//  GENERADOR PRINCIPAL
// ============================================================
function generarNombre(estiloId, genero, intento = 0) {
    // Red de seguridad: 12 intentos máximos y fallback.
    if (intento > 12) return 'Nicol';

    const estilo = ESTILOS[estiloId] || ESTILOS.latino;
    const nSilabas = pick(estilo.silabas);

    let partes = [];
    let tieneConsonante = false;

    for (let i = 0; i < nSilabas; i++) {
        const esUltima = (i === nSilabas - 1);

        // -------- Onset --------
        let onset;
        if (i === 0 && Math.random() < estilo.pInicioVocal) {
            onset = '';
        } else {
            onset = pick(estilo.onsets);
        }

        // -------- Vowel --------
        let vowel;
        if (esUltima) {
            vowel = elegirVocalFinal(estilo.vowels, genero);
        } else {
            vowel = pick(estilo.vowels);
        }

        // -------- Coda --------
        let coda = '';
        if (!esUltima) {
            // Sílabas intermedias: coda rara (15%)
            if (Math.random() < 0.15) coda = pick(estilo.codas);
        } else {
            // Última sílaba: coda más probable (35%) — da variedad
            // tipo "nicolas" vs "nicol"
            if (Math.random() < 0.35) coda = pick(estilo.codas);
        }

        if (onset) tieneConsonante = true;
        if (coda)  tieneConsonante = true;

        partes.push(onset + vowel + coda);
    }

    let nombre = partes.join('');

    // -------- Validaciones --------
    // Demasiado corto (nombres de 1-2 letras no son útiles)
    if (nombre.length < 3) {
        return generarNombre(estiloId, genero, intento + 1);
    }
    // Sin consonantes → sonaría raro
    if (!tieneConsonante) {
        return generarNombre(estiloId, genero, intento + 1);
    }
    // 4+ vocales seguidas → feo visual
    if (vocalesConsecutivas(nombre) > 3) {
        return generarNombre(estiloId, genero, intento + 1);
    }

    // Capitalizar: primera mayúscula, resto minúsculas
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

    // Reiniciar la animación pop
    el.classList.remove('pop');
    void el.offsetWidth;      // reflow para reiniciar la animación
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
//  COPIAR AL PORTAPAPELES
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
        // Fallback silencioso con execCommand
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

    // Chips de estilo
    document.querySelectorAll('#ngEstilos .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarEstilo(btn.dataset.estilo));
    });

    // Chips de género
    document.querySelectorAll('#ngGeneros .ng-chip').forEach(btn => {
        btn.addEventListener('click', () => seleccionarGenero(btn.dataset.genero));
    });

    // Botón generar
    document.getElementById('ngBtnGenerar')?.addEventListener('click', nuevoNombre);

    // Botón copiar
    document.getElementById('ngCopyBtn')?.addEventListener('click', copiarNombre);

    // Primer nombre
    nuevoNombre();

    if (window.lucide) window.lucide.createIcons();
});
