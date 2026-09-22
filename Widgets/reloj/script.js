// ============================================================
//  Widget: Reloj — Cronómetro y Temporizador
//  ------------------------------------------------------------
//  Dos modos en un mismo widget:
//    - Cronómetro: cuenta hacia arriba con vueltas
//    - Temporizador: cuenta hacia atrás con presets
//
//  NO persiste nada: sin ConfigBD, sin IndexedDB, sin MasterHad.
//  Al cerrarse el widget, todo se reinicia.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';

// ============================================================
//  ESTADO — Cronómetro
// ============================================================
const crono = {
    corriendo: false,
    inicioTs: 0,
    acumulado: 0,
    vueltas: [],
    ultimaVuelta: 0,
    intervalId: null
};

// ============================================================
//  ESTADO — Temporizador
// ============================================================
const timer = {
    corriendo: false,
    totalMs: 0,
    restanteMs: 0,
    finTs: 0,
    intervalId: null,
    alertaActiva: false
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
//  UTILIDADES DE FORMATO
// ============================================================
function formatearCrono(ms) {
    if (ms < 0) ms = 0;
    const totalSeg = ms / 1000;
    const min = Math.floor(totalSeg / 60);
    const seg = Math.floor(totalSeg % 60);
    const dec = Math.floor((ms % 1000) / 100);
    return `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}.${dec}`;
}

function formatearTimer(ms) {
    if (ms < 0) ms = 0;
    const totalSeg = Math.ceil(ms / 1000);
    const h = Math.floor(totalSeg / 3600);
    const min = Math.floor((totalSeg % 3600) / 60);
    const seg = totalSeg % 60;
    if (h > 0) {
        return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
    }
    return `${String(min).padStart(2,'0')}:${String(seg).padStart(2,'0')}`;
}

// ============================================================
//  SONIDO DE ALERTA (Web Audio API — sin archivos externos)
// ============================================================
let _audioCtx = null;
function reproducirAlerta() {
    try {
        if (!_audioCtx) {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = _audioCtx;
        if (ctx.state === 'suspended') ctx.resume();

        const beep = (inicio, freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
            gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + inicio + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + inicio);
            osc.stop(ctx.currentTime + inicio + 0.2);
        };

        // 3 beeps ascendentes
        beep(0.00, 880);
        beep(0.25, 1100);
        beep(0.50, 1320);
    } catch (e) { /* silencioso */ }
}

// ============================================================
//  DOM
// ============================================================
const $ = (id) => document.getElementById(id);

const elDisplayCrono   = $('rlDisplayCrono');
const elBtnCronoPlay   = $('rlBtnCronoPlay');
const elBtnCronoVuelta = $('rlBtnCronoVuelta');
const elBtnCronoReset  = $('rlBtnCronoReset');
const elVueltas        = $('rlVueltas');

const elDisplayTimer   = $('rlDisplayTimer');
const elProgressFill   = $('rlProgressFill');
const elBtnTimerPlay   = $('rlBtnTimerPlay');
const elBtnTimerReset  = $('rlBtnTimerReset');
const elPresets        = document.querySelectorAll('.rl-preset');

const elModoCrono = document.querySelector('.rl-modo[data-modo="cronometro"]');
const elModoTimer = document.querySelector('.rl-modo[data-modo="temporizador"]');
const elTabs      = document.querySelectorAll('.rl-tab');

// ============================================================
//  CRONÓMETRO
// ============================================================
function cronoTotalMs() {
    if (crono.corriendo) {
        return crono.acumulado + (Date.now() - crono.inicioTs);
    }
    return crono.acumulado;
}

function cronoTick() {
    elDisplayCrono.textContent = formatearCrono(cronoTotalMs());
}

function cronoPlay() {
    if (crono.corriendo) {
        crono.acumulado = cronoTotalMs();
        crono.corriendo = false;
        clearInterval(crono.intervalId);
        crono.intervalId = null;
        elModoCrono.classList.remove('corriendo');
        elBtnCronoPlay.innerHTML = '<i data-lucide="play"></i>';
        if (window.lucide) window.lucide.createIcons();
    } else {
        crono.inicioTs = Date.now();
        crono.corriendo = true;
        elModoCrono.classList.add('corriendo');
        elBtnCronoPlay.innerHTML = '<i data-lucide="pause"></i>';
        elBtnCronoVuelta.disabled = false;
        elBtnCronoReset.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        crono.intervalId = setInterval(cronoTick, 100);
    }
    cronoTick();
}

function cronoVuelta() {
    if (!crono.corriendo && crono.acumulado === 0) return;
    const total = cronoTotalMs();
    const delta = total - crono.ultimaVuelta;
    crono.ultimaVuelta = total;
    crono.vueltas.unshift({ total, delta });
    if (crono.vueltas.length > 20) crono.vueltas.pop();
    renderVueltas();
}

function cronoReset() {
    clearInterval(crono.intervalId);
    crono.intervalId = null;
    crono.corriendo = false;
    crono.inicioTs = 0;
    crono.acumulado = 0;
    crono.vueltas = [];
    crono.ultimaVuelta = 0;

    elModoCrono.classList.remove('corriendo');
    elBtnCronoPlay.innerHTML = '<i data-lucide="play"></i>';
    elBtnCronoVuelta.disabled = true;
    elBtnCronoReset.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    elDisplayCrono.textContent = '00:00.0';
    renderVueltas();
}

function renderVueltas() {
    if (crono.vueltas.length === 0) {
        elVueltas.hidden = true;
        elVueltas.innerHTML = '';
        return;
    }
    elVueltas.hidden = false;
    elVueltas.innerHTML = crono.vueltas.map((v, i) => {
        const num = crono.vueltas.length - i;
        return `
            <div class="rl-vuelta">
                <span class="rl-vuelta-num">#${num}</span>
                <span class="rl-vuelta-tiempo">${formatearCrono(v.total)}</span>
                <span class="rl-vuelta-delta">+${formatearCrono(v.delta)}</span>
            </div>
        `;
    }).join('');
}

// ============================================================
//  TEMPORIZADOR
// ============================================================
function timerTick() {
    const restante = timer.corriendo
        ? Math.max(0, timer.finTs - Date.now())
        : timer.restanteMs;

    elDisplayTimer.textContent = formatearTimer(restante);

    const pct = timer.totalMs > 0
        ? Math.max(0, Math.min(100, (restante / timer.totalMs) * 100))
        : 0;
    elProgressFill.style.width = pct + '%';

    const alerta = timer.totalMs > 0 && restante <= 10000 && restante > 0 && timer.corriendo;
    elProgressFill.classList.toggle('alerta', alerta);

    if (timer.corriendo && restante <= 0) {
        timerTerminar();
    }
}

function timerTerminar() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.corriendo = false;
    timer.restanteMs = 0;

    elDisplayTimer.textContent = '00:00';
    elDisplayTimer.classList.add('rl-alerta');
    elProgressFill.style.width = '0%';
    elBtnTimerPlay.innerHTML = '<i data-lucide="rotate-ccw"></i>';
    elBtnTimerPlay.title = 'Reiniciar';
    elBtnTimerReset.disabled = true;
    elModoTimer.classList.remove('corriendo');
    if (window.lucide) window.lucide.createIcons();

    reproducirAlerta();
    if (navigator.vibrate) {
        try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) {}
    }
    timer.alertaActiva = true;
}

function timerPlay() {
    // Si ya terminó, el botón sirve para reiniciar
    if (timer.alertaActiva) {
        timerReset();
        return;
    }

    if (timer.corriendo) {
        // Pausar
        timer.restanteMs = Math.max(0, timer.finTs - Date.now());
        timer.corriendo = false;
        clearInterval(timer.intervalId);
        timer.intervalId = null;
        elModoTimer.classList.remove('corriendo');
        elBtnTimerPlay.innerHTML = '<i data-lucide="play"></i>';
        if (window.lucide) window.lucide.createIcons();
    } else {
        if (timer.totalMs <= 0) return;
        if (timer.restanteMs <= 0) timer.restanteMs = timer.totalMs;

        timer.finTs = Date.now() + timer.restanteMs;
        timer.corriendo = true;
        elModoTimer.classList.add('corriendo');
        elBtnTimerPlay.innerHTML = '<i data-lucide="pause"></i>';
        elBtnTimerReset.disabled = false;
        if (window.lucide) window.lucide.createIcons();
        timer.intervalId = setInterval(timerTick, 200);
    }
    timerTick();
}

function timerReset() {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.corriendo = false;
    timer.restanteMs = timer.totalMs;
    timer.alertaActiva = false;

    elDisplayTimer.classList.remove('rl-alerta');
    elModoTimer.classList.remove('corriendo');
    elBtnTimerPlay.innerHTML = '<i data-lucide="play"></i>';
    elBtnTimerPlay.title = 'Iniciar';
    elBtnTimerPlay.disabled = timer.totalMs <= 0;
    elBtnTimerReset.disabled = true;
    if (window.lucide) window.lucide.createIcons();

    timerTick();
}

function timerElegirPreset(seg) {
    clearInterval(timer.intervalId);
    timer.intervalId = null;
    timer.corriendo = false;
    timer.alertaActiva = false;
    elDisplayTimer.classList.remove('rl-alerta');
    elModoTimer.classList.remove('corriendo');

    timer.totalMs = seg * 1000;
    timer.restanteMs = timer.totalMs;

    elDisplayTimer.textContent = formatearTimer(timer.totalMs);
    elProgressFill.style.width = '100%';
    elProgressFill.classList.remove('alerta');

    elBtnTimerPlay.disabled = false;
    elBtnTimerPlay.innerHTML = '<i data-lucide="play"></i>';
    elBtnTimerPlay.title = 'Iniciar';
    elBtnTimerReset.disabled = false;
    if (window.lucide) window.lucide.createIcons();

    elPresets.forEach(p => {
        p.classList.toggle('activo', Number(p.dataset.seg) === seg);
    });
}

// ============================================================
//  CAMBIO DE MODO
// ============================================================
function cambiarModo(modo) {
    elTabs.forEach(t => t.classList.toggle('active', t.dataset.modo === modo));
    document.querySelectorAll('.rl-modo').forEach(m => {
        m.classList.toggle('active', m.dataset.modo === modo);
    });
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();

    // Tabs de modo
    elTabs.forEach(t => {
        t.addEventListener('click', () => cambiarModo(t.dataset.modo));
    });

    // Cronómetro
    elBtnCronoPlay?.addEventListener('click', cronoPlay);
    elBtnCronoVuelta?.addEventListener('click', cronoVuelta);
    elBtnCronoReset?.addEventListener('click', cronoReset);
    elDisplayCrono.textContent = '00:00.0';

    // Temporizador
    elBtnTimerPlay?.addEventListener('click', timerPlay);
    elBtnTimerReset?.addEventListener('click', timerReset);
    elPresets.forEach(p => {
        p.addEventListener('click', () => timerElegirPreset(Number(p.dataset.seg)));
    });
    elDisplayTimer.textContent = '00:00';

    // Limpieza al cerrar el widget
    window.addEventListener('pagehide', () => {
        clearInterval(crono.intervalId);
        clearInterval(timer.intervalId);
    });

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
