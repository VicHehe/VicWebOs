// ============================================================
//  Widget: Mascota
//  ------------------------------------------------------------
//  Gato o perro que cuidas a diario.
//  Ingreso pasivo diario si las 3 barras están ≥ 10%.
//  La racha sube de nivel cada 30 días (8 → 10 → 12 → 14...).
//
//  Persistencia POR USUARIO en:
//      app/mascota/{codigo}mascota.json
// ============================================================

'use strict';

const MENSAJE_TEMA = 'vicwebos_tema_cambio';
const ARCHIVO = 'app/mascota/';

const COSTO_BARRA = 2;
const DECAIMIENTO_HORAS = 28;         // 100% → 0% en 28h
const INTERVALO_PAGO_HORAS = 24;
const UMBRAL_MINIMO = 0.10;           // 10%

let usuarioActual = null;
let monedas = 0;
let estado = null;
let guardando = false;
let inicializado = false;

const API = () => {
    try { return (window.parent && window.parent.__vicwebos) || null; }
    catch (e) { return null; }
};
const BD = () => {
    try { return window.parent.ConfigBD || null; }
    catch (e) { return null; }
};

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
    const el = document.getElementById('mgToast');
    if (!el) return;
    el.textContent = texto;
    el.className = 'mg-toast show ' + tipo;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 2400);
}

// ============================================================
//  PERSISTENCIA
// ============================================================
function rutaArchivo() {
    const api = API();
    if (!api) return null;
    const cuenta = api.obtenerCuenta();
    if (!cuenta || !cuenta.codigo) return null;
    return ARCHIVO + cuenta.codigo + 'mascota.json';
}

async function cargar() {
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) return null;
    try {
        const data = await bd.leerArchivo(ruta);
        if (!data || typeof data !== 'object') return null;
        if (!data.tipo) return null;
        return {
            version: 1,
            tipo: data.tipo,
            nombre: data.nombre || (data.tipo === 'gato' ? 'Gato' : 'Perro'),
            racha: Number.isFinite(data.racha) ? data.racha : 0,
            ultimoPago: data.ultimoPago || new Date().toISOString(),
            barras: {
                hambre:       (data.barras && data.barras.hambre)       || new Date().toISOString(),
                entretencion: (data.barras && data.barras.entretencion) || new Date().toISOString(),
                energia:      (data.barras && data.barras.energia)      || new Date().toISOString()
            },
            creada: data.creada || new Date().toISOString()
        };
    } catch (e) {
        return null;
    }
}

async function guardar() {
    if (!estado || guardando) return;
    guardando = true;
    const bd = BD();
    const ruta = rutaArchivo();
    if (!bd || !ruta) { guardando = false; return; }
    try {
        await bd.escribirArchivo(ruta, estado);
    } catch (e) {
        console.warn('[Mascota] No se pudo guardar:', e);
    } finally {
        guardando = false;
    }
}

// ============================================================
//  LÓGICA
// ============================================================
function valorBarra(clave) {
    if (!estado || !estado.barras[clave]) return 0;
    const t = new Date(estado.barras[clave]).getTime();
    if (!isFinite(t)) return 0;
    const horas = (Date.now() - t) / 3600000;
    return Math.max(0, 1 - horas / DECAIMIENTO_HORAS);
}

function recompensaPorRacha(racha) {
    return 8 + Math.floor(racha / 30) * 2;
}

async function procesarPagoPendiente() {
    if (!estado) return;
    const ahora = Date.now();
    const ultimoPago = new Date(estado.ultimoPago).getTime();
    const horas = (ahora - ultimoPago) / 3600000;

    if (horas < INTERVALO_PAGO_HORAS) return;

    // Más de 48h → la racha se pierde sin pago
    if (horas >= 48) {
        const rachaPerdida = estado.racha;
        estado.racha = 0;
        estado.ultimoPago = new Date().toISOString();
        if (rachaPerdida > 0) {
            toast(`Racha perdida (era ${rachaPerdida} días)`, 'error');
        }
        await guardar();
        return;
    }

    // Entre 24 y 48h → evaluar
    const hambreOK = valorBarra('hambre') >= UMBRAL_MINIMO;
    const juegoOK  = valorBarra('entretencion') >= UMBRAL_MINIMO;
    const energiaOK = valorBarra('energia') >= UMBRAL_MINIMO;

    if (hambreOK && juegoOK && energiaOK) {
        const nuevaRacha = estado.racha + 1;
        const recompensa = recompensaPorRacha(nuevaRacha);
        estado.racha = nuevaRacha;
        estado.ultimoPago = new Date().toISOString();
        await guardar();
        await pagarAlUsuario(recompensa, nuevaRacha);
    } else {
        const rachaPerdida = estado.racha;
        estado.racha = 0;
        estado.ultimoPago = new Date().toISOString();
        if (rachaPerdida > 0) {
            toast(`Racha perdida (era ${rachaPerdida} días)`, 'error');
        }
        await guardar();
    }
}

async function pagarAlUsuario(cantidad, racha) {
    const api = API();
    if (!api || typeof api.canjear !== 'function') return;
    try {
        await api.canjear('paw-print', 'mascota', `Racha ${racha} días`, cantidad);
        toast(`+${cantidad} monedas (${racha} días)`, 'success');
    } catch (e) {
        console.warn('[Mascota] Pago falló:', e);
    }
}

// ============================================================
//  ACCIONES
// ============================================================
async function elegirMascota(tipo) {
    const ahora = new Date().toISOString();
    estado = {
        version: 1,
        tipo: tipo,
        nombre: tipo === 'gato' ? 'Gato' : 'Perro',
        racha: 0,
        ultimoPago: ahora,
        barras: {
            hambre: ahora,
            entretencion: ahora,
            energia: ahora
        },
        creada: ahora
    };
    await guardar();
    render();
    toast(`${estado.nombre} adoptado`, 'success');
}

async function comprarBarra(clave) {
    if (!estado) return;
    const api = API();
    if (!api || typeof api.gastoBoleta !== 'function') return;

    const nombres = {
        hambre: 'Comida',
        entretencion: 'Juego',
        energia: 'Descanso'
    };

    try {
        await api.gastoBoleta('paw-print', 'mascota', nombres[clave], COSTO_BARRA);
        estado.barras[clave] = new Date().toISOString();
        await guardar();
        render();
        refrescarMonedas();
    } catch (e) {
        toast(e.message || 'No se pudo', 'error');
    }
}

function activarEdicionNombre() {
    if (!estado) return;
    const wrap = document.getElementById('mgNombreWrap');
    if (!wrap) return;
    const actual = estado.nombre;

    wrap.innerHTML = `<input type="text" class="mg-nombre-input" id="mgNombreInput" maxlength="20" value="${escaparAttr(actual)}">`;
    const input = document.getElementById('mgNombreInput');
    if (!input) return;
    input.focus();
    input.select();

    const guardarNombre = async () => {
        const nuevo = input.value.trim() || actual;
        if (nuevo !== estado.nombre) {
            estado.nombre = nuevo;
            await guardar();
        }
        render();
    };

    input.addEventListener('blur', guardarNombre, { once: true });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        }
        if (e.key === 'Escape') {
            input.value = actual;
            input.blur();
        }
    });
}

// ============================================================
//  RENDER
// ============================================================
function escaparAttr(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function svgGato() {
    return `
    <svg viewBox="0 0 100 100" class="mg-svg" xmlns="http://www.w3.org/2000/svg">
        <polygon points="20,50 28,14 48,38" fill="currentColor"/>
        <polygon points="80,50 72,14 52,38" fill="currentColor"/>
        <polygon points="28,45 32,24 44,38" fill="white" opacity="0.4"/>
        <polygon points="72,45 68,24 56,38" fill="white" opacity="0.4"/>
        <circle cx="50" cy="58" r="30" fill="currentColor"/>
        <circle cx="40" cy="55" r="5" fill="white"/>
        <circle cx="60" cy="55" r="5" fill="white"/>
        <circle cx="40" cy="55" r="2.5" fill="#18181B"/>
        <circle cx="60" cy="55" r="2.5" fill="#18181B"/>
        <polygon points="46,66 54,66 50,71" fill="#18181B"/>
        <path d="M50,71 Q45,76 41,73 M50,71 Q55,76 59,73" stroke="#18181B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <line x1="18" y1="62" x2="34" y2="63" stroke="#18181B" stroke-width="1" stroke-linecap="round"/>
        <line x1="18" y1="69" x2="34" y2="67" stroke="#18181B" stroke-width="1" stroke-linecap="round"/>
        <line x1="82" y1="62" x2="66" y2="63" stroke="#18181B" stroke-width="1" stroke-linecap="round"/>
        <line x1="82" y1="69" x2="66" y2="67" stroke="#18181B" stroke-width="1" stroke-linecap="round"/>
    </svg>`;
}

function svgPerro() {
    return `
    <svg viewBox="0 0 100 100" class="mg-svg" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="22" cy="55" rx="10" ry="20" fill="currentColor" opacity="0.85"/>
        <ellipse cx="78" cy="55" rx="10" ry="20" fill="currentColor" opacity="0.85"/>
        <circle cx="50" cy="58" r="28" fill="currentColor"/>
        <ellipse cx="50" cy="70" rx="18" ry="12" fill="white" opacity="0.85"/>
        <circle cx="40" cy="52" r="3.5" fill="#18181B"/>
        <circle cx="60" cy="52" r="3.5" fill="#18181B"/>
        <ellipse cx="50" cy="67" rx="5" ry="3.5" fill="#18181B"/>
        <path d="M50,70 L50,75" stroke="#18181B" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M44,75 Q50,79 56,75" stroke="#18181B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="50" cy="78" rx="3" ry="3.5" fill="#EF4444" opacity="0.9"/>
    </svg>`;
}

function render() {
    const zona = document.getElementById('mgZona');
    if (!zona) return;

    // Sin mascota → estado vacío
    if (!estado) {
        zona.innerHTML = `
            <div class="mg-vacio">
                <p>Elige tu mascota</p>
                <div class="mg-elecciones">
                    <button class="mg-elegir" data-tipo="gato">
                        <div class="mg-svg-mini">${svgGato().replace('mg-svg', '')}</div>
                        <span>Gato</span>
                    </button>
                    <button class="mg-elegir" data-tipo="perro">
                        <div class="mg-svg-mini">${svgPerro().replace('mg-svg', '')}</div>
                        <span>Perro</span>
                    </button>
                </div>
            </div>
        `;
        zona.querySelectorAll('.mg-elegir').forEach(btn => {
            btn.addEventListener('click', () => elegirMascota(btn.dataset.tipo));
        });
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    // Con mascota
    const hambre = valorBarra('hambre');
    const juego  = valorBarra('entretencion');
    const energia = valorBarra('energia');

    const hambreCrit = hambre < UMBRAL_MINIMO;
    const juegoCrit  = juego < UMBRAL_MINIMO;
    const energiaCrit = energia < UMBRAL_MINIMO;

    const racha = estado.racha;
    const recompensa = recompensaPorRacha(racha + 1);   // el próximo pago
    const svg = estado.tipo === 'gato' ? svgGato() : svgPerro();

    zona.innerHTML = `
        <div class="mg-activa">
            <div class="mg-top">
                <div class="mg-avatar">${svg}</div>
                <div class="mg-info">
                    <div class="mg-nombre-wrap" id="mgNombreWrap" title="Toca para editar">
                        <span class="mg-nombre">${escaparAttr(estado.nombre)}</span>
                        <i data-lucide="pencil" class="mg-edit-icon"></i>
                    </div>
                    <div class="mg-meta">
                        <span class="mg-meta-item mg-meta-racha">
                            <i data-lucide="flame"></i>
                            ${racha} ${racha === 1 ? 'día' : 'días'}
                        </span>
                        <span class="mg-meta-item mg-meta-pago">
                            <i data-lucide="coins"></i>
                            ${recompensa}/día
                        </span>
                    </div>
                </div>
            </div>

            <div class="mg-barras">
                <div class="mg-barra">
                    <i data-lucide="apple" class="mg-barra-icono hambre"></i>
                    <div class="mg-barra-track">
                        <div class="mg-barra-fill hambre ${hambreCrit ? 'critico' : ''}" style="width:${(hambre*100).toFixed(0)}%"></div>
                    </div>
                    <span class="mg-barra-valor ${hambreCrit ? 'critico' : ''}">${(hambre*100).toFixed(0)}%</span>
                </div>
                <div class="mg-barra">
                    <i data-lucide="party-popper" class="mg-barra-icono juego"></i>
                    <div class="mg-barra-track">
                        <div class="mg-barra-fill juego ${juegoCrit ? 'critico' : ''}" style="width:${(juego*100).toFixed(0)}%"></div>
                    </div>
                    <span class="mg-barra-valor ${juegoCrit ? 'critico' : ''}">${(juego*100).toFixed(0)}%</span>
                </div>
                <div class="mg-barra">
                    <i data-lucide="zap" class="mg-barra-icono energia"></i>
                    <div class="mg-barra-track">
                        <div class="mg-barra-fill energia ${energiaCrit ? 'critico' : ''}" style="width:${(energia*100).toFixed(0)}%"></div>
                    </div>
                    <span class="mg-barra-valor ${energiaCrit ? 'critico' : ''}">${(energia*100).toFixed(0)}%</span>
                </div>
            </div>

            <div class="mg-acciones">
                <button class="mg-btn" data-tipo="hambre">
                    <i data-lucide="apple"></i>
                    <span class="mg-btn-texto">Comida</span>
                    <span class="mg-btn-costo"><i data-lucide="coins"></i> 2</span>
                </button>
                <button class="mg-btn" data-tipo="entretencion">
                    <i data-lucide="party-popper"></i>
                    <span class="mg-btn-texto">Juego</span>
                    <span class="mg-btn-costo"><i data-lucide="coins"></i> 2</span>
                </button>
                <button class="mg-btn" data-tipo="energia">
                    <i data-lucide="zap"></i>
                    <span class="mg-btn-texto">Descanso</span>
                    <span class="mg-btn-costo"><i data-lucide="coins"></i> 2</span>
                </button>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Eventos
    document.getElementById('mgNombreWrap')?.addEventListener('click', activarEdicionNombre);

    zona.querySelectorAll('.mg-btn').forEach(btn => {
        const tipo = btn.dataset.tipo;
        // Deshabilitar si está al 100%
        if (valorBarra(tipo) >= 0.99) btn.disabled = true;
        // Deshabilitar si no hay monedas
        if (monedas < COSTO_BARRA) btn.disabled = true;

        btn.addEventListener('click', () => comprarBarra(tipo));
    });
}

// ============================================================
//  MONEDAS
// ============================================================
function refrescarMonedas() {
    const api = API();
    if (!api) return;
    try {
        monedas = api.obtenerMonedas ? api.obtenerMonedas() : 0;
    } catch (e) { monedas = 0; }
    if (estado) render();
}

// ============================================================
//  INIT
// ============================================================
async function inicializar() {
    if (inicializado) return;
    inicializado = true;

    aplicarTemaDelPadre();

    try {
        const api = API();
        usuarioActual = (api && typeof api.obtenerCuenta === 'function')
            ? api.obtenerCuenta()
            : null;
    } catch (e) { usuarioActual = null; }

    estado = await cargar();
    refrescarMonedas();

    if (estado) {
        await procesarPagoPendiente();
    }

    render();

    // Refrescar cada minuto (para que las barras se actualicen visualmente)
    setInterval(() => {
        if (estado) render();
    }, 60000);

    // Guardar cada 2 minutos por si acaso
    setInterval(() => { if (estado) guardar(); }, 120000);

    // Refrescar monedas cuando cambia la chequera
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'vicwebos_chequera_cambio') refrescarMonedas();
    });

    if (window.lucide) window.lucide.createIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar);
} else {
    inicializar();
}
