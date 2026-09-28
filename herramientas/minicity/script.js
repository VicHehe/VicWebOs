// ============================================================
//  script.js — UI de MiniCity
//  ------------------------------------------------------------
//  Render isométrico en canvas, input, modales, HUD, loop.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'minicity';

// ---- Dimensiones isométricas ----
const TILE_W = 78;   // ancho visual de una celda
const TILE_H = 39;   // alto visual de una celda (ratio 2:1)

// ---- Estado de render ----
let canvas, ctx;
let wrapEl;
let dpr = 1;
let anchoCSS = 0, altoCSS = 0;
let originX = 0, originY = 0;      // punto de proyección del centro de la celda (0,0)

// ---- Estado de UI ----
let celdaSeleccionada = null;
let ultimoResumenTiempo = null;
let rafId = null;
let ultimoTick = 0;

// ---- Colores (se leen del tema) ----
const colores = {
    cesped:      '#E8E8EE',
    cespedAlt:   '#DDDDE5',
    borde:       '#C4C4CF',
    selBorde:    '#8B5CF6',
    selRelleno:  'rgba(139,92,246,0.18)',
    resBase:     '#10B981',
    resOscuro:   '#047857',
    comBase:     '#3B82F6',
    comOscuro:   '#1E40AF',
    indBase:     '#F59E0B',
    indOscuro:   '#B45309',
    humo:        'rgba(120,120,140,0.55)',
    sombra:      'rgba(0,0,0,0.14)',
    texto:       '#18181B'
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
    } catch (e) { /* silencioso */ }
}

function leerColoresDelTema() {
    const cs = (name, fallback) => {
        try {
            const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) { return fallback; }
    };
    colores.cesped     = cs('--bg-alt', '#F5F5F8');
    colores.cespedAlt  = cs('--gray-100', '#F4F4F7');
    colores.borde      = cs('--gray-300', '#D4D4DD');
    colores.selBorde   = cs('--violet-500', '#8B5CF6');
    colores.texto      = cs('--gray-900', '#18181B');
    // Los colores semánticos de los edificios son fijos (verde/azul/naranja)
    // para que se lean independiente del tema.
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
//  Canvas: dimensiones
// ============================================================
function ajustarCanvas() {
    if (!canvas || !wrapEl) return;
    const rect = wrapEl.getBoundingClientRect();
    anchoCSS = rect.width;
    altoCSS = rect.height;
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
    // El centro visual de la grilla. Queremos que quede centrada y un poco
    // arriba del centro para dejar espacio a los edificios altos.
    const cols = window.MiniCity.GRILLA_COLS;
    const filas = window.MiniCity.GRILLA_FILAS;
    const anchoIsometrico  = (cols + filas) * TILE_W / 2;
    const altoIsometrico   = (cols + filas) * TILE_H / 2;

    // El punto (col=0, fila=0) tiene su esquina superior en el tope del rombo.
    // Calculamos su centro en pantalla.
    const cx = anchoCSS / 2;
    const cy = (altoCSS - altoIsometrico) / 2 + 30;   // un poco arriba del centro
    // Centro de la celda (0,0) = esquina del rombo + (TILE_W/2, TILE_H/2)
    // esquinaX = cx - anchoIsometrico/2
    // esquinaY = cy
    originX = cx - anchoIsometrico / 2 + TILE_W / 2;
    originY = cy + TILE_H / 2;
}

// ============================================================
//  Proyección isométrica
// ============================================================
function proyCentroCelda(col, fila) {
    // Centro de la celda (col, fila) en pantalla
    const x = originX + (col - fila) * (TILE_W / 2);
    const y = originY + (col + fila) * (TILE_H / 2);
    return { x, y };
}

function screenToCell(px, py) {
    // Invertir la proyección para saber en qué celda cayó el tap.
    const rx = px - originX;
    const ry = py - originY;
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    const c = (rx / hw + ry / hh) / 2;
    const f = (ry / hh - rx / hw) / 2;
    const col = Math.floor(c + 0.5);
    const fila = Math.floor(f + 0.5);
    return { col, fila };
}

// ============================================================
//  Dibujado
// ============================================================
function dibujar() {
    if (!ctx || !canvas || !window.MiniCity) return;
    const estado = window.MiniCity.getEstado();
    if (!estado) return;

    ctx.clearRect(0, 0, anchoCSS, altoCSS);

    // Fondo
    ctx.fillStyle = colores.cesped;
    ctx.fillRect(0, 0, anchoCSS, altoCSS);

    // Ordenar celdas por (col + fila) para que las de atrás se pinten primero.
    const ordenadas = estado.celdas.slice().sort((a, b) => {
        const da = a.col + a.fila;
        const db = b.col + b.fila;
        if (da !== db) return da - db;
        return a.col - b.col;
    });

    // 1) Dibujar los suelos (rombos) de TODAS las celdas primero
    ordenadas.forEach(celda => {
        dibujarSuelo(celda, celdaSeleccionada === celda);
    });

    // 2) Dibujar los edificios encima, en el mismo orden
    ordenadas.forEach(celda => {
        if (celda.tipo && celda.nivel > 0 || (celda.tipo && celda.finConstruccion)) {
            dibujarEdificio(celda);
        }
    });
}

function dibujarSuelo(celda, seleccionada) {
    const { x, y } = proyCentroCelda(celda.col, celda.fila);
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;

    // Rombo
    ctx.beginPath();
    ctx.moveTo(x,         y - hh);
    ctx.lineTo(x + hw,    y);
    ctx.lineTo(x,         y + hh);
    ctx.lineTo(x - hw,    y);
    ctx.closePath();

    // Relleno
    const esPar = (celda.col + celda.fila) % 2 === 0;
    ctx.fillStyle = esPar ? colores.cesped : colores.cespedAlt;
    ctx.fill();

    // Borde
    ctx.strokeStyle = seleccionada ? colores.selBorde : colores.borde;
    ctx.lineWidth = seleccionada ? 2.5 : 1;
    ctx.stroke();

    // Relleno de selección
    if (seleccionada) {
        ctx.fillStyle = colores.selRelleno;
        ctx.fill();
    }
}

function dibujarEdificio(celda) {
    const { x, y } = proyCentroCelda(celda.col, celda.fila);
    const tipo = celda.tipo;
    const nivelMostrado = celda.finConstruccion
        ? Math.max(1, celda.nivel)      // mientras construye, muestra el nivel destino
        : celda.nivel;
    const nivel = Math.max(1, Math.min(3, nivelMostrado));

    // Colores según tipo
    let base, oscuro;
    if (tipo === 'residencial') { base = colores.resBase; oscuro = colores.resOscuro; }
    else if (tipo === 'comercial') { base = colores.comBase; oscuro = colores.comOscuro; }
    else { base = colores.indBase; oscuro = colores.indOscuro; }

    // Alturas por nivel
    const alturas = { 1: 22, 2: 34, 3: 48 };
    const alturasCom = { 1: 26, 2: 40, 3: 56 };
    const alturasInd = { 1: 18, 2: 26, 3: 36 };
    let altura = alturas[nivel];
    if (tipo === 'comercial') altura = alturasCom[nivel];
    if (tipo === 'industrial') altura = alturasInd[nivel];

    // Ancho del cuerpo (más chico que el rombo para que "respire")
    const cuerpoW = TILE_W * 0.55;   // ancho horizontal
    const cuerpoH = TILE_H * 0.55;   // profundidad (mitad inferior visible)

    // Base (parte de atrás del cubo)
    // Punto de referencia: parte trasera del rombo = (x, y - hh * 0.5)
    const hw = cuerpoW / 2;
    const hh = cuerpoH / 2;

    // Sombra en el suelo
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x,          y + 4 - hh);
    ctx.lineTo(x + hw,     y + 4);
    ctx.lineTo(x,          y + 4 + hh);
    ctx.lineTo(x - hw,     y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Si está en construcción, semitransparente y con andamio
    const enConstruccion = !!celda.finConstruccion;
    const alphaBase = enConstruccion ? 0.55 : 1;
    ctx.globalAlpha = alphaBase;

    // Caras del cubo:
    //  · Pared izquierda (más oscura)
    //  · Pared derecha (base)
    //  · Techo (más claro)
    const topX = x;
    const topY = y - altura;   // tope del techo

    // Pared izquierda (visible, lado izquierdo)
    ctx.beginPath();
    ctx.moveTo(x - hw, y);            // esquina izquierda del rombo base
    ctx.lineTo(x,      y + hh);       // esquina frontal (abajo)
    ctx.lineTo(x,      y + hh - altura);
    ctx.lineTo(x - hw, y - altura);
    ctx.closePath();
    ctx.fillStyle = oscuro;
    ctx.fill();

    // Pared derecha (visible, lado derecho)
    ctx.beginPath();
    ctx.moveTo(x,      y + hh);       // esquina frontal
    ctx.lineTo(x + hw, y);            // esquina derecha
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

    // Detalles por tipo
    if (tipo === 'residencial') {
        // Puerta (en la pared derecha)
        const puertaW = 6;
        const puertaH = Math.max(8, altura * 0.4);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 4, y + hh - altura / 2 - puertaH / 2 - 2, puertaW, puertaH);
        if (nivel >= 2) {
            // Ventana en pared izquierda
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(x - hw + 4, y - altura + 6, 6, 6);
        }
    } else if (tipo === 'comercial') {
        // Ventanal ancho
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        const vW = hw * 0.7;
        const vH = Math.max(6, altura * 0.35);
        ctx.fillRect(x + 3, y + hh - altura / 2 - vH / 2 - 2, vW, vH);
        if (nivel >= 2) {
            // Segundo ventanal arriba
            ctx.fillRect(x + 3, y + hh - altura / 2 - vH / 2 - 2 - vH - 4, vW, vH);
        }
        if (nivel >= 3) {
            // Tercero
            ctx.fillRect(x + 3, y + hh - altura / 2 - vH / 2 - 2 - (vH + 4) * 2, vW, vH);
        }
    } else if (tipo === 'industrial') {
        // Chimenea
        const chimW = 5;
        const chimAlto = Math.max(10, altura * 0.7);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 6, y - altura - chimAlto + 4, chimW, chimAlto + 4);
        // Humo (si no está en construcción)
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

    // Andamio si está en construcción
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

// Aclarar u oscurecer hex
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
        if (celda.col < 0 || celda.col >= window.MiniCity.GRILLA_COLS) return;
        if (celda.fila < 0 || celda.fila >= window.MiniCity.GRILLA_FILAS) return;
        abrirCelda(celda.col, celda.fila);
    };

    canvas.addEventListener('click', (e) => {
        e.preventDefault();
        manejar(e.clientX, e.clientY);
    });

    let touchManejado = false;
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            touchManejado = true;
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
    const idx = fila * window.MiniCity.GRILLA_COLS + col;
    const celda = estado.celdas[idx];
    if (!celda) return;

    celdaSeleccionada = celda;
    dibujar();

    if (!celda.tipo) {
        abrirModalConstruir(celda, idx);
    } else {
        abrirModalEdificio(celda, idx);
    }
}

function abrirModalConstruir(celda, idx) {
    const cont = document.getElementById('mcOpcionesConstruir');
    const coord = document.getElementById('mcModalCoord');
    coord.textContent = `Columna ${celda.col + 1}, fila ${celda.fila + 1}`;

    const estado = window.MiniCity.getEstado();
    const creditos = Math.floor(estado.creditos);
    const libres = window.MiniCity.constructoresDisponibles();

    cont.innerHTML = '';
    ['residencial', 'comercial', 'industrial'].forEach(tipoId => {
        const def = window.MiniCity.TIPOS[tipoId];
        const puede = window.MiniCity.puedeConstruir(idx, tipoId);
        const costo = def.costos[0];

        const btn = document.createElement('button');
        btn.className = 'mc-opcion' + (puede.ok ? '' : ' bloqueada');
        btn.innerHTML = `
            <div class="mc-opcion-icono ${tipoId}"><i data-lucide="${def.icono}"></i></div>
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
    } else if (creditos < 50) {
        const aviso = document.createElement('p');
        aviso.style.cssText = 'font-size:12px;color:#92400E;font-weight:700;text-align:center;margin-top:8px;';
        aviso.textContent = `Tenés ${creditos} créditos. Esperá a juntar más.`;
        cont.appendChild(aviso);
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

    // Nivel visual
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

    // Stats
    const aporte = nivelActual > 0 ? def.aporte[nivelActual - 1] : 0;
    let statLabel = 'Aporta';
    let statValor = aporte;
    if (celda.tipo === 'residencial') statLabel = 'Población';
    if (celda.tipo === 'comercial')   statLabel = 'Créditos base';
    if (celda.tipo === 'industrial')  statLabel = 'Empleos';

    html += `
        <div class="mc-edif-stats">
            <div class="mc-edif-stat">
                <span class="mc-edif-stat-label">${statLabel}</span>
                <span class="mc-edif-stat-valor">+${statValor}</span>
            </div>
            <div class="mc-edif-stat">
                <span class="mc-edif-stat-label">Tipo</span>
                <span class="mc-edif-stat-valor">${def.nombre}</span>
            </div>
        </div>
    `;

    // Timer o acciones
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

    // Bind de acciones
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
//  Tienda (constructores)
// ============================================================
function abrirTienda() {
    const estado = window.MiniCity.getEstado();
    if (!estado) return;
    const cont = document.getElementById('mcTiendaCuerpo');
    cont.innerHTML = '';

    // Constructor 2
    if (estado.constructoresComprados >= 2) {
        const item = document.createElement('div');
        item.className = 'mc-tienda-item comprado';
        item.innerHTML = `
            <div class="mc-tienda-icono"><i data-lucide="hard-hat"></i></div>
            <div class="mc-tienda-info">
                <span class="mc-tienda-nombre">Segundo constructor</span>
                <span class="mc-tienda-desc">Ya lo tenés. Podés construir 2 cosas a la vez.</span>
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
                <span class="mc-tienda-desc">Ya lo tenés. Podés construir 3 cosas a la vez.</span>
            </div>
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

    const btn2 = document.getElementById('mcBtnCons2');
    if (btn2) {
        btn2.addEventListener('click', async () => {
            try {
                btn2.disabled = true;
                await window.MiniCity.comprarConstructor2();
                toast('¡Segundo constructor desbloqueado!', 'success');
                abrirTienda();
                actualizarUI();
            } catch (e) {
                toast(e.message || 'No se pudo comprar', 'error');
                btn2.disabled = false;
            }
        });
    }

    const btn3 = document.getElementById('mcBtnCons3');
    if (btn3) {
        btn3.addEventListener('click', async () => {
            try {
                btn3.disabled = true;
                await window.MiniCity.comprarConstructor3();
                toast('¡Tercer constructor desbloqueado!', 'success');
                abrirTienda();
                actualizarUI();
            } catch (e) {
                toast(e.message || 'No se pudo comprar', 'error');
                btn3.disabled = false;
            }
        });
    }
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
    set('mcProdHora', stats.creditosHora.toFixed(1) + '/h');
    set('mcBanco', Math.floor(estado.bancoOS));

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

    // Hint canvas
    const hint = document.getElementById('mcCanvasHint');
    if (hint) {
        const tieneAlgo = estado.celdas.some(c => c.tipo);
        hint.classList.toggle('oculto', tieneAlgo);
    }

    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  Loop
// ============================================================
function loop() {
    const ahora = performance.now();
    if (!ultimoTick) ultimoTick = ahora;
    const deltaMs = Math.min(ahora - ultimoTick, 250);
    ultimoTick = ahora;

    // Procesar timers cada 250ms aprox
    if (!window.__mcUltimoProcTimers || ahora - window.__mcUltimoProcTimers > 250) {
        window.__mcUltimoProcTimers = ahora;
        const terminadas = window.MiniCity.procesarTimers();
        if (terminadas.length > 0) {
            terminadas.forEach(t => {
                const def = window.MiniCity.TIPOS[t.tipo];
                toast(`${def.nombre} nivel ${t.nivel} completado`, 'success');
            });
            window.MiniCity.guardar();
            actualizarUI();
        }
    }

    // Procesar producción cada 5 segundos (para no petar el disco)
    if (!window.__mcUltimoProcProd || ahora - window.__mcUltimoProcProd > 5000) {
        window.__mcUltimoProcProd = ahora;
        const resultado = window.MiniCity.procesarTiempo();
        if (resultado.creditosGanados > 0 || resultado.osGanadas > 0) {
            actualizarUI();
        }
    }

    // Timer visible dentro del modal de edificio
    if (celdaSeleccionada && celdaSeleccionada.finConstruccion) {
        const estado = window.MiniCity.getEstado();
        const idx = celdaSeleccionada.fila * window.MiniCity.GRILLA_COLS + celdaSeleccionada.col;
        const c = estado.celdas[idx];
        if (c && c.finConstruccion) actualizarTimerEdificio(idx);
    }

    // Redibujar cada frame (para humo animado y andamios)
    dibujar();

    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  Bienvenida / resumen de ausencia
// ============================================================
function mostrarBienvenida(resumen) {
    const overlay = document.getElementById('mcOverlayBienvenida');
    const resumenEl = document.getElementById('mcOverlayResumen');
    if (!overlay) return;

    if (resumen && (resumen.creditosGanados > 0 || resumen.osGanadas > 0)) {
        const partes = [];
        if (resumen.creditosGanados > 0) {
            partes.push(`
                <div class="mc-overlay-resumen-fila">
                    <span>Créditos</span>
                    <strong>+${resumen.creditosGanados.toLocaleString('es-CL')}</strong>
                </div>`);
        }
        if (resumen.osGanadas >= 1) {
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
        }
    } else {
        resumenEl.hidden = true;
    }

    overlay.hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  Bind botones globales
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

    // Cerrar modal al tocar el fondo oscuro
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
    if (!api) {
        alert('MiniCity necesita estar dentro de VicWebOs.');
        return;
    }

    const usuario = api.obtenerCuenta?.();
    if (!usuario) {
        alert('Necesitás iniciar sesión.');
        return;
    }

    // Badge usuario
    const badge = document.getElementById('mcUserBadge');
    if (badge) badge.textContent = `@${usuario.codigo} · ${usuario.nombre}`;

    // Init del core
    await window.MiniCity.init(usuario);

    // Canvas
    canvas = document.getElementById('mcCanvas');
    wrapEl = document.querySelector('.mc-canvas-wrap');
    ctx = canvas.getContext('2d');

    // Calcular tamaño y proyección
    window.addEventListener('resize', () => {
        ajustarCanvas();
    });

    // Procesar tiempo transcurrido y mostrar resumen
    const resumen = window.MiniCity.procesarTiempo();
    window.MiniCity.guardar();

    // Procesar timers que hayan terminado mientras estaba fuera
    window.MiniCity.procesarTimers();

    // UI
    ajustarCanvas();
    actualizarUI();
    bindInput();
    bindBotones();

    // Bienvenida si es primera vez (sin celdas)
    const estado = window.MiniCity.getEstado();
    const tieneAlgo = estado.celdas.some(c => c.tipo);
    if (!tieneAlgo) {
        mostrarBienvenida(null);
    } else if (resumen.creditosGanados > 0 || resumen.osGanadas >= 1) {
        mostrarBienvenida(resumen);
    }

    // Arrancar loop
    ultimoTick = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
