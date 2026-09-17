// ============================================================
//  Widget: Dados
//  Tira 2 dados, muestra la suma y un historial breve.
//  SIN estado persistente: al recargar, todo se resetea.
// ============================================================

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MAX_HISTORIAL = 5;

let historial = [];
let tirando = false;

// ============================================================
//  TEMA: heredar variables CSS del padre (Regla 6)
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
            '--r-sm','--r-md','--r-lg','--r-xl','--r-full'
        ];
        vars.forEach(v => {
            const val = stylePadre.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {
        // iframe cross-origin o padre aún no listo → usar fallbacks del CSS
    }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  CARAS DEL DADO (SVG)
// ============================================================
// Coordenadas sobre viewBox 0 0 100 100. Radio = 9.
const POSICIONES = {
    C:  [50, 50],
    TL: [25, 25],
    TR: [75, 25],
    ML: [25, 50],
    MR: [75, 50],
    BL: [25, 75],
    BR: [75, 75]
};

const CARAS = {
    1: ['C'],
    2: ['TL', 'BR'],
    3: ['TL', 'C', 'BR'],
    4: ['TL', 'TR', 'BL', 'BR'],
    5: ['TL', 'TR', 'C', 'BL', 'BR'],
    6: ['TL', 'TR', 'ML', 'MR', 'BL', 'BR']
};

function svgDeCara(n) {
    const puntos = CARAS[n] || [];
    const circulos = puntos.map(p => {
        const [x, y] = POSICIONES[p];
        return `<circle class="dot" cx="${x}" cy="${y}" r="9" />`;
    }).join('');

    return `
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            ${circulos}
        </svg>
    `;
}

function pintarDado(el, valor) {
    if (!el) return;
    el.dataset.cara = valor;
    el.innerHTML = svgDeCara(valor);
}

// ============================================================
//  LÓGICA
// ============================================================
function randomCara() {
    return 1 + Math.floor(Math.random() * 6);
}

function tirar() {
    if (tirando) return;
    tirando = true;

    const dados = document.querySelectorAll('.dado');
    const btn = document.getElementById('dadosBtn');
    const sumaEl = document.getElementById('dadosSuma');
    if (!dados.length) return;

    // Reset visual
    sumaEl.textContent = '—';
    dados.forEach(d => {
        d.classList.remove('resultado');
        d.classList.add('rodando');
    });
    if (btn) btn.disabled = true;

    // Duración total del "ruedecito"
    const DURACION = 700;
    const INTERVALO = 60;
    const inicio = Date.now();

    const intervalo = setInterval(() => {
        dados.forEach(d => pintarDado(d, randomCara()));

        if (Date.now() - inicio >= DURACION) {
            clearInterval(intervalo);
            finalizar();
        }
    }, INTERVALO);

    function finalizar() {
        // Resultado definitivo
        const resultados = dados.map(() => randomCara());
        dados.forEach((d, i) => {
            d.classList.remove('rodando');
            pintarDado(d, resultados[i]);
            d.classList.add('resultado');
        });

        const suma = resultados.reduce((a, b) => a + b, 0);
        sumaEl.textContent = suma;

        // Historial
        historial.unshift(suma);
        if (historial.length > MAX_HISTORIAL) historial.pop();
        renderHistorial();

        if (btn) btn.disabled = false;
        tirando = false;
    }
}

function renderHistorial() {
    const cont = document.getElementById('dadosHistorial');
    if (!cont) return;

    cont.innerHTML = historial.map((n, i) => `
        <span class="hist-item ${i === 0 ? 'nueva' : ''}">${n}</span>
    `).join('');

    // Quitar el "nueva" después de un momento
    if (historial.length > 0) {
        setTimeout(() => {
            const primera = cont.querySelector('.hist-item.nueva');
            if (primera) primera.classList.remove('nueva');
        }, 800);
    }
}

function resetHistorial() {
    historial = [];
    renderHistorial();
    const sumaEl = document.getElementById('dadosSuma');
    if (sumaEl) sumaEl.textContent = '—';

    const dados = document.querySelectorAll('.dado');
    dados.forEach(d => {
        d.classList.remove('resultado');
        pintarDado(d, 1);
    });
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    // Estado inicial de los dados
    document.querySelectorAll('.dado').forEach(d => pintarDado(d, 1));

    document.getElementById('dadosBtn')?.addEventListener('click', tirar);
    document.getElementById('dadosReset')?.addEventListener('click', resetHistorial);

    lucide.createIcons();
});
