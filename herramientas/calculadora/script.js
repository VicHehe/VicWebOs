// ============================================================
//  Calculadora — Calculadora básica + 3 funciones premium
//  Compras persistentes en app/calculadora/calculadora.json
//  Historial por usuario en IndexedDB (máx 3)
// ============================================================

const COMPRAS_FILE       = 'app/calculadora/calculadora.json';
const HIST_KEY_PREFIX    = 'calc_hist_';
const HIST_MAX           = 3;
const MENSAJE_TEMA       = 'vicwebos_tema_cambio';
const MAX_FILAS_GRAFICO  = 8;

const PRECIOS = {
    intereses: 5,
    fechas:    5,
    graficos: 10
};

const COLORES_GRAFICO = [
    '#8B5CF6', '#EC4899', '#10B981', '#F97316',
    '#3B82F6', '#EAB308', '#EF4444', '#06B6D4'
];

// ---------- ESTADO ----------
let expresion = '0';
let compras = { intereses: false, fechas: false, graficos: false };
let historial = [];
let modoFecha = 'entre';

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
//  TEMA: heredar variables CSS del padre
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
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl','--shadow-glow',
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
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('calcToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'calc-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  HISTORIAL (IndexedDB por usuario)
// ============================================================
function rutaHistKey() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return HIST_KEY_PREFIX + cuenta.codigo;
}

async function cargarHistorial() {
    try {
        const key = rutaHistKey();
        if (!key) return [];
        const data = await idbGet(key);
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

async function guardarHistorial() {
    try {
        const key = rutaHistKey();
        if (!key) return;
        await idbSet(key, historial);
    } catch (e) { /* silencioso */ }
}

function agregarAlHistorial(expresion, resultado) {
    // Quitar duplicado si ya existe la misma expresión
    historial = historial.filter(h => h.expresion !== expresion);
    historial.unshift({ expresion, resultado });
    if (historial.length > HIST_MAX) historial = historial.slice(0, HIST_MAX);
    guardarHistorial();
    renderHistorialMini();
}

function renderHistorialMini() {
    const cont = document.getElementById('calcHistMini');
    if (!cont) return;
    cont.innerHTML = historial.map(h => `
        <button class="calc-hist-chip" data-expresion="${escapeAttr(h.expresion)}" title="${escapeAttr(h.expresion)} = ${escapeAttr(h.resultado)}">
            ${escapeHTML(h.expresion)} = ${escapeHTML(h.resultado)}
        </button>
    `).join('');

    cont.querySelectorAll('.calc-hist-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            expresion = btn.dataset.expresion;
            renderDisplay();
        });
    });
}

// ============================================================
//  COMPRAS (JSON global)
// ============================================================
async function cargarCompras() {
    const bd = BD();
    if (!bd) return;
    try {
        const data = await bd.leerArchivo(COMPRAS_FILE);
        const api = API();
        const cuenta = api?.obtenerCuenta?.();
        const codigo = cuenta?.codigo;
        if (codigo && data && data.compras && data.compras[codigo]) {
            compras = {
                intereses: !!data.compras[codigo].intereses,
                fechas:    !!data.compras[codigo].fechas,
                graficos:  !!data.compras[codigo].graficos
            };
        } else {
            compras = { intereses: false, fechas: false, graficos: false };
        }
    } catch (e) {
        compras = { intereses: false, fechas: false, graficos: false };
    }
}

async function guardarCompras() {
    const bd = BD();
    if (!bd) return;
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const codigo = cuenta?.codigo;
    if (!codigo) return;

    let data = null;
    try { data = await bd.leerArchivo(COMPRAS_FILE); } catch (e) { data = null; }
    if (!data || typeof data !== 'object') data = { version: 1, compras: {} };
    if (!data.compras || typeof data.compras !== 'object') data.compras = {};
    data.compras[codigo] = { ...compras };
    data.actualizado = new Date().toISOString();
    await bd.escribirArchivo(COMPRAS_FILE, data);
}

// ============================================================
//  COMPRA DE FUNCIÓN
// ============================================================
async function comprarFuncion(id) {
    const api = API();
    if (!api) return;

    const precio = PRECIOS[id] || 0;
    const nombres = { intereses: 'Intereses', fechas: 'Fechas', graficos: 'Gráficos' };

    const confirmado = confirm(`¿Comprar la función "${nombres[id]}" por ${precio} monedas?`);
    if (!confirmado) return;

    try {
        await api.gastoBoleta('🧮', 'calculadora', `Función ${nombres[id]}`, precio);
        compras[id] = true;
        await guardarCompras();
        actualizarUIFunciones();
        toast('¡Función desbloqueada!', 'success');
        // Abrir directamente el modal tras la compra
        setTimeout(() => abrirModalFuncion(id), 300);
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    }
}

// ============================================================
//  UI: FUNCIONES
// ============================================================
function actualizarUIFunciones() {
    const botones = {
        intereses: document.getElementById('funcIntereses'),
        fechas:    document.getElementById('funcFechas'),
        graficos:  document.getElementById('funcGraficos')
    };

    for (const id of Object.keys(botones)) {
        const btn = document.querySelector(`.calc-funcion-btn[data-funcion="${id}"]`);
        const estado = botones[id];
        if (!btn || !estado) continue;
        if (compras[id]) {
            btn.classList.add('comprada');
            estado.textContent = '✓ Listo';
        } else {
            btn.classList.remove('comprada');
            estado.textContent = `🔒 ${PRECIOS[id]} 🪙`;
        }
    }
}

function abrirModalFuncion(id) {
    if (!compras[id]) {
        comprarFuncion(id);
        return;
    }
    const modal = document.getElementById(
        id === 'intereses' ? 'modalIntereses' :
        id === 'fechas' ? 'modalFechas' :
        'modalGraficos'
    );
    if (modal) modal.hidden = false;
}

function cerrarModal(id) {
    const modal = document.getElementById(
        id === 'intereses' ? 'modalIntereses' :
        id === 'fechas' ? 'modalFechas' :
        'modalGraficos'
    );
    if (modal) modal.hidden = true;
}

// ============================================================
//  CALCULADORA BÁSICA
// ============================================================
function renderDisplay() {
    const exp = document.getElementById('calcExpresion');
    const prev = document.getElementById('calcResultadoPreview');
    if (!exp || !prev) return;

    exp.textContent = expresion || '0';

    // Preview del resultado si la expresión es evaluable
    const preview = calcularPreview(expresion);
    if (preview !== null && preview !== expresion) {
        prev.textContent = preview;
    } else {
        prev.textContent = '';
    }
}

function calcularPreview(expr) {
    try {
        // No evaluar si termina en operador
        if (/[+\-*/.]$/.test(expr)) return null;
        if (!/[+\-*/]/.test(expr)) return null;

        // Reemplazar % por /100 en contexto simple
        let limpio = expr.replace(/%/g, '/100');
        // Validar solo caracteres permitidos
        if (!/^[0-9+\-*/().\s]+$/.test(limpio)) return null;

        const r = Function('"use strict"; return (' + limpio + ')')();
        if (typeof r !== 'number' || !isFinite(r)) return null;
        return formatearNumero(r);
    } catch (e) {
        return null;
    }
}

function formatearNumero(n) {
    if (!isFinite(n)) return '∞';
    // Máximo 8 decimales, sin ceros trailing
    const redondeado = Math.round(n * 1e8) / 1e8;
    return String(redondeado);
}

function presionarNumero(n) {
    if (expresion === '0' && n !== '.') {
        expresion = n;
    } else if (n === '.' && /\.\d*$/.test(expresion)) {
        // ya tiene punto en el número actual
        return;
    } else if (n === '.' && (expresion === '0' || /[+\-*/]$/.test(expresion))) {
        expresion += '0.';
    } else {
        expresion += n;
    }
    renderDisplay();
}

function presionarOperador(op) {
    if (/[+\-*/]$/.test(expresion)) {
        expresion = expresion.slice(0, -1) + op;
    } else {
        expresion += op;
    }
    renderDisplay();
}

function presionarClear() {
    expresion = '0';
    renderDisplay();
}

function presionarBack() {
    if (expresion.length <= 1) {
        expresion = '0';
    } else {
        expresion = expresion.slice(0, -1);
    }
    renderDisplay();
}

function presionarPow() {
    const preview = calcularPreview(expresion);
    if (preview !== null) {
        const r = Function('"use strict"; return (' + expresion.replace(/%/g, '/100') + ')')();
        expresion = formatearNumero(r * r);
        renderDisplay();
    } else {
        // Aplicar cuadrado al último número
        expresion = expresion.replace(/(\d+\.?\d*)$/, (m) => {
            const n = parseFloat(m);
            return formatearNumero(n * n);
        });
        renderDisplay();
    }
}

function presionarPercent() {
    // Convierte el último número en su versión /100
    expresion = expresion.replace(/(\d+\.?\d*)$/, (m) => {
        const n = parseFloat(m);
        return formatearNumero(n / 100);
    });
    renderDisplay();
}

function presionarEquals() {
    const preview = calcularPreview(expresion);
    if (preview === null) return;
    agregarAlHistorial(expresion, preview);
    expresion = preview;
    renderDisplay();
}

// ============================================================
//  MODAL: INTERESES
// ============================================================
function calcularInteres() {
    const capital = parseFloat(document.getElementById('intCapital').value);
    const tasa    = parseFloat(document.getElementById('intTasa').value);
    const tiempo  = parseFloat(document.getElementById('intTiempo').value);
    const unidad  = document.getElementById('intUnidad').value;

    if (!isFinite(capital) || !isFinite(tasa) || !isFinite(tiempo) || capital <= 0 || tasa <= 0 || tiempo <= 0) {
        toast('Revisa los datos: deben ser positivos', 'error');
        return;
    }

    // Normalizar tiempo a años
    let t = tiempo;
    if (unidad === 'dias')  t = tiempo / 365;
    if (unidad === 'meses') t = tiempo / 12;

    // Interés simple: C · r · t / 100
    const interesSimple = capital * (tasa / 100) * t;
    const totalSimple = capital + interesSimple;

    // Interés compuesto: C · (1 + r/100)^t − C
    const montoCompuesto = capital * Math.pow(1 + tasa / 100, t);
    const interesCompuesto = montoCompuesto - capital;

    const fmt = (n) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 });

    const panel = document.getElementById('intResultado');
    panel.style.display = 'flex';
    panel.innerHTML = `
        <div class="calc-resultado-fila">
            <span class="calc-resultado-label">Interés simple</span>
            <span class="calc-resultado-valor">${fmt(interesSimple)}</span>
        </div>
        <div class="calc-resultado-fila">
            <span class="calc-resultado-label">Total con simple</span>
            <span class="calc-resultado-valor">${fmt(totalSimple)}</span>
        </div>
        <div class="calc-resultado-fila">
            <span class="calc-resultado-label">Interés compuesto</span>
            <span class="calc-resultado-valor">${fmt(interesCompuesto)}</span>
        </div>
        <div class="calc-resultado-fila calc-resultado-destacado">
            <span class="calc-resultado-label">Total con compuesto</span>
            <span class="calc-resultado-valor">${fmt(montoCompuesto)}</span>
        </div>
        <p class="calc-resultado-sub">Tasa anual del ${tasa}% aplicada durante ${tiempo} ${unidad}.</p>
    `;
}

// ============================================================
//  MODAL: FECHAS
// ============================================================
function cambiarModoFecha(modo) {
    modoFecha = modo;
    document.querySelectorAll('.calc-modo-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.modo === modo);
    });
    document.getElementById('fechaModoEntre').style.display = modo === 'entre' ? 'flex' : 'none';
    document.getElementById('fechaModoDesdeHoy').style.display = modo === 'desde-hoy' ? 'flex' : 'none';
    document.getElementById('fechaResultado').style.display = 'none';
}

function calcularFecha() {
    let fechaA, fechaB;
    if (modoFecha === 'entre') {
        const v1 = document.getElementById('fecha1').value;
        const v2 = document.getElementById('fecha2').value;
        if (!v1 || !v2) { toast('Selecciona las dos fechas', 'error'); return; }
        fechaA = new Date(v1 + 'T00:00:00');
        fechaB = new Date(v2 + 'T00:00:00');
    } else {
        const v = document.getElementById('fechaObjetivo').value;
        if (!v) { toast('Selecciona una fecha', 'error'); return; }
        fechaA = new Date();
        fechaA.setHours(0,0,0,0);
        fechaB = new Date(v + 'T00:00:00');
    }

    const ms = fechaB - fechaA;
    const abs = Math.abs(ms);
    const futuro = ms > 0;

    const totalDias = Math.floor(abs / (1000 * 60 * 60 * 24));
    const totalHoras = Math.floor(abs / (1000 * 60 * 60));
    const totalMin = Math.floor(abs / (1000 * 60));

    // Desglose años/meses/días
    let desde, hasta;
    if (futuro) { desde = new Date(fechaA); hasta = new Date(fechaB); }
    else        { desde = new Date(fechaB); hasta = new Date(fechaA); }

    let años = hasta.getFullYear() - desde.getFullYear();
    let meses = hasta.getMonth() - desde.getMonth();
    let dias = hasta.getDate() - desde.getDate();

    if (dias < 0) {
        meses--;
        const ultimoDiaMesAnterior = new Date(hasta.getFullYear(), hasta.getMonth(), 0).getDate();
        dias += ultimoDiaMesAnterior;
    }
    if (meses < 0) {
        años--;
        meses += 12;
    }

    const fmtFecha = (d) => d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

    const titulo = futuro
        ? (modoFecha === 'entre' ? 'Faltan' : 'Faltan')
        : (modoFecha === 'entre' ? 'Pasaron' : 'Ya pasó');

    const panel = document.getElementById('fechaResultado');
    panel.style.display = 'flex';
    panel.innerHTML = `
        <div class="calc-resultado-fila">
            <span class="calc-resultado-label">${fmtFecha(desde)}</span>
            <span class="calc-resultado-label">→</span>
            <span class="calc-resultado-valor">${fmtFecha(hasta)}</span>
        </div>
        <div class="calc-resultado-fila calc-resultado-destacado">
            <span class="calc-resultado-label">${titulo}</span>
            <span class="calc-resultado-valor">${años} ${años === 1 ? 'año' : 'años'}, ${meses} ${meses === 1 ? 'mes' : 'meses'}, ${dias} ${dias === 1 ? 'día' : 'días'}</span>
        </div>
        <p class="calc-resultado-sub">
            Total: ${totalDias.toLocaleString('es-CL')} días · ${totalHoras.toLocaleString('es-CL')} horas · ${totalMin.toLocaleString('es-CL')} minutos.
        </p>
    `;
}

// ============================================================
//  MODAL: GRÁFICOS
// ============================================================
function crearFilaGrafico(nombre = '', valor = '') {
    const fila = document.createElement('div');
    fila.className = 'calc-grafico-fila';
    fila.innerHTML = `
        <input type="text" class="graf-nombre" placeholder="Nombre" value="${escapeAttr(nombre)}" maxlength="30">
        <input type="number" class="graf-valor" placeholder="0" step="any" value="${escapeAttr(String(valor))}">
        <button class="calc-btn-eliminar-fila" title="Quitar"><i data-lucide="trash-2"></i></button>
    `;
    const btnEliminar = fila.querySelector('.calc-btn-eliminar-fila');
    btnEliminar.addEventListener('click', () => {
        fila.remove();
        actualizarGrafico();
    });
    fila.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', actualizarGrafico);
    });
    return fila;
}

function anadirFilaGrafico(nombre = '', valor = '') {
    const cont = document.getElementById('grafFilas');
    if (!cont) return;
    if (cont.children.length >= MAX_FILAS_GRAFICO) {
        toast(`Máximo ${MAX_FILAS_GRAFICO} porciones`, 'error');
        return;
    }
    const fila = crearFilaGrafico(nombre, valor);
    cont.appendChild(fila);
    lucide.createIcons();
    actualizarGrafico();
}

function leerFilasGrafico() {
    const filas = document.querySelectorAll('#grafFilas .calc-grafico-fila');
    const datos = [];
    filas.forEach(f => {
        const nombre = f.querySelector('.graf-nombre').value.trim();
        const valor = parseFloat(f.querySelector('.graf-valor').value);
        if (nombre && isFinite(valor) && valor > 0) {
            datos.push({ nombre, valor });
        }
    });
    return datos;
}

function actualizarGrafico() {
    const datos = leerFilasGrafico();
    const cont = document.getElementById('grafResultado');

    if (datos.length === 0) {
        cont.style.display = 'none';
        cont.innerHTML = '';
        return;
    }

    const total = datos.reduce((a, d) => a + d.valor, 0);
    const cx = 90, cy = 90, r = 80;

    let anguloInicial = 0;
    let paths = '';
    datos.forEach((d, i) => {
        const angulo = (d.valor / total) * 360;
        const color = COLORES_GRAFICO[i % COLORES_GRAFICO.length];
        paths += `<path d="${arcPath(cx, cy, r, anguloInicial, anguloInicial + angulo)}" fill="${color}" stroke="var(--white, #FFFFFF)" stroke-width="2"/>`;
        anguloInicial += angulo;
    });

    // Si solo hay una porción, agregar círculo completo
    if (datos.length === 1) {
        paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORES_GRAFICO[0]}"/>`;
    }

    const leyenda = datos.map((d, i) => {
        const pct = ((d.valor / total) * 100).toFixed(1);
        const color = COLORES_GRAFICO[i % COLORES_GRAFICO.length];
        return `
            <div class="calc-leyenda-item">
                <span class="calc-leyenda-color" style="background:${color};"></span>
                <span class="calc-leyenda-nombre">${escapeHTML(d.nombre)}</span>
                <span class="calc-leyenda-valor">${pct}%</span>
            </div>
        `;
    }).join('');

    cont.style.display = 'flex';
    cont.innerHTML = `
        <svg class="calc-grafico-svg" viewBox="0 0 180 180">
            ${paths}
        </svg>
        <div class="calc-grafico-leyenda">${leyenda}</div>
    `;
}

function arcPath(cx, cy, r, startAngle, endAngle) {
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad   = (endAngle   - 90) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
}

// ============================================================
//  HELPERS DE ESCAPE
// ============================================================
function escapeHTML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function escapeAttr(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ============================================================
//  EVENTOS DEL TECLADO
// ============================================================
function inicializarTeclado() {
    document.querySelectorAll('.calc-btn-num').forEach(btn => {
        btn.addEventListener('click', () => presionarNumero(btn.dataset.num));
    });
    document.querySelectorAll('.calc-btn-op').forEach(btn => {
        btn.addEventListener('click', () => presionarOperador(btn.dataset.op));
    });
    document.querySelector('.calc-btn-eq')?.addEventListener('click', presionarEquals);

    document.querySelectorAll('.calc-btn-fn').forEach(btn => {
        btn.addEventListener('click', () => {
            const fn = btn.dataset.fn;
            if (fn === 'clear')   presionarClear();
            if (fn === 'back')    presionarBack();
            if (fn === 'pow')     presionarPow();
            if (fn === 'percent') presionarPercent();
        });
    });

    // Atajos de teclado físico
    document.addEventListener('keydown', (e) => {
        // No interferir si hay un input activo
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (/^[0-9]$/.test(e.key)) presionarNumero(e.key);
        else if (e.key === '.') presionarNumero('.');
        else if (['+', '-', '*', '/'].includes(e.key)) presionarOperador(e.key);
        else if (e.key === 'Enter' || e.key === '=') presionarEquals();
        else if (e.key === 'Backspace') presionarBack();
        else if (e.key === 'Escape') presionarClear();
        else if (e.key === '%') presionarPercent();
    });
}

// ============================================================
//  EVENTOS DE FUNCIONES
// ============================================================
function inicializarFunciones() {
    document.querySelectorAll('.calc-funcion-btn').forEach(btn => {
        btn.addEventListener('click', () => abrirModalFuncion(btn.dataset.funcion));
    });

    document.querySelectorAll('.calc-modal-cerrar').forEach(btn => {
        btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrar));
    });

    // Cerrar modal al click fuera
    ['modalIntereses', 'modalFechas', 'modalGraficos'].forEach(id => {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.hidden = true;
        });
    });

    document.getElementById('btnCalcularInteres')?.addEventListener('click', calcularInteres);
    document.getElementById('btnCalcularFecha')?.addEventListener('click', calcularFecha);

    // Modo fecha
    document.querySelectorAll('.calc-modo-btn').forEach(btn => {
        btn.addEventListener('click', () => cambiarModoFecha(btn.dataset.modo));
    });

    // Gráficos
    document.getElementById('btnAnadirFila')?.addEventListener('click', () => anadirFilaGrafico());
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    aplicarTemaDelPadre();

    // Badge del usuario
    const api = API();
    const cuenta = api?.obtenerCuenta?.();
    const badge = document.getElementById('calcUserBadge');
    if (badge) badge.textContent = cuenta ? `@${cuenta.codigo} · ${cuenta.nombre}` : '—';

    // Cargar historial y compras
    historial = await cargarHistorial();
    await cargarCompras();

    renderHistorialMini();
    actualizarUIFunciones();
    renderDisplay();

    inicializarTeclado();
    inicializarFunciones();

    // Fila inicial del gráfico si no hay
    const cont = document.getElementById('grafFilas');
    if (cont && cont.children.length === 0) {
        anadirFilaGrafico();
        anadirFilaGrafico();
    }

    // Valores por defecto en el modal de fechas
    const hoy = new Date().toISOString().split('T')[0];
    if (document.getElementById('fecha1')) document.getElementById('fecha1').value = hoy;
    if (document.getElementById('fechaObjetivo')) document.getElementById('fechaObjetivo').value = hoy;

    lucide.createIcons();
});
