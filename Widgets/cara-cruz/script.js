// ============================================================
//  Widget: Cara o Cruz
//  ------------------------------------------------------------
//  Una moneda que gira y da un resultado. Nada más.
//  SIN persistencia: cada vez que se recarga, arranca de cero.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const DURACION_GIRO = 1700;     // ms — duración de la animación
const VUELTAS_MIN = 5;
const VUELTAS_MAX = 7;

let girando = false;
let rotacionActual = 0;         // grados acumulados en Y (no se resetea)

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
    } catch (e) {
        // iframe cross-origin o padre no listo → usar fallbacks del CSS
    }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  LANZAR MONEDA
// ============================================================
function lanzar() {
    if (girando) return;

    const moneda   = document.getElementById('ccMoneda');
    const inner    = document.getElementById('ccMonedaInner');
    const resultado = document.getElementById('ccResultado');
    if (!moneda || !inner || !resultado) return;

    girando = true;
    moneda.classList.add('girando');

    // Reset visual del resultado
    resultado.classList.remove('cara', 'cruz');
    resultado.textContent = '···';

    // Resultado al azar
    const esCara = Math.random() < 0.5;
    const anguloFinal = esCara ? 0 : 180;   // 0 = cara visible, 180 = cruz visible

    // Calcular delta para llegar al objetivo sumando vueltas completas
    const objetivoMod = ((anguloFinal % 360) + 360) % 360;
    const actualMod   = ((rotacionActual % 360) + 360) % 360;
    let delta = objetivoMod - actualMod;
    if (delta <= 0) delta += 360;

    const vueltas = VUELTAS_MIN + Math.floor(Math.random() * (VUELTAS_MAX - VUELTAS_MIN + 1));
    delta += 360 * vueltas;

    rotacionActual += delta;

    // Aplicar la rotación con transición
    inner.style.transition = `transform ${DURACION_GIRO}ms cubic-bezier(0.15, 0.85, 0.25, 1)`;
    void inner.offsetWidth;   // forzar reflow para que la transición se aplique
    inner.style.transform = `rotateY(${rotacionActual}deg)`;

    // Terminar
    setTimeout(() => {
        resultado.textContent = esCara ? 'Cara' : 'Cruz';
        resultado.classList.add(esCara ? 'cara' : 'cruz');
        moneda.classList.remove('girando');
        girando = false;
    }, DURACION_GIRO + 80);
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    const moneda = document.getElementById('ccMoneda');
    if (moneda) {
        moneda.addEventListener('click', lanzar);
        moneda.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                lanzar();
            }
        });
    }

    if (window.lucide) window.lucide.createIcons();
});
