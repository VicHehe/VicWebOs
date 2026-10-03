// ============================================================
//  Widget: Generador de Nombres v3
//  ------------------------------------------------------------
//  Motor: Markov de caracteres con bigramas (orden 2).
//  Aprende qué letra sigue a cada par de letras viendo nombres
//  reales. Genera secuencias que respetan la fonotáctica natural
//  sin reglas duras.
//
//  Este enfoque es el que usan librerías como markov-namegen
//  y fantasy-name-generator. Produce nombres como "Nicolás",
//  "Cassie", "Haruko" con naturalidad.
//
//  SIN persistencia.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  SET DE ENTRENAMIENTO
//  ------------------------------------------------------------
//  Nombres reales por estilo. Cuantos más, mejor. El modelo
//  aprende transiciones de bigramas de estos ejemplos.
// ============================================================
const NOMBRES_ENTRENAMIENTO = {
    latino: [
        'nicolas','nicol','amaro','antonio','jose','juan','manuel','francisco',
        'luis','javier','miguel','angel','carlos','jesus','david','pedro',
        'alejandro','fernando','sergio','ricardo','eduardo','roberto','daniel',
        'pablo','andres','adrian','diego','rafael','gonzalo','tomas','martin',
        'agustin','felipe','ignacio','matias','sebastian','cristobal','ramiro',
        'mauricio','rodrigo','fabricio','leonardo','marcelo','octavio','santiago',
        'benjamin','joaquin','maximiliano','lucas','mateo','vicente','renato',
        'bruno','alonso','bastian','emilio','hector','victor','oscar','hugo',
        'valentina','camila','isidora','josefa','florencia','martina','catalina',
        'antonia','javiera','emilia','sofia','lucia','maria','carmen','paula',
        'andrea','daniela','gabriela','valeria','fernanda','constanza','trinidad',
        'magdalena','rosario','esperanza','soledad','amparo','dolores','pilar',
        'beatriz','elena','irene','lorena','marcela','patricia','veronica',
        'alejandra','carolina','cecilia','claudia','gloria','silvia','teresa'
    ],
    japones: [
        'haruko','kasumi','tomoe','ryu','ryuu','haruki','takeshi','kenta',
        'yuki','sakura','aiko','kenji','hiroshi','takumi','daisuke','yumi',
        'akira','naomi','keiko','michiko','yoko','hana','ren','sora','hikari',
        'kaito','riku','sota','yuto','daiki','ryota','kazuya','shinji','yuto',
        'asuka','mio','saki','mei','yuna','hina','rin','kaede','tsubaki',
        'ayame','fuyuko','hotaru','kaoru','midori','natsuki','sakiko','ayumi',
        'chiyo','fumiko','harumi','junko','kumiko','masako','noriko','reiko',
        'satomi','tomoko','wakana','yoshiko','ichiro','jiro','katsuo','ryosuke'
    ],
    anglo: [
        'jimmy','tommy','andy','charlie','bobby','danny','eddie','freddy',
        'harry','jack','jake','james','john','kevin','luke','mark','mike',
        'nick','paul','peter','rick','rob','sam','steve','tim','tom','will',
        'cassie','rosie','maggie','ellie','katie','lily','lucy','molly',
        'nancy','penny','polly','sally','sophie','annie','betty','daisy',
        'emily','grace','hannah','isabel','jane','kelly','laura','megan',
        'oliver','noah','liam','ethan','mason','logan','jacob','william',
        'mia','ava','emma','olivia','sophia','chloe','zoe','ruby','ivy'
    ],
    fantasia: [
        'aelin','aelric','bran','cass','dorian','elara','fen','garrick',
        'hale','iris','jax','kael','lyra','mira','nox','orion','pax',
        'quinn','raven','sable','thane','ulric','vesper','wren','xander',
        'yara','zephyr','alric','briar','cedric','draven','faelan',
        'gideon','harlow','imre','jarek','kiran','lorcan','maeve','niamh',
        'orla','peregrine','rowan','seraphina','tarian','vanya','ashlin',
        'cassia','dorian','edric','faelan','gwyn','hale','isolde','joran'
    ]
};

// ============================================================
//  CONSTRUCCIÓN DEL MODELO DE MARKOV
//  ------------------------------------------------------------
//  Padding: "__" al inicio y "_" al final de cada nombre.
//  Mapa: bigrama (2 chars) → { siguienteChar: peso }
// ============================================================
const PAD_INICIO = '__';
const PAD_FIN    = '_';

function construirModelo(nombres) {
    const modelo = {};

    for (const nombre of nombres) {
        const n = nombre.toLowerCase();
        const secuencia = PAD_INICIO + n + PAD_FIN;

        // Recorremos la secuencia en ventanas de 3: (a, b) → c
        for (let i = 0; i < secuencia.length - 2; i++) {
            const bigrama = secuencia[i] + secuencia[i + 1];
            const siguiente = secuencia[i + 2];
            if (!modelo[bigrama]) modelo[bigrama] = {};
            modelo[bigrama][siguiente] = (modelo[bigrama][siguiente] || 0) + 1;
        }
    }
    return modelo;
}

// ============================================================
//  GENERACIÓN CON TEMPERATURA
//  ------------------------------------------------------------
//  La temperatura controla la variedad:
//    0.5 → conservador (muy parecido a los nombres reales)
//    1.0 → balance
//    1.5 → caótico (más inventivo pero más feo a veces)
// ============================================================
const TEMPERATURA = 0.85;

function elegirSiguiente(opciones, temperatura = TEMPERATURA) {
    const entradas = Object.entries(opciones);
    if (entradas.length === 0) return null;

    // Aplicar temperatura a los pesos
    const pesos = entradas.map(([, c]) => Math.pow(c, 1 / temperatura));
    const total = pesos.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;

    for (let i = 0; i < entradas.length; i++) {
        r -= pesos[i];
        if (r <= 0) return entradas[i][0];
    }
    return entradas[entradas.length - 1][0];
}

function generarConModelo(modelo, maxLen = 12) {
    let resultado = '';
    let contexto = PAD_INICIO;

    for (let i = 0; i < maxLen; i++) {
        const opciones = modelo[contexto];
        if (!opciones) break;

        const sig = elegirSiguiente(opciones);
        if (!sig || sig === PAD_FIN) break;

        resultado += sig;

        // Actualizar contexto: últimos 2 caracteres
        contexto = (contexto + sig).slice(-2);
    }

    return resultado;
}

// ============================================================
//  VALIDACIÓN POST-GENERACIÓN
//  ------------------------------------------------------------
//  Filtros finales para descartar nombres feos o inválidos.
// ============================================================
function esNombreValido(nombre) {
    const n = String(nombre).toLowerCase();

    // Longitud razonable
    if (n.length < 3) return false;
    if (n.length > 11) return false;

    // Debe tener al menos una vocal
    if (!/[aeiouáéíóú]/.test(n)) return false;

    // No empezar con consonante duplicada rara
    if (/^(.)\1/.test(n)) return false;

    // 3+ vocales iguales
    if (/([aeiou])\1{2,}/.test(n)) return false;

    // 3+ consonantes iguales
    if (/([bcdfghjklmnpqrstvwxyz])\1{2,}/.test(n)) return false;

    // 4+ consonantes seguidas
    if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(n)) return false;

    // No terminar en 3+ consonantes
    if (/[bcdfghjklmnpqrstvwxyz]{3,}$/.test(n)) return false;

    // Terminación muy rara: no termina en vocal ni en consonante común
    if (!/[aeiounrsldáéíóú]$/.test(n)) return false;

    // Clusters imposibles al inicio (bl+tr, pr+dr, etc.)
    if (/^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr){2}/.test(n)) return false;

    return true;
}

// ============================================================
//  AJUSTE DE GÉNERO
//  ------------------------------------------------------------
//  Ajusta la terminación según el sesgo pedido.
// ============================================================
function ajustarGenero(nombre, genero) {
    if (genero === 'ambos' || !nombre) return nombre;
    const n = nombre.toLowerCase();

    if (genero === 'fem') {
        // Terminar en -a si no termina ya en vocal femenina
        if (!/[aei]$/.test(n)) {
            return n.replace(/[ou]$/, 'a') + (!/[aeiou]$/.test(n) ? 'a' : '');
        }
    }
    if (genero === 'masc') {
        // Terminar en -o si termina en -a
        if (/a$/.test(n) && n.length > 3) {
            return n.slice(0, -1) + 'o';
        }
    }
    return nombre;
}

// ============================================================
//  GENERADOR PRINCIPAL
// ============================================================
function generarNombre(estiloId, genero, intento = 0) {
    const nombres = NOMBRES_ENTRENAMIENTO[estiloId] || NOMBRES_ENTRENAMIENTO.latino;
    const modelo = construirModelo(nombres);

    const intentosMax = 30;
    for (let i = 0; i < intentosMax; i++) {
        let nombre = generarConModelo(modelo, 11);
        if (!nombre) continue;

        nombre = ajustarGenero(nombre, genero);

        if (esNombreValido(nombre)) {
            return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
        }
    }

    // Fallback de emergencia
    const base = nombres[Math.floor(Math.random() * nombres.length)];
    return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
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
    const nombre = generarNombre(estiloActual, generoActual);
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
