// ============================================================
//  Piedra, Papel o Tijera — 1v1 P2P + CPU
//  ------------------------------------------------------------
//  · Modo REAL: mejor de 3 (primero en llegar a 2 victorias).
//    Recompensa: +2 monedas OS si ganás.
//  · Modo CPU: 6 rondas fijas, gratis. Gana quien tenga más
//    victorias. Recompensa: +4 monedas OS si ganás.
//  · Sin persistencia, sin historial, sin chat.
//  · Desconexión del rival: nadie gana.
//  · Revancha rápida por mutuo acuerdo (solo modo real).
//  · Iconos Lucide (gem / file-text / scissors), sin emojis.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'rps';
const PREFIJO_PEER = 'rps_';

// --- Reglas ---
const MODOS = {
    real: {
        rondas: 3,
        paraGanar: 2,
        recompensa: 2,
        label: 'Ronda {n} de 3'
    },
    cpu: {
        rondas: 6,
        paraGanar: null,
        recompensa: 4,
        label: 'Ronda {n} de 6'
    }
};

const CHOICES = ['rock', 'paper', 'scissors'];

// Iconos Lucide por elección (sin emojis)
const CHOICE_ICON = {
    rock:     'gem',         // 🪨 → gema (piedra preciosa)
    paper:    'file-text',   // 📄 → página
    scissors: 'scissors'     // ✂️ → tijeras
};

const CHOICE_LABEL = { rock: 'Piedra', paper: 'Papel', scissors: 'Tijera' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

// --- API ---
const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};

// --- Estado ---
let modo = null;
let usuarioActual = null;

let myScore = 0;
let rivalScore = 0;
let currentRound = 1;
let myChoice = null;
let rivalChoice = null;
let matchOver = false;
let revealRunning = false;

let peer = null;
let conn = null;
let isHost = false;
let myPeerId = '';
let roomCode = '';
let rivalName = 'Rival';
let iWantRematch = false;
let rivalWantsRematch = false;
let matchActive = false;

let myPicksHistory = [];

// --- DOM ---
const $ = (id) => document.getElementById(id);
const screenLobby = $('screenLobby');
const screenJoin  = $('screenJoin');
const screenGame  = $('screenGame');
const roomInput   = $('roomInput');
const btnConnect  = $('btnConnect');
const joinStatus  = $('joinStatus');
const roundLabel  = $('roundLabel');
const roomBadge   = $('roomBadge');
const myScoreEl   = $('myScore');
const rivalScoreEl= $('rivalScore');
const rivalNameEl = $('rivalName');
const cardYou     = $('cardYou');
const cardRival   = $('cardRival');
const youFront    = $('youFront');
const rivalFront  = $('rivalFront');
const arenaCenter = $('arenaCenter');
const statusText  = $('statusText');
const choicesEl   = $('choices');
const actionsEl   = $('actions');
const btnRematch  = $('btnRematch');
const btnRematchText = $('btnRematchText');
const toastEl     = $('toast');

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
    } catch (e) { /* silencioso */ }
}

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let toastTimeout = null;
function toast(texto, tipo = 'info') {
    if (!toastEl) return;
    toastEl.textContent = texto;
    toastEl.className = 'toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ============================================================
//  UTILIDADES
// ============================================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function cambiarPantalla(nombre) {
    screenLobby.classList.toggle('active', nombre === 'lobby');
    screenJoin.classList.toggle('active',  nombre === 'join');
    screenGame.classList.toggle('active',  nombre === 'game');
    if (window.lucide) window.lucide.createIcons();
}

function mostrarJoinStatus(texto, tipo) {
    joinStatus.textContent = texto;
    joinStatus.className = 'status-msg ' + (tipo || '');
    joinStatus.style.display = texto ? 'block' : 'none';
}

// Convierte el contenido de una cara de carta a un icono Lucide
function pintarIconoCard(el, choiceKey) {
    if (!el) return;
    const iconName = CHOICE_ICON[choiceKey];
    if (!iconName) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `<i data-lucide="${iconName}"></i>`;
    if (window.lucide) window.lucide.createIcons();
}

// Pinta el status con un icono Lucide + texto
function pintarStatus(iconName, texto, pulsing = false) {
    if (!statusText) return;
    statusText.innerHTML = `<i data-lucide="${iconName}"></i><span>${texto}</span>`;
    statusText.classList.toggle('pulse', pulsing);
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    aplicarTemaDelPadre();

    const api = API();
    usuarioActual = api?.obtenerCuenta?.() || null;
    if (!usuarioActual) {
        alert('Piedra Papel Tijera necesita estar dentro de VicWebOs.');
        return;
    }

    roomInput.value = usuarioActual.codigo || 'rpsroom';

    document.querySelectorAll('.mode-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = btn.dataset.mode;
            if (m === 'real') { modo = 'real'; cambiarPantalla('join'); }
            else if (m === 'cpu') { iniciarModoCPU(); }
        });
    });

    $('btnBack').addEventListener('click', () => cambiarPantalla('lobby'));
    btnConnect.addEventListener('click', conectarConAmigo);

    $('btnExit').addEventListener('click', salirDePartida);
    document.querySelectorAll('.choice-btn').forEach(btn => {
        btn.addEventListener('click', () => elegirJugada(btn.dataset.choice));
    });
    btnRematch.addEventListener('click', pedirRevancha);
    $('btnBackMenu').addEventListener('click', () => {
        limpiarConexion();
        matchActive = false;
        cambiarPantalla('lobby');
    });

    if (window.lucide) window.lucide.createIcons();
});

// ============================================================
//  MODO CPU
// ============================================================
function iniciarModoCPU() {
    modo = 'cpu';
    rivalName = 'CPU';
    roomBadge.hidden = true;
    roomCode = '';
    iniciarPartida();
}

// ============================================================
//  MODO REAL — PeerJS
// ============================================================
async function conectarConAmigo() {
    roomCode = roomInput.value.trim().toUpperCase();
    if (!roomCode) {
        mostrarJoinStatus('Ingresá un código de sala', 'error');
        return;
    }

    isHost = document.querySelector('input[name="role"]:checked').value === 'host';
    mostrarJoinStatus('Conectando…', 'info');
    btnConnect.disabled = true;

    myPeerId = isHost
        ? PREFIJO_PEER + roomCode
        : PREFIJO_PEER + 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

    try {
        peer = new Peer(myPeerId, { debug: 0 });
    } catch (e) {
        mostrarJoinStatus('Error al crear Peer: ' + e.message, 'error');
        btnConnect.disabled = false;
        return;
    }

    peer.on('open', () => {
        if (isHost) {
            mostrarJoinStatus('Esperando que se conecte tu amigo…', 'info');
            peer.on('connection', manejarConexionEntrante);
        } else {
            conectarAlHost();
        }
    });

    peer.on('error', (err) => {
        let msg = 'Error: ' + (err.message || err.type);
        if (err.type === 'unavailable-id') {
            msg = 'Ese código ya está en uso. Probá otro o unite como invitado.';
        }
        mostrarJoinStatus(msg, 'error');
        btnConnect.disabled = false;
        limpiarConexion();
    });
}

function manejarConexionEntrante(c) {
    if (conn) { try { c.close(); } catch (e) {} return; }
    conn = c;

    conn.on('open', () => {
        conn.send({
            type: 'hello',
            nombre: usuarioActual.nombre || 'Rival',
            codigo: usuarioActual.codigo
        });
    });

    conn.on('data', manejarData);
    conn.on('close', manejarDesconexionRival);
    conn.on('error', manejarDesconexionRival);

    roomBadge.hidden = false;
    roomBadge.textContent = 'Sala: ' + roomCode;

    mostrarJoinStatus('¡Conectado! Empezando…', 'success');
    setTimeout(() => iniciarPartida(), 400);
}

function conectarAlHost() {
    const hostId = PREFIJO_PEER + roomCode;
    conn = peer.connect(hostId, { reliable: true });

    conn.on('open', () => {
        conn.send({
            type: 'hello',
            nombre: usuarioActual.nombre || 'Rival',
            codigo: usuarioActual.codigo
        });
        roomBadge.hidden = false;
        roomBadge.textContent = 'Sala: ' + roomCode;
        mostrarJoinStatus('¡Conectado! Empezando…', 'success');
        setTimeout(() => iniciarPartida(), 400);
    });

    conn.on('data', manejarData);
    conn.on('close', manejarDesconexionRival);
    conn.on('error', () => {
        mostrarJoinStatus('No se pudo conectar. Verificá el código y que el host esté esperando.', 'error');
        btnConnect.disabled = false;
        limpiarConexion();
    });
}

function manejarData(data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'hello') {
        rivalName = data.nombre || 'Rival';
        rivalNameEl.textContent = rivalName;
        return;
    }

    if (data.type === 'move' && matchActive) {
        rivalChoice = data.choice;
        actualizarIndicadorRival();
        intentarRevelar();
        return;
    }

    if (data.type === 'rematch_want') {
        rivalWantsRematch = true;
        actualizarEstadoRematch();
        return;
    }

    if (data.type === 'bye') {
        manejarDesconexionRival();
        return;
    }
}

function manejarDesconexionRival() {
    if (!matchActive) return;
    matchActive = false;
    matchOver = true;

    rivalChoice = null;
    myChoice = null;

    choicesEl.classList.add('disabled');
    pintarStatus('user-x', 'El rival se desconectó. Nadie gana.', false);

    actionsEl.hidden = false;
    btnRematch.hidden = true;

    toast('Rival desconectado', 'error');
}

// ============================================================
//  PARTIDA
// ============================================================
function iniciarPartida() {
    myScore = 0;
    rivalScore = 0;
    currentRound = 1;
    matchOver = false;
    matchActive = true;
    iWantRematch = false;
    rivalWantsRematch = false;
    revealRunning = false;
    myPicksHistory = [];

    myScoreEl.textContent = '0';
    rivalScoreEl.textContent = '0';
    rivalNameEl.textContent = rivalName;
    rivalNameEl.title = rivalName;
    btnRematchText.textContent = 'Revancha';
    btnRematch.disabled = false;
    actionsEl.hidden = true;
    btnRematch.hidden = false;

    cardYou.classList.remove('flip', 'winner', 'loser', 'tie', 'chosen');
    cardRival.classList.remove('flip', 'winner', 'loser', 'tie', 'chosen');
    youFront.innerHTML = '';
    rivalFront.innerHTML = '';

    actualizarLabelRonda();
    empezarRonda();

    cambiarPantalla('game');
}

function actualizarLabelRonda() {
    if (!modo) return;
    const cfg = MODOS[modo];
    roundLabel.textContent = cfg.label.replace('{n}', currentRound);
}

function empezarRonda() {
    myChoice = null;
    rivalChoice = null;
    revealRunning = false;

    cardYou.classList.remove('flip', 'winner', 'loser', 'tie', 'chosen');
    cardRival.classList.remove('flip', 'winner', 'loser', 'tie', 'chosen');
    youFront.innerHTML = '';
    rivalFront.innerHTML = '';

    choicesEl.classList.remove('disabled', 'hidden');
    document.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));

    pintarStatus('hand-pointer', 'Elegí tu jugada', false);

    actualizarLabelRonda();
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  ELECCIÓN
// ============================================================
function elegirJugada(choice) {
    if (!matchActive || matchOver) return;
    if (myChoice) return;
    if (revealRunning) return;
    if (!CHOICES.includes(choice)) return;

    myChoice = choice;
    myPicksHistory.push(choice);

    document.querySelectorAll('.choice-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.choice === choice);
    });

    choicesEl.classList.add('disabled');
    cardYou.classList.add('chosen');

    if (modo === 'real' && conn && conn.open) {
        try { conn.send({ type: 'move', choice }); } catch (e) {}
    }

    if (modo === 'cpu') {
        pintarStatus('cpu', 'La CPU está pensando…', true);
        setTimeout(() => {
            rivalChoice = cpuElegir();
            actualizarIndicadorRival();
            intentarRevelar();
        }, 400 + Math.random() * 600);
        return;
    }

    actualizarIndicadorRival();
    intentarRevelar();
}

function actualizarIndicadorRival() {
    if (!matchActive) return;
    if (myChoice && !rivalChoice) {
        pintarStatus('hourglass', 'Esperando al rival…', true);
    } else if (myChoice && rivalChoice && !revealRunning) {
        pintarStatus('sparkles', '¡Revelando!', false);
    }
}

function cpuElegir() {
    if (Math.random() < 0.25 && myPicksHistory.length >= 2) {
        const counts = { rock: 0, paper: 0, scissors: 0 };
        myPicksHistory.forEach(c => counts[c]++);
        let most = 'rock', max = -1;
        for (const k in counts) if (counts[k] > max) { max = counts[k]; most = k; }
        const counter = Object.keys(BEATS).find(k => BEATS[k] === most);
        if (counter) return counter;
    }
    return CHOICES[Math.floor(Math.random() * 3)];
}

// ============================================================
//  REVELADO ÉPICO
// ============================================================
async function intentarRevelar() {
    if (!matchActive || matchOver) return;
    if (!myChoice || !rivalChoice) return;
    if (revealRunning) return;

    revealRunning = true;

    // Pintamos los iconos Lucide en las caras frontales
    pintarIconoCard(youFront, myChoice);
    pintarIconoCard(rivalFront, rivalChoice);

    // Countdown
    arenaCenter.classList.add('active');
    const numeros = ['3', '2', '1'];
    for (const n of numeros) {
        arenaCenter.innerHTML = `<div class="countdown-num">${n}</div>`;
        await sleep(620);
    }

    arenaCenter.innerHTML = `<div class="countdown-num go">¡YA!</div>`;
    flashBlanco();
    await sleep(340);

    // Flip
    cardYou.classList.add('flip');
    cardRival.classList.add('flip');
    arenaCenter.classList.remove('active');
    await sleep(700);

    // Resultado
    const resultado = evaluar(myChoice, rivalChoice);
    aplicarResultadoUI(resultado);

    await sleep(1800);

    if (!matchActive || matchOver) return;

    aplicarPuntaje(resultado);
    if (chequearFinDePartida()) return;

    currentRound++;
    empezarRonda();
}

function flashBlanco() {
    const f = document.createElement('div');
    f.className = 'flash-white go';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 600);
}

function evaluar(a, b) {
    if (a === b) return 'tie';
    return BEATS[a] === b ? 'win' : 'lose';
}

function aplicarResultadoUI(resultado) {
    cardYou.classList.remove('winner', 'loser', 'tie');
    cardRival.classList.remove('winner', 'loser', 'tie');

    if (resultado === 'tie') {
        cardYou.classList.add('tie');
        cardRival.classList.add('tie');
        pintarStatus('equal', 'Empate', false);
        return;
    }

    if (resultado === 'win') {
        cardYou.classList.add('winner');
        cardRival.classList.add('loser');
        pintarStatus('trophy', '¡Ganaste la ronda!', false);
    } else {
        cardYou.classList.add('loser');
        cardRival.classList.add('winner');
        pintarStatus('x', 'Perdiste la ronda', false);
    }
}

function aplicarPuntaje(resultado) {
    if (resultado === 'win')  myScore++;
    if (resultado === 'lose') rivalScore++;
    myScoreEl.textContent = myScore;
    rivalScoreEl.textContent = rivalScore;
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function chequearFinDePartida() {
    if (!modo) return false;
    const cfg = MODOS[modo];

    let fin = false;
    if (cfg.paraGanar !== null) {
        fin = myScore >= cfg.paraGanar || rivalScore >= cfg.paraGanar;
    } else {
        fin = currentRound >= cfg.rondas;
    }

    if (!fin) return false;

    matchOver = true;
    matchActive = false;
    choicesEl.classList.add('disabled');
    mostrarFinDePartida();
    return true;
}

async function mostrarFinDePartida() {
    let gane = false;
    let empate = false;

    if (modo === 'real') {
        gane = myScore >= MODOS.real.paraGanar;
    } else {
        if (myScore > rivalScore) gane = true;
        else if (myScore === rivalScore) empate = true;
    }

    if (empate) {
        pintarStatus('equal', 'Empate general. Nadie gana monedas.', false);
    } else if (gane) {
        pintarStatus('trophy', modo === 'cpu' ? '¡Le ganaste a la CPU!' : '¡Ganaste la partida!', false);
    } else {
        pintarStatus('x', modo === 'cpu' ? 'La CPU ganó esta vez' : 'El rival ganó la partida', false);
    }

    if (gane) otorgarRecompensa();

    actionsEl.hidden = false;
    btnRematch.hidden = false;
    actualizarEstadoRematch();

    if (window.lucide) window.lucide.createIcons();
}

async function otorgarRecompensa() {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    const cantidad = MODOS[modo].recompensa;
    try {
        await api.canjear('scissors', APP_ID, 'Victoria en Piedra Papel Tijera', cantidad);
        toast(`+${cantidad} monedas OS`, 'success');
    } catch (e) {
        console.warn('[RPS] No se pudo otorgar la recompensa:', e);
    }
}

// ============================================================
//  REVANCHA
// ============================================================
function pedirRevancha() {
    if (modo === 'cpu') {
        iniciarPartida();
        return;
    }

    iWantRematch = true;
    actualizarEstadoRematch();
    if (conn && conn.open) {
        try { conn.send({ type: 'rematch_want' }); } catch (e) {}
    }
}

function actualizarEstadoRematch() {
    if (iWantRematch && rivalWantsRematch) {
        toast('¡Revancha!', 'success');
        setTimeout(() => iniciarPartida(), 200);
        return;
    }
    if (iWantRematch && !rivalWantsRematch) {
        btnRematchText.textContent = 'Esperando…';
        btnRematch.disabled = true;
    } else if (!iWantRematch && rivalWantsRematch) {
        btnRematchText.textContent = '¡Aceptar revancha!';
        btnRematch.disabled = false;
    } else {
        btnRematchText.textContent = 'Revancha';
        btnRematch.disabled = false;
    }
}

// ============================================================
//  SALIR / LIMPIEZA
// ============================================================
function salirDePartida() {
    if (matchActive && !matchOver) {
        const ok = confirm('¿Salir de la partida?');
        if (!ok) return;
        if (modo === 'real' && conn && conn.open) {
            try { conn.send({ type: 'bye' }); } catch (e) {}
        }
    }
    limpiarConexion();
    matchActive = false;
    matchOver = false;
    cambiarPantalla('lobby');
}

function limpiarConexion() {
    try { if (conn) conn.close(); } catch (e) {}
    try { if (peer) peer.destroy(); } catch (e) {}
    conn = null;
    peer = null;
    isHost = false;
    myPeerId = '';
    rivalName = 'Rival';
    iWantRematch = false;
    rivalWantsRematch = false;
    btnConnect.disabled = false;
    mostrarJoinStatus('', '');
    myPicksHistory = [];
}

window.addEventListener('beforeunload', () => {
    if (modo === 'real' && conn && conn.open) {
        try { conn.send({ type: 'bye' }); } catch (e) {}
    }
    limpiarConexion();
});
