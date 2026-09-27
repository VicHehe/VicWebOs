// ============================================================
//  Clan Torral — Motor del juego
//  ------------------------------------------------------------
//  Grid 5 columnas × 14 filas.
//  Filas 0 = torres rivales · Filas 13 = torres tuyas.
//  Fila 7 = río (puentes en cols 0,1,3,4 · agua en col 2).
//
//  BD: al terminar la partida, UN SOLO escribirArchivo.
// ============================================================

'use strict';

const MENSAJE_TEMA     = 'vicwebos_tema_cambio';
const APP_ID           = 'clan-torral';
const ARCHIVO_BASE     = 'app/clan-torral/';
const FILAS            = 14;
const COLS             = 5;
const FILA_RIO         = 7;
const FILA_BASE_TOP    = 0;
const FILA_BASE_BOTTOM = 13;
const DURACION_MS      = 180000;   // 3 min
const ELIXIR_MAX       = 10;
const ELIXIR_INTERVALO = 2800;     // ms por unidad de elixir
const TICK_MS          = 1000 / 60;

// Torres: HP / daño / rango / intervalo de ataque
const TORRE = {
    princesa: { hp: 1400, dano: 42, rango: 3.5, intervalo: 800 },
    rey:      { hp: 2600, dano: 55, rango: 3.5, intervalo: 1000 }
};

// Premios
const PREMIO_VICTORIA   = 5;
const PREMIO_DERROTA    = 1;
const PREMIO_PERFECTA   = 3;   // sin perder torres
const CAP_DIARIO        = 50;

// ─── ESTADO ───
let estado = {
    version: 1,
    victorias: 0,
    derrotas: 0,
    torresDestruidas: 0,
    monedasGanadas: 0,
    monedasHoy: 0,
    diaUltimo: '',
    rachaActual: 0,
    mejorRacha: 0,
    ultimaVez: new Date().toISOString()
};

let usuarioActual = null;
let inicializado  = false;
let juegoActivo   = false;

let campo = null;           // div.ct-campo
let celdas = [];            // array 2D [y][x] = DOMElement
let cellW = 0, cellH = 0;   // píxeles por celda
let campoRect = null;       // bounding rect cacheado

let tiempoRestanteMs = DURACION_MS;
let elixirFloat      = 5;
let mazo             = [];
let proximaCarta     = null;
let cartaSeleccionada = null;

let unidades         = [];   // todas las unidades vivas (tropas y torres)
let torres           = [];   // referencia rápida a las torres
let proximoId        = 1;

let cpuTimer         = 0;
let cpuCooldown      = 1500;

let rafId            = null;
let ultimoFrameMs    = 0;
let fpsContador      = 0;
let fpsTimer         = 0;
let fpsValor         = 0;

// ─── API / BD ───
const API = () => { try { return window.parent.__vicwebos || null; } catch(e) { return null; } };
const BD  = () => { try { return window.parent.ConfigBD || null; } catch(e) { return null; } };

// ============================================================
//  FECHA CHILE
// ============================================================
function diaChileHoy() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

// ============================================================
//  TEMA
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

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let toastTimer = null;
function toast(txt, tipo = 'info') {
    const el = document.getElementById('ctToast');
    if (!el) return;
    el.textContent = txt;
    el.className = 'ct-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ============================================================
//  UTILIDADES
// ============================================================
function rand(min, max) { return min + Math.random() * (max - min); }
function elegir(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(x1, y1, x2, y2) { const dx = x2-x1, dy = y2-y1; return Math.sqrt(dx*dx+dy*dy); }
function formatearTiempo(ms) {
    const s = Math.max(0, Math.ceil(ms/1000));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
}

// ============================================================
//  CELDAS
// ============================================================
function construirCampo() {
    campo = document.getElementById('ctCampo');
    if (!campo) return;
    campo.innerHTML = '';
    celdas = [];

    const puentesCols = [0, 1, 3, 4];  // agua solo en col 2

    for (let y = 0; y < FILAS; y++) {
        celdas[y] = [];
        for (let x = 0; x < COLS; x++) {
            const c = document.createElement('div');
            c.className = 'ct-celda';
            c.dataset.x = x;
            c.dataset.y = y;

            if (y === FILA_RIO) {
                c.classList.add('fila-rio');
                if (puentesCols.includes(x)) c.classList.add('puente');
            } else if (y < FILA_RIO) {
                c.classList.add('lado-rival');
            } else {
                c.classList.add('lado-tuyo');
            }

            // Reservar slots de torres
            if ((y === FILA_BASE_TOP || y === FILA_BASE_BOTTOM) && (x === 0 || x === 2 || x === 4)) {
                c.classList.add('torre-slot');
            }

            c.addEventListener('click', () => clickCelda(x, y));
            campo.appendChild(c);
            celdas[y][x] = c;
        }
    }

    recalcularDimensiones();
    window.addEventListener('resize', recalcularDimensiones);
}

function recalcularDimensiones() {
    if (!campo) return;
    const r = campo.getBoundingClientRect();
    campoRect = r;
    cellW = r.width  / COLS;
    cellH = r.height / FILAS;
    // Reposicionar torres y unidades
    torres.forEach(t => posicionarTorre(t));
    unidades.forEach(u => { if (!u.esTorre) posicionarUnidad(u); });
}

// ============================================================
//  TORRES
// ============================================================
function crearTorres() {
    torres = [];
    // Rival arriba
    torres.push(crearTorre('princesa', 'rival', 0, 0));
    torres.push(crearTorre('rey',      'rival', 2, 0));
    torres.push(crearTorre('princesa', 'rival', 4, 0));
    // Tuyas abajo
    torres.push(crearTorre('princesa', 'tuyo', 0, 13));
    torres.push(crearTorre('rey',      'tuyo', 2, 13));
    torres.push(crearTorre('princesa', 'tuyo', 4, 13));
    unidades.push(...torres);
}

function crearTorre(tipo, bando, x, y) {
    const cfg = TORRE[tipo];
    const el = document.createElement('div');
    el.className = `ct-torre ct-torre-${bando} ct-torre-${tipo}`;
    el.innerHTML = `
        <div class="ct-torre-icono"><i data-lucide="${tipo === 'rey' ? 'crown' : 'castle'}"></i></div>
        <div class="ct-torre-hp"><div class="ct-torre-hp-fill" data-hp></div></div>
    `;
    campo.appendChild(el);
    if (window.lucide) lucide.createIcons();

    const t = {
        id: proximoId++,
        esTorre: true,
        tipo, bando,
        x, y, ancho: 1, alto: 1,
        hp: cfg.hp,
        hpMax: cfg.hp,
        dano: cfg.dano,
        rango: cfg.rango,
        intervaloAtaque: cfg.intervalo,
        cooldown: 0,
        el,
        viva: true
    };
    posicionarTorre(t);
    return t;
}

function posicionarTorre(t) {
    if (!t.el) return;
    const size = t.tipo === 'rey' ? 1 : 1;
    const w = cellW * size * 0.94;
    const h = cellH * size * 0.94;
    // Centrado en la celda
    const px = t.x * cellW + (cellW - w) / 2;
    const py = t.y * cellH + (cellH - h) / 2;
    t.el.style.left   = px + 'px';
    t.el.style.top    = py + 'px';
    t.el.style.width  = w + 'px';
    t.el.style.height = h + 'px';
}

// ============================================================
//  UNIDADES (tropas)
// ============================================================
function crearUnidad(carta, bando, cx, cy) {
    // cx, cy = centro en casillas (float)
    const el = document.createElement('div');
    const esGrande = carta.ancho >= 2 || carta.alto >= 2;
    el.className = `ct-unidad ct-unidad-${bando}${esGrande ? ' ct-unidad-2x2' : ''}`;
    el.innerHTML = `
        <i data-lucide="${carta.icono}"></i>
        <div class="ct-unidad-hp"><div class="ct-unidad-hp-fill" data-hp></div></div>
    `;
    campo.appendChild(el);
    if (window.lucide) lucide.createIcons();

    const u = {
        id: proximoId++,
        esTorre: false,
        bando,
        carta,
        x: cx, y: cy,           // centro en casillas
        ancho: carta.ancho,
        alto:  carta.alto,
        hp: carta.hp,
        hpMax: carta.hp,
        dano: carta.dano,
        rango: carta.rango,
        velocidad: carta.velocidad,
        objetivo: carta.objetivo,
        area: carta.area || false,
        cooldownAtaque: 0,
        intervaloAtaque: 800,   // tropas atacan cada 0.8s
        el,
        viva: true,
        atacandoFlash: 0
    };
    posicionarUnidad(u);
    return u;
}

function posicionarUnidad(u) {
    if (!u.el) return;
    const w = u.ancho * cellW * 0.88;
    const h = u.alto  * cellH * 0.88;
    // x,y son el CENTRO en casillas
    const px = u.x * cellW - w / 2;
    const py = u.y * cellH - h / 2;
    u.el.style.width  = w + 'px';
    u.el.style.height = h + 'px';
    u.el.style.transform = `translate(${px}px, ${py}px)`;
    // Actualizar HP bar
    const hpFill = u.el.querySelector('[data-hp]');
    if (hpFill) {
        const pct = clamp(u.hp / u.hpMax, 0, 1) * 100;
        hpFill.style.width = pct + '%';
        hpFill.classList.toggle('medio', pct < 60 && pct >= 30);
        hpFill.classList.toggle('bajo',  pct < 30);
    }
}

// ============================================================
//  COLOCACIÓN
// ============================================================
function clickCelda(x, y) {
    if (!juegoActivo) return;
    if (!cartaSeleccionada) return;

    // Debe ser tu lado (debajo del río)
    if (y <= FILA_RIO) { toast('Solo podés desplegar en tu lado', 'info'); return; }

    // No colocar sobre torres ocupadas
    if (y === FILA_BASE_BOTTOM && (x === 0 || x === 2 || x === 4)) return;

    const carta = cartaSeleccionada;
    const centroX = x + (carta.ancho - 1) / 2 + 0.5;
    const centroY = y + (carta.alto  - 1) / 2 + 0.5;

    // Validar que las 4 esquinas del 2x2 estén dentro
    if (x + carta.ancho > COLS || y + carta.alto > FILAS) return;
    if (y + carta.alto - 1 > 13) return;

    // Validar que no esté debajo del río el borde superior
    if (y <= FILA_RIO) return;

    desplegarCarta(carta, 'tuyo', centroX, centroY);
    consumirCarta(carta);
    limpiarSeleccion();
}

function desplegarCarta(carta, bando, cx, cy) {
    for (let i = 0; i < carta.unidades; i++) {
        // Offset para hordas
        let ox = 0, oy = 0;
        if (carta.unidades > 1) {
            const ang = (Math.PI * 2 * i) / carta.unidades;
            const rad = 0.35;
            ox = Math.cos(ang) * rad;
            oy = Math.sin(ang) * rad;
        }
        const u = crearUnidad(carta, bando, cx + ox, cy + oy);
        unidades.push(u);
    }
}

// ============================================================
//  SELECCIÓN DE CARTAS
// ============================================================
function seleccionarCarta(carta, slotEl) {
    if (!juegoActivo) return;
    if (elixirFloat < carta.coste) {
        toast(`Necesitás ${carta.coste} de elixir`, 'error');
        return;
    }
    limpiarSeleccion();
    cartaSeleccionada = carta;
    if (slotEl) slotEl.classList.add('seleccionada');
    pintarCeldasColocables(carta);
}

function limpiarSeleccion() {
    cartaSeleccionada = null;
    document.querySelectorAll('.ct-carta.seleccionada').forEach(el => el.classList.remove('seleccionada'));
    celdas.forEach(row => row.forEach(c => c.classList.remove('colocable', 'invalida')));
}

function pintarCeldasColocables(carta) {
    for (let y = FILA_RIO + 1; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (x + carta.ancho > COLS) continue;
            if (y + carta.alto > FILAS) continue;
            if (y + carta.alto - 1 > 13) continue;
            // No marcar slots de torres ocupadas
            let bloqueada = false;
            for (let dy = 0; dy < carta.alto; dy++) {
                for (let dx = 0; dx < carta.ancho; dx++) {
                    const yy = y + dy, xx = x + dx;
                    if (yy === FILA_BASE_BOTTOM && (xx === 0 || xx === 2 || xx === 4)) bloqueada = true;
                }
            }
            if (bloqueada) continue;
            celdas[y][x].classList.add('colocable');
        }
    }
}

// ============================================================
//  ELIXIR / MAZO
// ============================================================
function barajarMazo() {
    mazo = [...MAZO_DEFAULT];
    for (let i = mazo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
    }
    // Sacamos 4 cartas para "mano", quedan las otras 4 en la cola
    proximaCarta = mazo.shift();
}

function consumirCarta(carta) {
    elixirFloat -= carta.coste;
    mazo.push(carta.id);
    // La siguiente entra a la mano como "próxima" y se rota la cola
    mazo.push(proximaCarta);
    proximaCarta = mazo.shift();
    renderMazo();
    renderElixir();
}

function renderMazo() {
    const cont = document.getElementById('ctMazo');
    if (!cont) return;
    cont.innerHTML = '';

    // Tomamos las primeras 4 cartas de la cola como "mano"
    const mano = mazo.slice(0, 4);

    mano.forEach(id => {
        const carta = obtenerCarta(id);
        if (!carta) return;
        const disponible = elixirFloat >= carta.coste;
        const el = document.createElement('div');
        el.className = 'ct-carta ' + (disponible ? 'disponible' : 'bloqueada');
        el.innerHTML = `
            <div class="ct-carta-icono"><i data-lucide="${carta.icono}"></i></div>
            <div class="ct-carta-nombre">${carta.nombre}</div>
            <div class="ct-carta-coste">${carta.coste}</div>
        `;
        el.addEventListener('click', () => seleccionarCarta(carta, el));
        cont.appendChild(el);
    });

    // Carta "siguiente"
    const sig = obtenerCarta(proximaCarta);
    if (sig) {
        const el = document.createElement('div');
        el.className = 'ct-carta bloqueada';
        el.innerHTML = `
            <div class="ct-carta-siguiente">Siguiente</div>
            <div class="ct-carta-icono"><i data-lucide="${sig.icono}"></i></div>
            <div class="ct-carta-nombre">${sig.nombre}</div>
            <div class="ct-carta-coste">${sig.coste}</div>
        `;
        cont.appendChild(el);
    }

    if (window.lucide) lucide.createIcons();
}

function renderElixir() {
    const cont = document.getElementById('ctElixirPuntos');
    const num  = document.getElementById('ctElixirNum');
    if (!cont) return;
    const activos = Math.floor(elixirFloat);
    // Solo rebuild si es necesario
    if (cont.children.length !== ELIXIR_MAX) {
        cont.innerHTML = '';
        for (let i = 0; i < ELIXIR_MAX; i++) {
            const d = document.createElement('div');
            d.className = 'ct-elixir-pt';
            cont.appendChild(d);
        }
    }
    Array.from(cont.children).forEach((el, i) => {
        el.classList.toggle('activo', i < activos);
    });
    if (num) num.textContent = Math.floor(elixirFloat);
}

// ============================================================
//  COMBATE
// ============================================================
function buscarObjetivo(u) {
    let mejor = null;
    let mejorDist = Infinity;

    const puedeAtacarTropas = u.objetivo === 'tropas' || u.objetivo === 'ambos';
    const puedeAtacarTorres = u.objetivo === 'torres' || u.objetivo === 'ambos';

    // Torres primero si objetivo === 'torres'
    const ordenPrioridad = u.objetivo === 'torres' ? ['torres', 'tropas']
                          : u.objetivo === 'tropas' ? ['tropas', 'torres']
                          : ['tropas', 'torres'];

    for (const tipo of ordenPrioridad) {
        if (tipo === 'tropas' && !puedeAtacarTropas) continue;
        if (tipo === 'torres' && !puedeAtacarTorres) continue;

        for (const e of unidades) {
            if (!e.viva) continue;
            if (e.bando === u.bando) continue;
            if (tipo === 'tropas' && e.esTorre) continue;
            if (tipo === 'torres' && !e.esTorre) continue;

            // La torre rey solo es objetivo si su princesa del mismo lado cayó (o si sos la tropa no hay otras)
            if (e.esTorre && e.tipo === 'rey') {
                const princesaLado = torres.find(t =>
                    t.bando === e.bando && t.tipo === 'princesa' &&
                    ((e.x < 2 && t.x < 2) || (e.x > 2 && t.x > 2))
                );
                if (princesaLado && princesaLado.viva) continue; // rey protegido
            }

            const d = dist(u.x, u.y, e.x, e.y);
            if (d < mejorDist) { mejorDist = d; mejor = e; }
        }
        if (mejor) break;
    }
    return { objetivo: mejor, distancia: mejorDist };
}

function tickUnidad(u, dt) {
    if (!u.viva) return;
    if (u.esTorre) return tickTorre(u, dt);

    u.cooldownAtaque = Math.max(0, u.cooldownAtaque - dt * 1000);

    const res = buscarObjetivo(u);
    if (!res.objetivo) return;

    const rango = u.rango + (res.objetivo.esTorre ? 0.5 : 0);
    if (res.distancia <= rango) {
        // Atacar
        if (u.cooldownAtaque <= 0) {
            atacar(u, res.objetivo);
            u.cooldownAtaque = u.intervaloAtaque;
        }
    } else {
        // Mover hacia el objetivo
        const dx = res.objetivo.x - u.x;
        const dy = res.objetivo.y - u.y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const paso = u.velocidad * dt;
        u.x += (dx/len) * paso;
        u.y += (dy/len) * paso;
        posicionarUnidad(u);
    }
}

function tickTorre(t, dt) {
    if (!t.viva) return;
    t.cooldown = Math.max(0, t.cooldown - dt * 1000);
    if (t.cooldown > 0) return;

    // Buscar enemigo en rango
    let objetivo = null;
    let mejorDist = Infinity;
    for (const u of unidades) {
        if (!u.viva || u.esTorre) continue;
        if (u.bando === t.bando) continue;
        const d = dist(t.x, t.y, u.x, u.y);
        if (d <= t.rango && d < mejorDist) { mejorDist = d; objetivo = u; }
    }
    if (objetivo) {
        atacar(t, objetivo);
        t.cooldown = t.intervaloAtaque;
    }
}

function atacar(atacante, victima) {
    if (atacante.area) {
        // Daño en área (radio pequeño)
        const r = 1.0;
        for (const u of unidades) {
            if (!u.viva || u.bando === atacante.bando) continue;
            if (u.esTorre) continue;
            const d = dist(victima.x, victima.y, u.x, u.y);
            if (d <= r) {
                aplicarDano(u, atacante.dano);
            }
        }
    } else {
        aplicarDano(victima, atacante.dano);
    }

    // Flash visual
    if (atacante.el) {
        atacante.el.classList.add('atacando');
        setTimeout(() => atacante.el?.classList.remove('atacando'), 180);
    }

    // Popup de daño
    if (victima.el && !victima.esTorre) {
        mostrarPopup(victima.x, victima.y, '-' + Math.round(atacante.dano), 'dmg');
    } else if (victima.esTorre) {
        mostrarPopup(victima.x, victima.y, '-' + Math.round(atacante.dano), 'dmg');
    }
}

function aplicarDano(u, dano) {
    u.hp -= dano;
    if (u.hp <= 0) {
        u.hp = 0;
        u.viva = false;
        if (u.esTorre) {
            if (u.el) u.el.classList.add('ct-torre-caida');
            // Verificar fin de partida
            if (u.tipo === 'rey') {
                finDePartida(u.bando === 'rival' ? 'victoria' : 'derrota');
            }
        } else {
            if (u.el && u.el.parentNode) u.el.parentNode.removeChild(u.el);
        }
    } else if (!u.esTorre) {
        posicionarUnidad(u);
    } else {
        // Actualizar barra de torre
        const hpFill = u.el?.querySelector('[data-hp]');
        if (hpFill) {
            const pct = clamp(u.hp / u.hpMax, 0, 1) * 100;
            hpFill.style.width = pct + '%';
            hpFill.classList.toggle('medio', pct < 60 && pct >= 30);
            hpFill.classList.toggle('bajo',  pct < 30);
        }
    }
}

function mostrarPopup(xCas, yCas, texto, tipo) {
    const el = document.createElement('div');
    el.className = 'ct-popup ct-popup-' + tipo;
    el.textContent = texto;
    el.style.left = (xCas * cellW) + 'px';
    el.style.top  = (yCas * cellH - 10) + 'px';
    campo.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

// ============================================================
//  IA DE LA CPU
// ============================================================
function tickCPU(dt) {
    cpuTimer -= dt * 1000;
    if (cpuTimer > 0) return;
    cpuTimer = cpuCooldown;

    // Elegir una carta que pueda pagar
    const mano = mazo.slice(0, 4).map(obtenerCarta).filter(Boolean);
    const disponibles = mano.filter(c => elixirFloat >= c.coste);
    if (disponibles.length === 0) return;

    // Preferir la más cara
    disponibles.sort((a, b) => b.coste - a.coste);
    const carta = disponibles[0];

    // Decidir posición: ¿defender o atacar?
    const misTropas = unidades.filter(u => u.viva && !u.esTorre && u.bando === 'rival');
    const tropasEnemigas = unidades.filter(u => u.viva && !u.esTorre && u.bando === 'tuyo');
    const amenaza = tropasEnemigas.some(u => u.y < FILA_RIO + 2);

    let cx, cy;
    if (amenaza) {
        // Defender cerca del río, sobre las amenazas
        const objetivo = tropasEnemigas.reduce((a, b) => a.y < b.y ? a : b);
        cx = clamp(objetivo.x, 1, COLS);
        cy = FILA_RIO - 1 - Math.random();
    } else {
        // Atacar cerca del río
        cx = [0.5, 1.5, 3.5, 4.5][Math.floor(Math.random()*4)];
        cy = FILA_RIO + 0.5 + Math.random();
    }

    desplegarCarta(carta, 'rival', cx, cy);
    elixirFloat -= carta.coste;
    mazo.push(carta.id);
    // la CPU no respeta la "próxima", rota directo

    // Ajustar intervalo de CPU según el tiempo (más agresiva al final)
    const t = 1 - tiempoRestanteMs / DURACION_MS;
    cpuCooldown = 1800 - t * 900 + rand(-300, 300);
    cpuCooldown = clamp(cpuCooldown, 700, 2200);
}

// ============================================================
//  LOOP
// ============================================================
function loop(now) {
    if (!juegoActivo) return;
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const dt = Math.min((now - ultimoFrameMs) / 1000, 0.1);
    ultimoFrameMs = now;

    // FPS
    fpsContador++;
    fpsTimer += dt * 1000;
    if (fpsTimer >= 500) {
        fpsValor = Math.round(fpsContador / (fpsTimer / 1000));
        fpsContador = 0;
        fpsTimer = 0;
        const el = document.getElementById('ctFps');
        if (el) el.textContent = fpsValor + 'fps';
    }

    // Tiempo
    tiempoRestanteMs -= dt * 1000;
    if (tiempoRestanteMs <= 0) {
        tiempoRestanteMs = 0;
        finDePartidaPorTiempo();
        return;
    }
    const t = document.getElementById('ctTiempo');
    if (t) t.textContent = formatearTiempo(tiempoRestanteMs);

    // Elixir
    if (elixirFloat < ELIXIR_MAX) {
        elixirFloat += (dt * 1000) / ELIXIR_INTERVALO;
        if (elixirFloat > ELIXIR_MAX) elixirFloat = ELIXIR_MAX;
        renderElixir();
    }

    // Tick unidades
    for (const u of unidades) tickUnidad(u, dt);

    // CPU
    tickCPU(dt);

    // Refrescar cartas por si cambió el elixir
    refrescarDisponibilidadCartas();

    // Limpiar muertas
    unidades = unidades.filter(u => u.viva || u.esTorre);

    rafId = requestAnimationFrame(loop);
}

function refrescarDisponibilidadCartas() {
    const cartas = document.querySelectorAll('.ct-carta');
    const mano = mazo.slice(0, 4);
    cartas.forEach((el, i) => {
        const id = mano[i];
        if (!id) return;
        const carta = obtenerCarta(id);
        if (!carta) return;
        const disponible = elixirFloat >= carta.coste;
        el.classList.toggle('disponible', disponible);
        el.classList.toggle('bloqueada', !disponible);
    });
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
let partidaTerminada = false;

function finDePartida(motivo) {
    if (partidaTerminada) return;
    partidaTerminada = true;
    juegoActivo = false;
    if (rafId) cancelAnimationFrame(rafId);

    // Contar torres
    const tusTorres = torres.filter(t => t.bando === 'tuyo' && t.viva).length;
    const susTorres = torres.filter(t => t.bando === 'rival' && t.viva).length;
    const tusTorresCaidas = 3 - tusTorres;
    const susTorresCaidas  = 3 - susTorres;

    // Victoria / derrota
    let gano = false;
    let empate = false;

    if (motivo === 'victoria') gano = true;
    else if (motivo === 'derrota') gano = false;
    else {
        // Por tiempo
        if (susTorresCaidas > tusTorresCaidas) gano = true;
        else if (susTorresCaidas < tusTorresCaidas) gano = false;
        else empate = true;
    }

    // Monedas
    let monedas = 0;
    if (empate) monedas = 2;
    else if (gano) {
        monedas = PREMIO_VICTORIA;
        if (tusTorres === 3) monedas += PREMIO_PERFECTA;
    } else {
        monedas = PREMIO_DERROTA;
    }

    // Cap diario
    aplicarCapDiario(monedas);
}

function aplicarCapDiario(monedasDeseadas) {
    const hoy = diaChileHoy();
    if (estado.diaUltimo !== hoy) {
        estado.diaUltimo = hoy;
        estado.monedasHoy = 0;
    }
    const disponible = Math.max(0, CAP_DIARIO - estado.monedasHoy);
    const monedas = Math.min(monedasDeseadas, disponible);
    estado.monedasHoy += monedas;
    estado.monedasGanadas += monedas;

    // Contar stats
    const tusTorres = torres.filter(t => t.bando === 'tuyo' && t.viva).length;
    const susTorres = torres.filter(t => t.bando === 'rival' && t.viva).length;
    const tusTorresCaidas = 3 - tusTorres;
    const susTorresCaidas  = 3 - susTorres;

    let gano = false;
    let empate = false;
    if (susTorresCaidas > tusTorresCaidas) gano = true;
    else if (susTorresCaidas < tusTorresCaidas) gano = false;
    else empate = true;

    if (gano) {
        estado.victorias++;
        estado.rachaActual++;
        if (estado.rachaActual > estado.mejorRacha) estado.mejorRacha = estado.rachaActual;
    } else if (!empate) {
        estado.derrotas++;
        estado.rachaActual = 0;
    }
    estado.torresDestruidas += susTorresCaidas;

    mostrarFinPartida(gano, empate, monedas, susTorresCaidas, tusTorres);
    otorgarMonedas(monedas);
    guardarEstado();
}

async function otorgarMonedas(cantidad) {
    if (cantidad <= 0) return;
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear('castle', APP_ID, 'Batalla en Clan Torral', cantidad);
    } catch (e) {
        console.warn('[Clan Torral] No se pudo otorgar:', e);
    }
}

function mostrarFinPartida(gano, empate, monedas, torresCaidas, tusTorres) {
    const modal  = document.getElementById('ctMensajeFin');
    const icono  = document.getElementById('ctFinIcono');
    const titulo = document.getElementById('ctFinTitulo');
    const sub    = document.getElementById('ctFinSubtitulo');
    const tiempo = document.getElementById('ctFinTiempo');
    const tusT   = document.getElementById('ctFinTusTorres');
    const rivT   = document.getElementById('ctFinTorresRival');
    const mon    = document.getElementById('ctFinMonedas');

    if (empate) {
        icono.className = 'ct-msg-icono empate';
        icono.innerHTML = '<i data-lucide="equal"></i>';
        titulo.textContent = 'Empate';
        sub.textContent = 'Nadie se llevó la corona.';
    } else if (gano) {
        icono.className = 'ct-msg-icono ganaste';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Victoria!';
        sub.textContent = tusTorres === 3
            ? '¡Arrasaste sin perder ninguna torre!'
            : 'Tu clan se llevó la corona.';
    } else {
        icono.className = 'ct-msg-icono perdiste';
        icono.innerHTML = '<i data-lucide="x"></i>';
        titulo.textContent = 'Derrota';
        sub.textContent = 'El rival fue más rápido.';
    }

    tiempo.textContent = formatearTiempo(DURACION_MS - tiempoRestanteMs);
    tusT.textContent = tusTorres;
    rivT.textContent = torresCaidas;
    mon.textContent = '+' + monedas;

    modal.hidden = false;
    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  BD
// ============================================================
function rutaArchivo() {
    if (!usuarioActual) return null;
    return ARCHIVO_BASE + usuarioActual.codigo + '.json';
}

async function cargarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    try {
        const data = await bd.leerArchivo(ruta);
        if (data && typeof data === 'object') {
            estado = { ...estado, ...data };
            if (estado.diaUltimo !== diaChileHoy()) {
                estado.monedasHoy = 0;
                estado.diaUltimo = diaChileHoy();
            }
        }
    } catch (e) {
        console.warn('[Clan Torral] Error cargando:', e);
    }
}

async function guardarEstado() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return;
    estado.ultimaVez = new Date().toISOString();
    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[Clan Torral] Error guardando:', e);
    }
}

function renderStats() {
    const v = document.getElementById('ctVictorias');
    const d = document.getElementById('ctDerrotas');
    if (v) v.textContent = estado.victorias;
    if (d) d.textContent = estado.derrotas;
}

// ============================================================
//  INICIO DE PARTIDA
// ============================================================
function empezarPartida() {
    // Limpiar
    document.querySelectorAll('.ct-unidad, .ct-torre').forEach(el => el.remove());
    unidades = [];
    torres = [];
    proximoId = 1;
    partidaTerminada = false;
    tiempoRestanteMs = DURACION_MS;
    elixirFloat = 5;
    cartaSeleccionada = null;
    cpuTimer = 1200;
    cpuCooldown = 1500;

    // Reconstruir torres
    crearTorres();
    crearTorres();   // duplicamos para asegurar 3 vs 3

    // Torres "duplicadas" por error, limpiar
    // (por si acaso, filtramos)
    if (torres.length > 6) {
        torres.slice(6).forEach(t => t.el?.remove());
        torres = torres.slice(0, 6);
    }

    barajarMazo();
    renderMazo();
    renderElixir();

    document.getElementById('ctMensajeInicio').hidden = true;
    document.getElementById('ctMensajeFin').hidden = true;

    juegoActivo = true;
    ultimoFrameMs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    const api = API();
    if (!api) { alert('Clan Torral necesita estar dentro de VicWebOs.'); return; }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    const badge = document.getElementById('ctUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    await cargarEstado();
    renderStats();

    construirCampo();
    crearTorres();
    barajarMazo();
    renderMazo();
    renderElixir();

    document.getElementById('ctBtnEmpezar')?.addEventListener('click', empezarPartida);
    document.getElementById('ctBtnReintentar')?.addEventListener('click', empezarPartida);

    if (window.lucide) lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
