// ============================================================
//  Widget: Dados 3D
//  Cubos CSS reales con perspectiva. Sin librerías externas.
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
        // iframe cross-origin o padre no listo → usar fallbacks del CSS
    }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
    }
});

// ============================================================
//  CARAS DEL CUBO (rotaciones para mostrar cada número)
// ============================================================
//  1 = frente,  6 = atrás
//  2 = derecha, 5 = izquierda
//  3 = arriba,  4 = abajo
const ROTACIONES = {
    1: { x: 0,   y: 0   },
    2: { x: 0,   y: -90 },
    3: { x: -90, y: 0   },
    4: { x: 90,  y: 0   },
    5: { x: 0,   y: 90  },
    6: { x: 0,   y: 180 }
};

// Genera los puntos de una cara (HTML)
function generarPuntos(n) {
    return Array.from({ length: n }, () => '<span class="punto"></span>').join('');
}

// Rellena todas las caras del cubo con sus puntos
function inicializarCubo(cubo) {
    if (!cubo) return;
    const caras = {
        'frente':    1,
        'atras':     6,
        'derecha':   2,
        'izquierda': 5,
        'arriba':    3,
        'abajo':     4
    };
    cubo.querySelectorAll('.cara').forEach(cara => {
        // Detectar la posición por clase
        let n = 1;
        for (const [clase, valor] of Object.entries(caras)) {
            if (cara.classList.contains(clase)) { n = valor; break; }
        }
        cara.dataset.n = n;
        cara.innerHTML = generarPuntos(n);
    });
}

// Muestra una cara del cubo con una animación de giro
function mostrarCara(cubo, n, conGiro = true) {
    if (!cubo) return;
    const r = ROTACIONES[n] || ROTACIONES[1];

    if (!conGiro) {
        cubo.style.transition = 'none';
        cubo.style.transform = `rotateX(${r.x}deg) rotateY(${r.y}deg)`;
        // Re-habilitar transición en el siguiente frame
        requestAnimationFrame(() => {
            cubo.style.transition = '';
        });
        return;
    }

    // Giros extra aleatorios para que se vea caótico
    const girosX = 1 + Math.floor(Math.random() * 3); // 1-3 vueltas
    const girosY = 1 + Math.floor(Math.random() * 3);

    const x = r.x + 360 * girosX;
    const y = r.y + 360 * girosY;

    cubo.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
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

    const cubos = Array.from(document.querySelectorAll('.cubo'));  // ← Array, no NodeList
    const btn = document.getElementById('dadosBtn');
    const sumaEl = document.getElementById('dadosSuma');
    if (!cubos.length) return;

    // Reset visual
    sumaEl.textContent = '—';
    cubos.forEach(c => c.classList.add('rodando'));
    if (btn) btn.disabled = true;

    // Duración total del "ruedecito"
    const DURACION = 900;
    const INTERVALO = 90;
    const inicio = Date.now();

    const intervalo = setInterval(() => {
        cubos.forEach(cubo => {
            // Rotaciones aleatorias rápidas durante el "ruedecito"
            const rx = Math.random() * 720 - 360;
            const ry = Math.random() * 720 - 360;
            cubo.style.transition = 'none';
            cubo.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
        });

        if (Date.now() - inicio >= DURACION) {
            clearInterval(intervalo);
            finalizar();
        }
    }, INTERVALO);

    function finalizar() {
        // Resultado definitivo
        const resultados = cubos.map(() => randomCara());

        cubos.forEach((cubo, i) => {
            // Restaurar transición y aplicar rotación final
            cubo.style.transition = '';
            cubo.classList.remove('rodando');
            mostrarCara(cubo, resultados[i]);
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

    const cubos = Array.from(document.querySelectorAll('.cubo'));
    cubos.forEach(cubo => mostrarCara(cubo, 1, false));
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    // Inicializar caras de los dados
    document.querySelectorAll('.cubo').forEach(cubo => {
        inicializarCubo(cubo);
        mostrarCara(cubo, 1, false);
    });

    document.getElementById('dadosBtn')?.addEventListener('click', tirar);
    document.getElementById('dadosReset')?.addEventListener('click', resetHistorial);

    lucide.createIcons();
});
