// ============================================================
//  Widget: Mini Ruleta
//  Hasta 5 opciones. Gira y saca un resultado al azar.
//  SIN persistencia — se resetea al recargar.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const MAX_OPCIONES = 5;
const DEFAULT_OPCIONES = ['Sí', 'No', 'Tal vez'];

// Paleta fija para los sectores (funciona en cualquier tema)
const COLORES = ['#8B5CF6', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'];

let opciones = [...DEFAULT_OPCIONES];
let girando = false;
let rotacionActual = 0;

// ------------------------------------------------------------
//  Tema
// ------------------------------------------------------------
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

// ------------------------------------------------------------
//  Geometría
// ------------------------------------------------------------
const CX = 50, CY = 50, R = 45;

function puntoEnCirculo(cx, cy, r, anguloDeg) {
    const rad = (anguloDeg - 90) * Math.PI / 180;
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad)
    };
}

function acortar(str, max = 8) {
    const s = String(str || '').trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
}

function escaparXML(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ------------------------------------------------------------
//  Dibujar la rueda
// ------------------------------------------------------------
function dibujarRueda() {
    const svg = document.getElementById('rlWheel');
    if (!svg) return;

    const n = opciones.length;
    if (n === 0) {
        svg.innerHTML = '';
        return;
    }

    const sector = 360 / n;
    let paths = '';

    // Sectores
    for (let i = 0; i < n; i++) {
        const a1 = i * sector;
        const a2 = (i + 1) * sector;
        const p1 = puntoEnCirculo(CX, CY, R, a1);
        const p2 = puntoEnCirculo(CX, CY, R, a2);
        const largeArc = sector > 180 ? 1 : 0;
        const color = COLORES[i % COLORES.length];

        paths += `<path d="M ${CX} ${CY} L ${p1.x.toFixed(3)} ${p1.y.toFixed(3)} A ${R} ${R} 0 ${largeArc} 1 ${p2.x.toFixed(3)} ${p2.y.toFixed(3)} Z"
                  fill="${color}"
                  stroke="rgba(255,255,255,0.85)"
                  stroke-width="0.6"/>`;
    }

    // Texto en el centro de cada sector, sin rotación (para n≤5 es legible)
    const textos = opciones.map((op, i) => {
        const medio = (i + 0.5) * sector;
        const p = puntoEnCirculo(CX, CY, R * 0.62, medio);
        return `<text x="${p.x.toFixed(3)}" y="${p.y.toFixed(3)}"
                      text-anchor="middle"
                      dominant-baseline="middle"
                      font-family="Nunito, sans-serif"
                      font-size="6"
                      font-weight="800"
                      fill="#FFFFFF"
                      style="text-shadow: 0 0 1px rgba(0,0,0,0.4)">${escaparXML(acortar(op))}</text>`;
    }).join('');

    // Círculo central decorativo
    const centro = `<circle cx="${CX}" cy="${CY}" r="6" fill="var(--white, #FFFFFF)" stroke="rgba(0,0,0,0.1)" stroke-width="0.5"/>`;

    svg.innerHTML = paths + textos + centro;
}

// ------------------------------------------------------------
//  Girar
// ------------------------------------------------------------
function girar() {
    if (girando) return;
    if (opciones.length < 2) {
        alert('Necesitas al menos 2 opciones para girar.');
        return;
    }

    girando = true;
    const svg = document.getElementById('rlWheel');
    const btn = document.getElementById('rlBtnGirar');
    const btnTexto = document.getElementById('rlBtnTexto');

    const n = opciones.length;
    const sector = 360 / n;
    const elegido = Math.floor(Math.random() * n);
    const centroSector = (elegido + 0.5) * sector;

    // Jitter dentro del sector (deja 6° de margen a cada lado para no quedar al borde)
    const margen = Math.min(6, sector / 4);
    const jitter = (Math.random() * 2 - 1) * (sector / 2 - margen);

    // Rotación deseada: queremos que centroSector quede en la parte superior (0°)
    const rotacionObjetivo = 360 - centroSector + jitter;

    // Vueltas extra (5-7) para el efecto
    const vueltas = 5 + Math.floor(Math.random() * 3);

    // Delta desde la posición actual para llegar al objetivo con vueltas extra
    const objetivoMod = ((rotacionObjetivo % 360) + 360) % 360;
    const actualMod = ((rotacionActual % 360) + 360) % 360;
    let delta = objetivoMod - actualMod;
    if (delta <= 0) delta += 360;
    delta += 360 * vueltas;

    const nuevaRotacion = rotacionActual + delta;
    rotacionActual = nuevaRotacion;

    // Aplicar transición
    svg.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    // Forzar reflow para que la transición se aplique
    void svg.offsetWidth;
    svg.style.transform = `rotate(${nuevaRotacion}deg)`;

    if (btn) btn.disabled = true;
    if (btnTexto) btnTexto.textContent = 'Girando...';

    // Terminar
    setTimeout(() => {
        girando = false;
        if (btn) btn.disabled = false;
        if (btnTexto) btnTexto.textContent = opciones[elegido] || 'Resultado';
        // Ajustar el tamaño del texto si es muy largo
        if (btnTexto) {
            btnTexto.style.maxWidth = '120px';
            btnTexto.style.overflow = 'hidden';
            btnTexto.style.textOverflow = 'ellipsis';
            btnTexto.style.whiteSpace = 'nowrap';
            btnTexto.textContent = opciones[elegido];
        }
    }, 4100);
}

// ------------------------------------------------------------
//  Modal de edición
// ------------------------------------------------------------
function abrirModal() {
    if (girando) return;
    const modal = document.getElementById('rlModal');
    const cont = document.getElementById('rlInputs');
    if (!modal || !cont) return;

    cont.innerHTML = '';
    opciones.forEach((op, i) => cont.appendChild(crearFilaInput(op, i)));
    actualizarBotonAdd();

    modal.hidden = false;
    if (window.lucide) window.lucide.createIcons();
    setTimeout(() => cont.querySelector('input')?.focus(), 100);
}

function cerrarModal() {
    const modal = document.getElementById('rlModal');
    if (modal) modal.hidden = true;
}

function crearFilaInput(valor = '', idx = 0) {
    const row = document.createElement('div');
    row.className = 'rl-input-row';
    row.innerHTML = `
        <span class="rl-row-num">${idx + 1}</span>
        <input type="text" maxlength="14" value="${String(valor).replace(/"/g, '&quot;')}" placeholder="Opción ${idx + 1}">
        <button class="rl-row-del" title="Quitar"><i data-lucide="trash-2"></i></button>
    `;
    row.querySelector('.rl-row-del').addEventListener('click', () => {
        if (row.parentElement.children.length <= 2) {
            alert('Necesitas al menos 2 opciones.');
            return;
        }
        row.remove();
        renumerarFilas();
        actualizarBotonAdd();
    });
    return row;
}

function renumerarFilas() {
    const cont = document.getElementById('rlInputs');
    if (!cont) return;
    Array.from(cont.children).forEach((row, i) => {
        const num = row.querySelector('.rl-row-num');
        const inp = row.querySelector('input');
        if (num) num.textContent = i + 1;
        if (inp) inp.placeholder = `Opción ${i + 1}`;
    });
}

function actualizarBotonAdd() {
    const cont = document.getElementById('rlInputs');
    const btn = document.getElementById('rlBtnAddInput');
    if (!cont || !btn) return;
    const llenas = cont.children.length;
    btn.disabled = llenas >= MAX_OPCIONES;
}

function anadirFila() {
    const cont = document.getElementById('rlInputs');
    if (!cont) return;
    if (cont.children.length >= MAX_OPCIONES) {
        alert(`Máximo ${MAX_OPCIONES} opciones.`);
        return;
    }
    const row = crearFilaInput('', cont.children.length);
    cont.appendChild(row);
    renumerarFilas();
    actualizarBotonAdd();
    if (window.lucide) window.lucide.createIcons();
    row.querySelector('input')?.focus();
}

function guardarOpciones() {
    const cont = document.getElementById('rlInputs');
    if (!cont) return;
    const valores = Array.from(cont.querySelectorAll('input'))
        .map(i => i.value.trim())
        .filter(v => v.length > 0);

    if (valores.length < 2) {
        alert('Necesitas al menos 2 opciones con nombre.');
        return;
    }

    opciones = valores.slice(0, MAX_OPCIONES);
    rotacionActual = 0;
    const svg = document.getElementById('rlWheel');
    if (svg) {
        svg.style.transition = 'none';
        svg.style.transform = 'rotate(0deg)';
    }

    dibujarRueda();
    cerrarModal();

    const btnTexto = document.getElementById('rlBtnTexto');
    if (btnTexto) btnTexto.textContent = 'Girar';
}

// ------------------------------------------------------------
//  Init
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();
    dibujarRueda();

    document.getElementById('rlBtnGirar')?.addEventListener('click', girar);
    document.getElementById('rlBtnEdit')?.addEventListener('click', abrirModal);
    document.getElementById('rlModalCerrar')?.addEventListener('click', cerrarModal);
    document.getElementById('rlBtnCancelar')?.addEventListener('click', cerrarModal);
    document.getElementById('rlBtnGuardar')?.addEventListener('click', guardarOpciones);
    document.getElementById('rlBtnAddInput')?.addEventListener('click', anadirFila);

    document.getElementById('rlModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'rlModal') cerrarModal();
    });

    if (window.lucide) window.lucide.createIcons();
});
