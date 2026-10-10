// ============================================================
//  Primero — clon de Uno con modo 1v1 P2P + CPU
//  ------------------------------------------------------------
//  · Usa uno-engine vía esm.sh (import dinámico, sin build)
//  · Host: fuente de verdad, dueño del Game de uno-engine
//  · Guest: solo renderiza snapshots del host
//  · CPU: mismo flujo que host, sin red
//  · Recompensa: +35 (CPU) / +30 (PvP) monedas OS al ganar
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'primero';
const PREFIJO_PEER = 'primero_';
const ENGINE_URL = 'https://esm.sh/uno-engine';

const RECOMPENSA_CPU = 35;
const RECOMPENSA_PVP = 30;

// ============================================================
//  API del shell
// ============================================================
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

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
            '--accent-text-gradient'
        ];
        vars.forEach(v => {
            const val = sp.getPropertyValue(v).trim();
            if (val) document.documentElement.style.setProperty(v, val);
        });
    } catch (e) { /* silencioso */ }
}
window.addEventListener('message', e => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let toastTimer = null;
function toast(texto, tipo = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  UTILS
// ============================================================
const $ = id => document.getElementById(id);

function cambiarPantalla(n) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.toggle('active', s.id === 'screen' + n);
    });
    if (window.lucide) lucide.createIcons();
}

function mostrarJoinStatus(txt, tipo) {
    const el = $('joinStatus');
    el.textContent = txt || '';
    el.className = 'status-msg ' + (tipo || '');
}

// Normalizar valores que devuelve uno-engine
function normValue(v) {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return v;
    return v.toLowerCase();
}
function normColor(c) {
    if (typeof c !== 'string') return c;
    return c.toLowerCase();
}

// Renderiza el contenido de una carta (HTML con iconos Lucide)
function renderCardInner(card) {
    const val = normValue(card.value);
    const color = normColor(card.color);

    if (color === 'wild' || val === 'wild') {
        return `<span class="card-value small">W</span>`;
    }
    if (val === 'wild_draw_four') {
        return `<span class="card-value tiny">+4</span>`;
    }
    if (val === 'draw_two') return `<span class="card-value small">+2</span>`;
    if (val === 'reverse')  return `<i data-lucide="arrow-left-right"></i>`;
    if (val === 'skip')     return `<i data-lucide="ban"></i>`;
    return `<span class="card-value">${val}</span>`;
}

// ¿Es jugable esta carta contra el top + color actual?
function esJugable(card, topCard, currentColor) {
    if (!card || !topCard) return false;
    const c = normColor(card.color);
    const v = normValue(card.value);
    const tv = normValue(topCard.value);
    const cc = normColor(currentColor);

    // Wild siempre jugable (uno-engine valida el resto)
    if (c === 'wild' || v === 'wild' || v === 'wild_draw_four') return true;

    // Coincidir color
    if (c === cc) return true;

    // Coincidir valor (número con número, acción con acción)
    if (typeof v === 'number' && typeof tv === 'number' && v === tv) return true;
    if (typeof v === 'string' && v === tv) return true;

    return false;
}

// Crea el elemento DOM de una carta
function crearCardEl(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    const color = normColor(card.color);
    const val = normValue(card.value);
    const esWild = color === 'wild' || val === 'wild' || val === 'wild_draw_four';
    el.dataset.color = esWild ? 'wild' : color;
    el.innerHTML = renderCardInner(card);

    if (opts.corner) {
        const inner = renderCardInner(card);
        el.innerHTML += `<span class="card-corner tl">${inner}</span>`;
        el.innerHTML += `<span class="card-corner br">${inner}</span>`;
    }
    return el;
}

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let UnoEngine = null;
let usuarioActual = null;

let modo = null;              // 'real' | 'cpu'
let rol = null;               // 'host' | 'guest' | 'cpu'
let game = null;              // instancia uno-engine (solo host/cpu)
let peer = null;
let conn = null;
let roomCode = '';
let rivalName = 'Rival';
let esperandoCPU = false;
let cartaSeleccionada = null;
let matchOver = false;
let ultimoEstadoJSON = '';

// Carga perezosa del motor
async function cargarEngine() {
    if (UnoEngine) return UnoEngine;
    UnoEngine = await import(ENGINE_URL);
    return UnoEngine;
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || null;
    if (!usuarioActual) {
        alert('Primero necesita estar dentro de VicWebOs.');
        return;
    }

    const roomInp = $('roomInput');
    roomInp.value = usuarioActual.codigo || 'primero';

    document.querySelectorAll('.mode-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = btn.dataset.mode;
            if (m === 'real') { modo = 'real'; cambiarPantalla('Join'); }
            else if (m === 'cpu') { modo = 'cpu'; iniciarModoCPU(); }
        });
    });

    $('btnBack').addEventListener('click', () => cambiarPantalla('Lobby'));
    $('btnConnect').addEventListener('click', conectarP2P);
    $('btnExit').addEventListener('click', salirPartida);

    $('deckPile').addEventListener('click', clickDeck);

    document.querySelectorAll('.color-opt').forEach(b => {
        b.addEventListener('click', () => elegirColor(b.dataset.color));
    });

    $('btnSalirMenu').addEventListener('click', () => {
        $('modalFin').hidden = true;
        limpiarTodo();
        cambiarPantalla('Lobby');
    });
    $('btnRevancha').addEventListener('click', () => {
        $('modalFin').hidden = true;
        if (modo === 'cpu') {
            iniciarModoCPU();
        } else if (rol === 'host') {
            game = null;
            matchOver = false;
            iniciarHost();
        } else {
            // Guest: sale al lobby para reconectar
            limpiarTodo();
            cambiarPantalla('Lobby');
        }
    });

    if (window.lucide) lucide.createIcons();
});

// ============================================================
//  MODO CPU
// ============================================================
async function iniciarModoCPU() {
    rol = 'cpu';
    rivalName = 'CPU';
    try { await cargarEngine(); }
    catch (e) {
        toast('No se pudo cargar el motor de cartas', 'error');
        return;
    }
    matchOver = false;
    startGame([usuarioActual.nombre || 'Tú', 'CPU']);
    $('roomBadge').hidden = true;
    cambiarPantalla('Game');
    render();
    if (esTurnoCPU()) programarTurnoCPU();
}

// ============================================================
//  MODO P2P
// ============================================================
async function conectarP2P() {
    roomCode = $('roomInput').value.trim().toUpperCase();
    if (!roomCode) {
        mostrarJoinStatus('Ingresá un código de sala', 'error');
        return;
    }
    const esHost = document.querySelector('input[name="role"]:checked').value === 'host';
    rol = esHost ? 'host' : 'guest';
    mostrarJoinStatus('Conectando…', 'info');
    $('btnConnect').disabled = true;

    const myPeerId = esHost
        ? PREFIJO_PEER + roomCode
        : PREFIJO_PEER + 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    try {
        peer = new Peer(myPeerId, { debug: 0 });
    } catch (e) {
        mostrarJoinStatus('Error al crear Peer: ' + e.message, 'error');
        $('btnConnect').disabled = false;
        return;
    }

    peer.on('open', () => {
        if (esHost) {
            mostrarJoinStatus('Esperando que se conecte tu amigo…', 'info');
            peer.on('connection', onConnEntrante);
        } else {
            conectarAlHost();
        }
    });

    peer.on('error', err => {
        mostrarJoinStatus('Error: ' + (err.message || err.type), 'error');
        $('btnConnect').disabled = false;
        limpiarTodo();
    });
}

function onConnEntrante(c) {
    if (conn) { try { c.close(); } catch (e) {} return; }
    conn = c;

    conn.on('open', () => {
        conn.send({ type: 'hello', nombre: usuarioActual.nombre || 'Rival' });
    });
    conn.on('data', onDataHost);
    conn.on('close', onRivalDesconectado);
    conn.on('error', onRivalDesconectado);
}

function conectarAlHost() {
    const hostId = PREFIJO_PEER + roomCode;
    conn = peer.connect(hostId, { reliable: true });

    conn.on('open', () => {
        conn.send({ type: 'hello', nombre: usuarioActual.nombre || 'Rival' });
        mostrarJoinStatus('¡Conectado!', 'success');
    });
    conn.on('data', onDataGuest);
    conn.on('close', onRivalDesconectado);
    conn.on('error', () => {
        mostrarJoinStatus('No se pudo conectar', 'error');
        $('btnConnect').disabled = false;
        limpiarTodo();
    });
}

// ============================================================
//  MENSAJES — HOST
// ============================================================
async function onDataHost(data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'hello') {
        rivalName = data.nombre || 'Rival';
        try { await cargarEngine(); }
        catch (e) { toast('Error al cargar motor', 'error'); return; }

        matchOver = false;
        startGame([usuarioActual.nombre || 'Host', rivalName]);
        $('roomBadge').hidden = false;
        $('roomBadge').textContent = 'Sala: ' + roomCode;
        cambiarPantalla('Game');
        render();
        enviarEstadoAGuest();
        return;
    }

    if (data.type === 'play') {
        if (matchOver || esMiTurno()) return;
        try {
            const player = game.currentPlayer;
            const card = player.hand[data.cardIndex];
            if (!card) { enviarEstadoAGuest(); return; }
            const ok = player.play(card, data.chosenColor);
            if (!ok) toast('Jugada rechazada', 'error');
        } catch (e) { console.warn('Error play:', e); }
        render();
        enviarEstadoAGuest();
        checkFinLocal();
        return;
    }

    if (data.type === 'draw') {
        if (matchOver || esMiTurno()) return;
        try { game.currentPlayer.draw(); }
        catch (e) { console.warn('Error draw:', e); }
        render();
        enviarEstadoAGuest();
        return;
    }
}

// ============================================================
//  MENSAJES — GUEST
// ============================================================
function onDataGuest(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'state') { renderDesdeSnapshot(data); return; }
    if (data.type === 'error') { toast(data.msg || 'Error', 'error'); return; }
}

// ============================================================
//  ENGINE
// ============================================================
function startGame(names) {
    const { Game } = UnoEngine;
    game = new Game(names);
    if (typeof game.start === 'function') {
        try { game.start(); } catch (e) { /* no-op */ }
    }
}

function esMiTurno() {
    if (!game || rol === 'guest') return false;
    const miNombre = rol === 'cpu' ? (usuarioActual.nombre || 'Tú') : (usuarioActual.nombre || 'Host');
    try { return game.currentPlayer?.name === miNombre; }
    catch (e) { return false; }
}

function esTurnoCPU() {
    if (rol !== 'cpu' || !game) return false;
    try { return game.currentPlayer?.name === 'CPU'; }
    catch (e) { return false; }
}

// ============================================================
//  SNAPSHOT
// ============================================================
function serializarCarta(card) {
    if (!card) return null;
    return { color: normColor(card.color), value: normValue(card.value) };
}

function construirSnapshot() {
    if (!game) return null;
    try {
        const jugadores = game.players || [];
        const hostPlayer = jugadores[0];
        const guestPlayer = jugadores[1];
        const discarded = game.discardedPile || [];
        const topCard = discarded[discarded.length - 1] || null;
        const currentPlayerName = game.currentPlayer?.name;
        const miNombre = usuarioActual.nombre || 'Host';

        return {
            type: 'state',
            myHand: (guestPlayer?.hand || []).map(serializarCarta),
            oppCount: (hostPlayer?.hand || []).length,
            topCard: serializarCarta(topCard),
            currentColor: normColor(game.currentColor),
            currentTurn: currentPlayerName === miNombre ? 'host' : 'guest',
            drawPileCount: (game.drawPile || []).length,
            winner: game.winner
                ? (game.winner.name === miNombre ? 'host' : 'guest')
                : null
        };
    } catch (e) {
        console.warn('Error construyendo snapshot:', e);
        return null;
    }
}

function enviarEstadoAGuest() {
    if (!conn || !conn.open) return;
    const snap = construirSnapshot();
    if (!snap) return;
    try { conn.send(snap); } catch (e) { console.warn(e); }
}

// ============================================================
//  RENDER (host / cpu)
// ============================================================
function render() {
    if (rol === 'guest') return;
    renderLocal();
}

function renderLocal() {
    if (!game) return;
    const discarded = game.discardedPile || [];
    const topCard = discarded[discarded.length - 1];
    const currentColor = normColor(game.currentColor);
    const currentPlayerName = game.currentPlayer?.name;
    const miNombre = rol === 'cpu' ? (usuarioActual.nombre || 'Tú') : (usuarioActual.nombre || 'Host');
    const miTurno = currentPlayerName === miNombre;

    const oppPlayer = (game.players || [])[1];
    const oppCount = (oppPlayer?.hand || []).length;
    $('oppCount').textContent = oppCount;
    $('rivalName').textContent = rol === 'cpu' ? 'CPU' : rivalName;
    $('oppCards').classList.toggle('alert', oppCount === 1);

    const colorEl = $('colorIndicator');
    if (colorEl) {
        if (currentColor && currentColor !== 'wild') {
            colorEl.dataset.color = currentColor;
        } else {
            colorEl.dataset.color = 'wild';
        }
    }

    $('deckCount').textContent = (game.drawPile || []).length;

    const discardEl = $('discardPile');
    discardEl.innerHTML = '';
    if (topCard) {
        discardEl.appendChild(crearCardEl(topCard, { corner: true }));
    }

    // Status
    const statusBar = $('statusBar');
    const statusTxt = $('statusText');
    const statusIcon = $('statusIcon');
    if (miTurno) {
        statusBar.classList.add('mi-turno');
        statusBar.classList.remove('esperando');
        statusTxt.textContent = 'Tu turno';
        if (statusIcon) statusIcon.setAttribute('data-lucide', 'hand-pointer');
    } else {
        statusBar.classList.remove('mi-turno');
        statusBar.classList.add('esperando');
        statusTxt.textContent = rol === 'cpu' ? 'La CPU está jugando…' : 'Esperando al rival…';
        if (statusIcon) statusIcon.setAttribute('data-lucide', 'hourglass');
    }

    // Mi mano
    const myHand = $('myHand');
    myHand.innerHTML = '';
    const myCards = (game.players?.[0]?.hand) || [];

    if (myCards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hand-empty';
        empty.textContent = 'Sin cartas';
        myHand.appendChild(empty);
    } else {
        myCards.forEach((card, idx) => {
            const el = crearCardEl(card);
            const jugable = miTurno && !matchOver && esJugable(card, topCard, currentColor);
            el.classList.add(jugable ? 'jugable' : 'no-jugable');
            el.addEventListener('click', () => clickCarta(idx, jugable));
            myHand.appendChild(el);
        });
    }

    $('deckPile').disabled = !miTurno || matchOver;

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  RENDER (guest, desde snapshot)
// ============================================================
function renderDesdeSnapshot(snap) {
    const json = JSON.stringify(snap);
    if (json === ultimoEstadoJSON) return;
    ultimoEstadoJSON = json;

    $('rivalName').textContent = 'Rival (Host)';
    $('oppCount').textContent = snap.oppCount;
    $('oppCards').classList.toggle('alert', snap.oppCount === 1);

    const colorEl = $('colorIndicator');
    if (colorEl) {
        colorEl.dataset.color = snap.currentColor === 'wild' ? 'wild' : snap.currentColor;
    }

    $('deckCount').textContent = snap.drawPileCount;

    const discardEl = $('discardPile');
    discardEl.innerHTML = '';
    if (snap.topCard) {
        discardEl.appendChild(crearCardEl(snap.topCard, { corner: true }));
    }

    const esMiTurno = snap.currentTurn === 'guest';
    const statusBar = $('statusBar');
    const statusTxt = $('statusText');
    const statusIcon = $('statusIcon');
    if (esMiTurno && !snap.winner) {
        statusBar.classList.add('mi-turno');
        statusBar.classList.remove('esperando');
        statusTxt.textContent = 'Tu turno';
        if (statusIcon) statusIcon.setAttribute('data-lucide', 'hand-pointer');
    } else if (!snap.winner) {
        statusBar.classList.remove('mi-turno');
        statusBar.classList.add('esperando');
        statusTxt.textContent = 'Esperando al host…';
        if (statusIcon) statusIcon.setAttribute('data-lucide', 'hourglass');
    }

    const myHand = $('myHand');
    myHand.innerHTML = '';
    if ((snap.myHand || []).length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hand-empty';
        empty.textContent = 'Sin cartas';
        myHand.appendChild(empty);
    } else {
        (snap.myHand || []).forEach((card, idx) => {
            const el = crearCardEl(card);
            const jugable = esMiTurno && !snap.winner && esJugable(card, snap.topCard, snap.currentColor);
            el.classList.add(jugable ? 'jugable' : 'no-jugable');
            el.addEventListener('click', () => clickCartaGuest(idx, jugable));
            myHand.appendChild(el);
        });
    }

    $('deckPile').disabled = !esMiTurno || !!snap.winner;

    if (snap.winner) mostrarFin(snap.winner === 'guest');

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  INTERACCIÓN
// ============================================================
function clickCarta(idx, jugable) {
    if (!jugable || matchOver) return;
    const card = game.players[0].hand[idx];
    if (!card) return;
    const color = normColor(card.color);
    const val = normValue(card.value);
    const esWild = color === 'wild' || val === 'wild' || val === 'wild_draw_four';

    if (esWild) {
        cartaSeleccionada = idx;
        $('modalColor').hidden = false;
        if (window.lucide) lucide.createIcons();
        return;
    }
    jugarLocal(idx, null);
}

function clickCartaGuest(idx, jugable) {
    if (!jugable || matchOver) return;
    if (!conn || !conn.open) return;
    const snap = JSON.parse(ultimoEstadoJSON || '{}');
    const card = (snap.myHand || [])[idx];
    if (!card) return;
    const esWild = card.color === 'wild' || card.value === 'wild' || card.value === 'wild_draw_four';

    if (esWild) {
        cartaSeleccionada = idx;
        $('modalColor').hidden = false;
        if (window.lucide) lucide.createIcons();
        return;
    }
    conn.send({ type: 'play', cardIndex: idx });
}

function elegirColor(color) {
    const idx = cartaSeleccionada;
    cartaSeleccionada = null;
    $('modalColor').hidden = true;

    if (idx === null || idx === undefined) return;

    if (rol === 'guest') {
        if (!conn || !conn.open) return;
        conn.send({ type: 'play', cardIndex: idx, chosenColor: color });
        return;
    }
    jugarLocal(idx, color);
}

function jugarLocal(idx, chosenColor) {
    if (!game) return;
    try {
        const player = game.currentPlayer;
        const card = player.hand[idx];
        if (!card) return;
        const ok = player.play(card, chosenColor);
        if (!ok) {
            toast('Jugada no válida', 'error');
            return;
        }
    } catch (e) {
        console.warn('Error jugando carta:', e);
        toast('Error al jugar carta', 'error');
        return;
    }
    render();
    if (rol === 'host') enviarEstadoAGuest();
    checkFinLocal();
    if (rol === 'cpu' && !matchOver) programarTurnoCPU();
}

function clickDeck() {
    if (matchOver) return;
    if (rol === 'guest') {
        if (!conn || !conn.open) return;
        const snap = JSON.parse(ultimoEstadoJSON || '{}');
        if (snap.currentTurn !== 'guest') return;
        conn.send({ type: 'draw' });
        return;
    }
    if (!esMiTurno()) return;
    try { game.currentPlayer.draw(); }
    catch (e) { console.warn(e); }
    render();
    if (rol === 'host') enviarEstadoAGuest();
    if (rol === 'cpu' && !matchOver) programarTurnoCPU();
}

// ============================================================
//  CPU
// ============================================================
function programarTurnoCPU() {
    if (esperandoCPU) return;
    esperandoCPU = true;
    setTimeout(() => {
        esperandoCPU = false;
        if (rol !== 'cpu' || matchOver || !game) return;
        if (!esTurnoCPU()) return;
        jugarTurnoCPU();
    }, 900);
}

function jugarTurnoCPU() {
    if (!game || matchOver) return;
    const player = game.currentPlayer;
    const hand = player.hand || [];
    const discarded = game.discardedPile || [];
    const topCard = discarded[discarded.length - 1];
    const currentColor = normColor(game.currentColor);

    let elegida = null;
    let wildEncontrada = null;

    for (const c of hand) {
        const cc = normColor(c.color);
        const cv = normValue(c.value);
        const esWild = cc === 'wild' || cv === 'wild' || cv === 'wild_draw_four';
        if (esWild) { wildEncontrada = c; continue; }
        if (esJugable(c, topCard, currentColor)) {
            elegida = c;
            if (typeof cv === 'string') break; // Prefiere acciones
        }
    }

    if (elegida) {
        try { player.play(elegida); } catch (e) { console.warn(e); }
    } else if (wildEncontrada) {
        const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
        hand.forEach(c => {
            const cc = normColor(c.color);
            if (counts[cc] !== undefined) counts[cc]++;
        });
        const colorElegido = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
        try { player.play(wildEncontrada, colorElegido); } catch (e) { console.warn(e); }
    } else {
        try { player.draw(); } catch (e) { console.warn(e); }
    }
    render();
    checkFinLocal();
    if (rol === 'cpu' && !matchOver && esTurnoCPU()) programarTurnoCPU();
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function checkFinLocal() {
    if (!game || !game.winner) return;
    const miNombre = rol === 'cpu' ? (usuarioActual.nombre || 'Tú') : (usuarioActual.nombre || 'Host');
    const gane = game.winner.name === miNombre;
    if (rol === 'host') enviarEstadoAGuest();
    mostrarFin(gane);
}

async function mostrarFin(gane) {
    if (matchOver && !$('modalFin').hidden) return;
    matchOver = true;

    const icon = $('endIcon');
    const title = $('endTitle');
    const sub = $('endSubtitle');

    if (gane) {
        icon.classList.remove('perdiste');
        icon.innerHTML = '<i data-lucide="trophy"></i>';
        title.textContent = '¡Ganaste!';
        sub.textContent = 'Vaciaste tu mano primero.';
        otorgarMonedas();
    } else {
        icon.classList.add('perdiste');
        icon.innerHTML = '<i data-lucide="x"></i>';
        title.textContent = 'Perdiste';
        sub.textContent = 'El rival se quedó sin cartas antes.';
    }

    $('modalFin').hidden = false;
    if (window.lucide) lucide.createIcons();
}

async function otorgarMonedas() {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const cantidad = modo === 'cpu' ? RECOMPENSA_CPU : RECOMPENSA_PVP;
    try {
        await api.canjear('layers', APP_ID, 'Victoria en Primero', cantidad);
        toast(`+${cantidad} monedas OS`, 'success');
    } catch (e) {
        console.warn('[Primero] No se pudo otorgar:', e);
    }
}

// ============================================================
//  LIMPIEZA
// ============================================================
function onRivalDesconectado() {
    if (matchOver) return;
    matchOver = true;
    toast('El rival se desconectó', 'error');
    const statusTxt = $('statusText');
    if (statusTxt) statusTxt.textContent = 'Rival desconectado';
    const statusBar = $('statusBar');
    if (statusBar) { statusBar.classList.remove('mi-turno'); statusBar.classList.add('esperando'); }
}

function salirPartida() {
    if (!matchOver && game && !game.winner) {
        if (!confirm('¿Salir de la partida?')) return;
    }
    limpiarTodo();
    cambiarPantalla('Lobby');
}

function limpiarTodo() {
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null;
    peer = null;
    game = null;
    matchOver = false;
    cartaSeleccionada = null;
    ultimoEstadoJSON = '';
    esperandoCPU = false;
    $('btnConnect').disabled = false;
    mostrarJoinStatus('', '');
    $('myHand').innerHTML = '';
    $('discardPile').innerHTML = '';
    $('roomBadge').hidden = true;
    $('modalFin').hidden = true;
    $('modalColor').hidden = true;
}

window.addEventListener('beforeunload', () => {
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
});
