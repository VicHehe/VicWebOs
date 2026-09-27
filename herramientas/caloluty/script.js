// ============================================================
//  Caloluty — Motor del juego
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const APP_ID = 'caloluty';
const ARCHIVO_BASE = 'app/caloluty/';

// ---------- ESTADO ----------
let estado = {
    version: 1,
    armasCompradas: ['pistola'],
    armaActual: 'pistola',
    partidasJugadas: 0,
    aciertosTotales: 0,
    monedasGanadasTotales: 0,
    monedasHoy: 0,
    diaUltimo: '',
    ultimaVez: new Date().toISOString()
};

let usuarioActual = null;
let inicializado = false;

// Game state
let fase = 'idle';           // idle | countdown | playing | finished
let tiempoCountdown = 3.0;
let tiempoRestanteMs = 0;
let totalAciertos = 0;
let totalFallos = 0;
let monedasPartida = 0;
let spawnTimerMs = 0;
let spawnIndex = 0;
let planSpawns = [];
let armaActual = null;
let cadenciaTimerMs = 0;
let crosshair = { x: 0, y: 0 };
let tocaDispositivo = false;

let rafId = null;
let ultimoFrameMs = 0;
let toastTimer = null;

const API = () => window.parent.__vicwebos || null;
const BD  = () => window.parent.ConfigBD || null;

// ============================================================
function diaChileHoy() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

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

window.addEventListener('message', (e) => {
    if (e.data && e.data.type === MENSAJE_TEMA) aplicarTemaDelPadre();
});

// ============================================================
function toast(txt, tipo = 'info') {
    const el = document.getElementById('clToast');
    if (!el) return;
    el.textContent = txt;
    el.className = 'cl-toast show ' + tipo;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ============================================================
//  AUDIO (Web Audio API, sin assets)
// ============================================================
let audioCtx = null;
function initAudio() {
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { audioCtx = null; }
}

function reproducirTono(freq, durMs, tipo = 'sine', vol = 0.15) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = tipo;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durMs / 1000);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + durMs / 1000);
    } catch (e) {}
}

function sonidoDisparo() {
    reproducirTono(180, 90, 'square', 0.08);
}
function sonidoAcierto() {
    reproducirTono(880, 100, 'sine', 0.15);
    setTimeout(() => reproducirTono(1320, 90, 'sine', 0.12), 60);
}
function sonidoFallo() {
    reproducirTono(140, 180, 'sawtooth', 0.12);
}
function sonidoAzul() {
    reproducirTono(220, 200, 'square', 0.15);
    setTimeout(() => reproducirTono(160, 220, 'square', 0.12), 100);
}

// ============================================================
//  UI: header / armas / pantallas
// ============================================================
function renderHeader() {
    const badge = document.getElementById('clUserBadge');
    if (badge) badge.textContent = `@${usuarioActual.codigo} · ${usuarioActual.nombre}`;

    const elMon = document.getElementById('clMonedas');
    if (elMon) {
        const cfg = window.configCuentaActual;
        elMon.textContent = cfg ? (cfg.monedas ?? 0) : 0;
    }
}

function renderArmas() {
    const cont = document.getElementById('clArmasGrid');
    if (!cont) return;
    cont.innerHTML = '';

    const cfg = window.configCuentaActual;
    const monedas = cfg ? (cfg.monedas ?? 0) : 0;

    ARMAS.forEach(a => {
        const comprada = estado.armasCompradas.includes(a.id);
        const seleccionada = estado.armaActual === a.id;
        const puedeComprar = !comprada && monedas >= a.precio;

        const el = document.createElement('button');
        el.className = 'cl-arma-card'
            + (comprada ? ' comprada' : '')
            + (seleccionada ? ' seleccionada' : '')
            + (!comprada && !puedeComprar ? ' bloqueada' : '');
        el.dataset.arma = a.id;

        el.innerHTML = `
            <div class="cl-arma-icono cl-arma-${a.claseColor}">
                <i data-lucide="${a.icono}"></i>
            </div>
            <div class="cl-arma-nombre">${a.nombre}</div>
            <div class="cl-arma-desc">${a.descripcion}</div>
            <div class="cl-arma-pie">
                ${comprada
                    ? `<span class="cl-arma-tag cl-arma-tag-ok">${seleccionada ? 'Equipada' : 'Comprada'}</span>`
                    : `<span class="cl-arma-tag cl-arma-tag-precio"><i data-lucide="coins"></i>${a.precio}</span>`}
                <span class="cl-arma-mon"><i data-lucide="coins"></i>+${a.monedasPorAcierto}</span>
            </div>
        `;

        el.addEventListener('click', () => {
            if (comprada) {
                estado.armaActual = a.id;
                guardarEstado();
                renderArmas();
                actualizarBotonEmpezar();
                actualizarArmaHud();
            } else if (puedeComprar) {
                comprarArma(a);
            } else {
                toast(`Te faltan ${a.precio - monedas} monedas`, 'error');
            }
        });

        cont.appendChild(el);
    });

    if (window.lucide) lucide.createIcons();
}

async function comprarArma(arma) {
    const api = API();
    if (!api) { toast('Sin conexión', 'error'); return; }

    try {
        await api.gastoBoleta('crosshair', APP_ID, `Arma: ${arma.nombre}`, arma.precio);
        estado.armasCompradas.push(arma.id);
        estado.armaActual = arma.id;
        await guardarEstado();
        await recargarMonedas();
        renderArmas();
        actualizarBotonEmpezar();
        actualizarArmaHud();
        toast(`¡${arma.nombre} desbloqueada!`, 'success');
    } catch (e) {
        toast(e.message || 'No se pudo comprar', 'error');
    }
}

async function recargarMonedas() {
    try {
        if (typeof window.parent.obtenerConfigCuenta === 'function' && window.cuentaActual) {
            window.configCuentaActual = await window.parent.obtenerConfigCuenta(window.cuentaActual.codigo);
        }
    } catch (e) {}
    renderHeader();
}

function actualizarBotonEmpezar() {
    const btn = document.getElementById('clBtnEmpezar');
    if (!btn) return;
    if (estado.armaActual) {
        btn.disabled = false;
        const a = obtenerArma(estado.armaActual);
        btn.querySelector('span').textContent = `Jugar con ${a.nombre}`;
    }
}

function actualizarArmaHud() {
    const el = document.getElementById('clHudArma');
    if (!el) return;
    const a = obtenerArma(estado.armaActual);
    el.textContent = a ? a.nombre : '—';
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
            if (!Array.isArray(estado.armasCompradas) || !estado.armasCompradas.includes('pistola')) {
                estado.armasCompradas = ['pistola'];
            }
            if (!estado.armasCompradas.includes(estado.armaActual)) {
                estado.armaActual = 'pistola';
            }
        }
    } catch (e) {
        console.warn('[Caloluty] Error cargando:', e);
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
        console.warn('[Caloluty] Error guardando:', e);
    }
}

// ============================================================
//  Plan de spawns
// ============================================================
function generarPlanSpawns() {
    // 40 rojos + 15 azules = 55 targets en 60s
    const total = TOTAL_ROJOS + TOTAL_AZULES;
    const plan = [];
    for (let i = 0; i < TOTAL_ROJOS; i++) plan.push('rojo');
    for (let i = 0; i < TOTAL_AZULES; i++) plan.push('azul');
    // Intercalar: barajar manteniendo que el primer 25% tenga más rojos
    for (let i = plan.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    // Forzar 2 rojos al principio para que arranque enganchado
    plan[0] = 'rojo';
    plan[1] = 'rojo';
    return plan;
}

// ============================================================
//  Input
// ============================================================
function bindInputs() {
    tocaDispositivo = matchMedia('(pointer: coarse)').matches;

    const wrap = document.querySelector('.cl-canvas-wrap');
    const crosshairEl = document.getElementById('clCrosshair');
    const fireBtn = document.getElementById('clFireBtn');

    if (!tocaDispositivo) {
        if (fireBtn) fireBtn.style.display = 'none';
    }

    // Pointer move (mouse + touch)
    wrap.addEventListener('mousemove', (e) => {
        if (tocaDispositivo) return;
        actualizarCrosshair(e.clientX, e.clientY);
    });

    wrap.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            const t = e.touches[0];
            actualizarCrosshair(t.clientX, t.clientY);
        }
    }, { passive: false });

    wrap.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length > 0) {
            const t = e.touches[0];
            actualizarCrosshair(t.clientX, t.clientY);
        }
    }, { passive: false });

    // Click directo (desktop)
    wrap.addEventListener('click', (e) => {
        if (tocaDispositivo) return;
        if (fase !== 'playing') return;
        // Ignorar clics en el fire button
        if (e.target.closest('.cl-fire-btn')) return;
        actualizarCrosshair(e.clientX, e.clientY);
        disparar();
    });

    // Fire button (móvil)
    if (fireBtn) {
        fireBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            disparar();
        });
    }
}

function actualizarCrosshair(clientX, clientY) {
    const wrap = document.querySelector('.cl-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    crosshair.x = clientX - rect.left;
    crosshair.y = clientY - rect.top;
    const el = document.getElementById('clCrosshair');
    if (el) {
        el.style.left = crosshair.x + 'px';
        el.style.top = crosshair.y + 'px';
    }
}

// ============================================================
//  Disparo
// ============================================================
function disparar() {
    if (fase !== 'playing') return;
    if (!armaActual) return;
    if (cadenciaTimerMs > 0) return;

    cadenciaTimerMs = armaActual.cadenciaMs;
    sonidoDisparo();

    // Flash de pantalla
    const flash = document.getElementById('clFlash');
    if (flash) {
        flash.classList.remove('activo');
        void flash.offsetWidth;
        flash.classList.add('activo');
    }

    // Detectar impacto
    const targets = window.CL_Escena.obtenerTargets();
    let impacto = null;

    for (const t of targets) {
        const p = window.CL_Escena.proyectarTarget(t);
        const r = window.CL_Escena.radioEnPantalla(t);
        const dx = p.x - crosshair.x;
        const dy = p.y - crosshair.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const umbral = armaActual.tipo === 'area' ? r + armaActual.radioAOE : r;

        if (d <= umbral) {
            impacto = t;
            break;
        }
    }

    if (impacto) {
        procesarImpacto(impacto, crosshair.x, crosshair.y);
    } else {
        // Fondo: pequeño puff
        mostrarPuff(crosshair.x, crosshair.y, false);
    }
}

function procesarImpacto(target, x, y) {
    if (target.tipo === 'rojo') {
        totalAciertos++;
        monedasPartida += armaActual.monedasPorAcierto;
        sonidoAcierto();
        mostrarPopup(x, y, '+' + armaActual.monedasPorAcierto, 'ok');
        mostrarPuff(x, y, true);
        if (navigator.vibrate) navigator.vibrate(20);
    } else {
        totalFallos++;
        tiempoRestanteMs = Math.max(0, tiempoRestanteMs - PENALIZACION_AZUL_MS);
        sonidoAzul();
        mostrarPopup(x, y, '-2s', 'mal');
        mostrarPuff(x, y, false);
        if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    }

    window.CL_Escena.matarTarget(target, target.tipo === 'rojo');
    actualizarHUD();
}

function mostrarPuff(x, y, acierto) {
    const zona = document.getElementById('clPopupZona');
    if (!zona) return;
    const el = document.createElement('div');
    el.className = 'cl-puff' + (acierto ? ' cl-puff-ok' : '');
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    zona.appendChild(el);
    setTimeout(() => el.remove(), 600);
}

function mostrarPopup(x, y, texto, tipo) {
    const zona = document.getElementById('clPopupZona');
    if (!zona) return;
    const el = document.createElement('div');
    el.className = 'cl-popup cl-popup-' + tipo;
    el.textContent = texto;
    el.style.left = x + 'px';
    el.style.top = (y - 12) + 'px';
    zona.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

// ============================================================
//  Loop
// ============================================================
function loop(now) {
    if (fase === 'idle' || fase === 'finished') return;
    if (!ultimoFrameMs) ultimoFrameMs = now;
    const dt = Math.min((now - ultimoFrameMs) / 1000, 0.1);
    ultimoFrameMs = now;

    if (fase === 'countdown') tickCountdown(dt);
    else if (fase === 'playing') tickJuego(dt);

    window.CL_Escena.update(dt);
    rafId = requestAnimationFrame(loop);
}

function tickCountdown(dt) {
    const prev = Math.ceil(tiempoCountdown);
    tiempoCountdown -= dt;
    if (tiempoCountdown <= 0) {
        document.getElementById('clCountdown').hidden = true;
        fase = 'playing';
        return;
    }
    const actual = Math.ceil(tiempoCountdown);
    if (actual !== prev) {
        const n = document.getElementById('clCountdownNum');
        if (n) {
            n.textContent = actual === 0 ? '¡YA!' : actual;
            n.classList.remove('pop');
            void n.offsetWidth;
            n.classList.add('pop');
        }
    }
}

function tickJuego(dt) {
    // Timer
    tiempoRestanteMs -= dt * 1000;
    if (tiempoRestanteMs <= 0) {
        tiempoRestanteMs = 0;
        finDePartida();
        return;
    }

    // Cadencia
    if (cadenciaTimerMs > 0) cadenciaTimerMs -= dt * 1000;

    // Spawns
    spawnTimerMs -= dt * 1000;
    if (spawnTimerMs <= 0 && spawnIndex < planSpawns.length) {
        spawnTarget(planSpawns[spawnIndex++]);
        // 55 targets en 60s → 1090ms promedio
        spawnTimerMs = 1000 + Math.random() * 200;
    }

    actualizarHUD();
}

function spawnTarget(tipo) {
    window.CL_Escena.crearTarget(tipo);
}

function actualizarHUD() {
    const elT = document.getElementById('clHudTiempo');
    if (elT) elT.textContent = (tiempoRestanteMs / 1000).toFixed(1) + 's';

    const elA = document.getElementById('clHudAciertos');
    if (elA) elA.textContent = totalAciertos + ' / ' + TOTAL_ROJOS;

    const elG = document.getElementById('clHudGanancia');
    if (elG) elG.textContent = '+' + monedasPartida;
}

// ============================================================
//  Inicio / fin de partida
// ============================================================
function iniciarPartida() {
    if (!estado.armaActual) return;
    armaActual = obtenerArma(estado.armaActual);
    if (!armaActual) return;

    // Reset
    tiempoCountdown = 3.0;
    tiempoRestanteMs = DURACION_MS;
    totalAciertos = 0;
    totalFallos = 0;
    monedasPartida = 0;
    spawnTimerMs = 300;
    spawnIndex = 0;
    cadenciaTimerMs = 0;
    planSpawns = generarPlanSpawns();

    document.getElementById('clScreenStart').hidden = true;
    document.getElementById('clScreenFin').hidden = true;

    // Init escena
    const contenedor = document.getElementById('clCanvas');
    window.CL_Escena.init(contenedor);

    // Crosshair al centro
    const wrap = document.querySelector('.cl-canvas-wrap');
    const rect = wrap.getBoundingClientRect();
    crosshair.x = rect.width / 2;
    crosshair.y = rect.height / 2;
    const elCh = document.getElementById('clCrosshair');
    if (elCh) {
        elCh.style.left = crosshair.x + 'px';
        elCh.style.top = crosshair.y + 'px';
    }

    // Countdown UI
    const c = document.getElementById('clCountdown');
    const n = document.getElementById('clCountdownNum');
    if (c && n) {
        c.hidden = false;
        n.textContent = '3';
        n.classList.remove('pop');
        void n.offsetWidth;
        n.classList.add('pop');
    }

    fase = 'countdown';
    actualizarHUD();
    actualizarArmaHud();

    ultimoFrameMs = 0;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);

    window.addEventListener('resize', onResize);
}

function onResize() {
    if (window.CL_Escena) window.CL_Escena.onResize();
}

async function finDePartida() {
    if (fase === 'finished') return;
    fase = 'finished';
    if (rafId) cancelAnimationFrame(rafId);

    // Aplicar cap diario
    const hoy = diaChileHoy();
    if (estado.diaUltimo !== hoy) {
        estado.diaUltimo = hoy;
        estado.monedasHoy = 0;
    }
    const disponible = Math.max(0, CAP_DIARIO - estado.monedasHoy);
    const monedasFinal = Math.min(monedasPartida, disponible);
    estado.monedasHoy += monedasFinal;

    // Stats
    estado.partidasJugadas++;
    estado.aciertosTotales += totalAciertos;
    estado.monedasGanadasTotales += monedasFinal;
    await guardarEstado();

    // Otorgar
    if (monedasFinal > 0) {
        await otorgarMonedas(monedasFinal);
        await recargarMonedas();
    }

    mostrarFin(monedasFinal, monedasPartida > monedasFinal);
}

async function otorgarMonedas(cantidad) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear('crosshair', APP_ID, 'Puntería en Caloluty', cantidad);
    } catch (e) {
        console.warn('[Caloluty] Error otorgando:', e);
    }
}

function mostrarFin(monedasOtorgadas, capAplicado) {
    const icono = document.getElementById('clFinIcono');
    const titulo = document.getElementById('clFinTitulo');
    const sub = document.getElementById('clFinSubtitulo');
    const elA = document.getElementById('clFinAciertos');
    const elF = document.getElementById('clFinFallos');
    const elP = document.getElementById('clFinPrecision');
    const elArm = document.getElementById('clFinArma');
    const elMon = document.getElementById('clFinMonedas');

    const totalDisparos = totalAciertos + totalFallos;
    const precision = totalDisparos > 0 ? Math.round(totalAciertos / totalDisparos * 100) : 0;

    elA.textContent = `${totalAciertos} / ${TOTAL_ROJOS}`;
    elF.textContent = totalFallos;
    elP.textContent = precision + '%';
    elArm.textContent = armaActual?.nombre || '—';
    elMon.textContent = '+' + monedasOtorgadas;

    if (capAplicado) {
        sub.textContent = `Llegaste al cap diario. La ganancia real fue limitada.`;
    }

    if (totalAciertos >= 35) {
        icono.className = 'cl-screen-icono excelente';
        icono.innerHTML = '<i data-lucide="trophy"></i>';
        titulo.textContent = '¡Francotirador!';
        if (!capAplicado) sub.textContent = 'Puntería legendaria.';
    } else if (totalAciertos >= 20) {
        icono.className = 'cl-screen-icono bueno';
        icono.innerHTML = '<i data-lucide="target"></i>';
        titulo.textContent = '¡Buen tiro!';
        if (!capAplicado) sub.textContent = 'Vas por buen camino.';
    } else if (totalAciertos >= 10) {
        icono.className = 'cl-screen-icono normal';
        icono.innerHTML = '<i data-lucide="crosshair"></i>';
        titulo.textContent = 'Nada mal';
        if (!capAplicado) sub.textContent = 'Podés mejorar.';
    } else {
        icono.className = 'cl-screen-icono bajo';
        icono.innerHTML = '<i data-lucide="x"></i>';
        titulo.textContent = 'Necesitás práctica';
        if (!capAplicado) sub.textContent = 'Probá de nuevo.';
    }

    document.getElementById('clScreenFin').hidden = false;
    if (window.lucide) window.lucide.createIcons();
}

// ============================================================
//  Bind botones
// ============================================================
function bindBotones() {
    document.getElementById('clBtnEmpezar')?.addEventListener('click', iniciarPartida);
    document.getElementById('clBtnReintentar')?.addEventListener('click', iniciarPartida);

    document.getElementById('clBtnArsenal')?.addEventListener('click', () => {
        document.getElementById('clScreenFin').hidden = true;
        document.getElementById('clScreenStart').hidden = false;
        window.CL_Escena.limpiar();
        fase = 'idle';
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        renderArmas();
        actualizarBotonEmpezar();
    });
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();
    initAudio();

    const api = API();
    if (!api) { alert('Caloluty necesita estar dentro de VicWebOs.'); return; }
    usuarioActual = api.obtenerCuenta?.();
    if (!usuarioActual) { alert('Necesitás iniciar sesión.'); return; }

    await cargarEstado();
    renderHeader();
    renderArmas();
    actualizarBotonEmpezar();
    actualizarArmaHud();
    bindInputs();
    bindBotones();

    if (window.lucide) window.lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', inicializar);
