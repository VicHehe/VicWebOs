'use strict';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO_BASE = 'app/matequiz/';

const MODOS = {
    sencillaz_base:        { nombre: "Sencillaz",            desc: "Sumas y restas",              ops: ['+', '-'], compleja: false, express: false, monedas: 5  },
    sencillaz_express:     { nombre: "Sencillaz Express",     desc: "Sumas y restas rápidas",      ops: ['+', '-'], compleja: false, express: true,  monedas: 10 },
    intermedias_base:      { nombre: "Intermedias",           desc: "Multiplicaciones y divisiones", ops: ['*', '/'], compleja: false, express: false, monedas: 10 },
    intermedias_express:   { nombre: "Intermedias Express",   desc: "Mult/Div rápidas",            ops: ['*', '/'], compleja: false, express: true,  monedas: 15 },
    mixta_sencilla_base:   { nombre: "Mixta Sencilla",        desc: "Las 4 operaciones (simples)", ops: ['+', '-', '*', '/'], compleja: false, express: false, monedas: 15 },
    mixta_sencilla_express:{ nombre: "Mixta Sencilla Express",desc: "Las 4 operaciones rápidas",   ops: ['+', '-', '*', '/'], compleja: false, express: true,  monedas: 20 },
    mixta_compleja_base:   { nombre: "Mixta Compleja",        desc: "Operaciones combinadas",      ops: ['+', '-', '*', '/'], compleja: true,  express: false, monedas: 20 },
    mixta_compleja_express:{ nombre: "Mixta Compleja Express",desc: "Combinadas rápidas",          ops: ['+', '-', '*', '/'], compleja: true,  express: true,  monedas: 25 }
};

let usuarioActual = null;
let datosUsuario = null;
let modoActual = null;
let preguntas = [];
let indicePregunta = 0;
let respuestasCorrectas = 0;
let timerInterval = null;
let tiempoRestante = 0;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

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
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('mqToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mq-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    if (!usuarioActual) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + 'matequiz.json';
}

async function cargarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object') {
            datosUsuario = data;
        } else {
            datosUsuario = {
                version: 1,
                racha: { dias: 0, ultimo_juego: null, congelada: false },
                jugado_hoy: { fecha: null, modos_completados: [] },
                total_monedas_ganadas: 0
            };
        }
    } catch (e) {
        datosUsuario = {
            version: 1, racha: { dias: 0, ultimo_juego: null, congelada: false },
            jugado_hoy: { fecha: null, modos_completados: [] }, total_monedas_ganadas: 0
        };
    }
    procesarRacha();
}

async function guardarDatos() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    await bd.escribirArchivo(ruta, datosUsuario);
}

function hoyStr() {
    return new Date().toISOString().split('T')[0];
}

function ayerStr() {
    return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}

function procesarRacha() {
    const hoy = hoyStr();
    const ayer = ayerStr();
    const ultimo = datosUsuario.racha.ultimo_juego;
    if (!ultimo) return;
    if (ultimo < ayer && !datosUsuario.racha.congelada) {
        datosUsuario.racha.dias = 0;
        datosUsuario.racha.ultimo_juego = null;
    }
}

// ============================================================
//  GENERADOR DE PREGUNTAS
//  Reglas:
//   - Operandos SIEMPRE positivos (números base > 0)
//   - Solo el RESULTADO puede ser negativo (ej: 3 - 7 = -4)
//   - Divisiones siempre exactas (se generan al revés)
//   - Distractores cercanos al resultado real
// ============================================================
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generarPregunta(modo) {
    if (modo.compleja) {
        return generarCompleja();
    }
    const op = modo.ops[randInt(0, modo.ops.length - 1)];
    switch (op) {
        case '+': return generarSuma();
        case '-': return generarResta();
        case '*': return generarMultiplicacion();
        case '/': return generarDivision();
    }
}

function generarSuma() {
    const a = randInt(1, 20);
    const b = randInt(1, 20);
    return crearPregunta(`${a} + ${b}`, a + b);
}

function generarResta() {
    // Operandos positivos, resultado puede ser negativo
    const a = randInt(1, 40);
    const b = randInt(1, 40);
    return crearPregunta(`${a} − ${b}`, a - b);
}

function generarMultiplicacion() {
    const a = randInt(2, 12);
    const b = randInt(2, 12);
    return crearPregunta(`${a} × ${b}`, a * b);
}

function generarDivision() {
    // División exacta: elijo resultado y divisor, calculo dividendo
    const resultado = randInt(2, 12);
    const divisor = randInt(2, 12);
    const dividendo = resultado * divisor;
    return crearPregunta(`${dividendo} ÷ ${divisor}`, resultado);
}

function generarCompleja() {
    // 3 operandos positivos, 2 operaciones de +, -, * (sin división para mantener enteros)
    const ops2 = ['+', '-', '*'];
    const op1 = ops2[randInt(0, ops2.length - 1)];
    const op2 = ops2[randInt(0, ops2.length - 1)];
    const a = randInt(1, 10);
    const b = randInt(1, 10);
    const c = randInt(1, 10);
    
    // Calcular respetando precedencia: * antes que + y -
    let respuesta;
    if (op1 === '*' && op2 === '*') {
        respuesta = a * b * c;
    } else if (op1 === '*') {
        // a * b op2 c
        const parcial = a * b;
        respuesta = op2 === '+' ? parcial + c : parcial - c;
    } else if (op2 === '*') {
        // a op1 (b * c)
        const parcial = b * c;
        respuesta = op1 === '+' ? a + parcial : a - parcial;
    } else {
        // Sin multiplicación, izquierda a derecha
        const parcial = op1 === '+' ? a + b : a - b;
        respuesta = op2 === '+' ? parcial + c : parcial - c;
    }
    
    const op1Str = op1 === '*' ? '×' : op1;
    const op2Str = op2 === '*' ? '×' : op2;
    return crearPregunta(`${a} ${op1Str} ${b} ${op2Str} ${c}`, respuesta);
}

function crearPregunta(texto, respuesta) {
    // Generar 3 distractores cercanos
    const distractores = new Set();
    distractores.add(respuesta);
    
    while (distractores.size < 4) {
        const offset = randInt(1, 5);
        const sign = Math.random() > 0.5 ? 1 : -1;
        const distractor = respuesta + (offset * sign);
        if (distractor !== respuesta) distractores.add(distractor);
    }
    
    const opciones = Array.from(distractores).sort(() => Math.random() - 0.5);
    return { texto, respuesta, opciones };
}

// ============================================================
//  UI VISTAS
// ============================================================
function mostrarVista(id) {
    document.querySelectorAll('.mq-view').forEach(v => {
        v.hidden = true;
        v.classList.remove('active');
    });
    const vista = document.getElementById(id);
    vista.hidden = false;
    setTimeout(() => vista.classList.add('active'), 10);
}

function renderDashboard() {
    const hoy = hoyStr();
    if (datosUsuario.jugado_hoy.fecha !== hoy) {
        datosUsuario.jugado_hoy = { fecha: hoy, modos_completados: [] };
        guardarDatos();
    }

    const alerta = document.getElementById('mqAlertaRacha');
    if (datosUsuario.racha.dias > 0 && datosUsuario.racha.ultimo_juego && datosUsuario.racha.ultimo_juego < ayerStr()) {
        alerta.hidden = false;
    } else {
        alerta.hidden = true;
    }

    document.getElementById('mqRachaDias').textContent = datosUsuario.racha.dias;

    const grid = document.getElementById('mqGridModos');
    grid.innerHTML = '';

    const colores = {
        sencillaz:       'linear-gradient(135deg, #10B981, #059669)',
        intermedias:     'linear-gradient(135deg, #3B82F6, #1D4ED8)',
        mixta_sencilla:  'linear-gradient(135deg, #F59E0B, #B45309)',
        mixta_compleja:  'linear-gradient(135deg, #EF4444, #B91C1C)'
    };

    for (const [key, modo] of Object.entries(MODOS)) {
        const bloqueado = datosUsuario.jugado_hoy.modos_completados.includes(key);
        const prefix = key.includes('compleja') ? 'mixta_compleja' 
                     : key.includes('sencilla') ? 'mixta_sencilla' 
                     : key.includes('intermedias') ? 'intermedias' 
                     : 'sencillaz';
        
        const div = document.createElement('div');
        div.className = 'mq-card' + (bloqueado ? ' bloqueada' : '');
        div.innerHTML = `
            <div class="mq-card-header">
                <div class="mq-card-icono" style="background: ${colores[prefix]}">
                    <i data-lucide="${modo.express ? 'zap' : 'brain'}"></i>
                </div>
                <div class="mq-card-info">
                    <div class="mq-card-nombre">${modo.nombre}</div>
                    <div class="mq-card-desc">${modo.desc}</div>
                </div>
            </div>
            <div class="mq-card-recompensa">
                <i data-lucide="coins"></i> +${modo.monedas} OS
            </div>
        `;
        if (!bloqueado) {
            div.addEventListener('click', () => iniciarJuego(key));
        }
        grid.appendChild(div);
    }
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  LÓGICA DE JUEGO
// ============================================================
function iniciarJuego(modoId) {
    modoActual = MODOS[modoId];
    modoActual.id = modoId;
    preguntas = [];
    for (let i = 0; i < 10; i++) {
        preguntas.push(generarPregunta(modoActual));
    }
    indicePregunta = 0;
    respuestasCorrectas = 0;
    mostrarVista('mqJuego');
    mostrarPregunta();
}

function mostrarPregunta() {
    if (indicePregunta >= 10) { finalizarJuego(); return; }

    const p = preguntas[indicePregunta];
    document.getElementById('mqPreguntaActual').textContent = indicePregunta + 1;
    document.getElementById('mqPreguntaTexto').textContent = `¿Cuánto es ${p.texto}?`;

    const grid = document.getElementById('mqOpcionesGrid');
    grid.innerHTML = '';
    p.opciones.forEach(op => {
        const btn = document.createElement('button');
        btn.className = 'mq-opcion-btn';
        btn.textContent = op;
        btn.addEventListener('click', () => responder(op, btn));
        grid.appendChild(btn);
    });

    const timerWrap = document.getElementById('mqTimerWrap');
    if (modoActual.express) {
        timerWrap.hidden = false;
        tiempoRestante = 5.0;
        actualizarTimerUI();
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            tiempoRestante -= 0.1;
            actualizarTimerUI();
            if (tiempoRestante <= 0) {
                clearInterval(timerInterval);
                responder(null, null);
            }
        }, 100);
    } else {
        timerWrap.hidden = true;
        clearInterval(timerInterval);
    }
    if (window.lucide) window.lucide.createIcons();
}

function actualizarTimerUI() {
    const bar = document.getElementById('mqTimerBar');
    const txt = document.getElementById('mqTimerTexto');
    if (bar) bar.style.width = ((tiempoRestante / 5.0) * 100) + '%';
    if (txt) txt.textContent = Math.max(0, tiempoRestante).toFixed(1) + 's';
}

function responder(opcionElegida, btnElement) {
    clearInterval(timerInterval);
    const botones = document.querySelectorAll('.mq-opcion-btn');
    botones.forEach(b => b.disabled = true);

    const p = preguntas[indicePregunta];
    const esCorrecto = (opcionElegida === p.respuesta);

    if (esCorrecto) {
        respuestasCorrectas++;
        if (btnElement) btnElement.classList.add('correcto');
    } else {
        if (btnElement) btnElement.classList.add('incorrecto');
        botones.forEach(b => {
            if (parseInt(b.textContent) === p.respuesta) b.classList.add('correcto');
        });
    }
    setTimeout(() => { indicePregunta++; mostrarPregunta(); }, 800);
}

async function finalizarJuego() {
    clearInterval(timerInterval);
    if (!datosUsuario.jugado_hoy.modos_completados.includes(modoActual.id)) {
        datosUsuario.jugado_hoy.modos_completados.push(modoActual.id);
    }

    const hoy = hoyStr();
    if (datosUsuario.racha.ultimo_juego !== hoy) {
        datosUsuario.racha.dias += 1;
        datosUsuario.racha.ultimo_juego = hoy;
        datosUsuario.racha.congelada = false;
        if (datosUsuario.racha.dias > 0 && datosUsuario.racha.dias % 30 === 0) {
            datosUsuario.total_monedas_ganadas += 50;
            await API().canjear('gift', 'matequiz', 'Bonus racha 30 días', 50);
            toast('¡Bonus de 30 días! +50 Monedas OS', 'success');
        }
    }

    let monedasGanadas = 0;
    const esExito = respuestasCorrectas >= 7;
    if (esExito) {
        monedasGanadas = modoActual.monedas;
        datosUsuario.total_monedas_ganadas += monedasGanadas;
        if (monedasGanadas > 0) {
            await API().canjear('coins', 'matequiz', `Ronda ${modoActual.nombre}`, monedasGanadas);
        }
    }
    await guardarDatos();

    document.getElementById('mqResultadoIcono').className = 'mq-resultado-icono ' + (esExito ? 'exito' : 'fallo');
    document.getElementById('mqResultadoIcono').innerHTML = `<i data-lucide="${esExito ? 'trophy' : 'heart-crack'}"></i>`;
    document.getElementById('mqResultadoTitulo').textContent = esExito ? '¡Excelente!' : '¡Sigue practicando!';
    document.getElementById('mqResultadoDesc').textContent = `Acertaste ${respuestasCorrectas} de 10 preguntas. ${esExito ? '¡Racha sumada y monedas ganadas!' : 'La racha igual suma por intentarlo.'}`;
    document.getElementById('mqMonedasGanadas').textContent = (monedasGanadas > 0 ? '+' : '') + monedasGanadas;
    document.getElementById('mqMonedasGanadas').style.color = monedasGanadas > 0 ? 'var(--violet-700, #6D28D9)' : 'var(--gray-400, #A1A1AD)';
    document.getElementById('mqRachaFinal').textContent = datosUsuario.racha.dias + (datosUsuario.racha.dias === 1 ? ' día' : ' días');

    mostrarVista('mqResultado');
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  SALVAR RACHA
// ============================================================
async function salvarRacha() {
    const api = API();
    if (!api) return;
    try {
        await api.gastoBoleta('heart-handshake', 'matequiz', 'Salvar racha', 5);
        datosUsuario.racha.ultimo_juego = ayerStr();
        datosUsuario.racha.congelada = false;
        await guardarDatos();
        toast('¡Racha salvada!', 'success');
        renderDashboard();
    } catch (e) {
        toast(e.message || 'No tienes suficientes monedas', 'error');
    }
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();
    const api = API();
    if (!api) { alert('MateQuiz necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitas iniciar sesión para usar MateQuiz.'); return; }
    document.getElementById('mqUserBadge').textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;
    await cargarDatos();
    renderDashboard();

    document.getElementById('mqBtnSalirJuego').addEventListener('click', () => {
        clearInterval(timerInterval);
        mostrarVista('mqDashboard');
        renderDashboard();
    });
    document.getElementById('mqBtnVolverInicio').addEventListener('click', () => {
        mostrarVista('mqDashboard');
        renderDashboard();
    });
    document.getElementById('mqBtnSalvarRacha').addEventListener('click', salvarRacha);
    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
