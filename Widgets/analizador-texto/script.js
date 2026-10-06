'use strict';
const MENSAJE_TEMA = 'vicwebos_tema_cambio';

function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const stylePadre = getComputedStyle(rootPadre);
        const vars = ['--violet-50','--violet-100','--violet-400','--violet-500','--violet-700','--white','--gray-50','--gray-100','--gray-400','--gray-500','--gray-800','--border','--text','--r-sm','--r-md','--r-lg'];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {}
}
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

const input = document.getElementById('atInput');
const elPalabras = document.getElementById('atPalabras');
const elChars = document.getElementById('atChars');
const elCharsNoSpace = document.getElementById('atCharsNoSpace');
const elTiempo = document.getElementById('atTiempo');

input.addEventListener('input', () => {
    const text = input.value;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    // Palabras: secuencias de caracteres que no sean espacio
    const palabras = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const lineas = text === '' ? 0 : text.split(/\n/).length;
    
    // Tiempo de lectura: promedio 200 palabras por minuto
    const minutos = palabras / 200;
    let tiempoStr = '0s';
    if (minutos < 1) {
        const segs = Math.ceil(minutos * 60);
        tiempoStr = segs + 's';
    } else {
        tiempoStr = Math.ceil(minutos) + ' min';
    }

    elPalabras.textContent = palabras.toLocaleString();
    elChars.textContent = chars.toLocaleString();
    elCharsNoSpace.textContent = charsNoSpace.toLocaleString();
    elTiempo.textContent = tiempoStr;
});

document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    if (window.lucide) window.lucide.createIcons();
});
