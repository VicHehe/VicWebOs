// ============================================================
//  Blackjack — adaptado a VicWebOs
//  ------------------------------------------------------------
//  - Apuesta mínima 20, máxima 64.
//  - Blackjack natural paga 3:2 (1.5x).
//  - Victoria normal paga 1:1.
//  - Empate devuelve la apuesta.
//  - Doblar: solo con las 2 primeras cartas.
//
//  FIX v3: ID de ronda para matar timers zombie.
//  Cada nueva ronda incrementa _rondaID. Los setTimeout viejos
//  chequean ese ID al dispararse y mueren si ya no es el actual.
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'blackjack';

const APUESTA_MIN = 20;
const APUESTA_MAX = 64;
const PAGO_BLACKJACK = 1.5;
const PAGO_NORMAL = 1.0;

let usuarioActual = null;

// ---- Estado del juego ----
let baraja = [];
let manoJugador = [];
let manoCrupier = [];
let apuestaActual = 0;
let juegoTerminado = false;
let puedeActuar = false;
let esperando = false;
let procesando = false;

// ---- ID de ronda: la clave del fix ----
let _rondaID = 0;

// ---- DOM ----
const DOM = {};

// ---- API ----
const API = () => window.parent.__vicwebos || null;

function leerSaldoOS() {
    try {
        const api = API();
        return api?.obtenerMonedas?.() ?? 0;
    } catch (e) { return 0; }
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
            '--shadow-xs','--shadow-sm','--shadow-md','--shadow-lg','--shadow-xl',
            '--shadow-glow',
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
    if (e.data?.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
//  TOAST
// ============================================================
let _toastTimer = null;
function toast(texto, tipo = 'info') {
    const el = DOM.toast;
    if (!el) return;
    el.textContent = texto;
    el.className = 'bj-toast show ' + tipo;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ============================================================
//  VISIBILIDAD DE PANTALLAS
// ============================================================
function mostrarConfig() {
    if (DOM.configScreen) {
        DOM.configScreen.hidden = false;
        DOM.configScreen.style.display = 'flex';
    }
    if (DOM.gameScreen) {
        DOM.gameScreen.hidden = true;
        DOM.gameScreen.style.display = 'none';
    }
}

function mostrarJuego() {
    if (DOM.configScreen) {
        DOM.configScreen.hidden = true;
        DOM.configScreen.style.display = 'none';
    }
    if (DOM.gameScreen) {
        DOM.gameScreen.hidden = false;
        DOM.gameScreen.style.display = 'flex';
    }
}

function ocultarModal() {
    if (!DOM.modalResultado) return;
    DOM.modalResultado.hidden = true;
    DOM.modalResultado.style.display = 'none';
}

// ============================================================
//  BARAJA
// ============================================================
function crearBaraja() {
    const palos = ['♠', '♥', '♦', '♣'];
    const valores = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const baraja = [];
    for (const palo of palos) {
        for (const valor of valores) {
            baraja.push({ valor, palo });
        }
    }
    return baraja;
}

function barajar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function valorCarta(carta) {
    if (carta.valor === 'A') return 11;
    if (['J', 'Q', 'K'].includes(carta.valor)) return 10;
    return parseInt(carta.valor);
}

function calcularMano(mano) {
    let total = 0;
    let aces = 0;
    for (const carta of mano) {
        const v = valorCarta(carta);
        if (v === 11) aces++;
        total += v;
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

function esBlackjack(mano) {
    return mano.length === 2 && calcularMano(mano) === 21;
}

function esRoja(carta) {
    return carta.palo === '♥' || carta.palo === '♦';
}

// ============================================================
//  RENDER
// ============================================================
function renderizarCartas(mano, contenedor, ocultarPrimera = false) {
    contenedor.innerHTML = '';
    mano.forEach((carta, index) => {
        const div = document.createElement('div');
        div.className = 'bj-carta';
        if (ocultarPrimera && index === 0) {
            div.classList.add('oculta');
            div.textContent = '?';
        } else {
            if (esRoja(carta)) div.classList.add('roja');
            div.textContent = `${carta.valor}${carta.palo}`;
        }
        contenedor.appendChild(div);
    });
}

function renderizarJuego() {
    const ocultarCrupier = !juegoTerminado && manoCrupier.length > 0;
    renderizarCartas(manoCrupier, DOM.dealerCards, ocultarCrupier);

    if (juegoTerminado || manoCrupier.length === 0) {
        DOM.dealerTotal.textContent = manoCrupier.length > 0 ? calcularMano(manoCrupier) : '?';
    } else {
        const visible = manoCrupier.slice(1);
        DOM.dealerTotal.textContent = visible.length === 0
            ? '?'
            : calcularMano(visible) + ' + ?';
    }

    renderizarCartas(manoJugador, DOM.playerCards, false);
    DOM.playerTotal.textContent = calcularMano(manoJugador);

    DOM.btnHit.disabled = !puedeActuar || juegoTerminado;
    DOM.btnStand.disabled = !puedeActuar || juegoTerminado;
    DOM.btnDouble.disabled = !puedeActuar || juegoTerminado || manoJugador.length !== 2;
}

function actualizarSaldoUI() {
    const saldo = leerSaldoOS();
    if (DOM.saldo) DOM.saldo.textContent = saldo;
    if (DOM.saldoDisponible) DOM.saldoDisponible.textContent = saldo;
}

// ============================================================
//  TIMERS CON ID DE RONDA
//  ------------------------------------------------------------
//  Helper que programa un callback pero lo mata silenciosamente
//  si la ronda cambió. Es la clave para que los timers de la
//  ronda anterior no pisen la nueva.
// ============================================================
function setRondaTimeout(fn, ms, rondaID) {
    setTimeout(() => {
        if (rondaID !== _rondaID) return;   // ronda vieja, ignorar
        fn();
    }, ms);
}

// ============================================================
//  LÓGICA DEL JUEGO
// ============================================================
function robarCarta() {
    if (baraja.length === 0) {
        baraja = [];
        for (let i = 0; i < 6; i++) baraja = baraja.concat(crearBaraja());
        barajar(baraja);
    }
    return baraja.pop();
}

async function iniciarPartida() {
    if (procesando) return;
    procesando = true;

    // Nueva ronda: ID nuevo invalida cualquier timer de la anterior
    _rondaID++;
    const miID = _rondaID;

    const apuesta = parseInt(DOM.apuestaInput.value, 10);
    if (isNaN(apuesta) || apuesta < APUESTA_MIN) {
        mostrarMsg(`La apuesta mínima es ${APUESTA_MIN} monedas.`, 'error');
        procesando = false;
        return;
    }
    if (apuesta > APUESTA_MAX) {
        mostrarMsg(`La apuesta máxima es ${APUESTA_MAX} monedas.`, 'error');
        procesando = false;
        return;
    }
    const saldo = leerSaldoOS();
    if (apuesta > saldo) {
        mostrarMsg('No tenés saldo suficiente.', 'error');
        procesando = false;
        return;
    }

    const api = API();
    if (!api || typeof api.gastoBoleta !== 'function') {
        mostrarMsg('Sin conexión con el SO.', 'error');
        procesando = false;
        return;
    }

    DOM.btnIniciar.disabled = true;
    try {
        await api.gastoBoleta('spade', APP_ID, `Apuesta Blackjack (${apuesta})`, apuesta);
    } catch (e) {
        DOM.btnIniciar.disabled = false;
        mostrarMsg(e.message || 'No se pudo apostar.', 'error');
        procesando = false;
        return;
    }
    DOM.btnIniciar.disabled = false;

    // Si mientras esperábamos el gasto, el usuario lanzó otra ronda,
    // esta ya no es válida: abortamos silenciosamente.
    if (miID !== _rondaID) {
        procesando = false;
        return;
    }

    apuestaActual = apuesta;
    juegoTerminado = false;
    puedeActuar = true;
    esperando = false;

    baraja = [];
    for (let i = 0; i < 6; i++) baraja = baraja.concat(crearBaraja());
    barajar(baraja);

    manoJugador = [];
    manoCrupier = [];
    manoJugador.push(robarCarta());
    manoCrupier.push(robarCarta());
    manoJugador.push(robarCarta());
    manoCrupier.push(robarCarta());

    mostrarJuego();
    ocultarModal();

    DOM.apuestaMostrada.textContent = apuestaActual;
    setEstado('En juego', 'target');

    actualizarSaldoUI();
    renderizarJuego();

    procesando = false;

    // Chequeo de blackjack natural
    if (esBlackjack(manoJugador) || esBlackjack(manoCrupier)) {
        setRondaTimeout(() => terminarRonda(miID), 500, miID);
    }
}

function accionHit() {
    if (!puedeActuar || juegoTerminado) return;
    const miID = _rondaID;
    manoJugador.push(robarCarta());
    renderizarJuego();
    if (calcularMano(manoJugador) > 21) {
        puedeActuar = false;
        juegoTerminado = true;
        setRondaTimeout(() => terminarRonda(miID), 450, miID);
    }
}

function accionStand() {
    if (!puedeActuar || juegoTerminado) return;
    const miID = _rondaID;
    puedeActuar = false;
    juegoTerminado = true;
    setEstado('Crupier...', 'hourglass');
    setRondaTimeout(() => turnoCrupier(miID), 350, miID);
}

async function accionDouble() {
    if (!puedeActuar || juegoTerminado || manoJugador.length !== 2) return;
    if (procesando) return;
    procesando = true;

    const miID = _rondaID;
    const saldo = leerSaldoOS();
    if (apuestaActual > saldo) {
        toast('No tenés saldo para doblar.', 'error');
        procesando = false;
        return;
    }
    if (apuestaActual * 2 > APUESTA_MAX) {
        toast(`Doblar te dejaría en ${apuestaActual * 2}, arriba del máximo de ${APUESTA_MAX}.`, 'error');
        procesando = false;
        return;
    }

    const api = API();
    if (!api) { procesando = false; return; }

    DOM.btnDouble.disabled = true;
    try {
        await api.gastoBoleta('chevrons-up', APP_ID, `Doblar apuesta Blackjack`, apuestaActual);
    } catch (e) {
        toast(e.message || 'No se pudo doblar.', 'error');
        DOM.btnDouble.disabled = false;
        procesando = false;
        return;
    }

    if (miID !== _rondaID) { procesando = false; return; }

    apuestaActual *= 2;
    DOM.apuestaMostrada.textContent = apuestaActual;
    actualizarSaldoUI();

    manoJugador.push(robarCarta());
    renderizarJuego();

    const total = calcularMano(manoJugador);
    puedeActuar = false;
    juegoTerminado = true;
    procesando = false;

    if (total > 21) {
        setRondaTimeout(() => terminarRonda(miID), 450, miID);
    } else {
        setEstado('Crupier...', 'hourglass');
        setRondaTimeout(() => turnoCrupier(miID), 450, miID);
    }
}

function turnoCrupier(miID) {
    if (miID !== _rondaID) return;   // ronda vieja
    while (calcularMano(manoCrupier) < 17) {
        manoCrupier.push(robarCarta());
    }
    juegoTerminado = true;
    renderizarJuego();
    setRondaTimeout(() => terminarRonda(miID), 500, miID);
}

function setEstado(texto, icono) {
    const el = DOM.infoEstado;
    if (!el) return;
    el.innerHTML = `<i data-lucide="${icono}"></i><span>${texto}</span>`;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  TERMINAR RONDA
// ============================================================
async function terminarRonda(miID) {
    if (miID !== _rondaID) return;   // ronda vieja, no hacer nada
    if (esperando) return;
    esperando = true;
    juegoTerminado = true;
    puedeActuar = false;
    renderizarJuego();

    const totalJugador = calcularMano(manoJugador);
    const totalCrupier = calcularMano(manoCrupier);
    const jugadorBJ = esBlackjack(manoJugador);
    const crupierBJ = esBlackjack(manoCrupier);

    let resultado, mensaje, ganancia, pago;

    if (totalJugador > 21) {
        resultado = 'perdiste';
        mensaje = 'Te pasaste de 21.';
        ganancia = -apuestaActual;
        pago = 0;
    } else if (crupierBJ && !jugadorBJ) {
        resultado = 'perdiste';
        mensaje = 'El crupier tiene Blackjack.';
        ganancia = -apuestaActual;
        pago = 0;
    } else if (jugadorBJ && !crupierBJ) {
        resultado = 'blackjack';
        mensaje = '¡Blackjack natural! Pagás 3:2.';
        pago = Math.floor(apuestaActual * PAGO_BLACKJACK);
        ganancia = pago;
    } else if (totalCrupier > 21) {
        resultado = 'ganaste';
        mensaje = 'El crupier se pasó.';
        pago = Math.floor(apuestaActual * PAGO_NORMAL);
        ganancia = pago;
    } else if (totalJugador > totalCrupier) {
        resultado = 'ganaste';
        mensaje = 'Ganaste la ronda.';
        pago = Math.floor(apuestaActual * PAGO_NORMAL);
        ganancia = pago;
    } else if (totalJugador < totalCrupier) {
        resultado = 'perdiste';
        mensaje = 'El crupier ganó.';
        ganancia = -apuestaActual;
        pago = 0;
    } else {
        resultado = 'empate';
        mensaje = 'Empate. Se devuelve tu apuesta.';
        pago = apuestaActual;
        ganancia = 0;
    }

    setEstado(
        resultado === 'ganaste' ? 'Ganaste' :
        resultado === 'blackjack' ? '¡Blackjack!' :
        resultado === 'perdiste' ? 'Perdiste' : 'Empate',
        resultado === 'ganaste' ? 'trophy' :
        resultado === 'blackjack' ? 'sparkles' :
        resultado === 'perdiste' ? 'x' : 'equal'
    );

    const api = API();
    if (api && typeof api.canjear === 'function' && pago > 0) {
        try {
            const fuenteTxt = resultado === 'empate'
                ? `Devolución apuesta Blackjack`
                : resultado === 'blackjack'
                    ? `Blackjack natural (3:2)`
                    : `Victoria Blackjack`;
            await api.canjear('spade', APP_ID, fuenteTxt, pago);
            actualizarSaldoUI();
        } catch (e) {
            console.warn('[Blackjack] No se pudo pagar:', e);
            toast('No se pudo acreditar la ganancia.', 'error');
        }
    }

    // Si cambió la ronda mientras pagábamos, no mostrar el modal viejo
    if (miID !== _rondaID) {
        esperando = false;
        return;
    }

    setRondaTimeout(() => {
        mostrarModalResultado(resultado, mensaje, ganancia, pago);
        esperando = false;
    }, 900, miID);
}

// ============================================================
//  MODAL RESULTADO
// ============================================================
function mostrarModalResultado(resultado, mensaje, ganancia, pago) {
    let titulo = '';
    let icono = '';

    switch (resultado) {
        case 'ganaste':    titulo = '¡Ganaste!';  icono = 'trophy';   break;
        case 'blackjack':  titulo = '¡Blackjack!'; icono = 'sparkles'; break;
        case 'perdiste':   titulo = 'Perdiste';    icono = 'x';        break;
        case 'empate':     titulo = 'Empate';      icono = 'equal';    break;
        default:           titulo = 'Ronda terminada'; icono = 'flag';
    }

    DOM.resultadoTitulo.textContent = titulo;
    DOM.resultadoMsg.textContent = mensaje;

    const iconoEl = DOM.resultadoIcono;
    iconoEl.className = 'bj-modal-icono ' + resultado;
    iconoEl.innerHTML = `<i data-lucide="${icono}"></i>`;

    const montoEl = DOM.resultadoMonto;
    montoEl.className = 'bj-resultado-monto ' + resultado;
    if (resultado === 'ganaste' || resultado === 'blackjack') {
        montoEl.textContent = `+${pago} monedas`;
    } else if (resultado === 'perdiste') {
        montoEl.textContent = `−${apuestaActual} monedas`;
    } else if (resultado === 'empate') {
        montoEl.textContent = `${apuestaActual} devueltas`;
    } else {
        montoEl.textContent = '';
    }

    DOM.modalResultado.hidden = false;
    DOM.modalResultado.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function volverMenu() {
    // Invalidar cualquier timer pendiente
    _rondaID++;
    esperando = false;
    procesando = false;
    juegoTerminado = true;
    puedeActuar = false;

    mostrarConfig();
    ocultarModal();

    DOM.configMsg.textContent = '';
    DOM.configMsg.className = 'bj-msg';

    DOM.btnHit.disabled = true;
    DOM.btnStand.disabled = true;
    DOM.btnDouble.disabled = true;

    const saldo = leerSaldoOS();
    let val = parseInt(DOM.apuestaInput.value, 10) || APUESTA_MIN;
    if (val > APUESTA_MAX) val = APUESTA_MAX;
    if (val > saldo) val = Math.max(APUESTA_MIN, Math.min(saldo, APUESTA_MAX));
    DOM.apuestaInput.value = val;

    actualizarSaldoUI();
}

async function nuevaRonda() {
    if (procesando) return;
    ocultarModal();
    manoJugador = [];
    manoCrupier = [];
    juegoTerminado = false;
    puedeActuar = false;
    esperando = false;
    await iniciarPartida();
}

function mostrarMsg(texto, tipo) {
    DOM.configMsg.textContent = texto;
    DOM.configMsg.className = 'bj-msg ' + (tipo || '');
}

// ============================================================
//  CONTROLES DE APUESTA
// ============================================================
function normalizarApuesta(valor) {
    let v = parseInt(valor, 10);
    if (isNaN(v)) v = APUESTA_MIN;
    const saldo = leerSaldoOS();
    const techo = Math.min(APUESTA_MAX, saldo);
    if (v < APUESTA_MIN) v = APUESTA_MIN;
    if (v > techo) v = techo;
    if (v < APUESTA_MIN) v = APUESTA_MIN;
    return v;
}

function setApuesta(valor) {
    DOM.apuestaInput.value = normalizarApuesta(valor);
}

// ============================================================
//  BIND
// ============================================================
function cachearDOM() {
    DOM.configScreen = document.getElementById('bjConfigScreen');
    DOM.gameScreen = document.getElementById('bjGameScreen');
    DOM.modalResultado = document.getElementById('bjModalResultado');
    DOM.toast = document.getElementById('bjToast');

    DOM.userBadge = document.getElementById('bjUserBadge');
    DOM.saldo = document.getElementById('bjSaldo');
    DOM.saldoDisponible = document.getElementById('bjSaldoDisponible');

    DOM.apuestaInput = document.getElementById('bjApuestaInput');
    DOM.btnMitad = document.getElementById('bjBtnMitad');
    DOM.btnDoble = document.getElementById('bjBtnDoble');
    DOM.btnMax = document.getElementById('bjBtnMax');
    DOM.btnIniciar = document.getElementById('bjBtnIniciar');
    DOM.configMsg = document.getElementById('bjConfigMsg');

    DOM.btnSalir = document.getElementById('bjBtnSalir');
    DOM.apuestaMostrada = document.getElementById('bjApuestaMostrada');
    DOM.infoEstado = document.getElementById('bjInfoEstado');
    DOM.dealerCards = document.getElementById('bjDealerCards');
    DOM.playerCards = document.getElementById('bjPlayerCards');
    DOM.dealerTotal = document.getElementById('bjDealerTotal');
    DOM.playerTotal = document.getElementById('bjPlayerTotal');

    DOM.btnHit = document.getElementById('bjBtnHit');
    DOM.btnStand = document.getElementById('bjBtnStand');
    DOM.btnDouble = document.getElementById('bjBtnDouble');

    DOM.resultadoIcono = document.getElementById('bjResultadoIcono');
    DOM.resultadoTitulo = document.getElementById('bjResultadoTitulo');
    DOM.resultadoMsg = document.getElementById('bjResultadoMsg');
    DOM.resultadoMonto = document.getElementById('bjResultadoMonto');
    DOM.btnMenu = document.getElementById('bjBtnMenu');
    DOM.btnNuevaRonda = document.getElementById('bjBtnNuevaRonda');
}

function bindEventos() {
    DOM.btnIniciar.addEventListener('click', iniciarPartida);

    DOM.btnSalir.addEventListener('click', () => {
        if (juegoTerminado || !puedeActuar) {
            volverMenu();
            return;
        }
        if (confirm('¿Salir? Vas a perder la apuesta de esta ronda.')) {
            volverMenu();
        }
    });

    DOM.btnNuevaRonda.addEventListener('click', nuevaRonda);
    DOM.btnMenu.addEventListener('click', volverMenu);

    DOM.btnHit.addEventListener('click', accionHit);
    DOM.btnStand.addEventListener('click', accionStand);
    DOM.btnDouble.addEventListener('click', accionDouble);

    DOM.btnMitad.addEventListener('click', () => {
        const actual = parseInt(DOM.apuestaInput.value, 10) || APUESTA_MIN;
        setApuesta(Math.max(APUESTA_MIN, Math.floor(actual / 2)));
    });
    DOM.btnDoble.addEventListener('click', () => {
        const actual = parseInt(DOM.apuestaInput.value, 10) || APUESTA_MIN;
        setApuesta(actual * 2);
    });
    DOM.btnMax.addEventListener('click', () => {
        setApuesta(Math.min(APUESTA_MAX, leerSaldoOS()));
    });

    DOM.apuestaInput.addEventListener('change', () => {
        setApuesta(DOM.apuestaInput.value);
    });
    DOM.apuestaInput.addEventListener('blur', () => {
        setApuesta(DOM.apuestaInput.value);
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'h' || e.key === 'H') accionHit();
        if (e.key === 's' || e.key === 'S') accionStand();
        if (e.key === 'd' || e.key === 'D') accionDouble();
    });
}

// ============================================================
//  INIT
// ============================================================
function inicializar() {
    aplicarTemaDelPadre();
    cachearDOM();

    const api = API();
    if (!api) {
        alert('Blackjack necesita estar dentro de VicWebOs.');
        return;
    }

    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) {
        alert('Necesitás iniciar sesión.');
        return;
    }

    DOM.userBadge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    DOM.btnHit.disabled = true;
    DOM.btnStand.disabled = true;
    DOM.btnDouble.disabled = true;

    actualizarSaldoUI();
    setApuesta(APUESTA_MIN);

    mostrarConfig();
    ocultarModal();

    bindEventos();

    setInterval(() => {
        if (DOM.configScreen.style.display !== 'none') {
            actualizarSaldoUI();
        }
    }, 5000);

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
