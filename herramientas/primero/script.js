// ============================================================
//  Primero — clon de Uno con lógica propia
//  ------------------------------------------------------------
//  · Sin dependencias externas (excepto PeerJS para PvP)
//  · Motor de cartas casero, simple y auditable
//  · Host: fuente de verdad · Guest: solo renderiza snapshots
//  · CPU: mismo motor, sin red
//  · Recompensa: +35 (CPU) / +30 (PvP) monedas OS al ganar
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'primero';
const PREFIJO_PEER = 'primero_';

const RECOMPENSA_CPU = 35;
const RECOMPENSA_PVP = 30;

// ============================================================
//  MOTOR DE CARTAS
//  ------------------------------------------------------------
//  Carta: { color: 'red'|'blue'|'green'|'yellow'|'wild', value: string }
//  value: '0'..'9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
// ============================================================
const COLORES = ['red', 'blue', 'green', 'yellow'];

function crearMazo() {
    const mazo = [];
    for (const color of COLORES) {
        // Un 0 por color
        mazo.push({ color, value: '0' });
        // Dos de cada 1-9
        for (let n = 1; n <= 9; n++) {
            mazo.push({ color, value: String(n) });
            mazo.push({ color, value: String(n) });
        }
        // Dos de cada acción por color
        for (const acc of ['skip', 'reverse', 'draw2']) {
            mazo.push({ color, value: acc });
            mazo.push({ color, value: acc });
        }
    }
    // 4 wild + 4 wild4
    for (let i = 0; i < 4; i++) {
        mazo.push({ color: 'wild', value: 'wild' });
        mazo.push({ color: 'wild', value: 'wild4' });
    }
    return mazo;
}

function barajar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function esWild(card) {
    return card.color === 'wild' || card.value === 'wild' || card.value === 'wild4';
}

function puedeJugar(card, topCard, colorActual) {
    if (!card || !topCard) return false;
    if (esWild(card)) return true;
    if (card.color === colorActual) return true;
    if (card.value === topCard.value) return true;
    return false;
}

class Partida {
    constructor(nombres) {
        // nombres: [nombre1, nombre2]
        this.jugadores = nombres.map((n, i) => ({
            id: i, nombre: n, mano: []
        }));
        this.turno = 0;               // índice del jugador actual
        this.direccion = 1;           // 1 = normal, -1 = invertida
        this.colorActual = null;      // color vigente
        this.ganador = null;
        this.descarte = [];
        this.mazo = [];
        this.empezar();
    }

    empezar() {
        this.mazo = barajar(crearMazo());
        // Repartir 7 a cada uno
        for (let i = 0; i < 7; i++) {
            for (const j of this.jugadores) j.mano.push(this.mazo.pop());
        }
        // Primera carta (no wild4)
        let primera = this.mazo.pop();
        while (primera.value === 'wild4') {
            this.mazo.unshift(primera);
            primera = this.mazo.pop();
        }
        this.descarte.push(primera);
        this.colorActual = primera.color === 'wild' ? this.elegirColorAleatorio() : primera.color;

        // Aplicar efecto de la primera carta
        if (primera.value === 'skip') this.turno = (this.turno + 1) % 2;
        if (primera.value === 'reverse') this.direccion *= -1;
        if (primera.value === 'draw2') {
            const victima = (this.turno + 1) % 2;
            this.robar(this.jugadores[victima], 2);
            this.turno = (this.turno + 1) % 2;
        }
        // Wild wild4 al inicio: turno normal (sin ataque)
    }

    elegirColorAleatorio() {
        return COLORES[Math.floor(Math.random() * 4)];
    }

    get jugadorActual() { return this.jugadores[this.turno]; }
    get topCard() { return this.descarte[this.descarte.length - 1]; }

    robar(jugador, cantidad = 1) {
        for (let i = 0; i < cantidad; i++) {
            if (this.mazo.length === 0) {
                // Reciclar descarte (excepto la última carta)
                const ultima = this.descarte.pop();
                this.mazo = barajar(this.descarte.map(c => ({ ...c })));
                this.descarte = [ultima];
            }
            const c = this.mazo.pop();
            if (c) jugador.mano.push(c);
        }
    }

    // Devuelve { ok, motivo? }
    jugar(jugador, cardIndex, colorElegido = null) {
        if (this.ganador) return { ok: false, motivo: 'Partida terminada' };
        if (jugador !== this.jugadorActual) return { ok: false, motivo: 'No es tu turno' };
        const card = jugador.mano[cardIndex];
        if (!card) return { ok: false, motivo: 'Carta inválida' };
        if (!puedeJugar(card, this.topCard, this.colorActual)) {
            return { ok: false, motivo: 'No es jugable' };
        }

        // Quitar de la mano y poner en descarte
        jugador.mano.splice(cardIndex, 1);
        this.descarte.push(card);

        // Aplicar color actual
        if (esWild(card)) {
            this.colorActual = colorElegido || this.elegirColorAleatorio();
        } else {
            this.colorActual = card.color;
        }

        // ¿Ganó?
        if (jugador.mano.length === 0) {
            this.ganador = jugador;
            return { ok: true, ganador: jugador };
        }

        // Aplicar efecto
        const otro = (this.turno + 1) % 2;
        switch (card.value) {
            case 'skip':
                // El siguiente pierde el turno (queda el mismo)
                break;
            case 'reverse':
                // 1v1: reverse = mismo efecto que skip (el mismo jugador sigue)
                break;
            case 'draw2': {
                this.robar(this.jugadores[otro], 2);
                this.turno = otro;
                // Saltar al siguiente (que es el jugador original)
                this.turno = (this.turno + 1) % 2;
                return { ok: true };
            }
            case 'wild4': {
                this.robar(this.jugadores[otro], 4);
                this.turno = otro;
                this.turno = (this.turno + 1) % 2;
                return { ok: true };
            }
        }

        // Turno normal
        this.turno = otro;
        return { ok: true };
    }

    robarTurno(jugador) {
        if (this.ganador) return;
        if (jugador !== this.jugadorActual) return;
        this.robar(jugador, 1);
        this.turno = (this.turno + 1) % 2;
    }
}

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
    } catch (e) {}
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

// Renderiza el interior de una carta (número o icono)
function renderCardInner(card) {
    if (!card) return '';
    if (card.value === 'wild' || card.value === 'wild4') {
        // Wild: círculo de 4 colores vía CSS, texto W
        return `<span class="card-value small">${card.value === 'wild4' ? '+4' : 'W'}</span>`;
    }
    if (card.value === 'draw2') return `<span class="card-value small">+2</span>`;
    if (card.value === 'reverse')  return `<i data-lucide="arrow-left-right"></i>`;
    if (card.value === 'skip')     return `<i data-lucide="ban"></i>`;
    return `<span class="card-value">${card.value}</span>`;
}

function crearCardEl(card, opts = {}) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.color = card.color === 'wild' ? 'wild' : card.color;
    el.innerHTML = renderCardInner(card);

    if (opts.corner) {
        const inner = renderCardInner(card);
        el.innerHTML += `<span class="card-corner tl">${inner}</span>`;
        el.innerHTML += `<span class="card-corner br">${inner}</span>`;
    }
    return el;
}

// ============================================================
//  ESTADO
// ============================================================
let usuarioActual = null;
let modo = null;              // 'real' | 'cpu'
let rol = null;               // 'host' | 'guest' | 'cpu'
let partida = null;           // instancia Partida (host/cpu)
let peer = null;
let conn = null;
let roomCode = '';
let rivalName = 'Rival';
let esperandoCPU = false;
let cartaSeleccionada = null;
let matchOver = false;
let ultimoEstadoJSON = '';

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
            partida = null;
            matchOver = false;
            iniciarHost(rivalName);
        } else {
            limpiarTodo();
            cambiarPantalla('Lobby');
        }
    });

    if (window.lucide) lucide.createIcons();
});

// ============================================================
//  MODO CPU
// ============================================================
function iniciarModoCPU() {
    rol = 'cpu';
    rivalName = 'CPU';
    matchOver = false;
    partida = new Partida([usuarioActual.nombre || 'Tú', 'CPU']);
    $('roomBadge').hidden = true;
    cambiarPantalla('Game');
    render();
    if (esTurnoCPU()) programarTurnoCPU();
}

// ============================================================
//  MODO P2P
// ============================================================
function conectarP2P() {
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

    try { peer = new Peer(myPeerId, { debug: 0 }); }
    catch (e) {
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
function onDataHost(data) {
    if (!data || typeof data !== 'object') return;

    if (data.type === 'hello') {
        rivalName = data.nombre || 'Rival';
        iniciarHost(rivalName);
        return;
    }

    if (data.type === 'play') {
        if (matchOver || !partida) return;
        if (partida.jugadorActual !== partida.jugadores[1]) return;
        const res = partida.jugar(partida.jugadores[1], data.cardIndex, data.chosenColor);
        if (!res.ok) toast(res.motivo || 'Jugada inválida', 'error');
        render();
        enviarEstadoAGuest();
        if (partida.ganador) mostrarFin(partida.ganador === partida.jugadores[0]);
        return;
    }

    if (data.type === 'draw') {
        if (matchOver || !partida) return;
        if (partida.jugadorActual !== partida.jugadores[1]) return;
        partida.robarTurno(partida.jugadores[1]);
        render();
        enviarEstadoAGuest();
        return;
    }
}

function iniciarHost(nombreRival) {
    matchOver = false;
    partida = new Partida([usuarioActual.nombre || 'Host', nombreRival || 'Rival']);
    $('roomBadge').hidden = false;
    $('roomBadge').textContent = 'Sala: ' + roomCode;
    cambiarPantalla('Game');
    render();
    enviarEstadoAGuest();
}

// ============================================================
//  MENSAJES — GUEST
// ============================================================
function onDataGuest(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'state') renderDesdeSnapshot(data);
}

// ============================================================
//  HELPERS DE TURNO
// ============================================================
function esMiTurno() {
    if (!partida || rol === 'guest') return false;
    return partida.jugadorActual === partida.jugadores[0];
}
function esTurnoCPU() {
    if (rol !== 'cpu' || !partida) return false;
    return partida.jugadorActual === partida.jugadores[1];
}

// ============================================================
//  SNAPSHOT
// ============================================================
function serializarCarta(c) { return c ? { color: c.color, value: c.value } : null; }

function construirSnapshot() {
    if (!partida) return null;
    const host = partida.jugadores[0];
    const guest = partida.jugadores[1];
    const turno = partida.jugadorActual === host ? 'host' : 'guest';
    return {
        type: 'state',
        myHand: guest.mano.map(serializarCarta),
        oppCount: host.mano.length,
        topCard: serializarCarta(partida.topCard),
        currentColor: partida.colorActual,
        currentTurn: turno,
        drawPileCount: partida.mazo.length,
        winner: partida.ganador
            ? (partida.ganador === host ? 'host' : 'guest')
            : null
    };
}

function enviarEstadoAGuest() {
    if (!conn || !conn.open) return;
    const snap = construirSnapshot();
    if (!snap) return;
    try { conn.send(snap); } catch (e) {}
}

// ============================================================
//  RENDER (host / cpu)
// ============================================================
function render() {
    if (rol === 'guest') return;
    if (!partida) return;

    const topCard = partida.topCard;
    const colorActual = partida.colorActual;
    const miTurno = esMiTurno();
    const oppPlayer = partida.jugadores[1];
    const oppCount = oppPlayer.mano.length;

    $('oppCount').textContent = oppCount;
    $('rivalName').textContent = rol === 'cpu' ? 'CPU' : rivalName;
    $('oppCards').classList.toggle('alert', oppCount === 1);

    const colorEl = $('colorIndicator');
    if (colorEl) colorEl.dataset.color = colorActual || 'wild';

    $('deckCount').textContent = partida.mazo.length;

    const discardEl = $('discardPile');
    discardEl.innerHTML = '';
    if (topCard) discardEl.appendChild(crearCardEl(topCard, { corner: true }));

    const statusBar = $('statusBar');
    const statusTxt = $('statusText');
    const statusIcon = $('statusIcon');
    if (miTurno && !matchOver) {
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

    const myHand = $('myHand');
    myHand.innerHTML = '';
    const myCards = partida.jugadores[0].mano;
    if (myCards.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hand-empty';
        empty.textContent = 'Sin cartas';
        myHand.appendChild(empty);
    } else {
        myCards.forEach((card, idx) => {
            const el = crearCardEl(card);
            const jugable = miTurno && !matchOver && puedeJugar(card, topCard, colorActual);
            el.classList.add(jugable ? 'jugable' : 'no-jugable');
            el.addEventListener('click', () => clickCarta(idx, jugable));
            myHand.appendChild(el);
        });
    }

    $('deckPile').disabled = !miTurno || matchOver;

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  RENDER (guest)
// ============================================================
function renderDesdeSnapshot(snap) {
    const json = JSON.stringify(snap);
    if (json === ultimoEstadoJSON) return;
    ultimoEstadoJSON = json;

    $('rivalName').textContent = 'Rival (Host)';
    $('oppCount').textContent = snap.oppCount;
    $('oppCards').classList.toggle('alert', snap.oppCount === 1);

    const colorEl = $('colorIndicator');
    if (colorEl) colorEl.dataset.color = snap.currentColor || 'wild';

    $('deckCount').textContent = snap.drawPileCount;

    const discardEl = $('discardPile');
    discardEl.innerHTML = '';
    if (snap.topCard) discardEl.appendChild(crearCardEl(snap.topCard, { corner: true }));

    const esMiTurnoAhora = snap.currentTurn === 'guest';
    const statusBar = $('statusBar');
    const statusTxt = $('statusText');
    const statusIcon = $('statusIcon');
    if (esMiTurnoAhora && !snap.winner) {
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
            const jugable = esMiTurnoAhora && !snap.winner && puedeJugar(card, snap.topCard, snap.currentColor);
            el.classList.add(jugable ? 'jugable' : 'no-jugable');
            el.addEventListener('click', () => clickCartaGuest(idx, jugable));
            myHand.appendChild(el);
        });
    }

    $('deckPile').disabled = !esMiTurnoAhora || !!snap.winner;

    if (snap.winner) mostrarFin(snap.winner === 'guest');

    if (window.lucide) lucide.createIcons();
}

// ============================================================
//  INTERACCIÓN
// ============================================================
function clickCarta(idx, jugable) {
    if (!jugable || matchOver || !partida) return;
    const card = partida.jugadores[0].mano[idx];
    if (!card) return;
    if (esWild(card)) {
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
    if (card.color === 'wild') {
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

function jugarLocal(idx, colorElegido) {
    if (!partida) return;
    const res = partida.jugar(partida.jugadores[0], idx, colorElegido);
    if (!res.ok) { toast(res.motivo || 'Jugada inválida', 'error'); return; }
    render();
    if (rol === 'host') enviarEstadoAGuest();
    if (partida.ganador) { mostrarFin(partida.ganador === partida.jugadores[0]); return; }
    if (rol === 'cpu') programarTurnoCPU();
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
    if (!partida || !esMiTurno()) return;
    partida.robarTurno(partida.jugadores[0]);
    render();
    if (rol === 'host') enviarEstadoAGuest();
    if (rol === 'cpu') programarTurnoCPU();
}

// ============================================================
//  CPU
// ============================================================
function programarTurnoCPU() {
    if (esperandoCPU) return;
    esperandoCPU = true;
    setTimeout(() => {
        esperandoCPU = false;
        if (rol !== 'cpu' || matchOver || !partida) return;
        if (!esTurnoCPU()) return;
        jugarTurnoCPU();
    }, 900);
}

function jugarTurnoCPU() {
    if (!partida || matchOver) return;
    const cpu = partida.jugadores[1];
    const topCard = partida.topCard;
    const colorActual = partida.colorActual;

    // Buscar mejor: acción > número > wild
    let accion = null, numero = null, wild = null;
    for (const c of cpu.mano) {
        if (!puedeJugar(c, topCard, colorActual)) continue;
        if (c.color === 'wild') { wild = c; continue; }
        if (typeof c.value === 'string' && c.value !== 'wild' && c.value !== 'wild4') {
            if (!accion) accion = c;
        } else {
            if (!numero) numero = c;
        }
    }

    const cartaAJugar = accion || numero || wild;

    if (cartaAJugar) {
        const idx = cpu.mano.indexOf(cartaAJugar);
        let colorElegido = null;
        if (cartaAJugar.color === 'wild') {
            const counts = { red: 0, blue: 0, green: 0, yellow: 0 };
            cpu.mano.forEach(c => { if (counts[c.color] !== undefined) counts[c.color]++; });
            colorElegido = Object.keys(counts).reduce((a, b) => counts[a] >= counts[b] ? a : b);
        }
        const res = partida.jugar(cpu, idx, colorElegido);
        if (!res.ok) partida.robarTurno(cpu);
    } else {
        partida.robarTurno(cpu);
    }

    render();
    if (partida.ganador) { mostrarFin(partida.ganador === partida.jugadores[0]); return; }
    if (esTurnoCPU()) programarTurnoCPU();
}

// ============================================================
//  FIN DE PARTIDA
// ============================================================
function mostrarFin(gane) {
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
    if (!matchOver && partida && !partida.ganador) {
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
    partida = null;
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
