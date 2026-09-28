// ============================================================
//  script.js — UI de MiniCity
//  ------------------------------------------------------------
//  CAMBIOS v4:
//   · dibujarEdificio lee colores, altura, tamaño y detalle
//     desde la definición del tipo (sin if/else por tipo).
//   · abrirModalConstruir itera sobre MiniCity.ORDEN_TIPOS.
//   · abrirModalEdificio lee stats del tipo (1 o 2 filas).
//   · Detalles visuales nuevos: arbol, plantas, fuente,
//     columnas.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'minicity';

const TILE_W = 78;
const TILE_H = 39;

let canvas, ctx;
let wrapEl;
let dpr = 1;
let anchoCSS = 0, altoCSS = 0;
let originX = 0, originY = 0;

let celdaSeleccionada = null;
let rafId = null;
let ultimoTick = 0;

const colores = {
    cesped:    '#E8E8EE',
    cespedAlt: '#DDDDE5',
    borde:     '#C4C4CF',
    selBorde:  '#8B5CF6',
    selRelleno:'rgba(139,92,246,0.18)',
    humo:      'rgba(120,120,140,0.55)',
    texto:     '#18181B'
};

const API = () => window.parent.__vicwebos || null;

// ============================================================
//  Tema
// ============================================================
function aplicarTemaDelPadre() {
    try {
        const rootPadre = window.parent.document.documentElement;
        const sp = getComputedStyle(rootPadre);
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
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) {}
}

function leerColoresDelTema() {
    const cs = (name, fallback) => {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) { return fallback; }
    };
    colores.cesped    = cs('--bg-alt', '#F5F5F8');
    colores.cespedAlt = cs('--gray-100', '#F4F4F7');
    colores.borde     = cs('--gray-300', '#D4D4DD');
    colores.selBorde  = cs('--violet-500', '#8B5CF6');
    colores.texto     = cs('--gray-900', '#18181B');
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) {
        aplicarTemaDelPadre();
        setTimeout(() => { leerColoresDelTema(); dibujar(); }, 60);
    }
});

// ============================================================
//  Toast
// ============================================================
let toastTimer = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('mcToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mc-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  Canvas
// ============================================================
function ajustarCanvas() {
    if (!canvas || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    anchoCSS = rect.width;
    altoCSS  = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(anchoCSS * dpr);
    canvas.height = Math.round(altoCSS * dpr);
    canvas.style.width  = anchoCSS + 'px';
    canvas.style.height = altoCSS + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    calcularOrigen();
    dibujar();
}

function calcularOrigen() {
    const N = window.MiniCity.getGrillaSize();
    originX = anchoCSS / 2;
    originY = altoCSS / 2 - (N - 1) * TILE_H / 2 - 10;
}

function proyCentroCelda(col, fila) {
    const x = originX + (col - fila) * (TILE_W / 2);
    const y = originY + (col + fila) * (TILE_H / 2);
    return { x, y };
}

function screenToCell(px, py) {
    const rx = px - originX;
    const ry = py - originY;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const c = (rx / hw + ry / hh) / 2;
    const f = (ry / hh - rx / hw) / 2;
    return { col: Math.floor(c + 0.5), fila: Math.floor(f + 0.5) };
}

// ============================================================
//  Dibujado
// ============================================================
function dibujar() {
    if (!ctx || !canvas || !window.MiniCity) return;
    const estado = window.MiniCity.getEstado();
    if (!estado) return;

    ctx.clearRect(0, 0, anchoCSS, altoCSS);
    ctx.fillStyle = colores.cesped;
    ctx.fillRect(0, 0, anchoCSS, altoCSS);

    const ordenadas = estado.celdas.slice().sort((a, b) => {
        const da = a.col + a.fila;
        const db = b.col + b.fila;
        if (da !== db) return da - db;
        return a.col - b.col;
    });

    ordenadas.forEach(celda => dibujarSuelo(celda, celdaSeleccionada === celda));
    ordenadas.forEach(celda => {
        if ((celda.tipo && celda.nivel > 0) || (celda.tipo && celda.finConstruccion)) {
            dibujarEdificio(celda);
        }
    });
}

function dibujarSuelo(celda, seleccionada) {
    const { x, y } = proyCentroCelda(celda.col, celda.fila);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    ctx.beginPath();
    ctx.moveTo(x,      y - hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x,      y + hh);
    ctx.lineTo(x - hw, y);
    ctx.closePath();

    ctx.fillStyle = ((celda.col + celda.fila) % 2 === 0) ? colores.cesped : colores.cespedAlt;
    ctx.fill();

    ctx.strokeStyle = seleccionada ? colores.selBorde : colores.borde;
    ctx.lineWidth = seleccionada ? 2.5 : 1;
    ctx.stroke();

    if (seleccionada) {
        ctx.fillStyle = colores.selRelleno;
        ctx.fill();
    }
}

function dibujarEdificio(celda) {
    const def = window.MiniCity.TIPOS[celda.tipo];
    if (!def) return;

    const { x, y } = proyCentroCelda(celda.col, celda.fila);
    const nivelMostrado = celda.finConstruccion
        ? Math.max(1, celda.nivel)
        : celda.nivel;
    const nivel = Math.max(1, Math.min(3, nivelMostrado));

    const base   = def.colores.base;
    const oscuro = def.colores.oscuro;
    const altura = def.alturaPorNivel[nivel];

    const cuerpoW = TILE_W * (def.tamano?.w || 0.55);
    const cuerpoH = TILE_H * (def.tamano?.h || 0.55);
    const hw = cuerpoW / 2;
    const hh = cuerpoH / 2;

    // Sombra
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x,      y + 4 - hh);
    ctx.lineTo(x + hw, y + 4);
    ctx.lineTo(x,      y + 4 + hh);
    ctx.lineTo(x - hw, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const enConstruccion = !!celda.finConstruccion;
    ctx.globalAlpha = enConstruccion ? 0.55 : 1;

    // Pared izquierda (oscura)
    ctx.beginPath();
    ctx.moveTo(x - hw, y);
    ctx.lineTo(x,      y + hh);
    ctx.lineTo(x,      y + hh - altura);
    ctx.lineTo(x - hw, y - altura);
    ctx.closePath();
    ctx.fillStyle = oscuro;
    ctx.fill();

    // Pared derecha (base)
    ctx.beginPath();
    ctx.moveTo(x,      y + hh);
    ctx.lineTo(x + hw, y);
    ctx.lineTo(x + hw, y - altura);
    ctx.lineTo(x,      y + hh - altura);
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();

    // Techo
    ctx.beginPath();
    ctx.moveTo(x,      y - hh - altura);
    ctx.lineTo(x + hw, y - altura);
    ctx.lineTo(x,      y + hh - altura);
    ctx.lineTo(x - hw, y - altura);
    ctx.closePath();
    ctx.fillStyle = aclarar(base, 0.15);
    ctx.fill();

    // Detalles según tipo
    const ctxDetalle = { x, y, hw, hh, altura, nivel, base, oscuro, enConstruccion };
    switch (def.detalle) {
        case 'puerta':    detallePuerta(ctxDetalle);   break;
        case 'ventanal':  detalleVentanal(ctxDetalle); break;
        case 'chimenea':  detalleChimenea(ctxDetalle); break;
        case 'arbol':     detalleArbol(ctxDetalle);    break;
        case 'fuente':    detalleFuente(ctxDetalle);   break;
        case 'columnas':  detalleColumnas(ctxDetalle); break;
        case 'plantas':   detallePlantas(ctxDetalle);  break;
    }

    // Andamio
    if (enConstruccion) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = 'rgba(120, 60, 200, 0.6)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - hw - 2, y);
        ctx.lineTo(x - hw - 2, y - altura - hh);
        ctx.moveTo(x + hw + 2, y);
        ctx.lineTo(x + hw + 2, y - altura - hh);
        ctx.moveTo(x - hw - 2, y - altura - hh);
        ctx.lineTo(x + hw + 2, y - altura - hh);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.globalAlpha = 1;
}

// ------------------------------------------------------------
//  Detalles visuales
// ------------------------------------------------------------
function detallePuerta({ x, y, hh, altura, nivel }) {
    const puertaW = 6;
    const puertaH = Math.max(8, altura * 0.4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 4, y + hh - altura / 2 - puertaH / 2 - 2, puertaW, puertaH);
    if (nivel >= 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x - 10, y - altura + 6, 6, 6);
    }
    if (nivel >= 3) {
        ctx.fillRect(x + 4, y - altura + 6, 6, 6);
    }
}

function detalleVentanal({ x, y, hw, hh, altura, nivel }) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const vW = hw * 0.7;
    const vH = Math.max(6, altura * 0.3);
    const baseY = y + hh - altura / 2 - vH / 2 - 2;
    ctx.fillRect(x + 3, baseY, vW, vH);
    if (nivel >= 2) {
        ctx.fillRect(x + 3, baseY - vH - 4, vW, vH);
    }
    if (nivel >= 3) {
        ctx.fillRect(x + 3, baseY - (vH + 4) * 2, vW, vH);
    }
}

function detalleChimenea({ x, y, altura, enConstruccion }) {
    const chimW = 5;
    const chimAlto = Math.max(10, altura * 0.7);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 6, y - altura - chimAlto + 4, chimW, chimAlto + 4);
    if (!enConstruccion) {
        ctx.fillStyle = colores.humo;
        const t = (performance.now() / 700) % 1;
        const humY = y - altura - chimAlto - t * 18;
        const humR = 3 + t * 4;
        ctx.beginPath();
        ctx.arc(x - 3 + Math.sin(t * 6) * 2, humY, humR, 0, Math.PI * 2);
        ctx.fill();
    }
}

function detalleArbol({ x, y, altura }) {
    // Dos o tres arbolitos sobre el bloque
    const baseY = y - altura + 2;
    const colorCopa = '#166534';
    const colorTronco = '#7C2D12';
    const posiciones = [
        { dx: -10, dy:  0, r: 5 },
        { dx:   4, dy: -2, r: 6 },
        { dx:  14, dy:  2, r: 4 }
    ];
    posiciones.forEach(({ dx, dy, r }) => {
        // Tronco
        ctx.fillStyle = colorTronco;
        ctx.fillRect(x + dx - 1, baseY + dy - 1, 2, 4);
        // Copa
        ctx.fillStyle = colorCopa;
        ctx.beginPath();
        ctx.arc(x + dx, baseY + dy - r + 1, r, 0, Math.PI * 2);
        ctx.fill();
    });
}

function detalleFuente({ x, y, altura }) {
    // Chorrito de agua desde el centro del techo
    const topY = y - altura - 4;
    ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
    // Base circular
    ctx.beginPath();
    ctx.arc(x, topY + 2, 5, 0, Math.PI * 2);
    ctx.fill();
    // Gotas
    const t = (performance.now() / 400) % 1;
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.arc(x - 3 + Math.sin(t * 8) * 2, topY - 6 - t * 6, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 3 + Math.cos(t * 6) * 2, topY - 4 - t * 5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha /= 0.7;
}

function detalleColumnas({ x, y, hw, altura, nivel }) {
    // Columnas verticales en la pared derecha
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    const columnas = nivel + 1;
    const anchoDisp = hw * 0.7;
    for (let i = 0; i < columnas; i++) {
        const xx = x + 4 + (i / Math.max(1, columnas - 1)) * anchoDisp;
        ctx.beginPath();
        ctx.moveTo(xx, y + 4);
        ctx.lineTo(xx, y - altura + 2);
        ctx.stroke();
    }
}

function detallePlantas({ x, y, altura }) {
    // Matitas pequeñas en el techo
    const baseY = y - altura;
    const color = '#166534';
    const puntos = [
        { dx: -12, dy: 0 },
        { dx: -4,  dy: -2 },
        { dx:  6,  dy: 0 },
        { dx:  14, dy: -1 }
    ];
    ctx.fillStyle = color;
    puntos.forEach(({ dx, dy }) => {
        ctx.beginPath();
        ctx.arc(x + dx, baseY + dy, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

function aclarar(hex, factor) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    const nr = Math.min(255, Math.round(r + (255 - r) * factor));
    const ng = Math.min(255, Math.round(g + (255 - g) * factor));
    const nb = Math.min(255, Math.round(b + (255 - b) * factor));
    return `rgb(${nr}, ${ng}, ${nb})`;
}

// ============================================================
//  Input
// ============================================================
function bindInput() {
    const manejar = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const celda = screenToCell(px, py);
        const N = window.MiniCity.getGrillaSize();
        if (celda.col < 0 || celda.col >= N) return;
        if (celda.fila < 0 || celda.fila >= N) return;
        abrirCelda(celda.col, celda.fila);
    };

    canvas.addEventListener('click', (e) => {
        e.preventDefault();
        manejar(e.clientX, e.clientY);
    });

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            const t = e.touches[0];
            manejar(t.clientX, t.clientY);
        }
    }, { passive: true });
}

// ============================================================
//  Modales
// ============================================================
function abrirCelda(col, fila) {
    const estado = window.MiniCity.getEstado();
    if (!estado) return;
    const N = window.MiniCity.getGrillaSize();
    const idx = fila * N + col;
    const celda = estado.celdas[idx];
    if (!celda) return;

    celdaSeleccionada = celda;
    dibujar();

    if (!celda.tipo) abrirModalConstruir(celda, idx);
    else             abrirModalEdificio(celda, idx);
}

function abrirModalConstruir(celda, idx) {
    const cont = document.getElementById('mcOpcionesConstruir');
    const coord = document.getElementById('mcModalCoord');
    coord.textContent = `Columna ${celda.col + 1}, fila ${celda.fila + 1}`;

    const estado = window.MiniCity.getEstado();
    const creditos = Math.floor(estado.creditos);
    const libres = window.MiniCity.constructoresDisponibles();

    cont.innerHTML = '';

    window.MiniCity.ORDEN_TIPOS.forEach(tipoId => {
        const def = window.MiniCity.TIPOS[tipoId];
        const puede = window.MiniCity.puedeConstruir(idx, tipoId);
        const costo = def.costos[0];

        const btn = document.createElement('button');
        btn.className = 'mc-opcion' + (puede.ok ? '' : ' bloqueada');
        btn.innerHTML = `
            <div class="mc-opcion-icono" style="background:linear-gradient(135deg, ${def.colores.base}, ${def.colores.oscuro})">
                <i data-lucide="${def.icono}"></i>
            </div>
            <div class="mc-opcion-info">
                <span class="mc-opcion-nombre">${def.nombre}</span>
                <span class="mc-opcion-desc">${def.descripcion}</span>
            </div>
            <span class="mc-opcion-costo">
                <i data-lucide="coins"></i>${costo}
            </span>
        `;

        if (puede.ok) {
            btn.addEventListener('click', () => {
                try {
                    window.MiniCity.construir(idx, tipoId);
                    cerrarModales();
                    celdaSeleccionada = null;
                    dibujar();
                    actualizarUI();
                    toast(`Construyendo ${def.nombre}…`, 'info');
                } catch (e) {
                    toast(e.message || 'No se pudo construir', 'error');
                }
            });
        } else {
            btn.title = puede.motivo;
        }

        cont.appendChild(btn);
    });

    if (libres <= 0) {
        const aviso = document.createElement('p');
        aviso.style.cssText = 'font-size:12px;color:#991B1B;font-weight:700;text-align:center;margin-top:8px;';
        aviso.textContent = 'Todos tus constructores están ocupados.';
        cont.appendChild(aviso);
    } else {
        const costoMin = Math.min(...window.MiniCity.ORDEN_TIPOS.map(t => window.MiniCity.TIPOS[t].costos[0]));
        if (creditos < costoMin) {
            const aviso = document.createElement('p');
            aviso.style.cssText = 'font-size:12px;color:#92400E;font-weight:700;text-align:center;margin-top:8px;';
            aviso.textContent = `Tenés ${creditos} créditos. Esperá a juntar más.`;
            cont.appendChild(aviso);
        }
    }

    document.getElementById('mcModalConstruir').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function abrirModalEdificio(celda, idx) {
    const def = window.MiniCity.TIPOS[celda.tipo];
    const titulo = document.getElementById('mcEdifTitulo');
    const sub = document.getElementById('mcEdifSub');
    const cuerpo = document.getElementById('mcEdifCuerpo');

    titulo.textContent = def.nombre;
    sub.textContent = `Columna ${celda.col + 1}, fila ${celda.fila + 1}`;

    const enConstruccion = !!celda.finConstruccion;
    const nivelActual = celda.nivel;
    const nivelMostrado = enConstruccion ? Math.min(3, nivelActual + 1) : nivelActual;

    let html = '';

    html += `
        <div class="mc-edif-nivel">
            <i data-lucide="star"></i>
            <span>Nivel ${nivelMostrado} / 3</span>
            <div class="mc-edif-nivel-dots">
                <span class="mc-edif-nivel-dot ${nivelMostrado >= 1 ? 'activo' : ''}"></span>
                <span class="mc-edif-nivel-dot ${nivelMostrado >= 2 ? 'activo' : ''}"></span>
                <span class="mc-edif-nivel-dot ${nivelMostrado >= 3 ? 'activo' : ''}"></span>
            </div>
        </div>
    `;

    // Stats: leer del tipo (1 o 2 filas)
    const stats = (def.stats || []).slice(0, 2);
    const nivelIdx = Math.max(0, Math.min(2, (nivelActual || 1) - 1));
    html += `<div class="mc-edif-stats" data-cols="${stats.length}">`;
    stats.forEach(s => {
        const valor = nivelActual > 0
            ? (def.aportes[s.key]?.[nivelIdx] ?? 0)
            : 0;
        const signo = valor >= 0 ? '+' : '';
        html += `
            <div class="mc-edif-stat">
                <span class="mc-edif-stat-label">${s.label}</span>
                <span class="mc-edif-stat-valor">${signo}${valor}${s.unidad}</span>
            </div>
        `;
    });
    html += `</div>`;

    if (enConstruccion) {
        html += `
            <div class="mc-edif-timer">
                <div class="mc-edif-timer-titulo">
                    <i data-lucide="hammer"></i>
                    <span>En construcción</span>
                </div>
                <div class="mc-edif-timer-valor" id="mcEdifTimerValor">—</div>
            </div>
            <div class="mc-edif-acciones">
                <button class="mc-btn-acc" id="mcBtnAcelerar">
                    <i data-lucide="zap"></i>
                    <span id="mcBtnAcelerarTexto">Acelerar</span>
                </button>
            </div>
        `;
    } else if (celda.nivel < 3) {
        const puede = window.MiniCity.puedeMejorar(idx);
        const costo = def.costos[celda.nivel];
        const tiempo = formatearTiempo(def.tiemposMs[celda.nivel]);
        html += `
            <div class="mc-edif-timer" style="background:var(--violet-50);border-color:var(--violet-200);">
                <div class="mc-edif-timer-titulo" style="color:var(--violet-700);">
                    <i data-lucide="arrow-up-circle"></i>
                    <span>Siguiente nivel · ${tiempo}</span>
                </div>
            </div>
            <div class="mc-edif-acciones">
                <button class="mc-btn-primario" id="mcBtnMejorar" ${puede.ok ? '' : 'disabled'}>
                    <i data-lucide="coins"></i>
                    <span>Mejorar por ${costo} créditos</span>
                </button>
                ${!puede.ok && puede.motivo === 'Sin constructores libres'
                    ? '<p style="font-size:12px;color:#991B1B;font-weight:700;text-align:center;">Todos los constructores están ocupados.</p>'
                    : ''}
                ${!puede.ok && puede.motivo === 'Sin créditos'
                    ? `<p style="font-size:12px;color:#92400E;font-weight:700;text-align:center;">Te faltan ${costo - Math.floor(window.MiniCity.getEstado().creditos)} créditos.</p>`
                    : ''}
            </div>
        `;
    } else {
        html += `
            <div class="mc-edif-timer" style="background:#DCFCE7;border-color:#BBF7D0;">
                <div class="mc-edif-timer-titulo" style="color:#166534;">
                    <i data-lucide="check-circle-2"></i>
                    <span>Nivel máximo alcanzado</span>
                </div>
            </div>
        `;
    }

    cuerpo.innerHTML = html;

    if (enConstruccion) {
        actualizarTimerEdificio(idx);
        const btnAc = document.getElementById('mcBtnAcelerar');
        if (btnAc) {
            btnAc.addEventListener('click', async () => {
                try {
                    const costo = window.MiniCity.costoAcelerar(idx);
                    if (!confirm(`¿Acelerar por ${costo} Monedas OS?`)) return;
                    btnAc.disabled = true;
                    await window.MiniCity.acelerar(idx);
                    toast('¡Construcción acelerada!', 'success');
                    cerrarModales();
                    celdaSeleccionada = null;
                    dibujar();
                    actualizarUI();
                } catch (e) {
                    toast(e.message || 'No se pudo acelerar', 'error');
                    btnAc.disabled = false;
                }
            });
        }
    }

    if (!enConstruccion && celda.nivel > 0 && celda.nivel < 3) {
        const btnMej = document.getElementById('mcBtnMejorar');
        if (btnMej && !btnMej.disabled) {
            btnMej.addEventListener('click', () => {
                try {
                    window.MiniCity.mejorar(idx);
                    cerrarModales();
                    celdaSeleccionada = null;
                    dibujar();
                    actualizarUI();
                    toast('Mejora iniciada', 'info');
                } catch (e) {
                    toast(e.message || 'No se pudo mejorar', 'error');
                }
            });
        }
    }

    document.getElementById('mcModalEdificio').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

function actualizarTimerEdificio(idx) {
    const estado = window.MiniCity.getEstado();
    if (!estado) return;
    const c = estado.celdas[idx];
    if (!c || !c.finConstruccion) return;
    const restante = Math.max(0, c.finConstruccion - Date.now());
    const el = document.getElementById('mcEdifTimerValor');
    if (el) el.textContent = formatearTiempo(restante);

    const btnTxt = document.getElementById('mcBtnAcelerarTexto');
    if (btnTxt) {
        const costo = window.MiniCity.costoAcelerar(idx);
        btnTxt.textContent = `Acelerar por ${costo} OS`;
    }
}

function cerrarModales() {
    document.getElementById('mcModalConstruir').hidden = true;
    document.getElementById('mcModalEdificio').hidden = true;
    document.getElementById('mcModalTienda').hidden = true;
}

// ============================================================
//  Tienda
// ============================================================
function abrirTienda() {
    const estado = window.MiniCity.getEstado();
    if (!estado) return;
    const cont = document.getElementById('mcTiendaCuerpo');
    cont.innerHTML = '';

    // Expansión
    const puedeExp = window.MiniCity.puedeExpandir();
    const sizeActual = window.MiniCity.getGrillaSize();
    const sizeMax = window.MiniCity.GRILLA_SIZE_MAX;

    if (sizeActual >= sizeMax) {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item comprado';
        item.innerHTML = `
            <div class="mc-tienda-icono"><i data-lucide="layout-grid"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Terreno máximo alcanzado</span>
                <span class="mc-tienda-desc">Tu grilla es de ${sizeActual}×${sizeActual}.</span>
            </div>
        `;
        cont.appendChild(item);
    } else {
        const nuevo = sizeActual + 1;
        const costo = window.MiniCity.COSTOS_EXPANSION[sizeActual];
        const item = document.createElement('div');
        item.className = 'mc-tienda-item';
        item.innerHTML = `
            <div class="mc-tienda-icono"><i data-lucide="layout-grid"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Expandir terreno ${sizeActual}×${sizeActual} → ${nuevo}×${nuevo}</span>
                <span class="mc-tienda-desc">Suma ${nuevo * nuevo - sizeActual * sizeActual} celdas nuevas.</span>
            </div>
            <button class="mc-tienda-btn" id="mcBtnExpandir" ${puedeExp.ok ? '' : 'disabled'}>
                <i data-lucide="coins"></i>${costo}
            </button>
        `;
        cont.appendChild(item);
    }

    // Constructor 2
    if (estado.constructoresComprados >= 2) {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item comprado';
        item.innerHTML = `
            <div class="mc-tienda-icono"><i data-lucide="hard-hat"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Segundo constructor</span>
                <span class="mc-tienda-desc">Ya lo tenés.</span>
            </div>
        `;
        cont.appendChild(item);
    } else {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item';
        item.innerHTML = `
            <div class="mc-tienda-icono"><i data-lucide="hard-hat"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Segundo constructor</span>
                <span class="mc-tienda-desc">Construí 2 cosas en paralelo. Se paga con créditos.</span>
            </div>
            <button class="mc-tienda-btn" id="mcBtnCons2">
                <i data-lucide="coins"></i>${window.MiniCity.COSTO_CONSTRUCTOR_2}
            </button>
        `;
        cont.appendChild(item);
    }

    // Constructor 3
    if (estado.constructoresComprados >= 3) {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item comprado';
        item.innerHTML = `
            <div class="mc-tienda-icono os"><i data-lucide="crown"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Tercer constructor</span>
                <span class="mc-tienda-desc">Ya lo tenés.</span>
            </div>
        `;
        cont.appendChild(item);
    } else if (estado.constructoresComprados < 2) {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item mc-tienda-item-bloqueado';
        item.innerHTML = `
            <div class="mc-tienda-icono os"><i data-lucide="lock"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Tercer constructor</span>
                <span class="mc-tienda-desc">Requiere tener el Segundo constructor primero.</span>
            </div>
            <span class="mc-tienda-tag-bloqueado">Bloqueado</span>
        `;
        cont.appendChild(item);
    } else {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item';
        item.innerHTML = `
            <div class="mc-tienda-icono os"><i data-lucide="crown"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Tercer constructor</span>
                <span class="mc-tienda-desc">Construí 3 cosas en paralelo. Se paga con Monedas OS.</span>
            </div>
            <button class="mc-tienda-btn os" id="mcBtnCons3">
                <i data-lucide="landmark"></i>${window.MiniCity.COSTO_CONSTRUCTOR_3} OS
            </button>
        `;
        cont.appendChild(item);
    }

    document.getElementById('mcModalTienda').hidden = false;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('mcBtnExpandir')?.addEventListener('click', () => {
        try {
            const res = window.MiniCity.expandirGrilla();
            toast(`¡Terreno ampliado a ${res.sizeNuevo}×${res.sizeNuevo}!`, 'success');
            ajustarCanvas();
            cerrarModales();
            actualizarUI();
        } catch (e) {
            toast(e.message || 'No se pudo expandir', 'error');
        }
    });

    document.getElementById('mcBtnCons2')?.addEventListener('click', async () => {
        try {
            await window.MiniCity.comprarConstructor2();
            toast('¡Segundo constructor desbloqueado!', 'success');
            abrirTienda();
            actualizarUI();
        } catch (e) {
            toast(e.message || 'No se pudo comprar', 'error');
        }
    });

    document.getElementById('mcBtnCons3')?.addEventListener('click', async () => {
        try {
            await window.MiniCity.comprarConstructor3();
            toast('¡Tercer constructor desbloqueado!', 'success');
            abrirTienda();
            actualizarUI();
        } catch (e) {
            toast(e.message || 'No se pudo comprar', 'error');
        }
    });
}

// ============================================================
//  HUD / UI
// ============================================================
function formatearTiempo(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const ss = s % 60;
    if (m < 60) return `${m}m ${ss}s`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h < 24) return `${h}h ${mm}m`;
    const d = Math.floor(h / 24);
    const hh = h % 24;
    return `${d}d ${hh}h`;
}

function actualizarUI() {
    const estado = window.MiniCity.getEstado();
    if (!estado) return;
    const stats = window.MiniCity.calcularStats();

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('mcCreditos', Math.floor(estado.creditos).toLocaleString('es-CL'));
    set('mcPoblacion', stats.poblacion);
    set('mcFelicidad', stats.felicidad);
    set('mcProdHora', stats.creditosMinuto.toFixed(1) + '/min');
    set('mcBanco', Math.floor(estado.bancoOS));

    const prodEl = document.getElementById('mcProdHora');
    if (prodEl) {
        prodEl.style.color = stats.creditosMinuto > 0 ? '' : 'var(--gray-400, #A1A1AD)';
    }

    // Botón banco
    const btnBanco = document.getElementById('mcBtnBanco');
    const btnBancoTexto = document.getElementById('mcBtnBancoTexto');
    const bancoEntero = Math.floor(estado.bancoOS);
    if (btnBanco && btnBancoTexto) {
        if (bancoEntero >= 1) {
            btnBanco.disabled = false;
            btnBancoTexto.textContent = `Reclamar ${bancoEntero} OS`;
        } else {
            btnBanco.disabled = true;
            btnBancoTexto.textContent = 'Reclamar 0 OS';
        }
    }

    // Constructores
    const cont = document.getElementById('mcConstructores');
    if (cont) {
        cont.innerHTML = '';

        const shopBtn = document.createElement('div');
        shopBtn.className = 'mc-constructor-slot mc-constructor-tienda';
        shopBtn.title = 'Abrir tienda';
        shopBtn.innerHTML = '<i data-lucide="shopping-bag"></i>';
        shopBtn.addEventListener('click', abrirTienda);
        cont.appendChild(shopBtn);

        const total = window.MiniCity.MAX_CONSTRUCTORES;
        const comprados = estado.constructoresComprados;
        const ocupados = window.MiniCity.constructoresOcupados();
        for (let i = 0; i < total; i++) {
            const slot = document.createElement('div');
            if (i < comprados) {
                slot.className = 'mc-constructor-slot ' + (i < ocupados ? 'ocupado' : 'libre');
                slot.innerHTML = `<i data-lucide="${i < ocupados ? 'hammer' : 'hard-hat'}"></i>`;
            } else {
                slot.className = 'mc-constructor-slot bloqueado';
                slot.innerHTML = `<i data-lucide="plus"></i>`;
                slot.title = 'Comprar en la tienda';
                slot.addEventListener('click', abrirTienda);
            }
            cont.appendChild(slot);
        }
    }

    // Hint contextual
    const hint = document.getElementById('mcCanvasHint');
    if (hint) {
        const tieneAlgo = estado.celdas.some(c => c.tipo);
        const tieneCreditos = estado.celdas.some(c =>
            c.tipo && window.MiniCity.TIPOS[c.tipo]?.aportes.creditos.some(v => v > 0)
        );
        if (!tieneAlgo) {
            hint.classList.remove('oculto');
            hint.innerHTML = '<i data-lucide="hand-pointer"></i><span>Tocá una celda vacía para construir</span>';
        } else if (!tieneCreditos) {
            hint.classList.remove('oculto');
            hint.innerHTML = '<i data-lucide="store"></i><span>Poné un edificio que genere créditos</span>';
        } else {
            hint.classList.add('oculto');
        }
    }

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  Loop
// ============================================================
function loop() {
    const ahora = performance.now();
    if (!ultimoTick) ultimoTick = ahora;

    if (!window.__mcUltimoProcTimers || ahora - window.__mcUltimoProcTimers > 250) {
        window.__mcUltimoProcTimers = ahora;
        const terminadas = window.MiniCity.procesarTimers();
        if (terminadas.length > 0) {
            terminadas.forEach(t => {
                const def = window.MiniCity.TIPOS[t.tipo];
                if (def) toast(`${def.nombre} nivel ${t.nivel} completado`, 'success');
            });
            window.MiniCity.guardar();
            actualizarUI();
        }
    }

    if (!window.__mcUltimoProcProd || ahora - window.__mcUltimoProcProd > 5000) {
        window.__mcUltimoProcProd = ahora;
        const resultado = window.MiniCity.procesarTiempo();
        if (resultado.creditosGanados > 0 || resultado.osGanadas > 0) {
            actualizarUI();
        }
    }

    if (celdaSeleccionada && celdaSeleccionada.finConstruccion) {
        const estado = window.MiniCity.getEstado();
        const N = window.MiniCity.getGrillaSize();
        const idx = celdaSeleccionada.fila * N + celdaSeleccionada.col;
        const c = estado.celdas[idx];
        if (c && c.finConstruccion) actualizarTimerEdificio(idx);
    }

    dibujar();
    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  Bienvenida / resumen
// ============================================================
function mostrarBienvenida(resumen) {
    const overlay = document.getElementById('mcOverlayBienvenida');
    const resumenEl = document.getElementById('mcOverlayResumen');
    if (!overlay) return;

    if (resumen && (resumen.creditosGanados > 0.5 || resumen.osGanadas > 0.5)) {
        const partes = [];
        if (resumen.creditosGanados >= 0.5) {
            partes.push(`
                <div class="mc-overlay-resumen-fila">
                    <span>Créditos</span>
                    <strong>+${Math.floor(resumen.creditosGanados).toLocaleString('es-CL')}</strong>
                </div>`);
        }
        if (resumen.osGanadas >= 0.5) {
            partes.push(`
                <div class="mc-overlay-resumen-fila">
                    <span>Monedas OS</span>
                    <strong>+${Math.floor(resumen.osGanadas)}</strong>
                </div>`);
        }
        if (resumen.segundosTranscurridos > 0) {
            partes.push(`
                <div class="mc-overlay-resumen-fila">
                    <span>Tiempo fuera</span>
                    <strong>${formatearTiempo(resumen.segundosTranscurridos * 1000)}</strong>
                </div>`);
        }
        if (partes.length > 0) {
            resumenEl.innerHTML = `<div class="mc-overlay-resumen-titulo">Mientras no estabas</div>${partes.join('')}`;
            resumenEl.hidden = false;
        } else {
            resumenEl.hidden = true;
        }
    } else {
        resumenEl.hidden = true;
    }

    overlay.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  Bind botones
// ============================================================
function bindBotones() {
    document.getElementById('mcBtnBienvenida')?.addEventListener('click', () => {
        document.getElementById('mcOverlayBienvenida').hidden = true;
    });

    document.getElementById('mcBtnBanco')?.addEventListener('click', async () => {
        try {
            const res = await window.MiniCity.reclamar();
            toast(`+${res.cantidad} Monedas OS reclamadas`, 'success');
            actualizarUI();
        } catch (e) {
            toast(e.message || 'No se pudo reclamar', 'error');
        }
    });

    document.querySelectorAll('[data-mc-cerrar]').forEach(btn => {
        btn.addEventListener('click', () => {
            cerrarModales();
            celdaSeleccionada = null;
            dibujar();
        });
    });

    ['mcModalConstruir', 'mcModalEdificio', 'mcModalTienda'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                cerrarModales();
                celdaSeleccionada = null;
                dibujar();
            }
        });
    });
}

// ============================================================
//  Init
// ============================================================
async function inicializar() {
    aplicarTemaDelPadre();
    leerColoresDelTema();

    const api = API();
    if (!api) { alert('MiniCity necesita estar dentro de VicWebOs.'); return; }

    const usuario = api.obtenerCuenta?.();
    if (!usuario) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('mcUserBadge');
    if (badge) badge.textContent = `@${usuario.codigo} · ${usuario.nombre}`;

    await window.MiniCity.init(usuario);

    canvas = document.getElementById('mcCanvas');
    wrapEl = document.querySelector('.mc-canvas-wrap');
    ctx = canvas.getContext('2d');

    window.addEventListener('resize', ajustarCanvas);

    const resumen = window.MiniCity.procesarTiempo();
    window.MiniCity.guardar();
    window.MiniCity.procesarTimers();

    ajustarCanvas();
    actualizarUI();
    bindInput();
    bindBotones();

    const estado = window.MiniCity.getEstado();
    const tieneAlgo = estado.celdas.some(c => c.tipo);
    if (!tieneAlgo) {
        mostrarBienvenida(null);
    } else if (resumen.creditosGanados >= 0.5 || resumen.osGanadas >= 0.5) {
        mostrarBienvenida(resumen);
    }

    ultimoTick = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
