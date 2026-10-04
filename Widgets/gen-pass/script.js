// ============================================================
//  Widget: Generador de Contraseñas
//  ------------------------------------------------------------
//  NO es 100% random. Construye la contraseña transformando
//  3 datos personales que el usuario escribe:
//    1. Nombre    → parte base (con sustituciones leet)
//    2. Fecha     → fragmento numérico (día/mes/año)
//    3. Palabra   → segunda parte (con sustituciones leet)
//
//  El resultado es una contraseña de 13-20 caracteres, con
//  mayúsculas, minúsculas, números y símbolos, pero construida
//  con elementos que el usuario recuerda → memorizable.
//
//  NO usa base de datos. NO usa IndexedDB. NO persiste nada.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// Símbolos permitidos (fáciles de escribir en cualquier teclado)
const SIMBOLOS = ['!', '@', '#', '$', '%', '&', '*', '?'];

// Sustituciones leet (cada una tiene sus variantes)
const SUSTITUCIONES = {
    'a': ['@', '4'],
    'e': ['3'],
    'i': ['1'],
    'o': ['0'],
    's': ['$', '5'],
    't': ['7'],
    'g': ['9']
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

        // Ajustar el color del icono del date-picker al tema
        const esOscuro = stylePadre.getPropertyValue('--white').trim().match(/^#?[0-3]/);
        if (esOscuro) {
            document.documentElement.style.setProperty('--calendar-filter', 'invert(1)');
        } else {
            document.documentElement.style.setProperty('--calendar-filter', 'none');
        }
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
 * Limpia el texto: minúsculas, sin acentos, sin caracteres
 * especiales. "Nicolás!" → "nicolas"
 */
function limpiar(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function capitalizar(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Aplica sustituciones leet con probabilidad dada.
 * protegerInicio=true → no sustituye el primer carácter
 * (así el nombre conserva su mayúscula inicial visible).
 */
function aplicarLeet(texto, intensidad = 0.6, protegerInicio = false) {
    let resultado = '';
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        const lower = c.toLowerCase();
        const sustitutos = SUSTITUCIONES[lower];
        const esPrimerChar = i === 0;

        if (sustitutos && !(esPrimerChar && protegerInicio) && Math.random() < intensidad) {
            resultado += pick(sustitutos);
        } else {
            resultado += c;
        }
    }
    return resultado;
}

/**
 * Extrae 2 de los 3 fragmentos de la fecha (año, mes, día)
 * y los junta. Ej: "1995-03-15" → "199503" o "1595" o "031995"
 */
function extraerFechaParte(fecha) {
    if (!fecha) return '';
    const partes = fecha.split('-');
    if (partes.length !== 3) return '';

    const [anio, mes, dia] = partes;
    const i1 = Math.floor(Math.random() * 3);
    let i2 = Math.floor(Math.random() * 3);
    while (i2 === i1) i2 = Math.floor(Math.random() * 3);

    return [anio, mes, dia][i1] + [anio, mes, dia][i2];
}

// ============================================================
//  GENERADOR PRINCIPAL
// ============================================================
function generarPassword(nombre, fecha, palabra) {
    const n = limpiar(nombre);
    const p = limpiar(palabra);

    if (n.length < 2 || !fecha || p.length < 2) return null;

    // -------- Parte 1: nombre --------
    const nomBase = n.slice(0, Math.min(5, n.length));   // 2-5 letras
    const nomProc = aplicarLeet(capitalizar(nomBase), 0.65, true);

    // -------- Parte 2: palabra clave --------
    const palBase = p.slice(0, Math.min(5, p.length));   // 2-5 letras
    const palProc = aplicarLeet(capitalizar(palBase), 0.65, true);

    // -------- Parte 3: fecha --------
    const fechaProc = extraerFechaParte(fecha);

    // -------- Ensamblar --------
    const sym1 = pick(SIMBOLOS);
    const sym2 = pick(SIMBOLOS);
    const sym3 = Math.random() < 0.6 ? pick(SIMBOLOS) : '';

    // Patrón: Nombre + Símbolo + Palabra + Símbolo + Fecha + Símbolo?
    let password = nomProc + sym1 + palProc + sym2 + fechaProc + sym3;

    // Padding de seguridad: mínimo 12 caracteres
    let intentos = 0;
    while (password.length < 12 && intentos < 5) {
        password += Math.random() < 0.5
            ? pick(SIMBOLOS)
            : String(Math.floor(Math.random() * 10));
        intentos++;
    }

    return password;
}

// ============================================================
//  CÁLCULO DE FUERZA
// ============================================================
function calcularFuerza(pwd) {
    if (!pwd || pwd.length < 4) {
        return { pts: 0, nivel: 'vacio' };
    }

    let pts = 0;

    // Longitud
    if (pwd.length >= 8)  pts += 10;
    if (pwd.length >= 12) pts += 15;
    if (pwd.length >= 15) pts += 10;
    if (pwd.length >= 18) pts += 5;

    // Variedad de caracteres
    if (/[a-z]/.test(pwd)) pts += 10;
    if (/[A-Z]/.test(pwd)) pts += 15;
    if (/\d/.test(pwd))    pts += 15;
    if (/[^A-Za-z0-9]/.test(pwd)) pts += 15;

    // Ratio de caracteres únicos
    const ratio = new Set(pwd).size / pwd.length;
    if (ratio >= 0.7) pts += 5;

    pts = Math.min(100, pts);

    let nivel;
    if (pts < 40)       nivel = 'debil';
    else if (pts < 65)  nivel = 'aceptable';
    else if (pts < 85)  nivel = 'fuerte';
    else                nivel = 'muy-fuerte';

    return { pts, nivel };
}

// ============================================================
//  UI
// ============================================================
function validar() {
    const n = limpiar(document.getElementById('pgNombre').value);
    const f = document.getElementById('pgFecha').value;
    const p = limpiar(document.getElementById('pgPalabra').value);

    const valido = n.length >= 2 && !!f && p.length >= 2;
    const btn = document.getElementById('pgBtnGenerar');
    if (btn) btn.disabled = !valido;

    // Si el usuario modifica algo, reseteamos visual del resultado
    // para que sepa que tiene que regenerar
    if (!valido) {
        resetResultado();
    }
    return valido;
}

function resetResultado() {
    const res = document.getElementById('pgResultado');
    const copy = document.getElementById('pgCopyBtn');
    const fill = document.getElementById('pgFuerzaFill');
    const txt = document.getElementById('pgFuerzaTexto');

    if (res) {
        res.textContent = '···';
        res.classList.remove('lleno');
        res.classList.add('vacio');
    }
    if (copy) copy.disabled = true;
    if (fill) {
        fill.style.width = '0%';
        fill.className = 'pg-fuerza-fill';
    }
    if (txt) {
        txt.textContent = '—';
        txt.className = 'pg-fuerza-texto';
    }
}

function generar() {
    if (!validar()) return;

    const nombre = document.getElementById('pgNombre').value;
    const fecha  = document.getElementById('pgFecha').value;
    const palabra = document.getElementById('pgPalabra').value;

    const pwd = generarPassword(nombre, fecha, palabra);
    if (!pwd) return;

    const res = document.getElementById('pgResultado');
    const copy = document.getElementById('pgCopyBtn');
    const fill = document.getElementById('pgFuerzaFill');
    const txt = document.getElementById('pgFuerzaTexto');

    // Mostrar contraseña
    res.textContent = pwd;
    res.classList.remove('vacio');
    res.classList.remove('lleno');
    void res.offsetWidth;
    res.classList.add('lleno');

    copy.disabled = false;

    // Actualizar barra de fuerza
    const fuerza = calcularFuerza(pwd);
    fill.className = 'pg-fuerza-fill ' + fuerza.nivel;
    fill.style.width = fuerza.pts + '%';

    const etiquetas = {
        'debil': 'Débil',
        'aceptable': 'Aceptable',
        'fuerte': 'Fuerte',
        'muy-fuerte': 'Muy fuerte'
    };
    txt.textContent = etiquetas[fuerza.nivel] || '—';
    txt.className = 'pg-fuerza-texto ' + fuerza.nivel;
}

// ============================================================
//  COPIAR
// ============================================================
async function copiarPassword() {
    const res = document.getElementById('pgResultado');
    const btn = document.getElementById('pgCopyBtn');
    if (!res || !btn || btn.disabled) return;

    const texto = res.textContent.trim();
    if (!texto || texto === '···') return;

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
    resetResultado();

    // Validación en vivo
    ['pgNombre', 'pgFecha', 'pgPalabra'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', validar);
    });

    document.getElementById('pgBtnGenerar')?.addEventListener('click', generar);
    document.getElementById('pgCopyBtn')?.addEventListener('click', copiarPassword);

    // Enter en cualquier campo genera
    ['pgNombre', 'pgPalabra'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') generar();
        });
    });

    if (window.lucide) window.lucide.createIcons();
});
