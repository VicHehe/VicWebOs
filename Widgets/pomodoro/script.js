// ============================================================
//  Widget: Pomodoro
//  Gestiona ciclos de 25 min (enfoque) y 5 min (descanso).
//  NO persiste datos: al cerrar el widget, el ciclo se reinicia.
// ============================================================
'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const FOCUS_TIME = 25 * 60; // 25 minutos
const BREAK_TIME = 5 * 60;  // 5 minutos
const MAX_CICLOS = 4;

// Estado
let estado = {
    fase: 'focus', // 'focus' | 'break'
    corriendo: false,
    tiempoRestante: FOCUS_TIME,
    ciclosCompletados: 0,
    finTs: 0,
    intervalId: null
};

// DOM
const $ = (id) => document.getElementById(id);
const elWidget = $('pmWidget');
const elTiempo = $('pmTiempo');
const elFaseBadge = $('pmFaseBadge');
const elFaseIcono = $('pmFaseIcono');
const elFaseTexto = $('pmFaseTexto');
const elCiclos = $('pmCiclos');
const elBtnPlay = $('pmBtnPlay');
const elBtnReset = $('pmBtnReset');
const elBtnSkip = $('pmBtnSkip');

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
//  UTILIDADES
// ============================================================
function formatearTiempo(seg) {
    if (seg < 0) seg = 0;
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function reproducirSonido(tipo) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();

        const beep = (inicio, freq, duracion) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + inicio + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + inicio);
            osc.stop(ctx.currentTime + inicio + duracion);
        };

        if (tipo === 'focus') {
            // 2 beeps suaves ascendentes
            beep(0.0, 660, 0.15);
            beep(0.2, 880, 0.2);
        } else {
            // 3 beeps rápidos (descanso terminado)
            beep(0.0, 880, 0.1);
            beep(0.15, 880, 0.1);
            beep(0.3, 1100, 0.15);
        }
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  RENDER Y LÓGICA
// ============================================================
function render() {
    // Tiempo
    elTiempo.textContent = formatearTiempo(estado.tiempoRestante);

    // Fase visual
    const esDescanso = estado.fase === 'break';
    elWidget.classList.toggle('modo-descanso', esDescanso);
    elWidget.classList.toggle('corriendo', estado.corriendo);
    
    elFaseTexto.textContent = esDescanso ? 'Descanso' : 'Enfoque';
    elFaseIcono.setAttribute('data-lucide', esDescanso ? 'coffee' : 'brain-circuit');

    // Ciclos (puntos)
    const dots = elCiclos.querySelectorAll('.pm-dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('completado', i < estado.ciclosCompletados);
    });

    // Botón Play/Pause
    elBtnPlay.innerHTML = estado.corriendo 
        ? '<i data-lucide="pause"></i>' 
        : '<i data-lucide="play"></i>';
    elBtnPlay.title = estado.corriendo ? 'Pausar' : 'Iniciar';

    if (window.lucide) window.lucide.createIcons();
}

function tick() {
    if (!estado.corriendo) return;

    const restante = Math.max(0, Math.ceil((estado.finTs - Date.now()) / 1000));
    estado.tiempoRestante = restante;

    if (restante <= 0) {
        cambiarFase();
    } else {
        elTiempo.textContent = formatearTiempo(restante);
    }
}

function cambiarFase() {
    estado.corriendo = false;
    clearInterval(estado.intervalId);
    estado.intervalId = null;

    if (estado.fase === 'focus') {
        // Terminó enfoque -> pasa a descanso
        estado.fase = 'break';
        estado.tiempoRestante = BREAK_TIME;
        reproducirSonido('focus'); // Suena cuando termina el enfoque
    } else {
        // Terminó descanso -> suma ciclo y pasa a enfoque
        estado.ciclosCompletados++;
        if (estado.ciclosCompletados >= MAX_CICLOS) {
            estado.ciclosCompletados = 0; // Reinicio de ronda completa
        }
        estado.fase = 'focus';
        estado.tiempoRestante = FOCUS_TIME;
        reproducirSonido('break'); // Suena cuando termina el descanso
    }

    if (navigator.vibrate) {
        try { navigator.vibrate([150, 50, 150]); } catch (e) {}
    }

    render();
}

function togglePlay() {
    if (estado.corriendo) {
        // Pausar
        estado.corriendo = false;
        estado.tiempoRestante = Math.max(0, Math.ceil((estado.finTs - Date.now()) / 1000));
        clearInterval(estado.intervalId);
        estado.intervalId = null;
    } else {
        // Iniciar
        if (estado.tiempoRestante <= 0) {
            estado.tiempoRestante = estado.fase === 'focus' ? FOCUS_TIME : BREAK_TIME;
        }
        estado.finTs = Date.now() + (estado.tiempoRestante * 1000);
        estado.corriendo = true;
        estado.intervalId = setInterval(tick, 250); // Tick cada 250ms para mayor precisión visual
    }
    render();
}

function resetearFase() {
    estado.corriendo = false;
    clearInterval(estado.intervalId);
    estado.intervalId = null;
    estado.tiempoRestante = estado.fase === 'focus' ? FOCUS_TIME : BREAK_TIME;
    render();
}

function saltarFase() {
    estado.corriendo = false;
    clearInterval(estado.intervalId);
    estado.intervalId = null;
    estado.tiempoRestante = 0; // Forzamos el cambio de fase
    cambiarFase();
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();
    
    elBtnPlay.addEventListener('click', togglePlay);
    elBtnReset.addEventListener('click', resetearFase);
    elBtnSkip.addEventListener('click', saltarFase);

    render();

    window.addEventListener('pagehide', () => {
        clearInterval(estado.intervalId);
    });
}

document.addEventListener('DOMContentLoaded', inicializar);
