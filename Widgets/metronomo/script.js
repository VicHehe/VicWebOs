'use strict';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

let bpm = 120;
let corriendo = false;
let intervalId = null;
let audioCtx = null;
let beatCount = 0;

const $ = (id) => document.getElementById(id);
const elWidget = $('mtWidget');
const elPendulo = $('mtPendulo');
const elBpmVal = $('mtBpmVal');
const elBtnPlay = $('mtPlay');
const elBtnMenos = $('mtMenos');
const elBtnMas = $('mtMas');

function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = ['--violet-50','--violet-100','--violet-300','--violet-400','--violet-500','--violet-600','--white','--gray-100','--gray-300','--gray-400','--gray-500','--gray-600','--gray-900','--border','--text','--r-lg','--accent-gradient-hover','--accent-shadow','--accent-shadow-hover'];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playClick(esAcento) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Acento más agudo (1200Hz), normal más grave (800Hz)
    osc.frequency.value = esAcento ? 1200 : 800;
    osc.type = 'sine';
    
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

function tick() {
    beatCount = (beatCount % 4) + 1; // Ciclo de 4 tiempos
    playClick(beatCount === 1);
    
    // Animación visual
    elPendulo.classList.add('latido');
    setTimeout(() => elPendulo.classList.remove('latido'), 100);
}

function start() {
    initAudio();
    corriendo = true;
    elWidget.classList.add('corriendo');
    elBtnPlay.innerHTML = '<i data-lucide="pause"></i>';
    elBtnPlay.title = 'Detener';
    if (window.lucide) window.lucide.createIcons();
    
    const msPorBeat = 60000 / bpm;
    tick(); // Primer beat inmediato
    intervalId = setInterval(tick, msPorBeat);
}

function stop() {
    corriendo = false;
    elWidget.classList.remove('corriendo');
    elBtnPlay.innerHTML = '<i data-lucide="play"></i>';
    elBtnPlay.title = 'Iniciar';
    if (window.lucide) window.lucide.createIcons();
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    beatCount = 0;
}

function toggle() {
    if (corriendo) stop();
    else start();
}

function cambiarBpm(delta) {
    bpm = Math.max(30, Math.min(250, bpm + delta));
    elBpmVal.textContent = bpm;
    if (corriendo) {
        // Reiniciar intervalo con nuevo BPM
        clearInterval(intervalId);
        const msPorBeat = 60000 / bpm;
        intervalId = setInterval(tick, msPorBeat);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    if (window.lucide) window.lucide.createIcons();
    
    elBtnPlay.addEventListener('click', toggle);
    elBtnMenos.addEventListener('click', () => cambiarBpm(-5));
    elBtnMas.addEventListener('click', () => cambiarBpm(5));
    
    // Limpieza al cerrar
    window.addEventListener('pagehide', stop);
});
