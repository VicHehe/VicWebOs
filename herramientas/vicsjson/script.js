// ============================================================
//  VicsJSON — Editor JSON simple
//  ------------------------------------------------------------
//  · Analiza JSON en vivo (válido/inválido, errores con línea/col)
//  · Sugiere mejoras (duplicados, nulls, vacíos, strings largos)
//  · Formatea, minifica, repara (auto-close de llaves/corchetes)
//  · Descarga / copia el resultado
//  · Guarda el último estado en localStorage por usuario
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const LS_KEY_BASE = 'vicsjson_borrador_';
const MAX_AUTOCOMPLETE = 200 * 1024; // 200 KB, límite para análisis

let usuarioActual = null;
let toastTimer = null;
let debounceTimer = null;
let ultimoValido = false;
let ultimoObjeto = null;
let tabActual = 'analisis';

const API = () => window.parent.__vicwebos || null;

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
            '--shadow-glow',
            '--accent-gradient','--accent-gradient-hover',
            '--accent-shadow','--accent-shadow-hover',
            '--accent-text-gradient',
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (_) {}
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  HELPERS
// ============================================================
function toast(texto, tipo = 'info') {
    const el = document.getElementById('vjToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'vj-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function escaparHTML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatearBytes(n) {
    if (!n || n < 0) return '0 B';
    const u = ['B', 'KB', 'MB'];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function claveBorrador() {
    return LS_KEY_BASE + (usuarioActual?.codigo || 'anon');
}

function getIndent() {
    const v = document.getElementById('selectIndent').value;
    return v === '\\t' ? '\t' : Number(v);
}

// ============================================================
//  DETECCIÓN DE ERROR
// ============================================================
// Convierte la posición numérica de JSON.parse en línea/columna
function posALineaCol(texto, pos) {
    let linea = 1, col = 1;
    for (let i = 0; i < pos && i < texto.length; i++) {
        if (texto[i] === '\n') { linea++; col = 1; }
        else col++;
    }
    return { linea, col };
}

function analizarTexto(texto) {
    const resultado = {
        ok: false,
        error: null,           // { mensaje, linea, col, pos }
        datos: null,
        stats: null,
        sugerencias: []
    };

    if (!texto || !texto.trim()) {
        return resultado;
    }

    // Intento de parseo
    try {
        const datos = JSON.parse(texto);
        resultado.ok = true;
        resultado.datos = datos;
        resultado.stats = calcularStats(datos, texto);
        resultado.sugerencias = detectarSugerencias(datos, texto);
        return resultado;
    } catch (e) {
        const msg = String(e.message || 'JSON inválido');
        // El motor V8 reporta: "Unexpected token } in JSON at position 42"
        // o "Expected ',' or '}' after property value in JSON at position 42"
        let pos = null;
        const mPos = msg.match(/position\s+(\d+)/i);
        if (mPos) pos = Number(mPos[1]);

        let linea = null, col = null;
        if (pos !== null && pos >= 0) {
            const lc = posALineaCol(texto, pos);
            linea = lc.linea;
            col = lc.col;
        }

        resultado.error = {
            mensaje: limpiarMensaje(msg),
            pos,
            linea,
            col
        };

        // Igual intentamos sugerencias básicas sobre el texto crudo
        resultado.sugerencias = detectarSugerenciasTexto(texto);
        return resultado;
    }
}

function limpiarMensaje(msg) {
    // Achicar mensajes de Chrome/Firefox a algo legible
    return msg
        .replace(/\s*in JSON at position \d+/i, '')
        .replace(/^JSON\.parse:\s*/i, '')
        .trim();
}

// ============================================================
//  ESTADÍSTICAS DEL JSON
// ============================================================
function calcularStats(obj, texto) {
    let nodos = 0;
    let keys = 0;
    let strings = 0;
    let numeros = 0;
    let booleanos = 0;
    let nulls = 0;
    let arrays = 0;
    let objetos = 0;
    let maxDepth = 0;
    let stringLarga = null;

    function recorrer(v, depth, key) {
        if (depth > maxDepth) maxDepth = depth;
        nodos++;

        if (v === null) { nulls++; return; }
        const t = typeof v;
        if (t === 'string') {
            strings++;
            if (!stringLarga || v.length > stringLarga.len) {
                stringLarga = { len: v.length, key: key || '(raíz)' };
            }
            return;
        }
        if (t === 'number') { numeros++; return; }
        if (t === 'boolean') { booleanos++; return; }
        if (Array.isArray(v)) {
            arrays++;
            v.forEach((item, i) => recorrer(item, depth + 1, `[${i}]`));
            return;
        }
        if (t === 'object') {
            objetos++;
            for (const k of Object.keys(v)) {
                keys++;
                recorrer(v[k], depth + 1, k);
            }
        }
    }

    recorrer(obj, 1, null);

    return {
        nodos,
        keys,
        strings,
        numeros,
        booleanos,
        nulls,
        arrays,
        objetos,
        maxDepth,
        stringLarga,
        bytes: new Blob([texto]).size
    };
}

// ============================================================
//  SUGERENCIAS
// ============================================================
function detectarSugerencias(obj, texto) {
    const sug = [];

    // Detectar claves duplicadas en el texto crudo
    // (JSON.parse las colapsa silenciosamente)
    const duplicadas = detectarClavesDuplicadas(texto);
    if (duplicadas.length > 0) {
        sug.push({
            tipo: 'warn',
            icono: 'alert-triangle',
            titulo: 'Claves duplicadas',
            detalle: `Encontradas: ${duplicadas.slice(0, 5).join(', ')}${duplicadas.length > 5 ? ` (+${duplicadas.length - 5})` : ''}. JSON solo conserva la última.`
        });
    }

    // Valores null
    const nulls = contarPorTipo(obj, null);
    if (nulls > 0) {
        sug.push({
            tipo: 'info',
            icono: 'circle-slash',
            titulo: `${nulls} valor${nulls === 1 ? '' : 'es'} en null`,
            detalle: 'Revisá si alguno puede reemplazarse por un valor real o si conviene eliminarlo.'
        });
    }

    // Strings vacías
    const vacios = contarStringsVacios(obj);
    if (vacios > 0) {
        sug.push({
            tipo: 'info',
            icono: 'text-cursor-input',
            titulo: `${vacios} string${vacios === 1 ? '' : 's'} vacío${vacios === 1 ? '' : 's'}`,
            detalle: 'Considerá usar null o eliminar la clave si el valor no aplica.'
        });
    }

    // Mezcla de tipos en un array
    const mezclas = detectarArraysMixtos(obj);
    if (mezclas > 0) {
        sug.push({
            tipo: 'warn',
            icono: 'shuffle',
            titulo: `${mezclas} array${mezclas === 1 ? '' : 's'} con tipos mezclados`,
            detalle: 'Los arrays con tipos distintos son difíciles de procesar. Considerá unificar.'
        });
    }

    // Indentación inconsistente (muy básico: contar tabs vs espacios)
    if (texto.includes('\n')) {
        const tabs = (texto.match(/\n\t/g) || []).length;
        const espacios = (texto.match(/\n {2,}/g) || []).length;
        if (tabs > 0 && espacios > 0) {
            sug.push({
                tipo: 'info',
                icono: 'indent',
                titulo: 'Indentación mixta',
                detalle: 'Tenés tabs y espacios mezclados. Usá "Formatear" para unificar.'
            });
        }
    }

    // Números muy grandes (podrían perder precisión)
    const grandes = detectarNumerosGrandes(obj);
    if (grandes > 0) {
        sug.push({
            tipo: 'warn',
            icono: 'hash',
            titulo: `${grandes} número${grandes === 1 ? '' : 's'} fuera del rango seguro`,
            detalle: 'Enteros mayores a 2^53 pierden precisión en JavaScript. Considerá usar strings.'
        });
    }

    // JSON con profundidad excesiva
    const depth = calcularProfundidad(obj);
    if (depth > 8) {
        sug.push({
            tipo: 'info',
            icono: 'layers',
            titulo: `Profundidad de ${depth} niveles`,
            detalle: 'Estructuras muy anidadas son difíciles de mantener. Considerá aplanar algunas ramas.'
        });
    }

    return sug;
}

function detectarSugerenciasTexto(texto) {
    // Cuando hay error de parseo, igual podemos sugerir cosas básicas
    const sug = [];
    const duplicadas = detectarClavesDuplicadas(texto);
    if (duplicadas.length > 0) {
        sug.push({
            tipo: 'warn',
            icono: 'alert-triangle',
            titulo: 'Claves duplicadas detectadas',
            detalle: `Encontradas: ${duplicadas.slice(0, 5).join(', ')}${duplicadas.length > 5 ? ` (+${duplicadas.length - 5})` : ''}.`
        });
    }
    // Comillas simples (típico error)
    if (/:\s*'/.test(texto)) {
        sug.push({
            tipo: 'warn',
            icono: 'quote',
            titulo: 'Comillas simples detectadas',
            detalle: 'JSON solo acepta comillas dobles ("). Cambiá \' por ".'
        });
    }
    // Comillas tipográficas
    if (/[""''`]/.test(texto)) {
        sug.push({
            tipo: 'warn',
            icono: 'quote',
            titulo: 'Comillas tipográficas detectadas',
            detalle: 'Copiaste comillas de un editor de texto. Reemplazalas por comillas rectas (").'
        });
    }
    // Coma final
    if (/,\s*[}\]]/.test(texto)) {
        sug.push({
            tipo: 'warn',
            icono: 'alert-circle',
            titulo: 'Coma final detectada',
            detalle: 'JSON no acepta comas antes de cerrar un objeto o array. Eliminalas.'
        });
    }
    // Comentarios
    if (/\/\/|\/\*/.test(texto)) {
        sug.push({
            tipo: 'warn',
            icono: 'message-square',
            titulo: 'Comentarios detectados',
            detalle: 'JSON estándar no soporta comentarios. Eliminá las líneas con // o /* */.'
        });
    }
    return sug;
}

function detectarClavesDuplicadas(texto) {
    // Heurística simple: busca "clave": dentro de cada nivel de llaves.
    // No es perfecto pero detecta duplicados obvios.
    const duplicadas = new Set();
    const pila = [];
    const clavesPorNivel = [];
    let enString = false;
    let buffer = '';
    let escape = false;
    let ultimaEraClave = false;

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (escape) { escape = false; if (enString) buffer += c; continue; }
        if (c === '\\' && enString) { escape = true; continue; }

        if (c === '"') {
            if (!enString) {
                enString = true;
                buffer = '';
            } else {
                enString = false;
                // ¿Es clave? Mirar próximo caracter no-espacio
                let j = i + 1;
                while (j < texto.length && /\s/.test(texto[j])) j++;
                if (texto[j] === ':') {
                    const nivel = clavesPorNivel[pila.length - 1];
                    if (nivel) {
                        if (nivel.has(buffer)) duplicadas.add(buffer);
                        nivel.add(buffer);
                    }
                }
            }
            continue;
        }

        if (enString) { buffer += c; continue; }

        if (c === '{') {
            pila.push('{');
            clavesPorNivel.push(new Set());
        } else if (c === '[') {
            pila.push('[');
            clavesPorNivel.push(new Set());
        } else if (c === '}' || c === ']') {
            pila.pop();
            clavesPorNivel.pop();
        }
    }

    return Array.from(duplicadas);
}

function contarPorTipo(obj, tipo) {
    let n = 0;
    (function rec(v) {
        if (v === null && tipo === null) { n++; return; }
        if (Array.isArray(v)) { v.forEach(rec); return; }
        if (typeof v === 'object' && v !== null) {
            for (const k of Object.keys(v)) rec(v[k]);
        }
    })(obj);
    return n;
}

function contarStringsVacios(obj) {
    let n = 0;
    (function rec(v) {
        if (typeof v === 'string') { if (v === '') n++; return; }
        if (Array.isArray(v)) { v.forEach(rec); return; }
        if (typeof v === 'object' && v !== null) {
            for (const k of Object.keys(v)) rec(v[k]);
        }
    })(obj);
    return n;
}

function detectarArraysMixtos(obj) {
    let n = 0;
    (function rec(v) {
        if (Array.isArray(v)) {
            if (v.length > 1) {
                const tipos = new Set(v.map(x => x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x));
                if (tipos.size > 1) n++;
            }
            v.forEach(rec);
            return;
        }
        if (typeof v === 'object' && v !== null) {
            for (const k of Object.keys(v)) rec(v[k]);
        }
    })(obj);
    return n;
}

function detectarNumerosGrandes(obj) {
    let n = 0;
    const MAX_SAFE = Number.MAX_SAFE_INTEGER;
    (function rec(v) {
        if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) > MAX_SAFE) {
            n++;
            return;
        }
        if (Array.isArray(v)) { v.forEach(rec); return; }
        if (typeof v === 'object' && v !== null) {
            for (const k of Object.keys(v)) rec(v[k]);
        }
    })(obj);
    return n;
}

function calcularProfundidad(obj) {
    let max = 0;
    (function rec(v, d) {
        if (d > max) max = d;
        if (Array.isArray(v)) { v.forEach(x => rec(x, d + 1)); return; }
        if (typeof v === 'object' && v !== null) {
            for (const k of Object.keys(v)) rec(v[k], d + 1);
        }
    })(obj, 1);
    return max;
}

// ============================================================
//  REPARAR (auto-close de llaves, comillas simples, comas finales)
// ============================================================
function intentarReparar(texto) {
    if (!texto || !texto.trim()) return { ok: false, cambios: 0 };

    let t = texto;
    let cambios = 0;

    // 1. Comillas tipográficas → rectas
    const antes1 = t;
    t = t.replace(/[""]/g, '"').replace(/['']/g, "'");
    if (t !== antes1) cambios++;

    // 2. Comillas simples alrededor de strings → dobles
    // Heurística: 'texto' (sin comillas dobles adentro) → "texto"
    const antes2 = t;
    t = t.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, p1) => '"' + p1.replace(/"/g, '\\"') + '"');
    if (t !== antes2) cambios++;

    // 3. Comas finales antes de } o ]
    const antes3 = t;
    t = t.replace(/,(\s*[}\]])/g, '$1');
    if (t !== antes3) cambios++;

    // 4. Auto-cerrar llaves/corchetes faltantes al final
    let abreLlave = 0, abreCorchete = 0;
    let enStr = false, esc = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && enStr) { esc = true; continue; }
        if (c === '"') { enStr = !enStr; continue; }
        if (enStr) continue;
        if (c === '{') abreLlave++;
        if (c === '}') abreLlave--;
        if (c === '[') abreCorchete++;
        if (c === ']') abreCorchete--;
    }
    if (abreLlave > 0 || abreCorchete > 0) {
        // Cerrar en el orden correcto según la pila real
        // Rehacer conteo con pila
        const pila = [];
        enStr = false; esc = false;
        for (let i = 0; i < t.length; i++) {
            const c = t[i];
            if (esc) { esc = false; continue; }
            if (c === '\\' && enStr) { esc = true; continue; }
            if (c === '"') { enStr = !enStr; continue; }
            if (enStr) continue;
            if (c === '{' || c === '[') pila.push(c);
            else if (c === '}' || c === ']') pila.pop();
        }
        let cierre = '';
        while (pila.length) {
            const top = pila.pop();
            cierre += (top === '{' ? '}' : ']');
        }
        t = t + cierre;
        cambios++;
    }

    // Verificar si quedó válido
    try {
        JSON.parse(t);
        return { ok: true, texto: t, cambios };
    } catch (_) {
        return { ok: false, cambios };
    }
}

// ============================================================
//  RENDER: ANÁLISIS
// ============================================================
function actualizarEstado(resultado) {
    const dot = document.querySelector('.vj-dot');
    const txt = document.getElementById('estadoTexto');
    const badge = document.getElementById('badgeErrores');
    if (!dot || !txt) return;

    dot.className = 'vj-dot';

    if (!resultado) {
        dot.classList.add('vj-dot-vacio');
        txt.textContent = 'Esperando JSON…';
        if (badge) badge.hidden = true;
        return;
    }

    if (resultado.ok) {
        dot.classList.add('vj-dot-ok');
        txt.textContent = 'JSON válido';
        if (badge) badge.hidden = true;
    } else {
        dot.classList.add('vj-dot-error');
        if (resultado.error && resultado.error.linea) {
            txt.textContent = `Error en Ln ${resultado.error.linea}, Col ${resultado.error.col}`;
        } else {
            txt.textContent = 'JSON inválido';
        }
        if (badge) {
            badge.hidden = false;
            badge.textContent = '1';
        }
    }
}

function renderAnalisis(resultado) {
    const cont = document.getElementById('panelAnalisisContenido');
    const vacio = document.getElementById('panelVacioAnalisis');
    if (!cont) return;

    if (!resultado || (!resultado.error && !resultado.ok)) {
        vacio.hidden = false;
        cont.hidden = true;
        return;
    }

    vacio.hidden = true;
    cont.hidden = false;

    let html = '';

    if (!resultado.ok && resultado.error) {
        html += `
            <div class="vj-alerta vj-alerta-error">
                <div class="vj-alerta-icono"><i data-lucide="x-circle"></i></div>
                <div>
                    <div class="vj-alerta-titulo">Error de sintaxis</div>
                    <div class="vj-alerta-detalle">${escaparHTML(resultado.error.mensaje)}</div>
                    ${resultado.error.linea ? `<div class="vj-alerta-meta">Línea ${resultado.error.linea}, columna ${resultado.error.col}</div>` : ''}
                </div>
            </div>`;
    } else if (resultado.ok && resultado.stats) {
        const s = resultado.stats;
        html += `
            <div class="vj-alerta vj-alerta-ok">
                <div class="vj-alerta-icono"><i data-lucide="check-circle-2"></i></div>
                <div>
                    <div class="vj-alerta-titulo">JSON válido</div>
                    <div class="vj-alerta-detalle">Sin errores de sintaxis.</div>
                </div>
            </div>

            <div class="vj-stats-grid">
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="layers"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.maxDepth}</span>
                        <span class="vj-stat-label">profundidad</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="key"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.keys}</span>
                        <span class="vj-stat-label">claves</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="box"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.objetos}</span>
                        <span class="vj-stat-label">objetos</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="list"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.arrays}</span>
                        <span class="vj-stat-label">arrays</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="text"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.strings}</span>
                        <span class="vj-stat-label">strings</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="hash"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.numeros}</span>
                        <span class="vj-stat-label">números</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="toggle-left"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${s.booleanos}</span>
                        <span class="vj-stat-label">booleanos</span>
                    </div>
                </div>
                <div class="vj-stat">
                    <div class="vj-stat-icono"><i data-lucide="hard-drive"></i></div>
                    <div class="vj-stat-info">
                        <span class="vj-stat-valor">${formatearBytes(s.bytes)}</span>
                        <span class="vj-stat-label">tamaño</span>
                    </div>
                </div>
            </div>`;
    }

    // Sugerencias
    if (resultado.sugerencias && resultado.sugerencias.length > 0) {
        html += `<div class="vj-panel-seccion-titulo">
            <i data-lucide="lightbulb"></i>
            <span>Sugerencias (${resultado.sugerencias.length})</span>
        </div>`;
        html += resultado.sugerencias.map(s => `
            <div class="vj-sugerencia vj-sugerencia-${s.tipo}">
                <div class="vj-sugerencia-icono"><i data-lucide="${s.icono}"></i></div>
                <div class="vj-sugerencia-info">
                    <div class="vj-sugerencia-titulo">${escaparHTML(s.titulo)}</div>
                    <div class="vj-sugerencia-detalle">${escaparHTML(s.detalle)}</div>
                </div>
            </div>
        `).join('');
    } else if (resultado.ok) {
        html += `
            <div class="vj-sin-sugerencias">
                <i data-lucide="sparkles"></i>
                <span>Sin sugerencias — tu JSON se ve bien.</span>
            </div>`;
    }

    cont.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  RENDER: ÁRBOL
// ============================================================
function renderArbol() {
    const cont = document.getElementById('arbolContenido');
    const vacio = document.getElementById('panelVacioArbol');
    if (!cont || !vacio) return;

    if (!ultimoValido || ultimoObjeto === null) {
        vacio.hidden = false;
        cont.hidden = true;
        return;
    }

    vacio.hidden = true;
    cont.hidden = false;

    cont.innerHTML = renderNodoArbol(ultimoObjeto, null, 0);
    if (window.lucide) window.lucide.createIcons();

    // Bind colapsables
    cont.querySelectorAll('.vj-arbol-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.vj-arbol-nodo');
            wrap.classList.toggle('colapsado');
            btn.querySelector('[data-lucide]').setAttribute(
                'data-lucide',
                wrap.classList.contains('colapsado') ? 'chevron-right' : 'chevron-down'
            );
            if (window.lucide) window.lucide.createIcons();
        });
    });
}

function renderNodoArbol(valor, key, depth) {
    const indent = 14 * depth;
    const keyHTML = key !== null && key !== undefined
        ? `<span class="vj-arbol-key">${escaparHTML(String(key))}</span><span class="vj-arbol-colon">:</span> `
        : '';

    if (valor === null) {
        return `<div class="vj-arbol-linea" style="padding-left:${indent}px">${keyHTML}<span class="vj-arbol-valor vj-arbol-null">null</span></div>`;
    }

    const t = typeof valor;
    if (t === 'string') {
        return `<div class="vj-arbol-linea" style="padding-left:${indent}px">${keyHTML}<span class="vj-arbol-valor vj-arbol-string">"${escaparHTML(valor)}"</span></div>`;
    }
    if (t === 'number') {
        return `<div class="vj-arbol-linea" style="padding-left:${indent}px">${keyHTML}<span class="vj-arbol-valor vj-arbol-number">${valor}</span></div>`;
    }
    if (t === 'boolean') {
        return `<div class="vj-arbol-linea" style="padding-left:${indent}px">${keyHTML}<span class="vj-arbol-valor vj-arbol-bool">${valor}</span></div>`;
    }

    const esArr = Array.isArray(valor);
    const entradas = esArr ? valor.map((v, i) => [i, v]) : Object.entries(valor);
    const apertura = esArr ? '[' : '{';
    const cierre = esArr ? ']' : '}';
    const count = entradas.length;

    return `
        <div class="vj-arbol-nodo">
            <div class="vj-arbol-linea vj-arbol-cabeza" style="padding-left:${indent}px">
                <button class="vj-arbol-toggle"><i data-lucide="chevron-down"></i></button>
                ${keyHTML}<span class="vj-arbol-bracket">${apertura}</span>
                <span class="vj-arbol-count">${count} ${esArr ? 'items' : 'props'}</span>
                <span class="vj-arbol-bracket">${cierre}</span>
            </div>
            <div class="vj-arbol-hijos">
                ${entradas.map(([k, v]) => renderNodoArbol(v, k, depth + 1)).join('')}
            </div>
        </div>`;
}

// ============================================================
//  ACTUALIZAR TODO
// ============================================================
function actualizarStatsFooter(texto) {
    const lineas = texto ? texto.split('\n').length : 0;
    const bytes = new Blob([texto]).size;
    const fs = document.getElementById('footerStats');
    if (fs) fs.textContent = `${lineas} líneas · ${formatearBytes(bytes)}`;
}

function actualizarCursorInfo() {
    const ta = document.getElementById('editor');
    if (!ta) return;
    const pos = ta.selectionStart;
    const texto = ta.value;
    let linea = 1, col = 1;
    for (let i = 0; i < pos; i++) {
        if (texto[i] === '\n') { linea++; col = 1; }
        else col++;
    }
    const fc = document.getElementById('footerCursor');
    if (fc) fc.textContent = `Ln ${linea}, Col ${col}`;
}

function analizarYRenderizar() {
    const texto = document.getElementById('editor').value;

    let resultado;
    if (!texto.trim()) {
        resultado = null;
        ultimoValido = false;
        ultimoObjeto = null;
    } else {
        resultado = analizarTexto(texto);
        ultimoValido = resultado.ok;
        ultimoObjeto = resultado.ok ? resultado.datos : null;
    }

    actualizarEstado(resultado);
    renderAnalisis(resultado);
    if (tabActual === 'arbol') renderArbol();
    actualizarStatsFooter(texto);
}

// ============================================================
//  ACCIONES
// ============================================================
function formatear() {
    const ta = document.getElementById('editor');
    const texto = ta.value;
    if (!texto.trim()) { toast('Nada para formatear', 'info'); return; }
    try {
        const datos = JSON.parse(texto);
        ta.value = JSON.stringify(datos, null, getIndent());
        analizarYRenderizar();
        guardarBorrador();
        toast('Formateado', 'success');
    } catch (e) {
        toast('No se puede formatear: JSON inválido', 'error');
    }
}

function minificar() {
    const ta = document.getElementById('editor');
    const texto = ta.value;
    if (!texto.trim()) { toast('Nada para minificar', 'info'); return; }
    try {
        const datos = JSON.parse(texto);
        ta.value = JSON.stringify(datos);
        analizarYRenderizar();
        guardarBorrador();
        toast('Minificado', 'success');
    } catch (e) {
        toast('No se puede minificar: JSON inválido', 'error');
    }
}

function reparar() {
    const ta = document.getElementById('editor');
    const texto = ta.value;
    if (!texto.trim()) { toast('Nada para reparar', 'info'); return; }

    const r = intentarReparar(texto);
    if (r.ok && r.cambios > 0) {
        ta.value = JSON.stringify(JSON.parse(r.texto), null, getIndent());
        analizarYRenderizar();
        guardarBorrador();
        toast(`Reparado (${r.cambios} cambio${r.cambios === 1 ? '' : 's'})`, 'success');
    } else if (r.ok) {
        toast('Ya estaba correcto', 'info');
    } else {
        toast('No se pudo reparar automáticamente', 'error');
    }
}

function limpiar() {
    const ta = document.getElementById('editor');
    if (!ta.value.trim()) return;
    if (!confirm('¿Vaciar el editor? Se perderá el contenido actual.')) return;
    ta.value = '';
    analizarYRenderizar();
    guardarBorrador();
    toast('Editor vacío', 'info');
}

async function copiar() {
    const ta = document.getElementById('editor');
    const texto = ta.value;
    if (!texto.trim()) { toast('Nada para copiar', 'info'); return; }
    try {
        await navigator.clipboard.writeText(texto);
        toast('Copiado', 'success');
    } catch (_) {
        ta.select();
        try { document.execCommand('copy'); toast('Copiado', 'success'); }
        catch (e) { toast('No se pudo copiar', 'error'); }
    }
}

function descargar() {
    const ta = document.getElementById('editor');
    const texto = ta.value;
    if (!texto.trim()) { toast('Nada para descargar', 'info'); return; }

    // Intentar validar antes de descargar
    let aDescargar = texto;
    try {
        const datos = JSON.parse(texto);
        aDescargar = JSON.stringify(datos, null, getIndent());
    } catch (_) {
        if (!confirm('El JSON tiene errores. ¿Descargar igual?')) return;
    }

    try {
        const blob = new Blob([aDescargar], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'datos.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
        toast('Descargando datos.json', 'success');
    } catch (e) {
        toast('No se pudo descargar', 'error');
    }
}

function cargarArchivo(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        toast('Archivo demasiado grande (máx 5 MB)', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const ta = document.getElementById('editor');
        ta.value = String(e.target.result || '');
        analizarYRenderizar();
        guardarBorrador();
        toast(`Archivo cargado (${formatearBytes(file.size)})`, 'success');
    };
    reader.onerror = () => toast('No se pudo leer el archivo', 'error');
    reader.readAsText(file, 'utf-8');
}

// ============================================================
//  BORRADOR (localStorage)
// ============================================================
function guardarBorrador() {
    try {
        const ta = document.getElementById('editor');
        localStorage.setItem(claveBorrador(), ta.value);
    } catch (_) {}
}

function cargarBorrador() {
    try {
        const raw = localStorage.getItem(claveBorrador());
        return raw || '';
    } catch (_) { return ''; }
}

// ============================================================
//  BIND UI
// ============================================================
function bindUI() {
    const ta = document.getElementById('editor');

    // Editor
    ta.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            analizarYRenderizar();
            guardarBorrador();
        }, 250);
        actualizarStatsFooter(ta.value);
        actualizarCursorInfo();
    });

    ta.addEventListener('keyup', actualizarCursorInfo);
    ta.addEventListener('click', actualizarCursorInfo);

    // Tab en el textarea → insertar indentación
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const v = ta.value;
            if (start === end) {
                ta.value = v.slice(0, start) + '  ' + v.slice(end);
                ta.selectionStart = ta.selectionEnd = start + 2;
            } else {
                ta.value = v.slice(0, start) + '  ' + v.slice(end);
                ta.selectionStart = ta.selectionEnd = start + 2;
            }
            ta.dispatchEvent(new Event('input'));
        }
        // Ctrl+S → descargar
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            descargar();
        }
    });

    // Drag & drop
    ta.addEventListener('dragover', (e) => {
        e.preventDefault();
        ta.classList.add('drag-over');
    });
    ta.addEventListener('dragleave', () => ta.classList.remove('drag-over'));
    ta.addEventListener('drop', (e) => {
        e.preventDefault();
        ta.classList.remove('drag-over');
        const f = e.dataTransfer.files?.[0];
        if (f) cargarArchivo(f);
    });

    // Toolbar
    document.getElementById('btnFormatear')?.addEventListener('click', formatear);
    document.getElementById('btnMinificar')?.addEventListener('click', minificar);
    document.getElementById('btnReparar')?.addEventListener('click', reparar);
    document.getElementById('btnLimpiar')?.addEventListener('click', limpiar);
    document.getElementById('btnCopiar')?.addEventListener('click', copiar);
    document.getElementById('btnDescargar')?.addEventListener('click', descargar);

    // Cargar archivo
    document.getElementById('btnCargar')?.addEventListener('click', () => {
        document.getElementById('inputArchivo').click();
    });
    document.getElementById('inputArchivo')?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) cargarArchivo(f);
        e.target.value = '';
    });

    // Cambiar indentación → reformatea si es válido
    document.getElementById('selectIndent')?.addEventListener('change', () => {
        if (ultimoValido) {
            formatear();
        }
    });

    // Tabs del panel
    document.querySelectorAll('.vj-panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.vj-panel-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            tabActual = tab.dataset.tab;
            const esAnalisis = tabActual === 'analisis';
            document.getElementById('panelAnalisis').hidden = !esAnalisis;
            document.getElementById('panelArbol').hidden = esAnalisis;
            if (tabActual === 'arbol') renderArbol();
        });
    });

    // Atajos
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Nada por ahora, pero reservado
        }
    });
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || { codigo: 'anon', nombre: 'Anónimo' };

    bindUI();

    // Cargar borrador guardado
    const borrador = cargarBorrador();
    if (borrador) {
        document.getElementById('editor').value = borrador;
    }

    analizarYRenderizar();
    actualizarCursorInfo();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
